import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { relativa } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Buscador, Modal, Campo, Entrada, Selector, Casilla, Aviso, Avatar } from '../../components/ui.jsx';

/** Alta y baja de usuarios operativos y asignación de roles (con ámbito por actividad para delegados). */
export default function Usuarios() {
  const [texto, setTexto] = useState('');
  const q = useDatos(`/api/sistema/usuarios?q=${encodeURIComponent(texto)}`, { placeholderData: (p) => p });
  const { usuario, puede } = useSesion();
  const gestiona = puede('usuarios', 'gestionar');
  const [edicion, setEdicion] = useState(null);
  const [clave, setClave] = useState(null);
  const guardar = useAccion((u) => (u.id ? api.put(`/api/sistema/usuarios/${u.id}`, { roles: u.roles }) : api.post('/api/sistema/usuarios', u)), {
    ok: 'Usuario guardado', invalidar: ['/api/sistema/usuarios'], alTerminar: (r) => { setEdicion(null); if (r.password_inicial) setClave(r.password_inicial); },
  });
  const estado = useAccion(({ id, ...d }) => api.put(`/api/sistema/usuarios/${id}`, d), { ok: 'Usuario actualizado', invalidar: ['/api/sistema/usuarios'] });

  const alternarRol = (codigo) => {
    const tiene = edicion.roles.some((r) => r.codigo === codigo);
    setEdicion({ ...edicion, roles: tiene ? edicion.roles.filter((r) => r.codigo !== codigo) : [...edicion.roles, { codigo, actividad_id: null }] });
  };

  return (
    <>
      <Encabezado titulo="Usuarios y roles" subtitulo="Una persona puede tener varios roles. Los cambios de rol quedan en auditoría."
        acciones={gestiona && <Boton icono="person_add" onClick={() => setEdicion({ email: '', persona: { nombre: '', apellido: '', dni: '' }, roles: [] })}>Nuevo usuario</Boton>} />
      <Buscador valor={texto} onChange={setTexto} placeholder="Buscar por email o apellido" className="mb-space-md" />
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(d) => (
            <Tabla columnas={[
              { k: 'nombre', t: 'Usuario', r: (u) => <div className="flex items-center gap-3"><Avatar persona={u} tam={36} /><div><p className="font-semibold">{u.apellido ? `${u.apellido}, ${u.nombre}` : '—'}</p><p className="text-body-sm text-secondary">{u.email}</p></div></div> },
              { k: 'roles', t: 'Roles', r: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Estado key={r.codigo + (r.actividad_id ?? '')} tono="info" texto={`${r.nombre}${r.actividad ? ` · ${r.actividad}` : ''}`} />)}</div> },
              { k: 'mfa', t: '2 pasos', r: (u) => (u.mfa_habilitado ? <Estado tono="exito" texto="Sí" /> : <span className="text-secondary">No</span>) },
              { k: 'ultimo_acceso', t: 'Último acceso', r: (u) => relativa(u.ultimo_acceso) || '—' },
              { k: 'estado', t: 'Estado', r: (u) => <Estado valor={u.bloqueado_hasta && u.bloqueado_hasta > new Date().toISOString() ? 'bloqueado' : u.estado} /> },
              ...(gestiona ? [{ k: 'acc', t: '', derecha: true, r: (u) => u.id !== usuario.id && (
                <div className="flex justify-end gap-1">
                  <Boton chico variante="suave" icono="edit" onClick={() => setEdicion({ id: u.id, email: u.email, roles: u.roles.map((r) => ({ codigo: r.codigo, actividad_id: r.actividad_id })) })}>Roles</Boton>
                  {u.bloqueado_hasta && <Boton chico variante="suave" icono="lock_open" onClick={() => estado.mutate({ id: u.id, desbloquear: true })}>Desbloquear</Boton>}
                  <Boton chico variante="fantasma" onClick={() => estado.mutate({ id: u.id, estado: u.estado === 'activo' ? 'baja' : 'activo' })}>{u.estado === 'activo' ? 'Dar de baja' : 'Reactivar'}</Boton>
                </div>
              ) }] : []),
            ]} filas={d.usuarios} />
          )}
        </Consulta>
      </Tarjeta>

      <Modal abierto={!!edicion} titulo={edicion?.id ? `Roles de ${edicion.email}` : 'Nuevo usuario'} onCerrar={() => setEdicion(null)} ancho="max-w-xl"
        pie={<><Boton variante="suave" onClick={() => setEdicion(null)}>Cancelar</Boton><Boton cargando={guardar.isPending} disabled={!edicion?.roles.length} onClick={() => guardar.mutate(edicion)}>Guardar</Boton></>}>
        {edicion && (
          <div className="space-y-space-md">
            {!edicion.id && (
              <div className="grid sm:grid-cols-2 gap-space-md">
                <Campo etiqueta="Nombre"><Entrada value={edicion.persona.nombre} onChange={(e) => setEdicion({ ...edicion, persona: { ...edicion.persona, nombre: e.target.value } })} /></Campo>
                <Campo etiqueta="Apellido"><Entrada value={edicion.persona.apellido} onChange={(e) => setEdicion({ ...edicion, persona: { ...edicion.persona, apellido: e.target.value } })} /></Campo>
                <Campo etiqueta="DNI"><Entrada value={edicion.persona.dni} onChange={(e) => setEdicion({ ...edicion, persona: { ...edicion.persona, dni: e.target.value } })} /></Campo>
                <Campo etiqueta="Email"><Entrada type="email" value={edicion.email} onChange={(e) => setEdicion({ ...edicion, email: e.target.value })} /></Campo>
              </div>
            )}
            <div>
              <p className="etiqueta mb-2">Roles</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {(q.data?.roles ?? []).map((r) => (
                  <Casilla key={r.codigo} checked={edicion.roles.some((x) => x.codigo === r.codigo)} onChange={() => alternarRol(r.codigo)} etiqueta={r.nombre} />
                ))}
              </div>
            </div>
            {edicion.roles.some((r) => r.codigo === 'subcomision') && (
              <Campo etiqueta="Actividad del delegado (ámbito)">
                <Selector value={edicion.roles.find((r) => r.codigo === 'subcomision').actividad_id ?? ''} vacio="Elegí la actividad"
                  onChange={(e) => setEdicion({ ...edicion, roles: edicion.roles.map((r) => (r.codigo === 'subcomision' ? { ...r, actividad_id: e.target.value || null } : r)) })}
                  opciones={(q.data?.actividades ?? []).map((a) => ({ value: a.id, label: a.nombre }))} />
              </Campo>
            )}
            {edicion.roles.some((r) => r.codigo === 'sistemas') && <Aviso tono="info">Sistemas no tiene acceso funcional a datos personales ni financieros.</Aviso>}
          </div>
        )}
      </Modal>
      <Modal abierto={!!clave} titulo="Contraseña inicial" onCerrar={() => setClave(null)}>
        <p className="text-body-md">Entregala en mano. El usuario debe cambiarla al ingresar.</p>
        <p className="font-mono text-headline-md text-center my-4 select-all">{clave}</p>
      </Modal>
    </>
  );
}
