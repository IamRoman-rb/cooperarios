import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, periodo, aCentavos } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Campo, Entrada, Selector, Aviso } from '../../components/ui.jsx';

/** Liquidación a profesores (y concesionarios en fase 5): Contabilidad liquida, Directiva autoriza, Contabilidad paga. */
export default function Honorarios() {
  const q = useDatos('/api/finanzas/honorarios');
  const cajas = useDatos('/api/finanzas/caja');
  const [liq, setLiq] = useState(null);
  const [pago, setPago] = useState(null);
  const liquidar = useAccion(() => api.post('/api/finanzas/honorarios/liquidar', { periodo: liq.periodo, valor_clase: aCentavos(liq.valor) }), { ok: (r) => `${r.liquidados} profesores liquidados`, invalidar: ['/api/finanzas'], alTerminar: () => setLiq(null) });
  const pagar = useAccion(() => api.post(`/api/finanzas/honorarios/${pago.id}/pagar`, { caja_id: Number(pago.caja_id) }), { ok: 'Honorario pagado', invalidar: ['/api/finanzas'], alTerminar: () => setPago(null) });
  const anterior = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  return (
    <>
      <Encabezado titulo="Honorarios y concesiones" subtitulo="Clases dictadas según la asistencia registrada × valor por clase."
        acciones={<Boton icono="calculate" onClick={() => setLiq({ periodo: anterior, valor: '9000' })}>Liquidar período</Boton>} />
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(d) => (
            <Tabla compacta columnas={[
              { k: 'periodo', t: 'Período', r: (h) => <span className="capitalize">{periodo(h.periodo)}</span> },
              { k: 'profesor', t: 'Profesor', r: (h) => <div><p className="font-semibold">{h.profesor}</p><p className="text-body-sm text-secondary">CUIT {h.cuit ?? '—'}</p></div> },
              { k: 'clases', t: 'Clases', derecha: true },
              { k: 'base', t: 'Por clase', derecha: true, r: (h) => pesos(h.base) },
              { k: 'monto', t: 'Total', derecha: true, r: (h) => <strong>{pesos(h.monto)}</strong> },
              { k: 'estado', t: 'Estado', r: (h) => <Estado valor={h.estado} /> },
              { k: 'acc', t: '', derecha: true, r: (h) => (h.estado === 'autorizado' ? <Boton chico icono="paid" onClick={() => setPago({ id: h.id, caja_id: cajas.data?.cajas[1]?.id ?? '' })}>Pagar</Boton> : h.estado === 'liquidado' ? <Estado tono="alerta" texto="Espera Directiva" /> : null) },
            ]} filas={d.honorarios} />
          )}
        </Consulta>
      </Tarjeta>
      <Modal abierto={!!liq} titulo="Liquidar honorarios" onCerrar={() => setLiq(null)} pie={<Boton cargando={liquidar.isPending} onClick={() => liquidar.mutate()}>Liquidar</Boton>}>
        {liq && (
          <div className="space-y-space-md">
            <Campo etiqueta="Período"><Entrada type="month" value={liq.periodo} onChange={(e) => setLiq({ ...liq, periodo: e.target.value })} /></Campo>
            <Campo etiqueta="Valor por clase ($)"><Entrada type="number" value={liq.valor} onChange={(e) => setLiq({ ...liq, valor: e.target.value })} /></Campo>
            <Aviso tono="info">Se cuentan las clases con asistencia registrada (QR o manual) en el período. Los profesores ya liquidados no se duplican.</Aviso>
          </div>
        )}
      </Modal>
      <Modal abierto={!!pago} titulo="Pagar honorario" onCerrar={() => setPago(null)} pie={<Boton cargando={pagar.isPending} onClick={() => pagar.mutate()}>Pagar</Boton>}>
        <Campo etiqueta="Caja"><Selector value={pago?.caja_id ?? ''} onChange={(e) => setPago({ ...pago, caja_id: e.target.value })} opciones={(cajas.data?.cajas ?? []).map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
      </Modal>
    </>
  );
}
