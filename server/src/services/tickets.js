// Gestor de tickets de mantenimiento con evidencia fotográfica (propuesta 6.4).
import { getDb, ahora } from '../db/index.js';
import { invalido, prohibido, noEncontrado, sumarDias, local } from '../lib/util.js';
import { puede } from '../lib/rbac.js';
import { notificar } from '../lib/auditoria.js';

export const PLAZOS_DIAS = { urgente: 0, alta: 2, media: 7, baja: 30 };

export function vencimientoPorPrioridad(prioridad, desde = local().fecha) {
  return `${sumarDias(desde, PLAZOS_DIAS[prioridad])}T23:59:59`;
}

function siguienteCodigo() {
  const anio = local().fecha.slice(0, 4);
  const n = getDb().prepare(`SELECT COUNT(*) FROM tickets_mantenimiento WHERE codigo LIKE ?`).pluck().get(`MT-${anio}-%`) + 1;
  return `MT-${anio}-${String(n).padStart(4, '0')}`;
}

function historial(ticketId, anterior, nuevo, usuarioId) {
  getDb().prepare(`INSERT INTO ticket_historial (ticket_id, estado_anterior, estado_nuevo, usuario_id, creado_en) VALUES (?, ?, ?, ?, ?)`)
    .run(ticketId, anterior, nuevo, usuarioId, ahora());
}

export function crearTicket({ titulo, descripcion, sectorId, categoria, prioridad, fotos = [] }, usuario) {
  const db = getDb();
  const sector = db.prepare('SELECT * FROM sectores WHERE id = ?').get(sectorId);
  if (!sector) throw invalido('Sector inexistente');
  const asignado = sector.responsable_default_id ?? null;
  const id = db.prepare(`INSERT INTO tickets_mantenimiento
    (codigo, titulo, descripcion, sector_id, categoria, prioridad, estado, reportado_por, asignado_a, creado_en, vence_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    siguienteCodigo(), titulo, descripcion, sectorId, categoria, prioridad, asignado ? 'asignado' : 'nuevo',
    usuario.id, asignado, ahora(), vencimientoPorPrioridad(prioridad),
  ).lastInsertRowid;
  historial(id, null, 'nuevo', usuario.id);
  if (asignado) {
    historial(id, 'nuevo', 'asignado', null);
    notificar({ usuarioId: asignado, tipo: 'ticket', titulo: `Nuevo ticket asignado: ${titulo}`, referencia: `/mantenimiento/tickets/${id}` });
  }
  for (const archivo of fotos) agregarFoto(id, 'problema', archivo, usuario.id);
  if (prioridad === 'urgente') notificar({ rol: 'admin', tipo: 'ticket', titulo: `Ticket URGENTE: ${titulo}`, referencia: `/admin/tickets` });
  return id;
}

export function agregarFoto(ticketId, tipo, archivo, usuarioId) {
  getDb().prepare(`INSERT INTO ticket_fotos (ticket_id, tipo, archivo, subido_por, subido_en) VALUES (?, ?, ?, ?, ?)`)
    .run(ticketId, tipo, archivo, usuarioId, ahora());
}

export function comentar(ticketId, usuarioId, texto) {
  getDb().prepare(`INSERT INTO ticket_comentarios (ticket_id, usuario_id, texto, creado_en) VALUES (?, ?, ?, ?)`)
    .run(ticketId, usuarioId, texto, ahora());
}

/**
 * Cambia el estado respetando quién puede hacerlo:
 * asignar (Administración), iniciar y resolver (empleado asignado), cerrar o reabrir (Administración o reportante).
 */
export function transicion(ticketId, accion, usuario, { asignadoA, comentario, costo } = {}) {
  const db = getDb();
  const t = db.prepare('SELECT * FROM tickets_mantenimiento WHERE id = ?').get(ticketId);
  if (!t) throw noEncontrado('Ticket');
  const gestiona = puede(usuario, 'tickets', 'gestionar') && usuario.roles.some((r) => r.codigo === 'admin');
  const esAsignado = t.asignado_a === usuario.id;
  const esReportante = t.reportado_por === usuario.id;
  let nuevo;
  const sets = {};

  switch (accion) {
    case 'asignar':
      if (!puede(usuario, 'tickets', 'gestionar')) throw prohibido();
      if (!asignadoA) throw invalido('Indicá a quién se asigna');
      if (['resuelto', 'cerrado'].includes(t.estado)) throw invalido('El ticket ya fue resuelto');
      nuevo = 'asignado';
      sets.asignado_a = asignadoA;
      notificar({ usuarioId: asignadoA, tipo: 'ticket', titulo: `Se te asignó el ticket ${t.codigo}`, referencia: `/mantenimiento/tickets/${t.id}` });
      break;
    case 'iniciar':
      if (!esAsignado && !gestiona) throw prohibido('Solo el responsable asignado puede iniciar el trabajo');
      if (t.estado !== 'asignado') throw invalido('El ticket debe estar asignado');
      nuevo = 'en_curso';
      break;
    case 'resolver': {
      if (!esAsignado && !gestiona) throw prohibido('Solo el responsable asignado puede resolver');
      if (!['asignado', 'en_curso'].includes(t.estado)) throw invalido('El ticket no está en curso');
      const exigeFoto = db.prepare(`SELECT valor FROM parametros WHERE clave = 'tickets_foto_obligatoria'`).pluck().get() !== 'false';
      const fotos = db.prepare(`SELECT COUNT(*) FROM ticket_fotos WHERE ticket_id = ? AND tipo = 'resolucion'`).pluck().get(t.id);
      if (exigeFoto && fotos === 0) throw invalido('Para marcar como realizado adjuntá al menos una foto del trabajo terminado');
      if (!comentario?.trim()) throw invalido('Agregá un comentario sobre el trabajo realizado');
      nuevo = 'resuelto';
      sets.resuelto_en = ahora();
      if (costo != null) sets.costo = costo;
      notificar({ usuarioId: t.reportado_por, tipo: 'ticket', titulo: `Tu reporte ${t.codigo} fue resuelto`, referencia: `/mantenimiento/tickets/${t.id}` });
      notificar({ rol: 'admin', tipo: 'ticket', titulo: `Ticket ${t.codigo} resuelto: verificar`, referencia: `/admin/tickets` });
      break;
    }
    case 'cerrar':
      if (!gestiona && !esReportante) throw prohibido('Verifica Administración o quien reportó');
      if (t.estado !== 'resuelto') throw invalido('Solo se cierra un ticket resuelto');
      nuevo = 'cerrado';
      sets.verificado_por = usuario.id;
      sets.verificado_en = ahora();
      break;
    case 'reabrir':
      if (!gestiona && !esReportante) throw prohibido();
      if (!['resuelto', 'cerrado'].includes(t.estado)) throw invalido('Solo se reabre un ticket resuelto o cerrado');
      if (!comentario?.trim()) throw invalido('Indicá por qué no estás conforme');
      nuevo = t.asignado_a ? 'asignado' : 'nuevo';
      sets.resuelto_en = null;
      sets.verificado_por = null;
      sets.verificado_en = null;
      if (t.asignado_a) notificar({ usuarioId: t.asignado_a, tipo: 'ticket', titulo: `Ticket ${t.codigo} reabierto`, referencia: `/mantenimiento/tickets/${t.id}` });
      notificar({ rol: 'admin', tipo: 'ticket', titulo: `Ticket ${t.codigo} reabierto`, referencia: `/admin/tickets` });
      break;
    default:
      throw invalido('Acción desconocida');
  }
  const columnas = Object.keys(sets);
  db.prepare(`UPDATE tickets_mantenimiento SET estado = ?${columnas.map((c) => `, ${c} = ?`).join('')} WHERE id = ?`)
    .run(nuevo, ...columnas.map((c) => sets[c]), t.id);
  if (comentario?.trim()) comentar(t.id, usuario.id, comentario.trim());
  historial(t.id, t.estado, nuevo, usuario.id);
  return nuevo;
}

export function detalleTicket(id) {
  const db = getDb();
  const t = db.prepare(`
    SELECT t.*, s.nombre AS sector,
      (SELECT p.nombre || ' ' || p.apellido FROM usuarios u JOIN personas p ON p.id = u.persona_id WHERE u.id = t.reportado_por) AS reportante,
      (SELECT p.nombre || ' ' || p.apellido FROM usuarios u JOIN personas p ON p.id = u.persona_id WHERE u.id = t.asignado_a) AS responsable
    FROM tickets_mantenimiento t JOIN sectores s ON s.id = t.sector_id WHERE t.id = ?`).get(id);
  if (!t) throw noEncontrado('Ticket');
  t.fotos = db.prepare('SELECT id, tipo, archivo, subido_en FROM ticket_fotos WHERE ticket_id = ? ORDER BY id').all(id);
  t.comentarios = db.prepare(`SELECT c.*, p.nombre || ' ' || p.apellido AS autor FROM ticket_comentarios c
    JOIN usuarios u ON u.id = c.usuario_id LEFT JOIN personas p ON p.id = u.persona_id WHERE ticket_id = ? ORDER BY c.id`).all(id);
  t.historial = db.prepare(`SELECT h.*, p.nombre || ' ' || p.apellido AS autor FROM ticket_historial h
    LEFT JOIN usuarios u ON u.id = h.usuario_id LEFT JOIN personas p ON p.id = u.persona_id WHERE ticket_id = ? ORDER BY h.id`).all(id);
  t.vencido = !['resuelto', 'cerrado'].includes(t.estado) && t.vence_en < new Date().toISOString();
  return t;
}
