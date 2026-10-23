import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData, urlArchivo } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { fecha, capitalizar, hoy } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Modal, Campo, Entrada, Selector, Area, SelectorArchivo, Fila, Icono, Vacio } from '../../components/ui.jsx';

/** Reuniones, actas, resoluciones y seguimiento de tareas. */
export default function Actas() {
  const q = useDatos('/api/actas');
  const { puede } = useSesion();
  const gestiona = puede('actas', 'gestionar');
  const [reunion, setReunion] = useState(null);
  const [resolucion, setResolucion] = useState(null);
  const [archivo, setArchivo] = useState([]);
  const guardarReunion = useAccion(() => api.post('/api/actas/reuniones', formData({ ...reunion, subcomision_id: reunion.subcomision_id || undefined }, { acta: archivo[0] })), { ok: 'Reunión guardada', invalidar: ['/api/actas'], alTerminar: () => { setReunion(null); setArchivo([]); } });
  const guardarResolucion = useAccion(() => api.post('/api/actas/resoluciones', { ...resolucion, reunion_id: Number(resolucion.reunion_id), responsable_id: resolucion.responsable_id ? Number(resolucion.responsable_id) : null, vence_en: resolucion.vence_en || null }), { ok: 'Resolución guardada', invalidar: ['/api/actas', '/api/tablero'], alTerminar: () => setResolucion(null) });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Actas y resoluciones" subtitulo="Reuniones de Comisión Directiva y subcomisiones, con seguimiento de cada resolución."
            acciones={gestiona && <Boton icono="add" onClick={() => setReunion({ tipo: 'ordinaria', fecha: hoy(), estado: 'convocada', orden_del_dia: '', subcomision_id: '' })}>Nueva reunión</Boton>} />
          <div className="grid lg:grid-cols-3 gap-space-md">
            <div className="lg:col-span-2 space-y-space-md">
              {d.reuniones.length === 0 ? <Vacio icono="history_edu" titulo="Sin reuniones" /> : d.reuniones.map((r) => (
                <Tarjeta key={r.id} cuerpo="p-space-md space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-headline-sm text-headline-sm">Reunión {r.tipo}{r.subcomision ? ` · ${r.subcomision}` : ''}</p>
                      <p className="text-body-sm text-secondary">{fecha(r.fecha)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Estado valor={r.estado} />
                      {gestiona && <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setReunion({ ...r, subcomision_id: r.subcomision_id ?? '', orden_del_dia: r.orden_del_dia ?? '' })} />}
                    </div>
                  </div>
                  {r.orden_del_dia && <p className="text-body-md whitespace-pre-line p-3 rounded-xl bg-surface">{r.orden_del_dia}</p>}
                  {r.acta_archivo && <a href={urlArchivo(r.acta_archivo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-label-md text-primary-container font-semibold"><Icono n="description" tam={18} /> Acta firmada</a>}
                  <div className="space-y-2">
                    {r.resoluciones.map((x) => (
                      <button key={x.id} disabled={!gestiona} onClick={() => setResolucion({ ...x, responsable_id: x.responsable_id ?? '', vence_en: x.vence_en ?? '' })} className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-container-low">
                        <Icono n="gavel" className="text-secondary mt-0.5" />
                        <div className="flex-1 min-w-0"><p className="text-body-md"><strong>{x.numero}</strong> {x.texto}</p><p className="text-body-sm text-secondary">{x.responsable ?? 'Sin responsable'}{x.vence_en ? ` · vence ${fecha(x.vence_en)}` : ''}</p></div>
                        <Estado valor={x.estado} />
                      </button>
                    ))}
                    {gestiona && <Boton chico variante="suave" icono="add" onClick={() => setResolucion({ reunion_id: r.id, numero: '', texto: '', estado: 'pendiente', responsable_id: '', vence_en: '' })}>Resolución</Boton>}
                  </div>
                </Tarjeta>
              ))}
            </div>
            <Tarjeta titulo="Comisión Directiva" icono="groups" cuerpo="p-space-md space-y-2">
              {d.directivos.map((x) => <Fila key={x.id} icono="person" titulo={x.nombre} detalle={`${x.cargo} desde ${fecha(x.desde)}`} />)}
            </Tarjeta>
          </div>
          <Modal abierto={!!reunion} titulo={reunion?.id ? 'Editar reunión' : 'Nueva reunión'} onCerrar={() => setReunion(null)} pie={<Boton cargando={guardarReunion.isPending} onClick={() => guardarReunion.mutate()}>Guardar</Boton>}>
            {reunion && (
              <div className="grid sm:grid-cols-2 gap-space-md">
                <Campo etiqueta="Tipo"><Selector value={reunion.tipo} onChange={(e) => setReunion({ ...reunion, tipo: e.target.value })} opciones={['ordinaria', 'extraordinaria', 'subcomision', 'asamblea'].map((t) => ({ value: t, label: capitalizar(t) }))} /></Campo>
                <Campo etiqueta="Fecha"><Entrada type="date" value={reunion.fecha} onChange={(e) => setReunion({ ...reunion, fecha: e.target.value })} /></Campo>
                {reunion.tipo === 'subcomision' && <Campo etiqueta="Subcomisión" className="sm:col-span-2"><Selector value={reunion.subcomision_id} onChange={(e) => setReunion({ ...reunion, subcomision_id: e.target.value })} opciones={d.subcomisiones.map((s) => ({ value: s.id, label: s.nombre }))} /></Campo>}
                <Campo etiqueta="Estado" className="sm:col-span-2"><Selector value={reunion.estado} onChange={(e) => setReunion({ ...reunion, estado: e.target.value })} opciones={[{ value: 'convocada', label: 'Convocada' }, { value: 'realizada', label: 'Realizada' }, { value: 'acta_aprobada', label: 'Acta aprobada' }]} /></Campo>
                <Campo etiqueta="Orden del día" className="sm:col-span-2"><Area value={reunion.orden_del_dia} onChange={(e) => setReunion({ ...reunion, orden_del_dia: e.target.value })} rows={5} /></Campo>
                <div className="sm:col-span-2"><SelectorArchivo etiqueta="Acta escaneada (PDF)" accept="application/pdf,image/*" archivos={archivo} onChange={setArchivo} /></div>
              </div>
            )}
          </Modal>
          <Modal abierto={!!resolucion} titulo="Resolución" onCerrar={() => setResolucion(null)} pie={<Boton cargando={guardarResolucion.isPending} onClick={() => guardarResolucion.mutate()}>Guardar</Boton>}>
            {resolucion && (
              <div className="grid sm:grid-cols-2 gap-space-md">
                <Campo etiqueta="Número"><Entrada value={resolucion.numero ?? ''} onChange={(e) => setResolucion({ ...resolucion, numero: e.target.value })} placeholder="Res. 17/2026" /></Campo>
                <Campo etiqueta="Estado"><Selector value={resolucion.estado} onChange={(e) => setResolucion({ ...resolucion, estado: e.target.value })} opciones={[{ value: 'pendiente', label: 'Pendiente' }, { value: 'en_curso', label: 'En curso' }, { value: 'cumplida', label: 'Cumplida' }]} /></Campo>
                <Campo etiqueta="Texto" className="sm:col-span-2"><Area value={resolucion.texto} onChange={(e) => setResolucion({ ...resolucion, texto: e.target.value })} /></Campo>
                <Campo etiqueta="Responsable"><Selector value={resolucion.responsable_id} onChange={(e) => setResolucion({ ...resolucion, responsable_id: e.target.value })} vacio="—" opciones={d.directivos.map((x) => ({ value: x.persona_id, label: `${x.nombre} (${x.cargo})` }))} /></Campo>
                <Campo etiqueta="Vence"><Entrada type="date" value={resolucion.vence_en} onChange={(e) => setResolucion({ ...resolucion, vence_en: e.target.value })} /></Campo>
              </div>
            )}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
