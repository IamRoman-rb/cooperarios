// Revisión médica (propuesta 6.2). Solo se guarda la constancia de aptitud: resultado,
// restricciones codificadas y vigencia. Un resultado firmado no se edita.
import { getDb, ahora } from '../db/index.js';
import { invalido, noEncontrado, local, sumarMeses } from '../lib/util.js';
import { crearCargo } from './cuenta.js';
import { notificar, usuarioDePersona } from '../lib/auditoria.js';
import { edad } from '../lib/util.js';

export const RESULTADOS = ['apto', 'apto_restricciones', 'no_apto', 'postergado'];

function profesionalDe(usuarioId) {
  const p = getDb().prepare('SELECT * FROM profesionales_salud WHERE usuario_id = ? AND activo = 1').get(usuarioId);
  if (!p) throw invalido('Tu usuario no está registrado como profesional de la salud');
  return p;
}

/** En menores, exige el consentimiento del tutor para datos de salud. */
function consentimientoSalud(personaId) {
  const db = getDb();
  const persona = db.prepare('SELECT fecha_nacimiento FROM personas WHERE id = ?').get(personaId);
  const c = db.prepare(`SELECT * FROM consentimientos WHERE persona_id = ? AND tipo = 'datos_salud' AND revocado_en IS NULL ORDER BY id DESC LIMIT 1`).get(personaId);
  const menor = (edad(persona?.fecha_nacimiento) ?? 18) < 18;
  if (menor && !c?.aceptado_por_tutor_id) throw invalido('Falta el consentimiento del tutor para la revisión de un menor');
  return c?.id ?? null;
}

/** Recalcula inscripciones "pendiente de apto" de la persona luego de un resultado. */
export function recalcularInscripciones(personaId) {
  const db = getDb();
  const hoy = local().fecha;
  const pendientes = db.prepare(`SELECT i.id, g.actividad_id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id
    WHERE i.persona_id = ? AND i.estado = 'pendiente_apto'`).all(personaId);
  for (const ins of pendientes) {
    const requisitos = db.prepare('SELECT tipo_revision_id FROM actividad_requisitos WHERE actividad_id = ?').pluck().all(ins.actividad_id);
    const cumple = requisitos.every((tipo) => db.prepare(`SELECT 1 FROM revisiones_medicas WHERE persona_id = ? AND tipo_revision_id = ?
      AND firmada_en IS NOT NULL AND resultado IN ('apto','apto_restricciones') AND vence_en >= ?`).get(personaId, tipo, hoy));
    if (cumple) db.prepare(`UPDATE inscripciones SET estado = 'activa' WHERE id = ?`).run(ins.id);
  }
}

/** El médico registra y firma una revisión. Si corrige una anterior, queda enlazada en el historial. */
export function firmarRevision({ personaId, tipoRevisionId, resultado, restricciones = null, venceEn = null, turnoId = null, reemplazaId = null }, usuario) {
  const db = getDb();
  if (!RESULTADOS.includes(resultado)) throw invalido('Resultado inválido');
  const prof = profesionalDe(usuario.id);
  const tipo = db.prepare('SELECT * FROM tipos_revision WHERE id = ?').get(tipoRevisionId);
  if (!tipo) throw noEncontrado('Tipo de revisión');
  const consentimientoId = consentimientoSalud(personaId);
  const hoy = local().fecha;
  const vence = ['apto', 'apto_restricciones'].includes(resultado) ? (venceEn ?? sumarMeses(hoy, tipo.vigencia_meses)) : null;
  const id = db.prepare(`INSERT INTO revisiones_medicas
    (persona_id, tipo_revision_id, profesional_id, fecha, resultado, restricciones, vence_en, cargado_por, validada_por, firmada_en, reemplaza_id, consentimiento_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    personaId, tipoRevisionId, prof.id, hoy, resultado, restricciones, vence, usuario.id, usuario.id, ahora(), reemplazaId, consentimientoId,
  ).lastInsertRowid;
  if (turnoId) db.prepare(`UPDATE turnos_revision SET estado = 'atendido' WHERE id = ?`).run(turnoId);
  if (tipo.importe > 0 && !reemplazaId) {
    crearCargo({ personaId, conceptoTipo: 'revision_medica', descripcion: `Revisión médica: ${tipo.nombre}`, periodo: hoy.slice(0, 7),
      importe: tipo.importe, vencimiento: hoy, origenTipo: 'revision', origenId: id });
  }
  recalcularInscripciones(personaId);
  avisarResultado(personaId, resultado, vence);
  return id;
}

/** Validación de un certificado externo subido por el socio o el auxiliar. */
export function validarCertificado(revisionId, { aprobar, resultado = 'apto', restricciones = null, venceEn, motivo }, usuario) {
  const db = getDb();
  const prof = profesionalDe(usuario.id);
  const rev = db.prepare('SELECT * FROM revisiones_medicas WHERE id = ?').get(revisionId);
  if (!rev) throw noEncontrado('Certificado');
  if (rev.resultado !== 'pendiente_validacion') throw invalido('El certificado ya fue validado');
  if (aprobar && !venceEn) throw invalido('Indicá la fecha de vencimiento del apto');
  db.prepare(`UPDATE revisiones_medicas SET resultado = ?, restricciones = ?, vence_en = ?, profesional_id = ?, validada_por = ?, firmada_en = ?
    WHERE id = ?`).run(aprobar ? resultado : 'rechazado', aprobar ? restricciones : motivo ?? null, aprobar ? venceEn : null, prof.id, usuario.id, ahora(), revisionId);
  recalcularInscripciones(rev.persona_id);
  avisarResultado(rev.persona_id, aprobar ? resultado : 'rechazado', venceEn);
}

function avisarResultado(personaId, resultado, vence) {
  const usuarioId = usuarioDePersona(personaId);
  if (!usuarioId) return;
  const textos = {
    apto: `Revisión médica: apto hasta ${vence}`,
    apto_restricciones: `Revisión médica: apto con restricciones hasta ${vence}`,
    no_apto: 'Revisión médica: no apto. Consultá con el médico del club.',
    postergado: 'Revisión médica postergada. Pedí un nuevo turno.',
    rechazado: 'Tu certificado externo no fue validado. Revisá el motivo y volvé a cargarlo.',
  };
  notificar({ usuarioId, tipo: 'revision_medica', titulo: textos[resultado], referencia: '/socio/revision-medica' });
}

/** Aptos vencidos o por vencer en los próximos `dias`, agrupados por actividad. */
export function vencimientos(dias = 30) {
  const db = getDb();
  const hoy = local().fecha;
  return db.prepare(`
    SELECT a.id AS actividad_id, a.nombre AS actividad, p.id AS persona_id, p.apellido, p.nombre, s.nro_socio,
      r.vence_en, r.resultado, tr.nombre AS tipo,
      CASE WHEN r.vence_en < ? THEN 'vencido' ELSE 'por_vencer' END AS situacion
    FROM inscripciones i
    JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id
    JOIN actividad_requisitos ar ON ar.actividad_id = a.id
    JOIN tipos_revision tr ON tr.id = ar.tipo_revision_id
    JOIN personas p ON p.id = i.persona_id
    LEFT JOIN socios s ON s.persona_id = p.id
    LEFT JOIN revisiones_medicas r ON r.id = (
      SELECT id FROM revisiones_medicas WHERE persona_id = p.id AND tipo_revision_id = tr.id AND firmada_en IS NOT NULL
      AND resultado IN ('apto','apto_restricciones') ORDER BY vence_en DESC LIMIT 1)
    WHERE i.estado IN ('activa','pendiente_apto') AND (r.id IS NULL OR r.vence_en <= date(?, '+' || ? || ' days'))
    ORDER BY a.nombre, r.vence_en`).all(hoy, hoy, dias)
    .map((x) => ({ ...x, situacion: x.vence_en ? x.situacion : 'sin_apto' }));
}
