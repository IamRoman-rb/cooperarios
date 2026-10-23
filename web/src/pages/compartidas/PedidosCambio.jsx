// Pedidos de nuevas secciones, roles o permisos (propuesta 12.5).
// Directiva y delegados los inician; Sistemas analiza; la Directiva decide con motivo; Sistemas implementa.
import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { fecha, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Campo, Entrada, Selector, Area, Modal, Vacio, Pestanas, Aviso, DialogoMotivo } from '../../components/ui.jsx';

const TIPOS = [{ value: 'nueva_seccion', label: 'Nueva sección' }, { value: 'nuevo_rol', label: 'Nuevo rol' }, { value: 'cambio_permisos', label: 'Cambio de permisos' }];
const PASOS = ['recibido', 'en_analisis', 'aprobado', 'implementado'];

export default function PedidosCambio({ decide, tecnico }) {
  const q = useDatos('/api/pedidos-cambio');
  const { roles, usuario } = useSesion();
  const ambito = roles.filter((r) => r.codigo === 'subcomision');
  const [nuevo, setNuevo] = useState(null);
  const [filtro, setFiltro] = useState('abiertos');
  const [decision, setDecision] = useState(null);
  const crear = useAccion(() => api.post('/api/pedidos-cambio', { ...nuevo, actividad_id: nuevo.actividad_id || null }), { ok: 'Pedido registrado', invalidar: ['/api/pedidos-cambio'], alTerminar: () => setNuevo(null) });
  const cambiar = useAccion(({ id, ...d }) => api.post(`/api/pedidos-cambio/${id}/estado`, d), { ok: 'Pedido actualizado', invalidar: ['/api/pedidos-cambio'], alTerminar: () => setDecision(null) });

  return (
    <>
      <Encabezado titulo={decide ? 'Pedidos de cambio' : tecnico ? 'Pedidos para implementar' : 'Pedir una nueva sección, rol o permiso'}
        subtitulo={decide ? 'Iniciá, priorizá, aprobá o rechazá con motivo, y seguí el avance.' : 'Describí la necesidad para tu actividad y seguí el estado del pedido.'}
        acciones={!tecnico && <Boton icono="add" onClick={() => setNuevo({ tipo: 'nueva_seccion', titulo: '', justificacion: '', prioridad: 'media', actividad_id: ambito[0]?.actividad_id ?? '' })}>Nuevo pedido</Boton>} />
      <Aviso tono="info">Nadie puede otorgarse permisos a sí mismo: los cambios los ejecuta Administración o Sistemas una vez aprobados por la Comisión Directiva, y quedan en auditoría.</Aviso>
      <div className="mt-space-md" />
      <Pestanas valor={filtro} onChange={setFiltro} opciones={[{ value: 'abiertos', label: 'En curso' }, { value: 'cerrados', label: 'Resueltos' }]} />
      <Consulta q={q}>
        {(lista) => {
          const filas = lista.filter((p) => (filtro === 'abiertos' ? ['recibido', 'en_analisis', 'aprobado', 'diferido'].includes(p.estado) : ['rechazado', 'implementado'].includes(p.estado)));
          return filas.length === 0 ? <Vacio icono="change_circle" titulo="Sin pedidos" /> : (
            <div className="space-y-3">
              {filas.map((p) => (
                <Tarjeta key={p.id} cuerpo="p-space-md space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Estado tono="info" texto={TIPOS.find((t) => t.value === p.tipo)?.label} />
                        <Estado valor={p.prioridad} tono={p.prioridad === 'alta' ? 'critico' : p.prioridad === 'media' ? 'alerta' : 'neutro'} texto={`Prioridad ${p.prioridad}`} />
                        {p.actividad && <Estado tono="neutro" texto={p.actividad} />}
                      </div>
                      <h3 className="font-headline-sm text-headline-sm mt-2">{p.titulo}</h3>
                      <p className="text-body-sm text-secondary">{p.solicitante} · {capitalizar(p.origen)} · {fecha(p.creado_en)}</p>
                    </div>
                    <Estado valor={p.estado} />
                  </div>
                  <p className="text-body-md whitespace-pre-line">{p.justificacion}</p>
                  {p.estado !== 'rechazado' && (
                    <ol className="flex items-center gap-1">
                      {PASOS.map((paso, i) => {
                        const actual = Math.max(PASOS.indexOf(p.estado), p.estado === 'diferido' ? 1 : 0);
                        return <li key={paso} className="flex-1"><div className={`h-1.5 rounded-full ${i <= actual ? 'bg-primary-container' : 'bg-surface-container'}`} /><p className="text-[10px] uppercase text-secondary mt-1">{capitalizar(paso)}</p></li>;
                      })}
                    </ol>
                  )}
                  {p.motivo_resolucion && <Aviso tono={p.estado === 'rechazado' ? 'critico' : 'info'} titulo={`Resolución${p.resolvio ? ` (${p.resolvio})` : ''}`}>{p.motivo_resolucion}</Aviso>}
                  <div className="flex flex-wrap gap-2">
                    {decide && ['recibido', 'en_analisis', 'diferido'].includes(p.estado) && p.solicitante_id !== usuario.id && <>
                      <Boton chico variante="exito" icono="check" onClick={() => setDecision({ id: p.id, estado: 'aprobado' })}>Aprobar</Boton>
                      <Boton chico variante="suave" icono="schedule" onClick={() => setDecision({ id: p.id, estado: 'diferido' })}>Diferir</Boton>
                      <Boton chico variante="fantasma" onClick={() => setDecision({ id: p.id, estado: 'rechazado' })}>Rechazar</Boton>
                    </>}
                    {tecnico && p.estado === 'recibido' && <Boton chico variante="suave" icono="search" onClick={() => cambiar.mutate({ id: p.id, estado: 'en_analisis' })}>Tomar para análisis</Boton>}
                    {tecnico && p.estado === 'aprobado' && <Boton chico icono="rocket_launch" onClick={() => cambiar.mutate({ id: p.id, estado: 'implementado', motivo: 'Implementado y publicado. Matriz de permisos actualizada.' })}>Marcar implementado</Boton>}
                  </div>
                </Tarjeta>
              ))}
            </div>
          );
        }}
      </Consulta>
      <Modal abierto={!!nuevo} titulo="Nuevo pedido" onCerrar={() => setNuevo(null)} ancho="max-w-xl"
        pie={<Boton cargando={crear.isPending} disabled={!nuevo || nuevo.titulo.length < 5 || nuevo.justificacion.length < 20} onClick={() => crear.mutate()}>Enviar pedido</Boton>}>
        {nuevo && (
          <div className="space-y-space-md">
            <Campo etiqueta="Tipo"><Selector value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} opciones={TIPOS} /></Campo>
            {ambito.length > 0 && <Campo etiqueta="Actividad"><Selector value={nuevo.actividad_id} onChange={(e) => setNuevo({ ...nuevo, actividad_id: e.target.value })} opciones={ambito.map((r) => ({ value: r.actividad_id, label: r.actividad }))} /></Campo>}
            <Campo etiqueta="Título"><Entrada value={nuevo.titulo} onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })} /></Campo>
            <Campo etiqueta="Justificación" ayuda="Qué se necesita, quién lo necesita, qué rol o sección afecta y por qué (mínimo 20 caracteres)."><Area value={nuevo.justificacion} onChange={(e) => setNuevo({ ...nuevo, justificacion: e.target.value })} rows={5} /></Campo>
            <Campo etiqueta="Prioridad"><Selector value={nuevo.prioridad} onChange={(e) => setNuevo({ ...nuevo, prioridad: e.target.value })} opciones={['alta', 'media', 'baja'].map((x) => ({ value: x, label: capitalizar(x) }))} /></Campo>
          </div>
        )}
      </Modal>
      <DialogoMotivo abierto={!!decision} titulo={decision ? `${capitalizar(decision.estado)}: motivo (se asienta en actas)` : ''} onCerrar={() => setDecision(null)}
        variante={decision?.estado === 'aprobado' ? 'exito' : 'peligro'} boton="Confirmar" cargando={cambiar.isPending} onConfirmar={(motivo) => cambiar.mutate({ ...decision, motivo })} />
    </>
  );
}
