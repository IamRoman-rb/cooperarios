import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { horarios, fecha, edad } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Estado, Avatar, Buscador, Vacio, Barra, Aviso } from '../../components/ui.jsx';

/** Alumnos por grupo con estado de habilitación, sin montos ni datos clínicos. */
export default function Grupos() {
  const q = useDatos('/api/clases/grupos');
  const [texto, setTexto] = useState('');
  return (
    <>
      <Encabezado titulo="Mis grupos" subtitulo="Alumnos con su estado de habilitación. Solo ves si están habilitados y un motivo genérico." />
      <Buscador valor={texto} onChange={setTexto} placeholder="Buscar alumno" className="mb-space-md" />
      <Consulta q={q}>
        {(grupos) => grupos.length === 0 ? <Vacio icono="groups" titulo="No tenés grupos asignados" /> : (
          <div className="space-y-space-md">
            {grupos.map((g) => {
              const alumnos = g.alumnos.filter((a) => `${a.nombre} ${a.apellido}`.toLowerCase().includes(texto.toLowerCase()));
              const habilitados = g.alumnos.filter((a) => a.habilitado).length;
              return (
                <Tarjeta key={g.id} titulo={`${g.actividad} · ${g.nombre}`} subtitulo={horarios(g.horarios)} icono={g.icono}
                  accion={<span className="text-label-md text-secondary whitespace-nowrap">{g.alumnos.length}/{g.cupo}</span>} cuerpo="p-space-md">
                  <div className="flex items-center gap-2 mb-3">
                    <Barra valor={habilitados} max={g.alumnos.length} tono="exito" className="flex-1" />
                    <span className="text-label-sm text-secondary">{habilitados} habilitados</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {alumnos.map((a) => (
                      <div key={a.inscripcion_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface">
                        <Avatar persona={a} tam={40} />
                        <div className="flex-1 min-w-0">
                          <p className="font-label-lg text-label-lg truncate">{a.apellido}, {a.nombre}</p>
                          <p className="text-body-sm text-secondary truncate">{edad(a.fecha_nacimiento)} años · {a.asistencias_mes} clases este mes{a.apto ? ` · apto ${a.apto.vence_en ? `hasta ${fecha(a.apto.vence_en)}` : a.apto.estado.replace('_', ' ')}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <Estado valor={a.habilitado ? 'habilitado' : 'denegado'} texto={a.habilitado ? 'OK' : 'No habilitado'} />
                          {!a.habilitado && <p className="text-[11px] text-secondary mt-0.5 max-w-[120px] leading-tight">{a.motivo}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {g.alumnos.some((a) => a.estado === 'pendiente_apto') && <div className="mt-3"><Aviso tono="alerta">Hay alumnos pendientes de apto médico: no pueden hacer la actividad hasta que el médico los habilite.</Aviso></div>}
                </Tarjeta>
              );
            })}
          </div>
        )}
      </Consulta>
    </>
  );
}
