import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb, ahora } from '../db/index.js';
import { config } from '../config.js';
import { HttpError } from './util.js';

export const COOKIE = 'coop_sesion';
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;
// Roles con verificación en dos pasos obligatoria cuando el usuario la activó (propuesta, sección 8).
export const ROLES_MFA = ['admin', 'contabilidad', 'directiva', 'medico'];

export const hashPassword = (plano) => bcrypt.hash(plano, 11);
export const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

/** Carga usuario con persona, roles y permisos efectivos. */
export function cargarUsuario(usuarioId) {
  const db = getDb();
  const u = db.prepare(`
    SELECT u.id, u.email, u.estado, u.mfa_habilitado, u.persona_id,
           p.nombre, p.apellido, p.foto, p.dni
    FROM usuarios u LEFT JOIN personas p ON p.id = u.persona_id
    WHERE u.id = ?`).get(usuarioId);
  if (!u) return null;
  u.roles = db.prepare(`
    SELECT r.codigo, r.nombre, ur.actividad_id, a.nombre AS actividad
    FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
    LEFT JOIN actividades a ON a.id = ur.actividad_id
    WHERE ur.usuario_id = ?`).all(usuarioId);
  u.permisos = db.prepare(`
    SELECT DISTINCT pe.modulo, pe.accion
    FROM usuario_roles ur JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
    JOIN permisos pe ON pe.id = rp.permiso_id
    WHERE ur.usuario_id = ?`).all(usuarioId);
  return u;
}

export async function verificarCredenciales(email, password) {
  const db = getDb();
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  // Mismo mensaje y costo aproximado exista o no el usuario.
  const hash = u?.password_hash ?? '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  if (u?.bloqueado_hasta && u.bloqueado_hasta > ahora()) {
    throw new HttpError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Probá en unos minutos.');
  }
  const ok = await bcrypt.compare(password, hash);
  if (!u || !ok || u.estado !== 'activo') {
    if (u) {
      const intentos = u.intentos_fallidos + 1;
      const bloqueo = intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MINUTOS * 60000).toISOString() : null;
      db.prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?')
        .run(bloqueo ? 0 : intentos, bloqueo, u.id);
    }
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  db.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = ? WHERE id = ?').run(ahora(), u.id);
  return u;
}

export function crearSesion(usuario, req, { mfaPendiente = false } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + config.sesionHoras * 3600000).toISOString();
  getDb().prepare(`INSERT INTO sesiones (usuario_id, token_hash, expira_en, ultima_actividad, mfa_pendiente, ip, dispositivo)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(usuario.id, sha256(token), expira, ahora(), mfaPendiente ? 1 : 0, req.ip, (req.get('user-agent') ?? '').slice(0, 200));
  return { token, expira };
}

export function opcionesCookie(expira) {
  return { httpOnly: true, sameSite: 'lax', secure: config.produccion, expires: new Date(expira), path: '/' };
}

/** Middleware: resuelve la sesión de la cookie (no exige que exista). */
export function sesion(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  const db = getDb();
  const s = db.prepare('SELECT * FROM sesiones WHERE token_hash = ?').get(sha256(token));
  if (!s) return next();
  const limiteInactividad = new Date(Date.now() - config.inactividadMinutos * 60000).toISOString();
  if (s.expira_en < ahora() || s.ultima_actividad < limiteInactividad) {
    db.prepare('DELETE FROM sesiones WHERE id = ?').run(s.id);
    return next();
  }
  db.prepare('UPDATE sesiones SET ultima_actividad = ? WHERE id = ?').run(ahora(), s.id);
  req.sesion = s;
  if (!s.mfa_pendiente) req.usuario = cargarUsuario(s.usuario_id);
  next();
}

export function requiereSesion(req, _res, next) {
  if (!req.usuario) return next(new HttpError(401, 'Iniciá sesión para continuar'));
  next();
}

export function cerrarSesion(req) {
  if (req.sesion) getDb().prepare('DELETE FROM sesiones WHERE id = ?').run(req.sesion.id);
}

/** Protección CSRF: las peticiones que modifican datos deben venir del origen de la web. */
export function verificarOrigen(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/lector/') || req.path.startsWith('/api/pagos/webhook')) return next();
  const origen = req.get('origin');
  const permitido = [config.origenWeb, `http://localhost:${config.puerto}`];
  if (origen && !permitido.includes(origen)) return next(new HttpError(403, 'Origen no permitido'));
  if (req.get('x-requested-with') !== 'cooperarios') return next(new HttpError(403, 'Solicitud no válida'));
  next();
}

// ---------- TOTP (RFC 6238) para verificación en dos pasos ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generarSecretoTotp() {
  const bytes = crypto.randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let salida = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) salida += B32[parseInt(bits.slice(i, i + 5), 2)];
  return salida;
}

function base32aBuffer(secreto) {
  let bits = '';
  for (const c of secreto.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function codigoTotp(secreto, tiempo = Date.now(), paso = 0) {
  const contador = Math.floor(tiempo / 30000) + paso;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const hmac = crypto.createHmac('sha1', base32aBuffer(secreto)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const codigo = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return codigo.toString().padStart(6, '0');
}

export function verificarTotp(secreto, codigo) {
  return [-1, 0, 1].some((paso) => codigoTotp(secreto, Date.now(), paso) === String(codigo).trim());
}
