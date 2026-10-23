import { useDatos } from '../../lib/datos.js';
import { useSesion } from '../../lib/sesion.jsx';
import { pesos, fecha, periodo, periodoCorto, capitalizar } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Kpi, Grilla, Tabla, Estado, Fila } from '../../components/ui.jsx';
import { Barras, Dona } from '../../components/graficos.jsx';

export const ORIGENES = { cuota_social: 'Cuotas sociales', arancel: 'Aranceles', alquiler: 'Alquileres', invitado: 'Invitados', llave: 'Llaves', revision_medica: 'Revisiones médicas', otro: 'Otros', sponsor: 'Sponsors', evento: 'Eventos', donacion: 'Donaciones' };
export const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'Mercado Pago', billetera: 'Otras billeteras' };

export default function ResumenFinanciero() {
  const { rolActivo } = useSesion();
  // Los accesos directos llevan a las vistas de gestión solo para Contabilidad.
  const enlace = (ruta) => (rolActivo?.codigo === 'contabilidad' ? `/contabilidad/${ruta}` : undefined);
  const q = useDatos('/api/finanzas/resumen');
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado etiqueta={periodo(d.periodo)} titulo="Resumen financiero" subtitulo="Ingresos y egresos del mes, saldos de caja y bancos, y vencimientos." />
          <Grilla className="mb-space-md">
            <Kpi etiqueta="Ingresos del mes" valor={pesos(d.ingresos.total)} icono="trending_up" tono="exito" a={enlace('ingresos')} />
            <Kpi etiqueta="Egresos del mes" valor={pesos(d.egresos.total)} icono="trending_down" tono="critico" detalle={`Gastos ${pesos(d.egresos.gastos)} · Nómina ${pesos(d.egresos.nomina)}`} a={enlace('gastos')} />
            <Kpi etiqueta="Resultado" valor={pesos(d.ingresos.total - d.egresos.total)} icono="balance" tono={d.ingresos.total >= d.egresos.total ? 'exito' : 'critico'} />
            <Kpi etiqueta="Saldo en cajas" valor={pesos(d.cajas.reduce((s, c) => s + c.saldo, 0))} icono="account_balance" a={enlace('caja')} />
          </Grilla>
          <div className="grid lg:grid-cols-3 gap-space-md">
            <Tarjeta className="lg:col-span-2" titulo="Ingresos y egresos" subtitulo="Últimos 6 meses" icono="bar_chart">
              <Barras datos={d.evolucion.map((e) => ({ etiqueta: periodoCorto(e.periodo), ingresos: e.ingresos, egresos: e.egresos }))}
                series={[{ k: 'ingresos', label: 'Ingresos', color: '#15803d' }, { k: 'egresos', label: 'Egresos', color: '#b91c1c' }]} />
            </Tarjeta>
            <Tarjeta titulo="Ingresos por medio" icono="donut_large">
              <Dona datos={d.ingresos.por_medio.map((m) => ({ etiqueta: MEDIOS[m.medio] ?? m.medio, valor: m.total }))} />
            </Tarjeta>
            <Tarjeta titulo="Cajas y bancos" icono="account_balance_wallet" cuerpo="p-space-md space-y-2">
              {d.cajas.map((c) => <Fila key={c.id} icono={c.tipo === 'efectivo' ? 'payments' : c.tipo === 'banco' ? 'account_balance' : 'wallet'} titulo={c.nombre} detalle={capitalizar(c.tipo)} derecha={<span className="font-bold tabular-nums">{pesos(c.saldo)}</span>} />)}
            </Tarjeta>
            <Tarjeta className="lg:col-span-2" titulo="Vencimientos de proveedores" icono="event_upcoming" cuerpo="p-space-md">
              <Tabla compacta columnas={[
                { k: 'razon_social', t: 'Proveedor' },
                { k: 'numero', t: 'Factura' },
                { k: 'vence', t: 'Vence', r: (f) => fecha(f.vence) },
                { k: 'total', t: 'Total', derecha: true, r: (f) => pesos(f.total) },
                { k: 'estado', t: 'Estado', r: (f) => <Estado valor={f.estado} /> },
              ]} filas={d.vencimientos} vacio="Sin vencimientos" />
            </Tarjeta>
          </div>
          <Grilla cols="grid-cols-1 sm:grid-cols-3" className="mt-space-md">
            <Kpi etiqueta="Gastos por aprobar" valor={d.pendientes.gastos} icono="pending_actions" tono="alerta" a={enlace('gastos')} />
            <Kpi etiqueta="Transferencias por revisar" valor={d.pendientes.transferencias} icono="sync_alt" tono="alerta" a={enlace('conciliacion')} />
            <Kpi etiqueta="Facturas por autorizar" valor={d.pendientes.facturas} icono="receipt" tono="alerta" a={enlace('compras')} />
          </Grilla>
        </>
      )}
    </Consulta>
  );
}
