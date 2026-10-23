// Portal del socio (/socio): autogestión de perfil, credencial, actividades, reservas, cuenta, pagos,
// revisión médica, invitados, novedades, trámites y privacidad. El titular gestiona a su grupo familiar.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora, enTransaccion } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso } from '../lib/rbac.js';
import { validar, invalido, prohibido, noEncontrado, local, sumarDias, edad, json } from '../lib/util.js';
import { auditar, notificar } from '../lib/auditoria.js';
import { emitirQr } from '../services/qr.js';
import { estadoPorActividad, estadoApto } from '../services/habilitacion.js';
import { cotizar, vacantes, esSocioActivo } from '../services/precios.js';
import { catalogo, horariosDeGrupo, comunicadosPara } from '../services/catalogo.js';
import { cargosDe, resumenCuenta, crearCargo, saldoCargo } from '../services/cuenta.js';
import { crearPreferencia, acreditar } from '../services/mercadopago.js';
import { subida, rutaRelativa } from '../services/archivos.js';
import { reservar, cancelarReserva, disponibilidad } from './espacios.js';
import { config } from '../config.js';

const r = Router();
r.use(requiereSesion, permiso('perfil', 'propio'));

/** Personas que el usuario gestiona: él, los menores a su cargo y, si es titular, su grupo familiar. */
export function personasACargo(usuario) {
  const db = getDb();
  const ids = new Set([usuario.persona_id]);
  db.prepare('SELECT menor_persona_id FROM tutores WHERE tutor_persona_id = ?').pluck().all(usuario.persona_id).forEach((id) => ids.add(id));
  const gf = db.prepare('SELECT id FROM grupos_familiares WHERE titular_persona_id = ?').pluck().get(usuario.persona_id);
  if (gf) db.prepare('SELECT persona_id FROM socios WHERE grupo_familiar_id = ?').pluck().all(gf).forEach((id) => ids.add(id));
  return [...ids];
}

function personaObjetivo(req, valor = req.query.persona_id ?? req.body?.persona_id) {
  const id = valor ? Number(valor) : req.usuario.persona_id;
  if (!personasACargo(req.usuario).includes(id)) throw prohibido('No gestionás a esa persona');
  return id;
}

function familia(usuario) {
  const db = getDb();
  return personasACargo(usuario).map((id) => {
    const p = db.prepare(`SELECT p.id, p.nombre, p.apellido, p.fecha_nacimiento, p.foto, s.nro_socio, s.estado, c.nombre AS categoria
      FROM personas p LEFT JOIN socios s ON s.persona_id = p.id LEFT JOIN categorias_socio c ON c.id = s.categoria_id WHERE p.id = ?`).get(id);
    return { ...p, edad: edad(p.fecha_nacimiento), yo: id === usuario.persona_id };
  });
}

// ---------- Panel ----------
r.get('/inicio', (req, res) => {
  const db = getDb();
  const momento = local();
  const ids = personasACargo(req.usuario);
  const clases = db.prepare(`SELECT h.dia_semana, h.hora_inicio, h.hora_fin, a.nombre AS actividad, g.nombre AS grupo, e.nombre AS espacio,
      p.nombre AS persona, p.id AS persona_id
    FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id
    JOIN horarios h ON h.grupo_id = g.id LEFT JOIN espacios e ON e.id = h.espacio_id JOIN personas p ON p.id = i.persona_id
    WHERE i.persona_id IN (${ids.map(() => '?').join(',')}) AND i.estado IN ('activa','pendiente_apto','baja_solicitada')`).all(...ids);
  // Próximas 6 clases a partir de ahora
  const proximas = [];
  for (let d = 0; d < 7 && proximas.length < 6; d++) {
    const dia = (momento.diaSemana + d) % 7;
    clases.filter((c) => c.dia_semana === dia && (d > 0 || c.hora_inicio >= momento.hora))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
      .forEach((c) => proximas.length < 6 && proximas.push({ ...c, fecha: sumarDias(momento.fecha, d), en_dias: d }));
  }
  const reservas = db.prepare(`SELECT r.*, e.nombre AS espacio FROM reservas r JOIN espacios e ON e.id = r.espacio_id
    WHERE r.persona_id = ? AND r.estado = 'confirmada' AND r.inicio >= ? ORDER BY r.inicio LIMIT 3`).all(req.usuario.persona_id, ahora());
  const socio = db.prepare(`SELECT s.*, c.nombre AS categoria FROM socios s JOIN categorias_socio c ON c.id = s.categoria_id WHERE s.persona_id = ?`).get(req.usuario.persona_id);
  res.json({
    persona: { nombre: req.usuario.nombre, apellido: req.usuario.apellido, foto: req.usuario.foto },
    socio,
    cuenta: ids.reduce((acc, id) => {
      const c = resumenCuenta(id);
      return { deuda: acc.deuda + c.deuda, vencido: acc.vencido + c.vencido, proximo_vencimiento: [acc.proximo_vencimiento, c.proximo_vencimiento].filter(Boolean).sort()[0] ?? null };
    }, { deuda: 0, vencido: 0, proximo_vencimiento: null }),
    habilitacion: ids.flatMap((id) => estadoPorActividad(id).map((e) => ({ ...e, persona_id: id }))),
    familia: familia(req.usuario),
    proximas,
    reservas,
    avisos: db.prepare(`SELECT * FROM notificaciones WHERE usuario_id = ? AND leida_en IS NULL ORDER BY id DESC LIMIT 5`).all(req.usuario.id),
    comunicados: comunicadosPara(req.usuario.persona_id, { limite: 3 }),
  });
});

// ---------- Perfil y grupo familiar ----------
r.get('/perfil', (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM personas WHERE id = ?').get(req.usuario.persona_id);
  const socio = db.prepare(`SELECT s.*, c.nombre AS categoria, gf.nombre AS grupo_familiar, gf.titular_persona_id
    FROM socios s JOIN categorias_socio c ON c.id = s.categoria_id LEFT JOIN grupos_familiares gf ON gf.id = s.grupo_familiar_id WHERE s.persona_id = ?`).get(p.id);
  res.json({ persona: p, socio, familia: familia(req.usuario), es_titular: socio?.titular_persona_id === p.id, email_usuario: req.usuario.email, mfa: !!req.usuario.mfa_habilitado });
});

r.put('/perfil', (req, res) => {
  const datos = validar(z.object({
    email: z.string().email().optional(),
    telefono: z.string().min(6).max(30).optional(),
    domicilio: z.string().max(120).optional(),
  }), req.body);
  const db = getDb();
  const antes = db.prepare('SELECT email, telefono, domicilio FROM personas WHERE id = ?').get(req.usuario.persona_id);
  const campos = Object.keys(datos);
  if (!campos.length) return res.json({ ok: true });
  db.prepare(`UPDATE personas SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...campos.map((c) => datos[c]), req.usuario.persona_id);
  auditar(req, 'actualizar_perfil', 'personas', req.usuario.persona_id, antes, datos);
  res.json({ ok: true });
});

r.post('/perfil/foto', subida('fotos', { maxMb: 3, campos: 1 }).single('foto'), (req, res) => {
  if (!req.file) throw invalido('Adjuntá una foto');
  getDb().prepare('UPDATE personas SET foto = ? WHERE id = ?').run(rutaRelativa('fotos', req.file), req.usuario.persona_id);
  res.json({ foto: rutaRelativa('fotos', req.file) });
});

// ---------- Credencial QR dinámica ----------
r.get('/credencial', (req, res) => {
  const personaId = personaObjetivo(req);
  const db = getDb();
  const datos = db.prepare(`SELECT p.nombre, p.apellido, p.foto, p.dni, s.nro_socio, s.estado, s.fecha_alta, c.nombre AS categoria
    FROM personas p LEFT JOIN socios s ON s.persona_id = p.id LEFT JOIN categorias_socio c ON c.id = s.categoria_id WHERE p.id = ?`).get(personaId);
  res.json({
    ...datos,
    dni: datos.dni ? `${datos.dni.slice(0, 2)}.***.${datos.dni.slice(-3)}` : null,
    qr: emitirQr(personaId),
    vigencia_segundos: config.qrVigenciaSegundos,
    cuota_al_dia: resumenCuenta(personaId).vencido === 0,
    habilitacion: estadoPorActividad(personaId),
    familia: familia(req.usuario),
  });
});

// ---------- Mis actividades ----------
r.get('/actividades', (req, res) => {
  const db = getDb();
  const ids = personasACargo(req.usuario);
  const periodo = local().periodo;
  const inscripciones = db.prepare(`SELECT i.*, g.nombre AS grupo, g.actividad_id, a.nombre AS actividad, a.icono, a.dia_vencimiento,
      pp.nombre || ' ' || pp.apellido AS profesor, p.nombre AS persona_nombre
    FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id
    LEFT JOIN profesores pr ON pr.id = g.profesor_id LEFT JOIN personas pp ON pp.id = pr.persona_id
    JOIN personas p ON p.id = i.persona_id
    WHERE i.persona_id IN (${ids.map(() => '?').join(',')}) AND i.estado != 'baja' ORDER BY p.id, a.nombre`).all(...ids);
  res.json(inscripciones.map((i) => {
    const cargo = db.prepare(`SELECT * FROM cargos WHERE origen_tipo = 'inscripcion' AND origen_id = ? ORDER BY periodo DESC LIMIT 1`).get(i.id);
    const saldo = cargo ? saldoCargo(cargo.id) : 0;
    const estadoPago = !cargo ? 'sin_cargo' : cargo.estado === 'pagado' ? 'pagado' : cargo.vencimiento < local().fecha ? 'vencido' : 'pendiente';
    const hab = estadoPorActividad(i.persona_id).find((e) => e.actividad_id === i.actividad_id);
    return {
      ...i,
      horarios: horariosDeGrupo(i.grupo_id),
      periodo: cargo?.periodo ?? periodo,
      monto: cargo?.importe ?? null,
      saldo,
      cargo_id: cargo?.id ?? null,
      fecha_limite: cargo?.vencimiento ?? null,
      estado_pago: estadoPago,
      apto: estadoApto(i.persona_id, i.actividad_id),
      habilitado: hab?.habilitado ?? false,
      motivo: hab?.mensaje ?? null,
    };
  }));
});

r.post('/actividades/:id/baja', (req, res) => {
  const db = getDb();
  const i = db.prepare('SELECT * FROM inscripciones WHERE id = ?').get(req.params.id);
  if (!i) throw noEncontrado('Inscripción');
  personaObjetivo(req, i.persona_id);
  if (!['activa', 'pendiente_apto'].includes(i.estado)) throw invalido('La inscripción no está activa');
  // La baja se aplica al fin del período y bloquea cargos futuros.
  const fin = new Date(`${local().periodo}-01T12:00:00Z`);
  fin.setUTCMonth(fin.getUTCMonth() + 1);
  fin.setUTCDate(0);
  const hasta = fin.toISOString().slice(0, 10);
  db.prepare(`UPDATE inscripciones SET estado = 'baja_solicitada', hasta = ? WHERE id = ?`).run(hasta, i.id);
  auditar(req, 'baja_actividad', 'inscripciones', i.id, { estado: i.estado }, { estado: 'baja_solicitada', hasta });
  avisarListaEspera(i.grupo_id);
  res.json({ ok: true, hasta });
});

function avisarListaEspera(grupoId) {
  const db = getDb();
  const primero = db.prepare('SELECT * FROM lista_espera WHERE grupo_id = ? AND avisado_en IS NULL ORDER BY posicion LIMIT 1').get(grupoId);
  if (!primero) return;
  const u = db.prepare('SELECT id FROM usuarios WHERE persona_id = ?').pluck().get(primero.persona_id);
  if (u) notificar({ usuarioId: u, tipo: 'lista_espera', titulo: 'Se liberó un lugar en un grupo de tu lista de espera', referencia: '/socio/actividades/explorar' });
  db.prepare('UPDATE lista_espera SET avisado_en = ? WHERE id = ?').run(ahora(), primero.id);
}

// ---------- Explorar e inscribirme ----------
r.get('/explorar', (req, res) => {
  const personaId = personaObjetivo(req);
  const persona = getDb().prepare('SELECT fecha_nacimiento FROM personas WHERE id = ?').get(personaId);
  const lista = catalogo({ tipo: req.query.tipo, q: req.query.q, edad: req.query.todas ? undefined : edad(persona.fecha_nacimiento) });
  const mis = getDb().prepare(`SELECT grupo_id FROM inscripciones WHERE persona_id = ? AND estado != 'baja'`).pluck().all(personaId);
  const espera = getDb().prepare('SELECT grupo_id, posicion FROM lista_espera WHERE persona_id = ?').all(personaId);
  res.json({
    condicion: esSocioActivo(personaId) ? 'socio' : 'no_socio',
    actividades: lista.map((a) => ({
      ...a,
      grupos: a.grupos.map((g) => ({ ...g, inscripto: mis.includes(g.id), en_espera: espera.find((e) => e.grupo_id === g.id)?.posicion ?? null })),
    })),
    familia: familia(req.usuario),
  });
});

r.get('/cotizar', (req, res) => {
  const personaId = personaObjetivo(req);
  const g = getDb().prepare('SELECT * FROM grupos WHERE id = ?').get(req.query.grupo_id);
  if (!g) throw noEncontrado('Grupo');
  const precio = cotizar({ personaId, actividadId: g.actividad_id, frecuencia: Number(req.query.frecuencia ?? 1), descuentoId: req.query.descuento_id || null });
  res.json({ ...precio, ...vacantes(g.id), apto: estadoApto(personaId, g.actividad_id) });
});

r.post('/inscribirme', (req, res) => {
  const datos = validar(z.object({
    grupo_id: z.number().int(),
    frecuencia: z.number().int().min(0).max(7),
    descuento_id: z.number().int().nullable().optional(),
    persona_id: z.number().int().optional(),
    lista_espera: z.boolean().optional(),
  }), req.body);
  const personaId = personaObjetivo(req, datos.persona_id);
  const resultado = enTransaccion(() => {
    const db = getDb();
    const g = db.prepare('SELECT g.*, a.nombre AS actividad, a.dia_vencimiento FROM grupos g JOIN actividades a ON a.id = g.actividad_id WHERE g.id = ?').get(datos.grupo_id);
    if (!g) throw noEncontrado('Grupo');
    if (db.prepare(`SELECT 1 FROM inscripciones WHERE persona_id = ? AND grupo_id = ? AND estado != 'baja'`).get(personaId, g.id)) throw invalido('Ya está inscripto/a en ese grupo');
    const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(personaId);
    const anios = edad(persona.fecha_nacimiento);
    if ((g.edad_min != null && anios < g.edad_min) || (g.edad_max != null && anios > g.edad_max)) throw invalido('La edad no corresponde a este grupo');
    const precio = cotizar({ personaId, actividadId: g.actividad_id, frecuencia: datos.frecuencia, descuentoId: datos.descuento_id ?? null });
    if (vacantes(g.id).vacantes <= 0) {
      if (!datos.lista_espera) throw invalido('No hay vacantes: podés anotarte en la lista de espera');
      const posicion = (db.prepare('SELECT MAX(posicion) FROM lista_espera WHERE grupo_id = ?').pluck().get(g.id) ?? 0) + 1;
      db.prepare('INSERT INTO lista_espera (grupo_id, persona_id, posicion) VALUES (?, ?, ?)').run(g.id, personaId, posicion);
      return { lista_espera: true, posicion };
    }
    const apto = estadoApto(personaId, g.actividad_id);
    const estado = apto.requiere && !apto.vigente ? 'pendiente_apto' : 'activa';
    const hoy = local().fecha;
    const id = db.prepare(`INSERT INTO inscripciones (persona_id, grupo_id, frecuencia_semanal, desde, estado, descuento_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(personaId, g.id, datos.frecuencia, hoy, estado, precio.descuento_id).lastInsertRowid;
    db.prepare('DELETE FROM lista_espera WHERE grupo_id = ? AND persona_id = ?').run(g.id, personaId);
    // Primer cargo: período en curso, con vencimiento el día configurado de la actividad (o en 5 días si ya pasó).
    const periodo = local().periodo;
    const vencimientoActividad = `${periodo}-${String(g.dia_vencimiento).padStart(2, '0')}`;
    crearCargo({ personaId, conceptoTipo: 'arancel', descripcion: `${g.actividad} ${periodo}`, periodo, importe: precio.total,
      vencimiento: vencimientoActividad > hoy ? vencimientoActividad : sumarDias(hoy, 5), origenTipo: 'inscripcion', origenId: id });
    auditar(req, 'inscripcion', 'inscripciones', id, null, { persona_id: personaId, grupo_id: g.id, frecuencia: datos.frecuencia, total: precio.total, estado });
    return { id, estado, total: precio.total };
  });
  res.status(201).json(resultado);
});

// ---------- Reservas ----------
r.get('/reservas', (req, res) => {
  const db = getDb();
  res.json({
    espacios: db.prepare(`SELECT e.*, rr.anticipacion_dias, rr.max_activas, rr.cancelacion_horas, rr.sancion FROM espacios e
      LEFT JOIN reglas_reserva rr ON rr.espacio_id = e.id WHERE e.reservable = 1 AND e.activo = 1`).all(),
    mis_reservas: db.prepare(`SELECT r.*, e.nombre AS espacio FROM reservas r JOIN espacios e ON e.id = r.espacio_id
      WHERE r.persona_id = ? ORDER BY r.inicio DESC LIMIT 30`).all(req.usuario.persona_id),
  });
});
r.get('/reservas/disponibilidad', (req, res) => res.json(disponibilidad(Number(req.query.espacio_id), String(req.query.fecha))));
r.post('/reservas', (req, res) => {
  const datos = validar(z.object({ espacio_id: z.number().int(), inicio: z.string(), fin: z.string() }), req.body);
  res.status(201).json(reservar({ ...datos, personaId: req.usuario.persona_id, tipo: 'socio' }, req));
});
r.post('/reservas/:id/cancelar', (req, res) => res.json(cancelarReserva(Number(req.params.id), req, { propia: true })));

// ---------- Estado de cuenta ----------
r.get('/cuenta', (req, res) => {
  const personaId = personaObjetivo(req);
  const db = getDb();
  res.json({
    resumen: resumenCuenta(personaId),
    cargos: cargosDe(personaId),
    pagos: db.prepare(`SELECT pg.*, c.numero AS recibo, c.id AS comprobante_id FROM pagos pg LEFT JOIN comprobantes c ON c.pago_id = pg.id
      WHERE pg.persona_id = ? ORDER BY pg.fecha DESC LIMIT 50`).all(personaId),
    familia: familia(req.usuario),
  });
});

r.get('/comprobantes/:id', (req, res) => {
  const db = getDb();
  const c = db.prepare('SELECT * FROM comprobantes WHERE id = ?').get(req.params.id);
  if (!c) throw noEncontrado('Comprobante');
  personaObjetivo(req, c.persona_id);
  const persona = db.prepare('SELECT nombre, apellido, dni FROM personas WHERE id = ?').get(c.persona_id);
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(c.pago_id);
  const items = db.prepare(`SELECT ca.descripcion, ca.periodo, im.importe FROM imputaciones im JOIN cargos ca ON ca.id = im.cargo_id WHERE im.pago_id = ?`).all(c.pago_id);
  res.json({ ...c, persona, pago, items });
});

// ---------- Pagar ----------
r.get('/pagos', (req, res) => {
  const db = getDb();
  const ids = personasACargo(req.usuario);
  res.json({
    pendientes: ids.flatMap((id) => cargosDe(id, { soloPendientes: true }).map((c) => ({ ...c, persona: db.prepare('SELECT nombre FROM personas WHERE id = ?').pluck().get(id) }))),
    cuentas: db.prepare(`SELECT nombre, tipo, alias, cbu_cvu, titular FROM cajas WHERE tipo IN ('banco','billetera')`).all(),
    medios: db.prepare('SELECT tipo, nombre, comision_pct FROM medios_pago WHERE activo = 1').all(),
    mercado_pago_simulado: config.mercadoPago.simulado,
    transferencias: db.prepare(`SELECT * FROM transferencias_informadas WHERE persona_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 20`).all(...ids),
    pagos_online: db.prepare(`SELECT * FROM pagos_online WHERE persona_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 20`).all(...ids),
  });
});

function cargosValidados(req, cargoIds) {
  const ids = personasACargo(req.usuario);
  const db = getDb();
  const cargos = cargoIds.map((id) => db.prepare(`SELECT * FROM cargos WHERE id = ? AND estado IN ('pendiente','parcial')`).get(id));
  if (cargos.some((c) => !c || !ids.includes(c.persona_id))) throw invalido('Algún cargo no es tuyo o ya está pago');
  const personas = new Set(cargos.map((c) => c.persona_id));
  if (personas.size > 1) throw invalido('Pagá los cargos de cada integrante por separado');
  return { personaId: cargos[0].persona_id, total: cargos.reduce((s, c) => s + saldoCargo(c.id), 0), cargos };
}

r.post('/pagos/mercadopago', async (req, res) => {
  const { cargo_ids } = validar(z.object({ cargo_ids: z.array(z.number().int()).min(1) }), req.body);
  const { personaId, total, cargos } = cargosValidados(req, cargo_ids);
  const db = getDb();
  const id = db.prepare(`INSERT INTO pagos_online (persona_id, cargo_ids, proveedor, monto) VALUES (?, ?, 'mercadopago', ?)`).run(personaId, JSON.stringify(cargo_ids), total).lastInsertRowid;
  const pref = await crearPreferencia({ pagoOnlineId: id, items: cargos.map((c) => ({ titulo: c.descripcion, importe: saldoCargo(c.id) })), payer: { email: req.usuario.email } });
  db.prepare('UPDATE pagos_online SET preferencia_id = ? WHERE id = ?').run(pref.preferencia_id, id);
  res.status(201).json({ id, total, init_point: pref.init_point, simulado: config.mercadoPago.simulado });
});

// Solo en modo simulado (sin credenciales de Mercado Pago): permite probar el circuito completo.
r.post('/pagos/online/:id/simular', (req, res) => {
  if (!config.mercadoPago.simulado || config.produccion) throw prohibido('Disponible solo en modo de prueba');
  const po = getDb().prepare('SELECT * FROM pagos_online WHERE id = ?').get(req.params.id);
  if (!po) throw noEncontrado('Pago');
  personaObjetivo(req, po.persona_id);
  const estado = req.body?.resultado === 'rechazado' ? 'rejected' : 'approved';
  res.json(acreditar({ pagoOnlineId: po.id, paymentId: `SIM-${Date.now()}`, estado }));
});

r.post('/pagos/transferencia', subida('comprobantes', { maxMb: 5, campos: 1 }).single('comprobante'), (req, res) => {
  const datos = validar(z.object({
    cargo_ids: z.string().transform((s) => json(s, [])).pipe(z.array(z.number().int()).min(1)),
    monto: z.coerce.number().int().positive(),
    medio: z.enum(['transferencia', 'billetera']).default('transferencia'),
    referencia: z.string().max(120).optional(),
  }), req.body);
  if (!req.file) throw invalido('Adjuntá el comprobante de la transferencia');
  const { personaId, total } = cargosValidados(req, datos.cargo_ids);
  if (datos.monto > total) throw invalido('El monto informado supera la deuda seleccionada');
  const id = getDb().prepare(`INSERT INTO transferencias_informadas (persona_id, cargo_ids, monto, medio, comprobante_archivo, referencia) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(personaId, JSON.stringify(datos.cargo_ids), datos.monto, datos.medio, rutaRelativa('comprobantes', req.file), datos.referencia ?? null).lastInsertRowid;
  notificar({ rol: 'admin', tipo: 'cobranza', titulo: 'Nueva transferencia informada para aprobar', referencia: '/admin/cobranzas' });
  notificar({ rol: 'contabilidad', tipo: 'cobranza', titulo: 'Nueva transferencia informada para aprobar', referencia: '/contabilidad/conciliacion' });
  res.status(201).json({ id, estado: 'pendiente' });
});

// ---------- Revisión médica ----------
r.get('/revision-medica', (req, res) => {
  const db = getDb();
  const ids = personasACargo(req.usuario);
  res.json({
    personas: ids.map((id) => {
      const p = db.prepare('SELECT id, nombre, apellido, fecha_nacimiento FROM personas WHERE id = ?').get(id);
      const actividades = db.prepare(`SELECT DISTINCT a.id, a.nombre FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id
        WHERE i.persona_id = ? AND i.estado != 'baja'`).all(id);
      return {
        ...p,
        menor: (edad(p.fecha_nacimiento) ?? 18) < 18,
        consentimiento_salud: !!db.prepare(`SELECT 1 FROM consentimientos WHERE persona_id = ? AND tipo = 'datos_salud' AND revocado_en IS NULL`).get(id),
        actividades: actividades.map((a) => ({ ...a, apto: estadoApto(id, a.id) })),
        // Solo estado y vigencia: el detalle clínico no se expone (propuesta 9.4).
        revisiones: db.prepare(`SELECT r.id, r.fecha, r.resultado, r.vence_en, r.restricciones, tr.nombre AS tipo, r.certificado_externo IS NOT NULL AS externo
          FROM revisiones_medicas r JOIN tipos_revision tr ON tr.id = r.tipo_revision_id WHERE r.persona_id = ? ORDER BY r.fecha DESC LIMIT 10`).all(id),
        turnos: db.prepare(`SELECT t.*, tr.nombre AS tipo FROM turnos_revision t JOIN tipos_revision tr ON tr.id = t.tipo_revision_id
          WHERE t.persona_id = ? AND t.estado IN ('solicitado','confirmado') ORDER BY t.inicio`).all(id),
      };
    }),
    tipos: db.prepare('SELECT * FROM tipos_revision').all(),
  });
});

r.post('/revision-medica/turno', (req, res) => {
  const datos = validar(z.object({ persona_id: z.number().int().optional(), tipo_revision_id: z.number().int(), inicio: z.string() }), req.body);
  const personaId = personaObjetivo(req, datos.persona_id);
  if (new Date(datos.inicio) < new Date()) throw invalido('Elegí una fecha futura');
  const id = getDb().prepare(`INSERT INTO turnos_revision (persona_id, tipo_revision_id, inicio, estado) VALUES (?, ?, ?, 'solicitado')`)
    .run(personaId, datos.tipo_revision_id, new Date(datos.inicio).toISOString()).lastInsertRowid;
  notificar({ rol: 'auxiliar', tipo: 'turno', titulo: 'Nuevo pedido de turno de revisión médica', referencia: '/revision/agenda' });
  res.status(201).json({ id });
});

r.post('/revision-medica/certificado', subida('certificados', { maxMb: 6, campos: 1 }).single('certificado'), (req, res) => {
  const datos = validar(z.object({ persona_id: z.coerce.number().int().optional(), tipo_revision_id: z.coerce.number().int() }), req.body);
  const personaId = personaObjetivo(req, datos.persona_id);
  if (!req.file) throw invalido('Adjuntá el certificado (PDF o imagen)');
  const id = getDb().prepare(`INSERT INTO revisiones_medicas (persona_id, tipo_revision_id, fecha, resultado, certificado_externo, cargado_por)
    VALUES (?, ?, ?, 'pendiente_validacion', ?, ?)`).run(personaId, datos.tipo_revision_id, local().fecha, rutaRelativa('certificados', req.file), req.usuario.id).lastInsertRowid;
  notificar({ rol: 'medico', tipo: 'revision_medica', titulo: 'Nuevo certificado externo para validar', referencia: '/medico/certificados' });
  res.status(201).json({ id });
});

// ---------- Invitados ----------
r.get('/invitados', (req, res) => {
  const db = getDb();
  const socio = db.prepare('SELECT id FROM socios WHERE persona_id = ?').get(req.usuario.persona_id);
  res.json({ valor: 650000, invitados: socio ? db.prepare('SELECT * FROM invitados WHERE socio_anfitrion_id = ? ORDER BY fecha DESC LIMIT 30').all(socio.id) : [] });
});

r.post('/invitados', (req, res) => {
  const datos = validar(z.object({ nombre: z.string().min(3).max(80), dni: z.string().regex(/^\d{7,9}$/), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
  const db = getDb();
  const socio = db.prepare(`SELECT * FROM socios WHERE persona_id = ? AND estado = 'activo'`).get(req.usuario.persona_id);
  if (!socio) throw prohibido('Solo un socio activo puede registrar invitados');
  if (datos.fecha < local().fecha) throw invalido('La fecha ya pasó');
  const out = enTransaccion(() => {
    const importe = 650000;
    const cargoId = crearCargo({ personaId: socio.persona_id, conceptoTipo: 'invitado', descripcion: `Invitado: ${datos.nombre}`, periodo: datos.fecha.slice(0, 7), importe, vencimiento: datos.fecha, origenTipo: 'invitado' });
    const id = db.prepare('INSERT INTO invitados (nombre, dni, socio_anfitrion_id, fecha, importe, cargo_id) VALUES (?, ?, ?, ?, ?, ?)').run(datos.nombre, datos.dni, socio.id, datos.fecha, importe, cargoId).lastInsertRowid;
    return { id, cargo_id: cargoId };
  });
  res.status(201).json(out);
});

// ---------- Novedades ----------
r.get('/novedades', (req, res) => {
  const db = getDb();
  res.json({
    comunicados: comunicadosPara(req.usuario.persona_id),
    notificaciones: db.prepare('SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 50').all(req.usuario.id),
  });
});

// ---------- Trámites y reportes ----------
r.get('/solicitudes', (req, res) => {
  const ids = personasACargo(req.usuario);
  const db = getDb();
  res.json({
    solicitudes: db.prepare(`SELECT * FROM solicitudes WHERE persona_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC`).all(...ids),
    tickets: db.prepare(`SELECT t.id, t.codigo, t.titulo, t.estado, t.prioridad, t.creado_en, s.nombre AS sector FROM tickets_mantenimiento t
      JOIN sectores s ON s.id = t.sector_id WHERE t.reportado_por = ? ORDER BY t.id DESC`).all(req.usuario.id),
    categorias: db.prepare(`SELECT id, nombre, edad_min, edad_max FROM categorias_socio`).all(),
  });
});

r.post('/solicitudes', (req, res) => {
  const datos = validar(z.object({
    tipo: z.enum(['alta_familiar', 'baja', 'cambio_categoria', 'reclamo', 'sugerencia']),
    persona_id: z.number().int().optional(),
    datos: z.record(z.any()).default({}),
  }), req.body);
  const personaId = personaObjetivo(req, datos.persona_id);
  const id = getDb().prepare('INSERT INTO solicitudes (persona_id, tipo, datos_json) VALUES (?, ?, ?)').run(personaId, datos.tipo, JSON.stringify(datos.datos)).lastInsertRowid;
  notificar({ rol: 'admin', tipo: 'solicitud', titulo: `Nueva solicitud: ${datos.tipo.replace('_', ' ')}`, referencia: '/admin/solicitudes' });
  res.status(201).json({ id });
});

// ---------- Privacidad ----------
r.get('/privacidad', (req, res) => {
  const db = getDb();
  const ids = personasACargo(req.usuario);
  res.json({
    consentimientos: db.prepare(`SELECT c.*, p.nombre FROM consentimientos c JOIN personas p ON p.id = c.persona_id
      WHERE c.persona_id IN (${ids.map(() => '?').join(',')}) ORDER BY c.persona_id, c.tipo, c.id DESC`).all(...ids),
    solicitudes: db.prepare(`SELECT * FROM solicitudes WHERE tipo = 'derechos_datos' AND persona_id IN (${ids.map(() => '?').join(',')}) ORDER BY id DESC`).all(...ids),
    version_vigente: db.prepare(`SELECT valor FROM parametros WHERE clave = 'texto_consentimiento_version'`).pluck().get(),
  });
});

r.post('/privacidad/consentimientos', (req, res) => {
  const datos = validar(z.object({ persona_id: z.number().int().optional(), tipo: z.enum(['datos_personales', 'datos_salud', 'imagen', 'comunicaciones']), aceptar: z.boolean() }), req.body);
  const personaId = personaObjetivo(req, datos.persona_id);
  const db = getDb();
  if (datos.aceptar) {
    const version = db.prepare(`SELECT valor FROM parametros WHERE clave = 'texto_consentimiento_version'`).pluck().get();
    const tutor = personaId !== req.usuario.persona_id ? req.usuario.persona_id : null;
    db.prepare('INSERT INTO consentimientos (persona_id, tipo, version_texto, aceptado_en, aceptado_por_tutor_id) VALUES (?, ?, ?, ?, ?)').run(personaId, datos.tipo, version, ahora(), tutor);
  } else {
    db.prepare('UPDATE consentimientos SET revocado_en = ? WHERE persona_id = ? AND tipo = ? AND revocado_en IS NULL').run(ahora(), personaId, datos.tipo);
  }
  auditar(req, datos.aceptar ? 'otorgar_consentimiento' : 'revocar_consentimiento', 'consentimientos', personaId, null, { tipo: datos.tipo });
  res.json({ ok: true });
});

/** Derecho de acceso: descarga de los datos propios en formato abierto (JSON). */
r.get('/privacidad/mis-datos', (req, res) => {
  const db = getDb();
  const id = req.usuario.persona_id;
  const datos = {
    generado_en: ahora(),
    persona: db.prepare('SELECT * FROM personas WHERE id = ?').get(id),
    socio: db.prepare('SELECT * FROM socios WHERE persona_id = ?').get(id),
    consentimientos: db.prepare('SELECT * FROM consentimientos WHERE persona_id = ?').all(id),
    inscripciones: db.prepare('SELECT * FROM inscripciones WHERE persona_id = ?').all(id),
    cargos: db.prepare('SELECT * FROM cargos WHERE persona_id = ?').all(id),
    pagos: db.prepare('SELECT * FROM pagos WHERE persona_id = ?').all(id),
    revisiones_medicas: db.prepare('SELECT fecha, resultado, vence_en, restricciones FROM revisiones_medicas WHERE persona_id = ?').all(id),
    accesos: db.prepare('SELECT fecha_hora, resultado, motivo_codigo, metodo FROM accesos WHERE persona_id = ? ORDER BY id DESC LIMIT 500').all(id),
    reservas: db.prepare('SELECT * FROM reservas WHERE persona_id = ?').all(id),
  };
  auditar(req, 'descarga_datos_propios', 'personas', id);
  res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-cooperarios.json"');
  res.json(datos);
});

r.post('/privacidad/solicitud', (req, res) => {
  const datos = validar(z.object({ derecho: z.enum(['acceso', 'rectificacion', 'actualizacion', 'supresion']), detalle: z.string().min(5).max(1000) }), req.body);
  const id = getDb().prepare(`INSERT INTO solicitudes (persona_id, tipo, datos_json) VALUES (?, 'derechos_datos', ?)`).run(req.usuario.persona_id, JSON.stringify(datos)).lastInsertRowid;
  notificar({ rol: 'admin', tipo: 'privacidad', titulo: `Solicitud de ${datos.derecho} de datos personales`, referencia: '/admin/privacidad' });
  // Plazos legales: acceso 10 días corridos (art. 14); rectificación y supresión 5 días hábiles (art. 16).
  res.status(201).json({ id, plazo: datos.derecho === 'acceso' ? '10 días corridos' : '5 días hábiles' });
});

export default r;
