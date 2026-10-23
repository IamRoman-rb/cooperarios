import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha, relativa, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Pestanas, Modal, Campo, Area, Dato, Vacio, Aviso, Icono } from '../../components/ui.jsx';

const ICONOS = { alta: 'person_add', alta_familiar: 'group_add', baja: 'person_remove', cambio_categoria: 'swap_horiz', reclamo: 'feedback', sugerencia: 'lightbulb' };

/** Bandeja de altas, bajas, cambios y reclamos enviados por los socios. */
export default function Solicitudes() {
  const [estado, setEstado] = useState('pendiente');
  const q = useDatos(`/api/padron/solicitudes?estado=${estado}`);
  const [abierta, setAbierta] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const resolver = useAccion(({ id, ...d }) => api.post(`/api/padron/solicitudes/${id}/resolver`, d), {
    ok: (r) => (r.resultado?.nro_socio ? `Alta aprobada: socio N° ${r.resultado.nro_socio}` : 'Solicitud resuelta'), invalidar: ['/api/padron'], alTerminar: () => { setAbierta(null); setRespuesta(''); },
  });
  const tramite = (s) => ['alta', 'alta_familiar', 'baja', 'cambio_categoria'].includes(s.tipo);
  return (
    <>
      <Encabezado titulo="Bandeja de solicitudes" subtitulo="Altas, bajas, cambios de categoría, reclamos y sugerencias." />
      <Pestanas valor={estado} onChange={setEstado} opciones={[{ value: 'pendiente', label: 'Pendientes' }, { value: 'en_proceso', label: 'En proceso' }, { value: 'todas', label: 'Todas' }]} />
      <Consulta q={q}>
        {(lista) => lista.length === 0 ? <Vacio icono="inbox" titulo="Bandeja vacía" /> : (
          <div className="grid lg:grid-cols-2 gap-3">
            {lista.map((s) => (
              <button key={s.id} onClick={() => setAbierta(s)} className="tarjeta p-space-md text-left flex gap-3 hover:shadow-n2">
                <span className="w-10 h-10 rounded-lg bg-secondary-container text-on-secondary-fixed flex items-center justify-center shrink-0"><Icono n={ICONOS[s.tipo] ?? 'assignment'} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2"><p className="font-label-lg text-label-lg">{capitalizar(s.tipo)}</p><Estado valor={s.estado} /></div>
                  <p className="text-body-md truncate">{s.apellido ? `${s.apellido}, ${s.nombre} (N° ${s.nro_socio})` : `${s.datos.apellido}, ${s.datos.nombre}`}</p>
                  <p className="text-body-sm text-secondary truncate">{s.datos.detalle ?? s.datos.motivo ?? s.datos.email ?? ''} · {relativa(s.creada_en)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Consulta>
      <Modal abierto={!!abierta} titulo={abierta ? `${capitalizar(abierta.tipo)} #${abierta.id}` : ''} onCerrar={() => setAbierta(null)} ancho="max-w-xl"
        pie={abierta && !['aprobada', 'rechazada', 'resuelta'].includes(abierta.estado) && <>
          <Boton variante="suave" onClick={() => resolver.mutate({ id: abierta.id, estado: 'en_proceso', respuesta: respuesta || undefined })}>En proceso</Boton>
          <Boton variante="fantasma" disabled={respuesta.length < 3} onClick={() => resolver.mutate({ id: abierta.id, estado: 'rechazada', respuesta })}>Rechazar</Boton>
          <Boton variante="exito" cargando={resolver.isPending} onClick={() => resolver.mutate({ id: abierta.id, estado: tramite(abierta) ? 'aprobada' : 'resuelta', respuesta: respuesta || undefined })}>{tramite(abierta) ? 'Aprobar' : 'Resolver'}</Boton>
        </>}>
        {abierta && (
          <div className="space-y-space-md">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(abierta.datos).filter(([k]) => !['familiares', 'recibida_ip', 'acepta_datos'].includes(k)).map(([k, v]) => (
                <Dato key={k} etiqueta={capitalizar(k)} valor={typeof v === 'boolean' ? (v ? 'Sí' : 'No') : k === 'fecha_nacimiento' ? fecha(v) : String(v)} />
              ))}
            </div>
            {abierta.datos.familiares?.length > 0 && (
              <div><p className="etiqueta mb-1">Grupo familiar declarado</p>{abierta.datos.familiares.map((f, i) => <p key={i} className="text-body-sm">{f.nombre} {f.apellido} · DNI {f.dni} · {f.parentesco}</p>)}<p className="text-body-sm text-secondary mt-1">Los integrantes se dan de alta individualmente desde Alta de socio.</p></div>
            )}
            {abierta.datos.ya_registrado && <Aviso tono="alerta">El DNI ya existe en el padrón: revisá antes de aprobar.</Aviso>}
            {abierta.tipo === 'alta' && <Aviso tono="info">Al aprobar se crea el socio con la categoría por edad, su primera cuota y el consentimiento versión {abierta.datos.consentimiento_version}.</Aviso>}
            {abierta.respuesta && <Aviso tono="info" titulo="Respuesta">{abierta.respuesta}</Aviso>}
            {!['aprobada', 'rechazada', 'resuelta'].includes(abierta.estado) && <Campo etiqueta="Respuesta al socio"><Area value={respuesta} onChange={(e) => setRespuesta(e.target.value)} /></Campo>}
          </div>
        )}
      </Modal>
    </>
  );
}
