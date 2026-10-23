// Genera los íconos PNG de la PWA (escudo blanco sobre carmesí) sin dependencias externas.
// Uso: node scripts/iconos.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const CRIMSON = [185, 28, 28];
const BLANCO = [255, 255, 255];

const crcTabla = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabla[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const bloque = (tipo, datos) => {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
};

/** Escudo: rectángulo superior que se cierra en punta con curvas, normalizado a [0,1]. */
function enEscudo(x, y) {
  const cx = 0.5;
  if (y < 0.24 || y > 0.8) return false;
  const ancho = y < 0.52 ? 0.25 : 0.25 * Math.sqrt(Math.max(0, 1 - ((y - 0.52) / 0.28) ** 2));
  const muesca = y < 0.3 ? Math.abs(x - cx) < 0.25 && !(Math.abs(x - cx) < 0.25 && y < 0.24 + 0.06 * (1 - Math.abs(x - cx) / 0.25)) : true;
  return Math.abs(x - cx) <= ancho && muesca;
}

function png(tam, { maskable = false } = {}) {
  const radio = maskable ? 0 : tam * 0.22;
  const escala = maskable ? 0.8 : 1;
  const filas = [];
  for (let y = 0; y < tam; y++) {
    const fila = Buffer.alloc(1 + tam * 4);
    for (let x = 0; x < tam; x++) {
      // Esquinas redondeadas
      const dx = Math.max(radio - x, x - (tam - 1 - radio), 0);
      const dy = Math.max(radio - y, y - (tam - 1 - radio), 0);
      const dentro = dx * dx + dy * dy <= radio * radio;
      const nx = 0.5 + (x / tam - 0.5) / escala;
      const ny = 0.5 + (y / tam - 0.5) / escala;
      const color = enEscudo(nx, ny) ? BLANCO : CRIMSON;
      const o = 1 + x * 4;
      fila[o] = color[0]; fila[o + 1] = color[1]; fila[o + 2] = color[2]; fila[o + 3] = dentro ? 255 : 0;
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(Buffer.concat(filas), { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(destino, { recursive: true });
fs.writeFileSync(path.join(destino, 'icono-192.png'), png(192));
fs.writeFileSync(path.join(destino, 'icono-512.png'), png(512));
fs.writeFileSync(path.join(destino, 'icono.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#b91c1c"/><path d="M16 17 Q32 12 48 17 V33 Q48 46 32 52 Q16 46 16 33 Z" fill="#fff"/></svg>\n`);
console.log('Íconos generados en', destino);
