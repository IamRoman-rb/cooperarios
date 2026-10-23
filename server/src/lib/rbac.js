// Matriz de permisos por módulo (propuesta, sección 4.1).
// P propio · L lectura · Lx lectura en su ámbito · G gestión · Gx gestión en su ámbito
// A aprueba · S solicita · – sin acceso.
import { prohibido } from './util.js';

export const ROLES = [
  { codigo: 'socio', nombre: 'Socio' },
  { codigo: 'profesor', nombre: 'Profesor' },
  { codigo: 'admin', nombre: 'Administración' },
  { codigo: 'contabilidad', nombre: 'Contabilidad' },
  { codigo: 'directiva', nombre: 'Comisión Directiva' },
  { codigo: 'subcomision', nombre: 'Delegado de subcomisión' },
  { codigo: 'mantenimiento', nombre: 'Servicio y mantenimiento' },
  { codigo: 'medico', nombre: 'Médico/a revisor/a' },
  { codigo: 'auxiliar', nombre: 'Auxiliar de revisión médica' },
  { codigo: 'sistemas', nombre: 'Sistemas' },
];

const ORDEN = ROLES.map((r) => r.codigo);

// Una fila por módulo, en el orden de ROLES.
const FILAS = {
  perfil:             ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  padron:             ['-', 'Lx', 'G', 'L', 'L', 'Lx', 'Lx', 'Lx', 'Lx', '-'],
  altas_bajas:        ['S', '-', 'G', 'L', 'A', '-', '-', '-', '-', '-'],
  actividades:        ['L', 'Lx', 'G', 'L', 'L', 'Gx', 'L', 'L', 'L', '-'],
  inscripciones:      ['P', 'Lx', 'G', 'L', 'L', 'Lx', '-', '-', '-', '-'],
  asistencia:         ['P', 'G', 'L', '-', 'L', 'Lx', 'L', '-', '-', '-'],
  habilitacion:       ['-', '-', 'G', 'L', 'A', '-', '-', '-', '-', '-'],
  reservas:           ['P', 'Gx', 'G', 'L', 'L', 'Gx', 'L', '-', '-', '-'],
  cuenta_corriente:   ['P', '-', 'G', 'G', 'L', 'Lx', '-', '-', '-', '-'],
  comprobantes:       ['P', '-', 'G', 'G', 'L', '-', '-', '-', '-', '-'],
  pagos_online:       ['P', '-', 'G', 'G', 'L', '-', '-', '-', '-', '-'],
  compras:            ['-', '-', 'G', 'G', 'A', 'S', 'S', '-', '-', '-'],
  caja:               ['-', '-', 'L', 'G', 'L', '-', '-', '-', '-', '-'],
  ingresos:           ['-', '-', 'L', 'G', 'L', '-', '-', '-', '-', '-'],
  gastos:             ['-', '-', 'S', 'G', 'A', 'S', 'S', '-', '-', '-'],
  personal:           ['-', '-', 'Lx', 'G', 'L', '-', '-', '-', '-', '-'],
  presupuesto:        ['-', '-', 'L', 'G', 'A', 'Lx', '-', '-', '-', '-'],
  honorarios:         ['-', 'P', 'L', 'G', 'A', '-', '-', '-', '-', '-'],
  tickets:            ['S', 'S', 'G', 'L', 'A', 'S', 'G', 'S', 'S', '-'],
  inventario:         ['-', '-', 'L', 'L', 'L', '-', 'G', '-', '-', '-'],
  porteria:           ['-', '-', 'G', '-', 'L', '-', 'G', '-', '-', 'G'],
  turnos_medicos:     ['P', '-', 'G', '-', 'L', '-', '-', 'G', 'G', '-'],
  resultados_medicos: ['P', 'Lx', 'L', '-', 'L', '-', '-', 'G', 'S', '-'],
  comunicados:        ['L', 'Gx', 'G', 'L', 'G', 'Gx', 'L', 'L', 'Gx', '-'],
  actas:              ['L', '-', 'G', '-', 'G', 'Lx', '-', '-', '-', '-'],
  tablero:            ['-', 'Lx', 'L', 'L', 'L', 'Lx', '-', '-', '-', '-'],
  privacidad:         ['P', '-', 'G', '-', 'L', '-', '-', '-', '-', '-'],
  usuarios:           ['-', '-', 'G', '-', 'L', '-', '-', '-', '-', 'G'],
  pedidos_cambio:     ['-', '-', 'S', '-', 'A', 'S', '-', '-', '-', 'G'],
  auditoria:          ['-', '-', 'L', 'L', 'L', '-', '-', '-', '-', 'G'],
  sistema:            ['-', '-', '-', '-', '-', '-', '-', '-', '-', 'G'],
};

export const MODULOS = {
  perfil: 'Perfil propio y credencial QR',
  padron: 'Padrón de socios y grupos familiares',
  altas_bajas: 'Altas, bajas y cambios de categoría',
  actividades: 'Actividades, cupos, vacantes y precios',
  inscripciones: 'Inscripciones a actividades',
  asistencia: 'Asistencia y fichajes por actividad',
  habilitacion: 'Reglas de habilitación y excepciones manuales',
  reservas: 'Reservas de canchas y espacios',
  cuenta_corriente: 'Cuenta corriente y cobranzas',
  comprobantes: 'Comprobantes y facturación',
  pagos_online: 'Pagos en línea, transferencias y conciliación',
  compras: 'Compras, proveedores y pagos',
  caja: 'Caja, bancos y conciliación',
  ingresos: 'Ingresos del club por medio de pago',
  gastos: 'Registro de gastos',
  personal: 'Personal: empleados y remuneraciones',
  presupuesto: 'Presupuesto e informes financieros',
  honorarios: 'Honorarios y liquidaciones de profesores',
  tickets: 'Tickets de mantenimiento',
  inventario: 'Inventario de mantenimiento',
  porteria: 'Portería y puntos de acceso',
  turnos_medicos: 'Requisitos y turnos de revisión médica',
  resultados_medicos: 'Resultados de revisión médica',
  comunicados: 'Comunicados y notificaciones',
  actas: 'Actas, resoluciones y reuniones',
  tablero: 'Tablero e indicadores',
  privacidad: 'Privacidad: consentimientos y derechos',
  usuarios: 'Usuarios, roles y permisos',
  pedidos_cambio: 'Pedidos de cambio',
  auditoria: 'Auditoría y registro de cambios',
  sistema: 'Parámetros, backups y monitoreo',
};

const ACCIONES = { P: 'propio', L: 'leer', Lx: 'leer_ambito', G: 'gestionar', Gx: 'gestionar_ambito', A: 'aprobar', S: 'solicitar' };

/** Lista [{rol, modulo, accion}] para sembrar las tablas permisos y rol_permisos. */
export function permisosPorRol() {
  const lista = [];
  for (const [modulo, fila] of Object.entries(FILAS)) {
    fila.forEach((letra, i) => {
      if (letra !== '-') lista.push({ rol: ORDEN[i], modulo, accion: ACCIONES[letra], letra });
    });
  }
  return lista;
}

export function matriz() {
  return Object.entries(FILAS).map(([modulo, fila]) => ({
    modulo,
    nombre: MODULOS[modulo],
    roles: Object.fromEntries(fila.map((letra, i) => [ORDEN[i], letra])),
  }));
}

// Una acción "mayor" incluye a las menores.
const IMPLICA = {
  gestionar: ['gestionar', 'leer', 'leer_ambito', 'gestionar_ambito', 'solicitar', 'propio'],
  aprobar: ['aprobar', 'leer', 'leer_ambito'],
  leer: ['leer', 'leer_ambito'],
  gestionar_ambito: ['gestionar_ambito', 'leer_ambito', 'solicitar'],
  leer_ambito: ['leer_ambito'],
  solicitar: ['solicitar'],
  propio: ['propio'],
};

/** Acciones efectivas del usuario sobre un módulo, considerando todos sus roles. */
export function accionesDe(usuario, modulo) {
  const efectivas = new Set();
  for (const p of usuario.permisos ?? []) {
    if (p.modulo === modulo) IMPLICA[p.accion].forEach((a) => efectivas.add(a));
  }
  return efectivas;
}

export function puede(usuario, modulo, ...acciones) {
  const efectivas = accionesDe(usuario, modulo);
  return acciones.some((a) => efectivas.has(a));
}

export const tieneRol = (usuario, ...codigos) => usuario.roles.some((r) => codigos.includes(r.codigo));

/** Actividades a las que está acotado el usuario para un rol (delegado de subcomisión). */
export const ambitoActividades = (usuario, rol = 'subcomision') =>
  usuario.roles.filter((r) => r.codigo === rol && r.actividad_id).map((r) => r.actividad_id);

/** Middleware: exige al menos una de las acciones sobre el módulo. */
export const permiso = (modulo, ...acciones) => (req, _res, next) => {
  if (!req.usuario) return next(prohibido('Iniciá sesión para continuar'));
  if (!puede(req.usuario, modulo, ...acciones)) return next(prohibido());
  next();
};

export const rol = (...codigos) => (req, _res, next) => {
  if (!req.usuario || !tieneRol(req.usuario, ...codigos)) return next(prohibido());
  next();
};
