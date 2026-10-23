import { useDatos } from '../../lib/datos.js';
import { pesos } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Barra, Estado, Dato } from '../../components/ui.jsx';

/** Integrantes, actividad y presupuesto de cada subcomisión. */
export default function Subcomisiones() {
  const q = useDatos('/api/subcomisiones');
  return (
    <>
      <Encabezado titulo="Subcomisiones" subtitulo="Delegados, actividades, inscriptos y ejecución del presupuesto anual." />
      <Consulta q={q}>
        {(lista) => (
          <div className="grid lg:grid-cols-2 gap-space-md">
            {lista.map((s) => (
              <Tarjeta key={s.id} titulo={s.nombre} icono="diversity_3" cuerpo="p-space-md space-y-3">
                <div className="flex flex-wrap gap-1.5">{s.actividades.map((a) => <Estado key={a.id} tono="info" texto={a.nombre} />)}</div>
                <div className="grid grid-cols-3 gap-3">
                  <Dato etiqueta="Inscriptos" valor={s.inscriptos} />
                  <Dato etiqueta="Reuniones" valor={s.reuniones} />
                  <Dato etiqueta="Delegados" valor={s.delegados.length} />
                </div>
                <div>
                  <div className="flex justify-between text-body-sm mb-1"><span>Compras autorizadas</span><span className="font-semibold">{pesos(s.compras)} de {pesos(s.presupuesto_anual)}</span></div>
                  <Barra valor={s.compras} max={s.presupuesto_anual} />
                </div>
                {s.delegados.length > 0 && <p className="text-body-sm text-secondary">Delegados: {s.delegados.map((x) => `${x.nombre} (${x.actividad})`).join(', ')}</p>}
              </Tarjeta>
            ))}
          </div>
        )}
      </Consulta>
    </>
  );
}
