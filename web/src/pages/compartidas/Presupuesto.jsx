import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, aCentavos } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Barra, Modal, Campo, Entrada, Selector, Kpi, Grilla } from '../../components/ui.jsx';

/** Presupuesto anual contra ejecutado, por rubro y por actividad. */
export default function Presupuesto({ gestion }) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const q = useDatos(`/api/finanzas/presupuesto?anio=${anio}`);
  const [edicion, setEdicion] = useState(null);
  const guardar = useAccion(() => api.post('/api/finanzas/presupuesto', { ...edicion, anio, monto: aCentavos(edicion.monto), actividad_id: edicion.actividad_id || null }), { ok: 'Presupuesto guardado', invalidar: ['/api/finanzas/presupuesto'], alTerminar: () => setEdicion(null) });
  return (
    <>
      <Encabezado titulo="Presupuesto anual" subtitulo="Presupuestado contra ejecutado por rubro."
        acciones={<>
          <Selector value={anio} onChange={(e) => setAnio(Number(e.target.value))} opciones={[anio - 1, anio, anio + 1].map((a) => ({ value: a, label: String(a) }))} className="w-28" />
          {gestion && <Boton icono="add" onClick={() => setEdicion({ rubro: '', tipo: 'egreso', monto: '' })}>Rubro</Boton>}
        </>} />
      <Consulta q={q}>
        {(d) => {
          const tabla = (tipo) => d.items.filter((i) => i.tipo === tipo);
          const total = (tipo, k) => tabla(tipo).reduce((s, i) => s + i[k], 0);
          const avance = Math.round((d.mes / 12) * 100);
          const columnas = [
            { k: 'rubro', t: 'Rubro', r: (i) => <div><p className="font-semibold">{i.rubro}</p>{i.actividad && <p className="text-body-sm text-secondary">{i.actividad}</p>}</div> },
            { k: 'monto', t: 'Presupuestado', derecha: true, r: (i) => pesos(i.monto) },
            { k: 'ejecutado', t: 'Ejecutado', derecha: true, r: (i) => pesos(i.ejecutado) },
            { k: 'pct', t: 'Avance', className: 'w-40', r: (i) => {
              const pct = i.monto ? Math.round((i.ejecutado / i.monto) * 100) : 0;
              return <div className="flex items-center gap-2"><Barra valor={i.ejecutado} max={i.monto} tono={i.tipo === 'egreso' && pct > avance + 10 ? 'critico' : 'primario'} className="flex-1" /><span className="text-label-sm w-10 text-right">{pct}%</span></div>;
            } },
            ...(gestion ? [{ k: 'e', t: '', r: (i) => <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setEdicion({ ...i, monto: String(i.monto / 100) })} /> }] : []),
          ];
          return (
            <>
              <Grilla className="mb-space-md">
                <Kpi etiqueta="Ingresos presupuestados" valor={pesos(total('ingreso', 'monto'))} icono="savings" />
                <Kpi etiqueta="Ingresos ejecutados" valor={pesos(total('ingreso', 'ejecutado'))} icono="trending_up" tono="exito" />
                <Kpi etiqueta="Egresos presupuestados" valor={pesos(total('egreso', 'monto'))} icono="request_quote" />
                <Kpi etiqueta="Egresos ejecutados" valor={pesos(total('egreso', 'ejecutado'))} icono="trending_down" tono="critico" detalle={`Avance esperado del año: ${avance}%`} />
              </Grilla>
              <Tarjeta titulo="Ingresos" icono="trending_up" className="mb-space-md"><Tabla columnas={columnas} filas={tabla('ingreso')} /></Tarjeta>
              <Tarjeta titulo="Egresos" icono="trending_down"><Tabla columnas={columnas} filas={tabla('egreso')} /></Tarjeta>
            </>
          );
        }}
      </Consulta>
      <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar rubro' : 'Nuevo rubro'} onCerrar={() => setEdicion(null)}
        pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {edicion && (
          <div className="space-y-space-md">
            <Campo etiqueta="Rubro"><Entrada value={edicion.rubro} onChange={(e) => setEdicion({ ...edicion, rubro: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><Selector value={edicion.tipo} onChange={(e) => setEdicion({ ...edicion, tipo: e.target.value })} opciones={[{ value: 'ingreso', label: 'Ingreso' }, { value: 'egreso', label: 'Egreso' }]} /></Campo>
            <Campo etiqueta="Monto anual ($)"><Entrada type="number" min="0" value={edicion.monto} onChange={(e) => setEdicion({ ...edicion, monto: e.target.value })} /></Campo>
          </div>
        )}
      </Modal>
    </>
  );
}
