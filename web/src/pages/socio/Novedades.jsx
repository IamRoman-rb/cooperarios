import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fechaLarga, relativa, capitalizar } from '../../lib/formato.js';
import { Icono, Boton, Encabezado, Consulta, Pestanas, Vacio, cx } from '../../components/ui.jsx';

export default function Novedades() {
  const q = useDatos('/api/socio/novedades');
  const [vista, setVista] = useState('comunicados');
  const navegar = useNavigate();
  const leer = useAccion((id) => api.post('/api/notificaciones/leer', id ? { id } : {}), { invalidar: ['/api/notificaciones', '/api/socio'] });
  return (
    <>
      <Encabezado titulo="Novedades y notificaciones" subtitulo="Comunicados del club, de tus actividades y avisos personales."
        acciones={vista === 'avisos' && <Boton variante="suave" icono="done_all" onClick={() => leer.mutate()}>Marcar todo leído</Boton>} />
      <Consulta q={q}>
        {(d) => (
          <>
            <Pestanas valor={vista} onChange={setVista} opciones={[
              { value: 'comunicados', label: 'Comunicados', icono: 'campaign' },
              { value: 'avisos', label: 'Mis avisos', icono: 'notifications', n: d.notificaciones.filter((n) => !n.leida_en).length },
            ]} />
            {vista === 'comunicados' ? (
              d.comunicados.length === 0 ? <Vacio icono="campaign" titulo="Sin comunicados" /> : (
                <div className="space-y-3">
                  {d.comunicados.map((c) => {
                    const a = JSON.parse(c.audiencia);
                    return (
                      <article key={c.id} className="tarjeta p-space-md">
                        <div className="flex items-center gap-2 flex-wrap text-label-sm uppercase">
                          <span className={cx('px-2 py-0.5 rounded-full', a.tipo === 'todos' ? 'bg-primary-container text-on-primary' : 'bg-secondary-container text-on-secondary-fixed')}>{a.tipo === 'todos' ? 'Club' : capitalizar(c.categoria)}</span>
                          <span className="text-secondary">{fechaLarga(c.publicado_en)}</span>
                        </div>
                        <h2 className="font-headline-sm text-headline-sm mt-2">{c.titulo}</h2>
                        <p className="text-body-md text-on-surface-variant mt-1 whitespace-pre-line">{c.cuerpo}</p>
                        {c.autor && <p className="text-body-sm text-secondary mt-2">— {c.autor}</p>}
                      </article>
                    );
                  })}
                </div>
              )
            ) : d.notificaciones.length === 0 ? <Vacio icono="notifications_off" titulo="Sin avisos" /> : (
              <div className="tarjeta divide-y divide-surface-container">
                {d.notificaciones.map((n) => (
                  <button key={n.id} onClick={() => { leer.mutate(n.id); if (n.referencia) navegar(n.referencia); }} className={cx('w-full text-left p-space-md flex gap-3 hover:bg-surface-container-low', !n.leida_en && 'bg-critico-suave/30')}>
                    <Icono n={{ pago: 'payments', revision_medica: 'medical_services', ticket: 'build', comunicado: 'campaign', cobranza: 'receipt_long', turno: 'event' }[n.tipo] ?? 'notifications'} className="text-primary-container" />
                    <div className="flex-1">
                      <p className={cx('text-body-md', !n.leida_en && 'font-semibold')}>{n.titulo}</p>
                      <p className="text-body-sm text-secondary">{relativa(n.creada_en)}</p>
                    </div>
                    {!n.leida_en && <span className="w-2 h-2 rounded-full bg-primary-container mt-2" />}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </Consulta>
    </>
  );
}
