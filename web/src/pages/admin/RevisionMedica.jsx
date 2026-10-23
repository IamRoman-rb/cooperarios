import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Pestanas, Modal, Campo, Entrada, Casilla, Kpi, Grilla, Aviso } from '../../components/ui.jsx';

/** Gestión administrativa: qué actividades requieren revisión, vigencias, pendientes y vencimientos próximos. */
export default function RevisionMedica() {
  const [vista, setVista] = useState('pendientes');
  const pend = useDatos('/api/medico/pendientes?dias=30');
  const act = useDatos('/api/actividades');
  const op = useDatos('/api/actividades/aux/opciones');
  const [req, setReq] = useState(null);
  const guardar = useAccion(() => api.put(`/api/actividades/${req.actividad.id}/requisitos`, req.lista.filter((x) => x.activo).map((x) => ({ tipo_revision_id: x.tipo_revision_id, bloqueante: x.bloqueante, dias_gracia: Number(x.dias_gracia) }))), { ok: 'Requisitos actualizados', invalidar: ['/api/actividades', '/api/medico'], alTerminar: () => setReq(null) });
  const personas = (pend.data ?? []).flatMap((g) => g.personas);
  return (
    <>
      <Encabezado titulo="Revisión médica" subtitulo="Requisitos por actividad, vigencias, pendientes y vencimientos. Sin datos clínicos: solo estado y vencimiento." />
      <Grilla cols="grid-cols-3" className="mb-space-md">
        <Kpi etiqueta="Vencidos" valor={personas.filter((p) => p.situacion === 'vencido').length} icono="event_busy" tono="critico" />
        <Kpi etiqueta="Por vencer (30 días)" valor={personas.filter((p) => p.situacion === 'por_vencer').length} icono="event_upcoming" tono="alerta" />
        <Kpi etiqueta="Sin apto" valor={personas.filter((p) => p.situacion === 'sin_apto').length} icono="medical_services" />
      </Grilla>
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'pendientes', label: 'Pendientes y vencimientos' }, { value: 'requisitos', label: 'Requisitos por actividad' }]} />
      {vista === 'pendientes' ? (
        <Consulta q={pend}>
          {(grupos) => (
            <div className="space-y-space-md">
              {grupos.map((g) => (
                <Tarjeta key={g.actividad} titulo={g.actividad} cuerpo="p-space-md">
                  <Tabla compacta clave="persona_id" columnas={[
                    { k: 'persona', t: 'Socio', r: (p) => `${p.apellido}, ${p.nombre}${p.nro_socio ? ` (N° ${p.nro_socio})` : ''}` },
                    { k: 'tipo', t: 'Revisión' },
                    { k: 'vence_en', t: 'Vence', r: (p) => fecha(p.vence_en) },
                    { k: 'situacion', t: 'Estado', r: (p) => <Estado valor={p.situacion} /> },
                  ]} filas={g.personas} />
                </Tarjeta>
              ))}
            </div>
          )}
        </Consulta>
      ) : (
        <Consulta q={act}>
          {(lista) => (
            <Tarjeta cuerpo="p-space-md">
              <Tabla columnas={[
                { k: 'nombre', t: 'Actividad' },
                { k: 'requisitos', t: 'Requisitos', r: (a) => (a.requisitos.length ? a.requisitos.map((r) => <p key={r.tipo_revision_id} className="text-body-sm">{r.nombre} · {r.bloqueante ? 'bloqueante' : 'aviso'} · {r.dias_gracia} días de gracia</p>) : <span className="text-secondary">No requiere</span>) },
                { k: 'e', t: '', derecha: true, r: (a) => <Boton chico variante="suave" icono="edit" onClick={() => setReq({ actividad: a, lista: (op.data?.tipos_revision ?? []).map((t) => { const r = a.requisitos.find((x) => x.tipo_revision_id === t.id); return { tipo_revision_id: t.id, nombre: t.nombre, vigencia: t.vigencia_meses, activo: !!r, bloqueante: r ? !!r.bloqueante : true, dias_gracia: r?.dias_gracia ?? 0 }; }) })}>Editar</Boton> },
              ]} filas={lista} />
            </Tarjeta>
          )}
        </Consulta>
      )}
      <Modal abierto={!!req} titulo={req ? `Requisitos de ${req.actividad.nombre}` : ''} onCerrar={() => setReq(null)} pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {req && (
          <div className="space-y-space-md">
            {req.lista.map((x, i) => {
              const set = (k, v) => setReq({ ...req, lista: req.lista.map((y, j) => (j === i ? { ...y, [k]: v } : y)) });
              return (
                <div key={x.tipo_revision_id} className="p-3 rounded-xl bg-surface space-y-2">
                  <Casilla checked={x.activo} onChange={(e) => set('activo', e.target.checked)} etiqueta={`${x.nombre} (vigencia ${x.vigencia} ${x.vigencia === 1 ? 'mes' : 'meses'})`} />
                  {x.activo && (
                    <div className="grid grid-cols-2 gap-2 pl-7">
                      <Casilla checked={x.bloqueante} onChange={(e) => set('bloqueante', e.target.checked)} etiqueta="Bloqueante (impide el ingreso)" />
                      <Campo etiqueta="Días de gracia"><Entrada type="number" min="0" value={x.dias_gracia} onChange={(e) => set('dias_gracia', e.target.value)} /></Campo>
                    </div>
                  )}
                </div>
              );
            })}
            <Aviso tono="info">Las inscripciones nuevas quedan «pendiente de apto» hasta que el médico habilite.</Aviso>
          </div>
        )}
      </Modal>
    </>
  );
}
