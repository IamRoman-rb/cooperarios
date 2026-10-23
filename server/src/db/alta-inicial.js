// Instalación de producción: crea los catálogos base y el primer usuario con los roles indicados.
// Uso: npm run alta-inicial --workspace server -- admin@cooperariosclub.com.ar "Nombre" "Apellido" DNI admin,sistemas
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { abrirBase, migrar } from './index.js';
import { sembrarBase } from './seed.js';

const [email, nombre, apellido, dni, roles = 'admin'] = process.argv.slice(2);
if (!email || !nombre || !apellido || !dni) {
  console.error('Uso: alta-inicial <email> <nombre> <apellido> <dni> [roles separados por coma]');
  process.exit(1);
}

const db = abrirBase();
migrar(db);
const password = crypto.randomBytes(9).toString('base64url');
db.transaction(() => {
  if (db.prepare('SELECT COUNT(*) FROM roles').pluck().get() === 0) sembrarBase(db);
  const personaId = db.prepare('SELECT id FROM personas WHERE dni = ?').pluck().get(dni)
    ?? db.prepare(`INSERT INTO personas (dni, nombre, apellido, email, tipo) VALUES (?, ?, ?, ?, 'empleado')`).run(dni, nombre, apellido, email).lastInsertRowid;
  const usuarioId = db.prepare('INSERT INTO usuarios (persona_id, email, password_hash) VALUES (?, ?, ?)').run(personaId, email, bcrypt.hashSync(password, 11)).lastInsertRowid;
  for (const codigo of roles.split(',')) {
    const rolId = db.prepare('SELECT id FROM roles WHERE codigo = ?').pluck().get(codigo.trim());
    if (!rolId) throw new Error(`Rol inexistente: ${codigo}`);
    db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)').run(usuarioId, rolId);
  }
  db.prepare(`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, despues, creado_en) VALUES (?, 'alta_inicial', 'usuarios', ?, ?, ?)`)
    .run(usuarioId, usuarioId, JSON.stringify({ email, roles }), new Date().toISOString());
})();
console.log(`Usuario ${email} creado con roles: ${roles}`);
console.log(`Contraseña inicial (entregar en mano y cambiar al ingresar): ${password}`);
