// wa-auto · envío automático por WhatsApp (número del equipo, por Kapso) de la Bienvenida del Equipo Arequipa.
//
//  · Corrida (cada hora, desde pg_cron, o «Revisar / Enviar ahora» en la página): arma lo que toca hoy con las mismas
//    reglas y textos de la página (reglas.js se genera desde index.html), registra y manda a aprobar las plantillas
//    que falten, y envía. En modo prueba solo anota lo que saldría.
//  · Webhook de Kapso: estados (enviado, entregado, leído, falló) y respuestas. La respuesta de un cliente va a su
//    asesor; la de un asesor, a Nelson. Quien pide la baja sale de la secuencia.
//  · Página (con la sesión de admin): estado, previa, correr, conectar, probar, reenviar, plantilla_reintentar.
//
// Secretos: KAPSO_API_KEY (la pega Nelson en Supabase). El del webhook lo genera «conectar» y queda en Vault.
// Si cambian los bloques /* servidor:… */ de index.html: node servidor/construir.js y volver a desplegar wa-auto.
// @ts-ignore: módulo JS generado
import { crearReglas, HUELLA } from './reglas.js';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
type Dict = Record<string, any>;

const SB = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const llave = () => Deno.env.get('KAPSO_API_KEY') ?? '';   // se lee al usarla: basta con guardarla en los secretos
const PAGINA = Deno.env.get('WA_PAGINA') ?? 'https://renaware-bienvenida.pages.dev/';
const PLATAFORMA = Deno.env.get('KAPSO_PLATAFORMA') ?? 'https://api.kapso.ai/platform/v1';
const FUNCION = SB + '/functions/v1/wa-auto';
const MEDIA = SB + '/storage/v1/object/public/wa-media/';
const MAX_MENSAJES = 45;             // por corrida; lo demás sale en la siguiente (cada hora)
const PRESUPUESTO_MS = 95_000;       // y sin pasar de este tiempo
const PAUSA_MS = 900;                // entre partes del mismo mensaje, para que lleguen en orden
const ENTREGADO = ['enviado', 'entregado', 'leido'];

/* ---------------------------------------------------------- utilidades */
function cors(req: Request): Dict {
  const o = req.headers.get('origin') || '';
  const ok = o === 'https://renaware-bienvenida.pages.dev' || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o);
  return { 'Access-Control-Allow-Origin': ok ? o : 'https://renaware-bienvenida.pages.dev', 'Vary': 'Origin',
           'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function json(d: unknown, status = 200, h: Dict = {}) {
  return new Response(JSON.stringify(d), { status, headers: { ...h, 'Content-Type': 'application/json' } });
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ahoraISO = () => new Date().toISOString();
const msj = (e: unknown) => String((e as Error)?.message || e);
function hex(buf: ArrayBuffer) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function sha256(t: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))); }
function igualSeguro(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function cel9(c: unknown) { const d = String(c ?? '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; }
/* Un celular del Perú (9 dígitos, empieza con 9) o nada: así un número raro nunca termina en otra persona. */
function celPe(c: unknown) { let d = String(c ?? '').replace(/\D/g, ''); if (d.length === 11 && d.startsWith('51')) d = d.slice(2); return /^9\d{8}$/.test(d) ? d : ''; }
/* Para enviar: los del Perú van con 51; los de otro país, como llegaron (con su código). */
const waNum = (c: string) => (c.length === 9 ? '51' + c : c);
function plano(t: unknown, max = 600) {
  const s = String(t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function titulo(n: unknown) {
  return String(n ?? '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
    .map((p, i) => (i > 0 && ['de', 'del', 'la', 'las', 'los', 'y', 'e'].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}
function pila(n: unknown) { return titulo(String(n ?? '').trim().split(/\s+/)[0] || ''); }
function huella(s: string) {                            // la misma de la página (cyrb53)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/* Lo que sigue después de responder (corridas, respuestas): la función no se corta hasta terminarlo. */
const PENDIENTES: Promise<unknown>[] = [];
(globalThis as Dict).__waPendientes = PENDIENTES;
function enSegundoPlano(p: Promise<unknown>) {
  const q = p.catch((e) => console.error('wa-auto:', msj(e)));
  PENDIENTES.push(q);
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime && typeof EdgeRuntime.waitUntil === 'function') EdgeRuntime.waitUntil(q);
}

/* ---------------------------------------------------------- Supabase (con la clave de servicio) */
async function sb(ruta: string, op: RequestInit & { headers?: Dict } = {}) {
  const r = await fetch(SB + ruta, { ...op, headers: { apikey: SERVICIO, Authorization: 'Bearer ' + SERVICIO, 'Content-Type': 'application/json', ...(op.headers || {}) } });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error((d && (d.message || d.error)) || ('Supabase ' + r.status));
  return d;
}
const rpc = (fn: string, args: Dict = {}) => sb('/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(args) });
const insertar = (tabla: string, filas: unknown, prefer = 'return=representation') =>
  sb('/rest/v1/' + tabla, { method: 'POST', headers: { Prefer: prefer }, body: JSON.stringify(filas) });
const actualizar = (tabla: string, filtro: string, datos: Dict) =>
  sb('/rest/v1/' + tabla + '?' + filtro, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(datos) });
const leer = (tabla: string, filtro: string) => sb('/rest/v1/' + tabla + '?' + filtro);
const config = async () => ((await leer('wa_auto_config', 'id=eq.vigente&select=*')) || [])[0] || {};

/* ---------------------------------------------------------- Kapso (la API de Meta, a través de Kapso) */
class ErrorKapso extends Error {
  codigo: string; http: number;
  constructor(m: string, c: string, h: number) { super(m); this.codigo = c; this.http = h; }
}
async function kapso(base: string, ruta: string, cuerpo?: unknown, metodo = 'POST', extra: Dict = {}) {
  if (!llave()) throw new ErrorKapso('Falta conectar Kapso: no está la clave de API (KAPSO_API_KEY).', 'sin_kapso', 0);
  const binario = cuerpo instanceof Uint8Array;
  const r = await fetch(String(base || '').replace(/\/$/, '') + ruta, {
    method: metodo,
    headers: { 'X-API-Key': llave(), ...(binario ? {} : { 'Content-Type': 'application/json' }), ...extra },
    body: (cuerpo == null ? undefined : binario ? cuerpo : JSON.stringify(cuerpo)) as any
  });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = { texto: t }; }
  if (!r.ok) {
    const e = d && d.error;
    const m = typeof e === 'string' ? e : (e && (e.error_user_msg || e.message)) || (d && (d.message || d.texto)) || ('Kapso respondió ' + r.status);
    throw new ErrorKapso(plano(m, 300), String((e && typeof e === 'object' && e.code) || r.status), r.status);
  }
  return d;
}

/* ---------------------------------------------------------- ¿la página cambió las reglas o los textos? */
let alDiaCache: { t: number; v: boolean | null } = { t: 0, v: null };
async function reglasAlDia(): Promise<boolean | null> {
  if (Date.now() - alDiaCache.t < 10 * 60 * 1000) return alDiaCache.v;
  let v: boolean | null = null;
  try {
    const html = await (await fetch(PAGINA, { headers: { 'Cache-Control': 'no-cache' } })).text();
    const D = '/* servidor:desde */', H = '/* servidor:hasta */', l: string[] = [];
    for (let i = 0; ;) {
      const a = html.indexOf(D, i); if (a < 0) break;
      const b = html.indexOf(H, a); if (b < 0) break;
      l.push(html.slice(a + D.length, b)); i = b + H.length;
    }
    v = l.length ? (await sha256(l.join('\n/* — */\n'))).slice(0, 16) === HUELLA : null;
  } catch { v = null; }
  alDiaCache = { t: Date.now(), v };
  return v;
}

/* ---------------------------------------------------------- avisos de respuesta (plantillas fijas, con botón al chat) */
const BOTON_CHAT = [{ type: 'URL', text: 'Abrir su chat', url: 'https://wa.me/{{1}}', example: ['https://wa.me/51987654321'] }];
const AVISOS: Dict = {
  aviso_cliente: { cuerpo: '🔔 *Te escribió tu cliente*\n\nHola {{1}}: *{{2}}* escribió al número del Equipo Arequipa ({{3}}):\n\n«{{4}}»\n\nRespóndele tú desde tu WhatsApp con el botón de abajo. 👇',
                   ejemplos: ['María', 'Rosa Flores', 'respondió a «Al recibir su pedido»', 'Gracias, ¿cómo uso la sartén la primera vez?'] },
  aviso_asesor: { cuerpo: '🔔 *Te escribió un asesor*\n\n*{{1}}* escribió al número del Equipo Arequipa ({{2}}):\n\n«{{3}}»\n\nPuedes escribirle con el botón de abajo. 👇',
                  ejemplos: ['Ana Quispe', 'respondió a «Día 2 · Kit y material digital»', '¡Gracias! Mañana voy a la oficina'] },
  aviso_otro: { cuerpo: '🔔 *Mensaje al número del equipo*\n\n*{{1}}* escribió:\n\n«{{2}}»\n\n{{3}} Puedes escribirle con el botón de abajo. 👇',
                ejemplos: ['Rosa Flores', 'Hola, quiero cambiar mi filtro', 'Es cliente de María Quispe, que no tiene celular registrado.'] }
};
function plantillaAviso(clave: string) {
  const a = AVISOS[clave], h = huella(JSON.stringify(['UTILITY', '', a.cuerpo, BOTON_CHAT]));
  return { clave, nombre: ('eqa_' + clave + '_' + h).toLowerCase(), huella: h, categoria: 'UTILITY', encabezado: null, cuerpo: a.cuerpo, ejemplos: a.ejemplos, botones: BOTON_CHAT };
}
function llenarCuerpo(c: string, params: string[]) { return c.replace(/\{\{(\d+)\}\}/g, (_m, i) => params[Number(i) - 1] ?? ''); }

/* ---------------------------------------------------------- plantillas: registrar, mandar a revisión y seguir su estado */
function filaPlantilla(p: Dict) {
  const e = p.encabezado;
  return { clave: p.clave, nombre: p.nombre, huella: p.huella, categoria: p.categoria, encabezado: e ? e.tipo || e : null,
           cuerpo: p.cuerpo, ejemplos: p.ejemplos || [], botones: p.botones || [],
           ejemplo_archivo: e && e.ruta ? { ruta: e.ruta, mime: e.mime, archivo: e.archivo } : null };
}
function enlaceMedia(ruta: string) { return MEDIA + String(ruta).split('/').map(encodeURIComponent).join('/'); }
/* Meta pide una muestra del archivo de arriba (subida reanudable). Se intenta por Kapso; si no la acepta, se avisa. */
async function muestra(cfg: Dict, arch: Dict) {
  const r = await fetch(enlaceMedia(arch.ruta));
  if (!r.ok) throw new Error('No se pudo leer el archivo de muestra');
  const datos = new Uint8Array(await r.arrayBuffer());
  const q = '?file_name=' + encodeURIComponent(arch.archivo || 'muestra') + '&file_length=' + datos.length + '&file_type=' + encodeURIComponent(arch.mime || 'application/octet-stream');
  const ses = await kapso(cfg.kapso_base, '/app/uploads' + q, {});
  const sub = await kapso(cfg.kapso_base, '/' + ses.id, datos, 'POST', { file_offset: '0' });
  if (!sub || !sub.h) throw new Error('Kapso no devolvió la muestra del archivo');
  return sub.h;
}
async function mandarARevision(cfg: Dict, p: Dict) {
  const comps: Dict[] = [];
  if (p.encabezado) {
    if (!p.ejemplo_archivo) throw new Error('Falta el archivo de muestra');
    comps.push({ type: 'HEADER', format: p.encabezado, example: { header_handle: [await muestra(cfg, p.ejemplo_archivo)] } });
  }
  comps.push({ type: 'BODY', text: p.cuerpo, ...(p.ejemplos && p.ejemplos.length ? { example: { body_text: [p.ejemplos] } } : {}) });
  if (p.botones && p.botones.length) comps.push({ type: 'BUTTONS', buttons: p.botones });
  return await kapso(cfg.kapso_base, '/' + cfg.waba_id + '/message_templates',
    { name: p.nombre, language: 'es', category: p.categoria, parameter_format: 'POSITIONAL', components: comps });
}
const ESTADO_META: Dict = { APPROVED: 'aprobada', REJECTED: 'rechazada', PENDING: 'enviada', IN_APPEAL: 'enviada', PAUSED: 'pausada',
                            DISABLED: 'desactivada', PENDING_DELETION: 'desactivada', DELETED: 'desactivada', LIMIT_EXCEEDED: 'rechazada' };
async function plantillasMeta(cfg: Dict) {
  const m = new Map<string, Dict>(), campos = '?fields=id,name,status,category,rejected_reason,language&limit=200';
  let ruta = '/' + cfg.waba_id + '/message_templates' + campos;
  for (let i = 0; i < 10 && ruta; i++) {
    const d = await kapso(cfg.kapso_base, ruta, undefined, 'GET');
    ((d && d.data) || []).forEach((t: Dict) => { if (t && t.name && (!t.language || /^es/i.test(t.language)) && !m.has(t.name)) m.set(t.name, t); });
    const after = d && d.paging && d.paging.cursors && d.paging.cursors.after;
    ruta = d && d.paging && d.paging.next && after ? '/' + cfg.waba_id + '/message_templates' + campos + '&after=' + encodeURIComponent(after) : '';
  }
  return m;
}
function instruccionesManual(p: Dict) {
  return 'Meta pide una muestra del archivo y Kapso no la recibió por la API. Créala una sola vez en Kapso › Templates: nombre «' + p.nombre +
    '», categoría Utility, idioma Spanish, encabezado ' + ({ VIDEO: 'Video', IMAGE: 'Image', DOCUMENT: 'Document' } as Dict)[p.encabezado] +
    ' (cualquier archivo de ese tipo) y el texto que se ve aquí. Después se usa sola.';
}
async function sincronizarPlantillas(cfg: Dict, todas: Dict[], necesarias: Set<string>, res: Dict) {
  if (!llave() || !cfg.waba_id) return;
  let meta: Map<string, Dict>;
  try { meta = await plantillasMeta(cfg); } catch (e) { res.avisos.push('No se pudo leer las plantillas en Meta: ' + msj(e)); return; }
  res.plantillas_en_meta = meta.size;
  let enviadas = 0;
  for (const p of todas) {
    if (!p.id) continue;
    const t = meta.get(p.nombre), cambios: Dict = {};
    if (t) {                                             // ya está en Meta: se copia su estado
      const est = ESTADO_META[String(t.status || '').toUpperCase()] || 'enviada';
      const motivo = est === 'rechazada' ? 'Meta la rechazó' + (t.rejected_reason && t.rejected_reason !== 'NONE' ? ' (' + t.rejected_reason + ')' : '') + '.'
        : est === 'pausada' ? 'Meta la pausó por quejas o poca lectura: se reanuda sola en unas horas.' : est === 'desactivada' ? 'Meta la desactivó.' : null;
      if (est !== p.estado) cambios.estado = est;
      if ((t.category || null) !== (p.categoria_meta || null)) cambios.categoria_meta = t.category || null;
      if (t.id && String(t.id) !== String(p.meta_id || '')) cambios.meta_id = String(t.id);
      if (t.language && t.language !== (p.idioma || 'es')) cambios.idioma = t.language;
      if (motivo !== (p.motivo || null)) cambios.motivo = motivo;
    } else if (p.estado === 'borrador' && necesarias.has(p.nombre) && enviadas < 15) {
      enviadas++;
      try {
        const d = await mandarARevision(cfg, p);
        cambios.estado = ESTADO_META[String(d.status || 'PENDING').toUpperCase()] || 'enviada';
        cambios.meta_id = d.id ? String(d.id) : null;
        cambios.categoria_meta = d.category || null;
        cambios.enviada_en = ahoraISO();
        cambios.motivo = null;
        res.plantillas_enviadas++;
      } catch (e) {
        const m = msj(e);
        if (/already exists|ya existe/i.test(m)) { cambios.estado = 'enviada'; cambios.motivo = null; cambios.enviada_en = ahoraISO(); }
        else { cambios.estado = 'error'; cambios.motivo = p.encabezado ? instruccionesManual(p) + ' (' + m + ')' : m; }
      }
    }
    if (Object.keys(cambios).length) {
      cambios.revisada_en = ahoraISO();
      await actualizar('wa_auto_plantillas', 'id=eq.' + p.id, cambios);
      Object.assign(p, cambios);
    }
  }
}

/* ---------------------------------------------------------- enviar */
function parametroMedia(e: Dict) {
  const link = enlaceMedia(e.ruta);
  if (e.tipo === 'VIDEO') return { type: 'video', video: { link } };
  if (e.tipo === 'IMAGE') return { type: 'image', image: { link } };
  return { type: 'document', document: { link, filename: e.archivo || 'archivo' } };
}
async function enviarPlantilla(cfg: Dict, cel: string, nombre: string, idioma: string, params: string[], encabezado: Dict | null, botonParam?: string) {
  const comps: Dict[] = [];
  if (encabezado) comps.push({ type: 'header', parameters: [parametroMedia(encabezado)] });
  if (params.length) comps.push({ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t })) });
  if (botonParam) comps.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: botonParam }] });
  const d = await kapso(cfg.kapso_base, '/' + cfg.phone_number_id + '/messages',
    { messaging_product: 'whatsapp', recipient_type: 'individual', to: waNum(cel), type: 'template', template: { name: nombre, language: { code: idioma || 'es' }, components: comps } });
  return (d && d.messages && d.messages[0] && d.messages[0].id) || null;
}
async function enviarTexto(cfg: Dict, cel: string, texto: string) {
  const d = await kapso(cfg.kapso_base, '/' + cfg.phone_number_id + '/messages',
    { messaging_product: 'whatsapp', recipient_type: 'individual', to: waNum(cel), type: 'text', text: { body: texto, preview_url: false } });
  return (d && d.messages && d.messages[0] && d.messages[0].id) || null;
}
/* Qué hacer si no salió: algunos errores se reintentan en la siguiente corrida; otros, mañana; otros, ya no. */
function manana9() { const d = new Date(Date.now() - 5 * 3600e3 + 24 * 3600e3); return d.toISOString().slice(0, 10) + 'T14:00:00Z'; }   // 9:00 de Lima
function siNoSalio(codigo: string, intentos: number): { cuando: string | null; motivo: string } {
  const c = String(codigo || '');
  if (c === '131049') return { cuando: manana9(), motivo: 'Meta no lo entregó para no saturar a la persona con publicidad: se reintenta mañana.' };
  if (['131026', '133010', '131021', '131030', '131045'].includes(c)) return { cuando: null, motivo: 'Ese número no puede recibir este WhatsApp (¿no tiene WhatsApp o está mal?). Corrige el celular y se vuelve a intentar.' };
  if (c === '131050') return { cuando: null, motivo: 'La persona pidió no recibir mensajes de este número.' };
  if (/^132/.test(c) || c === 'sin_kapso') return { cuando: manana9(), motivo: 'La plantilla o la conexión no están listas: se reintenta mañana.' };
  if (intentos >= 4) return { cuando: manana9(), motivo: 'No salió después de varios intentos: se reintenta mañana.' };
  return { cuando: new Date(Date.now() + 50 * 60e3).toISOString(), motivo: 'No salió: se reintenta en la próxima corrida.' };
}

/* ---------------------------------------------------------- la corrida */
function dentroDeHorario(hora: string, cfg: Dict) {
  const h = String(hora || '00:00').slice(0, 5);
  return h >= String(cfg.hora_desde || '08:00').slice(0, 5) && h < String(cfg.hora_hasta || '20:00').slice(0, 5);
}
/* Un mensaje de cliente es de una orden: su «paso» en el registro es la acción (n_orden::tipo). */
const pasoFila = (it: Dict) => (it.tipo === 'cliente' && it.accion ? String(it.accion) : String(it.paso));

async function corrida(corridaId: string, modo: string) {
  const t0 = Date.now();
  const ins = await rpc('wa_auto_insumos');
  const cfg: Dict = ins.config || {};
  const res: Dict = { modo, hoy: ins.hoy, hora: ins.hora, total: 0, enviados: 0, prueba: 0, espera: 0, no_salen: 0, fallos: 0, ya_hechos: 0, quedan: 0,
                      errores: 0, atrasados: 0, avisos: [] as string[], plantillas_nuevas: 0, plantillas_enviadas: 0, fuera_de_horario: false,
                      kapso: !!llave(), conectado: !!(llave() && cfg.phone_number_id) };
  const R = crearReglas({ bv: ins.bv, cl: ins.cl });
  const items: Dict[] = R.porEnviarHoy();
  res.total = items.length;
  // un mensaje de cliente muy atrasado no sale solo: queda en la página, para decidir si aún sirve
  const maxAtraso = Number.isFinite(Number(cfg.max_atraso)) ? Number(cfg.max_atraso) : 7;
  for (const it of items) {
    if (it.tipo === 'cliente' && Number(it.atraso) > maxAtraso && !it.problemas.length) {
      it.atrasado = true;
      it.problemas = ['Tiene ' + it.atraso + ' días de atraso: no sale solo (en Ajustes, hasta ' + maxAtraso + '). Si aún sirve, mándalo desde Clientes.'];
    }
  }

  // plantillas que faltan: las de los mensajes de hoy y las de los avisos de respuesta
  const porNombre = new Map<string, Dict>(((ins.plantillas || []) as Dict[]).map((p) => [p.nombre, p]));
  const necesarias = new Set<string>(), nuevas: Dict[] = [];
  const agregar = (p: Dict) => {
    necesarias.add(p.nombre);
    if (!porNombre.has(p.nombre)) { const f = filaPlantilla(p); nuevas.push(f); porNombre.set(p.nombre, { ...f, estado: 'borrador' }); }
  };
  for (const it of items) if (!it.problemas.length) for (const p of it.partes) agregar(p);
  Object.keys(AVISOS).forEach((k) => agregar(plantillaAviso(k)));
  if (nuevas.length) {
    const creadas: Dict[] = (await insertar('wa_auto_plantillas?on_conflict=nombre', nuevas, 'return=representation,resolution=ignore-duplicates')) || [];
    res.plantillas_nuevas = creadas.length;
    creadas.forEach((p) => porNombre.set(p.nombre, p));
    const sinId = nuevas.filter((n) => !porNombre.get(n.nombre)?.id).map((n) => n.nombre);
    if (sinId.length) ((await leer('wa_auto_plantillas', 'select=*&nombre=in.(' + sinId.map((n) => '"' + n + '"').join(',') + ')')) || []).forEach((p: Dict) => porNombre.set(p.nombre, p));
  }
  await sincronizarPlantillas(cfg, Array.from(porNombre.values()), necesarias, res);

  const enHorario = dentroDeHorario(ins.hora, cfg);
  res.fuera_de_horario = !enHorario;
  const recientes: Dict[] = ins.recientes || [];
  const filasDe = (it: Dict, parte?: number) => recientes.filter((r) => r.tipo === it.tipo && String(r.ref) === String(it.ref) && r.paso === pasoFila(it) && (parte == null || Number(r.parte) === parte));
  const ultimaDe = (it: Dict, parte: number) => filasDe(it, parte).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  const hoyDe = (it: Dict, parte: number) => filasDe(it, parte).find((r) => r.fecha === ins.hoy);
  const guardarFila = async (it: Dict, p: Dict | null, parte: number, datos: Dict) => {
    const pl = p ? porNombre.get(p.nombre) : null;
    const base = { fecha: ins.hoy, corrida_id: corridaId, tipo: it.tipo, ref: String(it.ref), paso: pasoFila(it), titulo: it.titulo, accion: it.accion || null,
                   n_orden: it.n_orden || null, parte, partes: it.partes.length || 1, celular: it.celular || '', nombre: it.nombre,
                   plantilla: p ? p.nombre : null, plantilla_id: pl && pl.id ? pl.id : null, params: p ? p.params : [], encabezado: p ? p.encabezado : null,
                   texto: p ? p.texto : it.texto };
    const h = hoyDe(it, parte);
    if (h) { const f = await actualizar('wa_auto_envios', 'id=eq.' + h.id, { ...base, ...datos }); Object.assign(h, (f && f[0]) || datos); return h; }
    const f = await insertar('wa_auto_envios', [{ ...base, ...datos }]);
    recientes.push(f[0]);
    return f[0];
  };

  let mensajes = 0;
  const atendidos = new Set<string>();                  // una cosa por persona en cada corrida
  const procesar = async (it: Dict) => {
    const persona = it.tipo + ':' + it.ref;
    if (it.problemas.length) {                          // no sale solo: queda a la vista en la página
      if (it.atrasado) res.atrasados++; else res.no_salen++;
      const h = hoyDe(it, 1);
      if (!h || !ENTREGADO.includes(h.estado)) await guardarFila(it, it.partes[0] || null, 1, { estado: 'omitido', motivo: it.problemas.join(' ') });
      return;
    }
    const ultimas = it.partes.map((_: Dict, i: number) => ultimaDe(it, i + 1));
    if (ultimas.every((e: Dict) => e && ENTREGADO.includes(e.estado))) {
      // ya salió todo (p. ej. se cortó antes de anotarlo): se anota y listo
      if (modo === 'encendido') await anotar(it, filasDe(it).filter((r) => ENTREGADO.includes(r.estado) && !r.anotado_id));
      res.ya_hechos++;
      return;
    }
    if (modo === 'prueba') {
      for (let i = 0; i < it.partes.length; i++) if (!ultimas[i] || !ENTREGADO.includes(ultimas[i].estado)) await guardarFila(it, it.partes[i], i + 1, { estado: 'prueba', motivo: null });
      res.prueba++;
      return;
    }
    if (modo !== 'encendido') return;
    // todas sus plantillas tienen que estar aprobadas: un mensaje no sale a medias
    const pend = it.partes.map((p: Dict) => porNombre.get(p.nombre)).filter((p: Dict | undefined) => !p || p.estado !== 'aprobada');
    const tarde = Date.now() - t0 > PRESUPUESTO_MS || mensajes + it.partes.length > MAX_MENSAJES;
    if (pend.length || !res.conectado || !enHorario || atendidos.has(persona) || tarde) {
      const motivo = !res.conectado ? 'Falta conectar el número en Kapso.' : !enHorario ? 'Fuera del horario de envío: sale en la próxima corrida.'
        : atendidos.has(persona) ? 'A esta persona ya le salió otro mensaje en esta corrida: este sale en la siguiente.'
        : pend.some((p: Dict) => p && p.estado === 'rechazada') ? 'Meta rechazó la plantilla: revísala en Plantillas.'
        : pend.some((p: Dict) => p && (p.estado === 'error' || p.estado === 'desactivada')) ? 'La plantilla no está lista: revísala en Plantillas.'
        : pend.some((p: Dict) => p && p.estado === 'pausada') ? 'Meta pausó la plantilla por unas horas: sale cuando la reanude.'
        : pend.length ? 'Esperando que Meta apruebe la plantilla.' : 'Sale en la próxima corrida (se llegó al máximo de esta).';
      for (let i = 0; i < it.partes.length; i++) if (!ultimas[i] || !ENTREGADO.includes(ultimas[i].estado)) await guardarFila(it, it.partes[i], i + 1, { estado: 'espera', motivo });
      if (tarde) res.quedan++; else res.espera++;
      return;
    }
    atendidos.add(persona);
    // se manda parte por parte, en orden; lo que ya llegó no se repite
    for (let i = 0; i < it.partes.length; i++) {
      const p = it.partes[i], u = ultimas[i];
      if (u && ENTREGADO.includes(u.estado)) continue;
      if (u && u.estado === 'fallo' && (!u.reintentar_desde || new Date(u.reintentar_desde).getTime() > Date.now())) { res.espera++; return; }
      const intentos = (u && u.fecha === ins.hoy ? Number(u.intentos) || 0 : 0) + 1;
      try {
        const wamid = await enviarPlantilla(cfg, it.celular, p.nombre, porNombre.get(p.nombre)?.idioma || 'es', p.params, p.encabezado);
        await guardarFila(it, p, i + 1, { estado: 'enviado', wamid, intentos, enviado_en: ahoraISO(), motivo: null, error_codigo: null, reintentar_desde: null });
        mensajes++;
        if (i < it.partes.length - 1) await dormir(PAUSA_MS);
      } catch (e) {
        const er = e as ErrorKapso, x = siNoSalio(er.codigo, intentos);
        await guardarFila(it, p, i + 1, { estado: 'fallo', error_codigo: er.codigo || null, intentos, reintentar_desde: x.cuando, fallo_en: ahoraISO(),
                                           motivo: x.motivo + ' (' + plano(er.message, 200) + ')' });
        res.fallos++;
        return;
      }
    }
    await anotar(it, filasDe(it).filter((r) => r.fecha === ins.hoy && ENTREGADO.includes(r.estado)));
    res.enviados++;
  };
  for (const it of items) {
    try { await procesar(it); } catch (e) {
      res.errores++;
      if (res.avisos.length < 6) res.avisos.push((it.titulo || it.paso) + ' · ' + (it.nombre || '') + ': ' + msj(e));
    }
  }
  if (res.conectado && modo === 'encendido') {          // lo que se mandó queda como usado (para saber qué plantillas siguen vivas)
    const usadas = Array.from(new Set(recientes.filter((r) => r.fecha === ins.hoy && r.estado === 'enviado').map((r) => r.plantilla).filter(Boolean)));
    if (usadas.length) await actualizar('wa_auto_plantillas', 'nombre=in.(' + usadas.map((n) => '"' + n + '"').join(',') + ')', { usada_en: ahoraISO() }).catch(() => null);
  }
  return res;
}
/* Queda anotado como si se hubiera mandado desde la página: así «Para hoy» lo da por hecho. */
async function anotar(it: Dict, filas: Dict[]) {
  let tabla = '', id = '';
  const texto = String(it.texto || '').slice(0, 1500);
  if (it.tipo === 'asesor') { tabla = 'n0_mensajes'; id = await rpc('wa_auto_anotar_asesor', { p_inscrito: it.ref, p_paso: it.paso, p_texto: texto }); }
  else if (it.tipo === 'cliente' && it.n_orden) { tabla = 'crm_seguimiento'; id = await rpc('wa_auto_anotar_cliente', { p_n_orden: it.n_orden, p_tipo: it.paso, p_texto: texto }); }
  const ids = filas.map((f) => f.id).filter(Boolean);
  if (tabla && ids.length) {
    await actualizar('wa_auto_envios', 'id=in.(' + ids.join(',') + ')', { anotado_tabla: tabla, anotado_id: String(id) });
    filas.forEach((f) => { f.anotado_id = String(id); });
  }
}
async function cerrarCorrida(id: string, fn: () => Promise<Dict>) {
  let res: Dict | null = null, err: string | null = null;
  try { res = await fn(); } catch (e) { err = msj(e); }
  const al = await reglasAlDia();
  if (res) res.reglas_al_dia = al;
  await rpc('wa_auto_corrida_cerrar', { p_id: id, p_resumen: res, p_error: err, p_huella: HUELLA, p_al_dia: al });
  if (err) throw new Error(err);
  return res as Dict;
}

/* ---------------------------------------------------------- webhook de Kapso */
let secretoCache: { t: number; v: string } = { t: 0, v: '' };
async function secreto() {
  const env = Deno.env.get('KAPSO_WEBHOOK_SECRET');
  if (env) return env;
  if (Date.now() - secretoCache.t < 5 * 60 * 1000 && secretoCache.v) return secretoCache.v;
  const v = await rpc('wa_auto_secreto');
  secretoCache = { t: Date.now(), v: v || '' };
  return secretoCache.v;
}
async function firmaValida(req: Request, crudo: string) {
  const s = await secreto(), f = (req.headers.get('x-webhook-signature') || '').trim().toLowerCase().replace(/^sha256=/, '');
  if (!s || !f) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return igualSeguro(hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(crudo))), f);
}
function eventosDe(cuerpo: any): Dict[] {
  if (Array.isArray(cuerpo)) return cuerpo.flatMap(eventosDe);
  if (cuerpo && Array.isArray(cuerpo.data)) return cuerpo.data.flatMap(eventosDe);
  return cuerpo && cuerpo.message ? [cuerpo] : [];
}
async function webhook(req: Request, crudo: string, h: Dict) {
  if (!(await firmaValida(req, crudo))) return json({ error: 'Firma inválida' }, 401, h);
  const tipo = req.headers.get('x-webhook-event') || '';
  let cuerpo: any = null;
  try { cuerpo = JSON.parse(crudo); } catch { return json({ ok: true }, 200, h); }
  const evs = eventosDe(cuerpo);
  if (/message\.received$/.test(tipo)) enSegundoPlano(config().then((cfg) => recibidos(cfg, evs)));
  else if (/message\.(sent|delivered|read|failed)$/.test(tipo)) for (const ev of evs) await estadoDe(tipo, ev);
  return json({ ok: true }, 200, h);
}
const ORDEN: Dict = { pendiente: 0, espera: 0, prueba: 0, omitido: 0, enviado: 1, entregado: 2, leido: 3 };
async function estadoDe(tipo: string, ev: Dict) {
  const m = ev.message || {};
  if (!m.id) return;
  const f = ((await leer('wa_auto_envios', 'wamid=eq.' + encodeURIComponent(m.id) + '&select=*')) || [])[0];
  if (!f) return;
  const ahora = ahoraISO();
  if (/failed$/.test(tipo)) {
    const st = (((m.kapso && m.kapso.statuses) || []) as Dict[]).filter((s) => s.errors && s.errors.length).pop() || {};
    const er = (st.errors && st.errors[0]) || (m.errors && m.errors[0]) || {};
    const x = siNoSalio(String(er.code || ''), Number(f.intentos) || 1);
    await actualizar('wa_auto_envios', 'id=eq.' + f.id, { estado: 'fallo', fallo_en: ahora, error_codigo: er.code ? String(er.code) : null, reintentar_desde: x.cuando,
      motivo: x.motivo + (er.title || er.message ? ' (' + plano(er.message || er.title, 200) + ')' : '') });
    // lo anotado se anula para que vuelva a «Para hoy» (y se reintente si se puede)
    if (f.anotado_id && f.anotado_tabla) {
      await rpc('wa_auto_desanotar', { p_tabla: f.anotado_tabla, p_id: f.anotado_id });
      await actualizar('wa_auto_envios', 'anotado_id=eq.' + encodeURIComponent(f.anotado_id) + '&anotado_tabla=eq.' + f.anotado_tabla, { anotado_id: null, anotado_tabla: null });
    }
    return;
  }
  const nuevo = /read$/.test(tipo) ? 'leido' : /delivered$/.test(tipo) ? 'entregado' : 'enviado';
  if (f.estado === 'fallo' || (ORDEN[f.estado] ?? 0) >= ORDEN[nuevo]) return;
  await actualizar('wa_auto_envios', 'id=eq.' + f.id, { estado: nuevo, ...(nuevo === 'entregado' ? { entregado_en: ahora } : nuevo === 'leido' ? { leido_en: ahora, entregado_en: f.entregado_en || ahora } : {}) });
}
function textoDe(m: Dict) {
  if (m.text && m.text.body) return String(m.text.body);
  if (m.button && m.button.text) return String(m.button.text);
  if (m.interactive) { const r = m.interactive.button_reply || m.interactive.list_reply || {}; if (r.title) return String(r.title); }
  const media: Dict = { image: '📷 [foto]', video: '🎥 [video]', audio: '🎤 [audio]', voice: '🎤 [audio]', document: '📄 [documento]', sticker: '[sticker]', location: '📍 [ubicación]', contacts: '👤 [contacto]', reaction: '[reacción]' };
  const cap = m[m.type] && m[m.type].caption ? ' ' + m[m.type].caption : '';
  return (media[m.type] || '[' + (m.type || 'mensaje') + ']') + cap;
}
const RE_BAJA = /^\s*(baja|stop|darme de baja|dar(me)? de baja|no (quiero|deseo) recibir (m[aá]s )?(mensajes|esto|nada)|no me (env[ií]en|escriban|manden) m[aá]s( mensajes)?)\s*[.!]*\s*$/i;
async function recibidos(cfg: Dict, evs: Dict[]) {
  // se agrupa por quien escribe: lo que manda seguido sale en un solo aviso
  const grupos = new Map<string, { evs: Dict[]; nombre: string }>();
  for (const ev of evs) {
    const m = ev.message || {};
    if (m.kapso && m.kapso.direction === 'outbound') continue;
    // del Perú: sus 9 dígitos (como en la base); de otro país: el número completo, solo para responderle
    const num = String(m.from || (ev.conversation && ev.conversation.phone_number) || '').replace(/\D/g, '');
    const cel = celPe(num) || (num.length >= 8 && !num.startsWith('51') ? num : '');
    if (!cel) continue;
    const g = grupos.get(cel) || { evs: [] as Dict[], nombre: String((ev.conversation && ev.conversation.contact_name) || '') };
    g.evs.push(ev);
    grupos.set(cel, g);
  }
  let n = 0;
  for (const [cel, g] of grupos) {
    const filas: Dict[] = [];
    for (const ev of g.evs) {
      const m = ev.message || {};
      const f = await insertar('wa_auto_respuestas?on_conflict=evento', [{ evento: m.id ? 'in:' + m.id : 'ev:' + Date.now() + ':' + (n++), wamid: m.id || null, celular: cel,
        contacto: g.nombre || null, tipo: m.type || null, texto: textoDe(m).slice(0, 4000) }], 'return=representation,resolution=ignore-duplicates');
      if (f && f[0]) filas.push(f[0]);
    }
    if (filas.length) {
      try { await atenderRespuesta(cfg, cel, filas, true); } catch (e) {
        await actualizar('wa_auto_respuestas', 'id=in.(' + filas.map((f) => f.id).join(',') + ')', { estado: 'sin_reenvio', motivo: 'No se pudo pasar: ' + plano(msj(e), 160) }).catch(() => null);
      }
    }
  }
}
async function atenderRespuesta(cfg: Dict, cel: string, filas: Dict[], responder: boolean) {
  const ids = 'id=in.(' + filas.map((f) => f.id).join(',') + ')';
  if (cel === celPe(cfg.nelson_celular)) {                // tu propio número (p. ej. al probar): no se reenvía a nadie
    await actualizar('wa_auto_respuestas', ids, { de_tipo: 'nelson', de_nombre: 'Nelson', para: 'nadie', estado: 'atendida', atendida_en: ahoraISO(), motivo: 'Es tu número.' });
    return;
  }
  const q = cel.length === 9 ? await rpc('wa_auto_contacto', { p_celular: cel }) : { de_tipo: 'desconocido' };
  const texto = filas.map((f) => f.texto).join(' / ');
  const baja = filas.some((f) => RE_BAJA.test(String(f.texto || '')));
  const nombre = titulo(q.de_nombre || filas[0].contacto || '') || (cel.length === 9 ? '+51 ' : '+') + cel;
  const asesor = q.asesor || {};
  const sobre = q.sobre ? 'respondió a «' + plano(q.sobre, 70) + '»' : 'sin mensaje previo';
  // a quién se le pasa
  let para = 'nadie', paraCel = '', paraNombre = '', plantilla = '', params: string[] = [], motivo = '';
  if (q.de_tipo === 'cliente' && cfg.reenviar_clientes !== false && celPe(asesor.celular) && celPe(asesor.celular) !== cel) {
    para = 'asesor'; paraCel = celPe(asesor.celular); paraNombre = titulo(asesor.nombre);
    plantilla = 'aviso_cliente'; params = [pila(asesor.nombre) || 'equipo', nombre, sobre, plano(texto)];
  } else if (celPe(cfg.nelson_celular) && (q.de_tipo !== 'asesor' || cfg.reenviar_asesores !== false) && (q.de_tipo !== 'cliente' || cfg.reenviar_clientes !== false)) {
    para = 'nelson'; paraCel = celPe(cfg.nelson_celular); paraNombre = 'Nelson';
    if (q.de_tipo === 'asesor') { plantilla = 'aviso_asesor'; params = [nombre, sobre, plano(texto)]; }
    else {
      plantilla = 'aviso_otro';
      const nota = q.de_tipo === 'cliente' ? (asesor.nombre ? 'Es cliente de ' + titulo(asesor.nombre) + ', que no tiene celular registrado.' : 'Es cliente: no se encontró a su asesor.')
        : 'No está en la base de asesores ni de clientes.';
      params = [nombre, plano(texto), nota];
    }
  } else motivo = !celPe(cfg.nelson_celular) ? 'Falta tu celular en Ajustes para pasarte las respuestas.' : 'Según Ajustes, este tipo de respuesta no se reenvía.';
  if (baja && (q.de_tipo === 'cliente' || q.de_tipo === 'asesor') && q.de_ref) await rpc('wa_auto_baja', { p_tipo: q.de_tipo, p_ref: q.de_ref });
  await actualizar('wa_auto_respuestas', ids, { de_tipo: q.de_tipo || 'desconocido', de_ref: q.de_ref || null, de_nombre: q.de_nombre || null, sobre: q.sobre || null, baja,
    para, para_nombre: paraNombre || null, para_celular: paraCel || null, para_codigo: asesor.codigo ? String(asesor.codigo) : null,
    ...(plantilla ? {} : { estado: 'sin_reenvio', motivo: motivo || null }) });
  if (!cfg.phone_number_id || !llave()) {
    await actualizar('wa_auto_respuestas', ids, { estado: 'sin_reenvio', motivo: 'Falta conectar el número en Kapso.' });
    return;
  }
  // el aviso (plantilla) a su asesor o a Nelson
  if (plantilla) {
    const pa = plantillaAviso(plantilla);
    const fila = ((await leer('wa_auto_plantillas', 'nombre=eq.' + pa.nombre + '&select=id,estado,idioma')) || [])[0];
    if (!fila || fila.estado !== 'aprobada') {
      await actualizar('wa_auto_respuestas', ids, { estado: 'sin_reenvio', motivo: 'El aviso aún no está aprobado en Meta: respóndele desde aquí.' });
    } else {
      const env = (await insertar('wa_auto_envios', [{ tipo: 'aviso', ref: filas[0].id, paso: 'aviso', titulo: 'Aviso: escribió ' + nombre, celular: paraCel, nombre: paraNombre,
        plantilla: pa.nombre, plantilla_id: fila.id, params, texto: llenarCuerpo(pa.cuerpo, params), estado: 'pendiente' }]))[0];
      try {
        const wamid = await enviarPlantilla(cfg, paraCel, pa.nombre, fila.idioma || 'es', params, null, waNum(cel));
        await actualizar('wa_auto_envios', 'id=eq.' + env.id, { estado: 'enviado', wamid, enviado_en: ahoraISO(), intentos: 1 });
        await actualizar('wa_auto_respuestas', ids, { estado: 'reenviada', reenvio_id: env.id, motivo: null });
      } catch (e) {
        await actualizar('wa_auto_envios', 'id=eq.' + env.id, { estado: 'fallo', error_codigo: (e as ErrorKapso).codigo || null, motivo: plano(msj(e), 200), intentos: 1, fallo_en: ahoraISO() });
        await actualizar('wa_auto_respuestas', ids, { estado: 'sin_reenvio', motivo: 'No se pudo pasar: ' + plano(msj(e), 160) });
      }
    }
  }
  // respuesta automática a quien escribió (texto libre: la ventana de 24 horas está abierta), una vez cada 12 horas
  if (!responder || (cfg.responder_solo === false && !baja)) return;
  if (!baja) {
    const desde = new Date(Date.now() - 12 * 3600e3).toISOString();
    const ya = await leer('wa_auto_envios', 'tipo=eq.respuesta&celular=eq.' + cel + '&creado_en=gt.' + encodeURIComponent(desde) + '&select=id&limit=1');
    if (ya && ya.length) return;
  }
  const usted = q.de_tipo !== 'asesor' && q.trato !== 'tu';
  const n1 = pila(q.de_nombre || filas[0].contacto), coma = n1 ? ', ' + n1 : '';
  const a1 = pila(asesor.nombre);
  const txt = baja ? (usted ? 'Listo, ya no le enviaremos estos mensajes. Si cambia de opinión, escríbanos aquí. 🙏' : 'Listo, ya no te enviaremos estos mensajes. Si cambias de opinión, escríbenos aquí. 🙏')
    : para === 'asesor' ? (usted ? '¡Gracias' + coma + '! 🙌 Ya le pasé su mensaje a ' + a1 + ', su asesor(a) de Rena Ware, para que le responda por WhatsApp.'
                                 : '¡Gracias' + coma + '! 🙌 Ya le pasé tu mensaje a ' + a1 + ', tu asesor(a) de Rena Ware, para que te responda por WhatsApp.')
    : q.de_tipo === 'asesor' ? '¡Gracias' + coma + '! 🙌 Le paso tu mensaje a Nelson para que te responda.'
    : '¡Gracias por escribir! 🙌 Este número envía los avisos del Equipo Arequipa de Rena Ware. Ya le pasamos su mensaje al equipo.';
  const env = (await insertar('wa_auto_envios', [{ tipo: 'respuesta', ref: filas[0].id, paso: 'respuesta', titulo: 'Respuesta automática', celular: cel, nombre, plantilla: 'texto', texto: txt, estado: 'pendiente' }]))[0];
  try {
    const wamid = await enviarTexto(cfg, cel, txt);
    await actualizar('wa_auto_envios', 'id=eq.' + env.id, { estado: 'enviado', wamid, enviado_en: ahoraISO(), intentos: 1 });
  } catch (e) {
    await actualizar('wa_auto_envios', 'id=eq.' + env.id, { estado: 'fallo', error_codigo: (e as ErrorKapso).codigo || null, motivo: plano(msj(e), 200), intentos: 1, fallo_en: ahoraISO() });
  }
}

/* ---------------------------------------------------------- acciones de la página */
async function conectar() {
  const cfg = await config();
  const lista = await kapso(PLATAFORMA, '/whatsapp/phone_numbers', undefined, 'GET');
  const nums: Dict[] = (lista && (lista.data || lista.phone_numbers || lista)) || [];
  if (!Array.isArray(nums) || !nums.length) throw new Error('Kapso no tiene ningún número conectado todavía.');
  const n = nums.find((x) => String(x.phone_number_id || x.id) === String(cfg.phone_number_id)) || nums[0];
  const phone = String(n.phone_number_id || n.id), waba = String(n.business_account_id || n.waba_id || n.whatsapp_business_account_id || cfg.waba_id || '');
  if (!waba) throw new Error('No se encontró la cuenta de WhatsApp Business (WABA) del número.');
  await actualizar('wa_auto_config', 'id=eq.vigente', { phone_number_id: phone, waba_id: waba, kapso_listo: true, actualizado_en: ahoraISO() });
  // el webhook: Kapso avisa estados y respuestas a esta función, firmados con un secreto que queda en Vault
  let s = await secreto();
  if (!s) {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    s = hex(b.buffer);
    await rpc('wa_auto_secreto_guardar', { p_valor: s });
    secretoCache = { t: Date.now(), v: s };
  }
  const ya = await kapso(PLATAFORMA, '/whatsapp/phone_numbers/' + phone + '/webhooks', undefined, 'GET').catch(() => null);
  const hooks: Dict[] = (ya && (ya.data || ya)) || [];
  const existe = Array.isArray(hooks) ? hooks.find((w) => w && w.url === FUNCION) : null;
  const def = { url: FUNCION, secret_key: s, active: true, payload_version: 'v2',
    events: ['whatsapp.message.received', 'whatsapp.message.sent', 'whatsapp.message.delivered', 'whatsapp.message.read', 'whatsapp.message.failed'],
    buffer_enabled: true, buffer_window_seconds: 60, buffer_events: ['whatsapp.message.received'] };
  if (existe) await kapso(PLATAFORMA, '/whatsapp/phone_numbers/' + phone + '/webhooks/' + existe.id, { whatsapp_webhook: def }, 'PATCH');
  else await kapso(PLATAFORMA, '/whatsapp/phone_numbers/' + phone + '/webhooks', { whatsapp_webhook: def });
  await actualizar('wa_auto_config', 'id=eq.vigente', { webhook_listo: true });
  return { phone_number_id: phone, waba_id: waba, numero: n.display_phone_number || n.phone_number || null, nombre: n.verified_name || n.display_name || n.name || null };
}
/* Una prueba: el mensaje de una persona, pero a tu celular (sus plantillas tienen que estar aprobadas). */
async function probar(b: Dict) {
  const ins = await rpc('wa_auto_insumos');
  const cfg = ins.config || {};
  const destino = celPe(cfg.nelson_celular);
  if (!destino) throw new Error('Pon tu celular en Ajustes para recibir la prueba.');
  if (!llave() || !cfg.phone_number_id) throw new Error('Falta conectar el número en Kapso.');
  const R = crearReglas({ bv: ins.bv, cl: ins.cl });
  let it: Dict | null = null;
  if (b.tipo === 'asesor') {
    const p = R.asesorPorId(b.ref);
    if (!p) throw new Error('No encontré a ese asesor.');
    const m = /^bv([1-5])$/.exec(b.paso || '');
    it = m ? R.itemBv(p, Number(m[1])) : R.itemSeg(p, b.paso);
  } else if (b.tipo === 'cliente') {
    const a = R.CL.acciones.find((x: Dict) => x.clave === b.clave);
    if (!a) throw new Error('No encontré ese mensaje del cliente.');
    it = R.itemCl(a);
  }
  if (!it) throw new Error('Falta decir qué mensaje probar.');
  if (it.problemas.length) throw new Error(it.problemas.join(' '));
  const aprob = new Map(((ins.plantillas || []) as Dict[]).filter((p) => p.estado === 'aprobada').map((p) => [p.nombre, p]));
  const faltan = it.partes.filter((p: Dict) => !aprob.has(p.nombre));
  if (faltan.length) return { ok: false, motivo: 'Faltan aprobar ' + faltan.length + ' plantilla(s) de este mensaje.' };
  let n = 0;
  for (const p of it.partes) {
    const wamid = await enviarPlantilla(cfg, destino, p.nombre, aprob.get(p.nombre)?.idioma || 'es', p.params, p.encabezado);
    await insertar('wa_auto_envios', [{ tipo: 'aviso', ref: 'prueba', paso: 'prueba', titulo: 'Prueba: ' + it.titulo + ' (' + it.nombre + ')', celular: destino, nombre: 'Prueba',
      plantilla: p.nombre, params: p.params, encabezado: p.encabezado, texto: p.texto, estado: 'enviado', wamid, enviado_en: ahoraISO(), intentos: 1 }]);
    n++;
    await dormir(PAUSA_MS);
  }
  return { ok: true, enviados: n };
}
async function reenviar(b: Dict) {
  const cfg = await config();
  const r = ((await leer('wa_auto_respuestas', 'id=eq.' + encodeURIComponent(b.id) + '&select=*')) || [])[0];
  if (!r) throw new Error('La respuesta no existe');
  await atenderRespuesta(cfg, r.celular, [r], false);
  return ((await leer('wa_auto_respuestas', 'id=eq.' + r.id + '&select=*')) || [])[0];
}
async function plantillaReintentar(b: Dict) {
  const f = await actualizar('wa_auto_plantillas', 'id=eq.' + encodeURIComponent(b.id) + '&estado=in.(error,rechazada)', { estado: 'borrador', motivo: null });
  if (!f || !f.length) throw new Error('Esa plantilla no está para reintentar.');
  return f[0];
}
async function previa() {
  const ins = await rpc('wa_auto_insumos');
  const R = crearReglas({ bv: ins.bv, cl: ins.cl });
  const est = new Map(((ins.plantillas || []) as Dict[]).map((p) => [p.nombre, p.estado]));
  return { hoy: ins.hoy, hora: ins.hora, huella: HUELLA, items: R.porEnviarHoy().map((it: Dict) => ({
    tipo: it.tipo, ref: it.ref, paso: it.paso, accion: it.accion || null, titulo: it.titulo, nombre: it.nombre, celular: it.celular, problemas: it.problemas, avisos: it.avisos,
    partes: it.partes.map((p: Dict) => ({ nombre: p.nombre, estado: est.get(p.nombre) || 'nueva', encabezado: p.encabezado && p.encabezado.tipo, texto: p.texto })) })) };
}
async function nuevaCorrida(origen: string, modo: string) {
  const k = await rpc('wa_auto_corrida_pedir', { p_origen: origen, p_modo: modo });
  const m = await rpc('wa_auto_corrida_iniciar', { p_id: k.id, p_clave: k.clave });
  if (!m) throw new Error('Ya hay una revisión en curso: espera un minuto y vuelve a intentar.');
  return k.id as string;
}

/* ---------------------------------------------------------- entrada */
Deno.serve(async (req: Request) => {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405, h);
  const crudo = await req.text();
  try {
    if (req.headers.get('x-webhook-event') || req.headers.get('x-webhook-signature')) return await webhook(req, crudo, h);
    const b = JSON.parse(crudo || '{}');
    if (b.accion === 'corrida') {                       // desde pg_cron: la base la pidió hace un momento
      const modo = await rpc('wa_auto_corrida_iniciar', { p_id: b.id, p_clave: b.clave });
      if (!modo) return json({ error: 'Corrida no válida o ya hay otra en curso' }, 409, h);
      enSegundoPlano(cerrarCorrida(b.id, () => corrida(b.id, modo)));
      return json({ ok: true, id: b.id }, 202, h);
    }
    if (!b.token || !(await rpc('wa_auto_sesion', { p_token: b.token }))) return json({ error: 'Sesion invalida' }, 401, h);
    if (b.accion === 'estado') return json({ huella: HUELLA, al_dia: await reglasAlDia(), kapso: !!llave(), webhook: !!(await secreto()) }, 200, h);
    if (b.accion === 'previa') return json(await previa(), 200, h);
    if (b.accion === 'correr') {
      const modo = b.modo === 'encendido' ? 'encendido' : 'prueba';
      const id = await nuevaCorrida('pagina', modo);
      if (modo === 'prueba') return json(await cerrarCorrida(id, () => corrida(id, modo)), 200, h);
      enSegundoPlano(cerrarCorrida(id, () => corrida(id, modo)));
      return json({ ok: true, id, en_curso: true }, 202, h);
    }
    if (b.accion === 'conectar') return json(await conectar(), 200, h);
    if (b.accion === 'probar') return json(await probar(b), 200, h);
    if (b.accion === 'reenviar') return json(await reenviar(b), 200, h);
    if (b.accion === 'plantilla_reintentar') return json(await plantillaReintentar(b), 200, h);
    return json({ error: 'Acción no válida' }, 400, h);
  } catch (e) {
    return json({ error: msj(e) }, 500, h);
  }
});
