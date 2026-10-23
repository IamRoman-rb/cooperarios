import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { pesos, fecha, periodo, periodoActual } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Estado, Tabla, Selector, Kpi, Grilla, Buscador, Pestanas } from '../../components/ui.jsx';
import { BarrasH } from '../../components/graficos.jsx';

/** Cargos emitidos, antigüedad de deuda, ajustes y notas de crédito. */
export default function CuentasACobrar() {
  const [per, setPer] = useState(periodoActual());
  const [texto, setTexto] = useState('');
  const [vista, setVista] = useState('cargos');
  const q = useDatos(`/api/cobranzas/cuentas-a-cobrar?periodo=${per}`);
  const mora = useDatos('/api/cobranzas/morosidad');
  return (
    <Consulta q={q}>
      {(d) => {
        const emitido = d.por_concepto.reduce((s, c) => s + c.emitido, 0);
        const cobrado = d.por_concepto.reduce((s, c) => s + c.cobrado, 0);
        return (
          <>
            <Encabezado titulo="Cuentas a cobrar" subtitulo="Los cargos no se editan: se corrigen con nota de crédito o ajuste."
              acciones={<Selector value={per} onChange={(e) => setPer(e.target.value)} opciones={(d.periodos.length ? d.periodos : [per]).map((p) => ({ value: p, label: periodo(p) }))} className="w-44" />} />
            <Grilla className="mb-space-md">
              <Kpi etiqueta="Emitido" valor={pesos(emitido)} icono="receipt_long" />
              <Kpi etiqueta="Cobrado" valor={pesos(cobrado)} icono="payments" tono="exito" />
              <Kpi etiqueta="Pendiente del período" valor={pesos(emitido - cobrado)} icono="pending" tono="alerta" />
              <Kpi etiqueta="Cobrabilidad" valor={emitido ? `${Math.round((cobrado / emitido) * 100)}%` : '—'} icono="percent" />
            </Grilla>
            <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'cargos', label: 'Cargos emitidos' }, { value: 'antiguedad', label: 'Antigüedad de deuda' }]} />
            {vista === 'cargos' ? (
              <div className="grid lg:grid-cols-3 gap-space-md">
                <Tarjeta titulo="Por concepto" icono="category">
                  <BarrasH datos={d.por_concepto.map((c) => ({ etiqueta: c.concepto, valor: c.emitido, detalle: `${pesos(c.cobrado)} / ${pesos(c.emitido)}` }))} />
                </Tarjeta>
                <Tarjeta className="lg:col-span-2" cuerpo="p-space-md">
                  <Buscador valor={texto} onChange={setTexto} placeholder="Filtrar por socio o concepto" className="mb-3" />
                  <Tabla compacta columnas={[
                    { k: 'persona', t: 'Socio', r: (c) => `${c.apellido}, ${c.nombre}` },
                    { k: 'descripcion', t: 'Concepto' },
                    { k: 'vencimiento', t: 'Vence', r: (c) => fecha(c.vencimiento) },
                    { k: 'importe', t: 'Importe', derecha: true, r: (c) => pesos(c.importe) },
                    { k: 'saldo', t: 'Saldo', derecha: true, r: (c) => pesos(c.saldo) },
                    { k: 'estado', t: 'Estado', r: (c) => <Estado valor={c.estado} /> },
                  ]} filas={d.cargos.filter((c) => `${c.apellido} ${c.nombre} ${c.descripcion}`.toLowerCase().includes(texto.toLowerCase()))} />
                </Tarjeta>
              </div>
            ) : (
              <Consulta q={mora}>
                {(m) => (
                  <div className="grid lg:grid-cols-3 gap-space-md">
                    <Tarjeta titulo="Por tramo" icono="schedule"><BarrasH datos={m.tramos.map((t) => ({ etiqueta: `${t.tramo} días (${t.personas})`, valor: t.total }))} color="#1f2937" /></Tarjeta>
                    <Tarjeta className="lg:col-span-2" cuerpo="p-space-md">
                      <Tabla compacta clave="persona_id" columnas={[
                        { k: 'persona', t: 'Socio', r: (f) => `${f.apellido}, ${f.nombre}` },
                        { k: 'cargos', t: 'Cargos', derecha: true },
                        { k: 'dias', t: 'Días', derecha: true },
                        { k: 'deuda', t: 'Deuda', derecha: true, r: (f) => <strong>{pesos(f.deuda)}</strong> },
                      ]} filas={m.filas} />
                    </Tarjeta>
                  </div>
                )}
              </Consulta>
            )}
          </>
        );
      }}
    </Consulta>
  );
}
