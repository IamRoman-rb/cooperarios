import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { hoy, sumarDias, fechaLarga, hora, pesos, DIAS_CORTOS } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Vacio, Modal, Aviso, cx } from '../../components/ui.jsx';

const HORAS = Array.from({ length: 15 }, (_, i) => 8 + i); // 8 a 22 hs

/** Convierte fecha + hora local de Buenos Aires a ISO UTC. */
const iso = (f, h) => new Date(`${f}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();

export default function Reservas() {
  const q = useDatos('/api/socio/reservas');
  const [espacio, setEspacio] = useState(null);
  const [dia, setDia] = useState(hoy());
  const [turno, setTurno] = useState(null);
  const [cancelar, setCancelar] = useState(null);
  const espacioId = espacio ?? q.data?.espacios[0]?.id;
  const disp = useDatos(espacioId ? `/api/socio/reservas/disponibilidad?espacio_id=${espacioId}&fecha=${dia}` : null);
  const reservar = useAccion((h) => api.post('/api/socio/reservas', { espacio_id: espacioId, inicio: iso(dia, h), fin: iso(dia, h + 1) }), {
    ok: 'Reserva confirmada', invalidar: ['/api/socio'], alTerminar: () => setTurno(null),
  });
  const anular = useAccion((id) => api.post(`/api/socio/reservas/${id}/cancelar`), { ok: 'Reserva cancelada', invalidar: ['/api/socio'], alTerminar: () => setCancelar(null) });

  const ocupado = (h) => {
    const ini = iso(dia, h);
    const fin = iso(dia, h + 1);
    const d = disp.data;
    if (!d) return null;
    if (d.bloqueos.some((b) => b.desde < fin && b.hasta > ini)) return 'bloqueado';
    if (d.ocupado.some((r) => r.inicio < fin && r.fin > ini)) return 'ocupado';
    if (new Date(ini) < new Date()) return 'pasado';
    return null;
  };

  return (
    <Consulta q={q}>
      {(d) => {
        const e = d.espacios.find((x) => x.id === espacioId);
        const dias = Array.from({ length: (e?.anticipacion_dias ?? 7) + 1 }, (_, i) => sumarDias(hoy(), i)).slice(0, 14);
        return (
          <>
            <Encabezado titulo="Reservas de canchas y espacios" subtitulo="Elegí el espacio, el día y el horario libre." />
            <div className="flex gap-2 overflow-x-auto sin-scroll mb-space-md">
              {d.espacios.map((x) => (
                <button key={x.id} onClick={() => setEspacio(x.id)} className={cx('h-10 px-4 rounded-full whitespace-nowrap text-label-lg border', x.id === espacioId ? 'bg-primary-container text-on-primary border-primary-container' : 'bg-surface-container-lowest border-surface-container')}>{x.nombre}</button>
              ))}
            </div>
            {e && (
              <div className="grid lg:grid-cols-3 gap-space-md">
                <Tarjeta className="lg:col-span-2" titulo={fechaLarga(dia)} icono="calendar_month" subtitulo={e.tarifa_hora ? `Alquiler ${pesos(e.tarifa_hora)} por hora` : 'Sin cargo para socios'}>
                  <div className="flex gap-1.5 overflow-x-auto sin-scroll pb-2 mb-3">
                    {dias.map((f) => (
                      <button key={f} onClick={() => setDia(f)} className={cx('w-14 shrink-0 py-2 rounded-xl flex flex-col items-center', f === dia ? 'bg-graphite text-white' : 'bg-surface hover:bg-surface-container-low')}>
                        <span className="text-label-sm uppercase">{DIAS_CORTOS[new Date(`${f}T12:00:00-03:00`).getDay()]}</span>
                        <span className="font-bold text-body-lg">{f.slice(8)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {HORAS.map((h) => {
                      const estado = ocupado(h);
                      return (
                        <button key={h} disabled={!!estado} onClick={() => setTurno(h)}
                          className={cx('h-14 rounded-xl text-label-lg flex flex-col items-center justify-center border transition-colors',
                            !estado && 'bg-exito-suave/60 border-exito/20 text-exito hover:bg-exito-suave',
                            estado === 'ocupado' && 'bg-critico-suave/60 border-transparent text-critico/70 cursor-not-allowed',
                            estado === 'bloqueado' && 'bg-alerta-suave/60 border-transparent text-alerta cursor-not-allowed',
                            estado === 'pasado' && 'bg-surface border-transparent text-secondary/50 cursor-not-allowed')}>
                          {String(h).padStart(2, '0')}:00
                          <span className="text-[10px] font-normal">{estado === 'ocupado' ? 'Ocupado' : estado === 'bloqueado' ? 'Bloqueado' : estado === 'pasado' ? '—' : 'Libre'}</span>
                        </button>
                      );
                    })}
                  </div>
                  {disp.data?.bloqueos.map((b, i) => <p key={i} className="text-body-sm text-alerta mt-2">Bloqueo {hora(b.desde)}–{hora(b.hasta)}: {b.motivo}</p>)}
                </Tarjeta>
                <div className="space-y-space-md">
                  <Aviso tono="info" titulo="Reglamento">
                    Reservás con hasta {e.anticipacion_dias} días de anticipación, hasta {e.max_activas} reservas activas, y cancelás con {e.cancelacion_horas} horas de aviso.{e.sancion ? ` ${e.sancion}.` : ''}
                  </Aviso>
                  <Tarjeta titulo="Mis reservas" icono="event_available" cuerpo="p-space-md space-y-2">
                    {d.mis_reservas.length === 0 ? <Vacio titulo="Sin reservas" /> : d.mis_reservas.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface">
                        <div className="flex-1 min-w-0">
                          <p className="font-label-lg text-label-lg truncate">{r.espacio}</p>
                          <p className="text-body-sm text-secondary">{fechaLarga(r.inicio)} · {hora(r.inicio)}–{hora(r.fin)}</p>
                        </div>
                        {r.estado === 'confirmada' && new Date(r.inicio) > new Date() ? <Boton chico variante="fantasma" onClick={() => setCancelar(r)}>Cancelar</Boton> : <Estado valor={r.estado} />}
                      </div>
                    ))}
                  </Tarjeta>
                </div>
              </div>
            )}
            <Modal abierto={turno != null} titulo="Confirmar reserva" onCerrar={() => setTurno(null)}
              pie={<><Boton variante="suave" onClick={() => setTurno(null)}>Volver</Boton><Boton cargando={reservar.isPending} onClick={() => reservar.mutate(turno)}>Reservar</Boton></>}>
              <p className="text-body-md"><strong>{e?.nombre}</strong><br />{fechaLarga(dia)} de {turno}:00 a {turno + 1}:00 hs.</p>
            </Modal>
            <Modal abierto={!!cancelar} titulo="Cancelar reserva" onCerrar={() => setCancelar(null)}
              pie={<><Boton variante="suave" onClick={() => setCancelar(null)}>Volver</Boton><Boton variante="peligro" cargando={anular.isPending} onClick={() => anular.mutate(cancelar.id)}>Cancelar reserva</Boton></>}>
              <p>{cancelar?.espacio} · {cancelar && fechaLarga(cancelar.inicio)} {cancelar && hora(cancelar.inicio)}</p>
            </Modal>
          </>
        );
      }}
    </Consulta>
  );
}
