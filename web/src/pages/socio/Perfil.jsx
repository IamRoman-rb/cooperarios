import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { fecha } from '../../lib/formato.js';
import { prepararImagen } from '../../lib/imagen.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Campo, Entrada, Avatar, Modal, Dato, Aviso } from '../../components/ui.jsx';

export function Seguridad() {
  const { usuario, refrescar } = useSesion();
  const [clave, setClave] = useState({ actual: '', nueva: '' });
  const [mfa, setMfa] = useState(null);
  const [codigo, setCodigo] = useState('');
  const cambiar = useAccion(() => api.post('/api/auth/password', clave), { ok: 'Contraseña actualizada', alTerminar: () => setClave({ actual: '', nueva: '' }) });
  const activar = useAccion(() => api.post('/api/auth/mfa/activar'), { alTerminar: (r) => setMfa(r) });
  const confirmar = useAccion(() => api.post('/api/auth/mfa/confirmar', { codigo }), { ok: 'Verificación en dos pasos activada', alTerminar: () => { setMfa(null); refrescar(); } });
  return (
    <Tarjeta titulo="Seguridad" icono="lock" cuerpo="p-space-md space-y-space-md">
      <div className="grid sm:grid-cols-2 gap-space-md">
        <Campo etiqueta="Contraseña actual"><Entrada type="password" value={clave.actual} onChange={(e) => setClave({ ...clave, actual: e.target.value })} autoComplete="current-password" /></Campo>
        <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 10 caracteres, con letras y números"><Entrada type="password" value={clave.nueva} onChange={(e) => setClave({ ...clave, nueva: e.target.value })} autoComplete="new-password" /></Campo>
      </div>
      <Boton variante="suave" icono="key" cargando={cambiar.isPending} disabled={!clave.actual || clave.nueva.length < 10} onClick={() => cambiar.mutate()}>Cambiar contraseña</Boton>
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface">
        <div>
          <p className="font-label-lg text-label-lg">Verificación en dos pasos</p>
          <p className="text-body-sm text-secondary">Código de una app autenticadora al ingresar. Recomendada para Administración, Contabilidad, Directiva y Médico.</p>
        </div>
        {usuario.mfa_habilitado ? <Estado tono="exito" texto="Activa" /> : <Boton chico onClick={() => activar.mutate()} cargando={activar.isPending}>Activar</Boton>}
      </div>
      <Modal abierto={!!mfa} titulo="Activar verificación en dos pasos" onCerrar={() => setMfa(null)}
        pie={<Boton cargando={confirmar.isPending} disabled={codigo.length !== 6} onClick={() => confirmar.mutate()}>Confirmar</Boton>}>
        {mfa && (
          <div className="space-y-space-md text-center">
            <p className="text-body-md">Escaneá el código con tu app autenticadora (Google Authenticator, Authy…) e ingresá el código de 6 dígitos.</p>
            <div className="inline-block p-3 bg-white rounded-xl border border-surface-container"><QRCodeSVG value={mfa.uri} size={180} /></div>
            <p className="font-mono text-body-sm break-all text-secondary">{mfa.secreto}</p>
            <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="text-center text-headline-md tracking-[0.4em]" />
          </div>
        )}
      </Modal>
    </Tarjeta>
  );
}

export default function Perfil() {
  const q = useDatos('/api/mi/perfil');
  const [edicion, setEdicion] = useState(null);
  const guardar = useAccion(() => api.put('/api/mi/perfil', edicion), { ok: 'Datos actualizados', invalidar: ['/api/mi'], alTerminar: () => setEdicion(null) });
  const foto = useAccion(async (archivo) => api.post('/api/mi/perfil/foto', formData({}, { foto: await prepararImagen(archivo, { lado: 600 }) })), { ok: 'Foto actualizada', invalidar: ['/api/mi', 'sesion'] });
  return (
    <>
      <Encabezado titulo="Perfil y grupo familiar" subtitulo="Tus datos de contacto y los integrantes de tu grupo." />
      <Consulta q={q}>
        {(d) => (
          <div className="grid lg:grid-cols-3 gap-space-md">
            <div className="lg:col-span-2 space-y-space-md">
              <Tarjeta titulo="Datos personales" icono="person" accion={!edicion && <Boton chico variante="suave" icono="edit" onClick={() => setEdicion({ email: d.persona.email ?? '', telefono: d.persona.telefono ?? '', domicilio: d.persona.domicilio ?? '' })}>Editar</Boton>}>
                <div className="flex items-center gap-4 mb-space-md">
                  <Avatar persona={d.persona} tam={72} />
                  <label className="text-label-md text-primary-container font-semibold cursor-pointer">
                    Cambiar foto
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files[0] && foto.mutate(e.target.files[0])} />
                  </label>
                </div>
                {edicion ? (
                  <div className="grid sm:grid-cols-2 gap-space-md">
                    <Campo etiqueta="Email"><Entrada type="email" value={edicion.email} onChange={(e) => setEdicion({ ...edicion, email: e.target.value })} /></Campo>
                    <Campo etiqueta="Teléfono"><Entrada value={edicion.telefono} onChange={(e) => setEdicion({ ...edicion, telefono: e.target.value })} /></Campo>
                    <Campo etiqueta="Domicilio" className="sm:col-span-2"><Entrada value={edicion.domicilio} onChange={(e) => setEdicion({ ...edicion, domicilio: e.target.value })} /></Campo>
                    <div className="sm:col-span-2 flex gap-2"><Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton><Boton variante="suave" onClick={() => setEdicion(null)}>Cancelar</Boton></div>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-space-md">
                    <Dato etiqueta="Nombre" valor={`${d.persona.nombre} ${d.persona.apellido}`} />
                    <Dato etiqueta="DNI" valor={d.persona.dni} />
                    <Dato etiqueta="Fecha de nacimiento" valor={fecha(d.persona.fecha_nacimiento)} />
                    <Dato etiqueta="Email" valor={d.persona.email} />
                    <Dato etiqueta="Teléfono" valor={d.persona.telefono} />
                    <Dato etiqueta="Domicilio" valor={d.persona.domicilio} />
                  </div>
                )}
                <p className="text-body-sm text-secondary mt-space-md">Para corregir nombre, DNI o fecha de nacimiento, pedí la rectificación desde Privacidad.</p>
              </Tarjeta>
              <Seguridad />
            </div>
            <div className="space-y-space-md">
              {d.socio && (
                <Tarjeta titulo="Condición de socio" icono="badge" cuerpo="p-space-md grid grid-cols-2 gap-3">
                  <Dato etiqueta="N° de socio" valor={d.socio.nro_socio} />
                  <Dato etiqueta="Categoría" valor={d.socio.categoria} />
                  <Dato etiqueta="Alta" valor={fecha(d.socio.fecha_alta)} />
                  <div><p className="font-label-sm text-label-sm uppercase text-secondary">Estado</p><Estado valor={d.socio.estado} /></div>
                  {d.socio.llave_nro && <Dato etiqueta="Llave magnética" valor={d.socio.llave_nro} />}
                </Tarjeta>
              )}
              <Tarjeta titulo={d.socio?.grupo_familiar ?? 'Grupo familiar'} icono="family_restroom" cuerpo="p-space-md space-y-2">
                {d.familia.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-2 rounded-xl bg-surface">
                    <Avatar persona={f} tam={36} />
                    <div className="flex-1 min-w-0"><p className="font-label-lg text-label-lg">{f.nombre} {f.apellido}{f.yo ? ' (vos)' : ''}</p><p className="text-body-sm text-secondary">{f.categoria ?? '—'} · {f.edad} años</p></div>
                    {f.estado && <Estado valor={f.estado} />}
                  </div>
                ))}
                {d.es_titular ? <Aviso tono="info">Como titular gestionás las actividades, pagos y revisiones de tu grupo. Para sumar a alguien, usá Trámites → Alta de un familiar.</Aviso>
                  : d.familia.length > 1 && <p className="text-body-sm text-secondary">El titular del grupo gestiona a sus integrantes.</p>}
              </Tarjeta>
            </div>
          </div>
        )}
      </Consulta>
    </>
  );
}
