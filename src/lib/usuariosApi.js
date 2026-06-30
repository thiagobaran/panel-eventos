import { supabase, isSupabaseConfigured } from "./supabaseClient";

const TABLE = "usuarios";
const LOCAL_KEY = "usuarios-data-v1";
const SESSION_KEY = "panel-eventos-session-v1";

/* ---------- Hash de contraseña (Web Crypto, SHA-256 + salt por usuario) ---------- */
const toHex = (buf) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(salt + ":" + password));
  return toHex(buf);
}

/* ---------- mapeo JS <-> DB ---------- */
const fromDb = (r) => ({
  id: r.id,
  nombre: r.nombre || "",
  rol: r.rol || "produccion",
  activo: r.activo !== false,
  passwordHash: r.password_hash,
  passwordSalt: r.password_salt,
  passwordVisible: r.password_visible || "",
});

const toDb = (u) => ({
  id: u.id,
  nombre: u.nombre || "",
  password_hash: u.passwordHash,
  password_salt: u.passwordSalt,
  password_visible: u.passwordVisible || "",
  rol: u.rol || "produccion",
  activo: u.activo !== false,
});

/* ---------- modo local ---------- */
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
export async function listUsuarios() {
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

export async function crearUsuario({ nombre, password, rol }) {
  const nombreTrim = (nombre || "").trim();
  if (!nombreTrim) throw new Error("El nombre de usuario es obligatorio.");
  if (!password || password.length < 4)
    throw new Error("La contraseña debe tener al menos 4 caracteres.");

  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  const user = {
    id: crypto.randomUUID(),
    nombre: nombreTrim,
    passwordHash,
    passwordSalt: salt,
    passwordVisible: password,
    rol: rol || "produccion",
    activo: true,
  };

  if (!isSupabaseConfigured) {
    const data = loadLocal();
    if (data.some((u) => u.nombre.toLowerCase() === nombreTrim.toLowerCase())) {
      throw new Error("Ya existe un usuario con ese nombre.");
    }
    data.push(user);
    saveLocal(data);
    return user;
  }
  const { data, error } = await supabase.from(TABLE).insert(toDb(user)).select().single();
  if (error) throw error;
  return fromDb(data);
}

export async function actualizarUsuario({ id, rol, activo }) {
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((u) => u.id === id);
    if (idx < 0) throw new Error("Usuario no encontrado.");
    if (rol != null) data[idx].rol = rol;
    if (activo != null) data[idx].activo = activo;
    saveLocal(data);
    return data[idx];
  }
  const patch = {};
  if (rol != null) patch.rol = rol;
  if (activo != null) patch.activo = activo;
  const { data, error } = await supabase
    .from(TABLE).update(patch).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data);
}

export async function cambiarPassword(id, nuevaPassword) {
  if (!nuevaPassword || nuevaPassword.length < 4)
    throw new Error("La contraseña debe tener al menos 4 caracteres.");
  const salt = randomSalt();
  const passwordHash = await hashPassword(nuevaPassword, salt);
  if (!isSupabaseConfigured) {
    const data = loadLocal();
    const idx = data.findIndex((u) => u.id === id);
    if (idx < 0) throw new Error("Usuario no encontrado.");
    data[idx].passwordHash = passwordHash;
    data[idx].passwordSalt = salt;
    data[idx].passwordVisible = nuevaPassword;
    saveLocal(data);
    return;
  }
  const { error } = await supabase
    .from(TABLE)
    .update({ password_hash: passwordHash, password_salt: salt, password_visible: nuevaPassword })
    .eq("id", id);
  if (error) throw error;
}

export async function borrarUsuario(id) {
  if (!isSupabaseConfigured) {
    saveLocal(loadLocal().filter((u) => u.id !== id));
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Verifica credenciales y devuelve el usuario (sin hash) o null. */
export async function loginUsuario(nombre, password) {
  const usuarios = await listUsuarios();
  const u = usuarios.find(
    (x) => x.nombre.toLowerCase() === (nombre || "").trim().toLowerCase()
  );
  if (!u) return null;
  if (!u.activo) throw new Error("Este usuario está desactivado.");
  const hash = await hashPassword(password, u.passwordSalt);
  if (hash !== u.passwordHash) return null;
  return { id: u.id, nombre: u.nombre, rol: u.rol };
}

/**
 * Crea los 3 usuarios iniciales si la tabla está vacía.
 * Defaults: admin/admin, nacho/nacho, pablo/pablo.
 * Llama a esto antes del login. Si falla por falta de tabla, lo deja burbujear.
 */
export async function seedUsuariosIniciales() {
  const existentes = await listUsuarios();
  if (existentes.length > 0) return { sembrados: false, defaults: null };
  const defaults = [
    { nombre: "admin", password: "admin", rol: "admin" },
    { nombre: "nacho", password: "nacho", rol: "contabilidad" },
    { nombre: "pablo", password: "pablo", rol: "produccion" },
  ];
  for (const d of defaults) {
    try {
      await crearUsuario(d);
    } catch (e) {
      // Ignoramos duplicados por carrera entre clientes
      if (!/duplicate|unique/i.test(String(e?.message || ""))) throw e;
    }
  }
  return { sembrados: true, defaults };
}

/* ---------- sesión local ---------- */
export function guardarSesion(usuario) {
  if (usuario) localStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
  else localStorage.removeItem(SESSION_KEY);
}
export function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

/** Se suscribe a cambios para que el admin vea actualizaciones de otros admins. */
export function subscribeUsuarios(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel("usuarios-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ---------- roles disponibles ---------- */
export const ROLES = [
  { value: "admin",         label: "Admin",         desc: "Acceso total + gestión de usuarios" },
  { value: "contabilidad",  label: "Contabilidad",  desc: "Todo salvo crear eventos, personal y categorías" },
  { value: "produccion",    label: "Producción",    desc: "Crea y edita eventos (sin facturación)" },
  { value: "espectador",    label: "Espectador",    desc: "Solo visualización, sin permisos de edición" },
];

/* ---------- matriz de permisos por rol ---------- */
export function perms(rol) {
  switch (rol) {
    case "admin":
      return {
        eventoCrear: true, eventoEditar: true, eventoBorrar: true,
        eventoConfirmar: true, eventoFacturar: true, archivos: true,
        personalAgregar: true, personalEditar: true, personalBorrar: true,
        categoriaAgregar: true, categoriaEditar: true, categoriaBorrar: true,
        importarExportar: true,
        liberarPersona: true,
        usuarios: true,
      };
    case "contabilidad":
      return {
        eventoCrear: false, eventoEditar: true, eventoBorrar: true,
        eventoConfirmar: false, eventoFacturar: true, archivos: true,
        personalAgregar: false, personalEditar: true, personalBorrar: true,
        categoriaAgregar: false, categoriaEditar: true, categoriaBorrar: true,
        importarExportar: true,
        liberarPersona: false,
        usuarios: false,
      };
    case "produccion":
      return {
        eventoCrear: true, eventoEditar: true, eventoBorrar: false,
        eventoConfirmar: true, eventoFacturar: false, archivos: false,
        personalAgregar: false, personalEditar: false, personalBorrar: false,
        categoriaAgregar: false, categoriaEditar: false, categoriaBorrar: false,
        importarExportar: true,
        liberarPersona: true,
        usuarios: false,
      };
    case "espectador":
    default:
      return {
        eventoCrear: false, eventoEditar: false, eventoBorrar: false,
        eventoConfirmar: false, eventoFacturar: false, archivos: false,
        personalAgregar: false, personalEditar: false, personalBorrar: false,
        categoriaAgregar: false, categoriaEditar: false, categoriaBorrar: false,
        importarExportar: false,
        liberarPersona: false,
        usuarios: false,
      };
  }
}

/** Crea el usuario "prueba/prueba" (espectador) si no existe todavía. Idempotente. */
export async function ensurePruebaUser() {
  try {
    const existentes = await listUsuarios();
    if (existentes.some((u) => u.nombre === "prueba")) return;
    await crearUsuario({ nombre: "prueba", password: "prueba", rol: "espectador" });
  } catch (e) {
    if (!/duplicate|unique/i.test(String(e?.message || ""))) console.warn("ensurePrueba:", e);
  }
}
