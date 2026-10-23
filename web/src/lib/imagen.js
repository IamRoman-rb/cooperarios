// Reduce las fotos antes de subirlas. Redibujar en un canvas elimina los metadatos (EXIF, ubicación),
// como pide la propuesta (6.4). Los PDF pasan sin cambios.
export async function prepararImagen(archivo, { lado = 1600, calidad = 0.82 } = {}) {
  if (!archivo?.type?.startsWith('image/')) return archivo;
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) return archivo;
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', calidad));
  return new File([blob], archivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export const prepararImagenes = (lista) => Promise.all([...lista].map((a) => prepararImagen(a)));
