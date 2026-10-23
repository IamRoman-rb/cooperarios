import { useDatos } from '../../lib/datos.js';
import { relativa, capitalizar } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Estado, Tabla, Dato, Aviso } from '../../components/ui.jsx';

/** Estado de Mercado Pago, correo y registro técnico de notificaciones, sin datos de personas. */
export default function Integraciones() {
  const q = useDatos('/api/sistema/integraciones');
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Integraciones" subtitulo="Pasarela de pagos, correo y notificaciones. Sin datos de personas." />
          <div className="grid lg:grid-cols-2 gap-space-md">
            <Tarjeta titulo="Mercado Pago" icono="account_balance_wallet" accion={<Estado tono={d.mercado_pago.modo === 'simulado' ? 'alerta' : 'exito'} texto={capitalizar(d.mercado_pago.modo)} />} cuerpo="p-space-md space-y-space-md">
              <Dato etiqueta="Notificaciones (webhook firmado)" valor={<code>{d.mercado_pago.webhook}</code>} />
              <Tabla compacta clave="estado" columnas={[{ k: 'estado', t: 'Estado', r: (x) => <Estado valor={x.estado} /> }, { k: 'n', t: 'Pagos', derecha: true }, { k: 'ultima', t: 'Último', r: (x) => relativa(x.ultima) }]} filas={d.mercado_pago.ultimas} />
              {d.mercado_pago.modo === 'simulado' && <Aviso tono="alerta">Configurá <code>MP_ACCESS_TOKEN</code> y <code>MP_WEBHOOK_SECRET</code> para operar con dinero real.</Aviso>}
            </Tarjeta>
            <Tarjeta titulo="Correo (SMTP)" icono="mail" accion={<Estado tono={d.correo.configurado ? 'exito' : 'alerta'} texto={d.correo.configurado ? 'Configurado' : 'Pendiente'} />} cuerpo="p-space-md space-y-2">
              <Dato etiqueta="Servidor" valor={d.correo.servidor ?? 'Sin configurar (cuenta institucional del dominio)'} />
              <p className="text-body-sm text-secondary">Se usa para recuperación de contraseña, recibos y avisos. Mientras tanto, los avisos llegan como notificaciones dentro de la plataforma.</p>
            </Tarjeta>
            <Tarjeta titulo="Notificaciones internas" icono="notifications" cuerpo="p-space-md">
              <Tabla compacta clave="tipo" columnas={[{ k: 'tipo', t: 'Tipo', r: (x) => capitalizar(x.tipo) }, { k: 'n', t: 'Enviadas', derecha: true }, { k: 'leidas', t: 'Leídas', derecha: true }]} filas={d.notificaciones} />
            </Tarjeta>
            <Tarjeta titulo="Facturación electrónica ARCA" icono="receipt" cuerpo="p-space-md">
              <Estado tono="neutro" texto={d.arca.estado} />
              <p className="text-body-sm text-secondary mt-2">También en fase 5: WhatsApp, débito automático y conciliación bancaria automática.</p>
            </Tarjeta>
          </div>
        </>
      )}
    </Consulta>
  );
}
