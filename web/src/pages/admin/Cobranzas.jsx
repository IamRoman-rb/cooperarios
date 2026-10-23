import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, urlArchivo } from '../../lib/api.js';
import { pesos, fecha, fechaHora, periodo, aCentavos, hoy, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Pestanas, Kpi, Grilla, Buscador, Fila, Campo, Entrada, Selector, Modal, DialogoMotivo, Icono, Casilla, Vacio } from '../../components/ui.jsx';
import { Comprobante } from '../../components/compartidos.jsx';
import { MEDIOS } from '../compartidas/ResumenFinanciero.jsx';

/** Registro de cobros, cuenta corriente, morosidad, recordatorios y transferencias informadas por aprobar. */
export default function Cobranzas() {
  const [params] = useSearchParams();
  const [vista, setVista] = useState(params.get('persona') ? 'cobrar' : 'transferencias');
  const resumen = useDatos('/api/cobranzas/resumen');
  const r = resumen.data;
  return (
    <>
      <Encabezado titulo="Cobranzas" subtitulo="Cobros con recibo, cuenta corriente, morosidad y transferencias informadas." />
      {r && (
        <Grilla className="mb-space-md">
          <Kpi etiqueta={`Emitido ${periodo(r.periodo)}`} valor={pesos(r.emitido)} icono="receipt_long" />
          <Kpi etiqueta="Cobrado" valor={pesos(r.cobrado)} icono="payments" tono="exito" detalle={r.emitido ? `${Math.round((r.cobrado / r.emitido) * 100)}% de lo emitido` : ''} />
          <Kpi etiqueta="Deuda vencida" valor={pesos(r.vencido)} icono="warning" tono="critico" detalle={`${r.morosos} socios`} />
          <Kpi etiqueta="Transferencias por aprobar" valor={r.transferencias_pendientes} icono="sync_alt" tono="alerta" />
        </Grilla>
      )}
      <Pestanas valor={vista} onChange={setVista} opciones={[
        { value: 'transferencias', label: 'Transferencias', icono: 'sync_alt', n: r?.transferencias_pendientes },
        { value: 'cobrar', label: 'Cobrar / cuenta', icono: 'point_of_sale' },
        { value: 'morosidad', label: 'Morosidad', icono: 'warning' },
      ]} />
      {vista === 'transferencias' && <Transferencias />}
      {vista === 'cobrar' && <Cobrar inicial={params.get('persona')} />}
      {vista === 'morosidad' && <Morosidad />}
    </>
  );
}

export function Transferencias() {
  const [estado, setEstado] = useState('pendiente');
  const q = useDatos(`/api/cobranzas/transferencias?estado=${estado}`);
  const [rechazo, setRechazo] = useState(null);
  const revisar = useAccion(({ id, ...d }) => api.post(`/api/cobranzas/transferencias/${id}/revisar`, d), { ok: (x) => (x.recibo ? `Acreditada. Recibo ${x.recibo}` : 'Transferencia rechazada'), invalidar: ['/api/cobranzas', '/api/finanzas'], alTerminar: () => setRechazo(null) });
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-space-md">{['pendiente', 'aprobada', 'rechazada', 'todas'].map((e) => <Boton key={e} chico variante={estado === e ? 'primario' : 'suave'} onClick={() => setEstado(e)}>{capitalizar(e)}</Boton>)}</div>
      <Consulta q={q}>
        {(lista) => lista.length === 0 ? <Vacio icono="task_alt" titulo="No hay transferencias en este estado" /> : (
          <div className="grid lg:grid-cols-2 gap-3">
            {lista.map((t) => (
              <Tarjeta key={t.id} cuerpo="p-space-md space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-headline-sm text-headline-sm">{pesos(t.monto)}</p><p className="text-body-md">{t.apellido}, {t.nombre}{t.nro_socio ? ` · N° ${t.nro_socio}` : ''}</p></div>
                  <Estado valor={t.estado} />
                </div>
                <p className="text-body-sm text-secondary">{capitalizar(t.medio)} · informada {fechaHora(t.creada_en)}{t.referencia ? ` · ${t.referencia}` : ''}</p>
                <ul className="text-body-sm">{t.cargos.filter(Boolean).map((c) => <li key={c.id}>• {c.descripcion} ({pesos(c.importe)}) <Estado valor={c.estado} /></li>)}</ul>
                {t.motivo_rechazo && <p className="text-body-sm text-error">Rechazo: {t.motivo_rechazo}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {t.comprobante_archivo && <a href={urlArchivo(t.comprobante_archivo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-9 px-3 rounded-xl bg-surface-container text-label-md"><Icono n="attach_file" tam={16} /> Comprobante</a>}
                  {t.estado === 'pendiente' && <>
                    <Boton chico variante="exito" icono="check" cargando={revisar.isPending} onClick={() => revisar.mutate({ id: t.id, aprobar: true })}>Aprobar y acreditar</Boton>
                    <Boton chico variante="fantasma" onClick={() => setRechazo(t)}>Rechazar</Boton>
                  </>}
                </div>
              </Tarjeta>
            ))}
          </div>
        )}
      </Consulta>
      <DialogoMotivo abierto={!!rechazo} titulo="Rechazar transferencia" etiqueta="Motivo (se informa al socio)" onCerrar={() => setRechazo(null)} onConfirmar={(motivo) => revisar.mutate({ id: rechazo.id, aprobar: false, motivo })} cargando={revisar.isPending} boton="Rechazar" />
    </>
  );
}

function Cobrar({ inicial }) {
  const [busqueda, setBusqueda] = useState('');
  const [persona, setPersona] = useState(inicial || null);
  const [elegidos, setElegidos] = useState(new Set());
  const [cobro, setCobro] = useState({ medio: 'efectivo', importe: '', referencia: '' });
  const [comprobante, setComprobante] = useState(null);
  const [nc, setNc] = useState(null);
  const [cargo, setCargo] = useState(null);
  const lista = useDatos(busqueda.length >= 2 ? `/api/cobranzas/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const cuenta = useDatos(persona ? `/api/cobranzas/cuenta/${persona}` : null);
  const pendientes = (cuenta.data?.cargos ?? []).filter((c) => ['pendiente', 'parcial'].includes(c.estado));
  const total = pendientes.filter((c) => elegidos.has(c.id)).reduce((s, c) => s + c.saldo, 0);
  useEffect(() => { setElegidos(new Set()); }, [persona]);
  useEffect(() => { setCobro((c) => ({ ...c, importe: total ? String(total / 100) : '' })); }, [total]);
  const cobrar = useAccion(() => api.post('/api/cobranzas/cobros', { persona_id: persona, cargo_ids: [...elegidos], importe: aCentavos(cobro.importe), medio: cobro.medio, referencia: cobro.referencia || undefined }), {
    ok: (r) => `Cobro registrado. Recibo ${r.numero}`, invalidar: ['/api/cobranzas', '/api/finanzas'], alTerminar: (r) => { setElegidos(new Set()); setComprobante(r.comprobanteId); },
  });
  const notaCredito = useAccion((motivo) => api.post('/api/cobranzas/notas-credito', { cargo_id: nc.id, importe: aCentavos(nc.importe), motivo }), { ok: 'Nota de crédito emitida', invalidar: ['/api/cobranzas'], alTerminar: () => setNc(null) });
  const crearCargo = useAccion(() => api.post('/api/cobranzas/cargos', { persona_id: persona, concepto_tipo: cargo.concepto_tipo, descripcion: cargo.descripcion, importe: aCentavos(cargo.importe), vencimiento: cargo.vencimiento }), { ok: 'Cargo creado', invalidar: ['/api/cobranzas'], alTerminar: () => setCargo(null) });

  return (
    <div className="grid lg:grid-cols-3 gap-space-md">
      <div className="space-y-space-md">
        <Tarjeta titulo="Buscar socio" icono="search" cuerpo="p-space-md space-y-2">
          <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Apellido, DNI o N° de socio" />
          {(lista.data ?? []).map((p) => <Fila key={p.id} icono="person" titulo={`${p.apellido}, ${p.nombre}`} detalle={`DNI ${p.dni}${p.nro_socio ? ` · N° ${p.nro_socio}` : ''}`} onClick={() => { setPersona(p.id); setBusqueda(''); }} />)}
        </Tarjeta>
        {persona && cuenta.data && (
          <Tarjeta titulo="Registrar cobro" icono="point_of_sale" franja cuerpo="p-space-md space-y-space-md">
            <p className="text-body-md">{cuenta.data.persona.apellido}, {cuenta.data.persona.nombre} · {elegidos.size} cargo(s) · <strong>{pesos(total)}</strong></p>
            <Campo etiqueta="Medio"><Selector value={cobro.medio} onChange={(e) => setCobro({ ...cobro, medio: e.target.value })} opciones={[{ value: 'efectivo', label: 'Efectivo' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'billetera', label: 'Billetera' }, { value: 'otro', label: 'Otro' }]} /></Campo>
            <Campo etiqueta="Importe recibido ($)" ayuda="Si es menor, se registra un pago parcial y el saldo sigue pendiente."><Entrada type="number" value={cobro.importe} onChange={(e) => setCobro({ ...cobro, importe: e.target.value })} /></Campo>
            {cobro.medio !== 'efectivo' && <Campo etiqueta="Referencia"><Entrada value={cobro.referencia} onChange={(e) => setCobro({ ...cobro, referencia: e.target.value })} /></Campo>}
            <Boton completo icono="receipt" cargando={cobrar.isPending} disabled={!elegidos.size || !cobro.importe} onClick={() => cobrar.mutate()}>Cobrar y emitir recibo</Boton>
          </Tarjeta>
        )}
      </div>
      <Tarjeta className="lg:col-span-2" titulo={cuenta.data ? `Cuenta de ${cuenta.data.persona.apellido}, ${cuenta.data.persona.nombre}` : 'Cuenta corriente'} icono="receipt_long"
        accion={persona && <Boton chico variante="suave" icono="add" onClick={() => setCargo({ concepto_tipo: 'otro', descripcion: '', importe: '', vencimiento: hoy() })}>Cargo</Boton>} cuerpo="p-space-md">
        {!persona ? <Vacio icono="person_search" titulo="Elegí un socio" texto="Buscalo por apellido, DNI o número." /> : (
          <Consulta q={cuenta}>
            {(d) => (
              <>
                <p className="text-body-md mb-3">Deuda <strong>{pesos(d.resumen.deuda)}</strong> · vencido <strong className="text-critico">{pesos(d.resumen.vencido)}</strong></p>
                <Tabla compacta columnas={[
                  { k: 'sel', t: '', r: (c) => ['pendiente', 'parcial'].includes(c.estado) && <Casilla checked={elegidos.has(c.id)} onChange={() => { const s = new Set(elegidos); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); setElegidos(s); }} etiqueta="" /> },
                  { k: 'descripcion', t: 'Concepto', r: (c) => <div><p>{c.descripcion}</p><p className="text-body-sm text-secondary">{periodo(c.periodo)} · vence {fecha(c.vencimiento)}</p></div> },
                  { k: 'importe', t: 'Importe', derecha: true, r: (c) => pesos(c.importe) },
                  { k: 'saldo', t: 'Saldo', derecha: true, r: (c) => <strong>{pesos(c.saldo)}</strong> },
                  { k: 'situacion', t: 'Estado', r: (c) => <Estado valor={c.situacion} /> },
                  { k: 'nc', t: '', r: (c) => c.saldo > 0 && <Boton chico variante="fantasma" onClick={() => setNc({ id: c.id, importe: String(c.saldo / 100), descripcion: c.descripcion })}>Nota de crédito</Boton> },
                ]} filas={d.cargos} />
                <p className="etiqueta mt-space-md mb-2">Pagos</p>
                <Tabla compacta columnas={[
                  { k: 'fecha', t: 'Fecha', r: (p) => fechaHora(p.fecha) },
                  { k: 'medio', t: 'Medio', r: (p) => MEDIOS[p.medio] ?? capitalizar(p.medio) },
                  { k: 'importe', t: 'Importe', derecha: true, r: (p) => pesos(p.importe) },
                  { k: 'recibo', t: 'Recibo', r: (p) => p.recibo ?? '—' },
                ]} filas={d.pagos} vacio="Sin pagos" />
              </>
            )}
          </Consulta>
        )}
      </Tarjeta>
      <Comprobante id={comprobante} url={comprobante ? `/api/cobranzas/comprobantes/${comprobante}` : null} onCerrar={() => setComprobante(null)} />
      {nc && <NotaCreditoDialogo nc={nc} setNc={setNc} accion={notaCredito} />}
      <Modal abierto={!!cargo} titulo="Nuevo cargo" onCerrar={() => setCargo(null)} pie={<Boton cargando={crearCargo.isPending} disabled={!cargo?.descripcion || !cargo?.importe} onClick={() => crearCargo.mutate()}>Crear</Boton>}>
        {cargo && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Concepto"><Selector value={cargo.concepto_tipo} onChange={(e) => setCargo({ ...cargo, concepto_tipo: e.target.value })} opciones={['cuota_social', 'arancel', 'alquiler', 'invitado', 'llave', 'revision_medica', 'otro'].map((x) => ({ value: x, label: capitalizar(x) }))} /></Campo>
            <Campo etiqueta="Vencimiento"><Entrada type="date" value={cargo.vencimiento} onChange={(e) => setCargo({ ...cargo, vencimiento: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción" className="sm:col-span-2"><Entrada value={cargo.descripcion} onChange={(e) => setCargo({ ...cargo, descripcion: e.target.value })} /></Campo>
            <Campo etiqueta="Importe ($)"><Entrada type="number" value={cargo.importe} onChange={(e) => setCargo({ ...cargo, importe: e.target.value })} /></Campo>
          </div>
        )}
      </Modal>
    </div>
  );
}

function NotaCreditoDialogo({ nc, setNc, accion }) {
  const [paso, setPaso] = useState(1);
  return paso === 1 ? (
    <Modal abierto titulo={`Nota de crédito · ${nc.descripcion}`} onCerrar={() => setNc(null)} pie={<Boton onClick={() => setPaso(2)}>Continuar</Boton>}>
      <p className="text-body-sm text-secondary mb-3">Los cargos no se editan: se corrigen con una nota de crédito que deja rastro.</p>
      <Campo etiqueta="Importe ($)"><Entrada type="number" value={nc.importe} onChange={(e) => setNc({ ...nc, importe: e.target.value })} /></Campo>
    </Modal>
  ) : <DialogoMotivo abierto titulo="Motivo de la nota de crédito" onCerrar={() => setNc(null)} onConfirmar={(m) => accion.mutate(m)} cargando={accion.isPending} variante="primario" boton="Emitir" />;
}

function Morosidad() {
  const q = useDatos('/api/cobranzas/morosidad');
  const [elegidos, setElegidos] = useState(new Set());
  const recordar = useAccion(() => api.post('/api/cobranzas/recordatorios', { persona_ids: [...elegidos] }), { ok: (r) => `${r.enviados} recordatorio(s) enviados`, alTerminar: () => setElegidos(new Set()) });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Grilla className="mb-space-md">{d.tramos.map((t) => <Kpi key={t.tramo} etiqueta={`${t.tramo} días`} valor={pesos(t.total)} detalle={`${t.personas} socios`} icono="schedule" tono={t.tramo === '+90' ? 'critico' : 'alerta'} />)}</Grilla>
          <Tarjeta cuerpo="p-space-md" titulo="Socios con deuda vencida" accion={<Boton chico icono="notifications" disabled={!elegidos.size} cargando={recordar.isPending} onClick={() => recordar.mutate()}>Recordar ({elegidos.size})</Boton>}>
            <Tabla compacta clave="persona_id" columnas={[
              { k: 'sel', t: '', r: (f) => <Casilla checked={elegidos.has(f.persona_id)} onChange={() => { const s = new Set(elegidos); if (s.has(f.persona_id)) s.delete(f.persona_id); else s.add(f.persona_id); setElegidos(s); }} etiqueta="" /> },
              { k: 'persona', t: 'Socio', r: (f) => <div><p className="font-semibold">{f.apellido}, {f.nombre}</p><p className="text-body-sm text-secondary">{f.nro_socio ? `N° ${f.nro_socio} · ` : ''}{f.telefono}</p></div> },
              { k: 'cargos', t: 'Cargos', derecha: true },
              { k: 'desde', t: 'Desde', r: (f) => fecha(f.desde) },
              { k: 'tramo', t: 'Antigüedad', r: (f) => <Estado tono={f.tramo === '+90' ? 'critico' : 'alerta'} texto={`${f.dias} días`} /> },
              { k: 'deuda', t: 'Deuda', derecha: true, r: (f) => <strong>{pesos(f.deuda)}</strong> },
            ]} filas={d.filas} vacio="Sin morosos" />
          </Tarjeta>
        </>
      )}
    </Consulta>
  );
}
