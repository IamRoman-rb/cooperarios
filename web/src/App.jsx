import { Component, lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PUBLICO, RUTAS_PORTAL, INICIO } from './rutas.js';
import { LayoutPublico, LayoutPortal } from './components/Layout.jsx';
import { Cargando, Vacio, Boton } from './components/ui.jsx';
import { useSesion } from './lib/sesion.jsx';

// Cada vista se carga bajo demanda: el socio no descarga el código de Contabilidad.
const modulos = import.meta.glob('./pages/**/*.jsx');
const cache = {};
function pagina(nombre) {
  const ruta = `./pages/${nombre}.jsx`;
  if (!modulos[ruta]) throw new Error(`Falta la página ${ruta}`);
  cache[nombre] ??= lazy(modulos[ruta]);
  return cache[nombre];
}

/** Si una vista falla, muestra el error sin tirar abajo el resto del portal. */
class LimiteError extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Vacio icono="error" titulo="Algo salió mal en esta pantalla" texto={this.state.error.message}
        accion={<Boton variante="suave" icono="refresh" onClick={() => window.location.reload()}>Recargar</Boton>} />
    );
  }
}

function Vista({ nombre, props }) {
  const Componente = pagina(nombre);
  return <LimiteError key={nombre}><Suspense fallback={<Cargando />}><Componente {...props} /></Suspense></LimiteError>;
}

/** Exige sesión; si no hay, redirige al ingreso y vuelve a la misma pantalla. */
function Protegida({ children }) {
  const { usuario, cargando } = useSesion();
  const { pathname, search } = useLocation();
  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Navigate to={`/login?volver=${encodeURIComponent(pathname + search)}`} replace />;
  return children;
}

/** Resuelve la ruta con los roles del usuario: la misma URL puede mostrar la vista de otro rol (gana el principal). */
function VistaPortal({ ruta }) {
  const { portal } = useSesion();
  const { search } = useLocation();
  if (ruta === portal.inicioPropio) return <Navigate to={INICIO + search} replace />;
  const vista = portal.vistas.get(ruta);
  if (!vista) {
    return (
      <Vacio icono="lock" titulo="No tenés acceso a esta sección" texto="Tu usuario no tiene habilitada esta pantalla. Si la necesitás, pedila a Administración."
        accion={<Boton as="link" to={INICIO} variante="suave">Ir a mi inicio</Boton>} />
    );
  }
  return <Vista nombre={vista.pagina} props={vista.props} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<LayoutPublico />}>
        {PUBLICO.map((p) => <Route key={p.ruta} path={p.ruta} element={<Vista nombre={p.pagina} />} />)}
      </Route>
      <Route element={<Protegida><LayoutPortal /></Protegida>}>
        {RUTAS_PORTAL.map((ruta) => <Route key={ruta} path={ruta} element={<VistaPortal ruta={ruta} />} />)}
      </Route>
      <Route path="*" element={<div className="min-h-dvh flex items-center justify-center"><Vacio icono="travel_explore" titulo="Página no encontrada" accion={<Boton as="link" to="/">Ir al inicio</Boton>} /></div>} />
    </Routes>
  );
}
