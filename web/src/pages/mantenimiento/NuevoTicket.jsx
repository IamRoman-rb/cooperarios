import { useNavigate } from 'react-router-dom';
import { Tarjeta, Encabezado } from '../../components/ui.jsx';
import { FormularioTicket } from '../../components/compartidos.jsx';

/** Qué hay que reparar, en qué sector del club, categoría, prioridad y fotos del problema. */
export default function NuevoTicket() {
  const navegar = useNavigate();
  return (
    <div className="max-w-2xl">
      <Encabezado titulo="Nuevo ticket" subtitulo="Si el sector tiene responsable por defecto, se le asigna automáticamente." volver="/tickets" />
      <Tarjeta franja><FormularioTicket alCrear={(r) => navegar(`/tickets/${r.id}`)} /></Tarjeta>
    </div>
  );
}
