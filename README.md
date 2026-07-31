# Panel de Eventos

Sistema interno de gestión de eventos de producción (videoclips, series,
largometrajes, publicidades, demos/eventos) para **Cacodelphia**. Permite
cargar y consultar cada evento con toda su información: categoría, modalidad
de rodaje, tipo de producción, trackeo, estudio(s), partes/fases del proyecto
con sus fechas, equipamiento, integrantes internos y roles, equipo técnico
externo, cliente, datos de facturación y cobros, contacto del director,
mensajería interna y observaciones. Incluye una pantalla de **Resumen**
(dashboard financiero y de ocupación mensual), un panel de **Pendientes**
(facturación, comprobantes y pagos vencidos), gestión de **Clientes** (con
cuenta corriente), gestión de **Personal** (con categorías y disponibilidad),
un sistema de **login con roles y permisos**, y un **asistente de IA** para
consultar los eventos en lenguaje natural.

La app es **multiusuario**: si se configura Supabase (paso 3), todas las
personas que entren a la URL ven y editan los mismos datos en tiempo real,
desde cualquier computadora o celular. Sin Supabase configurado, funciona en
**modo local** (los datos quedan solo en el navegador, vía `localStorage`).

## 1. Pantallas

Toda la app requiere **iniciar sesión** (ver sección 6). La navegación es por
pestañas en el header:

- **Resumen**: pantalla de inicio. Selector de mes, calendario mensual con
  los eventos coloreados por fase de producción, tarjetas de estadísticas
  (proyectos del mes, ocupación por estudio), bloque financiero (total
  facturado/pendiente/cobrado del mes en ARS y USD, gráfico de los últimos 6
  meses, distribución por estudio), categorías del mes y ranking de
  integrantes (por cantidad de proyectos, mes actual o histórico).
- **Eventos**: listado con pestañas Próximos / Finalizados / Todos, búsqueda
  por nombre/director/razón social/integrante, filtros por categoría,
  modalidad de rodaje y empresa, badges de estado (Borrador, Listo para
  facturar, Facturado, Sin comprobante, Cobrado, Cobro parcial, Pago
  vencido) y de mensajes sin leer. Desde acá se exportan reportes (ver
  sección 7) y se crean eventos nuevos.
- **Nuevo evento / Editar**: formulario por secciones — Producción, Partes
  del proyecto (fases y fechas), Integrantes y roles, Equipo técnico
  externo, Dirección, Facturación, Observaciones.
- **Detalle de evento**: cada bloque (Observaciones/mensajería,
  Producción, Facturación, Cobros y pagos, Estado administrativo, Archivos,
  Equipo, Dirección, Equipo técnico externo, Partes del proyecto) se edita
  de forma independiente sin pasar por el formulario completo. Incluye
  banner de estado (borrador/confirmado), exportar a PDF, duplicar evento,
  editar (formulario completo) y borrar.
- **Personal**: sub-pestañas **Listado** (personas agrupadas por categoría,
  con sus roles habituales) y **Disponibilidad** (consulta quién está libre
  u ocupado en una fecha determinada, cruzando eventos y fases). Incluye
  gestión de categorías de personal y de **sectores** (áreas de la empresa —
  Cacodelphia, LED, Cine — un nivel arriba de la categoría: cada persona
  pertenece a un solo sector, pero puede tener cualquier categoría dentro de
  ese sector).
- **Asistencia**: grilla mensual (personas × días del mes) para marcar
  presente / ausente / franco / medio día de cada persona, con una
  observación libre por día (ej. en qué tarea o área está). Filtrable por
  sector. Solo quien tiene permiso de editar personal puede marcar; el resto
  la ve en solo lectura.
- **Clientes**: alta, edición y baja de clientes (las productoras/empresas
  que contratan a Cacodelphia), con cuenta corriente por moneda.
- **Pendientes**: tres tablas — pagos vencidos, eventos sin facturar y
  eventos facturados sin comprobante de pago cargado.
- **LED**: catálogo de módulos de pantalla LED y equipos de video (senders,
  escaladores, media servers, procesadores) para venta y alquiler, con
  alta/edición/borrado y buscador. Pensado para un futuro asistente de
  recomendación (todavía en diseño) que arme la configuración de pantalla
  según los requerimientos del cliente. Acceso exclusivo del rol **LED**
  (que no ve ninguna otra pantalla de la app) y de **admin**; el resto de
  los roles con permiso `ledVer` (ej. producción) lo ven en solo lectura.
- **Usuarios**: administración de cuentas, solo visible para el rol admin.
- **Asistente** (ícono ✨) y **Notificaciones** (ícono campana): overlays
  accesibles desde el header.

## 2. Cómo usar el sistema (guía rápida)

1. **Iniciar sesión** con tu usuario y contraseña.
2. **Nuevo evento** (botón dorado, en Eventos): completá los datos por
   secciones y guardá. En **Facturación** se elige la distribución entre las
   dos razones sociales: **M1** (factura con IVA 21%), **M2** (efectivo, sin
   IVA) o **M1 + M2** (mixto). Si hay más de una factura (`Cant. facturas`),
   se puede desglosar el monto factura por factura. Los totales se calculan
   solos según lo elegido.
3. **Click en un evento**: abre el Detalle, desde ahí se edita cada bloque
   por separado — incluida la Facturación, donde se puede elegir el cliente
   real de la lista (no solo escribir la razón social a mano) — se sube
   documentación, se registran cobros, se duplica o se borra.
4. **Archivos**: las facturas (hasta la cantidad indicada en "Cant.
   facturas") y los comprobantes de pago se suben desde el Detalle, como
   PDF o imagen. Los marcadores "Facturado", "Comprobante de pago" y
   "Facturado total" se activan solos al subir los archivos
   correspondientes (y se pueden sobreescribir manualmente con el permiso
   adecuado).
5. **Cobros**: se pueden registrar pagos parciales por evento; el estado de
   cobro (sin cobrar / parcial / cobrado) se calcula comparando lo cobrado
   contra el total facturable. Si la forma de pago indica un plazo (ej. "30
   días"), la app calcula el vencimiento y avisa si está vencido o próximo
   a vencer.
6. **Personal y Clientes** se cargan una sola vez; después se eligen desde
   listas al crear/editar un evento (asignándoles rol y, en el caso del
   personal, las fases en las que participa).
7. **Pendientes**: recordatorio rápido de qué falta facturar, cobrar o
   documentar.
8. **Exportar** (ver sección 7): reportes HTML imprimibles, desde Eventos
   (varios eventos) o desde el Detalle (uno solo, con secciones a elección).

## 3. Modelo de datos

- **`eventos`**: fecha, nombre, categoría, uno o más estudios, modalidad de
  rodaje, tipo de producción, trackeo, equipamiento, integrantes internos
  (persona + rol + fases en las que participa), equipo técnico externo,
  director, cliente vinculado, datos de facturación (razón social/es, CUIT,
  moneda, distribución M1/M2/mixto, montos, tipo de cambio, desglose por
  factura, forma y medio de pago), archivos de facturas/comprobantes,
  partes/fases del proyecto (con sus fechas y estudios), mensajería interna,
  pagos registrados, flags de estado (confirmado, facturado, comprobante de
  pago, facturado total) con sus timestamps, y observaciones.
- **`personas`**: nombre, rol(es) habitual(es), teléfono, email,
  categoría(s), activo/inactivo.
- **`personas_categorias`**: categorías del personal (ej. Cámara,
  Iluminación, Producción, Arte).
- **`clientes`**: razón social, CUIT, teléfono, email, domicilio, contacto
  de dirección y equipo técnico externo por defecto (autocompletan el
  formulario de evento), contactos de reclamo, notas, activo/inactivo.
- **`usuarios`**: nombre, contraseña (hasheada), rol, activo/inactivo.

Todas las tablas soportan tiempo real (Supabase Realtime) cuando la app está
conectada a Supabase.

## 4. Facturación en detalle

- **Distribución**: M1 (factura con IVA 21%), M2 (efectivo sin IVA) o
  MIXTO (una parte de cada una). El campo "empresa" se autogenera según lo
  elegido.
- **Multi-factura**: si `Cant. facturas` es mayor a 1, se puede desglosar
  el monto individualmente por cada factura; los totales del evento se
  recalculan como la suma de ese desglose.
- **Tipo de cambio**: en eventos en USD se puede cargar un tipo de cambio
  manual, usado para mostrar equivalentes en ARS en reportes y en Resumen.
- **Workflow de estado**: Borrador → Confirmado ("Confirmar listo para
  facturar") → Facturado → Comprobante de pago → Facturado total. Cada
  paso queda con su timestamp, que alimenta las métricas de demora del
  asistente de IA.
- **Auto-marcado por archivos**: subir la última factura esperada marca
  automáticamente el evento como facturado (y facturado total); subir un
  comprobante marca "comprobante de pago". Borrar todos los archivos de un
  tipo desmarca el estado correspondiente. Todo es sobreescribible
  manualmente con el permiso adecuado.
- **Cobros y vencimientos**: se registran pagos parciales por evento (con
  fecha, monto, medio y nota); el estado de cobro se deriva comparando lo
  cobrado contra el total facturable. Si la forma de pago define un plazo,
  se calcula la fecha de vencimiento y se muestran alertas cuando está
  vencido o vence pronto.
- **Cronograma de pagos/facturación**: en Facturación se puede cargar una
  lista de cuotas o hitos (ej. "Anticipo", "Saldo"), cada uno con días desde
  la fecha del evento (o una fecha fija) y, opcionalmente, un monto. El
  Detalle muestra cada cuota con su fecha calculada y la marca si está
  vencida o vence pronto — útil para acordar de antemano, por ejemplo, un
  pago parcial al momento del evento y el resto a 30 días.

## 5. Clientes

Representan a las productoras/empresas que contratan a Cacodelphia (no es lo
mismo que el personal interno de "Personal"). Al elegir un cliente en el
formulario de evento se autocompletan razón social, CUIT, director y equipo
técnico externo por defecto; si se escribe un cliente nuevo a mano, queda
guardado para la próxima vez. Cada cliente tiene una **cuenta corriente**
por moneda (total facturado, cobrado, saldo pendiente o excedente,
pendiente de facturación), calculada sumando todos sus eventos. Si un
cliente tiene excedente en un proyecto y deuda en otro, ese excedente se
puede **imputar** al saldo pendiente del otro proyecto.

## 6. Login, usuarios y roles

El acceso a toda la app requiere iniciar sesión; no hay pantallas visibles
sin usuario logueado. La sesión se guarda en `localStorage` del navegador.

Al arrancar por primera vez (tabla `usuarios` vacía), se crean
automáticamente los usuarios semilla:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin` | admin |
| `nacho` | `nacho` | contabilidad |
| `pablo` | `pablo` | producción |
| `prueba` | `prueba` | espectador |

> **Cambiá estas contraseñas** (o borrá los usuarios que no necesites) desde
> la pantalla **Usuarios** apenas tengas la app en uso real — quedan
> creadas automáticamente solo para poder entrar la primera vez.

Roles y permisos (gestionables en **Usuarios**, visible solo para admin):

- **admin**: acceso total, incluida la gestión de usuarios y el borrado de
  categorías/personal/clientes.
- **contabilidad**: no crea ni confirma eventos, pero sí los edita/borra,
  gestiona facturación, sube archivos, y administra clientes y personal.
- **producción**: crea, edita y confirma eventos, y también puede facturar
  (editar Facturación, registrar cobros, marcar Facturado/Comprobante/
  Facturado total), pero no administra archivos (puede verlos, no
  subirlos/borrarlos). Ve el módulo LED en solo lectura.
- **espectador**: solo lectura.
- **led**: caso especial — solo ve y edita el módulo **LED**; ninguna otra
  pantalla de la app (Eventos, Personal, Clientes, etc.) le aparece, ni
  siquiera el Asistente o las Notificaciones.
- **asistencia**: caso especial — solo ve y edita **Personal** y
  **Asistencia** (incluida la gestión de categorías y sectores); ninguna
  otra pantalla le aparece.

Los permisos son granulares (crear/editar/borrar/confirmar/facturar
eventos, ver/gestionar archivos, gestionar personal y categorías, gestionar
clientes, importar/exportar, liberar personal de conflictos, gestionar
usuarios, ver/editar el módulo LED) y se aplican por control individual en
cada pantalla, no ocultando pestañas completas — excepto el rol `led`, que
sí queda encerrado únicamente en su módulo.

La pantalla **Usuarios** permite crear cuentas, cambiar rol o contraseña,
activar/desactivar y borrar (con protección para no auto-borrarte ni
auto-desactivarte). El admin puede ver la contraseña en texto plano de
cualquier usuario desde ahí.

**Notificaciones** (ícono campana): avisan a contabilidad/admin de eventos
recién confirmados sin facturar, y a producción de eventos recién
facturados.

> **Nota de seguridad**: este es un login propio sobre una tabla de la app
> (no usa Supabase Auth), pensado para uso interno del equipo. La política
> de la base de datos permite lectura/escritura a cualquiera que tenga la
> URL y la key anon — no la compartas públicamente.

## 7. Exportar reportes

Ya no existe un botón de "importar" JSON. Lo que hay para exportar:

- **Descargar eventos** (ícono en el header de Eventos): descarga un
  respaldo crudo en JSON con todos los eventos tal cual están en memoria
  (`eventos-{fecha}.json`) — pensado como backup manual, no para imprimir.
- **Descargar eventos** (en la lista de Eventos, junto a "Nuevo evento"):
  filtra (todos/próximos/finalizados), permite elegir eventos puntuales por
  checkbox, y genera un **reporte HTML imprimible** con todos los datos de
  cada evento seleccionado (pensado para imprimir o guardar como PDF desde
  el navegador).
- **Exportar PDF** (en Detalle de un evento): genera el mismo tipo de
  reporte imprimible para un solo evento, eligiendo qué secciones incluir.

## 8. Requisitos para desarrollo local

- Node.js 18 o superior
- `npm install`
- `npm run dev` → abre en `http://localhost:5173`

Sin configurar nada más, la app funciona en **modo local**: los datos se
guardan en el navegador (`localStorage`). Es útil para probar, pero **no se
comparten entre usuarios ni dispositivos**. Para uso real de la empresa,
seguí el paso 9.

## 9. Configurar la base de datos compartida (Supabase, gratis)

Esto hace que todo el equipo vea y cargue los mismos datos, desde cualquier
lugar, en tiempo real.

1. Crear una cuenta gratis en [supabase.com](https://supabase.com) y un
   "New project" (elegir cualquier nombre, región y una contraseña de base
   de datos — guardala, no la vas a necesitar para esta app pero Supabase
   la pide).
2. Ir a **SQL Editor** → **New query**, pegar el contenido completo del
   archivo [`supabase/schema.sql`](supabase/schema.sql) de este repositorio
   y darle **Run**. Esto crea las tablas (`eventos`, `personas`,
   `personas_categorias`, `clientes`, `usuarios`) y el bucket de Storage
   `eventos-archivos` usado para las facturas y comprobantes de pago. Si ya
   habías corrido una versión anterior del script, se puede volver a
   correr: usa `if not exists` / `on conflict` y no duplica nada.
3. Ir a **Project Settings → API**. Copiar:
   - **Project URL** → va en `VITE_SUPABASE_URL`
   - **anon public key** → va en `VITE_SUPABASE_ANON_KEY`
4. En desarrollo local: copiar `.env.example` a `.env` y completar esos dos
   valores. Reiniciar `npm run dev`.
5. En producción (Vercel): cargar esas mismas dos variables en
   **Project Settings → Environment Variables** y volver a desplegar.

Cuando estas variables están configuradas, el cartel ámbar de "Modo local"
desaparece y los datos quedan en la nube, compartidos por todo el equipo,
con actualización en tiempo real (si una persona carga algo, las demás lo
ven aparecer sin recargar la página).

## 10. Deploy a Vercel

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

## 11. Estructura del proyecto

```
src/
  PanelEventos.jsx        -> toda la interfaz (Resumen, Eventos, formulario,
                              detalle, Personal, Asistencia, Clientes,
                              Pendientes, LED, Usuarios, login, asistente,
                              notificaciones)
  lib/
    supabaseClient.js     -> conexión a Supabase (o null si no está configurado)
    eventosApi.js         -> leer/guardar/borrar eventos (Supabase o localStorage)
    personasApi.js        -> leer/guardar/borrar personal
    categoriasPersonalApi.js -> categorías de personal
    sectoresPersonalApi.js -> sectores del personal (Cacodelphia/LED/Cine…)
    asistenciasApi.js     -> marcas de asistencia (presente/ausente/franco/medio día)
    clientesApi.js        -> leer/guardar/borrar clientes
    usuariosApi.js        -> login, sesión, usuarios, roles y permisos
    storageApi.js         -> subir/descargar/borrar facturas y comprobantes
    asistenteApi.js       -> llamada al endpoint del asistente de IA
    ledModulosApi.js      -> catálogo de módulos de pantalla LED
    ledEquiposApi.js      -> catálogo de senders/escaladores/media servers/procesadores
    ledSeedData.js         -> datos de fábrica del catálogo LED (desde Excel)
api/
  asistente.js             -> función serverless: traduce la pregunta a un filtro (Claude)
supabase/
  schema.sql               -> tablas, columnas, RLS y bucket de archivos
```

## 12. Categorías y listas predefinidas

Editables directamente en `src/PanelEventos.jsx` (constantes al inicio del
archivo):

- **Categoría del evento**: Video Clip, Rodaje Serie, Rodaje Largo, Evento /
  Demo, Publicidad, Streaming
- **Estudio**: 1, 2, 3 (un evento puede ocupar más de uno)
- **Modalidad de rodaje**: En estudio, Rodaje externo, Servicio virtual,
  Rental (rodaje fuera de los estudios propios, alquilando equipamiento a
  otra empresa para que haga la producción)
- **Tipo de producción**: Virtual Production, Back Projecting
- **Trackeo**: Con trackeo, Sin trackeo
- **Partes del proyecto**: Armado, Armado + Prelight, Prelighting, Rodaje,
  Desarme
- **Roles de equipo técnico externo**: Director/a, Director/a de
  Fotografía, Director/a de Arte, Productor/a, Jefe/a de Producción
- **Distribución de facturación**: M1, M2, M1 + M2 (mixto)
- **Moneda**: ARS, USD

## 13. Asistente de consultas (IA) — opcional

La app incluye un asistente (ícono ✨ en la barra superior) para consultar
los datos en lenguaje natural: *"¿cuánto facturamos en USD este mes?"*,
*"eventos confirmados sin facturar"*, *"pagos vencidos"*, *"días trabajados
por Fulano este año"*, etc.

**Cómo funciona:** la pregunta (sin ningún dato de eventos) se envía a una
función serverless (`api/asistente.js`) que le pide a Claude (modelo Haiku,
económico) que la traduzca a un **filtro estructurado** (intención,
agrupamiento, rango de fechas, categoría, estudio, moneda, estado, persona,
texto libre, etc.). Ese filtro se aplica a los eventos **localmente en el
navegador** — los montos, clientes y razones sociales nunca se envían a la
IA. El gasto de tokens por consulta es mínimo.

Soporta: totales de facturación (ARS/USD), conteos, listados, desglose por
proyecto/persona/categoría/estudio/modalidad/mes/empresa, días trabajados
por persona, y demoras de facturación o de comprobante de pago (medidas
entre los timestamps de confirmado/facturado/comprobante de pago).

> Si cambiás las categorías, modalidades, estudios o empresas en
> `PanelEventos.jsx`, actualizá también las listas hardcodeadas en
> `api/asistente.js` para que el asistente las reconozca.

**Activación:** el asistente queda inactivo hasta cargar la API key. En
Vercel:

1. Crear una cuenta en <https://console.anthropic.com> y generar una API
   key. Conviene ponerle un **límite de gasto mensual** para no llevarse
   sorpresas.
2. En el proyecto de Vercel → *Settings → Environment Variables*, agregar:
   - `ANTHROPIC_API_KEY` = la key (⚠️ **sin** el prefijo `VITE_`, así queda
     solo en el servidor y nunca se expone en el navegador).
   - (opcional) `ASISTENTE_MODEL` para cambiar el modelo (default:
     `claude-haiku-4-5-20251001`).
3. Redeploy. Listo.

Mientras no haya key cargada, el botón funciona pero avisa que el asistente
no está activado.

## 14. Roles de usuario — próximos pasos

El sistema de login y permisos ya está en producción (sección 6), con 4
roles fijos. Si en el futuro se necesita login más robusto (recuperación de
contraseña, SSO, auditoría), la migración natural es a **Supabase Auth**
manteniendo la tabla `usuarios` para el rol y los permisos, restringiendo
las políticas RLS por `auth.uid()` en vez de la key `anon` abierta actual.
