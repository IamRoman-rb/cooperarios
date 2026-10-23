import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { DIAS, fechaLarga, hora, hoy } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Fila, Modal, Campo, Entrada, Selector, Vacio, Aviso } from '../../components/ui.jsx';

/** Horarios, espacios asignados y reservas de cancha para clases. */
export default function Calendario() {
  const q = useDatos('/api/clases/calendario');
  const [reserva, setReserva] = useState(null);
  const reservar = useAccion(() => api.post('/api/espacios/reservas', {
    espacio_id: reserva.espacio_id, tipo: 'clase',
    inicio: new Date(`${reserva.dia}T${reserva.desde}:00-03:00`).toISOString(), fin: new Date(`${reserva.dia}T${reserva.hasta}:00-03:00`).toISOString(),
  }), { ok: 'Reserva para clase registrada', invalidar: ['/api/clases'], alTerminar: () => setReserva(null) });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Calendario y espacios" subtitulo="Tus horarios semanales y las reservas de canchas para clases."
            acciones={<Boton icono="sports_tennis" onClick={() => setReserva({ espacio_id: d.espacios.find((e) => e.reservable)?.id, dia: hoy(), desde: '17:00', hasta: '18:00' })}>Reservar para clase</Boton>} />
          <div className="grid lg:grid-cols-3 gap-space-md">
            <Tarjeta className="lg:col-span-2" titulo="Semana" icono="calendar_view_week" cuerpo="p-space-md">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
                  const clases = d.grupos.flatMap((g) => g.horarios.filter((h) => h.dia_semana === dia).map((h) => ({ ...h, actividad: g.actividad, grupo: g.nombre }))).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
                  return (
                    <div key={dia} className="rounded-xl bg-surface-container-low p-2">
                      <p className="font-label-md text-label-md uppercase text-graphite px-1 pb-1.5">{DIAS[dia]}</p>
                      {clases.length === 0 ? <p className="text-body-sm text-secondary px-1">Libre</p> : clases.map((c, i) => (
                        <div key={i} className="rounded-lg bg-surface-container-lowest p-2 mb-1.5 border-l-4 border-primary-container text-body-sm">
                          <p className="font-semibold tabular-nums">{c.hora_inicio}–{c.hora_fin}</p>
                          <p>{c.actividad} · {c.grupo}</p>
                          <p className="text-secondary">{c.espacio}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Tarjeta>
            <div className="space-y-space-md">
              <Tarjeta titulo="Reservas para clases" icono="event_available" cuerpo="p-space-md space-y-2">
                {d.reservas.length === 0 ? <Vacio titulo="Sin reservas próximas" /> : d.reservas.map((r) => <Fila key={r.id} icono="sports_tennis" titulo={r.espacio} detalle={`${fechaLarga(r.inicio)} · ${hora(r.inicio)}–${hora(r.fin)}`} />)}
              </Tarjeta>
              {d.bloqueos.length > 0 && (
                <Tarjeta titulo="Espacios bloqueados" icono="block" cuerpo="p-space-md space-y-2">
                  {d.bloqueos.map((b) => <Aviso key={b.id} tono="alerta" titulo={b.espacio}>{fechaLarga(b.desde)} {hora(b.desde)}–{hora(b.hasta)}: {b.motivo}</Aviso>)}
                </Tarjeta>
              )}
            </div>
          </div>
          <Modal abierto={!!reserva} titulo="Reservar cancha para clase" onCerrar={() => setReserva(null)} pie={<Boton cargando={reservar.isPending} onClick={() => reservar.mutate()}>Reservar</Boton>}>
            {reserva && (
              <div className="grid grid-cols-2 gap-space-md">
                <Campo etiqueta="Espacio" className="col-span-2"><Selector value={reserva.espacio_id} onChange={(e) => setReserva({ ...reserva, espacio_id: e.target.value })} opciones={d.espacios.filter((e) => e.reservable).map((e) => ({ value: e.id, label: e.nombre }))} /></Campo>
                <Campo etiqueta="Día" className="col-span-2"><Entrada type="date" min={hoy()} value={reserva.dia} onChange={(e) => setReserva({ ...reserva, dia: e.target.value })} /></Campo>
                <Campo etiqueta="Desde"><Entrada type="time" value={reserva.desde} onChange={(e) => setReserva({ ...reserva, desde: e.target.value })} /></Campo>
                <Campo etiqueta="Hasta"><Entrada type="time" value={reserva.hasta} onChange={(e) => setReserva({ ...reserva, hasta: e.target.value })} /></Campo>
              </div>
            )}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
