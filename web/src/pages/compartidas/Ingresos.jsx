import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData, descargar } from '../../lib/api.js';
import { pesos, fecha, fechaHora, periodo, periodoCorto, periodoActual, aCentavos, capitalizar } from '../../lib/formato.js';
import { useAviso } from '../../components/Avisos.jsx';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Kpi, Grilla, Modal, Campo, Entrada, Selector, SelectorArchivo, Pestanas } from '../../components/ui.jsx';
import { Barras, Dona, BarrasH } from '../../components/graficos.jsx';
import { ORIGENES, MEDIOS } from './ResumenFinanciero.jsx';

/** Ingresos del club por período, origen y medio de pago (incluido el efectivo). Contabilidad registra; Directiva lee. */
export default function Ingresos({ gestion }) {
  const [per, setPer] = useState(periodoActual());
  const [vista, setVista] = useState('resumen');
  const [nuevo, setNuevo] = useState(null);
  const [archivo, setArchivo] = useState([]);
  const aviso = useAviso();
  const q = useDatos(`/api/finanzas/ingresos?periodo=${per}`);
  const cajas = useDatos(gestion ? '/api/finanzas/caja' : null);
  const registrar = useAccion(() => api.post('/api/finanzas/ingresos', formData({ ...nuevo, importe: aCentavos(nuevo.importe) }, { comprobante: archivo[0] })), {
    ok: 'Ingreso registrado', invalidar: ['/api/finanzas'], alTerminar: () => { setNuevo(null); setArchivo([]); },
  });
  const opcionesPeriodo = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });

  return (
    <>
      <Encabezado titulo="Ingresos del club" subtitulo="Por origen y por medio de pago: efectivo, transferencia, Mercado Pago y otras billeteras."
        acciones={<>
          <Selector value={per} onChange={(e) => setPer(e.target.value)} opciones={opcionesPeriodo.map((p) => ({ value: p, label: periodo(p) }))} className="w-44" />
          <Boton variante="suave" icono="download" onClick={() => descargar(`/api/finanzas/exportar/ingresos?periodo=${per}`, `ingresos-${per}.csv`).catch((e) => aviso.error(e.message))}>Excel</Boton>
          {gestion && <Boton icono="add" onClick={() => setNuevo({ origen: 'sponsor', descripcion: '', importe: '', medio: 'transferencia', caja_id: '' })}>Otro ingreso</Boton>}
        </>} />
      <Consulta q={q}>
        {(d) => (
          <>
            <Grilla className="mb-space-md">
              <Kpi etiqueta={`Total ${periodo(per)}`} valor={pesos(d.total)} icono="trending_up" tono="exito" />
              {['efectivo', 'transferencia', 'mercadopago'].map((m) => <Kpi key={m} etiqueta={MEDIOS[m]} valor={pesos(d.por_medio.find((x) => x.medio === m)?.total ?? 0)} icono={m === 'efectivo' ? 'payments' : m === 'transferencia' ? 'account_balance' : 'wallet'} />)}
            </Grilla>
            <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'resumen', label: 'Resumen', icono: 'insights' }, { value: 'efectivo', label: 'Cobros en efectivo', icono: 'payments' }, { value: 'varios', label: 'Otros ingresos', icono: 'volunteer_activism' }]} />
            {vista === 'resumen' && (
              <div className="grid lg:grid-cols-2 gap-space-md">
                <Tarjeta titulo="Por origen" icono="category"><BarrasH datos={d.por_origen.map((o) => ({ etiqueta: ORIGENES[o.origen] ?? capitalizar(o.origen), valor: o.total }))} /></Tarjeta>
                <Tarjeta titulo="Por medio de pago" icono="donut_large"><Dona datos={d.por_medio.map((m) => ({ etiqueta: MEDIOS[m.medio] ?? m.medio, valor: m.total }))} /></Tarjeta>
                <Tarjeta className="lg:col-span-2" titulo="Evolución mensual" subtitulo="Últimos 12 meses por medio de pago" icono="stacked_bar_chart">
                  <Barras apiladas datos={d.evolucion.map((e) => ({ etiqueta: periodoCorto(e.periodo), ...e }))}
                    series={[{ k: 'efectivo', label: 'Efectivo' }, { k: 'transferencia', label: 'Transferencia' }, { k: 'mercadopago', label: 'Mercado Pago' }, { k: 'billetera', label: 'Billeteras' }]} />
                </Tarjeta>
              </div>
            )}
            {vista === 'efectivo' && (
              <Tarjeta cuerpo="p-space-md" titulo="Cobros en efectivo con recibo" subtitulo="Se concilian con el arqueo de caja">
                <Tabla columnas={[
                  { k: 'fecha', t: 'Fecha', r: (p) => fechaHora(p.fecha) },
                  { k: 'persona', t: 'Socio', r: (p) => (p.apellido ? `${p.apellido}, ${p.nombre}` : '—') },
                  { k: 'recibo', t: 'Recibo', r: (p) => <span className="font-mono">{p.recibo}</span> },
                  { k: 'importe', t: 'Importe', derecha: true, r: (p) => pesos(p.importe) },
                ]} filas={d.efectivo} vacio="Sin cobros en efectivo" />
              </Tarjeta>
            )}
            {vista === 'varios' && (
              <Tarjeta cuerpo="p-space-md" titulo="Sponsors, eventos, donaciones y alquileres">
                <Tabla columnas={[
                  { k: 'fecha', t: 'Fecha', r: (i) => fecha(i.fecha) },
                  { k: 'origen', t: 'Origen', r: (i) => ORIGENES[i.origen] ?? capitalizar(i.origen) },
                  { k: 'descripcion', t: 'Descripción' },
                  { k: 'medio', t: 'Medio', r: (i) => MEDIOS[i.medio] ?? i.medio },
                  { k: 'importe', t: 'Importe', derecha: true, r: (i) => pesos(i.importe) },
                ]} filas={d.varios} vacio="Sin otros ingresos" />
              </Tarjeta>
            )}
          </>
        )}
      </Consulta>
      <Modal abierto={!!nuevo} titulo="Registrar otro ingreso" onCerrar={() => setNuevo(null)}
        pie={<Boton cargando={registrar.isPending} disabled={!nuevo?.descripcion || !nuevo?.importe || !nuevo?.caja_id} onClick={() => registrar.mutate()}>Registrar</Boton>}>
        {nuevo && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Origen"><Selector value={nuevo.origen} onChange={(e) => setNuevo({ ...nuevo, origen: e.target.value })} opciones={['sponsor', 'evento', 'donacion', 'alquiler', 'otro'].map((o) => ({ value: o, label: ORIGENES[o] ?? capitalizar(o) }))} /></Campo>
            <Campo etiqueta="Importe ($)"><Entrada type="number" min="0" value={nuevo.importe} onChange={(e) => setNuevo({ ...nuevo, importe: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción" className="sm:col-span-2"><Entrada value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} /></Campo>
            <Campo etiqueta="Medio"><Selector value={nuevo.medio} onChange={(e) => setNuevo({ ...nuevo, medio: e.target.value })} opciones={Object.entries(MEDIOS).map(([v, l]) => ({ value: v, label: l }))} /></Campo>
            <Campo etiqueta="Caja"><Selector value={nuevo.caja_id} onChange={(e) => setNuevo({ ...nuevo, caja_id: e.target.value })} vacio="Elegí" opciones={(cajas.data?.cajas ?? []).map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
            <div className="sm:col-span-2"><SelectorArchivo etiqueta="Comprobante (opcional)" archivos={archivo} onChange={setArchivo} /></div>
          </div>
        )}
      </Modal>
    </>
  );
}
