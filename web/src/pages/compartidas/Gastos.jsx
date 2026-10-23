import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData, descargar, urlArchivo } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { pesos, fecha, periodo, periodoActual, hoy, aCentavos, capitalizar } from '../../lib/formato.js';
import { prepararImagen } from '../../lib/imagen.js';
import { useAviso } from '../../components/Avisos.jsx';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Estado, Kpi, Grilla, Modal, Campo, Entrada, Selector, SelectorArchivo, Aviso, DialogoMotivo, Icono } from '../../components/ui.jsx';
import { BarrasH } from '../../components/graficos.jsx';

const MEDIOS_GASTO = [{ value: 'efectivo', label: 'Efectivo' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'billetera', label: 'Billetera' }, { value: 'tarjeta', label: 'Tarjeta' }];

/**
 * Registro de gastos: fecha, motivo (rubro), descripción, importe y medio de pago, con comprobante.
 * Contabilidad registra y anula; la Comisión Directiva aprueba lo que supera el umbral. Quien registra no aprueba.
 */
export default function Gastos({ gestion }) {
  const [f, setF] = useState({ periodo: periodoActual(), categoria_id: '', estado: '', medio: '' });
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const q = useDatos(`/api/finanzas/gastos?${params}`);
  const { usuario, puede } = useSesion();
  const aviso = useAviso();
  const [nuevo, setNuevo] = useState(null);
  const [archivo, setArchivo] = useState([]);
  const [anular, setAnular] = useState(null);
  const [rechazar, setRechazar] = useState(null);
  const registrar = useAccion(async () => api.post('/api/finanzas/gastos', formData({ ...nuevo, importe: aCentavos(nuevo.importe) }, { comprobante: archivo[0] ? await prepararImagen(archivo[0]) : null })), {
    ok: (r) => (r.estado === 'pendiente_aprobacion' ? 'Gasto registrado: queda pendiente de aprobación' : 'Gasto registrado'), invalidar: ['/api/finanzas'], alTerminar: () => { setNuevo(null); setArchivo([]); },
  });
  const aprobar = useAccion(({ id, ...d }) => api.post(`/api/finanzas/gastos/${id}/aprobar`, d), { ok: 'Listo', invalidar: ['/api/finanzas', '/api/aprobaciones'], alTerminar: () => setRechazar(null) });
  const anulacion = useAccion((motivo) => api.post(`/api/finanzas/gastos/${anular.id}/anular`, { motivo }), { ok: 'Gasto anulado', invalidar: ['/api/finanzas'], alTerminar: () => setAnular(null) });
  const opcionesPeriodo = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <Encabezado titulo={gestion ? 'Gastos del club' : 'Gastos'} subtitulo={gestion ? 'Cada gasto con motivo, descripción, importe, medio de pago y comprobante. No se borran: se anulan con motivo.' : 'Lectura del registro de gastos y aprobación de los que superan el umbral.'}
        acciones={<>
          <Boton variante="suave" icono="download" onClick={() => descargar(`/api/finanzas/exportar/gastos?periodo=${f.periodo}`, `gastos-${f.periodo}.csv`).catch((e) => aviso.error(e.message))}>Excel</Boton>
          {gestion && <Boton icono="add" onClick={() => setNuevo({ fecha: hoy(), categoria_id: '', descripcion: '', importe: '', medio_pago: 'transferencia', caja_id: '', proveedor_id: '' })}>Registrar gasto</Boton>}
        </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-space-md">
        <Selector value={f.periodo} onChange={set('periodo')} opciones={opcionesPeriodo.map((p) => ({ value: p, label: periodo(p) }))} />
        <Selector value={f.categoria_id} onChange={set('categoria_id')} vacio="Todo motivo" opciones={(q.data?.categorias ?? []).map((c) => ({ value: c.id, label: c.nombre }))} />
        <Selector value={f.estado} onChange={set('estado')} vacio="Todo estado" opciones={['registrado', 'pendiente_aprobacion', 'aprobado', 'anulado'].map((e) => ({ value: e, label: capitalizar(e) }))} />
        <Selector value={f.medio} onChange={set('medio')} vacio="Todo medio" opciones={MEDIOS_GASTO} />
      </div>
      <Consulta q={q}>
        {(d) => {
          const vigentes = d.gastos.filter((g) => g.estado !== 'anulado');
          return (
            <>
              <Grilla className="mb-space-md">
                <Kpi etiqueta="Total del período" valor={pesos(vigentes.reduce((s, g) => s + g.importe, 0))} icono="shopping_cart" />
                <Kpi etiqueta="En efectivo" valor={pesos(vigentes.filter((g) => g.medio_pago === 'efectivo').reduce((s, g) => s + g.importe, 0))} icono="payments" />
                <Kpi etiqueta="Para aprobar" valor={d.gastos.filter((g) => g.estado === 'pendiente_aprobacion').length} icono="pending_actions" tono="alerta" />
                <Kpi etiqueta="Umbral de aprobación" valor={pesos(d.umbral)} icono="gavel" detalle="Lo aprueba la Comisión Directiva" />
              </Grilla>
              <div className="grid lg:grid-cols-3 gap-space-md">
                <Tarjeta titulo="Por motivo" icono="category"><BarrasH datos={d.por_categoria.map((c) => ({ etiqueta: c.categoria, valor: c.total }))} /></Tarjeta>
                <Tarjeta className="lg:col-span-2" cuerpo="p-space-md">
                  <Tabla compacta columnas={[
                    { k: 'fecha', t: 'Fecha', r: (g) => fecha(g.fecha) },
                    { k: 'descripcion', t: 'Motivo y descripción', r: (g) => <div><p className="font-semibold">{g.descripcion}</p><p className="text-body-sm text-secondary">{g.categoria}{g.proveedor ? ` · ${g.proveedor}` : ''}{g.motivo_anulacion ? ` · ${g.motivo_anulacion}` : ''}</p></div> },
                    { k: 'medio_pago', t: 'Medio', r: (g) => capitalizar(g.medio_pago) },
                    { k: 'importe', t: 'Importe', derecha: true, r: (g) => <span className={g.estado === 'anulado' ? 'line-through text-secondary' : 'font-semibold'}>{pesos(g.importe)}</span> },
                    { k: 'estado', t: 'Estado', r: (g) => <Estado valor={g.estado} /> },
                    { k: 'acc', t: '', derecha: true, r: (g) => (
                      <div className="flex justify-end gap-1">
                        {g.comprobante_archivo && <a href={urlArchivo(g.comprobante_archivo)} target="_blank" rel="noreferrer" className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-surface-container" aria-label="Comprobante"><Icono n="attach_file" /></a>}
                        {g.estado === 'pendiente_aprobacion' && g.registrado_por !== usuario.id && (puede('gastos', 'aprobar') || (gestion && g.importe <= d.umbral)) && (
                          <><Boton chico variante="exito" icono="check" onClick={() => aprobar.mutate({ id: g.id, aprobar: true })}>Aprobar</Boton><Boton chico variante="fantasma" onClick={() => setRechazar(g)}>Rechazar</Boton></>
                        )}
                        {gestion && ['registrado', 'aprobado'].includes(g.estado) && <Boton chico variante="fantasma" onClick={() => setAnular(g)}>Anular</Boton>}
                      </div>
                    ) },
                  ]} filas={d.gastos} vacio="Sin gastos en el período" />
                </Tarjeta>
              </div>
              <Modal abierto={!!nuevo} titulo="Registrar gasto" onCerrar={() => setNuevo(null)} ancho="max-w-xl"
                pie={<Boton cargando={registrar.isPending} disabled={!nuevo?.categoria_id || !nuevo?.descripcion || !nuevo?.importe} onClick={() => registrar.mutate()}>Registrar</Boton>}>
                {nuevo && (
                  <div className="grid sm:grid-cols-2 gap-space-md">
                    <Campo etiqueta="Fecha"><Entrada type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} /></Campo>
                    <Campo etiqueta="Motivo (rubro)"><Selector value={nuevo.categoria_id} onChange={(e) => setNuevo({ ...nuevo, categoria_id: e.target.value })} vacio="Elegí" opciones={d.categorias.map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
                    <Campo etiqueta="Descripción" className="sm:col-span-2"><Entrada value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} /></Campo>
                    <Campo etiqueta="Importe ($)"><Entrada type="number" min="0" step="0.01" value={nuevo.importe} onChange={(e) => setNuevo({ ...nuevo, importe: e.target.value })} /></Campo>
                    <Campo etiqueta="Medio de pago"><Selector value={nuevo.medio_pago} onChange={(e) => setNuevo({ ...nuevo, medio_pago: e.target.value })} opciones={MEDIOS_GASTO} /></Campo>
                    <Campo etiqueta="Caja de la que sale"><Selector value={nuevo.caja_id} onChange={(e) => setNuevo({ ...nuevo, caja_id: e.target.value })} vacio="Sin especificar" opciones={d.cajas.map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
                    <Campo etiqueta="Proveedor (opcional)"><Selector value={nuevo.proveedor_id} onChange={(e) => setNuevo({ ...nuevo, proveedor_id: e.target.value })} vacio="—" opciones={d.proveedores.map((p) => ({ value: p.id, label: p.razon_social }))} /></Campo>
                    <div className="sm:col-span-2"><SelectorArchivo etiqueta="Comprobante (foto o PDF)" archivos={archivo} onChange={setArchivo} /></div>
                    {aCentavos(nuevo.importe || 0) > d.umbral && <div className="sm:col-span-2"><Aviso tono="alerta">Supera el umbral: quedará pendiente de aprobación de la Comisión Directiva.</Aviso></div>}
                  </div>
                )}
              </Modal>
            </>
          );
        }}
      </Consulta>
      <DialogoMotivo abierto={!!anular} titulo="Anular gasto" onCerrar={() => setAnular(null)} onConfirmar={(m) => anulacion.mutate(m)} cargando={anulacion.isPending} boton="Anular" />
      <DialogoMotivo abierto={!!rechazar} titulo="Rechazar gasto" onCerrar={() => setRechazar(null)} onConfirmar={(m) => aprobar.mutate({ id: rechazar.id, aprobar: false, motivo: m })} cargando={aprobar.isPending} boton="Rechazar" />
    </>
  );
}
