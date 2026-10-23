import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha, hoy, sumarDias, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Campo, Entrada, Selector, Area, Buscador, Fila, Aviso, Pestanas } from '../../components/ui.jsx';

/** Días de gracia, ventanas horarias y habilitaciones manuales con motivo y vencimiento (las aprueba la Directiva). */
export default function Habilitacion() {
  const q = useDatos('/api/acceso/reglas');
  const [vista, setVista] = useState('reglas');
  const [regla, setRegla] = useState(null);
  const [manual, setManual] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const personas = useDatos(manual && busqueda.length >= 2 ? `/api/cobranzas/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const guardarRegla = useAccion(() => api.put('/api/acceso/reglas', { actividad_id: regla.actividad_id || null, ...Object.fromEntries(['gracia_cuota_dias', 'gracia_arancel_dias', 'ventana_antes_min', 'ventana_despues_min'].map((k) => [k, Number(regla[k])])) }), { ok: 'Regla guardada', invalidar: ['/api/acceso'], alTerminar: () => setRegla(null) });
  const solicitar = useAccion(() => api.post('/api/acceso/manuales', { persona_id: manual.persona.id, actividad_id: manual.actividad_id || null, tipo: manual.tipo, motivo: manual.motivo, desde: manual.desde, hasta: manual.hasta }), { ok: 'Solicitud enviada a la Comisión Directiva', invalidar: ['/api/acceso'], alTerminar: () => setManual(null) });
  const revocar = useAccion((id) => api.post(`/api/acceso/manuales/${id}/revocar`), { ok: 'Revocada', invalidar: ['/api/acceso'] });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Reglas de habilitación" subtitulo="Qué se evalúa en cada lectura del QR, con días de gracia y ventanas por actividad."
            acciones={<Boton icono="add" onClick={() => { setManual({ persona: null, actividad_id: '', tipo: 'excepcion', motivo: '', desde: hoy(), hasta: sumarDias(hoy(), 7) }); setBusqueda(''); }}>Habilitación manual</Boton>} />
          <Aviso tono="info" titulo="Orden de evaluación">
            Código válido y no repetido → persona activa → inscripción en ese grupo y horario → cuota social al día → arancel al día → revisión médica vigente (si la exige) → sin bloqueo y cupo en regla.
          </Aviso>
          <div className="mt-space-md" />
          <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'reglas', label: 'Reglas' }, { value: 'manuales', label: 'Excepciones y bloqueos', n: d.manuales.filter((m) => m.estado === 'pendiente').length }]} />
          {vista === 'reglas' ? (
            <Tarjeta cuerpo="p-space-md" accion={<Boton chico variante="suave" icono="add" onClick={() => setRegla({ actividad_id: d.actividades[0]?.id, gracia_cuota_dias: 10, gracia_arancel_dias: 5, ventana_antes_min: 15, ventana_despues_min: 0 })}>Regla por actividad</Boton>} titulo="Reglas vigentes">
              <Tabla columnas={[
                { k: 'actividad', t: 'Alcance', r: (r) => r.actividad ?? <strong>General del club</strong> },
                { k: 'gracia_cuota_dias', t: 'Gracia cuota', r: (r) => `${r.gracia_cuota_dias} días` },
                { k: 'gracia_arancel_dias', t: 'Gracia arancel', r: (r) => `${r.gracia_arancel_dias} días` },
                { k: 'ventana', t: 'Ventana horaria', r: (r) => `${r.ventana_antes_min} min antes · ${r.ventana_despues_min} min después` },
                { k: 'e', t: '', r: (r) => <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setRegla({ ...r, actividad_id: r.actividad_id ?? '' })} /> },
              ]} filas={d.reglas} />
            </Tarjeta>
          ) : (
            <Tarjeta cuerpo="p-space-md">
              <Tabla compacta columnas={[
                { k: 'persona', t: 'Socio', r: (m) => `${m.apellido}, ${m.nombre}${m.nro_socio ? ` (N° ${m.nro_socio})` : ''}` },
                { k: 'tipo', t: 'Tipo', r: (m) => <Estado tono={m.tipo === 'bloqueo' ? 'critico' : 'info'} texto={capitalizar(m.tipo)} /> },
                { k: 'actividad', t: 'Actividad', r: (m) => m.actividad ?? 'Todas' },
                { k: 'motivo', t: 'Motivo' },
                { k: 'vigencia', t: 'Vigencia', r: (m) => `${fecha(m.desde)} → ${fecha(m.hasta)}` },
                { k: 'estado', t: 'Estado', r: (m) => <div><Estado valor={m.estado} /><p className="text-label-sm text-secondary">{m.autorizante ? `Autorizó ${m.autorizante}` : `Pidió ${m.solicitante ?? '—'}`}</p></div> },
                { k: 'acc', t: '', r: (m) => ['aprobada', 'pendiente'].includes(m.estado) && <Boton chico variante="fantasma" onClick={() => revocar.mutate(m.id)}>Revocar</Boton> },
              ]} filas={d.manuales} vacio="Sin habilitaciones manuales" />
            </Tarjeta>
          )}
          <Modal abierto={!!regla} titulo="Regla de habilitación" onCerrar={() => setRegla(null)} pie={<Boton cargando={guardarRegla.isPending} onClick={() => guardarRegla.mutate()}>Guardar</Boton>}>
            {regla && (
              <div className="grid grid-cols-2 gap-space-md">
                <Campo etiqueta="Alcance" className="col-span-2"><Selector value={regla.actividad_id} onChange={(e) => setRegla({ ...regla, actividad_id: e.target.value })} vacio="General del club" opciones={d.actividades.map((a) => ({ value: a.id, label: a.nombre }))} /></Campo>
                <Campo etiqueta="Gracia cuota social (días)"><Entrada type="number" value={regla.gracia_cuota_dias} onChange={(e) => setRegla({ ...regla, gracia_cuota_dias: e.target.value })} /></Campo>
                <Campo etiqueta="Gracia arancel (días)"><Entrada type="number" value={regla.gracia_arancel_dias} onChange={(e) => setRegla({ ...regla, gracia_arancel_dias: e.target.value })} /></Campo>
                <Campo etiqueta="Minutos antes de la clase"><Entrada type="number" value={regla.ventana_antes_min} onChange={(e) => setRegla({ ...regla, ventana_antes_min: e.target.value })} /></Campo>
                <Campo etiqueta="Minutos después del fin"><Entrada type="number" value={regla.ventana_despues_min} onChange={(e) => setRegla({ ...regla, ventana_despues_min: e.target.value })} /></Campo>
              </div>
            )}
          </Modal>
          <Modal abierto={!!manual} titulo="Habilitación manual" onCerrar={() => setManual(null)} pie={<Boton cargando={solicitar.isPending} disabled={!manual?.persona || (manual?.motivo ?? '').length < 5} onClick={() => solicitar.mutate()}>Enviar a aprobación</Boton>}>
            {manual && (
              <div className="space-y-space-md">
                {manual.persona ? <Fila icono="person" titulo={`${manual.persona.apellido}, ${manual.persona.nombre}`} detalle={`DNI ${manual.persona.dni}`} derecha={<Boton chico variante="fantasma" onClick={() => setManual({ ...manual, persona: null })}>Cambiar</Boton>} /> : (
                  <><Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar socio" />{(personas.data ?? []).map((p) => <Fila key={p.id} icono="person" titulo={`${p.apellido}, ${p.nombre}`} detalle={`DNI ${p.dni}`} onClick={() => setManual({ ...manual, persona: p })} />)}</>
                )}
                <div className="grid grid-cols-2 gap-space-md">
                  <Campo etiqueta="Tipo"><Selector value={manual.tipo} onChange={(e) => setManual({ ...manual, tipo: e.target.value })} opciones={[{ value: 'excepcion', label: 'Excepción (habilita)' }, { value: 'bloqueo', label: 'Bloqueo (impide)' }]} /></Campo>
                  <Campo etiqueta="Actividad"><Selector value={manual.actividad_id} onChange={(e) => setManual({ ...manual, actividad_id: e.target.value })} vacio="Todas" opciones={d.actividades.map((a) => ({ value: a.id, label: a.nombre }))} /></Campo>
                  <Campo etiqueta="Desde"><Entrada type="date" value={manual.desde} onChange={(e) => setManual({ ...manual, desde: e.target.value })} /></Campo>
                  <Campo etiqueta="Hasta (vencimiento)"><Entrada type="date" value={manual.hasta} onChange={(e) => setManual({ ...manual, hasta: e.target.value })} /></Campo>
                  <Campo etiqueta="Motivo" className="col-span-2"><Area value={manual.motivo} onChange={(e) => setManual({ ...manual, motivo: e.target.value })} /></Campo>
                </div>
                <Aviso tono="info">Por separación de funciones, la aprueba la Comisión Directiva.</Aviso>
              </div>
            )}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
