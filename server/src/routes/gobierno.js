// Gobierno y comunicación: comunicados, documentos, notificaciones, actas y resoluciones, subcomisiones,
// pedidos de cambio, bandeja de aprobaciones, tableros e indicadores y privacidad.
import { Router } from 'express';
import { z } from 'zod';
import { getDb, ahora, enTransaccion } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { permiso, puede, tieneRol, ambitoActividades } from '../lib/rbac.js';
import { validar, invalido, noEncontrado, prohibido, local, json, sumarMeses, marcas, zId } from '../lib/util.js';
import { auditar, notificar, usuarioDePersona } from '../lib/auditoria.js';
import { subida, rutaRelativa } from '../services/archivos.js';

const r = Router();
r.use(['/comunicados', '/documentos', '/notificaciones', '/actas', '/subcomisiones', '/pedidos-cambio', '/aprobaciones', '/tablero', '/privacidad'], requiereSesion);

// ---------- Notificaciones ----------
r.get('/notificaciones', (req, res) => {
  const db = getDb();
  res.json({
    no_leidas: db.prepare('SELECT COUNT(*) FROM notificaciones WHERE usuario_id = ? AND leida_en IS NULL').pluck().get(req.usuario.id),
    items: db.prepare('SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 40').all(req.usuario.id),
  });
});
r.post('/notificaciones/leer', (req, res) => {
  const { id } = req.body ?? {};
  const db = getDb();
  if (id) db.prepare('UPDATE notificaciones SET leida_en = ? WHERE id = ? AND usuario_id = ?').run(ahora(), id, req.usuario.id);
  else db.prepare('UPDATE notificaciones SET leida_en = ? WHERE usuario_id = ? AND leida_en IS NULL').run(ahora(), req.usuario.id);
  res.json({ ok: true });
});

// ---------- Comunicados ----------
function audienciaPermitida(req, audiencia) {
  if (puede(req.usuario, 'comunicados', 'gestionar')) return true;
  if (!puede(req.usuario, 'comunicados', 'gestionar_ambito')) return false;
  const db = getDb();
  if (tieneRol(req.usuario, 'subcomision')) return audiencia.tipo === 'actividad' && ambitoActividades(req.usuario).includes(audiencia.id);
  if (tieneRol(req.usuario, 'profesor')) {
    return audiencia.tipo === 'grupo' && !!db.prepare('SELECT 1 FROM grupos g JOIN profesores p ON p.id = g.profesor_id WHERE g.id = ? AND p.persona_id = ?').get(audiencia.id, req.usuario.persona_id);
  }
  if (tieneRol(req.usuario, 'auxiliar')) return audiencia.tipo === 'actividad';
  return false;
}

r.get('/comunicados', permiso('comunicados', 'leer', 'gestionar', 'gestionar_ambito'), (req, res) => {
  const db = getDb();
  const todos = db.prepare(`SELECT c.*, p.nombre || ' ' || p.apellido AS autor FROM comunicados c LEFT JOIN usuarios u ON u.id = c.publicado_por
    LEFT JOIN personas p ON p.id = u.persona_id ORDER BY c.publicado_en DESC LIMIT 200`).all().map((c) => ({ ...c, audiencia: json(c.audiencia) }));
  const visibles = puede(req.usuario, 'comunicados', 'gestionar', 'leer') ? todos : todos.filter((c) => c.publicado_por === req.usuario.id || audienciaPermitida(req, c.audiencia));
  res.json({
    comunicados: visibles,
    opciones: {
      actividades: db.prepare('SELECT id, nombre FROM actividades ORDER BY nombre').all(),
      categorias: db.prepare(`SELECT id, nombre FROM categorias_socio WHERE json_extract(regla_cuota,'$.tipo') = 'fija'`).all(),
      grupos: db.prepare(`SELECT g.id, a.nombre || ' · ' || g.nombre AS nombre FROM grupos g JOIN actividades a ON a.id = g.actividad_id ORDER BY a.nombre`).all(),
    },
  });
});

/** Envío segmentado por actividad, categoría o grupo; genera notificaciones a los destinatarios. */
r.post('/comunicados', permiso('comunicados', 'gestionar', 'gestionar_ambito'), (req, res) => {
  const d = validar(z.object({ titulo: z.string().min(3).max(140), cuerpo: z.string().min(3).max(5000), categoria: z.string().default('institucional'), publico: z.boolean().default(false),
    audiencia: z.object({ tipo: z.enum(['todos', 'actividad', 'categoria', 'grupo']), id: zId.optional() }) }), req.body);
  if (!audienciaPermitida(req, d.audiencia)) throw prohibido('No podés enviar comunicados a esa audiencia');
  if (d.publico && !puede(req.usuario, 'comunicados', 'gestionar')) throw prohibido('Solo Administración publica en el sitio');
  const db = getDb();
  const id = enTransaccion(() => {
    const nuevo = db.prepare('INSERT INTO comunicados (titulo, cuerpo, audiencia, categoria, publico, publicado_por, publicado_en) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .get(d.titulo, d.cuerpo, JSON.stringify(d.audiencia), d.categoria, d.publico ? 1 : 0, req.usuario.id, ahora()).id;
    const a = d.audiencia;
    const personas = a.tipo === 'todos' ? db.prepare(`SELECT persona_id FROM socios WHERE estado = 'activo'`).pluck().all()
      : a.tipo === 'categoria' ? db.prepare(`SELECT persona_id FROM socios WHERE estado = 'activo' AND categoria_id = ?`).pluck().all(a.id)
        : a.tipo === 'grupo' ? db.prepare(`SELECT persona_id FROM inscripciones WHERE grupo_id = ? AND estado != 'baja'`).pluck().all(a.id)
          : db.prepare(`SELECT DISTINCT i.persona_id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE g.actividad_id = ? AND i.estado != 'baja'`).pluck().all(a.id);
    const usuarios = new Set(personas.map((p) => usuarioDePersona(p) ?? db.prepare('SELECT u.id FROM tutores t JOIN usuarios u ON u.persona_id = t.tutor_persona_id WHERE t.menor_persona_id = ?').pluck().get(p)).filter(Boolean));
    const st = db.prepare('INSERT INTO notificaciones (usuario_id, tipo, titulo, referencia) VALUES (?, ?, ?, ?)');
    for (const u of usuarios) st.run(u, 'comunicado', d.titulo, '/socio/novedades');
    return { id: nuevo, destinatarios: usuarios.size };
  });
  auditar(req, 'publicar_comunicado', 'comunicados', id.id, null, { titulo: d.titulo, audiencia: d.audiencia });
  res.status(201).json(id);
});

// ---------- Documentos con visibilidad por rol ----------
r.get('/documentos', (req, res) => {
  const codigos = req.usuario.roles.map((x) => x.codigo);
  const docs = getDb().prepare('SELECT * FROM documentos ORDER BY categoria, nombre').all();
  const gestiona = tieneRol(req.usuario, 'admin');
  res.json(docs.filter((d) => gestiona || d.rol_visible === 'todos' || d.rol_visible.split(',').some((c) => codigos.includes(c))));
});

r.post('/documentos', subida('documentos', { maxMb: 10, campos: 1 }).single('archivo'), (req, res) => {
  if (!tieneRol(req.usuario, 'admin')) throw prohibido();
  const d = validar(z.object({ id: zId.optional(), nombre: z.string().min(3), categoria: z.enum(['reglamento', 'formulario', 'circular']), rol_visible: z.string().default('todos') }), req.body);
  const db = getDb();
  const archivo = req.file ? rutaRelativa('documentos', req.file) : null;
  const id = d.id ? (db.prepare('UPDATE documentos SET nombre = ?, categoria = ?, rol_visible = ?, archivo = COALESCE(?, archivo) WHERE id = ?').run(d.nombre, d.categoria, d.rol_visible, archivo, d.id), d.id)
    : db.prepare('INSERT INTO documentos (nombre, categoria, archivo, rol_visible) VALUES (?, ?, ?, ?) RETURNING id').get(d.nombre, d.categoria, archivo, d.rol_visible).id;
  auditar(req, 'guardar_documento', 'documentos', id, null, d);
  res.json({ id });
});

// ---------- Actas, reuniones y resoluciones ----------
r.get('/actas', permiso('actas', 'leer', 'gestionar', 'leer_ambito'), (req, res) => {
  const db = getDb();
  const ambito = puede(req.usuario, 'actas', 'gestionar') ? null : tieneRol(req.usuario, 'subcomision')
    ? db.prepare(`SELECT DISTINCT subcomision_id FROM actividades WHERE id IN (${marcas(ambitoActividades(req.usuario))})`).pluck().all(...ambitoActividades(req.usuario)) : null;
  const reuniones = db.prepare(`SELECT r.*, s.nombre AS subcomision FROM reuniones r LEFT JOIN subcomisiones s ON s.id = r.subcomision_id ORDER BY r.fecha DESC`).all()
    .filter((x) => !ambito || ambito.includes(x.subcomision_id));
  res.json({
    reuniones: reuniones.map((x) => ({ ...x, resoluciones: db.prepare(`SELECT re.*, p.nombre || ' ' || p.apellido AS responsable FROM resoluciones re LEFT JOIN personas p ON p.id = re.responsable_id WHERE re.reunion_id = ?`).all(x.id) })),
    directivos: db.prepare(`SELECT cd.*, p.nombre || ' ' || p.apellido AS nombre FROM cargos_directivos cd JOIN personas p ON p.id = cd.persona_id WHERE cd.hasta IS NULL OR cd.hasta >= ?`).all(local().fecha),
    subcomisiones: db.prepare('SELECT id, nombre FROM subcomisiones').all(),
  });
});

r.post('/actas/reuniones', permiso('actas', 'gestionar'), subida('actas', { maxMb: 10, campos: 1 }).single('acta'), (req, res) => {
  const d = validar(z.object({ id: zId.optional(), tipo: z.enum(['ordinaria', 'extraordinaria', 'subcomision', 'asamblea']), subcomision_id: zId.optional(),
    fecha: z.string(), estado: z.enum(['convocada', 'realizada', 'acta_aprobada']).default('convocada'), orden_del_dia: z.string().optional() }), req.body);
  const db = getDb();
  const acta = req.file ? rutaRelativa('actas', req.file) : null;
  const id = d.id ? (db.prepare('UPDATE reuniones SET tipo = ?, subcomision_id = ?, fecha = ?, estado = ?, orden_del_dia = ?, acta_archivo = COALESCE(?, acta_archivo) WHERE id = ?').run(d.tipo, d.subcomision_id ?? null, d.fecha, d.estado, d.orden_del_dia ?? null, acta, d.id), d.id)
    : db.prepare('INSERT INTO reuniones (tipo, subcomision_id, fecha, estado, orden_del_dia, acta_archivo) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').get(d.tipo, d.subcomision_id ?? null, d.fecha, d.estado, d.orden_del_dia ?? null, acta).id;
  auditar(req, 'guardar_reunion', 'reuniones', id, null, d);
  res.json({ id });
});

r.post('/actas/resoluciones', permiso('actas', 'gestionar'), (req, res) => {
  const d = validar(z.object({ id: zId.optional(), reunion_id: zId, numero: z.string().optional(), texto: z.string().min(5), responsable_id: zId.nullable().optional(),
    estado: z.enum(['pendiente', 'en_curso', 'cumplida']).default('pendiente'), vence_en: z.string().nullable().optional() }), req.body);
  const db = getDb();
  const vals = [d.reunion_id, d.numero ?? null, d.texto, d.responsable_id ?? null, d.estado, d.vence_en ?? null];
  const id = d.id ? (db.prepare('UPDATE resoluciones SET reunion_id = ?, numero = ?, texto = ?, responsable_id = ?, estado = ?, vence_en = ? WHERE id = ?').run(...vals, d.id), d.id)
    : db.prepare('INSERT INTO resoluciones (reunion_id, numero, texto, responsable_id, estado, vence_en) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').get(...vals).id;
  auditar(req, 'guardar_resolucion', 'resoluciones', id, null, d);
  res.json({ id });
});

// ---------- Subcomisiones ----------
r.get('/subcomisiones', permiso('actividades', 'leer', 'gestionar', 'leer_ambito', 'gestionar_ambito'), (req, res) => {
  const db = getDb();
  const anio = local().fecha.slice(0, 4);
  res.json(db.prepare('SELECT * FROM subcomisiones ORDER BY nombre').all().map((s) => ({
    ...s,
    actividades: db.prepare('SELECT id, nombre FROM actividades WHERE subcomision_id = ?').all(s.id),
    delegados: db.prepare(`SELECT DISTINCT p.nombre || ' ' || p.apellido AS nombre, a.nombre AS actividad FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
      JOIN usuarios u ON u.id = ur.usuario_id JOIN personas p ON p.id = u.persona_id JOIN actividades a ON a.id = ur.actividad_id
      WHERE r.codigo = 'subcomision' AND a.subcomision_id = ?`).all(s.id),
    inscriptos: db.prepare(`SELECT COUNT(*) FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id WHERE a.subcomision_id = ? AND i.estado != 'baja'`).pluck().get(s.id),
    compras: db.prepare(`SELECT COALESCE(SUM(sc.monto_estimado),0) FROM solicitudes_compra sc JOIN actividades a ON a.id = sc.actividad_id WHERE a.subcomision_id = ? AND sc.estado IN ('autorizada','comprada') AND substr(sc.creada_en,1,4) = ?`).pluck().get(s.id, anio),
    reuniones: db.prepare('SELECT COUNT(*) FROM reuniones WHERE subcomision_id = ?').pluck().get(s.id),
  })));
});

// ---------- Pedidos de cambio (nuevas secciones, roles y permisos) ----------
r.get('/pedidos-cambio', permiso('pedidos_cambio', 'solicitar', 'aprobar', 'gestionar'), (req, res) => {
  const db = getDb();
  const todos = puede(req.usuario, 'pedidos_cambio', 'aprobar', 'gestionar');
  res.json(db.prepare(`SELECT pc.*, a.nombre AS actividad, p.nombre || ' ' || p.apellido AS solicitante,
      (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = pc.resuelto_por) AS resolvio
    FROM pedidos_cambio pc LEFT JOIN actividades a ON a.id = pc.actividad_id JOIN usuarios u ON u.id = pc.solicitante_id LEFT JOIN personas p ON p.id = u.persona_id
    ${todos ? '' : 'WHERE pc.solicitante_id = ?'} ORDER BY pc.id DESC`).all(...(todos ? [] : [req.usuario.id])));
});

r.post('/pedidos-cambio', permiso('pedidos_cambio', 'solicitar', 'aprobar'), (req, res) => {
  const d = validar(z.object({ tipo: z.enum(['nueva_seccion', 'nuevo_rol', 'cambio_permisos']), titulo: z.string().min(5).max(120), justificacion: z.string().min(20).max(3000),
    actividad_id: zId.nullable().optional(), prioridad: z.enum(['alta', 'media', 'baja']).default('media') }), req.body);
  const esDirectiva = tieneRol(req.usuario, 'directiva');
  const esDelegado = tieneRol(req.usuario, 'subcomision');
  if (esDelegado && !esDirectiva) {
    if (!d.actividad_id || !ambitoActividades(req.usuario).includes(d.actividad_id)) throw prohibido('El pedido debe ser para tu actividad');
  }
  const origen = esDirectiva ? 'comision_directiva' : esDelegado ? 'representante_actividad' : 'administracion';
  const id = getDb().prepare('INSERT INTO pedidos_cambio (solicitante_id, origen, actividad_id, tipo, titulo, justificacion, prioridad) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .get(req.usuario.id, origen, d.actividad_id ?? null, d.tipo, d.titulo, d.justificacion, d.prioridad).id;
  notificar({ rol: 'directiva', tipo: 'pedido_cambio', titulo: `Nuevo pedido de cambio: ${d.titulo}`, referencia: '/directiva/pedidos-cambio' });
  notificar({ rol: 'sistemas', tipo: 'pedido_cambio', titulo: `Nuevo pedido para analizar: ${d.titulo}`, referencia: '/sistema/roles' });
  res.status(201).json({ id });
});

/**
 * Flujo: recibido → en_analisis (Sistemas estima) → aprobado/rechazado/diferido (Comisión Directiva, con motivo)
 * → implementado (Sistemas). Nadie se otorga permisos a sí mismo.
 */
r.post('/pedidos-cambio/:id/estado', permiso('pedidos_cambio', 'aprobar', 'gestionar'), (req, res) => {
  const d = validar(z.object({ estado: z.enum(['en_analisis', 'aprobado', 'rechazado', 'diferido', 'implementado']), motivo: z.string().max(2000).optional(), prioridad: z.enum(['alta', 'media', 'baja']).optional() }), req.body);
  const db = getDb();
  const pc = db.prepare('SELECT * FROM pedidos_cambio WHERE id = ?').get(req.params.id);
  if (!pc) throw noEncontrado('Pedido');
  const decide = ['aprobado', 'rechazado', 'diferido'].includes(d.estado);
  if (decide && !puede(req.usuario, 'pedidos_cambio', 'aprobar')) throw prohibido('Decide la Comisión Directiva');
  if (decide && !d.motivo) throw invalido('Indicá el motivo (se asienta en actas)');
  if (!decide && !puede(req.usuario, 'pedidos_cambio', 'gestionar')) throw prohibido('El análisis y la implementación los hace Sistemas');
  if (d.estado === 'implementado' && pc.estado !== 'aprobado') throw invalido('Solo se implementa un pedido aprobado');
  if (pc.solicitante_id === req.usuario.id && decide) throw prohibido('Quien pide no resuelve su propio pedido');
  db.prepare('UPDATE pedidos_cambio SET estado = ?, motivo_resolucion = COALESCE(?, motivo_resolucion), prioridad = COALESCE(?, prioridad), resuelto_por = CASE WHEN ? THEN ? ELSE resuelto_por END WHERE id = ?')
    .run(d.estado, d.motivo ?? null, d.prioridad ?? null, decide ? 1 : 0, req.usuario.id, pc.id);
  notificar({ usuarioId: pc.solicitante_id, tipo: 'pedido_cambio', titulo: `Tu pedido "${pc.titulo}" pasó a: ${d.estado.replace('_', ' ')}`, referencia: tieneRol(req.usuario, 'directiva') ? '/subcomision/pedidos-cambio' : '/directiva/pedidos-cambio' });
  auditar(req, 'pedido_cambio', 'pedidos_cambio', pc.id, { estado: pc.estado }, d);
  res.json({ ok: true });
});

// ---------- Bandeja de aprobaciones de la Comisión Directiva ----------
r.get('/aprobaciones', permiso('gastos', 'aprobar'), (_req, res) => {
  const db = getDb();
  const umbral = Number(db.prepare(`SELECT valor FROM parametros WHERE clave = 'umbral_aprobacion_gastos'`).pluck().get());
  res.json({
    umbral,
    gastos: db.prepare(`SELECT g.*, cg.nombre AS categoria, (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = g.registrado_por) AS registrado
      FROM gastos g JOIN categorias_gasto cg ON cg.id = g.categoria_id WHERE g.estado = 'pendiente_aprobacion' ORDER BY g.fecha`).all(),
    facturas: db.prepare(`SELECT f.*, p.razon_social FROM facturas_proveedor f JOIN proveedores p ON p.id = f.proveedor_id WHERE f.estado = 'cargada' AND f.total > ? ORDER BY f.vence`).all(umbral),
    habilitaciones: db.prepare(`SELECT hm.*, p.nombre, p.apellido, s.nro_socio, a.nombre AS actividad FROM habilitaciones_manuales hm JOIN personas p ON p.id = hm.persona_id
      LEFT JOIN socios s ON s.persona_id = p.id LEFT JOIN actividades a ON a.id = hm.actividad_id WHERE hm.estado = 'pendiente' ORDER BY hm.id`).all(),
    compras: db.prepare(`SELECT sc.*, a.nombre AS actividad, (SELECT pp.nombre || ' ' || pp.apellido FROM usuarios u JOIN personas pp ON pp.id = u.persona_id WHERE u.id = sc.solicitante_id) AS solicitante
      FROM solicitudes_compra sc LEFT JOIN actividades a ON a.id = sc.actividad_id WHERE sc.estado = 'pendiente' ORDER BY sc.id`).all(),
    honorarios: db.prepare(`SELECT h.*, p.nombre || ' ' || p.apellido AS profesor FROM honorarios h JOIN profesores pr ON pr.id = h.profesor_id JOIN personas p ON p.id = pr.persona_id WHERE h.estado = 'liquidado' ORDER BY h.periodo`).all(),
    altas: db.prepare(`SELECT COUNT(*) FROM solicitudes WHERE tipo = 'alta' AND estado = 'pendiente'`).pluck().get(),
  });
});

/** Aprobación de excepciones de habilitación (las solicita Administración). */
r.post('/aprobaciones/habilitaciones/:id', permiso('habilitacion', 'aprobar'), (req, res) => {
  const d = validar(z.object({ aprobar: z.boolean(), motivo: z.string().optional() }), req.body);
  const db = getDb();
  const hm = db.prepare('SELECT * FROM habilitaciones_manuales WHERE id = ?').get(req.params.id);
  if (!hm) throw noEncontrado('Habilitación');
  if (hm.estado !== 'pendiente') throw invalido('Ya fue resuelta');
  if (hm.solicitada_por === req.usuario.id) throw prohibido('Quien solicita no aprueba');
  db.prepare('UPDATE habilitaciones_manuales SET estado = ?, autorizada_por = ? WHERE id = ?').run(d.aprobar ? 'aprobada' : 'rechazada', req.usuario.id, hm.id);
  auditar(req, d.aprobar ? 'aprobar_habilitacion' : 'rechazar_habilitacion', 'habilitaciones_manuales', hm.id, { estado: 'pendiente' }, { estado: d.aprobar ? 'aprobada' : 'rechazada', motivo: d.motivo });
  notificar({ usuarioId: hm.solicitada_por, tipo: 'aprobacion', titulo: `Excepción de habilitación ${d.aprobar ? 'aprobada' : 'rechazada'}`, referencia: '/admin/habilitacion' });
  res.json({ ok: true });
});

// ---------- Tableros e indicadores ----------
r.get('/tablero', permiso('tablero', 'leer', 'leer_ambito'), (req, res) => {
  const db = getDb();
  const periodo = local().periodo;
  const hoy = local().fecha;
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(`${periodo}-01`, i - 5).slice(0, 7));
  const ambito = puede(req.usuario, 'tablero', 'leer') ? null : ambitoActividades(req.usuario);
  if (ambito) return res.json(tableroActividad(ambito));
  res.json({
    periodo,
    socios: {
      activos: db.prepare(`SELECT COUNT(*) FROM socios WHERE estado = 'activo'`).pluck().get(),
      altas_mes: db.prepare(`SELECT COUNT(*) FROM socios WHERE substr(fecha_alta,1,7) = ?`).pluck().get(periodo),
      bajas_mes: db.prepare(`SELECT COUNT(*) FROM socios WHERE substr(fecha_baja,1,7) = ?`).pluck().get(periodo),
      por_categoria: db.prepare(`SELECT c.nombre, COUNT(*) AS n FROM socios s JOIN categorias_socio c ON c.id = s.categoria_id WHERE s.estado = 'activo' GROUP BY c.id`).all(),
      evolucion: meses.map((m) => ({ periodo: m, altas: db.prepare(`SELECT COUNT(*) FROM socios WHERE substr(fecha_alta,1,7) = ?`).pluck().get(m), bajas: db.prepare(`SELECT COUNT(*) FROM socios WHERE substr(fecha_baja,1,7) = ?`).pluck().get(m) })),
    },
    ingresos_por_actividad: db.prepare(`SELECT a.nombre, COALESCE(SUM(im.importe),0) AS total FROM imputaciones im JOIN pagos pg ON pg.id = im.pago_id JOIN cargos c ON c.id = im.cargo_id
      JOIN inscripciones i ON c.origen_tipo = 'inscripcion' AND c.origen_id = i.id JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id
      WHERE substr(pg.fecha,1,7) >= ? AND pg.medio != 'otro' GROUP BY a.id ORDER BY total DESC LIMIT 10`).all(meses[3]),
    ocupacion: db.prepare(`SELECT a.nombre, SUM(g.cupo) AS cupo, (SELECT COUNT(*) FROM inscripciones i JOIN grupos gg ON gg.id = i.grupo_id WHERE gg.actividad_id = a.id AND i.estado IN ('activa','pendiente_apto','baja_solicitada')) AS ocupados
      FROM grupos g JOIN actividades a ON a.id = g.actividad_id GROUP BY a.id ORDER BY ocupados DESC LIMIT 10`).all(),
    morosidad: {
      personas: db.prepare(`SELECT COUNT(DISTINCT persona_id) FROM cargos WHERE estado IN ('pendiente','parcial') AND vencimiento < ?`).pluck().get(hoy),
      monto: db.prepare(`SELECT COALESCE(SUM(c.importe - COALESCE((SELECT SUM(importe) FROM imputaciones WHERE cargo_id = c.id),0)),0) FROM cargos c WHERE c.estado IN ('pendiente','parcial') AND c.vencimiento < ?`).pluck().get(hoy),
      tasa: (() => {
        const emitido = db.prepare(`SELECT COALESCE(SUM(importe),0) FROM cargos WHERE periodo = ?`).pluck().get(meses[4]);
        const impago = db.prepare(`SELECT COALESCE(SUM(importe),0) FROM cargos WHERE periodo = ? AND estado IN ('pendiente','parcial')`).pluck().get(meses[4]);
        return emitido ? Math.round((impago / emitido) * 1000) / 10 : 0;
      })(),
    },
    asistencia: meses.map((m) => ({ periodo: m, presentes: db.prepare(`SELECT COUNT(*) FROM accesos WHERE resultado = 'habilitado' AND substr(fecha_hora,1,7) = ?`).pluck().get(m) })),
    resultado: meses.map((m) => {
      const ingresos = db.prepare(`SELECT COALESCE(SUM(importe),0) FROM pagos WHERE substr(fecha,1,7) = ? AND medio != 'otro'`).pluck().get(m) + db.prepare(`SELECT COALESCE(SUM(importe),0) FROM ingresos_varios WHERE substr(fecha,1,7) = ?`).pluck().get(m);
      const egresos = db.prepare(`SELECT COALESCE(SUM(importe),0) FROM gastos WHERE substr(fecha,1,7) = ? AND estado != 'anulado'`).pluck().get(m) + db.prepare(`SELECT COALESCE(SUM(neto),0) FROM remuneraciones WHERE periodo = ?`).pluck().get(m);
      return { periodo: m, ingresos, egresos };
    }),
    pendientes: {
      aprobaciones: db.prepare(`SELECT COUNT(*) FROM gastos WHERE estado = 'pendiente_aprobacion'`).pluck().get() + db.prepare(`SELECT COUNT(*) FROM habilitaciones_manuales WHERE estado = 'pendiente'`).pluck().get() + db.prepare(`SELECT COUNT(*) FROM solicitudes_compra WHERE estado = 'pendiente'`).pluck().get(),
      pedidos_cambio: db.prepare(`SELECT COUNT(*) FROM pedidos_cambio WHERE estado IN ('recibido','en_analisis')`).pluck().get(),
      tickets_vencidos: db.prepare(`SELECT COUNT(*) FROM tickets_mantenimiento WHERE estado NOT IN ('resuelto','cerrado') AND vence_en < ?`).pluck().get(new Date().toISOString()),
      resoluciones: db.prepare(`SELECT COUNT(*) FROM resoluciones WHERE estado != 'cumplida'`).pluck().get(),
    },
  });
});

/** Resumen de una actividad para su delegado: socios, ocupación, asistencia y deuda agregada (sin datos individuales de pago). */
function tableroActividad(actividades) {
  const db = getDb();
  const ids = actividades.length ? actividades : [-1];
  const lista = ids.map((id) => db.prepare('SELECT id, nombre, icono FROM actividades WHERE id = ?').get(id)).filter(Boolean);
  const hoy = local().fecha;
  return {
    actividades: lista.map((a) => ({
      ...a,
      grupos: db.prepare(`SELECT g.id, g.nombre, g.cupo, (SELECT COUNT(*) FROM inscripciones WHERE grupo_id = g.id AND estado IN ('activa','pendiente_apto','baja_solicitada')) AS ocupados FROM grupos g WHERE g.actividad_id = ?`).all(a.id),
      socios: db.prepare(`SELECT COUNT(DISTINCT i.persona_id) FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE g.actividad_id = ? AND i.estado != 'baja'`).pluck().get(a.id),
      pendientes_apto: db.prepare(`SELECT COUNT(*) FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE g.actividad_id = ? AND i.estado = 'pendiente_apto'`).pluck().get(a.id),
      asistencia_30d: db.prepare(`SELECT COUNT(*) FROM accesos WHERE actividad_id = ? AND resultado = 'habilitado' AND fecha_hora >= ?`).pluck().get(a.id, sumarMeses(hoy, -1)),
      deuda: db.prepare(`SELECT COUNT(DISTINCT c.persona_id) AS personas, COALESCE(SUM(c.importe),0) AS monto FROM cargos c JOIN inscripciones i ON c.origen_tipo = 'inscripcion' AND c.origen_id = i.id
        JOIN grupos g ON g.id = i.grupo_id WHERE g.actividad_id = ? AND c.estado IN ('pendiente','parcial') AND c.vencimiento < ?`).get(a.id, hoy),
      presupuesto: db.prepare(`SELECT COALESCE(SUM(monto),0) FROM presupuestos WHERE actividad_id = ? AND anio = ?`).pluck().get(a.id, Number(hoy.slice(0, 4))),
      compras: db.prepare(`SELECT COALESCE(SUM(monto_estimado),0) FROM solicitudes_compra WHERE actividad_id = ? AND estado IN ('autorizada','comprada')`).pluck().get(a.id),
    })),
  };
}

// ---------- Privacidad y datos (Administración) ----------
r.get('/privacidad', permiso('privacidad', 'gestionar', 'leer'), (_req, res) => {
  const db = getDb();
  res.json({
    solicitudes: db.prepare(`SELECT s.*, p.nombre, p.apellido, so.nro_socio FROM solicitudes s LEFT JOIN personas p ON p.id = s.persona_id LEFT JOIN socios so ON so.persona_id = s.persona_id
      WHERE s.tipo = 'derechos_datos' ORDER BY s.creada_en DESC`).all().map((s) => {
      const d = json(s.datos_json, {});
      const dias = d.derecho === 'acceso' ? 10 : 7; // 10 corridos (art. 14) / 5 hábiles ≈ 7 corridos (art. 16)
      const vence = new Date(new Date(s.creada_en).getTime() + dias * 86400000).toISOString();
      return { ...s, datos: d, vence_en: vence, vencida: s.estado === 'pendiente' && vence < ahora() };
    }),
    consentimientos: db.prepare(`SELECT tipo, version_texto, COUNT(*) AS otorgados, SUM(revocado_en IS NOT NULL) AS revocados FROM consentimientos GROUP BY tipo, version_texto ORDER BY tipo`).all(),
    sin_consentimiento: db.prepare(`SELECT COUNT(*) FROM socios s WHERE s.estado = 'activo' AND NOT EXISTS (SELECT 1 FROM consentimientos c WHERE c.persona_id = s.persona_id AND c.tipo = 'datos_personales' AND c.revocado_en IS NULL)`).pluck().get(),
    retencion: [
      { dato: 'Datos de socios y personas', plazo: 'Mientras dure la relación y el plazo posterior que defina el asesor legal; luego supresión o anonimización' },
      { dato: 'Comprobantes y registros contables', plazo: '10 años (CCyC art. 328)' },
      { dato: 'Constancia de aptitud médica', plazo: 'Mientras dure el vínculo con la actividad; luego solo historial mínimo' },
      { dato: 'Registros de acceso y fichajes', plazo: '12 meses con detalle; luego solo totales sin datos personales' },
      { dato: 'Registros técnicos y de auditoría', plazo: '12 meses' },
      { dato: 'Backups', plazo: '30 copias diarias rotativas y copia nocturna de la base' },
    ],
    bajas_para_anonimizar: db.prepare(`SELECT p.id, p.nombre, p.apellido, s.fecha_baja FROM socios s JOIN personas p ON p.id = s.persona_id WHERE s.estado = 'baja' AND p.estado != 'anonimizada' AND s.fecha_baja < date(?, '-2 years')`).all(local().fecha),
  });
});

r.post('/privacidad/solicitudes/:id', permiso('privacidad', 'gestionar'), (req, res) => {
  const d = validar(z.object({ estado: z.enum(['en_proceso', 'resuelta', 'rechazada']), respuesta: z.string().min(5) }), req.body);
  const db = getDb();
  const s = db.prepare(`SELECT * FROM solicitudes WHERE id = ? AND tipo = 'derechos_datos'`).get(req.params.id);
  if (!s) throw noEncontrado('Solicitud');
  db.prepare('UPDATE solicitudes SET estado = ?, respuesta = ?, resuelta_por = ?, resuelta_en = ? WHERE id = ?').run(d.estado, d.respuesta, req.usuario.id, d.estado === 'en_proceso' ? null : ahora(), s.id);
  const u = s.persona_id ? usuarioDePersona(s.persona_id) : null;
  if (u) notificar({ usuarioId: u, tipo: 'privacidad', titulo: `Tu solicitud sobre datos personales: ${d.estado.replace('_', ' ')}`, referencia: '/socio/privacidad' });
  auditar(req, 'resolver_derechos_datos', 'solicitudes', s.id, { estado: s.estado }, d);
  res.json({ ok: true });
});

/** Supresión: anonimiza a la persona conservando lo que exige la ley (comprobantes contables). */
r.post('/privacidad/anonimizar/:personaId', permiso('privacidad', 'gestionar'), (req, res) => {
  const { motivo } = validar(z.object({ motivo: z.string().min(5) }), req.body);
  const db = getDb();
  const id = req.params.personaId;
  const p = db.prepare('SELECT * FROM personas WHERE id = ?').get(id);
  if (!p) throw noEncontrado('Persona');
  if (db.prepare(`SELECT 1 FROM socios WHERE persona_id = ? AND estado != 'baja'`).get(id)) throw invalido('Primero debe darse de baja como socio');
  if (db.prepare(`SELECT 1 FROM cargos WHERE persona_id = ? AND estado IN ('pendiente','parcial')`).get(id)) throw invalido('Tiene deuda pendiente: no puede suprimirse todavía');
  enTransaccion(() => {
    db.prepare(`UPDATE personas SET dni = NULL, nombre = 'Persona', apellido = 'Anonimizada #' || id, fecha_nacimiento = NULL, email = NULL, telefono = NULL, domicilio = NULL, foto = NULL, estado = 'anonimizada' WHERE id = ?`).run(id);
    db.prepare('DELETE FROM accesos WHERE persona_id = ?').run(id);
    db.prepare(`UPDATE revisiones_medicas SET certificado_externo = NULL WHERE persona_id = ? AND firmada_en IS NULL`).run(id);
    db.prepare(`UPDATE usuarios SET estado = 'baja', email = 'anonimizado-' || id || '@baja.local' WHERE persona_id = ?`).run(id);
  });
  auditar(req, 'anonimizar_persona', 'personas', id, { nombre: '[suprimido]' }, { motivo });
  res.json({ ok: true });
});

export default r;
