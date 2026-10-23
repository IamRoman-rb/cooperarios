import { crearApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { sembrar } from './db/seed.js';
import { iniciarTareas } from './services/tareas.js';

const db = getDb();
if (!config.produccion && db.prepare('SELECT COUNT(*) FROM usuarios').pluck().get() === 0) {
  db.transaction(() => sembrar(db))();
  console.log('Base vacía: se cargaron los datos de demostración.');
}
iniciarTareas();

crearApp().listen(config.puerto, () => {
  console.log(`API del Club Los Cooperarios en http://localhost:${config.puerto}`);
});
