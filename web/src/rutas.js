// Las 100 vistas de la plataforma agrupadas por rol (propuesta, sección 5).
// `pagina` es el archivo en src/pages; `props` se pasan al componente; `tab` = aparece en la barra inferior del celular.

export const PUBLICO = [
  { ruta: '/', pagina: 'publico/Inicio', titulo: 'Inicio', icono: 'home', tab: true },
  { ruta: '/actividades', pagina: 'publico/Actividades', titulo: 'Actividades', icono: 'sports_soccer', tab: true },
  { ruta: '/actividades/:id', pagina: 'publico/DetalleActividad', titulo: 'Detalle de actividad', oculto: true },
  { ruta: '/cuota-social', pagina: 'publico/CuotaSocial', titulo: 'Asociate', icono: 'card_membership', tab: true },
  { ruta: '/historia', pagina: 'publico/Historia', titulo: 'El club', icono: 'history_edu', tab: true },
  { ruta: '/contacto', pagina: 'publico/Contacto', titulo: 'Contacto', icono: 'alternate_email', tab: true },
  { ruta: '/login', pagina: 'publico/Login', titulo: 'Ingresar', oculto: true },
];

export const ROLES_UI = {
  socio: {
    nombre: 'Socio', base: '/socio', icono: 'badge',
    secciones: [
      { titulo: 'Mi club', items: [
        { ruta: 'inicio', pagina: 'socio/Inicio', titulo: 'Inicio', icono: 'home', tab: true },
        { ruta: 'credencial', pagina: 'socio/Credencial', titulo: 'Credencial QR', icono: 'qr_code_2', tab: true },
        { ruta: 'actividades', pagina: 'socio/MisActividades', titulo: 'Mis actividades', icono: 'sports_soccer', tab: true },
        { ruta: 'actividades/explorar', pagina: 'socio/Explorar', titulo: 'Explorar e inscribirme', icono: 'travel_explore' },
        { ruta: 'reservas', pagina: 'socio/Reservas', titulo: 'Reservas', icono: 'event_available' },
      ] },
      { titulo: 'Pagos', items: [
        { ruta: 'cuenta', pagina: 'socio/Cuenta', titulo: 'Estado de cuenta', icono: 'receipt_long' },
        { ruta: 'pagos', pagina: 'socio/Pagar', titulo: 'Pagar', icono: 'payments', tab: true },
        { ruta: 'pagos/simulado/:id', pagina: 'socio/PagoSimulado', titulo: 'Checkout de prueba', oculto: true },
      ] },
      { titulo: 'Más', items: [
        { ruta: 'revision-medica', pagina: 'socio/RevisionMedica', titulo: 'Revisión médica', icono: 'medical_services' },
        { ruta: 'invitados', pagina: 'socio/Invitados', titulo: 'Invitados', icono: 'group_add' },
        { ruta: 'novedades', pagina: 'socio/Novedades', titulo: 'Novedades', icono: 'campaign' },
        { ruta: 'solicitudes', pagina: 'socio/Tramites', titulo: 'Trámites y reportes', icono: 'assignment' },
        { ruta: 'perfil', pagina: 'socio/Perfil', titulo: 'Perfil y grupo familiar', icono: 'family_restroom' },
        { ruta: 'privacidad', pagina: 'socio/Privacidad', titulo: 'Privacidad', icono: 'shield_person' },
      ] },
    ],
  },
  profesor: {
    nombre: 'Profesor', base: '/profesor', icono: 'sports',
    secciones: [
      { titulo: 'Clases', items: [
        { ruta: 'inicio', pagina: 'profesor/Agenda', titulo: 'Agenda del día', icono: 'today', tab: true },
        { ruta: 'grupos', pagina: 'profesor/Grupos', titulo: 'Mis grupos', icono: 'groups', tab: true },
        { ruta: 'fichaje', pagina: 'compartidas/Fichaje', titulo: 'Fichaje por QR', icono: 'qr_code_scanner', tab: true, props: { modo: 'profesor' } },
        { ruta: 'asistencia', pagina: 'profesor/Asistencia', titulo: 'Asistencia', icono: 'fact_check', tab: true },
        { ruta: 'calendario', pagina: 'profesor/Calendario', titulo: 'Calendario y espacios', icono: 'calendar_month' },
      ] },
      { titulo: 'Más', items: [
        { ruta: 'comunicaciones', pagina: 'compartidas/Comunicados', titulo: 'Comunicaciones', icono: 'forum', props: { alcance: 'grupo' } },
        { ruta: 'liquidacion', pagina: 'profesor/Honorarios', titulo: 'Mis honorarios', icono: 'request_quote' },
        { ruta: 'incidencias', pagina: 'compartidas/MisReportes', titulo: 'Reportar un problema', icono: 'report' },
      ] },
    ],
  },
  admin: {
    nombre: 'Administración', base: '/admin', icono: 'admin_panel_settings',
    secciones: [
      { titulo: 'General', items: [
        { ruta: 'inicio', pagina: 'admin/Tablero', titulo: 'Tablero operativo', icono: 'dashboard', tab: true },
        { ruta: 'socios', pagina: 'compartidas/Padron', titulo: 'Padrón de socios', icono: 'badge', tab: true, props: { gestion: true } },
        { ruta: 'socios/nuevo', pagina: 'admin/AltaSocio', titulo: 'Alta de socio', icono: 'person_add' },
        { ruta: 'socios/:id', pagina: 'admin/FichaSocio', titulo: 'Ficha del socio', oculto: true },
        { ruta: 'solicitudes', pagina: 'admin/Solicitudes', titulo: 'Bandeja de solicitudes', icono: 'inbox', tab: true },
      ] },
      { titulo: 'Actividades', items: [
        { ruta: 'actividades', pagina: 'admin/Actividades', titulo: 'Actividades y grupos', icono: 'sports_soccer' },
        { ruta: 'inscripciones', pagina: 'admin/Inscripciones', titulo: 'Inscripciones', icono: 'how_to_reg' },
        { ruta: 'aranceles', pagina: 'admin/Tarifario', titulo: 'Tarifario', icono: 'sell' },
        { ruta: 'espacios', pagina: 'admin/Espacios', titulo: 'Espacios y reservas', icono: 'stadium' },
        { ruta: 'revision-medica', pagina: 'admin/RevisionMedica', titulo: 'Revisión médica', icono: 'medical_services' },
      ] },
      { titulo: 'Cobranzas', items: [
        { ruta: 'cobranzas', pagina: 'admin/Cobranzas', titulo: 'Cobranzas', icono: 'point_of_sale', tab: true },
      ] },
      { titulo: 'Accesos', items: [
        { ruta: 'habilitacion', pagina: 'admin/Habilitacion', titulo: 'Reglas de habilitación', icono: 'rule' },
        { ruta: 'accesos', pagina: 'compartidas/Accesos', titulo: 'Accesos y fichajes', icono: 'door_open' },
        { ruta: 'puntos-acceso', pagina: 'admin/PuntosAcceso', titulo: 'Puntos de acceso', icono: 'sensor_door' },
      ] },
      { titulo: 'Operación', items: [
        { ruta: 'sectores', pagina: 'admin/Sectores', titulo: 'Sectores del club', icono: 'apartment' },
        { ruta: 'tickets', pagina: 'compartidas/GestorTickets', titulo: 'Tickets de mantenimiento', icono: 'build', props: { modo: 'admin' } },
        { ruta: 'comunicados', pagina: 'compartidas/Comunicados', titulo: 'Comunicados', icono: 'campaign', props: { alcance: 'todos' } },
        { ruta: 'documentos', pagina: 'admin/Documentos', titulo: 'Documentos', icono: 'folder' },
        { ruta: 'privacidad', pagina: 'admin/Privacidad', titulo: 'Privacidad y datos', icono: 'shield_person' },
        { ruta: 'usuarios', pagina: 'compartidas/Usuarios', titulo: 'Usuarios y roles', icono: 'manage_accounts' },
      ] },
    ],
  },
  contabilidad: {
    nombre: 'Contabilidad', base: '/contabilidad', icono: 'account_balance',
    secciones: [
      { titulo: 'Resumen', items: [
        { ruta: 'inicio', pagina: 'compartidas/ResumenFinanciero', titulo: 'Resumen financiero', icono: 'monitoring', tab: true },
        { ruta: 'reportes', pagina: 'contabilidad/Reportes', titulo: 'Reportes', icono: 'analytics' },
        { ruta: 'presupuesto', pagina: 'compartidas/Presupuesto', titulo: 'Presupuesto', icono: 'savings', props: { gestion: true } },
        { ruta: 'cierre', pagina: 'contabilidad/Cierre', titulo: 'Cierre mensual', icono: 'lock_clock' },
      ] },
      { titulo: 'Ingresos', items: [
        { ruta: 'ingresos', pagina: 'compartidas/Ingresos', titulo: 'Ingresos del club', icono: 'trending_up', tab: true, props: { gestion: true } },
        { ruta: 'cuentas-a-cobrar', pagina: 'contabilidad/CuentasACobrar', titulo: 'Cuentas a cobrar', icono: 'request_page' },
        { ruta: 'comprobantes', pagina: 'contabilidad/Comprobantes', titulo: 'Comprobantes', icono: 'receipt' },
        { ruta: 'conciliacion', pagina: 'contabilidad/Conciliacion', titulo: 'Pagos en línea y transferencias', icono: 'sync_alt' },
      ] },
      { titulo: 'Egresos', items: [
        { ruta: 'gastos', pagina: 'compartidas/Gastos', titulo: 'Gastos del club', icono: 'shopping_cart', tab: true, props: { gestion: true } },
        { ruta: 'empleados', pagina: 'compartidas/Empleados', titulo: 'Empleados y remuneraciones', icono: 'badge', props: { gestion: true } },
        { ruta: 'proveedores', pagina: 'contabilidad/Proveedores', titulo: 'Proveedores', icono: 'local_shipping' },
        { ruta: 'compras', pagina: 'contabilidad/Compras', titulo: 'Compras y pagos', icono: 'inventory' },
        { ruta: 'honorarios', pagina: 'contabilidad/Honorarios', titulo: 'Honorarios', icono: 'request_quote' },
        { ruta: 'caja', pagina: 'contabilidad/Caja', titulo: 'Caja y bancos', icono: 'account_balance_wallet', tab: true },
      ] },
    ],
  },
  directiva: {
    nombre: 'Comisión Directiva', base: '/directiva', icono: 'gavel',
    secciones: [
      { titulo: 'Gobierno', items: [
        { ruta: 'tablero', pagina: 'directiva/Tablero', titulo: 'Tablero', icono: 'insights', tab: true },
        { ruta: 'aprobaciones', pagina: 'directiva/Aprobaciones', titulo: 'Aprobaciones', icono: 'approval', tab: true },
        { ruta: 'actas', pagina: 'directiva/Actas', titulo: 'Actas y resoluciones', icono: 'history_edu', tab: true },
        { ruta: 'pedidos-cambio', pagina: 'compartidas/PedidosCambio', titulo: 'Pedidos de cambio', icono: 'change_circle', props: { decide: true } },
        { ruta: 'subcomisiones', pagina: 'directiva/Subcomisiones', titulo: 'Subcomisiones', icono: 'diversity_3' },
      ] },
      { titulo: 'Finanzas', items: [
        { ruta: 'finanzas', pagina: 'directiva/Finanzas', titulo: 'Finanzas', icono: 'account_balance', tab: true },
        { ruta: 'ingresos', pagina: 'compartidas/Ingresos', titulo: 'Ingresos y medios de pago', icono: 'trending_up' },
        { ruta: 'gastos', pagina: 'compartidas/Gastos', titulo: 'Gastos', icono: 'shopping_cart' },
        { ruta: 'empleados', pagina: 'compartidas/Empleados', titulo: 'Empleados y remuneraciones', icono: 'badge' },
      ] },
      { titulo: 'Control', items: [
        { ruta: 'padron', pagina: 'compartidas/Padron', titulo: 'Padrón (lectura)', icono: 'groups' },
        { ruta: 'auditoria', pagina: 'compartidas/Auditoria', titulo: 'Auditoría', icono: 'policy' },
      ] },
    ],
  },
  subcomision: {
    nombre: 'Subcomisión', base: '/subcomision', icono: 'diversity_3',
    secciones: [
      { titulo: 'Mi actividad', items: [
        { ruta: 'inicio', pagina: 'subcomision/Resumen', titulo: 'Resumen de la actividad', icono: 'dashboard', tab: true },
        { ruta: 'agenda', pagina: 'compartidas/AgendaEspacios', titulo: 'Agenda', icono: 'calendar_month', tab: true, props: { modo: 'subcomision' } },
        { ruta: 'solicitudes', pagina: 'compartidas/SolicitudesCompra', titulo: 'Solicitudes', icono: 'shopping_bag', tab: true },
        { ruta: 'comunicados', pagina: 'compartidas/Comunicados', titulo: 'Comunicados', icono: 'campaign', tab: true, props: { alcance: 'actividad' } },
        { ruta: 'pedidos-cambio', pagina: 'compartidas/PedidosCambio', titulo: 'Pedir sección, rol o permiso', icono: 'change_circle' },
      ] },
    ],
  },
  mantenimiento: {
    nombre: 'Mantenimiento', base: '/mantenimiento', icono: 'handyman',
    secciones: [
      { titulo: 'Trabajo', items: [
        { ruta: 'inicio', pagina: 'mantenimiento/MisTickets', titulo: 'Mis tickets del día', icono: 'task_alt', tab: true },
        { ruta: 'tickets', pagina: 'compartidas/GestorTickets', titulo: 'Gestor de tickets', icono: 'view_kanban', tab: true, props: { modo: 'mantenimiento' } },
        { ruta: 'tickets/nuevo', pagina: 'mantenimiento/NuevoTicket', titulo: 'Nuevo ticket', icono: 'add_circle' },
        { ruta: 'tickets/:id', pagina: 'mantenimiento/DetalleTicket', titulo: 'Detalle del ticket', oculto: true },
        { ruta: 'agenda-espacios', pagina: 'compartidas/AgendaEspacios', titulo: 'Agenda de espacios', icono: 'calendar_month', props: { modo: 'mantenimiento' } },
      ] },
      { titulo: 'Recursos', items: [
        { ruta: 'inventario', pagina: 'mantenimiento/Inventario', titulo: 'Inventario', icono: 'inventory_2' },
        { ruta: 'solicitudes-compra', pagina: 'compartidas/SolicitudesCompra', titulo: 'Solicitudes de compra', icono: 'shopping_bag' },
        { ruta: 'porteria', pagina: 'compartidas/Fichaje', titulo: 'Puesto de portería', icono: 'qr_code_scanner', tab: true, props: { modo: 'porteria' } },
      ] },
    ],
  },
  medico: {
    nombre: 'Médico/a', base: '/medico', icono: 'stethoscope',
    secciones: [
      { titulo: 'Revisiones', items: [
        { ruta: 'inicio', pagina: 'compartidas/AgendaMedica', titulo: 'Agenda del día', icono: 'today', tab: true, props: { modo: 'medico' } },
        { ruta: 'revision', pagina: 'medico/NuevaRevision', titulo: 'Nueva revisión', icono: 'add_circle', tab: true },
        { ruta: 'pendientes', pagina: 'medico/Pendientes', titulo: 'Pendientes y vencimientos', icono: 'pending_actions', tab: true },
        { ruta: 'certificados', pagina: 'compartidas/Certificados', titulo: 'Certificados externos', icono: 'verified', tab: true, props: { modo: 'medico' } },
        { ruta: 'historial', pagina: 'medico/Historial', titulo: 'Historial de revisiones', icono: 'history' },
      ] },
    ],
  },
  auxiliar: {
    nombre: 'Auxiliar de revisión', base: '/revision', icono: 'medical_information',
    secciones: [
      { titulo: 'Gabinete', items: [
        { ruta: 'agenda', pagina: 'compartidas/AgendaMedica', titulo: 'Agenda y recepción', icono: 'event', tab: true, props: { modo: 'auxiliar' } },
        { ruta: 'certificados', pagina: 'compartidas/Certificados', titulo: 'Certificados', icono: 'upload_file', tab: true, props: { modo: 'auxiliar' } },
        { ruta: 'recordatorios', pagina: 'revision/Recordatorios', titulo: 'Recordatorios', icono: 'notifications_active', tab: true },
      ] },
    ],
  },
  sistemas: {
    nombre: 'Sistemas', base: '/sistema', icono: 'terminal',
    secciones: [
      { titulo: 'Operación', items: [
        { ruta: 'salud', pagina: 'sistema/Salud', titulo: 'Estado del sistema', icono: 'monitor_heart', tab: true },
        { ruta: 'lectores', pagina: 'sistema/Lectores', titulo: 'Lectores y cerraduras', icono: 'nfc', tab: true },
        { ruta: 'integraciones', pagina: 'sistema/Integraciones', titulo: 'Integraciones', icono: 'hub' },
        { ruta: 'backups', pagina: 'sistema/Backups', titulo: 'Backups', icono: 'backup', tab: true },
      ] },
      { titulo: 'Configuración', items: [
        { ruta: 'parametros', pagina: 'sistema/Parametros', titulo: 'Parámetros', icono: 'tune' },
        { ruta: 'logs', pagina: 'compartidas/Auditoria', titulo: 'Registros técnicos', icono: 'receipt_long', props: { tecnico: true } },
        { ruta: 'roles', pagina: 'sistema/Roles', titulo: 'Roles y permisos', icono: 'admin_panel_settings', tab: true },
      ] },
    ],
  },
};

export const itemsDe = (codigo) => ROLES_UI[codigo].secciones.flatMap((s) => s.items);

/** Cantidad de vistas definidas (sin contar las auxiliares). */
export const totalVistas = () => PUBLICO.length + Object.values(ROLES_UI).reduce((n, r) => n + r.secciones.flatMap((s) => s.items).filter((i) => i.ruta !== 'pagos/simulado/:id' && i.ruta !== 'socios/:id').length, 0);
