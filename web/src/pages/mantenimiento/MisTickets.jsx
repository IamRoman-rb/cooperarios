import { useNavigate } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { fechaLarga, hoy } from '../../lib/formato.js';
import { Boton, Tarjeta, Consulta, Kpi, Grilla, Vacio, Aviso } from '../../components/ui.jsx';
import { ListaTickets } from '../../components/compartidos.jsx';

/** Tickets asignados ordenados por prioridad y vencimiento, y alertas. */
export default function MisTickets() {
  const q = useDatos('/api/tickets?mios=asignados', { refetchInterval: 60_000 });
  const inv = useDatos('/api/inventario');
  const navegar = useNavigate();
  return (
    <Consulta q={q}>
      {(d) => {
        const abiertos = d.tickets.filter((t) => !['resuelto', 'cerrado'].includes(t.estado));
        const bajoMinimo = (inv.data ?? []).filter((i) => i.bajo_minimo);
        return (
          <div className="space-y-space-md">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-label-sm text-label-sm uppercase text-primary-container">Mis tickets del día</p>
                <h1 className="text-headline-lg-mobile capitalize">{fechaLarga(hoy())}</h1>
              </div>
              <Boton icono="add" onClick={() => navegar('/tickets/nuevo')}>Nuevo</Boton>
            </div>
            <Grilla cols="grid-cols-3">
              <Kpi etiqueta="Pendientes" valor={abiertos.length} icono="build" />
              <Kpi etiqueta="Urgentes" valor={abiertos.filter((t) => t.prioridad === 'urgente').length} icono="priority_high" tono="critico" />
              <Kpi etiqueta="Vencidos" valor={abiertos.filter((t) => t.vencido).length} icono="schedule" tono="alerta" />
            </Grilla>
            {abiertos.some((t) => t.prioridad === 'urgente') && <Aviso tono="critico" titulo="Hay tickets urgentes">Riesgo para las personas: resolver en el día.</Aviso>}
            <Tarjeta titulo="Para hacer" icono="task_alt" cuerpo="p-space-md">
              {abiertos.length ? <ListaTickets tickets={abiertos} onAbrir={(id) => navegar(`/tickets/${id}`)} /> : <Vacio icono="celebration" titulo="¡Nada pendiente!" />}
            </Tarjeta>
            {bajoMinimo.length > 0 && (
              <Aviso tono="alerta" titulo={`${bajoMinimo.length} insumos bajo el stock mínimo`} accion={<Boton chico variante="suave" onClick={() => navegar('/inventario')}>Ver</Boton>}>
                {bajoMinimo.slice(0, 4).map((i) => i.nombre).join(', ')}
              </Aviso>
            )}
            <Tarjeta titulo="Resueltos recientes" icono="history" cuerpo="p-space-md">
              {d.tickets.filter((t) => ['resuelto', 'cerrado'].includes(t.estado)).length ? <ListaTickets tickets={d.tickets.filter((t) => ['resuelto', 'cerrado'].includes(t.estado)).slice(0, 5)} onAbrir={(id) => navegar(`/tickets/${id}`)} /> : <p className="text-body-sm text-secondary">Sin trabajos resueltos.</p>}
            </Tarjeta>
          </div>
        );
      }}
    </Consulta>
  );
}
