import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';
import { useAviso } from '../../components/Avisos.jsx';
import { Icono, Boton, Campo, Entrada, Aviso } from '../../components/ui.jsx';

const DEMO = ['socio', 'profesor', 'admin', 'contabilidad', 'directiva', 'subcomision', 'mantenimiento', 'porteria', 'medico', 'auxiliar', 'sistemas'];

export default function Login() {
  const [params] = useSearchParams();
  const token = params.get('restablecer');
  const [modo, setModo] = useState(token ? 'restablecer' : 'ingresar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);
  const navegar = useNavigate();
  const qc = useQueryClient();
  const aviso = useAviso();
  const { usuario, rolActivo } = useSesion();

  useEffect(() => {
    if (usuario && modo === 'ingresar') navegar(params.get('volver') ?? rolActivo?.inicio ?? '/', { replace: true });
  }, [usuario, modo, navegar, params, rolActivo]);

  const entrar = (u) => {
    qc.setQueryData(['sesion'], u);
    aviso.exito(`¡Hola, ${u.nombre}!`);
    navegar(params.get('volver') ?? u.roles[0]?.inicio ?? '/', { replace: true });
  };

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      if (modo === 'ingresar') {
        const r = await api.post('/api/auth/login', { email, password });
        if (r.mfa_requerido) setModo('mfa'); else entrar(r.usuario);
      } else if (modo === 'mfa') {
        entrar((await api.post('/api/auth/mfa', { codigo })).usuario);
      } else if (modo === 'recuperar') {
        const r = await api.post('/api/auth/recuperar', { email });
        setMensaje(r.enlace_dev ? { texto: 'Modo de prueba: este es el enlace que llegaría por correo.', enlace: r.enlace_dev } : { texto: 'Si el email está registrado, te enviamos un enlace para restablecer la contraseña.' });
      } else if (modo === 'restablecer') {
        await api.post('/api/auth/restablecer', { token, password });
        setMensaje({ texto: 'Contraseña actualizada. Ya podés ingresar.' });
        setModo('ingresar');
        navegar('/login', { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const titulos = { ingresar: 'Ingresá a tu cuenta', mfa: 'Verificación en dos pasos', recuperar: 'Recuperar contraseña', restablecer: 'Nueva contraseña' };

  return (
    <div className="max-w-md mx-auto px-gutter-sm pt-space-xl pb-space-xl">
      <div className="tarjeta overflow-hidden">
        <div className="h-1.5 bg-primary-container" />
        <div className="p-space-lg">
          <span className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center mb-4"><Icono n={modo === 'mfa' ? 'phonelink_lock' : 'lock'} /></span>
          <h1 className="text-headline-md">{titulos[modo]}</h1>
          <p className="text-body-sm text-secondary mt-1 mb-space-lg">
            {modo === 'mfa' ? 'Ingresá el código de 6 dígitos de tu aplicación autenticadora.' : 'Socios, profesores y personal del club.'}
          </p>
          {mensaje && (
            <Aviso tono="exito" titulo={mensaje.texto}>
              {mensaje.enlace && <a className="underline break-all" href={mensaje.enlace}>{mensaje.enlace}</a>}
            </Aviso>
          )}
          {error && <div className="mb-3"><Aviso tono="critico" titulo={error} /></div>}
          <form onSubmit={enviar} className="space-y-space-md mt-3">
            {['ingresar', 'recuperar'].includes(modo) && (
              <Campo etiqueta="Email"><Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></Campo>
            )}
            {['ingresar', 'restablecer'].includes(modo) && (
              <Campo etiqueta={modo === 'restablecer' ? 'Nueva contraseña' : 'Contraseña'} ayuda={modo === 'restablecer' ? 'Mínimo 10 caracteres, con letras y números.' : undefined}>
                <Entrada type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={modo === 'restablecer' ? 'new-password' : 'current-password'} required />
              </Campo>
            )}
            {modo === 'mfa' && (
              <Campo etiqueta="Código"><Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus className="text-center text-headline-md tracking-[0.4em]" /></Campo>
            )}
            <Boton type="submit" cargando={cargando} completo className="h-12">{modo === 'recuperar' ? 'Enviar enlace' : modo === 'restablecer' ? 'Guardar contraseña' : 'Ingresar'}</Boton>
          </form>
          <div className="mt-4 text-center text-body-sm">
            {modo === 'ingresar'
              ? <button className="text-primary-container font-semibold" onClick={() => { setModo('recuperar'); setMensaje(null); setError(null); }}>Olvidé mi contraseña</button>
              : <button className="text-primary-container font-semibold" onClick={() => { setModo('ingresar'); setError(null); }}>Volver a ingresar</button>}
          </div>
        </div>
      </div>

      {import.meta.env.DEV && modo === 'ingresar' && (
        <div className="mt-space-md tarjeta p-space-md">
          <p className="etiqueta mb-2">Usuarios de prueba (contraseña Cooperarios2026)</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO.map((u) => (
              <button key={u} onClick={() => { setEmail(`${u}@demo.coop`); setPassword('Cooperarios2026'); }} className="px-2.5 h-8 rounded-full bg-surface-container text-label-md hover:bg-surface-container-high">{u}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
