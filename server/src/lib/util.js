import { config } from '../config.js';

export class HttpError extends Error {
  constructor(status, mensaje, detalle) {
    super(mensaje);
    this.status = status;
    this.detalle = detalle;
  }
}

export const noEncontrado = (que = 'Recurso') => new HttpError(404, `${que} no encontrado`);
export const prohibido = (mensaje = 'No tenés permiso para esta acción') => new HttpError(403, mensaje);
export const invalido = (mensaje, detalle) => new HttpError(400, mensaje, detalle);
export const conflicto = (mensaje) => new HttpError(409, mensaje);

/** Valida con un esquema Zod y lanza 400 con el detalle de los campos. */
export function validar(esquema, datos) {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw invalido('Datos inválidos', r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })));
  }
  return r.data;
}

/** Partes de fecha y hora en Buenos Aires para una fecha UTC. */
export function local(fecha = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(fecha);
  const p = Object.fromEntries(f.map((x) => [x.type, x.value]));
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}`,
    minutos: Number(p.hour) * 60 + Number(p.minute),
    diaSemana: dias[p.weekday],
    periodo: `${p.year}-${p.month}`,
  };
}

export const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function sumarDias(fechaIso, dias) {
  const d = new Date(`${fechaIso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function sumarMeses(fechaIso, meses) {
  const d = new Date(`${fechaIso.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function edad(fechaNacimiento, hoy = local().fecha) {
  if (!fechaNacimiento) return null;
  const [a, m, d] = fechaNacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

export const pesos = (centavos) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(centavos / 100);

export const json = (texto, defecto = null) => {
  try {
    return texto == null ? defecto : JSON.parse(texto);
  } catch {
    return defecto;
  }
};

/** Envuelve el resultado paginado de una consulta. */
export function paginar(req) {
  const limite = Math.min(Number(req.query.limite) || 50, 200);
  const pagina = Math.max(Number(req.query.pagina) || 1, 1);
  return { limite, offset: (pagina - 1) * limite, pagina };
}
