// Contabilidad (gestión) y Comisión Directiva (lectura y aprobación): caja y bancos, ingresos por
// medio de pago, gastos, personal, proveedores y compras, presupuesto, honorarios, reportes y cierres.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora, enTransaccion } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso, puede } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, prohibido, local, sumarMeses, zId } from '../lib/util.js';
import { auditar, notificar } from '../lib/auditoria.js';
import { exigirPeriodoAbierto } from '../services/cuenta.js';
import { subida, rutaRelativa } from '../services/archivos.js';

const r = Router();
r.use(requiereSesion);

const umbral = () => Number(getDb().prepare(`SELECT valor FROM parametros WHERE clave = 'umbral_aprobacion_gastos'`).pluck().get() ?? 30000000);
const mesesAtras = (n) => Array.from({ length: n }, (_, i) => sumarMeses(`${local().periodo}-01`, -(n - 1 - i)).slice(0, 7));

function movimiento(cajaId, tipo, importe, concepto, refTipo, refId, usuarioId) {
  getDb().prepare(`INSERT INTO movimientos_caja (caja_id, fecha, tipo, importe, concepto, ref_tipo, ref_id, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(cajaId, ahora(), tipo, importe, concepto, refTipo, refId, usuarioId);
}

function saldosCajas() {
  return getDb().prepare(`SELECT c.*, COALESCE((SELECT SUM(importe) FROM movimientos_caja WHERE caja_id = c.id), 0) AS saldo FROM cajas c ORDER BY c.id`).all();
}

/** Ingresos del período por origen y por medio de pago (incluye efectivo e ingresos varios). */
function ingresosPeriodo(periodo) {
  const db = getDb();
  const porOrigen = db.prepare(`SELECT co.tipo AS origen, SUM(im.importe) AS total FROM imputaciones im JOIN pagos pg ON pg.id = im.pago_id
    JOIN cargos c ON c.id = im.cargo_id JOIN conceptos co ON co.id = c.concepto_id
    WHERE substr(pg.fecha,1,7) = ? AND pg.medio != 'otro' AND pg.estado = 'acreditado' GROUP BY co.tipo`).all(periodo);
  const varios = db.prepare(`SELECT origen, SUM(importe) AS total FROM ingresos_varios WHERE substr(fecha,1,7) = ? GROUP BY origen`).all(periodo);
  const porMedio = db.prepare(`SELECT medio, SUM(total) AS total FROM (
      SELECT medio, importe AS total FROM pagos WHERE substr(fecha,1,7) = ? AND medio != 'otro' AND estado = 'acreditado'
      UNION ALL SELECT medio, importe FROM ingresos_varios WHERE substr(fecha,1,7) = ?) GROUP BY medio`).all(periodo, periodo);
  const total = porMedio.reduce((s, x) => s + x.total, 0);
  return { periodo, total, por_origen: [...porOrigen, ...varios.map((v) => ({ origen: v.origen, total: v.total }))], por_medio: porMedio };
}

function egresosPeriodo(periodo) {
  const db = getDb();
  const gastos = db.prepare(`SELECT COALESCE(SUM(importe),0) FROM gastos WHERE substr(fecha,1,7) = ? AND estado IN ('registrado','aprobado')`).pluck().get(periodo);
  const nomina = db.prepare(`SELECT COALESCE(SUM(neto),0) FROM remuneraciones WHERE periodo = ?`).pluck().get(periodo);
  const honorarios = db.prepare(`SELECT COALESCE(SUM(monto),0) FROM honorarios WHERE periodo = ? AND estado IN ('autorizado','pagado','liquidado')`).pluck().get(periodo);
  return { gastos, nomina, honorarios, total: gastos + nomina + honorarios };
}

// ---------- Resumen financiero ----------
r.get('/resumen', permiso('caja', 'leer', 'gestionar'), (_req, res) => {
  const db = getDb();
  const periodo = local().periodo;
  const meses = mesesAtras(6);
  res.json({
    periodo,
    ingresos: ingresosPeriodo(periodo),
    egresos: egresosPeriodo(periodo),
    cajas: saldosCajas(),
    evolucion: meses.map((m) => ({ periodo: m, ingresos: ingresosPeriodo(m).total, egresos: egresosPeriodo(m).total })),
    vencimientos: db.prepare(`SELECT f.*, p.razon_social FROM facturas_proveedor f JOIN proveedores p ON p.id = f.proveedor_id WHERE f.estado IN ('cargada','autorizada') ORDER BY f.vence LIMIT 8`).all(),
    pendientes: {
      gastos: db.prepare(`SELECT COUNT(*) FROM gastos WHERE estado = 'pendiente_aprobacion'`).pluck().get(),
      transferencias: db.prepare(`SELECT COUNT(*) FROM transferencias_informadas WHERE estado = 'pendiente'`).pluck().get(),
      facturas: db.prepare(`SELECT COUNT(*) FROM facturas_proveedor WHERE estado = 'cargada'`).pluck().get(),
    },
  });
});

// ---------- Caja y bancos ----------
r.get('/caja', permiso('caja', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const cajaId = req.query.caja_id ? String(req.query.caja_id) : null;
  res.json({
    cajas: saldosCajas(),
    movimientos: db.prepare(`SELECT m.*, c.nombre AS caja FROM movimientos_caja m JOIN cajas c ON c.id = m.caja_id ${cajaId ? 'WHERE m.caja_id = ?' : ''}
      ORDER BY m.fecha DESC, m.id DESC LIMIT 300`).all(...(cajaId ? [cajaId] : [])),
    medios: db.prepare('SELECT m.*, c.nombre AS caja FROM medios_pago m LEFT JOIN cajas c ON c.id = m.caja_id').all(),
  });
});

/** Arqueo: registra el conteo físico y, si hay diferencia, un ajuste con motivo. */
r.post('/caja/arqueo', permiso('caja', 'gestionar'), (req, res) => {
  const d = validar(z.object({ caja_id: zId, contado: z.number().int().min(0), observacion: z.string().max(300).optional() }), req.body);
  const saldo = saldosCajas().find((c) => c.id === d.caja_id);
  if (!saldo) throw noEncontrado('Caja');
  const diferencia = d.contado - saldo.saldo;
  enTransaccion(() => {
    movimiento(d.caja_id, 'arqueo', 0, `Arqueo: contado ${d.contado / 100} · sistema ${saldo.saldo / 100}${d.observacion ? ` · ${d.observacion}` : ''}`, 'arqueo', null, req.usuario.id);
    if (diferencia !== 0) movimiento(d.caja_id, 'ajuste', diferencia, `Diferencia de arqueo${d.observacion ? `: ${d.observacion}` : ''}`, 'arqueo', null, req.usuario.id);
  });
  auditar(req, 'arqueo', 'cajas', d.caja_id, { saldo: saldo.saldo }, { contado: d.contado, diferencia });
  res.json({ diferencia });
});

r.post('/caja/movimientos', permiso('caja', 'gestionar'), (req, res) => {
  const d = validar(z.object({ caja_id: zId, caja_destino_id: zId.optional(), importe: z.number().int().positive(), concepto: z.string().min(3) }), req.body);
  exigirPeriodoAbierto(ahora());
  enTransaccion(() => {
    if (d.caja_destino_id) {
      movimiento(d.caja_id, 'egreso', -d.importe, `Transferencia interna: ${d.concepto}`, 'transferencia_interna', null, req.usuario.id);
      movimiento(d.caja_destino_id, 'ingreso', d.importe, `Transferencia interna: ${d.concepto}`, 'transferencia_interna', null, req.usuario.id);
    } else movimiento(d.caja_id, 'ingreso', d.importe, d.concepto, 'manual', null, req.usuario.id);
  });
  auditar(req, 'movimiento_caja', 'cajas', d.caja_id, null, d);
  res.status(201).json({ ok: true });
});

// ---------- Ingresos del club ----------
r.get('/ingresos', permiso('ingresos', 'leer', 'gestionar'), (req, res) => {
  const db = getDb();
  const periodo = String(req.query.periodo ?? local().periodo);
  res.json({
    ...ingresosPeriodo(periodo),
    evolucion: mesesAtras(12).map((m) => ({ periodo: m, ...Object.fromEntries(ingresosPeriodo(m).por_medio.map((x) => [x.medio, x.total])), total: ingresosPeriodo(m).total })),
    efectivo: db.prepare(`SELECT pg.*, p.nombre, p.apellido, c.numero AS recibo FROM pagos pg LEFT JOIN personas p ON p.id = pg.persona_id
      LEFT JOIN comprobantes c ON c.pago_id = pg.id WHERE pg.medio = 'efectivo' AND substr(pg.fecha,1,7) = ? ORDER BY pg.fecha DESC`).all(periodo),
    varios: db.prepare(`SELECT * FROM ingresos_varios WHERE substr(fecha,1,7) = ? ORDER BY fecha DESC`).all(periodo),
  });
});

r.post('/ingresos', permiso('ingresos', 'gestionar'), subida('comprobantes', { maxMb: 5, campos: 1 }).single('comprobante'), (req, res) => {
  const d = validar(z.object({ origen: z.enum(['donacion', 'sponsor', 'evento', 'alquiler', 'otro']), descripcion: z.string().min(3), importe: z.coerce.number().int().positive(),
    medio: z.enum(['efectivo', 'transferencia', 'mercadopago', 'billetera']), caja_id: zId, fecha: z.string().optional() }), req.body);
  const fecha = d.fecha ? new Date(d.fecha).toISOString() : ahora();
  exigirPeriodoAbierto(fecha);
  const id = enTransaccion(() => {
    const nuevo = getDb().prepare(`INSERT INTO ingresos_varios (fecha, origen, descripcion, importe, medio, caja_id, comprobante_archivo, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .get(fecha, d.origen, d.descripcion, d.importe, d.medio, d.caja_id, req.file ? rutaRelativa('comprobantes', req.file) : null, req.usuario.id).id;
    movimiento(d.caja_id, 'ingreso', d.importe, d.descripcion, 'ingreso_vario', nuevo, req.usuario.id);
    return nuevo;
  });
  auditar(req, 'ingreso_vario', 'ingresos_varios', id, null, d);
  res.status(201).json({ id });
});

// ---------- Gastos ----------
r.get('/gastos', permiso('gastos', 'leer', 'gestionar', 'aprobar', 'solicitar'), (req, res) => {
  const db = getDb();
  const f = [];
  const p = [];
  if (req.query.periodo) { f.push('substr(g.fecha,1,7) = ?'); p.push(req.query.periodo); }
  if (req.query.categoria_id) { f.push('g.categoria_id = ?'); p.push(String(req.query.categoria_id)); }
  if (req.query.estado) { f.push('g.estado = ?'); p.push(req.query.estado); }
  if (req.query.medio) { f.push('g.medio_pago = ?'); p.push(req.query.medio); }
  // Quien solo solicita ve sus propios pedidos.
  if (!puede(req.usuario, 'gastos', 'leer')) { f.push('g.registrado_por = ?'); p.push(req.usuario.id); }
  const where = f.length ? `WHERE ${f.join(' AND ')}` : '';
  res.json({
    gastos: db.prepare(`SELECT g.*, cg.nombre AS categoria, pr.razon_social AS proveedor, c.nombre AS caja,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = g.registrado_por) AS registrado,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = g.aprobado_por) AS aprobado
      FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id LEFT JOIN proveedores pr ON pr.id = g.proveedor_id LEFT JOIN cajas c ON c.id = g.caja_id
      ${where} ORDER BY g.fecha DESC, g.id DESC LIMIT 500`).all(...p),
    por_categoria: db.prepare(`SELECT cg.nombre AS categoria, SUM(g.importe) AS total FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id
      ${where ? where + ' AND' : 'WHERE'} g.estado != 'anulado' GROUP BY cg.id ORDER BY total DESC`).all(...p),
    categorias: db.prepare('SELECT * FROM categorias_gasto WHERE activa = 1 ORDER BY nombre').all(),
    cajas: db.prepare('SELECT id, nombre, tipo FROM cajas').all(),
    proveedores: db.prepare('SELECT id, razon_social FROM proveedores ORDER BY razon_social').all(),
    umbral: umbral(),
  });
});

r.post('/gastos', permiso('gastos', 'gestionar', 'solicitar'), subida('gastos', { maxMb: 6, campos: 1 }).single('comprobante'), (req, res) => {
  const d = validar(z.object({ fecha: z.string(), categoria_id: zId, descripcion: z.string().min(3).max(300), importe: z.coerce.number().int().positive(),
    medio_pago: z.enum(['efectivo', 'transferencia', 'billetera', 'tarjeta']), caja_id: zId.optional(), proveedor_id: zId.optional(),
    ticket_id: zId.optional(), solicitud_compra_id: zId.optional() }), req.body);
  exigirPeriodoAbierto(d.fecha);
  const gestiona = puede(req.usuario, 'gastos', 'gestionar');
  // Separación de funciones: lo que supera el umbral, o lo que pide alguien que no gestiona, queda para aprobar.
  const estado = !gestiona || d.importe > umbral() ? 'pendiente_aprobacion' : 'registrado';
  const id = enTransaccion(() => {
    const nuevo = getDb().prepare(`INSERT INTO gastos (fecha, categoria_id, descripcion, importe, medio_pago, caja_id, proveedor_id, comprobante_archivo, ticket_id, solicitud_compra_id, estado, registrado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).get(d.fecha, d.categoria_id, d.descripcion, d.importe, d.medio_pago, d.caja_id ?? null, d.proveedor_id ?? null,
      req.file ? rutaRelativa('gastos', req.file) : null, d.ticket_id ?? null, d.solicitud_compra_id ?? null, estado, req.usuario.id).id;
    // Un gasto en efectivo descuenta de la caja elegida al registrarse (o al aprobarse).
    if (estado === 'registrado' && d.caja_id) movimiento(d.caja_id, 'egreso', -d.importe, d.descripcion, 'gasto', nuevo, req.usuario.id);
    return nuevo;
  });
  if (estado === 'pendiente_aprobacion') notificar({ rol: gestiona ? 'directiva' : 'contabilidad', tipo: 'aprobacion', titulo: `Gasto para aprobar: ${d.descripcion}`, referencia: gestiona ? '/aprobaciones' : '/gastos' });
  auditar(req, 'registrar_gasto', 'gastos', id, null, { ...d, estado });
  res.status(201).json({ id, estado });
});

/** Aprobación: quien registró no aprueba. Sobre el umbral aprueba la Comisión Directiva. */
r.post('/gastos/:id/aprobar', permiso('gastos', 'aprobar', 'gestionar'), (req, res) => {
  const d = validar(z.object({ aprobar: z.boolean(), motivo: z.string().optional() }), req.body);
  const db = getDb();
  const g = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!g) throw noEncontrado('Gasto');
  if (g.estado !== 'pendiente_aprobacion') throw invalido('El gasto no está pendiente de aprobación');
  if (g.registrado_por === req.usuario.id) throw prohibido('Quien registra un gasto no puede aprobarlo');
  if (g.importe > umbral() && !puede(req.usuario, 'gastos', 'aprobar')) throw prohibido('Supera el umbral: lo aprueba la Comisión Directiva');
  enTransaccion(() => {
    if (d.aprobar) {
      db.prepare(`UPDATE gastos SET estado = 'aprobado', aprobado_por = ? WHERE id = ?`).run(req.usuario.id, g.id);
      if (g.caja_id) movimiento(g.caja_id, 'egreso', -g.importe, g.descripcion, 'gasto', g.id, req.usuario.id);
    } else {
      if (!d.motivo) throw invalido('Indicá el motivo del rechazo');
      db.prepare(`UPDATE gastos SET estado = 'anulado', motivo_anulacion = ?, aprobado_por = ? WHERE id = ?`).run(`Rechazado: ${d.motivo}`, req.usuario.id, g.id);
    }
  });
  auditar(req, d.aprobar ? 'aprobar_gasto' : 'rechazar_gasto', 'gastos', g.id, { estado: g.estado }, { estado: d.aprobar ? 'aprobado' : 'anulado', motivo: d.motivo });
  notificar({ usuarioId: g.registrado_por, tipo: 'gasto', titulo: `Gasto "${g.descripcion}" ${d.aprobar ? 'aprobado' : 'rechazado'}`, referencia: '/gastos' });
  res.json({ ok: true });
});

/** Los gastos no se borran: se anulan con motivo (y se revierte el movimiento de caja). */
r.post('/gastos/:id/anular', permiso('gastos', 'gestionar'), (req, res) => {
  const { motivo } = validar(z.object({ motivo: z.string().min(5) }), req.body);
  const db = getDb();
  const g = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  if (!g) throw noEncontrado('Gasto');
  if (g.estado === 'anulado') throw invalido('El gasto ya está anulado');
  exigirPeriodoAbierto(g.fecha);
  enTransaccion(() => {
    db.prepare(`UPDATE gastos SET estado = 'anulado', motivo_anulacion = ? WHERE id = ?`).run(motivo, g.id);
    if (g.caja_id && ['registrado', 'aprobado'].includes(g.estado)) movimiento(g.caja_id, 'ajuste', g.importe, `Anulación de gasto: ${g.descripcion}`, 'gasto', g.id, req.usuario.id);
  });
  auditar(req, 'anular_gasto', 'gastos', g.id, { estado: g.estado }, { estado: 'anulado', motivo });
  res.json({ ok: true });
});

r.post('/gastos/categorias', permiso('gastos', 'gestionar'), (req, res) => {
  const { nombre } = validar(z.object({ nombre: z.string().min(3) }), req.body);
  res.status(201).json({ id: getDb().prepare('INSERT INTO categorias_gasto (nombre) VALUES (?) RETURNING id').get(nombre).id });
});

// ---------- Personal: empleados y remuneraciones ----------
r.get('/empleados', permiso('personal', 'leer', 'gestionar', 'leer_ambito'), (req, res) => {
  const db = getDb();
  // Administración (Lx) ve el legajo sin importes.
  const conImportes = puede(req.usuario, 'personal', 'leer');
  const periodo = String(req.query.periodo ?? local().periodo);
  const empleados = db.prepare(`SELECT e.*, p.nombre, p.apellido, p.dni, p.email, p.telefono FROM empleados e JOIN personas p ON p.id = e.persona_id ORDER BY e.activo DESC, p.apellido`).all()
    .map((e) => {
      const fila = { ...e };
      if (!conImportes) delete fila.remuneracion_base;
      else fila.liquidacion = db.prepare('SELECT * FROM remuneraciones WHERE empleado_id = ? AND periodo = ? AND es_ajuste = 0').get(e.id, periodo) ?? null;
      return fila;
    });
  res.json({
    periodo,
    empleados,
    total_nomina: conImportes ? db.prepare('SELECT COALESCE(SUM(neto),0) FROM remuneraciones WHERE periodo = ?').pluck().get(periodo) : undefined,
    total_bruto: conImportes ? db.prepare('SELECT COALESCE(SUM(bruto),0) FROM remuneraciones WHERE periodo = ?').pluck().get(periodo) : undefined,
    evolucion: conImportes ? mesesAtras(6).map((m) => ({ periodo: m, neto: db.prepare('SELECT COALESCE(SUM(neto),0) FROM remuneraciones WHERE periodo = ?').pluck().get(m) })) : undefined,
  });
});

r.get('/empleados/:id/remuneraciones', permiso('personal', 'leer', 'gestionar'), (req, res) => {
  res.json(getDb().prepare('SELECT * FROM remuneraciones WHERE empleado_id = ? ORDER BY periodo DESC, id DESC').all(req.params.id));
});

r.post('/empleados', permiso('personal', 'gestionar'), (req, res) => {
  const d = validar(z.object({ id: zId.optional(), persona: z.object({ nombre: z.string(), apellido: z.string(), dni: z.string(), email: z.string().optional(), telefono: z.string().optional() }).optional(),
    persona_id: zId.optional(), cargo: z.string().min(2), sector: z.string().min(2), tipo_vinculo: z.enum(['dependencia', 'monotributo', 'otro']),
    fecha_alta: z.string(), fecha_baja: z.string().nullable().optional(), forma_pago: z.enum(['efectivo', 'transferencia']), remuneracion_base: z.number().int().min(0) }), req.body);
  const db = getDb();
  const id = enTransaccion(() => {
    if (d.id) {
      const antes = db.prepare('SELECT * FROM empleados WHERE id = ?').get(d.id);
      db.prepare('UPDATE empleados SET cargo = ?, sector = ?, tipo_vinculo = ?, fecha_alta = ?, fecha_baja = ?, forma_pago = ?, remuneracion_base = ?, activo = ? WHERE id = ?')
        .run(d.cargo, d.sector, d.tipo_vinculo, d.fecha_alta, d.fecha_baja ?? null, d.forma_pago, d.remuneracion_base, d.fecha_baja ? 0 : 1, d.id);
      // Cada cambio de remuneración queda auditado.
      auditar(req, 'editar_empleado', 'empleados', d.id, antes, d);
      return d.id;
    }
    let personaId = d.persona_id;
    if (!personaId && d.persona) {
      personaId = db.prepare('SELECT id FROM personas WHERE dni = ?').pluck().get(d.persona.dni)
        ?? db.prepare(`INSERT INTO personas (dni, nombre, apellido, email, telefono, tipo) VALUES (?, ?, ?, ?, ?, 'empleado') RETURNING id`).get(d.persona.dni, d.persona.nombre, d.persona.apellido, d.persona.email ?? null, d.persona.telefono ?? null).id;
    }
    if (!personaId) throw invalido('Indicá la persona');
    const nuevo = db.prepare('INSERT INTO empleados (persona_id, cargo, sector, tipo_vinculo, fecha_alta, forma_pago, remuneracion_base) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .get(personaId, d.cargo, d.sector, d.tipo_vinculo, d.fecha_alta, d.forma_pago, d.remuneracion_base).id;
    auditar(req, 'alta_empleado', 'empleados', nuevo, null, d);
    return nuevo;
  });
  res.json({ id });
});

/** Liquida el período para los empleados activos (bruto, descuentos y neto). */
r.post('/remuneraciones/liquidar', permiso('personal', 'gestionar'), (req, res) => {
  const { periodo, descuento_pct } = validar(z.object({ periodo: z.string().regex(/^\d{4}-\d{2}$/), descuento_pct: z.number().min(0).max(50).default(17) }), req.body);
  exigirPeriodoAbierto(`${periodo}-01`);
  const db = getDb();
  let n = 0;
  enTransaccion(() => {
    for (const e of db.prepare('SELECT * FROM empleados WHERE activo = 1').all()) {
      if (db.prepare('SELECT 1 FROM remuneraciones WHERE empleado_id = ? AND periodo = ? AND es_ajuste = 0').get(e.id, periodo)) continue;
      const desc = e.tipo_vinculo === 'dependencia' ? Math.round((e.remuneracion_base * descuento_pct) / 100) : 0;
      db.prepare('INSERT INTO remuneraciones (empleado_id, periodo, bruto, descuentos, neto, medio_pago) VALUES (?, ?, ?, ?, ?, ?)').run(e.id, periodo, e.remuneracion_base, desc, e.remuneracion_base - desc, e.forma_pago);
      n++;
    }
  });
  auditar(req, 'liquidar_sueldos', 'remuneraciones', null, null, { periodo, liquidadas: n });
  res.json({ liquidadas: n });
});

r.post('/remuneraciones/:id/pagar', permiso('personal', 'gestionar'), (req, res) => {
  const { caja_id } = validar(z.object({ caja_id: zId }), req.body);
  const db = getDb();
  const rem = db.prepare('SELECT r.*, p.apellido FROM remuneraciones r JOIN empleados e ON e.id = r.empleado_id JOIN personas p ON p.id = e.persona_id WHERE r.id = ?').get(req.params.id);
  if (!rem) throw noEncontrado('Liquidación');
  if (rem.estado === 'pagada') throw invalido('Ya está pagada');
  enTransaccion(() => {
    db.prepare(`UPDATE remuneraciones SET estado = 'pagada', pagada_en = ?, caja_id = ? WHERE id = ?`).run(ahora(), caja_id, rem.id);
    movimiento(caja_id, 'egreso', -rem.neto, `Sueldo ${rem.periodo} — ${rem.apellido}`, 'remuneracion', rem.id, req.usuario.id);
  });
  auditar(req, 'pagar_sueldo', 'remuneraciones', rem.id, { estado: rem.estado }, { estado: 'pagada', caja_id });
  res.json({ ok: true });
});

/** Una liquidación pagada no se edita: se corrige con un ajuste. */
r.post('/remuneraciones/:id/ajuste', permiso('personal', 'gestionar'), (req, res) => {
  const d = validar(z.object({ importe: z.number().int(), motivo: z.string().min(5) }), req.body);
  const db = getDb();
  const rem = db.prepare('SELECT * FROM remuneraciones WHERE id = ?').get(req.params.id);
  if (!rem) throw noEncontrado('Liquidación');
  const id = db.prepare('INSERT INTO remuneraciones (empleado_id, periodo, bruto, descuentos, neto, medio_pago, es_ajuste) VALUES (?, ?, ?, 0, ?, ?, 1) RETURNING id')
    .get(rem.empleado_id, local().periodo, d.importe, d.importe, rem.medio_pago).id;
  auditar(req, 'ajuste_sueldo', 'remuneraciones', id, null, { ...d, original: rem.id });
  res.status(201).json({ id });
});

// ---------- Proveedores y compras ----------
r.get('/proveedores', permiso('compras', 'leer', 'gestionar', 'aprobar'), (_req, res) => {
  const db = getDb();
  res.json(db.prepare(`SELECT p.*,
      COALESCE((SELECT SUM(total) FROM facturas_proveedor WHERE proveedor_id = p.id AND estado != 'anulada'), 0) AS facturado,
      COALESCE((SELECT SUM(pp.importe) FROM pagos_proveedor pp JOIN facturas_proveedor f ON f.id = pp.factura_id WHERE f.proveedor_id = p.id), 0) AS pagado
    FROM proveedores p ORDER BY p.razon_social`).all().map((p) => ({ ...p, saldo: p.facturado - p.pagado })));
});

r.post('/proveedores', permiso('compras', 'gestionar'), (req, res) => {
  const d = validar(z.object({ id: zId.optional(), razon_social: z.string().min(2), cuit: z.string().regex(/^\d{2}-\d{8}-\d$/, 'CUIT con formato 30-12345678-9').optional(),
    rubro: z.string().optional(), contacto: z.string().optional(), condicion_pago: z.string().optional() }), req.body);
  const db = getDb();
  const vals = [d.razon_social, d.cuit ?? null, d.rubro ?? null, d.contacto ?? null, d.condicion_pago ?? null];
  const id = d.id ? (db.prepare('UPDATE proveedores SET razon_social = ?, cuit = ?, rubro = ?, contacto = ?, condicion_pago = ? WHERE id = ?').run(...vals, d.id), d.id)
    : db.prepare('INSERT INTO proveedores (razon_social, cuit, rubro, contacto, condicion_pago) VALUES (?, ?, ?, ?, ?) RETURNING id').get(...vals).id;
  res.json({ id });
});

r.get('/proveedores/:id', permiso('compras', 'leer', 'gestionar', 'aprobar'), (req, res) => {
  const db = getDb();
  res.json({
    proveedor: db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id),
    facturas: db.prepare('SELECT * FROM facturas_proveedor WHERE proveedor_id = ? ORDER BY fecha DESC').all(req.params.id),
    pagos: db.prepare('SELECT pp.*, f.numero FROM pagos_proveedor pp JOIN facturas_proveedor f ON f.id = pp.factura_id WHERE f.proveedor_id = ? ORDER BY pp.fecha DESC').all(req.params.id),
  });
});

r.get('/facturas', permiso('compras', 'leer', 'gestionar', 'aprobar'), (_req, res) => {
  const db = getDb();
  res.json({
    facturas: db.prepare(`SELECT f.*, p.razon_social, COALESCE((SELECT SUM(importe) FROM pagos_proveedor WHERE factura_id = f.id), 0) AS pagado,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = f.cargada_por) AS cargada,
        (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = f.autorizada_por) AS autorizada
      FROM facturas_proveedor f JOIN proveedores p ON p.id = f.proveedor_id ORDER BY f.vence`).all(),
    umbral: umbral(),
    cajas: db.prepare('SELECT id, nombre FROM cajas').all(),
  });
});

r.post('/facturas', permiso('compras', 'gestionar'), (req, res) => {
  const d = validar(z.object({ proveedor_id: zId, numero: z.string().min(3), fecha: z.string(), vence: z.string(), total: z.number().int().positive() }), req.body);
  const id = getDb().prepare('INSERT INTO facturas_proveedor (proveedor_id, numero, fecha, vence, total, cargada_por) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .get(d.proveedor_id, d.numero, d.fecha, d.vence, d.total, req.usuario.id).id;
  auditar(req, 'cargar_factura', 'facturas_proveedor', id, null, d);
  if (d.total > umbral()) notificar({ rol: 'directiva', tipo: 'aprobacion', titulo: `Factura sobre el umbral para autorizar: ${d.numero}`, referencia: '/aprobaciones' });
  res.status(201).json({ id });
});

/** Quien carga una factura no la autoriza; sobre el umbral autoriza la Comisión Directiva. */
r.post('/facturas/:id/autorizar', permiso('compras', 'gestionar', 'aprobar'), (req, res) => {
  const db = getDb();
  const f = db.prepare('SELECT * FROM facturas_proveedor WHERE id = ?').get(req.params.id);
  if (!f) throw noEncontrado('Factura');
  if (f.estado !== 'cargada') throw invalido('La factura no está pendiente de autorización');
  if (f.cargada_por === req.usuario.id) throw prohibido('Quien carga la factura no puede autorizarla');
  if (f.total > umbral() && !puede(req.usuario, 'compras', 'aprobar')) throw prohibido('Supera el umbral: autoriza la Comisión Directiva');
  db.prepare(`UPDATE facturas_proveedor SET estado = 'autorizada', autorizada_por = ? WHERE id = ?`).run(req.usuario.id, f.id);
  auditar(req, 'autorizar_factura', 'facturas_proveedor', f.id, { estado: f.estado }, { estado: 'autorizada' });
  res.json({ ok: true });
});

r.post('/facturas/:id/pagar', permiso('compras', 'gestionar'), (req, res) => {
  const d = validar(z.object({ caja_id: zId, importe: z.number().int().positive() }), req.body);
  const db = getDb();
  const f = db.prepare('SELECT f.*, p.razon_social FROM facturas_proveedor f JOIN proveedores p ON p.id = f.proveedor_id WHERE f.id = ?').get(req.params.id);
  if (!f) throw noEncontrado('Factura');
  if (f.estado !== 'autorizada') throw invalido('Solo se pagan facturas autorizadas');
  const pagado = db.prepare('SELECT COALESCE(SUM(importe),0) FROM pagos_proveedor WHERE factura_id = ?').pluck().get(f.id);
  if (pagado + d.importe > f.total) throw invalido('El pago supera el saldo de la factura');
  enTransaccion(() => {
    const id = db.prepare('INSERT INTO pagos_proveedor (factura_id, caja_id, fecha, importe) VALUES (?, ?, ?, ?) RETURNING id').get(f.id, d.caja_id, local().fecha, d.importe).id;
    movimiento(d.caja_id, 'egreso', -d.importe, `Pago ${f.razon_social} ${f.numero}`, 'pago_proveedor', id, req.usuario.id);
    if (pagado + d.importe === f.total) db.prepare(`UPDATE facturas_proveedor SET estado = 'pagada' WHERE id = ?`).run(f.id);
  });
  auditar(req, 'pagar_factura', 'facturas_proveedor', f.id, null, d);
  res.json({ ok: true });
});

// ---------- Presupuesto ----------
r.get('/presupuesto', permiso('presupuesto', 'leer', 'gestionar', 'aprobar', 'leer_ambito'), (req, res) => {
  const db = getDb();
  const anio = Number(req.query.anio ?? local().fecha.slice(0, 4));
  const items = db.prepare(`SELECT pr.*, a.nombre AS actividad FROM presupuestos pr LEFT JOIN actividades a ON a.id = pr.actividad_id WHERE pr.anio = ? ORDER BY pr.tipo DESC, pr.rubro`).all(anio);
  // Ejecutado: gastos por rubro (categoría con el mismo nombre), nómina, honorarios e ingresos por concepto.
  const ejecutado = (it) => {
    if (it.tipo === 'egreso') {
      if (it.rubro === 'Sueldos y cargas') return db.prepare(`SELECT COALESCE(SUM(bruto),0) FROM remuneraciones WHERE substr(periodo,1,4) = ?`).pluck().get(String(anio));
      if (it.rubro === 'Honorarios de profesores') return db.prepare(`SELECT COALESCE(SUM(monto),0) FROM honorarios WHERE substr(periodo,1,4) = ?`).pluck().get(String(anio));
      if (it.actividad_id) return 0;
      return db.prepare(`SELECT COALESCE(SUM(g.importe),0) FROM gastos g JOIN categorias_gasto c ON c.id = g.categoria_id WHERE c.nombre = ? AND substr(g.fecha,1,4) = ? AND g.estado != 'anulado'`).pluck().get(it.rubro, String(anio));
    }
    const tipos = { 'Cuotas sociales': ['cuota_social'], 'Aranceles de actividades': ['arancel', 'revision_medica'], 'Alquileres e invitados': ['alquiler', 'invitado', 'llave'] }[it.rubro];
    if (tipos) return db.prepare(`SELECT COALESCE(SUM(im.importe),0) FROM imputaciones im JOIN pagos pg ON pg.id = im.pago_id JOIN cargos c ON c.id = im.cargo_id JOIN conceptos co ON co.id = c.concepto_id
      WHERE co.tipo IN (${tipos.map(() => '?').join(',')}) AND substr(pg.fecha,1,4) = ? AND pg.medio != 'otro'`).pluck().get(...tipos, String(anio));
    return db.prepare(`SELECT COALESCE(SUM(importe),0) FROM ingresos_varios WHERE substr(fecha,1,4) = ?`).pluck().get(String(anio));
  };
  res.json({ anio, items: items.map((it) => ({ ...it, ejecutado: ejecutado(it) })), mes: Number(local().fecha.slice(5, 7)) });
});

r.post('/presupuesto', permiso('presupuesto', 'gestionar'), (req, res) => {
  const d = validar(z.object({ id: zId.optional(), anio: z.number().int(), rubro: z.string().min(2), actividad_id: zId.nullable().optional(), tipo: z.enum(['ingreso', 'egreso']), monto: z.number().int().min(0) }), req.body);
  const db = getDb();
  const id = d.id ? (db.prepare('UPDATE presupuestos SET anio = ?, rubro = ?, actividad_id = ?, tipo = ?, monto = ? WHERE id = ?').run(d.anio, d.rubro, d.actividad_id ?? null, d.tipo, d.monto, d.id), d.id)
    : db.prepare('INSERT INTO presupuestos (anio, rubro, actividad_id, tipo, monto) VALUES (?, ?, ?, ?, ?) RETURNING id').get(d.anio, d.rubro, d.actividad_id ?? null, d.tipo, d.monto).id;
  auditar(req, 'presupuesto', 'presupuestos', id, null, d);
  res.json({ id });
});

// ---------- Honorarios de profesores ----------
r.get('/honorarios', permiso('honorarios', 'leer', 'gestionar', 'aprobar'), (req, res) => {
  const db = getDb();
  const periodo = req.query.periodo;
  res.json({
    honorarios: db.prepare(`SELECT h.*, p.nombre || ' ' || p.apellido AS profesor, pr.cuit FROM honorarios h JOIN profesores pr ON pr.id = h.profesor_id JOIN personas p ON p.id = pr.persona_id
      ${periodo ? 'WHERE h.periodo = ?' : ''} ORDER BY h.periodo DESC, p.apellido`).all(...(periodo ? [periodo] : [])),
    profesores: db.prepare(`SELECT pr.id, p.nombre || ' ' || p.apellido AS nombre FROM profesores pr JOIN personas p ON p.id = pr.persona_id WHERE pr.activo = 1`).all(),
  });
});

/** Liquidación a profesores según clases dictadas (días con asistencia registrada por grupo). */
r.post('/honorarios/liquidar', permiso('honorarios', 'gestionar'), (req, res) => {
  const d = validar(z.object({ periodo: z.string().regex(/^\d{4}-\d{2}$/), valor_clase: z.number().int().positive() }), req.body);
  const db = getDb();
  let n = 0;
  enTransaccion(() => {
    for (const pr of db.prepare('SELECT id FROM profesores WHERE activo = 1').all()) {
      if (db.prepare('SELECT 1 FROM honorarios WHERE profesor_id = ? AND periodo = ?').get(pr.id, d.periodo)) continue;
      const clases = db.prepare(`SELECT COUNT(DISTINCT a.fecha || '-' || i.grupo_id) FROM asistencias a JOIN inscripciones i ON i.id = a.inscripcion_id JOIN grupos g ON g.id = i.grupo_id
        WHERE g.profesor_id = ? AND substr(a.fecha,1,7) = ?`).pluck().get(pr.id, d.periodo);
      if (!clases) continue;
      db.prepare(`INSERT INTO honorarios (profesor_id, periodo, clases, base, monto, estado) VALUES (?, ?, ?, ?, ?, 'liquidado')`).run(pr.id, d.periodo, clases, d.valor_clase, clases * d.valor_clase);
      n++;
    }
  });
  auditar(req, 'liquidar_honorarios', 'honorarios', null, null, { ...d, liquidados: n });
  res.json({ liquidados: n });
});

r.post('/honorarios/:id/:accion', (req, res) => {
  if (!['autorizar', 'pagar'].includes(req.params.accion)) throw invalido('Acción desconocida');
  const db = getDb();
  const h = db.prepare('SELECT h.*, p.apellido FROM honorarios h JOIN profesores pr ON pr.id = h.profesor_id JOIN personas p ON p.id = pr.persona_id WHERE h.id = ?').get(req.params.id);
  if (!h) throw noEncontrado('Honorario');
  if (req.params.accion === 'autorizar') {
    if (!puede(req.usuario, 'honorarios', 'aprobar')) throw prohibido('Autoriza la Comisión Directiva');
    if (h.estado !== 'liquidado') throw invalido('El honorario no está liquidado');
    db.prepare(`UPDATE honorarios SET estado = 'autorizado' WHERE id = ?`).run(h.id);
  } else {
    if (!puede(req.usuario, 'honorarios', 'gestionar')) throw prohibido();
    if (h.estado !== 'autorizado') throw invalido('Primero debe autorizarlo la Comisión Directiva');
    const { caja_id } = validar(z.object({ caja_id: zId }), req.body);
    enTransaccion(() => {
      db.prepare(`UPDATE honorarios SET estado = 'pagado' WHERE id = ?`).run(h.id);
      movimiento(caja_id, 'egreso', -h.monto, `Honorarios ${h.periodo} — ${h.apellido}`, 'honorario', h.id, req.usuario.id);
    });
  }
  auditar(req, `${req.params.accion}_honorario`, 'honorarios', h.id, { estado: h.estado }, null);
  res.json({ ok: true });
});

// ---------- Reportes ----------
r.get('/reportes', permiso('presupuesto', 'leer', 'gestionar', 'aprobar'), (req, res) => {
  const db = getDb();
  const anio = String(req.query.anio ?? local().fecha.slice(0, 4));
  const porActividad = db.prepare(`SELECT a.id, a.nombre,
      COALESCE((SELECT SUM(im.importe) FROM imputaciones im JOIN pagos pg ON pg.id = im.pago_id JOIN cargos c ON c.id = im.cargo_id
        JOIN inscripciones i ON c.origen_tipo = 'inscripcion' AND c.origen_id = i.id JOIN grupos g ON g.id = i.grupo_id
        WHERE g.actividad_id = a.id AND substr(pg.fecha,1,4) = ? AND pg.medio != 'otro'), 0) AS ingresos,
      COALESCE((SELECT SUM(h.monto) FROM honorarios h WHERE substr(h.periodo,1,4) = ? AND h.profesor_id IN (SELECT profesor_id FROM grupos WHERE actividad_id = a.id)), 0) AS honorarios,
      (SELECT COUNT(*) FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE g.actividad_id = a.id AND i.estado != 'baja') AS inscriptos
    FROM actividades a ORDER BY ingresos DESC`).all(anio, anio)
    .map((a) => ({ ...a, resultado: a.ingresos - a.honorarios }));
  const flujo = mesesAtras(12).map((m) => {
    const ing = ingresosPeriodo(m);
    const egr = egresosPeriodo(m);
    return { periodo: m, ingresos: ing.total, egresos: egr.total, gastos: egr.gastos, nomina: egr.nomina, honorarios: egr.honorarios, neto: ing.total - egr.total };
  });
  res.json({ anio, por_actividad: porActividad, flujo });
});

/** Exportación a CSV (se abre en Excel). */
r.get('/exportar/:que', permiso('presupuesto', 'leer', 'gestionar', 'aprobar'), (req, res) => {
  if (!['gastos', 'ingresos', 'flujo', 'empleados'].includes(req.params.que)) throw invalido('Exportación desconocida');
  const db = getDb();
  const periodo = String(req.query.periodo ?? local().periodo);
  let filas = [];
  if (req.params.que === 'gastos') filas = db.prepare(`SELECT g.fecha, cg.nombre AS motivo, g.descripcion, g.importe / 100.0 AS importe, g.medio_pago, g.estado FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id WHERE substr(g.fecha,1,7) = ? ORDER BY g.fecha`).all(periodo);
  if (req.params.que === 'ingresos') filas = db.prepare(`SELECT pg.fecha, pg.medio, pg.importe / 100.0 AS importe, c.numero AS recibo FROM pagos pg LEFT JOIN comprobantes c ON c.pago_id = pg.id WHERE substr(pg.fecha,1,7) = ? AND pg.medio != 'otro' ORDER BY pg.fecha`).all(periodo);
  if (req.params.que === 'flujo') filas = mesesAtras(12).map((m) => ({ periodo: m, ingresos: ingresosPeriodo(m).total / 100, egresos: egresosPeriodo(m).total / 100 }));
  if (req.params.que === 'empleados') {
    if (!puede(req.usuario, 'personal', 'leer')) throw prohibido();
    filas = db.prepare(`SELECT p.apellido, p.nombre, e.cargo, e.sector, e.tipo_vinculo, r.periodo, r.bruto / 100.0 AS bruto, r.descuentos / 100.0 AS descuentos, r.neto / 100.0 AS neto, r.medio_pago, r.estado
      FROM remuneraciones r JOIN empleados e ON e.id = r.empleado_id JOIN personas p ON p.id = e.persona_id WHERE r.periodo = ?`).all(periodo);
  }
  const cols = Object.keys(filas[0] ?? { sin_datos: '' });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.join(';'), ...filas.map((f) => cols.map((c) => esc(f[c])).join(';'))].join('\r\n');
  auditar(req, 'exportar', req.params.que, null, null, { periodo });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.que}-${periodo}.csv"`);
  res.send(csv);
});

// ---------- Cierre mensual ----------
r.get('/cierres', permiso('caja', 'leer', 'gestionar'), (_req, res) => {
  const db = getDb();
  const periodos = mesesAtras(12).reverse();
  res.json(periodos.map((p) => {
    const [anio, mes] = p.split('-').map(Number);
    const c = db.prepare(`SELECT pc.*, pp.nombre || ' ' || pp.apellido AS por FROM periodos_contables pc LEFT JOIN usuarios u ON u.id = pc.cerrado_por LEFT JOIN personas pp ON pp.id = u.persona_id WHERE anio = ? AND mes = ?`).get(anio, mes);
    return { periodo: p, cerrado_en: c?.cerrado_en ?? null, por: c?.por ?? null, ingresos: ingresosPeriodo(p).total, egresos: egresosPeriodo(p).total,
      pendientes: { transferencias: db.prepare(`SELECT COUNT(*) FROM transferencias_informadas WHERE estado = 'pendiente' AND substr(creada_en,1,7) = ?`).pluck().get(p),
        gastos: db.prepare(`SELECT COUNT(*) FROM gastos WHERE estado = 'pendiente_aprobacion' AND substr(fecha,1,7) = ?`).pluck().get(p) } };
  }));
});

r.post('/cierres', permiso('caja', 'gestionar'), (req, res) => {
  const { periodo } = validar(z.object({ periodo: z.string().regex(/^\d{4}-\d{2}$/) }), req.body);
  if (periodo >= local().periodo) throw invalido('Solo se cierran períodos ya terminados');
  const [anio, mes] = periodo.split('-').map(Number);
  const db = getDb();
  if (db.prepare('SELECT cerrado_en FROM periodos_contables WHERE anio = ? AND mes = ?').pluck().get(anio, mes)) throw invalido('El período ya está cerrado');
  const pendientes = db.prepare(`SELECT COUNT(*) FROM gastos WHERE estado = 'pendiente_aprobacion' AND substr(fecha,1,7) = ?`).pluck().get(periodo);
  if (pendientes) throw invalido(`Hay ${pendientes} gastos del período pendientes de aprobación`);
  db.prepare(`INSERT INTO periodos_contables (anio, mes, cerrado_en, cerrado_por) VALUES (?, ?, ?, ?) ON CONFLICT (anio, mes) DO UPDATE SET cerrado_en = excluded.cerrado_en, cerrado_por = excluded.cerrado_por`)
    .run(anio, mes, ahora(), req.usuario.id);
  auditar(req, 'cierre_mensual', 'periodos_contables', null, null, { periodo });
  res.json({ ok: true });
});

export default r;
