import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const produccion = env.NODE_ENV === 'production';

if (produccion && (!env.SESSION_SECRET || !env.QR_SECRET)) {
  throw new Error('En producción SESSION_SECRET y QR_SECRET son obligatorios');
}

export const config = {
  produccion,
  puerto: Number(env.PORT ?? 3000),
  origenWeb: env.WEB_ORIGIN ?? 'http://localhost:5173',
  dbFile: env.DB_FILE ?? path.join(raiz, 'data', 'cooperarios.db'),
  uploadsDir: env.UPLOADS_DIR ?? path.join(raiz, 'uploads'),
  backupsDir: env.BACKUPS_DIR ?? path.join(raiz, 'data', 'backups'),
  webDist: path.resolve(raiz, '..', 'web', 'dist'),
  sessionSecret: env.SESSION_SECRET ?? 'dev-session-secret-no-usar-en-produccion',
  qrSecret: env.QR_SECRET ?? 'dev-qr-secret-no-usar-en-produccion',
  sesionHoras: 12,
  inactividadMinutos: 30,
  qrVigenciaSegundos: 60,
  mercadoPago: {
    accessToken: env.MP_ACCESS_TOKEN ?? '',
    webhookSecret: env.MP_WEBHOOK_SECRET ?? 'dev-mp-webhook-secret',
    // Sin token se usa el modo simulado: el pago se aprueba desde la propia plataforma.
    simulado: !env.MP_ACCESS_TOKEN,
  },
  zonaHoraria: 'America/Argentina/Buenos_Aires',
};
