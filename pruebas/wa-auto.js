// Prueba de la función wa-auto (supabase/functions/wa-auto/index.ts) con un Supabase y un Kapso falsos.
// Las reglas (qué toca hoy) ya se prueban en prueba.js; aquí se prueba lo demás: plantillas, envío por partes,
// reintentos, estados del webhook, a quién se pasa cada respuesta y la baja.
// Uso: NODE_PATH=$(npm root -g) node pruebas/wa-auto.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

const RAIZ = path.join(__dirname, '..');
const SB = 'https://sb.prueba';
const KB = 'https://kapso.prueba/meta';
const PLAT = 'https://kapso.prueba/platform';
const TOKEN = '11111111-1111-1111-1111-111111111111';
let fallas = 0, total = 0;
function ok(c, t, extra) { total++; if (c) console.log('  ✓ ' + t); else { fallas++; console.log('  ✗ ' + t + (extra ? '\n      ' + extra : '')); } }

/* ---------------- base de datos falsa (lo justo de PostgREST) */
const uuid = () => crypto.randomUUID();
const db = { wa_auto_config: [], wa_auto_plantillas: [], wa_auto_envios: [], wa_auto_respuestas: [], wa_auto_corridas: [],
  wa_bv_ajustes: [{ id: 'vigente', data: { direccion: 'Av. Cayma 628, Of. 502', referencia: 'a media cuadra de la Av. Ejército' } }] };
const DEF = {
  wa_auto_plantillas: () => ({ id: uuid(), estado: 'borrador', idioma: 'es', ejemplos: [], botones: [], creado_en: new Date().toISOString() }),
  wa_auto_envios: () => ({ id: uuid(), fecha: HOY, parte: 1, partes: 1, params: [], estado: 'pendiente', intentos: 0, creado_en: new Date().toISOString() }),
  wa_auto_respuestas: () => ({ id: uuid(), recibido_en: new Date().toISOString(), estado: 'nueva', baja: false })
};
const UNICO = { wa_auto_plantillas: ['nombre'], wa_auto_respuestas: ['evento'], wa_auto_envios: ['wamid'] };
let HOY = '2026-11-05', HORA = '10:00';
function filtrar(filas, q) {
  let out = filas;
  for (const [k, v] of q) {
    if (['select', 'on_conflict', 'limit', 'order'].includes(k)) continue;
    const i = v.indexOf('.'), op = v.slice(0, i), val = v.slice(i + 1);
    out = out.filter((f) => {
      const x = f[k] == null ? null : String(f[k]);
      if (op === 'eq') return x === val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(x);
      if (op === 'gt') return x != null && x > val;
      if (op === 'gte') return x != null && x >= val;
      if (op === 'lte') return x != null && x <= val;
      throw new Error('op ' + op);
    });
  }
  const lim = q.get('limit');
  return lim ? out.slice(0, Number(lim)) : out;
}
const llamadas = [];
const contactos = {};          // celular → lo que devuelve wa_auto_contacto
let corridaEnCurso = false;
const RPC = {
  wa_auto_insumos: () => ({ hoy: HOY, hora: HORA, bv: {}, cl: {}, config: db.wa_auto_config[0], plantillas: db.wa_auto_plantillas.map((p) => ({ ...p })),
    recientes: db.wa_auto_envios.filter((e) => ['asesor', 'cliente'].includes(e.tipo)).map((e) => ({ ...e })) }),
  wa_auto_corrida_pedir: (a) => { const k = { id: uuid(), clave: uuid(), origen: a.p_origen, modo: a.p_modo }; db.wa_auto_corridas.push(k); return { id: k.id, clave: k.clave }; },
  wa_auto_corrida_iniciar: (a) => {
    const k = db.wa_auto_corridas.find((x) => x.id === a.p_id && x.clave === a.p_clave && !x.inicio);
    if (!k || corridaEnCurso) return null;
    k.inicio = Date.now();
    return k.modo || 'prueba';
  },
  wa_auto_corrida_cerrar: (a) => { const k = db.wa_auto_corridas.find((x) => x.id === a.p_id); Object.assign(k, { fin: Date.now(), resumen: a.p_resumen, error: a.p_error }); return null; },
  wa_auto_sesion: (a) => a.p_token === TOKEN,
  wa_auto_anotar_asesor: (a) => 'm-' + a.p_paso + '-' + a.p_inscrito,
  wa_auto_anotar_cliente: (a) => 's-' + a.p_tipo + '-' + a.p_n_orden,
  wa_auto_desanotar: () => null,
  wa_auto_baja: () => null,
  wa_auto_contacto: (a) => contactos[a.p_celular] || { de_tipo: 'desconocido' },
  wa_auto_secreto: () => secretoVault,
  wa_auto_secreto_guardar: (a) => { secretoVault = a.p_valor; return null; }
};
let secretoVault = '';
function supabase(url, init) {
  const u = new URL(url), metodo = (init && init.method) || 'GET', cuerpo = init && init.body ? JSON.parse(init.body) : null;
  if (u.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = u.pathname.split('/').pop();
    llamadas.push({ fn, args: cuerpo });
    if (!RPC[fn]) return [404, { message: 'no existe ' + fn }];
    return [200, RPC[fn](cuerpo || {})];
  }
  if (u.pathname.startsWith('/storage/v1/object/public/wa-media/')) return [200, 'BYTES'];
  const tabla = u.pathname.split('/').pop(), q = u.searchParams, filas = db[tabla];
  if (!filas) return [404, { message: 'tabla ' + tabla }];
  if (metodo === 'GET') return [200, filtrar(filas, q).map((f) => ({ ...f }))];
  if (metodo === 'PATCH') { const l = filtrar(filas, q); l.forEach((f) => Object.assign(f, cuerpo)); return [200, l.map((f) => ({ ...f }))]; }
  if (metodo === 'POST') {
    const ignorar = /ignore-duplicates/.test((init.headers || {}).Prefer || ''), out = [];
    for (const f of (Array.isArray(cuerpo) ? cuerpo : [cuerpo])) {
      const choca = (UNICO[tabla] || []).some((c) => f[c] != null && filas.some((x) => x[c] === f[c]));
      // el índice único del día: (fecha, tipo, ref, paso, parte) para asesor y cliente
      const dia = tabla === 'wa_auto_envios' && ['asesor', 'cliente'].includes(f.tipo) &&
        filas.some((x) => x.fecha === (f.fecha || HOY) && x.tipo === f.tipo && x.ref === f.ref && x.paso === f.paso && Number(x.parte) === Number(f.parte || 1));
      if (choca || dia) { if (ignorar) continue; return [409, { message: 'duplicate key value violates unique constraint' }]; }
      const fila = { ...(DEF[tabla] ? DEF[tabla]() : {}), ...f };
      filas.push(fila);
      out.push({ ...fila });
    }
    return [201, out];
  }
  return [405, {}];
}

/* ---------------- Kapso falso */
const K = { perfil: { about: 'Hola', vertical: 'UNDEFINED' }, perfilCambios: [], plantillas: new Map(), mensajes: [], subidaFalla: true, fallarEnvio: null, hooks: [], numeros: [{ id: 'k1', phone_number_id: 'PN1', business_account_id: 'WABA1', display_phone_number: '+51 900 000 000', verified_name: 'Equipo Arequipa' }] };
let nWamid = 0;
function kapso(url, init) {
  const u = new URL(url), metodo = (init && init.method) || 'GET';
  const cuerpo = init && init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const llave = (init.headers || {})['X-API-Key'];
  if (llave !== 'kapso-clave') return [401, { error: 'Unauthorized' }];
  const p = u.pathname.replace(/^\/(meta|platform)/, '');
  if (url.startsWith(PLAT)) {
    if (p === '/whatsapp/phone_numbers') return [200, { data: K.numeros }];
    const m = /^\/whatsapp\/phone_numbers\/([^/]+)\/webhooks(\/([^/]+))?$/.exec(p);
    if (m && metodo === 'GET') return [200, { data: K.hooks }];
    if (m && metodo === 'POST') { const w = { id: 'w' + (K.hooks.length + 1), ...cuerpo.whatsapp_webhook }; K.hooks.push(w); return [201, { data: w }]; }
    if (m && metodo === 'PATCH') { const w = K.hooks.find((x) => x.id === m[3]); Object.assign(w, cuerpo.whatsapp_webhook); return [200, { data: w }]; }
    return [404, { error: 'no ' + p }];
  }
  if (p === '/PN1/whatsapp_business_profile' && metodo === 'GET') return [200, { data: [Object.assign({}, K.perfil)] }];
  if (p === '/PN1/whatsapp_business_profile' && metodo === 'POST') { K.perfilCambios.push(cuerpo); Object.assign(K.perfil, cuerpo); delete K.perfil.messaging_product; return [200, { success: true }]; }
  if (p === '/WABA1/message_templates' && metodo === 'GET') return [200, { data: Array.from(K.plantillas.values()), paging: { cursors: { after: 'x' } } }];
  if (p === '/WABA1/message_templates' && metodo === 'POST') {
    if (K.plantillas.has(cuerpo.name)) return [400, { error: { message: 'Message template already exists', code: 100 } }];
    const id = 'T' + (K.plantillas.size + 1);
    K.plantillas.set(cuerpo.name, { id, name: cuerpo.name, status: 'PENDING', category: cuerpo.category, language: cuerpo.language, components: cuerpo.components });
    return [200, { id, status: 'PENDING', category: cuerpo.category }];
  }
  if (p === '/app/uploads') return K.subidaFalla ? [404, { error: { message: 'Unknown path components: /app/uploads', code: 2500 } }] : [200, { id: 'upload:abc' }];
  if (p === '/upload:abc') return [200, { h: '4::muestra' }];
  if (p === '/PN1/messages' && metodo === 'POST') {
    if (K.fallarEnvio) { const f = K.fallarEnvio; if (!f.siempre) K.fallarEnvio = null; return [f.http || 400, { error: { message: f.mensaje || 'falla', code: f.codigo || 131000 } }]; }
    const wamid = 'wamid.' + (++nWamid);
    K.mensajes.push({ wamid, ...cuerpo });
    return [200, { messages: [{ id: wamid }] }];
  }
  return [404, { error: 'no ' + p }];
}

/* ---------------- fetch, Deno y la función */
const ENV = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'servicio', KAPSO_API_KEY: '', KAPSO_PLATAFORMA: PLAT, WA_PAGINA: 'https://pagina.prueba/' };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  let r;
  if (url.startsWith(SB)) r = supabase(url, init);
  else if (url.startsWith('https://kapso.prueba')) r = kapso(url, init);
  else if (url.startsWith('https://pagina.prueba')) r = [200, '<html>sin bloques</html>'];
  else throw new Error('fetch inesperado ' + url);
  const [status, body] = r;
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};
let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };

async function cargar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-auto-'));
  fs.writeFileSync(path.join(dir, 'reglas.js'), "export const HUELLA = 'prueba'; export function crearReglas(e) { return globalThis.__reglas(e); }\n");
  // WA_AUTO_JS=ruta: prueba ese archivo ya compilado (lo que se despliega) en vez de compilar index.ts
  const js = process.env.WA_AUTO_JS ? fs.readFileSync(process.env.WA_AUTO_JS, 'utf8')
    : ts.transpileModule(fs.readFileSync(path.join(RAIZ, 'supabase', 'functions', 'wa-auto', 'index.ts'), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  fs.writeFileSync(path.join(dir, 'index.mjs'), js);
  await import(require('url').pathToFileURL(path.join(dir, 'index.mjs')).href);
}
async function llamar(cuerpo, headers = {}) {
  const r = await handler(new Request('https://sb.prueba/functions/v1/wa-auto', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }));
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}
async function terminar() { while (globalThis.__waPendientes.length) await globalThis.__waPendientes.shift(); }
function firmar(cuerpo) { return crypto.createHmac('sha256', secretoVault).update(cuerpo).digest('hex'); }
async function hook(evento, cuerpo, firma) {
  const s = JSON.stringify(cuerpo);
  const r = await llamar(s, { 'x-webhook-event': evento, 'x-webhook-signature': firma === undefined ? firmar(s) : firma, 'x-idempotency-key': uuid() });
  await terminar();
  return r;
}
async function correr(modo) { const r = await llamar({ accion: 'correr', token: TOKEN, modo }); await terminar(); return r; }

/* ---------------- lo que «toca hoy» (lo que devolverían las reglas) */
const parte = (nombre, cuerpo, params, enc) => ({ clave: nombre, categoria: 'UTILITY', encabezado: enc || null, cuerpo, params, ejemplos: params.map(() => 'x'), claves: [],
  de_texto: !enc, huella: 'h', nombre, texto: cuerpo.replace(/\{\{(\d+)\}\}/g, (m, i) => params[i - 1]) });
const VIDEO = { tipo: 'VIDEO', id: 'a1', ruta: 'bienvenida/d2/kit.mp4', nombre: 'Kit', archivo: 'Kit.mp4', bytes: 4096, mime: 'video/mp4' };
function itemsDeHoy() {
  return [
    { tipo: 'asesor', ref: 'ins-ana', paso: 'bv2', titulo: 'Día 2 · Kit', nombre: 'Ana Quispe', celular: '911111111', texto: 'Hola Ana, día 2.', problemas: [], avisos: [],
      partes: [parte('eqa_bv2_a', 'Hola {{1}}, día 2.', ['Ana']), parte('eqa_archivo_video_v1', '🎥 Video\n\n{{1}}\n\nFin.', ['Kit'], VIDEO)] },
    { tipo: 'asesor', ref: 'ins-ana', paso: 'n0_clase', titulo: 'Clase', nombre: 'Ana Quispe', celular: '911111111', texto: 'Ana, tu clase.', problemas: [], avisos: [],
      partes: [parte('eqa_n0_clase_tu_b', '{{1}}, tu clase.', ['Ana'])] },
    { tipo: 'cliente', ref: 'cli-rosa', paso: 'bienvenida', accion: '900::bienvenida', n_orden: 900, titulo: 'Al recibir su pedido', nombre: 'Rosa Flores', celular: '922222222',
      texto: 'Gracias Rosa.', problemas: [], avisos: [], partes: [parte('eqa_cl_bienvenida_usted_c', 'Gracias {{1}}.', ['Rosa'])] },
    { tipo: 'cliente', ref: 'cli-rosa', paso: 'bienvenida', accion: '901::bienvenida', n_orden: 901, titulo: 'Al recibir su pedido', nombre: 'Rosa Flores', celular: '922222222',
      texto: 'Gracias Rosa (2).', problemas: [], avisos: [], partes: [parte('eqa_cl_bienvenida_usted_c', 'Gracias {{1}}.', ['Rosa (2)'])] },
    { tipo: 'cliente', ref: 'cli-luis', paso: 'mes1', accion: '700::mes1', n_orden: 700, titulo: 'Al mes', nombre: 'Luis', celular: null, texto: 'Hola Luis.',
      problemas: ['No tiene un celular válido.'], avisos: [], partes: [parte('eqa_cl_mes1_d', 'Hola {{1}}.', ['Luis'])] }
  ];
}
let hoyLista = itemsDeHoy;
globalThis.__reglas = () => ({
  porEnviarHoy: () => hoyLista(),
  asesorPorId: (id) => ({ id }),
  itemBv: (p, n) => itemsDeHoy().find((i) => i.ref === p.id && i.paso === 'bv' + n),
  itemSeg: (p, k) => itemsDeHoy().find((i) => i.ref === p.id && i.paso === k),
  CL: { acciones: itemsDeHoy().filter((i) => i.accion).map((i) => ({ clave: i.accion })) },
  itemCl: (a) => itemsDeHoy().find((i) => i.accion === a.clave)
});

(async function () {
  await cargar();
  db.wa_auto_config.push({ id: 'vigente', estado: 'apagado', hora_desde: '08:00:00', hora_hasta: '20:00:00', nelson_celular: '999999999', reenviar_clientes: true,
    reenviar_asesores: true, responder_solo: true, phone_number_id: null, waba_id: null, kapso_base: KB });

  console.log('Sin sesión, nada');
  ok((await llamar({ accion: 'previa' })).status === 401 && (await llamar({ accion: 'previa', token: 'otro' })).status === 401, 'sin la sesión de admin no responde');

  console.log('Modo prueba, sin Kapso');
  let r = await correr('prueba');
  const env = () => db.wa_auto_envios.filter((e) => ['asesor', 'cliente'].includes(e.tipo));
  ok(r.status === 200 && r.body.total === 5 && r.body.prueba === 4 && r.body.no_salen === 1, 'arma lo de hoy sin enviar', JSON.stringify(r.body));
  ok(env().filter((e) => e.estado === 'prueba').length === 5 && env().some((e) => e.estado === 'omitido' && /celular/.test(e.motivo)), 'cada parte queda como «saldría»; sin celular, «no sale»',
    env().map((e) => e.ref + ':' + e.paso + ':' + e.parte + ':' + e.estado).join(' '));
  ok(env().filter((e) => e.ref === 'cli-rosa').map((e) => e.paso).sort().join() === '900::bienvenida,901::bienvenida', 'dos órdenes del mismo cliente no se pisan');
  ok(db.wa_auto_plantillas.length === 7 && db.wa_auto_plantillas.every((p) => p.estado === 'borrador') && db.wa_auto_plantillas.filter((p) => /^eqa_aviso_/.test(p.nombre)).length === 3,
    'registra las plantillas que faltan (4 de hoy y los 3 avisos)', db.wa_auto_plantillas.map((p) => p.nombre).join(' '));
  ok(K.mensajes.length === 0, 'no manda nada');
  r = await correr('prueba');
  ok(env().length === 6 && db.wa_auto_plantillas.length === 7, 'al repetir no duplica filas ni plantillas');

  console.log('Conectar');
  ENV.KAPSO_API_KEY = 'kapso-clave';
  r = await llamar({ accion: 'conectar', token: TOKEN });
  const cfg = db.wa_auto_config[0];
  ok(r.status === 200 && cfg.phone_number_id === 'PN1' && cfg.waba_id === 'WABA1' && cfg.webhook_listo, 'toma el número y la cuenta de Kapso', JSON.stringify(r.body));
  ok(K.hooks.length === 1 && K.hooks[0].url === SB + '/functions/v1/wa-auto' && secretoVault.length === 64 && K.hooks[0].secret_key === secretoVault &&
     K.hooks[0].events.includes('whatsapp.message.received') && K.hooks[0].buffer_window_seconds === 60, 'crea el webhook firmado, con el secreto guardado');
  ok(r.body.perfil === true && K.perfilCambios.length === 1 && K.perfil.about === 'Hola' && K.perfil.vertical === 'RETAIL' && /Equipo Arequipa/.test(K.perfil.description) &&
     !('about' in K.perfilCambios[0]) && K.perfil.address === 'Av. Cayma 628, Of. 502, Arequipa (a media cuadra de la Av. Ejército)', 'llena el perfil del número sin tocar lo que ya tenía', JSON.stringify(K.perfilCambios));
  await llamar({ accion: 'conectar', token: TOKEN });
  ok(K.hooks.length === 1 && K.perfilCambios.length === 1, 'conectar otra vez no duplica el webhook ni vuelve a cambiar el perfil');

  console.log('Encendido: primero se aprueban las plantillas');
  cfg.estado = 'encendido';
  r = await correr('encendido');
  ok(r.status === 202 && r.body.en_curso, 'desde la página, enviar corre en segundo plano');
  const plant = (n) => db.wa_auto_plantillas.find((p) => p.nombre === n);
  ok(K.plantillas.size === 6 && plant('eqa_bv2_a').estado === 'enviada' && plant('eqa_bv2_a').meta_id, 'manda a revisión las de texto', Array.from(K.plantillas.keys()).join(' '));
  ok(plant('eqa_archivo_video_v1').estado === 'error' && /Créala una sola vez en Kapso/.test(plant('eqa_archivo_video_v1').motivo), 'la del video, si Kapso no recibe la muestra, dice cómo crearla a mano');
  const bv2 = K.plantillas.get('eqa_bv2_a');
  ok(bv2 && bv2.language === 'es' && bv2.components[0].type === 'BODY' && bv2.components[0].example.body_text[0][0] === 'x', 'la plantilla va con su ejemplo');
  const aviso = Array.from(K.plantillas.values()).find((t) => /^eqa_aviso_cliente_/.test(t.name));
  ok(aviso && aviso.components[1].type === 'BUTTONS' && aviso.components[1].buttons[0].url === 'https://wa.me/{{1}}', 'el aviso al asesor lleva el botón para abrir el chat');
  ok(K.mensajes.length === 0 && env().filter((e) => e.estado === 'espera').every((e) => /apruebe|no está lista/.test(e.motivo)) && env().filter((e) => e.estado === 'espera').length === 5,
    'mientras no estén aprobadas, nada sale (ni a medias)', env().map((e) => e.estado + ':' + e.motivo).join(' | '));

  console.log('Encendido: aprobadas, sale');
  K.plantillas.forEach((t) => { t.status = 'APPROVED'; });
  K.plantillas.set('eqa_archivo_video_v1', { id: 'TV', name: 'eqa_archivo_video_v1', status: 'APPROVED', category: 'MARKETING', language: 'es_PE' });   // creada a mano en Kapso
  r = await correr('encendido');
  ok(plant('eqa_archivo_video_v1').estado === 'aprobada' && plant('eqa_archivo_video_v1').idioma === 'es_PE' && plant('eqa_archivo_video_v1').categoria_meta === 'MARKETING' && !plant('eqa_archivo_video_v1').motivo,
    'la creada a mano se reconoce sola, con su idioma y categoría');
  const aAna = K.mensajes.filter((m) => m.to === '51911111111');
  ok(aAna.length === 2 && aAna[0].template.name === 'eqa_bv2_a' && aAna[1].template.name === 'eqa_archivo_video_v1' && aAna[1].template.language.code === 'es_PE',
    'a Ana le sale su día 2 en orden: texto y video', JSON.stringify(aAna.map((m) => m.template.name)));
  ok(aAna[0].template.components[0].parameters[0].text === 'Ana' && aAna[1].template.components[0].type === 'header' &&
     aAna[1].template.components[0].parameters[0].video.link === SB + '/storage/v1/object/public/wa-media/bienvenida/d2/kit.mp4', 'con sus datos y el video desde el almacenamiento');
  const aRosa = K.mensajes.filter((m) => m.to === '51922222222');
  ok(aRosa.length === 1 && env().filter((e) => e.ref === 'ins-ana' && e.paso === 'n0_clase')[0].estado === 'espera' && env().filter((e) => e.paso === '901::bienvenida')[0].estado === 'espera',
    'una cosa por persona en cada corrida: lo demás sale en la siguiente');
  const anot = llamadas.filter((l) => /^wa_auto_anotar/.test(l.fn));
  ok(anot.length === 2 && anot.some((l) => l.fn === 'wa_auto_anotar_asesor' && l.args.p_paso === 'bv2' && l.args.p_inscrito === 'ins-ana') &&
     anot.some((l) => l.fn === 'wa_auto_anotar_cliente' && l.args.p_n_orden === 900 && l.args.p_tipo === 'bienvenida'), 'queda anotado como enviado en la página', JSON.stringify(anot));
  ok(env().filter((e) => e.estado === 'enviado').every((e) => e.wamid && e.anotado_id), 'cada parte enviada guarda su wamid y lo anotado');

  console.log('Lo que ya salió no se repite');
  const antes = K.mensajes.length;
  hoyLista = () => itemsDeHoy().filter((i) => !(i.paso === 'bv2'));       // la página ya lo da por hecho
  r = await correr('encendido');
  ok(K.mensajes.length === antes + 2 && K.mensajes.slice(antes).every((m) => m.to !== '51911111111' || m.template.name === 'eqa_n0_clase_tu_b'), 'en la siguiente corrida sale lo que esperaba');
  hoyLista = itemsDeHoy;                                                       // la página aún no se actualiza: no se reenvía
  const antes2 = K.mensajes.length;
  r = await correr('encendido');
  ok(K.mensajes.length === antes2 && (await (async () => db.wa_auto_corridas[db.wa_auto_corridas.length - 1].resumen)()).ya_hechos >= 3, 'si la página aún lo muestra, no se manda dos veces', JSON.stringify(db.wa_auto_corridas[db.wa_auto_corridas.length - 1].resumen));

  console.log('Webhook: estados');
  const e1 = env().find((e) => e.paso === 'bv2' && e.parte === 1);
  r = await hook('whatsapp.message.delivered', { message: { id: e1.wamid } }, 'mala');
  ok(r.status === 401 && e1.estado === 'enviado', 'sin la firma correcta no se acepta');
  await hook('whatsapp.message.delivered', { message: { id: e1.wamid, kapso: { status: 'delivered' } } });
  await hook('whatsapp.message.read', { message: { id: e1.wamid } });
  await hook('whatsapp.message.delivered', { message: { id: e1.wamid } });
  ok(e1.estado === 'leido' && e1.entregado_en && e1.leido_en, 'entregado y leído (un estado viejo no lo regresa)');
  const e2 = env().find((e) => e.paso === 'bv2' && e.parte === 2);
  await hook('whatsapp.message.failed', { message: { id: e2.wamid, kapso: { statuses: [{ status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] }] } } });
  ok(e2.estado === 'fallo' && e2.error_codigo === '131026' && /no puede recibir/.test(e2.motivo) && !e2.reintentar_desde, 'si falla, queda el motivo');
  ok(llamadas.some((l) => l.fn === 'wa_auto_desanotar' && l.args.p_tabla === 'n0_mensajes') && !e1.anotado_id && !e2.anotado_id, 'y se anula lo anotado, para que vuelva a «Para hoy»');
  const antes3 = K.mensajes.length;
  r = await correr('encendido');
  ok(K.mensajes.length === antes3, 'un número que no recibe no se reintenta solo');
  e2.reintentar_desde = new Date(Date.now() - 1000).toISOString();            // ya se corrigió
  r = await correr('encendido');
  const re = K.mensajes.slice(antes3);
  ok(re.length === 1 && re[0].template.name === 'eqa_archivo_video_v1' && e2.estado === 'enviado' && e2.intentos === 1 + 1, 'al reintentar sale solo la parte que faltaba', JSON.stringify(re.map((m) => m.template.name)) + ' ' + e2.estado + ' ' + e2.intentos);

  console.log('Si Kapso no responde, se reintenta después');
  hoyLista = () => [{ tipo: 'asesor', ref: 'ins-beto', paso: 'bv1', titulo: 'Día 1', nombre: 'Beto', celular: '933333333', texto: 'Hola Beto.', problemas: [], avisos: [],
    partes: [parte('eqa_bv2_a', 'Hola {{1}}, día 2.', ['Beto'])] }];
  K.fallarEnvio = { http: 500, codigo: 131000, mensaje: 'Something went wrong' };
  r = await correr('encendido');
  const fb = env().find((e) => e.ref === 'ins-beto');
  ok(fb.estado === 'fallo' && fb.reintentar_desde > new Date().toISOString() && fb.intentos === 1, 'falla: se reintenta en la próxima corrida', JSON.stringify(fb));
  r = await correr('encendido');
  ok(fb.estado === 'fallo' && K.mensajes.filter((m) => m.to === '51933333333').length === 0, 'antes de la hora no se reintenta');
  fb.reintentar_desde = new Date(Date.now() - 1).toISOString();
  r = await correr('encendido');
  ok(fb.estado === 'enviado' && fb.intentos === 2 && K.mensajes.filter((m) => m.to === '51933333333').length === 1, 'después, sale');

  console.log('Fuera de horario, nada');
  hoyLista = () => [{ tipo: 'asesor', ref: 'ins-caro', paso: 'bv1', titulo: 'Día 1', nombre: 'Caro', celular: '944444444', texto: 'Hola.', problemas: [], avisos: [],
    partes: [parte('eqa_bv2_a', 'Hola {{1}}, día 2.', ['Caro'])] }];
  HORA = '21:10';
  r = await correr('encendido');
  ok(K.mensajes.filter((m) => m.to === '51944444444').length === 0 && env().find((e) => e.ref === 'ins-caro').motivo.includes('horario'), 'después de las 8 p. m. espera al día siguiente');
  HORA = '10:00';

  console.log('Una corrida a la vez');
  corridaEnCurso = true;
  r = await llamar({ accion: 'correr', token: TOKEN, modo: 'encendido' });
  ok(r.status === 500 && /en curso/.test(r.body.error), 'si ya hay una corriendo, no empieza otra');
  r = await llamar({ accion: 'corrida', id: 'x', clave: 'y' });
  ok(r.status === 409, 'una corrida del cron que no es válida se rechaza');
  corridaEnCurso = false;
  const k = RPC.wa_auto_corrida_pedir({ p_origen: 'cron', p_modo: 'prueba' });
  r = await llamar({ accion: 'corrida', id: k.id, clave: k.clave });
  await terminar();
  ok(r.status === 202 && db.wa_auto_corridas.find((x) => x.id === k.id).fin, 'la del cron responde al toque y termina en segundo plano');

  console.log('Respuestas');
  contactos['922222222'] = { de_tipo: 'cliente', de_ref: 'cli-rosa', de_nombre: 'ROSA FLORES', trato: 'usted', sobre: 'Al recibir su pedido',
    asesor: { codigo: 123, nombre: 'MARIA QUISPE', celular: '955555555' } };
  const n0 = K.mensajes.length;
  await hook('whatsapp.message.received', { type: 'whatsapp.message.received', batch: true, data: [
    { message: { id: 'in1', from: '51922222222', type: 'text', text: { body: 'Gracias, ¿cómo uso la sartén?' }, kapso: { direction: 'inbound' } }, conversation: { contact_name: 'Rosa' } },
    { message: { id: 'in2', from: '51922222222', type: 'image', image: { caption: 'esta' }, kapso: { direction: 'inbound' } }, conversation: { contact_name: 'Rosa' } }] });
  const rs = db.wa_auto_respuestas.filter((x) => x.celular === '922222222');
  const nuevos = K.mensajes.slice(n0);
  const av = nuevos.find((m) => m.to === '51955555555');
  ok(rs.length === 2 && rs.every((x) => x.estado === 'sin_reenvio' && /aún no está aprobado/.test(x.motivo)) || rs.every((x) => x.estado === 'reenviada'), 'la respuesta queda guardada', JSON.stringify(rs.map((x) => [x.estado, x.motivo])));
  ok(av && /^eqa_aviso_cliente_/.test(av.template.name) && av.template.components[0].parameters.map((p) => p.text).join('|') === 'Maria|Rosa Flores|respondió a «Al recibir su pedido»|Gracias, ¿cómo uso la sartén? / 📷 [foto] esta' &&
     av.template.components[1].parameters[0].text === '51922222222', 'la respuesta de un cliente le llega a su asesora, junta y con el botón a su chat', JSON.stringify(av && av.template.components));
  ok(rs.every((x) => x.estado === 'reenviada' && x.para === 'asesor' && x.para_nombre === 'Maria Quispe' && x.reenvio_id), 'y queda como pasada a la asesora');
  const auto = nuevos.find((m) => m.to === '51922222222');
  ok(auto && auto.type === 'text' && /Ya le pasé su mensaje a Maria, su asesor\(a\)/.test(auto.text.body), 'a Rosa le responde solo (de usted)', JSON.stringify(auto));
  const n1 = K.mensajes.length;
  await hook('whatsapp.message.received', { message: { id: 'in3', from: '51922222222', type: 'text', text: { body: 'ok' } }, conversation: {} });
  ok(K.mensajes.slice(n1).length === 1 && K.mensajes[n1].to === '51955555555', 'otra respuesta: solo el aviso, sin repetir la respuesta automática');
  await hook('whatsapp.message.received', { message: { id: 'in3', from: '51922222222', type: 'text', text: { body: 'ok' } }, conversation: {} });
  ok(K.mensajes.length === n1 + 1 && db.wa_auto_respuestas.filter((x) => x.wamid === 'in3').length === 1, 'si Kapso manda lo mismo dos veces, se atiende una');

  contactos['911111111'] = { de_tipo: 'asesor', de_ref: 'ins-ana', de_nombre: 'ANA QUISPE', sobre: 'Día 2 · Kit' };
  const n2 = K.mensajes.length;
  await hook('whatsapp.message.received', { message: { id: 'in4', from: '51911111111', type: 'text', text: { body: 'Baja' } }, conversation: { contact_name: 'Ana' } });
  ok(llamadas.some((l) => l.fn === 'wa_auto_baja' && l.args.p_tipo === 'asesor' && l.args.p_ref === 'ins-ana'), '«Baja» la saca de la secuencia');
  const tras = K.mensajes.slice(n2);
  ok(tras.some((m) => m.to === '51999999999' && /^eqa_aviso_asesor_/.test(m.template.name)) && tras.some((m) => m.to === '51911111111' && /ya no te enviaremos/.test(m.text.body)),
    'a Nelson le llega el aviso y a ella la confirmación', JSON.stringify(tras.map((m) => [m.to, m.type, m.template ? m.template.name : m.text.body])));
  ok(db.wa_auto_respuestas.find((x) => x.wamid === 'in4').baja === true, 'la respuesta queda marcada como baja');

  const n3 = K.mensajes.length;
  await hook('whatsapp.message.received', { message: { id: 'in5', from: '51999999999', type: 'text', text: { body: 'prueba' } }, conversation: {} });
  ok(K.mensajes.length === n3 && db.wa_auto_respuestas.find((x) => x.wamid === 'in5').estado === 'atendida', 'lo que escribe Nelson no se reenvía a nadie');
  await hook('whatsapp.message.received', { message: { id: 'in6', from: '51977777777', type: 'text', text: { body: 'Hola, ¿venden ollas?' } }, conversation: { contact_name: 'Desconocida' } });
  const n4 = K.mensajes.slice(n3);
  ok(n4.some((m) => m.to === '51999999999' && /^eqa_aviso_otro_/.test(m.template.name) && /No está en la base/.test(m.template.components[0].parameters[2].text)) &&
     n4.some((m) => m.to === '51977777777' && /Ya le pasamos su mensaje al equipo/.test(m.text.body)), 'alguien que no está en la base: a Nelson, y se le responde');

  const n4b = K.mensajes.length, contAntes = llamadas.filter((l) => l.fn === 'wa_auto_contacto').length;
  await hook('whatsapp.message.received', { message: { id: 'in7', from: '15551234567', type: 'text', text: { body: 'Hi' } }, conversation: { contact_name: 'Bob' } });
  const ext = K.mensajes.slice(n4b);
  ok(db.wa_auto_respuestas.find((x) => x.wamid === 'in7').celular === '15551234567' && llamadas.filter((l) => l.fn === 'wa_auto_contacto').length === contAntes &&
     ext.some((m) => m.to === '15551234567' && m.type === 'text') && ext.some((m) => m.to === '51999999999' && m.template.components[1].parameters[0].text === '15551234567'),
    'un número de otro país no se confunde con uno del Perú: se le responde a su número completo', JSON.stringify(ext.map((m) => m.to)));

  console.log('Atrasados');
  hoyLista = () => [{ tipo: 'cliente', ref: 'cli-vieja', paso: 'semana1', accion: '500::semana1', n_orden: 500, titulo: 'Una semana', nombre: 'Vieja', celular: '966666666',
    texto: 'Hola.', atraso: 30, problemas: [], avisos: [], partes: [parte('eqa_cl_semana1_usted_z', 'Hola {{1}}.', ['Vieja'])] }];
  const n7 = K.mensajes.length;
  r = await correr('encendido');
  const vieja = env().find((e) => e.ref === 'cli-vieja');
  ok(K.mensajes.length === n7 && vieja.estado === 'omitido' && /30 días de atraso/.test(vieja.motivo) && !plant('eqa_cl_semana1_usted_z'),
    'un mensaje de cliente con más de 7 días de atraso no sale solo (ni pide plantilla)', JSON.stringify(vieja));
  cfg.max_atraso = 45;
  r = await correr('encendido');
  ok(vieja.estado === 'espera' && !!plant('eqa_cl_semana1_usted_z'), 'si en Ajustes se permite más atraso, sigue su camino', vieja.estado);
  hoyLista = itemsDeHoy;

  console.log('Desde la página');
  const rr = db.wa_auto_respuestas.find((x) => x.wamid === 'in6');
  const n5 = K.mensajes.length;
  r = await llamar({ accion: 'reenviar', token: TOKEN, id: rr.id });
  ok(r.status === 200 && K.mensajes.length === n5 + 1 && K.mensajes[n5].to === '51999999999', 'volver a pasar una respuesta manda solo el aviso');
  plant('eqa_bv2_a').estado = 'rechazada';
  r = await llamar({ accion: 'plantilla_reintentar', token: TOKEN, id: plant('eqa_bv2_a').id });
  ok(r.status === 200 && plant('eqa_bv2_a').estado === 'borrador', 'una plantilla rechazada se puede volver a mandar');
  r = await llamar({ accion: 'plantilla_reintentar', token: TOKEN, id: plant('eqa_n0_clase_tu_b').id });
  ok(r.status === 500, 'una aprobada no');

  console.log('Probar en tu celular');
  hoyLista = itemsDeHoy;
  const n6 = K.mensajes.length;
  r = await llamar({ accion: 'probar', token: TOKEN, tipo: 'cliente', ref: 'cli-rosa', clave: '901::bienvenida' });
  ok(r.status === 200 && r.body.ok && K.mensajes.length === n6 + 1 && K.mensajes[n6].to === '51999999999' && K.mensajes[n6].template.components[0].parameters[0].text === 'Rosa (2)',
    'el mensaje de un cliente (por su orden) te llega a ti', JSON.stringify(r.body));
  r = await llamar({ accion: 'probar', token: TOKEN, tipo: 'asesor', ref: 'ins-ana', paso: 'bv2', clave: null });
  ok(r.status === 200 && r.body.ok === false && /Faltan aprobar 1/.test(r.body.motivo), 'si falta aprobar una parte, no prueba a medias');
  plant('eqa_bv2_a').estado = 'aprobada';
  r = await llamar({ accion: 'probar', token: TOKEN, tipo: 'asesor', ref: 'ins-ana', paso: 'bv2', clave: null });
  ok(r.status === 200 && r.body.enviados === 2 && K.mensajes.slice(-2).every((m) => m.to === '51999999999'), 'el día 2 de Ana te llega en sus dos partes', JSON.stringify(r.body));
  ok(db.wa_auto_envios.filter((e) => e.ref === 'prueba').length === 3 && db.wa_auto_envios.filter((e) => e.ref === 'prueba').every((e) => e.tipo === 'aviso'), 'las pruebas quedan registradas aparte');

  console.log('\n' + (total - fallas) + '/' + total + ' pasan');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
