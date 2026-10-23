import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { pesos, fecha, hoy, sumarDias, aCentavos } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Campo, Entrada, Selector, Pestanas, Aviso } from '../../components/ui.jsx';

/** Facturas de proveedores, vencimientos y circuito de autorización de pago. Quien carga no autoriza. */
export default function Compras() {
  const q = useDatos('/api/finanzas/facturas');
  const prov = useDatos('/api/finanzas/proveedores');
  const pedidos = useDatos('/api/compras');
  const { usuario } = useSesion();
  const [vista, setVista] = useState('facturas');
  const [nueva, setNueva] = useState(null);
  const [pago, setPago] = useState(null);
  const cargar = useAccion(() => api.post('/api/finanzas/facturas', { ...nueva, proveedor_id: nueva.proveedor_id, total: aCentavos(nueva.total) }), { ok: 'Factura cargada', invalidar: ['/api/finanzas'], alTerminar: () => setNueva(null) });
  const autorizar = useAccion((id) => api.post(`/api/finanzas/facturas/${id}/autorizar`), { ok: 'Factura autorizada', invalidar: ['/api/finanzas'] });
  const pagar = useAccion(() => api.post(`/api/finanzas/facturas/${pago.f.id}/pagar`, { caja_id: pago.caja_id, importe: aCentavos(pago.importe) }), { ok: 'Pago registrado', invalidar: ['/api/finanzas'], alTerminar: () => setPago(null) });
  const comprada = useAccion((id) => api.post(`/api/compras/${id}/resolver`, { estado: 'comprada' }), { ok: 'Marcada como comprada', invalidar: ['/api/compras'] });
  return (
    <>
      <Encabezado titulo="Compras y circuito de pagos" subtitulo="Cargar factura → autorizar (otro usuario; sobre el umbral, la Directiva) → pagar."
        acciones={<Boton icono="add" onClick={() => setNueva({ proveedor_id: '', numero: '', fecha: hoy(), vence: sumarDias(hoy(), 30), total: '' })}>Cargar factura</Boton>} />
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'facturas', label: 'Facturas' }, { value: 'pedidos', label: 'Solicitudes de compra' }]} />
      {vista === 'facturas' ? (
        <Consulta q={q}>
          {(d) => (
            <>
              <div className="mb-space-md"><Aviso tono="info">Umbral de autorización de la Comisión Directiva: <strong>{pesos(d.umbral)}</strong>.</Aviso></div>
              <Tarjeta cuerpo="p-space-md">
                <Tabla compacta columnas={[
                  { k: 'razon_social', t: 'Proveedor', r: (f) => <div><p className="font-semibold">{f.razon_social}</p><p className="text-body-sm text-secondary font-mono">{f.numero}</p></div> },
                  { k: 'vence', t: 'Vence', r: (f) => <span className={f.vence < hoy() && f.estado !== 'pagada' ? 'text-critico font-semibold' : ''}>{fecha(f.vence)}</span> },
                  { k: 'total', t: 'Total', derecha: true, r: (f) => pesos(f.total) },
                  { k: 'pagado', t: 'Pagado', derecha: true, r: (f) => pesos(f.pagado) },
                  { k: 'estado', t: 'Estado', r: (f) => <div><Estado valor={f.estado} /><p className="text-label-sm text-secondary mt-0.5">{f.autorizada ? `Autorizó ${f.autorizada}` : `Cargó ${f.cargada ?? '—'}`}</p></div> },
                  { k: 'acc', t: '', derecha: true, r: (f) => (
                    <div className="flex justify-end gap-1">
                      {f.estado === 'cargada' && f.cargada_por !== usuario.id && f.total <= d.umbral && <Boton chico variante="exito" onClick={() => autorizar.mutate(f.id)}>Autorizar</Boton>}
                      {f.estado === 'cargada' && f.total > d.umbral && <Estado tono="alerta" texto="Espera Directiva" />}
                      {f.estado === 'autorizada' && <Boton chico icono="paid" onClick={() => setPago({ f, caja_id: d.cajas[0]?.id, importe: String((f.total - f.pagado) / 100) })}>Pagar</Boton>}
                    </div>
                  ) },
                ]} filas={d.facturas} />
              </Tarjeta>
              <Modal abierto={!!pago} titulo="Pagar factura" onCerrar={() => setPago(null)} pie={<Boton cargando={pagar.isPending} onClick={() => pagar.mutate()}>Registrar pago</Boton>}>
                {pago && (
                  <div className="space-y-space-md">
                    <p>{pago.f.razon_social} · {pago.f.numero} · saldo {pesos(pago.f.total - pago.f.pagado)}</p>
                    <Campo etiqueta="Caja"><Selector value={pago.caja_id} onChange={(e) => setPago({ ...pago, caja_id: e.target.value })} opciones={d.cajas.map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
                    <Campo etiqueta="Importe ($)" ayuda="Admite pagos parciales"><Entrada type="number" value={pago.importe} onChange={(e) => setPago({ ...pago, importe: e.target.value })} /></Campo>
                  </div>
                )}
              </Modal>
            </>
          )}
        </Consulta>
      ) : (
        <Tarjeta cuerpo="p-space-md">
          <Consulta q={pedidos}>
            {(lista) => (
              <Tabla compacta columnas={[
                { k: 'descripcion', t: 'Pedido', r: (s) => <div><p className="font-semibold">{s.descripcion}</p><p className="text-body-sm text-secondary">{s.solicitante}{s.actividad ? ` · ${s.actividad}` : ''}{s.ticket ? ` · ${s.ticket}` : ''}</p></div> },
                { k: 'monto_estimado', t: 'Estimado', derecha: true, r: (s) => pesos(s.monto_estimado) },
                { k: 'estado', t: 'Estado', r: (s) => <Estado valor={s.estado} /> },
                { k: 'acc', t: '', derecha: true, r: (s) => s.estado === 'autorizada' && <Boton chico variante="suave" onClick={() => comprada.mutate(s.id)}>Marcar comprada</Boton> },
              ]} filas={lista} />
            )}
          </Consulta>
        </Tarjeta>
      )}
      <Modal abierto={!!nueva} titulo="Cargar factura de proveedor" onCerrar={() => setNueva(null)} pie={<Boton cargando={cargar.isPending} disabled={!nueva?.proveedor_id || !nueva?.numero || !nueva?.total} onClick={() => cargar.mutate()}>Cargar</Boton>}>
        {nueva && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Proveedor" className="sm:col-span-2"><Selector value={nueva.proveedor_id} onChange={(e) => setNueva({ ...nueva, proveedor_id: e.target.value })} vacio="Elegí" opciones={(prov.data ?? []).map((p) => ({ value: p.id, label: p.razon_social }))} /></Campo>
            <Campo etiqueta="Número"><Entrada value={nueva.numero} onChange={(e) => setNueva({ ...nueva, numero: e.target.value })} placeholder="A-0001-00001234" /></Campo>
            <Campo etiqueta="Total ($)"><Entrada type="number" value={nueva.total} onChange={(e) => setNueva({ ...nueva, total: e.target.value })} /></Campo>
            <Campo etiqueta="Fecha"><Entrada type="date" value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} /></Campo>
            <Campo etiqueta="Vencimiento"><Entrada type="date" value={nueva.vence} onChange={(e) => setNueva({ ...nueva, vence: e.target.value })} /></Campo>
          </div>
        )}
      </Modal>
    </>
  );
}
