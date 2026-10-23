import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Selector, Pestanas, Barra, Modal, Campo, Buscador, Fila, Entrada, DialogoMotivo } from '../../components/ui.jsx';

/** Inscripciones, bajas, lista de espera y descuentos aplicados. */
export default function Inscripciones() {
  const [f, setF] = useState({ actividad_id: '', estado: '' });
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const q = useDatos(`/api/actividades/inscripciones/lista?${params}`);
  const act = useDatos('/api/actividades');
  const [vista, setVista] = useState('inscripciones');
  const [alta, setAlta] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [baja, setBaja] = useState(null);
  const personas = useDatos(alta && busqueda.length >= 2 ? `/api/cobranzas/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const inscribir = useAccion(() => api.post('/api/actividades/inscripciones', { persona_id: alta.persona.id, grupo_id: Number(alta.grupo_id), frecuencia: Number(alta.frecuencia) }), { ok: 'Inscripción registrada', invalidar: ['/api/actividades'], alTerminar: () => setAlta(null) });
  const darBaja = useAccion((motivo) => api.post(`/api/actividades/inscripciones/${baja.id}/baja`, { motivo }), { ok: 'Baja registrada', invalidar: ['/api/actividades'], alTerminar: () => setBaja(null) });
  const quitarEspera = useAccion((id) => api.del(`/api/actividades/lista-espera/${id}`), { ok: 'Quitado de la lista', invalidar: ['/api/actividades'] });
  const grupos = (act.data ?? []).flatMap((a) => a.grupos.map((g) => ({ value: g.id, label: `${a.nombre} · ${g.nombre} (${g.vacantes} vac.)`, aranceles: a.aranceles })));

  return (
    <>
      <Encabezado titulo="Inscripciones" subtitulo="Inscripciones, bajas, lista de espera y descuentos aplicados."
        acciones={<Boton icono="add" onClick={() => { setAlta({ persona: null, grupo_id: '', frecuencia: 1 }); setBusqueda(''); }}>Inscribir</Boton>} />
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'inscripciones', label: 'Inscripciones' }, { value: 'espera', label: 'Lista de espera', n: q.data?.lista_espera.length }, { value: 'ocupacion', label: 'Ocupación' }]} />
      {vista === 'inscripciones' && (
        <div className="grid grid-cols-2 gap-2 mb-space-md">
          <Selector value={f.actividad_id} onChange={(e) => setF({ ...f, actividad_id: e.target.value })} vacio="Todas las actividades" opciones={(act.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))} />
          <Selector value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} vacio="Vigentes" opciones={['activa', 'pendiente_apto', 'baja_solicitada', 'baja'].map((e) => ({ value: e, label: capitalizar(e) }))} />
        </div>
      )}
      <Consulta q={q}>
        {(d) => (
          <Tarjeta cuerpo="p-space-md">
            {vista === 'inscripciones' && (
              <Tabla compacta columnas={[
                { k: 'persona', t: 'Persona', r: (i) => <div><p className="font-semibold">{i.apellido}, {i.nombre}</p><p className="text-body-sm text-secondary">{i.nro_socio ? `N° ${i.nro_socio}` : 'No socio'}</p></div> },
                { k: 'actividad', t: 'Actividad', r: (i) => `${i.actividad} · ${i.grupo}` },
                { k: 'frecuencia_semanal', t: 'Frec.', r: (i) => `${i.frecuencia_semanal}x` },
                { k: 'descuento', t: 'Descuento', r: (i) => i.descuento ?? '—' },
                { k: 'desde', t: 'Desde', r: (i) => fecha(i.desde) },
                { k: 'estado', t: 'Estado', r: (i) => <Estado valor={i.estado} /> },
                { k: 'acc', t: '', derecha: true, r: (i) => i.estado !== 'baja' && <Boton chico variante="fantasma" onClick={() => setBaja(i)}>Baja</Boton> },
              ]} filas={d.inscripciones} />
            )}
            {vista === 'espera' && (
              <Tabla columnas={[
                { k: 'posicion', t: '#', r: (e) => <strong>{e.posicion}</strong> },
                { k: 'persona', t: 'Persona', r: (e) => `${e.apellido}, ${e.nombre}` },
                { k: 'grupo', t: 'Grupo', r: (e) => `${e.actividad} · ${e.grupo}` },
                { k: 'creada_en', t: 'Desde', r: (e) => fecha(e.creada_en) },
                { k: 'avisado_en', t: 'Aviso', r: (e) => (e.avisado_en ? <Estado tono="info" texto="Avisado" /> : '—') },
                { k: 'acc', t: '', derecha: true, r: (e) => <Boton chico variante="fantasma" onClick={() => quitarEspera.mutate(e.id)}>Quitar</Boton> },
              ]} filas={d.lista_espera} vacio="Nadie en lista de espera" />
            )}
            {vista === 'ocupacion' && (
              <div className="grid sm:grid-cols-2 gap-3">
                {d.ocupacion.map((g) => (
                  <div key={g.id} className="p-3 rounded-xl bg-surface">
                    <div className="flex justify-between text-body-md"><span className="font-semibold">{g.actividad} · {g.nombre}</span><span>{g.ocupados}/{g.cupo}</span></div>
                    <Barra valor={g.ocupados} max={g.cupo} tono={g.ocupados >= g.cupo ? 'critico' : g.ocupados / g.cupo > 0.8 ? 'alerta' : 'exito'} className="mt-2" />
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>
        )}
      </Consulta>
      <Modal abierto={!!alta} titulo="Inscribir en un grupo" onCerrar={() => setAlta(null)} pie={<Boton cargando={inscribir.isPending} disabled={!alta?.persona || !alta?.grupo_id} onClick={() => inscribir.mutate()}>Inscribir</Boton>}>
        {alta && (
          <div className="space-y-space-md">
            {alta.persona ? <Fila icono="person" titulo={`${alta.persona.apellido}, ${alta.persona.nombre}`} detalle={`DNI ${alta.persona.dni}`} derecha={<Boton chico variante="fantasma" onClick={() => setAlta({ ...alta, persona: null })}>Cambiar</Boton>} /> : (
              <><Buscador valor={busqueda} onChange={setBusqueda} placeholder="Persona: apellido, DNI o N° de socio" />
                <div className="space-y-1 max-h-48 overflow-y-auto">{(personas.data ?? []).map((p) => <Fila key={p.id} icono="person" titulo={`${p.apellido}, ${p.nombre}`} detalle={`DNI ${p.dni}`} onClick={() => setAlta({ ...alta, persona: p })} />)}</div></>
            )}
            <Campo etiqueta="Grupo"><Selector value={alta.grupo_id} onChange={(e) => setAlta({ ...alta, grupo_id: e.target.value })} vacio="Elegí" opciones={grupos} /></Campo>
            <Campo etiqueta="Frecuencia semanal"><Entrada type="number" min="0" max="7" value={alta.frecuencia} onChange={(e) => setAlta({ ...alta, frecuencia: e.target.value })} /></Campo>
            <p className="text-body-sm text-secondary">El precio y el descuento se calculan solos según la condición de la persona. Si la actividad exige apto, queda pendiente.</p>
          </div>
        )}
      </Modal>
      <DialogoMotivo abierto={!!baja} titulo="Dar de baja la inscripción" onCerrar={() => setBaja(null)} onConfirmar={(m) => darBaja.mutate(m)} cargando={darBaja.isPending} boton="Dar de baja" />
    </>
  );
}
