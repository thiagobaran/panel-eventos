import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { LED_MODULOS_SEED } from "./ledSeedData";

const TABLE = "led_modulos";
const LOCAL_KEY = "led-modulos-data-v1";

/* ---------- mapeo JS (camelCase) <-> DB (snake_case) ---------- */
const toDb = (m) => ({
  id: m.id,
  codigo: m.codigo || null,
  nombre: m.nombre || "",
  pitch: m.pitch === "" || m.pitch == null ? null : Number(m.pitch),
  ancho_mm: m.anchoMm === "" || m.anchoMm == null ? null : Number(m.anchoMm),
  alto_mm: m.altoMm === "" || m.altoMm == null ? null : Number(m.altoMm),
  pitch_ancho_px: m.pitchAnchoPx === "" || m.pitchAnchoPx == null ? null : Number(m.pitchAnchoPx),
  pitch_alto_px: m.pitchAltoPx === "" || m.pitchAltoPx == null ? null : Number(m.pitchAltoPx),
  ancho_1m_px: m.ancho1mPx === "" || m.ancho1mPx == null ? null : Number(m.ancho1mPx),
  alto_1m_px: m.alto1mPx === "" || m.alto1mPx == null ? null : Number(m.alto1mPx),
  carpeta: m.carpeta || null,
  tipo_equipo: m.tipoEquipo || null,
  activo: m.activo !== false,
});

const fromDb = (r) => ({
  id: r.id,
  codigo: r.codigo || "",
  nombre: r.nombre || "",
  pitch: r.pitch ?? "",
  anchoMm: r.ancho_mm ?? "",
  altoMm: r.alto_mm ?? "",
  pitchAnchoPx: r.pitch_ancho_px ?? "",
  pitchAltoPx: r.pitch_alto_px ?? "",
  ancho1mPx: r.ancho_1m_px ?? "",
  alto1mPx: r.alto_1m_px ?? "",
  carpeta: r.carpeta || "",
  tipoEquipo: r.tipo_equipo || "",
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
export async function listLedModulos() {
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

export async function upsertLedModulo(modulo) {
  const item = { id: modulo.id || crypto.randomUUID(), ...modulo };
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((m) => m.id === item.id);
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

export async function deleteLedModulo(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((m) => m.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Se suscribe a cambios en tiempo real. */
export function subscribeLedModulos(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("led-modulos-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/**
 * Carga el catálogo de fábrica (desde el Excel provisto) si la tabla/local
 * todavía está vacía. Idempotente: no duplica si ya hay datos cargados.
 */
export async function seedLedModulosIniciales() {
  const actuales = await listLedModulos();
  if (actuales.length > 0) return { sembrados: false };
  if (!isSupabaseConfigured) {
    const data = LED_MODULOS_SEED.map((m) => ({ id: crypto.randomUUID(), activo: true, ...m }));
    saveLocal(data);
    return { sembrados: true, cantidad: data.length };
  }
  const rows = LED_MODULOS_SEED.map((m) => toDb({ id: crypto.randomUUID(), activo: true, ...m }));
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "codigo" });
  if (error) throw error;
  return { sembrados: true, cantidad: rows.length };
}
