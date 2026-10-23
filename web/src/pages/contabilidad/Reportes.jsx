import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { descargar } from '../../lib/api.js';
import { pesos, periodoCorto, periodoActual } from '../../lib/formato.js';
import { useAviso } from '../../components/Avisos.jsx';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Selector } from '../../components/ui.jsx';
import { Barras } from '../../components/graficos.jsx';

/** Resultado por actividad, flujo de fondos y exportaciones a Excel (CSV). */
export default function Reportes() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const q = useDatos(`/api/finanzas/reportes?anio=${anio}`);
  const aviso = useAviso();
  const bajar = (que) => descargar(`/api/finanzas/exportar/${que}?periodo=${periodoActual()}`, `${que}-${periodoActual()}.csv`).catch((e) => aviso.error(e.message));
  return (
    <>
      <Encabezado titulo="Reportes y balances" subtitulo="Resultado por actividad y flujo de fondos de los últimos 12 meses."
        acciones={<>
          <Selector value={anio} onChange={(e) => setAnio(e.target.value)} opciones={[anio - 1, anio].map((a) => ({ value: a, label: String(a) }))} className="w-28" />
          <Boton variante="suave" icono="download" onClick={() => bajar('flujo')}>Flujo (Excel)</Boton>
          <Boton variante="suave" icono="download" onClick={() => bajar('gastos')}>Gastos del mes</Boton>
          <Boton variante="suave" icono="print" onClick={() => window.print()}>PDF</Boton>
        </>} />
      <Consulta q={q}>
        {(d) => (
          <div className="space-y-space-md">
            <Tarjeta titulo="Flujo de fondos" subtitulo="Ingresos, egresos y resultado neto por mes" icono="waterfall_chart">
              <Barras datos={d.flujo.map((f) => ({ etiqueta: periodoCorto(f.periodo), ingresos: f.ingresos, egresos: f.egresos }))} series={[{ k: 'ingresos', label: 'Ingresos', color: '#15803d' }, { k: 'egresos', label: 'Egresos', color: '#b91c1c' }]} />
              <Tabla compacta clave="periodo" columnas={[
                { k: 'periodo', t: 'Mes', r: (f) => periodoCorto(f.periodo) },
                { k: 'ingresos', t: 'Ingresos', derecha: true, r: (f) => pesos(f.ingresos) },
                { k: 'gastos', t: 'Gastos', derecha: true, r: (f) => pesos(f.gastos) },
                { k: 'nomina', t: 'Nómina', derecha: true, r: (f) => pesos(f.nomina) },
                { k: 'honorarios', t: 'Honorarios', derecha: true, r: (f) => pesos(f.honorarios) },
                { k: 'neto', t: 'Neto', derecha: true, r: (f) => <strong className={f.neto < 0 ? 'text-critico' : 'text-exito'}>{pesos(f.neto)}</strong> },
              ]} filas={d.flujo} />
            </Tarjeta>
            <Tarjeta titulo={`Resultado por actividad ${d.anio}`} subtitulo="Aranceles cobrados menos honorarios de sus profesores" icono="sports" cuerpo="p-space-md">
              <Tabla compacta columnas={[
                { k: 'nombre', t: 'Actividad' },
                { k: 'inscriptos', t: 'Inscriptos', derecha: true },
                { k: 'ingresos', t: 'Ingresos', derecha: true, r: (a) => pesos(a.ingresos) },
                { k: 'honorarios', t: 'Honorarios', derecha: true, r: (a) => pesos(a.honorarios) },
                { k: 'resultado', t: 'Resultado', derecha: true, r: (a) => <strong className={a.resultado < 0 ? 'text-critico' : ''}>{pesos(a.resultado)}</strong> },
              ]} filas={d.por_actividad} />
            </Tarjeta>
          </div>
        )}
      </Consulta>
    </>
  );
}
