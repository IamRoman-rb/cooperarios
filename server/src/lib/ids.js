// Identificadores UUID v7 (RFC 9562): 48 bits de tiempo en milisegundos + aleatoriedad.
// Al estar ordenados por tiempo, ordenar por id equivale a ordenar por creación.
import crypto from 'node:crypto';

let ultimoMs = 0;
let secuencia = 0;

export function uuid() {
  let ms = Date.now();
  // Monótono dentro del proceso: varios ids en el mismo milisegundo siguen creciendo.
  if (ms <= ultimoMs) {
    secuencia++;
    if (secuencia > 0xfff) {
      ultimoMs++;
      secuencia = 0;
    }
    ms = ultimoMs;
  } else {
    ultimoMs = ms;
    secuencia = crypto.randomInt(0, 0x800);
  }
  const b = crypto.randomBytes(16);
  b.writeUIntBE(ms, 0, 6);
  b[6] = 0x70 | (secuencia >> 8); // versión 7 + 4 bits altos de la secuencia
  b[7] = secuencia & 0xff;
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

