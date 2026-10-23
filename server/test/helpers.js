import request from 'supertest';
import { abrirBase, migrar, setDb } from '../src/db/index.js';
import { sembrar, PASSWORD_DEMO } from '../src/db/seed.js';
import { crearApp } from '../src/app.js';

/** Base en memoria con los datos de demostración y la app lista para pedir. */
export function entorno() {
  const db = abrirBase(':memory:');
  migrar(db);
  setDb(db);
  const ids = db.transaction(() => sembrar(db))();
  return { db, ids, app: crearApp() };
}

/** Agente con sesión iniciada para un usuario demo (p. ej. "socio"). */
export async function como(app, usuario) {
  const agente = request.agent(app);
  const res = await agente.post('/api/auth/login').set('x-requested-with', 'cooperarios').send({ email: `${usuario}@demo.coop`, password: PASSWORD_DEMO });
  if (res.status !== 200) throw new Error(`Login ${usuario}: ${res.status} ${JSON.stringify(res.body)}`);
  const envolver = (metodo) => (url) => agente[metodo](url).set('x-requested-with', 'cooperarios');
  return { get: envolver('get'), post: envolver('post'), put: envolver('put'), delete: envolver('delete'), agente };
}
