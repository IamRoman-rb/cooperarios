import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { pesos, fecha, periodo, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Kpi, Grilla, Pestanas } from '../../components/ui.jsx';
import { SelectorFamilia, Comprobante } from '../../components/compartidos.jsx';

export default function Cuenta() {
  const [persona, setPersona] = useState(null);
  const [vista, setVista] = useState('cargos');
  const [comprobante, setComprobante] = useState(null);
  const q = useDatos(`/api/socio/cuenta${persona ? `?persona_id=${persona}` : ''}`);
  return (
    <>
      <Encabezado titulo="Estado de cuenta" subtitulo="Cuotas y aranceles, pagos registrados y comprobantes." acciones={<Boton as="link" to="/socio/pagos" icono="payments">Pagar</Boton>} />
      <Consulta q={q}>
        {(d) => {
          const porConcepto = Object.values(d.cargos.filter((c) => c.saldo > 0 && c.estado !== 'anulado').reduce((acc, c) => {
            acc[c.concepto] ??= { concepto: c.concepto, total: 0, n: 0 };
            acc[c.concepto].total += c.saldo;
            acc[c.concepto].n++;
            return acc;
          }, {}));
          return (
            <>
              <SelectorFamilia familia={d.familia} valor={persona ?? d.familia.find((f) => f.yo)?.id} onChange={setPersona} />
              <Grilla cols="grid-cols-2 lg:grid-cols-4" className="mb-space-md">
                <Kpi etiqueta="Deuda total" valor={pesos(d.resumen.deuda)} icono="account_balance_wallet" tono={d.resumen.deuda ? 'alerta' : 'exito'} />
                <Kpi etiqueta="Vencido" valor={pesos(d.resumen.vencido)} icono="warning" tono={d.resumen.vencido ? 'critico' : 'exito'} />
                <Kpi etiqueta="Próximo vencimiento" valor={fecha(d.resumen.proximo_vencimiento)} icono="event" />
                <Kpi etiqueta="Cargos pendientes" valor={d.resumen.cargos_pendientes} icono="receipt_long" />
              </Grilla>
              {porConcepto.length > 0 && (
                <Tarjeta titulo="Deuda por concepto" icono="pie_chart" className="mb-space-md" cuerpo="p-space-md grid sm:grid-cols-3 gap-2">
                  {porConcepto.map((c) => (
                    <div key={c.concepto} className="p-3 rounded-xl bg-surface"><p className="etiqueta">{c.concepto}</p><p className="font-bold text-headline-sm">{pesos(c.total)}</p><p className="text-body-sm text-secondary">{c.n} cargo(s)</p></div>
                  ))}
                </Tarjeta>
              )}
              <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'cargos', label: 'Cuotas y aranceles', icono: 'receipt_long' }, { value: 'pagos', label: 'Pagos y comprobantes', icono: 'receipt' }]} />
              <Tarjeta cuerpo="p-space-md">
                {vista === 'cargos' ? (
                  <Tabla columnas={[
                    { k: 'descripcion', t: 'Concepto', r: (c) => <div><p className="font-semibold">{c.descripcion}</p><p className="text-body-sm text-secondary">{periodo(c.periodo)}</p></div> },
                    { k: 'vencimiento', t: 'Vence', r: (c) => fecha(c.vencimiento) },
                    { k: 'importe', t: 'Importe', derecha: true, r: (c) => pesos(c.importe) },
                    { k: 'saldo', t: 'Saldo', derecha: true, r: (c) => <span className={c.saldo > 0 ? 'font-bold' : 'text-secondary'}>{pesos(c.saldo)}</span> },
                    { k: 'situacion', t: 'Estado', r: (c) => <Estado valor={c.estado === 'parcial' && c.situacion !== 'vencido' ? 'parcial' : c.situacion} /> },
                  ]} filas={d.cargos} vacio="No hay cargos" />
                ) : (
                  <Tabla columnas={[
                    { k: 'fecha', t: 'Fecha', r: (p) => fecha(p.fecha) },
                    { k: 'medio', t: 'Medio', r: (p) => capitalizar(p.medio) },
                    { k: 'importe', t: 'Importe', derecha: true, r: (p) => <span className="font-semibold">{pesos(p.importe)}</span> },
                    { k: 'recibo', t: 'Comprobante', r: (p) => p.comprobante_id ? <Boton chico variante="fantasma" icono="receipt" onClick={() => setComprobante(p.comprobante_id)}>{p.recibo}</Boton> : '—' },
                  ]} filas={d.pagos} vacio="Todavía no registrás pagos" />
                )}
              </Tarjeta>
            </>
          );
        }}
      </Consulta>
      <Comprobante id={comprobante} onCerrar={() => setComprobante(null)} />
    </>
  );
}
