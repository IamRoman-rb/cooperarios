// Estructura de pantallas: sitio público (barra superior + pestañas inferiores en celular) y
// portal del usuario con las vistas de todos sus roles (barra lateral en escritorio; encabezado y pestañas inferiores en celular).
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PUBLICO, INICIO, vistaDe } from '../rutas.js';
import { useSesion } from '../lib/sesion.jsx';
import { useDatos, useAccion } from '../lib/datos.js';
import { api } from '../lib/api.js';
import { relativa } from '../lib/formato.js';
import { Icono, Avatar, BotonIcono, cx } from './ui.jsx';

export function Marca({ claro, compacta }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 min-w-0">
      <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm', claro ? 'bg-white/15' : 'bg-primary-container')}>
        <Icono n="shield" relleno className="text-white" tam={24} />
      </span>
      {!compacta && (
        <span className="flex flex-col min-w-0 leading-tight">
          <span className={cx('font-headline-sm text-headline-sm tracking-tight truncate', claro ? 'text-white' : 'text-primary')}>Los Cooperarios</span>
          <span className={cx('font-label-sm text-label-sm uppercase truncate', claro ? 'text-white/80' : 'text-secondary')}>Quilmes Oeste · 1942</span>
        </span>
      )}
    </Link>
  );
}

export function LayoutPublico() {
  const { usuario } = useSesion();
  const tabs = PUBLICO.filter((p) => p.tab);
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-seguro">
        <div className="max-w-contenido mx-auto h-16 px-gutter-sm lg:px-margin flex items-center justify-between gap-4">
          <Marca />
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((t) => (
              <NavLink key={t.ruta} to={t.ruta} end className={({ isActive }) => cx('px-3 h-10 rounded-xl flex items-center font-label-lg text-label-lg transition-colors', isActive ? 'text-primary-container bg-critico-suave' : 'text-on-surface-variant hover:bg-surface-container')}>
                {t.titulo}
              </NavLink>
            ))}
          </nav>
          <Link to={usuario ? INICIO : '/login'} className="h-11 px-4 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg flex items-center gap-1.5 hover:bg-primary transition-colors">
            <Icono n={usuario ? 'dashboard' : 'login'} tam={18} />
            <span>{usuario ? 'Mi portal' : 'Ingresar'}</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 w-full pb-24 md:pb-10"><Outlet /></main>
      <footer className="hidden md:block border-t border-surface-container bg-surface-container-lowest">
        <div className="max-w-contenido mx-auto px-margin py-6 flex flex-wrap justify-between gap-4 text-body-sm text-secondary">
          <p>Club Social y Deportivo Los Cooperarios · Andrade 3052, Quilmes Oeste</p>
          <p>Datos protegidos según la Ley 25.326 · <Link to="/contacto" className="underline">Contacto</Link></p>
        </div>
      </footer>
      <BarraInferior items={tabs.map((t) => ({ a: t.ruta, titulo: t.titulo, icono: t.icono, end: t.ruta === '/' }))} />
    </div>
  );
}

function BarraInferior({ items, extra }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(0,0,0,0.05)] pb-seguro no-imprimir" aria-label="Navegación principal">
      <div className="flex justify-around items-center h-[72px] px-1">
        {items.map((t) => (
          <NavLink key={t.a} to={t.a} end={t.end} className={({ isActive }) => cx('flex flex-col items-center justify-center min-w-[56px] flex-1 h-14 rounded-xl transition-colors', isActive ? 'text-primary-container font-bold' : 'text-on-surface-variant')}>
            {({ isActive }) => (
              <>
                <Icono n={t.icono} relleno={isActive} tam={22} />
                <span className="font-label-sm text-[10px] mt-0.5 truncate max-w-[72px]">{t.titulo}</span>
              </>
            )}
          </NavLink>
        ))}
        {extra}
      </div>
    </nav>
  );
}

function Notificaciones() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const navegar = useNavigate();
  const q = useDatos('/api/notificaciones', { refetchInterval: 60_000 });
  const leer = useAccion((id) => api.post('/api/notificaciones/leer', id ? { id } : {}), { invalidar: ['/api/notificaciones'] });
  useEffect(() => {
    const fuera = (e) => ref.current && !ref.current.contains(e.target) && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);
  const n = q.data?.no_leidas ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button aria-label={`Notificaciones${n ? `: ${n} sin leer` : ''}`} onClick={() => setAbierto((a) => !a)}
        className="relative w-11 h-11 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container">
        <Icono n="notifications" tam={22} />
        {n > 0 && <span className="absolute top-2 right-2 min-w-4 h-4 px-1 rounded-full bg-primary-container text-on-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">{n > 9 ? '9+' : n}</span>}
      </button>
      {abierto && (
        <div className="absolute right-0 mt-2 w-[min(92vw,380px)] tarjeta shadow-n2 z-[60] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container">
            <p className="font-headline-sm text-headline-sm">Notificaciones</p>
            {n > 0 && <button className="text-label-md text-primary-container" onClick={() => leer.mutate()}>Marcar todas</button>}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(q.data?.items ?? []).length === 0 && <li className="p-6 text-center text-body-sm text-secondary">Sin notificaciones</li>}
            {(q.data?.items ?? []).map((it) => (
              <li key={it.id}>
                <button className={cx('w-full text-left px-4 py-3 flex gap-3 hover:bg-surface-container-low', !it.leida_en && 'bg-critico-suave/40')}
                  onClick={() => { leer.mutate(it.id); setAbierto(false); if (it.referencia) navegar(it.referencia); }}>
                  <span className={cx('w-2 h-2 rounded-full mt-1.5 shrink-0', it.leida_en ? 'bg-transparent' : 'bg-primary-container')} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-body-sm text-on-surface">{it.titulo}</span>
                    <span className="block text-label-sm text-secondary mt-0.5">{relativa(it.creada_en)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MenuUsuario() {
  const { usuario, salir } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const navegar = useNavigate();
  useEffect(() => {
    const fuera = (e) => ref.current && !ref.current.contains(e.target) && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto((a) => !a)} className="flex items-center gap-2 pl-1 pr-2 h-11 rounded-xl hover:bg-surface-container" aria-label="Menú de usuario">
        <Avatar persona={usuario} tam={32} />
        <span className="hidden lg:block text-label-lg">{usuario.nombre}</span>
        <Icono n="expand_more" className="hidden lg:block text-secondary" />
      </button>
      {abierto && (
        <div className="absolute right-0 mt-2 w-72 tarjeta shadow-n2 z-[60] p-2">
          <div className="px-3 py-2">
            <p className="font-semibold">{usuario.nombre} {usuario.apellido}</p>
            <p className="text-body-sm text-secondary truncate">{usuario.email}</p>
          </div>
          <div className="border-t border-surface-container mt-1 pt-1">
            <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container-low text-body-md" onClick={() => setAbierto(false)}><Icono n="public" tam={18} /> Sitio del club</Link>
            <button onClick={async () => { await salir(); navegar('/login'); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-critico-suave text-body-md text-primary-container">
              <Icono n="logout" tam={18} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LayoutPortal() {
  const { pathname } = useLocation();
  const [masAbierto, setMasAbierto] = useState(false);
  const { portal } = useSesion();
  useEffect(() => { setMasAbierto(false); window.scrollTo(0, 0); }, [pathname]);
  const visibles = portal.secciones;
  const todos = visibles.flatMap((s) => s.items);
  const actual = vistaDe(portal, pathname);
  const tabs = todos.filter((i) => i.tab).slice(0, 4);

  return (
    <div className="min-h-dvh lg:pl-72">
      <aside className="hidden lg:flex fixed left-0 top-0 h-dvh w-72 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex-col no-imprimir">
        <div className="p-space-lg pb-space-sm border-b border-surface-container"><Marca /></div>
        <nav className="flex-1 overflow-y-auto p-space-md space-y-space-md" aria-label="Menú del portal">
          {visibles.map((s) => (
            <div key={s.titulo} className="flex flex-col gap-0.5">
              <span className="px-2 pb-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{s.titulo}</span>
              {s.items.map((i) => (
                <NavLink key={i.ruta} to={i.ruta} end
                  className={({ isActive }) => cx('flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-label-lg text-label-lg transition-colors', isActive ? 'bg-primary-container text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface')}>
                  <Icono n={i.icono} tam={20} /> <span className="truncate">{i.titulo}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] pt-seguro no-imprimir">
        <div className="h-16 px-gutter-sm lg:px-margin flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="lg:hidden"><Marca compacta /></span>
            <div className="min-w-0">
              <p className="font-headline-sm text-headline-sm truncate">{actual?.titulo ?? 'Los Cooperarios'}</p>
              <p className="lg:hidden font-label-sm text-label-sm text-on-surface-variant truncate">CSD Los Cooperarios · Quilmes Oeste</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Notificaciones />
            <MenuUsuario />
          </div>
        </div>
      </header>

      <main className="px-gutter-sm lg:px-margin py-space-lg pb-28 lg:pb-12 max-w-contenido mx-auto"><Outlet /></main>

      <BarraInferior
        items={tabs.map((t) => ({ a: t.ruta, titulo: t.titulo.split(' ')[0] === 'Mis' || t.titulo.length < 12 ? t.titulo : t.titulo.split(' ')[0], icono: t.icono }))}
        extra={todos.length > tabs.length && (
          <button onClick={() => setMasAbierto(true)} className="flex flex-col items-center justify-center min-w-[56px] flex-1 h-14 rounded-xl text-on-surface-variant">
            <Icono n="menu" tam={22} /><span className="font-label-sm text-[10px] mt-0.5">Más</span>
          </button>
        )}
      />
      {masAbierto && (
        <div className="lg:hidden fixed inset-0 z-[80] bg-[rgba(31,41,55,0.6)] flex items-end" onClick={() => setMasAbierto(false)}>
          <div className="w-full bg-surface-container-lowest rounded-t-2xl max-h-[80dvh] overflow-y-auto p-space-md pb-seguro" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-headline-sm text-headline-sm">Menú</p>
              <BotonIcono icono="close" etiqueta="Cerrar" onClick={() => setMasAbierto(false)} />
            </div>
            {visibles.map((s) => (
              <div key={s.titulo} className="mb-3">
                <p className="etiqueta px-1 mb-1">{s.titulo}</p>
                <div className="grid grid-cols-2 gap-2">
                  {s.items.map((i) => (
                    <NavLink key={i.ruta} to={i.ruta} end className={({ isActive }) => cx('flex items-center gap-2 p-3 rounded-xl text-label-lg min-h-[52px]', isActive ? 'bg-primary-container text-on-primary' : 'bg-surface hover:bg-surface-container-low')}>
                      <Icono n={i.icono} tam={20} /> <span className="leading-tight">{i.titulo}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
