import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { pesos, fechaHora, capitalizar } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Estado, Tabla, Pestanas, Kpi, Grilla } from '../../components/ui.jsx';
import { Transferencias } from '../admin/Cobranzas.jsx';

/** Pagos de Mercado Pago y billeteras con su estado, transferencias por aprobar, diferencias y comisiones. */
export default function Conciliacion() {
  const [vista, setVista] = useState('transferencias');
  const q = useDatos('/api/cobranzas/pagos-online');
  const tot = Object.fromEntries((q.data?.totales ?? []).map((t) => [t.estado, t]));
  return (
    <>
      <Encabezado titulo="Pagos en línea y transferencias" subtitulo="Conciliación de pasarela y transferencias informadas por los socios." />
      <Grilla className="mb-space-md">
        <Kpi etiqueta="Mercado Pago aprobado" valor={pesos(tot.aprobado?.monto ?? 0)} icono="check_circle" tono="exito" detalle={`${tot.aprobado?.n ?? 0} pagos`} />
        <Kpi etiqueta="Comisiones" valor={pesos(tot.aprobado?.comision ?? 0)} icono="percent" tono="alerta" detalle="Las decide absorber la Directiva" />
        <Kpi etiqueta="Pendientes en pasarela" valor={tot.pendiente?.n ?? 0} icono="hourglass_top" />
        <Kpi etiqueta="Rechazados" valor={tot.rechazado?.n ?? 0} icono="cancel" tono="critico" />
      </Grilla>
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'transferencias', label: 'Transferencias informadas', icono: 'sync_alt' }, { value: 'online', label: 'Mercado Pago', icono: 'account_balance_wallet' }]} />
      {vista === 'transferencias' ? <Transferencias /> : (
        <Tarjeta cuerpo="p-space-md">
          <Consulta q={q}>
            {(d) => (
              <Tabla compacta columnas={[
                { k: 'creado_en', t: 'Fecha', r: (p) => fechaHora(p.creado_en) },
                { k: 'persona', t: 'Socio', r: (p) => `${p.apellido}, ${p.nombre}` },
                { k: 'payment_id', t: 'Operación', r: (p) => <span className="font-mono text-body-sm">{p.payment_id ?? p.preferencia_id ?? '—'}</span> },
                { k: 'proveedor', t: 'Pasarela', r: (p) => capitalizar(p.proveedor) },
                { k: 'monto', t: 'Monto', derecha: true, r: (p) => pesos(p.monto) },
                { k: 'comision', t: 'Comisión', derecha: true, r: (p) => pesos(p.comision) },
                { k: 'neto', t: 'Neto', derecha: true, r: (p) => <strong>{pesos(p.monto - p.comision)}</strong> },
                { k: 'estado', t: 'Estado', r: (p) => <Estado valor={p.estado} /> },
              ]} filas={d.pagos} />
            )}
          </Consulta>
        </Tarjeta>
      )}
    </>
  );
}
