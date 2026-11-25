/* Orquestador del tablero: pestañas, filtros, roles, render y automatizaciones. */
(() => {
  const D = window.TumiData, G = window.TumiCharts, CFG = window.TUMI_CONFIG;
  const { fmt, C } = G;
  const U = D.util;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (id, cls = "ic") => `<svg class="${cls}"><use href="#${id}"/></svg>`;
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const corte = D.corte;

  const ROLES = [
    { id: "gerencia", nombre: "Gerencia general", sedes: null, pii: "ver", exporta: true, desc: "acceso total; los datos personales se muestran solo a pedido y quedan registrados" },
    ...D.SEDES.map((s) => ({ id: `admin-${s}`, nombre: `Administrador · ${s}`, sedes: [s], pii: "mascara", exporta: true, desc: `solo ve la sede ${s} (mínimo privilegio)` })),
    { id: "analista", nombre: "Analista comercial", sedes: null, pii: "mascara", exporta: true, desc: "ve todas las sedes con datos personales enmascarados" },
    { id: "auditor", nombre: "Auditor externo", sedes: null, pii: "oculto", exporta: false, desc: "solo cifras agregadas: sin datos personales ni exportación" },
  ];
  const PERIODOS = [
    { id: "2026", nombre: "2026", desde: "2026-01-01", hasta: corte },
    { id: "2025", nombre: "2025", desde: "2025-01-01", hasta: "2025-12-31" },
    { id: "todo", nombre: "Todo", desde: D.INICIO_DATOS, hasta: corte },
    { id: "90d", nombre: "90 días", desde: U.addDays(corte, -89), hasta: corte },
    { id: "verano", nombre: "Verano 2026", desde: "2026-01-01", hasta: "2026-03-31" },
  ];
  const TABS = [
    { id: "resumen", nombre: "Resumen" }, { id: "dinero", nombre: "Dinero" }, { id: "cobranza", nombre: "Cobranza" },
    { id: "socios", nombre: "Socios" }, { id: "turistas", nombre: "Temporadas y turistas" }, { id: "cara", nombre: "Cara a cara" },
    { id: "detalle", nombre: "Detalle" }, { id: "gobernanza", nombre: "Gobernanza" }, { id: "ia", nombre: "IA y automatización" },
  ];
  const LUGAR = { Lima: "Carabayllo · km 33", Chiclayo: "Lambayeque · norte", Ica: "Costa sur · Huacachina", Tarapoto: "San Martín · selva" };
  const DIMS = { sede: "Sede", servicio: "Servicio", canal: "Canal", tipo_cliente: "Tipo de cliente" };

  const S = {
    datos: null, rol: ROLES[0], tab: "resumen", ctx: null, dirty: new Set(), piiVisible: false, piiTimer: null, bitacora: [], insights: {}, charts: {},
    filtros: { sedes: [...D.SEDES], desde: PERIODOS[0].desde, hasta: PERIODOS[0].hasta, periodo: "2026", servicio: "Todos", cliente: "Todos" },
    auto: { sync: true, calidad: true, cobranza: true, reporte: true }, ultimaSync: null, timerSync: null,
    det: { por: "sede", key: "facturacion", asc: false, abiertos: new Set(), q: "" }, cmp: { a: "Lima", b: "Ica" },
  };

  /* ---------- Utilidades ---------- */
  function toast(texto, icono = "i-check") {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `${ic(icono)}<span>${texto}</span>`;
    $("toasts").appendChild(el);
    setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 400); }, 4200);
  }
  function modal(titulo, html) { $("modal-title").textContent = titulo; $("modal-body").innerHTML = html; $("modal").hidden = false; $("modal-close").focus(); }
  function cerrarModal() { $("modal").hidden = true; }
  const hora = (d) => d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  function auditar(texto, tipo = "info") {
    S.bitacora.unshift({ t: new Date(), texto, tipo, rol: S.rol.nombre });
    S.bitacora = S.bitacora.slice(0, 40);
    if (S.tab === "gobernanza") renderBitacora(); else S.dirty.add("gobernanza");
  }
  const filasRol = () => (S.rol.sedes ? S.datos.registros.filter((r) => S.rol.sedes.includes(r.sede)) : S.datos.registros);
  const sedesRol = () => S.rol.sedes || D.SEDES;
  const finRango = () => (S.filtros.hasta < corte ? S.filtros.hasta : corte);
  const mesesRango = () => U.meses(S.filtros.desde, finRango());
  const sum = (arr, key) => arr.reduce((a, r) => a + (r[key] || 0), 0);

  function contar(el, valor, formato) {
    if (!el) return;
    if (reducido || valor == null || !Number.isFinite(valor)) { el.textContent = valor == null ? "—" : formato(valor); return; }
    const t0 = performance.now(), dur = 800;
    const paso = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = formato(valor * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }
  function chart(id, opcion) {
    const el = $(id);
    if (!el) return null;
    let c = S.charts[id];
    if (!c) { c = echarts.init(el, null, { renderer: "canvas" }); S.charts[id] = c; }
    c.setOption(opcion, true);
    return c;
  }
  function sparkline(valores, color, { cls = "", fill = true, w = 120, h = 30 } = {}) {
    const nums = valores.filter((x) => x != null);
    if (nums.length < 2) return `<svg class="${cls}" viewBox="0 0 ${w} ${h}"></svg>`;
    const mn = Math.min(...nums), mx = Math.max(...nums);
    const pts = valores.map((x, i) => (x == null ? null : [(i / (valores.length - 1)) * w, h - 3 - ((x - mn) / (mx - mn || 1)) * (h - 6)])).filter(Boolean);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${fill ? `<path d="${d}L${pts[pts.length - 1][0]},${h}L${pts[0][0]},${h}Z" fill="${color}" opacity=".12"/>` : ""}<path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }
  function deltaTxt(actual, anterior, tipo) {
    if (anterior == null || actual == null) return { txt: "sin base comparable", cls: "is-flat" };
    let d, txt;
    if (tipo === "pts") { d = actual - anterior; txt = `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`; }
    else if (tipo === "ratio") { d = (actual - anterior) * 100; txt = `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`; }
    else { if (!anterior) return { txt: "nuevo", cls: "is-flat" }; d = (actual / anterior - 1) * 100; txt = `${d >= 0 ? "+" : ""}${d.toFixed(1)} %`; }
    return { txt, cls: Math.abs(d) < .05 ? "is-flat" : d > 0 ? "is-up" : "is-down", d };
  }
  function stats(id, items) {
    $(id).innerHTML = items.map((x) => `<div class="stat"><span>${x.label}</span><strong data-v>${x.v}</strong><em class="${x.cls || ""}">${x.note || ""}</em></div>`).join("");
  }

  /* ---------- Datos personales ---------- */
  function mostrarPII(r, campo) {
    const valor = r[campo] || "";
    if (r.tipo_cliente === "Corporativo" && campo !== "telefono") return { txt: valor, cls: "" };
    if (S.rol.pii === "oculto") return { txt: "Restringido", cls: "masked" };
    if (S.rol.pii === "ver" && S.piiVisible) return { txt: valor, cls: "revealed" };
    if (!valor) return { txt: "— falta", cls: "masked" };
    if (campo === "cliente") return { txt: valor.split(" ").map((p) => p.slice(0, 2) + "•••").join(" "), cls: "masked" };
    if (campo === "documento") return { txt: valor.startsWith("CE") ? `CE•••${valor.slice(-3)}` : `••••${valor.slice(-4)}`, cls: "masked" };
    if (campo === "telefono") return { txt: `${valor[0]}•• ••• ${valor.slice(-3)}`, cls: "masked" };
    return { txt: valor, cls: "" };
  }

  /* ---------- Contexto calculado una vez por cambio de filtros ---------- */
  function calcular() {
    const todas = filasRol(), f = S.filtros, mm = mesesRango();
    const k = D.kpis(todas, f);
    const serie = D.serieMensual(todas, f, mm);
    const porSede = {};
    D.SEDES.forEach((s) => {
      if (!sedesRol().includes(s)) return;
      const fs = { ...f, sedes: [s] };
      const kk = D.kpis(todas, fs);
      porSede[s] = { ...kk.actual, anterior: kk.anterior, n: kk.filas.length, serie: D.serieMensual(todas, fs, mm).map((x) => x.facturacion) };
    });
    const hallazgos = D.hallazgos(todas, f, S.datos.calidad);
    const conDeuda = D.filtrar(todas, { ...f, desde: D.INICIO_DATOS, hasta: corte });
    S.ctx = { todas, f, mm, k, serie, porSede, hallazgos, conDeuda, vencidos: D.vencido(conDeuda), porVencer: D.porVencerMembresias(todas, f), prono: D.pronostico(todas, f) };
  }

  /* ---------- Cabecera, pestañas y filtros ---------- */
  function renderPestanas() {
    const c = S.ctx, pend = c.hallazgos.filter((h) => !S.insights[h.id]).length;
    const badge = {
      cobranza: c.vencidos.length ? { n: c.vencidos.length, alert: c.hallazgos.some((h) => h.id.startsWith("cob-")) } : null,
      socios: c.porVencer.length ? { n: c.porVencer.length } : null,
      gobernanza: S.datos.calidad.afectados ? { n: S.datos.calidad.afectados, alert: true } : null,
      ia: pend ? { n: pend, alert: c.hallazgos.some((h) => h.sev === "alta" && !S.insights[h.id]) } : null,
    };
    $("tabs").innerHTML = TABS.map((t, i) => {
      const b = badge[t.id];
      return `<button class="tab" role="tab" id="tab-${t.id}" aria-controls="v-${t.id}" aria-selected="${S.tab === t.id}" data-tab="${t.id}" title="Atajo: tecla ${i + 1}">${ic(`t-${t.id}`)}${t.nombre}${b ? `<span class="tab__badge ${b.alert ? "is-alert" : ""}">${b.n}</span>` : ""}</button>`;
    }).join("");
  }
  function renderFiltros() {
    const f = S.filtros, perm = sedesRol(), todas = perm.every((s) => f.sedes.includes(s));
    $("f-sedes").innerHTML = `<button class="stab ${todas ? "is-on" : ""}" data-sede="*" type="button">Todas</button>` + D.SEDES.map((s) => {
      const ok = perm.includes(s);
      return `<button class="stab ${!todas && f.sedes.includes(s) ? "is-on" : ""}" data-sede="${s}" type="button" ${ok ? "" : 'disabled title="Tu rol no tiene acceso a esta sede"'}>${ok ? `<i style="background:${G.SEDE[s]}"></i>` : ic("i-lock", "ic ic--sm")}${s}</button>`;
    }).join("");
    $("f-periodo").innerHTML = PERIODOS.map((p) => `<button type="button" class="${f.periodo === p.id ? "is-on" : ""}" data-periodo="${p.id}">${p.nombre}</button>`).join("");
    $("f-servicio").innerHTML = `<option value="Todos">Todos los servicios</option>` + D.SERVICIOS.map((s) => `<option ${f.servicio === s ? "selected" : ""}>${s}</option>`).join("");
    $("f-cliente").innerHTML = `<option value="Todos">Todos los clientes</option>` + D.TIPOS_CLIENTE.map((s) => `<option value="${s}" ${f.cliente === s ? "selected" : ""}>${s === "Socio" ? "Socios" : s === "Visitante" ? "Visitantes" : "Corporativos"}</option>`).join("");
    $("f-resumen").innerHTML = `<b>${fmt.num(S.ctx.k.filas.length)}</b> registros · ${fmt.fechaCorta(f.desde)} al ${fmt.fecha(finRango())}${S.ctx.k.anterior ? " · vs. mismo periodo del año anterior" : ""}`;
  }
  function renderKPIs() {
    const { k, serie } = S.ctx, a = k.actual, b = k.anterior;
    const defs = [
      { id: "facturacion", label: "Facturación", v: a.facturacion, f: (x) => fmt.soles(x), d: deltaTxt(a.facturacion, b?.facturacion), s: serie.map((x) => x.facturacion), tab: "dinero" },
      { id: "cobranza", label: "Cobranza", v: a.cobranza == null ? null : a.cobranza * 100, f: (x) => `${x.toFixed(1)} %`, d: deltaTxt(a.cobranza, b?.cobranza, "ratio"), s: serie.map((x) => x.cobranza), tab: "cobranza" },
      { id: "socios", label: "Socios activos", v: a.socios, f: fmt.num, d: deltaTxt(a.socios, b?.socios), s: serie.map((x) => x.socios), tab: "socios" },
      { id: "reservas", label: "Reservas", v: a.reservas, f: fmt.num, d: deltaTxt(a.reservas, b?.reservas), s: serie.map((x) => x.reservas), tab: "turistas" },
      { id: "ocupacion", label: "Ocupación media", v: a.ocupacion, f: (x) => `${x.toFixed(1)} %`, d: deltaTxt(a.ocupacion, b?.ocupacion, "pts"), s: serie.map((x) => x.ocupacion), tab: "turistas" },
      { id: "nps", label: "Recomendación (NPS)", v: a.nps, f: (x) => Math.round(x).toString(), d: deltaTxt(a.nps, b?.nps, "pts"), s: serie.map((x) => x.nps), tab: "turistas" },
    ];
    $("kpis").innerHTML = defs.map((x) => `<button class="kpi" type="button" data-tab-link="${x.tab}" aria-label="${x.label}: ver detalle"><span class="kpi__label">${x.label}</span><span class="kpi__value" data-kpi="${x.id}">—</span><span class="kpi__delta ${x.d.cls === "is-down" ? "is-down" : x.d.cls === "is-flat" ? "is-flat" : ""}">${x.d.txt}</span>${sparkline(x.s, "#FFFFFF", { fill: false })}</button>`).join("");
    defs.forEach((x) => contar(document.querySelector(`[data-kpi="${x.id}"]`), x.v, x.f));
  }

  /* ---------- Pestaña: Resumen ---------- */
  function estadoSede(s, st) {
    const ap = S.datos.sedes.find((x) => x.sede === s)?.apertura;
    if (ap && U.diffDays(corte, ap) < 365) return { txt: "Sede nueva", cls: "is-new" };
    if (S.ctx.hallazgos.some((h) => h.id === `cob-${s}`)) return { txt: "Cobranza baja", cls: "is-alert" };
    if (S.ctx.hallazgos.some((h) => h.id === `nps-${s}`)) return { txt: "Revisar experiencia", cls: "is-alert" };
    if (st.cobranza != null && st.cobranza >= .95) return { txt: "Caja sana", cls: "is-good" };
    return { txt: "Estable", cls: "" };
  }
  function tabResumen() {
    const c = S.ctx, f = S.filtros, todas = sedesRol().every((s) => f.sedes.includes(s));
    $("postales").innerHTML = D.SEDES.map((s) => {
      const st = c.porSede[s];
      if (!st) return `<button class="postal" type="button" disabled style="--c:${G.SEDE[s]}" title="Tu rol no tiene acceso a esta sede"><div class="postal__scene"><svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMax slice"><use href="#ilu-${s}"/></svg><span class="postal__state">${ic("i-lock", "ic ic--sm")} Sin acceso</span></div><div class="postal__body"><h3>${s}</h3></div></button>`;
      const e = estadoSede(s, st), d = deltaTxt(st.facturacion, st.anterior?.facturacion);
      const on = !todas && f.sedes.includes(s), dim = !todas && !f.sedes.includes(s);
      return `<button class="postal ${on ? "is-on" : ""} ${dim ? "is-dim" : ""}" type="button" data-postal="${s}" style="--c:${G.SEDE[s]}" aria-pressed="${on}">
        <div class="postal__scene"><svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMax slice"><use href="#ilu-${s}"/></svg><span class="postal__state ${e.cls}">${e.txt}</span></div>
        <div class="postal__body">
          <h3>${s} <small>${LUGAR[s]}</small></h3>
          <div class="postal__money">${fmt.soles(st.facturacion)}<em class="${d.cls === "is-down" ? "is-down" : d.cls === "is-flat" ? "is-flat" : ""}">${d.txt}</em></div>
          ${sparkline(st.serie, G.SEDE[s], { cls: "postal__spark" })}
          <dl class="postal__stats"><div><dt>Cobranza</dt><dd class="${st.cobranza != null && st.cobranza < .9 ? "is-bad" : ""}">${fmt.pct(st.cobranza, 0)}</dd></div><div><dt>NPS</dt><dd class="${st.nps != null && st.nps < 35 ? "is-bad" : ""}">${st.nps == null ? "—" : Math.round(st.nps)}</dd></div><div><dt>Ocupación</dt><dd>${st.ocupacion == null ? "—" : Math.round(st.ocupacion) + " %"}</dd></div></dl>
          <span class="postal__cta">${on ? "Quitar filtro" : "Ver solo " + s} →</span>
        </div></button>`;
    }).join("");
    chart("ch-resumen", G.ingresos({ meses: c.mm, serie: c.serie, metas: {}, prono: null, compacto: true }));
    const sevC = { alta: C.red, media: C.orange, oportunidad: C.greenD };
    $("hoy").innerHTML = c.hallazgos.slice(0, 4).map((h) => `<li><i style="background:${sevC[h.sev]}"></i><div><b>${esc(h.titulo)}</b><small>${esc(h.accion)}</small></div></li>`).join("") || `<li class="empty">Nada urgente con estos filtros.</li>`;
  }

  /* ---------- Pestaña: Dinero ---------- */
  function metasPorMes(f) {
    const diasMes = +U.finDeMes(corte.slice(0, 7)).slice(8), factor = +corte.slice(8) / diasMes;
    const m = D.metaPeriodo(S.datos.metas, f, S.ctx.mm);
    if (m[corte.slice(0, 7)]) m[corte.slice(0, 7)] *= factor;
    return m;
  }
  function tabDinero() {
    const c = S.ctx, f = S.filtros, a = c.k.actual, b = c.k.anterior;
    const dF = deltaTxt(a.facturacion, b?.facturacion), dC = deltaTxt(a.cobranza, b?.cobranza, "ratio");
    $("h-dinero").innerHTML = !b ? "Lo vendido, lo cobrado y lo que viene" : dF.d > 0 && dC.d < 0 ? "Vendemos más, pero <span>cobramos menos</span>" : dF.d > 0 ? "Vendemos más y <span>cobramos mejor</span>" : "Las ventas <span>bajan</span> frente al año anterior";
    const p = c.prono.futuros[0];
    stats("s-dinero", [
      { label: "Facturación", v: fmt.soles(a.facturacion), note: dF.txt, cls: dF.cls },
      { label: "Cobrado", v: fmt.soles(a.cobrado), note: `${fmt.pct(a.cobranza)} de lo facturado`, cls: "" },
      { label: "Ticket promedio", v: fmt.soles(a.ticket), note: "por reserva", cls: "" },
      { label: `Pronóstico ${fmt.mes(p.mes)}`, v: fmt.soles(p.valor), note: `± ${Math.round(c.prono.banda * 100)} % · modelo explicable`, cls: "" },
    ]);
    const sinLinea = f.servicio === "Todos" && f.cliente === "Todos";
    const prono = finRango().slice(0, 7) === corte.slice(0, 7) ? c.prono : null;
    chart("ch-ingresos", G.ingresos({ meses: c.mm, serie: c.serie, metas: sinLinea ? metasPorMes(f) : {}, prono }));
    const sedesInfo = S.datos.sedes.filter((s) => sedesRol().includes(s.sede));
    const mapa = chart("ch-mapa", G.mapa({ geo: S.datos.geo, sedes: sedesInfo, valores: c.porSede, activas: f.sedes }));
    if (mapa && !mapa.__click) { mapa.on("click", (e) => { if (e.seriesType === "scatter" && sedesRol().includes(e.name)) alternarSede(e.name); }); mapa.__click = true; }
    chart("ch-servicios", G.servicios({ datos: D.agrupar(c.k.filas, "servicio"), total: a.facturacion }));
    const filasMeta = D.filtrar(c.todas, { ...f, servicio: "Todos", cliente: "Todos" });
    const items = f.sedes.map((s) => {
      const meta = Object.values(metasPorMes({ ...f, sedes: [s] })).reduce((x, y) => x + y, 0);
      return { sede: s, real: sum(filasMeta.filter((r) => r.sede === s), "monto_total"), meta };
    }).filter((x) => x.meta > 0);
    chart("ch-metas", G.metas({ items }));
  }

  /* ---------- Pestaña: Cobranza ---------- */
  function tabCobranza() {
    const c = S.ctx, f = S.filtros, a = c.k.actual, b = c.k.anterior;
    const porSede = D.agrupar(c.vencidos, "sede", "saldo_pendiente"), top = Object.entries(porSede).sort((x, y) => y[1] - x[1])[0];
    const totV = sum(c.vencidos, "saldo_pendiente");
    $("h-cobranza").innerHTML = top && totV > 0 ? `${top[0]} concentra el <span>${Math.round((top[1] / totV) * 100)} %</span> de la deuda vencida` : "La cartera está <span>al día</span>";
    const dC = deltaTxt(a.cobranza, b?.cobranza, "ratio");
    stats("s-cobranza", [
      { label: "Cobranza del periodo", v: fmt.pct(a.cobranza), note: dC.txt, cls: dC.cls },
      { label: "Por cobrar", v: fmt.soles(sum(c.conDeuda, "saldo_pendiente")), note: "saldo total pendiente" },
      { label: "Vencido", v: fmt.soles(totV), note: "ya pasó la fecha de pago", cls: totV > 0 ? "is-down" : "" },
      { label: "Operaciones vencidas", v: fmt.num(c.vencidos.length), note: `${new Set(c.vencidos.map((r) => r.id_cliente)).size} clientes` },
    ]);
    chart("ch-aging", G.antiguedad({ ...D.antiguedad(c.conDeuda), sedes: f.sedes }));
    const lst = [...c.vencidos].sort((x, y) => y.saldo_pendiente - x.saldo_pendiente).slice(0, 6);
    $("lista-deuda").innerHTML = lst.length ? lst.map((r) => { const n = mostrarPII(r, "cliente"); return `<li title="${esc(r.servicio)}"><div><b class="${n.cls}">${esc(n.txt)}</b><small>${esc(r.sede)} · ${U.diffDays(corte, r.fecha_vencimiento)} días de atraso</small></div><span>${fmt.soles(r.saldo_pendiente)}</span></li>`; }).join("") : `<li class="empty">Sin deuda vencida.</li>`;
    chart("ch-metodos", G.metodos({ datos: D.agrupar(c.k.filas, "metodo_pago", "monto_pagado") }));
    const ok = c.vencidos.filter((r) => r.consentimiento_datos === "Sí"), ex = c.vencidos.length - ok.length, ej = ok[0];
    const nombre = ej ? (S.rol.pii === "ver" && S.piiVisible ? ej.cliente.split(" ")[0] : "{nombre}") : "{nombre}";
    $("wa").innerHTML = `<div class="wa__nums"><div><strong>${ok.length}</strong><span>recordatorios listos para enviar</span></div><div class="is-off"><strong>${ex}</strong><span>excluidos por no tener consentimiento</span></div></div>
      <div><div class="wa__msg"><small>Vista previa · WhatsApp Business</small>Hola ${esc(nombre)}, te saludamos de Club El Tumi ${esc(ej ? ej.sede : "{sede}")}. Tienes un saldo pendiente de <b>${ej ? fmt.soles(ej.saldo_pendiente, false) : "{monto}"}</b>. Puedes pagarlo por Yape, transferencia o en recepción. Si ya lo hiciste, ignora este mensaje.</div>
      <p class="wa__rules">Plantilla aprobada por Legal · máximo 2 envíos por cliente al mes · opción de baja en cada mensaje.</p>
      <button class="btn btn--primary" type="button" id="wa-enviar" ${S.auto.cobranza && ok.length ? "" : "disabled"}>${ic("i-send")} Programar recordatorios</button></div>`;
  }

  /* ---------- Pestaña: Socios ---------- */
  function tabSocios() {
    const c = S.ctx, a = c.k.actual, b = c.k.anterior;
    const dS = deltaTxt(a.socios, b?.socios);
    $("h-socios").innerHTML = dS.d != null ? `Los socios ${dS.d >= 0 ? "crecen" : "bajan"} <span>${dS.txt}</span> frente al año anterior` : "La membresía, el ingreso más estable";
    const renov = c.k.filas.filter((r) => r.tipo_operacion === "Renovación de socio").length;
    stats("s-socios", [
      { label: "Socios activos", v: fmt.num(a.socios), note: dS.txt, cls: dS.cls },
      { label: "Altas en el periodo", v: fmt.num(a.altas), note: "nuevos socios" },
      { label: "Renovaciones", v: fmt.num(renov), note: "socios que siguieron" },
      { label: "Vencen en 60 días", v: fmt.num(c.porVencer.length), note: fmt.soles(sum(c.porVencer, "monto_total") * .9) + " por renovar", cls: c.porVencer.length ? "is-down" : "" },
    ]);
    chart("ch-socios", G.socios({ meses: c.mm, serie: c.serie }));
    chart("ch-planes", G.planes({ datos: D.agrupar(c.k.filas.filter((r) => r.esMembresia), "plan_membresia", () => 1) }));
    const filas = [...c.porVencer].sort((x, y) => x.fecha_registro.localeCompare(y.fecha_registro));
    $("vencen-nota").textContent = `${filas.filter((r) => r.consentimiento_datos === "Sí").length} de ${filas.length} se pueden contactar`;
    $("tabla-vencen").querySelector("tbody").innerHTML = filas.slice(0, 12).map((r) => {
      const vence = U.addDays(r.fecha_registro, 365), n = mostrarPII(r, "cliente");
      const cons = r.consentimiento_datos === "Sí" ? '<span class="pill pill--ok">Sí</span>' : '<span class="pill pill--no">No</span>';
      return `<tr><td class="${n.cls}">${esc(n.txt)}</td><td>${esc(r.sede)}</td><td>${esc(r.plan_membresia)}</td><td>${fmt.fecha(vence)}</td><td class="num">${U.diffDays(vence, corte)}</td><td class="num">${fmt.soles(r.monto_total * .9, false)}</td><td>${cons}</td></tr>`;
    }).join("") || `<tr><td colspan="7" class="empty">Ninguna membresía vence en los próximos 60 días.</td></tr>`;
  }

  /* ---------- Pestaña: Temporadas y turistas ---------- */
  function tabTuristas() {
    const c = S.ctx, f = S.filtros, a = c.k.actual, b = c.k.anterior;
    const reservas = c.k.filas.filter(U.esReserva);
    const finde = reservas.length ? reservas.filter((r) => [0, 6].includes(new Date(r.fecha_visita + "T12:00:00Z").getUTCDay())).length / reservas.length : 0;
    const fuera = reservas.length ? reservas.filter((r) => r.origen !== "Misma ciudad").length / reservas.length : 0;
    $("h-turistas").innerHTML = reservas.length ? `El <span>${Math.round(fuera * 100)} %</span> de nuestros visitantes viene de fuera de la ciudad` : "Las temporadas mandan, los turistas deciden";
    const dR = deltaTxt(a.reservas, b?.reservas), dN = deltaTxt(a.nps, b?.nps, "pts");
    stats("s-turistas", [
      { label: "Reservas", v: fmt.num(a.reservas), note: dR.txt, cls: dR.cls },
      { label: "Visitas en fin de semana", v: fmt.pct(finde, 0), note: "sábados y domingos" },
      { label: "Ocupación media", v: a.ocupacion == null ? "—" : `${a.ocupacion.toFixed(1)} %`, note: "en días de visita" },
      { label: "Recomendación (NPS)", v: a.nps == null ? "—" : Math.round(a.nps), note: dN.txt, cls: dN.cls },
    ]);
    const conteos = {};
    D.filtrar(c.todas, f, { conFecha: false }).forEach((r) => { if (U.esReserva(r) && r.fecha_visita >= f.desde && r.fecha_visita <= f.hasta) conteos[r.fecha_visita] = (conteos[r.fecha_visita] || 0) + 1; });
    const anios = [2025, 2026].filter((y) => f.desde <= `${y}-12-31` && f.hasta >= `${y}-01-01`);
    const el = $("ch-calendario"), vertical = el.clientWidth < 600;
    const alto = vertical ? 600 : anios.length > 1 ? 300 : 210;
    if (el.style.height !== `${alto}px`) { el.style.height = `${alto}px`; S.charts["ch-calendario"]?.resize(); }
    chart("ch-calendario", G.calendario({ conteos, anios, vertical, rango: [f.desde, f.hasta] }));
    $("ch-canales").style.height = vertical ? "280px" : `${alto}px`; S.charts["ch-canales"]?.resize();
    chart("ch-canales", G.canales({ datos: D.agrupar(reservas, "canal", () => 1) }));
    const links = {};
    reservas.forEach((r) => { links[`${r.origen}|${r.sede}`] = (links[`${r.origen}|${r.sede}`] || 0) + r.personas; links[`${r.sede}|${r.servicio}`] = (links[`${r.sede}|${r.servicio}`] || 0) + r.personas; });
    chart("ch-sankey", G.sankey({ links: Object.entries(links).map(([key, v]) => { const [source, target] = key.split("|"); return { source, target, value: v }; }) }));
    chart("ch-nps", G.npsSedes({ items: f.sedes.map((s) => ({ sede: s, ...D.nps(c.k.filas.filter((r) => r.sede === s)) })) }));
    chart("ch-occ-nps", G.ocupacionNps({ bandas: ["< 50 %", "50–70 %", "70–85 %", "> 85 %"].map((bd) => { const n = D.nps(c.k.filas.filter((r) => r.calificacion_nps != null && D.bandaOcupacion(r.ocupacion_sede_pct) === bd)); return { banda: bd, nps: n.valor ?? 0, n: n.n }; }) }));
    const celdas = [];
    f.sedes.forEach((s, si) => c.mm.forEach((m, mi) => { const v = c.k.filas.filter((r) => r.sede === s && !r.esMembresia && r.fecha_visita.slice(0, 7) === m); if (v.length) celdas.push([mi, si, sum(v, "ocupacion_sede_pct") / v.length]); }));
    chart("ch-occ-heat", G.ocupacionHeat({ meses: c.mm, sedes: f.sedes, celdas }));
  }

  /* ---------- Pestaña: Cara a cara ---------- */
  function ladoSede(s, st) {
    const info = S.datos.sedes.find((x) => x.sede === s) || {};
    return `<div class="postal__scene" style="--c:${G.SEDE[s]}"><svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMax slice"><use href="#ilu-${s}"/></svg></div><h3>${s}</h3><p>${LUGAR[s]}</p><p>${info.habitaciones || "—"} habitaciones · ${info.parcelas_camping || "—"} parcelas</p><strong>${fmt.soles(st.facturacion)} en el periodo</strong>`;
  }
  function tabCara() {
    const c = S.ctx, perm = sedesRol();
    if (!perm.includes(S.cmp.a)) S.cmp.a = perm[0];
    if (!perm.includes(S.cmp.b) || S.cmp.b === S.cmp.a) S.cmp.b = perm.find((s) => s !== S.cmp.a) || S.cmp.a;
    const opts = (sel) => perm.map((s) => `<option ${s === sel ? "selected" : ""}>${s}</option>`).join("");
    $("cmp-a").innerHTML = opts(S.cmp.a); $("cmp-b").innerHTML = opts(S.cmp.b);
    $("cmp-nota").textContent = perm.length < 2 ? "Tu rol solo tiene acceso a una sede." : "La barra más intensa marca a la sede que gana en cada dimensión.";
    const { a, b } = S.cmp, sa = c.porSede[a], sb = c.porSede[b];
    $("h-cara").innerHTML = `${a} frente a <span>${b}</span>`;
    $("cara-a").innerHTML = ladoSede(a, sa); $("cara-b").innerHTML = ladoSede(b, sb);
    chart("ch-cara", G.cara({ a, b, sa, sb, ancho: $("ch-cara").clientWidth }));
    chart("ch-cara-linea", G.caraLinea({ meses: c.mm, a, b, va: sa.serie.map(Math.round), vb: sb.serie.map(Math.round) }));
  }

  /* ---------- Pestaña: Detalle (tabla dinámica) ---------- */
  function agregarFilas(rows, dim) {
    const g = {};
    rows.forEach((r) => { (g[r[dim]] = g[r[dim]] || []).push(r); });
    const mm = S.ctx.mm, tot = sum(rows, "monto_total") || 1;
    return Object.entries(g).map(([nombre, rs]) => {
      const fact = sum(rs, "monto_total"), res = rs.filter(U.esReserva), n = D.nps(rs);
      const porMes = Object.fromEntries(mm.map((m) => [m, 0])); rs.forEach((r) => { if (r.mes in porMes) porMes[r.mes] += r.monto_total; });
      return { nombre, rs, facturacion: fact, part: fact / tot, cobranza: fact ? sum(rs, "monto_pagado") / fact : null, reservas: res.length, ticket: res.length ? sum(res, "monto_total") / res.length : null, nps: n.valor, serie: mm.map((m) => porMes[m]) };
    });
  }
  function tabDetalle() {
    const d = S.det, c = S.ctx;
    $("det-agrupar").innerHTML = Object.entries(DIMS).map(([key, n]) => `<button type="button" class="${d.por === key ? "is-on" : ""}" data-agrupar="${key}">${n}</button>`).join("");
    const sec = d.por === "sede" ? "servicio" : "sede";
    const q = d.q.trim().toLowerCase();
    let grupos = agregarFilas(c.k.filas, d.por);
    grupos.forEach((g) => { g.subs = agregarFilas(g.rs, sec).sort((x, y) => y.facturacion - x.facturacion); g.subs.forEach((s) => { s.part = s.facturacion / (g.facturacion || 1); }); });
    if (q) grupos = grupos.filter((g) => g.nombre.toLowerCase().includes(q) || g.subs.some((s) => s.nombre.toLowerCase().includes(q)));
    grupos.sort((x, y) => { const vx = d.key === "nombre" ? x.nombre : x[d.key] ?? -1e9, vy = d.key === "nombre" ? y.nombre : y[d.key] ?? -1e9; return (vx > vy ? 1 : vx < vy ? -1 : 0) * (d.asc ? 1 : -1); });
    const cols = [["nombre", DIMS[d.por], ""], ["facturacion", "Facturado", "num"], ["part", "Participación", ""], ["cobranza", "Cobranza", "num"], ["reservas", "Reservas", "num"], ["ticket", "Ticket", "num"], [null, "Tendencia", ""], ["nps", "NPS", "num"]];
    const t = $("tabla-detalle");
    t.querySelector("thead").innerHTML = `<tr>${cols.map(([key, n, cl]) => `<th class="${cl} ${key && d.key === key ? `is-sorted ${d.asc ? "is-asc" : ""}` : ""}" ${key ? `data-sort="${key}"` : ""}>${n}</th>`).join("")}</tr>`;
    const color = (nombre) => G.SEDE[nombre] || G.SERVICIO[nombre] || C.blue;
    const fila = (g, cls, max) => `<tr class="${cls}" ${cls.includes("grp") ? `data-grupo="${esc(g.nombre)}"` : ""}><td>${esc(g.nombre)}</td><td class="num">${fmt.soles(g.facturacion)}</td><td><span class="bar" style="width:${Math.max(2, g.part * max)}px;background:${color(g.nombre)}"></span>${Math.round(g.part * 100)} %</td><td class="num" style="${g.cobranza != null && g.cobranza < .88 ? `color:${C.red};font-weight:700` : ""}">${fmt.pct(g.cobranza)}</td><td class="num">${fmt.num(g.reservas)}</td><td class="num">${fmt.soles(g.ticket)}</td><td>${sparkline(g.serie, color(g.nombre), { cls: "spark", fill: false, w: 96, h: 24 })}</td><td class="num">${g.nps == null ? "—" : Math.round(g.nps)}</td></tr>`;
    t.querySelector("tbody").innerHTML = grupos.map((g) => { const open = d.abiertos.has(g.nombre) || (q && g.subs.some((s) => s.nombre.toLowerCase().includes(q))); return fila(g, `grp ${open ? "is-open" : ""}`, 160) + (open ? g.subs.filter((s) => !q || s.nombre.toLowerCase().includes(q) || g.nombre.toLowerCase().includes(q)).map((s) => fila(s, "sub", 90)).join("") : ""); }).join("") || `<tr><td colspan="8" class="empty">Sin resultados para «${esc(d.q)}».</td></tr>`;
    const a = c.k.actual;
    t.querySelector("tfoot").innerHTML = `<tr><td>Total</td><td class="num">${fmt.soles(a.facturacion)}</td><td>100 %</td><td class="num">${fmt.pct(a.cobranza)}</td><td class="num">${fmt.num(a.reservas)}</td><td class="num">${fmt.soles(a.ticket)}</td><td></td><td class="num">${a.nps == null ? "—" : Math.round(a.nps)}</td></tr>`;
  }
  function exportarDetalle() {
    const g = agregarFilas(S.ctx.k.filas, S.det.por);
    const csv = "﻿" + [[DIMS[S.det.por], "facturado", "participacion", "cobranza", "reservas", "ticket", "nps"].join(","), ...g.map((x) => [x.nombre, x.facturacion.toFixed(2), (x.part * 100).toFixed(1), x.cobranza == null ? "" : (x.cobranza * 100).toFixed(1), x.reservas, x.ticket == null ? "" : x.ticket.toFixed(2), x.nps == null ? "" : Math.round(x.nps)].join(","))].join("\n");
    descargar(csv, `club-el-tumi_detalle_por_${S.det.por}.csv`);
    TumiSound.play("exito");
    auditar(`Exportación de la tabla por ${DIMS[S.det.por].toLowerCase()}`);
  }

  /* ---------- Pestaña: Gobernanza ---------- */
  function tabGobernanza() {
    const q = S.datos.calidad, filas = S.ctx.k.filas;
    $("calidad-sub").textContent = `${fmt.num(q.total)} registros × 31 campos = ${fmt.num(q.celdas)} datos evaluados`;
    chart("ch-calidad", G.calidad({ dims: q.dims, indice: q.indice }));
    $("dims").innerHTML = q.dims.map((d) => `<div class="dim"><b>${d.nombre}</b><span>${(d.valor * 100).toFixed(2)} %</span><i style="--w:${Math.max(0, (d.valor - .98) / .02) * 100}%"></i></div>`).join("");
    $("reglas-badge").textContent = q.afectados ? `${q.afectados} registros por revisar` : "Todo en orden";
    $("reglas").innerHTML = q.reglas.map((r) => {
      const ok = !r.fallas.length;
      return `<li class="rule"><span class="rule__ic ${ok ? "is-ok" : "is-warn"}">${ok ? "✓" : r.autocorrige ? "↻" : "!"}</span><span>${r.nombre}${r.autocorrige ? " (autocorregida)" : ""}</span><span><b class="${ok ? "" : "rule__ic is-warn"}">${r.fallas.length}</b>${ok ? "" : `<button type="button" data-regla="${r.id}">Ver</button>`}</span></li>`;
    }).join("");
    const total = filas.length, cons = filas.filter((r) => r.consentimiento_datos === "Sí").length;
    $("pii-stats").innerHTML = `<span><b>${total ? ((cons / total) * 100).toFixed(1) : 0} %</b>con consentimiento</span><span><b>4</b>campos sensibles</span><span><b>${S.rol.pii === "ver" ? (S.piiVisible ? "Visibles" : "Enmascarados") : S.rol.pii === "oculto" ? "Ocultos" : "Enmascarados"}</b>para tu rol</span><span><b>30 s</b>máximo visibles</span>`;
    const btn = $("btn-pii");
    btn.disabled = S.rol.pii !== "ver";
    btn.innerHTML = S.rol.pii !== "ver" ? `${ic("i-lock", "ic ic--sm")} <span>Sin permiso</span>` : S.piiVisible ? `${ic("i-eye-off", "ic ic--sm")} <span>Ocultar datos</span>` : `${ic("i-eye", "ic ic--sm")} <span>Mostrar datos</span>`;
    const ult = [...filas].sort((x, y) => (y.fecha_registro + y.id_registro).localeCompare(x.fecha_registro + x.id_registro)).slice(0, 7);
    $("pii-sub").textContent = `Últimas ${ult.length} operaciones del filtro actual · la razón social y el RUC no son datos personales`;
    $("tabla-pii").querySelector("tbody").innerHTML = ult.map((r) => {
      const n = mostrarPII(r, "cliente"), d = mostrarPII(r, "documento"), t = mostrarPII(r, "telefono");
      const cons = r.consentimiento_datos === "Sí" ? '<span class="pill pill--ok">Sí</span>' : r.consentimiento_datos === "No" ? '<span class="pill pill--no">No</span>' : '<span class="pill pill--bad">Falta</span>';
      return `<tr><td>${esc(r.id_registro)}</td><td>${fmt.fechaCorta(r.fecha_registro)}</td><td>${esc(r.sede)}</td><td class="${n.cls}">${esc(n.txt)}</td><td class="${d.cls}">${esc(d.txt)}</td><td class="${t.cls}">${esc(t.txt)}</td><td>${esc(r.servicio)}</td><td class="num">${fmt.soles(r.monto_total, false)}</td><td>${cons}</td></tr>`;
    }).join("");
    renderBitacora();
    const tag = { "Dato personal": "tag--pd", Confidencial: "tag--conf", Interno: "tag--int" };
    $("tabla-dicc").querySelector("tbody").innerHTML = S.datos.diccionario.map((d) => `<tr><td>${esc(d.campo)}</td><td>${esc(d.tipo)}</td><td>${esc(d.descripcion)}</td><td>${esc(d.regla_validacion)}</td><td><span class="tag ${tag[d.sensibilidad] || "tag--int"}">${esc(d.sensibilidad)}</span></td><td>${esc(d.responsable)}</td></tr>`).join("");
  }
  function renderBitacora() {
    const hoy = new Date().toDateString();
    $("bitacora").innerHTML = S.bitacora.map((b) => `<li class="${b.tipo === "sec" ? "is-sec" : b.tipo === "warn" ? "is-warn" : ""}"><time>${b.t.toDateString() === hoy ? hora(b.t) : b.t.toLocaleDateString("es-PE", { day: "numeric", month: "short" }) + " · " + hora(b.t)} · ${esc(b.rol || "Sistema")}</time>${esc(b.texto)}</li>`).join("");
  }

  /* ---------- Pestaña: IA y automatización ---------- */
  function tabIA() {
    const lista = S.ctx.hallazgos.slice(0, 6), sev = { alta: "Prioridad alta", media: "Atención", oportunidad: "Oportunidad" };
    const pend = lista.filter((h) => !S.insights[h.id]).length;
    $("insights-count").textContent = `${lista.length} hallazgos · ${pend} por validar`;
    $("insights").innerHTML = lista.length ? lista.map((h, i) => {
      const e = S.insights[h.id];
      return `<li class="ins ins--${h.sev} ${e === "descartado" ? "is-discarded" : ""}" style="animation-delay:${i * 60}ms" data-insight="${h.id}"><i></i>
        <div><h4>${esc(h.titulo)}</h4><p>${esc(h.detalle)}</p><p class="act">→ ${esc(h.accion)}</p><details><summary>¿Cómo lo calculé?</summary><p>${esc(h.calculo)}</p></details></div>
        <div class="ins__side"><b>${sev[h.sev]}</b>confianza ${h.confianza.toLowerCase()} · n=${fmt.num(h.n)}${e ? `<span class="ins__state">${e === "validado" ? "✓ Validado" : "Descartado"}</span>` : `<div class="ins__btns"><button type="button" data-accion="validado">Validar</button><button type="button" data-accion="descartado">Descartar</button></div>`}</div></li>`;
    }).join("") : `<li class="empty">Sin hallazgos relevantes para estos filtros.</li>`;
    const p = S.ctx.prono;
    const metodo = { estacional: "Un modelo por sede: mismo mes del año anterior × tendencia de 10 meses", mixto: `Un modelo por sede (mismo mes del año anterior × tendencia). ${p.sedesPromedio.join(", ")} usa el promedio de sus últimos 3 meses por tener menos de un año de historia`, promedio: "Promedio de los últimos 3 meses (menos de 12 meses de historia)" }[p.metodo];
    $("ficha-modelo").innerHTML = `<dt>Propósito</dt><dd>Estimar la facturación de los próximos 3 meses para planificar personal, compras y metas.</dd>
      <dt>Método</dt><dd>${metodo}.</dd><dt>Datos</dt><dd>Facturación mensual agregada · ${p.historico} meses · sin datos personales.</dd>
      <dt>Error histórico</dt><dd><span class="metric">${p.mape == null ? "—" : (p.mape * 100).toFixed(1) + " %"}</span> al predecir los últimos 4 meses.</dd>
      <dt>Próximos meses</dt><dd>${p.futuros.map((x) => `${fmt.mes(x.mes)} <span class="metric">${fmt.soles(x.valor)}</span>`).join(" · ")}</dd>
      <dt>Límites</dt><dd>No anticipa eventos extraordinarios (lluvias, El Niño, feriados nuevos).</dd>`;
    renderAutomatizaciones();
  }
  function renderAutomatizaciones() {
    const v = S.ctx.vencidos, okC = new Set(v.filter((r) => r.consentimiento_datos === "Sí").map((r) => r.id_cliente)).size, cl = new Set(v.map((r) => r.id_cliente)).size;
    const items = [
      { id: "sync", color: C.blue, t: "Sincronización con Sheets", p: "Lee la hoja, valida y recalcula todo el tablero.", m: `Cada ${CFG.refrescoMinutos} min · última ${S.ultimaSync ? hora(S.ultimaSync) : "—"}`, b: "Ejecutar ahora", a: "sync" },
      { id: "calidad", color: C.green, t: "Validación de calidad", p: "Apps Script revisa 10 reglas y alerta si el índice baja de 98 %.", m: `Diario 7:00 · índice ${(S.datos.calidad.indice * 100).toFixed(1)} %`, b: "Ver reglas", a: "reglas" },
      { id: "cobranza", color: "#25A55F", t: "Cobranza por WhatsApp", p: "Recordatorio a clientes con saldo vencido, solo con consentimiento.", m: `Lun y jue 10:00 · ${okC} de ${cl} clientes habilitados`, b: "Ver mensaje", a: "whatsapp" },
      { id: "reporte", color: C.orange, t: "Reporte semanal", p: "PDF con indicadores, hallazgos y alertas para la gerencia.", m: "Lunes 8:00 · por correo", b: "Generar ahora", a: "pdf" },
    ];
    $("automatizaciones").innerHTML = items.map((x) => `<div class="auto" style="--au:${x.color}"><div class="auto__top"><h4>${x.t}</h4><label class="switch" title="Activar o pausar"><input type="checkbox" data-auto="${x.id}" ${S.auto[x.id] ? "checked" : ""} aria-label="${x.t}"><span></span></label></div><p>${x.p}</p><small>${x.m}</small><button class="lnk" type="button" data-auto-accion="${x.a}" ${S.auto[x.id] ? "" : "disabled"}>${x.b}</button></div>`).join("");
  }
  function preguntar(q) {
    const r = D.responder(filasRol(), S.filtros, q), caja = $("ask-answer");
    caja.innerHTML = `<p><span id="ask-text"></span><span class="caret"></span></p><small id="ask-pie"></small>`;
    const el = $("ask-text"); let i = 0;
    TumiSound.play("click");
    const tick = () => { i += reducido ? r.texto.length : 2; el.textContent = r.texto.slice(0, i); if (i < r.texto.length) setTimeout(tick, 14); else { caja.querySelector(".caret")?.remove(); $("ask-pie").textContent = r.pie; } };
    tick();
    auditar(`Consulta al asistente: «${D.PREGUNTAS.find((x) => x.id === q)?.texto || q.slice(0, 50)}»`);
  }

  /* ---------- Navegación entre pestañas ---------- */
  const RENDER = { resumen: tabResumen, dinero: tabDinero, cobranza: tabCobranza, socios: tabSocios, turistas: tabTuristas, cara: tabCara, detalle: tabDetalle, gobernanza: tabGobernanza, ia: tabIA };
  function pintarTab(id) {
    RENDER[id]();
    S.dirty.delete(id);
  }
  function irA(id, { scroll = true, sonido = true } = {}) {
    if (!RENDER[id]) id = "resumen";
    const cambio = id !== S.tab;
    S.tab = id;
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.dataset.view !== id; });
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.tab === id));
    $("band").classList.toggle("is-compact", id !== "resumen");
    document.body.classList.toggle("fin-oscuro", id === "gobernanza");
    if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
    requestAnimationFrame(() => {
      if (S.dirty.has(id)) pintarTab(id);
      document.querySelectorAll(`#v-${id} .chart`).forEach((el) => S.charts[el.id]?.resize());
    });
    if (cambio && sonido) TumiSound.play("filtro");
    if (cambio && scroll) {
      const dock = $("dock"), top = dock.getBoundingClientRect().top + scrollY;
      if (scrollY > top) scrollTo({ top, behavior: reducido ? "auto" : "smooth" });
    }
    document.getElementById(`tab-${id}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /* ---------- Ciclo principal ---------- */
  function actualizar() {
    calcular();
    renderFiltros();
    renderKPIs();
    renderPestanas();
    TABS.forEach((t) => S.dirty.add(t.id));
    pintarTab(S.tab);
  }
  function alternarSede(sede) {
    const perm = sedesRol(), solo = S.filtros.sedes.length === 1 && S.filtros.sedes[0] === sede;
    S.filtros.sedes = solo ? [...perm] : [sede];
    TumiSound.play("filtro");
    actualizar();
  }
  function aplicarSede(sede) {
    const perm = sedesRol();
    let sel = [...S.filtros.sedes];
    const todas = perm.every((s) => sel.includes(s));
    if (sede === "*") sel = [...perm]; else if (todas) sel = [sede]; else sel = sel.includes(sede) ? sel.filter((s) => s !== sede) : [...sel, sede];
    if (!sel.length) sel = [...perm];
    S.filtros.sedes = D.SEDES.filter((s) => sel.includes(s));
    TumiSound.play("filtro");
    actualizar();
  }
  function etiquetaFuente() {
    const F = S.datos.fuente;
    $("source-pill").classList.toggle("is-live", F === "sheets");
    $("source-label").textContent = F === "sheets" ? "Google Sheets · en vivo" : F === "respaldo" ? "Respaldo local" : "Datos de demostración";
    $("source-sync").textContent = `Sincronizado ${hora(S.ultimaSync)}${F === "sheets" && S.auto.sync ? ` · cada ${CFG.refrescoMinutos} min` : ""}`;
    $("band-sub").textContent = `${fmt.num(S.datos.registros.length)} registros · 4 sedes · ${fmt.fecha(D.INICIO_DATOS)} al ${fmt.fecha(corte)}`;
  }
  async function sincronizar(manual = false) {
    const btn = $("btn-sync");
    btn.classList.add("is-spinning");
    try {
      S.datos = await D.cargar();
      S.ultimaSync = new Date();
      etiquetaFuente();
      actualizar();
      if (manual) { TumiSound.play("exito"); toast(`Sincronización completa: ${fmt.num(S.datos.registros.length)} registros validados con 10 reglas.`, "i-refresh"); }
      auditar(`Sincronización ${S.datos.fuente === "sheets" ? "con Google Sheets" : "con datos locales"}: ${fmt.num(S.datos.registros.length)} registros`);
    } catch (e) {
      console.error(e);
      toast("No se pudieron cargar los datos. Revisa la conexión.", "i-alert");
    } finally { setTimeout(() => btn.classList.remove("is-spinning"), 600); }
  }
  function programarSync() {
    clearInterval(S.timerSync);
    if (S.auto.sync && S.datos?.fuente === "sheets") S.timerSync = setInterval(() => sincronizar(false), CFG.refrescoMinutos * 60000);
  }
  function cambiarRol(id) {
    S.rol = ROLES.find((r) => r.id === id) || ROLES[0];
    S.piiVisible = false; clearTimeout(S.piiTimer);
    S.filtros.sedes = [...sedesRol()];
    $("btn-csv").disabled = !S.rol.exporta;
    TumiSound.play("seguro");
    toast(`Vista de ${S.rol.nombre}: ${S.rol.desc}.`, "t-gobernanza");
    auditar(`Cambio de rol a ${S.rol.nombre}`, "sec");
    actualizar();
  }
  function descargar(texto, nombre) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportarCSV() {
    if (!S.rol.exporta) { toast("Tu rol no permite exportar datos.", "i-lock"); TumiSound.play("alerta"); return; }
    const filas = S.ctx.k.filas, cols = Object.keys(S.datos.registros[0]).filter((c) => !["mes", "esMembresia"].includes(c));
    const linea = (r) => cols.map((c) => { const s = String(["cliente", "documento", "telefono"].includes(c) ? mostrarPII(r, c).txt : r[c] ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",");
    descargar("﻿" + [cols.join(","), ...filas.map(linea)].join("\n"), `club-el-tumi_${S.filtros.desde}_${finRango()}.csv`);
    const masc = !(S.rol.pii === "ver" && S.piiVisible);
    TumiSound.play("exito");
    toast(`${fmt.num(filas.length)} registros exportados${masc ? " con datos personales enmascarados" : ""}.`, "i-download");
    auditar(`Exportación CSV: ${filas.length} registros${masc ? " (enmascarados)" : " (datos personales visibles)"}`, masc ? "info" : "sec");
  }
  function reportePDF() {
    auditar("Reporte PDF generado");
    TumiSound.play("click");
    TABS.forEach((t) => { if (S.dirty.has(t.id)) { document.getElementById(`v-${t.id}`).hidden = false; pintarTab(t.id); } });
    document.querySelectorAll(".view").forEach((v) => { v.hidden = false; });
    Object.values(S.charts).forEach((c) => c.resize());
    setTimeout(() => { print(); irA(S.tab, { scroll: false, sonido: false }); }, 400);
  }

  /* ---------- Eventos ---------- */
  function eventos() {
    document.addEventListener("click", (e) => {
      const t = e.target.closest("button, a[data-tab-link]");
      if (!t || t.disabled) return;
      if (t.dataset.tab) return irA(t.dataset.tab);
      if (t.dataset.tabLink) { e.preventDefault(); return irA(t.dataset.tabLink); }
      if (t.dataset.sede) return aplicarSede(t.dataset.sede);
      if (t.dataset.postal) return alternarSede(t.dataset.postal);
      if (t.dataset.periodo) { const p = PERIODOS.find((x) => x.id === t.dataset.periodo); Object.assign(S.filtros, { periodo: p.id, desde: p.desde, hasta: p.hasta }); TumiSound.play("filtro"); return actualizar(); }
      if (t.dataset.agrupar) { S.det.por = t.dataset.agrupar; S.det.abiertos.clear(); TumiSound.play("click"); return tabDetalle(); }
      if (t.dataset.regla) {
        const r = S.datos.calidad.reglas.find((x) => x.id === t.dataset.regla);
        TumiSound.play("click");
        return modal(r.nombre, `<p>${r.fallas.length} registro${r.fallas.length > 1 ? "s no cumplen" : " no cumple"} la regla «${esc(r.detalle)}». ${r.autocorrige ? "Se corrigió automáticamente y se avisó al responsable." : "Se avisó al responsable para corregirlo en Google Sheets."}</p><div class="tscroll" style="margin-top:16px"><table class="tbl"><thead><tr><th>Registro</th><th>Detalle</th><th>Registrado por</th></tr></thead><tbody>${r.fallas.map((x) => `<tr><td>${esc(x.id)}</td><td>${esc(x.nota)}</td><td>${esc(x.usuario)}</td></tr>`).join("")}</tbody></table></div>`);
      }
      if (t.dataset.accion) {
        const card = t.closest("[data-insight]"), id = card.dataset.insight;
        S.insights[id] = t.dataset.accion;
        TumiSound.play(t.dataset.accion === "validado" ? "exito" : "click");
        auditar(`Hallazgo «${card.querySelector("h4").textContent.slice(0, 50)}» ${t.dataset.accion}`, "warn");
        renderPestanas(); S.dirty.add("resumen");
        return tabIA();
      }
      if (t.dataset.autoAccion) {
        const a = t.dataset.autoAccion;
        if (a === "sync") return sincronizar(true);
        if (a === "reglas") return irA("gobernanza");
        if (a === "whatsapp") return irA("cobranza");
        if (a === "pdf") return reportePDF();
      }
      if (t.dataset.q) return preguntar(t.dataset.q);
      if (t.id === "wa-enviar") {
        const ok = S.ctx.vencidos.filter((r) => r.consentimiento_datos === "Sí").length, ex = S.ctx.vencidos.length - ok;
        TumiSound.play("exito");
        toast(`${ok} recordatorios programados (simulación). ${ex} excluido${ex === 1 ? "" : "s"} por falta de consentimiento.`, "i-send");
        return auditar(`Recordatorios de cobranza programados: ${ok} · ${ex} excluido${ex === 1 ? "" : "s"} por consentimiento`, "sec");
      }
      if (t.closest("#tabla-detalle")) return;
    });
    $("tabla-detalle").addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (th) { const key = th.dataset.sort; S.det.asc = S.det.key === key ? !S.det.asc : key === "nombre"; S.det.key = key; TumiSound.play("click"); return tabDetalle(); }
      const tr = e.target.closest("tr.grp");
      if (tr) { const g = tr.dataset.grupo; S.det.abiertos.has(g) ? S.det.abiertos.delete(g) : S.det.abiertos.add(g); TumiSound.play("toggle"); tabDetalle(); }
    });
    $("det-buscar").addEventListener("input", (e) => { S.det.q = e.target.value; tabDetalle(); });
    $("det-csv").addEventListener("click", exportarDetalle);
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "f-servicio" || t.id === "f-cliente") { S.filtros[t.id === "f-servicio" ? "servicio" : "cliente"] = t.value; TumiSound.play("filtro"); return actualizar(); }
      if (t.id === "rol") return cambiarRol(t.value);
      if (t.id === "cmp-a" || t.id === "cmp-b") {
        S.cmp[t.id === "cmp-a" ? "a" : "b"] = t.value;
        if (S.cmp.a === S.cmp.b) S.cmp[t.id === "cmp-a" ? "b" : "a"] = sedesRol().find((s) => s !== t.value) || t.value;
        TumiSound.play("filtro");
        return tabCara();
      }
      if (t.dataset.auto) {
        S.auto[t.dataset.auto] = t.checked;
        TumiSound.play("toggle");
        const n = t.getAttribute("aria-label");
        auditar(`Automatización «${n}» ${t.checked ? "activada" : "pausada"}`, "warn");
        toast(`${n}: ${t.checked ? "activada" : "pausada"}.`, "i-zap");
        if (t.dataset.auto === "sync") programarSync();
        S.dirty.add("cobranza");
        renderAutomatizaciones();
      }
    });
    document.addEventListener("mouseover", (e) => {
      const t = e.target.closest(".tab, .stab, .seg button, .btn, .ibtn, .kpi, .postal, .ins__btns button");
      if (t && t !== S.hover) { S.hover = t; TumiSound.play("hover"); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("modal").hidden) return cerrarModal();
      if (e.altKey || e.ctrlKey || e.metaKey || TumiTour.activo) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
      const n = +e.key;
      if (n >= 1 && n <= TABS.length) irA(TABS[n - 1].id);
    });
    $("btn-limpiar").addEventListener("click", () => { const p = PERIODOS[0]; S.filtros = { sedes: [...sedesRol()], desde: p.desde, hasta: p.hasta, periodo: p.id, servicio: "Todos", cliente: "Todos" }; TumiSound.play("filtro"); actualizar(); });
    $("btn-sync").addEventListener("click", () => sincronizar(true));
    $("btn-csv").addEventListener("click", exportarCSV);
    $("btn-pdf").addEventListener("click", reportePDF);
    $("btn-pii").addEventListener("click", () => {
      if (S.rol.pii !== "ver") return;
      S.piiVisible = !S.piiVisible; clearTimeout(S.piiTimer);
      TumiSound.play("seguro");
      if (S.piiVisible) {
        auditar("Datos personales visualizados · se ocultan en 30 s", "sec");
        toast("Datos personales visibles por 30 segundos. El acceso quedó en la bitácora.", "i-eye");
        S.piiTimer = setTimeout(() => { S.piiVisible = false; tabGobernanza(); S.dirty.add("cobranza"); S.dirty.add("socios"); auditar("Datos personales ocultados automáticamente"); }, 30000);
      }
      ["cobranza", "socios"].forEach((x) => S.dirty.add(x));
      tabGobernanza();
    });
    $("btn-sfx").addEventListener("click", (e) => { TumiSound.unlock(); TumiSound.setSfx(!TumiSound.sfx); e.currentTarget.setAttribute("aria-pressed", TumiSound.sfx); e.currentTarget.innerHTML = ic(TumiSound.sfx ? "i-volume" : "i-volume-x"); TumiSound.play("toggle"); });
    $("btn-music").addEventListener("click", (e) => { TumiSound.setMusic(!TumiSound.music); e.currentTarget.setAttribute("aria-pressed", TumiSound.music); toast(TumiSound.music ? "Música ambiente andina activada." : "Música ambiente en pausa.", "i-music"); });
    $("btn-tour").addEventListener("click", () => { TumiSound.unlock(); TumiTour.iniciar(); });
    $("modal-close").addEventListener("click", cerrarModal);
    $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") cerrarModal(); });
    $("ask-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("ask-input").value.trim(); if (q) preguntar(q); });
    const cerrarSplash = (conTour) => {
      TumiSound.unlock();
      $("splash").classList.add("is-hidden");
      document.body.classList.remove("is-locked");
      Object.values(S.charts).forEach((c) => c.resize());
      if (conTour) { TumiSound.setMusic(true); $("btn-music").setAttribute("aria-pressed", "true"); setTimeout(() => TumiTour.iniciar(), 650); }
      else TumiSound.play("exito");
    };
    $("btn-iniciar").addEventListener("click", () => cerrarSplash(true));
    $("btn-explorar").addEventListener("click", () => cerrarSplash(false));
    addEventListener("hashchange", () => irA(location.hash.slice(1), { scroll: false }));
    let rz;
    addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (!S.ctx) return; TABS.forEach((t) => S.dirty.add(t.id)); pintarTab(S.tab); Object.values(S.charts).forEach((c) => c.resize()); }, 250); });
  }

  async function iniciar() {
    document.body.classList.add("is-locked");
    $("autor").textContent = CFG.autor;
    $("rol").innerHTML = ROLES.map((r) => `<option value="${r.id}">${r.nombre}</option>`).join("");
    $("ask-chips").innerHTML = D.PREGUNTAS.map((p) => `<button type="button" data-q="${p.id}">${p.texto}</button>`).join("");
    $("btn-sfx").setAttribute("aria-pressed", TumiSound.sfx);
    $("btn-sfx").innerHTML = ic(TumiSound.sfx ? "i-volume" : "i-volume-x");
    const inicial = location.hash.slice(1);
    if (RENDER[inicial]) S.tab = inicial;
    eventos();
    TumiTour.init();
    await sincronizar(false);
    irA(S.tab, { scroll: false, sonido: false });
    const q = S.datos.calidad;
    S.bitacora.push(
      { t: new Date(Date.now() - 3.6e6 * 2.5), texto: "Validación diaria ejecutada por Apps Script · alerta enviada a admin.ica", tipo: "warn", rol: "Sistema" },
      { t: new Date(Date.now() - 3.6e6 * 15), texto: "admin.lim descargó el reporte semanal (datos enmascarados)", tipo: "info", rol: "Administrador · Lima" },
      { t: new Date(Date.now() - 3.6e6 * 26), texto: "Regla nueva: consentimiento obligatorio antes de campañas", tipo: "sec", rol: "Legal" },
    );
    auditar(`Validación de calidad: 10 reglas · ${q.afectados} registros con incidencias · índice ${(q.indice * 100).toFixed(1)} %`, q.afectados ? "warn" : "info");
    auditar("Sesión iniciada como Gerencia general", "sec");
    programarSync();
  }

  window.TumiApp = { irA, get tab() { return S.tab; } };
  iniciar();
})();
