-- Esquema inicial: 78 tablas en 9 grupos (propuesta v1.0, sección 7).
-- Importes en centavos (INTEGER). Fechas ISO 8601 en UTC.
-- Sin borrado físico de personas, socios, cargos ni pagos: se cambia el estado.

------------------------------------------------------------------
-- Acceso y seguridad (7)
------------------------------------------------------------------
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','bloqueado','baja')),
  mfa_habilitado INTEGER NOT NULL DEFAULT 0,
  mfa_secreto TEXT,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT,
  ultimo_acceso TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

CREATE TABLE permisos (
  id INTEGER PRIMARY KEY,
  modulo TEXT NOT NULL,
  accion TEXT NOT NULL,
  UNIQUE (modulo, accion)
);

CREATE TABLE rol_permisos (
  rol_id INTEGER NOT NULL REFERENCES roles(id),
  permiso_id INTEGER NOT NULL REFERENCES permisos(id),
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE usuario_roles (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  rol_id INTEGER NOT NULL REFERENCES roles(id),
  actividad_id INTEGER REFERENCES actividades(id),
  UNIQUE (usuario_id, rol_id, actividad_id)
);

CREATE TABLE sesiones (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  token_hash TEXT NOT NULL UNIQUE,
  expira_en TEXT NOT NULL,
  ultima_actividad TEXT NOT NULL,
  mfa_pendiente INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  dispositivo TEXT
);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id INTEGER,
  antes TEXT,
  despues TEXT,
  ip TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id);

------------------------------------------------------------------
-- Personas, socios y privacidad (8)
------------------------------------------------------------------
CREATE TABLE personas (
  id INTEGER PRIMARY KEY,
  dni TEXT UNIQUE,
  apellido TEXT NOT NULL,
  nombre TEXT NOT NULL,
  fecha_nacimiento TEXT,
  email TEXT,
  telefono TEXT,
  domicilio TEXT,
  foto TEXT,
  tipo TEXT NOT NULL DEFAULT 'socio' CHECK (tipo IN ('socio','no_socio','empleado','profesor','externo')),
  jubilado INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','suspendida','baja','anonimizada'))
);

CREATE TABLE categorias_socio (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  edad_min INTEGER,
  edad_max INTEGER,
  regla_cuota TEXT NOT NULL -- JSON: {"tipo":"fija","valor":2000000} | {"tipo":"familia","min":3,"valor":1600000}
);

CREATE TABLE grupos_familiares (
  id INTEGER PRIMARY KEY,
  titular_persona_id INTEGER NOT NULL REFERENCES personas(id),
  nombre TEXT NOT NULL
);

CREATE TABLE socios (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL UNIQUE REFERENCES personas(id),
  nro_socio INTEGER NOT NULL UNIQUE,
  categoria_id INTEGER NOT NULL REFERENCES categorias_socio(id),
  grupo_familiar_id INTEGER REFERENCES grupos_familiares(id),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('pendiente','activo','suspendido','baja')),
  fecha_alta TEXT NOT NULL,
  fecha_baja TEXT,
  motivo_baja TEXT,
  llave_nro TEXT
);

CREATE TABLE tutores (
  menor_persona_id INTEGER NOT NULL REFERENCES personas(id),
  tutor_persona_id INTEGER NOT NULL REFERENCES personas(id),
  parentesco TEXT NOT NULL,
  PRIMARY KEY (menor_persona_id, tutor_persona_id)
);

CREATE TABLE consentimientos (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  tipo TEXT NOT NULL, -- datos_personales, datos_salud, imagen, comunicaciones
  version_texto TEXT NOT NULL,
  aceptado_en TEXT NOT NULL,
  aceptado_por_tutor_id INTEGER REFERENCES personas(id),
  revocado_en TEXT
);

CREATE TABLE pedidos_cambio (
  id INTEGER PRIMARY KEY,
  solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
  origen TEXT NOT NULL CHECK (origen IN ('comision_directiva','representante_actividad','administracion')),
  actividad_id INTEGER REFERENCES actividades(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('nueva_seccion','nuevo_rol','cambio_permisos')),
  titulo TEXT NOT NULL,
  justificacion TEXT NOT NULL,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido','en_analisis','aprobado','rechazado','diferido','implementado')),
  resuelto_por INTEGER REFERENCES usuarios(id),
  motivo_resolucion TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE solicitudes (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('alta','alta_familiar','baja','baja_actividad','cambio_categoria','reclamo','sugerencia','derechos_datos')),
  datos_json TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_proceso','aprobada','rechazada','resuelta')),
  respuesta TEXT,
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resuelta_por INTEGER REFERENCES usuarios(id),
  resuelta_en TEXT
);

------------------------------------------------------------------
-- Actividades e inscripciones (9)
------------------------------------------------------------------
CREATE TABLE subcomisiones (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  reglamento_url TEXT,
  presupuesto_anual INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE actividades (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL, -- deportiva, acuatica, cultural, social
  descripcion TEXT,
  icono TEXT,
  subcomision_id INTEGER REFERENCES subcomisiones(id),
  dia_vencimiento INTEGER NOT NULL DEFAULT 10,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE temporadas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL
);

CREATE TABLE profesores (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL UNIQUE REFERENCES personas(id),
  cuit TEXT,
  vinculo TEXT NOT NULL DEFAULT 'monotributo',
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE grupos (
  id INTEGER PRIMARY KEY,
  actividad_id INTEGER NOT NULL REFERENCES actividades(id),
  temporada_id INTEGER REFERENCES temporadas(id),
  nombre TEXT NOT NULL,
  edad_min INTEGER,
  edad_max INTEGER,
  cupo INTEGER NOT NULL,
  profesor_id INTEGER REFERENCES profesores(id)
);

CREATE TABLE horarios (
  id INTEGER PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id),
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  espacio_id INTEGER REFERENCES espacios(id)
);

CREATE TABLE inscripciones (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  grupo_id INTEGER NOT NULL REFERENCES grupos(id),
  frecuencia_semanal INTEGER NOT NULL DEFAULT 1,
  desde TEXT NOT NULL,
  hasta TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pendiente_apto','baja_solicitada','baja')),
  descuento_id INTEGER REFERENCES descuentos(id)
);
CREATE INDEX idx_inscripciones_grupo ON inscripciones(grupo_id, estado);

CREATE TABLE lista_espera (
  id INTEGER PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id),
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  posicion INTEGER NOT NULL,
  avisado_en TEXT,
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (grupo_id, persona_id)
);

CREATE TABLE asistencias (
  id INTEGER PRIMARY KEY,
  inscripcion_id INTEGER NOT NULL REFERENCES inscripciones(id),
  fecha TEXT NOT NULL,
  presente INTEGER NOT NULL DEFAULT 1,
  origen TEXT NOT NULL CHECK (origen IN ('qr','manual')),
  justificacion TEXT,
  registrado_por INTEGER REFERENCES usuarios(id),
  UNIQUE (inscripcion_id, fecha)
);

------------------------------------------------------------------
-- Revisión médica (5)
------------------------------------------------------------------
CREATE TABLE tipos_revision (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  vigencia_meses INTEGER NOT NULL,
  concepto_arancel_id INTEGER REFERENCES conceptos(id),
  importe INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE actividad_requisitos (
  actividad_id INTEGER NOT NULL REFERENCES actividades(id),
  tipo_revision_id INTEGER NOT NULL REFERENCES tipos_revision(id),
  bloqueante INTEGER NOT NULL DEFAULT 1,
  dias_gracia INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (actividad_id, tipo_revision_id)
);

CREATE TABLE profesionales_salud (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  matricula TEXT NOT NULL,
  especialidad TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE turnos_revision (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  tipo_revision_id INTEGER NOT NULL REFERENCES tipos_revision(id),
  profesional_id INTEGER REFERENCES profesionales_salud(id),
  inicio TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'solicitado' CHECK (estado IN ('solicitado','confirmado','presente','atendido','ausente','cancelado','reprogramado'))
);

-- Inmutable una vez firmada: las correcciones generan una revisión nueva (ver trigger).
CREATE TABLE revisiones_medicas (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  tipo_revision_id INTEGER NOT NULL REFERENCES tipos_revision(id),
  profesional_id INTEGER REFERENCES profesionales_salud(id),
  fecha TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('pendiente_validacion','apto','apto_restricciones','no_apto','postergado','rechazado')),
  restricciones TEXT, -- códigos, no diagnósticos
  vence_en TEXT,
  certificado_externo TEXT,
  cargado_por INTEGER REFERENCES usuarios(id),
  validada_por INTEGER REFERENCES usuarios(id),
  firmada_en TEXT,
  reemplaza_id INTEGER REFERENCES revisiones_medicas(id),
  consentimiento_id INTEGER REFERENCES consentimientos(id)
);
CREATE TRIGGER revisiones_firmadas_inmutables
BEFORE UPDATE ON revisiones_medicas
WHEN OLD.firmada_en IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Una revisión firmada no se edita: registre una nueva revisión');
END;

------------------------------------------------------------------
-- Espacios y reservas (4)
------------------------------------------------------------------
CREATE TABLE espacios (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL, -- cancha, natatorio, gimnasio, salon, vestuario, parque
  capacidad INTEGER,
  reservable INTEGER NOT NULL DEFAULT 0,
  tarifa_hora INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE reglas_reserva (
  espacio_id INTEGER PRIMARY KEY REFERENCES espacios(id),
  anticipacion_dias INTEGER NOT NULL DEFAULT 7,
  max_activas INTEGER NOT NULL DEFAULT 2,
  cancelacion_horas INTEGER NOT NULL DEFAULT 12,
  sancion TEXT
);

CREATE TABLE reservas (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  persona_id INTEGER REFERENCES personas(id),
  inicio TEXT NOT NULL,
  fin TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'socio' CHECK (tipo IN ('socio','clase','alquiler','evento','torneo')),
  estado TEXT NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada','cancelada','cumplida','ausente')),
  importe INTEGER NOT NULL DEFAULT 0,
  cancelada_en TEXT
);
CREATE INDEX idx_reservas_espacio ON reservas(espacio_id, inicio);

CREATE TABLE bloqueos_espacio (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  motivo TEXT NOT NULL
);

------------------------------------------------------------------
-- Control de acceso (7)
------------------------------------------------------------------
CREATE TABLE puntos_acceso (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  espacio_id INTEGER REFERENCES espacios(id),
  actividad_id INTEGER REFERENCES actividades(id),
  tipo_lector TEXT NOT NULL DEFAULT 'movil' CHECK (tipo_lector IN ('lector_rele','integracion_fabricante','movil')),
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE lectores (
  id INTEGER PRIMARY KEY,
  punto_acceso_id INTEGER NOT NULL REFERENCES puntos_acceso(id),
  nombre TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  ultimo_latido TEXT,
  firmware TEXT
);

CREATE TABLE reglas_habilitacion (
  id INTEGER PRIMARY KEY,
  actividad_id INTEGER UNIQUE REFERENCES actividades(id), -- NULL = regla general del club
  gracia_cuota_dias INTEGER NOT NULL DEFAULT 10,
  gracia_arancel_dias INTEGER NOT NULL DEFAULT 5,
  ventana_antes_min INTEGER NOT NULL DEFAULT 15,
  ventana_despues_min INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE habilitaciones_manuales (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  actividad_id INTEGER REFERENCES actividades(id),
  tipo TEXT NOT NULL DEFAULT 'excepcion' CHECK (tipo IN ('excepcion','bloqueo')),
  motivo TEXT NOT NULL,
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','revocada')),
  solicitada_por INTEGER REFERENCES usuarios(id),
  autorizada_por INTEGER REFERENCES usuarios(id)
);

CREATE TABLE accesos (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id),
  punto_acceso_id INTEGER REFERENCES puntos_acceso(id),
  actividad_id INTEGER REFERENCES actividades(id),
  grupo_id INTEGER REFERENCES grupos(id),
  fecha_hora TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('habilitado','denegado')),
  motivo_codigo TEXT,
  metodo TEXT NOT NULL CHECK (metodo IN ('qr_lector','qr_profesor','qr_porteria','dni_porteria','apertura_manual')),
  registrado_por INTEGER REFERENCES usuarios(id)
);
CREATE INDEX idx_accesos_fecha ON accesos(fecha_hora);

CREATE TABLE qr_usados (
  jti TEXT PRIMARY KEY,
  expira_en TEXT NOT NULL
);

CREATE TABLE invitados (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  dni TEXT NOT NULL,
  socio_anfitrion_id INTEGER NOT NULL REFERENCES socios(id),
  fecha TEXT NOT NULL,
  importe INTEGER NOT NULL,
  cargo_id INTEGER REFERENCES cargos(id),
  ingreso_en TEXT
);

------------------------------------------------------------------
-- Finanzas (23)
------------------------------------------------------------------
CREATE TABLE conceptos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('cuota_social','arancel','alquiler','invitado','llave','revision_medica','otro'))
);

CREATE TABLE aranceles (
  id INTEGER PRIMARY KEY,
  actividad_id INTEGER NOT NULL REFERENCES actividades(id),
  frecuencia INTEGER NOT NULL, -- veces por semana; 0 = pase libre
  descripcion TEXT,
  valor_socio INTEGER NOT NULL,
  valor_no_socio INTEGER NOT NULL,
  vigente_desde TEXT NOT NULL,
  vigente_hasta TEXT
);

CREATE TABLE descuentos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('porcentaje','monto')),
  valor INTEGER NOT NULL, -- porcentaje entero o centavos
  condicion TEXT NOT NULL, -- jubilado, grupo_familiar, horario_promocional, manual
  solo_socios INTEGER NOT NULL DEFAULT 1,
  activo INTEGER NOT NULL DEFAULT 1
);

-- Los cargos no se editan en su importe: se corrigen con nota de crédito o ajuste.
CREATE TABLE cargos (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  concepto_id INTEGER NOT NULL REFERENCES conceptos(id),
  descripcion TEXT NOT NULL,
  periodo TEXT NOT NULL, -- AAAA-MM
  importe INTEGER NOT NULL,
  vencimiento TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pagado','anulado')),
  origen_tipo TEXT, -- inscripcion, revision, invitado, reserva, ajuste, nota_credito
  origen_id INTEGER,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_cargos_persona ON cargos(persona_id, estado);
CREATE TRIGGER cargos_importe_inmutable
BEFORE UPDATE OF importe, persona_id, concepto_id ON cargos
BEGIN
  SELECT RAISE(ABORT, 'Los cargos no se editan: registre una nota de crédito o un ajuste');
END;

CREATE TABLE pagos (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id),
  fecha TEXT NOT NULL,
  medio TEXT NOT NULL CHECK (medio IN ('efectivo','transferencia','mercadopago','billetera','otro')),
  caja_id INTEGER REFERENCES cajas(id),
  importe INTEGER NOT NULL,
  referencia TEXT,
  estado TEXT NOT NULL DEFAULT 'acreditado' CHECK (estado IN ('acreditado','anulado')),
  registrado_por INTEGER REFERENCES usuarios(id)
);

CREATE TABLE ingresos_varios (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('donacion','sponsor','evento','alquiler','otro')),
  descripcion TEXT NOT NULL,
  importe INTEGER NOT NULL,
  medio TEXT NOT NULL,
  caja_id INTEGER REFERENCES cajas(id),
  comprobante_archivo TEXT,
  registrado_por INTEGER REFERENCES usuarios(id)
);

CREATE TABLE imputaciones (
  pago_id INTEGER NOT NULL REFERENCES pagos(id),
  cargo_id INTEGER NOT NULL REFERENCES cargos(id),
  importe INTEGER NOT NULL,
  PRIMARY KEY (pago_id, cargo_id)
);

CREATE TABLE comprobantes (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('recibo','factura_b','factura_c','nota_credito')),
  numero TEXT NOT NULL UNIQUE,
  persona_id INTEGER REFERENCES personas(id),
  pago_id INTEGER REFERENCES pagos(id),
  fecha TEXT NOT NULL,
  total INTEGER NOT NULL,
  cae TEXT,
  archivo TEXT
);

CREATE TABLE cajas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('efectivo','banco','billetera')),
  alias TEXT,
  cbu_cvu TEXT,
  titular TEXT
);

CREATE TABLE medios_pago (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('efectivo','transferencia','mercadopago','billetera')),
  nombre TEXT NOT NULL,
  caja_id INTEGER REFERENCES cajas(id),
  activo INTEGER NOT NULL DEFAULT 1,
  comision_pct REAL NOT NULL DEFAULT 0
);

CREATE TABLE pagos_online (
  id INTEGER PRIMARY KEY,
  pago_id INTEGER REFERENCES pagos(id),
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  cargo_ids TEXT NOT NULL, -- JSON
  proveedor TEXT NOT NULL DEFAULT 'mercadopago',
  preferencia_id TEXT UNIQUE,
  payment_id TEXT UNIQUE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','cancelado')),
  monto INTEGER NOT NULL,
  comision INTEGER NOT NULL DEFAULT 0,
  notificacion_hash TEXT,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE transferencias_informadas (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  cargo_ids TEXT NOT NULL, -- JSON
  monto INTEGER NOT NULL,
  medio TEXT NOT NULL DEFAULT 'transferencia',
  comprobante_archivo TEXT,
  referencia TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  motivo_rechazo TEXT,
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revisada_por INTEGER REFERENCES usuarios(id),
  revisada_en TEXT
);

CREATE TABLE movimientos_caja (
  id INTEGER PRIMARY KEY,
  caja_id INTEGER NOT NULL REFERENCES cajas(id),
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso','arqueo','ajuste')),
  importe INTEGER NOT NULL, -- con signo: egresos negativos
  concepto TEXT NOT NULL,
  ref_tipo TEXT,
  ref_id INTEGER,
  usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE TABLE categorias_gasto (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activa INTEGER NOT NULL DEFAULT 1
);

-- No se borran: se anulan con motivo.
CREATE TABLE gastos (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias_gasto(id),
  descripcion TEXT NOT NULL,
  importe INTEGER NOT NULL,
  medio_pago TEXT NOT NULL CHECK (medio_pago IN ('efectivo','transferencia','billetera','tarjeta')),
  caja_id INTEGER REFERENCES cajas(id),
  proveedor_id INTEGER REFERENCES proveedores(id),
  comprobante_archivo TEXT,
  ticket_id INTEGER REFERENCES tickets_mantenimiento(id),
  solicitud_compra_id INTEGER REFERENCES solicitudes_compra(id),
  estado TEXT NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','pendiente_aprobacion','aprobado','anulado')),
  motivo_anulacion TEXT,
  registrado_por INTEGER REFERENCES usuarios(id),
  aprobado_por INTEGER REFERENCES usuarios(id)
);

CREATE TABLE empleados (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL UNIQUE REFERENCES personas(id),
  cargo TEXT NOT NULL,
  sector TEXT NOT NULL,
  tipo_vinculo TEXT NOT NULL CHECK (tipo_vinculo IN ('dependencia','monotributo','otro')),
  fecha_alta TEXT NOT NULL,
  fecha_baja TEXT,
  forma_pago TEXT NOT NULL CHECK (forma_pago IN ('efectivo','transferencia')),
  remuneracion_base INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE remuneraciones (
  id INTEGER PRIMARY KEY,
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  periodo TEXT NOT NULL,
  bruto INTEGER NOT NULL,
  descuentos INTEGER NOT NULL DEFAULT 0,
  neto INTEGER NOT NULL,
  medio_pago TEXT NOT NULL CHECK (medio_pago IN ('efectivo','transferencia')),
  estado TEXT NOT NULL DEFAULT 'liquidada' CHECK (estado IN ('liquidada','pagada')),
  es_ajuste INTEGER NOT NULL DEFAULT 0,
  pagada_en TEXT,
  caja_id INTEGER REFERENCES cajas(id),
  recibo_archivo TEXT
);
CREATE TRIGGER remuneraciones_pagadas_inmutables
BEFORE UPDATE ON remuneraciones
WHEN OLD.estado = 'pagada'
BEGIN
  SELECT RAISE(ABORT, 'Una liquidación pagada no se edita: registre un ajuste');
END;

CREATE TABLE proveedores (
  id INTEGER PRIMARY KEY,
  razon_social TEXT NOT NULL,
  cuit TEXT UNIQUE,
  rubro TEXT,
  contacto TEXT,
  condicion_pago TEXT
);

CREATE TABLE facturas_proveedor (
  id INTEGER PRIMARY KEY,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  numero TEXT NOT NULL,
  fecha TEXT NOT NULL,
  vence TEXT NOT NULL,
  total INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'cargada' CHECK (estado IN ('cargada','autorizada','pagada','anulada')),
  cargada_por INTEGER REFERENCES usuarios(id),
  autorizada_por INTEGER REFERENCES usuarios(id),
  UNIQUE (proveedor_id, numero)
);

CREATE TABLE pagos_proveedor (
  id INTEGER PRIMARY KEY,
  factura_id INTEGER NOT NULL REFERENCES facturas_proveedor(id),
  caja_id INTEGER NOT NULL REFERENCES cajas(id),
  fecha TEXT NOT NULL,
  importe INTEGER NOT NULL
);

CREATE TABLE presupuestos (
  id INTEGER PRIMARY KEY,
  anio INTEGER NOT NULL,
  rubro TEXT NOT NULL,
  actividad_id INTEGER REFERENCES actividades(id),
  tipo TEXT NOT NULL DEFAULT 'egreso' CHECK (tipo IN ('ingreso','egreso')),
  monto INTEGER NOT NULL
);

CREATE TABLE honorarios (
  id INTEGER PRIMARY KEY,
  profesor_id INTEGER NOT NULL REFERENCES profesores(id),
  periodo TEXT NOT NULL,
  clases INTEGER NOT NULL DEFAULT 0,
  base INTEGER NOT NULL,
  monto INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'liquidado' CHECK (estado IN ('borrador','liquidado','autorizado','pagado')),
  UNIQUE (profesor_id, periodo)
);

CREATE TABLE periodos_contables (
  id INTEGER PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  cerrado_en TEXT,
  cerrado_por INTEGER REFERENCES usuarios(id),
  UNIQUE (anio, mes)
);

------------------------------------------------------------------
-- Mantenimiento (7)
------------------------------------------------------------------
CREATE TABLE sectores (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  espacio_id INTEGER REFERENCES espacios(id),
  responsable_default_id INTEGER REFERENCES usuarios(id)
);

CREATE TABLE tickets_mantenimiento (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  sector_id INTEGER NOT NULL REFERENCES sectores(id),
  categoria TEXT NOT NULL, -- electricidad, plomeria, pileta, limpieza, carpinteria, pintura, otro
  prioridad TEXT NOT NULL CHECK (prioridad IN ('urgente','alta','media','baja')),
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','asignado','en_curso','resuelto','cerrado')),
  reportado_por INTEGER NOT NULL REFERENCES usuarios(id),
  asignado_a INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  vence_en TEXT NOT NULL,
  resuelto_en TEXT,
  verificado_por INTEGER REFERENCES usuarios(id),
  verificado_en TEXT,
  costo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ticket_fotos (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets_mantenimiento(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('problema','resolucion')),
  archivo TEXT NOT NULL,
  subido_por INTEGER REFERENCES usuarios(id),
  subido_en TEXT NOT NULL
);

CREATE TABLE ticket_comentarios (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets_mantenimiento(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE ticket_historial (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets_mantenimiento(id),
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL
);

CREATE TABLE inventario (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  ubicacion TEXT,
  cantidad INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  unidad TEXT NOT NULL DEFAULT 'u'
);

CREATE TABLE solicitudes_compra (
  id INTEGER PRIMARY KEY,
  solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
  origen TEXT NOT NULL DEFAULT 'mantenimiento', -- mantenimiento, subcomision
  actividad_id INTEGER REFERENCES actividades(id),
  ticket_id INTEGER REFERENCES tickets_mantenimiento(id),
  descripcion TEXT NOT NULL,
  monto_estimado INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','autorizada','rechazada','comprada')),
  motivo TEXT,
  autorizada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

------------------------------------------------------------------
-- Gobierno y comunicación (8)
------------------------------------------------------------------
CREATE TABLE cargos_directivos (
  id INTEGER PRIMARY KEY,
  persona_id INTEGER NOT NULL REFERENCES personas(id),
  cargo TEXT NOT NULL,
  desde TEXT NOT NULL,
  hasta TEXT
);

CREATE TABLE reuniones (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('ordinaria','extraordinaria','subcomision','asamblea')),
  subcomision_id INTEGER REFERENCES subcomisiones(id),
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'convocada' CHECK (estado IN ('convocada','realizada','acta_aprobada')),
  orden_del_dia TEXT,
  acta_archivo TEXT
);

CREATE TABLE resoluciones (
  id INTEGER PRIMARY KEY,
  reunion_id INTEGER NOT NULL REFERENCES reuniones(id),
  numero TEXT,
  texto TEXT NOT NULL,
  responsable_id INTEGER REFERENCES personas(id),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','cumplida')),
  vence_en TEXT
);

CREATE TABLE comunicados (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  audiencia TEXT NOT NULL, -- JSON: {"tipo":"todos"} | {"tipo":"actividad","id":3} | {"tipo":"categoria","id":1} | {"tipo":"grupo","id":7}
  categoria TEXT NOT NULL DEFAULT 'institucional',
  publico INTEGER NOT NULL DEFAULT 0,
  publicado_por INTEGER REFERENCES usuarios(id),
  publicado_en TEXT NOT NULL
);

CREATE TABLE notificaciones (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  referencia TEXT,
  creada_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  leida_en TEXT
);
CREATE INDEX idx_notificaciones_usuario ON notificaciones(usuario_id, leida_en);

CREATE TABLE documentos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL, -- reglamento, formulario, circular
  archivo TEXT,
  rol_visible TEXT NOT NULL DEFAULT 'todos', -- 'todos' o lista CSV de códigos de rol
  publicado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE parametros (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descripcion TEXT
);

CREATE TABLE feriados (
  fecha TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL
);
