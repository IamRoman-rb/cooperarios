import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { fecha } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Selector, Vacio } from '../../components/ui.jsx';

/** Socios con apto vencido o por vencer, agrupados por actividad. */
export default function Pendientes() {
  const [dias, setDias] = useState(30);
  const q = useDatos(`/api/medico/pendientes?dias=${dias}`);
  const navegar = useNavigate();
  return (
    <>
      <Encabezado titulo="Pendientes y vencimientos" subtitulo="Sin apto, vencidos o por vencer, por actividad."
        acciones={<Selector value={dias} onChange={(e) => setDias(e.target.value)} opciones={[7, 15, 30, 60].map((d) => ({ value: d, label: `Próximos ${d} días` }))} className="w-48" />} />
      <Consulta q={q}>
        {(grupos) => grupos.length === 0 ? <Vacio icono="task_alt" titulo="No hay pendientes" /> : (
          <div className="space-y-space-md">
            {grupos.map((g) => (
              <Tarjeta key={g.actividad} titulo={g.actividad} subtitulo={`${g.personas.length} personas`} icono="sports" cuerpo="p-space-md">
                <Tabla compacta clave="persona_id" columnas={[
                  { k: 'persona', t: 'Persona', r: (p) => `${p.apellido}, ${p.nombre}${p.nro_socio ? ` (N° ${p.nro_socio})` : ''}` },
                  { k: 'tipo', t: 'Revisión' },
                  { k: 'vence_en', t: 'Vence', r: (p) => fecha(p.vence_en) },
                  { k: 'situacion', t: 'Estado', r: (p) => <Estado valor={p.situacion} /> },
                  { k: 'acc', t: '', derecha: true, r: (p) => <Boton chico variante="suave" onClick={() => navegar(`/nueva-revision?persona=${p.persona_id}`)}>Revisar</Boton> },
                ]} filas={g.personas} />
              </Tarjeta>
            ))}
          </div>
        )}
      </Consulta>
    </>
  );
}
