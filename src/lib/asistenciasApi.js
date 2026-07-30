import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "asistencias";
const LOCAL_KEY = "asistencias-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const toDb = (a) => ({
  id: a.id,
  persona_id: a.personaId,
  fecha: a.fecha,
  estado: a.estado || "presente",
  observacion: a.observacion || null,
});

const fromDb = (r) => ({
  id: r.id,
  personaId: r.persona_id,
  fecha: r.fecha,
  estado: r.estado || "presente",
  observacion: r.observacion || "",
});

/* ---------- modo local (sin Supabase configurado) ---------- */
function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
  } catch {
    return [];
  }
}
function saveLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

/* ---------- API pública ---------- */
/** Lista las marcas de asistencia entre dos fechas (YYYY-MM-DD), inclusive. */
export async function listAsistenciasRango(desde, hasta) {
  if (!isSupabaseConfigured) {
    return loadLocal().filter((a) => a.fecha >= desde && a.fecha <= hasta);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (error) throw error;
  return (data || []).map(fromDb);
}

/** Crea o actualiza la marca de un día (única por persona + fecha). */
export async function upsertAsistencia(asistencia) {
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((a) => a.personaId === asistencia.personaId && a.fecha === asistencia.fecha);
    const item = { id: asistencia.id || (idx >= 0 ? data[idx].id : crypto.randomUUID()), ...asistencia };
    if (idx >= 0) data[idx] = item;
    else data.push(item);
    saveLocal(data);
    return item;
  }
  const item = { id: asistencia.id || crypto.randomUUID(), ...asistencia };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(toDb(item), { onConflict: "persona_id,fecha" })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data);
}

export async function deleteAsistencia(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((a) => a.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Se suscribe a cambios en tiempo real. */
export function subscribeAsistencias(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("asistencias-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
