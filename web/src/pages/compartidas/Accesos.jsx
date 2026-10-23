import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { fechaHora, hoy, sumarDias, capitalizar } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Estado, Tabla, Selector, Entrada, Buscador, Kpi, Grilla } from '../../components/ui.jsx';
import { BarrasH } from '../../components/graficos.jsx';

const MOTIVOS = { codigo_invalido: 'Código inválido', baja_suspension: 'Baja o suspensión', sin_inscripcion: 'Sin inscripción en el horario', cuota_social: 'Cuota social', arancel: 'Arancel de actividad', apto_medico: 'Apto médico', bloqueo_cupo: 'Bloqueo o cupo' };

/** Historial de ingresos por actividad y punto de acceso, con filtros. */
export default function Accesos() {
  const [f, setF] = useState({ desde: sumarDias(hoy(), -7), hasta: hoy(), actividad_id: '', punto_acceso_id: '', resultado: '', q: '' });
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const q = useDatos(`/api/acceso/historial?${params}&limite=200`, { placeholderData: (p) => p });
  const actividades = useDatos('/api/actividades');
  const puntos = useDatos('/api/acceso/puntos');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Encabezado titulo="Accesos y fichajes" subtitulo="Cada lectura con su resultado y motivo. Registro conservado 12 meses con detalle." />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-space-md">
        <Entrada type="date" value={f.desde} onChange={set('desde')} aria-label="Desde" />
        <Entrada type="date" value={f.hasta} onChange={set('hasta')} aria-label="Hasta" />
        <Selector value={f.actividad_id} onChange={set('actividad_id')} vacio="Toda actividad" opciones={(actividades.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))} />
        <Selector value={f.punto_acceso_id} onChange={set('punto_acceso_id')} vacio="Todo punto" opciones={(puntos.data ?? []).map((p) => ({ value: p.id, label: p.nombre }))} />
        <Selector value={f.resultado} onChange={set('resultado')} vacio="Todo resultado" opciones={[{ value: 'habilitado', label: 'Habilitados' }, { value: 'denegado', label: 'Denegados' }]} />
        <Buscador valor={f.q} onChange={(v) => setF({ ...f, q: v })} placeholder="Socio" />
      </div>
      <Consulta q={q}>
        {(d) => {
          const r = Object.fromEntries(d.resumen.map((x) => [x.resultado, x.n]));
          return (
            <div className="grid lg:grid-cols-3 gap-space-md">
              <div className="lg:col-span-1 space-y-space-md">
                <Grilla cols="grid-cols-2">
                  <Kpi etiqueta="Habilitados" valor={r.habilitado ?? 0} icono="check_circle" tono="exito" />
                  <Kpi etiqueta="Denegados" valor={r.denegado ?? 0} icono="block" tono="critico" />
                </Grilla>
                <Tarjeta titulo="Motivos de rechazo" icono="report">
                  <BarrasH moneda={false} color="#1f2937" datos={d.motivos.map((m) => ({ etiqueta: MOTIVOS[m.motivo_codigo] ?? m.motivo_codigo, valor: m.n }))} />
                </Tarjeta>
              </div>
              <Tarjeta className="lg:col-span-2" cuerpo="p-space-md">
                <Tabla compacta columnas={[
                  { k: 'fecha_hora', t: 'Fecha', r: (a) => fechaHora(a.fecha_hora) },
                  { k: 'persona', t: 'Persona', r: (a) => (a.apellido ? `${a.apellido}, ${a.nombre}${a.nro_socio ? ` (${a.nro_socio})` : ''}` : '—') },
                  { k: 'actividad', t: 'Actividad / punto', r: (a) => <span>{a.actividad ?? 'Ingreso general'}<br /><span className="text-secondary">{a.punto ?? '—'}</span></span> },
                  { k: 'metodo', t: 'Método', r: (a) => capitalizar(a.metodo) },
                  { k: 'resultado', t: 'Resultado', r: (a) => <div><Estado valor={a.resultado} />{a.motivo_codigo && <p className="text-label-sm text-secondary mt-0.5">{MOTIVOS[a.motivo_codigo] ?? a.motivo_codigo}</p>}</div> },
                ]} filas={d.filas} vacio="Sin accesos en el período" />
              </Tarjeta>
            </div>
          );
        }}
      </Consulta>
    </>
  );
}
