import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getDb, ahora } from '../db/index.js';
import { config } from '../config.js';
import {
  COOKIE, ROLES_MFA, verificarCredenciales, crearSesion, opcionesCookie, cargarUsuario, cerrarSesion,
  requiereSesion, generarSecretoTotp, verificarTotp, hashPassword,
} from '../lib/auth.js';
import { validar, HttpError } from '../lib/util.js';
import { auditar } from '../lib/auditoria.js';

const r = Router();
const limite = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Esperá unos minutos.' } });

/** Datos de la sesión para el frontend: usuario, roles y módulos habilitados. */
export function perfilSesion(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    foto: usuario.foto,
    persona_id: usuario.persona_id,
    mfa_habilitado: !!usuario.mfa_habilitado,
    roles: usuario.roles,
    permisos: usuario.permisos,
  };
}

r.post('/login', limite, async (req, res) => {
  const { email, password } = validar(z.object({ email: z.string().email('Email inválido'), password: z.string().min(1) }), req.body);
  const u = await verificarCredenciales(email, password);
  const usuario = cargarUsuario(u.id);
  const exigeMfa = !!u.mfa_habilitado && usuario.roles.some((x) => ROLES_MFA.includes(x.codigo));
  const { token, expira } = crearSesion(u, req, { mfaPendiente: exigeMfa });
  res.cookie(COOKIE, token, opcionesCookie(expira));
  auditar({ usuario: { id: u.id }, ip: req.ip }, 'login', 'usuarios', u.id);
  if (exigeMfa) return res.json({ mfa_requerido: true });
  res.json({ usuario: perfilSesion(usuario) });
});

r.post('/mfa', limite, (req, res) => {
  if (!req.sesion?.mfa_pendiente) throw new HttpError(400, 'No hay una verificación pendiente');
  const { codigo } = validar(z.object({ codigo: z.string().regex(/^\d{6}$/, 'Ingresá los 6 dígitos') }), req.body);
  const u = getDb().prepare('SELECT * FROM usuarios WHERE id = ?').get(req.sesion.usuario_id);
  if (!verificarTotp(u.mfa_secreto, codigo)) throw new HttpError(401, 'Código incorrecto');
  getDb().prepare('UPDATE sesiones SET mfa_pendiente = 0 WHERE id = ?').run(req.sesion.id);
  res.json({ usuario: perfilSesion(cargarUsuario(u.id)) });
});

r.post('/logout', (req, res) => {
  cerrarSesion(req);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

r.get('/me', (req, res) => {
  if (!req.usuario) return res.status(401).json({ error: 'Sin sesión', mfa_requerido: !!req.sesion?.mfa_pendiente });
  res.json({ usuario: perfilSesion(req.usuario) });
});

// Recuperación de contraseña: token firmado que caduca en 30 minutos y se invalida al cambiar la contraseña.
const secretoReset = (u) => `${config.sessionSecret}:${u.password_hash}`;

r.post('/recuperar', limite, (req, res) => {
  const { email } = validar(z.object({ email: z.string().email() }), req.body);
  const u = getDb().prepare(`SELECT * FROM usuarios WHERE email = ? AND estado = 'activo'`).get(email);
  if (u) {
    const token = jwt.sign({ u: u.id }, secretoReset(u), { expiresIn: '30m' });
    const enlace = `${config.origenWeb}/login?restablecer=${token}`;
    // El envío de correo (SMTP institucional) se configura en producción; en desarrollo se muestra en consola.
    console.log(`[recuperación] ${email}: ${enlace}`);
    if (!config.produccion) return res.json({ ok: true, enlace_dev: enlace });
  }
  res.json({ ok: true });
});

r.post('/restablecer', limite, async (req, res) => {
  const { token, password } = validar(z.object({
    token: z.string(),
    password: z.string().min(10, 'Mínimo 10 caracteres').regex(/[A-Za-z]/, 'Debe incluir letras').regex(/\d/, 'Debe incluir números'),
  }), req.body);
  const sinVerificar = jwt.decode(token);
  const u = sinVerificar?.u && getDb().prepare('SELECT * FROM usuarios WHERE id = ?').get(sinVerificar.u);
  try {
    if (!u) throw new Error();
    jwt.verify(token, secretoReset(u));
  } catch {
    throw new HttpError(400, 'El enlace venció o ya fue usado. Pedí uno nuevo.');
  }
  getDb().prepare('UPDATE usuarios SET password_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?').run(await hashPassword(password), u.id);
  getDb().prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(u.id);
  auditar({ usuario: { id: u.id }, ip: req.ip }, 'restablecer_password', 'usuarios', u.id);
  res.json({ ok: true });
});

r.post('/password', requiereSesion, async (req, res) => {
  const { actual, nueva } = validar(z.object({ actual: z.string(), nueva: z.string().min(10).regex(/[A-Za-z]/).regex(/\d/) }), req.body);
  await verificarCredenciales(req.usuario.email, actual);
  getDb().prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(await hashPassword(nueva), req.usuario.id);
  getDb().prepare('DELETE FROM sesiones WHERE usuario_id = ? AND id != ?').run(req.usuario.id, req.sesion.id);
  auditar(req, 'cambiar_password', 'usuarios', req.usuario.id);
  res.json({ ok: true });
});

// Verificación en dos pasos (TOTP con cualquier app autenticadora).
r.post('/mfa/activar', requiereSesion, (req, res) => {
  const secreto = generarSecretoTotp();
  getDb().prepare('UPDATE usuarios SET mfa_secreto = ?, mfa_habilitado = 0 WHERE id = ?').run(secreto, req.usuario.id);
  const uri = `otpauth://totp/Cooperarios:${encodeURIComponent(req.usuario.email)}?secret=${secreto}&issuer=Cooperarios`;
  res.json({ secreto, uri });
});

r.post('/mfa/confirmar', requiereSesion, (req, res) => {
  const { codigo } = validar(z.object({ codigo: z.string().regex(/^\d{6}$/) }), req.body);
  const u = getDb().prepare('SELECT mfa_secreto FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!u.mfa_secreto || !verificarTotp(u.mfa_secreto, codigo)) throw new HttpError(400, 'Código incorrecto');
  getDb().prepare('UPDATE usuarios SET mfa_habilitado = 1 WHERE id = ?').run(req.usuario.id);
  auditar(req, 'activar_mfa', 'usuarios', req.usuario.id, null, { mfa: true, en: ahora() });
  res.json({ ok: true });
});

export default r;
