// Generado por servidor/construir.js a partir de index.html: no se edita a mano.
// Son las mismas reglas y textos de la página. Si cambian allá, se vuelve a generar y a desplegar wa-auto.
export const HUELLA = "486ab287ac15facb";
export function crearReglas(entrada) {

  'use strict';
  /* El reloj de Lima (UTC−5, sin horario de verano), aunque el servidor corra en otra zona:
     las fechas «locales» de la página (getDate, getDay, getHours…) quedan en hora de Lima. */
  var RealDate = globalThis.Date;
  var AHORA = entrada.ahoraMs == null ? RealDate.now() : Number(entrada.ahoraMs);
  var DESFASE = (new RealDate(AHORA).getTimezoneOffset() - 300) * 60000;
  class Date extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(AHORA + DESFASE);
      else if (a.length === 1 && typeof a[0] === 'string' && /\d{2}:\d{2}/.test(a[0]) && /(Z|[+-]\d{2}:?\d{2})$/.test(a[0].trim())) super(RealDate.parse(a[0]) + DESFASE);
      else super(...a);
    }
    static now() { return AHORA + DESFASE; }
  }
  var S = { asesores: [], nivel0: null, plazo: 30, plantillas: [], empieceYa: [], periodos: [], items: [], ajustesData: {} };
  function leerHorario() { return waHorario(); }       // en la página sale del recuadro de horario; aquí, de Nivel Cero

  var HORARIO_BASE = [{ dia: 2, hora: '09:30' }, { dia: 3, hora: '16:00' }, { dia: 5, hora: '16:30' }];
  

  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_CAP = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  var MARGEN_MS = 2 * 60 * 60 * 1000;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function diasEntre(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
  function fmtLargo(d) { return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  /* Igual que Nivel Cero: el plazo va del inicio a `plazo` días después, ambos incluidos. */
  function fechaLimite(iso, plazo) {
    var d = parseISO(iso);
    return d ? addDays(d, plazo || 30) : null;
  }
  function deadlineText(iso, plazo) {
    var d = fechaLimite(iso, plazo);
    return d ? fmtLargo(d) : '';
  }
  function fmtHora(h, m) { return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'a. m.' : 'p. m.'); }
  function aLas(h) { return (h % 12 || 12) === 1 ? 'a la' : 'a las'; }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '').replace(/,/g, '');
    if (!s) return null;
    var x = parseFloat(s);
    return isFinite(x) ? x : null;
  }
  function fmtSoles(n) {
    var neg = n < 0;
    n = Math.abs(n);
    var entero = Math.floor(n);
    var cent = Math.round((n - entero) * 100);
    if (cent === 100) { entero += 1; cent = 0; }
    var s = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s + (cent ? '.' + pad(cent) : '');
  }
  function plannedDate(ctx, n) {
    var ini = parseISO(ctx.fecha);
    return ini ? addDays(ini, n - 1) : null;
  }
  /* Capacitaciones desde la fecha de envío: la planificada o, si ya pasó, hoy (con 2 horas de margen). */
  function proximas(ctx, n, cuantas) {
    var hoy = startOfDay(ctx.ahora);
    var plan = plannedDate(ctx, n);
    var base = plan && plan.getTime() > hoy.getTime() ? plan : hoy;
    var desde = base.getTime() === hoy.getTime() ? ctx.ahora.getTime() + MARGEN_MS : base.getTime();
    var horario = (ctx.horario || []).slice().sort(function (a, b) { return (a.h * 60 + a.m) - (b.h * 60 + b.m); });
    var out = [];
    for (var i = 0; i < 28 && out.length < cuantas; i++) {
      var d = addDays(base, i);
      for (var j = 0; j < horario.length && out.length < cuantas; j++) {
        var s = horario[j];
        if (s.dow !== d.getDay()) continue;
        var t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.h, s.m);
        if (t.getTime() >= desde) out.push({ fecha: t, rel: i, h: s.h, m: s.m });
      }
    }
    return out;
  }
  function fraseSesion(s) {
    var hora = aLas(s.h) + ' ' + fmtHora(s.h, s.m);
    if (s.rel === 0) return 'hoy ' + hora;
    var dia = DIAS[s.fecha.getDay()] + ' ' + s.fecha.getDate();
    return (s.rel === 1 ? 'mañana ' : 'el ') + dia + ' ' + hora;
  }
  function opciones(ctx, n, conj) {
    var ss = proximas(ctx, n, 2);
    if (!ss.length) return '[próximas capacitaciones]';
    var f = ss.map(function (s) { return '*' + fraseSesion(s) + '*'; });
    return f.length === 1 ? f[0] : f[0] + ' ' + conj + ' ' + f[1];
  }
  function horarioLista(ctx) {
    var k = function (s) { return (s.dow === 0 ? 7 : s.dow) * 1440 + s.h * 60 + s.m; };
    var hs = (ctx.horario || []).slice().sort(function (a, b) { return k(a) - k(b); });
    if (!hs.length) return '[horario de capacitaciones]';
    return hs.map(function (s) { return '• ' + DIAS_CAP[s.dow] + ', ' + fmtHora(s.h, s.m); }).join('\n');
  }
  /* Cuándo sale el mensaje n: el día que le toca o, si ya pasó, hoy. Y en qué día de sus 30 está. */
  function fechaEnvio(ctx, n) {
    var hoy = startOfDay(ctx.ahora), plan = plannedDate(ctx, n);
    return plan && plan.getTime() > hoy.getTime() ? plan : hoy;
  }
  function vaTarde(ctx, n) { var plan = plannedDate(ctx, n); return !!plan && startOfDay(ctx.ahora).getTime() > plan.getTime(); }
  function diaDeEnvio(ctx, n) {
    var ini = parseISO(ctx.fecha);
    if (!ini) return n;
    return Math.max(n, Math.min(diasEntre(ini, fechaEnvio(ctx, n)) + 1, ctx.plazo || 30));
  }

  /* Empiece Ya: los niveles salen del catálogo de Premios (pr_catalogo), de la edición vigente en su
     fecha de ingreso; si no hay una vigente, de la última cargada antes (y la tarjeta lo avisa). */
  var ROMANOS = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  function nivelNum(nv) { var m = /Nivel\s+([IVX]+)\b/.exec(nv || ''); return m ? (ROMANOS[m[1]] || 9) : 9; }
  function vigentesEn(l, f) { return l.filter(function (r) { return r.desde <= f && (!r.hasta || f <= r.hasta); }); }
  function edicionEY(fechaISO) {
    var l = (S.empieceYa || []).filter(function (r) { return r && r.nivel && r.desde; });
    if (!l.length) return null;
    var f = fechaISO || hoyISO(), base = vigentesEn(l, f), vigente = base.length > 0;
    if (!vigente) {
      // la que estuvo vigente por última vez antes de su fecha o, si su fecha es anterior a todo el catálogo, la primera
      var antes = l.filter(function (r) { return r.desde <= f; });
      base = vigentesEn(l, antes.length ? antes.map(function (r) { return r.hasta; }).sort().pop() : l.map(function (r) { return r.desde; }).sort()[0]);
    }
    // un nivel por fila, aunque alguno se haya cargado con otra fecha de inicio (si hay dos, el más reciente)
    var porNivel = {};
    base.forEach(function (r) { var k = nivelNum(r.nivel); if (!porNivel[k] || r.desde > porNivel[k].desde) porNivel[k] = r; });
    var niveles = Object.keys(porNivel).map(function (k) { return porNivel[k]; }).sort(function (a, b) { return nivelNum(a.nivel) - nivelNum(b.nivel); });
    return { niveles: niveles, vigente: vigente };
  }
  /* Frases del requisito: corta en «. » seguido de mayúscula, pero no tras abreviaturas («mín.», «aprox.») ni siglas («P.P.V.»). */
  var ABREV_FIN = /(?:^|[^A-Za-zÁÉÍÓÚÑáéíóúñ])(?:m[íi]n|m[áa]x|aprox|ej|etc|p[áa]g|nro|sr|sra|dr|dra|av)$/i;
  function frases(s) {
    var out = [], ini = 0, re = /\.\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/g, m;
    while ((m = re.exec(s))) {
      var antes = s.slice(ini, m.index);
      if (ABREV_FIN.test(antes) || /(?:^|[^A-Za-z])[A-Z](?:\.[A-Z])+$/.test(antes)) continue;
      out.push(antes);
      ini = m.index + m[0].length;
    }
    out.push(s.slice(ini));
    return out.map(function (x) { return x.replace(/\s*\.\s*$/, '').trim(); }).filter(Boolean);
  }
  function requisitoCorto(t) {
    var fs = frases(String(t || '').replace(/\s+/g, ' ').trim().replace(/^En tus primeras? \d+ semanas?:\s*/i, ''));
    var piden = fs.filter(function (x) { return /\d/.test(x); });   // lo que se pide lleva cifras; fuera notas como «Viaje personal e intransferible»
    var s = (piden.length ? piden : fs.slice(0, 1)).join('. ')
      .replace(/(m)[ií]nimo\s+([\d.,]+)\s*PPV/gi, function (x, m, n) { return m + 'ínimo ' + n + ' puntos tuyos'; })
      .replace(/([\d.,]+)\s*GPV/g, '$1 puntos entre tú y tu equipo')
      .replace(/([\d.,]+)\s*PPV/g, '$1 puntos');
    return (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length ? s + ')' : s;
  }
  /* Plazo del Empiece Ya, igual que en Nivel Cero: el período en que ingresó y dos más. */
  function finEY(fechaISO) {
    var ps = S.periodos || [];
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].desde <= fechaISO && fechaISO <= ps[i].cierre) return ps[i + 2] ? ps[i + 2].cierre : null;
    }
    return null;
  }
  function valoresEY(ctx) {
    var ed = edicionEY(ctx.fecha), fin = ctx.fecha ? finEY(ctx.fecha) : null;
    var v = { EY_FECHA: fin ? fmtLargo(parseISO(fin)) : '[fecha del Empiece Ya]', EY_NIVELES: '[niveles del Empiece Ya]', EY_IMPULSO: '' };
    if (!ed || !ed.niveles.length) return v;
    var l = ed.niveles, top = l.length >= 4 ? l[l.length - 1] : null, lista = top ? l.slice(0, -1) : l;
    v.EY_NIVELES = lista.map(function (r) { return '*' + r.nivel + ':* ' + requisitoCorto(r.requisito) + '\n🎁 ' + String(r.premio || '').trim(); }).join('\n\n');
    var primero = lista[0].nivel, ultimo = lista[lista.length - 1].nivel;
    v.EY_IMPULSO = 'Asegura tu ' + primero + ' cuanto antes' + (lista.length > 1 ? ' y, si ya lo tienes, ¡corre por el ' + ultimo + '!' : '.') +
      (top ? ' Te da la opción de concursar por el *' + top.nivel + '* (' + requisitoCorto(top.requisito) + '): *' + String(top.premio || '').trim() + '* ' +
        (/viaje|tour|convenci/i.test(top.premio || '') ? '✈️' : '🏆') : '');
    return v;
  }
  /* Lo que la tarjeta avisa aparte de los datos que faltan. */
  function avisosDia(n, ctx) {
    var out = [], envio = fechaEnvio(ctx, n), lim = fechaLimite(ctx.fecha, ctx.plazo);
    var vencido = !!lim && envio.getTime() > lim.getTime();
    if (vencido) out.push('Su plazo de ' + (ctx.plazo || 30) + ' días venció el ' + fmtLargo(lim) + ': este mensaje ya no le corresponde.');
    if (n !== 4) return out;
    var ed = edicionEY(ctx.fecha), fin = ctx.fecha ? parseISO(finEY(ctx.fecha)) : null;
    if (fin && !vencido && envio.getTime() > fin.getTime()) out.push('Su plazo del Empiece Ya cerró el ' + fmtLargo(fin) + '.');
    if (ed && !ed.vigente) out.push('El catálogo de Premios no tiene un Empiece Ya vigente para su fecha de ingreso: el texto usa la edición más cercana. Revísalo en Premios.');
    if (ed && ed.niveles.length && nivelNum(ed.niveles[0].nivel) !== 1) out.push('El Empiece Ya del catálogo no tiene Nivel I: revisa los niveles en Premios.');
    return out;
  }
  /* Si ya subiste un PDF en el día 5, el texto lo menciona. */
  function guiaCitas() {
    return S.items.some(function (i) { return Number(i.dia) === 5 && i.ruta && tipoDeItem(i) === 'pdf'; })
      ? '\n\n📄 Te comparto también una guía en PDF sobre cómo sacar citas. Revísala con calma: te va a ayudar mucho.' : '';
  }
  function valores(ctx, n) {
    var a = ctx.ajustes || {};
    var gourmet = num(a.gourmetPrecio);
    var promo = num(a.promoPrecio);
    var pct = num(a.inicialPct);
    var cmin = num(a.comisionMin);
    var cmax = num(a.comisionMax);
    var productos = String(a.promoProductos || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var compara = gourmet != null && promo != null && promo < gourmet && /gourmet/i.test(productos.join(' '))
      ? '\n\n¡Fíjate! Trae más productos y cuesta *S/ ' + fmtSoles(gourmet - promo) + ' menos* que el Gourmet solo.'
      : '';
    var direccion = String(a.direccion || '').trim().replace(/[\s.]+$/, '');
    var referencia = String(a.referencia || '').trim().replace(/[\s.]+$/, '');
    var tarde = vaTarde(ctx, n), lim = fechaLimite(ctx.fecha, ctx.plazo);
    var quedan = lim ? diasEntre(fechaEnvio(ctx, n), lim) : null;
    var ey = n === 4 ? valoresEY(ctx) : {};
    return {
      DIA: String(diaDeEnvio(ctx, n)),
      PLAZO: String(ctx.plazo || 30),
      EMPIEZA: tarde ? 'Ya empezaste tu camino en Rena Ware.' : 'Hoy empieza tu camino en Rena Ware.',
      QUEDAN: tarde && quedan > 0 ? ' (te ' + (quedan === 1 ? 'queda 1 día' : 'quedan ' + quedan + ' días') + ')' : '',
      // si va tarde, el siguiente mensaje también ya toca y puede salir hoy mismo: no se le promete «mañana»
      LUEGO: tarde ? 'En el próximo mensaje' : 'Mañana',
      QUINTO: tarde ? 'En nuestro quinto y último mensaje' : 'Mañana, en nuestro quinto y último mensaje,',
      EY_FECHA: ey.EY_FECHA || '',
      EY_NIVELES: ey.EY_NIVELES || '',
      EY_IMPULSO: ey.EY_IMPULSO || '',
      GUIA_CITAS: n === 5 ? guiaCitas() : '',
      COMA_NOMBRE: ctx.nombre ? ', ' + ctx.nombre : '',
      CODIGO: ctx.codigo || '[código]',
      DIRECCION: direccion || '[dirección]',
      REFERENCIA: referencia ? ', ' + referencia : '',
      FECHA_LIMITE: deadlineText(ctx.fecha, ctx.plazo) || '[fecha límite]',
      HORARIO_LISTA: horarioLista(ctx),
      OPCIONES_O: opciones(ctx, n, 'o'),
      OPCIONES_Y: opciones(ctx, n, 'y'),
      GOURMET: gourmet != null ? fmtSoles(gourmet) : '[precio del Gourmet]',
      PROMO_NUM: String(a.promoNumero || '').trim() || '[n.° de promoción]',
      PROMO_PRECIO: promo != null ? fmtSoles(promo) : '[precio de la promoción]',
      PROMO_ITEMS: productos.length ? productos.map(function (x) { return '• ' + x; }).join('\n') : '[productos de la promoción]',
      COMPARA: compara,
      INICIAL_PCT: pct != null ? String(pct) : '[% de inicial]',
      INICIAL: promo != null && pct != null ? fmtSoles(Math.round(promo * pct / 100)) : '[inicial]',
      REGALOS: String(a.regalos || '').trim() || '[regalos]',
      COM_MIN: cmin != null ? fmtSoles(cmin) : '[comisión mínima]',
      COM_MAX: cmax != null ? fmtSoles(cmax) : '[comisión máxima]'
    };
  }

  var DAYS = [
    {
      n: 1,
      title: 'Bienvenida, código y horario',
      goal: 'Que reciba su código, sepa dónde y cuándo capacitarse, y venga a la oficina.',
      body: `📅 *Día {DIA} de {PLAZO}*

🎉 *¡Felicitaciones{COMA_NOMBRE}! {EMPIEZA}*

Te dejo este video de bienvenida. Míralo con calma.

🔑 *Tu código de asesor: {CODIGO}*
Guárdalo bien: con él, tus ventas y afiliados quedan registrados a tu nombre.

🏢 *¡La oficina ahora también es tu oficina!*
📍 {DIRECCION}{REFERENCIA}.

Como parte del equipo, puedes participar en todas las reuniones que quieras, invitar a tus clientes y venir con tus posibles afiliados.

🗓️ *Horario de capacitaciones:*
{HORARIO_LISTA}
Por el grupo te avisaremos cuando haya eventos adicionales.

🎁 *Te premiamos por capacitarte:* si asistes *5 veces* a la oficina en tus primeros {PLAZO} días, en cualquiera de estos horarios hasta el *{FECHA_LIMITE}*{QUEDAN}, te adelantamos tu *botella de acero Rena Ware*.

👉 ¡Te esperamos {OPCIONES_O}!`
    },
    {
      n: 2,
      title: 'Kit y material digital',
      goal: 'Que recoja su kit y empiece a conocer los productos con el material digital.',
      body: `📅 *Día {DIA} de {PLAZO}*

🎒 *Tu Kit de Inicio viene con un detalle extra.* Si aún no lo tienes, ¡recógelo en la oficina!

Mientras tanto, te comparto el material digital:
• Video de los utensilios
• Video del filtro Aqua Nano
• Video del extractor Nutrex Press
• Video de la cocina de inducción
• Catálogo de productos

Revísalos con calma: te van a servir en tus primeras citas.

{LUEGO} te comparto la lista de precios y las promociones.

👉 Recuerda: nuestras próximas reuniones son {OPCIONES_Y}. ¡Te esperamos!`
    },
    {
      n: 3,
      title: 'Precios y promociones',
      goal: 'Que entienda las dos listas, cómo paga el cliente y el poder de las promociones.',
      body: `📅 *Día {DIA} de {PLAZO}*

💰 *Precios y promociones: así funcionan*

En Rena Ware hay *2 listas de precios*:

*1. Lista general:* el precio de cada producto por separado. Por ejemplo, el *Juego Gourmet* cuesta *S/ {GOURMET}*.

¿Y cómo paga tu cliente? Da una inicial desde el *{INICIAL_PCT}%* y paga el saldo contra entrega. Si está bien en el sistema, también puede financiarlo hasta en *18 cuotas*: tiene interés, pero si adelanta pagos, le sale menos. ¡Y si cancela dentro de los 30 días de la entrega, no paga interés!

*2. Lista de promociones:* combinaciones de productos a mejor precio. Por ejemplo, la *promoción {PROMO_NUM}* cuesta *S/ {PROMO_PRECIO}* y trae:
{PROMO_ITEMS}{COMPARA}

Si tu cliente toma la promoción ahora, con solo dar la inicial del {INICIAL_PCT}%, es decir *S/ {INICIAL}*, se asegura de regalo {REGALOS}.

*¡Ese es el poder de las promociones!* A continuación te comparto la lista de precios general y la lista de promociones vigentes.

💡 Por cierto, si tú quieres alguna promoción, se hace una *autocompra*: al precio de cliente se le descuenta tu comisión, que va de *S/ {COM_MIN} a S/ {COM_MAX}* según el tamaño de la promoción.

{LUEGO} te cuento qué premios puedes ganar por comprar o vender Rena Ware. 🏆`
    },
    {
      n: 4,
      title: 'Empiece Ya',
      goal: 'Que conozca los niveles y su fecha límite, y vaya por el Nivel I.',
      body: `📅 *Día {DIA} de {PLAZO}*

🏆 *Empiece Ya: tus premios por empezar con todo*

Aparte de tus comisiones de venta o el descuento de tu autocompra, ganas estos premios:

*Nivel 0:* 5 capacitaciones en la oficina
🎁 Botella de acero. Viene en todos los niveles, por eso te la adelantamos.

{EY_NIVELES}

📆 Tienes hasta el *{EY_FECHA}* para lograrlo.

{EY_IMPULSO}

Cualquier duda, me la haces saber.

{QUINTO} aprenderás a manejar y aprovechar las principales objeciones que te dirán las personas.`
    },
    {
      n: 5,
      title: 'Citas y objeciones',
      goal: 'Que sepa sacar una cita con la frase de oro y responder a las objeciones.',
      body: `📅 *Día {DIA} de {PLAZO}*

📲 *Cómo sacar citas y responder a las objeciones*

Para sacar citas tienes *2 herramientas*:
🎟️ *Ticket de sorteo:* te envío la imagen del próximo sorteo. Solo por escuchar la presentación, inscribes a la persona.
🎁 *Regalos:* para dar solo por escuchar.

Si aún no tienes tus tickets o te faltan regalos, pídemelos en la próxima capacitación y con gusto te los entrego.{GUIA_CITAS}

Hay varias formas de prospectar, pero la más práctica es la *frase de oro*:
💬 _"Estoy trabajando en Rena Ware. ¿Has escuchado de Rena Ware?"_

Te vas a encontrar con estos comentarios. Así puedes responder:
• *"Es caro"* → "Descuida, no tienes que comprar: mi trabajo es dar a conocer los productos. Y solo por ver la presentación, participas en un sorteo."
• *"Ya tengo"* → "¡Qué bueno que ya seas cliente! ¿Ya te dieron tu regalo de aniversario? Te lo llevo."
• *"Me falta un repuesto"* o *"mi filtro necesita mantenimiento"* → "Descuida, para eso estamos los asesores. Te apoyo."

En todos los casos, cierras así:
1. "De paso te muestro las promociones, sin compromiso. ¿Te visito hoy o mañana?"
2. Según lo que responda: "¿En la mañana o en la tarde?" → "Perfecto, ¿a las 4 o a las 5?" → "A esa hora estaré."
3. "Ah, me olvidaba: ¿estará tu esposo(a) para que vea también, o no es necesario?"

Como verás, el objetivo siempre es *sacar la cita*: agendar la visita para presentar los productos y las promociones.

No te preocupes por hacer la presentación perfecta: el objetivo es que practiques y aprendas en el proceso. Y para lo que necesites, aquí estamos para apoyarte.

👉 ¡Te esperamos en la oficina {OPCIONES_O}!`
    }
  ];

  var RE_MARCA_BV = /\{([A-Z_]+)\}/g;
  function limpiarBv(s) { return s.replace(/\n{3,}/g, '\n\n'); }   // lo que no aplica no deja renglones vacíos de más
  function messageFor(day, ctx) {
    var v = valores(ctx, day.n);
    return limpiarBv(day.body.replace(RE_MARCA_BV, function (m, k) {
      return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : m;
    }));
  }
  function cuandoEnviar(ctx, n) {
    var plan = plannedDate(ctx, n);
    if (!plan) return null;
    var dif = diasEntre(ctx.ahora, plan);
    if (dif === 0) return { hoy: true, txt: 'Envíalo hoy, ' + fmtLargo(plan) + '.' };
    if (dif === 1) return { hoy: false, txt: 'Envíalo mañana, ' + fmtLargo(plan) + '.' };
    if (dif > 1) return { hoy: false, txt: 'Envíalo el ' + fmtLargo(plan) + '.' };
    return { hoy: false, txt: 'Tocaba el ' + fmtLargo(plan) + '. Si aún no lo enviaste, envíalo hoy: el texto ya está ajustado a hoy.' };
  }
  

  var CAMPOS_AJ = ['direccion', 'referencia', 'gourmetPrecio', 'promoNumero', 'promoPrecio', 'promoProductos', 'inicialPct', 'regalos', 'comisionMin', 'comisionMax'];
  var AJ_NUM = { gourmetPrecio: 1, promoPrecio: 1, inicialPct: 1, comisionMin: 1, comisionMax: 1 };
  var FALTA = {
    'código': 'el código de asesor',
    'fecha límite': 'la fecha de inicio',
    'dirección': 'la dirección de la oficina',
    'precio del Gourmet': 'el precio del Gourmet',
    'n.° de promoción': 'el número de promoción',
    'precio de la promoción': 'el precio de la promoción',
    'productos de la promoción': 'los productos de la promoción',
    '% de inicial': 'el % de inicial',
    'inicial': 'el precio y el % de inicial',
    'regalos': 'el regalo',
    'comisión mínima': 'la comisión mínima',
    'comisión máxima': 'la comisión máxima',
    'próximas capacitaciones': 'el horario de capacitaciones',
    'niveles del Empiece Ya': 'los niveles del Empiece Ya en el catálogo de Premios',
    'fecha del Empiece Ya': 'la fecha de inicio',
    'horario de capacitaciones': 'el horario de capacitaciones'
  };
  var TIPOS = {
    'video/mp4': ['video', 'mp4'], 'video/webm': ['video', 'webm'], 'video/quicktime': ['video', 'mov'], 'video/3gpp': ['video', '3gp'],
    'image/jpeg': ['imagen', 'jpg'], 'image/png': ['imagen', 'png'], 'image/webp': ['imagen', 'webp'], 'image/gif': ['imagen', 'gif'],
    'image/heic': ['imagen', 'heic'], 'image/heif': ['imagen', 'heif'],
    'application/pdf': ['pdf', 'pdf']
  };
  

  var MINUS = { de: 1, del: 1, la: 1, las: 1, los: 1, y: 1, e: 1 };
  function titulo(n) {
    return String(n || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').map(function (p, i) {
      if (i > 0 && MINUS[p]) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' ');
  }
  function pila(n) { return titulo(n).split(' ')[0] || ''; }
  function fCorta(iso) {
    var d = parseISO(iso);
    return d ? d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) : '';
  }
  function hoyISO() {
    var t = new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }
  function celLocal(c) {
    var d = String(c || '').replace(/\D/g, '');
    if (d.length === 11 && d.indexOf('51') === 0) d = d.slice(2);
    return d;
  }
  function waLink(texto) {
    var cel = celLocal($('celular').value);
    return (cel.length === 9 ? 'https://wa.me/51' + cel : 'https://wa.me/') + '?text=' + encodeURIComponent(texto);
  }
  function waHtml(raw) {
    return esc(raw)
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/gm, '$1<em>$2</em>')
      .replace(/\[([^\]\n]+)\]/g, '<mark class="ph">[$1]</mark>')
      .replace(/\n/g, '<br>');
  }
  function unirY(lista) {
    if (lista.length < 2) return lista.join('');
    return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
  }
  function faltantes(text) {
    var out = [];
    var re = /\[([^\]\n]+)\]/g;
    var m;
    while ((m = re.exec(text))) {
      var nombre = FALTA[m[1]] || m[1];
      if (out.indexOf(nombre) < 0) out.push(nombre);
    }
    return out;
  }
  

  function horarioDeNivel0(n0) {
    var hs = n0 && Array.isArray(n0.horarios) ? n0.horarios : null;
    if (!hs || !hs.length) return HORARIO_BASE;
    var ok = hs.filter(function (h) { return h && h.dia != null && /^\d{1,2}:\d{2}/.test(String(h.hora || '')); });
    return ok.length ? ok : HORARIO_BASE;
  }
  

  function itemsDe(n) {
    return S.items.filter(function (i) { return Number(i.dia) === n; }).sort(function (a, b) {
      return ((num(a.orden) || 0) - (num(b.orden) || 0)) || String(a.id).localeCompare(String(b.id));
    });
  }
  

  function tipoDeItem(it) {
    if (it.tipo === 'video' || it.tipo === 'pdf' || it.tipo === 'imagen') return it.tipo;
    var t = TIPOS[it.content_type];
    return t ? t[0] : 'pdf';
  }
  

  function nombreParaGuardar(it) {
    var t = TIPOS[it.content_type];
    var ext = t ? t[1] : (String(it.ruta || '').split('.').pop() || 'bin');
    var base = String(it.nombre || 'archivo').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'archivo';
    return base + '.' + ext;
  }
  

  var LS_VISTA = 'wa-bv-vista';
  var LS_ENVIOS = 'wa-bv-envios';
  var DIA_SEG = 6;

  /* Textos originales. Lo que se edite se guarda aparte (vacío = vuelve a este). */
  var PASOS = [
    { k: 'clase1', g: 'asis', t: 'Primera clase', cuando: 'Después de su primera clase.',
      tu: '¡Felicitaciones por tu primera clase, {nombre}! 💪 Ya llevas 1 de 5. Te faltan 4 para ganar tu botella de acero y tienes hasta el {limite}. La próxima es {proxima}.',
      usted: '¡Felicitaciones por su primera clase, {nombre}! 💪 Ya lleva 1 de 5. Le faltan 4 para ganar su botella de acero y tiene hasta el {limite}. La próxima es {proxima}.' },
    { k: 'clase2', g: 'asis', t: 'Segunda clase', cuando: 'Después de su segunda clase.',
      tu: '¡Muy bien, {nombre}! Ya llevas 2 de 5 clases. Sigue así: tienes hasta el {limite} para ganar tu botella de acero. Te esperamos {proxima}.',
      usted: '¡Muy bien, {nombre}! Ya lleva 2 de 5 clases. Siga así: tiene hasta el {limite} para ganar su botella de acero. Le esperamos {proxima}.' },
    { k: 'faltan2', g: 'asis', t: 'Le faltan 2', cuando: 'Después de su tercera clase.',
      tu: '¡Vas muy bien, {nombre}! Llevas 3 de 5: te faltan solo 2 clases para tu botella de acero. Tienes hasta el {limite}. Te esperamos {proxima}.',
      usted: '¡Va muy bien, {nombre}! Lleva 3 de 5: le faltan solo 2 clases para su botella de acero. Tiene hasta el {limite}. Le esperamos {proxima}.' },
    { k: 'falta1', g: 'asis', t: 'Le falta 1', cuando: 'Después de su cuarta clase.',
      tu: '¡Felicitaciones, {nombre}! Estás a 1 clase de completar tus 5 🏆 Con la quinta se habilita tu test para ganar tu botella de acero. Tienes hasta el {limite}. Te esperamos {proxima}.',
      usted: '¡Felicitaciones, {nombre}! Está a 1 clase de completar sus 5 🏆 Con la quinta se habilita su test para ganar su botella de acero. Tiene hasta el {limite}. Le esperamos {proxima}.' },
    { k: 'botella', g: 'asis', t: 'Completó sus clases: su test', cuando: 'Al completar sus 5 clases, si aún no gana el Empiece Ya: se le habilita su test.',
      tu: '¡Felicitaciones, {nombre}! 🎉 Completaste tus 5 clases. Ahora te toca tu test: termínalo hasta el {limite_test} y ganas tu botella de acero. Es a libro abierto, desde tu celular. Entra con tu DNI aquí: {link_test}',
      usted: '¡Felicitaciones, {nombre}! 🎉 Completó sus 5 clases. Ahora le toca su test: termínelo hasta el {limite_test} y gana su botella de acero. Es a libro abierto, desde su celular. Entre con su DNI aquí: {link_test}' },
    { k: 'botella_ey', g: 'asis', t: 'Ganó la botella y ya tiene su Empiece Ya', cuando: 'Al completar sus 5 clases, si ya ganó el Empiece Ya.',
      tu: '¡Felicitaciones, {nombre}! 🎉 Completaste tus 5 clases y además ya ganaste tu Empiece Ya: tu botella de acero viene junto con tu premio. ¡Sigue así!',
      usted: '¡Felicitaciones, {nombre}! 🎉 Completó sus 5 clases y además ya ganó su Empiece Ya: su botella de acero viene junto con su premio. ¡Siga así!' },
    { k: 'semana1', g: 'falta', t: 'Va una semana', cuando: 'A los 7 días de su inicio, si todavía no vino a ninguna clase.',
      tu: 'Hola {nombre}, ya pasó tu primera semana y todavía no has venido a ninguna capacitación. Recuerda: si vienes 5 veces hasta el {limite}, aseguras tu botella de acero. ¡Te esperamos {proxima}! Si aún no tienes tu kit, recógelo ese día.',
      usted: 'Hola {nombre}, ya pasó su primera semana y todavía no ha venido a ninguna capacitación. Recuerde: si viene 5 veces hasta el {limite}, asegura su botella de acero. ¡Le esperamos {proxima}! Si aún no tiene su kit, recójalo ese día.' },
    { k: 'quedan15', g: 'falta', t: 'Quedan 15 días', cuando: 'A 15 días de su fecha límite, si no vino en la última semana.',
      tu: 'Hola {nombre}, tienes {dias} para ganar tu botella de acero (hasta el {limite}). {avance} ¡Aprovecha, te esperamos {proxima}!',
      usted: 'Hola {nombre}, tiene {dias} para ganar su botella de acero (hasta el {limite}). {avance} ¡Aproveche, le esperamos {proxima}!' },
    { k: 'quedan7', g: 'falta', t: 'Quedan 7 días', cuando: 'A 7 días de su fecha límite, si no vino en la última semana.',
      tu: 'Hola {nombre}, ¡últimos días! Tienes {dias} para ganar tu botella de acero: tu plazo vence el {limite}. {avance} Te esperamos {proxima}.',
      usted: 'Hola {nombre}, ¡últimos días! Tiene {dias} para ganar su botella de acero: su plazo vence el {limite}. {avance} Le esperamos {proxima}.' },
    { k: 'cierre', g: 'falta', t: 'Cumplió sus 30 días', cuando: 'Al terminar sus 30 días sin completar las 5 clases (hasta 10 días después).',
      tu: 'Hola {nombre}, ya cumpliste tus 30 días del Nivel Cero, pero aún tienes la oportunidad de empezar con todo estos próximos 30 días con los nuevos concursos. ¡Te esperamos {proxima}!',
      usted: 'Hola {nombre}, ya cumplió sus 30 días del Nivel Cero, pero aún tiene la oportunidad de empezar con todo estos próximos 30 días con los nuevos concursos. ¡Le esperamos {proxima}!' },
    { k: 'test_recordar', g: 'test', t: 'Le falta su test', cuando: 'Si le quedan 5 días o menos para terminar su test y aún no lo termina.',
      tu: 'Hola {nombre}, te quedan {dias_test} para hacer tu test y ganar tu botella de acero (hasta el {limite_test}). Entra con tu DNI aquí: {link_test}',
      usted: 'Hola {nombre}, le quedan {dias_test} para hacer su test y ganar su botella de acero (hasta el {limite_test}). Entre con su DNI aquí: {link_test}' },
    { k: 'recoger', g: 'test', t: 'Recoger la botella', cuando: 'Al terminar su test (o a mano, desde su ficha) para avisarle que la recoja.',
      tu: 'Hola {nombre}, tu botella de acero ya te espera en la oficina 🏆 Pasa a recogerla cuando vengas.',
      usted: 'Hola {nombre}, su botella de acero ya le espera en la oficina 🏆 Pase a recogerla cuando venga.' }
  ];
  var PASO = Object.create(null);                        // sin prototipo: "constructor" no es un paso
  PASOS.forEach(function (x, i) { x.i = i; PASO[x.k] = x; });
  var GRUPOS = [['asis', 'Por asistencia'], ['falta', 'Si no viene'], ['test', 'Su test y su botella'], ['otro', 'A mano']];
  var LINK_TEST = 'https://renaware-plataforma.nelson1614.workers.dev/test/';   // el Test del Nivel 0: entra con su DNI
  var MARCAS = [['nombre', 'su nombre'], ['limite', 'su fecha límite'], ['dias', 'los días que le quedan'],
                ['avance', 'cuánto lleva y cuánto le falta'], ['proxima', 'la próxima clase'], ['horarios', 'los horarios de clase'],
                ['clases', 'clases que lleva'], ['faltan', 'clases que le faltan'],
                ['limite_test', 'la fecha límite de su test'], ['dias_test', 'los días que le quedan para el test'], ['link_test', 'el enlace del test']];
  var MARCA = Object.create(null);
  MARCAS.forEach(function (m) { MARCA[m[0]] = 1; });
  function claveMarca(n) { return String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

  /* ---------- fechas en texto (aaaa-mm-dd), en la hora del celular */
  var DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  function isoDe(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function sumarISO(iso, n) { var d = parseISO(iso); return d ? isoDe(addDays(d, n)) : null; }
  function diasISO(a, b) { var x = parseISO(a), y = parseISO(b); return x && y ? diasEntre(x, y) : null; }
  function fDia(iso) { var d = parseISO(iso); return d ? DIAS_C[d.getDay()] + ' ' + fCorta(iso) : ''; }
  function fLargaISO(iso) { var d = parseISO(iso); return d ? fmtLargo(d) : ''; }
  function plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function plano(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  /* ---------- reglas */
  function metaClases() { return (S.nivel0 && Number(S.nivel0.meta)) || 5; }
  function tratoDefecto() { return S.nivel0 && S.nivel0.trato === 'tu' ? 'tu' : 'usted'; }
  function tratoDe(p) { return p && (p.trato === 'tu' || p.trato === 'usted') ? p.trato : tratoDefecto(); }
  function diaDe(p) { return p ? diasISO(p.inicio, hoyISO()) : null; }   // 0 = su día 1
  function esReciente(p) { var d = diaDe(p); return d != null && d <= 45; }
  function activo(p) { return !!p && (p.estado === 'en_curso' || p.estado === 'logro'); }
  function enBienvenida(p) { var d = diaDe(p); return activo(p) && d != null && d >= 0 && d < DIA_SEG - 1; }
  function enSeguimiento(p) {
    var d = diaDe(p);
    return !!p && (p.estado === 'en_curso' || p.estado === 'logro' || p.estado === 'vencio') && d != null && d >= DIA_SEG - 1;
  }
  /* Quién entra a la secuencia (wa_secuencia): ✓ entra, ✗ no entra. Un asesor nuevo queda «por marcar»
     y no se le propone nada hasta que se decida. A un cliente se le escribe salvo que se le quite. */
  function norm(v) { return v === true || v === false ? v : null; }
  function marcaDe(x) { return x && x.sec ? norm(x.sec.entra) : null; }
  function enSecuencia(p) { return marcaDe(p) === true; }
  function marcable(p) { return !!p && (p.estado === 'en_curso' || enBienvenida(p) || candidatos(p).length > 0); }   // le puede tocar algo
  function porMarcar(p) { return marcaDe(p) === null && marcable(p); }
  function deLaPestana(p, v) { var d = diaDe(p); return v === 'bv' ? !(d >= DIA_SEG - 1) : d >= DIA_SEG - 1; }
  function porMarcarDe(v) {
    return S.asesores.filter(function (p) { return porMarcar(p) && deLaPestana(p, v); })
      .sort(function (a, b) { return String(b.inicio).localeCompare(String(a.inicio)) || titulo(a.nombre).localeCompare(titulo(b.nombre), 'es'); });
  }
  function fechaMarca(x) { var d = x && x.sec && x.sec.en ? new Date(x.sec.en) : null; return d && !isNaN(d) ? isoDe(d) : null; }
  /* Cambió hoy: la marca de ahora no es la que tenía antes de hoy (antes_hoy). Deshacer vuelve a esa. */
  function cambioHoy(x) { return !!(x && x.sec && fechaMarca(x) === hoyISO() && norm(x.sec.entra) !== norm(x.sec.antes_hoy)); }
  function plantilla(k) {
    var b = pasoDef(k) || { tu: '', usted: '' };
    var g = {};
    (S.plantillas || []).forEach(function (x) { if (x.clave === k) g = x; });
    return { tu: g.tu || b.tu, usted: g.usted || b.usted, activo: g.activo !== false, editado: !!(g.tu || g.usted) };
  }
  function nombrePaso(k) {
    var m = /^bv([1-5])$/.exec(k || '');
    if (m) return 'Día ' + m[1] + ' · ' + DAYS[Number(m[1]) - 1].title;
    if (k === 'bienvenida') return 'Bienvenida de Nivel Cero';
    return (PASO[k] || { t: k }).t;
  }
  function nDias(r) { return r <= 0 ? 'solo hoy' : r === 1 ? '1 día' : r + ' días'; }
  function avanceTxt(p, tr) {
    var v = p.validas || 0, m = metaClases(), f = Math.max(m - v, 0), tu = tr === 'tu';
    if (!v) return tu ? 'Todavía no has venido a ninguna clase.' : 'Todavía no ha venido a ninguna clase.';
    return (tu ? 'Llevas ' : 'Lleva ') + v + ' de ' + m + ': ' + (tu ? 'te ' : 'le ') + (f === 1 ? 'falta 1.' : 'faltan ' + f + '.');
  }
  function horarioOrdenado() {
    var k = function (s) { return (s.dow === 0 ? 7 : s.dow) * 1440 + s.h * 60 + s.m; };
    return leerHorario().sort(function (a, b) { return k(a) - k(b); });
  }
  function horariosTxt() {
    var l = horarioOrdenado().map(function (s) { return 'el ' + DIAS[s.dow] + ' ' + aLas(s.h) + ' ' + fmtHora(s.h, s.m); });
    if (l.length <= 1) return l.join('');
    return l.slice(0, -1).join(', ') + ' o ' + l[l.length - 1];
  }
  /* La próxima clase desde ahora, con el mismo margen de 2 horas de la bienvenida. */
  function proximaTxt() {
    var s = proximas({ ahora: new Date(), horario: leerHorario(), fecha: null }, 1, 1)[0];
    return s ? fraseSesion(s) : (horariosTxt() || 'en la oficina');
  }
  function valoresSeg(p, tr) {
    var r = diasISO(hoyISO(), p.vence);
    var tst = p.test || {}, ht = tst.hasta || sumarISO(p.logro_fecha || hoyISO(), 15), rt = diasISO(hoyISO(), ht);
    return {
      limite_test: fLargaISO(ht), dias_test: nDias(rt == null ? 0 : rt), link_test: LINK_TEST,
      nombre: pila(p.nombre), limite: fLargaISO(p.vence), dias: nDias(r == null ? 0 : r),
      avance: avanceTxt(p, tr), clases: String(p.validas || 0), faltan: String(Math.max(metaClases() - (p.validas || 0), 0)),
      proxima: proximaTxt(), horarios: horariosTxt()
    };
  }
  var RE_MARCA = /\{([^{}\n]{1,20})\}/g;
  function limpiarSeg(s) {
    return s.replace(/([^.])\.\.(?!\.)/g, '$1.')       // "4:00 p. m." + "." → un solo punto
      .replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').trim();
  }
  function llenar(t, p, tr) {                          // t es la plantilla
    tr = tr || tratoDe(p);
    var v = valoresSeg(p, tr);
    return limpiarSeg(String(t || '').replace(RE_MARCA, function (a, n) {
      var c = claveMarca(n);
      return Object.prototype.hasOwnProperty.call(v, c) ? v[c] : a;
    }));
  }
  function textoPaso(k, p, tr) { tr = tr || tratoDe(p); return llenar(plantilla(k)[tr], p, tr); }
  function textoEnvio(k, p) {
    var m = /^bv([1-5])$/.exec(k);
    return m ? messageFor(DAYS[Number(m[1]) - 1], leerCtx()) : textoPaso(k, p);
  }
  function fechasValidas(p) {
    return (p.asistencias || []).filter(function (a) { return a.v; }).map(function (a) { return String(a.f).slice(0, 10); }).sort();
  }
  function pasoAvance(v) {
    var m = metaClases();
    if (v >= m) return 'botella';
    if (v === m - 1) return 'falta1';
    if (v === m - 2) return 'faltan2';
    if (v === 1) return 'clase1';
    if (v === 2) return 'clase2';
    return null;
  }
  /* Los pasos que aplican hoy, cada uno con la fecha en que le tocó. Desde su día 6. */
  function candidatos(p) {
    var c = [], h = hoyISO(), m = metaClases(), v = p.validas || 0;
    if (!enSeguimiento(p)) return c;
    var d = diaDe(p), fv = fechasValidas(p);
    if (p.estado === 'logro') {
      var fl = p.logro_fecha || fv[m - 1];
      if (fl && diasISO(fl, h) <= 10) c.push({ k: p.ey ? 'botella_ey' : 'botella', f: fl });
      // Test del Nivel 0: recordarle en sus últimos 5 días; al aprobar, que recoja su botella
      var t = p.test || {};
      if (t.estado === 'habilitado' && !p.ey && t.hasta && diasISO(h, t.hasta) <= 5) c.push({ k: 'test_recordar', f: sumarISO(t.hasta, -5) });
      if (t.estado === 'aprobado' && !p.botella_entregada_en && !p.ey && t.aprobado_en && diasISO(t.aprobado_en, h) <= 10) c.push({ k: 'recoger', f: t.aprobado_en });
    }
    if (p.estado === 'en_curso') {
      var ka = v >= 1 ? pasoAvance(v) : null;
      if (ka) c.push({ k: ka, f: fv[v - 1] });
      var r = diasISO(h, p.vence), u = fv[fv.length - 1];
      var quieto = !u || diasISO(u, h) >= 7;       // "si no viene": ninguna clase en la última semana
      if (!v && d >= 7 && r > 15) c.push({ k: 'semana1', f: sumarISO(p.inicio, 7) });
      if (quieto && r <= 15 && r > 7) c.push({ k: 'quedan15', f: sumarISO(p.vence, -15) });
      if (quieto && r <= 7 && r >= 0) c.push({ k: 'quedan7', f: sumarISO(p.vence, -7) });
    }
    if (p.estado === 'vencio' && diasISO(p.vence, h) <= 10) c.push({ k: 'cierre', f: sumarISO(p.vence, 1) });
    return c.filter(function (x) { return !!x.f; });
  }
  function yaMandado(p, k) { return (p.mensajes || []).some(function (x) { return x.paso === k; }); }
  /* La felicitación por la botella es una sola, con o sin Empiece Ya. */
  function yaMandadoPaso(p, k) {
    return k === 'botella' || k === 'botella_ey' ? yaMandado(p, 'botella') || yaMandado(p, 'botella_ey') : yaMandado(p, k);
  }
  function envioDe(p, k) {
    var l = (p.mensajes || []).filter(function (x) { return x.paso === k; });
    return l.length ? l[l.length - 1] : null;
  }
  /* Se propone solo el más reciente: si se pasó uno sin mandar y ya le tocó otro, el viejo ya no va. */
  function pasoQueToca(p) {
    if (!enSecuencia(p)) return null;                    // por marcar o fuera de la secuencia: nada
    var c = candidatos(p);
    if (!c.length) return null;
    c.sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : PASO[a.k].i - PASO[b.k].i; });
    var u = c[c.length - 1];
    return yaMandadoPaso(p, u.k) || !plantilla(u.k).activo ? null : u;   // apagado: no se propone ni revive uno viejo
  }
  function porEscribir() {
    var l = [];
    S.asesores.forEach(function (p) { var x = pasoQueToca(p); if (x) l.push({ p: p, x: x }); });
    return l;
  }
  /* Qué le tocará si no viene, para mostrarlo en la lista y en su ficha. */
  function proximoAviso(p) {
    if (p.estado !== 'en_curso' || !enSecuencia(p)) return null;
    var h = hoyISO(), l = [];
    if (!p.validas) l.push({ k: 'semana1', f: sumarISO(p.inicio, 7) });
    l.push({ k: 'quedan15', f: sumarISO(p.vence, -15) }, { k: 'quedan7', f: sumarISO(p.vence, -7) }, { k: 'cierre', f: sumarISO(p.vence, 1) });
    return l.filter(function (x) { return x.f > h && plantilla(x.k).activo && !yaMandadoPaso(p, x.k); })[0] || null;
  }
  /* Bienvenida: el primer día que falta mandar, si ya le llegó su fecha. Solo en sus días 1 a 5. */
  function bvPendiente(p) {
    if (!enBienvenida(p) || !enSecuencia(p)) return null;
    var d = diaDe(p);
    for (var n = 1; n <= d + 1 && n <= DAYS.length; n++) if (!yaMandado(p, 'bv' + n)) return { n: n, atraso: d + 1 - n };
    return null;
  }
  function bvPorEnviar() {
    var l = [];
    S.asesores.forEach(function (p) { var x = bvPendiente(p); if (x) l.push({ p: p, x: x }); });
    return l;
  }
  function celularWA(p) { var c = celLocal(p && p.celular); return /^9\d{8}$/.test(c) ? c : null; }
  function linkWA(p, texto) { var c = celularWA(p); return c ? 'https://wa.me/51' + c + (texto ? '?text=' + encodeURIComponent(texto) : '') : null; }
  function lineaEstado(p) {
    var m = metaClases(), v = p.validas || 0;
    if (p.estado === 'en_curso') {
      var d = diasISO(hoyISO(), p.vence);
      return { txt: v + ' de ' + m + ' · ' + (d <= 0 ? 'vence hoy' : d === 1 ? 'le queda 1 día' : 'le quedan ' + d + ' días') + ' (' + fCorta(p.vence) + ')',
               cls: d <= 5 && v < m ? 'urge' : '' };
    }
    if (p.estado === 'logro') {
      var t = p.test || {};
      return { txt: 'Logró sus ' + m + ' clases el ' + fCorta(p.logro_fecha) + ' · ' +
        (p.botella_entregada_en ? 'botella entregada' : p.ey ? 'su botella va con el Empiece Ya'
          : t.estado === 'habilitado' ? 'le falta su test (hasta el ' + fCorta(t.hasta) + ')'
          : t.estado === 'vencido' ? 'no aprobó su test a tiempo'
          : t.estado === 'aprobado' ? 'aprobó su test · botella por recoger' : 'botella por recoger'),
        cls: t.estado === 'vencido' ? 'mal' : 'ok' };
    }
    if (p.estado === 'vencio') return { txt: 'Venció el ' + fCorta(p.vence) + ' con ' + v + ' de ' + m, cls: 'mal' };
    if (p.estado === 'sin_seguimiento') return { txt: 'Se inscribió antes del seguimiento del Nivel Cero', cls: '' };
    return { txt: '', cls: '' };
  }

  

  var CL = { estado: 'cargando', error: null, acciones: [], clientes: Object.create(null), oficina: {}, hoy: null, items: [], busca: '', fechaPara: null };
  /* Textos originales. Lo editado se guarda en n0_plantillas con la misma clave (vacío = vuelve a este). */
  var PASOS_CL = [
    { k: 'cl_bienvenida', tipo: 'bienvenida', dia: 11, g: 'cbv', t: 'Al recibir su pedido', corto: 'Al recibir',
      cuando: 'El día que recibe su pedido: video de lavado y recomendaciones según lo que compró.',
      tu: '¡Hola {nombre}! 🎉 Gracias por confiar en Rena Ware. Ya tienes en casa tu {productos}.\nTe paso el video de cómo lavar tus utensilios antes del primer uso y algunas recomendaciones:\n{recomendaciones}\nCualquier duda me escribes, estoy para ayudarte. Un abrazo, {asesor}.',
      usted: '¡Hola {nombre}! 🎉 Gracias por confiar en Rena Ware. Ya tiene en casa su {productos}.\nLe paso el video de cómo lavar sus utensilios antes del primer uso y algunas recomendaciones:\n{recomendaciones}\nCualquier duda me escribe, estoy para ayudarle. Un abrazo, {asesor}.' },
    { k: 'cl_semana1', tipo: 'semana1', dia: 12, g: 'cbv', t: 'Una semana · Nutri Sensor', corto: 'Semana 1',
      cuando: 'A la semana de recibir, si compró ollas: cómo lavar el Nutri Sensor.',
      tu: 'Hola {nombre}, ¿cómo te va con tus ollas Rena Ware? 😊 Te paso el video de cómo lavar el Nutri Sensor de las tapas para que siempre funcione bien. ¡Cualquier duda me escribes!',
      usted: 'Hola {nombre}, ¿cómo le va con sus ollas Rena Ware? 😊 Le paso el video de cómo lavar el Nutri Sensor de las tapas para que siempre funcione bien. ¡Cualquier duda me escribe!' },
    { k: 'cl_mes1', tipo: 'mes1', dia: 13, g: 'cbv', t: 'Un mes · brillo y Rena Lite', corto: 'Mes 1',
      cuando: 'Al mes de recibir, si compró ollas: mantener el brillo, buen uso y Rena Lite.',
      tu: 'Hola {nombre}, ya va un mes con tus ollas Rena Ware ✨ Te comparto cómo mantener el brillo con Rena Lite y algunos consejos de buen uso. Si necesitas Rena Lite, lo tenemos en la oficina: {oficina}.',
      usted: 'Hola {nombre}, ya va un mes con sus ollas Rena Ware ✨ Le comparto cómo mantener el brillo con Rena Lite y algunos consejos de buen uso. Si necesita Rena Lite, lo tenemos en la oficina: {oficina}.' },
    { k: 'cl_fincuotas', tipo: 'fincuotas', dia: 14, g: 'cbv', t: 'Un mes antes de terminar sus cuotas', corto: 'Fin de cuotas',
      cuando: 'Un mes antes de pagar la última cuota, si compró al crédito.',
      tu: 'Hola {nombre}, ¡te felicitamos! 🎉 Estás a un mes de terminar de pagar tu {productos} ({cuotas} cuotas). Gracias por tu puntualidad. Si quieres completar tu juego o conocer las promociones de este mes, escríbeme y te cuento.',
      usted: 'Hola {nombre}, ¡le felicitamos! 🎉 Está a un mes de terminar de pagar su {productos} ({cuotas} cuotas). Gracias por su puntualidad. Si quiere completar su juego o conocer las promociones de este mes, escríbame y le cuento.' },
    { k: 'cl_rec_ollas', g: 'crec', t: 'Si compró ollas', cuando: 'Se agrega al mensaje de bienvenida cuando el pedido trae ollas.',
      tu: '🍲 Ollas: lávalas con Rena Lite y una esponja suave antes del primer uso. Cocina a fuego bajo o medio, sin agua y con la tapa puesta.',
      usted: '🍲 Ollas: lávelas con Rena Lite y una esponja suave antes del primer uso. Cocine a fuego bajo o medio, sin agua y con la tapa puesta.' },
    { k: 'cl_rec_sartenes', g: 'crec', t: 'Si compró sartenes', cuando: 'Se agrega cuando el pedido trae sartenes.',
      tu: '🍳 Sartenes: puedes freír sin aceite. Caliéntala a fuego medio hasta que una gota de agua baile sobre ella y listo.',
      usted: '🍳 Sartenes: puede freír sin aceite. Caliéntela a fuego medio hasta que una gota de agua baile sobre ella y listo.' },
    { k: 'cl_rec_filtro', g: 'crec', t: 'Si compró filtro de agua', cuando: 'Se agrega cuando el pedido trae un Aqua Nano o filtro de agua.',
      tu: '💧 Filtro: te mando el video de cómo conectarlo. Deja correr el agua 10 minutos la primera vez antes de tomarla.',
      usted: '💧 Filtro: le mando el video de cómo conectarlo. Deje correr el agua 10 minutos la primera vez antes de tomarla.' },
    { k: 'cl_rec_cocina', g: 'crec', t: 'Si compró cocina de inducción', cuando: 'Se agrega cuando el pedido trae una cocina de inducción.',
      tu: '🔥 Cocina de inducción: úsala con tus ollas Rena Ware, empieza en potencia media y no la tapes mientras está caliente.',
      usted: '🔥 Cocina de inducción: úsela con sus ollas Rena Ware, empiece en potencia media y no la tape mientras está caliente.' },
    { k: 'cl_rec_presion', g: 'crec', t: 'Si compró olla a presión', cuando: 'Se agrega cuando el pedido trae una olla a presión.',
      tu: '⏱️ Olla a presión: revisa que la válvula esté limpia antes de usarla, no la llenes más de dos tercios y espera a que baje la presión antes de abrirla.',
      usted: '⏱️ Olla a presión: revise que la válvula esté limpia antes de usarla, no la llene más de dos tercios y espere a que baje la presión antes de abrirla.' },
    { k: 'cl_rec_aire', g: 'crec', t: 'Si compró purificador de aire', cuando: 'Se agrega cuando el pedido trae un purificador de aire.',
      tu: '🌀 Purificador: colócalo a 20 cm de la pared, en el ambiente donde más tiempo pasan, y déjalo prendido en modo automático.',
      usted: '🌀 Purificador: colóquelo a 20 cm de la pared, en el ambiente donde más tiempo pasan, y déjelo prendido en modo automático.' },
    { k: 'cl_prefiltro', tipo: 'prefiltro', dia: 15, g: 'ccic', t: 'Cambio de pre-filtro', corto: 'Pre-filtro', meses: 12,
      cuando: 'Cada 12 meses desde que recibió el Aqua Nano o compró su último pre-filtro. Se avisa un mes antes.',
      tu: 'Hola {nombre}, te saludamos de Rena Ware 💧 Tu Aqua Nano cumple un año desde el {ultimo} y le toca el cambio del pre-filtro para que siga cuidando el agua de tu familia. ¿Coordinamos el cambio? Te lo llevamos a casa o puedes pasar por la oficina: {oficina}.',
      usted: 'Hola {nombre}, le saludamos de Rena Ware 💧 Su Aqua Nano cumple un año desde el {ultimo} y le toca el cambio del pre-filtro para que siga cuidando el agua de su familia. ¿Coordinamos el cambio? Se lo llevamos a casa o puede pasar por la oficina: {oficina}.' },
    { k: 'cl_filtroppal', tipo: 'filtroppal', dia: 16, g: 'ccic', t: 'Cambio del filtro principal', corto: 'Filtro principal', meses: 48,
      cuando: 'Cada 48 meses (4 años) desde que recibió el Aqua Nano o compró su último elemento desechable.',
      tu: 'Hola {nombre}, te saludamos de Rena Ware 💧 Tu Aqua Nano ya cumplió 4 años desde el {ultimo}: toca cambiar el elemento filtrante principal para que el agua siga saliendo pura. ¿Coordinamos el cambio? Te lo llevamos a casa o puedes pasar por la oficina: {oficina}.',
      usted: 'Hola {nombre}, le saludamos de Rena Ware 💧 Su Aqua Nano ya cumplió 4 años desde el {ultimo}: toca cambiar el elemento filtrante principal para que el agua siga saliendo pura. ¿Coordinamos el cambio? Se lo llevamos a casa o puede pasar por la oficina: {oficina}.' },
    { k: 'cl_aire', tipo: 'aire', dia: 17, g: 'ccic', t: 'Cambio del filtro de aire', corto: 'Filtro de aire', meses: 18,
      cuando: 'Cada 18 meses desde que recibió el purificador o compró su último filtro.',
      tu: 'Hola {nombre}, te saludamos de Rena Ware 🌀 Tu purificador de aire cumple 18 meses desde el {ultimo} y le toca cambiar el filtro para que siga limpiando el aire de tu casa. ¿Coordinamos el cambio? {oficina}.',
      usted: 'Hola {nombre}, le saludamos de Rena Ware 🌀 Su purificador de aire cumple 18 meses desde el {ultimo} y le toca cambiar el filtro para que siga limpiando el aire de su casa. ¿Coordinamos el cambio? {oficina}.' },
    { k: 'cl_botella', tipo: 'botella', dia: 18, g: 'ccic', t: 'Renovar la botella filtrante', corto: 'Botella filtrante', meses: 36,
      cuando: 'Cada 36 meses (3 años) desde que recibió su botella filtrante (sola o de regalo en un combo) o compró la última.',
      tu: 'Hola {nombre}, te saludamos de Rena Ware 💧 Tu botella filtrante cumple 3 años desde el {ultimo} y ya le toca renovarla para que siga filtrando bien el agua que tomas fuera de casa. ¿Te separo una nueva? Te la llevamos o puedes pasar por la oficina: {oficina}.',
      usted: 'Hola {nombre}, le saludamos de Rena Ware 💧 Su botella filtrante cumple 3 años desde el {ultimo} y ya le toca renovarla para que siga filtrando bien el agua que toma fuera de casa. ¿Le separo una nueva? Se la llevamos o puede pasar por la oficina: {oficina}.' }
  ];
  var PASO_CL = Object.create(null);
  PASOS_CL.forEach(function (x, i) { x.i = i; x.cl = true; PASO_CL[x.k] = x; });
  var CL_POR_TIPO = Object.create(null);
  PASOS_CL.forEach(function (x) { if (x.tipo) CL_POR_TIPO[x.tipo] = x; });
  var GRUPOS_CL = [['cbv', 'Bienvenida del cliente'], ['crec', 'Recomendaciones según lo que compró'], ['ccic', 'Cambio de filtros']];
  var MARCAS_CL = [['nombre', 'su nombre'], ['productos', 'lo que compró'], ['fecha', 'cuándo lo recibió'], ['asesor', 'su asesor o asesora'],
                   ['ultimo', 'desde cuándo corre el ciclo del filtro'], ['vence', 'cuándo toca el cambio'], ['cuotas', 'sus cuotas'],
                   ['oficina', 'la dirección de la oficina'], ['recomendaciones', 'las recomendaciones según lo que compró']];
  var MARCA_CL = Object.create(null);
  MARCAS_CL.forEach(function (m) { MARCA_CL[m[0]] = 1; });
  var RECS = [['ollas', 'cl_rec_ollas'], ['sartenes', 'cl_rec_sartenes'], ['filtro', 'cl_rec_filtro'], ['cocina', 'cl_rec_cocina'], ['presion', 'cl_rec_presion'], ['aire', 'cl_rec_aire']];
  var ESTADO_CL = { vencido: 'Vencido', proximo: 'Próximo', pendiente: 'Programado', hecho: 'Enviado', omitido: 'Omitido', caducado: 'Fuera de plazo',
                    al_dia: 'Al día', avisado: 'Avisado', cerrado: 'Ya no aplica' };

  function pasoDef(k) { return PASO[k] || PASO_CL[k] || null; }
  function pasoCl(a) { return CL_POR_TIPO[a && a.tipo] || null; }
  function nombrePasoCl(tipo) { var x = CL_POR_TIPO[tipo]; return x ? x.t : tipo; }
  function nombreFiltro(tipo) { var x = CL_POR_TIPO[tipo]; return x ? x.corto : tipo; }
  function clientePorId(id) { return (id && CL.clientes[String(id)]) || null; }
  function accionPorClave(clave) {
    for (var i = 0; i < CL.acciones.length; i++) if (CL.acciones[i].clave === clave) return CL.acciones[i];
    return null;
  }
  function accionesDe(cid) { return CL.acciones.filter(function (a) { return String(a.cliente_id) === String(cid); }); }
  function tratoCl(c) { return c && (c.trato === 'tu' || c.trato === 'usted') ? c.trato : tratoDefecto(); }
  function ordenDe(c, n) {
    var l = (c && c.ordenes) || [];
    for (var i = 0; i < l.length; i++) if (String(l[i].n_orden) === String(n)) return l[i];
    return null;
  }
  function esCiclo(a) { return a && a.clase === 'ciclo'; }
  function sinCodigo(s) { return String(s || '').replace(/^\s*\d+[A-Z]?\s*-\s*/, ''); }
  function nombresProductos(str) {
    return String(str || '').split('|').map(function (seg) {
      return sinCodigo(seg.split('(x')[0].replace(/\((S\/|x\d)[^)]*\)/g, '')).replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }
  function nombreBonito(str) {
    return titulo(sinCodigo(str)).replace(/\bIi\b/g, 'II').replace(/\bIii\b/g, 'III').replace(/\bCtu\b/g, 'CTU').replace(/\bUcu\b/g, 'UCU').replace(/\bHd\b/g, 'HD').replace(/\bUv\b/g, 'UV')
      .replace(/\bIc-/g, 'IC-').replace(/\bLx-/g, 'LX-').replace(/\bC\/tapa\b/g, 'c/tapa').replace(/(\d)(cm|l|lts?)\b/gi, function (m, d, u) { return d + ' ' + u.toLowerCase(); }).replace(/\bCm\b/g, 'cm');
  }
  function productoCorto(str) {
    var l = nombresProductos(str);
    return l.length ? nombreBonito(l[0]) : '';
  }
  function productosDe(a) {
    var c = clientePorId(a.cliente_id), o = ordenDe(c, a.n_orden);
    if (o) return productoCorto(o.productos);
    if (esCiclo(a)) return nombreBonito(a.sistema || (a.tipo === 'aire' ? 'Purificador de aire' : a.tipo === 'botella' ? 'Botella filtrante' : 'Aqua Nano'));
    return 'pedido Rena Ware';
  }
  function oficinaTxt() {
    var o = CL.oficina || {};
    return [o.direccion, o.referencia].filter(Boolean).join(', ') || 'Av. Cayma 628, Of. 502';
  }
  function recomendaciones(a, tr) {
    var f = a.flags || {}, l = [];
    RECS.forEach(function (r) {
      if (!f[r[0]]) return;
      var pl = plantilla(r[1]);
      if (pl.activo) l.push(llenarCl(pl[tr], a, tr, true));
    });
    return l.join('\n');
  }
  function valoresCl(a, tr, sinRecs) {
    var c = clientePorId(a.cliente_id);
    return {
      nombre: pila((c && c.nombre) || a.cliente), productos: productosDe(a), fecha: fLargaISO(a.entrega || a.base) || 'hace poco',
      asesor: pila(a.vendedor) || 'tu equipo Rena Ware', ultimo: fLargaISO(a.ultimo_cambio || a.base) || '', vence: fLargaISO(a.vence) || '',
      cuotas: String(a.cuotas || ''), oficina: oficinaTxt(), recomendaciones: sinRecs ? '' : recomendaciones(a, tr)
    };
  }
  function limpiarTextoCl(s) {
    return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').replace(/:\n\n/g, ':\n').trim();
  }
  function llenarCl(t, a, tr, sinRecs) {
    tr = tr || tratoCl(clientePorId(a.cliente_id));
    var v = valoresCl(a, tr, sinRecs);
    return limpiarTextoCl(String(t || '').replace(RE_MARCA, function (m, n) {
      var k = claveMarca(n);
      return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : m;
    }));
  }
  function textoCl(a, tr) {
    var x = pasoCl(a);
    if (!x) return '';
    var c = clientePorId(a.cliente_id);
    tr = tr || tratoCl(c);
    return llenarCl(plantilla(x.k)[tr], a, tr);
  }
  function celCl(a) { var c = clientePorId(a.cliente_id); return celularWA({ celular: (c && c.celular) || a.celular }); }
  function linkCl(a, texto) { var c = celularWA({ celular: (clientePorId(a.cliente_id) || {}).celular || a.celular }); return c ? 'https://wa.me/51' + c + (texto ? '?text=' + encodeURIComponent(texto) : '') : null; }
  function activoCl(a) { var x = pasoCl(a); return !!x && plantilla(x.k).activo; }
  /* Todo cliente entra a las secuencias salvo que se le quite (✗): entonces no sale en «Para hoy». */
  function fueraCl(cid) { return marcaDe(clientePorId(cid)) === false; }
  function enSecCl(a) { return !fueraCl(a.cliente_id); }

  /* ---------- qué toca */
  function clBvHoy() {
    return CL.acciones.filter(function (a) { return !esCiclo(a) && activoCl(a) && enSecCl(a) && (a.estado === 'vencido' || (a.estado === 'proximo' && a.dias <= 0)); })
      .sort(function (a, b) { return String(a.vence).localeCompare(String(b.vence)) || titulo(a.cliente).localeCompare(titulo(b.cliente), 'es'); });
  }
  function clBvProximos() {
    return CL.acciones.filter(function (a) { return !esCiclo(a) && activoCl(a) && enSecCl(a) && a.estado === 'proximo' && a.dias > 0 && a.dias <= 7; })
      .sort(function (a, b) { return String(a.vence).localeCompare(String(b.vence)); });
  }
  function clCicloHoy() {
    return CL.acciones.filter(function (a) { return esCiclo(a) && activoCl(a) && enSecCl(a) && (a.estado === 'vencido' || (a.estado === 'proximo' && a.dias <= 30)); })
      .sort(function (a, b) { return String(a.vence).localeCompare(String(b.vence)) || titulo(a.cliente).localeCompare(titulo(b.cliente), 'es'); });
  }
  function clAvisados() {
    return CL.acciones.filter(function (a) { return esCiclo(a) && enSecCl(a) && a.estado === 'avisado'; })
      .sort(function (a, b) { return String(a.ultimo_aviso).localeCompare(String(b.ultimo_aviso)); });
  }
  function gestionesHoy() {
    var h = hoyISO(), l = [];
    CL.acciones.forEach(function (a) { (a.gestiones || []).forEach(function (g) { if (g.fecha === h) l.push({ a: a, g: g }); }); });
    return l;
  }

  /* =====================================================================
     WhatsApp automático (número del equipo, por Kapso). Cada mensaje sale
     como plantilla aprobada por Meta: cuerpo de hasta 1,024 caracteres y
     variables de una sola línea; cada archivo, aparte. Lo propio de cada persona
     va como variable; lo demás (dirección, horario, promoción, niveles del
     Empiece Ya…) queda fijo en la plantilla: si cambia, sale otra versión y
     se manda a aprobar. Lo usan esta página (vista previa) y la función
     wa-auto de Supabase, que lo copia de aquí con servidor/construir.js.
     ===================================================================== */
  var WA_MAX = 1024;
  /* Lo propio de cada persona, con su largo máximo esperado: el texto se parte con esos largos, igual para todos,
     y cada parte cabe en 1,024 aunque los datos sean los más largos (si alguien los pasa, se avisa antes de enviar). */
  var WA_PERSONAL = {
    COMA_NOMBRE: 16, CODIGO: 7, DIA: 2, EMPIEZA: 37, QUEDAN: 22, LUEGO: 21, QUINTO: 44, FECHA_LIMITE: 26,
    OPCIONES_O: 80, OPCIONES_Y: 80, EY_FECHA: 26,
    nombre: 14, limite: 26, dias: 8, avance: 40, proxima: 40, clases: 2, faltan: 2, limite_test: 26, dias_test: 8,
    productos: 60, fecha: 26, asesor: 14, ultimo: 26, vence: 26, cuotas: 2
  };
  /* Ejemplos para que Meta revise la plantilla (no son datos de nadie). */
  var WA_EJEMPLO = {
    COMA_NOMBRE: ', Ana', CODIGO: '1234567', DIA: '1', EMPIEZA: 'Hoy empieza tu camino en Rena Ware.', QUEDAN: ' (te quedan 20 días)',
    LUEGO: 'Mañana', QUINTO: 'Mañana, en nuestro quinto y último mensaje,', FECHA_LIMITE: 'jueves 4 de diciembre',
    OPCIONES_O: '*hoy a las 4:00 p. m.* o *el viernes 6 a las 4:30 p. m.*', OPCIONES_Y: '*hoy a las 4:00 p. m.* y *el viernes 6 a las 4:30 p. m.*',
    EY_FECHA: 'miércoles 25 de noviembre', nombre: 'Ana', limite: 'jueves 4 de diciembre', dias: '15 días', avance: 'Lleva 3 de 5: le faltan 2.',
    proxima: 'el viernes 6 a las 4:30 p. m.', clases: '3', faltan: '2', limite_test: 'jueves 20 de noviembre', dias_test: '5 días',
    productos: 'Juego Gourmet 17 Piezas', fecha: 'lunes 3 de noviembre', asesor: 'María', ultimo: 'lunes 3 de noviembre', vence: 'jueves 4 de diciembre', cuotas: '12'
  };
  /* Lo que promociona va como marketing; los avisos de su cuenta, sus clases o su compra, como utilidad. Meta decide al aprobar. */
  var WA_CATEGORIA = { bv2: 'MARKETING', bv3: 'MARKETING', bv4: 'MARKETING', bv5: 'MARKETING', cl_mes1: 'MARKETING', cl_fincuotas: 'MARKETING' };
  function waCategoria(k) { return WA_CATEGORIA[k] || 'UTILITY'; }
  var WA_MB = 1048576;
  function waAjustes() {
    var d = S.ajustesData || {}, o = {};
    CAMPOS_AJ.forEach(function (k) { var v = d[k]; o[k] = AJ_NUM[k] ? num(v) : String(v == null ? '' : v).replace(/\r/g, '').trim(); });
    return o;
  }
  function waHorario() {
    return horarioDeNivel0(S.nivel0).map(function (h) {
      var m = /^(\d{1,2}):(\d{2})/.exec(String(h.hora || ''));
      return m ? { dow: Number(h.dia), h: Number(m[1]), m: Number(m[2]) } : null;
    }).filter(Boolean);
  }
  /* Lo mismo que «Preparar» carga en la bienvenida, desde lo guardado (no desde lo que se esté escribiendo). */
  function waCtx(p) {
    return { nombre: pila(p.nombre), codigo: p.codigo || '', fecha: String(p.inicio || '').slice(0, 10), plazo: S.plazo,
             ajustes: waAjustes(), horario: waHorario(), ahora: new Date() };
  }
  function waArchivos(dia) { return itemsDe(dia).filter(function (i) { return !!i.ruta; }); }
  function waVacios(dia) { return itemsDe(dia).filter(function (i) { return !i.ruta; }); }
  /* Arriba de cada parte va un archivo: video (mp4 hasta 16 MB), imagen (jpg o png hasta 5 MB) o documento (hasta 100 MB). */
  function waEncabezado(it) {
    if (!it) return null;
    var t = tipoDeItem(it), b = Number(it.bytes) || 0, mime = String(it.content_type || '');
    var tipo = t === 'video' && b <= 16 * WA_MB && /^video\/(mp4|3gpp)$/.test(mime) ? 'VIDEO'
      : t === 'imagen' && b <= 5 * WA_MB && /^image\/(jpeg|png)$/.test(mime) ? 'IMAGE' : 'DOCUMENT';
    return { tipo: tipo, id: it.id, ruta: it.ruta, nombre: it.nombre || '', archivo: nombreParaGuardar(it), bytes: b, mime: mime,
             como_documento: tipo === 'DOCUMENT' && t !== 'pdf', pesado: b > 100 * WA_MB };
  }
  function waHuella(s) {                                 // cyrb53: corta y la misma aquí y en el servidor
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < s.length; i++) { ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  var WA_A = '\u0001', WA_B = '\u0002', RE_WA = /\u0001(\d+)\u0002/g;
  var RE_WA_JUNTOS = /\u0001(\d+)\u0002([^\u0001\u0002A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]*)\u0001(\d+)\u0002/;
  /* El texto con lo propio de la persona marcado, reemplazado y limpiado igual que al armar el mensaje. */
  function waMarcar(t, re, clave, v, limpiar) {
    var datos = [];
    var s = String(t || '').replace(re, function (m, n) {
      var k = clave(n);
      if (!Object.prototype.hasOwnProperty.call(v, k)) return m;
      var x = String(v[k] == null ? '' : v[k]), y = x.trim();
      if (!Object.prototype.hasOwnProperty.call(WA_PERSONAL, k) || !y || /[\n\t]/.test(y)) return x;   // fijo en la plantilla
      datos.push({ k: k, v: y });
      return x.slice(0, x.indexOf(y)) + WA_A + (datos.length - 1) + WA_B + x.slice(x.indexOf(y) + y.length);
    });
    s = limpiar(s);
    // dos datos seguidos (solo con espacios o signos entre ellos) van como uno: Meta no acepta variables juntas
    for (var m = RE_WA_JUNTOS.exec(s); m; m = RE_WA_JUNTOS.exec(s)) {
      var a = datos[Number(m[1])], b = datos[Number(m[3])];
      datos.push({ k: a.k + '+' + b.k, v: a.v + m[2] + b.v, partes: [a, m[2], b] });
      s = s.slice(0, m.index) + WA_A + (datos.length - 1) + WA_B + s.slice(m.index + m[0].length);
    }
    return { s: s, datos: datos };
  }
  /* Si el dato termina en punto y el texto sigue con punto, queda uno solo (como «4:30 p. m.» + «.»). */
  function waValor(d, sigue) { return sigue === '.' && /[^.]\.$/.test(d.v) ? d.v.slice(0, -1) : d.v; }
  function waEjemplo(d) { return d.partes ? waEjemplo(d.partes[0]) + d.partes[1] + waEjemplo(d.partes[2]) : (WA_EJEMPLO[d.k] || 'texto'); }
  function waMaxDato(d) { return d.partes ? waMaxDato(d.partes[0]) + d.partes[1].length + waMaxDato(d.partes[2]) : Math.max(WA_PERSONAL[d.k] || 40, d.v.length); }
  function waLargo(s, datos) {
    var n = 0;
    s.replace(RE_WA, function (m, i) { n += waMaxDato(datos[Number(i)]) - m.length; return m; });
    return s.length + n;
  }
  /* Se parte en párrafos: cada parte, con los datos más largos posibles, cabe holgada en 1,024. */
  function waPartir(s, datos) {
    var out = [], actual = '';
    s.split('\n\n').forEach(function (p) {
      var cand = actual ? actual + '\n\n' + p : p;
      if (!actual || waLargo(cand, datos) <= WA_MAX) { actual = cand; return; }
      out.push(actual);
      actual = p;
    });
    if (actual) out.push(actual);
    return out;
  }
  function waNumerar(s, datos) {
    var params = [], ejemplos = [], claves = [];
    var cuerpo = s.replace(RE_WA, function (m, i, pos) {
      var d = datos[Number(i)], sigue = s.charAt(pos + m.length);
      params.push(waValor(d, sigue));
      ejemplos.push(waValor({ v: waEjemplo(d) }, sigue));
      claves.push(d.k);
      return '{{' + params.length + '}}';
    });
    return { cuerpo: cuerpo, params: params, ejemplos: ejemplos, claves: claves };
  }
  function waLlenarCuerpo(c, params) { return c.replace(/\{\{(\d+)\}\}/g, function (m, i) { return params[Number(i) - 1]; }); }
  /* Los archivos van en tres plantillas fijas, una por tipo: el archivo arriba y su texto («Texto que va con el
     archivo», o su nombre) como dato. Así cambiar un archivo o su texto no pide otra aprobación a Meta. */
  var WA_ARCHIVO = {
    VIDEO: { nombre: 'eqa_archivo_video_v1', cuerpo: '🎥 *Video del Equipo Arequipa de Rena Ware*\n\n{{1}}\n\n_Para verlo aquí mismo, guardarlo y compartirlo._' },
    IMAGE: { nombre: 'eqa_archivo_imagen_v1', cuerpo: '🖼️ *Imagen del Equipo Arequipa de Rena Ware*\n\n{{1}}\n\n_Para verla aquí mismo, guardarla y compartirla._' },
    DOCUMENT: { nombre: 'eqa_archivo_documento_v1', cuerpo: '📄 *Archivo del Equipo Arequipa de Rena Ware*\n\n{{1}}\n\n_Para abrirlo aquí mismo, guardarlo y compartirlo._' }
  };
  var WA_ARCHIVO_EJEMPLO = 'Esta es la lista de precios general para los clientes.';
  /* El texto del archivo va en una sola línea (Meta no acepta saltos de línea en un dato). */
  function waLeyenda(it) {
    var s = String(it.descripcion || '').replace(/\s*\n+\s*/g, ' · ').replace(/[ \t]{2,}/g, ' ').trim();
    s = s || String(it.nombre || '').replace(/\s+/g, ' ').trim() || 'Material del día';
    return s.length > 880 ? s.slice(0, 879).replace(/\s+\S*$/, '') + '…' : s;
  }
  /* Las partes de un mensaje: primero el texto, partido en párrafos si no cabe en una; después cada archivo, en orden. */
  function waPartes(base, cat, s, datos, archivos) {
    var trozos = s ? waPartir(s, datos) : [], out = [];
    trozos.forEach(function (t, i) {
      var x = waNumerar(t, datos), clave = base + (trozos.length > 1 ? '.' + (i + 1) : '');
      var huella = waHuella(JSON.stringify([cat, '', x.cuerpo]));
      out.push({ clave: clave, categoria: cat, encabezado: null, cuerpo: x.cuerpo, params: x.params, ejemplos: x.ejemplos, claves: x.claves,
                 de_texto: true, huella: huella, nombre: ('eqa_' + clave + '_' + huella).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                 texto: waLlenarCuerpo(x.cuerpo, x.params) });
    });
    archivos.forEach(function (it) {
      var enc = waEncabezado(it), g = WA_ARCHIVO[enc.tipo], ley = waLeyenda(it);
      out.push({ clave: 'archivo_' + enc.tipo.toLowerCase(), categoria: 'UTILITY', encabezado: enc, cuerpo: g.cuerpo, params: [ley],
                 ejemplos: [WA_ARCHIVO_EJEMPLO], claves: ['archivo'], de_texto: false, huella: 'v1', nombre: g.nombre,
                 texto: waLlenarCuerpo(g.cuerpo, [ley]) });
    });
    return out;
  }
  /* Lo que no se puede mandar solo: faltan datos, no tiene celular, o una parte no cumple las reglas de Meta. */
  function waItem(it) {
    var prob = [], falta = faltantes(it.texto);
    if (!String(it.texto || '').trim() || !it.partes.length) prob.push('El mensaje está vacío.');
    if (falta.length) prob.push('Falta ' + unirY(falta) + '.');
    if (/\{[^{}\n]{1,20}\}/.test(it.texto)) prob.push('El texto tiene un marcador que no se reconoce.');
    if (!it.celular) prob.push('No tiene un celular válido.');
    var junto = it.partes.filter(function (p) { return p.de_texto; }).map(function (p) { return p.texto; }).join('\n\n');
    if (junto !== it.texto) prob.push('El texto automático no sale igual que en la página.');
    it.partes.forEach(function (p, i) {
      var cual = it.partes.length > 1 ? 'La parte ' + (i + 1) : 'El mensaje';
      if (/^\s*\{\{\d+\}\}/.test(p.cuerpo) || /\{\{\d+\}\}\s*$/.test(p.cuerpo)) prob.push(cual + ' empieza o termina con un dato (Meta no lo acepta).');
      if (p.texto.length > WA_MAX) prob.push(cual + ' pasa de 1,024 caracteres.');
      if (p.encabezado && p.encabezado.pesado) prob.push(cual + ' lleva un archivo de más de 100 MB.');
    });
    it.problemas = prob;
    it.avisos = it.vacios && it.vacios.length ? ['Va sin ' + unirY(it.vacios.map(function (x) { return '«' + (x.nombre || 'archivo') + '»'; })) + ': ese espacio no tiene archivo.'] : [];
    return it;
  }
  function waItemBv(p, n) {
    var ctx = waCtx(p), dia = DAYS[n - 1];
    var m = waMarcar(dia.body, RE_MARCA_BV, function (k) { return k; }, valores(ctx, n), limpiarBv);
    return waItem({ tipo: 'asesor', ref: p.id, paso: 'bv' + n, titulo: 'Día ' + n + ' · ' + dia.title, nombre: titulo(p.nombre),
                    celular: celularWA(p), trato: 'tu', texto: messageFor(dia, ctx), vacios: waVacios(n),
                    partes: waPartes('bv' + n, waCategoria('bv' + n), m.s, m.datos, waArchivos(n)) });
  }
  function waItemSeg(p, k) {
    var tr = tratoDe(p), t = plantilla(k)[tr];
    var m = waMarcar(t, RE_MARCA, claveMarca, valoresSeg(p, tr), limpiarSeg);
    return waItem({ tipo: 'asesor', ref: p.id, paso: k, titulo: nombrePaso(k), nombre: titulo(p.nombre), celular: celularWA(p), trato: tr,
                    texto: llenar(t, p, tr), partes: waPartes(k + '.' + tr, waCategoria(k), m.s, m.datos, []) });
  }
  function waItemCl(a) {
    var c = clientePorId(a.cliente_id), tr = tratoCl(c), x = pasoCl(a), t = plantilla(x.k)[tr];
    var m = waMarcar(t, RE_MARCA, claveMarca, valoresCl(a, tr), limpiarTextoCl);
    return waItem({ tipo: 'cliente', ref: a.cliente_id, paso: a.tipo, accion: a.clave, n_orden: a.n_orden, titulo: x.t, atraso: Math.max(0, -(Number(a.dias) || 0)),
                    nombre: titulo((c && c.nombre) || a.cliente), celular: celCl(a), trato: tr, texto: llenarCl(t, a, tr), vacios: waVacios(x.dia),
                    partes: waPartes(x.k + '.' + tr, waCategoria(x.k), m.s, m.datos, waArchivos(x.dia)) });
  }
  /* Lo mismo que «Para hoy»: bienvenida y seguimiento de asesores, y los mensajes de clientes que tocan hoy. */
  function waPorEnviarHoy() {
    var l = [];
    S.asesores.forEach(function (p) {
      var b = bvPendiente(p);
      if (b) l.push(waItemBv(p, b.n));
      var x = pasoQueToca(p);
      if (x) l.push(waItemSeg(p, x.k));
    });
    clBvHoy().concat(clCicloHoy()).forEach(function (a) { if (pasoCl(a)) l.push(waItemCl(a)); });
    return l;
  }

  
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
  CL.oficina = cl.oficina || {};
  CL.clientes = Object.create(null);
  (Array.isArray(cl.clientes) ? cl.clientes : []).forEach(function (c) { if (c && c.id) CL.clientes[String(c.id)] = c; });
  CL.acciones = (Array.isArray(cl.acciones) ? cl.acciones : []).filter(function (a) { return a && a.estado !== 'caducado'; });
  CL.items = Array.isArray(cl.adjuntos) ? cl.adjuntos : [];
  CL.estado = 'ok';

  return {
    hoy: hoyISO, porEnviarHoy: waPorEnviarHoy, itemBv: waItemBv, itemSeg: waItemSeg, itemCl: waItemCl, partes: waPartes,
    marcar: waMarcar, huellaTexto: waHuella, categoria: waCategoria, encabezado: waEncabezado,
    asesorPorId: function (id) { return S.asesores.filter(function (p) { return String(p.id) === String(id); })[0] || null; },
    clientePorId: clientePorId, accionesDe: accionesDe, pila: pila, titulo: titulo, celLocal: celLocal, celularWA: celularWA,
    fLargaISO: fLargaISO, tratoDe: tratoDe, tratoCl: tratoCl, S: S, CL: CL
  };
}
