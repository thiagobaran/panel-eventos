import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Search, Calendar, Film, Layers, Camera, Crosshair,
  Wrench, Users, Building2, Phone, FileText, Check, X,
  Trash2, Pencil, AlertTriangle, Clock, DollarSign, ChevronLeft,
  Download, Upload, Link as LinkIcon, WifiOff, RefreshCw
} from "lucide-react";
import { listEventos, upsertEvento, deleteEvento, subscribeEventos } from "./lib/eventosApi";
import { listPersonas, upsertPersona, deletePersona, subscribePersonas } from "./lib/personasApi";
import { isSupabaseConfigured } from "./lib/supabaseClient";

/* ---------- constantes ---------- */
const CATEGORIAS = ["Videoclip", "Publicidad", "Película", "Serie"];
const ESTUDIOS = ["1", "2", "3"];
const MONEDAS = ["ARS", "USD"];
const EMPRESAS = ["MG M1", "MG M2"];
const TIPO_PROD = ["Virtual Production", "Back Projecting"];
const TRACKEO = ["Con trackeo", "Sin trackeo"];

const C = {
  bg: "#000000",
  panel: "#141414",
  panel2: "#1F1B12",
  border: "#3A3122",
  text: "#F5F1E8",
  dim: "#A39A88",
  gold: "#D4AF37",
  onGold: "#1A1400",
  amber: "#F0B429",
  rose: "#F2557A",
  green: "#4FD18B",
};

const nuevoEvento = () => ({
  id: crypto.randomUUID(),
  fecha: "",
  nombre: "",
  categoria: "",
  estudio: "",
  tipoProd: "",
  trackeo: "",
  equipamiento: false,
  equipamientoDetalle: "",
  integrantes: [],
  director: { nombre: "", telefono: "", email: "" },
  razonSocial: "",
  empresa: "",
  moneda: "ARS",
  importe: "",
  cantFacturas: "",
  medioPago: "",
  formaPago: "",
  facturasLinks: "",
  facturado: false,
  comprobantePago: false,
  facturadoTotal: false,
  observaciones: "",
});

/* ---------- helpers ---------- */
const fmtMoneda = (n, m) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: m === "USD" ? "USD" : "ARS",
    maximumFractionDigits: 0,
  }).format(v);
};
const conIva = (n) => (Number(n) || 0) * 1.21;
const fmtFecha = (f) => {
  if (!f) return "—";
  const [y, mo, d] = f.split("-");
  return `${d}/${mo}/${y}`;
};

/* ===================================================================== */
export default function PanelEventos() {
  const [eventos, setEventos] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState("lista"); // lista | form | detalle | dashboard | personal
  const [editId, setEditId] = useState(null);
  const [verId, setVerId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [filtroEmp, setFiltroEmp] = useState("");
  const fileInputRef = useRef(null);

  const recargar = useCallback(async () => {
    try {
      const data = await listEventos();
      setEventos(data);
      setError("");
    } catch (e) {
      console.error(e);
      setError("No se pudieron cargar los eventos. Revisá la conexión con la base de datos.");
    }
  }, []);

  const recargarPersonas = useCallback(async () => {
    try {
      const data = await listPersonas();
      setPersonas(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  /* carga inicial */
  useEffect(() => {
    (async () => {
      setCargando(true);
      await Promise.all([recargar(), recargarPersonas()]);
      setCargando(false);
    })();
  }, [recargar, recargarPersonas]);

  /* tiempo real: refresca si otro usuario carga/edita/borra un evento */
  useEffect(() => {
    const unsub = subscribeEventos(() => recargar());
    return unsub;
  }, [recargar]);

  /* tiempo real: refresca si otro usuario edita el listado de personal */
  useEffect(() => {
    const unsub = subscribePersonas(() => recargarPersonas());
    return unsub;
  }, [recargarPersonas]);

  const guardarEvento = async (ev) => {
    setGuardando(true);
    try {
      await upsertEvento(ev);
      await recargar();
      setVista("lista");
      setEditId(null);
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar el evento: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  const actualizarEvento = async (id, patch) => {
    const ev = eventos.find((e) => e.id === id);
    if (!ev) return;
    try {
      await upsertEvento({ ...ev, ...patch });
      await recargar();
    } catch (e) {
      console.error(e);
      alert("No se pudo actualizar el evento: " + e.message);
    }
  };

  const borrarEvento = async (id) => {
    try {
      await deleteEvento(id);
      await recargar();
      if (verId === id) setVista("lista");
    } catch (e) {
      console.error(e);
      alert("No se pudo borrar el evento: " + e.message);
    }
  };

  const guardarPersona = async (persona) => {
    try {
      await upsertPersona(persona);
      await recargarPersonas();
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar la persona: " + e.message);
    }
  };

  const borrarPersona = async (id) => {
    try {
      await deletePersona(id);
      await recargarPersonas();
    } catch (e) {
      console.error(e);
      alert("No se pudo borrar la persona: " + e.message);
    }
  };

  /* exportar / importar JSON (respaldo manual) */
  const exportarJSON = () => {
    const blob = new Blob([JSON.stringify(eventos, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eventos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importarJSON = async (file) => {
    try {
      const texto = await file.text();
      const data = JSON.parse(texto);
      if (!Array.isArray(data)) throw new Error("El archivo debe contener una lista de eventos.");
      for (const ev of data) {
        await upsertEvento({ ...nuevoEvento(), ...ev, id: ev.id || crypto.randomUUID() });
      }
      await recargar();
      alert(`Se importaron ${data.length} evento(s) correctamente.`);
    } catch (e) {
      console.error(e);
      alert("No se pudo importar el archivo: " + e.message);
    }
  };

  /* filtrado */
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return eventos.filter((e) => {
      if (filtroCat && e.categoria !== filtroCat) return false;
      if (filtroEmp && e.empresa !== filtroEmp) return false;
      if (!q) return true;
      return (
        (e.nombre || "").toLowerCase().includes(q) ||
        (e.razonSocial || "").toLowerCase().includes(q) ||
        (e.director?.nombre || "").toLowerCase().includes(q) ||
        e.integrantes?.some((i) =>
          (i.nombre + " " + i.rol).toLowerCase().includes(q)
        )
      );
    });
  }, [eventos, busqueda, filtroCat, filtroEmp]);

  const pendFact = eventos.filter((e) => e.nombre && !e.facturado);
  const pendComp = eventos.filter(
    (e) => e.nombre && e.facturado && !e.comprobantePago
  );

  const eventoEdit = editId ? eventos.find((e) => e.id === editId) : null;
  const eventoVer = verId ? eventos.find((e) => e.id === verId) : null;

  return (
    <div
      style={{ background: C.bg, color: C.text, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      className="min-h-screen w-full"
    >
      <style>{`
        *::-webkit-scrollbar{width:10px;height:10px}
        *::-webkit-scrollbar-thumb{background:${C.border};border-radius:6px}
        input,select,textarea{outline:none}
        input:focus,select:focus,textarea:focus{border-color:${C.gold}!important;box-shadow:0 0 0 1px ${C.gold}}
        .led{box-shadow:0 0 0 1px ${C.border},0 0 24px -8px ${C.gold}40}
        button:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
        @media (prefers-reduced-motion: no-preference){.fade{animation:f .25s ease both}}
        @keyframes f{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
      `}</style>

      {/* HEADER */}
      <header
        className="sticky top-0 z-20 px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap"
        style={{ background: `${C.bg}f2`, borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(8px)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="led grid place-items-center rounded-md"
            style={{ width: 34, height: 34, background: C.panel2 }}
          >
            <Camera size={18} color={C.gold} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-sm sm:text-base">Panel de Eventos</div>
            <div style={{ color: C.dim }} className="text-[11px] font-mono">PRODUCCIÓN · VIRTUAL STUDIO</div>
          </div>
        </div>

        <nav className="flex items-center gap-1 ml-auto">
          <Tab active={vista === "lista"} onClick={() => setVista("lista")} icon={<Layers size={15} />}>Eventos</Tab>
          <Tab active={vista === "personal"} onClick={() => setVista("personal")} icon={<Users size={15} />}>Personal</Tab>
          <Tab active={vista === "dashboard"} onClick={() => setVista("dashboard")} icon={<AlertTriangle size={15} />}>
            Pendientes
            {(pendFact.length + pendComp.length) > 0 && (
              <span className="ml-1.5 text-[10px] font-mono px-1.5 rounded-full"
                style={{ background: C.amber, color: "#1a1200" }}>
                {pendFact.length + pendComp.length}
              </span>
            )}
          </Tab>
          <IconBtn onClick={exportarJSON} title="Exportar respaldo (JSON)">
            <Download size={15} />
          </IconBtn>
          <input
            ref={fileInputRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importarJSON(f); e.target.value = ""; }}
          />
          <IconBtn onClick={() => fileInputRef.current?.click()} title="Importar respaldo (JSON)">
            <Upload size={15} />
          </IconBtn>
          <button
            onClick={() => { setEditId(null); setVista("form"); }}
            className="ml-1 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
            style={{ background: C.gold, color: C.onGold }}
          >
            <Plus size={16} /> <span className="hidden sm:inline">Nuevo evento</span>
          </button>
        </nav>
      </header>

      {!isSupabaseConfigured && (
        <div className="px-4 sm:px-6 py-2 text-xs flex items-center gap-2 flex-wrap"
          style={{ background: `${C.amber}1a`, borderBottom: `1px solid ${C.border}`, color: C.amber }}>
          <WifiOff size={13} />
          Modo local: los datos se guardan solo en este navegador. Configurá Supabase (ver README) para compartir los eventos con todo el equipo.
        </div>
      )}
      {error && (
        <div className="px-4 sm:px-6 py-2 text-xs flex items-center gap-2 flex-wrap"
          style={{ background: `${C.rose}1a`, borderBottom: `1px solid ${C.border}`, color: C.rose }}>
          <AlertTriangle size={13} /> {error}
          <button onClick={recargar} className="ml-2 underline flex items-center gap-1"><RefreshCw size={12} /> Reintentar</button>
        </div>
      )}

      <main className="px-4 sm:px-6 py-5 max-w-6xl mx-auto">
        {cargando ? (
          <div style={{ color: C.dim }} className="font-mono text-sm py-20 text-center">cargando…</div>
        ) : vista === "form" ? (
          <FormEvento
            base={eventoEdit || nuevoEvento()}
            onCancel={() => { setVista(eventoEdit ? "lista" : "lista"); setEditId(null); }}
            onSave={guardarEvento}
            guardando={guardando}
            personas={personas}
            onIrAPersonal={() => setVista("personal")}
          />
        ) : vista === "detalle" && eventoVer ? (
          <Detalle
            ev={eventoVer}
            onBack={() => setVista("lista")}
            onEdit={() => { setEditId(eventoVer.id); setVista("form"); }}
            onDelete={() => borrarEvento(eventoVer.id)}
            onUpdate={(patch) => actualizarEvento(eventoVer.id, patch)}
          />
        ) : vista === "dashboard" ? (
          <Dashboard
            pendFact={pendFact}
            pendComp={pendComp}
            onVer={(id) => { setVerId(id); setVista("detalle"); }}
          />
        ) : vista === "personal" ? (
          <Personal personas={personas} onSave={guardarPersona} onDelete={borrarPersona} />
        ) : (
          <Lista
            eventos={filtrados}
            total={eventos.length}
            busqueda={busqueda} setBusqueda={setBusqueda}
            filtroCat={filtroCat} setFiltroCat={setFiltroCat}
            filtroEmp={filtroEmp} setFiltroEmp={setFiltroEmp}
            onVer={(id) => { setVerId(id); setVista("detalle"); }}
            onEdit={(id) => { setEditId(id); setVista("form"); }}
            onDelete={borrarEvento}
            onNuevo={() => { setEditId(null); setVista("form"); }}
          />
        )}
      </main>
    </div>
  );
}

/* ---------- Tab ---------- */
function Tab({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors"
      style={{
        background: active ? C.panel2 : "transparent",
        color: active ? C.text : C.dim,
        border: `1px solid ${active ? C.border : "transparent"}`,
      }}
    >
      {icon}<span className="hidden sm:inline">{children}</span>
    </button>
  );
}

/* ---------- Badge ---------- */
function Badge({ color, children, solid }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        color: solid ? C.onGold : color,
        background: solid ? color : `${color}1a`,
        border: `1px solid ${color}40`,
      }}
    >
      {children}
    </span>
  );
}

/* ====================== LISTA ====================== */
function Lista({ eventos, total, busqueda, setBusqueda, filtroCat, setFiltroCat, filtroEmp, setFiltroEmp, onVer, onEdit, onDelete, onNuevo }) {
  return (
    <div className="fade">
      {/* filtros */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} color={C.dim} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar evento, director, razón social, integrante…"
            className="w-full text-sm pl-9 pr-3 py-2 rounded-md"
            style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text }}
          />
        </div>
        <Select value={filtroCat} onChange={setFiltroCat} placeholder="Categoría" options={CATEGORIAS} compact />
        <Select value={filtroEmp} onChange={setFiltroEmp} placeholder="Empresa" options={EMPRESAS} compact />
      </div>

      {eventos.length === 0 ? (
        <div className="rounded-xl text-center py-16 px-4" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
          <Film size={28} color={C.dim} className="mx-auto mb-3" />
          <p className="text-sm" style={{ color: C.dim }}>
            {total === 0 ? "Todavía no cargaste eventos." : "Ningún evento coincide con el filtro."}
          </p>
          {total === 0 && (
            <button onClick={onNuevo} className="mt-4 text-sm font-medium px-4 py-2 rounded-md inline-flex items-center gap-1.5"
              style={{ background: C.gold, color: C.onGold }}>
              <Plus size={15} /> Cargar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5">
          {eventos.map((e) => (
            <div key={e.id} onClick={() => onVer(e.id)}
              className="group rounded-xl p-3.5 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ background: C.panel, border: `1px solid ${C.border}` }}
              onMouseEnter={(ev) => ev.currentTarget.style.borderColor = C.gold + "80"}
              onMouseLeave={(ev) => ev.currentTarget.style.borderColor = C.border}
            >
              <div className="font-mono text-xs w-20 shrink-0 flex items-center gap-1.5" style={{ color: C.dim }}>
                <Calendar size={13} /> {fmtFecha(e.fecha)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{e.nombre || <span style={{ color: C.dim }}>Sin nombre</span>}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {e.categoria && <Badge color={C.gold}><Film size={11} />{e.categoria}</Badge>}
                  {e.tipoProd && <Badge color="#9b8cff">{e.tipoProd}</Badge>}
                  {e.trackeo && <Badge color={e.trackeo === "Con trackeo" ? C.green : C.dim}><Crosshair size={11} />{e.trackeo.replace(" trackeo", "")}</Badge>}
                  {e.empresa && <Badge color={C.dim}><Building2 size={11} />{e.empresa}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="font-mono text-sm">{fmtMoneda(e.importe, e.moneda)}</div>
                  <div className="flex gap-1 justify-end mt-1">
                    {e.facturado ? <Badge solid color={C.green}>Facturado</Badge> : <Badge color={C.amber}>S/ facturar</Badge>}
                    {e.facturado && !e.comprobantePago && <Badge color={C.rose}>S/ comprob.</Badge>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <IconBtn onClick={(ev) => { ev.stopPropagation(); onEdit(e.id); }} title="Editar"><Pencil size={15} /></IconBtn>
                  <IconBtn onClick={(ev) => { ev.stopPropagation(); if (confirm("¿Borrar evento?")) onDelete(e.id); }} title="Borrar" danger><Trash2 size={15} /></IconBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ====================== DASHBOARD ====================== */
function Dashboard({ pendFact, pendComp, onVer }) {
  return (
    <div className="fade grid gap-5">
      <TablaPend
        titulo="Pendientes de facturación"
        icon={<AlertTriangle size={16} color={C.amber} />}
        color={C.amber}
        rows={pendFact}
        onVer={onVer}
        vacio="Nada pendiente de facturar. 🎬"
      />
      <TablaPend
        titulo="Pendientes de comprobante de pago"
        icon={<Clock size={16} color={C.rose} />}
        color={C.rose}
        rows={pendComp}
        onVer={onVer}
        vacio="Todos los comprobantes cargados."
      />
    </div>
  );
}

function TablaPend({ titulo, icon, color, rows, onVer, vacio }) {
  return (
    <section className="rounded-xl overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        {icon}<h2 className="font-semibold text-sm">{titulo}</h2>
        <span className="ml-auto font-mono text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}1a`, color }}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm px-4 py-8 text-center" style={{ color: C.dim }}>{vacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: C.dim }} className="text-[11px] uppercase tracking-wide">
                {["Fecha", "Evento", "Estudio", "Empresa", "Importe", "Importe + IVA"].map((h) => (
                  <th key={h} className="text-left font-medium px-4 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => onVer(e.id)} className="cursor-pointer transition-colors"
                  style={{ borderTop: `1px solid ${C.border}` }}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = C.panel2}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}>
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap" style={{ color: C.dim }}>{fmtFecha(e.fecha)}</td>
                  <td className="px-4 py-2.5 font-medium">{e.nombre}</td>
                  <td className="px-4 py-2.5">{e.estudio || "—"}</td>
                  <td className="px-4 py-2.5">{e.empresa || "—"}</td>
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap">{fmtMoneda(e.importe, e.moneda)}</td>
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: C.gold }}>{fmtMoneda(conIva(e.importe), e.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ====================== PERSONAL ====================== */
function Personal({ personas, onSave, onDelete }) {
  const vacio = { nombre: "", rolHabitual: "", telefono: "", email: "", activo: true };
  const [editando, setEditando] = useState(null); // null | "new" | persona id
  const [f, setF] = useState(vacio);

  const empezarNuevo = () => { setF(vacio); setEditando("new"); };
  const empezarEditar = (p) => { setF(p); setEditando(p.id); };
  const cancelar = () => { setEditando(null); setF(vacio); };
  const guardar = async () => {
    if (!f.nombre.trim()) { alert("Poné el nombre de la persona."); return; }
    await onSave(f);
    cancelar();
  };

  return (
    <div className="fade max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-lg font-semibold flex-1">Personal</h1>
        {editando === null && (
          <button onClick={empezarNuevo} className="text-sm font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5"
            style={{ background: C.gold, color: C.onGold }}>
            <Plus size={15} /> Agregar persona
          </button>
        )}
      </div>

      <p className="text-xs mb-4" style={{ color: C.dim }}>
        Cargá acá a todo el personal de la productora. Después, al crear o editar un evento,
        podés elegirlos de esta lista y asignarles el rol que ocupan en ese evento puntual.
      </p>

      {editando !== null && (
        <div className="rounded-xl p-4 mb-4 grid sm:grid-cols-2 gap-3.5" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
          <Field label="Nombre" full>
            <Input value={f.nombre} onChange={(v) => setF({ ...f, nombre: v })} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Rol habitual">
            <Input value={f.rolHabitual} onChange={(v) => setF({ ...f, rolHabitual: v })} placeholder="DF, gaffer, op. LED…" />
          </Field>
          <Field label="Teléfono">
            <Input value={f.telefono} onChange={(v) => setF({ ...f, telefono: v })} placeholder="+54 9 11 ..." />
          </Field>
          <Field label="Email" full>
            <Input type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} placeholder="nombre@ejemplo.com" />
          </Field>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button onClick={cancelar} className="text-sm px-4 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>Cancelar</button>
            <button onClick={guardar} className="text-sm font-medium px-5 py-2 rounded-md flex items-center gap-1.5" style={{ background: C.gold, color: C.onGold }}>
              <Check size={16} /> Guardar
            </button>
          </div>
        </div>
      )}

      {personas.length === 0 ? (
        <div className="rounded-xl text-center py-16 px-4" style={{ background: C.panel, border: `1px dashed ${C.border}` }}>
          <Users size={28} color={C.dim} className="mx-auto mb-3" />
          <p className="text-sm" style={{ color: C.dim }}>Todavía no cargaste personal.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {personas.map((p) => (
            <div key={p.id} className="rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-2" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.nombre}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs" style={{ color: C.dim }}>
                  {p.rolHabitual && <span className="font-mono px-2 py-0.5 rounded" style={{ background: C.panel2 }}>{p.rolHabitual}</span>}
                  {p.telefono && <span>{p.telefono}</span>}
                  {p.email && <span>{p.email}</span>}
                </div>
              </div>
              <div className="flex gap-1">
                <IconBtn onClick={() => empezarEditar(p)} title="Editar"><Pencil size={15} /></IconBtn>
                <IconBtn onClick={() => { if (confirm("¿Borrar de la lista de personal?")) onDelete(p.id); }} title="Borrar" danger><Trash2 size={15} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ====================== DETALLE ====================== */
function Detalle({ ev, onBack, onEdit, onDelete, onUpdate }) {
  return (
    <div className="fade">
      <div className="flex items-center gap-2 mb-4">
        <IconBtn onClick={onBack} title="Volver"><ChevronLeft size={18} /></IconBtn>
        <h1 className="text-lg font-semibold flex-1 truncate">{ev.nombre || "Sin nombre"}</h1>
        <button onClick={onEdit} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}` }}><Pencil size={14} /> Editar</button>
        <IconBtn onClick={() => { if (confirm("¿Borrar evento?")) onDelete(); }} title="Borrar" danger><Trash2 size={16} /></IconBtn>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {ev.categoria && <Badge color={C.gold}><Film size={11} />{ev.categoria}</Badge>}
        {ev.tipoProd && <Badge color="#9b8cff">{ev.tipoProd}</Badge>}
        {ev.trackeo && <Badge color={ev.trackeo === "Con trackeo" ? C.green : C.dim}><Crosshair size={11} />{ev.trackeo}</Badge>}
        {ev.equipamiento ? <Badge color={C.green}><Wrench size={11} />Con equipamiento</Badge> : <Badge color={C.dim}><Wrench size={11} />Sin equipamiento</Badge>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card titulo="Producción" icon={<Camera size={15} color={C.gold} />}>
          <Dato k="Fecha" v={fmtFecha(ev.fecha)} mono />
          <Dato k="Estudio" v={ev.estudio || "—"} />
          <Dato k="Tipo" v={ev.tipoProd || "—"} />
          <Dato k="Trackeo" v={ev.trackeo || "—"} />
          {ev.equipamiento && ev.equipamientoDetalle && <Dato k="Equipamiento" v={ev.equipamientoDetalle} />}
        </Card>

        <Card titulo="Facturación" icon={<DollarSign size={15} color={C.green} />}>
          <Dato k="Empresa" v={ev.empresa || "—"} />
          <Dato k="Razón social" v={ev.razonSocial || "—"} />
          <Dato k="Importe" v={fmtMoneda(ev.importe, ev.moneda)} mono />
          <Dato k="Importe + IVA" v={fmtMoneda(conIva(ev.importe), ev.moneda)} mono accent />
          <Dato k="Cant. facturas" v={ev.cantFacturas || "—"} />
          <Dato k="Medio de pago" v={ev.medioPago || "—"} />
          <Dato k="Forma de pago" v={ev.formaPago || "—"} />
          {ev.facturasLinks && (
            <a href={ev.facturasLinks.split(/\s|,/)[0]} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs mt-1" style={{ color: C.gold }}>
              <LinkIcon size={12} /> Ver facturas adjuntas
            </a>
          )}
        </Card>

        <Card titulo="Estado administrativo" icon={<DollarSign size={15} color={C.gold} />}>
          <p className="text-xs mb-1" style={{ color: C.dim }}>
            Editable solo por administración una vez creado el evento.
          </p>
          <Toggle checked={ev.facturado} onChange={(v) => onUpdate({ facturado: v })} label="Facturado" />
          <Toggle checked={ev.comprobantePago} onChange={(v) => onUpdate({ comprobantePago: v })} label="Comprobante de pago adjunto" />
          <Toggle checked={ev.facturadoTotal} onChange={(v) => onUpdate({ facturadoTotal: v })} label="Facturado total" />
        </Card>

        <Card titulo="Equipo" icon={<Users size={15} color={C.gold} />}>
          {ev.integrantes?.length ? (
            <div className="grid gap-1.5">
              {ev.integrantes.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: idx < ev.integrantes.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span>{i.nombre}</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: C.panel2, color: C.dim }}>{i.rol}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm" style={{ color: C.dim }}>Sin integrantes cargados.</p>}
        </Card>

        <Card titulo="Dirección" icon={<Phone size={15} color={C.amber} />}>
          <Dato k="Director" v={ev.director?.nombre || "—"} />
          <Dato k="Teléfono" v={ev.director?.telefono || "—"} mono />
          <Dato k="Email" v={ev.director?.email || "—"} mono />
        </Card>

        {ev.observaciones && (
          <Card titulo="Observaciones" icon={<FileText size={15} color={C.dim} />} full>
            <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: C.text }}>{ev.observaciones}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ titulo, icon, children, full }) {
  return (
    <div className={`rounded-xl p-4 ${full ? "sm:col-span-2" : ""}`} style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">{icon}<h3 className="text-sm font-semibold">{titulo}</h3></div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}
function Dato({ k, v, mono, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span style={{ color: C.dim }} className="text-[13px]">{k}</span>
      <span className={mono ? "font-mono" : ""} style={{ color: accent ? C.gold : C.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}

/* ====================== FORMULARIO ====================== */
function FormEvento({ base, onCancel, onSave, guardando, personas = [], onIrAPersonal }) {
  const [f, setF] = useState(base);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setDir = (k, v) => setF((p) => ({ ...p, director: { ...p.director, [k]: v } }));

  const addIntegrante = () => set("integrantes", [...f.integrantes, { personaId: "", nombre: "", rol: "" }]);
  const setIntegrante = (i, k, v) =>
    set("integrantes", f.integrantes.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const elegirPersona = (i, personaId) => {
    const p = personas.find((p) => p.id === personaId);
    set("integrantes", f.integrantes.map((x, idx) => idx === i
      ? { ...x, personaId, nombre: p ? p.nombre : "", rol: x.rol || (p ? p.rolHabitual : "") }
      : x));
  };
  const delIntegrante = (i) => set("integrantes", f.integrantes.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!f.nombre.trim()) { alert("Poné al menos el nombre del evento."); return; }
    onSave(f);
  };

  return (
    <div className="fade max-w-3xl">
      <div className="flex items-center gap-2 mb-5">
        <IconBtn onClick={onCancel} title="Volver"><ChevronLeft size={18} /></IconBtn>
        <h1 className="text-lg font-semibold">{base.nombre ? "Editar evento" : "Nuevo evento"}</h1>
      </div>

      <div className="grid gap-5">
        {/* Producción */}
        <Seccion titulo="Producción" icon={<Camera size={15} color={C.gold} />}>
          <Field label="Nombre del evento" full>
            <Input value={f.nombre} onChange={(v) => set("nombre", v)} placeholder="Ej: Videoclip — Artista X" />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={f.fecha} onChange={(v) => set("fecha", v)} />
          </Field>
          <Field label="Categoría">
            <Select value={f.categoria} onChange={(v) => set("categoria", v)} options={CATEGORIAS} placeholder="Elegir" />
          </Field>
          <Field label="Estudio">
            <Select value={f.estudio} onChange={(v) => set("estudio", v)} options={ESTUDIOS} placeholder="Elegir" />
          </Field>
          <Field label="Tipo de producción">
            <Select value={f.tipoProd} onChange={(v) => set("tipoProd", v)} options={TIPO_PROD} placeholder="Elegir" />
          </Field>
          <Field label="Trackeo">
            <Select value={f.trackeo} onChange={(v) => set("trackeo", v)} options={TRACKEO} placeholder="Elegir" />
          </Field>
          <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3 sm:items-center">
            <Toggle checked={f.equipamiento} onChange={(v) => set("equipamiento", v)} label="Equipamiento" />
            {f.equipamiento && (
              <Input value={f.equipamientoDetalle} onChange={(v) => set("equipamientoDetalle", v)} placeholder="Detalle (cámaras, LED wall, grip…)" />
            )}
          </div>
        </Seccion>

        {/* Equipo */}
        <Seccion titulo="Integrantes y roles" icon={<Users size={15} color={C.gold} />}>
          <div className="sm:col-span-2 grid gap-2">
            {personas.length === 0 && (
              <p className="text-xs px-3 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
                Todavía no hay personal cargado.{" "}
                {onIrAPersonal && (
                  <button type="button" onClick={onIrAPersonal} className="underline" style={{ color: C.gold }}>
                    Cargalo en la sección Personal
                  </button>
                )}
              </p>
            )}
            {f.integrantes.map((i, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <select value={i.personaId || ""} onChange={(e) => elegirPersona(idx, e.target.value)}
                  className="text-sm px-3 py-2 rounded-md sm:flex-1"
                  style={{ background: C.panel2, border: `1px solid ${C.border}`, color: i.personaId ? C.text : C.dim, colorScheme: "dark" }}>
                  <option value="" style={{ background: C.panel2, color: C.dim }}>Elegir persona…</option>
                  {personas.map((p) => <option key={p.id} value={p.id} style={{ background: C.panel2, color: C.text }}>{p.nombre}</option>)}
                </select>
                <Input value={i.rol} onChange={(v) => setIntegrante(idx, "rol", v)} placeholder="Rol en este evento (DF, gaffer…)" />
                <IconBtn onClick={() => delIntegrante(idx)} title="Quitar" danger><X size={16} /></IconBtn>
              </div>
            ))}
            <button onClick={addIntegrante} className="self-start text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-md mt-1"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.gold }}>
              <Plus size={14} /> Agregar integrante
            </button>
          </div>
        </Seccion>

        {/* Dirección */}
        <Seccion titulo="Dirección" icon={<Phone size={15} color={C.amber} />}>
          <Field label="Director" full>
            <Input value={f.director.nombre} onChange={(v) => setDir("nombre", v)} placeholder="Nombre del director" />
          </Field>
          <Field label="Teléfono">
            <Input value={f.director.telefono} onChange={(v) => setDir("telefono", v)} placeholder="+54 9 11 ..." />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.director.email} onChange={(v) => setDir("email", v)} placeholder="director@ejemplo.com" />
          </Field>
        </Seccion>

        {/* Facturación */}
        <Seccion titulo="Facturación" icon={<DollarSign size={15} color={C.green} />}>
          <Field label="Empresa">
            <Select value={f.empresa} onChange={(v) => set("empresa", v)} options={EMPRESAS} placeholder="Elegir" />
          </Field>
          <Field label="Razón social (facturación)">
            <Input value={f.razonSocial} onChange={(v) => set("razonSocial", v)} placeholder="Razón social + CUIT" />
          </Field>
          <Field label="Moneda">
            <Select value={f.moneda} onChange={(v) => set("moneda", v)} options={MONEDAS} />
          </Field>
          <Field label="Importe (neto)">
            <Input type="number" value={f.importe} onChange={(v) => set("importe", v)} placeholder="0" />
          </Field>
          <Field label="Importe + IVA (auto)">
            <div className="font-mono text-sm px-3 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.gold }}>
              {fmtMoneda(conIva(f.importe), f.moneda)}
            </div>
          </Field>
          <Field label="Cant. facturas">
            <Input type="number" value={f.cantFacturas} onChange={(v) => set("cantFacturas", v)} placeholder="0" />
          </Field>
          <Field label="Medio de pago">
            <Input value={f.medioPago} onChange={(v) => set("medioPago", v)} placeholder="Transferencia, efectivo…" />
          </Field>
          <Field label="Forma de pago">
            <Input value={f.formaPago} onChange={(v) => set("formaPago", v)} placeholder="Contado, 30 días…" />
          </Field>
          <Field label="Facturas adjuntas (links Drive)" full>
            <Input value={f.facturasLinks} onChange={(v) => set("facturasLinks", v)} placeholder="https://drive.google.com/…" />
          </Field>
          <div className="sm:col-span-2 text-xs px-3 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>
            El estado de "Facturado", "Comprobante de pago" y "Facturado total" se carga desde el detalle del evento, una vez creado.
          </div>
        </Seccion>

        {/* Observaciones */}
        <Seccion titulo="Observaciones" icon={<FileText size={15} color={C.dim} />}>
          <div className="sm:col-span-2">
            <textarea value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)}
              rows={4} placeholder="Notas, pendientes, detalles del set…"
              className="w-full text-sm px-3 py-2 rounded-md resize-y"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text }} />
          </div>
        </Seccion>

        <div className="flex gap-2 justify-end pb-8">
          <button onClick={onCancel} className="text-sm px-4 py-2 rounded-md" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.dim }}>Cancelar</button>
          <button onClick={submit} disabled={guardando} className="text-sm font-medium px-5 py-2 rounded-md flex items-center gap-1.5"
            style={{ background: C.gold, color: C.onGold, opacity: guardando ? 0.6 : 1, cursor: guardando ? "wait" : "pointer" }}>
            <Check size={16} /> {guardando ? "Guardando…" : "Guardar evento"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- form primitives ---------- */
function Seccion({ titulo, icon, children }) {
  return (
    <section className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3.5">{icon}<h2 className="text-sm font-semibold">{titulo}</h2></div>
      <div className="grid sm:grid-cols-2 gap-3.5">{children}</div>
    </section>
  );
}
function Field({ label, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-[12px] mb-1.5" style={{ color: C.dim }}>{label}</label>
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-sm px-3 py-2 rounded-md"
      style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, colorScheme: "dark" }} />
  );
}
function Select({ value, onChange, options, placeholder, compact }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`text-sm px-3 py-2 rounded-md ${compact ? "" : "w-full"}`}
      style={{ background: compact ? C.panel : C.panel2, border: `1px solid ${C.border}`, color: value ? C.text : C.dim, colorScheme: "dark" }}>
      {placeholder && <option value="" style={{ background: C.panel2, color: C.dim }}>{placeholder}</option>}
      {options.map((o) => <option key={o} value={o} style={{ background: C.panel2, color: C.text }}>{o}</option>)}
    </select>
  );
}
function Toggle({ checked, onChange, label }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm">
      <span className="grid place-items-center rounded transition-colors" style={{
        width: 20, height: 20, background: checked ? C.gold : C.panel2,
        border: `1px solid ${checked ? C.gold : C.border}`,
      }}>
        {checked && <Check size={14} color={C.onGold} />}
      </span>
      <span style={{ color: checked ? C.text : C.dim }}>{label}</span>
    </button>
  );
}
function IconBtn({ onClick, children, title, danger }) {
  return (
    <button onClick={onClick} title={title}
      className="grid place-items-center rounded-md transition-colors"
      style={{ width: 32, height: 32, background: C.panel2, border: `1px solid ${C.border}`, color: danger ? C.rose : C.dim }}
      onMouseEnter={(e) => e.currentTarget.style.color = danger ? C.rose : C.text}
      onMouseLeave={(e) => e.currentTarget.style.color = danger ? C.rose : C.dim}>
      {children}
    </button>
  );
}
