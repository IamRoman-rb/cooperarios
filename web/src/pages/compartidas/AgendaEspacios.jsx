// Agenda semanal de espacios: clases, reservas y bloqueos. La usan el delegado (grupos, espacios y reservas
// de su actividad), mantenimiento (planificar intervenciones) y Administración.
import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { hoy, sumarDias, fechaCorta, hora, DIAS_CORTOS, capitalizar } from '../../lib/formato.js';
import { Boton, Encabezado, Consulta, Selector, Modal, Campo, Entrada, Estado, cx } from '../../components/ui.jsx';

export function lunesDe(f) {
  const d = new Date(`${f}T12:00:00-03:00`).getDay();
  return sumarDias(f, d === 0 ? -6 : 1 - d);
}

export default function AgendaEspacios({ modo }) {
  const [semana, setSemana] = useState(lunesDe(hoy()));
  const [espacio, setEspacio] = useState('');
  const [bloqueo, setBloqueo] = useState(null);
  const { puede, roles } = useSesion();
  const fin = sumarDias(semana, 6);
  const q = useDatos(`/api/espacios/calendario?desde=${semana}&hasta=${fin}${espacio ? `&espacio_id=${espacio}` : ''}`);
  const espacios = useDatos('/api/espacios');
  const tablero = useDatos(modo === 'subcomision' ? '/api/tablero' : null);
  const bloquear = useAccion(() => api.post('/api/espacios/bloqueos', { espacio_id: bloqueo.espacio_id, desde: new Date(`${bloqueo.dia}T${bloqueo.desde}:00-03:00`).toISOString(), hasta: new Date(`${bloqueo.dia}T${bloqueo.hasta}:00-03:00`).toISOString(), motivo: bloqueo.motivo }), {
    ok: 'Bloqueo registrado', invalidar: ['/api/espacios'], alTerminar: () => setBloqueo(null),
  });
  const reservaClase = useAccion(() => api.post('/api/espacios/reservas', { espacio_id: bloqueo.espacio_id, tipo: bloqueo.tipo, inicio: new Date(`${bloqueo.dia}T${bloqueo.desde}:00-03:00`).toISOString(), fin: new Date(`${bloqueo.dia}T${bloqueo.hasta}:00-03:00`).toISOString() }), {
    ok: 'Reserva registrada', invalidar: ['/api/espacios'], alTerminar: () => setBloqueo(null),
  });
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(semana, i));
  const nombreEspacio = espacios.data?.find((e) => String(e.id) === String(espacio))?.nombre;
  const actividadesAmbito = modo === 'subcomision' ? (tablero.data?.actividades ?? []).map((a) => a.nombre) : null;

  return (
    <>
      <Encabezado titulo={modo === 'mantenimiento' ? 'Agenda de espacios' : 'Agenda'} subtitulo={modo === 'mantenimiento' ? 'Uso y bloqueos de espacios para planificar intervenciones.' : 'Grupos, espacios y reservas de tu actividad.'}
        acciones={<>
          {puede('reservas', 'gestionar') && <Boton variante="secundario" icono="block" onClick={() => setBloqueo({ accion: 'bloqueo', espacio_id: espacio || espacios.data?.[0]?.id, dia: hoy(), desde: '08:00', hasta: '12:00', motivo: '' })}>Bloquear espacio</Boton>}
          {modo === 'subcomision' && puede('reservas', 'gestionar_ambito') && <Boton icono="event" onClick={() => setBloqueo({ accion: 'reserva', tipo: 'torneo', espacio_id: espacio || espacios.data?.[0]?.id, dia: hoy(), desde: '09:00', hasta: '13:00' })}>Reservar para la actividad</Boton>}
        </>} />
      <div className="flex flex-wrap items-center gap-2 mb-space-md">
        <Boton chico variante="suave" icono="chevron_left" aria-label="Semana anterior" onClick={() => setSemana(sumarDias(semana, -7))} />
        <span className="font-label-lg text-label-lg min-w-40 text-center">{fechaCorta(semana)} – {fechaCorta(fin)}</span>
        <Boton chico variante="suave" icono="chevron_right" aria-label="Semana siguiente" onClick={() => setSemana(sumarDias(semana, 7))} />
        <Boton chico variante="fantasma" onClick={() => setSemana(lunesDe(hoy()))}>Hoy</Boton>
        <Selector value={espacio} onChange={(e) => setEspacio(e.target.value)} vacio="Todos los espacios" opciones={(espacios.data ?? []).map((e) => ({ value: e.id, label: e.nombre }))} className="sm:w-64 ml-auto" />
      </div>
      <Consulta q={q}>
        {(d) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
            {dias.map((f) => {
              const dow = new Date(`${f}T12:00:00-03:00`).getDay();
              const inicioDia = new Date(`${f}T00:00:00-03:00`).toISOString();
              const finDia = new Date(`${f}T23:59:59-03:00`).toISOString();
              const clases = d.clases.filter((c) => c.dia_semana === dow && (!espacio || nombreEspacio === c.espacio) && (!actividadesAmbito || actividadesAmbito.includes(c.actividad)));
              const reservas = d.reservas.filter((r) => r.inicio < finDia && r.fin > inicioDia && r.estado === 'confirmada');
              const bloqueos = d.bloqueos.filter((b) => b.desde < finDia && b.hasta > inicioDia);
              const items = [
                ...clases.map((c) => ({ ini: c.hora_inicio, fin: c.hora_fin, titulo: `${c.actividad} · ${c.grupo}`, lugar: c.espacio, tipo: 'clase' })),
                ...reservas.map((r) => ({ ini: hora(r.inicio), fin: hora(r.fin), titulo: r.tipo === 'socio' ? `Reserva${r.persona ? ` · ${r.persona}` : ''}` : capitalizar(r.tipo), lugar: r.espacio, tipo: 'reserva' })),
                ...bloqueos.map((b) => ({ ini: hora(b.desde), fin: hora(b.hasta), titulo: b.motivo, lugar: b.espacio, tipo: 'bloqueo' })),
              ].sort((a, b) => a.ini.localeCompare(b.ini));
              return (
                <div key={f} className={cx('rounded-xl p-2 min-h-32', f === hoy() ? 'bg-critico-suave/40 ring-1 ring-primary-container/30' : 'bg-surface-container-low')}>
                  <p className="font-label-md text-label-md uppercase text-graphite px-1 pb-2">{DIAS_CORTOS[dow]} {f.slice(8)}</p>
                  <div className="space-y-1.5">
                    {items.length === 0 && <p className="text-body-sm text-secondary px-1">Libre</p>}
                    {items.map((it, i) => (
                      <div key={i} className={cx('rounded-lg p-2 text-body-sm border-l-4', it.tipo === 'clase' ? 'bg-surface-container-lowest border-graphite' : it.tipo === 'reserva' ? 'bg-surface-container-lowest border-exito' : 'bg-alerta-suave border-alerta')}>
                        <p className="font-semibold tabular-nums">{it.ini}–{it.fin}</p>
                        <p className="leading-tight">{it.titulo}</p>
                        {!espacio && <p className="text-secondary leading-tight">{it.lugar}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Consulta>
      <div className="flex flex-wrap gap-3 mt-space-md text-body-sm text-secondary">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-graphite" />Clases</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-exito" />Reservas</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-alerta" />Bloqueos</span>
      </div>
      <Modal abierto={!!bloqueo} titulo={bloqueo?.accion === 'reserva' ? 'Reservar para la actividad' : 'Bloquear espacio'} onCerrar={() => setBloqueo(null)}
        pie={<Boton cargando={bloquear.isPending || reservaClase.isPending} onClick={() => (bloqueo.accion === 'reserva' ? reservaClase.mutate() : bloquear.mutate())} disabled={bloqueo?.accion === 'bloqueo' && (bloqueo?.motivo ?? '').length < 3}>Guardar</Boton>}>
        {bloqueo && (
          <div className="grid grid-cols-2 gap-space-md">
            <Campo etiqueta="Espacio" className="col-span-2"><Selector value={bloqueo.espacio_id} onChange={(e) => setBloqueo({ ...bloqueo, espacio_id: e.target.value })} opciones={(espacios.data ?? []).map((e) => ({ value: e.id, label: e.nombre }))} /></Campo>
            <Campo etiqueta="Día" className="col-span-2"><Entrada type="date" value={bloqueo.dia} onChange={(e) => setBloqueo({ ...bloqueo, dia: e.target.value })} /></Campo>
            <Campo etiqueta="Desde"><Entrada type="time" value={bloqueo.desde} onChange={(e) => setBloqueo({ ...bloqueo, desde: e.target.value })} /></Campo>
            <Campo etiqueta="Hasta"><Entrada type="time" value={bloqueo.hasta} onChange={(e) => setBloqueo({ ...bloqueo, hasta: e.target.value })} /></Campo>
            {bloqueo.accion === 'reserva'
              ? <Campo etiqueta="Tipo" className="col-span-2"><Selector value={bloqueo.tipo} onChange={(e) => setBloqueo({ ...bloqueo, tipo: e.target.value })} opciones={[{ value: 'torneo', label: 'Torneo' }, { value: 'clase', label: 'Clase / entrenamiento' }]} /></Campo>
              : <Campo etiqueta="Motivo" className="col-span-2"><Entrada value={bloqueo.motivo} onChange={(e) => setBloqueo({ ...bloqueo, motivo: e.target.value })} placeholder="Mantenimiento, torneo, evento…" /></Campo>}
            {roles.some((r) => r.codigo === 'subcomision') && <p className="col-span-2 text-body-sm text-secondary"><Estado tono="info" texto="Ámbito" /> Solo se reservan espacios para tu actividad.</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
