// Gestor de tickets: tablero por estado y lista con filtros por sector, prioridad y responsable.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { useSesion } from '../../lib/sesion.jsx';
import { capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Selector, Pestanas, Modal, Kpi, Grilla, Vacio } from '../../components/ui.jsx';
import { ListaTickets, DetalleTicket, CATEGORIAS_TICKET, FormularioTicket } from '../../components/compartidos.jsx';
import { BarrasH } from '../../components/graficos.jsx';

const COLUMNAS = ['nuevo', 'asignado', 'en_curso', 'resuelto', 'cerrado'];

export default function GestorTickets({ modo }) {
  const [filtros, setFiltros] = useState({ sector_id: '', prioridad: '', categoria: '', asignado_a: '' });
  const [vista, setVista] = useState('tablero');
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
  const q = useDatos(`/api/tickets?${params}`);
  const sectores = useDatos('/api/sectores');
  const abrir = (id) => (modo === 'mantenimiento' && window.innerWidth < 768 ? navegar(`/tickets/${id}`) : setAbierto(id));
  const set = (k) => (e) => setFiltros({ ...filtros, [k]: e.target.value });

  return (
    <>
      <Encabezado titulo={modo === 'admin' ? 'Tickets de mantenimiento' : 'Gestor de tickets'} subtitulo="Asignar, priorizar, verificar el cierre con fotos y reabrir."
        acciones={<Boton icono="add" onClick={() => (modo === 'mantenimiento' ? navegar('/tickets/nuevo') : setNuevo(true))}>Nuevo ticket</Boton>} />
      <Consulta q={q}>
        {(d) => (
          <>
            {d.indicadores && (
              <Grilla className="mb-space-md">
                <Kpi etiqueta="Abiertos" valor={d.tickets.filter((t) => !['resuelto', 'cerrado'].includes(t.estado)).length} icono="build" />
                <Kpi etiqueta="Vencidos" valor={d.tickets.filter((t) => t.vencido).length} icono="schedule" tono="critico" />
                <Kpi etiqueta="Para verificar" valor={d.tickets.filter((t) => t.estado === 'resuelto').length} icono="fact_check" tono="alerta" />
                <Kpi etiqueta="Tiempo medio" valor={d.indicadores.tiempo_medio_horas ? `${d.indicadores.tiempo_medio_horas} h` : '—'} icono="timer" detalle="de resolución" />
              </Grilla>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-space-md">
              <Selector value={filtros.sector_id} onChange={set('sector_id')} vacio="Todos los sectores" opciones={(sectores.data ?? []).map((s) => ({ value: s.id, label: s.nombre }))} />
              <Selector value={filtros.prioridad} onChange={set('prioridad')} vacio="Toda prioridad" opciones={['urgente', 'alta', 'media', 'baja'].map((p) => ({ value: p, label: capitalizar(p) }))} />
              <Selector value={filtros.categoria} onChange={set('categoria')} vacio="Toda categoría" opciones={CATEGORIAS_TICKET} />
              <Selector value={filtros.asignado_a} onChange={set('asignado_a')} vacio="Todo responsable" opciones={d.personal.map((p) => ({ value: p.id, label: p.nombre }))} />
            </div>
            <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'tablero', label: 'Tablero', icono: 'view_kanban' }, { value: 'lista', label: 'Lista', icono: 'list' }, ...(d.indicadores ? [{ value: 'indicadores', label: 'Indicadores', icono: 'bar_chart' }] : [])]} />
            {vista === 'tablero' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {COLUMNAS.map((c) => {
                  const lista = d.tickets.filter((t) => t.estado === c);
                  return (
                    <div key={c} className="bg-surface-container-low rounded-xl p-2">
                      <p className="px-1 pb-2 flex items-center justify-between font-label-md text-label-md uppercase text-graphite">{capitalizar(c)}<span className="px-2 rounded-full bg-surface-container-lowest">{lista.length}</span></p>
                      {lista.length ? <ListaTickets tickets={lista} onAbrir={abrir} /> : <p className="text-body-sm text-secondary p-3 text-center">—</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {vista === 'lista' && <Tarjeta cuerpo="p-space-md">{d.tickets.length ? <ListaTickets tickets={d.tickets} onAbrir={abrir} /> : <Vacio titulo="Sin tickets" />}</Tarjeta>}
            {vista === 'indicadores' && d.indicadores && (
              <div className="grid lg:grid-cols-2 gap-space-md">
                <Tarjeta titulo="Abiertos por sector" icono="apartment"><BarrasH moneda={false} datos={d.indicadores.por_sector.map((s) => ({ etiqueta: s.sector, valor: s.abiertos, detalle: `${s.abiertos} (${s.vencidos} vencidos)` }))} /></Tarjeta>
                <Tarjeta titulo="Por categoría" icono="category"><BarrasH moneda={false} datos={d.indicadores.por_categoria.map((s) => ({ etiqueta: capitalizar(s.categoria), valor: s.n }))} /></Tarjeta>
              </div>
            )}
          </>
        )}
      </Consulta>
      <Modal abierto={!!abierto} titulo="Ticket" onCerrar={() => setAbierto(null)} ancho="max-w-2xl">
        {abierto && <DetalleTicket id={abierto} usuarioId={usuario.id} gestor />}
      </Modal>
      <Modal abierto={nuevo} titulo="Nuevo ticket" onCerrar={() => setNuevo(false)} ancho="max-w-2xl">
        <FormularioTicket alCrear={() => setNuevo(false)} />
      </Modal>
    </>
  );
}
