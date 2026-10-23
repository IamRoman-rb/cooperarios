import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, descargar } from '../../lib/api.js';
import { pesos, fecha, periodo, periodoActual, periodoCorto, aCentavos, capitalizar } from '../../lib/formato.js';
import { useAviso } from '../../components/Avisos.jsx';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Estado, Kpi, Grilla, Modal, Campo, Entrada, Selector, Aviso, DialogoMotivo } from '../../components/ui.jsx';
import { Barras } from '../../components/graficos.jsx';

/** Empleados registrados, lo que cobra cada uno y el total de la nómina. Contabilidad liquida; Directiva consulta. */
export default function Empleados({ gestion }) {
  const [per, setPer] = useState(periodoActual());
  const q = useDatos(`/api/finanzas/empleados?periodo=${per}`);
  const cajas = useDatos(gestion ? '/api/finanzas/caja' : null);
  const aviso = useAviso();
  const [edicion, setEdicion] = useState(null);
  const [pago, setPago] = useState(null);
  const [ajuste, setAjuste] = useState(null);
  const [historial, setHistorial] = useState(null);
  const hist = useDatos(historial ? `/api/finanzas/empleados/${historial.id}/remuneraciones` : null);
  const liquidar = useAccion(() => api.post('/api/finanzas/remuneraciones/liquidar', { periodo: per }), { ok: (r) => `${r.liquidadas} liquidaciones generadas`, invalidar: ['/api/finanzas'] });
  const pagar = useAccion(() => api.post(`/api/finanzas/remuneraciones/${pago.liq.id}/pagar`, { caja_id: pago.caja_id }), { ok: 'Pago registrado', invalidar: ['/api/finanzas'], alTerminar: () => setPago(null) });
  const ajustar = useAccion((motivo) => api.post(`/api/finanzas/remuneraciones/${ajuste.liq.id}/ajuste`, { importe: aCentavos(ajuste.importe), motivo }), { ok: 'Ajuste registrado', invalidar: ['/api/finanzas'], alTerminar: () => setAjuste(null) });
  const guardar = useAccion(() => api.post('/api/finanzas/empleados', { ...edicion, remuneracion_base: aCentavos(edicion.remuneracion_base), fecha_baja: edicion.fecha_baja || null }), { ok: 'Empleado guardado', invalidar: ['/api/finanzas'], alTerminar: () => setEdicion(null) });
  const opcionesPeriodo = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });

  return (
    <>
      <Encabezado titulo="Empleados y remuneraciones" subtitulo="Cargo, sector, vínculo, cuánto cobra cada uno y forma de pago. Las remuneraciones son datos de acceso restringido."
        acciones={<>
          <Selector value={per} onChange={(e) => setPer(e.target.value)} opciones={opcionesPeriodo.map((p) => ({ value: p, label: periodo(p) }))} className="w-44" />
          <Boton variante="suave" icono="download" onClick={() => descargar(`/api/finanzas/exportar/empleados?periodo=${per}`, `nomina-${per}.csv`).catch((e) => aviso.error(e.message))}>Excel</Boton>
          {gestion && <Boton variante="secundario" icono="calculate" cargando={liquidar.isPending} onClick={() => liquidar.mutate()}>Liquidar {periodoCorto(per)}</Boton>}
          {gestion && <Boton icono="person_add" onClick={() => setEdicion({ persona: { nombre: '', apellido: '', dni: '' }, cargo: '', sector: '', tipo_vinculo: 'dependencia', fecha_alta: '', forma_pago: 'transferencia', remuneracion_base: '' })}>Alta</Boton>}
        </>} />
      <Consulta q={q}>
        {(d) => (
          <>
            {d.total_nomina !== undefined && (
              <Grilla className="mb-space-md">
                <Kpi etiqueta="Empleados activos" valor={d.empleados.filter((e) => e.activo).length} icono="badge" />
                <Kpi etiqueta={`Nómina neta ${periodoCorto(per)}`} valor={pesos(d.total_nomina)} icono="payments" />
                <Kpi etiqueta="Costo bruto" valor={pesos(d.total_bruto)} icono="account_balance" />
                <Kpi etiqueta="Pagadas" valor={`${d.empleados.filter((e) => e.liquidacion?.estado === 'pagada').length} de ${d.empleados.filter((e) => e.liquidacion).length}`} icono="task_alt" tono="exito" />
              </Grilla>
            )}
            {d.evolucion && (
              <Tarjeta titulo="Evolución de la nómina" icono="bar_chart" className="mb-space-md">
                <Barras alto={140} datos={d.evolucion.map((e) => ({ etiqueta: periodoCorto(e.periodo), neto: e.neto }))} series={[{ k: 'neto', label: 'Nómina neta', color: '#1f2937' }]} />
              </Tarjeta>
            )}
            <Tarjeta cuerpo="p-space-md">
              <Tabla columnas={[
                { k: 'nombre', t: 'Empleado', r: (e) => <div><p className="font-semibold">{e.apellido}, {e.nombre}</p><p className="text-body-sm text-secondary">{e.cargo} · {e.sector}</p></div> },
                { k: 'vinculo', t: 'Vínculo', r: (e) => <div>{capitalizar(e.tipo_vinculo)}<p className="text-body-sm text-secondary">Alta {fecha(e.fecha_alta)}</p></div> },
                { k: 'forma_pago', t: 'Forma de pago', r: (e) => capitalizar(e.forma_pago) },
                ...(d.total_nomina !== undefined ? [
                  { k: 'liq', t: `Liquidación ${periodoCorto(per)}`, derecha: true, r: (e) => (e.liquidacion ? <div><p className="font-semibold">{pesos(e.liquidacion.neto)}</p><p className="text-body-sm text-secondary">Bruto {pesos(e.liquidacion.bruto)} − {pesos(e.liquidacion.descuentos)}</p></div> : <span className="text-secondary">—</span>) },
                  { k: 'estado', t: 'Estado', r: (e) => (e.liquidacion ? <Estado valor={e.liquidacion.estado} /> : e.activo ? <Estado tono="neutro" texto="Sin liquidar" /> : <Estado valor="baja" />) },
                  { k: 'acc', t: '', derecha: true, r: (e) => (
                    <div className="flex justify-end gap-1">
                      <Boton chico variante="fantasma" icono="history" onClick={() => setHistorial(e)} aria-label="Historial" />
                      {gestion && e.liquidacion?.estado === 'liquidada' && <Boton chico icono="paid" onClick={() => setPago({ liq: e.liquidacion, caja_id: '' })}>Pagar</Boton>}
                      {gestion && e.liquidacion?.estado === 'pagada' && <Boton chico variante="suave" onClick={() => setAjuste({ liq: e.liquidacion, importe: '' })}>Ajuste</Boton>}
                      {gestion && <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setEdicion({ ...e, remuneracion_base: String(e.remuneracion_base / 100) })} />}
                    </div>
                  ) },
                ] : [{ k: 'activo', t: 'Estado', r: (e) => <Estado valor={e.activo ? 'activo' : 'baja'} /> }]),
              ]} filas={d.empleados} />
              {d.total_nomina === undefined && <Aviso tono="info">Administración ve el legajo sin importes.</Aviso>}
            </Tarjeta>
            <p className="text-body-sm text-secondary mt-space-md">Las obligaciones laborales y previsionales (recibos de sueldo, aportes, ARCA) las gestiona el estudio contable: la plataforma registra y consolida.</p>
          </>
        )}
      </Consulta>

      <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar empleado' : 'Alta de empleado'} onCerrar={() => setEdicion(null)} ancho="max-w-xl"
        pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {edicion && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            {!edicion.id && <>
              <Campo etiqueta="Nombre"><Entrada value={edicion.persona.nombre} onChange={(e) => setEdicion({ ...edicion, persona: { ...edicion.persona, nombre: e.target.value } })} /></Campo>
              <Campo etiqueta="Apellido"><Entrada value={edicion.persona.apellido} onChange={(e) => setEdicion({ ...edicion, persona: { ...edicion.persona, apellido: e.target.value } })} /></Campo>
              <Campo etiqueta="DNI"><Entrada value={edicion.persona.dni} onChange={(e) => setEdicion({ ...edicion, persona: { ...edicion.persona, dni: e.target.value } })} /></Campo>
            </>}
            <Campo etiqueta="Cargo"><Entrada value={edicion.cargo} onChange={(e) => setEdicion({ ...edicion, cargo: e.target.value })} /></Campo>
            <Campo etiqueta="Sector"><Entrada value={edicion.sector} onChange={(e) => setEdicion({ ...edicion, sector: e.target.value })} /></Campo>
            <Campo etiqueta="Vínculo"><Selector value={edicion.tipo_vinculo} onChange={(e) => setEdicion({ ...edicion, tipo_vinculo: e.target.value })} opciones={['dependencia', 'monotributo', 'otro'].map((v) => ({ value: v, label: capitalizar(v) }))} /></Campo>
            <Campo etiqueta="Forma de pago"><Selector value={edicion.forma_pago} onChange={(e) => setEdicion({ ...edicion, forma_pago: e.target.value })} opciones={[{ value: 'transferencia', label: 'Transferencia' }, { value: 'efectivo', label: 'Efectivo' }]} /></Campo>
            <Campo etiqueta="Remuneración base ($)"><Entrada type="number" value={edicion.remuneracion_base} onChange={(e) => setEdicion({ ...edicion, remuneracion_base: e.target.value })} /></Campo>
            <Campo etiqueta="Fecha de alta"><Entrada type="date" value={edicion.fecha_alta} onChange={(e) => setEdicion({ ...edicion, fecha_alta: e.target.value })} /></Campo>
            {edicion.id && <Campo etiqueta="Fecha de baja"><Entrada type="date" value={edicion.fecha_baja ?? ''} onChange={(e) => setEdicion({ ...edicion, fecha_baja: e.target.value })} /></Campo>}
          </div>
        )}
      </Modal>
      <Modal abierto={!!pago} titulo="Registrar pago de sueldo" onCerrar={() => setPago(null)} pie={<Boton cargando={pagar.isPending} disabled={!pago?.caja_id} onClick={() => pagar.mutate()}>Pagar {pago && pesos(pago.liq.neto)}</Boton>}>
        <Campo etiqueta="Caja"><Selector value={pago?.caja_id ?? ''} onChange={(e) => setPago({ ...pago, caja_id: e.target.value })} vacio="Elegí" opciones={(cajas.data?.cajas ?? []).map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
      </Modal>
      {ajuste && (
        <>
          <Modal abierto={!ajuste.confirmar} titulo="Ajuste de liquidación" onCerrar={() => setAjuste(null)} pie={<Boton disabled={!ajuste.importe} onClick={() => setAjuste({ ...ajuste, confirmar: true })}>Continuar</Boton>}>
            <Aviso tono="info">Una liquidación pagada no se edita: la diferencia se registra como ajuste en el período abierto.</Aviso>
            <Campo etiqueta="Importe del ajuste ($, negativo para descontar)" className="mt-3"><Entrada type="number" value={ajuste.importe} onChange={(e) => setAjuste({ ...ajuste, importe: e.target.value })} /></Campo>
          </Modal>
          <DialogoMotivo abierto={!!ajuste.confirmar} titulo="Motivo del ajuste" onCerrar={() => setAjuste(null)} onConfirmar={(m) => ajustar.mutate(m)} cargando={ajustar.isPending} variante="primario" />
        </>
      )}
      <Modal abierto={!!historial} titulo={historial ? `Liquidaciones de ${historial.nombre} ${historial.apellido}` : ''} onCerrar={() => setHistorial(null)} ancho="max-w-2xl">
        <Consulta q={hist}>
          {(lista) => (
            <Tabla compacta columnas={[
              { k: 'periodo', t: 'Período', r: (r) => `${periodo(r.periodo)}${r.es_ajuste ? ' (ajuste)' : ''}` },
              { k: 'bruto', t: 'Bruto', derecha: true, r: (r) => pesos(r.bruto) },
              { k: 'descuentos', t: 'Descuentos', derecha: true, r: (r) => pesos(r.descuentos) },
              { k: 'neto', t: 'Neto', derecha: true, r: (r) => <strong>{pesos(r.neto)}</strong> },
              { k: 'estado', t: 'Estado', r: (r) => <Estado valor={r.estado} /> },
            ]} filas={lista} />
          )}
        </Consulta>
      </Modal>
    </>
  );
}
