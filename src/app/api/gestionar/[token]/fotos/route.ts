import { NextResponse } from 'next/server';

import {
  DB_DOWN,
  findByToken,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  PHOTO_MIME,
  type ManagedPet,
} from '@/lib/manage';
import { adminClient } from '@/lib/supabase';
import { randomSuffix } from '@/lib/text';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Editar las fotos de un aviso ya publicado.
 *
 * Va aparte del resto de la gestión porque llega como multipart y no como JSON.
 * Importa más de lo que parece: mucha gente publica con afán y sube una foto
 * borrosa o de espaldas, y es justo la foto lo que hace que alguien reconozca
 * al animalito en un grupo de WhatsApp.
 */

/** Carpeta donde ya viven las fotos del aviso, para no regar archivos sueltos. */
function folderFor(pet: ManagedPet): string {
  const existing = pet.photos[0];
  if (existing?.includes('/')) return existing.slice(0, existing.lastIndexOf('/'));
  return `${new Date().toISOString().slice(0, 7)}/${randomSuffix(10)}`;
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  let pet: ManagedPet | null;
  try {
    pet = await findByToken(token);
  } catch (error) {
    console.error('findByToken falló:', error);
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  if (!pet) {
    return NextResponse.json({ error: 'Ese código de gestión no existe.' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el formulario.' }, { status: 400 });
  }

  const accion = String(form.get('accion') ?? '');
  const supabase = adminClient();
  let photos = [...pet.photos];

  // --- Agregar ------------------------------------------------------------
  if (accion === 'agregar') {
    const files = form.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: 'No llegó ninguna foto.' }, { status: 400 });
    }
    if (photos.length + files.length > MAX_PHOTOS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_PHOTOS} fotos en total. Quitá alguna antes de agregar otra.` },
        { status: 400 },
      );
    }

    const folder = folderFor(pet);
    for (const file of files) {
      const mediaType = PHOTO_MIME[file.type];
      if (!mediaType) {
        return NextResponse.json(
          { error: 'Las fotos deben ser JPG, PNG o WebP.' },
          { status: 400 },
        );
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: 'Cada foto debe pesar menos de 8 MB.' }, { status: 400 });
      }

      const ext = mediaType.split('/')[1].replace('jpeg', 'jpg');
      const path = `${folder}/${randomSuffix(8)}.${ext}`;
      const { error } = await supabase.storage
        .from('fotos')
        .upload(path, Buffer.from(await file.arrayBuffer()), {
          contentType: mediaType,
          upsert: false,
        });
      if (error) {
        return NextResponse.json(
          { error: `No se pudo guardar la foto: ${error.message}` },
          { status: 500 },
        );
      }
      photos.push(path);
    }
  }

  // --- Quitar -------------------------------------------------------------
  else if (accion === 'quitar') {
    const ruta = String(form.get('ruta') ?? '');
    if (!photos.includes(ruta)) {
      return NextResponse.json({ error: 'Esa foto no es de este aviso.' }, { status: 400 });
    }
    if (photos.length <= 1) {
      return NextResponse.json(
        { error: 'Un aviso sin foto casi no se encuentra. Agregá otra antes de quitar esta.' },
        { status: 400 },
      );
    }
    photos = photos.filter((p) => p !== ruta);
    // El archivo se borra después de guardar la lista: si algo falla, preferimos
    // un archivo huérfano a un aviso apuntando a una foto que ya no existe.
  }

  // --- Poner de portada ---------------------------------------------------
  else if (accion === 'portada') {
    const ruta = String(form.get('ruta') ?? '');
    if (!photos.includes(ruta)) {
      return NextResponse.json({ error: 'Esa foto no es de este aviso.' }, { status: 400 });
    }
    photos = [ruta, ...photos.filter((p) => p !== ruta)];
  } else {
    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('pets')
    .update({ photos })
    .eq('id', pet.id);

  if (updateError) {
    return NextResponse.json(
      { error: `No se pudo guardar: ${updateError.message}` },
      { status: 500 },
    );
  }

  if (accion === 'quitar') {
    const quitada = pet.photos.find((p) => !photos.includes(p));
    if (quitada) await supabase.storage.from('fotos').remove([quitada]);
  }

  return NextResponse.json({ ok: true, photos });
}
