import { useDatos } from '../../lib/datos.js';
import { pesos, periodo, periodoCorto, numero } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Kpi, Grilla, Fila } from '../../components/ui.jsx';
import { Barras, BarrasH, Dona } from '../../components/graficos.jsx';

/** Altas y bajas, ingresos por actividad, ocupación, morosidad, asistencia y resultados. */
export default function Tablero() {
  const q = useDatos('/api/tablero');
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado etiqueta={periodo(d.periodo)} titulo="Tablero ejecutivo" subtitulo="Información en tiempo real para decidir." />
          <Grilla className="mb-space-md">
            <Kpi etiqueta="Socios activos" valor={numero(d.socios.activos)} icono="groups" detalle={`+${d.socios.altas_mes} altas · −${d.socios.bajas_mes} bajas`} a="/directiva/padron" />
            <Kpi etiqueta="Morosidad" valor={`${d.morosidad.tasa}%`} icono="warning" tono="critico" detalle={`${d.morosidad.personas} socios · ${pesos(d.morosidad.monto)}`} />
            <Kpi etiqueta="Resultado del mes" valor={pesos(d.resultado.at(-1).ingresos - d.resultado.at(-1).egresos)} icono="balance" tono={d.resultado.at(-1).ingresos >= d.resultado.at(-1).egresos ? 'exito' : 'critico'} a="/directiva/finanzas" />
            <Kpi etiqueta="Pendientes de aprobar" valor={d.pendientes.aprobaciones} icono="approval" tono="alerta" a="/directiva/aprobaciones" />
          </Grilla>
          <div className="grid lg:grid-cols-3 gap-space-md">
            <Tarjeta className="lg:col-span-2" titulo="Ingresos y egresos" subtitulo="Últimos 6 meses" icono="bar_chart">
              <Barras datos={d.resultado.map((r) => ({ etiqueta: periodoCorto(r.periodo), ...r }))} series={[{ k: 'ingresos', label: 'Ingresos', color: '#15803d' }, { k: 'egresos', label: 'Egresos', color: '#b91c1c' }]} />
            </Tarjeta>
            <Tarjeta titulo="Socios por categoría" icono="donut_large">
              <Dona moneda={false} datos={d.socios.por_categoria.map((c) => ({ etiqueta: c.nombre, valor: c.n }))} centro={numero(d.socios.activos)} />
            </Tarjeta>
            <Tarjeta titulo="Ingresos por actividad" subtitulo="Últimos 3 meses" icono="sports">
              <BarrasH datos={d.ingresos_por_actividad.map((a) => ({ etiqueta: a.nombre, valor: a.total }))} />
            </Tarjeta>
            <Tarjeta titulo="Ocupación" subtitulo="Inscriptos sobre cupo" icono="event_seat">
              <BarrasH moneda={false} datos={d.ocupacion.map((o) => ({ etiqueta: o.nombre, valor: o.ocupados, detalle: `${o.ocupados}/${o.cupo}`, color: o.ocupados >= o.cupo ? '#b91c1c' : '#1f2937' }))} max={Math.max(...d.ocupacion.map((o) => o.cupo), 1)} />
            </Tarjeta>
            <Tarjeta titulo="Asistencia (ingresos habilitados)" icono="how_to_reg">
              <Barras moneda={false} alto={150} datos={d.asistencia.map((a) => ({ etiqueta: periodoCorto(a.periodo), presentes: a.presentes }))} series={[{ k: 'presentes', label: 'Ingresos', color: '#1f2937' }]} />
            </Tarjeta>
            <Tarjeta className="lg:col-span-3" titulo="Seguimiento" icono="checklist" cuerpo="p-space-md grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Fila icono="approval" tono="alerta" titulo={`${d.pendientes.aprobaciones} aprobaciones`} detalle="Gastos, excepciones, compras" a="/directiva/aprobaciones" />
              <Fila icono="change_circle" titulo={`${d.pendientes.pedidos_cambio} pedidos de cambio`} detalle="Recibidos o en análisis" a="/directiva/pedidos-cambio" />
              <Fila icono="gavel" titulo={`${d.pendientes.resoluciones} resoluciones abiertas`} detalle="Seguimiento de tareas" a="/directiva/actas" />
              <Fila icono="build" tono={d.pendientes.tickets_vencidos ? 'critico' : 'exito'} titulo={`${d.pendientes.tickets_vencidos} tickets vencidos`} detalle="Mantenimiento" />
            </Tarjeta>
          </div>
        </>
      )}
    </Consulta>
  );
}
