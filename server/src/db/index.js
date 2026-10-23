// Capa de acceso a datos. Aislada para facilitar una futura migración a PostgreSQL.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { uuid } from '../lib/ids.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

let db;

export function abrirBase(archivo = config.dbFile) {
  if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const conexion = new Database(archivo);
  conexion.pragma('journal_mode = WAL');
  conexion.pragma('foreign_keys = ON');
  conexion.pragma('busy_timeout = 5000');
  conexion.pragma('synchronous = NORMAL');
  // Valor por defecto de cada columna id (ver la migración inicial).
  conexion.function('uuid7', { deterministic: false }, uuid);
  return conexion;
}

export function getDb() {
  if (!db) {
    db = abrirBase();
    migrar(db);
  }
  return db;
}

export function setDb(conexion) {
  db = conexion;
}

/** Aplica las migraciones SQL versionadas que falten, cada una en su transacción. */
export function migrar(conexion) {
  conexion.exec(`CREATE TABLE IF NOT EXISTS _migraciones (
    version TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)`);
  const aplicadas = new Set(conexion.prepare('SELECT version FROM _migraciones').pluck().all());
  const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
    // Las FK se validan al final: el esquema declara referencias hacia adelante.
    conexion.pragma('foreign_keys = OFF');
    conexion.transaction(() => {
      conexion.exec(sql);
      conexion.prepare('INSERT INTO _migraciones VALUES (?, ?)').run(archivo, new Date().toISOString());
    })();
    conexion.pragma('foreign_keys = ON');
  }
  // Bases de desarrollo creadas antes del cambio a UUID: la migración 001 se reescribió antes de la salida en vivo.
  const tipoId = conexion.prepare(`SELECT type FROM pragma_table_info('usuarios') WHERE name = 'id'`).pluck().get();
  if (tipoId && tipoId.toUpperCase() !== 'TEXT') {
    throw new Error('La base tiene el esquema viejo con ids numéricos. Detené el servidor y corré "npm run db:reset" para recrearla con UUID.');
  }
}

/** Ejecuta fn dentro de una transacción inmediata (toma el lock de escritura al inicio). */
export function enTransaccion(fn) {
  const conexion = getDb();
  return conexion.transaction(fn).immediate();
}

export function ahora() {
  return new Date().toISOString();
}

/** Copia consistente de la base con la API de backup de SQLite. */
export async function backup(destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await getDb().backup(destino);
  return destino;
}
