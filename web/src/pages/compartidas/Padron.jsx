import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { fecha, edad } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Buscador, Selector, Avatar, Kpi, Grilla } from '../../components/ui.jsx';

/** Padrón: Administración gestiona (búsqueda, ficha, alta); la Comisión Directiva lo consulta en modo lectura. */
export default function Padron({ gestion }) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const navegar = useNavigate();
  const params = new URLSearchParams({ pagina, limite: 25, ...(texto && { q: texto }), ...(estado && { estado }) });
  const q = useDatos(`/api/padron/socios?${params}`, { placeholderData: (prev) => prev });
  const resumen = Object.fromEntries((q.data?.resumen ?? []).map((r) => [r.estado, r.n]));
  return (
    <>
      <Encabezado titulo={gestion ? 'Padrón de socios' : 'Padrón institucional'} subtitulo={gestion ? 'Búsqueda, ficha completa, historial y grupo familiar.' : 'Consulta de lectura del padrón.'}
        acciones={gestion && <Boton icono="person_add" onClick={() => navegar('/socios/nuevo')}>Alta de socio</Boton>} />
      {q.data?.resumen && (
        <Grilla className="mb-space-md">
          <Kpi etiqueta="Activos" valor={resumen.activo ?? 0} icono="how_to_reg" tono="exito" />
          <Kpi etiqueta="Suspendidos" valor={resumen.suspendido ?? 0} icono="block" tono="critico" />
          <Kpi etiqueta="Bajas" valor={resumen.baja ?? 0} icono="person_off" />
          <Kpi etiqueta="Total en padrón" valor={q.data.total} icono="groups" />
        </Grilla>
      )}
      <div className="grid sm:grid-cols-[1fr_200px] gap-2 mb-space-md">
        <Buscador valor={texto} onChange={(v) => { setTexto(v); setPagina(1); }} placeholder="Apellido, nombre, DNI o número de socio" />
        <Selector value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} vacio="Todos los estados" opciones={['activo', 'suspendido', 'baja', 'pendiente'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />
      </div>
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(d) => (
            <>
              <Tabla onFila={gestion ? (f) => navegar(`/socios/${f.persona_id}`) : undefined} clave="id" columnas={[
                { k: 'nombre', t: 'Socio', r: (s) => <div className="flex items-center gap-3"><Avatar persona={s} tam={36} /><div><p className="font-semibold">{s.apellido}, {s.nombre}</p><p className="text-body-sm text-secondary">N° {s.nro_socio}{s.dni ? ` · DNI ${s.dni}` : ''}</p></div></div> },
                { k: 'categoria', t: 'Categoría', r: (s) => <span>{s.categoria}{s.fecha_nacimiento ? <span className="text-secondary"> · {edad(s.fecha_nacimiento)} años</span> : ''}</span> },
                { k: 'fecha_alta', t: 'Alta', r: (s) => fecha(s.fecha_alta) },
                { k: 'estado', t: 'Estado', r: (s) => <Estado valor={s.estado} /> },
                { k: 'habilitado', t: 'Habilitación', r: (s) => <Estado tono={s.habilitado ? 'exito' : 'alerta'} texto={s.habilitado ? 'Habilitado' : 'Con observaciones'} /> },
                ...(d.filas[0]?.deuda_vencida !== undefined ? [{ k: 'deuda', t: 'Cuenta', r: (s) => <Estado tono={s.deuda_vencida ? 'critico' : 'exito'} texto={s.deuda_vencida ? 'Deuda vencida' : 'Al día'} /> }] : []),
              ]} filas={d.filas} vacio="No hay socios con esos filtros" />
              <div className="flex items-center justify-between mt-space-md text-body-sm text-secondary">
                <span>{d.total} socios · página {d.pagina} de {Math.max(1, Math.ceil(d.total / d.limite))}</span>
                <div className="flex gap-2">
                  <Boton chico variante="suave" icono="chevron_left" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Anterior" />
                  <Boton chico variante="suave" icono="chevron_right" disabled={pagina * d.limite >= d.total} onClick={() => setPagina(pagina + 1)} aria-label="Siguiente" />
                </div>
              </div>
            </>
          )}
        </Consulta>
      </Tarjeta>
    </>
  );
}
