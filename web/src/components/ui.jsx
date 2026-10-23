// Kit de componentes según el sistema de diseño de Stitch: tarjetas blancas con borde y sombra suave,
// radios de 12px, botones de 44px, chips de estado en píldora y tablas compactas con cebra.
import { forwardRef, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { urlArchivo } from '../lib/api.js';
import { iniciales } from '../lib/formato.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Icono({ n, relleno, className = '', tam }) {
  return <span aria-hidden="true" className={cx('material-symbols-outlined', relleno && 'icono-relleno', className)} style={tam ? { fontSize: tam } : undefined}>{n}</span>;
}

const VARIANTES = {
  primario: 'bg-primary-container text-on-primary hover:bg-primary shadow-sm',
  secundario: 'bg-transparent border-[1.5px] border-graphite text-graphite hover:bg-surface-container-low',
  suave: 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
  fantasma: 'text-primary-container hover:bg-critico-suave',
  peligro: 'bg-error text-on-error hover:bg-on-error-container',
  exito: 'bg-exito text-white hover:brightness-95',
  blanco: 'bg-surface-container-lowest text-primary hover:bg-surface-container-low shadow-sm',
};

export function Boton({ variante = 'primario', icono, cargando, children, className = '', chico, completo, as, ...props }) {
  const clases = cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-label-lg text-label-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none',
    chico ? 'h-9 px-3 text-label-md' : 'h-11 px-4',
    completo && 'w-full',
    VARIANTES[variante], className,
  );
  const contenido = (
    <>
      {cargando ? <Icono n="progress_activity" className="animate-spin" /> : icono && <Icono n={icono} tam={chico ? 18 : 20} />}
      {children && <span className="truncate">{children}</span>}
    </>
  );
  if (as === 'link') return <Link className={clases} {...props}>{contenido}</Link>;
  if (as === 'a') return <a className={clases} {...props}>{contenido}</a>;
  return <button type="button" className={clases} disabled={cargando || props.disabled} {...props}>{contenido}</button>;
}

export function BotonIcono({ icono, etiqueta, className = '', ...props }) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta}
      className={cx('w-10 h-10 inline-flex items-center justify-center rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors', className)} {...props}>
      <Icono n={icono} />
    </button>
  );
}

export function Tarjeta({ titulo, subtitulo, icono, accion, children, className = '', cuerpo = 'p-space-md', franja }) {
  return (
    <section className={cx('tarjeta overflow-hidden', className)}>
      {franja && <div className="h-1.5 bg-primary-container" />}
      {(titulo || accion) && (
        <header className="flex items-center justify-between gap-3 px-space-md pt-space-md">
          <div className="flex items-center gap-2 min-w-0">
            {icono && <Icono n={icono} className="text-primary-container" />}
            <div className="min-w-0">
              <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">{titulo}</h2>
              {subtitulo && <p className="text-body-sm text-secondary truncate">{subtitulo}</p>}
            </div>
          </div>
          {accion}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

export function Encabezado({ titulo, subtitulo, etiqueta, acciones, volver }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-space-lg">
      <div className="min-w-0">
        {volver && (
          <Link to={volver} className="inline-flex items-center gap-1 text-label-md text-secondary hover:text-primary mb-1">
            <Icono n="arrow_back" tam={16} /> Volver
          </Link>
        )}
        {etiqueta && <p className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container mb-1">{etiqueta}</p>}
        <h1 className="text-headline-lg-mobile lg:text-headline-lg text-on-surface">{titulo}</h1>
        {subtitulo && <p className="text-body-md text-secondary mt-1">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2 shrink-0">{acciones}</div>}
    </div>
  );
}

const ESTADOS = {
  exito: ['pagado', 'pagada', 'activo', 'activa', 'apto', 'aprobado', 'aprobada', 'habilitado', 'cerrado', 'resuelto', 'acreditado', 'autorizada', 'autorizado', 'cumplida', 'implementado', 'confirmada', 'cumplida', 'atendido', 'presente', 'al_dia', 'en_linea', 'comprada', 'acta_aprobada', 'no_requiere', 'liquidada', 'validado', 'ok', 'registrado'],
  alerta: ['pendiente', 'parcial', 'pendiente_apto', 'pendiente_aprobacion', 'pendiente_validacion', 'en_proceso', 'en_analisis', 'recibido', 'asignado', 'en_curso', 'nuevo', 'solicitado', 'baja_solicitada', 'apto_restricciones', 'en_gracia', 'postergado', 'liquidado', 'cargada', 'convocada', 'diferido', 'realizada', 'por_vencer', 'reprogramado', 'media', 'alta'],
  critico: ['vencido', 'vencida', 'suspendido', 'no_apto', 'rechazado', 'rechazada', 'denegado', 'anulado', 'anulada', 'baja', 'bloqueado', 'urgente', 'sin_apto', 'fuera_de_linea', 'ausente', 'cancelada', 'cancelado', 'revocada'],
};
const ETIQUETAS = { pendiente_apto: 'Pendiente de apto', apto_restricciones: 'Apto c/ restricciones', no_apto: 'No apto', pendiente_aprobacion: 'Para aprobar', pendiente_validacion: 'Para validar', en_curso: 'En curso', en_gracia: 'En gracia', baja_solicitada: 'Baja solicitada', en_analisis: 'En análisis', al_dia: 'Al día', sin_apto: 'Sin apto', por_vencer: 'Por vencer', no_requiere: 'No requiere', acta_aprobada: 'Acta aprobada', en_linea: 'En línea', fuera_de_linea: 'Sin conexión', en_proceso: 'En proceso' };

export function Estado({ valor, texto, tono, icono }) {
  if (!valor && !texto) return null;
  const t = tono ?? (ESTADOS.exito.includes(valor) ? 'exito' : ESTADOS.alerta.includes(valor) ? 'alerta' : ESTADOS.critico.includes(valor) ? 'critico' : 'neutro');
  const color = { exito: 'bg-exito-suave text-exito', alerta: 'bg-alerta-suave text-alerta', critico: 'bg-critico-suave text-critico', neutro: 'bg-surface-container text-secondary', info: 'bg-secondary-container text-on-secondary-fixed-variant' }[t];
  const etiqueta = texto ?? ETIQUETAS[valor] ?? (valor ? valor.charAt(0).toUpperCase() + valor.slice(1).replace(/_/g, ' ') : '');
  return (
    <span className={cx('inline-flex items-center gap-1 h-6 px-2.5 rounded-full font-label-sm text-label-sm uppercase whitespace-nowrap', color)}>
      {icono && <Icono n={icono} tam={14} />}
      {etiqueta}
    </span>
  );
}

export function Kpi({ etiqueta, valor, icono, detalle, tono = 'normal', a }) {
  const contenido = (
    <div className={cx('tarjeta p-space-md flex flex-col justify-between gap-2 h-full', a && 'hover:shadow-n2 transition-shadow')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">{etiqueta}</span>
        {icono && (
          <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center', tono === 'critico' ? 'bg-critico-suave text-critico' : tono === 'exito' ? 'bg-exito-suave text-exito' : tono === 'alerta' ? 'bg-alerta-suave text-alerta' : 'bg-surface-container text-primary-container')}>
            <Icono n={icono} tam={18} />
          </span>
        )}
      </div>
      <div>
        <p className="text-headline-lg-mobile font-extrabold tracking-tight text-on-surface">{valor}</p>
        {detalle && <p className="text-body-sm text-secondary mt-0.5">{detalle}</p>}
      </div>
    </div>
  );
  return a ? <Link to={a}>{contenido}</Link> : contenido;
}

export function Grilla({ children, cols = 'grid-cols-2 lg:grid-cols-4', className = '' }) {
  return <div className={cx('grid gap-space-sm lg:gap-space-md', cols, className)}>{children}</div>;
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-secondary" role="status">
      <Icono n="progress_activity" className="animate-spin" /> {texto}
    </div>
  );
}

export function ErrorCaja({ error, reintentar }) {
  return (
    <div className="tarjeta p-space-lg flex flex-col items-center text-center gap-2">
      <Icono n="error" className="text-error" tam={32} />
      <p className="font-semibold">{error?.status === 403 ? 'No tenés permiso para ver esta sección' : 'No pudimos cargar la información'}</p>
      <p className="text-body-sm text-secondary">{error?.message}</p>
      {reintentar && <Boton variante="suave" icono="refresh" onClick={reintentar}>Reintentar</Boton>}
    </div>
  );
}

export function Vacio({ icono = 'inbox', titulo = 'Sin datos', texto, accion }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-4">
      <span className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-secondary"><Icono n={icono} /></span>
      <p className="font-semibold text-on-surface">{titulo}</p>
      {texto && <p className="text-body-sm text-secondary max-w-sm">{texto}</p>}
      {accion}
    </div>
  );
}

/** Envuelve una consulta: muestra cargando o error y si no, renderiza hijos(datos). */
export function Consulta({ q, children }) {
  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCaja error={q.error} reintentar={q.refetch} />;
  return children(q.data);
}

export function Tabla({ columnas, filas, vacio = 'No hay registros', onFila, clave = 'id', compacta, pie }) {
  if (!filas?.length) return <Vacio titulo={vacio} />;
  return (
    <div className="overflow-x-auto -mx-space-md">
      <table className={cx('w-full text-left tabla-zebra', compacta ? 'text-body-sm' : 'text-body-md')}>
        <thead>
          <tr className="border-b border-surface-container">
            {columnas.map((c) => (
              <th key={c.k} className={cx('px-space-md py-2 font-label-md text-label-md uppercase text-graphite whitespace-nowrap', c.derecha && 'text-right', c.className)}>{c.t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f[clave] ?? i} onClick={onFila ? () => onFila(f) : undefined}
              className={cx('border-b border-surface-container last:border-0', onFila && 'cursor-pointer hover:bg-surface-container-low')}>
              {columnas.map((c) => (
                <td key={c.k} className={cx('px-space-md py-2.5 align-middle', c.derecha && 'text-right tabular-nums', c.className)}>{c.r ? c.r(f) : f[c.k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {pie && <tfoot>{pie}</tfoot>}
      </table>
    </div>
  );
}

/** La etiqueta envuelve al control, así queda asociada sin necesidad de ids. */
export function Campo({ etiqueta, error, ayuda, children, className = '' }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      {etiqueta && <span className="font-label-md text-label-md text-on-surface">{etiqueta}</span>}
      {children}
      {ayuda && !error && <span className="text-body-sm text-secondary">{ayuda}</span>}
      {error && <span className="text-body-sm text-error">{error}</span>}
    </label>
  );
}

// Los campos reenvían la ref para funcionar con react-hook-form (register).
export const Entrada = forwardRef(({ className = '', ...p }, ref) => <input ref={ref} className={cx('entrada', className)} {...p} />);
export const Selector = forwardRef(({ className = '', opciones = [], vacio, ...p }, ref) => (
  <select ref={ref} className={cx('entrada pr-8', className)} {...p}>
    {vacio !== undefined && <option value="">{vacio}</option>}
    {opciones.map((o) => <option key={o.value ?? o.id} value={o.value ?? o.id}>{o.label ?? o.nombre}</option>)}
  </select>
));
export const Area = forwardRef(({ className = '', ...p }, ref) => <textarea ref={ref} className={cx('entrada h-auto min-h-[96px] py-2', className)} {...p} />);

export const Casilla = forwardRef(({ etiqueta, className = '', ...p }, ref) => (
  <label className={cx('flex items-start gap-2.5 cursor-pointer text-body-md', className)}>
    <input ref={ref} type="checkbox" className="mt-0.5 w-5 h-5 rounded-md accent-[#b91c1c]" {...p} />
    {etiqueta && <span>{etiqueta}</span>}
  </label>
));
Entrada.displayName = 'Entrada';
Selector.displayName = 'Selector';
Area.displayName = 'Area';
Casilla.displayName = 'Casilla';

export function Modal({ abierto, titulo, onCerrar, children, pie, ancho = 'max-w-lg' }) {
  useEffect(() => {
    if (!abierto) return undefined;
    const esc = (e) => e.key === 'Escape' && onCerrar?.();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-[rgba(31,41,55,0.6)] p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar?.()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={cx('bg-surface-container-lowest w-full rounded-t-2xl sm:rounded-2xl shadow-n2 max-h-[92dvh] flex flex-col', ancho)}>
        <header className="flex items-center justify-between gap-3 px-space-lg pt-space-lg pb-space-sm">
          <h2 className="font-headline-sm text-headline-sm">{titulo}</h2>
          <BotonIcono icono="close" etiqueta="Cerrar" onClick={onCerrar} />
        </header>
        <div className="px-space-lg pb-space-lg overflow-y-auto">{children}</div>
        {pie && <footer className="px-space-lg py-space-md border-t border-surface-container flex justify-end gap-2 pb-seguro">{pie}</footer>}
      </div>
    </div>
  );
}

/** Pide un motivo (rechazos, anulaciones, excepciones). */
export function DialogoMotivo({ abierto, titulo, etiqueta = 'Motivo', onCerrar, onConfirmar, cargando, boton = 'Confirmar', variante = 'peligro' }) {
  const [texto, setTexto] = useState('');
  useEffect(() => { if (abierto) setTexto(''); }, [abierto]);
  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar}
      pie={<><Boton variante="suave" onClick={onCerrar}>Cancelar</Boton><Boton variante={variante} cargando={cargando} disabled={texto.trim().length < 3} onClick={() => onConfirmar(texto.trim())}>{boton}</Boton></>}>
      <Campo etiqueta={etiqueta}><Area value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus /></Campo>
    </Modal>
  );
}

export function Pestanas({ opciones, valor, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-surface-container-low rounded-xl overflow-x-auto sin-scroll mb-space-md" role="tablist">
      {opciones.map((o) => {
        const v = o.value ?? o;
        const activo = v === valor;
        return (
          <button key={v} role="tab" aria-selected={activo} onClick={() => onChange(v)}
            className={cx('flex-1 min-w-fit whitespace-nowrap h-9 px-3 rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 transition-all',
              activo ? 'bg-surface-container-lowest shadow-sm text-primary-container' : 'text-secondary hover:text-on-surface')}>
            {o.icono && <Icono n={o.icono} tam={16} />}
            {o.label ?? o}
            {o.n > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-primary-container text-on-primary text-[10px] leading-4">{o.n}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Avatar({ persona, foto, tam = 40, className = '' }) {
  const src = urlArchivo(foto ?? persona?.foto);
  return src ? (
    <img src={src} alt="" className={cx('rounded-xl object-cover bg-surface-container shrink-0', className)} style={{ width: tam, height: tam }} />
  ) : (
    <span className={cx('rounded-xl bg-secondary-container text-on-secondary-fixed-variant font-bold flex items-center justify-center shrink-0', className)} style={{ width: tam, height: tam, fontSize: tam * 0.36 }}>
      {iniciales(persona) || <Icono n="person" />}
    </span>
  );
}

export function Barra({ valor, max, tono = 'primario', className = '' }) {
  const pct = max ? Math.min(100, Math.round((valor / max) * 100)) : 0;
  const color = { primario: 'bg-primary-container', exito: 'bg-exito', alerta: 'bg-alerta', critico: 'bg-critico', gris: 'bg-secondary' }[tono];
  return (
    <div className={cx('h-2 rounded-full bg-surface-container overflow-hidden', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Fila({ icono, titulo, detalle, derecha, onClick, a, tono }) {
  const cont = (
    <div className={cx('flex items-center gap-3 p-3 rounded-xl bg-surface', (onClick || a) && 'hover:bg-surface-container-low cursor-pointer transition-colors')} onClick={onClick}>
      {icono && (
        <span className={cx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', tono === 'critico' ? 'bg-critico-suave text-critico' : tono === 'exito' ? 'bg-exito-suave text-exito' : tono === 'alerta' ? 'bg-alerta-suave text-alerta' : 'bg-secondary-container text-on-secondary-fixed')}>
          <Icono n={icono} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-label-lg text-label-lg text-on-surface truncate">{titulo}</p>
        {detalle && <p className="text-body-sm text-secondary truncate">{detalle}</p>}
      </div>
      {derecha}
    </div>
  );
  return a ? <Link to={a}>{cont}</Link> : cont;
}

export function Aviso({ tono = 'info', icono, titulo, children, accion }) {
  const estilos = { info: 'bg-secondary-container/60 text-on-secondary-fixed', alerta: 'bg-alerta-suave text-[#78350f]', critico: 'bg-critico-suave text-on-error-container', exito: 'bg-exito-suave text-[#14532d]' }[tono];
  return (
    <div className={cx('rounded-xl p-space-md flex items-start gap-3', estilos)}>
      <Icono n={icono ?? { info: 'info', alerta: 'warning', critico: 'error', exito: 'check_circle' }[tono]} className="mt-0.5" />
      <div className="flex-1 text-body-sm">
        {titulo && <p className="font-semibold text-body-md">{titulo}</p>}
        {children}
      </div>
      {accion}
    </div>
  );
}

export function Buscador({ valor, onChange, placeholder = 'Buscar…', className = '' }) {
  return (
    <div className={cx('relative', className)}>
      <Icono n="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
      <Entrada value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-10" type="search" />
    </div>
  );
}

export function SelectorArchivo({ etiqueta = 'Adjuntar archivo', multiple, accept = 'image/*,application/pdf', archivos = [], onChange, capture }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-outline-variant bg-surface hover:bg-surface-container-low cursor-pointer text-secondary text-label-lg">
        <Icono n="add_a_photo" /> {etiqueta}
      </label>
      <input id={id} type="file" className="sr-only" multiple={multiple} accept={accept} capture={capture} onChange={(e) => onChange([...e.target.files])} />
      {archivos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {archivos.map((a, i) => (
            <li key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container text-body-sm">
              <Icono n={a.type === 'application/pdf' ? 'picture_as_pdf' : 'image'} tam={16} /> {a.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Seccion({ titulo, children, accion }) {
  return (
    <div className="mt-space-lg first:mt-0">
      <div className="flex items-center justify-between mb-space-sm">
        <h2 className="font-headline-sm text-headline-sm">{titulo}</h2>
        {accion}
      </div>
      {children}
    </div>
  );
}

export function Dato({ etiqueta, valor, className = '' }) {
  return (
    <div className={className}>
      <p className="font-label-sm text-label-sm uppercase text-secondary">{etiqueta}</p>
      <p className="text-body-md text-on-surface mt-0.5 break-words">{valor ?? '—'}</p>
    </div>
  );
}
