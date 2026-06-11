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
2. **Nuevo evento**: botón celeste arriba a la derecha. Completa los datos del
   evento por secciones (Producción, Integrantes, Dirección, Facturación,
   Observaciones) y guardá.
3. **Click en un evento**: abre el detalle, desde ahí se puede **Editar** o
   **Borrar**.
4. **Pendientes**: muestra dos tablas — eventos sin facturar y eventos
   facturados sin comprobante de pago cargado. Sirve como recordatorio para
   administración.
5. **Exportar / Importar (íconos de descarga/subida en el header)**: genera o
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
   darle **Run**. Esto crea la tabla `eventos` con todos los campos.
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
  PanelEventos.jsx     -> toda la interfaz (lista, formulario, detalle, pendientes)
  lib/
    supabaseClient.js  -> conexión a Supabase (o null si no está configurado)
    eventosApi.js       -> leer/guardar/borrar eventos (Supabase o localStorage)
supabase/
  schema.sql            -> script para crear la tabla "eventos" en Supabase
```

## 6. Categorías y listas predefinidas

Editables directamente en `src/PanelEventos.jsx` (constantes al inicio del
archivo):

- **Categoría del evento**: Videoclip, Publicidad, Película, Serie
- **Estudio**: 1, 2, 3
- **Tipo de producción**: Virtual Production, Back Projecting
- **Trackeo**: Con trackeo, Sin trackeo
- **Empresas (facturación)**: Productora MG, Anzur, Distrisur, Orgaz
- **Moneda**: ARS, USD
