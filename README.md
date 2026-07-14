# Panel de Eventos

Sistema interno de gestión de eventos de producción (videoclips, publicidades,
películas, series). Permite cargar y consultar cada evento con toda su
información: categoría, tipo de producción (Virtual Production / Back
Projecting), trackeo, equipamiento, integrantes y roles, datos de facturación,
contacto del director y observaciones. Incluye un panel de "Pendientes" para
ver de un vistazo qué falta facturar o qué falta el comprobante de pago.

## 1. Cómo usar el sistema (guía rápida)

1. **Eventos**: lista todos los eventos cargados. Se puede buscar por nombre,
   director, razón social o integrante, y filtrar por categoría/empresa.
2. **Personal**: listado maestro de todo el personal de la productora (nombre,
   rol habitual, teléfono, email). Se carga una sola vez acá y después, al
   crear o editar un evento, se elige a cada persona de esta lista y se le
   asigna el rol que ocupa en ese evento puntual.
3. **Nuevo evento**: botón dorado arriba a la derecha. Completa los datos del
   evento por secciones (Producción, Integrantes, Dirección, Facturación,
   Observaciones) y guardá. En **Facturación** se elige la distribución entre
   las dos razones sociales: **M1** (factura con IVA), **M2** (efectivo, sin
   IVA) o **M1 + M2** (mixto: una parte por cada una). El "Importe + IVA" y
   el "Total facturable" se calculan solos según lo elegido. Las facturas y
   comprobantes **no se cargan acá** — se suben como archivo desde el detalle
   del evento, una vez creado.
4. **Click en un evento**: abre el detalle, desde ahí se puede **Editar** o
   **Borrar**.
5. **Estado administrativo y archivos (en el detalle)**: una vez creado el
   evento, se pueden subir las facturas (hasta la cantidad indicada en "Cant.
   facturas") y los comprobantes de pago como archivos PDF/imagen. Los
   marcadores "Facturado", "Comprobante de pago" y "Facturado total" se
   activan solos al subir los archivos correspondientes y se pueden
   sobreescribir manualmente. (Más adelante esto va a quedar restringido al
   rol de Administración — ver sección 7).
6. **Pendientes**: muestra dos tablas — eventos sin facturar y eventos
   facturados sin comprobante de pago cargado. Sirve como recordatorio para
   administración.
7. **Exportar / Importar (íconos de descarga/subida en el header)**: genera o
   carga un archivo JSON con todos los eventos. Útil como respaldo manual.

La app es **multiusuario**: si se configura Supabase (paso 3), todas las
personas que entren a la URL ven y editan los mismos eventos en tiempo real,
desde cualquier computadora o celular.

## 2. Requisitos para desarrollo local

- Node.js 18 o superior
- `npm install`
- `npm run dev` → abre en `http://localhost:5173`

Sin configurar nada más, la app funciona en **modo local**: los datos se
guardan en el navegador (localStorage). Es útil para probar, pero **no se
comparten entre usuarios ni dispositivos**. Para uso real de la empresa, seguí
el paso 3.

## 3. Configurar la base de datos compartida (Supabase, gratis)

Esto hace que todos los empleados vean y carguen los mismos eventos, desde
cualquier lugar.

1. Crear una cuenta gratis en [supabase.com](https://supabase.com) y un
   "New project" (elegir cualquier nombre, región y una contraseña de base de
   datos — guardala, no la vas a necesitar para esta app pero Supabase la
   pide).
2. Ir a **SQL Editor** → **New query**, pegar el contenido completo del
   archivo [`supabase/schema.sql`](supabase/schema.sql) de este repositorio y
   darle **Run**. Esto crea las tablas `eventos` y `personas`, agrega las
   columnas nuevas (`distribucion`, `monto_m1`, `monto_m2`, `facturas`,
   `comprobantes`) si todavía no estaban, y crea el bucket de Storage
   `eventos-archivos` que se usa para guardar las facturas y los comprobantes
   de pago de cada evento. Si ya habías corrido una versión anterior del
   script, podés volver a correrlo: usa `if not exists` / `on conflict` y no
   duplica nada.
3. Ir a **Project Settings → API**. Copiar:
   - **Project URL** → va en `VITE_SUPABASE_URL`
   - **anon public key** → va en `VITE_SUPABASE_ANON_KEY`
4. En desarrollo local: copiar `.env.example` a `.env` y completar esos dos
   valores. Reiniciar `npm run dev`.
5. En producción (Vercel): cargar esas mismas dos variables en
   **Project Settings → Environment Variables** (ver paso 4) y volver a
   desplegar.

Cuando estas variables están configuradas, el cartel amarillo de "Modo local"
desaparece y los datos quedan en la nube, compartidos por todo el equipo, con
actualización en tiempo real (si una persona carga un evento, las demás lo ven
aparecer sin recargar la página).

> **Nota de seguridad**: la política de la base de datos creada por
> `schema.sql` permite leer y escribir a cualquiera que tenga la URL de la
> app (pensado para uso interno, sin pantalla de login). No compartas la URL
> de la app públicamente. Si en el futuro se necesita login por usuario,
> se puede agregar Supabase Auth y restringir la política por `auth.uid()`.

## 4. Deploy a Vercel

Con [Vercel CLI](https://vercel.com/cli) ya instalado y logueado:

```bash
npm run build      # verifica que compile sin errores
vercel             # primer deploy (sigue las preguntas)
vercel --prod      # deploy a producción
```

Después del primer deploy, configurar las variables de entorno
(`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) en
**Vercel → Project → Settings → Environment Variables**, y volver a correr
`vercel --prod` para que el build las tome.

## 5. Estructura del proyecto

```
src/
  PanelEventos.jsx     -> toda la interfaz (lista, personal, formulario, detalle, pendientes)
  lib/
    supabaseClient.js  -> conexión a Supabase (o null si no está configurado)
    eventosApi.js       -> leer/guardar/borrar eventos (Supabase o localStorage)
    personasApi.js      -> leer/guardar/borrar personal (Supabase o localStorage)
    storageApi.js       -> subir/descargar/borrar facturas y comprobantes (Supabase Storage)
supabase/
  schema.sql            -> script para crear las tablas "eventos", "personas" y el bucket de archivos
```

## 6. Categorías y listas predefinidas

Editables directamente en `src/PanelEventos.jsx` (constantes al inicio del
archivo):

- **Categoría del evento**: Videoclip, Publicidad, Película, Serie
- **Estudio**: 1, 2, 3
- **Tipo de producción**: Virtual Production, Back Projecting
- **Trackeo**: Con trackeo, Sin trackeo
- **Empresas (facturación)**: MG M1, MG M2
- **Moneda**: ARS, USD

## 7. Roles de usuario (futuro)

Todavía **no hay sistema de login ni de usuarios** — toda la app es de acceso
libre con la URL. Cuando se implemente, está pensado que existan tres
perfiles:

- **Administración**: además de ver todos los eventos, puede marcar un
  evento como "Facturado", marcar que se cobró, y subir facturas y
  comprobantes de pago.
- **Creador de eventos**: puede ver toda la información de los eventos
  (crear, editar, consultar), pero **no** puede marcar "Facturado", **no**
  puede subir comprobantes de pago ni facturas.
- **Admin (super-admin)**: control total — agregar, eliminar y modificar
  usuarios y sus permisos, además de todas las capacidades de los otros dos
  perfiles.

Cuando se implemente login, lo más simple es usar **Supabase Auth** +
una tabla `usuarios` (o una columna `rol` en una tabla de perfiles) y
restringir las políticas RLS de `eventos`/`personas` según `auth.uid()` y el
rol de cada usuario. La UI ya está organizada para que los controles de
"Facturado / Comprobante de pago / Facturado total" (en el detalle del
evento) puedan ocultarse o deshabilitarse fácilmente según el rol.

## Asistente de consultas (IA) — opcional

La app incluye un asistente (ícono ✨ en la barra superior) para consultar los
eventos en lenguaje natural: *"¿cuánto facturamos en USD este mes?"*, *"eventos
confirmados sin facturar"*, *"pagos vencidos"*, etc.

**Cómo funciona:** la pregunta se envía a una función serverless
(`api/asistente.js`) que le pide a Claude (modelo Haiku, económico) que la
traduzca a un **filtro estructurado**. Ese filtro se aplica a los eventos
**localmente en el navegador** — los montos y razones sociales nunca se envían a
la IA. El gasto de tokens por consulta es mínimo.

**Activación:** el asistente queda inactivo hasta cargar la API key. En Vercel:

1. Crear una cuenta en <https://console.anthropic.com> y generar una API key.
   Conviene ponerle un **límite de gasto mensual** para no llevarse sorpresas.
2. En el proyecto de Vercel → *Settings → Environment Variables*, agregar:
   - `ANTHROPIC_API_KEY` = la key (⚠️ **sin** el prefijo `VITE_`, así queda solo
     en el servidor y nunca se expone en el navegador).
   - (opcional) `ASISTENTE_MODEL` para cambiar el modelo (default:
     `claude-haiku-4-5-20251001`).
3. Redeploy. Listo.

Mientras no haya key cargada, el botón funciona pero avisa que el asistente no
está activado.
