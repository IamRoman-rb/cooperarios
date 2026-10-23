import { matchPath } from 'react-router-dom';

// Las 100 vistas de la plataforma agrupadas por rol (propuesta, sección 5).
// Las rutas no llevan el rol: cada usuario ve en un solo portal las vistas de todos sus roles.
// `pagina` es el archivo en src/pages; `props` se pasan al componente; `tab` = aparece en la barra inferior del celular.
// La primera vista de cada rol es su inicio; la del rol principal del usuario se muestra en /inicio.

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
    nombre: 'Socio', icono: 'badge',
    secciones: [
      { titulo: 'Mi club', items: [
        { ruta: '/mi-resumen', pagina: 'socio/Inicio', titulo: 'Mi resumen', icono: 'home', tab: true },
        { ruta: '/credencial', pagina: 'socio/Credencial', titulo: 'Credencial QR', icono: 'qr_code_2', tab: true },
        { ruta: '/mis-actividades', pagina: 'socio/MisActividades', titulo: 'Mis actividades', icono: 'sports_soccer', tab: true },
        { ruta: '/mis-actividades/explorar', pagina: 'socio/Explorar', titulo: 'Explorar e inscribirme', icono: 'travel_explore' },
        { ruta: '/reservas', pagina: 'socio/Reservas', titulo: 'Reservas', icono: 'event_available' },
      ] },
      { titulo: 'Pagos', items: [
        { ruta: '/estado-de-cuenta', pagina: 'socio/Cuenta', titulo: 'Estado de cuenta', icono: 'receipt_long' },
        { ruta: '/pagos', pagina: 'socio/Pagar', titulo: 'Pagar', icono: 'payments', tab: true },
        { ruta: '/pagos/simulado/:id', pagina: 'socio/PagoSimulado', titulo: 'Checkout de prueba', oculto: true },
      ] },
      { titulo: 'Mi cuenta', items: [
        { ruta: '/mi-revision-medica', pagina: 'socio/RevisionMedica', titulo: 'Revisión médica', icono: 'medical_services' },
        { ruta: '/invitados', pagina: 'socio/Invitados', titulo: 'Invitados', icono: 'group_add' },
        { ruta: '/novedades', pagina: 'socio/Novedades', titulo: 'Novedades', icono: 'campaign' },
        { ruta: '/tramites', pagina: 'socio/Tramites', titulo: 'Trámites y reportes', icono: 'assignment' },
        { ruta: '/perfil', pagina: 'socio/Perfil', titulo: 'Perfil y grupo familiar', icono: 'family_restroom' },
        { ruta: '/mi-privacidad', pagina: 'socio/Privacidad', titulo: 'Privacidad', icono: 'shield_person' },
      ] },
    ],
  },
  profesor: {
    nombre: 'Profesor', icono: 'sports',
    secciones: [
      { titulo: 'Clases', items: [
        { ruta: '/agenda', pagina: 'profesor/Agenda', titulo: 'Agenda del día', icono: 'today', tab: true },
        { ruta: '/mis-grupos', pagina: 'profesor/Grupos', titulo: 'Mis grupos', icono: 'groups', tab: true },
        { ruta: '/fichaje', pagina: 'compartidas/Fichaje', titulo: 'Fichaje por QR', icono: 'qr_code_scanner', tab: true, props: { modo: 'profesor' } },
        { ruta: '/asistencia', pagina: 'profesor/Asistencia', titulo: 'Asistencia', icono: 'fact_check', tab: true },
        { ruta: '/calendario', pagina: 'profesor/Calendario', titulo: 'Calendario y espacios', icono: 'calendar_month' },
      ] },
      { titulo: 'Seguimiento', items: [
        { ruta: '/comunicaciones', pagina: 'compartidas/Comunicados', titulo: 'Comunicaciones', icono: 'forum', props: { alcance: 'grupo' } },
        { ruta: '/mis-honorarios', pagina: 'profesor/Honorarios', titulo: 'Mis honorarios', icono: 'request_quote' },
        { ruta: '/reportar-problema', pagina: 'compartidas/MisReportes', titulo: 'Reportar un problema', icono: 'report' },
      ] },
    ],
  },
  admin: {
    nombre: 'Administración', icono: 'admin_panel_settings',
    secciones: [
      { titulo: 'General', items: [
        { ruta: '/tablero-operativo', pagina: 'admin/Tablero', titulo: 'Tablero operativo', icono: 'dashboard', tab: true },
        { ruta: '/socios', pagina: 'compartidas/Padron', titulo: 'Padrón de socios', icono: 'badge', tab: true, props: { gestion: true } },
        { ruta: '/socios/nuevo', pagina: 'admin/AltaSocio', titulo: 'Alta de socio', icono: 'person_add' },
        { ruta: '/socios/:id', pagina: 'admin/FichaSocio', titulo: 'Ficha del socio', oculto: true },
        { ruta: '/bandeja-de-solicitudes', pagina: 'admin/Solicitudes', titulo: 'Bandeja de solicitudes', icono: 'inbox', tab: true },
      ] },
      { titulo: 'Actividades', items: [
        { ruta: '/actividades-y-grupos', pagina: 'admin/Actividades', titulo: 'Actividades y grupos', icono: 'sports_soccer' },
        { ruta: '/inscripciones', pagina: 'admin/Inscripciones', titulo: 'Inscripciones', icono: 'how_to_reg' },
        { ruta: '/tarifario', pagina: 'admin/Tarifario', titulo: 'Tarifario', icono: 'sell' },
        { ruta: '/espacios', pagina: 'admin/Espacios', titulo: 'Espacios y reservas', icono: 'stadium' },
        { ruta: '/revision-medica', pagina: 'admin/RevisionMedica', titulo: 'Revisión médica', icono: 'medical_services' },
      ] },
      { titulo: 'Cobranzas', items: [
        { ruta: '/cobranzas', pagina: 'admin/Cobranzas', titulo: 'Cobranzas', icono: 'point_of_sale', tab: true },
      ] },
      { titulo: 'Accesos', items: [
        { ruta: '/habilitacion', pagina: 'admin/Habilitacion', titulo: 'Reglas de habilitación', icono: 'rule' },
        { ruta: '/accesos', pagina: 'compartidas/Accesos', titulo: 'Accesos y fichajes', icono: 'door_open' },
        { ruta: '/puntos-de-acceso', pagina: 'admin/PuntosAcceso', titulo: 'Puntos de acceso', icono: 'sensor_door' },
      ] },
      { titulo: 'Operación', items: [
        { ruta: '/sectores', pagina: 'admin/Sectores', titulo: 'Sectores del club', icono: 'apartment' },
        { ruta: '/tickets', pagina: 'compartidas/GestorTickets', titulo: 'Tickets de mantenimiento', icono: 'build', props: { modo: 'admin' } },
        { ruta: '/tickets/:id', pagina: 'mantenimiento/DetalleTicket', titulo: 'Detalle del ticket', oculto: true },
        { ruta: '/comunicados', pagina: 'compartidas/Comunicados', titulo: 'Comunicados', icono: 'campaign', props: { alcance: 'todos' } },
        { ruta: '/documentos', pagina: 'admin/Documentos', titulo: 'Documentos', icono: 'folder' },
        { ruta: '/privacidad-y-datos', pagina: 'admin/Privacidad', titulo: 'Privacidad y datos', icono: 'shield_person' },
        { ruta: '/usuarios', pagina: 'compartidas/Usuarios', titulo: 'Usuarios y roles', icono: 'manage_accounts' },
      ] },
    ],
  },
  contabilidad: {
    nombre: 'Contabilidad', icono: 'account_balance',
    secciones: [
      { titulo: 'Resumen', items: [
        { ruta: '/resumen-financiero', pagina: 'compartidas/ResumenFinanciero', titulo: 'Resumen financiero', icono: 'monitoring', tab: true },
        { ruta: '/reportes', pagina: 'contabilidad/Reportes', titulo: 'Reportes', icono: 'analytics' },
        { ruta: '/presupuesto', pagina: 'compartidas/Presupuesto', titulo: 'Presupuesto', icono: 'savings', props: { gestion: true } },
        { ruta: '/cierre-mensual', pagina: 'contabilidad/Cierre', titulo: 'Cierre mensual', icono: 'lock_clock' },
      ] },
      { titulo: 'Ingresos', items: [
        { ruta: '/ingresos', pagina: 'compartidas/Ingresos', titulo: 'Ingresos del club', icono: 'trending_up', tab: true, props: { gestion: true } },
        { ruta: '/cuentas-a-cobrar', pagina: 'contabilidad/CuentasACobrar', titulo: 'Cuentas a cobrar', icono: 'request_page' },
        { ruta: '/comprobantes', pagina: 'contabilidad/Comprobantes', titulo: 'Comprobantes', icono: 'receipt' },
        { ruta: '/conciliacion', pagina: 'contabilidad/Conciliacion', titulo: 'Pagos en línea y transferencias', icono: 'sync_alt' },
      ] },
      { titulo: 'Egresos', items: [
        { ruta: '/gastos', pagina: 'compartidas/Gastos', titulo: 'Gastos del club', icono: 'shopping_cart', tab: true, props: { gestion: true } },
        { ruta: '/empleados', pagina: 'compartidas/Empleados', titulo: 'Empleados y remuneraciones', icono: 'badge', props: { gestion: true } },
        { ruta: '/proveedores', pagina: 'contabilidad/Proveedores', titulo: 'Proveedores', icono: 'local_shipping' },
        { ruta: '/compras', pagina: 'contabilidad/Compras', titulo: 'Compras y pagos', icono: 'inventory' },
        { ruta: '/honorarios', pagina: 'contabilidad/Honorarios', titulo: 'Honorarios', icono: 'request_quote' },
        { ruta: '/caja', pagina: 'contabilidad/Caja', titulo: 'Caja y bancos', icono: 'account_balance_wallet', tab: true },
      ] },
    ],
  },
  directiva: {
    nombre: 'Comisión Directiva', icono: 'gavel',
    secciones: [
      { titulo: 'Gobierno', items: [
        { ruta: '/tablero', pagina: 'directiva/Tablero', titulo: 'Tablero', icono: 'insights', tab: true },
        { ruta: '/aprobaciones', pagina: 'directiva/Aprobaciones', titulo: 'Aprobaciones', icono: 'approval', tab: true },
        { ruta: '/actas', pagina: 'directiva/Actas', titulo: 'Actas y resoluciones', icono: 'history_edu', tab: true },
        { ruta: '/pedidos-de-cambio', pagina: 'compartidas/PedidosCambio', titulo: 'Pedidos de cambio', icono: 'change_circle', props: { decide: true } },
        { ruta: '/subcomisiones', pagina: 'directiva/Subcomisiones', titulo: 'Subcomisiones', icono: 'diversity_3' },
      ] },
      { titulo: 'Finanzas', items: [
        { ruta: '/finanzas', pagina: 'directiva/Finanzas', titulo: 'Finanzas', icono: 'account_balance', tab: true },
        { ruta: '/ingresos', pagina: 'compartidas/Ingresos', titulo: 'Ingresos y medios de pago', icono: 'trending_up' },
        { ruta: '/gastos', pagina: 'compartidas/Gastos', titulo: 'Gastos', icono: 'shopping_cart' },
        { ruta: '/empleados', pagina: 'compartidas/Empleados', titulo: 'Empleados y remuneraciones', icono: 'badge' },
      ] },
      { titulo: 'Control', items: [
        { ruta: '/socios', pagina: 'compartidas/Padron', titulo: 'Padrón (lectura)', icono: 'groups' },
        { ruta: '/auditoria', pagina: 'compartidas/Auditoria', titulo: 'Auditoría', icono: 'policy' },
      ] },
    ],
  },
  subcomision: {
    nombre: 'Subcomisión', icono: 'diversity_3',
    secciones: [
      { titulo: 'Mi actividad', items: [
        { ruta: '/mi-actividad', pagina: 'subcomision/Resumen', titulo: 'Resumen de la actividad', icono: 'dashboard', tab: true },
        { ruta: '/agenda-espacios', pagina: 'compartidas/AgendaEspacios', titulo: 'Agenda', icono: 'calendar_month', tab: true, props: { modo: 'subcomision' } },
        { ruta: '/solicitudes-de-compra', pagina: 'compartidas/SolicitudesCompra', titulo: 'Solicitudes', icono: 'shopping_bag', tab: true },
        { ruta: '/comunicados', pagina: 'compartidas/Comunicados', titulo: 'Comunicados', icono: 'campaign', tab: true, props: { alcance: 'actividad' } },
        { ruta: '/pedidos-de-cambio', pagina: 'compartidas/PedidosCambio', titulo: 'Pedir sección, rol o permiso', icono: 'change_circle' },
      ] },
    ],
  },
  mantenimiento: {
    nombre: 'Mantenimiento', icono: 'handyman',
    secciones: [
      { titulo: 'Trabajo', items: [
        { ruta: '/mis-tickets', pagina: 'mantenimiento/MisTickets', titulo: 'Mis tickets del día', icono: 'task_alt', tab: true },
        { ruta: '/tickets', pagina: 'compartidas/GestorTickets', titulo: 'Gestor de tickets', icono: 'view_kanban', tab: true, props: { modo: 'mantenimiento' } },
        { ruta: '/tickets/nuevo', pagina: 'mantenimiento/NuevoTicket', titulo: 'Nuevo ticket', icono: 'add_circle' },
        { ruta: '/tickets/:id', pagina: 'mantenimiento/DetalleTicket', titulo: 'Detalle del ticket', oculto: true },
        { ruta: '/agenda-espacios', pagina: 'compartidas/AgendaEspacios', titulo: 'Agenda de espacios', icono: 'calendar_month', props: { modo: 'mantenimiento' } },
      ] },
      { titulo: 'Recursos', items: [
        { ruta: '/inventario', pagina: 'mantenimiento/Inventario', titulo: 'Inventario', icono: 'inventory_2' },
        { ruta: '/solicitudes-de-compra', pagina: 'compartidas/SolicitudesCompra', titulo: 'Solicitudes de compra', icono: 'shopping_bag' },
        { ruta: '/porteria', pagina: 'compartidas/Fichaje', titulo: 'Puesto de portería', icono: 'qr_code_scanner', tab: true, props: { modo: 'porteria' } },
      ] },
    ],
  },
  medico: {
    nombre: 'Médico/a', icono: 'stethoscope',
    secciones: [
      { titulo: 'Revisiones', items: [
        { ruta: '/agenda-medica', pagina: 'compartidas/AgendaMedica', titulo: 'Agenda del día', icono: 'today', tab: true, props: { modo: 'medico' } },
        { ruta: '/nueva-revision', pagina: 'medico/NuevaRevision', titulo: 'Nueva revisión', icono: 'add_circle', tab: true },
        { ruta: '/pendientes', pagina: 'medico/Pendientes', titulo: 'Pendientes y vencimientos', icono: 'pending_actions', tab: true },
        { ruta: '/certificados', pagina: 'compartidas/Certificados', titulo: 'Certificados externos', icono: 'verified', tab: true, props: { modo: 'medico' } },
        { ruta: '/historial-de-revisiones', pagina: 'medico/Historial', titulo: 'Historial de revisiones', icono: 'history' },
      ] },
    ],
  },
  auxiliar: {
    nombre: 'Auxiliar de revisión', icono: 'medical_information',
    secciones: [
      { titulo: 'Gabinete', items: [
        { ruta: '/agenda-medica', pagina: 'compartidas/AgendaMedica', titulo: 'Agenda y recepción', icono: 'event', tab: true, props: { modo: 'auxiliar' } },
        { ruta: '/certificados', pagina: 'compartidas/Certificados', titulo: 'Certificados', icono: 'upload_file', tab: true, props: { modo: 'auxiliar' } },
        { ruta: '/recordatorios', pagina: 'revision/Recordatorios', titulo: 'Recordatorios', icono: 'notifications_active', tab: true },
      ] },
    ],
  },
  sistemas: {
    nombre: 'Sistemas', icono: 'terminal',
    secciones: [
      { titulo: 'Operación', items: [
        { ruta: '/estado-del-sistema', pagina: 'sistema/Salud', titulo: 'Estado del sistema', icono: 'monitor_heart', tab: true },
        { ruta: '/lectores', pagina: 'sistema/Lectores', titulo: 'Lectores y cerraduras', icono: 'nfc', tab: true },
        { ruta: '/integraciones', pagina: 'sistema/Integraciones', titulo: 'Integraciones', icono: 'hub' },
        { ruta: '/backups', pagina: 'sistema/Backups', titulo: 'Backups', icono: 'backup', tab: true },
      ] },
      { titulo: 'Configuración', items: [
        { ruta: '/parametros', pagina: 'sistema/Parametros', titulo: 'Parámetros', icono: 'tune' },
        { ruta: '/registros-tecnicos', pagina: 'compartidas/Auditoria', titulo: 'Registros técnicos', icono: 'receipt_long', props: { tecnico: true } },
        { ruta: '/roles-y-permisos', pagina: 'sistema/Roles', titulo: 'Roles y permisos', icono: 'admin_panel_settings', tab: true },
      ] },
    ],
  },
};

// Rol principal del usuario: define su /inicio y el orden del menú.
export const PRIORIDAD = ['admin', 'contabilidad', 'directiva', 'sistemas', 'medico', 'auxiliar', 'mantenimiento', 'profesor', 'subcomision', 'socio'];

export const INICIO = '/inicio';

/**
 * Portal de un usuario a partir de sus códigos de rol: secciones del menú (sin repetir vistas)
 * y mapa ruta → vista. Si dos roles comparten una ruta, vale la del rol de mayor prioridad.
 */
export function armarPortal(codigos) {
  const roles = PRIORIDAD.filter((c) => codigos.includes(c));
  const vistas = new Map();
  const secciones = [];
  const inicioPropio = roles.length ? ROLES_UI[roles[0]].secciones[0].items[0].ruta : null;
  for (const codigo of roles) {
    for (const s of ROLES_UI[codigo].secciones) {
      let seccion = secciones.find((x) => x.titulo === s.titulo);
      if (!seccion) secciones.push(seccion = { titulo: s.titulo, items: [] });
      for (const item of s.items) {
        const ruta = item.ruta === inicioPropio ? INICIO : item.ruta;
        if (vistas.has(ruta)) continue;
        const vista = ruta === INICIO ? { ...item, ruta, titulo: 'Inicio', icono: 'home' } : item;
        vistas.set(ruta, vista);
        if (!vista.oculto) seccion.items.push(vista);
      }
    }
  }
  return { roles, vistas, inicioPropio, secciones: secciones.filter((s) => s.items.length) };
}

/** Vista del portal que corresponde a una URL (sin la consulta), o null. */
export function vistaDe(portal, url) {
  const pathname = url.split(/[?#]/)[0];
  for (const vista of portal.vistas.values()) if (matchPath(vista.ruta, pathname)) return vista;
  return null;
}

/** Todas las rutas del portal, de todos los roles, para declararlas en el router. */
export const RUTAS_PORTAL = [INICIO, ...new Set(Object.values(ROLES_UI).flatMap((r) => r.secciones.flatMap((s) => s.items.map((i) => i.ruta))))];
