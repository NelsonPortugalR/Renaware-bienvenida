# Bienvenida por WhatsApp · Equipo Arequipa

Todos los mensajes de WhatsApp del equipo, en dos grupos: **Asesores** y
**Clientes**, cada uno con sus pestañas de Bienvenida y Seguimiento.

## Asesores

- **Bienvenida** (días 1 a 5): un mini entrenamiento de 5 mensajes, uno por
  día, con sus archivos. La meta: que aprenda lo básico y venga a capacitarse
  a la oficina.
- **Seguimiento** (del día 6 hasta su fecha límite): los mensajes del Nivel 0
  según las clases que lleva y los días que le quedan. Antes vivían en Nivel
  Cero; ahora Nivel Cero solo toma asistencia.

5 clases dentro de su plazo de 30 días = botella de acero, el adelanto del
Empiece Ya.

## Quién entra a la secuencia

No todo el que se afilia va a hacer el negocio. Por eso cada persona tiene un
check: **✓ entra** o **✗ no entra**. Quitar a alguien no lo borra: solo deja de
salir en «Para hoy».

- **Asesores**: hay que decidir. Cada asesor nuevo sale arriba de «Para hoy»
  (en Bienvenida o en Seguimiento, según su día) con ✓ / ✗ de un toque, y la
  pestaña lo cuenta. Mientras está **por marcar** no se le propone ningún
  mensaje. Lo marcado hoy se puede deshacer (vuelve a por marcar); «Ver y
  cambiar» abre la lista de todos (por marcar, entran, no entran), con
  buscador, ✓ / ✗ en cada fila y «Que entren los N» para marcar de una vez a
  todos los que faltan (con confirmación y deshacer). También se cambia desde
  su ficha. Quien no entra sigue en Nivel Cero con sus clases y sale al
  buscarlo.
- **Clientes**: todos entran, salvo los que se quiten. Desde su ficha o desde
  la lista «Ver y cambiar» (todos / no entran, buscador por nombre o celular).
  Quien no entra no sale en «Para hoy» ni en los avisados; en su ficha se
  puede seguir anotando el cambio de filtro o mandar algo a mano. El contador
  de clientes del inicio de la plataforma (`hoy_items`) tampoco lo cuenta.
- Las marcas van a `wa_secuencia` (`tipo` asesor o cliente, `ref` = id de
  `n0_inscritos` o de `clientes`, `entra` true / false / null). Solo se agregan
  filas: la vigente es la última, y cambiar o deshacer es otra fila.

## Clientes

Los mensajes a quienes compraron, con los datos que carga **Pedidos**
(`crm_pedidos`, cada período) y una sola fuente de verdad: la función
`crm_acciones()` de Supabase, que leen Pedidos y esta página.

- **Bienvenida** (por pedido entregado): *Al recibir* (video de lavado y
  recomendaciones según lo que compró: ollas, sartenes, filtro, cocina, olla a
  presión, purificador), *Una semana · Nutri Sensor* y *Un mes · brillo y Rena
  Lite* si compró ollas, y *Un mes antes de terminar sus cuotas* si compró al
  crédito. Cada paso tiene su tarjeta con archivos para mandar y su texto.
- **Seguimiento** (por cliente y filtro): cambio de **pre-filtro** (12 meses),
  **filtro principal / elemento desechable** (48 meses) y **filtro de aire**
  (18 meses). El ciclo corre desde la entrega del sistema o la compra del
  último repuesto de ese filtro, lo que sea más reciente; se avisa un mes
  antes. «Cambio hecho» (con fecha) reinicia el ciclo; «Ya no aplica» lo
  cierra; un aviso lo deja en *Avisados, esperando el cambio* 30 días.
- **Ficha del cliente**: celular, trato, lo que compró, sus mensajes de
  bienvenida y sus filtros, otro mensaje a mano y todo lo anotado. Enlace
  `#c=<cliente_id>` (lo usa Pedidos) y `#v=clientes|filtros`.
- Lo anotado va a `crm_seguimiento` (`modo`: whatsapp, aviso, omitido,
  cambio, noaplica) por `wa_cl_envio_registrar` / `wa_cl_envio_anular`; el
  trato por cliente en `clientes.trato` (`wa_cl_trato_guardar`); los textos
  editados en `n0_plantillas` con claves `cl_*`; los archivos en
  `wa_bv_adjuntos` con `dia` 11 a 17. Todo entra por `wa_cl_datos`.

## Qué hace

- **Para hoy**: cada pestaña dice a quién le toca qué mensaje hoy, y la pestaña
  muestra cuántos son (más los asesores por marcar).
- **Bienvenida**: «Preparar» carga sus datos (nombre, celular, fecha de inicio
  y código, si ya es un código real de Rena Ware) y lleva a su día. Cada
  tarjeta dice qué día enviarla, los archivos que van y el texto listo, con
  *negritas* de WhatsApp. Al abrir el chat con el botón de WhatsApp queda
  anotado; si se mandó de otra forma, «Ya lo envié». Se puede deshacer.
- **Archivos por día**: subir, cambiar, describir, ordenar y quitar. En el
  celular, «Compartir» abre el menú para mandarlo directo a WhatsApp.
- **Seguimiento**: el mensaje que toca, agrupado por tipo, con WhatsApp (abre
  el chat con el texto y lo anota), «Le avisé en persona» u «Omitir». En la
  ficha de cada asesor: sus clases, qué le toca o qué le tocará si no viene,
  otro mensaje a mano, el trato (tú o usted) y todo lo que se le mandó.
- **Editar mensajes**: cada mensaje de seguimiento tiene versión de tú y de
  usted, con marcadores y vista previa. Se puede apagar uno o volver al
  original.
- **Horario de capacitaciones** (arriba, vale para las dos pestañas) y
  **Promoción y oficina** (precio del Gourmet, promoción de ejemplo, inicial,
  regalo y comisión), editables en la página.
- **Desde Nivel Cero**: `#a=<id>` abre su ficha (o su bienvenida si va en sus
  días 1 a 5 y entra a la secuencia; si falta marcarlo, su ficha para decidir)
  y `#a=<id>&paso=recoger` el aviso para que recoja su botella.
  Nivel Cero manda además un código de traspaso (`#traspaso=<código>&a=<id>`)
  para entrar sin escribir la clave.

## Reglas que respeta

- **Plazo y clases**: los de Nivel Cero. El plazo va del inicio a 30 días
  después, ambos incluidos.
- **Secuencia**: solo a los asesores marcados con ✓ se les propone algo; a los
  clientes, a todos menos los marcados con ✗.
- **Bienvenida**: el día N va en inicio + N − 1. «Para hoy» propone el primer
  día que falta mandar, si ya llegó su fecha, mientras está en sus días 1 a 5.
  Si se envía tarde, el texto propone capacitaciones desde hoy, con 2 horas de
  margen.
- **Seguimiento**, desde el día 6:

  | Mensaje | Cuándo |
  |---|---|
  | Primera clase · Segunda clase · Le faltan 2 · Le falta 1 | después de su 1.ª, 2.ª, 3.ª y 4.ª clase |
  | Ganó la botella (o *y ya tiene su Empiece Ya*) | al completar sus 5 clases, hasta 10 días después |
  | Va una semana | a los 7 días de su inicio, si todavía no vino a ninguna clase |
  | Quedan 15 días · Quedan 7 días | a 15 y 7 días de su fecha límite, si no vino en la última semana |
  | Cumplió sus 30 días | al terminar sin las 5 clases, hasta 10 días después |
  | Recoger la botella | a mano, desde su ficha o desde Botellas en Nivel Cero |

  Se propone solo el más reciente: si uno no se mandó y ya le tocó otro, el
  viejo no aparece; si el más reciente está apagado, ese día no va ninguno. Lo
  ya mandado no se repite, y la felicitación por la botella es una sola (con o
  sin Empiece Ya).
- **Marcadores**: `{nombre}` `{limite}` `{dias}` `{avance}` `{proxima}`
  `{horarios}` `{clases}` `{faltan}`. `{proxima}` es la próxima clase del
  horario, con el mismo margen de 2 horas.
- **Trato**: el de su ficha o, si no se eligió, el de por defecto. Los 5 de
  bienvenida van de tú.
- **Código**: solo se toma si `es_codigo_asesor_real()` lo reconoce. Si falta,
  el día 1 avisa antes de enviar.

## Cómo está hecho

Un solo `index.html`, sin librerías ni build. Llama a Supabase
`kiexpdaaoegbtesqmaff` por RPC con la clave publicable; los datos los protege
la sesión de admin (`admin_login`, la misma clave del panel). También acepta el
traspaso desde la plataforma o desde Nivel Cero (`#traspaso=<código>`): lo
canjea, guarda la sesión y recarga conservando el resto del enlace.

- Tablas propias: `wa_bv_ajustes` (un registro `vigente` con los datos de la
  promoción) y `wa_bv_adjuntos` (archivos por día). RLS activo, sin acceso
  directo.
- Los envíos van a `n0_mensajes` (bienvenida como `bv1` … `bv5`; deshacer =
  `anulado`) y los textos editados a `n0_plantillas` (vacío = el original, que
  vive en `index.html`), junto a los datos de Nivel Cero.
- Funciones con sesión: `wa_bv_datos` (archivos, promoción, `n0_config`, los
  nuevos de los últimos 45 días y quien aún no recoge su botella, con sus
  clases y mensajes, y los textos editados), `wa_bv_ajustes_guardar`,
  `wa_bv_adjunto_guardar`, `wa_bv_adjunto_borrar`, `wa_bv_ordenar`,
  `wa_bv_envio_registrar`, `wa_bv_envio_anular`, `wa_bv_trato_guardar`,
  `wa_bv_trato_defecto`, `wa_bv_plantilla_guardar`, `wa_secuencia_marcar`
  (marca ✓ / ✗ / sin marcar a una o varias personas; solo agrega una fila si
  cambia). `wa_bv_asesor_json` arma cada asesor y `wa_secuencia_de` da la marca
  vigente (`sec`: `{entra, en}`) de cada asesor y cliente (internas, sin
  permisos públicos).
- Envíos sin señal (o con la sesión cerrada): quedan en el celular y se anotan
  al volver; cada uno sale de la cola solo cuando el servidor lo confirma. Lo
  que aún no confirma se mantiene aunque la página recargue, y el servidor no
  anota dos veces el mismo mensaje en 10 minutos.
- Archivos: bucket público `wa-media`, carpeta `bienvenida/d1` … `d5`, hasta
  25 MB cada uno. Nada se borra de verdad: quitar un archivo lo marca
  `borrado` y el archivo queda en el bucket.

## Pruebas

```bash
node pruebas/prueba.js   # Chromium real con un Supabase falso; 226 aserciones y capturas en /tmp/bv-*.png
```

## Despliegue

En línea en **https://renaware-bienvenida.pages.dev**. Cloudflare Pages
conectado a este repo: directorio raíz, sin comando de build; cada push a
`main` publica. Registrado en `plataforma_modulos` como `bienvenida`.
