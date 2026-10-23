import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Campo, Entrada, Selector } from '../../components/ui.jsx';

/** Sectores y espacios del club con su responsable de mantenimiento por defecto (asignación automática de tickets). */
export default function Sectores() {
  const q = useDatos('/api/sectores');
  const esp = useDatos('/api/espacios');
  const tick = useDatos('/api/tickets?estado=__');
  const [edicion, setEdicion] = useState(null);
  const guardar = useAccion(() => api.post('/api/sectores', { ...edicion, espacio_id: edicion.espacio_id || null, responsable_default_id: edicion.responsable_default_id || null }), { ok: 'Sector guardado', invalidar: ['/api/sectores'], alTerminar: () => setEdicion(null) });
  return (
    <>
      <Encabezado titulo="Sectores del club" subtitulo="Natatorio, canchas, gimnasio, vestuarios, parque… con su responsable por defecto: los tickets nuevos se le asignan solos."
        acciones={<Boton icono="add" onClick={() => setEdicion({ nombre: '', espacio_id: '', responsable_default_id: '' })}>Nuevo sector</Boton>} />
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(lista) => (
            <Tabla columnas={[
              { k: 'nombre', t: 'Sector', r: (s) => <strong>{s.nombre}</strong> },
              { k: 'espacio', t: 'Espacio', r: (s) => s.espacio ?? '—' },
              { k: 'responsable', t: 'Responsable por defecto', r: (s) => s.responsable ?? <span className="text-secondary">Sin asignar (Administración asigna)</span> },
              { k: 'abiertos', t: 'Tickets abiertos', r: (s) => <Estado tono={s.abiertos ? 'alerta' : 'exito'} texto={String(s.abiertos)} /> },
              { k: 'e', t: '', r: (s) => <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setEdicion({ ...s, espacio_id: s.espacio_id ?? '', responsable_default_id: s.responsable_default_id ?? '' })} /> },
            ]} filas={lista} />
          )}
        </Consulta>
      </Tarjeta>
      <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar sector' : 'Nuevo sector'} onCerrar={() => setEdicion(null)} pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {edicion && (
          <div className="space-y-space-md">
            <Campo etiqueta="Nombre"><Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Espacio vinculado"><Selector value={edicion.espacio_id} onChange={(e) => setEdicion({ ...edicion, espacio_id: e.target.value })} vacio="—" opciones={(esp.data ?? []).map((x) => ({ value: x.id, label: x.nombre }))} /></Campo>
            <Campo etiqueta="Responsable por defecto"><Selector value={edicion.responsable_default_id} onChange={(e) => setEdicion({ ...edicion, responsable_default_id: e.target.value })} vacio="Sin asignar" opciones={(tick.data?.personal ?? []).map((p) => ({ value: p.id, label: p.nombre }))} /></Campo>
          </div>
        )}
      </Modal>
    </>
  );
}
