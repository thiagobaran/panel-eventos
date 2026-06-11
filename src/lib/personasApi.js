import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "personas";
const LOCAL_KEY = "personas-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const toDb = (p) => ({
  id: p.id,
  nombre: p.nombre || "",
  rol_habitual: p.rolHabitual || null,
  telefono: p.telefono || null,
  email: p.email || null,
  activo: p.activo !== false,
});

const fromDb = (r) => ({
  id: r.id,
  nombre: r.nombre || "",
  rolHabitual: r.rol_habitual || "",
  telefono: r.telefono || "",
  email: r.email || "",
  activo: r.activo !== false,
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
export async function listPersonas() {
  if (!isSupabaseConfigured) {
    return loadLocal().sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data || []).map(fromDb);
}

export async function upsertPersona(persona) {
  const item = { id: persona.id || crypto.randomUUID(), ...persona };
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((p) => p.id === item.id);
    if (idx >= 0) data[idx] = item;
    else data.push(item);
    saveLocal(data);
    return item;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(toDb(item))
    .select()
    .single();
  if (error) throw error;
  return fromDb(data);
}

export async function deletePersona(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((p) => p.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Se suscribe a cambios en tiempo real (otros usuarios cargando/editando personal). */
export function subscribePersonas(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("personas-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
