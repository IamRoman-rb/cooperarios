// Sistemas: salud del servidor, lectores, integraciones, parámetros, backups, registros técnicos y roles.
// También usuarios y roles (Administración gestiona; Sistemas gestiona; Directiva lee).
// Sistemas no tiene acceso funcional a datos personales ni financieros.
import { Router } from 'express';
import { z } from 'zod';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, ahora, backup, enTransaccion } from '../db/index.js';
import { requiereSesion, hashPassword } from '../lib/auth.js';
import { permiso, matriz, ROLES, tieneRol } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, prohibido, paginar, zId } from '../lib/util.js';
import { auditar } from '../lib/auditoria.js';
import { config } from '../config.js';
import { estadoTareas, backupNocturno } from '../services/tareas.js';

const r = Router();
r.use(requiereSesion);

r.get('/salud', permiso('sistema', 'gestionar'), (_req, res) => {
  const db = getDb();
  const tamDb = fs.existsSync(config.dbFile) ? fs.statSync(config.dbFile).size : 0;
  const wal = fs.existsSync(`${config.dbFile}-wal`) ? fs.statSync(`${config.dbFile}-wal`).size : 0;
  const errores = db.prepare(`SELECT COUNT(*) FROM auditoria WHERE accion = 'error' AND creado_en >= ?`).pluck().get(new Date(Date.now() - 86400000).toISOString());
  res.json({
    servidor: { host: os.hostname(), plataforma: `${os.type()} ${os.release()}`, node: process.version, uptime_s: Math.round(process.uptime()), cpu: os.loadavg(), cpus: os.cpus().length,
      memoria_total: os.totalmem(), memoria_libre: os.freemem(), proceso_mb: Math.round(process.memoryUsage().rss / 1048576) },
    base: { archivo: path.basename(config.dbFile), tamano: tamDb, wal, modo: db.pragma('journal_mode', { simple: true }), integridad: db.pragma('quick_check', { simple: true }),
      migraciones: db.prepare('SELECT * FROM _migraciones').all() },
    tareas: estadoTareas,
    sesiones_activas: db.prepare('SELECT COUNT(*) FROM sesiones WHERE expira_en > ?').pluck().get(ahora()),
    errores_24h: errores,
  });
});

r.get('/lectores', permiso('sistema', 'gestionar'), (_req, res) => {
  const hace = new Date(Date.now() - 10 * 60000).toISOString();
  res.json(getDb().prepare(`SELECT l.id, l.nombre, l.ultimo_latido, l.firmware, pa.nombre AS punto, pa.tipo_lector, pa.activo, pa.id AS punto_id,
      (SELECT COUNT(*) FROM accesos WHERE punto_acceso_id = pa.id AND fecha_hora >= ?) AS lecturas_24h
    FROM lectores l JOIN puntos_acceso pa ON pa.id = l.punto_acceso_id ORDER BY pa.nombre`).all(new Date(Date.now() - 86400000).toISOString())
    .map((l) => ({ ...l, en_linea: !!l.ultimo_latido && l.ultimo_latido > hace })));
});

/** Estado de integraciones sin datos de personas. */
r.get('/integraciones', permiso('sistema', 'gestionar'), (_req, res) => {
  const db = getDb();
  res.json({
    mercado_pago: { modo: config.mercadoPago.simulado ? 'simulado' : 'producción', webhook: '/api/pagos/webhook/mercadopago',
      ultimas: db.prepare(`SELECT estado, COUNT(*) AS n, MAX(creado_en) AS ultima FROM pagos_online GROUP BY estado`).all() },
    correo: { configurado: !!process.env.SMTP_HOST, servidor: process.env.SMTP_HOST ?? null },
    notificaciones: db.prepare(`SELECT tipo, COUNT(*) AS n, SUM(leida_en IS NOT NULL) AS leidas FROM notificaciones GROUP BY tipo ORDER BY n DESC`).all(),
    arca: { estado: 'Fase 5 (facturación electrónica)' },
  });
});

r.get('/parametros', permiso('sistema', 'gestionar'), (_req, res) => {
  const db = getDb();
  res.json({ parametros: db.prepare('SELECT * FROM parametros ORDER BY clave').all(), feriados: db.prepare('SELECT * FROM feriados ORDER BY fecha').all() });
});

r.put('/parametros/:clave', permiso('sistema', 'gestionar'), (req, res) => {
  const { valor } = validar(z.object({ valor: z.string().max(2000) }), req.body);
  const db = getDb();
  const antes = db.prepare('SELECT valor FROM parametros WHERE clave = ?').pluck().get(req.params.clave);
  if (antes == null) throw noEncontrado('Parámetro');
  db.prepare('UPDATE parametros SET valor = ? WHERE clave = ?').run(valor, req.params.clave);
  auditar(req, 'parametro', 'parametros', null, { [req.params.clave]: antes }, { [req.params.clave]: valor });
  res.json({ ok: true });
});

r.post('/feriados', permiso('sistema', 'gestionar'), (req, res) => {
  const d = validar(z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), descripcion: z.string().min(3) }), req.body);
  getDb().prepare('INSERT OR REPLACE INTO feriados VALUES (?, ?)').run(d.fecha, d.descripcion);
  res.json({ ok: true });
});
r.delete('/feriados/:fecha', permiso('sistema', 'gestionar'), (req, res) => {
  getDb().prepare('DELETE FROM feriados WHERE fecha = ?').run(req.params.fecha);
  res.json({ ok: true });
});

// ---------- Backups ----------
r.get('/backups', permiso('sistema', 'gestionar'), (_req, res) => {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const archivos = fs.readdirSync(config.backupsDir).filter((f) => f.endsWith('.db')).map((f) => {
    const st = fs.statSync(path.join(config.backupsDir, f));
    return { archivo: f, tamano: st.size, fecha: st.mtime.toISOString() };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  res.json({ archivos, ultima_tarea: estadoTareas.backup ?? null, politica: 'Copia nocturna de SQLite (30 rotativas) + Backup Premium Diario del servidor (30 copias)' });
});

r.post('/backups', permiso('sistema', 'gestionar'), async (req, res) => {
  const destino = await backupNocturno();
  auditar(req, 'backup_manual', 'sistema', null, null, { archivo: path.basename(destino) });
  res.json({ archivo: path.basename(destino) });
});

/** Prueba de restauración: abre la copia en una base temporal y verifica integridad y conteos. */
r.post('/backups/verificar', permiso('sistema', 'gestionar'), async (req, res) => {
  const { archivo } = validar(z.object({ archivo: z.string().regex(/^[\w.-]+\.db$/) }), req.body);
  const origen = path.join(config.backupsDir, archivo);
  if (!fs.existsSync(origen)) throw noEncontrado('Backup');
  const prueba = path.join(os.tmpdir(), `restauracion-${Date.now()}.db`);
  fs.copyFileSync(origen, prueba);
  const Database = (await import('better-sqlite3')).default;
  const copia = new Database(prueba, { readonly: true });
  const resultado = {
    integridad: copia.pragma('integrity_check', { simple: true }),
    tablas: copia.prepare(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite%' AND name != '_migraciones'`).pluck().get(),
    socios: copia.prepare('SELECT COUNT(*) FROM socios').pluck().get(),
    pagos: copia.prepare('SELECT COUNT(*) FROM pagos').pluck().get(),
  };
  copia.close();
  fs.rmSync(prueba, { force: true });
  auditar(req, 'prueba_restauracion', 'sistema', null, null, { archivo, ...resultado });
  res.json({ ok: resultado.integridad === 'ok', ...resultado });
});

// ---------- Registros técnicos y auditoría ----------
r.get('/logs', permiso('auditoria', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const { limite, offset } = paginar(req);
  const f = [];
  const p = [];
  if (req.query.entidad) { f.push('a.entidad = ?'); p.push(req.query.entidad); }
  if (req.query.accion) { f.push('a.accion LIKE ?'); p.push(`%${req.query.accion}%`); }
  if (req.query.usuario) { f.push(`(u.email LIKE ? OR pp.apellido LIKE ?)`); p.push(`%${req.query.usuario}%`, `%${req.query.usuario}%`); }
  // Sistemas ve el registro técnico sin los valores (que pueden contener datos personales o financieros).
  const sinValores = tieneRol(req.usuario, 'sistemas') && !tieneRol(req.usuario, 'admin', 'contabilidad', 'directiva');
  const where = f.length ? `WHERE ${f.join(' AND ')}` : '';
  res.json({
    filas: db.prepare(`SELECT a.id, a.accion, a.entidad, a.entidad_id, a.ip, a.creado_en, ${sinValores ? 'NULL AS antes, NULL AS despues' : 'a.antes, a.despues'},
        u.email, pp.nombre || ' ' || pp.apellido AS usuario
      FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id LEFT JOIN personas pp ON pp.id = u.persona_id ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...p, limite, offset),
    entidades: db.prepare('SELECT DISTINCT entidad FROM auditoria ORDER BY entidad').pluck().all(),
    accesos: db.prepare(`SELECT s.ip, s.dispositivo, s.ultima_actividad, u.email FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id ORDER BY s.ultima_actividad DESC LIMIT 20`).all(),
  });
});

// ---------- Roles, permisos y usuarios ----------
r.get('/roles', permiso('usuarios', 'leer', 'gestionar'), (_req, res) => {
  const db = getDb();
  res.json({
    roles: ROLES.map((x) => ({ ...x, usuarios: db.prepare(`SELECT COUNT(*) FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE r.codigo = ?`).pluck().get(x.codigo) })),
    matriz: matriz(),
  });
});

r.get('/usuarios', permiso('usuarios', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const q = `%${req.query.q ?? ''}%`;
  res.json({
    usuarios: db.prepare(`SELECT u.id, u.email, u.estado, u.mfa_habilitado, u.ultimo_acceso, u.bloqueado_hasta, p.nombre, p.apellido, p.id AS persona_id
      FROM usuarios u LEFT JOIN personas p ON p.id = u.persona_id WHERE u.email LIKE ? OR p.apellido LIKE ? ORDER BY p.apellido LIMIT 200`).all(q, q)
      .map((u) => ({ ...u, roles: db.prepare(`SELECT r.codigo, r.nombre, ur.actividad_id, a.nombre AS actividad FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id LEFT JOIN actividades a ON a.id = ur.actividad_id WHERE ur.usuario_id = ?`).all(u.id) })),
    roles: ROLES,
    actividades: db.prepare('SELECT id, nombre FROM actividades ORDER BY nombre').all(),
  });
});

const usuarioSchema = z.object({
  email: z.string().email(), persona_id: zId.optional(),
  persona: z.object({ nombre: z.string().min(2), apellido: z.string().min(2), dni: z.string().regex(/^\d{7,9}$/) }).optional(),
  password: z.string().min(10).regex(/[A-Za-z]/).regex(/\d/).optional(),
  roles: z.array(z.object({ codigo: z.string(), actividad_id: zId.nullable().optional() })).min(1),
});

function asignarRoles(usuarioId, roles) {
  const db = getDb();
  db.prepare('DELETE FROM usuario_roles WHERE usuario_id = ?').run(usuarioId);
  for (const x of roles) {
    const rolId = db.prepare('SELECT id FROM roles WHERE codigo = ?').pluck().get(x.codigo);
    if (!rolId) throw invalido(`Rol inexistente: ${x.codigo}`);
    if (x.codigo === 'subcomision' && !x.actividad_id) throw invalido('El delegado de subcomisión necesita su actividad');
    db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id, actividad_id) VALUES (?, ?, ?)').run(usuarioId, rolId, x.actividad_id ?? null);
  }
}

r.post('/usuarios', permiso('usuarios', 'gestionar'), async (req, res) => {
  const d = validar(usuarioSchema, req.body);
  const password = d.password ?? `Coop${Math.random().toString(36).slice(2, 8)}${Date.now() % 1000}`;
  const hash = await hashPassword(password);
  const id = enTransaccion(() => {
    const db = getDb();
    let personaId = d.persona_id;
    if (!personaId && d.persona) {
      personaId = db.prepare('SELECT id FROM personas WHERE dni = ?').pluck().get(d.persona.dni)
        ?? db.prepare(`INSERT INTO personas (dni, nombre, apellido, email, tipo) VALUES (?, ?, ?, ?, 'empleado') RETURNING id`).get(d.persona.dni, d.persona.nombre, d.persona.apellido, d.email).id;
    }
    const nuevo = db.prepare('INSERT INTO usuarios (persona_id, email, password_hash) VALUES (?, ?, ?) RETURNING id').get(personaId ?? null, d.email, hash).id;
    asignarRoles(nuevo, d.roles);
    return nuevo;
  });
  auditar(req, 'alta_usuario', 'usuarios', id, null, { email: d.email, roles: d.roles });
  // La contraseña inicial se muestra una vez para entregarla en mano; el usuario debe cambiarla.
  res.status(201).json({ id, password_inicial: d.password ? undefined : password });
});

/** Cambio de roles. Nadie se modifica los propios permisos. */
r.put('/usuarios/:id', permiso('usuarios', 'gestionar'), (req, res) => {
  const d = validar(z.object({ roles: usuarioSchema.shape.roles.optional(), estado: z.enum(['activo', 'bloqueado', 'baja']).optional(), desbloquear: z.boolean().optional() }), req.body);
  const id = req.params.id;
  if (id === req.usuario.id && d.roles) throw prohibido('No podés modificar tus propios roles');
  const db = getDb();
  const antes = db.prepare(`SELECT r.codigo, ur.actividad_id FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = ?`).all(id);
  enTransaccion(() => {
    if (d.roles) asignarRoles(id, d.roles);
    if (d.estado) db.prepare('UPDATE usuarios SET estado = ? WHERE id = ?').run(d.estado, id);
    if (d.estado && d.estado !== 'activo') db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
    if (d.desbloquear) db.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?').run(id);
  });
  auditar(req, 'cambio_roles', 'usuarios', id, { roles: antes }, d);
  res.json({ ok: true });
});

export default r;
