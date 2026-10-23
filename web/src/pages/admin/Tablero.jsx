import { useDatos } from '../../lib/datos.js';
import { useSesion } from '../../lib/sesion.jsx';
import { pesos, fechaLarga, hoy, relativa, capitalizar } from '../../lib/formato.js';
import { Tarjeta, Kpi, Grilla, Fila, Estado, Vacio, Aviso, Boton } from '../../components/ui.jsx';

/** Tablero operativo: altas y bajas, trámites pendientes, vencimientos y alertas del día. */
export default function Tablero() {
  const { usuario } = useSesion();
  const t = useDatos('/api/tablero');
  const sol = useDatos('/api/padron/solicitudes');
  const cob = useDatos('/api/cobranzas/resumen');
  const tick = useDatos('/api/tickets');
  const aptos = useDatos('/api/medico/pendientes?dias=15');
  const urgentes = (tick.data?.tickets ?? []).filter((x) => (x.prioridad === 'urgente' || x.vencido) && !['resuelto', 'cerrado'].includes(x.estado));
  const porVencer = (aptos.data ?? []).flatMap((g) => g.personas).filter((p) => p.situacion !== 'vencido').length;
  return (
    <div className="space-y-space-md">
      <div className="tarjeta p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-label-sm text-label-sm uppercase text-primary-container flex items-center gap-1.5">Gestión diaria <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse" /></p>
          <h1 className="text-headline-md">¡Buen día, {usuario.nombre}!</h1>
          <p className="text-body-sm text-secondary capitalize">{fechaLarga(hoy())} · Administración</p>
        </div>
        <div className="flex gap-2">
          <Boton as="link" to="/socios/nuevo" icono="person_add" variante="suave">Alta de socio</Boton>
          <Boton as="link" to="/cobranzas" icono="point_of_sale">Cobrar</Boton>
        </div>
      </div>
      {urgentes.length > 0 && (
        <Aviso tono="critico" titulo={`${urgentes.length} ticket(s) urgente(s) o vencido(s)`} accion={<Boton chico as="link" to="/tickets" variante="suave">Ver</Boton>}>
          {urgentes.slice(0, 3).map((x) => <p key={x.id}>{x.codigo} · {x.titulo} ({x.sector})</p>)}
        </Aviso>
      )}
      <Grilla>
        <Kpi etiqueta="Padrón activo" valor={t.data?.socios.activos ?? '—'} icono="badge" detalle={t.data ? `+${t.data.socios.altas_mes} altas · ${t.data.socios.bajas_mes} bajas este mes` : ''} a="/socios" />
        <Kpi etiqueta="Cobrado este mes" valor={cob.data ? pesos(cob.data.cobrado) : '—'} icono="payments" tono="exito" detalle={cob.data ? `de ${pesos(cob.data.emitido)} emitido` : ''} a="/cobranzas" />
        <Kpi etiqueta="Morosos" valor={cob.data?.morosos ?? '—'} icono="warning" tono="critico" detalle={cob.data ? `${pesos(cob.data.vencido)} vencido` : ''} a="/cobranzas" />
        <Kpi etiqueta="Transferencias por aprobar" valor={cob.data?.transferencias_pendientes ?? '—'} icono="sync_alt" tono="alerta" a="/cobranzas" />
      </Grilla>
      <div className="grid lg:grid-cols-3 gap-space-md">
        <Tarjeta titulo="Trámites pendientes" icono="inbox" accion={<Boton chico variante="fantasma" as="link" to="/bandeja-de-solicitudes">Bandeja</Boton>} cuerpo="p-space-md space-y-2">
          {(sol.data ?? []).length === 0 ? <Vacio titulo="Sin trámites" /> : (sol.data ?? []).slice(0, 6).map((s) => (
            <Fila key={s.id} icono={s.tipo === 'alta' ? 'person_add' : s.tipo === 'baja' ? 'person_remove' : 'assignment'} titulo={capitalizar(s.tipo)}
              detalle={`${s.apellido ? `${s.apellido}, ${s.nombre}` : `${s.datos.apellido ?? ''}, ${s.datos.nombre ?? ''}`} · ${relativa(s.creada_en)}`} a="/bandeja-de-solicitudes" />
          ))}
        </Tarjeta>
        <Tarjeta titulo="Mantenimiento" icono="build" accion={<Boton chico variante="fantasma" as="link" to="/tickets">Tickets</Boton>} cuerpo="p-space-md space-y-2">
          {(tick.data?.indicadores?.por_estado ?? []).map((e) => <div key={e.estado} className="flex justify-between text-body-md"><Estado valor={e.estado} /><span className="font-bold">{e.n}</span></div>)}
          <p className="text-body-sm text-secondary pt-2">Para verificar: {(tick.data?.tickets ?? []).filter((x) => x.estado === 'resuelto').length} trabajo(s) resuelto(s) esperan cierre con fotos.</p>
        </Tarjeta>
        <Tarjeta titulo="Vencimientos" icono="event_upcoming" cuerpo="p-space-md space-y-2">
          <Fila icono="medical_services" tono="alerta" titulo={`${porVencer} aptos médicos por vencer`} detalle="Próximos 15 días" a="/revision-medica" />
          <Fila icono="receipt_long" tono="critico" titulo={`${cob.data?.morosos ?? 0} socios con deuda vencida`} detalle="Enviar recordatorios" a="/cobranzas" />
          <Fila icono="approval" tono="alerta" titulo={`${t.data?.pendientes.aprobaciones ?? 0} pendientes de Directiva`} detalle="Gastos, excepciones y compras" />
        </Tarjeta>
      </div>
    </div>
  );
}
