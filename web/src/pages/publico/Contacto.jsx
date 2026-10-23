import { useDatos } from '../../lib/datos.js';
import { Icono, Tarjeta, Encabezado, Consulta, Fila } from '../../components/ui.jsx';

export default function Contacto() {
  const q = useDatos('/api/publico/contacto');
  const docs = useDatos('/api/publico/documentos');
  return (
    <div className="max-w-contenido mx-auto px-gutter-sm lg:px-margin pt-space-lg">
      <Encabezado etiqueta="Estamos para ayudarte" titulo="Contacto y ubicación" />
      <Consulta q={q}>
        {(c) => (
          <div className="grid lg:grid-cols-5 gap-space-lg">
            <div className="lg:col-span-2 space-y-space-md">
              <Tarjeta titulo="Administración" icono="support_agent" cuerpo="p-space-md space-y-2">
                <Fila icono="location_on" titulo={c.direccion} detalle="Sede central" />
                <Fila icono="call" titulo={c.telefono} detalle="Llamadas en horario de atención" />
                <a href={`mailto:${c.email}`}><Fila icono="mail" titulo={c.email} detalle="Respondemos en 72 horas hábiles" /></a>
                <Fila icono="schedule" titulo="Atención" detalle={c.horario_administracion} />
                <Fila icono="door_open" titulo="Club" detalle={c.horario_club} />
              </Tarjeta>
              <Tarjeta titulo="Reglamentos y formularios" icono="description" cuerpo="p-space-md space-y-2">
                {(docs.data ?? []).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-body-md"><Icono n="article" className="text-secondary" tam={18} /> {d.nombre}</div>
                ))}
                <p className="text-body-sm text-secondary pt-1">Los documentos completos están disponibles en tu portal de socio.</p>
              </Tarjeta>
            </div>
            <div className="lg:col-span-3 tarjeta overflow-hidden min-h-[360px]">
              <iframe title="Mapa de la sede" className="w-full h-full min-h-[360px] border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                src="https://www.google.com/maps?q=Andrade+3052,+Quilmes+Oeste,+Buenos+Aires&output=embed" />
            </div>
          </div>
        )}
      </Consulta>
    </div>
  );
}
