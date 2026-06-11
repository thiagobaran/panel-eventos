import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "personas_categorias";
const LOCAL_KEY = "personas-categorias-data-v1";

const toDb = (c) => ({ id: c.id, nombre: c.nombre || "" });
const fromDb = (r) => ({ id: r.id, nombre: r.nombre || "" });

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

export async function listCategoriasPersonal() {
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

export async function upsertCategoriaPersonal(categoria) {
  const item = { id: categoria.id || crypto.randomUUID(), ...categoria };
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((c) => c.id === item.id);
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

export async function deleteCategoriaPersonal(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((c) => c.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export function subscribeCategoriasPersonal(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("personas-categorias-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
