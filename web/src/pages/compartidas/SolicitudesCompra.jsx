// Pedidos de compra o mejoras con circuito de autorización (mantenimiento y subcomisiones).
import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { pesos, fecha, aCentavos } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Campo, Entrada, Area, Selector, Vacio, Tabla } from '../../components/ui.jsx';

export default function SolicitudesCompra() {
  const q = useDatos('/api/compras');
  const tickets = useDatos('/api/tickets?mios=asignados');
  const { roles } = useSesion();
  const delegado = roles.find((r) => r.codigo === 'subcomision');
  const [form, setForm] = useState({ descripcion: '', monto: '', ticket_id: '' });
  const crear = useAccion(() => api.post('/api/compras', { descripcion: form.descripcion, monto_estimado: aCentavos(form.monto), ticket_id: form.ticket_id || null, actividad_id: delegado?.actividad_id ?? null }), {
    ok: 'Pedido enviado a Comisión Directiva y Contabilidad', invalidar: ['/api/compras'], alTerminar: () => setForm({ descripcion: '', monto: '', ticket_id: '' }),
  });
  return (
    <>
      <Encabezado titulo={delegado ? 'Solicitudes' : 'Solicitudes de compra'} subtitulo={delegado ? `Pedidos de compra o mejoras para ${delegado.actividad}, enviados a Comisión Directiva y Contabilidad.` : 'Pedido de insumos con circuito de autorización.'} />
      <div className="grid lg:grid-cols-3 gap-space-md">
        <Tarjeta titulo="Nuevo pedido" icono="add_shopping_cart" franja>
          <div className="space-y-space-md">
            <Campo etiqueta="¿Qué se necesita?"><Area value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej.: 4 bolsas de cloro granulado (stock bajo mínimo)" /></Campo>
            <Campo etiqueta="Monto estimado ($)"><Entrada type="number" min="0" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></Campo>
            {!delegado && (
              <Campo etiqueta="Vincular a un ticket (opcional)">
                <Selector value={form.ticket_id} onChange={(e) => setForm({ ...form, ticket_id: e.target.value })} vacio="—" opciones={(tickets.data?.tickets ?? []).map((t) => ({ value: t.id, label: `${t.codigo} · ${t.titulo}` }))} />
              </Campo>
            )}
            <Boton completo icono="send" cargando={crear.isPending} disabled={form.descripcion.length < 5 || !form.monto} onClick={() => crear.mutate()}>Enviar pedido</Boton>
          </div>
        </Tarjeta>
        <Tarjeta className="lg:col-span-2" titulo="Pedidos" icono="receipt_long" cuerpo="p-space-md">
          <Consulta q={q}>
            {(lista) => lista.length === 0 ? <Vacio icono="shopping_bag" titulo="Sin pedidos" /> : (
              <Tabla columnas={[
                { k: 'creada_en', t: 'Fecha', r: (s) => fecha(s.creada_en) },
                { k: 'descripcion', t: 'Pedido', r: (s) => <div><p className="font-semibold">{s.descripcion}</p><p className="text-body-sm text-secondary">{s.solicitante}{s.ticket ? ` · ${s.ticket}` : ''}{s.actividad ? ` · ${s.actividad}` : ''}</p></div> },
                { k: 'monto_estimado', t: 'Estimado', derecha: true, r: (s) => pesos(s.monto_estimado) },
                { k: 'estado', t: 'Estado', r: (s) => <div><Estado valor={s.estado} />{s.motivo && <p className="text-label-sm text-secondary mt-0.5">{s.motivo}</p>}</div> },
              ]} filas={lista} />
            )}
          </Consulta>
        </Tarjeta>
      </div>
    </>
  );
}
