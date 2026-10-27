// Prueba de punta a punta: Chromium real con un Supabase falso.
// El servidor falso calcula lo mismo que n0_inscritos_json (plazo, clases válidas, logro, estado)
// y lo entrega en la forma de wa_bv_asesor_json, así que lo que se verifica es la página.
// Uso: node pruebas/prueba.js   (necesita playwright; capturas en /tmp/bv-*.png)
// Clientes: el Supabase falso calcula lo mismo que crm_acciones (acciones por orden y ciclos de filtros por cliente).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const SB = 'https://kiexpdaaoegbtesqmaff.supabase.co';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': 'content-length, content-type'
};
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function sumar(s, n) { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); }
function largo(s) { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d); return DIAS[x.getDay()] + ' ' + x.getDate() + ' de ' + MESES[x.getMonth()]; }
function dias(a, b) { const [y1, m1, d1] = a.split('-').map(Number); const [y2, m2, d2] = b.split('-').map(Number); return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 864e5); }
const HOY = '2026-10-21';                         // miércoles: hay clase de 4:00 p. m.
const AHORA = new Date('2026-10-21T10:00:00-05:00');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Supabase falso ---------------- */
const SEMILLAS = [
  [1, 'video', 'Video de bienvenida'], [2, 'video', 'Video del Kit de Inicio'], [2, 'pdf', 'Folleto de las ollas'],
  [2, 'video', 'Video de las ollas'], [2, 'pdf', 'Folleto del filtro'], [2, 'video', 'Video del filtro'],
  [2, 'video', 'Video del detector'], [2, 'video', 'Video de la cocina'], [2, 'pdf', 'Catálogo de productos'],
  [3, 'pdf', 'Lista de precios general'], [3, 'pdf', 'Lista de promociones vigentes'], [4, 'video', 'Video de Empiece Ya'],
  [5, 'imagen', 'Imagen del próximo sorteo']
];
let uid = 100;
const nuevoId = () => '00000000-0000-4000-8000-' + String(++uid).padStart(12, '0');

const db = {
  ajustes: {
    direccion: 'Av. Cayma 628, Of. 502', referencia: 'a media cuadra de la Av. Ejército', gourmetPrecio: 9629, promoNumero: '5',
    promoPrecio: 7929, promoProductos: 'Juego Gourmet de 17 piezas\nOlla King Cooker de 12 litros\nTabla de cortar\nCuchillo Santoku',
    inicialPct: 10, regalos: 'la nueva Joyita de 1 litro y el juego de cucharones de 3 piezas', comisionMin: 500, comisionMax: 1000
  },
  adjuntos: [],
  cfg: { clases_meta: 5, dias_plazo: 30, horarios: [{ dia: 2, hora: '09:30' }, { dia: 3, hora: '16:00' }, { dia: 5, hora: '16:30' }], trato: 'usted' },
  // [id, nombre, celular, inscripción, código]
  ins: [
    ['p1', 'ANA MARIA QUISPE LOPEZ', '987654321', HOY, '1234567'],          // día 1: le toca la bienvenida
    ['p2', 'luis ramos', '51911222333', '2026-10-11', null],                // 3 clases, la última hace 5 días → Le faltan 2
    ['p3', 'Carla Diaz', '955444333', '2026-09-11', null],                  // venció hace 10 días con 2 → Cumplió sus 30 días
    ['s1', 'SARA UNO SEMANA', '959000001', '2026-10-12', null],             // 9 días sin clases → Va una semana
    ['s2', 'SOFIA DOS QUINCE', '959000002', '2026-10-01', null],            // le quedan 10, sin clases → Quedan 15 días
    ['s3', 'SAUL TRES SIETE', '959000003', '2026-09-25', null],             // le quedan 4, su única clase fue hace 22 → Quedan 7 días
    ['s5', 'SIMON CINCO ACTIVO', '959000005', '2026-10-05', '1770005'],      // vino hace 5 días → la felicitación gana al recordatorio
    ['s6', 'SUSANA SEIS NUEVA', '959000006', '2026-10-18', null],           // día 4, ya tiene los días 1 a 3 → Día 4
    ['s7', 'María Pérez Soto', '987 654 300', '2026-10-15', null],          // día 7, vino ayer → Primera clase
    ['s8', 'FANNY QUISPE CHAUCCA', '959000008', '2026-09-25', null],        // logró hace 14 días, botella por recoger
    ['s9', 'GLORIA MARITZA MARON LIMACHI', '959000009', '2026-09-23', null], // logró hace 5 días y ganó el Empiece Ya
    ['s10', 'ROSA ANTIGUA BOTELLA', '959000010', '2026-08-01', null],       // de agosto: no sale para elegir, sí para avisarle
    ['s11', 'HUGO EXCLUIDO', '959000011', '2026-10-10', null],
    ['s12', 'VICTOR VENCIDO HACE ONCE', null, '2026-09-10', null],         // venció hace 11 días: ya no se le escribe
    ['s14', 'TOMAS ATRASADO', '959000014', '2026-10-19', null],             // día 3, solo tiene el día 1 → Día 2, tocaba ayer
    ['s15', 'TERESA DOS DIAS', '959000015', '2026-10-18', null],            // día 4, solo tiene el día 1 → Día 2, tocaba el lunes
    // quién entra a la secuencia: los de arriba ya entran; estos no están marcados (o no entran)
    ['n1', 'NADIA NUEVA MARCAR', '959000021', '2026-10-20', null],          // día 2, sin marcar → por marcar en Bienvenida
    ['n2', 'NORMA NO ENTRA', '959000022', '2026-10-10', null],              // día 12, ✗ → le tocaría «Va una semana», pero no entra
    ['n3', 'PEDRO MARCAR SEGUIMIENTO', '959000023', '2026-10-12', null],    // día 10, sin marcar → por marcar en Seguimiento
    ['n4', 'QUIQUE MARCAR TAMBIEN', '959000024', '2026-10-14', null]        // día 8, sin marcar
  ].map(([id, nombre, celular, fecha_inscripcion, codigo]) => ({ id, nombre, celular, fecha_inscripcion, codigo })),
  estado: { s11: { excluido: true } },
  ey: { s9: true },
  clases: [],
  asis: [],
  mensajes: [],
  plantillas: [],
  archivos: {},
  sec: []                                    // wa_secuencia: {id, tipo, ref, entra, en} — solo se agregan filas
};
let secId = 0;
const ponerSec = (tipo, ref, entra, en) => db.sec.push({ id: ++secId, tipo, ref, entra, en: en || AHORA.toISOString() });   // la hora de la prueba
const INICIO_HOY = Date.parse(HOY + 'T00:00:00-05:00');
function secDe(tipo, ref) {                 // igual que wa_secuencia_de: la última marca y la que tenía antes de hoy
  const l = db.sec.filter((s) => s.tipo === tipo && s.ref === ref);
  const u = l[l.length - 1];
  if (!u) return null;
  const previas = l.filter((s) => Date.parse(s.en) < INICIO_HOY);
  const p = previas[previas.length - 1];
  return { entra: u.entra, en: u.en, antes_hoy: p ? p.entra : null };
}
db.ins.forEach((p) => { if (!/^n/.test(p.id)) ponerSec('asesor', p.id, true, '2026-10-20T15:00:00Z'); });
ponerSec('asesor', 'n2', false, '2026-10-19T15:00:00Z');
[['k1', '2026-08-04'], ['k2', '2026-08-05'], ['k3', '2026-08-07'], ['k4', '2026-08-11'], ['k5', '2026-08-12'],
 ['k6', '2026-09-16'], ['k7', '2026-09-18'], ['k8', '2026-09-23'], ['k9', '2026-09-25'], ['k10', '2026-09-29'],
 ['k11', '2026-09-30'], ['k12', '2026-10-02'], ['k13', '2026-10-06'], ['k14', '2026-10-07'], ['k15', '2026-10-13'],
 ['k16', '2026-10-14'], ['k17', '2026-10-16'], ['k18', '2026-10-20']].forEach(([id, fecha]) => db.clases.push({ id, fecha }));
const marca = (ins, ks) => ks.forEach((k) => db.asis.push({ clase: k, ins }));
marca('p2', ['k15', 'k16', 'k17']);
marca('p3', ['k6', 'k7']);
marca('s3', ['k10']);
marca('s5', ['k17']);
marca('s7', ['k18']);
marca('s8', ['k10', 'k11', 'k12', 'k13', 'k14']);
marca('s9', ['k8', 'k9', 'k10', 'k16', 'k17']);
marca('s10', ['k1', 'k2', 'k3', 'k4', 'k5']);
const anota = (ins, paso, en) => db.mensajes.push({ id: nuevoId(), ins, paso, modo: 'whatsapp', texto: null, en, anulado: false });
anota('s6', 'bv1', '2026-10-18'); anota('s6', 'bv2', '2026-10-19'); anota('s6', 'bv3', '2026-10-20');
anota('s14', 'bv1', '2026-10-19');
anota('s15', 'bv1', '2026-10-18');

const porDia = {};
SEMILLAS.forEach(([dia, tipo, nombre], i) => {
  porDia[dia] = (porDia[dia] || 0) + 1;
  db.adjuntos.push({ id: 'a' + (i + 1), dia, orden: porDia[dia], tipo, nombre, descripcion: '', ruta: null, archivo: null, bytes: null, content_type: null, borrado: false });
});

/* Igual que n0_inscritos_json + wa_bv_asesor_json */
function asesor(p) {
  const e = db.estado[p.id] || {};
  const inicio = p.fecha_inscripcion, vence = sumar(inicio, db.cfg.dias_plazo), meta = db.cfg.clases_meta;
  const mias = db.asis.filter((a) => a.ins === p.id).map((a) => db.clases.find((c) => c.id === a.clase)).filter(Boolean).sort((x, y) => x.fecha.localeCompare(y.fecha));
  const val = mias.filter((c) => c.fecha >= inicio && c.fecha <= vence);
  const primera = db.clases.map((c) => c.fecha).sort()[0];
  let estado;
  if (e.excluido) estado = 'excluido';
  else if (val.length >= meta) estado = 'logro';
  else if (HOY <= vence) estado = 'en_curso';
  else if (!primera || vence < primera) estado = 'sin_seguimiento';
  else estado = 'vencio';
  return {
    id: p.id, nombre: p.nombre, celular: p.celular, inicio, vence,
    codigo: /^\d{5,7}$/.test(p.codigo || '') ? p.codigo : null,
    estado, validas: val.length, trato: e.trato || null,
    logro_fecha: val.length >= meta ? val[meta - 1].fecha : null,
    botella_entregada_en: e.botella_entregada_en || null, ey: !!db.ey[p.id],
    asistencias: mias.map((c) => ({ f: c.fecha, v: c.fecha >= inicio && c.fecha <= vence })),
    mensajes: db.mensajes.filter((m) => m.ins === p.id && !m.anulado).map((m) => ({ id: m.id, paso: m.paso, modo: m.modo, en: m.en })),
    sec: secDe('asesor', p.id)
  };
}
let sesionInvalida = false;
let cortar = 0;
const retrasos = {};            // paso → ms antes de anotar (para cruzar respuestas)
let retrasoDatos = 0;           // ms antes de devolver wa_bv_datos
let errorAsesores = null;       // simula que falla la lista de Nivel Cero
let errorSec = null;            // simula que falla guardar quién entra a la secuencia
let retrasoSec = 0;             // ms antes de anotar wa_secuencia_marcar
const retrasoSecPor = {};       // 'true' / 'false' / 'null' → ms: para que una marca llegue después que la siguiente

/* ---------------- clientes (lo que arma crm_acciones en Supabase, aquí calculado igual) ---------------- */
const MESES_CL = { prefiltro: 12, filtroppal: 48, aire: 18 };
const AQUA = 'AQUA NANO CTU-500 + JUEGO CHEF II 7 PIEZAS + BOTELLA FILTRANTE RENA WARE (x1 S/6,169.00) | AQUA CHECK NANO 500 CTU (x1 S/0) | JUEGO CHEF II (7 PZAS) - SERIE ZYLSTRA (x1 S/0)';
db.cl = {
  // [id, nombre, celular, ciudad, trato, ordenes[[n_orden, entrega, ordenado, productos, total, credito, cuotas, vendedor, flags, sys, rep]]]
  clientes: [
    ['c1', 'ROSA FLORES MAMANI', '959111001', 'Cayma, Arequipa', null, [[9001, HOY, HOY, 'JUEGO GOURMET 17 PIEZAS + SARTÉN GRANDE C/TAPA 30 CM + AQUA NANO CTU-500 (x1 S/9,809.00) | AQUA CHECK NANO 500 CTU (x1 S/0)', 9809, false, null, 'Rosmery Huanca', { ollas: true, sartenes: true, filtro: true, cocina: false, presion: false, aire: false }, true, null]]],
    ['c2', 'juan perez quispe', '959111002', 'Socabaya, Arequipa', 'tu', [[9002, sumar(HOY, -9), sumar(HOY, -12), 'JUEGO CHEF I 7 PIEZAS + OLLA A PRESIÓN 8 L (x1 S/5,715.92) | JUEGO CHEF I (7 PZAS) (x1 S/0)', 5715.92, false, null, 'Daniel Alzamora', { ollas: true, sartenes: false, filtro: false, cocina: false, presion: true, aire: false }, false, null]]],
    ['c3', 'CARMEN QUISPE CHOQUE', '959111003', 'Miraflores, Arequipa', null, [[9003, '2025-10-30', '2025-11-01', AQUA, 6169, true, 12, 'Olga Quispe', { ollas: true, sartenes: false, filtro: true, cocina: false, presion: false, aire: false }, true, null]]],
    ['c4', 'LUIS VENCIDO TORRES', '959111004', 'Yanahuara, Arequipa', null, [[9004, '2025-07-01', '2025-06-20', AQUA, 6169, false, null, 'Nelson Portugal Roman', { ollas: true, sartenes: false, filtro: true, cocina: false, presion: false, aire: false }, true, null],
                                                                        [9014, '2025-09-15', '2025-09-15', 'PREFILTRO EM PARA AQUA CK NANO (x1 S/222.00)', 222, false, null, 'Nelson Portugal Roman', { ollas: false, sartenes: false, filtro: false, cocina: false, presion: false, aire: false }, false, 'prefiltro']]],
    ['c5', 'ANA SIN CELULAR', null, 'Cerro Colorado, Arequipa', null, [[9005, sumar(HOY, -1), sumar(HOY, -3), 'RENAWOK 34CM + KING COOKER 12L (x1 S/3,100.00)', 3100, false, null, 'Suilan Cartagena', { ollas: true, sartenes: false, filtro: false, cocina: false, presion: false, aire: false }, false, null]]]
  ].map(([id, nombre, celular, ciudad, trato, ords]) => ({ id, nombre, celular, ciudad, trato,
    ordenes: ords.map(([n_orden, entrega, ordenado, productos, total, credito, cuotas, vendedor, flags, sys, rep]) => ({ n_orden, entrega, ordenado, productos, total, credito, cuotas, vendedor, flags, sys, rep })) })),
  seg: [],                                   // {id, n_orden, tipo, modo, fecha, texto, cliente_id, anulado}
  nextId: 500
};
function mesesDespues(iso, m) { const [y, mo, d] = iso.split('-').map(Number); return isoCl(new Date(y, mo - 1 + m, d)); }
function isoCl(x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
function segDe(pred) { return db.cl.seg.filter((g) => !g.anulado && pred(g)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id); }
function gestJson(l) { return l.map((g) => ({ id: g.id, modo: g.modo, fecha: g.fecha, texto: g.texto, n_orden: g.n_orden })); }
function accionesCl(c) {
  const out = [];
  c.ordenes.forEach((o) => {
    const unos = [['bienvenida', o.entrega]];
    if (o.flags.ollas) unos.push(['semana1', sumar(o.entrega, 7)], ['mes1', sumar(o.entrega, 30)]);
    if (o.credito && o.cuotas) unos.push(['fincuotas', mesesDespues(o.ordenado, o.cuotas - 1)]);
    unos.forEach(([tipo, vence]) => {
      const g = segDe((x) => x.n_orden === o.n_orden && x.tipo === tipo);
      const hecho = g.filter((x) => x.modo === 'whatsapp' || x.modo === 'aviso').pop();
      const omit = g.filter((x) => x.modo === 'omitido' || x.modo === 'noaplica').pop();
      const d = dias(HOY, vence);
      const estado = hecho ? 'hecho' : omit ? 'omitido' : d < -45 ? 'caducado' : d < 0 ? 'vencido' : d <= 30 ? 'proximo' : 'pendiente';
      out.push({ clave: o.n_orden + '::' + tipo, clase: 'uno', tipo, cliente_id: c.id, cliente: c.nombre, celular: c.celular, ciudad: c.ciudad, vendedor: o.vendedor,
        n_orden: o.n_orden, ordenes: [o.n_orden], periodo: '2026-PB21', flags: o.flags, entrega: o.entrega, ordenado: o.ordenado, base: o.entrega, vence, dias: d,
        cuotas: o.cuotas, credito: o.credito, total: o.total, estado, hecho_el: hecho ? hecho.fecha : null, gestiones: gestJson(g) });
    });
  });
  ['prefiltro', 'filtroppal', 'aire'].forEach((tipo) => {
    const esAgua = tipo !== 'aire';
    const ords = c.ordenes.filter((o) => (esAgua ? o.sys || o.rep === 'prefiltro' || o.rep === 'filtroppal' : o.rep === 'aire'));
    if (!ords.length) return;
    const sysDate = ords.filter((o) => o.sys).map((o) => o.entrega).sort().pop() || null;
    const repDate = ords.filter((o) => o.rep === tipo).map((o) => o.entrega).sort().pop() || null;
    if (!sysDate && !repDate) return;
    const base = [sysDate, repDate].filter(Boolean).sort().pop();
    const nums = ords.map((o) => o.n_orden);
    const g = segDe((x) => x.tipo === tipo && (x.cliente_id === c.id || nums.indexOf(x.n_orden) >= 0));
    const cambio = g.filter((x) => x.modo === 'cambio').map((x) => x.fecha).sort().pop() || null;
    const desde = [base, cambio].filter(Boolean).sort().pop();
    const noap = g.filter((x) => x.modo === 'noaplica').map((x) => x.fecha).sort().pop() || null;
    const aviso = g.filter((x) => ['whatsapp', 'aviso', 'omitido'].indexOf(x.modo) >= 0).map((x) => x.fecha).sort().pop() || null;
    const vence = mesesDespues(desde, MESES_CL[tipo]);
    const d = dias(HOY, vence);
    const estado = noap && noap >= desde ? 'cerrado' : d > 90 ? 'al_dia' : aviso && aviso >= desde && dias(aviso, HOY) < 30 ? 'avisado' : d < 0 ? 'vencido' : 'proximo';
    const ancla = ords.filter((o) => o.sys)[0] || ords[0];
    out.push({ clave: c.id + '::' + tipo, clase: 'ciclo', tipo, intervalo: MESES_CL[tipo], cliente_id: c.id, cliente: c.nombre, celular: c.celular, ciudad: c.ciudad, vendedor: ancla.vendedor,
      n_orden: ancla.n_orden, ordenes: nums, sistema: sysDate ? (esAgua ? 'AQUA NANO CTU-500 + JUEGO CHEF II 7 PIEZAS + BOTELLA FILTRANTE RENA WARE' : 'PURIFICADOR DE AIRE AEROQUATTRO+ UV') : null,
      fecha_sistema: sysDate, fecha_repuesto: repDate, repuestos: ords.filter((o) => o.rep === tipo).length, src: repDate && (!sysDate || repDate >= sysDate) ? 'repuesto' : 'sistema',
      base, vence, dias: d, ultimo_cambio: cambio, cambios: g.filter((x) => x.modo === 'cambio').length, ultimo_aviso: aviso, estado, gestiones: gestJson(g) });
  });
  return out;
}
let respuestaVieja = false;     // la respuesta de un envío se armó antes de marcar: trae la marca de antes
function clienteJson(c) {
  return { id: c.id, nombre: c.nombre, celular: c.celular, ciudad: c.ciudad, trato: c.trato, sec: respuestaVieja ? null : secDe('cliente', c.id),
    ordenes: c.ordenes.map((o) => ({ n_orden: o.n_orden, fecha: o.entrega, estatus: 'ENTREGADA', productos: o.productos, total: o.total, vendedor: o.vendedor, credito: o.credito, cuotas: o.cuotas })) };
}
function clienteConAcciones(c) { return Object.assign(clienteJson(c), { acciones: accionesCl(c) }); }

let traspasos = 0;
const llamadas = [];
const limpio = (f) => { const c = Object.assign({}, f); delete c.borrado; return c; };

function rpc(fn, a) {
  const ok = (body) => ({ status: 200, body });
  const err = (message) => ({ status: 400, body: { code: 'P0001', message } });
  if (fn === 'admin_login') return a.p_clave === 'secreta' ? ok('tok-1') : err('Clave incorrecta');
  if (sesionInvalida || a.p_token !== 'tok-1') return err('Sesion invalida');
  const insDe = (id) => db.ins.find((x) => x.id === id);
  if (fn === 'wa_bv_datos') {
    const asesores = db.ins.map(asesor).filter((x) => x.estado !== 'excluido' &&
      (x.inicio >= sumar(HOY, -45) || (x.estado === 'logro' && !x.botella_entregada_en && !x.ey)));
    return ok({
      hoy: HOY, ajustes: db.ajustes, adjuntos: db.adjuntos.filter((x) => !x.borrado).map(limpio),
      nivel0: { meta: db.cfg.clases_meta, plazo: db.cfg.dias_plazo, horarios: db.cfg.horarios, trato: db.cfg.trato },
      asesores: errorAsesores ? [] : asesores, asesores_error: errorAsesores, plantillas: db.plantillas.map((x) => Object.assign({}, x))
    });
  }
  if (fn === 'wa_bv_envio_registrar') {
    const p = insDe(a.p_inscrito);
    if (!p) return err('La persona no existe');
    if (!/^[a-z0-9_]{2,30}$/.test(a.p_paso || '')) return err('Paso no valido');
    if (['whatsapp', 'aviso', 'omitido'].indexOf(a.p_modo) < 0) return err('Modo no valido');
    db.mensajes.push({ id: nuevoId(), ins: p.id, paso: a.p_paso, modo: a.p_modo, texto: a.p_texto || null, en: HOY, anulado: false });
    return ok(asesor(p));
  }
  if (fn === 'wa_bv_envio_anular') {
    const m = db.mensajes.find((x) => x.id === a.p_id);
    if (!m) return err('El mensaje no existe');
    m.anulado = true;
    return ok(asesor(insDe(m.ins)));
  }
  if (fn === 'wa_bv_trato_guardar') {
    const p = insDe(a.p_inscrito);
    if (!p) return err('La persona no existe');
    if (a.p_trato != null && ['tu', 'usted'].indexOf(a.p_trato) < 0) return err('El trato es tu o usted');
    (db.estado[p.id] = db.estado[p.id] || {}).trato = a.p_trato || null;
    return ok(asesor(p));
  }
  if (fn === 'wa_bv_trato_defecto') {
    if (['tu', 'usted'].indexOf(a.p_trato) < 0) return err('El trato es tu o usted');
    db.cfg.trato = a.p_trato;
    return ok({ trato: a.p_trato });
  }
  if (fn === 'wa_bv_plantilla_guardar') {
    if (!/^[a-z0-9_]{2,30}$/.test(a.p_clave || '')) return err('Mensaje no valido');
    const lim = (t) => (t && String(t).trim()) || null;
    let x = db.plantillas.find((y) => y.clave === a.p_clave);
    if (!x) { x = { clave: a.p_clave }; db.plantillas.push(x); }
    Object.assign(x, { tu: lim(a.p_tu), usted: lim(a.p_usted), activo: a.p_activo !== false });
    return ok(db.plantillas.map((y) => Object.assign({}, y)));
  }
  if (fn === 'wa_bv_ajustes_guardar') { db.ajustes = a.p_data; return ok(a.p_data); }
  if (fn === 'wa_secuencia_marcar') {               // igual que en Supabase: valida, agrega una fila solo si cambia, devuelve [{ref, sec}]
    if (errorSec) return err(errorSec);
    if (['asesor', 'cliente'].indexOf(a.p_tipo) < 0) return err('Tipo no valido');
    const refs = Array.from(new Set((a.p_refs || []).filter(Boolean)));
    if (!refs.length) return err('No hay a quien marcar');
    const existe = (r) => (a.p_tipo === 'asesor' ? db.ins.some((x) => x.id === r) : db.cl.clientes.some((x) => x.id === r));
    if (!refs.every(existe)) return err('La persona no existe');
    refs.forEach((r) => { const s = secDe(a.p_tipo, r); if ((s ? s.entra : null) !== (a.p_entra == null ? null : a.p_entra)) ponerSec(a.p_tipo, r, a.p_entra == null ? null : a.p_entra); });
    return ok(refs.map((r) => ({ ref: r, sec: secDe(a.p_tipo, r) })));
  }
  if (fn === 'wa_cl_datos') {
    let acc = [];
    db.cl.clientes.forEach((c) => { acc = acc.concat(accionesCl(c)); });
    acc = acc.filter((x) => x.clase === 'ciclo' || ['vencido', 'proximo'].indexOf(x.estado) >= 0 || (x.estado === 'pendiente' && x.dias <= 60) || (['hecho', 'omitido'].indexOf(x.estado) >= 0 && dias(x.vence, HOY) <= 90));
    return ok({ hoy: HOY, acciones: acc, clientes: db.cl.clientes.map(clienteJson), oficina: db.ajustes,
      adjuntos: db.adjuntos.filter((x) => !x.borrado && x.dia >= 11 && x.dia <= 20).map(limpio), plantillas: db.plantillas.map((x) => Object.assign({}, x)), trato: db.cfg.trato });
  }
  if (fn === 'wa_cl_envio_registrar') {
    const c = db.cl.clientes.find((x) => x.ordenes.some((o) => o.n_orden === a.p_n_orden));
    if (!c) return err('La orden no existe');
    if (['bienvenida', 'semana1', 'mes1', 'fincuotas', 'prefiltro', 'filtroppal', 'aire'].indexOf(a.p_tipo) < 0) return err('Paso no valido');
    if (['whatsapp', 'aviso', 'omitido', 'cambio', 'noaplica'].indexOf(a.p_modo) < 0) return err('Modo no valido');
    const f = a.p_fecha || HOY;
    if (f > HOY) return err('Fecha no valida');
    if (!db.cl.seg.some((g) => g.n_orden === a.p_n_orden && g.tipo === a.p_tipo && g.modo === a.p_modo && !g.anulado && g.reciente)) {
      db.cl.seg.push({ id: ++db.cl.nextId, n_orden: a.p_n_orden, tipo: a.p_tipo, modo: a.p_modo, fecha: f, texto: a.p_texto || null, cliente_id: c.id, anulado: false, reciente: true });
    }
    return ok(clienteConAcciones(c));
  }
  if (fn === 'wa_cl_envio_anular') {
    const g = db.cl.seg.find((x) => x.id === a.p_id && !x.anulado);
    if (!g) return err('La gestion ya no existe');
    g.anulado = true;
    return ok(clienteConAcciones(db.cl.clientes.find((c) => c.id === g.cliente_id)));
  }
  if (fn === 'wa_cl_trato_guardar') {
    const c = db.cl.clientes.find((x) => x.id === a.p_cliente);
    if (!c) return err('La persona no existe');
    if (a.p_trato != null && ['tu', 'usted'].indexOf(a.p_trato) < 0) return err('Trato no valido');
    c.trato = a.p_trato || null;
    return ok(clienteConAcciones(c));
  }
  if (fn === 'wa_bv_adjunto_guardar') {
    if (!a.p_id) {
      const dia = a.p_datos.dia;
      const orden = Math.max(0, ...db.adjuntos.filter((x) => x.dia === dia && !x.borrado).map((x) => x.orden)) + 1;
      const fila = Object.assign({ id: 'n' + (++uid), dia, orden, tipo: 'pdf', nombre: '', descripcion: '', ruta: null, archivo: null, bytes: null, content_type: null, borrado: false }, a.p_datos);
      db.adjuntos.push(fila);
      return ok(limpio(fila));
    }
    const fila = db.adjuntos.find((x) => x.id === a.p_id && !x.borrado);
    if (!fila) return err('El archivo ya no existe');
    Object.assign(fila, a.p_datos);
    return ok(limpio(fila));
  }
  if (fn === 'wa_bv_adjunto_borrar') {
    const f = db.adjuntos.find((x) => x.id === a.p_id && !x.borrado);
    if (!f) return err('El archivo ya no existe');
    f.borrado = true;
    return ok({ ok: true, ruta: f.ruta });
  }
  if (fn === 'wa_bv_ordenar') {
    a.p_ids.forEach((id, i) => { const f = db.adjuntos.find((x) => x.id === id); if (f) f.orden = i + 1; });
    return ok({ ok: true });
  }
  return { status: 404, body: { message: 'No existe ' + fn } };
}

async function conectar(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/css' }, body: '' }));
  await ctx.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === '/functions/v1/traspaso') {
      traspasos++;
      const ok = /^[0-9a-f-]{36}$/i.test(JSON.parse(req.postData() || '{}').codigo || '');
      return route.fulfill({ status: ok ? 200 : 401, headers: Object.assign({ 'content-type': 'application/json' }, CORS),
        body: JSON.stringify(ok ? { ok: true, tipo: 'staff', admin_token: 'tok-1', modulo: 'bienvenida' } : { ok: false, motivo: 'Código inválido.' }) });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      if (fn === 'wa_bv_envio_registrar' && cortar > 0) { cortar--; return route.abort('internetdisconnected'); }
      const args = JSON.parse(req.postData() || '{}');
      if (fn === 'wa_bv_envio_registrar' && retrasos[args.p_paso]) await esperar(retrasos[args.p_paso]);   // se anota más tarde
      if (fn === 'wa_secuencia_marcar') { const ms = retrasoSecPor[String(args.p_entra)] || retrasoSec; if (ms) await esperar(ms); }
      llamadas.push({ fn, args });
      const r = rpc(fn, args);
      if (fn === 'wa_bv_datos' && retrasoDatos) await esperar(retrasoDatos);   // la foto de los datos es de antes; llega tarde
      return route.fulfill({ status: r.status, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(r.body) });
    }
    const pub = '/storage/v1/object/public/wa-media/';
    if (url.pathname.startsWith(pub)) {
      const ruta = decodeURIComponent(url.pathname.slice(pub.length));
      const a = db.archivos[ruta];
      if (!a) return route.fulfill({ status: 404, headers: CORS, body: 'not found' });
      return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': a.type, 'content-length': String(a.body.length) }, CORS), body: a.body });
    }
    const sub = '/storage/v1/object/wa-media/';
    if (url.pathname.startsWith(sub) && req.method() === 'POST') {
      const ruta = decodeURIComponent(url.pathname.slice(sub.length));
      const body = req.postDataBuffer() || Buffer.alloc(0);
      db.archivos[ruta] = { type: req.headers()['content-type'], body };
      llamadas.push({ fn: 'storage', args: { ruta, bytes: body.length, apikey: req.headers()['apikey'] } });
      return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify({ Key: 'wa-media/' + ruta }) });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
}

/* ---------------- servidor local ---------------- */
function servir() {
  const server = http.createServer((req, res) => {
    const p = req.url === '/' || req.url.startsWith('/?') ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(RAIZ, p);
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/* ---------------- pruebas ---------------- */
let total = 0;
let fallas = 0;
function ok(cond, nombre, extra) {
  total++;
  if (cond) console.log('  ✓ ' + nombre);
  else { fallas++; console.log('  ✗ ' + nombre + (extra !== undefined ? '  → ' + String(extra).slice(0, 400) : '')); }
}
const hubo = (pred) => llamadas.some(pred);
const vivos = (ins, paso) => db.mensajes.filter((m) => m.ins === ins && m.paso === paso && !m.anulado);

(async () => {
  const server = await servir();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], timezoneId: 'America/Lima', reducedMotion: 'reduce' });
  await conectar(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(AHORA);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  // Los 400 esperados (clave mala, sesión vencida) y los cortes de red simulados salen como recursos fallidos: no son errores de JS.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts|favicon/.test(m.text())) errores.push(m.text()); });
  const toast = () => page.textContent('#toast');
  const popup = async (sel) => {
    const [pop] = await Promise.all([page.waitForEvent('popup'), page.click(sel)]);
    const u = decodeURIComponent(pop.url());
    await pop.close();
    await esperar(600);
    return u;
  };

  try {
    console.log('Acceso');
    await page.goto(base);
    ok(await page.isVisible('#vista-login'), 'sin sesión muestra el acceso');
    ok(!(await page.isVisible('#vista-app')), 'sin sesión no muestra la app');
    await page.screenshot({ path: '/tmp/bv-login.png' });
    await page.fill('#clave', 'mala');
    await page.click('#btn-entrar');
    await page.waitForSelector('#login-err:not([hidden])');
    ok((await page.textContent('#login-err')).includes('Clave incorrecta'), 'la clave mala muestra el error');
    await page.fill('#clave', 'secreta');
    await page.click('#btn-entrar');
    await page.waitForSelector('#vista-app:not([hidden])');
    await page.waitForFunction(() => document.querySelectorAll('.file').length >= 13);
    ok((await page.evaluate(() => localStorage.getItem('wa-bv-token'))) === 'tok-1', 'guarda la sesión');

    console.log('Datos de Supabase y Nivel Cero');
    ok((await page.$$eval('.file', (l) => l.length)) === 13, 'muestra los 13 espacios de archivos');
    ok((await page.$$eval('#files-2 .file', (l) => l.length)) === 8, 'el día 2 tiene 8 archivos');
    ok((await page.$eval('#h-dia-0', (e) => e.value)) === '2' && (await page.$eval('#h-hora-0', (e) => e.value)) === '09:30', 'el horario viene de Nivel Cero');
    ok((await page.textContent('#horario-resumen')) === 'Mar 9:30 a. m. · Mié 4:00 p. m. · Vie 4:30 p. m.', 'el horario se resume arriba', await page.textContent('#horario-resumen'));
    const opciones = await page.$$eval('#asesor-sel option', (l) => l.map((o) => o.textContent));
    ok(opciones.length === 19, 'para elegir: los 18 nuevos de los últimos 45 días más «a mano»', opciones.length);
    ok(opciones.some((t) => /Norma No Entra .*no entra a la secuencia/.test(t)) && opciones.some((t) => /Nadia Nueva Marcar .*por marcar/.test(t)), 'y dice quién no entra o falta marcar', opciones.join(' | '));
    ok(!opciones.some((t) => /Rosa Antigua|Hugo/.test(t)), 'no lista a los de hace más de 45 días ni a los excluidos');
    ok((await page.textContent('#aj-resumen')).includes('Promoción 5'), 'carga la promoción guardada');

    console.log('Bienvenida · para hoy');
    await page.screenshot({ path: '/tmp/bv-inicio.png', fullPage: true });
    ok((await page.textContent('#cuenta-bv')).startsWith('5') && (await page.textContent('#cuenta-sg')).startsWith('10'), 'las pestañas cuentan lo de hoy: 4 de bienvenida + 1 por marcar, y 8 de seguimiento + 2 por marcar',
      (await page.textContent('#cuenta-bv')) + ' / ' + (await page.textContent('#cuenta-sg')));
    const hoyBv = await page.$$eval('#bv-hoy .hoy-row', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')));
    ok(hoyBv.length === 4 && /Teresa Dos Dias Día 2 · Kit y material digital · tocaba el lun 19 oct/.test(hoyBv[0]) && /Tomas Atrasado Día 2 · Kit y material digital · tocaba ayer/.test(hoyBv[1]),
      'primero los atrasados, con el día que les falta', hoyBv.join(' | '));
    ok(hoyBv.some((t) => /Ana Maria Quispe Lopez Día 1 · Bienvenida, código y horario/.test(t)) && hoyBv.some((t) => /Susana Seis Nueva Día 4 · Empiece Ya/.test(t)),
      'a cada uno el día que le toca, según lo ya enviado', hoyBv.join(' | '));
    await page.click('#bv-hoy [data-sg="preparar"][data-id="s14"]');
    await esperar(400);
    ok((await page.inputValue('#asesor-sel')) === 's14' && (await page.inputValue('#nombre')) === 'Tomas', 'Preparar carga sus datos');
    ok((await page.textContent('#bvst-1')).includes('Enviado el lun 19 oct') && (await page.textContent('#bvst-2')).includes('Ya lo envié'), 'cada día dice si ya se le mandó',
      (await page.textContent('#bvst-1')) + ' / ' + (await page.textContent('#bvst-2')));
    ok(await page.evaluate(() => { const r = document.getElementById('dia-2').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }), 'y lleva a su día');
    const u2 = await popup('#wa-2');
    ok(u2.startsWith('https://wa.me/51959000014?text=') && u2.includes('Día 2 de 30'), 'abre su chat con el texto del día 2', u2.slice(0, 120));
    ok(vivos('s14', 'bv2').length === 1 && /Día 2 de 30/.test(vivos('s14', 'bv2')[0].texto || ''), 'queda anotado como bv2, con su texto');
    ok((await page.textContent('#bvst-2')).includes('Enviado el mié 21 oct'), 'la tarjeta pasa a enviado');
    const tomas = await page.$eval('#bv-hoy [data-id="s14"]', (b) => b.closest('.hoy-row').innerText.replace(/\s+/g, ' ')).catch(() => '');
    ok(/Día 3 · Precios y promociones/.test(tomas) && !/tocaba/.test(tomas), 'y le toca el día 3, que es hoy', tomas);
    await page.click('#bvst-3 [data-sg="bvMarcar"]');
    await esperar(600);
    ok(vivos('s14', 'bv3').length === 1 && !(await page.$('#bv-hoy [data-id="s14"]')), '«Ya lo envié» lo anota y sale de la lista');
    ok(/Enviados hoy\s*2/.test(await page.textContent('#bv-hoy')), 'cuenta lo enviado hoy');
    await page.click('#bvst-3 [data-sg="anular"]');
    await esperar(600);
    ok(vivos('s14', 'bv3').length === 0 && !!(await page.$('#bv-hoy [data-id="s14"]')), 'deshacer lo devuelve');
    await page.click('#bvst-3 [data-sg="bvMarcar"]');
    await esperar(500);
    ok((await page.textContent('#cuenta-bv')).startsWith('4'), 'la pestaña se actualiza');
    await page.click('#bv-hoy .sg-nom[data-id="s6"]');
    await esperar(250);
    const fichaS = await page.textContent('.modal');
    ok(/✓ Enviado el 18 oct/.test(fichaS) && /Día 4 · Empiece Ya\s*Ya lo envié/.test(fichaS) && /toca el jue 22 oct/.test(fichaS),
      'su ficha dice qué días de bienvenida ya tiene', fichaS);
    ok(/Empieza el viernes 23 de octubre, su día 6\./.test(fichaS), 'y cuándo empieza su seguimiento', fichaS);
    await page.click('.modal [data-sg="preparar"]');
    await esperar(400);
    ok(!(await page.$('.modal')) && (await page.inputValue('#asesor-sel')) === 's6', 'desde la ficha abre su bienvenida');
    await page.screenshot({ path: '/tmp/bv-bienvenida-hoy.png' });
    await page.click('#bv-hoy .sg-nom[data-id="s15"]');
    await esperar(250);
    retrasos.bv2 = 300; retrasos.bv3 = 1500;
    await page.click('.modal [data-sg="bvMarcar"][data-n="2"]');
    await page.click('.modal [data-sg="bvMarcar"][data-n="3"]');
    await esperar(900);
    const teresa = await page.$eval('#bv-hoy [data-id="s15"]', (b) => b.closest('.hoy-row').innerText.replace(/\s+/g, ' ')).catch(() => '');
    ok(/Día 4 · Empiece Ya/.test(teresa), 'dos envíos seguidos no se pisan: el que sigue en camino no reaparece', teresa);
    await esperar(1000);
    ok(vivos('s15', 'bv2').length === 1 && vivos('s15', 'bv3').length === 1 && /Día 2 · Kit y material digital✓ Enviado el 21 oct/.test(await page.textContent('.modal')),
      'y los dos quedan anotados una sola vez');
    delete retrasos.bv2; delete retrasos.bv3;
    await page.keyboard.press('Escape');
    await esperar(150);

    console.log('Elegir asesor');
    await page.selectOption('#asesor-sel', 'p1');
    ok((await page.inputValue('#nombre')) === 'Ana', 'toma el primer nombre');
    ok((await page.inputValue('#celular')) === '987654321', 'toma el celular');
    ok((await page.inputValue('#fecha')) === HOY, 'toma la fecha de inicio');
    const m1 = await page.textContent('#msg-1');
    ok(m1.includes('¡Felicitaciones, Ana!'), 'el día 1 la saluda por su nombre');
    ok(m1.includes('Tu código de asesor: 1234567'), 'el día 1 lleva su código');
    ok(m1.includes('Martes, 9:30 a. m.') && m1.includes('Viernes, 4:30 p. m.'), 'el día 1 lista el horario');
    ok(m1.includes('Av. Cayma 628, Of. 502, a media cuadra de la Av. Ejército.'), 'el día 1 lleva dirección y referencia');
    ok(m1.includes('hasta el ' + largo(sumar(HOY, 30))), 'fecha límite = inicio + 30 días, como Nivel Cero');
    ok(!m1.includes('¿vienes'), 'la invitación no pregunta si viene');
    ok((await page.textContent('#when-1')).includes('Envíalo hoy'), 'el día 1 se envía hoy');
    const wa1 = await page.getAttribute('#wa-1', 'href');
    ok(wa1.startsWith('https://wa.me/51987654321?text=') && decodeURIComponent(wa1).includes('Felicitaciones, Ana'), 'abre el chat del asesor con el texto');
    const m3 = await page.textContent('#msg-3');
    ok(m3.includes('S/ 9,629') && m3.includes('promoción 5') && m3.includes('S/ 793') && m3.includes('S/ 1,700 menos'), 'el día 3 arma precios con los datos guardados');
    const m4 = await page.textContent('#msg-4');
    ok(m4.includes('Costa Rica') && !m4.includes('S/ 1'), 'el día 4 lleva el Nivel 4 y no menciona S/ 1 por punto');
    await page.selectOption('#asesor-sel', 'p2');
    ok((await page.inputValue('#celular')) === '911222333', 'quita el 51 del celular');
    ok((await page.isVisible('#warn-1')) && (await page.textContent('#warn-1')).includes('código de asesor'), 'sin código, el día 1 avisa antes de enviar');
    ok((await page.textContent('#when-1')).includes('Tocaba'), 'si ya pasó su día, avisa que tocaba');
    await page.click('#reset');
    ok(await page.isHidden('#bvst-1'), 'a mano no hay nada que anotar');

    console.log('Promoción');
    await page.click('#aj-panel summary').catch(() => {});
    if (!(await page.$eval('#aj-panel', (e) => e.open))) await page.click('#aj-panel summary');
    await page.fill('#aj-promoPrecio', '8000');
    await page.press('#aj-promoPrecio', 'Tab');
    await esperar(250);
    ok(hubo((l) => l.fn === 'wa_bv_ajustes_guardar' && l.args.p_data.promoPrecio === 8000), 'guarda el precio nuevo en Supabase');
    ok((await page.textContent('#msg-3')).includes('S/ 800'), 'el día 3 recalcula la inicial');

    console.log('Archivos');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#add-5')]);
    await fc.setFiles({ name: 'Sorteo de noviembre.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await page.waitForFunction(() => document.querySelectorAll('#files-5 .file').length === 2 && !document.querySelector('#files-5 .is-busy'));
    ok(hubo((l) => l.fn === 'storage' && l.args.ruta.startsWith('bienvenida/d5/') && l.args.apikey), 'sube el archivo a wa-media/bienvenida con la clave publicable');
    ok(hubo((l) => l.fn === 'wa_bv_adjunto_guardar' && l.args.p_id === null && l.args.p_datos.dia === 5 && l.args.p_datos.tipo === 'imagen'), 'registra el archivo nuevo como imagen');
    ok(await page.isVisible('#files-5 .fedit'), 'abre la edición del archivo nuevo');
    const inNombre = await page.$('#files-5 .fedit input[data-field="nombre"]');
    await inNombre.fill('Imagen del sorteo de noviembre');
    await inNombre.press('Tab');
    await esperar(250);
    ok(hubo((l) => l.fn === 'wa_bv_adjunto_guardar' && l.args.p_id && l.args.p_datos.nombre === 'Imagen del sorteo de noviembre'), 'guarda el nombre editado');

    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#files-1 [data-act="subir"]')]);
    await fc2.setFiles({ name: 'bienvenida.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(4096, 7) });
    await page.waitForSelector('#files-1 [data-act="compartir"]');
    ok((await page.textContent('#files-1 .fmeta')).includes('Video'), 'el espacio del día 1 queda con su video');
    const [descarga] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      page.click('#files-1 [data-act="compartir"]')
    ]);
    ok(descarga && descarga.suggestedFilename() === 'Video de bienvenida.mp4', 'sin menú de compartir, lo descarga con su nombre');

    const antes = await page.$$eval('#files-2 .fname', (l) => l.map((x) => x.textContent));
    await page.click('#files-2 [data-act="editar"]');
    ok(!(await page.isVisible('#files-5 .fedit')), 'al editar otro archivo se cierra el panel anterior');
    await page.click('#files-2 [data-act="abajo"]');
    await esperar(250);
    const despues = await page.$$eval('#files-2 .fname', (l) => l.map((x) => x.textContent));
    ok(despues[0] === antes[1] && despues[1] === antes[0], 'baja un archivo en la lista');
    ok(hubo((l) => l.fn === 'wa_bv_ordenar' && l.args.p_ids.length === 8), 'guarda el nuevo orden');
    await page.click('#files-2 [data-act="eliminar"]');
    await page.click('#files-2 [data-act="confirmar-eliminar"]');
    await page.waitForFunction(() => document.querySelectorAll('#files-2 .file').length === 7);
    ok(hubo((l) => l.fn === 'wa_bv_adjunto_borrar'), 'quita el archivo');

    console.log('Texto');
    await page.click('[data-copy="1"]');
    await esperar(200);
    ok((await page.textContent('[data-copy="1"]')).includes('Copiado'), 'copia el texto');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin desborde horizontal a 400 px');
    await page.screenshot({ path: '/tmp/bv-app.png' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await (await page.$('#dia-1')).screenshot({ path: '/tmp/bv-dia1-oscuro.png' });
    await page.emulateMedia({ colorScheme: 'light' });

    console.log('Seguimiento · para hoy');
    await page.click('#tab-sg');
    await esperar(200);
    ok(await page.isVisible('#vista-sg') && !(await page.isVisible('#vista-bv')), 'la pestaña Seguimiento muestra su vista');
    const grupos = await page.$$eval('#vista-sg .sg-grupo', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    ok(['Le faltan 2 1', 'Ganó la botella y ya tiene su Empiece Ya 1', 'Primera clase 2', 'Va una semana 1', 'Quedan 15 días 1', 'Quedan 7 días 1', 'Cumplió sus 30 días 1']
      .every((g) => grupos.indexOf(g) >= 0), 'agrupa lo de hoy por mensaje, con su cuenta', grupos.join(' | '));
    const grupoDe = (id) => page.$eval('#vista-sg .sg-nom[data-id="' + id + '"]', (b) => {
      let h = b.closest('ul').previousElementSibling;
      return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
    }).catch(() => '');
    ok(/^Va una semana/.test(await grupoDe('s1')), 'semana sin venir');
    ok(/^Quedan 15 días/.test(await grupoDe('s2')), 'a 15 días de su fecha límite');
    ok(/^Quedan 7 días/.test(await grupoDe('s3')), 'a 7 días aunque vino al inicio');
    ok(/^Cumplió sus 30 días/.test(await grupoDe('p3')), 'al cumplir sus 30 días');
    ok(/^Primera clase/.test(await grupoDe('s5')), 'si viene, la felicitación gana al recordatorio');
    ok(/^Ganó la botella y ya tiene su Empiece Ya/.test(await grupoDe('s9')), 'al lograr sus 5 clases');
    ok(!(await page.$('#vista-sg .sg-nom[data-id="p1"]')) && !(await page.$('#vista-sg .sg-nom[data-id="s6"]')), 'en sus días 1 a 5 no hay seguimiento');
    ok(!(await page.$('#vista-sg .sg-nom[data-id="s8"]')) && !(await page.$('#vista-sg .sg-nom[data-id="s12"]')), 'nada a quien logró hace más de 10 días ni a quien venció hace más de 10');
    const prevMaria = await page.$eval('#vista-sg .sg-nom[data-id="s7"]', (b) => b.closest('.sg-item').querySelector('.sg-prev').textContent);
    ok(prevMaria === '¡Felicitaciones por su primera clase, María! 💪 Ya lleva 1 de 5. Le faltan 4 para ganar su botella de acero y tiene hasta el sábado 14 de noviembre. La próxima es hoy a las 4:00 p. m.',
      'de usted, con su fecha límite y la próxima clase', prevMaria);
    const prevSofia = await page.$eval('#vista-sg .sg-nom[data-id="s2"]', (b) => b.closest('.sg-item').querySelector('.sg-prev').textContent);
    ok(prevSofia === 'Hola Sofia, tiene 10 días para ganar su botella de acero (hasta el sábado 31 de octubre). Todavía no ha venido a ninguna clase. ¡Aproveche, le esperamos hoy a las 4:00 p. m.!',
      'días que le quedan y su avance', prevSofia);
    const prevSara = await page.$eval('#vista-sg .sg-nom[data-id="s1"]', (b) => b.closest('.sg-item').querySelector('.sg-prev').textContent);
    ok(/^Hola Sara, ya pasó su primera semana y todavía no ha venido a ninguna capacitación\. Recuerde: si viene 5 veces hasta el miércoles 11 de noviembre, asegura su botella de acero\. ¡Le esperamos hoy a las 4:00 p\. m\.!/.test(prevSara),
      'la primera semana sin venir', prevSara);
    await page.screenshot({ path: '/tmp/bv-seguimiento.png', fullPage: true });

    const uM = await popup('#vista-sg a[data-envio="clase1"][data-id="s7"]');
    ok(uM.indexOf('https://wa.me/51987654300?text=¡Felicitaciones por su primera clase, María!') === 0, 'WhatsApp se abre con el mensaje listo', uM.slice(0, 120));
    ok(vivos('s7', 'clase1').length === 1 && /María/.test(vivos('s7', 'clase1')[0].texto || ''), 'queda anotado como enviado');
    ok(!(await page.$('#vista-sg .sg-nom[data-id="s7"]')) && /María Pérez Soto · Primera clase · WhatsApp/.test(await page.textContent('#vista-sg')), 'sale de la lista y pasa a mandados hoy');
    await page.click('#vista-sg [data-sg="omitir"][data-id="p2"]');
    await esperar(600);
    ok(!(await page.$('#vista-sg .sg-nom[data-id="p2"]')) && db.mensajes.some((m) => m.ins === 'p2' && m.paso === 'faltan2' && m.modo === 'omitido'), 'omitir lo saca de la lista');
    await page.click('#vista-sg .hist li:has-text("Luis Ramos") [data-sg="anular"]');
    await esperar(600);
    ok(!!(await page.$('#vista-sg .sg-nom[data-id="p2"]')) && db.mensajes.some((m) => m.ins === 'p2' && m.anulado), 'deshacer lo devuelve a la lista');
    cortar = 2;
    await page.click('#vista-sg [data-sg="omitir"][data-id="p2"]');
    await esperar(700);
    ok(/Sin conexión/.test(await toast()) && !(await page.$('#vista-sg .sg-nom[data-id="p2"]')) &&
      (await page.evaluate(() => JSON.parse(localStorage.getItem('wa-bv-envios') || '[]').length)) === 1, 'sin señal queda guardado en el celular', await toast());
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await esperar(600);
    ok((await page.evaluate(() => localStorage.getItem('wa-bv-envios'))) === null && vivos('p2', 'faltan2').length === 1, 'y se anota al volver la señal');
    await page.click('#vista-sg .hist li:has-text("Luis Ramos") [data-sg="anular"]');
    await esperar(500);
    // vuelve de WhatsApp después de un rato: la página recarga, y mientras tanto se anota otro
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.setFixedTime(new Date(AHORA.getTime() + 120000));
    retrasoDatos = 1200;
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await esperar(100);
    await page.click('#vista-sg [data-sg="omitir"][data-id="s1"]');
    await esperar(1500);
    ok(!(await page.$('#vista-sg .sg-nom[data-id="s1"]')), 'una recarga que salió antes de anotar no lo devuelve a la lista');
    await esperar(1300);
    ok(!(await page.$('#vista-sg .sg-nom[data-id="s1"]')) && vivos('s1', 'semana1').length === 1, 'y al terminar de recargar sigue anotado');
    retrasoDatos = 0;
    await page.evaluate(() => { delete document.hidden; });
    await page.clock.setFixedTime(AHORA);
    await page.click('#vista-sg .hist li:has-text("Sara Uno Semana") [data-sg="anular"]');
    await esperar(500);

    console.log('Seguimiento · ficha');
    await page.click('#vista-sg .sg-nom[data-id="s5"]');
    await esperar(250);
    let ficha = await page.textContent('.modal');
    ok(/Le toca: Primera clase/.test(ficha) && /¡Felicitaciones por su primera clase, Simon!/.test(ficha), 'la ficha dice qué le toca', ficha.slice(0, 300));
    ok(/Bienvenida · días 1 a 5/.test(ficha) && /No hay mensajes de bienvenida anotados\./.test(ficha) && !/Ya lo envié/.test(ficha), 'pasada su bienvenida, solo el resumen');
    ok(/vie 16 oct/.test(await page.textContent('.modal .clases-p')), 'con sus clases');
    await page.click('.modal .chip[data-sg="tratoPersona"][data-t="tu"]');
    await esperar(400);
    ficha = await page.textContent('.modal');
    ok(/¡Felicitaciones por tu primera clase, Simon! 💪 Ya llevas 1 de 5/.test(ficha) && db.estado.s5 && db.estado.s5.trato === 'tu', 'cambia a tú solo para él', ficha.slice(0, 400));
    ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.getAttribute('data-sg') === 'tratoPersona' && a.getAttribute('data-t') === 'tu'; }), 'el foco sigue en lo que tocó');
    const ultimo = await page.evaluate(() => {
      const l = Array.from(document.querySelectorAll('#capa .modal a[href], #capa .modal button')).filter((e) => e.offsetWidth || e.offsetHeight);
      l[l.length - 1].focus();
      return l.length;
    });
    await page.keyboard.press('Tab');
    ok(ultimo > 3 && await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('x')), 'Tab no sale de la ficha');
    await page.screenshot({ path: '/tmp/bv-ficha.png' });
    await page.click('.modal [data-sg="aviso"]');
    await esperar(500);
    ficha = await page.textContent('.modal');
    ok(/Al día: hoy no le toca mensaje\. Si no viene, el miércoles 28 de octubre le toca «Quedan 7 días»\./.test(ficha) && /Primera clase · 21 oct · en persona/.test(ficha),
      'le avisó en persona y queda al día', ficha);
    await page.click('.modal [data-sg="verOtros"]');
    await page.click('.modal .chip[data-sg="elegirPaso"][data-k="falta1"]');
    await esperar(150);
    ficha = await page.textContent('.modal');
    ok(/Elegiste: Le falta 1/.test(ficha) && /¡Felicitaciones, Simon! Estás a 1 clase/.test(ficha), 'puede mandar otro mensaje a mano');
    await page.click('.modal [data-sg="elegirPaso"][data-k=""]');
    await esperar(150);
    ok(!/Elegiste/.test(await page.textContent('.modal')), 'y volver');
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!(await page.$('.modal')), 'Escape cierra la ficha');

    console.log('Seguimiento · editor');
    await page.click('#vista-sg [data-sg="editor"]');
    await esperar(200);
    let ed = await page.textContent('.modal');
    ok(/Por asistencia/.test(ed) && /Si no viene/.test(ed) && (await page.$$('.modal .paso')).length === 11 && !/Al inscribirse/.test(ed), 'lista los 11 mensajes, sin el de bienvenida de Nivel Cero', (await page.$$('.modal .paso')).length);
    await page.click('.modal [data-sg="abrirPaso"][data-k="clase1"]');
    await esperar(150);
    ok((await page.inputValue('#mTexto')).indexOf('¡Felicitaciones por su primera clase') === 0, 'abre con el trato por defecto (usted)');
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!!(await page.$('.modal')) && !(await page.$('#mTexto')), 'Escape cierra el mensaje abierto, no el editor');
    await page.click('.modal [data-sg="abrirPaso"][data-k="clase1"]');
    await esperar(150);
    await page.fill('#mTexto', 'Hola {nombre}, felicitaciones por su primera clase. Tiene hasta el {limite}.');
    await esperar(100);
    ok(/^Hola Luis, felicitaciones por su primera clase\. Tiene hasta el (\S+ \d+ de \S+)\.$/.test(await page.textContent('#mPrev')), 'vista previa en vivo', await page.textContent('#mPrev'));
    await page.click('.modal .chip[data-m="{dias}"]');
    ok(/ \{dias\}$/.test(await page.inputValue('#mTexto')), 'inserta un marcador al final, con un espacio', await page.inputValue('#mTexto'));
    await page.fill('#mTexto', 'Hola {Nombre}, hasta el {límite}');
    await esperar(100);
    ok(/^Hola Luis, hasta el \S+ \d+ de \S+$/.test(await page.textContent('#mPrev')), 'marcadores sin importar mayúsculas ni tildes', await page.textContent('#mPrev'));
    await page.fill('#mTexto', 'Hola {nombr}');
    await page.click('.modal [data-sg="guardarPaso"]');
    await esperar(200);
    ok(/Revisa \{nombr\}/.test(await toast()) && !db.plantillas.some((x) => x.clave === 'clase1'), 'avisa si un marcador está mal escrito', await toast());
    await page.fill('#mTexto', 'Hola {nombre}, felicitaciones por su primera clase. Tiene hasta el {limite}.');
    await page.click('.modal [data-sg="guardarPaso"]');
    await esperar(400);
    const pl1 = db.plantillas.find((x) => x.clave === 'clase1');
    ok(!!pl1 && pl1.usted === 'Hola {nombre}, felicitaciones por su primera clase. Tiene hasta el {limite}.' && pl1.tu === null, 'guarda solo lo que cambió', JSON.stringify(pl1));
    ok(/Primera clase\s*editado/.test(await page.textContent('.modal')), 'marca el mensaje como editado');
    await page.click('.modal [data-sg="abrirPaso"][data-k="clase1"]');
    await page.click('.modal [data-sg="restaurarPaso"]');
    await esperar(400);
    const pl2 = db.plantillas.find((x) => x.clave === 'clase1');
    ok(!!pl2 && pl2.usted === null && pl2.tu === null && !/Primera clase\s*editado/.test(await page.textContent('.modal')), 'vuelve al original');
    await page.click('.modal [data-sg="abrirPaso"][data-k="botella_ey"]');
    await page.uncheck('#mActivo');
    await page.click('.modal [data-sg="guardarPaso"]');
    await esperar(400);
    ok(/Ganó la botella y ya tiene su Empiece Ya\s*apagado/.test(await page.textContent('.modal')), 'apaga un mensaje');
    await page.click('.modal .chip[data-sg="tratoDefecto"][data-t="tu"]');
    await esperar(400);
    ok(db.cfg.trato === 'tu', 'cambia el trato por defecto');
    await page.click('.modal [data-sg="cerrar"]');
    await esperar(200);
    ok(!(await page.$('#vista-sg .sg-nom[data-id="s9"]')), 'un mensaje apagado no se propone');
    const prevSaul = await page.$eval('#vista-sg .sg-nom[data-id="s3"]', (b) => b.closest('.sg-item').querySelector('.sg-prev').textContent);
    ok(prevSaul === 'Hola Saul, ¡últimos días! Tienes 4 días para ganar tu botella de acero: tu plazo vence el domingo 25 de octubre. Llevas 1 de 5: te faltan 4. Te esperamos hoy a las 4:00 p. m.',
      'con tú por defecto le escribe de tú', prevSaul);
    await page.click('#vista-sg [data-sg="editor"]');
    await page.click('.modal [data-sg="abrirPaso"][data-k="botella_ey"]');
    await page.check('#mActivo');
    await page.click('.modal [data-sg="guardarPaso"]');
    await esperar(400);
    await page.click('.modal [data-sg="abrirPaso"][data-k="quedan7"]');
    await page.uncheck('#mActivo');
    await page.click('.modal [data-sg="guardarPaso"]');
    await esperar(400);
    await page.click('.modal [data-sg="cerrar"]');
    await esperar(150);
    ok(!(await page.$('#vista-sg .sg-nom[data-id="s3"]')), 'apagar «Quedan 7 días» no le devuelve una «Primera clase» vieja');
    await page.click('#vista-sg [data-sg="editor"]');
    await page.click('.modal [data-sg="abrirPaso"][data-k="quedan7"]');
    await page.check('#mActivo');
    await page.click('.modal [data-sg="guardarPaso"]');
    await esperar(400);
    await page.click('.modal [data-sg="cerrar"]');
    await esperar(150);

    console.log('Seguimiento · lista y horario');
    const filas = await page.$$eval('#sg-lista .sg-row', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')));
    ok(filas.length === 13, 'lista a todos los del día 6 en adelante, menos a quien no entra a la secuencia', filas.length);
    ok(filas.some((t) => /Pedro Marcar Seguimiento .*Por marcar: ¿entra a la secuencia\?/.test(t)) && !filas.some((t) => /Norma No Entra/.test(t)), 'los por marcar salen con su aviso', filas.join(' | '));
    ok(filas.some((t) => /Rosa Antigua Botella .*botella por recoger/.test(t)), 'incluye a quien aún no recoge su botella, aunque sea de antes', filas.join(' | '));
    ok(filas.some((t) => /Simon Cinco Activo .*Al día · si no viene, el mié 28 oct: Quedan 7 días/.test(t)), 'dice qué le toca o qué le tocará', filas.join(' | '));
    await page.fill('#sg-busca', 'fanny');
    await esperar(150);
    ok((await page.$$('#sg-lista .sg-row')).length === 1 && (await page.evaluate(() => document.activeElement.id)) === 'sg-busca', 'busca sin perder el foco');
    await page.fill('#sg-busca', '');
    ok(/1 asesor está en sus primeros 5 días|asesores están en sus primeros 5 días/.test(await page.textContent('#vista-sg')), 'avisa cuántos van en bienvenida');
    await page.click('#horario-panel summary');
    await page.selectOption('#h-dia-1', '');
    await esperar(200);
    const prevSaul2 = await page.$eval('#vista-sg .sg-nom[data-id="s3"]', (b) => b.closest('.sg-item').querySelector('.sg-prev').textContent);
    ok(/Te esperamos el viernes 23 a las 4:30 p\. m\.$/.test(prevSaul2), 'sin la clase de hoy, propone la siguiente del horario', prevSaul2);
    ok((await page.textContent('#horario-resumen')) === 'Mar 9:30 a. m. · Vie 4:30 p. m.', 'y el resumen del horario cambia');
    await page.selectOption('#h-dia-1', '3');
    await page.click('#horario-panel summary');

    console.log('Secuencia · asesores');
    await page.click('#tab-bv');
    await esperar(150);
    const filasHoyBv = () => page.$$eval('#bv-hoy .hoy-row', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')));
    let bvh = (await page.textContent('#bv-hoy')).replace(/\s+/g, ' ');
    ok(/¿Entran a la secuencia\? 1/.test(bvh) && /Nadia Nueva Marcar\s*Desde el mar 20 oct · día 2 · 0 de 5 clases/.test(bvh) && !(await filasHoyBv()).some((t) => /Nadia/.test(t)),
      'la nueva sale arriba para marcarla y todavía no se le propone nada', bvh.slice(0, 400));
    await page.screenshot({ path: '/tmp/bv-secuencia.png' });
    await page.click('#bv-hoy [data-sg="secAs"][data-id="n1"][data-v="si"]');
    await esperar(500);
    ok(hubo((l) => l.fn === 'wa_secuencia_marcar' && l.args.p_tipo === 'asesor' && l.args.p_refs.length === 1 && l.args.p_refs[0] === 'n1' && l.args.p_entra === true) && secDe('asesor', 'n1').entra === true,
      '✓ con un toque, anotado en wa_secuencia');
    bvh = (await page.textContent('#bv-hoy')).replace(/\s+/g, ' ');
    ok(!(await page.$('#bv-hoy .pormarcar')) && (await filasHoyBv()).some((t) => /Nadia Nueva Marcar Día 1 · Bienvenida, código y horario · tocaba ayer/.test(t)), 'pasa a «Para hoy» con su día 1', (await filasHoyBv()).join(' | '));
    ok(/Marcados hoy 1/.test(bvh) && /Nadia Nueva Marcar · entra a la secuencia/.test(bvh) && /Secuencia: 16 entran · 1 no entra · 2 por marcar/.test(bvh), 'queda en lo marcado hoy y en el resumen', bvh.slice(-400));
    ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'bv-hoy-h'), 'el foco no se pierde: pasa al título de «Para hoy»');
    await page.click('#bv-hoy [data-sg="secDeshacer"][data-id="n1"]');
    await esperar(500);
    ok(!!(await page.$('#bv-hoy .pormarcar-row [data-id="n1"]')) && !(await filasHoyBv()).some((t) => /Nadia/.test(t)) && secDe('asesor', 'n1').entra === null && db.sec.filter((s) => s.ref === 'n1').length === 2,
      'deshacer la devuelve a por marcar, sin borrar lo anotado');
    await page.click('#bv-hoy [data-sg="secAs"][data-id="n1"][data-v="no"]');
    await esperar(500);
    bvh = (await page.textContent('#bv-hoy')).replace(/\s+/g, ' ');
    ok(secDe('asesor', 'n1').entra === false && !(await page.$('#bv-hoy .pormarcar')) && !(await filasHoyBv()).some((t) => /Nadia/.test(t)) && /Nadia Nueva Marcar · no entra/.test(bvh),
      '✗ no entra: no sale en «Para hoy»', bvh.slice(0, 300));
    await page.click('#bv-hoy [data-sg="gestionAs"]');
    await esperar(200);
    let gm = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(/¿Quién entra a la secuencia\?/.test(gm) && /Por marcar · 2/.test(gm) && /Entran · 15/.test(gm) && /No entran · 2/.test(gm) && /Todos · 19/.test(gm), 'la lista cuenta por marcar, entran y no entran', gm.slice(0, 500));
    ok((await page.$$eval('#secas-lista .sec-row', (l) => l.map((x) => x.innerText))).length === 2 && /Quique Marcar Tambien[^]*Pedro Marcar Seguimiento/.test(await page.textContent('#secas-lista')), 'abre en los por marcar, los más nuevos primero');
    await page.screenshot({ path: '/tmp/bv-secuencia-lista.png' });
    await page.click('.modal [data-sg="secTodos"]');
    await esperar(150);
    ok(/¿Los 2 por marcar entran a la secuencia\?/.test(await page.textContent('.modal')) && await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-sg') === 'secTodosOk'),
      'marcar a todos pide confirmar, con el foco en confirmar');
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!!(await page.$('.modal')) && !!(await page.$('.modal [data-sg="secTodos"]')) && !hubo((l) => l.fn === 'wa_secuencia_marcar' && l.args.p_refs.length === 2), 'Escape cancela la confirmación sin cerrar la lista');
    await page.click('.modal [data-sg="secTodos"]');
    await page.click('.modal [data-sg="secTodosOk"]');
    await esperar(500);
    gm = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(hubo((l) => l.fn === 'wa_secuencia_marcar' && l.args.p_refs.length === 2 && l.args.p_entra === true) && secDe('asesor', 'n3').entra === true && secDe('asesor', 'n4').entra === true &&
      /2 asesores entraron a la secuencia\./.test(gm) && /No hay nadie por marcar\./.test(gm), 'los dos entran de una vez, con deshacer', gm.slice(0, 600));
    await page.click('.modal [data-sg="secLoteDeshacer"]');
    await esperar(500);
    ok(secDe('asesor', 'n3').entra === null && secDe('asesor', 'n4').entra === null && /Por marcar · 2/.test(await page.textContent('.modal')), 'deshacer los devuelve a por marcar');
    // si marcar a todos falla mientras se mira la ficha de alguien, al volver la lista no dice que entraron
    errorSec = 'falla de prueba'; retrasoSec = 900;
    await page.click('.modal [data-sg="secTodos"]');
    await page.click('.modal [data-sg="secTodosOk"]');
    await page.click('.modal [data-sg="secFiltro"][data-f="todos"]');
    await page.click('#secas-lista .sg-nom[data-id="n4"]');
    await esperar(1300);
    ok(/Quique Marcar Tambien/.test(await page.textContent('.modal')) && secDe('asesor', 'n4').entra === null && /No se guardó/.test(await toast()), 'si falla, la ficha vuelve a por marcar y lo dice');
    await page.keyboard.press('Escape');
    await esperar(150);
    gm = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(/¿Quién entra a la secuencia\?/.test(gm) && !/entraron a la secuencia/.test(gm) && /Por marcar · 2/.test(gm), 'y al volver, la lista no dice que entraron', gm.slice(0, 400));
    errorSec = null; retrasoSec = 0;
    await page.fill('#secas-busca', 'norma');
    await esperar(150);
    ok((await page.$$('#secas-lista .sec-row')).length === 1 && (await page.evaluate(() => document.activeElement.id)) === 'secas-busca', 'busca en la lista sin perder el foco');
    ok((await page.getAttribute('#secas-lista [data-id="n2"][data-v="no"]', 'aria-pressed')) === 'true', 'Norma aparece con ✗');
    await page.click('#secas-lista [data-sg="secAs"][data-id="n2"][data-v="si"]');
    await esperar(500);
    ok(secDe('asesor', 'n2').entra === true && (await page.getAttribute('#secas-lista [data-id="n2"][data-v="si"]', 'aria-pressed')) === 'true', 'cambia de ✗ a ✓ en la lista');
    // ✗ y enseguida ✓: aunque la primera tarde más en llegar, queda la última que se tocó
    retrasoSecPor['false'] = 700;
    await page.click('#secas-lista [data-sg="secAs"][data-id="n2"][data-v="no"]');
    await page.click('#secas-lista [data-sg="secAs"][data-id="n2"][data-v="si"]');
    await esperar(1300);
    ok(secDe('asesor', 'n2').entra === true && (await page.getAttribute('#secas-lista [data-id="n2"][data-v="si"]', 'aria-pressed')) === 'true', 'las marcas salen en orden: queda la última que se tocó');
    delete retrasoSecPor['false'];
    await page.click('#secas-lista .sg-nom[data-id="n2"]');
    await esperar(200);
    const fn2 = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(/Norma No Entra/.test(fn2) && /Secuencia\s*✓ Entra · Norma No Entra\s*✗ No entra · Norma No Entra\s*desde el 21 oct/.test(fn2) && /Le toca: Va una semana/.test(fn2), 'su ficha dice que entra desde hoy y qué le toca', fn2.slice(0, 600));
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(/¿Quién entra a la secuencia\?/.test(await page.textContent('.modal')) && (await page.inputValue('#secas-busca')) === 'norma' &&
      await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-id') === 'n2'), 'al cerrar la ficha vuelve a la lista como estaba');
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!(await page.$('.modal')), 'y Escape cierra la lista');
    await page.click('#tab-sg');
    await esperar(150);
    let sgh = (await page.textContent('#vista-sg')).replace(/\s+/g, ' ');
    ok(/^Va una semana/.test(await grupoDe('n2')) && /¿Entran a la secuencia\? 2/.test(sgh) && !!(await page.$('#vista-sg .pormarcar-row [data-id="n3"]')), 'al entrar le toca su mensaje; en seguimiento también salen los por marcar', sgh.slice(0, 400));
    await page.click('#vista-sg .sg-items .sg-nom[data-id="s1"]');
    await esperar(200);
    await page.click('.modal [data-sg="secAs"][data-v="no"]');
    await esperar(500);
    const fs1 = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(/No entra a la secuencia: no se le propone ningún mensaje/.test(fs1) && (await page.getAttribute('.modal [data-sg="secAs"][data-v="no"]', 'aria-pressed')) === 'true' && secDe('asesor', 's1').entra === false,
      'desde su ficha: ✗ y ya no se le propone nada', fs1.slice(0, 500));
    ok(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-sg') === 'secAs' && document.activeElement.getAttribute('data-v') === 'no'), 'el foco sigue en lo que tocó');
    await page.keyboard.press('Escape');
    await esperar(150);
    sgh = (await page.textContent('#vista-sg')).replace(/\s+/g, ' ');
    ok(!(await page.$('#vista-sg .sg-items .sg-nom[data-id="s1"]')) && !(await page.$('#sg-lista .sg-row[data-id="s1"]')) && /1 asesor no entra a la secuencia: no salen en la lista\./.test(sgh),
      'sale de «Para hoy» y de la lista, y lo dice', sgh.slice(-500));
    await page.fill('#sg-busca', 'sara');
    await esperar(150);
    ok(/Sara Uno Semana.*No entra a la secuencia/.test((await page.textContent('#sg-lista')).replace(/\s+/g, ' ')), 'al buscarla sí sale, con su marca');
    await page.fill('#sg-busca', '');
    await esperar(100);
    ok(/Marcados hoy \d+/.test(sgh) && /Sara Uno Semana · no entra/.test(sgh), 'lo cambiado hoy queda para deshacer', sgh.slice(0, 600));
    await page.click('#vista-sg [data-sg="secDeshacer"][data-id="s1"]');
    await esperar(500);
    sgh = (await page.textContent('#vista-sg')).replace(/\s+/g, ' ');
    ok(secDe('asesor', 's1').entra === true && !/Sara Uno Semana · /.test(sgh) && /^Va una semana/.test(await grupoDe('s1')), 'deshacer vuelve a como estaba antes de hoy (entraba), no a por marcar', sgh.slice(0, 500));
    // doble toque en un por marcar: la fila se va y la de abajo sube, pero el segundo toque no la marca
    await page.dblclick('#vista-sg .pormarcar-row [data-sg="secAs"][data-id="n4"][data-v="si"]');
    await esperar(600);
    ok(secDe('asesor', 'n4').entra === true && secDe('asesor', 'n3').entra === null && !!(await page.$('#vista-sg .pormarcar-row [data-id="n3"]')), 'un doble toque marca solo a quien se tocó');
    await esperar(400);                                   // pasada la pausa del doble toque
    // al repintar, el foco vuelve al mismo control y en la misma lista (Sofía sale en «Para hoy» y en la lista)
    await page.evaluate(() => document.querySelector('#sg-lista .sg-row[data-id="s2"]').focus());
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await esperar(150);
    ok(await page.evaluate(() => { const a = document.activeElement; return !!a && a.getAttribute('data-id') === 's2' && !!a.closest('#sg-lista'); }), 'al repintar, el foco sigue en la misma fila de la lista');
    await page.evaluate(() => { delete document.hidden; });
    errorSec = 'falla de prueba';
    await page.click('#vista-sg .pormarcar-row [data-sg="secAs"][data-id="n3"][data-v="si"]');
    await esperar(500);
    ok(/No se guardó: falla de prueba/.test(await toast()) && !!(await page.$('#vista-sg .pormarcar-row [data-id="n3"]')) && secDe('asesor', 'n3').entra === null, 'si no se guarda, vuelve a como estaba y lo dice', await toast());
    errorSec = null;
    await esperar(400);                                   // pasada la pausa del toque anterior
    // marca mientras llega una carga que salió antes: no se pierde
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.setFixedTime(new Date(AHORA.getTime() + 120000));
    retrasoDatos = 1200;
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await esperar(100);
    await page.click('#vista-sg .pormarcar-row [data-sg="secAs"][data-id="n3"][data-v="si"]');
    await esperar(1500);
    ok(!(await page.$('#vista-sg .pormarcar-row [data-id="n3"]')), 'una carga que salió antes de marcar no la devuelve a por marcar');
    await esperar(1400);
    ok(!(await page.$('#vista-sg .pormarcar-row [data-id="n3"]')) && secDe('asesor', 'n3').entra === true && !!(await page.$('#vista-sg .sg-items .sg-nom[data-id="n3"]')), 'y al terminar de cargar sigue marcada, con su mensaje');
    retrasoDatos = 0;
    await page.evaluate(() => { delete document.hidden; });
    await page.clock.setFixedTime(AHORA);

    console.log('Enlace desde Nivel Cero');
    db.mensajes.push({ id: nuevoId(), ins: 's9', paso: 'botella', modo: 'whatsapp', texto: null, en: '2026-10-17', anulado: false });
    await page.goto(base + '?desde=n0#a=s8&paso=recoger');
    await page.waitForSelector('.modal');
    ficha = await page.textContent('.modal');
    ok(await page.isVisible('#vista-sg') && /Fanny Quispe Chaucca/.test(ficha) && /Elegiste: Recoger la botella/.test(ficha) && /Hola Fanny, tu botella de acero ya te espera en la oficina/.test(ficha),
      'abre su ficha con el aviso para recoger la botella', ficha.slice(0, 300));
    ok((await page.evaluate(() => location.hash)) === '', 'y limpia el enlace');
    const uF = await popup('.modal a[data-envio="recoger"]');
    ok(/^https:\/\/wa\.me\/51959000008\?text=Hola Fanny, tu botella/.test(uF) && vivos('s8', 'recoger').length === 1, 'y lo manda por WhatsApp', uF.slice(0, 100));
    ficha = await page.textContent('.modal');
    ok(!/Elegiste/.test(ficha) && !(await page.$('.modal a[data-envio="recoger"]')) && /Recoger la botella · 21 oct · WhatsApp/.test(ficha), 'después de mandarlo, el aviso elegido no queda para mandarlo otra vez', ficha.slice(0, 400));
    ok(!(await page.$('#vista-sg .sg-nom[data-id="s9"]')), 'a quien ya se felicitó por la botella no se le vuelve a felicitar al ganar el Empiece Ya');
    await page.keyboard.press('Escape');
    await page.goto(base + '?raro=1#a=s8&paso=constructor');
    await page.waitForSelector('.modal');
    ficha = await page.textContent('.modal');
    ok(/Fanny Quispe Chaucca/.test(ficha) && !/undefined|Elegiste/.test(ficha), 'un paso que no existe no se elige', ficha.slice(0, 200));
    await page.keyboard.press('Escape');
    await page.goto(base + '?desde=n0b#a=s6');
    await page.waitForFunction(() => document.getElementById('asesor-sel').value === 's6');
    ok(await page.isVisible('#vista-bv') && (await page.inputValue('#nombre')) === 'Susana', 'si va en sus días 1 a 5, abre su bienvenida');
    await esperar(400);
    ok(await page.evaluate(() => { const r = document.getElementById('dia-4').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }), 'en el día que le toca');
    // desde la plataforma o desde Nivel Cero, con un código de traspaso y el enlace a la persona
    await page.evaluate(() => localStorage.removeItem('wa-bv-token'));
    await page.goto(base + '?tr=1#traspaso=11111111-2222-4333-8444-555555555555&a=s6');
    await page.waitForFunction(() => document.getElementById('asesor-sel').value === 's6', null, { timeout: 5000 }).catch(() => {});
    ok(traspasos === 1 && (await page.evaluate(() => localStorage.getItem('wa-bv-token'))) === 'tok-1' && (await page.inputValue('#asesor-sel')) === 's6' &&
      (await page.evaluate(() => document.documentElement.style.visibility)) !== 'hidden', 'con traspaso entra solo y abre a la persona del enlace');
    ok((await page.evaluate(() => location.hash)) === '', 'y el código no queda en la dirección');
    await page.goto(base + '?tr=2#traspaso=11111111-2222-4333-8444-555555555556&a=s5');
    await page.waitForSelector('.modal', { timeout: 5000 }).catch(() => {});
    ok(traspasos === 2 && /Simon Cinco Activo/.test((await page.textContent('.modal').catch(() => '')) || ''), 'también si ya tenía sesión: no pierde el enlace');
    await page.keyboard.press('Escape');
    ponerSec('asesor', 'n4', null);                       // vuelve a por marcar
    await page.goto(base + '?desde=n0c#a=n4');
    await page.waitForSelector('.modal');
    ficha = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(await page.isVisible('#vista-sg') && /Quique Marcar Tambien/.test(ficha) && /Por marcar: hasta que marques arriba que entra/.test(ficha), 'si falta marcarlo, el enlace abre su ficha para decidir', ficha.slice(0, 300));
    await page.keyboard.press('Escape');
    await page.goto(base + '?desde=n0d#a=n1');
    await page.waitForSelector('.modal');
    ok(await page.isVisible('#vista-bv') && /Nadia Nueva Marcar/.test(await page.textContent('.modal')) && (await page.inputValue('#asesor-sel')) !== 'n1',
      'y si no entra, también su ficha (no su bienvenida), aunque vaya en sus días 1 a 5');
    await page.keyboard.press('Escape');
    errorAsesores = 'tiempo de espera agotado';
    await page.goto(base + '?err=1');
    await page.waitForFunction(() => !document.getElementById('bv-hoy').hidden);
    ok(/No se pudo leer la lista de Nivel Cero \(tiempo de espera agotado\)/.test(await page.textContent('#bv-hoy')) && /No se pudo leer la lista/.test(await page.textContent('#asesor-hint')),
      'si falla la lista de Nivel Cero lo dice, no muestra una lista vacía', await page.textContent('#bv-hoy'));
    errorAsesores = null;
    ponerSec('asesor', 'n1', null);                       // vuelve a por marcar: para ver el recuadro en el celular chico
    ['UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS'].forEach((n, i) => db.ins.push({ id: 'x' + (i + 1), nombre: 'XIMENA EXTRA ' + n, celular: '95900004' + i, fecha_inscripcion: '2026-10-19', codigo: null }));
    await page.goto(base + '?ok=1');
    await page.waitForFunction(() => !document.getElementById('bv-hoy').hidden);

    console.log('Celular chico');
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const v of ['bv', 'sg']) {
        await page.click('#tab-' + v);
        await esperar(150);
        const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
        ok(ancho <= w, 'sin scroll horizontal a ' + w + ' px · ' + (v === 'bv' ? 'bienvenida' : 'seguimiento'), ancho);
      }
    }
    await page.click('#vista-sg .sg-row[data-id="s2"]');
    await esperar(200);
    ok(await page.evaluate(() => { const m = document.querySelector('.modal'); return m && m.scrollWidth <= m.clientWidth; }), 'la ficha cabe a 360 px');
    await page.screenshot({ path: '/tmp/bv-ficha-360.png' });
    await page.keyboard.press('Escape');
    await page.click('#tab-bv');
    await esperar(150);
    ok(!!(await page.$('#bv-hoy .pormarcar-row [data-id="n1"]')) && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 360, 'el recuadro de por marcar cabe a 360 px');
    ok((await page.$$('#bv-hoy .pormarcar-row')).length === 6 && /Ver los 8 por marcar/.test(await page.textContent('#bv-hoy .pormarcar')) && /¿Entran a la secuencia\?\s*7/.test(await page.textContent('#bv-hoy')),
      'con más de 6 muestra los 6 más nuevos y lleva a la lista completa', await page.textContent('#bv-hoy .pormarcar'));
    await (await page.$('#bv-hoy')).screenshot({ path: '/tmp/bv-secuencia-360.png' });
    await page.click('#bv-hoy [data-sg="gestionAs"]');
    await esperar(200);
    await page.click('.modal [data-sg="secFiltro"][data-f="todos"]');
    await esperar(150);
    ok(await page.evaluate(() => { const m = document.querySelector('.modal'); return m && m.scrollWidth <= m.clientWidth; }), 'la lista de la secuencia cabe a 360 px');
    await page.screenshot({ path: '/tmp/bv-secuencia-lista-360.png' });
    await page.keyboard.press('Escape');
    await page.click('#tab-sg');
    await esperar(150);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: '/tmp/bv-seguimiento-oscuro.png' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 400, height: 900 });

    console.log('Cola sin señal');
    await page.click('#tab-sg');
    await esperar(150);
    cortar = 2;
    await page.click('#vista-sg [data-sg="omitir"][data-id="s2"]');
    await esperar(700);
    ok((await page.evaluate(() => JSON.parse(localStorage.getItem('wa-bv-envios') || '[]').length)) === 1, 'sin señal queda en la cola');
    sesionInvalida = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForSelector('#vista-login:not([hidden])', { timeout: 3000 }).catch(() => {});
    ok((await page.isVisible('#vista-login')) && (await page.evaluate(() => JSON.parse(localStorage.getItem('wa-bv-envios') || '[]').length)) === 1 && vivos('s2', 'quedan15').length === 0,
      'si la sesión se cerró al reintentar, el envío sigue en la cola');
    sesionInvalida = false;
    await page.fill('#clave', 'secreta');
    await page.click('#btn-entrar');
    await page.waitForSelector('#vista-app:not([hidden])');
    await esperar(800);
    ok(vivos('s2', 'quedan15').length === 1 && (await page.evaluate(() => localStorage.getItem('wa-bv-envios'))) === null, 'y al volver a entrar se anota');

    console.log('Clientes · bienvenida');
    await page.goto(base);
    await page.waitForSelector('#vista-app:not([hidden])');
    await page.waitForFunction(() => !document.getElementById('cuenta-cl').hidden);
    ok(await page.isVisible('#grupo-cl') && (await page.textContent('#cuenta-cl')).trim().startsWith('7'), 'el grupo Clientes muestra cuántos mensajes tocan hoy', await page.textContent('#cuenta-cl'));
    ok(await page.isVisible('#horario-panel') && !(await page.isVisible('#vistas-cl')), 'en Asesores se ve el horario y no las pestañas de clientes');
    await page.click('#grupo-cl');
    await esperar(200);
    ok(await page.isVisible('#vista-cb') && await page.isVisible('#vistas-cl') && !(await page.isVisible('#vistas-as')) && !(await page.isVisible('#horario-panel')) && !(await page.isVisible('#lead-as')) && await page.isVisible('#lead-cl'),
      'Clientes cambia pestañas y textos de cabecera');
    let cb = await page.textContent('#vista-cb');
    ok(/Para hoy\s*5/.test(cb.replace(/\s+/g, ' ')) && /Al recibir su pedido\s*3/.test(cb.replace(/\s+/g, ' ')) && /Una semana · Nutri Sensor\s*1/.test(cb.replace(/\s+/g, ' ')) && /Un mes antes de terminar sus cuotas\s*1/.test(cb.replace(/\s+/g, ' ')),
      'para hoy: 3 al recibir (Rosa hoy, Juan, Ana; la de Carmen ya caducó), 1 semana (Juan), 1 fin de cuotas (Carmen)', cb.slice(0, 500));
    const rosa = await page.textContent('#vista-cb .sg-item:has(.sg-nom[data-id="c1"])');
    ok(/Rosa Flores Mamani/.test(rosa) && /Próximo · toca hoy/.test(rosa) && /Recibió el mié 21 oct · Juego Gourmet 17 Piezas \+ Sartén Grande/.test(rosa), 'Rosa recibió hoy', rosa.slice(0, 300));
    ok(/¡Hola Rosa! 🎉 Gracias por confiar en Rena Ware\. Ya tienes en casa tu Juego Gourmet 17 Piezas \+ Sartén Grande c\/tapa 30 cm \+ Aqua Nano CTU-500\./.test(rosa) && /🍲 Ollas: lávalas/.test(rosa) && /🍳 Sartenes: puedes freír/.test(rosa) && /💧 Filtro: te mando/.test(rosa) && !/Cocina de inducción|Olla a presión/.test(rosa),
      'su texto va con el trato por defecto (tú) y trae solo las recomendaciones de lo que compró', rosa.slice(0, 600));
    const juan = await page.textContent('#vista-cb .sg-item:has(.sg-nom[data-id="c2"]):has([data-clave="9002::bienvenida"])');
    ok(/Vencido · tocaba hace 9 días/.test(juan) && /¡Hola Juan! 🎉 Gracias por confiar en Rena Ware\. Ya tienes en casa tu Juego Chef I 7 Piezas \+ Olla A Presión 8 L/.test(juan) && /⏱️ Olla a presión: revisa/.test(juan),
      'Juan va de tú y con la recomendación de la olla a presión', juan.slice(0, 500));
    const ana = await page.textContent('#vista-cb .sg-item:has(.sg-nom[data-id="c5"])');
    ok(/sin celular/.test(ana) && /Copiar texto/.test(ana) && !/WhatsApp/.test(ana), 'sin celular ofrece copiar el texto');
    const carmen = await page.textContent('#vista-cb .sg-item:has([data-clave="9003::fincuotas"])');
    ok(/Pedido del sáb 1 nov · 12 cuotas/.test(carmen) && /Estás a un mes de terminar de pagar tu Aqua Nano CTU-500 \+ Juego Chef II 7 Piezas \+ Botella Filtrante Rena Ware \(12 cuotas\)/.test(carmen), 'fin de cuotas con sus cuotas', carmen.slice(0, 400));
    ok(await page.isVisible('#files-11') && await page.isVisible('#add-11') && (await page.textContent('#clp-11')).includes('Al recibir su pedido'), 'cada paso tiene su tarjeta con archivos para subir');
    const uR = await popup('#vista-cb a[data-envio-cl="9001::bienvenida"]');
    ok(/^https:\/\/wa\.me\/51959111001\?text=¡Hola Rosa! 🎉/.test(uR), 'WhatsApp abre el chat de Rosa con el texto', uR.slice(0, 120));
    ok(hubo((l) => l.fn === 'wa_cl_envio_registrar' && l.args.p_n_orden === 9001 && l.args.p_tipo === 'bienvenida' && l.args.p_modo === 'whatsapp' && /Rosa/.test(l.args.p_texto)), 'y lo anota en crm_seguimiento por wa_cl_envio_registrar');
    cb = await page.textContent('#vista-cb');
    ok(!(await page.$('#vista-cb a[data-envio-cl="9001::bienvenida"]')) && /Anotado hoy\s*1/.test(cb.replace(/\s+/g, ' ')) && /Rosa Flores Mamani · Al recibir su pedido · WhatsApp/.test(cb), 'Rosa sale de para hoy y queda en lo anotado', cb.slice(0, 300));
    await page.click('#vista-cb [data-sg="clAviso"][data-clave="9002::semana1"]');
    await esperar(400);
    await page.click('#vista-cb [data-sg="clOmitir"][data-clave="9002::bienvenida"]');
    await esperar(400);
    cb = await page.textContent('#vista-cb');
    ok(!(await page.$('#vista-cb .sg-item [data-clave="9002::semana1"]')) && !(await page.$('#vista-cb .sg-item [data-clave="9002::bienvenida"]')) && /Juan Perez Quispe · Una semana · Nutri Sensor · en persona/.test(cb) && /Juan Perez Quispe · Al recibir su pedido · omitido/.test(cb),
      'le avisé en persona y omitir se anotan', cb.replace(/\s+/g, ' ').slice(0, 600));
    ok(db.cl.seg.filter((g) => g.n_orden === 9002 && !g.anulado).length === 2, 'dos gestiones de Juan en el servidor');
    await page.click('#vista-cb .hist li:has-text("omitido") [data-sg="clAnular"]');
    await esperar(400);
    cb = await page.textContent('#vista-cb');
    ok(hubo((l) => l.fn === 'wa_cl_envio_anular') && (await page.$('#vista-cb [data-clave="9002::bienvenida"]')) !== null, 'deshacer devuelve el pendiente', cb.slice(0, 200));
    await page.screenshot({ path: '/tmp/bv-clientes.png', fullPage: true });

    console.log('Clientes · filtros');
    await page.click('#tab-cs');
    await esperar(200);
    let cs = await page.textContent('#vista-cs');
    ok(await page.isVisible('#vista-cs') && /Cambio de pre-filtro\s*2/.test(cs.replace(/\s+/g, ' ')) && !/Cambio del filtro principal\s*\d/.test(cs.replace(/\s+/g, ' ')), 'para hoy: 2 pre-filtros (Carmen próxima, Luis vencido)', cs.slice(0, 400));
    const luis = await page.textContent('#vista-cs .sg-item:has([data-clave="c4::prefiltro"])');
    ok(/Vencido · tocaba hace 36 días/.test(luis) && /repuesto comprado el lun 15 set · cada 12 meses/.test(luis) && /Tu Aqua Nano cumple un año desde el lunes 15 de setiembre/.test(luis) && /Aqua Nano CTU-500 \+ Juego Chef II 7 Piezas/.test(luis),
      'el ciclo de Luis corre desde el repuesto que compró, no desde el sistema', luis.slice(0, 400));
    const carmenP = await page.textContent('#vista-cs .sg-item:has([data-clave="c3::prefiltro"])');
    ok(/Próximo · toca en 9 días/.test(carmenP) && /desde la entrega del jue 30 oct/.test(carmenP), 'Carmen: próximo, desde la entrega', carmenP.slice(0, 300));
    ok(/Todos los filtros\s*6/.test(cs.replace(/\s+/g, ' ')) && /Al día/.test(cs), 'la lista trae los 6 ciclos (Rosa, Carmen y Luis, 2 cada uno)', cs.replace(/\s+/g, ' ').slice(0, 300));
    await page.click('#vista-cs [data-sg="clCambio"][data-clave="c4::prefiltro"]');
    await esperar(200);
    ok(await page.isVisible('#clFecha') && (await page.inputValue('#clFecha')) === HOY, 'Cambio hecho pide la fecha, con hoy por defecto');
    await page.fill('#clFecha', sumar(HOY, -2));
    await page.click('#vista-cs [data-sg="clCambioOk"][data-clave="c4::prefiltro"]');
    await esperar(500);
    cs = await page.textContent('#vista-cs');
    ok(hubo((l) => l.fn === 'wa_cl_envio_registrar' && l.args.p_n_orden === 9004 && l.args.p_tipo === 'prefiltro' && l.args.p_modo === 'cambio' && l.args.p_fecha === sumar(HOY, -2)), 'anota el cambio con esa fecha en la orden del sistema');
    ok(!(await page.$('#vista-cs .sg-item:has([data-clave="c4::prefiltro"])')) && /Cambio anotado/.test(await toast()) && /Luis Vencido Torres[^]{0,200}Al día/.test(await page.textContent('#cs-lista')), 'Luis sale de para hoy: su ciclo vuelve a empezar y queda al día', cs.slice(0, 300));
    const uC = await popup('#vista-cs a[data-envio-cl="c3::prefiltro"]');
    ok(/^https:\/\/wa\.me\/51959111003\?text=Hola Carmen, te saludamos de Rena Ware 💧/.test(uC) && hubo((l) => l.fn === 'wa_cl_envio_registrar' && l.args.p_n_orden === 9003 && l.args.p_tipo === 'prefiltro' && l.args.p_modo === 'whatsapp'), 'avisa a Carmen por WhatsApp y lo anota', uC.slice(0, 120));
    cs = await page.textContent('#vista-cs');
    ok(/Avisados, esperando el cambio\s*1/.test(cs.replace(/\s+/g, ' ')) && (await page.textContent('#vista-cs .sg-item:has([data-clave="c3::prefiltro"])')).includes('Avisado el 21 oct'), 'Carmen pasa a avisados, esperando el cambio', cs.slice(0, 500));
    await page.fill('#cs-busca', 'luis');
    await esperar(150);
    ok((await page.$$('#cs-lista .sg-row')).length === 2 && /Luis Vencido Torres/.test(await page.textContent('#cs-lista')) && !/Carmen/.test(await page.textContent('#cs-lista')), 'la búsqueda filtra la lista');
    await page.fill('#cs-busca', '');
    await esperar(150);

    console.log('Clientes · ficha y editor');
    await page.click('#vista-cs .sg-row[data-id="c3"]');
    await esperar(250);
    let fcl = await page.textContent('.modal');
    ok(/Carmen Quispe Choque/.test(fcl) && /Miraflores · 1 compra/.test(fcl) && /959111003/.test(fcl) && /Asesor\(a\)\s*Olga Quispe/.test(fcl.replace(/\s+/g, ' ')), 'la ficha trae sus datos', fcl.slice(0, 300));
    ok(/30 oct · Aqua Nano CTU-500 \+ Juego Chef II 7 Piezas \+ Botella Filtrante Rena Ware · S\/ 6,?169 · 12 cuotas/.test(fcl.replace(/\s+/g, ' ')), 'y lo que compró', fcl.slice(0, 600));
    ok(/Pre-filtro/.test(fcl) && /Filtro principal/.test(fcl) && /Avisado el 21 oct/.test(fcl) && /Al día/.test(fcl), 'con sus dos filtros y su estado', fcl.slice(0, 900));
    ok(/Un mes antes de terminar sus cuotas/.test(fcl) && /Vencido · tocaba hace 20 días/.test(fcl), 'y el aviso de fin de cuotas pendiente');
    const hrefFin = async () => decodeURIComponent(await page.getAttribute('.modal a[data-envio-cl="9003::fincuotas"]', 'href'));
    ok(/Hola Carmen, ¡te felicitamos!/.test(await hrefFin()), 'sus textos van con el trato por defecto', await hrefFin());
    await page.click('.modal .chip[data-sg="tratoCl"][data-t="usted"]');
    await esperar(400);
    fcl = await page.textContent('.modal');
    ok(hubo((l) => l.fn === 'wa_cl_trato_guardar' && l.args.p_cliente === 'c3' && l.args.p_trato === 'usted') && /Hola Carmen, ¡le felicitamos!/.test(await hrefFin()), 'cambia a usted solo para ella y los textos cambian', await hrefFin());
    await page.click('.modal [data-sg="clNoAplica"][data-clave="c3::filtroppal"]');
    await esperar(400);
    fcl = await page.textContent('.modal');
    ok(/Ya no aplica/.test(fcl) && /Marcado como «ya no aplica» el 21 oct/.test(fcl) && /reabrir/.test(fcl), 'ya no aplica cierra el ciclo y deja reabrir', fcl.slice(0, 900));
    await page.click('.modal [data-sg="verOtrosCl"]');
    await page.click('.modal .chip[data-sg="elegirPasoCl"][data-k="cl_mes1"]');
    await esperar(150);
    fcl = await page.textContent('.modal');
    ok(/Elegiste: Un mes · brillo y Rena Lite/.test(fcl) && /Hola Carmen, ya va un mes con sus ollas Rena Ware ✨/.test(fcl) && /Av\. Cayma 628, Of\. 502, a media cuadra de la Av\. Ejército/.test(fcl), 'puede mandar otro mensaje a mano, con la dirección de la oficina', fcl.slice(0, 500));
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!!(await page.$('.modal')) && !/Elegiste/.test(await page.textContent('.modal')), 'Escape primero cierra el mensaje elegido');
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!(await page.$('.modal')), 'y luego la ficha');
    await page.click('#vista-cs .panel [data-sg="editorCl"]');
    await esperar(200);
    let edc = await page.textContent('.modal');
    ok(/Mensajes a clientes/.test(edc) && /Bienvenida del cliente/.test(edc) && /Recomendaciones según lo que compró/.test(edc) && /Cambio de filtros/.test(edc) && /\{recomendaciones\}/.test(edc), 'el editor de clientes tiene sus tres grupos y marcadores', edc.slice(0, 300));
    await page.click('.modal [data-sg="abrirPaso"][data-k="cl_prefiltro"]');
    await esperar(200);
    edc = await page.textContent('.modal');
    ok(await page.isVisible('#mTexto') && /Así le llegaría a (Rosa|Carmen|Luis)/.test(edc) && (await page.textContent('#mPrev')).includes('Aqua Nano cumple un año desde el'), 'abre el pre-filtro con vista previa de un cliente real', edc.replace(/\s+/g, ' ').slice(-700));
    await page.click('.modal .chip.mk[data-m="{vence}"]');
    await esperar(100);
    ok((await page.inputValue('#mTexto')).endsWith('{vence}') && /\d{1,2} de \w+( de \d{4})?\.?$/.test((await page.textContent('#mPrev')).trim()), 'inserta {vence} y la vista previa lo llena', await page.textContent('#mPrev'));
    await page.click('.modal [data-sg="guardarPaso"]');
    await esperar(400);
    ok(hubo((l) => l.fn === 'wa_bv_plantilla_guardar' && l.args.p_clave === 'cl_prefiltro' && /\{vence\}$/.test((l.args.p_tu || '') + (l.args.p_usted || ''))), 'guarda la plantilla del cliente en n0_plantillas');
    await page.keyboard.press('Escape');
    await esperar(150);
    await page.goto(base + '?desde=pedidos#c=c3');
    await page.waitForSelector('.modal');
    fcl = await page.textContent('.modal');
    ok(await page.isVisible('#vista-cs') && /Carmen Quispe Choque/.test(fcl), 'el enlace #c= de Pedidos abre la ficha del cliente', fcl.slice(0, 200));
    ok((await page.evaluate(() => location.hash)) === '', 'y limpia el enlace');
    await page.keyboard.press('Escape');
    await esperar(150);

    console.log('Secuencia · clientes');
    const cuentaDe = async (sel) => Number((((await page.textContent(sel)) || '').trim().match(/^\d+/) || [0])[0]);
    await page.click('#tab-cb');
    await esperar(150);
    const cbAntes = await cuentaDe('#cuenta-cb');
    ok(/Todos los clientes entran a las secuencias\./.test(await page.textContent('#vista-cb')) && !!(await page.$('#vista-cb .sg-item .sg-nom[data-id="c2"]')), 'todos los clientes entran por defecto');
    await page.click('#vista-cb .sg-item .sg-nom[data-id="c2"]');
    await esperar(200);
    ok((await page.getAttribute('.modal [data-sg="secCl"][data-v="si"]', 'aria-pressed')) === 'true', 'su ficha lo muestra con ✓');
    await page.click('.modal [data-sg="secCl"][data-v="no"]');
    await esperar(500);
    const fj = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(hubo((l) => l.fn === 'wa_secuencia_marcar' && l.args.p_tipo === 'cliente' && l.args.p_refs[0] === 'c2' && l.args.p_entra === false) && secDe('cliente', 'c2').entra === false &&
      /No entra a las secuencias desde el 21 oct: no sale en «Para hoy»/.test(fj), '✗ lo saca de las secuencias, sin borrarlo', fj.slice(0, 300));
    ok(!(await page.$('.modal a[data-envio-cl]')) && !(await page.$('.modal [data-sg="clAviso"]')) && /Mandar otro mensaje/.test(fj), 'su ficha ya no le ofrece los mensajes de la secuencia (a mano, sí)');
    await page.keyboard.press('Escape');
    await esperar(150);
    let cbS = (await page.textContent('#vista-cb')).replace(/\s+/g, ' ');
    ok(!(await page.$('#vista-cb .sg-item .sg-nom[data-id="c2"]')) && /1 cliente no entra a las secuencias\./.test(cbS) && (await cuentaDe('#cuenta-cb')) === cbAntes - 1,
      'sale de «Para hoy» y la pestaña cuenta uno menos', cbS.slice(0, 300));
    await page.click('#vista-cb [data-sg="gestionCl"]');
    await esperar(200);
    let gcl = (await page.textContent('.modal')).replace(/\s+/g, ' ');
    ok(/Clientes en las secuencias/.test(gcl) && /No entran · 1/.test(gcl) && /Todos · 5/.test(gcl) && (await page.$$('#seccl-lista .sec-row')).length === 1 && /Juan Perez Quispe/.test(gcl),
      'la lista abre en los que no entran', gcl.slice(0, 500));
    await page.click('.modal [data-sg="secFiltro"][data-f="todos"]');
    await page.fill('#seccl-busca', '959111003');
    await esperar(150);
    ok((await page.$$('#seccl-lista .sec-row')).length === 1 && /Carmen Quispe Choque/.test(await page.textContent('#seccl-lista')), 'busca también por celular');
    await page.fill('#seccl-busca', '');
    await esperar(100);
    await page.click('.modal [data-sg="secFiltro"][data-f="no"]');
    await page.click('#seccl-lista [data-sg="secCl"][data-id="c2"][data-v="si"]');
    await esperar(500);
    ok(secDe('cliente', 'c2').entra === true && /Todos los clientes entran a las secuencias\./.test(await page.textContent('.modal')) && db.sec.filter((s) => s.ref === 'c2').length === 2, '✓ lo vuelve a incluir');
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!!(await page.$('#vista-cb .sg-item .sg-nom[data-id="c2"]')) && (await cuentaDe('#cuenta-cb')) === cbAntes, 'y vuelve a «Para hoy»');
    await page.click('#tab-cs');
    await esperar(150);
    await page.click('#cs-lista .sg-row[data-id="c3"]');
    await esperar(200);
    const avisoAntes = !!(await page.$('.modal a[data-envio-cl="c3::prefiltro"]')) && !!(await page.$('.modal a[data-envio-cl="9003::fincuotas"]'));
    await page.click('.modal [data-sg="secCl"][data-v="no"]');
    await esperar(500);
    ok(avisoAntes && !!(await page.$('.modal [data-sg="clCambio"][data-clave="c3::prefiltro"]')) && !(await page.$('.modal a[data-envio-cl="c3::prefiltro"]')) && !(await page.$('.modal a[data-envio-cl="9003::fincuotas"]')),
      'sus filtros siguen: se anota el cambio, pero ya no se le avisa');
    await page.keyboard.press('Escape');
    await esperar(150);
    ok(!(await page.$('#cs-lista .sg-row[data-id="c3"]')) && !(await page.$('#vista-cs .sg-item [data-clave="c3::prefiltro"]')) && /2 filtros son de clientes que no entran a las secuencias/.test(await page.textContent('#vista-cs')),
      'sale de la lista de filtros y de los avisados');
    await page.fill('#cs-busca', 'carmen');
    await esperar(150);
    ok((await page.$$('#cs-lista .sg-row')).length === 2 && /no entra/.test(await page.textContent('#cs-lista')), 'pero al buscarla sale, marcada');
    // anotar el cambio de filtro a quien no entra: aunque la respuesta traiga la marca de antes, sigue fuera
    await page.click('#cs-lista .sg-row[data-id="c3"]');
    await esperar(200);
    respuestaVieja = true;
    await page.click('.modal [data-sg="clCambio"][data-clave="c3::prefiltro"]');
    await page.click('.modal [data-sg="clCambioOk"][data-clave="c3::prefiltro"]');
    await esperar(600);
    respuestaVieja = false;
    ok(hubo((l) => l.fn === 'wa_cl_envio_registrar' && l.args.p_n_orden === 9003 && l.args.p_modo === 'cambio') && /No entra a las secuencias desde el 21 oct/.test(await page.textContent('.modal')) &&
      (await page.getAttribute('.modal [data-sg="secCl"][data-v="no"]', 'aria-pressed')) === 'true', 'anotar su cambio de filtro no la vuelve a meter');
    await page.keyboard.press('Escape');
    await esperar(150);
    await page.fill('#cs-busca', '');
    await esperar(100);
    ok(!(await page.$('#cs-lista .sg-row[data-id="c3"]')), 'y sigue fuera de la lista');
    // con muchos clientes la lista muestra los primeros y el buscador encuentra al resto
    for (let i = 1; i <= 70; i++) db.cl.clientes.push({ id: 'cx' + i, nombre: 'CLIENTE EXTRA ' + String(i).padStart(2, '0'), celular: '9591' + String(i).padStart(5, '0'), ciudad: 'Cayma, Arequipa', trato: null, ordenes: [] });
    await page.goto(base + '?muchos=1');
    await page.waitForFunction(() => !!document.querySelector('#vista-cs [data-sg="gestionCl"]'));
    await page.click('#vista-cs [data-sg="gestionCl"]');
    await esperar(200);
    await page.click('.modal [data-sg="secFiltro"][data-f="todos"]');
    await esperar(150);
    ok((await page.$$('#seccl-lista .sec-row')).length === 60 && /Se ven 60 de 75: busca por nombre o celular/.test(await page.textContent('#seccl-lista')), 'con 75 clientes muestra 60 y avisa', (await page.$$('#seccl-lista .sec-row')).length);
    await page.fill('#seccl-busca', 'extra 70');
    await esperar(150);
    ok((await page.$$('#seccl-lista .sec-row')).length === 1 && /Cliente Extra 70/.test(await page.textContent('#seccl-lista')), 'y el buscador encuentra a uno que no se veía');
    await page.keyboard.press('Escape');
    await esperar(150);
    await page.click('#grupo-as');
    await esperar(150);
    ok(await page.isVisible('#vistas-as') && ((await page.isVisible('#vista-bv')) || (await page.isVisible('#vista-sg'))) && await page.isVisible('#horario-panel') && !(await page.isVisible('#vista-cs')), 'volver a Asesores restaura su vista');

    console.log('Sesión');
    await page.click('#tab-bv');
    sesionInvalida = true;
    await page.click('#files-4 [data-act="editar"]');
    const d4 = await page.$('#files-4 textarea[data-field="descripcion"]');
    await d4.fill('Mira el video completo');
    await d4.press('Tab');
    await page.waitForSelector('#vista-login:not([hidden])', { timeout: 3000 }).catch(() => {});
    ok((await page.isVisible('#vista-login')) && (await page.textContent('#login-err')).includes('sesión'), 'si la sesión vence, vuelve al acceso');
    ok((await page.evaluate(() => localStorage.getItem('wa-bv-token'))) === null, 'borra la sesión vencida');

    ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } catch (e) {
    fallas++;
    console.log('  ✗ la prueba se cortó: ' + e.message);
  } finally {
    await browser.close();
    server.close();
    console.log('\n' + (total - fallas) + ' de ' + total + ' pruebas pasaron' + (fallas ? ' · ' + fallas + ' fallaron' : ''));
    process.exit(fallas ? 1 : 0);
  }
})();
