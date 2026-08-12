/**
 * Reduce una foto antes de subirla. Importa por tres razones: la gente publica
 * desde el celular con datos contados, la IA cobra por píxel, y una foto de
 * 12 MB del carrete no se ve mejor que una de 1600 px en una tarjeta.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formato que el navegador no sabe decodificar: que lo valide el servidor.
    return file;
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  // Ya es pequeña y liviana: no vale la pena recomprimir y perder calidad.
  if (scale === 1 && file.size < 1_200_000) {
    bitmap.close();
    return file;
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
}
