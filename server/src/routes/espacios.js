// Espacios, reservas y bloqueos. SQLite no tiene restricciones de exclusión: la superposición
// se controla dentro de una transacción inmediata (propuesta, sección 7).
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora, enTransaccion } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso, puede } from '../lib/rbac.js';
import { validar, invalido, conflicto, noEncontrado, prohibido, local } from '../lib/util.js';
import { auditar } from '../lib/auditoria.js';
import { crearCargo } from '../services/cuenta.js';

const r = Router();
r.use(requiereSesion);

function superpone(espacioId, inicio, fin, excluirId = null) {
  const db = getDb();
  const reserva = db.prepare(`SELECT id FROM reservas WHERE espacio_id = ? AND estado = 'confirmada' AND inicio < ? AND fin > ? ${excluirId ? 'AND id != ?' : ''} LIMIT 1`)
    .get(...[espacioId, fin, inicio, ...(excluirId ? [excluirId] : [])]);
  const bloqueo = db.prepare('SELECT motivo FROM bloqueos_espacio WHERE espacio_id = ? AND desde < ? AND hasta > ? LIMIT 1').get(espacioId, fin, inicio);
  return reserva ? 'El horario ya está reservado' : bloqueo ? `Espacio bloqueado: ${bloqueo.motivo}` : null;
}

/** Disponibilidad de un día: reservas y bloqueos que lo ocupan. */
export function disponibilidad(espacioId, fecha) {
  const db = getDb();
  const desde = new Date(`${fecha}T00:00:00-03:00`).toISOString();
  const hasta = new Date(`${fecha}T23:59:59-03:00`).toISOString();
  return {
    espacio: db.prepare('SELECT e.*, rr.anticipacion_dias, rr.cancelacion_horas FROM espacios e LEFT JOIN reglas_reserva rr ON rr.espacio_id = e.id WHERE e.id = ?').get(espacioId),
    ocupado: db.prepare(`SELECT id, inicio, fin, tipo, persona_id IS NOT NULL AS de_socio FROM reservas WHERE espacio_id = ? AND estado = 'confirmada' AND inicio < ? AND fin > ? ORDER BY inicio`).all(espacioId, hasta, desde),
    bloqueos: db.prepare('SELECT desde, hasta, motivo FROM bloqueos_espacio WHERE espacio_id = ? AND desde < ? AND hasta > ?').all(espacioId, hasta, desde),
  };
}

/** Reserva con reglas del espacio (anticipación, máximo de activas) sin superposición. */
export function reservar({ espacio_id: espacioId, inicio, fin, personaId = null, tipo = 'socio', importe = null }, req) {
  const ini = new Date(inicio);
  const fn = new Date(fin);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fn.getTime()) || fn <= ini) throw invalido('Horario inválido');
  return enTransaccion(() => {
    const db = getDb();
    const e = db.prepare('SELECT e.*, rr.anticipacion_dias, rr.max_activas FROM espacios e LEFT JOIN reglas_reserva rr ON rr.espacio_id = e.id WHERE e.id = ?').get(espacioId);
    if (!e || !e.activo) throw noEncontrado('Espacio');
    if (tipo === 'socio') {
      if (!e.reservable) throw invalido('Este espacio no admite reservas de socios');
      if (ini < new Date()) throw invalido('El horario ya pasó');
      if ((ini - Date.now()) / 86400000 > (e.anticipacion_dias ?? 7)) throw invalido(`Se reserva con hasta ${e.anticipacion_dias} días de anticipación`);
      const activas = db.prepare(`SELECT COUNT(*) FROM reservas WHERE persona_id = ? AND espacio_id = ? AND estado = 'confirmada' AND inicio > ?`).pluck().get(personaId, espacioId, ahora());
      if (activas >= (e.max_activas ?? 2)) throw invalido(`Podés tener hasta ${e.max_activas} reservas activas en este espacio`);
    }
    const choque = superpone(espacioId, ini.toISOString(), fn.toISOString());
    if (choque) throw conflicto(choque);
    const monto = importe ?? (tipo === 'alquiler' ? Math.round(e.tarifa_hora * ((fn - ini) / 3600000)) : 0);
    const id = db.prepare(`INSERT INTO reservas (espacio_id, persona_id, inicio, fin, tipo, importe) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(espacioId, personaId, ini.toISOString(), fn.toISOString(), tipo, monto).lastInsertRowid;
    if (monto > 0 && personaId) {
      crearCargo({ personaId, conceptoTipo: 'alquiler', descripcion: `Alquiler ${e.nombre}`, periodo: local(ini).periodo, importe: monto, vencimiento: local(ini).fecha, origenTipo: 'reserva', origenId: id });
    }
    auditar(req, 'reservar', 'reservas', id, null, { espacioId, inicio: ini.toISOString(), tipo });
    return { id };
  });
}

export function cancelarReserva(id, req, { propia = false } = {}) {
  const db = getDb();
  const rs = db.prepare('SELECT r.*, rr.cancelacion_horas FROM reservas r LEFT JOIN reglas_reserva rr ON rr.espacio_id = r.espacio_id WHERE r.id = ?').get(id);
  if (!rs) throw noEncontrado('Reserva');
  if (propia && rs.persona_id !== req.usuario.persona_id) throw prohibido();
  if (rs.estado !== 'confirmada') throw invalido('La reserva no está vigente');
  const horas = (new Date(rs.inicio) - Date.now()) / 3600000;
  if (propia && horas < (rs.cancelacion_horas ?? 12)) throw invalido(`Las cancelaciones se hacen con ${rs.cancelacion_horas} horas de anticipación`);
  db.prepare(`UPDATE reservas SET estado = 'cancelada', cancelada_en = ? WHERE id = ?`).run(ahora(), id);
  auditar(req, 'cancelar_reserva', 'reservas', id);
  return { ok: true };
}

// ---------- Administración de espacios (Administración; profesor y delegado en su ámbito) ----------
r.get('/', permiso('reservas', 'leer', 'leer_ambito', 'gestionar_ambito', 'propio'), (_req, res) => {
  res.json(getDb().prepare(`SELECT e.*, rr.anticipacion_dias, rr.max_activas, rr.cancelacion_horas, rr.sancion FROM espacios e
    LEFT JOIN reglas_reserva rr ON rr.espacio_id = e.id ORDER BY e.nombre`).all());
});

const espacioSchema = z.object({
  nombre: z.string().min(2), tipo: z.string().min(2), capacidad: z.number().int().nullable().optional(),
  reservable: z.boolean().default(false), tarifa_hora: z.number().int().min(0).default(0), activo: z.boolean().default(true),
  anticipacion_dias: z.number().int().min(0).optional(), max_activas: z.number().int().min(1).optional(),
  cancelacion_horas: z.number().int().min(0).optional(), sancion: z.string().optional(),
});

function guardarEspacio(id, datos) {
  const db = getDb();
  const base = [datos.nombre, datos.tipo, datos.capacidad ?? null, datos.reservable ? 1 : 0, datos.tarifa_hora, datos.activo ? 1 : 0];
  if (id) db.prepare('UPDATE espacios SET nombre = ?, tipo = ?, capacidad = ?, reservable = ?, tarifa_hora = ?, activo = ? WHERE id = ?').run(...base, id);
  else id = db.prepare('INSERT INTO espacios (nombre, tipo, capacidad, reservable, tarifa_hora, activo) VALUES (?, ?, ?, ?, ?, ?)').run(...base).lastInsertRowid;
  if (datos.reservable) {
    db.prepare(`INSERT INTO reglas_reserva (espacio_id, anticipacion_dias, max_activas, cancelacion_horas, sancion) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (espacio_id) DO UPDATE SET anticipacion_dias = excluded.anticipacion_dias, max_activas = excluded.max_activas,
      cancelacion_horas = excluded.cancelacion_horas, sancion = excluded.sancion`)
      .run(id, datos.anticipacion_dias ?? 7, datos.max_activas ?? 2, datos.cancelacion_horas ?? 12, datos.sancion ?? null);
  }
  return id;
}

r.post('/', permiso('reservas', 'gestionar'), (req, res) => {
  const id = guardarEspacio(null, validar(espacioSchema, req.body));
  auditar(req, 'crear', 'espacios', id, null, req.body);
  res.status(201).json({ id });
});
r.put('/:id', permiso('reservas', 'gestionar'), (req, res) => {
  guardarEspacio(Number(req.params.id), validar(espacioSchema, req.body));
  auditar(req, 'editar', 'espacios', Number(req.params.id), null, req.body);
  res.json({ ok: true });
});

/** Calendario general: reservas, bloqueos y clases en un rango de fechas. */
r.get('/calendario', permiso('reservas', 'leer', 'leer_ambito', 'gestionar_ambito'), (req, res) => {
  const db = getDb();
  const desde = String(req.query.desde ?? local().fecha);
  const hasta = String(req.query.hasta ?? desde);
  const d = new Date(`${desde}T00:00:00-03:00`).toISOString();
  const h = new Date(`${hasta}T23:59:59-03:00`).toISOString();
  const filtroEspacio = req.query.espacio_id ? 'AND r.espacio_id = ' + Number(req.query.espacio_id) : '';
  res.json({
    reservas: db.prepare(`SELECT r.*, e.nombre AS espacio, p.nombre || ' ' || p.apellido AS persona FROM reservas r JOIN espacios e ON e.id = r.espacio_id
      LEFT JOIN personas p ON p.id = r.persona_id WHERE r.inicio < ? AND r.fin > ? ${filtroEspacio} ORDER BY r.inicio`).all(h, d),
    bloqueos: db.prepare(`SELECT b.*, e.nombre AS espacio FROM bloqueos_espacio b JOIN espacios e ON e.id = b.espacio_id WHERE b.desde < ? AND b.hasta > ? ORDER BY b.desde`).all(h, d),
    clases: db.prepare(`SELECT h.*, g.nombre AS grupo, a.nombre AS actividad, e.nombre AS espacio FROM horarios h JOIN grupos g ON g.id = h.grupo_id
      JOIN actividades a ON a.id = g.actividad_id LEFT JOIN espacios e ON e.id = h.espacio_id ORDER BY h.dia_semana, h.hora_inicio`).all(),
  });
});

r.post('/reservas', permiso('reservas', 'gestionar', 'gestionar_ambito'), (req, res) => {
  const datos = validar(z.object({
    espacio_id: z.number().int(), inicio: z.string(), fin: z.string(),
    tipo: z.enum(['clase', 'alquiler', 'evento', 'torneo', 'socio']), persona_id: z.number().int().nullable().optional(), importe: z.number().int().nullable().optional(),
  }), req.body);
  if (!puede(req.usuario, 'reservas', 'gestionar') && !['clase', 'torneo'].includes(datos.tipo)) throw prohibido('Solo podés reservar para clases o torneos de tu actividad');
  res.status(201).json(reservar({ ...datos, personaId: datos.persona_id ?? null }, req));
});
r.post('/reservas/:id/cancelar', permiso('reservas', 'gestionar', 'gestionar_ambito'), (req, res) => res.json(cancelarReserva(Number(req.params.id), req)));
r.post('/reservas/:id/asistencia', permiso('reservas', 'gestionar'), (req, res) => {
  const { estado } = validar(z.object({ estado: z.enum(['cumplida', 'ausente']) }), req.body);
  getDb().prepare('UPDATE reservas SET estado = ? WHERE id = ?').run(estado, req.params.id);
  res.json({ ok: true });
});

r.post('/bloqueos', permiso('reservas', 'gestionar'), (req, res) => {
  const datos = validar(z.object({ espacio_id: z.number().int(), desde: z.string(), hasta: z.string(), motivo: z.string().min(3) }), req.body);
  const id = getDb().prepare('INSERT INTO bloqueos_espacio (espacio_id, desde, hasta, motivo) VALUES (?, ?, ?, ?)')
    .run(datos.espacio_id, new Date(datos.desde).toISOString(), new Date(datos.hasta).toISOString(), datos.motivo).lastInsertRowid;
  auditar(req, 'bloquear_espacio', 'bloqueos_espacio', id, null, datos);
  res.status(201).json({ id });
});
r.delete('/bloqueos/:id', permiso('reservas', 'gestionar'), (req, res) => {
  getDb().prepare('DELETE FROM bloqueos_espacio WHERE id = ?').run(req.params.id);
  auditar(req, 'quitar_bloqueo', 'bloqueos_espacio', Number(req.params.id));
  res.json({ ok: true });
});

export default r;
