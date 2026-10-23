import { getDb } from '../db/index.js';
import { local } from '../lib/util.js';
import { vacantes } from './precios.js';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function horariosDeGrupo(grupoId) {
  return getDb().prepare(`SELECT h.*, e.nombre AS espacio FROM horarios h LEFT JOIN espacios e ON e.id = h.espacio_id
    WHERE h.grupo_id = ? ORDER BY h.dia_semana, h.hora_inicio`).all(grupoId)
    .map((h) => ({ ...h, dia: DIAS[h.dia_semana] }));
}

export function gruposDeActividad(actividadId) {
  return getDb().prepare(`SELECT g.*, p.nombre || ' ' || p.apellido AS profesor FROM grupos g
    LEFT JOIN profesores pr ON pr.id = g.profesor_id LEFT JOIN personas p ON p.id = pr.persona_id
    WHERE g.actividad_id = ? ORDER BY g.nombre`).all(actividadId)
    .map((g) => ({ ...g, horarios: horariosDeGrupo(g.id), ...vacantes(g.id) }));
}

export function requisitosDe(actividadId) {
  return getDb().prepare(`SELECT ar.*, tr.nombre, tr.vigencia_meses, tr.importe FROM actividad_requisitos ar
    JOIN tipos_revision tr ON tr.id = ar.tipo_revision_id WHERE ar.actividad_id = ?`).all(actividadId);
}

export function arancelesDe(actividadId) {
  const hoy = local().fecha;
  return getDb().prepare(`SELECT * FROM aranceles WHERE actividad_id = ? AND vigente_desde <= ? AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
    ORDER BY frecuencia`).all(actividadId, hoy, hoy);
}

/** Catálogo con filtros por edad, tipo y texto. */
export function catalogo({ tipo, edad, q } = {}) {
  const db = getDb();
  let actividades = db.prepare(`SELECT a.*, s.nombre AS subcomision FROM actividades a LEFT JOIN subcomisiones s ON s.id = a.subcomision_id
    WHERE a.activa = 1 ORDER BY a.nombre`).all();
  if (tipo) actividades = actividades.filter((a) => a.tipo === tipo);
  if (q) actividades = actividades.filter((a) => `${a.nombre} ${a.descripcion}`.toLowerCase().includes(String(q).toLowerCase()));
  return actividades.map((a) => {
    let grupos = gruposDeActividad(a.id);
    if (edad != null && edad !== '') grupos = grupos.filter((g) => (g.edad_min ?? 0) <= Number(edad) && Number(edad) <= (g.edad_max ?? 120));
    const aranceles = arancelesDe(a.id);
    return {
      ...a,
      grupos,
      aranceles,
      requisitos: requisitosDe(a.id),
      desde_socio: aranceles.length ? Math.min(...aranceles.map((x) => x.valor_socio)) : null,
      desde_no_socio: aranceles.length ? Math.min(...aranceles.map((x) => x.valor_no_socio)) : null,
      vacantes_total: grupos.reduce((s, g) => s + g.vacantes, 0),
    };
  }).filter((a) => edad == null || edad === '' || a.grupos.length);
}

export function detalleActividad(id) {
  const db = getDb();
  const a = db.prepare(`SELECT a.*, s.nombre AS subcomision FROM actividades a LEFT JOIN subcomisiones s ON s.id = a.subcomision_id WHERE a.id = ?`).get(id);
  if (!a) return null;
  return { ...a, grupos: gruposDeActividad(id), aranceles: arancelesDe(id), requisitos: requisitosDe(id),
    descuentos: db.prepare('SELECT id, nombre, tipo, valor, condicion, solo_socios FROM descuentos WHERE activo = 1').all() };
}

/** Comunicados visibles para una persona según su audiencia (todos, actividad, grupo, categoría). */
export function comunicadosPara(personaId, { limite = 30 } = {}) {
  const db = getDb();
  const grupos = db.prepare(`SELECT grupo_id FROM inscripciones WHERE persona_id = ? AND estado != 'baja'`).pluck().all(personaId);
  const actividades = db.prepare(`SELECT DISTINCT g.actividad_id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE i.persona_id = ? AND i.estado != 'baja'`).pluck().all(personaId);
  const categoria = db.prepare('SELECT categoria_id FROM socios WHERE persona_id = ?').pluck().get(personaId);
  return db.prepare(`SELECT c.*, p.nombre || ' ' || p.apellido AS autor FROM comunicados c
    LEFT JOIN usuarios u ON u.id = c.publicado_por LEFT JOIN personas p ON p.id = u.persona_id ORDER BY c.publicado_en DESC LIMIT 200`).all()
    .filter((c) => {
      const a = JSON.parse(c.audiencia);
      return a.tipo === 'todos' || (a.tipo === 'grupo' && grupos.includes(a.id)) || (a.tipo === 'actividad' && actividades.includes(a.id)) || (a.tipo === 'categoria' && a.id === categoria);
    }).slice(0, limite);
}
