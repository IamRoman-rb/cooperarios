import { Link } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { pesos, fecha, fechaLarga, DIAS, hora, relativa } from '../../lib/formato.js';
import { Icono, Boton, Tarjeta, Consulta, Estado, Fila, Avatar, Aviso, Vacio } from '../../components/ui.jsx';

export default function Inicio() {
  const q = useDatos('/api/mi/inicio');
  return (
    <Consulta q={q}>
      {(d) => (
        <div className="space-y-space-md">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-container to-primary text-on-primary p-space-lg">
            <Icono n="shield" relleno className="absolute -right-4 -bottom-6 text-white/10" tam={150} />
            <div className="relative flex items-center gap-4">
              <Avatar persona={d.persona} tam={56} className="ring-2 ring-white/40" />
              <div className="min-w-0">
                <p className="font-label-sm text-label-sm uppercase tracking-wider text-white/80">{d.socio ? `Socio N° ${d.socio.nro_socio} · ${d.socio.categoria}` : 'Portal del socio'}</p>
                <h1 className="text-headline-lg-mobile text-white">¡Hola, {d.persona.nombre}!</h1>
              </div>
            </div>
            <div className="relative grid grid-cols-2 gap-3 mt-space-md">
              <div className="rounded-xl bg-white/15 backdrop-blur-sm p-3">
                <p className="text-label-sm uppercase text-white/80">Saldo pendiente</p>
                <p className="text-headline-md text-white">{pesos(d.cuenta.deuda)}</p>
                <p className="text-body-sm text-white/80">{d.cuenta.vencido > 0 ? `${pesos(d.cuenta.vencido)} vencido` : d.cuenta.proximo_vencimiento ? `Vence ${fecha(d.cuenta.proximo_vencimiento)}` : 'Estás al día'}</p>
              </div>
              <Link to="/credencial" className="rounded-xl bg-white text-primary p-3 flex flex-col justify-between hover:bg-surface-container-low">
                <Icono n="qr_code_2" tam={30} />
                <span className="font-label-lg text-label-lg">Mostrar credencial</span>
              </Link>
            </div>
            {d.cuenta.deuda > 0 && <Boton as="link" to="/pagos" variante="blanco" icono="payments" completo className="relative mt-3">Pagar ahora</Boton>}
          </section>

          {d.cuenta.vencido > 0 && (
            <Aviso tono="critico" titulo="Tenés pagos vencidos">Regularizá en Mis pagos para no perder la habilitación de tus actividades.</Aviso>
          )}

          <div className="grid lg:grid-cols-2 gap-space-md">
            <Tarjeta titulo="Habilitación por actividad" icono="verified_user" accion={<Link to="/mis-actividades" className="text-label-md text-primary-container font-semibold">Ver todas</Link>} cuerpo="p-space-md space-y-2">
              {d.habilitacion.length === 0 ? <Vacio icono="sports" titulo="Sin actividades" texto="Explorá el catálogo e inscribite." accion={<Boton as="link" to="/mis-actividades/explorar" chico>Explorar</Boton>} /> :
                d.habilitacion.map((h) => (
                  <Fila key={`${h.persona_id}-${h.actividad_id}`} icono={h.habilitado ? 'check_circle' : 'block'} tono={h.habilitado ? 'exito' : 'critico'}
                    titulo={`${h.actividad}${d.familia.length > 1 ? ` · ${d.familia.find((f) => f.id === h.persona_id)?.nombre}` : ''}`}
                    detalle={h.habilitado ? (h.apto?.requiere ? `Apto vigente hasta ${fecha(h.apto.vence_en)}` : 'Podés ingresar') : h.mensaje}
                    derecha={<Estado valor={h.habilitado ? 'habilitado' : 'denegado'} texto={h.habilitado ? 'Habilitado' : 'No habilitado'} />} />
                ))}
            </Tarjeta>

            <Tarjeta titulo="Próximas clases" icono="event" cuerpo="p-space-md space-y-2">
              {d.proximas.length === 0 ? <Vacio icono="event_busy" titulo="Sin clases esta semana" /> : d.proximas.map((c, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface">
                  <span className="w-12 h-12 rounded-lg bg-primary-fixed text-primary flex flex-col items-center justify-center shrink-0">
                    <span className="font-label-sm text-label-sm uppercase leading-none">{c.en_dias === 0 ? 'Hoy' : DIAS[c.dia_semana].slice(0, 3)}</span>
                    <span className="font-bold text-body-md leading-tight">{c.hora_inicio}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg truncate">{c.actividad} · {c.grupo}</p>
                    <p className="text-body-sm text-secondary truncate">{c.espacio} · hasta {c.hora_fin}{d.familia.length > 1 ? ` · ${c.persona}` : ''}</p>
                  </div>
                </div>
              ))}
            </Tarjeta>

            <Tarjeta titulo="Avisos" icono="notifications" accion={<Link to="/novedades" className="text-label-md text-primary-container font-semibold">Novedades</Link>} cuerpo="p-space-md space-y-2">
              {d.avisos.length === 0 && d.comunicados.length === 0 ? <Vacio icono="notifications_off" titulo="Sin avisos nuevos" /> : (
                <>
                  {d.avisos.map((a) => <Fila key={a.id} icono="notifications_active" tono="alerta" titulo={a.titulo} detalle={relativa(a.creada_en)} a={a.referencia} />)}
                  {d.comunicados.map((c) => <Fila key={`c${c.id}`} icono="campaign" titulo={c.titulo} detalle={`${fechaLarga(c.publicado_en)} · ${c.categoria}`} a="/novedades" />)}
                </>
              )}
            </Tarjeta>

            <Tarjeta titulo="Mis reservas" icono="event_available" accion={<Link to="/reservas" className="text-label-md text-primary-container font-semibold">Reservar</Link>} cuerpo="p-space-md space-y-2">
              {d.reservas.length === 0 ? <Vacio icono="sports_tennis" titulo="No tenés reservas" texto="Reservá canchas y espacios desde el celular." /> :
                d.reservas.map((r) => <Fila key={r.id} icono="sports_tennis" titulo={r.espacio} detalle={`${fechaLarga(r.inicio)} · ${hora(r.inicio)} a ${hora(r.fin)}`} />)}
            </Tarjeta>
          </div>
        </div>
      )}
    </Consulta>
  );
}
