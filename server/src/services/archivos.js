// Archivos fuera de la base: fotos, certificados y comprobantes en disco con acceso por rol.
// Las fotos se reducen y se les quitan los metadatos (EXIF, ubicación) en el navegador antes de subir.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { invalido } from '../lib/util.js';

const TIPOS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
export const CATEGORIAS = ['tickets', 'certificados', 'comprobantes', 'gastos', 'documentos', 'fotos', 'actas'];

export function subida(categoria, { maxMb = 8, campos = 6 } = {}) {
  const dir = path.join(config.uploadsDir, categoria);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${TIPOS[file.mimetype]}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: campos },
    fileFilter: (_req, file, cb) => (TIPOS[file.mimetype] ? cb(null, true) : cb(invalido('Formato no admitido (JPG, PNG, WEBP o PDF)'))),
  });
}

/** Ruta relativa guardada en la base: "categoria/archivo". */
export const rutaRelativa = (categoria, file) => `${categoria}/${file.filename}`;

export function rutaAbsoluta(relativa) {
  const limpia = path.normalize(relativa).replace(/^(\.\.(\/|\\|$))+/, '');
  const abs = path.join(config.uploadsDir, limpia);
  if (!abs.startsWith(path.resolve(config.uploadsDir))) throw invalido('Ruta inválida');
  return abs;
}
