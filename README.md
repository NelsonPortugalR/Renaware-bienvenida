# Bienvenida por WhatsApp · Equipo Arequipa

Mini entrenamiento de **5 mensajes, uno por día**, para cada nuevo asesor. La
meta: que aprenda lo básico y venga a capacitarse a la oficina (5 clases dentro
de su plazo = botella de acero, el Nivel 0 del Empiece Ya).

## Qué hace

- **Nuevo asesor**: se elige de Nivel Cero (afiliados de los últimos 45 días)
  y trae su nombre, celular, fecha de inicio y código, si ya es un código real
  de Rena Ware. También se puede escribir a mano.
- **Cinco días**: cada tarjeta dice qué día enviarla, los archivos que van y el
  texto listo, con *negritas* de WhatsApp. «Copiar texto» o «Abrir en WhatsApp»
  (abre el chat del asesor con el texto escrito).
- **Archivos por día**: subir, cambiar, describir, ordenar y quitar. En el
  celular, «Compartir» abre el menú para mandarlo directo a WhatsApp.
- **Invitaciones sin preguntar**: proponen las dos capacitaciones más cercanas
  a la fecha de envío, según el horario.
- **Promoción y oficina**: precio del Gourmet, la promoción de ejemplo, la
  inicial, el regalo y el rango de comisión. Se editan en la página.

## Reglas que respeta

- **Horario y plazo**: los de Nivel Cero (`n0_config`). El horario se puede
  cambiar en la página para una semana distinta; al recargar vuelve al de
  Nivel Cero. El plazo va del inicio a 30 días después, ambos incluidos, igual
  que en Nivel Cero.
- **Día de envío**: el día N va en inicio + N − 1. Si se envía tarde, el texto
  propone capacitaciones desde hoy, con 2 horas de margen.
- **Código**: solo se toma si `es_codigo_asesor_real()` lo reconoce. Si falta,
  el día 1 avisa antes de enviar.

## Cómo está hecho

Un solo `index.html`, sin librerías ni build. Llama a Supabase
`kiexpdaaoegbtesqmaff` por RPC con la clave publicable; los datos los protege
la sesión de admin (`admin_login`, la misma clave del panel).

- Tablas: `wa_bv_ajustes` (un registro `vigente` con los datos de la
  promoción) y `wa_bv_adjuntos` (archivos por día). RLS activo, sin acceso
  directo.
- Funciones con sesión: `wa_bv_datos`, `wa_bv_ajustes_guardar`,
  `wa_bv_adjunto_guardar`, `wa_bv_adjunto_borrar`, `wa_bv_ordenar`.
  `wa_bv_datos` también trae `n0_config` y los nuevos de `n0_inscritos_json`.
- Archivos: bucket público `wa-media`, carpeta `bienvenida/d1` … `d5`, hasta
  25 MB cada uno.
- Nada se borra de verdad: quitar un archivo lo marca `borrado` y el archivo
  queda en el bucket.

## Pruebas

```bash
node pruebas/prueba.js   # Chromium real con un Supabase falso; capturas en /tmp/bv-*.png
```

## Despliegue

Cloudflare Pages, directorio raíz, sin comando de build. Con la URL:

```sql
insert into plataforma_modulos (id, nombre, descripcion, url, roles, orden, activo)
values ('bienvenida', 'Bienvenida por WhatsApp', 'Los 5 mensajes para cada nuevo asesor, con sus archivos.',
        'https://<proyecto>.pages.dev', array['admin','asistente'], 9, true)
on conflict (id) do update set url = excluded.url;
```
