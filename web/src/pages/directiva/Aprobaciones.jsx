import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, urlArchivo } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { pesos, fecha, periodo } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Pestanas, Vacio, DialogoMotivo, Aviso, Icono } from '../../components/ui.jsx';

/** Bandeja única: gastos y facturas sobre el umbral, excepciones de habilitación, compras y honorarios. */
export default function Aprobaciones() {
  const q = useDatos('/api/aprobaciones');
  const { usuario } = useSesion();
  const [vista, setVista] = useState('gastos');
  const [rechazo, setRechazo] = useState(null);
  const inv = ['/api/aprobaciones', '/api/finanzas', '/api/acceso', '/api/compras', '/api/tablero'];
  const gasto = useAccion(({ id, ...d }) => api.post(`/api/finanzas/gastos/${id}/aprobar`, d), { ok: 'Gasto resuelto', invalidar: inv, alTerminar: () => setRechazo(null) });
  const factura = useAccion((id) => api.post(`/api/finanzas/facturas/${id}/autorizar`), { ok: 'Factura autorizada', invalidar: inv });
  const habilitacion = useAccion(({ id, ...d }) => api.post(`/api/aprobaciones/habilitaciones/${id}`, d), { ok: 'Habilitación resuelta', invalidar: inv, alTerminar: () => setRechazo(null) });
  const compra = useAccion(({ id, ...d }) => api.post(`/api/compras/${id}/resolver`, d), { ok: 'Solicitud resuelta', invalidar: inv, alTerminar: () => setRechazo(null) });
  const honorario = useAccion((id) => api.post(`/api/finanzas/honorarios/${id}/autorizar`), { ok: 'Honorario autorizado', invalidar: inv });

  const tarjeta = (clave, titulo, detalle, monto, acciones, extra) => (
    <Tarjeta key={clave} cuerpo="p-space-md space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-headline-sm text-headline-sm">{titulo}</p><p className="text-body-sm text-secondary">{detalle}</p></div>
        {monto != null && <p className="text-headline-sm font-extrabold whitespace-nowrap">{pesos(monto)}</p>}
      </div>
      {extra}
      <div className="flex flex-wrap gap-2 pt-1">{acciones}</div>
    </Tarjeta>
  );

  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Aprobaciones" subtitulo={`Separación de funciones: quien solicita no aprueba. Umbral vigente: ${pesos(d.umbral)}.`} />
          <Pestanas valor={vista} onChange={setVista} opciones={[
            { value: 'gastos', label: 'Gastos', n: d.gastos.length }, { value: 'facturas', label: 'Facturas', n: d.facturas.length },
            { value: 'habilitaciones', label: 'Excepciones', n: d.habilitaciones.length }, { value: 'compras', label: 'Compras', n: d.compras.length },
            { value: 'honorarios', label: 'Honorarios', n: d.honorarios.length },
          ]} />
          {d.altas > 0 && <div className="mb-space-md"><Aviso tono="info">{d.altas} solicitudes de alta esperan en la bandeja de Administración.</Aviso></div>}
          <div className="grid lg:grid-cols-2 gap-space-md">
            {vista === 'gastos' && (d.gastos.length ? d.gastos.map((g) => tarjeta(`g${g.id}`, g.descripcion, `${g.categoria} · ${fecha(g.fecha)} · ${g.medio_pago} · registró ${g.registrado}`, g.importe, <>
              <Boton chico variante="exito" icono="check" disabled={g.registrado_por === usuario.id} onClick={() => gasto.mutate({ id: g.id, aprobar: true })}>Aprobar</Boton>
              <Boton chico variante="fantasma" onClick={() => setRechazo({ tipo: 'gasto', id: g.id })}>Rechazar</Boton>
            </>, g.comprobante_archivo && <a href={urlArchivo(g.comprobante_archivo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-label-md text-primary-container"><Icono n="attach_file" tam={16} /> Comprobante</a>)) : <Vacio icono="task_alt" titulo="Sin gastos para aprobar" />)}
            {vista === 'facturas' && (d.facturas.length ? d.facturas.map((f) => tarjeta(`f${f.id}`, f.razon_social, `Factura ${f.numero} · vence ${fecha(f.vence)}`, f.total, <Boton chico variante="exito" icono="check" disabled={f.cargada_por === usuario.id} onClick={() => factura.mutate(f.id)}>Autorizar pago</Boton>)) : <Vacio icono="task_alt" titulo="Sin facturas sobre el umbral" />)}
            {vista === 'habilitaciones' && (d.habilitaciones.length ? d.habilitaciones.map((h) => tarjeta(`h${h.id}`, `${h.apellido}, ${h.nombre}${h.nro_socio ? ` (N° ${h.nro_socio})` : ''}`, `${h.tipo === 'bloqueo' ? 'Bloqueo' : 'Excepción'} · ${h.actividad ?? 'todas las actividades'} · ${fecha(h.desde)} a ${fecha(h.hasta)}`, null, <>
              <Boton chico variante="exito" icono="check" onClick={() => habilitacion.mutate({ id: h.id, aprobar: true })}>Aprobar</Boton>
              <Boton chico variante="fantasma" onClick={() => setRechazo({ tipo: 'habilitacion', id: h.id })}>Rechazar</Boton>
            </>, <p className="text-body-md">«{h.motivo}»</p>)) : <Vacio icono="task_alt" titulo="Sin excepciones pendientes" />)}
            {vista === 'compras' && (d.compras.length ? d.compras.map((c) => tarjeta(`c${c.id}`, c.descripcion, `${c.solicitante}${c.actividad ? ` · ${c.actividad}` : ''} · ${fecha(c.creada_en)}`, c.monto_estimado, <>
              <Boton chico variante="exito" icono="check" onClick={() => compra.mutate({ id: c.id, estado: 'autorizada' })}>Autorizar</Boton>
              <Boton chico variante="fantasma" onClick={() => setRechazo({ tipo: 'compra', id: c.id })}>Rechazar</Boton>
            </>)) : <Vacio icono="task_alt" titulo="Sin solicitudes de compra" />)}
            {vista === 'honorarios' && (d.honorarios.length ? d.honorarios.map((h) => tarjeta(`o${h.id}`, h.profesor, `${periodo(h.periodo)} · ${h.clases} clases`, h.monto, <Boton chico variante="exito" icono="check" onClick={() => honorario.mutate(h.id)}>Autorizar</Boton>, <Estado valor={h.estado} />)) : <Vacio icono="task_alt" titulo="Sin honorarios para autorizar" />)}
          </div>
          <DialogoMotivo abierto={!!rechazo} titulo="Motivo del rechazo" onCerrar={() => setRechazo(null)} boton="Rechazar"
            cargando={gasto.isPending || habilitacion.isPending || compra.isPending}
            onConfirmar={(motivo) => {
              if (rechazo.tipo === 'gasto') gasto.mutate({ id: rechazo.id, aprobar: false, motivo });
              if (rechazo.tipo === 'habilitacion') habilitacion.mutate({ id: rechazo.id, aprobar: false, motivo });
              if (rechazo.tipo === 'compra') compra.mutate({ id: rechazo.id, estado: 'rechazada', motivo });
            }} />
        </>
      )}
    </Consulta>
  );
}
