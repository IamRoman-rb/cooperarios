// Cliente HTTP de la API. Envía la cookie de sesión y el encabezado anti-CSRF.
export class ErrorApi extends Error {
  constructor(status, cuerpo) {
    super(cuerpo?.error ?? `Error ${status}`);
    this.status = status;
    this.detalle = cuerpo?.detalle;
    this.cuerpo = cuerpo;
  }
}

async function pedir(metodo, url, cuerpo) {
  const esForm = cuerpo instanceof FormData;
  const res = await fetch(url, {
    method: metodo,
    credentials: 'include',
    headers: {
      'x-requested-with': 'cooperarios',
      ...(cuerpo && !esForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? (esForm ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  const tipo = res.headers.get('content-type') ?? '';
  const datos = tipo.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new ErrorApi(res.status, typeof datos === 'string' ? { error: datos } : datos);
  return datos;
}

export const api = {
  get: (url) => pedir('GET', url),
  post: (url, cuerpo = {}) => pedir('POST', url, cuerpo),
  put: (url, cuerpo = {}) => pedir('PUT', url, cuerpo),
  del: (url) => pedir('DELETE', url),
};

/** Arma un FormData a partir de un objeto (los arreglos y objetos van como JSON; los archivos, tal cual). */
export function formData(datos, archivos = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(datos)) {
    if (v === undefined || v === null || v === '') continue;
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  for (const [campo, lista] of Object.entries(archivos)) {
    for (const archivo of [].concat(lista ?? [])) if (archivo) fd.append(campo, archivo, archivo.name);
  }
  return fd;
}

/** URL de un archivo protegido (fotos, certificados, comprobantes). */
export const urlArchivo = (ruta) => (ruta ? `/api/archivos/${ruta}` : null);

/** Descarga un recurso protegido (CSV, JSON) con la sesión actual. */
export async function descargar(url, nombre) {
  const res = await fetch(url, { credentials: 'include', headers: { 'x-requested-with': 'cooperarios' } });
  if (!res.ok) throw new ErrorApi(res.status, await res.json().catch(() => ({})));
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
