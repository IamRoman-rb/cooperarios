import { createContext, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { armarPortal } from '../rutas.js';

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

export function ProveedorSesion({ children }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sesion'],
    queryFn: () => api.get('/api/auth/me').then((r) => r.usuario).catch(() => null),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const valor = useMemo(() => {
    const usuario = data ?? null;
    const roles = usuario?.roles ?? [];
    // Un solo portal con las vistas de todos los roles del usuario.
    const portal = armarPortal(roles.map((r) => r.codigo));
    const puede = (modulo, ...acciones) => {
      const efectivas = new Set();
      for (const p of usuario?.permisos ?? []) if (p.modulo === modulo) IMPLICA[p.accion].forEach((a) => efectivas.add(a));
      return acciones.some((a) => efectivas.has(a));
    };
    return {
      usuario,
      cargando: isLoading,
      roles,
      portal,
      tieneRol: (...codigos) => roles.some((r) => codigos.includes(r.codigo)),
      puede,
      refrescar: () => qc.invalidateQueries({ queryKey: ['sesion'] }),
      salir: async () => {
        await api.post('/api/auth/logout').catch(() => {});
        qc.clear();
        qc.setQueryData(['sesion'], null);
      },
    };
  }, [data, isLoading, qc]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useSesion = () => useContext(Contexto);
