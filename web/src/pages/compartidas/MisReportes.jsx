import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { useSesion } from '../../lib/sesion.jsx';
import { Tarjeta, Encabezado, Consulta, Modal, Vacio } from '../../components/ui.jsx';
import { FormularioTicket, ListaTickets, DetalleTicket } from '../../components/compartidos.jsx';

/** Reportar un problema y seguir el estado de los reportes propios. */
export default function MisReportes() {
  const q = useDatos('/api/tickets?mios=reportados');
  const { usuario } = useSesion();
  const [abierto, setAbierto] = useState(null);
  return (
    <>
      <Encabezado titulo="Reportar un problema" subtitulo="Qué hay que reparar, en qué sector, con fotos. Seguí el estado de cada reporte." />
      <div className="grid lg:grid-cols-2 gap-space-md">
        <Tarjeta titulo="Nuevo reporte" icono="report" franja><FormularioTicket /></Tarjeta>
        <Tarjeta titulo="Mis reportes" icono="history" cuerpo="p-space-md">
          <Consulta q={q}>{(d) => (d.tickets.length ? <ListaTickets tickets={d.tickets} onAbrir={setAbierto} /> : <Vacio icono="build" titulo="Sin reportes" />)}</Consulta>
        </Tarjeta>
      </div>
      <Modal abierto={!!abierto} titulo="Ticket de mantenimiento" onCerrar={() => setAbierto(null)} ancho="max-w-2xl">
        {abierto && <DetalleTicket id={abierto} usuarioId={usuario.id} />}
      </Modal>
    </>
  );
}
