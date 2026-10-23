import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha, fechaHora, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Pestanas, Modal, Campo, Area, Selector, Aviso, Kpi, Grilla, DialogoMotivo, Dato } from '../../components/ui.jsx';

/** Solicitudes de acceso, rectificación y supresión, consentimientos y retención (Ley 25.326). */
export default function Privacidad() {
  const q = useDatos('/api/privacidad');
  const [vista, setVista] = useState('solicitudes');
  const [abierta, setAbierta] = useState(null);
  const [respuesta, setRespuesta] = useState({ estado: 'resuelta', texto: '' });
  const [anonimizar, setAnonimizar] = useState(null);
  const resolver = useAccion(() => api.post(`/api/privacidad/solicitudes/${abierta.id}`, { estado: respuesta.estado, respuesta: respuesta.texto }), { ok: 'Solicitud respondida', invalidar: ['/api/privacidad'], alTerminar: () => setAbierta(null) });
  const suprimir = useAccion((motivo) => api.post(`/api/privacidad/anonimizar/${anonimizar.id}`, { motivo }), { ok: 'Datos anonimizados', invalidar: ['/api/privacidad'], alTerminar: () => setAnonimizar(null) });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Privacidad y datos personales" subtitulo="Derechos de acceso (10 días corridos), rectificación y supresión (5 días hábiles), consentimientos y conservación." />
          <Grilla className="mb-space-md">
            <Kpi etiqueta="Solicitudes pendientes" valor={d.solicitudes.filter((s) => s.estado === 'pendiente').length} icono="inbox" tono="alerta" />
            <Kpi etiqueta="Fuera de plazo" valor={d.solicitudes.filter((s) => s.vencida).length} icono="timer_off" tono="critico" />
            <Kpi etiqueta="Socios sin consentimiento" valor={d.sin_consentimiento} icono="gpp_maybe" tono={d.sin_consentimiento ? 'critico' : 'exito'} />
            <Kpi etiqueta="Bajas para anonimizar" valor={d.bajas_para_anonimizar.length} icono="person_off" />
          </Grilla>
          <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'solicitudes', label: 'Solicitudes' }, { value: 'consentimientos', label: 'Consentimientos' }, { value: 'retencion', label: 'Conservación' }]} />
          {vista === 'solicitudes' && (
            <Tarjeta cuerpo="p-space-md">
              <Tabla onFila={(s) => { setAbierta(s); setRespuesta({ estado: 'resuelta', texto: s.respuesta ?? '' }); }} columnas={[
                { k: 'persona', t: 'Titular', r: (s) => `${s.apellido}, ${s.nombre}${s.nro_socio ? ` (N° ${s.nro_socio})` : ''}` },
                { k: 'derecho', t: 'Derecho', r: (s) => capitalizar(s.datos.derecho) },
                { k: 'creada_en', t: 'Recibida', r: (s) => fecha(s.creada_en) },
                { k: 'vence_en', t: 'Plazo', r: (s) => <span className={s.vencida ? 'text-critico font-semibold' : ''}>{fecha(s.vence_en)}</span> },
                { k: 'estado', t: 'Estado', r: (s) => <Estado valor={s.vencida ? 'vencida' : s.estado} /> },
              ]} filas={d.solicitudes} vacio="Sin solicitudes" />
            </Tarjeta>
          )}
          {vista === 'consentimientos' && (
            <Tarjeta cuerpo="p-space-md">
              <Tabla clave="tipo" columnas={[
                { k: 'tipo', t: 'Consentimiento', r: (c) => capitalizar(c.tipo) },
                { k: 'version_texto', t: 'Versión' },
                { k: 'otorgados', t: 'Otorgados', derecha: true },
                { k: 'revocados', t: 'Revocados', derecha: true },
              ]} filas={d.consentimientos} />
            </Tarjeta>
          )}
          {vista === 'retencion' && (
            <div className="space-y-space-md">
              <Tarjeta titulo="Plazos de conservación" icono="schedule" cuerpo="p-space-md space-y-2">
                {d.retencion.map((r) => <div key={r.dato} className="grid sm:grid-cols-[260px_1fr] gap-1 p-3 rounded-xl bg-surface"><p className="font-label-lg text-label-lg">{r.dato}</p><p className="text-body-sm text-secondary">{r.plazo}</p></div>)}
              </Tarjeta>
              <Tarjeta titulo="Bajas con más de 2 años" icono="person_off" cuerpo="p-space-md">
                <Tabla columnas={[
                  { k: 'persona', t: 'Persona', r: (p) => `${p.apellido}, ${p.nombre}` },
                  { k: 'fecha_baja', t: 'Baja', r: (p) => fecha(p.fecha_baja) },
                  { k: 'a', t: '', derecha: true, r: (p) => <Boton chico variante="fantasma" onClick={() => setAnonimizar(p)}>Anonimizar</Boton> },
                ]} filas={d.bajas_para_anonimizar} vacio="No hay bajas para anonimizar" />
              </Tarjeta>
              <Aviso tono="info">El plazo posterior a la baja se define con el asesor legal. Los comprobantes contables se conservan 10 años.</Aviso>
            </div>
          )}
          <Modal abierto={!!abierta} titulo="Solicitud sobre datos personales" onCerrar={() => setAbierta(null)} pie={<Boton cargando={resolver.isPending} disabled={respuesta.texto.length < 5} onClick={() => resolver.mutate()}>Responder</Boton>}>
            {abierta && (
              <div className="space-y-space-md">
                <div className="grid grid-cols-2 gap-3">
                  <Dato etiqueta="Titular" valor={`${abierta.nombre} ${abierta.apellido}`} />
                  <Dato etiqueta="Derecho" valor={capitalizar(abierta.datos.derecho)} />
                  <Dato etiqueta="Recibida" valor={fechaHora(abierta.creada_en)} />
                  <Dato etiqueta="Plazo legal" valor={fecha(abierta.vence_en)} />
                </div>
                <Aviso tono="info">{abierta.datos.detalle}</Aviso>
                {abierta.datos.derecho === 'supresion' && <Aviso tono="alerta">Para suprimir: dar de baja al socio, verificar que no tenga deuda y anonimizar desde «Conservación». Los comprobantes contables se conservan.</Aviso>}
                <Campo etiqueta="Estado"><Selector value={respuesta.estado} onChange={(e) => setRespuesta({ ...respuesta, estado: e.target.value })} opciones={[{ value: 'en_proceso', label: 'En proceso' }, { value: 'resuelta', label: 'Resuelta' }, { value: 'rechazada', label: 'Rechazada (con fundamento legal)' }]} /></Campo>
                <Campo etiqueta="Respuesta al titular"><Area value={respuesta.texto} onChange={(e) => setRespuesta({ ...respuesta, texto: e.target.value })} /></Campo>
              </div>
            )}
          </Modal>
          <DialogoMotivo abierto={!!anonimizar} titulo={`Anonimizar a ${anonimizar?.nombre ?? ''} ${anonimizar?.apellido ?? ''}`} etiqueta="Motivo y fundamento" onCerrar={() => setAnonimizar(null)} onConfirmar={(m) => suprimir.mutate(m)} cargando={suprimir.isPending} boton="Anonimizar" />
        </>
      )}
    </Consulta>
  );
}
