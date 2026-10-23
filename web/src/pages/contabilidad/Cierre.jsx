import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, periodo, fechaHora, periodoActual } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Aviso } from '../../components/ui.jsx';

/** Cierre de períodos: bloquea cambios posteriores; las correcciones se hacen en el período abierto. */
export default function Cierre() {
  const q = useDatos('/api/finanzas/cierres');
  const [cerrar, setCerrar] = useState(null);
  const accion = useAccion(() => api.post('/api/finanzas/cierres', { periodo: cerrar.periodo }), { ok: 'Período cerrado', invalidar: ['/api/finanzas'], alTerminar: () => setCerrar(null) });
  return (
    <>
      <Encabezado titulo="Cierre mensual" subtitulo="Un período cerrado no admite cargos, pagos ni gastos con fecha en ese mes." />
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(lista) => (
            <Tabla clave="periodo" columnas={[
              { k: 'periodo', t: 'Período', r: (p) => <span className="capitalize font-semibold">{periodo(p.periodo)}</span> },
              { k: 'ingresos', t: 'Ingresos', derecha: true, r: (p) => pesos(p.ingresos) },
              { k: 'egresos', t: 'Egresos', derecha: true, r: (p) => pesos(p.egresos) },
              { k: 'pend', t: 'Pendientes', r: (p) => (p.pendientes.gastos || p.pendientes.transferencias ? <span className="text-body-sm text-alerta">{p.pendientes.gastos} gastos · {p.pendientes.transferencias} transferencias</span> : <span className="text-body-sm text-secondary">—</span>) },
              { k: 'estado', t: 'Estado', r: (p) => (p.cerrado_en ? <div><Estado tono="neutro" texto="Cerrado" icono="lock" /><p className="text-label-sm text-secondary mt-0.5">{fechaHora(p.cerrado_en)} · {p.por}</p></div> : p.periodo === periodoActual() ? <Estado tono="exito" texto="En curso" /> : <Estado tono="alerta" texto="Abierto" />) },
              { k: 'acc', t: '', derecha: true, r: (p) => !p.cerrado_en && p.periodo < periodoActual() && <Boton chico icono="lock" onClick={() => setCerrar(p)}>Cerrar</Boton> },
            ]} filas={lista} />
          )}
        </Consulta>
      </Tarjeta>
      <Modal abierto={!!cerrar} titulo={cerrar ? `Cerrar ${periodo(cerrar.periodo)}` : ''} onCerrar={() => setCerrar(null)} pie={<Boton cargando={accion.isPending} icono="lock" onClick={() => accion.mutate()}>Cerrar período</Boton>}>
        {cerrar && (
          <div className="space-y-space-md">
            <p>Ingresos <strong>{pesos(cerrar.ingresos)}</strong> · Egresos <strong>{pesos(cerrar.egresos)}</strong></p>
            {(cerrar.pendientes.gastos > 0 || cerrar.pendientes.transferencias > 0) && <Aviso tono="alerta">Hay operaciones pendientes del período. Los gastos sin aprobar impiden el cierre.</Aviso>}
            <Aviso tono="info">Después del cierre no se pueden registrar ni anular movimientos con fecha en este mes.</Aviso>
          </div>
        )}
      </Modal>
    </>
  );
}
