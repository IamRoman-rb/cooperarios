// Tickets de mantenimiento, sectores, inventario y solicitudes de compra.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso, puede, tieneRol, ambitoActividades } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, prohibido, zId } from '../lib/util.js';
import { auditar, notificar } from '../lib/auditoria.js';
import { crearTicket, transicion, detalleTicket, agregarFoto, comentar, PLAZOS_DIAS } from '../services/tickets.js';
import { subida, rutaRelativa } from '../services/archivos.js';

const r = Router();
r.use(['/tickets', '/sectores', '/inventario', '/compras'], requiereSesion);

// ---------- Tickets ----------
r.get('/tickets', permiso('tickets', 'gestionar', 'leer', 'aprobar', 'solicitar'), (req, res) => {
  const db = getDb();
  const f = [];
  const p = [];
  for (const campo of ['estado', 'prioridad', 'sector_id', 'categoria', 'asignado_a']) {
    if (req.query[campo]) { f.push(`t.${campo} = ?`); p.push(req.query[campo]); }
  }
  if (req.query.mios === 'asignados') { f.push('t.asignado_a = ?'); p.push(req.usuario.id); }
  // Quien solo reporta ve sus propios tickets.
  if (req.query.mios === 'reportados' || !puede(req.usuario, 'tickets', 'leer')) { f.push('t.reportado_por = ?'); p.push(req.usuario.id); }
  const where = f.length ? `WHERE ${f.join(' AND ')}` : '';
  const ahoraIso = new Date().toISOString();
  const orden = `CASE t.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`;
  res.json({
    tickets: db.prepare(`SELECT t.*, s.nombre AS sector,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = t.asignado_a) AS responsable,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = t.reportado_por) AS reportante,
        (SELECT COUNT(*) FROM ticket_fotos WHERE ticket_id = t.id) AS fotos,
        (t.estado NOT IN ('resuelto','cerrado') AND t.vence_en < ?) AS vencido
      FROM tickets_mantenimiento t JOIN sectores s ON s.id = t.sector_id ${where}
      ORDER BY (t.estado IN ('resuelto','cerrado')), ${orden}, t.vence_en LIMIT 300`).all(ahoraIso, ...p),
    indicadores: puede(req.usuario, 'tickets', 'leer') ? {
      por_estado: db.prepare('SELECT estado, COUNT(*) AS n FROM tickets_mantenimiento GROUP BY estado').all(),
      por_sector: db.prepare(`SELECT s.nombre AS sector, COUNT(*) AS abiertos, SUM(t.vence_en < ?) AS vencidos FROM tickets_mantenimiento t JOIN sectores s ON s.id = t.sector_id
        WHERE t.estado NOT IN ('resuelto','cerrado') GROUP BY s.id ORDER BY abiertos DESC`).all(ahoraIso),
      por_categoria: db.prepare(`SELECT categoria, COUNT(*) AS n, COALESCE(SUM(costo),0) AS costo FROM tickets_mantenimiento GROUP BY categoria`).all(),
      tiempo_medio_horas: db.prepare(`SELECT ROUND(AVG((julianday(resuelto_en) - julianday(creado_en)) * 24), 1) FROM tickets_mantenimiento WHERE resuelto_en IS NOT NULL`).pluck().get(),
    } : undefined,
    personal: db.prepare(`SELECT DISTINCT u.id, p.nombre || ' ' || p.apellido AS nombre FROM usuarios u JOIN personas p ON p.id = u.persona_id
      JOIN usuario_roles ur ON ur.usuario_id = u.id JOIN roles r ON r.id = ur.rol_id WHERE r.codigo = 'mantenimiento'`).all(),
    plazos: PLAZOS_DIAS,
  });
});

r.get('/tickets/:id', permiso('tickets', 'gestionar', 'leer', 'aprobar', 'solicitar'), (req, res) => {
  const t = detalleTicket(req.params.id);
  const ve = puede(req.usuario, 'tickets', 'leer') || t.reportado_por === req.usuario.id || t.asignado_a === req.usuario.id;
  if (!ve) throw prohibido();
  res.json(t);
});

const fotos = subida('tickets', { maxMb: 4, campos: 6 }).array('fotos', 6);

r.post('/tickets', permiso('tickets', 'solicitar', 'gestionar'), fotos, (req, res) => {
  const d = validar(z.object({
    titulo: z.string().min(4).max(120), descripcion: z.string().min(5).max(2000), sector_id: zId,
    categoria: z.enum(['electricidad', 'plomeria', 'pileta', 'limpieza', 'carpinteria', 'pintura', 'climatizacion', 'otro']),
    prioridad: z.enum(['urgente', 'alta', 'media', 'baja']),
  }), req.body);
  const id = crearTicket({ ...d, sectorId: d.sector_id, fotos: (req.files ?? []).map((f) => rutaRelativa('tickets', f)) }, req.usuario);
  auditar(req, 'crear_ticket', 'tickets_mantenimiento', id, null, d);
  res.status(201).json({ id });
});

r.post('/tickets/:id/fotos', permiso('tickets', 'solicitar', 'gestionar'), fotos, (req, res) => {
  const t = detalleTicket(req.params.id);
  const tipo = req.body.tipo === 'resolucion' ? 'resolucion' : 'problema';
  if (tipo === 'resolucion' && t.asignado_a !== req.usuario.id && !puede(req.usuario, 'tickets', 'gestionar')) throw prohibido();
  if (!req.files?.length) throw invalido('Adjuntá al menos una foto');
  for (const f of req.files) agregarFoto(t.id, tipo, rutaRelativa('tickets', f), req.usuario.id);
  res.status(201).json({ ok: true });
});

r.post('/tickets/:id/comentarios', permiso('tickets', 'solicitar', 'gestionar'), (req, res) => {
  const { texto } = validar(z.object({ texto: z.string().min(1).max(1000) }), req.body);
  const t = detalleTicket(req.params.id);
  comentar(t.id, req.usuario.id, texto);
  res.status(201).json({ ok: true });
});

r.post('/tickets/:id/:accion', permiso('tickets', 'solicitar', 'gestionar', 'aprobar'), (req, res) => {
  const d = validar(z.object({ asignado_a: zId.optional(), comentario: z.string().max(1000).optional(), costo: z.number().int().min(0).optional() }), req.body ?? {});
  const estado = transicion(req.params.id, req.params.accion, req.usuario, { asignadoA: d.asignado_a, comentario: d.comentario, costo: d.costo });
  auditar(req, `ticket_${req.params.accion}`, 'tickets_mantenimiento', req.params.id, null, { estado, ...d });
  res.json({ estado });
});

// ---------- Sectores ----------
r.get('/sectores', (req, res) => {
  res.json(getDb().prepare(`SELECT s.*, e.nombre AS espacio,
      (SELECT p.nombre || ' ' || p.apellido FROM usuarios u JOIN personas p ON p.id = u.persona_id WHERE u.id = s.responsable_default_id) AS responsable,
      (SELECT COUNT(*) FROM tickets_mantenimiento WHERE sector_id = s.id AND estado NOT IN ('resuelto','cerrado')) AS abiertos
    FROM sectores s LEFT JOIN espacios e ON e.id = s.espacio_id ORDER BY s.nombre`).all());
});

r.post('/sectores', permiso('tickets', 'gestionar'), (req, res) => {
  if (!tieneRol(req.usuario, 'admin')) throw prohibido('Los sectores los gestiona Administración');
  const d = validar(z.object({ id: zId.optional(), nombre: z.string().min(2), espacio_id: zId.nullable().optional(), responsable_default_id: zId.nullable().optional() }), req.body);
  const db = getDb();
  const id = d.id ? (db.prepare('UPDATE sectores SET nombre = ?, espacio_id = ?, responsable_default_id = ? WHERE id = ?').run(d.nombre, d.espacio_id ?? null, d.responsable_default_id ?? null, d.id), d.id)
    : db.prepare('INSERT INTO sectores (nombre, espacio_id, responsable_default_id) VALUES (?, ?, ?) RETURNING id').get(d.nombre, d.espacio_id ?? null, d.responsable_default_id ?? null).id;
  auditar(req, 'guardar_sector', 'sectores', id, null, d);
  res.json({ id });
});

// ---------- Inventario ----------
r.get('/inventario', permiso('inventario', 'leer', 'gestionar'), (_req, res) => {
  res.json(getDb().prepare('SELECT *, cantidad <= stock_minimo AS bajo_minimo FROM inventario ORDER BY bajo_minimo DESC, categoria, nombre').all());
});

r.post('/inventario', permiso('inventario', 'gestionar'), (req, res) => {
  const d = validar(z.object({ id: zId.optional(), nombre: z.string().min(2), categoria: z.string().min(2), ubicacion: z.string().optional(),
    cantidad: z.number().int().min(0), stock_minimo: z.number().int().min(0), unidad: z.string().default('u') }), req.body);
  const db = getDb();
  const vals = [d.nombre, d.categoria, d.ubicacion ?? null, d.cantidad, d.stock_minimo, d.unidad];
  const id = d.id ? (db.prepare('UPDATE inventario SET nombre = ?, categoria = ?, ubicacion = ?, cantidad = ?, stock_minimo = ?, unidad = ? WHERE id = ?').run(...vals, d.id), d.id)
    : db.prepare('INSERT INTO inventario (nombre, categoria, ubicacion, cantidad, stock_minimo, unidad) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').get(...vals).id;
  res.json({ id });
});

r.post('/inventario/:id/movimiento', permiso('inventario', 'gestionar'), (req, res) => {
  const { delta, motivo } = validar(z.object({ delta: z.number().int(), motivo: z.string().min(2) }), req.body);
  const db = getDb();
  const it = db.prepare('SELECT * FROM inventario WHERE id = ?').get(req.params.id);
  if (!it) throw noEncontrado('Ítem');
  if (it.cantidad + delta < 0) throw invalido('No hay stock suficiente');
  db.prepare('UPDATE inventario SET cantidad = cantidad + ? WHERE id = ?').run(delta, it.id);
  auditar(req, 'movimiento_inventario', 'inventario', it.id, { cantidad: it.cantidad }, { cantidad: it.cantidad + delta, motivo });
  if (it.cantidad + delta <= it.stock_minimo) notificar({ rol: 'mantenimiento', tipo: 'inventario', titulo: `Stock bajo mínimo: ${it.nombre}`, referencia: '/inventario' });
  res.json({ cantidad: it.cantidad + delta });
});

// ---------- Solicitudes de compra (mantenimiento y subcomisiones) ----------
r.get('/compras', permiso('compras', 'solicitar', 'gestionar', 'aprobar', 'leer'), (req, res) => {
  const db = getDb();
  const propias = !puede(req.usuario, 'compras', 'leer');
  res.json(db.prepare(`SELECT sc.*, a.nombre AS actividad, t.codigo AS ticket,
      (SELECT p.nombre || ' ' || p.apellido FROM usuarios u JOIN personas p ON p.id = u.persona_id WHERE u.id = sc.solicitante_id) AS solicitante,
      (SELECT p.nombre || ' ' || p.apellido FROM usuarios u JOIN personas p ON p.id = u.persona_id WHERE u.id = sc.autorizada_por) AS autorizante
    FROM solicitudes_compra sc LEFT JOIN actividades a ON a.id = sc.actividad_id LEFT JOIN tickets_mantenimiento t ON t.id = sc.ticket_id
    ${propias ? 'WHERE sc.solicitante_id = ?' : ''} ORDER BY sc.id DESC LIMIT 200`).all(...(propias ? [req.usuario.id] : [])));
});

r.post('/compras', permiso('compras', 'solicitar', 'gestionar'), (req, res) => {
  const d = validar(z.object({ descripcion: z.string().min(5).max(600), monto_estimado: z.number().int().positive(), ticket_id: zId.nullable().optional(), actividad_id: zId.nullable().optional() }), req.body);
  const esDelegado = tieneRol(req.usuario, 'subcomision');
  if (esDelegado && d.actividad_id && !ambitoActividades(req.usuario).includes(d.actividad_id)) throw prohibido('Solo para tu actividad');
  const id = getDb().prepare('INSERT INTO solicitudes_compra (solicitante_id, origen, actividad_id, ticket_id, descripcion, monto_estimado) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .get(req.usuario.id, esDelegado ? 'subcomision' : 'mantenimiento', d.actividad_id ?? (esDelegado ? ambitoActividades(req.usuario)[0] : null), d.ticket_id ?? null, d.descripcion, d.monto_estimado).id;
  notificar({ rol: 'directiva', tipo: 'aprobacion', titulo: `Solicitud de compra: ${d.descripcion.slice(0, 60)}`, referencia: '/aprobaciones' });
  notificar({ rol: 'contabilidad', tipo: 'compra', titulo: `Nueva solicitud de compra`, referencia: '/compras' });
  res.status(201).json({ id });
});

r.post('/compras/:id/resolver', permiso('compras', 'aprobar', 'gestionar'), (req, res) => {
  const d = validar(z.object({ estado: z.enum(['autorizada', 'rechazada', 'comprada']), motivo: z.string().optional() }), req.body);
  const db = getDb();
  const sc = db.prepare('SELECT * FROM solicitudes_compra WHERE id = ?').get(req.params.id);
  if (!sc) throw noEncontrado('Solicitud');
  if (d.estado !== 'comprada' && !puede(req.usuario, 'compras', 'aprobar')) throw prohibido('Autoriza la Comisión Directiva');
  if (sc.solicitante_id === req.usuario.id) throw prohibido('Quien solicita no autoriza');
  db.prepare('UPDATE solicitudes_compra SET estado = ?, motivo = ?, autorizada_por = COALESCE(autorizada_por, ?) WHERE id = ?').run(d.estado, d.motivo ?? null, req.usuario.id, sc.id);
  notificar({ usuarioId: sc.solicitante_id, tipo: 'compra', titulo: `Tu solicitud de compra fue ${d.estado}`, referencia: '/solicitudes-de-compra' });
  auditar(req, 'resolver_compra', 'solicitudes_compra', sc.id, { estado: sc.estado }, d);
  res.json({ ok: true, en: ahora() });
});

export default r;
