// Vistas públicas: inicio, historia, catálogo, detalle, cuota social y alta, contacto.
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db/index.js';
import { validar, noEncontrado, local, json } from '../lib/util.js';
import { catalogo, detalleActividad } from '../services/catalogo.js';
import { notificar } from '../lib/auditoria.js';

const r = Router();
const parametros = () => Object.fromEntries(getDb().prepare('SELECT clave, valor FROM parametros').all().map((p) => [p.clave, p.valor]));

r.get('/inicio', (_req, res) => {
  const db = getDb();
  const p = parametros();
  res.json({
    club: { nombre: p.nombre_club, direccion: p.direccion, horario: p.horario_club, horario_administracion: p.horario_administracion },
    hoy: local(),
    novedades: db.prepare(`SELECT id, titulo, cuerpo, categoria, publicado_en FROM comunicados WHERE publico = 1 ORDER BY publicado_en DESC LIMIT 6`).all(),
    actividades: db.prepare('SELECT COUNT(*) FROM actividades WHERE activa = 1').pluck().get(),
    proximos: db.prepare(`SELECT b.desde, b.hasta, e.nombre AS espacio, b.motivo FROM bloqueos_espacio b JOIN espacios e ON e.id = b.espacio_id
      WHERE b.desde >= ? ORDER BY b.desde LIMIT 3`).all(new Date().toISOString()),
  });
});

r.get('/actividades', (req, res) => {
  res.json(catalogo({ tipo: req.query.tipo, edad: req.query.edad, q: req.query.q }));
});

r.get('/actividades/:id', (req, res) => {
  const a = detalleActividad(Number(req.params.id));
  if (!a) throw noEncontrado('Actividad');
  res.json(a);
});

r.get('/cuota-social', (_req, res) => {
  const db = getDb();
  res.json({
    categorias: db.prepare('SELECT * FROM categorias_socio ORDER BY id').all().map((c) => ({ ...c, regla_cuota: json(c.regla_cuota) })),
    cargos_unicos: [
      { concepto: 'Llave magnética de ingreso', valor: 250000, detalle: 'Única vez' },
      { concepto: 'Entrada de invitado (no socio, mayor de 18)', valor: 650000, detalle: 'Por visita, vinculada al socio anfitrión' },
    ],
    consentimiento_version: parametros().texto_consentimiento_version,
  });
});

r.get('/contacto', (_req, res) => {
  const p = parametros();
  res.json({ direccion: p.direccion, telefono: p.telefono, email: p.email_contacto, horario_club: p.horario_club, horario_administracion: p.horario_administracion });
});

r.get('/documentos', (_req, res) => {
  res.json(getDb().prepare(`SELECT id, nombre, categoria, archivo FROM documentos WHERE rol_visible = 'todos' ORDER BY categoria, nombre`).all());
});

const altaLimite = rateLimit({ windowMs: 60 * 60000, limit: 10, message: { error: 'Demasiadas solicitudes. Probá más tarde.' } });

/** Solicitud de alta con consentimiento informado (se registra la versión del texto aceptado). */
r.post('/solicitud-alta', altaLimite, (req, res) => {
  const datos = validar(z.object({
    nombre: z.string().min(2).max(60),
    apellido: z.string().min(2).max(60),
    dni: z.string().regex(/^\d{7,9}$/, 'DNI inválido'),
    fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    email: z.string().email(),
    telefono: z.string().min(6).max(30),
    domicilio: z.string().max(120).optional(),
    categoria: z.string().max(40),
    familiares: z.array(z.object({ nombre: z.string(), apellido: z.string(), dni: z.string(), fecha_nacimiento: z.string(), parentesco: z.string() })).max(8).default([]),
    acepta_datos: z.literal(true, { errorMap: () => ({ message: 'Debés aceptar el tratamiento de datos personales' }) }),
    acepta_comunicaciones: z.boolean().default(false),
  }), req.body);
  const version = parametros().texto_consentimiento_version;
  const existe = getDb().prepare('SELECT 1 FROM personas WHERE dni = ?').get(datos.dni);
  const id = getDb().prepare(`INSERT INTO solicitudes (tipo, datos_json, estado) VALUES ('alta', ?, 'pendiente')`)
    .run(JSON.stringify({ ...datos, consentimiento_version: version, ya_registrado: !!existe, recibida_ip: req.ip })).lastInsertRowid;
  notificar({ rol: 'admin', tipo: 'solicitud', titulo: `Nueva solicitud de alta: ${datos.apellido}, ${datos.nombre}`, referencia: '/admin/solicitudes' });
  res.status(201).json({ id, mensaje: 'Recibimos tu solicitud. Administración te contactará para completar el alta.' });
});

export default r;
