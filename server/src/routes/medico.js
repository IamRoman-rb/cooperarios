// Revisión médica: médico/a revisor/a (registra y firma) y auxiliar (turnos, recepción, certificados, recordatorios).
// El auxiliar no ve ni carga resultados.
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso, puede } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, local, edad, sumarDias, zId } from '../lib/util.js';
import { auditar, notificar, usuarioDePersona } from '../lib/auditoria.js';
import { firmarRevision, validarCertificado, vencimientos } from '../services/medico.js';
import { subida, rutaRelativa } from '../services/archivos.js';

const r = Router();
r.use(requiereSesion);

const verResultados = (req) => puede(req.usuario, 'resultados_medicos', 'gestionar', 'leer');

function turnosDelDia(fecha) {
  const desde = new Date(`${fecha}T00:00:00-03:00`).toISOString();
  const hasta = new Date(`${fecha}T23:59:59-03:00`).toISOString();
  return getDb().prepare(`SELECT t.*, p.nombre, p.apellido, p.dni, p.fecha_nacimiento, s.nro_socio, tr.nombre AS tipo FROM turnos_revision t
    JOIN personas p ON p.id = t.persona_id LEFT JOIN socios s ON s.persona_id = p.id JOIN tipos_revision tr ON tr.id = t.tipo_revision_id
    WHERE t.inicio BETWEEN ? AND ? ORDER BY t.inicio`).all(desde, hasta).map((t) => ({ ...t, edad: edad(t.fecha_nacimiento) }));
}

r.get('/agenda', permiso('turnos_medicos', 'gestionar', 'leer'), (req, res) => {
  const fecha = String(req.query.fecha ?? local().fecha);
  const db = getDb();
  res.json({
    fecha,
    turnos: turnosDelDia(fecha),
    solicitados: db.prepare(`SELECT t.*, p.nombre, p.apellido, tr.nombre AS tipo FROM turnos_revision t JOIN personas p ON p.id = t.persona_id
      JOIN tipos_revision tr ON tr.id = t.tipo_revision_id WHERE t.estado = 'solicitado' ORDER BY t.inicio`).all(),
    certificados_pendientes: db.prepare(`SELECT COUNT(*) FROM revisiones_medicas WHERE resultado = 'pendiente_validacion'`).pluck().get(),
    por_vencer: vencimientos(30).filter((v) => v.situacion === 'por_vencer').length,
    tipos: db.prepare('SELECT * FROM tipos_revision').all(),
  });
});

r.post('/turnos', permiso('turnos_medicos', 'gestionar'), (req, res) => {
  const d = validar(z.object({ persona_id: zId, tipo_revision_id: zId, inicio: z.string() }), req.body);
  const prof = getDb().prepare('SELECT id FROM profesionales_salud WHERE activo = 1 LIMIT 1').pluck().get();
  const id = getDb().prepare(`INSERT INTO turnos_revision (persona_id, tipo_revision_id, profesional_id, inicio, estado) VALUES (?, ?, ?, ?, 'confirmado') RETURNING id`)
    .get(d.persona_id, d.tipo_revision_id, prof, new Date(d.inicio).toISOString()).id;
  const u = usuarioDePersona(d.persona_id);
  if (u) notificar({ usuarioId: u, tipo: 'turno', titulo: `Turno de revisión médica confirmado`, referencia: '/socio/revision-medica' });
  res.status(201).json({ id });
});

/** Recepción y reprogramación (auxiliar). */
r.put('/turnos/:id', permiso('turnos_medicos', 'gestionar'), (req, res) => {
  const d = validar(z.object({ estado: z.enum(['confirmado', 'presente', 'ausente', 'cancelado', 'reprogramado']), inicio: z.string().optional() }), req.body);
  const db = getDb();
  const t = db.prepare('SELECT * FROM turnos_revision WHERE id = ?').get(req.params.id);
  if (!t) throw noEncontrado('Turno');
  if (d.estado === 'reprogramado') {
    if (!d.inicio) throw invalido('Indicá el nuevo horario');
    db.prepare(`UPDATE turnos_revision SET estado = 'confirmado', inicio = ? WHERE id = ?`).run(new Date(d.inicio).toISOString(), t.id);
  } else db.prepare('UPDATE turnos_revision SET estado = ? WHERE id = ?').run(d.estado, t.id);
  const u = usuarioDePersona(t.persona_id);
  if (u && ['confirmado', 'reprogramado', 'cancelado'].includes(d.estado)) notificar({ usuarioId: u, tipo: 'turno', titulo: `Tu turno de revisión fue ${d.estado}`, referencia: '/socio/revision-medica' });
  res.json({ ok: true });
});

r.get('/buscar', permiso('turnos_medicos', 'gestionar', 'leer'), (req, res) => {
  const q = `%${req.query.q ?? ''}%`;
  res.json(getDb().prepare(`SELECT p.id, p.nombre, p.apellido, p.dni, p.fecha_nacimiento, s.nro_socio FROM personas p LEFT JOIN socios s ON s.persona_id = p.id
    WHERE p.apellido || ' ' || p.nombre LIKE ? OR p.dni LIKE ? OR CAST(s.nro_socio AS TEXT) LIKE ? ORDER BY p.apellido LIMIT 15`).all(q, q, q)
    .map((p) => ({ ...p, edad: edad(p.fecha_nacimiento) })));
});

/** Ficha para la revisión: actividades que la exigen, consentimiento y últimas constancias. */
r.get('/personas/:id', permiso('resultados_medicos', 'gestionar'), (req, res) => {
  const db = getDb();
  const id = req.params.id;
  const p = db.prepare(`SELECT p.id, p.nombre, p.apellido, p.dni, p.fecha_nacimiento, p.foto, s.nro_socio FROM personas p LEFT JOIN socios s ON s.persona_id = p.id WHERE p.id = ?`).get(id);
  if (!p) throw noEncontrado('Persona');
  res.json({
    ...p,
    edad: edad(p.fecha_nacimiento),
    consentimiento_salud: db.prepare(`SELECT * FROM consentimientos WHERE persona_id = ? AND tipo = 'datos_salud' AND revocado_en IS NULL ORDER BY id DESC LIMIT 1`).get(id) ?? null,
    actividades: db.prepare(`SELECT DISTINCT a.nombre, tr.id AS tipo_revision_id, tr.nombre AS tipo FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id
      JOIN actividad_requisitos ar ON ar.actividad_id = a.id JOIN tipos_revision tr ON tr.id = ar.tipo_revision_id WHERE i.persona_id = ? AND i.estado != 'baja'`).all(id),
    revisiones: historial(id),
  });
});

function historial(personaId) {
  return getDb().prepare(`SELECT r.*, tr.nombre AS tipo, ps.matricula, pp.nombre || ' ' || pp.apellido AS profesional FROM revisiones_medicas r
    JOIN tipos_revision tr ON tr.id = r.tipo_revision_id LEFT JOIN profesionales_salud ps ON ps.id = r.profesional_id
    LEFT JOIN usuarios u ON u.id = ps.usuario_id LEFT JOIN personas pp ON pp.id = u.persona_id
    WHERE r.persona_id = ? ORDER BY r.fecha DESC, r.id DESC`).all(personaId);
}

r.post('/revisiones', permiso('resultados_medicos', 'gestionar'), (req, res) => {
  const d = validar(z.object({ persona_id: zId, tipo_revision_id: zId, resultado: z.enum(['apto', 'apto_restricciones', 'no_apto', 'postergado']),
    restricciones: z.string().max(200).nullable().optional(), vence_en: z.string().nullable().optional(), turno_id: zId.nullable().optional(),
    reemplaza_id: zId.nullable().optional() }), req.body);
  if (d.resultado === 'apto_restricciones' && !d.restricciones) throw invalido('Codificá las restricciones');
  const id = firmarRevision({ personaId: d.persona_id, tipoRevisionId: d.tipo_revision_id, resultado: d.resultado, restricciones: d.restricciones, venceEn: d.vence_en, turnoId: d.turno_id, reemplazaId: d.reemplaza_id }, req.usuario);
  auditar(req, 'firmar_revision', 'revisiones_medicas', id, null, { persona_id: d.persona_id, resultado: d.resultado, vence_en: d.vence_en, reemplaza_id: d.reemplaza_id });
  res.status(201).json({ id });
});

r.get('/pendientes', permiso('resultados_medicos', 'gestionar', 'leer'), (req, res) => {
  const lista = vencimientos(Number(req.query.dias ?? 30));
  const grupos = {};
  for (const v of lista) (grupos[v.actividad] ??= []).push(v);
  res.json(Object.entries(grupos).map(([actividad, personas]) => ({ actividad, personas })));
});

r.get('/certificados', permiso('resultados_medicos', 'gestionar', 'solicitar'), (req, res) => {
  const db = getDb();
  const estado = req.query.estado ?? 'pendiente_validacion';
  res.json(db.prepare(`SELECT r.id, r.persona_id, r.fecha, r.resultado, r.certificado_externo, r.vence_en, r.firmada_en, tr.nombre AS tipo, p.nombre, p.apellido, s.nro_socio,
      (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = r.cargado_por) AS cargado
    FROM revisiones_medicas r JOIN tipos_revision tr ON tr.id = r.tipo_revision_id JOIN personas p ON p.id = r.persona_id LEFT JOIN socios s ON s.persona_id = p.id
    WHERE r.certificado_externo IS NOT NULL AND (? = 'todos' OR r.resultado = ?) ORDER BY r.id DESC LIMIT 100`).all(estado, estado)
    // El auxiliar ve el estado de la carga, no el resultado.
    .map((c) => (verResultados(req) ? c : { ...c, resultado: c.resultado === 'pendiente_validacion' ? 'pendiente_validacion' : 'validado', vence_en: undefined })));
});

/** Carga de certificado escaneado por el auxiliar, para validación del médico. */
r.post('/certificados', permiso('resultados_medicos', 'solicitar', 'gestionar'), subida('certificados', { maxMb: 6, campos: 1 }).single('certificado'), (req, res) => {
  const d = validar(z.object({ persona_id: zId, tipo_revision_id: zId }), req.body);
  if (!req.file) throw invalido('Adjuntá el certificado escaneado');
  const id = getDb().prepare(`INSERT INTO revisiones_medicas (persona_id, tipo_revision_id, fecha, resultado, certificado_externo, cargado_por) VALUES (?, ?, ?, 'pendiente_validacion', ?, ?) RETURNING id`)
    .get(d.persona_id, d.tipo_revision_id, local().fecha, rutaRelativa('certificados', req.file), req.usuario.id).id;
  notificar({ rol: 'medico', tipo: 'revision_medica', titulo: 'Certificado externo cargado para validar', referencia: '/medico/certificados' });
  res.status(201).json({ id });
});

r.post('/certificados/:id/validar', permiso('resultados_medicos', 'gestionar'), (req, res) => {
  const d = validar(z.object({ aprobar: z.boolean(), resultado: z.enum(['apto', 'apto_restricciones']).default('apto'), restricciones: z.string().nullable().optional(),
    vence_en: z.string().optional(), motivo: z.string().optional() }), req.body);
  if (!d.aprobar && !d.motivo) throw invalido('Indicá el motivo del rechazo');
  validarCertificado(req.params.id, { aprobar: d.aprobar, resultado: d.resultado, restricciones: d.restricciones, venceEn: d.vence_en, motivo: d.motivo }, req.usuario);
  auditar(req, d.aprobar ? 'validar_certificado' : 'rechazar_certificado', 'revisiones_medicas', req.params.id, null, { resultado: d.resultado, vence_en: d.vence_en });
  res.json({ ok: true });
});

r.get('/historial/:personaId', permiso('resultados_medicos', 'gestionar'), (req, res) => {
  const p = getDb().prepare('SELECT id, nombre, apellido, dni, fecha_nacimiento FROM personas WHERE id = ?').get(req.params.personaId);
  if (!p) throw noEncontrado('Persona');
  res.json({ persona: p, revisiones: historial(p.id) });
});

/** Recordatorios de vencimiento y de turno por actividad (auxiliar). */
r.get('/recordatorios', permiso('turnos_medicos', 'gestionar'), (_req, res) => {
  const db = getDb();
  const manana = sumarDias(local().fecha, 1);
  res.json({
    vencimientos: vencimientos(30).map((v) => ({ actividad: v.actividad, persona_id: v.persona_id, nombre: `${v.apellido}, ${v.nombre}`, vence_en: v.vence_en, situacion: v.situacion })),
    turnos_manana: turnosDelDia(manana),
    enviados: db.prepare(`SELECT titulo, COUNT(*) AS n, MAX(creada_en) AS ultimo FROM notificaciones WHERE tipo IN ('revision_medica','turno') GROUP BY titulo ORDER BY ultimo DESC LIMIT 10`).all(),
  });
});

r.post('/recordatorios', permiso('turnos_medicos', 'gestionar'), (req, res) => {
  const d = validar(z.object({ persona_ids: z.array(zId).min(1), mensaje: z.string().min(5).max(200) }), req.body);
  let enviados = 0;
  for (const id of d.persona_ids) {
    const u = usuarioDePersona(id) ?? getDb().prepare('SELECT u.id FROM tutores t JOIN usuarios u ON u.persona_id = t.tutor_persona_id WHERE t.menor_persona_id = ?').pluck().get(id);
    if (u) { notificar({ usuarioId: u, tipo: 'revision_medica', titulo: d.mensaje, referencia: '/socio/revision-medica' }); enviados++; }
  }
  res.json({ enviados });
});

export default r;
