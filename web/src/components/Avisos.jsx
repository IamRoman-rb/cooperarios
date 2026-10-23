import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const Contexto = createContext(null);

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const quitar = useCallback((id) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const mostrar = useCallback((tipo, texto, detalle) => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a.slice(-3), { id, tipo, texto, detalle }]);
    setTimeout(() => quitar(id), tipo === 'error' ? 7000 : 4000);
  }, [quitar]);
  const api = useMemo(() => ({ exito: (t) => mostrar('exito', t), error: (t, d) => mostrar('error', t, d), info: (t) => mostrar('info', t) }), [mostrar]);

  return (
    <Contexto.Provider value={api}>
      {children}
      <div className="fixed z-[100] bottom-24 lg:bottom-6 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} role="status"
            className={`pointer-events-auto max-w-md w-full rounded-xl shadow-n2 px-4 py-3 flex items-start gap-3 text-body-sm ${
              a.tipo === 'error' ? 'bg-error-container text-on-error-container' : a.tipo === 'exito' ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-surface-container-lowest text-on-surface'}`}>
            <span className="material-symbols-outlined icono-relleno">{a.tipo === 'error' ? 'error' : a.tipo === 'exito' ? 'check_circle' : 'info'}</span>
            <div className="flex-1">
              <p className="font-semibold">{a.texto}</p>
              {a.detalle?.length > 0 && (
                <ul className="mt-1 list-disc pl-4 opacity-90">{a.detalle.map((d, i) => <li key={i}>{d.campo ? `${d.campo}: ` : ''}{d.mensaje}</li>)}</ul>
              )}
            </div>
            <button onClick={() => quitar(a.id)} aria-label="Cerrar" className="opacity-70 hover:opacity-100">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export const useAviso = () => useContext(Contexto);
