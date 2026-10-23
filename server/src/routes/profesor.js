// Portal del profesor: agenda, grupos, asistencia, calendario, comunicaciones y honorarios.
// Ve el estado de habilitación de sus alumnos, nunca montos ni datos clínicos.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { rol } from '../lib/rbac.js';
import { validar, invalido, prohibido, local, sumarDias, zId } from '../lib/util.js';
import { auditar } from '../lib/auditoria.js';
import { horariosDeGrupo } from '../services/catalogo.js';
import { estadoPorActividad, estadoApto } from '../services/habilitacion.js';

const r = Router();
r.use(requiereSesion, rol('profesor'));

const profesorId = (req) => {
  const id = getDb().prepare('SELECT id FROM profesores WHERE persona_id = ?').pluck().get(req.usuario.persona_id);
  if (!id) throw prohibido('Tu usuario no está vinculado a un profesor');
  return id;
};

function misGrupos(req) {
  return getDb().prepare(`SELECT g.*, a.nombre AS actividad, a.icono FROM grupos g JOIN actividades a ON a.id = g.actividad_id WHERE g.profesor_id = ? ORDER BY a.nombre, g.nombre`)
    .all(profesorId(req)).map((g) => ({ ...g, horarios: horariosDeGrupo(g.id) }));
}

function exigirGrupo(req, grupoId) {
  const g = misGrupos(req).find((x) => x.id === String(grupoId));
  if (!g) throw prohibido('Ese grupo no está a tu cargo');
  return g;
}

function alumnos(grupo) {
  const db = getDb();
  return db.prepare(`SELECT i.id AS inscripcion_id, i.estado, i.frecuencia_semanal, p.id AS persona_id, p.nombre, p.apellido, p.foto, p.fecha_nacimiento, s.nro_socio
    FROM inscripciones i JOIN personas p ON p.id = i.persona_id LEFT JOIN socios s ON s.persona_id = p.id
    WHERE i.grupo_id = ? AND i.estado IN ('activa','pendiente_apto','baja_solicitada') ORDER BY p.apellido, p.nombre`).all(grupo.id)
    .map((a) => {
      const hab = estadoPorActividad(a.persona_id).find((e) => e.actividad_id === grupo.actividad_id);
      const apto = estadoApto(a.persona_id, grupo.actividad_id);
      return {
        ...a,
        habilitado: hab?.habilitado ?? false,
        motivo: hab?.habilitado ? null : hab?.mensaje_operador,
        // Del apto solo el estado y el vencimiento (propuesta 4.1).
        apto: apto.requiere ? { estado: apto.estado, vence_en: apto.vence_en } : null,
        asistencias_mes: db.prepare(`SELECT COUNT(*) FROM asistencias WHERE inscripcion_id = ? AND presente = 1 AND fecha >= ?`).pluck().get(a.inscripcion_id, `${local().periodo}-01`),
      };
    });
}

r.get('/inicio', (req, res) => {
  const m = local();
  const grupos = misGrupos(req);
  const hoy = grupos.flatMap((g) => g.horarios.filter((h) => h.dia_semana === m.diaSemana).map((h) => ({ ...h, grupo_id: g.id, grupo: g.nombre, actividad: g.actividad, icono: g.icono })))
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
    .map((c) => ({
      ...c,
      en_curso: c.hora_inicio <= m.hora && m.hora <= c.hora_fin,
      alumnos: getDb().prepare(`SELECT COUNT(*) FROM inscripciones WHERE grupo_id = ? AND estado IN ('activa','pendiente_apto','baja_solicitada')`).pluck().get(c.grupo_id),
      presentes: getDb().prepare(`SELECT COUNT(*) FROM asistencias a JOIN inscripciones i ON i.id = a.inscripcion_id WHERE i.grupo_id = ? AND a.fecha = ? AND a.presente = 1`).pluck().get(c.grupo_id, m.fecha),
    }));
  res.json({
    hoy: m,
    clases: hoy,
    grupos: grupos.length,
    alumnos_total: grupos.reduce((s, g) => s + getDb().prepare(`SELECT COUNT(*) FROM inscripciones WHERE grupo_id = ? AND estado != 'baja'`).pluck().get(g.id), 0),
    avisos: getDb().prepare('SELECT * FROM notificaciones WHERE usuario_id = ? AND leida_en IS NULL ORDER BY id DESC LIMIT 5').all(req.usuario.id),
  });
});

r.get('/grupos', (req, res) => {
  res.json(misGrupos(req).map((g) => ({ ...g, alumnos: alumnos(g) })));
});

r.get('/asistencia', (req, res) => {
  const g = exigirGrupo(req, req.query.grupo_id);
  const fecha = String(req.query.fecha ?? local().fecha);
  const db = getDb();
  res.json({
    grupo: g,
    fecha,
    alumnos: alumnos(g).map((a) => ({ ...a, asistencia: db.prepare('SELECT presente, origen, justificacion FROM asistencias WHERE inscripcion_id = ? AND fecha = ?').get(a.inscripcion_id, fecha) ?? null })),
    historial: db.prepare(`SELECT a.fecha, SUM(a.presente) AS presentes FROM asistencias a JOIN inscripciones i ON i.id = a.inscripcion_id
      WHERE i.grupo_id = ? AND a.fecha >= ? GROUP BY a.fecha ORDER BY a.fecha DESC`).all(g.id, sumarDias(fecha, -30)),
  });
});

/** Correcciones manuales de asistencia, siempre justificadas. */
r.put('/asistencia', (req, res) => {
  const d = validar(z.object({ grupo_id: zId, fecha: z.string(), registros: z.array(z.object({ inscripcion_id: zId, presente: z.boolean(), justificacion: z.string().min(3) })) }), req.body);
  const g = exigirGrupo(req, d.grupo_id);
  if (d.fecha > local().fecha) throw invalido('No se registra asistencia a futuro');
  const db = getDb();
  for (const x of d.registros) {
    const ins = db.prepare('SELECT grupo_id FROM inscripciones WHERE id = ?').get(x.inscripcion_id);
    if (ins?.grupo_id !== g.id) throw prohibido('La inscripción no pertenece al grupo');
    db.prepare(`INSERT INTO asistencias (inscripcion_id, fecha, presente, origen, justificacion, registrado_por) VALUES (?, ?, ?, 'manual', ?, ?)
      ON CONFLICT (inscripcion_id, fecha) DO UPDATE SET presente = excluded.presente, origen = 'manual', justificacion = excluded.justificacion, registrado_por = excluded.registrado_por`)
      .run(x.inscripcion_id, d.fecha, x.presente ? 1 : 0, x.justificacion, req.usuario.id);
  }
  auditar(req, 'corregir_asistencia', 'grupos', g.id, null, { fecha: d.fecha, cantidad: d.registros.length });
  res.json({ ok: true });
});

r.get('/calendario', (req, res) => {
  const db = getDb();
  const grupos = misGrupos(req);
  const desde = new Date(`${local().fecha}T00:00:00-03:00`).toISOString();
  res.json({
    grupos,
    reservas: db.prepare(`SELECT r.*, e.nombre AS espacio FROM reservas r JOIN espacios e ON e.id = r.espacio_id WHERE r.tipo = 'clase' AND r.inicio >= ? AND r.estado = 'confirmada' ORDER BY r.inicio LIMIT 40`).all(desde),
    bloqueos: db.prepare(`SELECT b.*, e.nombre AS espacio FROM bloqueos_espacio b JOIN espacios e ON e.id = b.espacio_id WHERE b.hasta >= ? ORDER BY b.desde`).all(desde),
    espacios: db.prepare('SELECT id, nombre, reservable FROM espacios WHERE activo = 1 ORDER BY nombre').all(),
  });
});

r.get('/comunicaciones', (req, res) => {
  const db = getDb();
  const grupos = misGrupos(req);
  const enviados = db.prepare(`SELECT * FROM comunicados WHERE publicado_por = ? ORDER BY publicado_en DESC LIMIT 50`).all(req.usuario.id);
  res.json({ grupos: grupos.map((g) => ({ id: g.id, nombre: `${g.actividad} · ${g.nombre}` })), enviados });
});

r.post('/comunicaciones', (req, res) => {
  const d = validar(z.object({ grupo_id: zId, titulo: z.string().min(3).max(120), cuerpo: z.string().min(3).max(3000) }), req.body);
  exigirGrupo(req, d.grupo_id);
  const id = getDb().prepare(`INSERT INTO comunicados (titulo, cuerpo, audiencia, categoria, publicado_por, publicado_en) VALUES (?, ?, ?, 'actividad', ?, ?) RETURNING id`)
    .get(d.titulo, d.cuerpo, JSON.stringify({ tipo: 'grupo', id: d.grupo_id }), req.usuario.id, ahora()).id;
  // Notificación a los alumnos con usuario (o a sus tutores, en menores).
  const db = getDb();
  const personas = db.prepare(`SELECT persona_id FROM inscripciones WHERE grupo_id = ? AND estado != 'baja'`).pluck().all(d.grupo_id);
  const st = db.prepare('INSERT INTO notificaciones (usuario_id, tipo, titulo, referencia) VALUES (?, ?, ?, ?)');
  for (const p of personas) {
    const u = db.prepare('SELECT id FROM usuarios WHERE persona_id = ?').pluck().get(p)
      ?? db.prepare('SELECT u.id FROM tutores t JOIN usuarios u ON u.persona_id = t.tutor_persona_id WHERE t.menor_persona_id = ?').pluck().get(p);
    if (u) st.run(u, 'comunicado', d.titulo, '/socio/novedades');
  }
  res.status(201).json({ id });
});

r.get('/liquidacion', (req, res) => {
  const db = getDb();
  const id = profesorId(req);
  res.json({
    honorarios: db.prepare('SELECT * FROM honorarios WHERE profesor_id = ? ORDER BY periodo DESC').all(id),
    clases_mes: db.prepare(`SELECT COUNT(DISTINCT a.fecha || '-' || i.grupo_id) FROM asistencias a JOIN inscripciones i ON i.id = a.inscripcion_id JOIN grupos g ON g.id = i.grupo_id
      WHERE g.profesor_id = ? AND a.fecha >= ?`).pluck().get(id, `${local().periodo}-01`),
  });
});

export default r;
