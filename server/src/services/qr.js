// Credencial dinámica: QR firmado que se renueva cada minuto y solo lleva un identificador opaco.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

/** El identificador del QR no expone el id interno: es un HMAC estable de la persona. */
const opaco = (personaId) =>
  crypto.createHmac('sha256', config.qrSecret).update(`persona:${personaId}`).digest('base64url').slice(0, 16);

export function emitirQr(personaId) {
  const jti = crypto.randomBytes(9).toString('base64url');
  const token = jwt.sign({ s: opaco(personaId), p: personaId }, config.qrSecret, {
    algorithm: 'HS256', expiresIn: config.qrVigenciaSegundos, jwtid: jti,
  });
  return { token, expira_en: new Date(Date.now() + config.qrVigenciaSegundos * 1000).toISOString() };
}

/**
 * Valida firma, vigencia y que no se haya usado antes (anti-repetición).
 * Devuelve el personaId o null si el código no sirve.
 */
export function consumirQr(token) {
  let datos;
  try {
    datos = jwt.verify(String(token).trim(), config.qrSecret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  if (!datos.jti || opaco(datos.p) !== datos.s) return null;
  const db = getDb();
  const r = db.prepare('INSERT OR IGNORE INTO qr_usados (jti, expira_en) VALUES (?, ?)')
    .run(datos.jti, new Date(datos.exp * 1000).toISOString());
  if (r.changes === 0) return null;
  return datos.p;
}

export function limpiarQrUsados() {
  return getDb().prepare('DELETE FROM qr_usados WHERE expira_en < ?').run(new Date().toISOString()).changes;
}
