import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { useAviso } from '../components/Avisos.jsx';

/** GET con caché por URL. */
export function useDatos(url, opciones = {}) {
  return useQuery({ queryKey: [url], queryFn: () => api.get(url), enabled: !!url, ...opciones });
}

/**
 * Acción que modifica datos: muestra el resultado y refresca las consultas cuyo URL empiece
 * con alguno de los prefijos de `invalidar` (por defecto, todas).
 */
export function useAccion(fn, { ok, invalidar = [''], alTerminar } = {}) {
  const qc = useQueryClient();
  const aviso = useAviso();
  return useMutation({
    mutationFn: fn,
    onSuccess: (datos, variables) => {
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && invalidar.some((p) => q.queryKey[0].startsWith(p)) });
      if (ok) aviso.exito(typeof ok === 'function' ? ok(datos, variables) : ok);
      alTerminar?.(datos, variables);
    },
    onError: (e) => aviso.error(e.message, e.detalle),
  });
}
