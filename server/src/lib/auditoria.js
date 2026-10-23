import { getDb, ahora } from '../db/index.js';

/**
 * Registra un cambio sensible con usuario, fecha y valores anterior y posterior.
 * Se usa para altas y bajas, cargos, pagos, habilitaciones manuales, resultados médicos y cambios de rol.
 */
export function auditar(req, accion, entidad, entidadId, antes = null, despues = null) {
  getDb().prepare(`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, antes, despues, ip, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    req?.usuario?.id ?? null,
    accion,
    entidad,
    entidadId ?? null,
    antes == null ? null : JSON.stringify(antes),
    despues == null ? null : JSON.stringify(despues),
    req?.ip ?? null,
    ahora(),
  );
}

/** Crea una notificación interna para un usuario (o para todos los usuarios con un rol). */
export function notificar({ usuarioId, rol, tipo, titulo, referencia = null }) {
  const db = getDb();
  const ids = usuarioId
    ? [usuarioId]
    : db.prepare(`SELECT DISTINCT ur.usuario_id FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE r.codigo = ?`).pluck().all(rol);
  const st = db.prepare('INSERT INTO notificaciones (usuario_id, tipo, titulo, referencia) VALUES (?, ?, ?, ?)');
  for (const id of ids) st.run(id, tipo, titulo, referencia);
}

export function usuarioDePersona(personaId) {
  return getDb().prepare('SELECT id FROM usuarios WHERE persona_id = ?').pluck().get(personaId) ?? null;
}
