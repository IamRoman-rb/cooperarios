// Agenda de revisiones: el médico ve sus turnos y atiende; el auxiliar recibe, confirma y reprograma.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { hoy, sumarDias, fechaLarga, hora } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Kpi, Grilla, Vacio, Modal, Campo, Entrada, Selector, Buscador, Fila } from '../../components/ui.jsx';

export default function AgendaMedica({ modo }) {
  const [dia, setDia] = useState(hoy());
  const q = useDatos(`/api/medico/agenda?fecha=${dia}`);
  const navegar = useNavigate();
  const esMedico = modo === 'medico';
  const [reprogramar, setReprogramar] = useState(null);
  const [nuevo, setNuevo] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const personas = useDatos(nuevo && busqueda.length >= 2 ? `/api/medico/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const estado = useAccion(({ id, ...d }) => api.put(`/api/medico/turnos/${id}`, d), { ok: 'Turno actualizado', invalidar: ['/api/medico'], alTerminar: () => setReprogramar(null) });
  const crear = useAccion(() => api.post('/api/medico/turnos', { persona_id: nuevo.persona.id, tipo_revision_id: nuevo.tipo, inicio: new Date(nuevo.inicio).toISOString() }), { ok: 'Turno agendado', invalidar: ['/api/medico'], alTerminar: () => setNuevo(null) });

  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo={esMedico ? 'Agenda del día' : 'Agenda y recepción'} subtitulo={fechaLarga(dia)}
            acciones={<>
              <Boton chico variante="suave" icono="chevron_left" aria-label="Día anterior" onClick={() => setDia(sumarDias(dia, -1))} />
              <Entrada type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="w-40" />
              <Boton chico variante="suave" icono="chevron_right" aria-label="Día siguiente" onClick={() => setDia(sumarDias(dia, 1))} />
              {!esMedico && <Boton icono="add" onClick={() => { setNuevo({ persona: null, tipo: d.tipos[0]?.id, inicio: `${dia}T10:00` }); setBusqueda(''); }}>Agendar</Boton>}
            </>} />
          <Grilla className="mb-space-md">
            <Kpi etiqueta="Turnos del día" valor={d.turnos.length} icono="event" />
            <Kpi etiqueta="Pedidos sin confirmar" valor={d.solicitados.length} icono="pending" tono="alerta" />
            <Kpi etiqueta="Certificados por validar" valor={d.certificados_pendientes} icono="verified" tono="alerta" a={esMedico ? '/medico/certificados' : '/revision/certificados'} />
            <Kpi etiqueta="Aptos por vencer (30 días)" valor={d.por_vencer} icono="event_upcoming" a={esMedico ? '/medico/pendientes' : '/revision/recordatorios'} />
          </Grilla>
          <div className="grid lg:grid-cols-3 gap-space-md">
            <Tarjeta className="lg:col-span-2" titulo="Turnos" icono="schedule" cuerpo="p-space-md space-y-2">
              {d.turnos.length === 0 ? <Vacio icono="event_busy" titulo="Sin turnos este día" /> : d.turnos.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-surface">
                  <span className="w-14 text-center font-bold text-headline-sm tabular-nums">{hora(t.inicio)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-lg text-label-lg">{t.apellido}, {t.nombre} <span className="text-secondary font-normal">· {t.edad} años{t.nro_socio ? ` · N° ${t.nro_socio}` : ''}</span></p>
                    <p className="text-body-sm text-secondary">{t.tipo}</p>
                  </div>
                  <Estado valor={t.estado} />
                  <div className="flex gap-1">
                    {esMedico && ['confirmado', 'presente', 'solicitado'].includes(t.estado) && <Boton chico icono="stethoscope" onClick={() => navegar(`/medico/revision?persona=${t.persona_id}&turno=${t.id}&tipo=${t.tipo_revision_id}`)}>Atender</Boton>}
                    {!esMedico && t.estado === 'confirmado' && <Boton chico variante="exito" icono="how_to_reg" onClick={() => estado.mutate({ id: t.id, estado: 'presente' })}>Presente</Boton>}
                    {!esMedico && ['confirmado', 'solicitado'].includes(t.estado) && <>
                      <Boton chico variante="suave" onClick={() => setReprogramar({ id: t.id, inicio: '' })}>Reprogramar</Boton>
                      <Boton chico variante="fantasma" onClick={() => estado.mutate({ id: t.id, estado: 'ausente' })}>Ausente</Boton>
                    </>}
                  </div>
                </div>
              ))}
            </Tarjeta>
            <Tarjeta titulo="Pedidos de turno" icono="pending" cuerpo="p-space-md space-y-2">
              {d.solicitados.length === 0 ? <Vacio titulo="Sin pedidos" /> : d.solicitados.map((t) => (
                <Fila key={t.id} icono="person" titulo={`${t.apellido}, ${t.nombre}`} detalle={`${t.tipo} · pidió ${fechaLarga(t.inicio)} ${hora(t.inicio)}`}
                  derecha={!esMedico && <div className="flex gap-1"><Boton chico onClick={() => estado.mutate({ id: t.id, estado: 'confirmado' })}>Confirmar</Boton><Boton chico variante="suave" onClick={() => setReprogramar({ id: t.id, inicio: '' })}>Otro horario</Boton></div>} />
              ))}
            </Tarjeta>
          </div>
          <Modal abierto={!!reprogramar} titulo="Reprogramar turno" onCerrar={() => setReprogramar(null)}
            pie={<Boton cargando={estado.isPending} disabled={!reprogramar?.inicio} onClick={() => estado.mutate({ id: reprogramar.id, estado: 'reprogramado', inicio: new Date(reprogramar.inicio).toISOString() })}>Guardar</Boton>}>
            <Campo etiqueta="Nuevo día y horario"><Entrada type="datetime-local" value={reprogramar?.inicio ?? ''} onChange={(e) => setReprogramar({ ...reprogramar, inicio: e.target.value })} /></Campo>
          </Modal>
          <Modal abierto={!!nuevo} titulo="Agendar turno" onCerrar={() => setNuevo(null)}
            pie={<Boton cargando={crear.isPending} disabled={!nuevo?.persona} onClick={() => crear.mutate()}>Agendar</Boton>}>
            {nuevo && (
              <div className="space-y-space-md">
                {nuevo.persona ? <Fila icono="person" titulo={`${nuevo.persona.apellido}, ${nuevo.persona.nombre}`} detalle={`DNI ${nuevo.persona.dni}`} derecha={<Boton chico variante="fantasma" onClick={() => setNuevo({ ...nuevo, persona: null })}>Cambiar</Boton>} /> : (
                  <>
                    <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Apellido, DNI o N° de socio" />
                    <div className="space-y-1 max-h-60 overflow-y-auto">{(personas.data ?? []).map((p) => <Fila key={p.id} icono="person" titulo={`${p.apellido}, ${p.nombre}`} detalle={`DNI ${p.dni} · ${p.edad} años`} onClick={() => setNuevo({ ...nuevo, persona: p })} />)}</div>
                  </>
                )}
                <Campo etiqueta="Tipo de revisión"><Selector value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} opciones={d.tipos.map((t) => ({ value: t.id, label: t.nombre }))} /></Campo>
                <Campo etiqueta="Día y hora"><Entrada type="datetime-local" value={nuevo.inicio} onChange={(e) => setNuevo({ ...nuevo, inicio: e.target.value })} /></Campo>
              </div>
            )}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
