import { Icono, Tarjeta, Encabezado } from '../../components/ui.jsx';

const HITOS = [
  { anio: '1942', titulo: 'Nace la colonia cooperativa', texto: 'El 6 de septiembre un grupo de tejedores se organiza como cooperativa en busca de vivienda propia y cultura: la primera colonia de cooperadores del país.' },
  { anio: 'Décadas siguientes', titulo: 'Del cooperativismo al deporte', texto: 'Las actividades deportivas y socioculturales reemplazan a las tareas cooperativas y se crea la Asociación Mutual para administrar las instalaciones.' },
  { anio: '2008', titulo: 'Natatorio climatizado', texto: 'Se inaugura la pileta climatizada, que amplía la base de socios del club.' },
  { anio: '2022', titulo: '80° aniversario', texto: 'El club celebra ocho décadas de historia en Quilmes Oeste.' },
  { anio: '2026', titulo: 'Club digital', texto: 'Socios, actividades, pagos, revisión médica y accesos en una sola plataforma.' },
];

const INSTALACIONES = [
  { icono: 'pool', nombre: 'Natatorio climatizado', texto: 'Pileta semiolímpica: escuela, nado libre, plantel infanto juvenil y master.' },
  { icono: 'sports_tennis', nombre: 'Canchas de tenis', texto: 'Dos canchas de polvo de ladrillo con iluminación.' },
  { icono: 'sports_basketball', nombre: 'Microestadio', texto: 'Básquet, vóley y eventos.' },
  { icono: 'sports_soccer', nombre: 'Cancha de fútbol 7', texto: 'Escuelita y fútbol infantil.' },
  { icono: 'fitness_center', nombre: 'Gimnasio de musculación', texto: 'Sala con profesor, cross funcional y levantamiento.' },
  { icono: 'sports_martial_arts', nombre: 'Salón de artes marciales', texto: 'Karate, taekwondo y boxeo.' },
  { icono: 'celebration', nombre: 'Salón social', texto: 'Eventos, aeroyoga y talleres.' },
  { icono: 'park', nombre: 'Parque y quincho', texto: 'Encuentros al aire libre.' },
];

export default function Historia() {
  return (
    <div className="max-w-contenido mx-auto px-gutter-sm lg:px-margin pt-space-lg">
      <Encabezado etiqueta="Desde 1942" titulo="Historia e instalaciones" subtitulo="Andrade 3052, Quilmes Oeste, Provincia de Buenos Aires." />
      <div className="grid lg:grid-cols-2 gap-space-lg">
        <Tarjeta titulo="Nuestra historia" icono="history_edu">
          <ol className="relative border-l-2 border-primary-fixed ml-3 space-y-space-lg py-2">
            {HITOS.map((h) => (
              <li key={h.anio} className="pl-6 relative">
                <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-primary-container ring-4 ring-surface-container-lowest" />
                <p className="font-label-sm text-label-sm uppercase text-primary-container">{h.anio}</p>
                <p className="font-headline-sm text-headline-sm">{h.titulo}</p>
                <p className="text-body-md text-secondary mt-1">{h.texto}</p>
              </li>
            ))}
          </ol>
        </Tarjeta>
        <div className="space-y-space-md">
          <Tarjeta titulo="Instalaciones" icono="apartment" cuerpo="p-space-md grid sm:grid-cols-2 gap-3">
            {INSTALACIONES.map((i) => (
              <div key={i.nombre} className="p-3 rounded-xl bg-surface flex gap-3">
                <span className="w-10 h-10 rounded-lg bg-secondary-container text-on-secondary-fixed flex items-center justify-center shrink-0"><Icono n={i.icono} /></span>
                <div><p className="font-label-lg text-label-lg">{i.nombre}</p><p className="text-body-sm text-secondary">{i.texto}</p></div>
              </div>
            ))}
          </Tarjeta>
          <Tarjeta titulo="Horarios" icono="schedule" cuerpo="p-space-md space-y-2 text-body-md">
            <p><strong>Club:</strong> lunes a viernes de 8 a 23 · sábados de 8 a 20 · domingos de 9 a 18.</p>
            <p><strong>Administración:</strong> lunes a viernes de 9 a 20 · sábados de 9 a 13.</p>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
