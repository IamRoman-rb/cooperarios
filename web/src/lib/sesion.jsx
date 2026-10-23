import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

const Contexto = createContext(null);

const IMPLICA = {
  gestionar: ['gestionar', 'leer', 'leer_ambito', 'gestionar_ambito', 'solicitar', 'propio'],
  aprobar: ['aprobar', 'leer', 'leer_ambito'],
  leer: ['leer', 'leer_ambito'],
  gestionar_ambito: ['gestionar_ambito', 'leer_ambito', 'solicitar'],
  leer_ambito: ['leer_ambito'],
  solicitar: ['solicitar'],
  propio: ['propio'],
};

const leerRol = () => {
  try { return localStorage.getItem('coop_rol'); } catch { return null; }
};

export function ProveedorSesion({ children }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sesion'],
    queryFn: () => api.get('/api/auth/me').then((r) => r.usuario).catch(() => null),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [rolElegido, setRolElegido] = useState(leerRol);

  const elegirRol = useCallback((codigo) => {
    setRolElegido(codigo);
    try { localStorage.setItem('coop_rol', codigo); } catch { /* sin almacenamiento */ }
  }, []);

  const valor = useMemo(() => {
    const usuario = data ?? null;
    const roles = usuario?.roles ?? [];
    const rolActivo = roles.find((r) => r.codigo === rolElegido) ?? roles[0] ?? null;
    const puede = (modulo, ...acciones) => {
      const efectivas = new Set();
      for (const p of usuario?.permisos ?? []) if (p.modulo === modulo) IMPLICA[p.accion].forEach((a) => efectivas.add(a));
      return acciones.some((a) => efectivas.has(a));
    };
    return {
      usuario,
      cargando: isLoading,
      roles,
      rolActivo,
      elegirRol,
      tieneRol: (...codigos) => roles.some((r) => codigos.includes(r.codigo)),
      puede,
      refrescar: () => qc.invalidateQueries({ queryKey: ['sesion'] }),
      salir: async () => {
        await api.post('/api/auth/logout').catch(() => {});
        qc.clear();
        qc.setQueryData(['sesion'], null);
      },
    };
  }, [data, isLoading, rolElegido, elegirRol, qc]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSesion = () => useContext(Contexto);
