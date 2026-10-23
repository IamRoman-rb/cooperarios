import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha, sumarDias, hoy } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Campo, Entrada, Selector, Buscador, Fila, Aviso, Avatar, Pestanas } from '../../components/ui.jsx';

const RESULTADOS = [{ value: 'apto', label: 'Apto' }, { value: 'apto_restricciones', label: 'Apto con restricciones' }, { value: 'no_apto', label: 'No apto' }, { value: 'postergado', label: 'Postergado' }];

/** Buscar persona, registrar resultado, vigencia y firma. Un resultado firmado no se edita: se corrige con una nueva revisión. */
export default function NuevaRevision() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [personaId, setPersonaId] = useState(params.get('persona'));
  const [busqueda, setBusqueda] = useState('');
  const lista = useDatos(busqueda.length >= 2 ? `/api/medico/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const ficha = useDatos(personaId ? `/api/medico/personas/${personaId}` : null);
  const agenda = useDatos('/api/medico/agenda');
  const [form, setForm] = useState({ tipo_revision_id: params.get('tipo') ?? '', resultado: 'apto', restricciones: '', vence_en: '', reemplaza_id: '' });
  const tipos = agenda.data?.tipos ?? [];
  const tipo = tipos.find((t) => String(t.id) === String(form.tipo_revision_id || tipos[0]?.id));
  const venceSugerido = tipo ? (() => { const d = new Date(`${hoy()}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + tipo.vigencia_meses); return d.toISOString().slice(0, 10); })() : '';
  const firmar = useAccion(() => api.post('/api/medico/revisiones', {
    persona_id: personaId, tipo_revision_id: tipo.id, resultado: form.resultado, restricciones: form.restricciones || null,
    vence_en: ['apto', 'apto_restricciones'].includes(form.resultado) ? form.vence_en || venceSugerido : null,
    turno_id: params.get('turno'), reemplaza_id: form.reemplaza_id || null,
  }), { ok: 'Revisión registrada y firmada', invalidar: ['/api/medico'], alTerminar: () => navegar('/agenda-medica') });

  return (
    <>
      <Encabezado titulo="Nueva revisión" subtitulo="Se guarda solo la constancia de aptitud: resultado, restricciones codificadas y vigencia." />
      <div className="grid lg:grid-cols-3 gap-space-md">
        <Tarjeta titulo="Persona" icono="person_search" cuerpo="p-space-md space-y-2">
          <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Apellido, DNI o N° de socio" />
          {(lista.data ?? []).map((p) => <Fila key={p.id} icono="person" titulo={`${p.apellido}, ${p.nombre}`} detalle={`DNI ${p.dni} · ${p.edad} años`} onClick={() => { setPersonaId(p.id); setBusqueda(''); }} />)}
          {!personaId && !busqueda && <p className="text-body-sm text-secondary">Buscá a la persona o atendé un turno desde la agenda.</p>}
        </Tarjeta>
        <div className="lg:col-span-2">
          {personaId && (
            <Consulta q={ficha}>
              {(p) => (
                <div className="space-y-space-md">
                  <Tarjeta cuerpo="p-space-md flex items-center gap-4">
                    <Avatar persona={p} tam={56} />
                    <div className="flex-1"><p className="text-headline-sm">{p.apellido}, {p.nombre}</p><p className="text-body-sm text-secondary">DNI {p.dni} · {p.edad} años{p.nro_socio ? ` · Socio N° ${p.nro_socio}` : ''}</p>
                      <p className="text-body-sm text-secondary">Actividades: {p.actividades.map((a) => a.nombre).join(', ') || '—'}</p></div>
                  </Tarjeta>
                  {p.edad < 18 && !p.consentimiento_salud?.aceptado_por_tutor_id && <Aviso tono="critico" titulo="Falta el consentimiento del tutor">No se puede registrar la revisión de un menor sin el consentimiento del tutor para datos de salud.</Aviso>}
                  <Tarjeta titulo="Resultado" icono="stethoscope" franja cuerpo="p-space-md space-y-space-md">
                    <Campo etiqueta="Tipo de revisión"><Selector value={tipo?.id ?? ''} onChange={(e) => setForm({ ...form, tipo_revision_id: e.target.value })} opciones={tipos.map((t) => ({ value: t.id, label: `${t.nombre} (vigencia ${t.vigencia_meses} ${t.vigencia_meses === 1 ? 'mes' : 'meses'})` }))} /></Campo>
                    <Pestanas valor={form.resultado} onChange={(v) => setForm({ ...form, resultado: v })} opciones={RESULTADOS} />
                    {form.resultado === 'apto_restricciones' && <Campo etiqueta="Restricciones codificadas" ayuda="Sin diagnósticos: solo códigos o indicaciones operativas."><Entrada value={form.restricciones} onChange={(e) => setForm({ ...form, restricciones: e.target.value })} /></Campo>}
                    {['apto', 'apto_restricciones'].includes(form.resultado) && <Campo etiqueta="Vigencia hasta"><Entrada type="date" min={hoy()} value={form.vence_en || venceSugerido} onChange={(e) => setForm({ ...form, vence_en: e.target.value })} /></Campo>}
                    {p.revisiones.some((r) => r.firmada_en) && (
                      <Campo etiqueta="¿Corrige una revisión anterior?" ayuda="La anterior no se modifica: queda en el historial enlazada a esta.">
                        <Selector value={form.reemplaza_id} onChange={(e) => setForm({ ...form, reemplaza_id: e.target.value })} vacio="No" opciones={p.revisiones.filter((r) => r.firmada_en).map((r) => ({ value: r.id, label: `${fecha(r.fecha)} · ${r.tipo} · ${r.resultado}` }))} />
                      </Campo>
                    )}
                    <Boton completo icono="draw" cargando={firmar.isPending} disabled={!tipo || (form.resultado === 'apto_restricciones' && !form.restricciones)} onClick={() => firmar.mutate()}>Registrar y firmar</Boton>
                  </Tarjeta>
                  <Tarjeta titulo="Historial en el club" icono="history" cuerpo="p-space-md space-y-2">
                    {p.revisiones.length === 0 ? <p className="text-body-sm text-secondary">Sin revisiones previas.</p> : p.revisiones.map((r) => (
                      <Fila key={r.id} icono="assignment" titulo={`${r.tipo} · ${fecha(r.fecha)}`} detalle={`${r.profesional ?? 'Certificado externo'}${r.vence_en ? ` · hasta ${fecha(r.vence_en)}` : ''}${r.restricciones ? ` · ${r.restricciones}` : ''}`} derecha={<Estado valor={r.resultado} />} />
                    ))}
                  </Tarjeta>
                  <p className="text-body-sm text-secondary">Sugerencia de próxima revisión: {fecha(sumarDias(hoy(), (tipo?.vigencia_meses ?? 12) * 30))}.</p>
                </div>
              )}
            </Consulta>
          )}
        </div>
      </div>
    </>
  );
}
