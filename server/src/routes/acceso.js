// Fichaje por QR, portería, lectores con cerradura, reglas de habilitación y excepciones manuales.
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { getDb, ahora } from '../db/index.js';
import { requiereSesion, sha256 } from '../lib/auth.js';
import { permiso, puede, tieneRol } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, prohibido, local, paginar, HttpError } from '../lib/util.js';
import { auditar, notificar } from '../lib/auditoria.js';
import { consumirQr } from '../services/qr.js';
import { evaluar, registrarAcceso, MOTIVOS } from '../services/habilitacion.js';

const r = Router();

const respuestaOperador = (persona, resultado) => ({
  habilitado: resultado.habilitado,
  // Mínimo privilegio: verde o rojo y un motivo genérico, nunca montos ni datos clínicos.
  mensaje: resultado.mensaje_operador,
  persona: persona ? { nombre: `${persona.nombre} ${persona.apellido}`, nro_socio: persona.nro_socio, foto: persona.foto } : null,
});

function personaBreve(id) {
  return getDb().prepare(`SELECT p.id, p.nombre, p.apellido, p.foto, s.nro_socio FROM personas p LEFT JOIN socios s ON s.persona_id = p.id WHERE p.id = ?`).get(id);
}

// ---------- API de lectores (dispositivo con relé). Autenticación por clave propia del lector. ----------
const lectorLimite = rateLimit({ windowMs: 60000, limit: 120 });

function autenticarLector(req) {
  const clave = req.get('x-lector-key');
  if (!clave) throw new HttpError(401, 'Falta la clave del lector');
  const lector = getDb().prepare(`SELECT l.*, pa.actividad_id, pa.id AS punto_id, pa.activo FROM lectores l JOIN puntos_acceso pa ON pa.id = l.punto_acceso_id WHERE l.api_key_hash = ?`).get(sha256(clave));
  if (!lector || !lector.activo) throw new HttpError(401, 'Lector no autorizado');
  getDb().prepare('UPDATE lectores SET ultimo_latido = ? WHERE id = ?').run(ahora(), lector.id);
  return lector;
}

r.post('/lector/validar', lectorLimite, (req, res) => {
  const lector = autenticarLector(req);
  const { codigo } = validar(z.object({ codigo: z.string().min(10).max(2000) }), req.body);
  const personaId = consumirQr(codigo);
  if (!personaId) {
    registrarAcceso({ personaId: null, puntoAccesoId: lector.punto_id, actividadId: lector.actividad_id, resultado: { habilitado: false, motivo: 'codigo_invalido' }, metodo: 'qr_lector' });
    return res.json({ abrir: false, mensaje: MOTIVOS.codigo_invalido.operador });
  }
  const resultado = lector.actividad_id
    ? evaluar({ personaId, actividadId: lector.actividad_id })
    : evaluarIngresoGeneral(personaId);
  registrarAcceso({ personaId, puntoAccesoId: lector.punto_id, actividadId: lector.actividad_id, resultado, metodo: 'qr_lector' });
  res.json({ abrir: resultado.habilitado, mensaje: resultado.mensaje_operador });
});

r.post('/lector/latido', lectorLimite, (req, res) => {
  const lector = autenticarLector(req);
  if (req.body?.firmware) getDb().prepare('UPDATE lectores SET firmware = ? WHERE id = ?').run(String(req.body.firmware).slice(0, 30), lector.id);
  res.json({ ok: true, hora: ahora() });
});

/**
 * Contingencia sin internet: el controlador descarga la lista de habilitados del día (solo hashes de
 * los identificadores, sin datos personales) y sincroniza después los ingresos.
 */
r.get('/lector/habilitados', lectorLimite, (req, res) => {
  const lector = autenticarLector(req);
  if (!lector.actividad_id) return res.json({ personas: [] });
  const ids = getDb().prepare(`SELECT DISTINCT i.persona_id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE g.actividad_id = ? AND i.estado IN ('activa','baja_solicitada')`).pluck().all(lector.actividad_id);
  const habilitados = ids.filter((id) => evaluar({ personaId: id, actividadId: lector.actividad_id, exigirHorario: false }).habilitado);
  res.json({ fecha: local().fecha, valido_hasta: new Date(Date.now() + 6 * 3600000).toISOString(), personas: habilitados.map((id) => sha256(`p:${id}`)) });
});

/** Ingreso general por portería: persona activa y cuota social al día. */
function evaluarIngresoGeneral(personaId) {
  const db = getDb();
  const p = db.prepare(`SELECT p.estado, s.estado AS socio FROM personas p LEFT JOIN socios s ON s.persona_id = p.id WHERE p.id = ?`).get(personaId);
  if (!p || p.estado !== 'activa' || ['suspendido', 'baja'].includes(p.socio)) return { habilitado: false, motivo: 'baja_suspension', ...MOTIVOS.baja_suspension, mensaje_operador: MOTIVOS.baja_suspension.operador };
  const deuda = db.prepare(`SELECT 1 FROM cargos c JOIN conceptos co ON co.id = c.concepto_id WHERE c.persona_id = ? AND co.tipo = 'cuota_social'
    AND c.estado IN ('pendiente','parcial') AND c.vencimiento < date(?, '-10 days')`).get(personaId, local().fecha);
  if (deuda) return { habilitado: false, motivo: 'cuota_social', mensaje_operador: MOTIVOS.cuota_social.operador };
  return { habilitado: true, motivo: null, mensaje_operador: 'Habilitado' };
}

// ---------- Fichaje por operador (profesor o portería) ----------
r.use('/acceso', requiereSesion);

r.post('/acceso/fichar', permiso('porteria', 'gestionar'), fichar);
r.post('/acceso/fichar-grupo', permiso('asistencia', 'gestionar'), fichar);

function fichar(req, res) {
  const datos = validar(z.object({
    codigo: z.string().optional(), dni: z.string().optional(), nro_socio: z.number().int().optional(),
    actividad_id: z.number().int().nullable().optional(), grupo_id: z.number().int().nullable().optional(), punto_acceso_id: z.number().int().nullable().optional(),
  }), req.body);
  const db = getDb();
  const esProfesor = req.path.endsWith('fichar-grupo');
  let personaId = null;
  let metodo = esProfesor ? 'qr_profesor' : 'qr_porteria';
  if (datos.codigo) personaId = consumirQr(datos.codigo);
  else if (datos.dni || datos.nro_socio) {
    // Validación con DNI o número de socio para quien usa llave magnética y no celular.
    metodo = 'dni_porteria';
    personaId = datos.dni
      ? db.prepare('SELECT id FROM personas WHERE dni = ?').pluck().get(datos.dni)
      : db.prepare('SELECT persona_id FROM socios WHERE nro_socio = ?').pluck().get(datos.nro_socio);
  }
  let actividadId = datos.actividad_id ?? null;
  if (esProfesor) {
    const g = db.prepare(`SELECT g.* FROM grupos g JOIN profesores pr ON pr.id = g.profesor_id WHERE g.id = ? AND pr.persona_id = ?`).get(datos.grupo_id, req.usuario.persona_id);
    if (!g) throw prohibido('Ese grupo no está a tu cargo');
    actividadId = g.actividad_id;
  } else if (datos.punto_acceso_id) {
    actividadId = db.prepare('SELECT actividad_id FROM puntos_acceso WHERE id = ?').pluck().get(datos.punto_acceso_id) ?? actividadId;
  }
  if (!personaId) {
    registrarAcceso({ personaId: null, puntoAccesoId: datos.punto_acceso_id ?? null, actividadId, resultado: { habilitado: false, motivo: 'codigo_invalido' }, metodo, usuarioId: req.usuario.id });
    return res.json({ habilitado: false, mensaje: datos.codigo ? MOTIVOS.codigo_invalido.operador : 'Persona no encontrada', persona: null });
  }
  const resultado = actividadId
    ? evaluar({ personaId, actividadId, grupoId: esProfesor ? datos.grupo_id : null })
    : evaluarIngresoGeneral(personaId);
  registrarAcceso({ personaId, puntoAccesoId: datos.punto_acceso_id ?? null, actividadId, resultado, metodo, usuarioId: req.usuario.id });
  res.json(respuestaOperador(personaBreve(personaId), resultado));
}

/** Apertura manual con registro (contingencia). */
r.post('/acceso/apertura-manual', permiso('porteria', 'gestionar'), (req, res) => {
  const d = validar(z.object({ punto_acceso_id: z.number().int(), motivo: z.string().min(5), persona_id: z.number().int().nullable().optional() }), req.body);
  getDb().prepare(`INSERT INTO accesos (persona_id, punto_acceso_id, fecha_hora, resultado, motivo_codigo, metodo, registrado_por) VALUES (?, ?, ?, 'habilitado', ?, 'apertura_manual', ?)`)
    .run(d.persona_id ?? null, d.punto_acceso_id, ahora(), `manual: ${d.motivo}`.slice(0, 120), req.usuario.id);
  auditar(req, 'apertura_manual', 'puntos_acceso', d.punto_acceso_id, null, d);
  res.json({ ok: true });
});

/** Ingreso de invitados del día en portería. */
r.get('/acceso/invitados', permiso('porteria', 'gestionar', 'leer'), (_req, res) => {
  res.json(getDb().prepare(`SELECT i.*, p.nombre || ' ' || p.apellido AS anfitrion, s.nro_socio, c.estado AS pago FROM invitados i
    JOIN socios s ON s.id = i.socio_anfitrion_id JOIN personas p ON p.id = s.persona_id LEFT JOIN cargos c ON c.id = i.cargo_id
    WHERE i.fecha = ? ORDER BY i.nombre`).all(local().fecha));
});
r.post('/acceso/invitados/:id/ingreso', permiso('porteria', 'gestionar'), (req, res) => {
  const inv = getDb().prepare('SELECT * FROM invitados WHERE id = ?').get(req.params.id);
  if (!inv) throw noEncontrado('Invitado');
  if (inv.fecha !== local().fecha) throw invalido('El pase no es para hoy');
  if (inv.ingreso_en) throw invalido('El invitado ya ingresó');
  getDb().prepare('UPDATE invitados SET ingreso_en = ? WHERE id = ?').run(ahora(), inv.id);
  res.json({ ok: true });
});

// ---------- Historial de accesos ----------
r.get('/acceso/historial', permiso('asistencia', 'leer', 'gestionar', 'leer_ambito'), (req, res) => {
  const db = getDb();
  const { limite, offset } = paginar(req);
  const f = [];
  const p = [];
  if (req.query.actividad_id) { f.push('ac.actividad_id = ?'); p.push(Number(req.query.actividad_id)); }
  if (req.query.punto_acceso_id) { f.push('ac.punto_acceso_id = ?'); p.push(Number(req.query.punto_acceso_id)); }
  if (req.query.resultado) { f.push('ac.resultado = ?'); p.push(req.query.resultado); }
  if (req.query.desde) { f.push('ac.fecha_hora >= ?'); p.push(new Date(`${req.query.desde}T00:00:00-03:00`).toISOString()); }
  if (req.query.hasta) { f.push('ac.fecha_hora <= ?'); p.push(new Date(`${req.query.hasta}T23:59:59-03:00`).toISOString()); }
  if (req.query.q) { f.push(`(pe.apellido || ' ' || pe.nombre LIKE ? OR CAST(s.nro_socio AS TEXT) = ?)`); p.push(`%${req.query.q}%`, String(req.query.q)); }
  if (tieneRol(req.usuario, 'profesor') && !puede(req.usuario, 'asistencia', 'leer')) {
    f.push(`ac.grupo_id IN (SELECT g.id FROM grupos g JOIN profesores pr ON pr.id = g.profesor_id WHERE pr.persona_id = ${Number(req.usuario.persona_id)})`);
  }
  const where = f.length ? `WHERE ${f.join(' AND ')}` : '';
  res.json({
    filas: db.prepare(`SELECT ac.*, pe.nombre, pe.apellido, s.nro_socio, a.nombre AS actividad, pa.nombre AS punto FROM accesos ac
      LEFT JOIN personas pe ON pe.id = ac.persona_id LEFT JOIN socios s ON s.persona_id = pe.id
      LEFT JOIN actividades a ON a.id = ac.actividad_id LEFT JOIN puntos_acceso pa ON pa.id = ac.punto_acceso_id
      ${where} ORDER BY ac.fecha_hora DESC LIMIT ? OFFSET ?`).all(...p, limite, offset),
    resumen: db.prepare(`SELECT resultado, COUNT(*) AS n FROM accesos ac LEFT JOIN personas pe ON pe.id = ac.persona_id LEFT JOIN socios s ON s.persona_id = pe.id ${where} GROUP BY resultado`).all(...p),
    motivos: db.prepare(`SELECT motivo_codigo, COUNT(*) AS n FROM accesos ac LEFT JOIN personas pe ON pe.id = ac.persona_id LEFT JOIN socios s ON s.persona_id = pe.id ${where ? where + ' AND' : 'WHERE'} ac.resultado = 'denegado' GROUP BY motivo_codigo`).all(...p),
  });
});

// ---------- Puntos de acceso y lectores ----------
r.get('/acceso/puntos', permiso('porteria', 'gestionar', 'leer'), (_req, res) => {
  const db = getDb();
  const hace = new Date(Date.now() - 10 * 60000).toISOString();
  res.json(db.prepare(`SELECT pa.*, e.nombre AS espacio, a.nombre AS actividad FROM puntos_acceso pa LEFT JOIN espacios e ON e.id = pa.espacio_id
    LEFT JOIN actividades a ON a.id = pa.actividad_id ORDER BY pa.nombre`).all().map((pa) => ({
    ...pa,
    lectores: db.prepare('SELECT id, nombre, ultimo_latido, firmware FROM lectores WHERE punto_acceso_id = ?').all(pa.id).map((l) => ({ ...l, en_linea: !!l.ultimo_latido && l.ultimo_latido > hace })),
    accesos_hoy: db.prepare(`SELECT COUNT(*) FROM accesos WHERE punto_acceso_id = ? AND fecha_hora >= ?`).pluck().get(pa.id, new Date(`${local().fecha}T00:00:00-03:00`).toISOString()),
  })));
});

r.post('/acceso/puntos', permiso('porteria', 'gestionar'), (req, res) => {
  const d = validar(z.object({ id: z.number().int().optional(), nombre: z.string().min(2), espacio_id: z.number().int().nullable().optional(), actividad_id: z.number().int().nullable().optional(),
    tipo_lector: z.enum(['lector_rele', 'integracion_fabricante', 'movil']), activo: z.boolean().default(true) }), req.body);
  const db = getDb();
  const vals = [d.nombre, d.espacio_id ?? null, d.actividad_id ?? null, d.tipo_lector, d.activo ? 1 : 0];
  const id = d.id ? (db.prepare('UPDATE puntos_acceso SET nombre = ?, espacio_id = ?, actividad_id = ?, tipo_lector = ?, activo = ? WHERE id = ?').run(...vals, d.id), d.id)
    : db.prepare('INSERT INTO puntos_acceso (nombre, espacio_id, actividad_id, tipo_lector, activo) VALUES (?, ?, ?, ?, ?)').run(...vals).lastInsertRowid;
  auditar(req, 'guardar_punto_acceso', 'puntos_acceso', id, null, d);
  res.json({ id });
});

/** Alta o rotación de la clave de un lector. La clave se muestra una sola vez; se guarda solo su hash. */
r.post('/acceso/puntos/:id/lectores', (req, res, next) => {
  if (!puede(req.usuario, 'porteria', 'gestionar') || !(tieneRol(req.usuario, 'sistemas', 'admin'))) return next(prohibido());
  const d = validar(z.object({ nombre: z.string().min(2), lector_id: z.number().int().optional() }), req.body);
  const clave = `lk_${crypto.randomBytes(24).toString('base64url')}`;
  const db = getDb();
  if (d.lector_id) db.prepare('UPDATE lectores SET api_key_hash = ?, nombre = ? WHERE id = ? AND punto_acceso_id = ?').run(sha256(clave), d.nombre, d.lector_id, req.params.id);
  else db.prepare('INSERT INTO lectores (punto_acceso_id, nombre, api_key_hash) VALUES (?, ?, ?)').run(req.params.id, d.nombre, sha256(clave));
  auditar(req, d.lector_id ? 'rotar_clave_lector' : 'alta_lector', 'lectores', d.lector_id ?? null, null, { punto: req.params.id });
  res.json({ clave, aviso: 'Guardá esta clave en el controlador: no se vuelve a mostrar.' });
});

// ---------- Reglas de habilitación y excepciones manuales ----------
r.get('/acceso/reglas', permiso('habilitacion', 'leer', 'aprobar', 'gestionar'), (_req, res) => {
  const db = getDb();
  res.json({
    reglas: db.prepare(`SELECT rh.*, a.nombre AS actividad FROM reglas_habilitacion rh LEFT JOIN actividades a ON a.id = rh.actividad_id ORDER BY rh.actividad_id IS NOT NULL, a.nombre`).all(),
    manuales: db.prepare(`SELECT hm.*, p.nombre, p.apellido, s.nro_socio, a.nombre AS actividad,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = hm.solicitada_por) AS solicitante,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = hm.autorizada_por) AS autorizante
      FROM habilitaciones_manuales hm JOIN personas p ON p.id = hm.persona_id LEFT JOIN socios s ON s.persona_id = p.id
      LEFT JOIN actividades a ON a.id = hm.actividad_id ORDER BY hm.id DESC LIMIT 200`).all(),
    actividades: db.prepare('SELECT id, nombre FROM actividades ORDER BY nombre').all(),
  });
});

r.put('/acceso/reglas', permiso('habilitacion', 'gestionar'), (req, res) => {
  const d = validar(z.object({ actividad_id: z.number().int().nullable(), gracia_cuota_dias: z.number().int().min(0).max(60), gracia_arancel_dias: z.number().int().min(0).max(60),
    ventana_antes_min: z.number().int().min(0).max(120), ventana_despues_min: z.number().int().min(0).max(240) }), req.body);
  const db = getDb();
  const existe = d.actividad_id == null ? db.prepare('SELECT id FROM reglas_habilitacion WHERE actividad_id IS NULL').pluck().get() : db.prepare('SELECT id FROM reglas_habilitacion WHERE actividad_id = ?').pluck().get(d.actividad_id);
  const vals = [d.gracia_cuota_dias, d.gracia_arancel_dias, d.ventana_antes_min, d.ventana_despues_min];
  if (existe) db.prepare('UPDATE reglas_habilitacion SET gracia_cuota_dias = ?, gracia_arancel_dias = ?, ventana_antes_min = ?, ventana_despues_min = ? WHERE id = ?').run(...vals, existe);
  else db.prepare('INSERT INTO reglas_habilitacion (actividad_id, gracia_cuota_dias, gracia_arancel_dias, ventana_antes_min, ventana_despues_min) VALUES (?, ?, ?, ?, ?)').run(d.actividad_id, ...vals);
  auditar(req, 'regla_habilitacion', 'reglas_habilitacion', existe ?? null, null, d);
  res.json({ ok: true });
});

/** Administración solicita la excepción o el bloqueo; la Comisión Directiva la aprueba (separación de funciones). */
r.post('/acceso/manuales', permiso('habilitacion', 'gestionar'), (req, res) => {
  const d = validar(z.object({ persona_id: z.number().int(), actividad_id: z.number().int().nullable().optional(), tipo: z.enum(['excepcion', 'bloqueo']),
    motivo: z.string().min(5), desde: z.string(), hasta: z.string() }), req.body);
  if (d.hasta < d.desde) throw invalido('La fecha de vencimiento debe ser posterior');
  const id = getDb().prepare(`INSERT INTO habilitaciones_manuales (persona_id, actividad_id, tipo, motivo, desde, hasta, estado, solicitada_por) VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
    .run(d.persona_id, d.actividad_id ?? null, d.tipo, d.motivo, d.desde, d.hasta, req.usuario.id).lastInsertRowid;
  auditar(req, 'solicitar_habilitacion_manual', 'habilitaciones_manuales', id, null, d);
  notificar({ rol: 'directiva', tipo: 'aprobacion', titulo: `Excepción de habilitación para aprobar`, referencia: '/directiva/aprobaciones' });
  res.status(201).json({ id });
});

r.post('/acceso/manuales/:id/revocar', permiso('habilitacion', 'gestionar', 'aprobar'), (req, res) => {
  getDb().prepare(`UPDATE habilitaciones_manuales SET estado = 'revocada' WHERE id = ?`).run(req.params.id);
  auditar(req, 'revocar_habilitacion_manual', 'habilitaciones_manuales', Number(req.params.id));
  res.json({ ok: true });
});

export default r;
