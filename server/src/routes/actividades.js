// Actividades, grupos, horarios, cupos, inscripciones, lista de espera y tarifario.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, enTransaccion } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso, puede, ambitoActividades } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, prohibido, local, json } from '../lib/util.js';
import { auditar } from '../lib/auditoria.js';
import { catalogo, detalleActividad } from '../services/catalogo.js';
import { cotizar, vacantes } from '../services/precios.js';
import { estadoApto } from '../services/habilitacion.js';
import { crearCargo } from '../services/cuenta.js';

const r = Router();
r.use(requiereSesion);

/** El delegado (Gx) solo gestiona su actividad. */
function exigirAmbito(req, actividadId) {
  if (puede(req.usuario, 'actividades', 'gestionar')) return;
  if (puede(req.usuario, 'actividades', 'gestionar_ambito') && ambitoActividades(req.usuario).includes(Number(actividadId))) return;
  throw prohibido('Solo podés gestionar tu actividad');
}

r.get('/', permiso('actividades', 'leer', 'leer_ambito'), (req, res) => {
  const ambito = puede(req.usuario, 'actividades', 'leer') ? null : ambitoActividades(req.usuario);
  const lista = catalogo({ tipo: req.query.tipo, q: req.query.q });
  res.json(ambito?.length ? lista.filter((a) => ambito.includes(a.id)) : lista);
});

r.get('/:id', permiso('actividades', 'leer', 'leer_ambito'), (req, res) => {
  const a = detalleActividad(Number(req.params.id));
  if (!a) throw noEncontrado('Actividad');
  res.json(a);
});

const actividadSchema = z.object({
  nombre: z.string().min(2), tipo: z.enum(['deportiva', 'acuatica', 'cultural', 'social']), descripcion: z.string().max(600).optional(),
  icono: z.string().max(40).optional(), subcomision_id: z.number().int().nullable().optional(), dia_vencimiento: z.number().int().min(1).max(28).default(10),
  activa: z.boolean().default(true),
});

r.post('/', permiso('actividades', 'gestionar'), (req, res) => {
  const d = validar(actividadSchema, req.body);
  const id = getDb().prepare('INSERT INTO actividades (nombre, tipo, descripcion, icono, subcomision_id, dia_vencimiento, activa) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(d.nombre, d.tipo, d.descripcion ?? null, d.icono ?? 'sports', d.subcomision_id ?? null, d.dia_vencimiento, d.activa ? 1 : 0).lastInsertRowid;
  auditar(req, 'crear', 'actividades', id, null, d);
  res.status(201).json({ id });
});

r.put('/:id', (req, res) => {
  exigirAmbito(req, req.params.id);
  const d = validar(actividadSchema, req.body);
  const db = getDb();
  const antes = db.prepare('SELECT * FROM actividades WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE actividades SET nombre = ?, tipo = ?, descripcion = ?, icono = ?, subcomision_id = ?, dia_vencimiento = ?, activa = ? WHERE id = ?')
    .run(d.nombre, d.tipo, d.descripcion ?? null, d.icono ?? antes.icono, d.subcomision_id ?? null, d.dia_vencimiento, d.activa ? 1 : 0, req.params.id);
  auditar(req, 'editar', 'actividades', Number(req.params.id), antes, d);
  res.json({ ok: true });
});

// ---------- Grupos y horarios ----------
const grupoSchema = z.object({
  actividad_id: z.number().int(), temporada_id: z.number().int().nullable().optional(), nombre: z.string().min(2),
  edad_min: z.number().int().nullable().optional(), edad_max: z.number().int().nullable().optional(), cupo: z.number().int().min(1),
  profesor_id: z.number().int().nullable().optional(),
  horarios: z.array(z.object({ dia_semana: z.number().int().min(0).max(6), hora_inicio: z.string().regex(/^\d{2}:\d{2}$/), hora_fin: z.string().regex(/^\d{2}:\d{2}$/), espacio_id: z.number().int().nullable().optional() })).default([]),
});

function guardarGrupo(id, d) {
  const db = getDb();
  return enTransaccion(() => {
    const vals = [d.actividad_id, d.temporada_id ?? null, d.nombre, d.edad_min ?? null, d.edad_max ?? null, d.cupo, d.profesor_id ?? null];
    if (id) {
      const ocupados = vacantes(id).ocupados;
      if (d.cupo < ocupados) throw invalido(`El cupo no puede ser menor a los ${ocupados} inscriptos`);
      db.prepare('UPDATE grupos SET actividad_id = ?, temporada_id = ?, nombre = ?, edad_min = ?, edad_max = ?, cupo = ?, profesor_id = ? WHERE id = ?').run(...vals, id);
      db.prepare('DELETE FROM horarios WHERE grupo_id = ?').run(id);
    } else {
      id = db.prepare('INSERT INTO grupos (actividad_id, temporada_id, nombre, edad_min, edad_max, cupo, profesor_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...vals).lastInsertRowid;
    }
    for (const h of d.horarios) {
      if (h.hora_fin <= h.hora_inicio) throw invalido('La hora de fin debe ser posterior a la de inicio');
      db.prepare('INSERT INTO horarios (grupo_id, dia_semana, hora_inicio, hora_fin, espacio_id) VALUES (?, ?, ?, ?, ?)').run(id, h.dia_semana, h.hora_inicio, h.hora_fin, h.espacio_id ?? null);
    }
    return id;
  });
}

r.post('/grupos', (req, res) => {
  const d = validar(grupoSchema, req.body);
  exigirAmbito(req, d.actividad_id);
  const id = guardarGrupo(null, d);
  auditar(req, 'crear', 'grupos', id, null, d);
  res.status(201).json({ id });
});
r.put('/grupos/:id', (req, res) => {
  const d = validar(grupoSchema, req.body);
  exigirAmbito(req, d.actividad_id);
  guardarGrupo(Number(req.params.id), d);
  auditar(req, 'editar', 'grupos', Number(req.params.id), null, d);
  res.json({ ok: true });
});

r.get('/aux/opciones', permiso('actividades', 'leer', 'leer_ambito'), (_req, res) => {
  const db = getDb();
  res.json({
    profesores: db.prepare(`SELECT pr.id, p.nombre || ' ' || p.apellido AS nombre FROM profesores pr JOIN personas p ON p.id = pr.persona_id WHERE pr.activo = 1 ORDER BY p.apellido`).all(),
    espacios: db.prepare('SELECT id, nombre FROM espacios WHERE activo = 1 ORDER BY nombre').all(),
    temporadas: db.prepare('SELECT * FROM temporadas ORDER BY desde DESC').all(),
    subcomisiones: db.prepare('SELECT id, nombre FROM subcomisiones ORDER BY nombre').all(),
    tipos_revision: db.prepare('SELECT * FROM tipos_revision').all(),
  });
});

// ---------- Inscripciones (Administración) ----------
r.get('/inscripciones/lista', permiso('inscripciones', 'leer', 'leer_ambito'), (req, res) => {
  const db = getDb();
  const filtros = [];
  const params = [];
  if (req.query.actividad_id) { filtros.push('g.actividad_id = ?'); params.push(Number(req.query.actividad_id)); }
  if (req.query.grupo_id) { filtros.push('g.id = ?'); params.push(Number(req.query.grupo_id)); }
  if (req.query.estado) { filtros.push('i.estado = ?'); params.push(req.query.estado); } else filtros.push(`i.estado != 'baja'`);
  if (!puede(req.usuario, 'inscripciones', 'leer')) {
    const ambito = ambitoActividades(req.usuario);
    filtros.push(`g.actividad_id IN (${ambito.length ? ambito.join(',') : '-1'})`);
  }
  res.json({
    inscripciones: db.prepare(`SELECT i.*, p.nombre, p.apellido, s.nro_socio, a.nombre AS actividad, g.nombre AS grupo, d.nombre AS descuento
      FROM inscripciones i JOIN personas p ON p.id = i.persona_id LEFT JOIN socios s ON s.persona_id = p.id
      JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id LEFT JOIN descuentos d ON d.id = i.descuento_id
      WHERE ${filtros.join(' AND ')} ORDER BY i.id DESC LIMIT 300`).all(...params),
    lista_espera: db.prepare(`SELECT le.*, p.nombre, p.apellido, g.nombre AS grupo, a.nombre AS actividad FROM lista_espera le
      JOIN personas p ON p.id = le.persona_id JOIN grupos g ON g.id = le.grupo_id JOIN actividades a ON a.id = g.actividad_id ORDER BY a.nombre, le.posicion`).all(),
    ocupacion: db.prepare(`SELECT g.id, g.nombre, a.nombre AS actividad, g.cupo,
      (SELECT COUNT(*) FROM inscripciones WHERE grupo_id = g.id AND estado IN ('activa','pendiente_apto','baja_solicitada')) AS ocupados
      FROM grupos g JOIN actividades a ON a.id = g.actividad_id ORDER BY a.nombre, g.nombre`).all(),
  });
});

r.post('/inscripciones', permiso('inscripciones', 'gestionar'), (req, res) => {
  const d = validar(z.object({ persona_id: z.number().int(), grupo_id: z.number().int(), frecuencia: z.number().int().min(0).max(7), descuento_id: z.number().int().nullable().optional() }), req.body);
  const out = enTransaccion(() => {
    const db = getDb();
    const g = db.prepare('SELECT g.*, a.nombre AS actividad, a.dia_vencimiento FROM grupos g JOIN actividades a ON a.id = g.actividad_id WHERE g.id = ?').get(d.grupo_id);
    if (!g) throw noEncontrado('Grupo');
    if (vacantes(g.id).vacantes <= 0) throw invalido('El grupo no tiene vacantes');
    const precio = cotizar({ personaId: d.persona_id, actividadId: g.actividad_id, frecuencia: d.frecuencia, descuentoId: d.descuento_id ?? null });
    const apto = estadoApto(d.persona_id, g.actividad_id);
    const hoy = local().fecha;
    const id = db.prepare('INSERT INTO inscripciones (persona_id, grupo_id, frecuencia_semanal, desde, estado, descuento_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(d.persona_id, g.id, d.frecuencia, hoy, apto.requiere && !apto.vigente ? 'pendiente_apto' : 'activa', precio.descuento_id).lastInsertRowid;
    crearCargo({ personaId: d.persona_id, conceptoTipo: 'arancel', descripcion: `${g.actividad} ${local().periodo}`, periodo: local().periodo, importe: precio.total,
      vencimiento: hoy, origenTipo: 'inscripcion', origenId: id });
    return { id, total: precio.total };
  });
  auditar(req, 'inscripcion', 'inscripciones', out.id, null, d);
  res.status(201).json(out);
});

r.post('/inscripciones/:id/baja', permiso('inscripciones', 'gestionar'), (req, res) => {
  const db = getDb();
  const i = db.prepare('SELECT * FROM inscripciones WHERE id = ?').get(req.params.id);
  if (!i) throw noEncontrado('Inscripción');
  db.prepare(`UPDATE inscripciones SET estado = 'baja', hasta = ? WHERE id = ?`).run(local().fecha, i.id);
  auditar(req, 'baja_inscripcion', 'inscripciones', i.id, { estado: i.estado }, { estado: 'baja', motivo: req.body?.motivo });
  res.json({ ok: true });
});

r.delete('/lista-espera/:id', permiso('inscripciones', 'gestionar'), (req, res) => {
  getDb().prepare('DELETE FROM lista_espera WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Tarifario: aranceles, descuentos y categorías ----------
r.get('/tarifario/todo', permiso('actividades', 'leer', 'leer_ambito'), (_req, res) => {
  const db = getDb();
  const hoy = local().fecha;
  res.json({
    aranceles: db.prepare(`SELECT ar.*, a.nombre AS actividad, (ar.vigente_desde <= ? AND (ar.vigente_hasta IS NULL OR ar.vigente_hasta >= ?)) AS vigente
      FROM aranceles ar JOIN actividades a ON a.id = ar.actividad_id ORDER BY a.nombre, ar.frecuencia`).all(hoy, hoy),
    descuentos: db.prepare('SELECT * FROM descuentos ORDER BY nombre').all(),
    categorias: db.prepare('SELECT * FROM categorias_socio').all().map((c) => ({ ...c, regla_cuota: json(c.regla_cuota) })),
    conceptos: db.prepare('SELECT * FROM conceptos').all(),
  });
});

r.post('/tarifario/aranceles', permiso('actividades', 'gestionar'), (req, res) => {
  const d = validar(z.object({ actividad_id: z.number().int(), frecuencia: z.number().int().min(0).max(7), descripcion: z.string().optional(),
    valor_socio: z.number().int().positive(), valor_no_socio: z.number().int().positive(), vigente_desde: z.string(), vigente_hasta: z.string().nullable().optional() }), req.body);
  const db = getDb();
  // Un nuevo valor cierra la vigencia del anterior para la misma frecuencia.
  db.prepare(`UPDATE aranceles SET vigente_hasta = date(?, '-1 day') WHERE actividad_id = ? AND frecuencia = ? AND (vigente_hasta IS NULL OR vigente_hasta >= ?) AND vigente_desde < ?`)
    .run(d.vigente_desde, d.actividad_id, d.frecuencia, d.vigente_desde, d.vigente_desde);
  const id = db.prepare('INSERT INTO aranceles (actividad_id, frecuencia, descripcion, valor_socio, valor_no_socio, vigente_desde, vigente_hasta) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(d.actividad_id, d.frecuencia, d.descripcion ?? null, d.valor_socio, d.valor_no_socio, d.vigente_desde, d.vigente_hasta ?? null).lastInsertRowid;
  auditar(req, 'nuevo_arancel', 'aranceles', id, null, d);
  res.status(201).json({ id });
});

r.post('/tarifario/descuentos', permiso('actividades', 'gestionar'), (req, res) => {
  const d = validar(z.object({ id: z.number().int().optional(), nombre: z.string().min(2), tipo: z.enum(['porcentaje', 'monto']), valor: z.number().int().positive(),
    condicion: z.enum(['jubilado', 'grupo_familiar', 'horario_promocional', 'manual']), solo_socios: z.boolean().default(true), activo: z.boolean().default(true) }), req.body);
  const db = getDb();
  const vals = [d.nombre, d.tipo, d.valor, d.condicion, d.solo_socios ? 1 : 0, d.activo ? 1 : 0];
  const id = d.id
    ? (db.prepare('UPDATE descuentos SET nombre = ?, tipo = ?, valor = ?, condicion = ?, solo_socios = ?, activo = ? WHERE id = ?').run(...vals, d.id), d.id)
    : db.prepare('INSERT INTO descuentos (nombre, tipo, valor, condicion, solo_socios, activo) VALUES (?, ?, ?, ?, ?, ?)').run(...vals).lastInsertRowid;
  auditar(req, 'guardar_descuento', 'descuentos', id, null, d);
  res.json({ id });
});

r.put('/tarifario/categorias/:id', permiso('actividades', 'gestionar'), (req, res) => {
  const d = validar(z.object({ valor: z.number().int().positive() }), req.body);
  const db = getDb();
  const c = db.prepare('SELECT * FROM categorias_socio WHERE id = ?').get(req.params.id);
  if (!c) throw noEncontrado('Categoría');
  const regla = { ...json(c.regla_cuota), valor: d.valor };
  db.prepare('UPDATE categorias_socio SET regla_cuota = ? WHERE id = ?').run(JSON.stringify(regla), c.id);
  auditar(req, 'cambiar_cuota', 'categorias_socio', c.id, json(c.regla_cuota), regla);
  res.json({ ok: true });
});

// ---------- Requisitos médicos por actividad ----------
r.put('/:id/requisitos', permiso('turnos_medicos', 'gestionar'), (req, res) => {
  const d = validar(z.array(z.object({ tipo_revision_id: z.number().int(), bloqueante: z.boolean(), dias_gracia: z.number().int().min(0).max(60) })), req.body);
  const db = getDb();
  enTransaccion(() => {
    db.prepare('DELETE FROM actividad_requisitos WHERE actividad_id = ?').run(req.params.id);
    for (const x of d) db.prepare('INSERT INTO actividad_requisitos VALUES (?, ?, ?, ?)').run(req.params.id, x.tipo_revision_id, x.bloqueante ? 1 : 0, x.dias_gracia);
  });
  auditar(req, 'requisitos_medicos', 'actividades', Number(req.params.id), null, d);
  res.json({ ok: true });
});

export default r;
