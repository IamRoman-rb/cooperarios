import { Component, lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PUBLICO, ROLES_UI } from './rutas.js';
import { LayoutPublico, LayoutRol } from './components/Layout.jsx';
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

/** Exige sesión y el rol del portal; si no, redirige al ingreso. */
function Protegida({ codigo, children }) {
  const { usuario, cargando, tieneRol } = useSesion();
  const { pathname } = useLocation();
  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Navigate to={`/login?volver=${encodeURIComponent(pathname)}`} replace />;
  if (!tieneRol(codigo)) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <Vacio icono="lock" titulo="No tenés acceso a esta sección" texto="Tu usuario no tiene este rol. Si lo necesitás, pedilo a Administración."
          accion={<Boton as="link" to="/login" variante="suave">Volver</Boton>} />
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<LayoutPublico />}>
        {PUBLICO.map((p) => <Route key={p.ruta} path={p.ruta} element={<Vista nombre={p.pagina} />} />)}
      </Route>
      {Object.entries(ROLES_UI).map(([codigo, rol]) => (
        <Route key={codigo} path={rol.base} element={<Protegida codigo={codigo}><LayoutRol codigo={codigo} /></Protegida>}>
          <Route index element={<Navigate to={rol.secciones[0].items[0].ruta} replace />} />
          {rol.secciones.flatMap((s) => s.items).map((i) => (
            <Route key={i.ruta} path={i.ruta} element={<Vista nombre={i.pagina} props={i.props} />} />
          ))}
        </Route>
      ))}
      <Route path="*" element={<div className="min-h-dvh flex items-center justify-center"><Vacio icono="travel_explore" titulo="Página no encontrada" accion={<Boton as="link" to="/">Ir al inicio</Boton>} /></div>} />
    </Routes>
  );
}
