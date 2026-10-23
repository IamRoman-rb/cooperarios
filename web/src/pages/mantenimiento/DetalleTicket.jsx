import { useParams } from 'react-router-dom';
import { useSesion } from '../../lib/sesion.jsx';
import { Tarjeta, Encabezado } from '../../components/ui.jsx';
import { DetalleTicket as Detalle } from '../../components/compartidos.jsx';

/** Descripción, sector, historial y comentarios, fotos del problema y de la resolución. */
export default function DetalleTicket() {
  const { id } = useParams();
  const { usuario, puede } = useSesion();
  return (
    <div className="max-w-3xl">
      <Encabezado titulo="Detalle del ticket" subtitulo="Marcar como realizado exige adjuntar fotos del trabajo terminado." volver="/mantenimiento/inicio" />
      <Tarjeta><Detalle id={Number(id)} usuarioId={usuario.id} gestor={puede('tickets', 'gestionar')} /></Tarjeta>
    </div>
  );
}
