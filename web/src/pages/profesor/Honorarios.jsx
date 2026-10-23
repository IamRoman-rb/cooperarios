import { useDatos } from '../../lib/datos.js';
import { pesos, periodo } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Estado, Tabla, Kpi, Grilla, Aviso } from '../../components/ui.jsx';

/** Clases dictadas, período liquidado y estado de pago. */
export default function Honorarios() {
  const q = useDatos('/api/profesor/liquidacion');
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Mis honorarios" subtitulo="Clases dictadas, períodos liquidados y estado de pago." />
          <Grilla cols="grid-cols-2 lg:grid-cols-3" className="mb-space-md">
            <Kpi etiqueta="Clases este mes" valor={d.clases_mes} icono="sports" detalle="Según asistencia registrada" />
            <Kpi etiqueta="Último liquidado" valor={pesos(d.honorarios[0]?.monto)} icono="request_quote" detalle={periodo(d.honorarios[0]?.periodo)} />
            <Kpi etiqueta="Pendiente de cobro" valor={pesos(d.honorarios.filter((h) => h.estado !== 'pagado').reduce((s, h) => s + h.monto, 0))} icono="hourglass_top" tono="alerta" />
          </Grilla>
          <Tarjeta cuerpo="p-space-md">
            <Tabla columnas={[
              { k: 'periodo', t: 'Período', r: (h) => <span className="capitalize">{periodo(h.periodo)}</span> },
              { k: 'clases', t: 'Clases', derecha: true },
              { k: 'base', t: 'Valor por clase', derecha: true, r: (h) => pesos(h.base) },
              { k: 'monto', t: 'Total', derecha: true, r: (h) => <strong>{pesos(h.monto)}</strong> },
              { k: 'estado', t: 'Estado', r: (h) => <Estado valor={h.estado} /> },
            ]} filas={d.honorarios} vacio="Todavía no hay liquidaciones" />
          </Tarjeta>
          <div className="mt-space-md"><Aviso tono="info">Circuito: Contabilidad liquida → Comisión Directiva autoriza → Contabilidad paga.</Aviso></div>
        </>
      )}
    </Consulta>
  );
}
