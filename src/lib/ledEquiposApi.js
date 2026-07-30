import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { LED_EQUIPOS_SEED } from "./ledSeedData";

const TABLE = "led_equipos_video";
const LOCAL_KEY = "led-equipos-video-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const num = (v) => (v === "" || v == null ? null : Number(v));

const toDb = (e) => ({
  id: e.id,
  codigo: e.codigo || null,
  nombre: e.nombre || "",
  carpeta: e.carpeta || null,
  tipo_equipo: e.tipoEquipo || null,
  puertos_ethernet: num(e.puertosEthernet),
  puertos_fibra: num(e.puertosFibra),
  capacidad_max_pixeles: num(e.capacidadMaxPixeles),
  resolucion: e.resolucion || null,
  maximo_alto_ancho: e.maximoAltoAncho || null,
  input_hdmi: num(e.inputHdmi),
  input_displayport: num(e.inputDisplayport),
  input_dvi: num(e.inputDvi),
  input_sdi: num(e.inputSdi),
  contenido_interno: !!e.contenidoInterno,
  observaciones: e.observaciones || null,
  activo: e.activo !== false,
});

const fromDb = (r) => ({
  id: r.id,
  codigo: r.codigo || "",
  nombre: r.nombre || "",
  carpeta: r.carpeta || "",
  tipoEquipo: r.tipo_equipo || "",
  puertosEthernet: r.puertos_ethernet ?? "",
  puertosFibra: r.puertos_fibra ?? "",
  capacidadMaxPixeles: r.capacidad_max_pixeles ?? "",
  resolucion: r.resolucion || "",
  maximoAltoAncho: r.maximo_alto_ancho || "",
  inputHdmi: r.input_hdmi ?? "",
  inputDisplayport: r.input_displayport ?? "",
  inputDvi: r.input_dvi ?? "",
  inputSdi: r.input_sdi ?? "",
  contenidoInterno: !!r.contenido_interno,
  observaciones: r.observaciones || "",
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
export async function listLedEquipos() {
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

export async function upsertLedEquipo(equipo) {
  const item = { id: equipo.id || crypto.randomUUID(), ...equipo };
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((e) => e.id === item.id);
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

export async function deleteLedEquipo(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((e) => e.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Se suscribe a cambios en tiempo real. */
export function subscribeLedEquipos(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("led-equipos-video-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/**
 * Carga el catálogo de fábrica (desde el Excel provisto) si la tabla/local
 * todavía está vacía. Idempotente: no duplica si ya hay datos cargados.
 */
export async function seedLedEquiposIniciales() {
  const actuales = await listLedEquipos();
  if (actuales.length > 0) return { sembrados: false };
  if (!isSupabaseConfigured) {
    const data = LED_EQUIPOS_SEED.map((e) => ({ id: crypto.randomUUID(), activo: true, ...e }));
    saveLocal(data);
    return { sembrados: true, cantidad: data.length };
  }
  const rows = LED_EQUIPOS_SEED.map((e) => toDb({ id: crypto.randomUUID(), activo: true, ...e }));
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "codigo" });
  if (error) throw error;
  return { sembrados: true, cantidad: rows.length };
}
