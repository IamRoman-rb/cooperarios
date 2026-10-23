import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fecha, hora, relativa } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Casilla, Campo, Entrada, Fila, Vacio } from '../../components/ui.jsx';

/** Avisos de vencimiento y de turno por actividad. Los automáticos salen a 30, 15 y 7 días. */
export default function Recordatorios() {
  const q = useDatos('/api/medico/recordatorios');
  const [elegidos, setElegidos] = useState(new Set());
  const [mensaje, setMensaje] = useState('Tu apto médico vence pronto. Pedí turno en Revisión médica.');
  const enviar = useAccion((d) => api.post('/api/medico/recordatorios', d), { ok: (r) => `${r.enviados} recordatorio(s) enviados`, invalidar: ['/api/medico'], alTerminar: () => setElegidos(new Set()) });
  const alternar = (id) => { const s = new Set(elegidos); if (s.has(id)) s.delete(id); else s.add(id); setElegidos(s); };
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Recordatorios" subtitulo="Los avisos automáticos salen a 30, 15 y 7 días del vencimiento. Desde acá podés enviar avisos manuales." />
          <div className="grid lg:grid-cols-3 gap-space-md">
            <Tarjeta className="lg:col-span-2" titulo="Vencimientos (30 días)" icono="event_upcoming" cuerpo="p-space-md space-y-space-md">
              <Tabla compacta clave="persona_id" columnas={[
                { k: 'sel', t: '', r: (v) => <Casilla checked={elegidos.has(v.persona_id)} onChange={() => alternar(v.persona_id)} etiqueta="" /> },
                { k: 'nombre', t: 'Persona' },
                { k: 'actividad', t: 'Actividad' },
                { k: 'vence_en', t: 'Vence', r: (v) => fecha(v.vence_en) },
                { k: 'situacion', t: 'Estado', r: (v) => <Estado valor={v.situacion} /> },
              ]} filas={d.vencimientos.filter((v, i, arr) => arr.findIndex((x) => x.persona_id === v.persona_id) === i)} vacio="Sin vencimientos próximos" />
              <Campo etiqueta="Mensaje"><Entrada value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={200} /></Campo>
              <Boton icono="send" disabled={!elegidos.size} cargando={enviar.isPending} onClick={() => enviar.mutate({ persona_ids: [...elegidos], mensaje })}>Enviar a {elegidos.size} persona(s)</Boton>
            </Tarjeta>
            <div className="space-y-space-md">
              <Tarjeta titulo="Turnos de mañana" icono="event" cuerpo="p-space-md space-y-2">
                {d.turnos_manana.length === 0 ? <Vacio titulo="Sin turnos mañana" /> : d.turnos_manana.map((t) => <Fila key={t.id} icono="schedule" titulo={`${hora(t.inicio)} · ${t.apellido}, ${t.nombre}`} detalle={t.tipo} />)}
                {d.turnos_manana.length > 0 && <Boton chico variante="suave" icono="notifications" onClick={() => enviar.mutate({ persona_ids: d.turnos_manana.map((t) => t.persona_id), mensaje: 'Recordatorio: mañana tenés turno de revisión médica en el club.' })}>Recordar turnos</Boton>}
              </Tarjeta>
              <Tarjeta titulo="Últimos envíos" icono="outbox" cuerpo="p-space-md space-y-2">
                {d.enviados.map((e, i) => <Fila key={i} icono="notifications_active" titulo={e.titulo} detalle={`${e.n} envíos · ${relativa(e.ultimo)}`} />)}
              </Tarjeta>
            </div>
          </div>
        </>
      )}
    </Consulta>
  );
}
