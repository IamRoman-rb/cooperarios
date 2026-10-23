// Cuenta corriente: cargos, pagos, imputaciones, recibos y movimientos de caja.
import { getDb, ahora } from '../db/index.js';
import { local, invalido, conflicto } from '../lib/util.js';

export function saldoCargo(cargoId) {
  return getDb().prepare(`SELECT c.importe - COALESCE((SELECT SUM(importe) FROM imputaciones WHERE cargo_id = c.id), 0)
    FROM cargos c WHERE c.id = ?`).pluck().get(cargoId);
}

/** Cargos de la persona con su saldo y estado efectivo (vencido si pasó la fecha). */
export function cargosDe(personaId, { soloPendientes = false } = {}) {
  const hoy = local().fecha;
  return getDb().prepare(`
    SELECT c.*, co.tipo AS concepto_tipo, co.nombre AS concepto,
      c.importe - COALESCE((SELECT SUM(importe) FROM imputaciones WHERE cargo_id = c.id), 0) AS saldo
    FROM cargos c JOIN conceptos co ON co.id = c.concepto_id
    WHERE c.persona_id = ? ${soloPendientes ? "AND c.estado IN ('pendiente','parcial')" : ''}
    ORDER BY c.vencimiento DESC, c.id DESC`).all(personaId)
    .map((c) => ({ ...c, situacion: c.estado === 'pagado' ? 'pagado' : c.estado === 'anulado' ? 'anulado' : c.vencimiento < hoy ? 'vencido' : 'pendiente' }));
}

export function resumenCuenta(personaId) {
  const cargos = cargosDe(personaId, { soloPendientes: true });
  const deuda = cargos.reduce((s, c) => s + c.saldo, 0);
  const vencido = cargos.filter((c) => c.situacion === 'vencido').reduce((s, c) => s + c.saldo, 0);
  const proximo = cargos.filter((c) => c.situacion !== 'vencido').sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))[0];
  return { deuda, vencido, proximo_vencimiento: proximo?.vencimiento ?? null, cargos_pendientes: cargos.length };
}

export function periodoCerrado(fechaIso) {
  const [anio, mes] = fechaIso.slice(0, 7).split('-').map(Number);
  return !!getDb().prepare('SELECT 1 FROM periodos_contables WHERE anio = ? AND mes = ? AND cerrado_en IS NOT NULL').get(anio, mes);
}

export function exigirPeriodoAbierto(fechaIso) {
  if (periodoCerrado(fechaIso)) throw conflicto('El período contable está cerrado: registrá la corrección en el período abierto');
}

function siguienteNumero(tipo) {
  const prefijo = { recibo: 'R', nota_credito: 'NC', factura_b: 'FB', factura_c: 'FC' }[tipo];
  const ultimo = getDb().prepare(`SELECT numero FROM comprobantes WHERE tipo = ? ORDER BY id DESC LIMIT 1`).pluck().get(tipo);
  const n = ultimo ? Number(ultimo.split('-').pop()) + 1 : 1;
  return `${prefijo}-0001-${String(n).padStart(8, '0')}`;
}

export function cajaPorMedio(medio) {
  const db = getDb();
  const tipo = { efectivo: 'efectivo', transferencia: 'transferencia', mercadopago: 'mercadopago', billetera: 'billetera' }[medio] ?? 'transferencia';
  return db.prepare('SELECT caja_id FROM medios_pago WHERE tipo = ? AND activo = 1 ORDER BY id LIMIT 1').pluck().get(tipo)
    ?? db.prepare('SELECT id FROM cajas ORDER BY id LIMIT 1').pluck().get();
}

/**
 * Registra un pago y lo imputa a los cargos indicados (por vencimiento). Los pagos parciales
 * dejan el saldo pendiente. Emite recibo y registra el ingreso en la caja del medio.
 * Debe llamarse dentro de una transacción.
 */
export function registrarPago({ personaId, medio, importe, cargoIds, referencia = null, usuarioId = null, cajaId = null }) {
  const db = getDb();
  const fecha = ahora();
  exigirPeriodoAbierto(fecha);
  if (!(importe > 0)) throw invalido('El importe debe ser mayor a cero');
  const cargos = db.prepare(`SELECT * FROM cargos WHERE id IN (${cargoIds.map(() => '?').join(',')}) AND persona_id = ?
    AND estado IN ('pendiente','parcial') ORDER BY vencimiento, id`).all(...cargoIds, personaId);
  if (cargos.length !== cargoIds.length) throw invalido('Algún cargo no existe, no es de la persona o ya está pago');
  const totalSaldo = cargos.reduce((s, c) => s + saldoCargo(c.id), 0);
  if (importe > totalSaldo) throw invalido('El importe supera la deuda de los cargos elegidos');

  const caja = cajaId ?? cajaPorMedio(medio);
  const pagoId = db.prepare(`INSERT INTO pagos (persona_id, fecha, medio, caja_id, importe, referencia, registrado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`).get(personaId, fecha, medio, caja, importe, referencia, usuarioId).id;

  let resto = importe;
  for (const c of cargos) {
    if (resto <= 0) break;
    const saldo = saldoCargo(c.id);
    const aplicado = Math.min(saldo, resto);
    db.prepare('INSERT INTO imputaciones (pago_id, cargo_id, importe) VALUES (?, ?, ?)').run(pagoId, c.id, aplicado);
    db.prepare('UPDATE cargos SET estado = ? WHERE id = ?').run(aplicado === saldo ? 'pagado' : 'parcial', c.id);
    resto -= aplicado;
  }
  const numero = siguienteNumero('recibo');
  const comprobanteId = db.prepare(`INSERT INTO comprobantes (tipo, numero, persona_id, pago_id, fecha, total)
    VALUES ('recibo', ?, ?, ?, ?, ?) RETURNING id`).get(numero, personaId, pagoId, fecha, importe).id;
  db.prepare(`INSERT INTO movimientos_caja (caja_id, fecha, tipo, importe, concepto, ref_tipo, ref_id, usuario_id)
    VALUES (?, ?, 'ingreso', ?, ?, 'pago', ?, ?)`).run(caja, fecha, importe, `Cobro ${numero}`, pagoId, usuarioId);
  return { pagoId, comprobanteId, numero };
}

/** Corrige un cargo sin editarlo: nota de crédito que lo cancela (total o parcialmente). */
export function notaCredito({ cargoId, importe, motivo, usuarioId }) {
  const db = getDb();
  const cargo = db.prepare('SELECT * FROM cargos WHERE id = ?').get(cargoId);
  if (!cargo) throw invalido('Cargo inexistente');
  const saldo = saldoCargo(cargoId);
  if (importe > saldo) throw invalido('La nota de crédito supera el saldo del cargo');
  exigirPeriodoAbierto(ahora());
  const pagoId = db.prepare(`INSERT INTO pagos (persona_id, fecha, medio, importe, referencia, registrado_por)
    VALUES (?, ?, 'otro', ?, ?, ?) RETURNING id`).get(cargo.persona_id, ahora(), importe, `Nota de crédito: ${motivo}`, usuarioId).id;
  db.prepare('INSERT INTO imputaciones (pago_id, cargo_id, importe) VALUES (?, ?, ?)').run(pagoId, cargoId, importe);
  db.prepare('UPDATE cargos SET estado = ? WHERE id = ?').run(importe === saldo ? (importe === cargo.importe ? 'anulado' : 'pagado') : 'parcial', cargoId);
  const numero = siguienteNumero('nota_credito');
  db.prepare(`INSERT INTO comprobantes (tipo, numero, persona_id, pago_id, fecha, total) VALUES ('nota_credito', ?, ?, ?, ?, ?)`)
    .run(numero, cargo.persona_id, pagoId, ahora(), importe);
  return { numero };
}

export function crearCargo({ personaId, conceptoTipo, descripcion, periodo, importe, vencimiento, origenTipo = null, origenId = null }) {
  const db = getDb();
  const conceptoId = db.prepare('SELECT id FROM conceptos WHERE tipo = ? ORDER BY id LIMIT 1').pluck().get(conceptoTipo);
  return db.prepare(`INSERT INTO cargos (persona_id, concepto_id, descripcion, periodo, importe, vencimiento, origen_tipo, origen_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).get(personaId, conceptoId, descripcion, periodo, importe, vencimiento, origenTipo, origenId).id;
}
