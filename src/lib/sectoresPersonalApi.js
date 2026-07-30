import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "personas_sectores";
const LOCAL_KEY = "personas-sectores-data-v1";

const toDb = (s) => ({ id: s.id, nombre: s.nombre || "" });
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

export async function listSectoresPersonal() {
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

export async function upsertSectorPersonal(sector) {
  const item = { id: sector.id || crypto.randomUUID(), ...sector };
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((s) => s.id === item.id);
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

export async function deleteSectorPersonal(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((s) => s.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export function subscribeSectoresPersonal(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("personas-sectores-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** Siembra "Cacodelphia", "LED" y "Cine" si todavía no hay ningún sector cargado. Idempotente. */
export async function seedSectoresPersonalIniciales() {
  const actuales = await listSectoresPersonal();
  if (actuales.length > 0) return { sembrados: false };
  for (const nombre of ["Cacodelphia", "LED", "Cine"]) {
    await upsertSectorPersonal({ nombre });
  }
  return { sembrados: true };
}
