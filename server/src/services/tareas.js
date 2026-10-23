// Tareas programadas: cargos mensuales, avisos de vencimiento, morosidad, limpieza y backups.
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, backup } from '../db/index.js';
import { config } from '../config.js';
import { local, sumarDias } from '../lib/util.js';
import { cuotaSocial, cotizar } from './precios.js';
import { crearCargo } from './cuenta.js';
import { limpiarQrUsados } from './qr.js';
import { notificar, usuarioDePersona } from '../lib/auditoria.js';

export const estadoTareas = {};

function registrar(nombre, fn) {
  return () => {
    const inicio = Date.now();
    try {
      const resultado = fn();
      estadoTareas[nombre] = { ok: true, ultima: new Date().toISOString(), ms: Date.now() - inicio, resultado };
    } catch (e) {
      estadoTareas[nombre] = { ok: false, ultima: new Date().toISOString(), error: e.message };
      console.error(`[tarea ${nombre}]`, e);
    }
  };
}

const parametro = (clave, defecto) => getDb().prepare('SELECT valor FROM parametros WHERE clave = ?').pluck().get(clave) ?? defecto;

/** Genera la cuota social y los aranceles del período (idempotente). */
export function generarCargosMensuales(periodo = local().periodo) {
  const db = getDb();
  const diaCuota = String(parametro('dia_vencimiento_cuota', '10')).padStart(2, '0');
  let creados = 0;
  const existe = db.prepare('SELECT 1 FROM cargos WHERE persona_id = ? AND periodo = ? AND origen_tipo = ? AND origen_id = ?');

  for (const s of db.prepare(`SELECT * FROM socios WHERE estado = 'activo'`).all()) {
    if (existe.get(s.persona_id, periodo, 'socio', s.id)) continue;
    crearCargo({ personaId: s.persona_id, conceptoTipo: 'cuota_social', descripcion: `Cuota social ${periodo}`, periodo,
      importe: cuotaSocial(s), vencimiento: `${periodo}-${diaCuota}`, origenTipo: 'socio', origenId: s.id });
    creados++;
  }
  const inscripciones = db.prepare(`SELECT i.*, g.actividad_id, a.nombre AS actividad, a.dia_vencimiento FROM inscripciones i
    JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id
    WHERE i.estado IN ('activa','pendiente_apto') AND i.desde <= ?`).all(`${periodo}-31`);
  for (const i of inscripciones) {
    if (existe.get(i.persona_id, periodo, 'inscripcion', i.id)) continue;
    try {
      const precio = cotizar({ personaId: i.persona_id, actividadId: i.actividad_id, frecuencia: i.frecuencia_semanal, descuentoId: i.descuento_id });
      crearCargo({ personaId: i.persona_id, conceptoTipo: 'arancel', descripcion: `${i.actividad} ${periodo}`, periodo, importe: precio.total,
        vencimiento: `${periodo}-${String(i.dia_vencimiento).padStart(2, '0')}`, origenTipo: 'inscripcion', origenId: i.id });
      creados++;
    } catch { /* actividad sin arancel vigente: no se cobra */ }
  }
  return { periodo, creados };
}

/** Bajas solicitadas: se aplican al fin del período y bloquean cargos futuros. */
export function aplicarBajas() {
  const hoy = local().fecha;
  return getDb().prepare(`UPDATE inscripciones SET estado = 'baja' WHERE estado = 'baja_solicitada' AND hasta IS NOT NULL AND hasta < ?`).run(hoy).changes;
}

/** Avisos de vencimiento del apto a 30, 15 y 7 días. */
export function avisosAptos() {
  const db = getDb();
  const hoy = local().fecha;
  let n = 0;
  for (const dias of [30, 15, 7]) {
    const fecha = sumarDias(hoy, dias);
    const revs = db.prepare(`SELECT DISTINCT persona_id FROM revisiones_medicas WHERE vence_en = ? AND resultado IN ('apto','apto_restricciones')`).pluck().all(fecha);
    for (const personaId of revs) {
      const usuarioId = usuarioDePersona(personaId);
      if (usuarioId) { notificar({ usuarioId, tipo: 'revision_medica', titulo: `Tu apto médico vence en ${dias} días`, referencia: '/socio/revision-medica' }); n++; }
    }
  }
  return { avisos: n };
}

/** Avisos de morosidad: 3 días antes del vencimiento y el día siguiente. */
export function avisosMorosidad() {
  const db = getDb();
  const hoy = local().fecha;
  let n = 0;
  const filas = db.prepare(`SELECT DISTINCT persona_id, vencimiento FROM cargos WHERE estado IN ('pendiente','parcial') AND vencimiento IN (?, ?)`)
    .all(sumarDias(hoy, 3), sumarDias(hoy, -1));
  for (const f of filas) {
    const usuarioId = usuarioDePersona(f.persona_id);
    if (!usuarioId) continue;
    const titulo = f.vencimiento > hoy ? `Tenés cargos que vencen el ${f.vencimiento}` : 'Tenés cargos vencidos. Regularizá en Mis pagos.';
    notificar({ usuarioId, tipo: 'cobranza', titulo, referencia: '/socio/pagos' });
    n++;
  }
  return { avisos: n };
}

/** Tickets vencidos: se avisa a Administración. */
export function avisosTickets() {
  const vencidos = getDb().prepare(`SELECT COUNT(*) FROM tickets_mantenimiento WHERE estado NOT IN ('resuelto','cerrado') AND vence_en < ?`)
    .pluck().get(new Date().toISOString());
  if (vencidos) notificar({ rol: 'admin', tipo: 'ticket', titulo: `${vencidos} tickets de mantenimiento vencidos`, referencia: '/admin/tickets' });
  return { vencidos };
}

/** Retención: accesos con detalle 12 meses, registros técnicos y de auditoría 12 meses (propuesta 9.6). */
export function aplicarRetencion() {
  const db = getDb();
  const limite = new Date(Date.now() - 365 * 86400000).toISOString();
  return {
    accesos: db.prepare('DELETE FROM accesos WHERE fecha_hora < ?').run(limite).changes,
    auditoria: db.prepare('DELETE FROM auditoria WHERE creado_en < ?').run(limite).changes,
    sesiones: db.prepare('DELETE FROM sesiones WHERE expira_en < ?').run(new Date().toISOString()).changes,
    qr: limpiarQrUsados(),
  };
}

export async function backupNocturno() {
  const destino = path.join(config.backupsDir, `cooperarios-${local().fecha}.db`);
  await backup(destino);
  // Rotación: se conservan las últimas 30 copias.
  const copias = fs.readdirSync(config.backupsDir).filter((f) => f.endsWith('.db')).sort();
  for (const viejo of copias.slice(0, Math.max(copias.length - 30, 0))) fs.unlinkSync(path.join(config.backupsDir, viejo));
  estadoTareas.backup = { ok: true, ultima: new Date().toISOString(), resultado: { archivo: path.basename(destino) } };
  return destino;
}

export function iniciarTareas() {
  const tz = { timezone: config.zonaHoraria };
  cron.schedule('0 3 1 * *', registrar('cargos_mensuales', () => generarCargosMensuales()), tz);
  cron.schedule('5 0 * * *', registrar('bajas', aplicarBajas), tz);
  cron.schedule('0 9 * * *', registrar('avisos_aptos', avisosAptos), tz);
  cron.schedule('30 9 * * *', registrar('avisos_morosidad', avisosMorosidad), tz);
  cron.schedule('0 8 * * 1-6', registrar('avisos_tickets', avisosTickets), tz);
  cron.schedule('0 4 * * *', registrar('retencion', aplicarRetencion), tz);
  cron.schedule('30 2 * * *', () => backupNocturno().catch((e) => { estadoTareas.backup = { ok: false, ultima: new Date().toISOString(), error: e.message }; }), tz);
}
