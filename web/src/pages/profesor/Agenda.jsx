import { Link } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { fechaLarga, relativa } from '../../lib/formato.js';
import { Icono, Boton, Tarjeta, Consulta, Kpi, Grilla, Vacio, Fila, Barra, Estado, cx } from '../../components/ui.jsx';

export default function Agenda() {
  const q = useDatos('/api/clases/inicio', { refetchInterval: 60_000 });
  return (
    <Consulta q={q}>
      {(d) => (
        <div className="space-y-space-md">
          <div>
            <p className="font-label-sm text-label-sm uppercase text-primary-container">Agenda del día</p>
            <h1 className="text-headline-lg-mobile lg:text-headline-lg capitalize">{fechaLarga(d.hoy.fecha)}</h1>
          </div>
          <Grilla cols="grid-cols-3">
            <Kpi etiqueta="Clases hoy" valor={d.clases.length} icono="today" />
            <Kpi etiqueta="Mis grupos" valor={d.grupos} icono="groups" a="/mis-grupos" />
            <Kpi etiqueta="Alumnos" valor={d.alumnos_total} icono="person" />
          </Grilla>
          <Tarjeta titulo="Clases" icono="schedule" cuerpo="p-space-md space-y-3">
            {d.clases.length === 0 ? <Vacio icono="event_busy" titulo="Hoy no tenés clases" /> : d.clases.map((c, i) => (
              <div key={i} className={cx('p-space-md rounded-xl border', c.en_curso ? 'border-primary-container bg-critico-suave/30' : 'border-surface-container bg-surface')}>
                <div className="flex items-start gap-3">
                  <div className="text-center w-16 shrink-0">
                    <p className="text-headline-sm font-extrabold tabular-nums">{c.hora_inicio}</p>
                    <p className="text-body-sm text-secondary">{c.hora_fin}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-headline-sm text-headline-sm">{c.actividad}</p>
                      {c.en_curso && <Estado tono="critico" texto="En curso" icono="radio_button_checked" />}
                    </div>
                    <p className="text-body-sm text-secondary">{c.grupo} · {c.espacio}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Barra valor={c.presentes} max={c.alumnos} tono="exito" className="flex-1" />
                      <span className="text-label-sm text-secondary">{c.presentes}/{c.alumnos} presentes</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Boton chico icono="qr_code_scanner" as="link" to="/fichaje">Fichar</Boton>
                  <Boton chico variante="suave" icono="fact_check" as="link" to={`/asistencia?grupo=${c.grupo_id}`}>Planilla</Boton>
                </div>
              </div>
            ))}
          </Tarjeta>
          <Tarjeta titulo="Avisos" icono="notifications" cuerpo="p-space-md space-y-2">
            {d.avisos.length === 0 ? <p className="text-body-sm text-secondary">Sin avisos nuevos.</p> : d.avisos.map((a) => <Fila key={a.id} icono="notifications_active" titulo={a.titulo} detalle={relativa(a.creada_en)} a={a.referencia} />)}
          </Tarjeta>
          <Link to="/reportar-problema" className="flex items-center gap-3 p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container">
            <Icono n="report" className="text-primary-container" /><span className="flex-1 font-label-lg text-label-lg">¿Algo roto en tu espacio? Reportá un problema</span><Icono n="chevron_right" />
          </Link>
        </div>
      )}
    </Consulta>
  );
}
