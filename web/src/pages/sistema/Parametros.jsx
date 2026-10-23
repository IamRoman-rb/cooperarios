import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Entrada, Campo, Modal } from '../../components/ui.jsx';

/** Feriados, reglas generales y textos. */
export default function Parametros() {
  const q = useDatos('/api/sistema/parametros');
  const [edicion, setEdicion] = useState(null);
  const [feriado, setFeriado] = useState({ fecha: '', descripcion: '' });
  const guardar = useAccion(() => api.put(`/api/sistema/parametros/${edicion.clave}`, { valor: edicion.valor }), { ok: 'Parámetro guardado', invalidar: ['/api/sistema'], alTerminar: () => setEdicion(null) });
  const agregar = useAccion(() => api.post('/api/sistema/feriados', feriado), { ok: 'Feriado agregado', invalidar: ['/api/sistema'], alTerminar: () => setFeriado({ fecha: '', descripcion: '' }) });
  const quitar = useAccion((f) => api.del(`/api/sistema/feriados/${f}`), { ok: 'Feriado quitado', invalidar: ['/api/sistema'] });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Parámetros del sistema" subtitulo="Cada cambio queda en auditoría con el valor anterior." />
          <div className="grid lg:grid-cols-3 gap-space-md">
            <Tarjeta className="lg:col-span-2" titulo="Parámetros" icono="tune" cuerpo="p-space-md">
              <Tabla clave="clave" onFila={(p) => setEdicion({ ...p })} columnas={[
                { k: 'clave', t: 'Clave', r: (p) => <div><p className="font-mono text-body-sm font-semibold">{p.clave}</p><p className="text-body-sm text-secondary">{p.descripcion}</p></div> },
                { k: 'valor', t: 'Valor', r: (p) => <span className="break-all">{p.valor}</span> },
              ]} filas={d.parametros} />
            </Tarjeta>
            <Tarjeta titulo="Feriados" icono="event_busy" cuerpo="p-space-md space-y-3">
              {d.feriados.map((f) => (
                <div key={f.fecha} className="flex items-center justify-between gap-2 text-body-md">
                  <span><strong>{fecha(f.fecha)}</strong> · {f.descripcion}</span>
                  <Boton chico variante="fantasma" icono="delete" aria-label="Quitar" onClick={() => quitar.mutate(f.fecha)} />
                </div>
              ))}
              <div className="grid grid-cols-[140px_1fr] gap-2 pt-2 border-t border-surface-container">
                <Entrada type="date" value={feriado.fecha} onChange={(e) => setFeriado({ ...feriado, fecha: e.target.value })} />
                <Entrada value={feriado.descripcion} onChange={(e) => setFeriado({ ...feriado, descripcion: e.target.value })} placeholder="Descripción" />
              </div>
              <Boton chico icono="add" disabled={!feriado.fecha || feriado.descripcion.length < 3} onClick={() => agregar.mutate()}>Agregar feriado</Boton>
            </Tarjeta>
          </div>
          <Modal abierto={!!edicion} titulo={edicion?.clave ?? ''} onCerrar={() => setEdicion(null)} pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
            {edicion && <><p className="text-body-sm text-secondary mb-3">{edicion.descripcion}</p><Campo etiqueta="Valor"><Entrada value={edicion.valor} onChange={(e) => setEdicion({ ...edicion, valor: e.target.value })} /></Campo></>}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
