// Cobranzas: cuenta corriente, cobros en efectivo con recibo, transferencias informadas,
// pagos online y su conciliación, notas de crédito, morosidad y comprobantes.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora, enTransaccion } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso, puede, ambitoActividades } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, local, json, HttpError, marcas, zId } from '../lib/util.js';
import { auditar, notificar, usuarioDePersona } from '../lib/auditoria.js';
import { registrarPago, notaCredito, cargosDe, resumenCuenta, crearCargo, saldoCargo } from '../services/cuenta.js';
import { firmaValida, consultarPago, acreditar } from '../services/mercadopago.js';
import { config } from '../config.js';
import { sha256 } from '../lib/auth.js';

const r = Router();

// ---------- Notificación de Mercado Pago (firmada) ----------
r.post('/pagos/webhook/mercadopago', async (req, res) => {
  if (config.mercadoPago.simulado) return res.status(200).json({ ignorado: true });
  if (!firmaValida(req)) throw new HttpError(401, 'Firma inválida');
  const tipo = req.query.type ?? req.body?.type;
  const paymentId = req.query['data.id'] ?? req.body?.data?.id;
  if (tipo !== 'payment' || !paymentId) return res.json({ ok: true });
  const pago = await consultarPago(paymentId);
  acreditar({ pagoOnlineId: String(pago.external_reference), paymentId: String(pago.id), estado: pago.status, notificacionHash: sha256(JSON.stringify(req.body)) });
  res.json({ ok: true });
});

r.use('/cobranzas', requiereSesion);

// ---------- Panel de cobranzas ----------
r.get('/cobranzas/resumen', permiso('cuenta_corriente', 'leer', 'gestionar'), (_req, res) => {
  const db = getDb();
  const periodo = local().periodo;
  const hoy = local().fecha;
  res.json({
    periodo,
    emitido: db.prepare(`SELECT COALESCE(SUM(importe),0) FROM cargos WHERE periodo = ? AND estado != 'anulado'`).pluck().get(periodo),
    cobrado: db.prepare(`SELECT COALESCE(SUM(importe),0) FROM pagos WHERE substr(fecha,1,7) = ? AND estado = 'acreditado' AND medio != 'otro'`).pluck().get(periodo),
    vencido: db.prepare(`SELECT COALESCE(SUM(c.importe - COALESCE((SELECT SUM(importe) FROM imputaciones WHERE cargo_id = c.id),0)),0) FROM cargos c WHERE c.estado IN ('pendiente','parcial') AND c.vencimiento < ?`).pluck().get(hoy),
    morosos: db.prepare(`SELECT COUNT(DISTINCT persona_id) FROM cargos WHERE estado IN ('pendiente','parcial') AND vencimiento < ?`).pluck().get(hoy),
    transferencias_pendientes: db.prepare(`SELECT COUNT(*) FROM transferencias_informadas WHERE estado = 'pendiente'`).pluck().get(),
    por_medio: db.prepare(`SELECT medio, COUNT(*) AS n, SUM(importe) AS total FROM pagos WHERE substr(fecha,1,7) = ? AND estado = 'acreditado' AND medio != 'otro' GROUP BY medio`).all(periodo),
  });
});

/** Morosidad con antigüedad de deuda. El delegado ve solo la deuda agregada de su actividad. */
r.get('/cobranzas/morosidad', permiso('cuenta_corriente', 'leer', 'gestionar', 'leer_ambito'), (req, res) => {
  const db = getDb();
  const hoy = local().fecha;
  const filas = db.prepare(`SELECT c.persona_id, p.nombre, p.apellido, s.nro_socio, p.telefono, p.email,
      SUM(c.importe - COALESCE((SELECT SUM(importe) FROM imputaciones WHERE cargo_id = c.id),0)) AS deuda,
      MIN(c.vencimiento) AS desde, COUNT(*) AS cargos
    FROM cargos c JOIN personas p ON p.id = c.persona_id LEFT JOIN socios s ON s.persona_id = p.id
    WHERE c.estado IN ('pendiente','parcial') AND c.vencimiento < ?
    GROUP BY c.persona_id ORDER BY deuda DESC`).all(hoy)
    .map((f) => {
      const dias = Math.round((new Date(hoy) - new Date(f.desde)) / 86400000);
      return { ...f, dias, tramo: dias <= 30 ? '0-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '+90' };
    });
  if (!puede(req.usuario, 'cuenta_corriente', 'leer')) {
    const ambito = ambitoActividades(req.usuario);
    const deuda = db.prepare(`SELECT COUNT(DISTINCT c.persona_id) AS personas, COALESCE(SUM(c.importe),0) AS total FROM cargos c
      JOIN inscripciones i ON c.origen_tipo = 'inscripcion' AND c.origen_id = i.id JOIN grupos g ON g.id = i.grupo_id
      WHERE g.actividad_id IN (${marcas(ambito)}) AND c.estado IN ('pendiente','parcial') AND c.vencimiento < ?`).get(...ambito, hoy);
    return res.json({ agregado: deuda });
  }
  res.json({ filas, tramos: ['0-30', '31-60', '61-90', '+90'].map((t) => ({ tramo: t, personas: filas.filter((f) => f.tramo === t).length, total: filas.filter((f) => f.tramo === t).reduce((s, f) => s + f.deuda, 0) })) });
});

r.get('/cobranzas/cuenta/:personaId', permiso('cuenta_corriente', 'leer', 'gestionar'), (req, res) => {
  const id = req.params.personaId;
  const db = getDb();
  res.json({
    persona: db.prepare(`SELECT p.id, p.nombre, p.apellido, p.dni, s.nro_socio FROM personas p LEFT JOIN socios s ON s.persona_id = p.id WHERE p.id = ?`).get(id),
    resumen: resumenCuenta(id),
    cargos: cargosDe(id),
    pagos: db.prepare(`SELECT pg.*, c.numero AS recibo FROM pagos pg LEFT JOIN comprobantes c ON c.pago_id = pg.id WHERE pg.persona_id = ? ORDER BY pg.fecha DESC`).all(id),
  });
});

r.get('/cobranzas/buscar', permiso('cuenta_corriente', 'leer', 'gestionar'), (req, res) => {
  const q = `%${req.query.q ?? ''}%`;
  res.json(getDb().prepare(`SELECT p.id, p.nombre, p.apellido, p.dni, s.nro_socio FROM personas p LEFT JOIN socios s ON s.persona_id = p.id
    WHERE p.apellido || ' ' || p.nombre LIKE ? OR p.dni LIKE ? OR CAST(s.nro_socio AS TEXT) LIKE ? ORDER BY p.apellido LIMIT 15`).all(q, q, q));
});

/** Cobro en Administración (efectivo u otro medio) con recibo numerado. */
r.post('/cobranzas/cobros', permiso('cuenta_corriente', 'gestionar'), (req, res) => {
  const d = validar(z.object({ persona_id: zId, cargo_ids: z.array(zId).min(1), importe: z.number().int().positive(),
    medio: z.enum(['efectivo', 'transferencia', 'billetera', 'otro']).default('efectivo'), referencia: z.string().max(120).optional() }), req.body);
  const out = enTransaccion(() => registrarPago({ personaId: d.persona_id, medio: d.medio, importe: d.importe, cargoIds: d.cargo_ids, referencia: d.referencia, usuarioId: req.usuario.id }));
  auditar(req, 'registrar_cobro', 'pagos', out.pagoId, null, d);
  res.status(201).json(out);
});

r.post('/cobranzas/cargos', permiso('cuenta_corriente', 'gestionar'), (req, res) => {
  const d = validar(z.object({ persona_id: zId, concepto_tipo: z.enum(['cuota_social', 'arancel', 'alquiler', 'invitado', 'llave', 'revision_medica', 'otro']),
    descripcion: z.string().min(3), importe: z.number().int().positive(), vencimiento: z.string() }), req.body);
  const id = crearCargo({ personaId: d.persona_id, conceptoTipo: d.concepto_tipo, descripcion: d.descripcion, periodo: d.vencimiento.slice(0, 7), importe: d.importe, vencimiento: d.vencimiento, origenTipo: 'ajuste' });
  auditar(req, 'crear_cargo', 'cargos', id, null, d);
  res.status(201).json({ id });
});

r.post('/cobranzas/notas-credito', permiso('cuenta_corriente', 'gestionar'), (req, res) => {
  const d = validar(z.object({ cargo_id: zId, importe: z.number().int().positive(), motivo: z.string().min(5) }), req.body);
  const out = enTransaccion(() => notaCredito({ cargoId: d.cargo_id, importe: d.importe, motivo: d.motivo, usuarioId: req.usuario.id }));
  auditar(req, 'nota_credito', 'cargos', d.cargo_id, null, d);
  res.status(201).json(out);
});

r.post('/cobranzas/recordatorios', permiso('cuenta_corriente', 'gestionar'), (req, res) => {
  const { persona_ids } = validar(z.object({ persona_ids: z.array(zId).min(1) }), req.body);
  let enviados = 0;
  for (const id of persona_ids) {
    const u = usuarioDePersona(id);
    if (u) { notificar({ usuarioId: u, tipo: 'cobranza', titulo: 'Recordatorio: tenés cargos vencidos. Regularizá en Mis pagos.', referencia: '/pagos' }); enviados++; }
  }
  res.json({ enviados });
});

// ---------- Transferencias informadas y pagos online (conciliación) ----------
r.get('/cobranzas/transferencias', permiso('pagos_online', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const estado = req.query.estado ?? 'pendiente';
  res.json(db.prepare(`SELECT t.*, p.nombre, p.apellido, s.nro_socio FROM transferencias_informadas t JOIN personas p ON p.id = t.persona_id
    LEFT JOIN socios s ON s.persona_id = p.id WHERE (? = 'todas' OR t.estado = ?) ORDER BY t.id DESC LIMIT 200`).all(estado, estado)
    .map((t) => ({ ...t, cargos: json(t.cargo_ids, []).map((id) => db.prepare('SELECT id, descripcion, importe, estado FROM cargos WHERE id = ?').get(id)) })));
});

r.post('/cobranzas/transferencias/:id/revisar', permiso('pagos_online', 'gestionar'), (req, res) => {
  const d = validar(z.object({ aprobar: z.boolean(), motivo: z.string().optional() }), req.body);
  const db = getDb();
  const t = db.prepare('SELECT * FROM transferencias_informadas WHERE id = ?').get(req.params.id);
  if (!t) throw noEncontrado('Transferencia');
  if (t.estado !== 'pendiente') throw invalido('La transferencia ya fue revisada');
  if (!d.aprobar && !d.motivo) throw invalido('Indicá el motivo del rechazo');
  const out = enTransaccion(() => {
    let pago = null;
    if (d.aprobar) {
      const cargoIds = json(t.cargo_ids, []).filter((id) => saldoCargo(id) > 0);
      if (!cargoIds.length) throw invalido('Los cargos ya fueron cancelados por otro medio');
      pago = registrarPago({ personaId: t.persona_id, medio: t.medio, importe: Math.min(t.monto, cargoIds.reduce((s, id) => s + saldoCargo(id), 0)), cargoIds, referencia: t.referencia, usuarioId: req.usuario.id });
    }
    db.prepare('UPDATE transferencias_informadas SET estado = ?, motivo_rechazo = ?, revisada_por = ?, revisada_en = ? WHERE id = ?')
      .run(d.aprobar ? 'aprobada' : 'rechazada', d.aprobar ? null : d.motivo, req.usuario.id, ahora(), t.id);
    return pago;
  });
  const u = usuarioDePersona(t.persona_id);
  if (u) notificar({ usuarioId: u, tipo: 'pago', titulo: d.aprobar ? `Transferencia acreditada. Recibo ${out.numero}` : `Transferencia rechazada: ${d.motivo}`, referencia: '/pagos' });
  auditar(req, d.aprobar ? 'aprobar_transferencia' : 'rechazar_transferencia', 'transferencias_informadas', t.id, { estado: 'pendiente' }, { estado: d.aprobar ? 'aprobada' : 'rechazada', motivo: d.motivo });
  res.json({ ok: true, recibo: out?.numero ?? null });
});

r.get('/cobranzas/pagos-online', permiso('pagos_online', 'leer', 'gestionar'), (_req, res) => {
  const db = getDb();
  res.json({
    pagos: db.prepare(`SELECT po.*, p.nombre, p.apellido FROM pagos_online po JOIN personas p ON p.id = po.persona_id ORDER BY po.id DESC LIMIT 200`).all(),
    totales: db.prepare(`SELECT estado, COUNT(*) AS n, SUM(monto) AS monto, SUM(comision) AS comision FROM pagos_online GROUP BY estado`).all(),
  });
});

// ---------- Comprobantes ----------
r.get('/cobranzas/comprobantes', permiso('comprobantes', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const periodo = req.query.periodo ?? local().periodo;
  res.json(db.prepare(`SELECT c.*, p.nombre, p.apellido, pg.medio FROM comprobantes c LEFT JOIN personas p ON p.id = c.persona_id LEFT JOIN pagos pg ON pg.id = c.pago_id
    WHERE substr(c.fecha,1,7) = ? ${req.query.tipo ? 'AND c.tipo = ?' : ''} ORDER BY c.id DESC LIMIT 500`).all(...[periodo, ...(req.query.tipo ? [req.query.tipo] : [])]));
});

r.get('/cobranzas/comprobantes/:id', permiso('comprobantes', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const c = db.prepare('SELECT * FROM comprobantes WHERE id = ?').get(req.params.id);
  if (!c) throw noEncontrado('Comprobante');
  res.json({ ...c, persona: db.prepare('SELECT nombre, apellido, dni FROM personas WHERE id = ?').get(c.persona_id), pago: db.prepare('SELECT * FROM pagos WHERE id = ?').get(c.pago_id),
    items: db.prepare(`SELECT ca.descripcion, ca.periodo, im.importe FROM imputaciones im JOIN cargos ca ON ca.id = im.cargo_id WHERE im.pago_id = ?`).all(c.pago_id) });
});

/** Cuentas a cobrar: cargos emitidos con antigüedad (Contabilidad). */
r.get('/cobranzas/cuentas-a-cobrar', permiso('cuenta_corriente', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const periodo = req.query.periodo ?? local().periodo;
  res.json({
    por_concepto: db.prepare(`SELECT co.nombre AS concepto, COUNT(*) AS cargos, SUM(c.importe) AS emitido,
        SUM(COALESCE((SELECT SUM(importe) FROM imputaciones WHERE cargo_id = c.id),0)) AS cobrado
      FROM cargos c JOIN conceptos co ON co.id = c.concepto_id WHERE c.periodo = ? AND c.estado != 'anulado' GROUP BY co.id`).all(periodo),
    cargos: db.prepare(`SELECT c.*, co.nombre AS concepto, p.nombre, p.apellido, s.nro_socio,
        c.importe - COALESCE((SELECT SUM(importe) FROM imputaciones WHERE cargo_id = c.id),0) AS saldo
      FROM cargos c JOIN conceptos co ON co.id = c.concepto_id JOIN personas p ON p.id = c.persona_id LEFT JOIN socios s ON s.persona_id = p.id
      WHERE c.periodo = ? ORDER BY c.id DESC LIMIT 400`).all(periodo),
    periodos: db.prepare('SELECT DISTINCT periodo FROM cargos ORDER BY periodo DESC LIMIT 24').pluck().all(),
  });
});

export default r;
