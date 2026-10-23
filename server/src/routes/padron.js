// Padrón de socios, grupos familiares, altas, bajas, cambios y bandeja de solicitudes.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora, enTransaccion } from '../db/index.js';
import { requiereSesion, hashSinUso, enlaceContrasena } from '../lib/auth.js';
import { permiso, puede, ambitoActividades } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, local, edad, json, paginar, marcas, zId } from '../lib/util.js';
import { auditar, notificar, usuarioDePersona } from '../lib/auditoria.js';
import { categoriaPorEdad, cuotaSocial } from '../services/precios.js';
import { resumenCuenta, crearCargo, cargosDe } from '../services/cuenta.js';
import { estadoPorActividad } from '../services/habilitacion.js';
import { enviarCorreo } from '../services/correo.js';
import { config } from '../config.js';

const r = Router();
r.use(requiereSesion);

/**
 * Listado del padrón. Quien tiene lectura limitada (profesor, delegado, mantenimiento, salud)
 * ve solo nombre, número y estado de habilitación, sin datos de contacto ni montos.
 */
r.get('/socios', permiso('padron', 'leer', 'leer_ambito'), (req, res) => {
  const db = getDb();
  const completo = puede(req.usuario, 'padron', 'leer');
  const { limite, offset, pagina } = paginar(req);
  const filtros = [];
  const params = [];
  if (req.query.q) {
    filtros.push(`(p.apellido || ' ' || p.nombre LIKE ? OR p.dni LIKE ? OR CAST(s.nro_socio AS TEXT) LIKE ?)`);
    params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  if (req.query.estado) { filtros.push('s.estado = ?'); params.push(req.query.estado); }
  if (req.query.categoria_id) { filtros.push('s.categoria_id = ?'); params.push(String(req.query.categoria_id)); }
  const ambito = ambitoActividades(req.usuario);
  if (!completo && ambito.length) {
    filtros.push(`p.id IN (SELECT i.persona_id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE g.actividad_id IN (${marcas(ambito)}) AND i.estado != 'baja')`);
    params.push(...ambito);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) FROM socios s JOIN personas p ON p.id = s.persona_id ${where}`).pluck().get(...params);
  const filas = db.prepare(`SELECT s.id, s.nro_socio, s.estado, s.fecha_alta, s.grupo_familiar_id, c.nombre AS categoria, p.id AS persona_id, p.nombre, p.apellido,
      ${completo ? 'p.dni, p.email, p.telefono, p.fecha_nacimiento,' : ''} p.foto
    FROM socios s JOIN personas p ON p.id = s.persona_id JOIN categorias_socio c ON c.id = s.categoria_id ${where}
    ORDER BY p.apellido, p.nombre LIMIT ? OFFSET ?`).all(...params, limite, offset);
  res.json({
    total, pagina, limite,
    filas: filas.map((f) => ({
      ...f,
      ...(completo ? { deuda_vencida: resumenCuenta(f.persona_id).vencido > 0 } : {}),
      habilitado: estadoPorActividad(f.persona_id).every((e) => e.habilitado),
    })),
    resumen: completo ? db.prepare(`SELECT estado, COUNT(*) AS n FROM socios GROUP BY estado`).all() : undefined,
  });
});

r.get('/socios/:personaId', permiso('padron', 'leer'), (req, res) => {
  const db = getDb();
  const id = req.params.personaId;
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
  if (!persona) throw noEncontrado('Persona');
  const socio = db.prepare(`SELECT s.*, c.nombre AS categoria FROM socios s JOIN categorias_socio c ON c.id = s.categoria_id WHERE s.persona_id = ?`).get(id);
  const familia = socio?.grupo_familiar_id ? db.prepare(`SELECT p.id, p.nombre, p.apellido, p.fecha_nacimiento, s.nro_socio, s.estado, gf.titular_persona_id = p.id AS titular
    FROM socios s JOIN personas p ON p.id = s.persona_id JOIN grupos_familiares gf ON gf.id = s.grupo_familiar_id WHERE s.grupo_familiar_id = ?`).all(socio.grupo_familiar_id) : [];
  const verCuenta = puede(req.usuario, 'cuenta_corriente', 'leer', 'gestionar');
  res.json({
    persona: { ...persona, edad: edad(persona.fecha_nacimiento) },
    socio,
    familia,
    tutores: db.prepare(`SELECT t.parentesco, p.id, p.nombre, p.apellido FROM tutores t JOIN personas p ON p.id = t.tutor_persona_id WHERE t.menor_persona_id = ?`).all(id),
    inscripciones: db.prepare(`SELECT i.*, a.nombre AS actividad, g.nombre AS grupo FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id WHERE i.persona_id = ? ORDER BY i.desde DESC`).all(id),
    habilitacion: estadoPorActividad(id),
    cuenta: verCuenta ? { resumen: resumenCuenta(id), cargos: cargosDe(id).slice(0, 24) } : null,
    consentimientos: db.prepare('SELECT tipo, version_texto, aceptado_en, revocado_en FROM consentimientos WHERE persona_id = ? ORDER BY id DESC').all(id),
    historial: db.prepare(`SELECT a.accion, a.entidad, a.creado_en, a.antes, a.despues, p.nombre || ' ' || p.apellido AS usuario FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id LEFT JOIN personas p ON p.id = u.persona_id
      WHERE (a.entidad IN ('socios','personas') AND a.entidad_id IN (?, ?)) ORDER BY a.id DESC LIMIT 30`).all(id, socio?.id ?? null),
    accesos: db.prepare(`SELECT ac.fecha_hora, ac.resultado, ac.motivo_codigo, a.nombre AS actividad FROM accesos ac LEFT JOIN actividades a ON a.id = ac.actividad_id WHERE ac.persona_id = ? ORDER BY ac.id DESC LIMIT 15`).all(id),
  });
});

const altaSchema = z.object({
  nombre: z.string().min(2), apellido: z.string().min(2), dni: z.string().regex(/^\d{7,9}$/),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(), domicilio: z.string().optional(), jubilado: z.boolean().default(false),
  categoria_id: zId.optional(),
  grupo_familiar_id: zId.nullable().optional(),
  crear_grupo_familiar: z.boolean().default(false),
  tutor_persona_id: zId.nullable().optional(),
  parentesco: z.string().optional(),
  llave: z.boolean().default(false),
  consentimiento: z.boolean().refine((v) => v, 'Falta el consentimiento informado firmado'),
  solicitud_id: zId.optional(),
});

/** Alta de socio (y opcionalmente de su grupo familiar). Genera la primera cuota y, si corresponde, el cargo de la llave. */
export function altaSocio(datos, req) {
  return enTransaccion(() => {
    const db = getDb();
    let persona = db.prepare('SELECT * FROM personas WHERE dni = ?').get(datos.dni);
    if (persona && db.prepare('SELECT 1 FROM socios WHERE persona_id = ?').get(persona.id)) throw invalido('Esa persona ya es socia');
    const personaId = persona?.id ?? db.prepare(`INSERT INTO personas (dni, nombre, apellido, fecha_nacimiento, email, telefono, domicilio, jubilado, tipo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'socio') RETURNING id`).get(datos.dni, datos.nombre, datos.apellido, datos.fecha_nacimiento, datos.email || null, datos.telefono ?? null, datos.domicilio ?? null, datos.jubilado ? 1 : 0).id;
    let grupoId = datos.grupo_familiar_id ?? null;
    if (datos.crear_grupo_familiar) grupoId = db.prepare('INSERT INTO grupos_familiares (titular_persona_id, nombre) VALUES (?, ?) RETURNING id').get(personaId, `Familia ${datos.apellido}`).id;
    const categoriaId = datos.categoria_id ?? categoriaPorEdad(datos.fecha_nacimiento).id;
    const nro = (db.prepare('SELECT MAX(nro_socio) FROM socios').pluck().get() ?? 1000) + 1;
    const hoy = local().fecha;
    const socioId = db.prepare(`INSERT INTO socios (persona_id, nro_socio, categoria_id, grupo_familiar_id, estado, fecha_alta, llave_nro) VALUES (?, ?, ?, ?, 'activo', ?, ?) RETURNING id`)
      .get(personaId, nro, categoriaId, grupoId, hoy, datos.llave ? `LL-${nro}` : null).id;
    if (datos.tutor_persona_id) db.prepare('INSERT OR IGNORE INTO tutores VALUES (?, ?, ?)').run(personaId, datos.tutor_persona_id, datos.parentesco ?? 'tutor');
    const version = db.prepare(`SELECT valor FROM parametros WHERE clave = 'texto_consentimiento_version'`).pluck().get();
    for (const tipo of ['datos_personales', 'comunicaciones']) {
      db.prepare('INSERT INTO consentimientos (persona_id, tipo, version_texto, aceptado_en, aceptado_por_tutor_id) VALUES (?, ?, ?, ?, ?)').run(personaId, tipo, version, ahora(), datos.tutor_persona_id ?? null);
    }
    const socio = db.prepare('SELECT * FROM socios WHERE id = ?').get(socioId);
    const periodo = local().periodo;
    crearCargo({ personaId, conceptoTipo: 'cuota_social', descripcion: `Cuota social ${periodo}`, periodo, importe: cuotaSocial(socio), vencimiento: hoy, origenTipo: 'socio', origenId: socioId });
    if (datos.llave) crearCargo({ personaId, conceptoTipo: 'llave', descripcion: 'Llave magnética de ingreso (única vez)', periodo, importe: 250000, vencimiento: hoy });
    if (datos.solicitud_id) db.prepare(`UPDATE solicitudes SET estado = 'aprobada', persona_id = ?, resuelta_por = ?, resuelta_en = ? WHERE id = ?`).run(personaId, req.usuario.id, ahora(), datos.solicitud_id);
    auditar(req, 'alta_socio', 'socios', socioId, null, { persona_id: personaId, nro_socio: nro, categoria_id: categoriaId, grupo_familiar_id: grupoId });
    return { persona_id: personaId, socio_id: socioId, nro_socio: nro, grupo_familiar_id: grupoId };
  });
}

r.post('/socios', permiso('altas_bajas', 'gestionar'), (req, res) => {
  res.status(201).json(altaSocio(validar(altaSchema, req.body), req));
});

/** Cambio de estado o categoría (auditado con valores anterior y posterior). */
r.put('/socios/:personaId', permiso('altas_bajas', 'gestionar'), (req, res) => {
  const datos = validar(z.object({
    estado: z.enum(['activo', 'suspendido', 'baja']).optional(),
    categoria_id: zId.optional(),
    motivo: z.string().min(3).optional(),
    grupo_familiar_id: zId.nullable().optional(),
    email: z.string().email().optional(), telefono: z.string().optional(), domicilio: z.string().optional(), jubilado: z.boolean().optional(),
  }), req.body);
  const db = getDb();
  const id = req.params.personaId;
  const s = db.prepare('SELECT * FROM socios WHERE persona_id = ?').get(id);
  if (!s) throw noEncontrado('Socio');
  if (datos.estado && datos.estado !== s.estado && !datos.motivo) throw invalido('Indicá el motivo del cambio de estado');
  enTransaccion(() => {
    if (datos.estado) db.prepare('UPDATE socios SET estado = ?, fecha_baja = ?, motivo_baja = ? WHERE id = ?').run(datos.estado, datos.estado === 'baja' ? local().fecha : null, datos.estado === 'baja' ? datos.motivo : null, s.id);
    if (datos.categoria_id) db.prepare('UPDATE socios SET categoria_id = ? WHERE id = ?').run(datos.categoria_id, s.id);
    if (datos.grupo_familiar_id !== undefined) db.prepare('UPDATE socios SET grupo_familiar_id = ? WHERE id = ?').run(datos.grupo_familiar_id, s.id);
    if (datos.estado === 'baja') db.prepare(`UPDATE inscripciones SET estado = 'baja', hasta = ? WHERE persona_id = ? AND estado != 'baja'`).run(local().fecha, id);
    const contacto = ['email', 'telefono', 'domicilio'].filter((k) => datos[k] !== undefined);
    if (contacto.length) db.prepare(`UPDATE personas SET ${contacto.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...contacto.map((k) => datos[k]), id);
    if (datos.jubilado !== undefined) db.prepare('UPDATE personas SET jubilado = ? WHERE id = ?').run(datos.jubilado ? 1 : 0, id);
  });
  auditar(req, 'modificar_socio', 'socios', s.id, { estado: s.estado, categoria_id: s.categoria_id, grupo_familiar_id: s.grupo_familiar_id }, datos);
  const u = usuarioDePersona(id);
  if (u && datos.estado) notificar({ usuarioId: u, tipo: 'socio', titulo: `Tu condición de socio cambió a: ${datos.estado}`, referencia: '/perfil' });
  res.json({ ok: true });
});

r.get('/categorias', permiso('padron', 'leer', 'leer_ambito'), (_req, res) => {
  res.json(getDb().prepare('SELECT * FROM categorias_socio').all().map((c) => ({ ...c, regla_cuota: json(c.regla_cuota) })));
});
r.get('/grupos-familiares', permiso('padron', 'leer'), (req, res) => {
  res.json(getDb().prepare(`SELECT gf.*, p.nombre || ' ' || p.apellido AS titular, (SELECT COUNT(*) FROM socios WHERE grupo_familiar_id = gf.id) AS integrantes
    FROM grupos_familiares gf JOIN personas p ON p.id = gf.titular_persona_id WHERE gf.nombre LIKE ? ORDER BY gf.nombre LIMIT 50`).all(`%${req.query.q ?? ''}%`));
});

/**
 * Cuenta de ingreso del socio recién aprobado, con el email de su solicitud y el rol socio.
 * No se entrega contraseña: le llega un enlace para elegirla. Devuelve qué pasó, para mostrarlo en la bandeja.
 */
async function cuentaDelNuevoSocio(req, { personaId, nombre, email, nroSocio, fechaNacimiento }) {
  const db = getDb();
  const rolSocio = db.prepare(`SELECT id FROM roles WHERE codigo = 'socio'`).pluck().get();
  const propia = db.prepare('SELECT * FROM usuarios WHERE persona_id = ?').get(personaId);
  if (propia) {
    if (!db.prepare('SELECT 1 FROM usuario_roles WHERE usuario_id = ? AND rol_id = ?').get(propia.id, rolSocio)) {
      db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)').run(propia.id, rolSocio);
      auditar(req, 'asignar_rol', 'usuarios', propia.id, null, { rol: 'socio', origen: 'solicitud_alta' });
    }
    return { creada: false, aviso: `Ya tenía cuenta (${propia.email}): ahora también tiene el rol socio.` };
  }
  const anios = edad(fechaNacimiento);
  if (anios !== null && anios < 18) return { creada: false, aviso: 'Es menor de edad: no se crea cuenta propia; accede desde la de su titular o tutor.' };
  if (!email) return { creada: false, aviso: 'La solicitud no tiene email: creá la cuenta desde Usuarios y roles.' };
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
    return { creada: false, aviso: `El email ${email} ya lo usa otra cuenta: creá la del socio desde Usuarios y roles con otro email.` };
  }
  const hash = await hashSinUso();
  const usuario = enTransaccion(() => {
    const id = db.prepare('INSERT INTO usuarios (persona_id, email, password_hash) VALUES (?, ?, ?) RETURNING id').get(personaId, email, hash).id;
    db.prepare('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)').run(id, rolSocio);
    return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  });
  auditar(req, 'alta_usuario', 'usuarios', usuario.id, null, { email, roles: ['socio'], origen: 'solicitud_alta' });
  const enlace = enlaceContrasena(usuario, { modo: 'activar', vence: '7d' });
  const enviado = await enviarCorreo({
    para: email,
    asunto: 'Tu alta en el Club Los Cooperarios fue aprobada',
    texto: `Hola, ${nombre}:

Tu solicitud de alta fue aprobada. Ya sos socio/a N° ${nroSocio}.

`
      + `Para ingresar a la plataforma del club, elegí tu contraseña con este enlace (vale 7 días):
${enlace}

`
      + `Tu usuario es este email: ${email}. Si el enlace venció, pedí uno nuevo con «Olvidé mi contraseña» en la pantalla de ingreso.

`
      + 'Club Social y Deportivo Los Cooperarios',
  });
  return { creada: true, email, correo_enviado: enviado, enlace_dev: config.produccion ? undefined : enlace };
}

// ---------- Bandeja de solicitudes (altas, bajas, cambios, reclamos, sugerencias) ----------
r.get('/solicitudes', permiso('altas_bajas', 'gestionar', 'leer', 'aprobar'), (req, res) => {
  const db = getDb();
  const estado = req.query.estado ?? 'pendiente';
  const tipo = req.query.tipo;
  res.json(db.prepare(`SELECT s.*, p.nombre, p.apellido, so.nro_socio FROM solicitudes s LEFT JOIN personas p ON p.id = s.persona_id
    LEFT JOIN socios so ON so.persona_id = s.persona_id WHERE (? = 'todas' OR s.estado = ?) AND s.tipo != 'derechos_datos' ${tipo ? 'AND s.tipo = ?' : ''}
    ORDER BY s.creada_en DESC LIMIT 200`).all(...[estado, estado, ...(tipo ? [tipo] : [])]).map((s) => ({ ...s, datos: json(s.datos_json, {}) })));
});

r.post('/solicitudes/:id/resolver', permiso('altas_bajas', 'gestionar'), async (req, res) => {
  const datos = validar(z.object({ estado: z.enum(['en_proceso', 'aprobada', 'rechazada', 'resuelta']), respuesta: z.string().max(1000).optional(), alta: altaSchema.partial().optional() }), req.body);
  const db = getDb();
  const s = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(req.params.id);
  if (!s) throw noEncontrado('Solicitud');
  if (['aprobada', 'rechazada', 'resuelta'].includes(s.estado)) throw invalido('La solicitud ya fue resuelta');
  let resultado = null;
  const d = json(s.datos_json, {});
  if (datos.estado === 'aprobada') {
    if (s.tipo === 'alta' || s.tipo === 'alta_familiar') {
      const titular = s.tipo === 'alta_familiar' ? db.prepare('SELECT * FROM socios WHERE persona_id = ?').get(s.persona_id) : null;
      resultado = altaSocio(validar(altaSchema, {
        nombre: d.nombre, apellido: d.apellido, dni: d.dni, fecha_nacimiento: d.fecha_nacimiento, email: d.email ?? '', telefono: d.telefono, domicilio: d.domicilio,
        grupo_familiar_id: titular?.grupo_familiar_id ?? null, tutor_persona_id: titular && edad(d.fecha_nacimiento) < 18 ? s.persona_id : null, parentesco: d.parentesco,
        consentimiento: true, solicitud_id: s.id, ...datos.alta,
      }), req);
      const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(resultado.persona_id);
      resultado.cuenta = await cuentaDelNuevoSocio(req, {
        personaId: persona.id, nombre: persona.nombre, email: datos.alta?.email || d.email, nroSocio: resultado.nro_socio, fechaNacimiento: persona.fecha_nacimiento,
      });
    } else if (s.tipo === 'baja') {
      db.prepare(`UPDATE socios SET estado = 'baja', fecha_baja = ?, motivo_baja = ? WHERE persona_id = ?`).run(local().fecha, d.motivo ?? 'Solicitud del socio', s.persona_id);
      db.prepare(`UPDATE inscripciones SET estado = 'baja', hasta = ? WHERE persona_id = ? AND estado != 'baja'`).run(local().fecha, s.persona_id);
      auditar(req, 'baja_socio', 'socios', s.persona_id, null, { motivo: d.motivo });
    } else if (s.tipo === 'cambio_categoria' && d.categoria_id) {
      db.prepare('UPDATE socios SET categoria_id = ? WHERE persona_id = ?').run(String(d.categoria_id), s.persona_id);
      auditar(req, 'cambio_categoria', 'socios', s.persona_id, null, { categoria_id: d.categoria_id });
    }
  }
  db.prepare('UPDATE solicitudes SET estado = ?, respuesta = ?, resuelta_por = ?, resuelta_en = ? WHERE id = ?')
    .run(datos.estado, datos.respuesta ?? null, req.usuario.id, datos.estado === 'en_proceso' ? null : ahora(), s.id);
  const u = s.persona_id ? usuarioDePersona(s.persona_id) : null;
  if (u) notificar({ usuarioId: u, tipo: 'solicitud', titulo: `Tu solicitud de ${s.tipo.replace('_', ' ')} fue ${datos.estado.replace('_', ' ')}`, referencia: '/tramites' });
  auditar(req, 'resolver_solicitud', 'solicitudes', s.id, { estado: s.estado }, { estado: datos.estado });
  res.json({ ok: true, resultado });
});

export default r;
