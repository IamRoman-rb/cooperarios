import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { relativa } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Modal, Campo, Entrada, Selector, Casilla, Aviso, Icono } from '../../components/ui.jsx';

const TIPOS = [{ value: 'lector_rele', label: 'A · Lector QR + controlador con relé' }, { value: 'integracion_fabricante', label: 'B · Integración con la cerradura' }, { value: 'movil', label: 'C · Celular o tablet (profesor/portería)' }];

/** Puertas y lectores QR asociados a cada actividad y su estado. */
export default function PuntosAcceso() {
  const q = useDatos('/api/acceso/puntos');
  const act = useDatos('/api/actividades');
  const esp = useDatos('/api/espacios');
  const [edicion, setEdicion] = useState(null);
  const [lector, setLector] = useState(null);
  const [clave, setClave] = useState(null);
  const guardar = useAccion(() => api.post('/api/acceso/puntos', { ...edicion, espacio_id: edicion.espacio_id ? Number(edicion.espacio_id) : null, actividad_id: edicion.actividad_id ? Number(edicion.actividad_id) : null }), { ok: 'Punto guardado', invalidar: ['/api/acceso'], alTerminar: () => setEdicion(null) });
  const alta = useAccion(() => api.post(`/api/acceso/puntos/${lector.punto_id}/lectores`, { nombre: lector.nombre, lector_id: lector.lector_id }), { invalidar: ['/api/acceso'], alTerminar: (r) => { setLector(null); setClave(r.clave); } });
  return (
    <>
      <Encabezado titulo="Puntos de acceso" subtitulo="Puertas, lectores QR y su actividad. Los lectores se autentican con una clave propia por HTTPS."
        acciones={<Boton icono="add" onClick={() => setEdicion({ nombre: '', espacio_id: '', actividad_id: '', tipo_lector: 'movil', activo: true })}>Nuevo punto</Boton>} />
      <Consulta q={q}>
        {(lista) => (
          <div className="grid lg:grid-cols-2 gap-space-md">
            {lista.map((p) => (
              <Tarjeta key={p.id} cuerpo="p-space-md space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-xl bg-secondary-container text-on-secondary-fixed flex items-center justify-center"><Icono n="sensor_door" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="font-headline-sm text-headline-sm">{p.nombre}</p><Estado valor={p.activo ? 'activo' : 'baja'} texto={p.activo ? 'Activo' : 'Inactivo'} /></div>
                    <p className="text-body-sm text-secondary">{p.actividad ?? 'Ingreso general'} · {p.espacio ?? 'Sin espacio'} · {TIPOS.find((t) => t.value === p.tipo_lector)?.label}</p>
                    <p className="text-body-sm text-secondary">{p.accesos_hoy} lecturas hoy</p>
                  </div>
                  <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setEdicion({ ...p, espacio_id: p.espacio_id ?? '', actividad_id: p.actividad_id ?? '', activo: !!p.activo })} />
                </div>
                {p.lectores.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface">
                    <span className={`w-2.5 h-2.5 rounded-full ${l.en_linea ? 'bg-exito' : 'bg-critico'}`} />
                    <div className="flex-1 min-w-0"><p className="font-label-lg text-label-lg">{l.nombre}</p><p className="text-body-sm text-secondary">Último latido {relativa(l.ultimo_latido) || 'nunca'} · {l.firmware ?? '—'}</p></div>
                    <Boton chico variante="suave" icono="key" onClick={() => setLector({ punto_id: p.id, lector_id: l.id, nombre: l.nombre })}>Rotar clave</Boton>
                  </div>
                ))}
                {p.tipo_lector !== 'movil' && <Boton chico variante="suave" icono="add" onClick={() => setLector({ punto_id: p.id, nombre: '' })}>Agregar lector</Boton>}
              </Tarjeta>
            ))}
          </div>
        )}
      </Consulta>
      <div className="mt-space-md"><Aviso tono="info" titulo="Contingencia sin internet">El controlador guarda por unas horas la lista cifrada de habilitados del día y sincroniza los ingresos después. La portería puede abrir manualmente con registro.</Aviso></div>
      <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar punto' : 'Nuevo punto de acceso'} onCerrar={() => setEdicion(null)} pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {edicion && (
          <div className="space-y-space-md">
            <Campo etiqueta="Nombre"><Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo de lector"><Selector value={edicion.tipo_lector} onChange={(e) => setEdicion({ ...edicion, tipo_lector: e.target.value })} opciones={TIPOS} /></Campo>
            <Campo etiqueta="Actividad"><Selector value={edicion.actividad_id} onChange={(e) => setEdicion({ ...edicion, actividad_id: e.target.value })} vacio="Ingreso general (cuota social)" opciones={(act.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))} /></Campo>
            <Campo etiqueta="Espacio"><Selector value={edicion.espacio_id} onChange={(e) => setEdicion({ ...edicion, espacio_id: e.target.value })} vacio="—" opciones={(esp.data ?? []).map((x) => ({ value: x.id, label: x.nombre }))} /></Campo>
            <Casilla checked={edicion.activo} onChange={(e) => setEdicion({ ...edicion, activo: e.target.checked })} etiqueta="Activo" />
          </div>
        )}
      </Modal>
      <Modal abierto={!!lector} titulo={lector?.lector_id ? 'Rotar clave del lector' : 'Nuevo lector'} onCerrar={() => setLector(null)} pie={<Boton cargando={alta.isPending} disabled={!lector?.nombre} onClick={() => alta.mutate()}>Generar clave</Boton>}>
        <Campo etiqueta="Nombre del lector"><Entrada value={lector?.nombre ?? ''} onChange={(e) => setLector({ ...lector, nombre: e.target.value })} placeholder="Lector QR puerta natatorio" /></Campo>
      </Modal>
      <Modal abierto={!!clave} titulo="Clave del lector" onCerrar={() => setClave(null)}>
        <Aviso tono="alerta">Copiala en el controlador ahora: no se vuelve a mostrar. Se guarda solo su hash.</Aviso>
        <p className="font-mono text-body-md break-all p-3 rounded-xl bg-surface mt-3 select-all">{clave}</p>
        <p className="text-body-sm text-secondary mt-3">El lector envía <code>POST /api/lector/validar</code> con el encabezado <code>X-Lector-Key</code> y abre el relé si la respuesta trae <code>abrir: true</code>.</p>
      </Modal>
    </>
  );
}
