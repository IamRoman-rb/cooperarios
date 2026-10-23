// Certificados externos: el auxiliar carga los escaneados; el médico los valida y define la vigencia.
import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData, urlArchivo } from '../../lib/api.js';
import { fecha } from '../../lib/formato.js';
import { prepararImagen } from '../../lib/imagen.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Pestanas, Modal, Campo, Entrada, Selector, Buscador, Fila, SelectorArchivo, Aviso, DialogoMotivo, Icono } from '../../components/ui.jsx';

const sumar = (iso, meses) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
};

export default function Certificados({ modo }) {
  const esMedico = modo === 'medico';
  const [estado, setEstado] = useState('pendiente_validacion');
  const q = useDatos(`/api/medico/certificados?estado=${estado}`);
  const agenda = useDatos('/api/medico/agenda');
  const [validar, setValidar] = useState(null);
  const [rechazo, setRechazo] = useState(null);
  const [carga, setCarga] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [archivo, setArchivo] = useState([]);
  const personas = useDatos(carga && busqueda.length >= 2 ? `/api/medico/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const resolver = useAccion(({ id, ...d }) => api.post(`/api/medico/certificados/${id}/validar`, d), { ok: 'Certificado resuelto', invalidar: ['/api/medico'], alTerminar: () => { setValidar(null); setRechazo(null); } });
  const subir = useAccion(async () => api.post('/api/medico/certificados', formData({ persona_id: carga.persona.id, tipo_revision_id: carga.tipo }, { certificado: await prepararImagen(archivo[0]) })), {
    ok: 'Certificado cargado para validación del médico', invalidar: ['/api/medico'], alTerminar: () => { setCarga(null); setArchivo([]); },
  });
  const tipos = agenda.data?.tipos ?? [];

  return (
    <>
      <Encabezado titulo={esMedico ? 'Certificados externos' : 'Carga de certificados'} subtitulo={esMedico ? 'Validá los certificados subidos por socios o cargados por el auxiliar.' : 'Cargá certificados escaneados para que el médico los valide.'}
        acciones={!esMedico && <Boton icono="upload_file" onClick={() => { setCarga({ persona: null, tipo: tipos[0]?.id }); setBusqueda(''); }}>Cargar certificado</Boton>} />
      <Pestanas valor={estado} onChange={setEstado} opciones={[{ value: 'pendiente_validacion', label: 'Para validar' }, { value: 'todos', label: 'Todos' }]} />
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(lista) => (
            <Tabla columnas={[
              { k: 'persona', t: 'Persona', r: (c) => <div><p className="font-semibold">{c.apellido}, {c.nombre}</p><p className="text-body-sm text-secondary">{c.nro_socio ? `N° ${c.nro_socio} · ` : ''}{c.tipo}</p></div> },
              { k: 'fecha', t: 'Recibido', r: (c) => <div>{fecha(c.fecha)}<p className="text-body-sm text-secondary">{c.cargado}</p></div> },
              { k: 'archivo', t: 'Archivo', r: (c) => <a href={urlArchivo(c.certificado_externo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-container font-semibold"><Icono n="description" tam={18} /> Ver</a> },
              { k: 'resultado', t: 'Estado', r: (c) => <div><Estado valor={c.resultado} />{c.vence_en && <p className="text-label-sm text-secondary mt-0.5">hasta {fecha(c.vence_en)}</p>}</div> },
              ...(esMedico ? [{ k: 'acc', t: '', derecha: true, r: (c) => c.resultado === 'pendiente_validacion' && (
                <div className="flex justify-end gap-1">
                  <Boton chico variante="exito" icono="verified" onClick={() => setValidar({ id: c.id, resultado: 'apto', restricciones: '', vence_en: sumar(c.fecha, 12) })}>Validar</Boton>
                  <Boton chico variante="fantasma" onClick={() => setRechazo(c)}>Rechazar</Boton>
                </div>
              ) }] : []),
            ]} filas={lista} vacio="No hay certificados" />
          )}
        </Consulta>
      </Tarjeta>
      <Modal abierto={!!validar} titulo="Validar certificado" onCerrar={() => setValidar(null)}
        pie={<Boton variante="exito" cargando={resolver.isPending} onClick={() => resolver.mutate({ ...validar, aprobar: true, restricciones: validar.restricciones || null })}>Validar y firmar</Boton>}>
        {validar && (
          <div className="space-y-space-md">
            <Campo etiqueta="Resultado"><Selector value={validar.resultado} onChange={(e) => setValidar({ ...validar, resultado: e.target.value })} opciones={[{ value: 'apto', label: 'Apto' }, { value: 'apto_restricciones', label: 'Apto con restricciones' }]} /></Campo>
            {validar.resultado === 'apto_restricciones' && <Campo etiqueta="Restricciones (codificadas, sin diagnóstico)"><Entrada value={validar.restricciones} onChange={(e) => setValidar({ ...validar, restricciones: e.target.value })} placeholder="Ej.: R2 sin impacto, R5 sin inmersión" /></Campo>}
            <Campo etiqueta="Vigencia del apto hasta"><Entrada type="date" value={validar.vence_en} onChange={(e) => setValidar({ ...validar, vence_en: e.target.value })} /></Campo>
            <Aviso tono="info">La validación queda firmada con tu usuario y matrícula y no se edita después.</Aviso>
          </div>
        )}
      </Modal>
      <DialogoMotivo abierto={!!rechazo} titulo="Rechazar certificado" etiqueta="Motivo (se informa al socio)" onCerrar={() => setRechazo(null)} cargando={resolver.isPending}
        onConfirmar={(motivo) => resolver.mutate({ id: rechazo.id, aprobar: false, motivo })} boton="Rechazar" />
      <Modal abierto={!!carga} titulo="Cargar certificado escaneado" onCerrar={() => setCarga(null)}
        pie={<Boton cargando={subir.isPending} disabled={!carga?.persona || !archivo.length} onClick={() => subir.mutate()}>Cargar</Boton>}>
        {carga && (
          <div className="space-y-space-md">
            {carga.persona ? <Fila icono="person" titulo={`${carga.persona.apellido}, ${carga.persona.nombre}`} detalle={`DNI ${carga.persona.dni}`} derecha={<Boton chico variante="fantasma" onClick={() => setCarga({ ...carga, persona: null })}>Cambiar</Boton>} /> : (
              <>
                <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Apellido, DNI o N° de socio" />
                <div className="space-y-1 max-h-56 overflow-y-auto">{(personas.data ?? []).map((p) => <Fila key={p.id} icono="person" titulo={`${p.apellido}, ${p.nombre}`} detalle={`DNI ${p.dni}`} onClick={() => setCarga({ ...carga, persona: p })} />)}</div>
              </>
            )}
            <Campo etiqueta="Tipo"><Selector value={carga.tipo} onChange={(e) => setCarga({ ...carga, tipo: e.target.value })} opciones={tipos.map((t) => ({ value: t.id, label: t.nombre }))} /></Campo>
            <SelectorArchivo etiqueta="Certificado escaneado (PDF o foto)" archivos={archivo} onChange={setArchivo} />
            <p className="text-body-sm text-secondary">No ves ni cargás resultados: el médico define el apto y la vigencia.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
