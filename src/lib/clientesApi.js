import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "clientes";
const LOCAL_KEY = "clientes-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const toDb = (c) => ({
  id: c.id,
  razon_social: c.razonSocial || "",
  cuit: c.cuit || null,
  telefono: c.telefono || null,
  email: c.email || null,
  domicilio: c.domicilio || null,
  director: c.director || {},
  equipo_externo: Array.isArray(c.equipoExterno) ? c.equipoExterno : [],
  contactos: Array.isArray(c.contactos) ? c.contactos : [],
  notas: c.notas || null,
  activo: c.activo !== false,
});

const fromDb = (r) => ({
  id: r.id,
  razonSocial: r.razon_social || "",
  cuit: r.cuit || "",
  telefono: r.telefono || "",
  email: r.email || "",
  domicilio: r.domicilio || "",
  director: r.director || { nombre: "", telefono: "", email: "" },
  equipoExterno: Array.isArray(r.equipo_externo) ? r.equipo_externo : [],
  contactos: Array.isArray(r.contactos) ? r.contactos : [],
  notas: r.notas || "",
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
export async function listClientes() {
  if (!isSupabaseConfigured) {
    return loadLocal().sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("razon_social", { ascending: true });
  if (error) throw error;
  return (data || []).map(fromDb);
}

export async function upsertCliente(cliente) {
  const item = { id: cliente.id || crypto.randomUUID(), ...cliente };
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

export async function deleteCliente(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((c) => c.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Se suscribe a cambios en tiempo real (otros usuarios cargando/editando clientes). */
export function subscribeClientes(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("clientes-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
