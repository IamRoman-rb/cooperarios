// Piezas reutilizadas por varios portales.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, formData, urlArchivo } from '../lib/api.js';
import { useDatos, useAccion } from '../lib/datos.js';
import { prepararImagenes } from '../lib/imagen.js';
import { pesos, fecha, fechaHora, nombre, relativa, capitalizar } from '../lib/formato.js';
import { Boton, Campo, Entrada, Selector, Area, Modal, SelectorArchivo, Estado, Icono, Aviso, Consulta, Dato, cx } from './ui.jsx';

export const CATEGORIAS_TICKET = [
  { value: 'electricidad', label: 'Electricidad' }, { value: 'plomeria', label: 'Plomería' }, { value: 'pileta', label: 'Pileta' },
  { value: 'limpieza', label: 'Limpieza' }, { value: 'carpinteria', label: 'Carpintería' }, { value: 'pintura', label: 'Pintura' },
  { value: 'climatizacion', label: 'Climatización' }, { value: 'otro', label: 'Otro' },
];
export const PRIORIDADES = [
  { value: 'urgente', label: 'Urgente (riesgo para las personas) — en el día' }, { value: 'alta', label: 'Alta — 48 horas' },
  { value: 'media', label: 'Media — 7 días' }, { value: 'baja', label: 'Baja — 30 días' },
];

/** Alta de ticket de mantenimiento: qué reparar, en qué sector, categoría, prioridad y fotos. */
export function FormularioTicket({ alCrear }) {
  const sectores = useDatos('/api/sectores');
  const [fotos, setFotos] = useState([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { prioridad: 'media', categoria: 'otro' } });
  const crear = useAccion(async (d) => api.post('/api/tickets', formData(d, { fotos: await prepararImagenes(fotos) })), {
    ok: 'Reporte enviado. Te avisamos cuando se resuelva.', invalidar: ['/api/tickets', '/api/socio/solicitudes'],
    alTerminar: (r) => { reset(); setFotos([]); alCrear?.(r); },
  });
  return (
    <form onSubmit={handleSubmit((d) => crear.mutate(d))} className="grid sm:grid-cols-2 gap-space-md">
      <Campo etiqueta="¿Qué hay que reparar?" className="sm:col-span-2" error={errors.titulo && 'Describilo en pocas palabras'}>
        <Entrada {...register('titulo', { required: true, minLength: 4 })} placeholder="Ej.: pérdida en la ducha 3 del vestuario" />
      </Campo>
      <Campo etiqueta="Sector del club" error={errors.sector_id && 'Elegí el sector'}>
        <Selector {...register('sector_id', { required: true })} vacio="Elegí un sector" opciones={(sectores.data ?? []).map((s) => ({ value: s.id, label: s.nombre }))} />
      </Campo>
      <Campo etiqueta="Categoría"><Selector {...register('categoria')} opciones={CATEGORIAS_TICKET} /></Campo>
      <Campo etiqueta="Prioridad" className="sm:col-span-2"><Selector {...register('prioridad')} opciones={PRIORIDADES} /></Campo>
      <Campo etiqueta="Descripción" className="sm:col-span-2" error={errors.descripcion && 'Agregá un detalle'}>
        <Area {...register('descripcion', { required: true, minLength: 5 })} placeholder="Dónde está, desde cuándo, cómo afecta al uso…" />
      </Campo>
      <div className="sm:col-span-2 space-y-2">
        <SelectorArchivo etiqueta="Fotos del problema (opcional)" multiple accept="image/*" capture="environment" archivos={fotos} onChange={setFotos} />
        <p className="text-body-sm text-secondary">Por favor, no fotografíes personas, en especial menores. Las fotos se reducen y se les quita la ubicación antes de enviarse.</p>
      </div>
      <Boton type="submit" cargando={crear.isPending} icono="send" className="sm:col-span-2">Enviar reporte</Boton>
    </form>
  );
}

/** Recibo o comprobante imprimible. */
export function Comprobante({ id, url, onCerrar }) {
  const q = useDatos(id ? url ?? `/api/socio/comprobantes/${id}` : null);
  return (
    <Modal abierto={!!id} titulo="Comprobante" onCerrar={onCerrar} pie={<Boton icono="print" variante="suave" onClick={() => window.print()}>Imprimir</Boton>}>
      <Consulta q={q}>
        {(c) => (
          <div className="space-y-space-md">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-surface-container">
              <div>
                <p className="font-headline-sm text-headline-sm text-primary">Club Los Cooperarios</p>
                <p className="text-body-sm text-secondary">Andrade 3052, Quilmes Oeste</p>
              </div>
              <div className="text-right">
                <p className="etiqueta">{c.tipo === 'nota_credito' ? 'Nota de crédito' : 'Recibo'}</p>
                <p className="font-bold tabular-nums">{c.numero}</p>
                <p className="text-body-sm text-secondary">{fecha(c.fecha)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Dato etiqueta="Recibimos de" valor={nombre(c.persona)} />
              <Dato etiqueta="DNI" valor={c.persona?.dni} />
              <Dato etiqueta="Medio" valor={capitalizar(c.pago?.medio)} />
              <Dato etiqueta="Referencia" valor={c.pago?.referencia} />
            </div>
            <table className="w-full text-body-sm">
              <tbody>
                {c.items.map((it, i) => (
                  <tr key={i} className="border-b border-surface-container"><td className="py-2">{it.descripcion}</td><td className="py-2 text-right tabular-nums">{pesos(it.importe)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td className="pt-3 font-bold">Total</td><td className="pt-3 text-right font-bold tabular-nums">{pesos(c.total)}</td></tr></tfoot>
            </table>
            {!c.cae && <p className="text-body-sm text-secondary">Comprobante interno. La factura electrónica ARCA se incorpora en la fase 5.</p>}
          </div>
        )}
      </Consulta>
    </Modal>
  );
}

/** Chips para elegir a qué integrante del grupo familiar se aplica la acción. */
export function SelectorFamilia({ familia = [], valor, onChange }) {
  if (familia.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto sin-scroll pb-1 mb-space-md" role="radiogroup" aria-label="Integrante">
      {familia.map((p) => (
        <button key={p.id} role="radio" aria-checked={valor === p.id} onClick={() => onChange(p.id)}
          className={cx('flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-full border transition-all whitespace-nowrap', valor === p.id ? 'bg-primary-container text-on-primary border-primary-container' : 'bg-surface-container-lowest border-surface-container text-on-surface')}>
          <span className={cx('w-7 h-7 rounded-full flex items-center justify-center text-label-sm', valor === p.id ? 'bg-white/20' : 'bg-secondary-container')}>{p.nombre?.[0]}</span>
          <span className="text-label-lg">{p.yo ? 'Yo' : p.nombre}</span>
          {p.edad != null && p.edad < 18 && <span className="text-label-sm opacity-80">{p.edad} años</span>}
        </button>
      ))}
    </div>
  );
}

const ACCIONES_TICKET = {
  nuevo: [{ accion: 'asignar', texto: 'Asignar', icono: 'person_add', rol: 'gestor' }],
  asignado: [{ accion: 'iniciar', texto: 'Empezar trabajo', icono: 'play_arrow', rol: 'responsable' }, { accion: 'asignar', texto: 'Reasignar', icono: 'swap_horiz', rol: 'gestor' }],
  en_curso: [{ accion: 'resolver', texto: 'Marcar como realizado', icono: 'task_alt', rol: 'responsable' }],
  resuelto: [{ accion: 'cerrar', texto: 'Verificar y cerrar', icono: 'verified', rol: 'verificador' }, { accion: 'reabrir', texto: 'Reabrir', icono: 'replay', rol: 'verificador' }],
  cerrado: [{ accion: 'reabrir', texto: 'Reabrir', icono: 'replay', rol: 'verificador' }],
};

/** Detalle de un ticket con fotos, historial, comentarios y las acciones permitidas al usuario. */
export function DetalleTicket({ id, usuarioId, gestor }) {
  const q = useDatos(`/api/tickets/${id}`);
  const [accion, setAccion] = useState(null);
  const [comentario, setComentario] = useState('');
  const [asignado, setAsignado] = useState('');
  const [costo, setCosto] = useState('');
  const [fotos, setFotos] = useState([]);
  const personal = useDatos(gestor ? '/api/tickets?estado=__' : null);
  const ejecutar = useAccion((v) => api.post(`/api/tickets/${id}/${v.accion}`, v.datos), {
    ok: (r) => `Ticket ${capitalizar(r.estado)}`, invalidar: ['/api/tickets'], alTerminar: () => { setAccion(null); setComentario(''); },
  });
  const subir = useAccion(async (tipo) => api.post(`/api/tickets/${id}/fotos`, formData({ tipo }, { fotos: await prepararImagenes(fotos) })), {
    ok: 'Fotos agregadas', invalidar: ['/api/tickets'], alTerminar: () => setFotos([]),
  });
  const comentar = useAccion((texto) => api.post(`/api/tickets/${id}/comentarios`, { texto }), { invalidar: [`/api/tickets/${id}`], alTerminar: () => setComentario('') });

  return (
    <Consulta q={q}>
      {(t) => {
        const roles = { gestor, responsable: t.asignado_a === usuarioId || gestor, verificador: t.reportado_por === usuarioId || gestor };
        const acciones = (ACCIONES_TICKET[t.estado] ?? []).filter((a) => roles[a.rol]);
        const fotosProblema = t.fotos.filter((f) => f.tipo === 'problema');
        const fotosResolucion = t.fotos.filter((f) => f.tipo === 'resolucion');
        return (
          <div className="space-y-space-md">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-label-md text-secondary">{t.codigo}</span>
              <Estado valor={t.estado} />
              <Estado valor={t.prioridad} tono={t.prioridad === 'urgente' ? 'critico' : t.prioridad === 'alta' ? 'alerta' : 'neutro'} />
              {t.vencido && <Estado tono="critico" texto="Vencido" icono="schedule" />}
            </div>
            <div>
              <h3 className="text-headline-md">{t.titulo}</h3>
              <p className="text-body-md text-secondary mt-1 whitespace-pre-line">{t.descripcion}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Dato etiqueta="Sector" valor={t.sector} />
              <Dato etiqueta="Categoría" valor={capitalizar(t.categoria)} />
              <Dato etiqueta="Reportó" valor={t.reportante} />
              <Dato etiqueta="Responsable" valor={t.responsable ?? 'Sin asignar'} />
              <Dato etiqueta="Creado" valor={fechaHora(t.creado_en)} />
              <Dato etiqueta="Vence" valor={fechaHora(t.vence_en)} />
              {t.costo > 0 && <Dato etiqueta="Costo" valor={pesos(t.costo)} />}
            </div>
            <GaleriaFotos titulo="Fotos del problema" fotos={fotosProblema} />
            <GaleriaFotos titulo="Fotos del trabajo terminado" fotos={fotosResolucion} vacio={['asignado', 'en_curso'].includes(t.estado) ? 'Para marcarlo como realizado hay que adjuntar al menos una foto.' : null} />

            {roles.responsable && ['asignado', 'en_curso'].includes(t.estado) && (
              <div className="p-3 rounded-xl bg-surface space-y-2">
                <SelectorArchivo etiqueta="Agregar fotos del trabajo terminado" multiple accept="image/*" capture="environment" archivos={fotos} onChange={setFotos} />
                {fotos.length > 0 && <Boton chico icono="upload" cargando={subir.isPending} onClick={() => subir.mutate('resolucion')}>Subir {fotos.length} foto(s)</Boton>}
              </div>
            )}

            {acciones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {acciones.map((a) => <Boton key={a.accion} icono={a.icono} variante={a.accion === 'reabrir' ? 'secundario' : 'primario'} onClick={() => setAccion(a.accion)}>{a.texto}</Boton>)}
              </div>
            )}

            <div>
              <p className="etiqueta mb-2">Historial y comentarios</p>
              <ol className="space-y-2">
                {[...t.historial.map((h) => ({ ...h, tipo: 'estado' })), ...t.comentarios.map((c) => ({ ...c, tipo: 'comentario' }))]
                  .sort((a, b) => a.creado_en.localeCompare(b.creado_en)).map((e, i) => (
                    <li key={i} className="flex gap-2 text-body-sm">
                      <Icono n={e.tipo === 'estado' ? 'swap_horiz' : 'chat'} className="text-secondary mt-0.5" tam={16} />
                      <div>
                        {e.tipo === 'estado' ? <span>Estado: <strong>{capitalizar(e.estado_nuevo)}</strong></span> : <span className="whitespace-pre-line">{e.texto}</span>}
                        <span className="text-secondary"> · {e.autor ?? 'Sistema'} · {relativa(e.creado_en)}</span>
                      </div>
                    </li>
                  ))}
              </ol>
              <div className="flex gap-2 mt-3">
                <Entrada value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escribí un comentario" />
                <Boton variante="suave" icono="send" disabled={!comentario.trim()} onClick={() => comentar.mutate(comentario)} aria-label="Comentar" />
              </div>
            </div>

            <Modal abierto={!!accion} titulo={ACCIONES_TICKET[t.estado]?.find((a) => a.accion === accion)?.texto ?? ''} onCerrar={() => setAccion(null)}
              pie={<><Boton variante="suave" onClick={() => setAccion(null)}>Cancelar</Boton>
                <Boton cargando={ejecutar.isPending} onClick={() => ejecutar.mutate({ accion, datos: { comentario: comentario || undefined, asignado_a: asignado || undefined, costo: costo ? Math.round(Number(costo) * 100) : undefined } })}>Confirmar</Boton></>}>
              <div className="space-y-space-md">
                {accion === 'asignar' && (
                  <Campo etiqueta="Responsable">
                    <Selector value={asignado} onChange={(e) => setAsignado(e.target.value)} vacio="Elegí a quién" opciones={(personal.data?.personal ?? []).map((p) => ({ value: p.id, label: p.nombre }))} />
                  </Campo>
                )}
                {accion === 'resolver' && (
                  <>
                    {fotosResolucion.length === 0 && <Aviso tono="alerta" titulo="Falta la foto del trabajo terminado">Subila antes de confirmar.</Aviso>}
                    <Campo etiqueta="Costo de materiales (opcional, $)"><Entrada type="number" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} /></Campo>
                  </>
                )}
                <Campo etiqueta={accion === 'reabrir' ? '¿Por qué no está conforme?' : accion === 'resolver' ? 'Comentario del trabajo realizado' : 'Comentario (opcional)'}>
                  <Area value={comentario} onChange={(e) => setComentario(e.target.value)} />
                </Campo>
              </div>
            </Modal>
          </div>
        );
      }}
    </Consulta>
  );
}

function GaleriaFotos({ titulo, fotos, vacio }) {
  const [ampliada, setAmpliada] = useState(null);
  if (!fotos.length && !vacio) return null;
  return (
    <div>
      <p className="etiqueta mb-2">{titulo}</p>
      {fotos.length === 0 ? <p className="text-body-sm text-secondary">{vacio}</p> : (
        <div className="flex gap-2 overflow-x-auto sin-scroll">
          {fotos.map((f) => (
            <button key={f.id} onClick={() => setAmpliada(f)} className="shrink-0">
              <img src={urlArchivo(f.archivo)} alt={titulo} className="w-24 h-24 rounded-xl object-cover bg-surface-container" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <Modal abierto={!!ampliada} titulo={titulo} onCerrar={() => setAmpliada(null)} ancho="max-w-3xl">
        {ampliada && <img src={urlArchivo(ampliada.archivo)} alt={titulo} className="w-full rounded-xl" />}
      </Modal>
    </div>
  );
}

/** Lista de tickets en tarjetas compactas. */
export function ListaTickets({ tickets, onAbrir }) {
  return (
    <div className="space-y-2">
      {tickets.map((t) => (
        <button key={t.id} onClick={() => onAbrir(t.id)} className="w-full text-left p-3 rounded-xl bg-surface-container-lowest border border-surface-container hover:shadow-n1 flex items-start gap-3">
          <span className={cx('w-1.5 self-stretch rounded-full', t.prioridad === 'urgente' ? 'bg-critico' : t.prioridad === 'alta' ? 'bg-alerta' : t.prioridad === 'media' ? 'bg-secondary' : 'bg-surface-dim')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-label-sm text-secondary">{t.codigo}</span>
              <Estado valor={t.estado} />
              {t.vencido ? <Estado tono="critico" texto="Vencido" /> : null}
            </div>
            <p className="font-label-lg text-label-lg mt-1 truncate">{t.titulo}</p>
            <p className="text-body-sm text-secondary truncate">{t.sector}{t.responsable ? ` · ${t.responsable}` : ''} · {relativa(t.creado_en)}</p>
          </div>
          {t.fotos > 0 && <span className="flex items-center gap-0.5 text-label-sm text-secondary"><Icono n="photo_camera" tam={16} />{t.fotos}</span>}
        </button>
      ))}
    </div>
  );
}
