// Proveedor de pagos intercambiable. Mercado Pago real si hay MP_ACCESS_TOKEN; si no, modo simulado.
// No se guardan datos de tarjetas ni credenciales: solo el identificador y el estado del pago.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb, enTransaccion } from '../db/index.js';
import { json, HttpError } from '../lib/util.js';
import { registrarPago } from './cuenta.js';
import { notificar, usuarioDePersona } from '../lib/auditoria.js';

const API = 'https://api.mercadopago.com';

export async function crearPreferencia({ pagoOnlineId, items, payer }) {
  if (config.mercadoPago.simulado) {
    return { preferencia_id: `SIM-${pagoOnlineId}-${crypto.randomBytes(4).toString('hex')}`, init_point: `/socio/pagos/simulado/${pagoOnlineId}` };
  }
  const r = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mercadoPago.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items.map((i) => ({ title: i.titulo, quantity: 1, unit_price: i.importe / 100, currency_id: 'ARS' })),
      payer: { email: payer.email },
      external_reference: String(pagoOnlineId),
      notification_url: `${config.origenWeb}/api/pagos/webhook/mercadopago`,
      back_urls: { success: `${config.origenWeb}/socio/pagos?estado=ok`, failure: `${config.origenWeb}/socio/pagos?estado=error`, pending: `${config.origenWeb}/socio/pagos?estado=pendiente` },
      auto_return: 'approved',
    }),
  });
  if (!r.ok) throw new HttpError(502, 'No se pudo iniciar el pago con Mercado Pago');
  const pref = await r.json();
  return { preferencia_id: pref.id, init_point: pref.init_point };
}

/** Verifica la firma x-signature de la notificación (HMAC-SHA256 del manifiesto). */
export function firmaValida(req) {
  const firma = req.get('x-signature') ?? '';
  const partes = Object.fromEntries(firma.split(',').map((p) => p.trim().split('=')));
  const dataId = req.query['data.id'] ?? req.body?.data?.id;
  const manifiesto = `id:${dataId};request-id:${req.get('x-request-id') ?? ''};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', config.mercadoPago.webhookSecret).update(manifiesto).digest('hex');
  return !!partes.v1 && partes.v1.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(partes.v1), Buffer.from(esperado));
}

export async function consultarPago(paymentId) {
  const r = await fetch(`${API}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${config.mercadoPago.accessToken}` } });
  if (!r.ok) throw new HttpError(502, 'No se pudo consultar el pago');
  return r.json();
}

/** Acredita un pago online aprobado (idempotente). */
export function acreditar({ pagoOnlineId, paymentId, estado, notificacionHash = null }) {
  return enTransaccion(() => {
    const db = getDb();
    const po = db.prepare('SELECT * FROM pagos_online WHERE id = ?').get(pagoOnlineId);
    if (!po) throw new HttpError(404, 'Pago online inexistente');
    if (po.estado === 'aprobado') return po;
    if (estado !== 'approved') {
      const nuevo = estado === 'rejected' ? 'rechazado' : estado === 'cancelled' ? 'cancelado' : 'pendiente';
      db.prepare('UPDATE pagos_online SET estado = ?, payment_id = ?, notificacion_hash = ? WHERE id = ?').run(nuevo, paymentId, notificacionHash, po.id);
      return { ...po, estado: nuevo };
    }
    const medio = db.prepare(`SELECT * FROM medios_pago WHERE tipo = 'mercadopago' AND activo = 1 LIMIT 1`).get();
    const { pagoId, numero } = registrarPago({
      personaId: po.persona_id, medio: 'mercadopago', importe: po.monto, cargoIds: json(po.cargo_ids, []),
      referencia: `MP ${paymentId}`, cajaId: medio?.caja_id,
    });
    const comision = Math.round(po.monto * ((medio?.comision_pct ?? 0) / 100));
    db.prepare(`UPDATE pagos_online SET estado = 'aprobado', pago_id = ?, payment_id = ?, comision = ?, notificacion_hash = ? WHERE id = ?`)
      .run(pagoId, paymentId, comision, notificacionHash, po.id);
    const usuarioId = usuarioDePersona(po.persona_id);
    if (usuarioId) notificar({ usuarioId, tipo: 'pago', titulo: `Pago acreditado. Recibo ${numero}`, referencia: `/socio/cuenta` });
    return { ...po, estado: 'aprobado', pago_id: pagoId };
  });
}
