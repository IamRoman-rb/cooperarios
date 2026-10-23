import { useDatos } from '../../lib/datos.js';
import { pesos } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Kpi, Grilla, Barra, Vacio, Aviso, Icono } from '../../components/ui.jsx';

/** Socios, ocupación, asistencia y deuda agregada de la actividad (sin datos de pago individuales). */
export default function Resumen() {
  const q = useDatos('/api/tablero');
  return (
    <Consulta q={q}>
      {(d) => (d.actividades?.length ? (
        <div className="space-y-space-lg">
          {d.actividades.map((a) => (
            <section key={a.id}>
              <Encabezado etiqueta="Resumen de la actividad" titulo={a.nombre} />
              <Grilla className="mb-space-md">
                <Kpi etiqueta="Socios inscriptos" valor={a.socios} icono="groups" />
                <Kpi etiqueta="Ingresos (30 días)" valor={a.asistencia_30d} icono="how_to_reg" detalle="Accesos habilitados" />
                <Kpi etiqueta="Pendientes de apto" valor={a.pendientes_apto} icono="medical_services" tono="alerta" />
                <Kpi etiqueta="Deuda de la actividad" valor={pesos(a.deuda.monto)} icono="warning" tono="critico" detalle={`${a.deuda.personas} socios (agregado)`} />
              </Grilla>
              <div className="grid lg:grid-cols-2 gap-space-md">
                <Tarjeta titulo="Ocupación por grupo" icono="event_seat" cuerpo="p-space-md space-y-3">
                  {a.grupos.map((g) => (
                    <div key={g.id}>
                      <div className="flex justify-between text-body-md mb-1"><span>{g.nombre}</span><span className="font-semibold">{g.ocupados}/{g.cupo}</span></div>
                      <Barra valor={g.ocupados} max={g.cupo} tono={g.ocupados >= g.cupo ? 'critico' : 'primario'} />
                    </div>
                  ))}
                </Tarjeta>
                <Tarjeta titulo="Presupuesto" icono="savings" cuerpo="p-space-md space-y-3">
                  <div className="flex justify-between text-body-md"><span>Compras autorizadas</span><span className="font-semibold">{pesos(a.compras)} de {pesos(a.presupuesto)}</span></div>
                  <Barra valor={a.compras} max={a.presupuesto || 1} />
                  <Aviso tono="info">Por privacidad ves la deuda total de la actividad, no la de cada socio.</Aviso>
                </Tarjeta>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Vacio icono="diversity_3" titulo="No tenés una actividad asignada" texto="Pedile a Administración que asigne tu actividad como delegado." accion={<Icono n="info" />} />
      ))}
    </Consulta>
  );
}
