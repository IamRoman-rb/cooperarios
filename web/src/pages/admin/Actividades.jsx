import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { horarios, DIAS, pesos } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Modal, Campo, Entrada, Selector, Area, Barra, Buscador, Icono, Casilla } from '../../components/ui.jsx';

const vacioHorario = { dia_semana: 1, hora_inicio: '18:00', hora_fin: '19:00', espacio_id: '' };

/** Actividades, grupos, horarios, cupos y vacantes, profesores y requisitos. */
export default function Actividades() {
  const q = useDatos('/api/actividades');
  const op = useDatos('/api/actividades/aux/opciones');
  const [texto, setTexto] = useState('');
  const [actividad, setActividad] = useState(null);
  const [grupo, setGrupo] = useState(null);
  const guardarActividad = useAccion(() => (actividad.id ? api.put(`/api/actividades/${actividad.id}`, limpiarActividad(actividad)) : api.post('/api/actividades', limpiarActividad(actividad))), { ok: 'Actividad guardada', invalidar: ['/api/actividades'], alTerminar: () => setActividad(null) });
  const guardarGrupo = useAccion(() => {
    const d = { ...grupo, cupo: Number(grupo.cupo), edad_min: grupo.edad_min === '' ? null : Number(grupo.edad_min), edad_max: grupo.edad_max === '' ? null : Number(grupo.edad_max), profesor_id: grupo.profesor_id || null, temporada_id: grupo.temporada_id || null,
      horarios: grupo.horarios.map((h) => ({ ...h, dia_semana: Number(h.dia_semana), espacio_id: h.espacio_id || null })) };
    return grupo.id ? api.put(`/api/actividades/grupos/${grupo.id}`, d) : api.post('/api/actividades/grupos', d);
  }, { ok: 'Grupo guardado', invalidar: ['/api/actividades'], alTerminar: () => setGrupo(null) });

  return (
    <>
      <Encabezado titulo="Actividades y grupos" subtitulo="Grupos, horarios, cupos y vacantes, profesores y requisitos médicos."
        acciones={<Boton icono="add" onClick={() => setActividad({ nombre: '', tipo: 'deportiva', descripcion: '', icono: 'sports', subcomision_id: '', dia_vencimiento: 10, activa: true })}>Nueva actividad</Boton>} />
      <Buscador valor={texto} onChange={setTexto} placeholder="Buscar actividad" className="mb-space-md" />
      <Consulta q={q}>
        {(lista) => (
          <div className="grid lg:grid-cols-2 gap-space-md">
            {lista.filter((a) => a.nombre.toLowerCase().includes(texto.toLowerCase())).map((a) => (
              <Tarjeta key={a.id} cuerpo="p-space-md space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-xl bg-primary-fixed text-primary flex items-center justify-center shrink-0"><Icono n={a.icono ?? 'sports'} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="font-headline-sm text-headline-sm">{a.nombre}</p>{a.requisitos.length > 0 && <Estado tono="alerta" texto="Requiere apto" />}</div>
                    <p className="text-body-sm text-secondary">{a.subcomision ?? 'Sin subcomisión'} · vence el día {a.dia_vencimiento} · desde {pesos(a.desde_socio)}</p>
                  </div>
                  <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setActividad({ ...a, subcomision_id: a.subcomision_id ?? '', activa: !!a.activa })} />
                </div>
                {a.grupos.map((g) => (
                  <button key={g.id} onClick={() => setGrupo({ ...g, actividad_id: a.id, edad_min: g.edad_min ?? '', edad_max: g.edad_max ?? '', profesor_id: g.profesor_id ?? '', temporada_id: g.temporada_id ?? '', horarios: g.horarios.map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, espacio_id: h.espacio_id ?? '' })) })}
                    className="w-full text-left p-3 rounded-xl bg-surface hover:bg-surface-container-low">
                    <div className="flex justify-between gap-2"><p className="font-label-lg text-label-lg">{g.nombre}</p><span className="text-label-md text-secondary">{g.ocupados}/{g.cupo}</span></div>
                    <p className="text-body-sm text-secondary">{horarios(g.horarios)}{g.profesor ? ` · ${g.profesor}` : ''}</p>
                    <Barra valor={g.ocupados} max={g.cupo} tono={g.vacantes ? 'primario' : 'critico'} className="mt-2" />
                  </button>
                ))}
                <Boton chico variante="suave" icono="add" onClick={() => setGrupo({ actividad_id: a.id, nombre: '', cupo: 20, edad_min: '', edad_max: '', profesor_id: '', temporada_id: '', horarios: [{ ...vacioHorario }] })}>Agregar grupo</Boton>
              </Tarjeta>
            ))}
          </div>
        )}
      </Consulta>

      <Modal abierto={!!actividad} titulo={actividad?.id ? 'Editar actividad' : 'Nueva actividad'} onCerrar={() => setActividad(null)} pie={<Boton cargando={guardarActividad.isPending} onClick={() => guardarActividad.mutate()}>Guardar</Boton>}>
        {actividad && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={actividad.nombre} onChange={(e) => setActividad({ ...actividad, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><Selector value={actividad.tipo} onChange={(e) => setActividad({ ...actividad, tipo: e.target.value })} opciones={[{ value: 'deportiva', label: 'Deportiva' }, { value: 'acuatica', label: 'Acuática' }, { value: 'cultural', label: 'Cultural' }, { value: 'social', label: 'Social' }]} /></Campo>
            <Campo etiqueta="Ícono (Material Symbols)"><Entrada value={actividad.icono ?? ''} onChange={(e) => setActividad({ ...actividad, icono: e.target.value })} /></Campo>
            <Campo etiqueta="Subcomisión"><Selector value={actividad.subcomision_id} onChange={(e) => setActividad({ ...actividad, subcomision_id: e.target.value })} vacio="Ninguna" opciones={(op.data?.subcomisiones ?? []).map((s) => ({ value: s.id, label: s.nombre }))} /></Campo>
            <Campo etiqueta="Día de vencimiento del arancel"><Entrada type="number" min="1" max="28" value={actividad.dia_vencimiento} onChange={(e) => setActividad({ ...actividad, dia_vencimiento: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción" className="sm:col-span-2"><Area value={actividad.descripcion ?? ''} onChange={(e) => setActividad({ ...actividad, descripcion: e.target.value })} /></Campo>
            <Casilla checked={actividad.activa} onChange={(e) => setActividad({ ...actividad, activa: e.target.checked })} etiqueta="Activa (visible en el catálogo)" className="sm:col-span-2" />
          </div>
        )}
      </Modal>

      <Modal abierto={!!grupo} titulo={grupo?.id ? 'Editar grupo' : 'Nuevo grupo'} onCerrar={() => setGrupo(null)} ancho="max-w-2xl" pie={<Boton cargando={guardarGrupo.isPending} onClick={() => guardarGrupo.mutate()}>Guardar</Boton>}>
        {grupo && (
          <div className="space-y-space-md">
            <div className="grid sm:grid-cols-3 gap-space-md">
              <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={grupo.nombre} onChange={(e) => setGrupo({ ...grupo, nombre: e.target.value })} /></Campo>
              <Campo etiqueta="Cupo"><Entrada type="number" min="1" value={grupo.cupo} onChange={(e) => setGrupo({ ...grupo, cupo: e.target.value })} /></Campo>
              <Campo etiqueta="Edad mínima"><Entrada type="number" value={grupo.edad_min} onChange={(e) => setGrupo({ ...grupo, edad_min: e.target.value })} /></Campo>
              <Campo etiqueta="Edad máxima"><Entrada type="number" value={grupo.edad_max} onChange={(e) => setGrupo({ ...grupo, edad_max: e.target.value })} /></Campo>
              <Campo etiqueta="Temporada"><Selector value={grupo.temporada_id} onChange={(e) => setGrupo({ ...grupo, temporada_id: e.target.value })} vacio="—" opciones={(op.data?.temporadas ?? []).map((t) => ({ value: t.id, label: t.nombre }))} /></Campo>
              <Campo etiqueta="Profesor" className="sm:col-span-3"><Selector value={grupo.profesor_id} onChange={(e) => setGrupo({ ...grupo, profesor_id: e.target.value })} vacio="Sin profesor" opciones={(op.data?.profesores ?? []).map((p) => ({ value: p.id, label: p.nombre }))} /></Campo>
            </div>
            <div>
              <p className="etiqueta mb-2">Horarios</p>
              {grupo.horarios.map((h, i) => {
                const cambiar = (k, v) => setGrupo({ ...grupo, horarios: grupo.horarios.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
                return (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_100px_100px_1fr_auto] gap-2 mb-2">
                    <Selector value={h.dia_semana} onChange={(e) => cambiar('dia_semana', e.target.value)} opciones={DIAS.map((d, k) => ({ value: k, label: d }))} />
                    <Entrada type="time" value={h.hora_inicio} onChange={(e) => cambiar('hora_inicio', e.target.value)} />
                    <Entrada type="time" value={h.hora_fin} onChange={(e) => cambiar('hora_fin', e.target.value)} />
                    <Selector value={h.espacio_id} onChange={(e) => cambiar('espacio_id', e.target.value)} vacio="Espacio" opciones={(op.data?.espacios ?? []).map((x) => ({ value: x.id, label: x.nombre }))} />
                    <Boton variante="fantasma" icono="delete" aria-label="Quitar" onClick={() => setGrupo({ ...grupo, horarios: grupo.horarios.filter((_, j) => j !== i) })} />
                  </div>
                );
              })}
              <Boton chico variante="suave" icono="add" onClick={() => setGrupo({ ...grupo, horarios: [...grupo.horarios, { ...vacioHorario }] })}>Horario</Boton>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function limpiarActividad(a) {
  return { nombre: a.nombre, tipo: a.tipo, descripcion: a.descripcion || undefined, icono: a.icono || undefined, subcomision_id: a.subcomision_id || null, dia_vencimiento: Number(a.dia_vencimiento), activa: !!a.activa };
}
