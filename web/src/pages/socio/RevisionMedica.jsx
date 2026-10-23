import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData } from '../../lib/api.js';
import { fecha, fechaHora, capitalizar } from '../../lib/formato.js';
import { prepararImagen } from '../../lib/imagen.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Modal, Campo, Entrada, Selector, SelectorArchivo, Aviso, Fila, Vacio } from '../../components/ui.jsx';

export default function RevisionMedica() {
  const q = useDatos('/api/socio/revision-medica');
  const [turno, setTurno] = useState(null);
  const [certificado, setCertificado] = useState(null);
  const [archivo, setArchivo] = useState([]);
  const pedir = useAccion((d) => api.post('/api/socio/revision-medica/turno', d), { ok: 'Pedido de turno enviado. Te confirmamos el horario.', invalidar: ['/api/socio'], alTerminar: () => setTurno(null) });
  const subir = useAccion(async (d) => api.post('/api/socio/revision-medica/certificado', formData(d, { certificado: await prepararImagen(archivo[0]) })), {
    ok: 'Certificado enviado para validación del médico', invalidar: ['/api/socio'], alTerminar: () => { setCertificado(null); setArchivo([]); },
  });
  const consentir = useAccion((d) => api.post('/api/socio/privacidad/consentimientos', d), { ok: 'Consentimiento registrado', invalidar: ['/api/socio'] });

  return (
    <>
      <Encabezado titulo="Revisión médica" subtitulo="Estado del apto por actividad, vencimientos, turnos y certificados externos." />
      <Aviso tono="info" titulo="Tus datos de salud están protegidos">
        El club guarda solo la constancia de aptitud (resultado y vigencia). Profesores y portería ven únicamente si estás habilitado/a.
      </Aviso>
      <Consulta q={q}>
        {(d) => (
          <div className="space-y-space-md mt-space-md">
            {d.personas.map((p) => (
              <Tarjeta key={p.id} titulo={`${p.nombre} ${p.apellido}`} subtitulo={p.menor ? 'Menor a tu cargo' : undefined} icono="person"
                accion={<div className="flex gap-2">
                  <Boton chico variante="suave" icono="event" onClick={() => setTurno({ persona_id: p.id, tipo_revision_id: d.tipos[0]?.id, inicio: '' })}>Pedir turno</Boton>
                  <Boton chico variante="suave" icono="upload_file" onClick={() => setCertificado({ persona_id: p.id, tipo_revision_id: d.tipos[0]?.id })}>Subir certificado</Boton>
                </div>}
                cuerpo="p-space-md space-y-3">
                {p.menor && !p.consentimiento_salud && (
                  <Aviso tono="alerta" titulo="Falta tu consentimiento como tutor" accion={<Boton chico onClick={() => consentir.mutate({ persona_id: p.id, tipo: 'datos_salud', aceptar: true })}>Otorgar</Boton>}>
                    Para revisar a un menor se requiere el consentimiento del tutor para el tratamiento de datos de salud.
                  </Aviso>
                )}
                {p.actividades.length === 0 ? <p className="text-body-sm text-secondary">Sin actividades inscriptas.</p> : p.actividades.map((a) => (
                  <Fila key={a.id} icono={!a.apto.requiere ? 'sports' : a.apto.vigente ? 'verified' : 'medical_services'} tono={!a.apto.requiere ? undefined : a.apto.vigente ? 'exito' : 'critico'}
                    titulo={a.nombre} detalle={!a.apto.requiere ? 'No requiere revisión' : a.apto.vence_en ? `Vence ${fecha(a.apto.vence_en)}` : 'Sin apto registrado'}
                    derecha={<Estado valor={a.apto.estado} />} />
                ))}
                {p.turnos.length > 0 && (
                  <div>
                    <p className="etiqueta mb-1">Turnos</p>
                    {p.turnos.map((t) => <Fila key={t.id} icono="event" titulo={t.tipo} detalle={fechaHora(t.inicio)} derecha={<Estado valor={t.estado} />} />)}
                  </div>
                )}
                {p.revisiones.length > 0 && (
                  <div>
                    <p className="etiqueta mb-1">Historial</p>
                    <ul className="divide-y divide-surface-container">
                      {p.revisiones.map((r) => (
                        <li key={r.id} className="py-2 flex items-center justify-between gap-2 text-body-sm">
                          <span>{fecha(r.fecha)} · {r.tipo}{r.externo ? ' (certificado externo)' : ''}{r.restricciones ? ` · ${r.restricciones}` : ''}</span>
                          <span className="flex items-center gap-2">{r.vence_en && <span className="text-secondary">hasta {fecha(r.vence_en)}</span>}<Estado valor={r.resultado} /></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {p.actividades.length === 0 && p.revisiones.length === 0 && <Vacio icono="medical_services" titulo="Sin revisiones" />}
              </Tarjeta>
            ))}

            <Modal abierto={!!turno} titulo="Pedir turno con el médico del club" onCerrar={() => setTurno(null)}
              pie={<><Boton variante="suave" onClick={() => setTurno(null)}>Cancelar</Boton><Boton cargando={pedir.isPending} disabled={!turno?.inicio} onClick={() => pedir.mutate({ ...turno, tipo_revision_id: turno.tipo_revision_id, inicio: new Date(turno.inicio).toISOString() })}>Pedir turno</Boton></>}>
              {turno && (
                <div className="space-y-space-md">
                  <Campo etiqueta="Tipo de revisión"><Selector value={turno.tipo_revision_id} onChange={(e) => setTurno({ ...turno, tipo_revision_id: e.target.value })} opciones={d.tipos.map((t) => ({ value: t.id, label: t.nombre }))} /></Campo>
                  <Campo etiqueta="Día y horario preferido"><Entrada type="datetime-local" value={turno.inicio} onChange={(e) => setTurno({ ...turno, inicio: e.target.value })} /></Campo>
                  <p className="text-body-sm text-secondary">El auxiliar de revisión confirma o propone otro horario.</p>
                </div>
              )}
            </Modal>
            <Modal abierto={!!certificado} titulo="Subir certificado externo" onCerrar={() => setCertificado(null)}
              pie={<><Boton variante="suave" onClick={() => setCertificado(null)}>Cancelar</Boton><Boton cargando={subir.isPending} disabled={!archivo.length} onClick={() => subir.mutate(certificado)}>Enviar</Boton></>}>
              {certificado && (
                <div className="space-y-space-md">
                  <Campo etiqueta="Tipo"><Selector value={certificado.tipo_revision_id} onChange={(e) => setCertificado({ ...certificado, tipo_revision_id: e.target.value })} opciones={d.tipos.map((t) => ({ value: t.id, label: capitalizar(t.nombre) }))} /></Campo>
                  <SelectorArchivo etiqueta="Foto o PDF del certificado" archivos={archivo} onChange={setArchivo} />
                  <p className="text-body-sm text-secondary">El médico del club lo valida y define la vigencia del apto.</p>
                </div>
              )}
            </Modal>
          </div>
        )}
      </Consulta>
    </>
  );
}
