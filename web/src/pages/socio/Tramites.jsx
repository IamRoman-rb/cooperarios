import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { fecha, relativa, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Campo, Entrada, Selector, Area, Pestanas, Modal, Vacio, Fila } from '../../components/ui.jsx';
import { FormularioTicket, DetalleTicket } from '../../components/compartidos.jsx';

const TIPOS = [
  { value: 'reclamo', label: 'Reclamo' },
  { value: 'sugerencia', label: 'Sugerencia' },
  { value: 'alta_familiar', label: 'Alta de un familiar' },
  { value: 'cambio_categoria', label: 'Cambio de categoría' },
  { value: 'baja', label: 'Baja como socio' },
];

export default function Tramites() {
  const q = useDatos('/api/socio/solicitudes');
  const { usuario } = useSesion();
  const [vista, setVista] = useState('nuevo');
  const [tipo, setTipo] = useState('reclamo');
  const [datos, setDatos] = useState({});
  const [ticket, setTicket] = useState(null);
  const enviar = useAccion(() => api.post('/api/socio/solicitudes', { tipo, datos }), { ok: 'Solicitud enviada a Administración', invalidar: ['/api/socio'], alTerminar: () => { setDatos({}); setVista('historial'); } });
  const campo = (k) => ({ value: datos[k] ?? '', onChange: (e) => setDatos({ ...datos, [k]: e.target.value }) });

  return (
    <>
      <Encabezado titulo="Trámites y reportes" subtitulo="Altas, bajas, cambios, reclamos y sugerencias. También podés reportar un desperfecto en el club." />
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'nuevo', label: 'Nuevo trámite', icono: 'add' }, { value: 'reporte', label: 'Reportar desperfecto', icono: 'build' }, { value: 'historial', label: 'Mis trámites', icono: 'history' }]} />
      {vista === 'nuevo' && (
        <Tarjeta titulo="Nuevo trámite" icono="assignment" franja>
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Tipo de trámite" className="sm:col-span-2"><Selector value={tipo} onChange={(e) => { setTipo(e.target.value); setDatos({}); }} opciones={TIPOS} /></Campo>
            {tipo === 'alta_familiar' && (
              <>
                <Campo etiqueta="Nombre"><Entrada {...campo('nombre')} /></Campo>
                <Campo etiqueta="Apellido"><Entrada {...campo('apellido')} /></Campo>
                <Campo etiqueta="DNI"><Entrada inputMode="numeric" {...campo('dni')} /></Campo>
                <Campo etiqueta="Fecha de nacimiento"><Entrada type="date" {...campo('fecha_nacimiento')} /></Campo>
                <Campo etiqueta="Parentesco" className="sm:col-span-2"><Entrada {...campo('parentesco')} placeholder="Hijo/a, cónyuge…" /></Campo>
              </>
            )}
            {tipo === 'cambio_categoria' && (
              <Campo etiqueta="Nueva categoría" className="sm:col-span-2">
                <Selector {...campo('categoria_id')} vacio="Elegí" opciones={(q.data?.categorias ?? []).filter((c) => c.edad_min != null).map((c) => ({ value: c.id, label: c.nombre }))} />
              </Campo>
            )}
            <Campo etiqueta={tipo === 'baja' ? 'Motivo de la baja' : 'Detalle'} className="sm:col-span-2">
              <Area {...campo(tipo === 'baja' ? 'motivo' : 'detalle')} />
            </Campo>
            <Boton className="sm:col-span-2" icono="send" cargando={enviar.isPending} onClick={() => enviar.mutate()}>Enviar</Boton>
          </div>
        </Tarjeta>
      )}
      {vista === 'reporte' && (
        <Tarjeta titulo="Reportar un desperfecto" subtitulo="Genera un ticket para el equipo de mantenimiento" icono="build" franja>
          <FormularioTicket alCrear={() => setVista('historial')} />
        </Tarjeta>
      )}
      {vista === 'historial' && (
        <Consulta q={q}>
          {(d) => (
            <div className="grid lg:grid-cols-2 gap-space-md">
              <Tarjeta titulo="Trámites" icono="assignment" cuerpo="p-space-md space-y-2">
                {d.solicitudes.length === 0 ? <Vacio titulo="Sin trámites" /> : d.solicitudes.map((s) => (
                  <Fila key={s.id} icono="assignment" titulo={capitalizar(s.tipo)} detalle={`${fecha(s.creada_en)}${s.respuesta ? ` · ${s.respuesta}` : ''}`} derecha={<Estado valor={s.estado} />} />
                ))}
              </Tarjeta>
              <Tarjeta titulo="Reportes de mantenimiento" icono="build" cuerpo="p-space-md space-y-2">
                {d.tickets.length === 0 ? <Vacio titulo="Sin reportes" /> : d.tickets.map((t) => (
                  <Fila key={t.id} icono="build" titulo={t.titulo} detalle={`${t.codigo} · ${t.sector} · ${relativa(t.creado_en)}`} derecha={<Estado valor={t.estado} />} onClick={() => setTicket(t.id)} />
                ))}
              </Tarjeta>
            </div>
          )}
        </Consulta>
      )}
      <Modal abierto={!!ticket} titulo="Reporte de mantenimiento" onCerrar={() => setTicket(null)} ancho="max-w-2xl">
        {ticket && <DetalleTicket id={ticket} usuarioId={usuario.id} />}
      </Modal>
    </>
  );
}
