// Prueba de punta a punta: Chromium real con un Supabase falso.
// Uso: node pruebas/prueba.js   (necesita playwright; capturas en /tmp/bv-*.png)
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
const HOY = iso(new Date());
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Supabase falso ---------------- */
const SEMILLAS = [
  [1, 'video', 'Video de bienvenida'], [2, 'video', 'Video del Kit de Inicio'], [2, 'pdf', 'Folleto de las ollas'],
  [2, 'video', 'Video de las ollas'], [2, 'pdf', 'Folleto del filtro'], [2, 'video', 'Video del filtro'],
  [2, 'video', 'Video del detector'], [2, 'video', 'Video de la cocina'], [2, 'pdf', 'Catálogo de productos'],
  [3, 'pdf', 'Lista de precios general'], [3, 'pdf', 'Lista de promociones vigentes'], [4, 'video', 'Video de Empiece Ya'],
  [5, 'imagen', 'Imagen del próximo sorteo']
];
const db = {
  ajustes: {
    direccion: 'Av. Cayma 628, Of. 502', referencia: 'a media cuadra de la Av. Ejército', gourmetPrecio: 9629, promoNumero: '5',
    promoPrecio: 7929, promoProductos: 'Juego Gourmet de 17 piezas\nOlla King Cooker de 12 litros\nTabla de cortar\nCuchillo Santoku',
    inicialPct: 10, regalos: 'la nueva Joyita de 1 litro y el juego de cucharones de 3 piezas', comisionMin: 500, comisionMax: 1000
  },
  adjuntos: [],
  nivel0: { meta: 5, plazo: 30, horarios: [{ dia: 2, hora: '09:30' }, { dia: 3, hora: '16:00' }, { dia: 5, hora: '16:30' }] },
  asesores: [
    { id: 'p1', nombre: 'ANA MARIA QUISPE LOPEZ', celular: '987654321', inicio: HOY, vence: sumar(HOY, 30), codigo: '1234567', estado: 'en_curso', validas: 1 },
    { id: 'p2', nombre: 'luis ramos', celular: '51911222333', inicio: sumar(HOY, -10), vence: sumar(HOY, 20), codigo: null, estado: 'en_curso', validas: 3 },
    { id: 'p3', nombre: 'Carla Diaz', celular: '955444333', inicio: sumar(HOY, -40), vence: sumar(HOY, -10), codigo: null, estado: 'vencio', validas: 2 }
  ],
  archivos: {}
};
const porDia = {};
SEMILLAS.forEach(([dia, tipo, nombre], i) => {
  porDia[dia] = (porDia[dia] || 0) + 1;
  db.adjuntos.push({ id: 'a' + (i + 1), dia, orden: porDia[dia], tipo, nombre, descripcion: '', ruta: null, archivo: null, bytes: null, content_type: null, borrado: false });
});
let sec = 100;
let sesionInvalida = false;
const llamadas = [];
const limpio = (f) => { const c = Object.assign({}, f); delete c.borrado; return c; };

function rpc(fn, a) {
  const ok = (body) => ({ status: 200, body });
  const err = (message) => ({ status: 400, body: { code: 'P0001', message } });
  if (fn === 'admin_login') return a.p_clave === 'secreta' ? ok('tok-1') : err('Clave incorrecta');
  if (sesionInvalida || a.p_token !== 'tok-1') return err('Sesion invalida');
  if (fn === 'wa_bv_datos') {
    return ok({ hoy: HOY, ajustes: db.ajustes, adjuntos: db.adjuntos.filter((x) => !x.borrado).map(limpio), nivel0: db.nivel0, asesores: db.asesores });
  }
  if (fn === 'wa_bv_ajustes_guardar') { db.ajustes = a.p_data; return ok(a.p_data); }
  if (fn === 'wa_bv_adjunto_guardar') {
    if (!a.p_id) {
      const dia = a.p_datos.dia;
      const orden = Math.max(0, ...db.adjuntos.filter((x) => x.dia === dia && !x.borrado).map((x) => x.orden)) + 1;
      const fila = Object.assign({ id: 'n' + (++sec), dia, orden, tipo: 'pdf', nombre: '', descripcion: '', ruta: null, archivo: null, bytes: null, content_type: null, borrado: false }, a.p_datos);
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
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      const args = JSON.parse(req.postData() || '{}');
      llamadas.push({ fn, args });
      const r = rpc(fn, args);
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
    const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
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
function ok(cond, nombre) {
  total++;
  if (cond) console.log('  ✓ ' + nombre);
  else { fallas++; console.log('  ✗ ' + nombre); }
}
const hubo = (pred) => llamadas.some(pred);

(async () => {
  const server = await servir();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await conectar(ctx);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  // Los 400 esperados (clave mala, sesión vencida) el navegador los anota como recursos fallidos: no son errores de JS.
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts|favicon/.test(m.text())) errores.push(m.text()); });

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
    ok((await page.$$eval('#asesor-sel option', (l) => l.length)) === 4, 'lista a los 3 nuevos más «a mano»');
    ok((await page.textContent('#aj-resumen')).includes('Promoción 5'), 'carga la promoción guardada');

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

    console.log('Sesión');
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
