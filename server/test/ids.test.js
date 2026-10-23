// Identificadores UUID v7: formato, orden, validación de entrada y detección del esquema viejo.
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { entorno, como } from './helpers.js';
import { uuid, ES_UUID } from '../src/lib/ids.js';
import { migrar } from '../src/db/index.js';

let app, db, ids;
beforeAll(() => { ({ app, db, ids } = entorno()); });

describe('generador', () => {
  it('produce UUID v7 únicos y ordenados por creación', () => {
    const lista = Array.from({ length: 2000 }, uuid);
    expect(lista.every((x) => ES_UUID.test(x) && x[14] === '7')).toBe(true);
    expect(new Set(lista).size).toBe(lista.length);
    expect(lista.every((x, i) => i === 0 || x > lista[i - 1])).toBe(true);
  });
});

describe('base de datos', () => {
  it('todas las tablas con id lo generan como UUID por defecto', () => {
    const tablas = db.prepare(`SELECT m.name FROM sqlite_master m JOIN pragma_table_info(m.name) c ON c.name = 'id'
      WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite%'`).pluck().all();
    expect(tablas.length).toBe(69);
    for (const t of tablas) {
      const id = db.prepare(`SELECT id FROM ${t} LIMIT 1`).pluck().get();
      if (id !== undefined) expect(ES_UUID.test(id), `${t}: ${id}`).toBe(true);
    }
    expect(ES_UUID.test(ids.pLucia)).toBe(true);
  });

  it('detecta una base creada con el esquema viejo de ids numéricos', () => {
    const vieja = new Database(':memory:');
    vieja.exec(`CREATE TABLE _migraciones (version TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL);
      INSERT INTO _migraciones VALUES ('001_esquema_inicial.sql', '2026-10-22');
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, email TEXT);`);
    expect(() => migrar(vieja)).toThrow(/db:reset/);
  });
});

describe('API', () => {
  it('rechaza ids con formato inválido en el cuerpo', async () => {
    const socio = await como(app, 'socio');
    const res = await socio.post('/api/mi/inscribirme').send({ grupo_id: 1, frecuencia: 1 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.detalle)).toMatch(/grupo_id/);
  });

  it('un id inexistente en la URL responde 404 y no rompe la consulta', async () => {
    const admin = await como(app, 'admin');
    expect((await admin.get(`/api/padron/socios/${uuid()}`)).status).toBe(404);
    expect((await admin.get("/api/padron/socios/1' OR '1'='1")).status).toBe(404);
  });

  it('los filtros por id se pasan como parámetro, no como texto del SQL', async () => {
    const admin = await como(app, 'admin');
    const res = await admin.get(`/api/espacios/calendario?espacio_id=${encodeURIComponent("x' OR 1=1 --")}`);
    expect(res.status).toBe(200);
    expect(res.body.reservas).toEqual([]);
  });
});
