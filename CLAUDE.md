# Notas para quien edite este repo

- `index.html` es la página y también la fuente de las reglas del envío automático: los bloques entre
  `/* servidor:desde */` y `/* servidor:hasta */` se copian a `supabase/functions/wa-auto/reglas.js`
  con `node servidor/construir.js`.
- Si cambias algo dentro de esos bloques:
  1. corre `node servidor/construir.js`;
  2. corre las pruebas: `NODE_PATH=$(npm root -g) node pruebas/prueba.js` y `NODE_PATH=$(npm root -g) node pruebas/wa-auto.js`;
  3. haz push y vuelve a desplegar la Edge Function `wa-auto` con `verify_jwt` apagado (ver «Despliegue» en el README:
     con la CLI, o con el MCP y un `index.ts` que importa el del commit nuevo desde raw.githubusercontent.com).

  Si no, la función sigue con las reglas viejas; la página lo avisa en Automático › Hoy.
- Nada se borra: retirar es marcar (`anulado`, `borrado`, `estado`).
- En `index.html`, dos funciones de nivel superior con el mismo nombre = gana la última (ya pasó con `limpiarCl`).
  Revisa antes de agregar una.
