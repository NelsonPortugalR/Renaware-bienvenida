// Genera supabase/functions/wa-auto/reglas.js con las reglas y los textos de index.html.
// Toma los bloques marcados con /* servidor:desde */ … /* servidor:hasta */, sin copiarlos a mano:
// así el envío automático decide y escribe exactamente lo mismo que «Para hoy» en la página.
// Uso: node servidor/construir.js   (después, desplegar la función wa-auto)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const DESDE = '/* servidor:desde */', HASTA = '/* servidor:hasta */';

/* Los bloques, en orden. La función wa-auto usa esta misma regla para ver si la página cambió. */
function bloques(html) {
  const out = [];
  let i = 0;
  for (;;) {
    const a = html.indexOf(DESDE, i);
    if (a < 0) break;
    const b = html.indexOf(HASTA, a);
    if (b < 0) throw new Error('Falta un ' + HASTA);
    out.push(html.slice(a + DESDE.length, b));
    i = b + HASTA.length;
  }
  if (!out.length) throw new Error('index.html no tiene bloques marcados para el servidor');
  return out;
}
function huella(lista) { return crypto.createHash('sha256').update(lista.join('\n/* — */\n'), 'utf8').digest('hex').slice(0, 16); }

const PREAMBULO = `
  'use strict';
  /* El reloj de Lima (UTC−5, sin horario de verano), aunque el servidor corra en otra zona:
     las fechas «locales» de la página (getDate, getDay, getHours…) quedan en hora de Lima. */
  var RealDate = globalThis.Date;
  var AHORA = entrada.ahoraMs == null ? RealDate.now() : Number(entrada.ahoraMs);
  var DESFASE = (new RealDate(AHORA).getTimezoneOffset() - 300) * 60000;
  class Date extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(AHORA + DESFASE);
      else if (a.length === 1 && typeof a[0] === 'string' && /\\d{2}:\\d{2}/.test(a[0]) && /(Z|[+-]\\d{2}:?\\d{2})$/.test(a[0].trim())) super(RealDate.parse(a[0]) + DESFASE);
      else super(...a);
    }
    static now() { return AHORA + DESFASE; }
  }
  var S = { asesores: [], nivel0: null, plazo: 30, plantillas: [], empieceYa: [], periodos: [], items: [], ajustesData: {}, clases: [], clasesHasta: null };
  function leerHorario() { return waHorario(); }       // en la página sale del recuadro de horario; aquí, de Nivel Cero
`;

const CARGA = `
  /* Lo mismo que hace la página al cargar (cargar y cargarCl). */
  var bv = entrada.bv || {}, cl = entrada.cl || {};
  S.items = (Array.isArray(bv.adjuntos) ? bv.adjuntos : []).filter(function (i) { return Number(i.dia) < 11 || Number(i.dia) > 20; })
    .concat(Array.isArray(cl.adjuntos) ? cl.adjuntos : []);
  S.asesores = Array.isArray(bv.asesores) ? bv.asesores : [];
  S.plantillas = Array.isArray(cl.plantillas) ? cl.plantillas : Array.isArray(bv.plantillas) ? bv.plantillas : [];
  S.empieceYa = Array.isArray(bv.empiece_ya) ? bv.empiece_ya : [];
  S.periodos = Array.isArray(bv.periodos) ? bv.periodos : [];
  S.nivel0 = bv.nivel0 || null;
  S.plazo = (S.nivel0 && Number(S.nivel0.plazo)) || 30;
  S.ajustesData = bv.ajustes || {};
  S.clases = Array.isArray(bv.clases) ? bv.clases : [];
  S.clasesHasta = bv.clases_hasta || null;
  CL.oficina = cl.oficina || {};
  CL.clientes = Object.create(null);
  (Array.isArray(cl.clientes) ? cl.clientes : []).forEach(function (c) { if (c && c.id) CL.clientes[String(c.id)] = c; });
  CL.acciones = (Array.isArray(cl.acciones) ? cl.acciones : []).filter(function (a) { return a && a.estado !== 'caducado'; });
  CL.items = Array.isArray(cl.adjuntos) ? cl.adjuntos : [];
  CL.estado = 'ok';

  return {
    hoy: hoyISO, porEnviarHoy: waPorEnviarHoy, itemBv: waItemBv, itemSeg: waItemSeg, itemCl: waItemCl, partes: waPartes,
    pasosSeg: function () { return PASOS.filter(function (x) { return plantilla(x.k).activo; }).map(function (x) { return x.k; }); },
    marcar: waMarcar, huellaTexto: waHuella, categoria: waCategoria, encabezado: waEncabezado,
    asesorPorId: function (id) { return S.asesores.filter(function (p) { return String(p.id) === String(id); })[0] || null; },
    clientePorId: clientePorId, accionesDe: accionesDe, pila: pila, titulo: titulo, celLocal: celLocal, celularWA: celularWA,
    fLargaISO: fLargaISO, tratoDe: tratoDe, tratoCl: tratoCl, S: S, CL: CL
  };
`;

function construir() {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const lista = bloques(html);
  const h = huella(lista);
  const js = '// Generado por servidor/construir.js a partir de index.html: no se edita a mano.\n' +
    '// Son las mismas reglas y textos de la página. Si cambian allá, se vuelve a generar y a desplegar wa-auto.\n' +
    'export const HUELLA = ' + JSON.stringify(h) + ';\n' +
    'export function crearReglas(entrada) {\n' + PREAMBULO + lista.join('\n') + CARGA + '}\n';
  const dest = path.join(RAIZ, 'supabase', 'functions', 'wa-auto', 'reglas.js');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
  return { dest, huella: h, bloques: lista.length, bytes: js.length };
}

module.exports = { bloques, huella, construir };
if (require.main === module) {
  const r = construir();
  console.log('reglas.js: ' + r.bloques + ' bloques, ' + r.bytes + ' bytes, huella ' + r.huella);
}
