import { Link } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { fechaLarga, fechaCorta, hora } from '../../lib/formato.js';
import { Icono, Boton, Cargando } from '../../components/ui.jsx';

const ACCESOS = [
  { a: '/actividades', icono: 'sports_volleyball', titulo: 'Actividades', detalle: 'Más de 20 disciplinas', tono: 'bg-secondary-container text-on-secondary-fixed' },
  { a: '/cuota-social', icono: 'payments', titulo: 'Valores de cuota', detalle: 'Planes familiares', tono: 'bg-surface-container-high text-primary' },
  { a: '/historia', icono: 'apartment', titulo: 'Instalaciones', detalle: 'Natatorio, canchas y salón', tono: 'bg-surface-container-high text-secondary' },
  { a: '/login', icono: 'qr_code_2', titulo: 'Credencial digital', detalle: 'Ingresá con tu QR', tono: 'bg-primary-fixed text-primary' },
];

const SERVICIOS = [
  { icono: 'pool', nombre: 'Natatorio climatizado', horario: 'Escuela, nado libre y plantel (marzo a noviembre)' },
  { icono: 'badge', nombre: 'Administración', horario: 'Lunes a viernes 9 a 20 · Sábados 9 a 13' },
  { icono: 'fitness_center', nombre: 'Gimnasio de musculación', horario: 'Lunes a viernes 8 a 23 · Sábados 8 a 20' },
];

/** ¿Está abierto el club ahora? Lunes a viernes 8–23, sábados 8–20, domingos 9–18. */
function abiertoAhora(h) {
  if (!h) return false;
  const [dia, min] = [h.diaSemana, h.minutos];
  const rango = dia === 0 ? [9, 18] : dia === 6 ? [8, 20] : [8, 23];
  return min >= rango[0] * 60 && min < rango[1] * 60;
}

export default function Inicio() {
  const q = useDatos('/api/publico/inicio');
  const d = q.data;
  const abierto = abiertoAhora(d?.hoy);
  return (
    <div className="max-w-contenido mx-auto px-gutter-sm lg:px-margin pt-space-md">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-container to-primary text-on-primary p-space-lg lg:p-space-xl shadow-md">
        <div className="absolute -right-8 -bottom-8 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <Icono n="shield" relleno className="absolute right-4 top-4 text-white/10 pointer-events-none" tam={140} />
        <div className="relative z-10 max-w-2xl flex flex-col items-start gap-space-sm">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md font-label-sm text-label-sm uppercase tracking-wider">
            <Icono n="verified" tam={15} /> Desde 1942 en Quilmes Oeste
          </span>
          <h1 className="text-headline-xl-mobile lg:text-headline-xl text-white mt-1">Viví el Club Los Cooperarios</h1>
          <p className="text-body-md lg:text-body-lg text-on-primary-container">
            Más que un club, tu segunda casa. Deporte, natatorio climatizado y vida social para toda la familia. Ahora con tu cuenta, tus actividades y tu credencial en el celular.
          </p>
          <div className="flex flex-wrap gap-2 mt-2 w-full sm:w-auto">
            <Boton as="link" to="/cuota-social" variante="blanco" icono="how_to_reg" className="h-12 flex-1 sm:flex-none">¡Hacete socio!</Boton>
            <Boton as="link" to="/actividades" variante="suave" icono="sports_soccer" className="h-12 flex-1 sm:flex-none bg-white/15 text-white hover:bg-white/25">Ver actividades</Boton>
          </div>
        </div>
      </section>

      <section className="mt-space-lg">
        <div className="flex items-center justify-between mb-space-sm">
          <h2 className="font-headline-sm text-headline-sm">Accesos rápidos</h2>
          <span className="font-label-sm text-label-sm text-secondary uppercase">Servicios</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ACCESOS.map((a) => (
            <Link key={a.a} to={a.a} className="min-h-[58px] p-3 rounded-xl bg-surface-container-lowest shadow-sm flex items-center gap-3 active:scale-95 transition-all hover:shadow-n2">
              <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${a.tono}`}><Icono n={a.icono} tam={22} /></span>
              <span className="flex flex-col min-w-0">
                <span className="font-label-md text-label-md text-on-surface truncate">{a.titulo}</span>
                <span className="text-body-sm text-secondary truncate">{a.detalle}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-space-lg mt-space-lg">
        <section className="lg:col-span-1 tarjeta p-space-md">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2"><Icono n="calendar_today" className="text-primary-container" /><h2 className="font-headline-sm text-headline-sm">Hoy en el club</h2></div>
            <span className="font-label-sm text-label-sm text-secondary capitalize">{d ? fechaLarga(d.hoy.fecha) : ''}</span>
          </div>
          <div className="p-3 rounded-lg bg-surface-container-low flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${abierto ? 'bg-exito animate-pulse' : 'bg-secondary'}`} />
              <div className="min-w-0">
                <p className="font-label-md text-label-md font-bold">Sede Andrade 3052</p>
                <p className="text-body-sm text-secondary">{d?.club.horario ?? '—'}</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm shrink-0 ${abierto ? 'bg-exito-suave text-exito' : 'bg-surface-container text-secondary'}`}>{abierto ? 'Abierto ahora' : 'Cerrado'}</span>
          </div>
          <div className="space-y-2">
            {SERVICIOS.map((s) => (
              <div key={s.nombre} className="p-2.5 rounded-lg bg-surface flex items-center gap-2.5">
                <Icono n={s.icono} className="text-primary-container" />
                <div className="min-w-0">
                  <p className="font-label-md text-label-md font-semibold truncate">{s.nombre}</p>
                  <p className="text-body-sm text-secondary">{s.horario}</p>
                </div>
              </div>
            ))}
          </div>
          {d?.proximos?.length > 0 && (
            <div className="mt-4">
              <p className="etiqueta mb-2">Próximos eventos</p>
              {d.proximos.map((p, i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  <span className="w-12 h-12 rounded-lg bg-primary-fixed text-primary flex flex-col items-center justify-center shrink-0">
                    <span className="font-label-sm text-label-sm uppercase leading-none">{fechaCorta(p.desde).split(' ')[1]}</span>
                    <span className="font-headline-sm text-headline-sm font-extrabold leading-none">{fechaCorta(p.desde).split(' ')[0]}</span>
                  </span>
                  <div className="min-w-0"><p className="font-label-lg text-label-lg">{p.motivo}</p><p className="text-body-sm text-secondary">{hora(p.desde)} hs · {p.espacio}</p></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-space-sm">
            <div>
              <h2 className="font-headline-sm text-headline-sm">Novedades</h2>
              <p className="text-body-sm text-secondary">Lo que pasa día a día en Los Cooperarios</p>
            </div>
          </div>
          {q.isLoading ? <Cargando /> : (
            <div className="grid sm:grid-cols-2 gap-4">
              {(d?.novedades ?? []).map((n, i) => (
                <article key={n.id} className="tarjeta overflow-hidden flex flex-col">
                  <div className={`h-28 relative flex items-end p-3 ${i % 2 ? 'bg-gradient-to-br from-graphite to-tertiary' : 'bg-gradient-to-br from-primary-container to-primary'}`}>
                    <Icono n={n.categoria === 'natatorio' ? 'pool' : 'campaign'} className="absolute right-3 top-3 text-white/20" tam={56} />
                    <span className="px-2.5 py-1 rounded-full bg-white/90 text-primary font-label-sm text-label-sm uppercase">{n.categoria}</span>
                  </div>
                  <div className="p-space-md flex flex-col gap-2">
                    <p className="flex items-center gap-1.5 text-secondary font-label-sm text-label-sm"><Icono n="event" tam={16} /> {fechaLarga(n.publicado_en)}</p>
                    <h3 className="font-headline-sm text-headline-sm leading-tight">{n.titulo}</h3>
                    <p className="text-body-sm text-secondary line-clamp-3">{n.cuerpo}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-space-lg tarjeta p-space-lg text-center flex flex-col items-center gap-space-sm">
        <span className="w-14 h-14 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary"><Icono n="groups" tam={32} /></span>
        <h2 className="text-headline-lg-mobile">Formá parte de nuestra familia</h2>
        <p className="text-body-md text-secondary max-w-md">Pedí tu alta en línea y, una vez aprobada, gestioná tus actividades, pagos y revisión médica desde el celular.</p>
        <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto pt-2">
          <Boton as="link" to="/cuota-social" icono="assignment_turned_in" className="h-12">Asociarme en línea</Boton>
          <Boton as="link" to="/contacto" variante="suave" icono="chat">Consultar a Administración</Boton>
        </div>
      </section>
    </div>
  );
}
