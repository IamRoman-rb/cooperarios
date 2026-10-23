// Motor de habilitación (propuesta 6.2 y 6.3). Evalúa, en orden, las reglas de cada lectura.
// Al socio se le da un mensaje accionable; al profesor y a la portería, solo un motivo genérico.
import { getDb } from '../db/index.js';
import { local, aMinutos, sumarDias } from '../lib/util.js';

export const MOTIVOS = {
  codigo_invalido: { operador: 'Código inválido, reintentar', socio: 'El código venció o ya se usó. Mostrá el QR actualizado de tu credencial.' },
  baja_suspension: { operador: 'No habilitado, consultar administración', socio: 'Tu condición de socio no está activa. Acercate a Administración.' },
  sin_inscripcion: { operador: 'Sin inscripción en este horario', socio: 'No tenés una inscripción en este horario. Revisá Mis actividades.' },
  cuota_social: { operador: 'Pago pendiente', socio: 'Regularizá tu cuota social en Mis pagos.' },
  arancel: { operador: 'Pago pendiente', socio: 'Regularizá el arancel de la actividad en Mis pagos.' },
  apto_medico: { operador: 'Revisión médica pendiente o vencida', socio: 'Necesitás la revisión médica vigente. Pedí turno en Revisión médica.' },
  bloqueo_cupo: { operador: 'No habilitado, consultar administración', socio: 'Tu acceso a esta actividad está bloqueado. Consultá en Administración.' },
};

const RESULTADOS_APTOS = ['apto', 'apto_restricciones'];

export function reglaDe(actividadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM reglas_habilitacion WHERE actividad_id = ?').get(actividadId)
    ?? db.prepare('SELECT * FROM reglas_habilitacion WHERE actividad_id IS NULL').get()
    ?? { gracia_cuota_dias: 10, gracia_arancel_dias: 5, ventana_antes_min: 15, ventana_despues_min: 0 };
}

function excepcionVigente(personaId, actividadId, hoy) {
  return getDb().prepare(`
    SELECT * FROM habilitaciones_manuales
    WHERE persona_id = ? AND (actividad_id = ? OR actividad_id IS NULL) AND tipo = 'excepcion'
      AND estado = 'aprobada' AND desde <= ? AND hasta >= ? LIMIT 1`).get(personaId, actividadId, hoy, hoy);
}

function bloqueoVigente(personaId, actividadId, hoy) {
  return getDb().prepare(`
    SELECT * FROM habilitaciones_manuales
    WHERE persona_id = ? AND (actividad_id = ? OR actividad_id IS NULL) AND tipo = 'bloqueo'
      AND estado = 'aprobada' AND desde <= ? AND hasta >= ? LIMIT 1`).get(personaId, actividadId, hoy, hoy);
}

/** ¿Tiene cargos impagos vencidos más allá de la gracia? */
function deudaVencida(personaId, { concepto, inscripcionId }, graciaDias, hoy) {
  const limite = sumarDias(hoy, -graciaDias);
  const filtro = inscripcionId ? `c.origen_tipo = 'inscripcion' AND c.origen_id = ?` : 'co.tipo = ?';
  return !!getDb().prepare(`
    SELECT 1 FROM cargos c JOIN conceptos co ON co.id = c.concepto_id
    WHERE c.persona_id = ? AND c.estado IN ('pendiente','parcial') AND c.vencimiento < ? AND ${filtro} LIMIT 1`)
    .get(personaId, limite, inscripcionId ?? concepto);
}

/** Estado del apto para una actividad: {requiere, vigente, bloqueante, estado, vence_en}. */
export function estadoApto(personaId, actividadId, hoy = local().fecha) {
  const db = getDb();
  const requisitos = db.prepare('SELECT * FROM actividad_requisitos WHERE actividad_id = ?').all(actividadId);
  if (!requisitos.length) return { requiere: false, vigente: true, estado: 'no_requiere' };
  let peor = { requiere: true, vigente: true, bloqueante: false, estado: 'apto', vence_en: null };
  for (const req of requisitos) {
    const rev = db.prepare(`
      SELECT * FROM revisiones_medicas
      WHERE persona_id = ? AND tipo_revision_id = ? AND firmada_en IS NOT NULL
        AND resultado NOT IN ('rechazado','pendiente_validacion')
      ORDER BY fecha DESC, id DESC LIMIT 1`).get(personaId, req.tipo_revision_id);
    let estado = 'pendiente';
    let vigente = false;
    if (rev) {
      if (rev.resultado === 'no_apto') estado = 'no_apto';
      else if (rev.resultado === 'postergado') estado = 'postergado';
      else if (RESULTADOS_APTOS.includes(rev.resultado)) {
        const conGracia = sumarDias(rev.vence_en, req.dias_gracia);
        if (rev.vence_en >= hoy) { estado = rev.resultado; vigente = true; }
        else if (conGracia >= hoy) { estado = 'en_gracia'; vigente = true; }
        else estado = 'vencido';
      }
    }
    if (!vigente || !peor.vigente) {
      peor = { requiere: true, vigente: vigente && peor.vigente, bloqueante: !!req.bloqueante, estado, vence_en: rev?.vence_en ?? null };
    } else if (rev?.vence_en && (!peor.vence_en || rev.vence_en < peor.vence_en)) {
      peor = { ...peor, estado, vence_en: rev.vence_en, bloqueante: !!req.bloqueante };
    }
  }
  return peor;
}

/** Inscripción de la persona en la actividad cuyo horario abarca el momento (con la ventana configurable). */
function inscripcionEnHorario(personaId, actividadId, regla, momento, grupoId) {
  const db = getDb();
  const ahoraMin = momento.minutos;
  const candidatas = db.prepare(`
    SELECT i.*, h.hora_inicio, h.hora_fin, g.cupo, g.id AS gid
    FROM inscripciones i
    JOIN grupos g ON g.id = i.grupo_id
    JOIN horarios h ON h.grupo_id = g.id
    WHERE i.persona_id = ? AND g.actividad_id = ? AND h.dia_semana = ?
      AND i.estado IN ('activa','pendiente_apto','baja_solicitada')
      AND i.desde <= ? AND (i.hasta IS NULL OR i.hasta >= ?)
      ${grupoId ? 'AND g.id = ?' : ''}`)
    .all(...[personaId, actividadId, momento.diaSemana, momento.fecha, momento.fecha, ...(grupoId ? [grupoId] : [])]);
  return candidatas.find((c) =>
    ahoraMin >= aMinutos(c.hora_inicio) - regla.ventana_antes_min &&
    ahoraMin <= aMinutos(c.hora_fin) + regla.ventana_despues_min) ?? null;
}

/**
 * Evalúa si la persona puede ingresar a la actividad ahora.
 * Devuelve {habilitado, motivo, mensaje_operador, mensaje_socio, inscripcion_id, grupo_id, excepcion}.
 */
export function evaluar({ personaId, actividadId, grupoId = null, fecha = new Date(), exigirHorario = true }) {
  const db = getDb();
  const momento = local(fecha);
  const hoy = momento.fecha;
  const negar = (motivo, extra = {}) => ({
    habilitado: false, motivo, mensaje_operador: MOTIVOS[motivo].operador, mensaje_socio: MOTIVOS[motivo].socio, ...extra,
  });

  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(personaId);
  if (!persona) return negar('codigo_invalido');
  const socio = db.prepare('SELECT * FROM socios WHERE persona_id = ?').get(personaId);
  if (persona.estado !== 'activa' || (socio && ['suspendido', 'baja'].includes(socio.estado))) return negar('baja_suspension');

  const regla = reglaDe(actividadId);
  let inscripcion = null;
  if (exigirHorario) {
    inscripcion = inscripcionEnHorario(personaId, actividadId, regla, momento, grupoId);
    if (!inscripcion) return negar('sin_inscripcion');
  } else {
    inscripcion = db.prepare(`SELECT i.*, g.id AS gid FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id
      WHERE i.persona_id = ? AND g.actividad_id = ? AND i.estado IN ('activa','pendiente_apto','baja_solicitada') LIMIT 1`)
      .get(personaId, actividadId);
    if (!inscripcion) return negar('sin_inscripcion');
  }
  const ctx = { inscripcion_id: inscripcion.id, grupo_id: inscripcion.gid };
  const excepcion = excepcionVigente(personaId, actividadId, hoy);

  if (socio && !excepcion && deudaVencida(personaId, { concepto: 'cuota_social' }, regla.gracia_cuota_dias, hoy)) {
    return negar('cuota_social', ctx);
  }
  if (!excepcion && deudaVencida(personaId, { inscripcionId: inscripcion.id }, regla.gracia_arancel_dias, hoy)) {
    return negar('arancel', ctx);
  }
  const apto = estadoApto(personaId, actividadId, hoy);
  if (apto.requiere && !apto.vigente && apto.bloqueante && !excepcion) return negar('apto_medico', ctx);

  if (bloqueoVigente(personaId, actividadId, hoy)) return negar('bloqueo_cupo', ctx);
  const ocupacion = db.prepare(`SELECT COUNT(*) AS n, (SELECT cupo FROM grupos WHERE id = ?) AS cupo
    FROM inscripciones WHERE grupo_id = ? AND estado IN ('activa','pendiente_apto','baja_solicitada') AND id <= ?`)
    .get(inscripcion.gid, inscripcion.gid, inscripcion.id);
  if (ocupacion.n > ocupacion.cupo) return negar('bloqueo_cupo', ctx);

  return {
    habilitado: true,
    motivo: null,
    mensaje_operador: 'Habilitado',
    mensaje_socio: '¡Bienvenido/a! Ingreso registrado.',
    apto,
    excepcion: excepcion ? { id: excepcion.id, motivo: excepcion.motivo, hasta: excepcion.hasta } : null,
    ...ctx,
  };
}

/** Estado de habilitación por cada actividad de la persona (para panel, credencial y profesor). */
export function estadoPorActividad(personaId) {
  const db = getDb();
  const actividades = db.prepare(`
    SELECT DISTINCT a.id, a.nombre FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id
    JOIN actividades a ON a.id = g.actividad_id
    WHERE i.persona_id = ? AND i.estado IN ('activa','pendiente_apto','baja_solicitada')`).all(personaId);
  return actividades.map((a) => {
    const r = evaluar({ personaId, actividadId: a.id, exigirHorario: false });
    return {
      actividad_id: a.id,
      actividad: a.nombre,
      habilitado: r.habilitado,
      motivo: r.motivo,
      mensaje: r.habilitado ? 'Habilitado' : r.mensaje_socio,
      mensaje_operador: r.mensaje_operador,
      apto: estadoApto(personaId, a.id),
    };
  });
}

/** Registra el fichaje y, si corresponde, la asistencia automática del día. */
export function registrarAcceso({ personaId, puntoAccesoId = null, actividadId, resultado, metodo, usuarioId = null }) {
  const db = getDb();
  db.prepare(`INSERT INTO accesos (persona_id, punto_acceso_id, actividad_id, grupo_id, fecha_hora, resultado, motivo_codigo, metodo, registrado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    personaId, puntoAccesoId, actividadId, resultado.grupo_id ?? null, new Date().toISOString(),
    resultado.habilitado ? 'habilitado' : 'denegado', resultado.motivo, metodo, usuarioId,
  );
  if (resultado.habilitado && resultado.inscripcion_id) {
    db.prepare(`INSERT INTO asistencias (inscripcion_id, fecha, presente, origen, registrado_por)
      VALUES (?, ?, 1, 'qr', ?) ON CONFLICT (inscripcion_id, fecha) DO UPDATE SET presente = 1`)
      .run(resultado.inscripcion_id, local().fecha, usuarioId);
  }
}
