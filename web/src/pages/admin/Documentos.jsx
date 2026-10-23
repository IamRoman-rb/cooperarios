import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData, urlArchivo } from '../../lib/api.js';
import { fecha, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Campo, Entrada, Selector, Casilla, SelectorArchivo, Icono } from '../../components/ui.jsx';
import { ROLES_UI } from '../../rutas.js';

/** Reglamentos, formularios y circulares con visibilidad por rol. */
export default function Documentos() {
  const q = useDatos('/api/documentos');
  const [edicion, setEdicion] = useState(null);
  const [archivo, setArchivo] = useState([]);
  const guardar = useAccion(() => api.post('/api/documentos', formData({ id: edicion.id, nombre: edicion.nombre, categoria: edicion.categoria, rol_visible: edicion.todos ? 'todos' : edicion.roles.join(',') }, { archivo: archivo[0] })), {
    ok: 'Documento guardado', invalidar: ['/api/documentos'], alTerminar: () => { setEdicion(null); setArchivo([]); },
  });
  const roles = Object.entries(ROLES_UI).map(([codigo, r]) => ({ codigo, nombre: r.nombre }));
  return (
    <>
      <Encabezado titulo="Documentos y circulares" subtitulo="Cada documento indica qué roles lo ven."
        acciones={<Boton icono="upload_file" onClick={() => setEdicion({ nombre: '', categoria: 'reglamento', todos: true, roles: [] })}>Nuevo documento</Boton>} />
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(lista) => (
            <Tabla columnas={[
              { k: 'nombre', t: 'Documento', r: (d) => <div className="flex items-center gap-2"><Icono n="description" className="text-secondary" />{d.archivo ? <a href={urlArchivo(d.archivo)} target="_blank" rel="noreferrer" className="font-semibold text-primary-container">{d.nombre}</a> : <span className="font-semibold">{d.nombre}</span>}</div> },
              { k: 'categoria', t: 'Tipo', r: (d) => capitalizar(d.categoria) },
              { k: 'rol_visible', t: 'Visible para', r: (d) => (d.rol_visible === 'todos' ? <Estado tono="exito" texto="Todos" /> : <div className="flex flex-wrap gap-1">{d.rol_visible.split(',').map((r) => <Estado key={r} tono="info" texto={ROLES_UI[r]?.nombre ?? r} />)}</div>) },
              { k: 'publicado_en', t: 'Publicado', r: (d) => fecha(d.publicado_en) },
              { k: 'e', t: '', r: (d) => <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setEdicion({ ...d, todos: d.rol_visible === 'todos', roles: d.rol_visible === 'todos' ? [] : d.rol_visible.split(',') })} /> },
            ]} filas={lista} />
          )}
        </Consulta>
      </Tarjeta>
      <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar documento' : 'Nuevo documento'} onCerrar={() => setEdicion(null)} pie={<Boton cargando={guardar.isPending} disabled={!edicion?.nombre} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {edicion && (
          <div className="space-y-space-md">
            <Campo etiqueta="Nombre"><Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><Selector value={edicion.categoria} onChange={(e) => setEdicion({ ...edicion, categoria: e.target.value })} opciones={[{ value: 'reglamento', label: 'Reglamento' }, { value: 'formulario', label: 'Formulario' }, { value: 'circular', label: 'Circular' }]} /></Campo>
            <Casilla checked={edicion.todos} onChange={(e) => setEdicion({ ...edicion, todos: e.target.checked })} etiqueta="Visible para todos (también en el sitio público)" />
            {!edicion.todos && (
              <div className="grid grid-cols-2 gap-2">
                {roles.map((r) => <Casilla key={r.codigo} checked={edicion.roles.includes(r.codigo)} onChange={(e) => setEdicion({ ...edicion, roles: e.target.checked ? [...edicion.roles, r.codigo] : edicion.roles.filter((x) => x !== r.codigo) })} etiqueta={r.nombre} />)}
              </div>
            )}
            <SelectorArchivo etiqueta="Archivo (PDF)" accept="application/pdf,image/*" archivos={archivo} onChange={setArchivo} />
          </div>
        )}
      </Modal>
    </>
  );
}
