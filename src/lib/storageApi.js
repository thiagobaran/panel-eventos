import { supabase, isSupabaseConfigured } from "./supabaseClient";

const BUCKET = "eventos-archivos";

/* Lee un File como dataURL — solo se usa en modo local (sin Supabase)
   para que los archivos sigan accesibles desde el mismo navegador. */
const leerComoDataUrl = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

const limpiarNombre = (n) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");

/**
 * Sube un archivo y devuelve el metadato a guardar dentro del evento.
 * @param {string} eventoId  id del evento (carpeta dentro del bucket)
 * @param {"facturas"|"comprobantes"} tipo
 * @param {File} file
 */
export async function subirArchivo(eventoId, tipo, file) {
  const meta = {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    meta.dataUrl = await leerComoDataUrl(file);
    return meta;
  }

  const path = `${eventoId}/${tipo}/${meta.id}-${limpiarNombre(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: meta.mime,
    upsert: false,
  });
  if (error) throw error;
  meta.path = path;
  return meta;
}

/**
 * Devuelve una URL temporaria (1 hora) para descargar/ver un archivo subido.
 * En modo local devuelve el dataURL guardado en el metadato.
 */
export async function urlArchivo(meta) {
  if (!meta) return null;
  if (meta.dataUrl) return meta.dataUrl;
  if (!isSupabaseConfigured || !meta.path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(meta.path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Borra el archivo del bucket. No-op si no hay path (modo local). */
export async function borrarArchivo(meta) {
  if (!meta?.path || !isSupabaseConfigured) return;
  await supabase.storage.from(BUCKET).remove([meta.path]);
}
