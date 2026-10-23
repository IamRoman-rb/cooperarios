import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, aCentavos, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Pestanas, Modal, Campo, Entrada, Selector, Casilla } from '../../components/ui.jsx';
import AgendaEspacios from '../compartidas/AgendaEspacios.jsx';

/** Calendario general, bloqueos, alquileres y eventos; alta y reglas de los espacios. */
export default function Espacios() {
  const [vista, setVista] = useState('calendario');
  const q = useDatos('/api/espacios');
  const [edicion, setEdicion] = useState(null);
  const guardar = useAccion(() => {
    const d = { ...edicion, capacidad: edicion.capacidad ? Number(edicion.capacidad) : null, tarifa_hora: aCentavos(edicion.tarifa_hora || 0), anticipacion_dias: Number(edicion.anticipacion_dias), max_activas: Number(edicion.max_activas), cancelacion_horas: Number(edicion.cancelacion_horas) };
    return edicion.id ? api.put(`/api/espacios/${edicion.id}`, d) : api.post('/api/espacios', d);
  }, { ok: 'Espacio guardado', invalidar: ['/api/espacios'], alTerminar: () => setEdicion(null) });
  return (
    <>
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'calendario', label: 'Calendario', icono: 'calendar_month' }, { value: 'espacios', label: 'Espacios y reglas', icono: 'stadium' }]} />
      {vista === 'calendario' ? <AgendaEspacios modo="admin" /> : (
        <>
          <Encabezado titulo="Espacios y reglas de reserva" subtitulo="Anticipación, máximo de reservas activas, ventana de cancelación y sanciones."
            acciones={<Boton icono="add" onClick={() => setEdicion({ nombre: '', tipo: 'cancha', capacidad: '', reservable: false, tarifa_hora: '', activo: true, anticipacion_dias: 7, max_activas: 2, cancelacion_horas: 12, sancion: '' })}>Nuevo espacio</Boton>} />
          <Tarjeta cuerpo="p-space-md">
            <Consulta q={q}>
              {(lista) => (
                <Tabla columnas={[
                  { k: 'nombre', t: 'Espacio', r: (e) => <div><p className="font-semibold">{e.nombre}</p><p className="text-body-sm text-secondary">{capitalizar(e.tipo)}{e.capacidad ? ` · ${e.capacidad} personas` : ''}</p></div> },
                  { k: 'reservable', t: 'Reservas', r: (e) => (e.reservable ? `${e.anticipacion_dias} días · máx. ${e.max_activas} · cancela ${e.cancelacion_horas} h` : 'No reservable') },
                  { k: 'tarifa_hora', t: 'Alquiler/hora', derecha: true, r: (e) => (e.tarifa_hora ? pesos(e.tarifa_hora) : '—') },
                  { k: 'activo', t: 'Estado', r: (e) => <Estado valor={e.activo ? 'activo' : 'baja'} texto={e.activo ? 'Activo' : 'Inactivo'} /> },
                  { k: 'e', t: '', r: (e) => <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setEdicion({ ...e, reservable: !!e.reservable, activo: !!e.activo, tarifa_hora: String(e.tarifa_hora / 100), anticipacion_dias: e.anticipacion_dias ?? 7, max_activas: e.max_activas ?? 2, cancelacion_horas: e.cancelacion_horas ?? 12, sancion: e.sancion ?? '', capacidad: e.capacidad ?? '' })} /> },
                ]} filas={lista} />
              )}
            </Consulta>
          </Tarjeta>
        </>
      )}
      <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar espacio' : 'Nuevo espacio'} onCerrar={() => setEdicion(null)} pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {edicion && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><Selector value={edicion.tipo} onChange={(e) => setEdicion({ ...edicion, tipo: e.target.value })} opciones={['cancha', 'natatorio', 'gimnasio', 'salon', 'vestuario', 'parque'].map((t) => ({ value: t, label: capitalizar(t) }))} /></Campo>
            <Campo etiqueta="Capacidad"><Entrada type="number" value={edicion.capacidad} onChange={(e) => setEdicion({ ...edicion, capacidad: e.target.value })} /></Campo>
            <Casilla checked={edicion.reservable} onChange={(e) => setEdicion({ ...edicion, reservable: e.target.checked })} etiqueta="Reservable por socios" />
            <Casilla checked={edicion.activo} onChange={(e) => setEdicion({ ...edicion, activo: e.target.checked })} etiqueta="Activo" />
            {edicion.reservable && <>
              <Campo etiqueta="Anticipación (días)"><Entrada type="number" value={edicion.anticipacion_dias} onChange={(e) => setEdicion({ ...edicion, anticipacion_dias: e.target.value })} /></Campo>
              <Campo etiqueta="Máximo de reservas activas"><Entrada type="number" value={edicion.max_activas} onChange={(e) => setEdicion({ ...edicion, max_activas: e.target.value })} /></Campo>
              <Campo etiqueta="Cancelación (horas antes)"><Entrada type="number" value={edicion.cancelacion_horas} onChange={(e) => setEdicion({ ...edicion, cancelacion_horas: e.target.value })} /></Campo>
              <Campo etiqueta="Alquiler por hora ($)"><Entrada type="number" value={edicion.tarifa_hora} onChange={(e) => setEdicion({ ...edicion, tarifa_hora: e.target.value })} /></Campo>
              <Campo etiqueta="Sanción por ausencia" className="sm:col-span-2"><Entrada value={edicion.sancion} onChange={(e) => setEdicion({ ...edicion, sancion: e.target.value })} /></Campo>
            </>}
          </div>
        )}
      </Modal>
    </>
  );
}
