import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { hoy, fechaCorta, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Selector, Entrada, Estado, Avatar, Campo, Modal, Area, cx } from '../../components/ui.jsx';

/** Planilla de asistencia: lo fichado por QR se registra solo; las correcciones manuales piden justificación. */
export default function Asistencia() {
  const [params] = useSearchParams();
  const grupos = useDatos('/api/profesor/grupos');
  const [grupo, setGrupo] = useState(params.get('grupo') ?? '');
  const [dia, setDia] = useState(hoy());
  const grupoId = grupo || grupos.data?.[0]?.id;
  const q = useDatos(grupoId ? `/api/profesor/asistencia?grupo_id=${grupoId}&fecha=${dia}` : null);
  const [cambios, setCambios] = useState({});
  const [justificar, setJustificar] = useState(false);
  const [motivo, setMotivo] = useState('');
  useEffect(() => setCambios({}), [grupoId, dia]);
  const guardar = useAccion(() => api.put('/api/profesor/asistencia', {
    grupo_id: grupoId, fecha: dia, registros: Object.entries(cambios).map(([id, presente]) => ({ inscripcion_id: id, presente, justificacion: motivo })),
  }), { ok: 'Asistencia corregida', invalidar: ['/api/profesor'], alTerminar: () => { setCambios({}); setJustificar(false); setMotivo(''); } });

  return (
    <>
      <Encabezado titulo="Planilla de asistencia" subtitulo="La asistencia fichada por QR se carga sola. Las correcciones quedan justificadas."
        acciones={Object.keys(cambios).length > 0 && <Boton icono="save" onClick={() => setJustificar(true)}>Guardar {Object.keys(cambios).length} cambio(s)</Boton>} />
      <div className="grid sm:grid-cols-[1fr_180px] gap-2 mb-space-md">
        <Selector value={grupoId ?? ''} onChange={(e) => setGrupo(e.target.value)} opciones={(grupos.data ?? []).map((g) => ({ value: g.id, label: `${g.actividad} · ${g.nombre}` }))} />
        <Entrada type="date" max={hoy()} value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>
      <Consulta q={q}>
        {(d) => (
          <div className="grid lg:grid-cols-3 gap-space-md">
            <Tarjeta className="lg:col-span-2" titulo={`${d.alumnos.filter((a) => (cambios[a.inscripcion_id] ?? a.asistencia?.presente) ? true : false).length} de ${d.alumnos.length} presentes`} icono="fact_check" cuerpo="p-space-md space-y-2">
              {d.alumnos.map((a) => {
                const presente = cambios[a.inscripcion_id] ?? !!a.asistencia?.presente;
                const modificado = a.inscripcion_id in cambios;
                return (
                  <div key={a.inscripcion_id} className={cx('flex items-center gap-3 p-2.5 rounded-xl', modificado ? 'bg-alerta-suave/50' : 'bg-surface')}>
                    <Avatar persona={a} tam={36} />
                    <div className="flex-1 min-w-0">
                      <p className="font-label-lg text-label-lg truncate">{a.apellido}, {a.nombre}</p>
                      <p className="text-body-sm text-secondary">{a.asistencia ? `${capitalizar(a.asistencia.origen)}${a.asistencia.justificacion ? ` · ${a.asistencia.justificacion}` : ''}` : 'Sin registro'}</p>
                    </div>
                    {!a.habilitado && <Estado tono="critico" texto="No habilitado" />}
                    <button onClick={() => setCambios({ ...cambios, [a.inscripcion_id]: !presente })} aria-pressed={presente}
                      className={cx('h-9 px-3 rounded-full text-label-md font-bold', presente ? 'bg-exito text-white' : 'bg-surface-container text-secondary')}>
                      {presente ? 'Presente' : 'Ausente'}
                    </button>
                  </div>
                );
              })}
            </Tarjeta>
            <Tarjeta titulo="Últimas clases" icono="history" cuerpo="p-space-md space-y-1.5">
              {d.historial.map((h) => (
                <button key={h.fecha} onClick={() => setDia(h.fecha)} className="w-full flex justify-between text-body-md p-2 rounded-lg hover:bg-surface-container-low">
                  <span className="capitalize">{fechaCorta(h.fecha)}</span><span className="font-semibold">{h.presentes} presentes</span>
                </button>
              ))}
            </Tarjeta>
          </div>
        )}
      </Consulta>
      <Modal abierto={justificar} titulo="Justificar corrección" onCerrar={() => setJustificar(false)}
        pie={<Boton cargando={guardar.isPending} disabled={motivo.trim().length < 3} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        <Campo etiqueta="Motivo de la corrección manual"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el alumno ingresó sin celular, validado por DNI" /></Campo>
      </Modal>
    </>
  );
}
