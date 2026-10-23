// Formatos de Argentina: importes en centavos → pesos; fechas en hora de Buenos Aires.
const TZ = 'America/Argentina/Buenos_Aires';

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fmtPesosDec = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
export const pesos = (centavos, { decimales = false } = {}) =>
  centavos == null ? '—' : (decimales ? fmtPesosDec : fmtPesos).format(centavos / 100);
export const numero = (n) => (n == null ? '—' : new Intl.NumberFormat('es-AR').format(n));
export const aCentavos = (pesosTexto) => Math.round(Number(String(pesosTexto).replace(/\./g, '').replace(',', '.')) * 100);

const conHora = (iso) => (iso.length === 10 ? new Date(`${iso}T12:00:00-03:00`) : new Date(iso));

export function fecha(iso, opciones = {}) {
  if (!iso) return '—';
  return conHora(iso).toLocaleDateString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', ...opciones });
}
export const fechaLarga = (iso) => (iso ? conHora(iso).toLocaleDateString('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }) : '—');
export const fechaCorta = (iso) => (iso ? conHora(iso).toLocaleDateString('es-AR', { timeZone: TZ, day: 'numeric', month: 'short' }) : '—');
export const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
export const fechaHora = (iso) => (iso ? `${fecha(iso)} ${hora(iso)}` : '—');

export function relativa(iso) {
  if (!iso) return '';
  const seg = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seg < 60) return 'recién';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 86400 * 7) return `hace ${Math.floor(seg / 86400)} d`;
  return fecha(iso);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodo = (p) => (p ? `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : '—');
export const periodoCorto = (p) => (p ? `${MESES[Number(p.slice(5, 7)) - 1].slice(0, 3)} ${p.slice(2, 4)}` : '—');
export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Hoy en Buenos Aires (AAAA-MM-DD). */
export function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
export const periodoActual = () => hoy().slice(0, 7);

export function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const horarios = (lista = []) => lista.map((h) => `${DIAS_CORTOS[h.dia_semana]} ${h.hora_inicio}–${h.hora_fin}`).join(' · ');

export const nombre = (p) => (p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() : '—');
export const iniciales = (p) => `${p?.nombre?.[0] ?? ''}${p?.apellido?.[0] ?? ''}`.toUpperCase();

export function edad(nacimiento) {
  if (!nacimiento) return null;
  const [a, m, d] = nacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy().split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

export const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ') : '');
