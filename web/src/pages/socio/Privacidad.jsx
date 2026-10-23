import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, descargar } from '../../lib/api.js';
import { fecha, capitalizar, relativa } from '../../lib/formato.js';
import { useAviso } from '../../components/Avisos.jsx';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Campo, Selector, Area, Aviso, Fila, Vacio } from '../../components/ui.jsx';

const NOMBRES = { datos_personales: 'Tratamiento de datos personales', datos_salud: 'Datos de salud (revisión médica)', imagen: 'Uso de imagen', comunicaciones: 'Comunicaciones del club' };

export default function Privacidad() {
  const q = useDatos('/api/mi/privacidad');
  const aviso = useAviso();
  const [derecho, setDerecho] = useState('acceso');
  const [detalle, setDetalle] = useState('');
  const cambiar = useAccion((d) => api.post('/api/mi/privacidad/consentimientos', d), { ok: 'Preferencia guardada', invalidar: ['/api/mi/privacidad'] });
  const solicitar = useAccion(() => api.post('/api/mi/privacidad/solicitud', { derecho, detalle }), { ok: (r) => `Solicitud registrada. Plazo de respuesta: ${r.plazo}.`, invalidar: ['/api/mi/privacidad'], alTerminar: () => setDetalle('') });

  return (
    <>
      <Encabezado titulo="Privacidad y datos personales" subtitulo="Tus derechos según la Ley 25.326: acceso, rectificación, actualización y supresión." />
      <Consulta q={q}>
        {(d) => {
          const vigentes = {};
          for (const c of d.consentimientos) {
            const k = `${c.persona_id}:${c.tipo}`;
            if (!vigentes[k]) vigentes[k] = c;
          }
          return (
            <div className="grid lg:grid-cols-2 gap-space-md">
              <Tarjeta titulo="Consentimientos" icono="fact_check" subtitulo={`Texto vigente: versión ${d.version_vigente}`} cuerpo="p-space-md space-y-2">
                {Object.values(vigentes).map((c) => (
                  <div key={`${c.persona_id}${c.tipo}`} className="flex items-center gap-3 p-3 rounded-xl bg-surface">
                    <div className="flex-1 min-w-0">
                      <p className="font-label-lg text-label-lg">{NOMBRES[c.tipo] ?? capitalizar(c.tipo)}</p>
                      <p className="text-body-sm text-secondary">{c.nombre} · v{c.version_texto} · {c.revocado_en ? `revocado ${fecha(c.revocado_en)}` : `otorgado ${fecha(c.aceptado_en)}`}{c.aceptado_por_tutor_id ? ' (por tutor)' : ''}</p>
                    </div>
                    {c.revocado_en
                      ? <Boton chico variante="suave" onClick={() => cambiar.mutate({ persona_id: c.persona_id, tipo: c.tipo, aceptar: true })}>Otorgar</Boton>
                      : <Boton chico variante="fantasma" disabled={c.tipo === 'datos_personales'} title={c.tipo === 'datos_personales' ? 'Necesario para ser socio: pedí la supresión si querés darte de baja' : ''} onClick={() => cambiar.mutate({ persona_id: c.persona_id, tipo: c.tipo, aceptar: false })}>Revocar</Boton>}
                  </div>
                ))}
              </Tarjeta>
              <div className="space-y-space-md">
                <Tarjeta titulo="Descargar mis datos" icono="download" cuerpo="p-space-md space-y-2">
                  <p className="text-body-sm text-secondary">Obtené una copia de tus datos personales, actividades, pagos y accesos en formato abierto (JSON).</p>
                  <Boton variante="suave" icono="download" onClick={() => descargar('/api/mi/privacidad/mis-datos', 'mis-datos-cooperarios.json').catch((e) => aviso.error(e.message))}>Descargar</Boton>
                </Tarjeta>
                <Tarjeta titulo="Ejercer un derecho" icono="gavel" cuerpo="p-space-md space-y-space-md">
                  <Campo etiqueta="Derecho">
                    <Selector value={derecho} onChange={(e) => setDerecho(e.target.value)} opciones={[{ value: 'acceso', label: 'Acceso (10 días corridos)' }, { value: 'rectificacion', label: 'Rectificación (5 días hábiles)' }, { value: 'actualizacion', label: 'Actualización (5 días hábiles)' }, { value: 'supresion', label: 'Supresión (5 días hábiles)' }]} />
                  </Campo>
                  <Campo etiqueta="Detalle"><Area value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Qué dato querés corregir, conocer o suprimir" /></Campo>
                  <Boton icono="send" cargando={solicitar.isPending} disabled={detalle.trim().length < 5} onClick={() => solicitar.mutate()}>Enviar solicitud</Boton>
                  <Aviso tono="info">La supresión tiene excepciones: los comprobantes contables se conservan 10 años por obligación legal.</Aviso>
                </Tarjeta>
                <Tarjeta titulo="Mis solicitudes" icono="history" cuerpo="p-space-md space-y-2">
                  {d.solicitudes.length === 0 ? <Vacio titulo="Sin solicitudes" /> : d.solicitudes.map((s) => {
                    const datos = JSON.parse(s.datos_json);
                    return <Fila key={s.id} icono="gavel" titulo={capitalizar(datos.derecho)} detalle={`${relativa(s.creada_en)}${s.respuesta ? ` · ${s.respuesta}` : ''}`} derecha={<Estado valor={s.estado} />} />;
                  })}
                </Tarjeta>
              </div>
            </div>
          );
        }}
      </Consulta>
    </>
  );
}
