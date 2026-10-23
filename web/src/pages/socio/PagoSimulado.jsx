import { useNavigate, useParams } from 'react-router-dom';
import { useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { Icono, Boton, Aviso } from '../../components/ui.jsx';

/** Checkout de prueba: reemplaza a Mercado Pago cuando no hay credenciales configuradas. */
export default function PagoSimulado() {
  const { id } = useParams();
  const navegar = useNavigate();
  const resolver = useAccion((resultado) => api.post(`/api/mi/pagos/online/${id}/simular`, { resultado }), {
    ok: (r) => (r.estado === 'aprobado' ? 'Pago aprobado y acreditado' : 'Pago rechazado'),
    invalidar: ['/api/mi'],
    alTerminar: (r) => navegar(r.estado === 'aprobado' ? '/estado-de-cuenta' : '/pagos'),
  });
  return (
    <div className="max-w-md mx-auto tarjeta p-space-lg text-center space-y-space-md">
      <span className="w-14 h-14 mx-auto rounded-2xl bg-[#009ee3] text-white flex items-center justify-center"><Icono n="account_balance_wallet" tam={30} /></span>
      <h1 className="text-headline-md">Checkout de prueba</h1>
      <Aviso tono="info">Así se ve el retorno desde Mercado Pago. En producción, la acreditación llega por la notificación firmada de la pasarela.</Aviso>
      <div className="flex flex-wrap gap-2">
        <Boton variante="suave" completo cargando={resolver.isPending} onClick={() => resolver.mutate('rechazado')}>Rechazar</Boton>
        <Boton variante="exito" completo icono="check" cargando={resolver.isPending} onClick={() => resolver.mutate('aprobado')}>Aprobar pago</Boton>
      </div>
    </div>
  );
}
