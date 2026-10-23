// Comunicados segmentados. Administración envía a todos o por actividad/categoría/grupo;
// el delegado a los socios de su actividad; el profesor a sus grupos (con alcance limitado en el servidor).
import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { fechaHora, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Campo, Entrada, Selector, Area, Casilla, Vacio, Estado } from '../../components/ui.jsx';

export default function Comunicados({ alcance = 'todos' }) {
  const q = useDatos('/api/comunicados');
  const prof = useDatos(alcance === 'grupo' ? '/api/clases/comunicaciones' : null);
  const { usuario, roles } = useSesion();
  const ambito = roles.filter((r) => r.codigo === 'subcomision').map((r) => r.actividad_id);
  const [form, setForm] = useState({ titulo: '', cuerpo: '', tipo: alcance === 'todos' ? 'todos' : alcance, id: '', categoria: 'institucional', publico: false });
  const enviar = useAccion(() => api.post('/api/comunicados', {
    titulo: form.titulo, cuerpo: form.cuerpo, categoria: alcance === 'todos' ? form.categoria : 'actividad', publico: form.publico,
    audiencia: form.tipo === 'todos' ? { tipo: 'todos' } : { tipo: form.tipo, id: form.id || opcionesDe(form.tipo)[0]?.value },
  }), { ok: (r) => `Comunicado enviado a ${r.destinatarios} destinatarios`, invalidar: ['/api/comunicados', '/api/clases'], alTerminar: () => setForm({ ...form, titulo: '', cuerpo: '' }) });

  function opcionesDe(tipo) {
    const o = q.data?.opciones ?? {};
    if (tipo === 'actividad') return (o.actividades ?? []).filter((a) => alcance !== 'actividad' || ambito.includes(a.id)).map((a) => ({ value: a.id, label: a.nombre }));
    if (tipo === 'categoria') return (o.categorias ?? []).map((c) => ({ value: c.id, label: c.nombre }));
    if (tipo === 'grupo') return alcance === 'grupo' ? (prof.data?.grupos ?? []).map((g) => ({ value: g.id, label: g.nombre })) : (o.grupos ?? []).map((g) => ({ value: g.id, label: g.nombre }));
    return [];
  }
  const tipos = alcance === 'todos' ? [{ value: 'todos', label: 'Todo el padrón' }, { value: 'actividad', label: 'Por actividad' }, { value: 'categoria', label: 'Por categoría' }, { value: 'grupo', label: 'Por grupo' }]
    : alcance === 'actividad' ? [{ value: 'actividad', label: 'Socios de mi actividad' }] : [{ value: 'grupo', label: 'Alumnos o familias de mi grupo' }];

  return (
    <>
      <Encabezado titulo={alcance === 'grupo' ? 'Comunicaciones' : 'Comunicados'} subtitulo={alcance === 'todos' ? 'Envío segmentado por actividad, categoría o grupo.' : alcance === 'actividad' ? 'Mensajes a los socios de tu actividad.' : 'Mensajes a alumnos o familias de tus grupos.'} />
      <div className="grid lg:grid-cols-5 gap-space-md">
        <Tarjeta className="lg:col-span-2" titulo="Nuevo comunicado" icono="edit_note" franja>
          <div className="space-y-space-md">
            <Campo etiqueta="Destinatarios"><Selector value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, id: '' })} opciones={tipos} /></Campo>
            {form.tipo !== 'todos' && <Campo etiqueta="Elegí"><Selector value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} opciones={opcionesDe(form.tipo)} /></Campo>}
            {alcance === 'todos' && <Campo etiqueta="Categoría"><Selector value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} opciones={['institucional', 'actividad', 'natatorio', 'mantenimiento', 'eventos'].map((c) => ({ value: c, label: capitalizar(c) }))} /></Campo>}
            <Campo etiqueta="Título"><Entrada value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} maxLength={140} /></Campo>
            <Campo etiqueta="Mensaje"><Area value={form.cuerpo} onChange={(e) => setForm({ ...form, cuerpo: e.target.value })} rows={6} /></Campo>
            {alcance === 'todos' && <Casilla checked={form.publico} onChange={(e) => setForm({ ...form, publico: e.target.checked })} etiqueta="Publicar también en el sitio público (Novedades)" />}
            <Boton completo icono="send" cargando={enviar.isPending} disabled={form.titulo.length < 3 || form.cuerpo.length < 3} onClick={() => enviar.mutate()}>Enviar</Boton>
          </div>
        </Tarjeta>
        <Tarjeta className="lg:col-span-3" titulo="Enviados" icono="outbox" cuerpo="p-space-md space-y-3">
          <Consulta q={q}>
            {(d) => {
              const lista = alcance === 'todos' ? d.comunicados : d.comunicados.filter((c) => c.publicado_por === usuario.id || alcance === 'actividad');
              return lista.length === 0 ? <Vacio icono="campaign" titulo="Sin comunicados" /> : lista.map((c) => (
                <article key={c.id} className="p-3 rounded-xl bg-surface">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Estado tono="info" texto={c.audiencia.tipo === 'todos' ? 'Todos' : capitalizar(c.audiencia.tipo)} />
                    {c.publico ? <Estado tono="exito" texto="Público" /> : null}
                    <span className="text-body-sm text-secondary">{fechaHora(c.publicado_en)} · {c.autor}</span>
                  </div>
                  <p className="font-label-lg text-label-lg mt-1.5">{c.titulo}</p>
                  <p className="text-body-sm text-secondary line-clamp-2">{c.cuerpo}</p>
                </article>
              ));
            }}
          </Consulta>
        </Tarjeta>
      </div>
    </>
  );
}
