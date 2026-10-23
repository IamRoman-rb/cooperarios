// Correo institucional (SMTP). Sin servidor configurado, como en desarrollo, el mensaje se muestra en consola.
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporte;

/** Envía un correo de texto. Devuelve si salió por SMTP; un fallo se registra pero no corta la operación que lo pidió. */
export async function enviarCorreo({ para, asunto, texto }) {
  const { host, puerto, usuario, clave, remitente } = config.smtp;
  if (!host) {
    console.log(`[correo sin SMTP] Para: ${para} · ${asunto}\n${texto}`);
    return false;
  }
  transporte ??= nodemailer.createTransport({ host, port: puerto, secure: puerto === 465, auth: usuario ? { user: usuario, pass: clave } : undefined });
  try {
    await transporte.sendMail({ from: remitente, to: para, subject: asunto, text: texto });
    return true;
  } catch (e) {
    console.error(`[correo] No se pudo enviar a ${para}: ${e.message}`);
    return false;
  }
}
