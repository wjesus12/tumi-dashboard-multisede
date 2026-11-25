/* Orquestador del tablero: estado, filtros, roles, render y automatizaciones. */
(() => {
  const D = window.TumiData, G = window.TumiCharts, CFG = window.TUMI_CONFIG;
  const { fmt, C } = G;
  const U = D.util;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icono = (id, cls = "ic") => `<svg class="${cls}"><use href="#${id}"/></svg>`;
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ROLES = [
    { id: "gerencia", nombre: "Gerencia general", sedes: null, pii: "ver", exporta: true, desc: "acceso total; los datos personales se muestran solo a pedido y quedan registrados" },
    ...D.SEDES.map((s) => ({ id: `admin-${s}`, nombre: `Administrador · ${s}`, sedes: [s], pii: "mascara", exporta: true, desc: `solo ve la sede ${s} (mínimo privilegio)` })),
    { id: "analista", nombre: "Analista comercial", sedes: null, pii: "mascara", exporta: true, desc: "ve todas las sedes con datos personales enmascarados" },
    { id: "auditor", nombre: "Auditor externo", sedes: null, pii: "oculto", exporta: false, desc: "solo cifras agregadas: sin datos personales ni exportación" },
  ];
  const corte = D.corte;
  const PERIODOS = [
    { id: "2026", nombre: "2026", desde: "2026-01-01", hasta: corte },
    { id: "2025", nombre: "2025", desde: "2025-01-01", hasta: "2025-12-31" },
    { id: "todo", nombre: "Todo", desde: D.INICIO_DATOS, hasta: corte },
    { id: "90d", nombre: "Últimos 90 días", desde: U.addDays(corte, -89), hasta: corte },
    { id: "verano", nombre: "Verano 2026", desde: "2026-01-01", hasta: "2026-03-31" },
  ];

  const S = {
    datos: null, rol: ROLES[0], piiVisible: false, piiTimer: null, bitacora: [], insights: {}, charts: {},
    filtros: { sedes: [...D.SEDES], desde: PERIODOS[0].desde, hasta: PERIODOS[0].hasta, periodo: "2026", servicio: "Todos", cliente: "Todos" },
    auto: { sync: true, calidad: true, cobranza: true, reporte: true }, ultimaSync: null, timerSync: null,
  };

  /* ---------- Utilidades de interfaz ---------- */
  function toast(texto, ic = "i-check") {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `${icono(ic)}<span>${texto}</span>`;
    $("toasts").appendChild(el);
    setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 400); }, 4200);
  }
  function modal(titulo, html) {
    $("modal-title").textContent = titulo;
    $("modal-body").innerHTML = html;
    $("modal").hidden = false;
    $("modal-close").focus();
  }
  function cerrarModal() { $("modal").hidden = true; }
  function auditar(texto, tipo = "info") {
    S.bitacora.unshift({ t: new Date(), texto, tipo, rol: S.rol.nombre });
    S.bitacora = S.bitacora.slice(0, 40);
    renderBitacora();
  }
  const hora = (d) => d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const filasRol = () => (S.rol.sedes ? S.datos.registros.filter((r) => S.rol.sedes.includes(r.sede)) : S.datos.registros);
  const sedesRol = () => S.rol.sedes || D.SEDES;
  const finRango = () => (S.filtros.hasta < corte ? S.filtros.hasta : corte);
  const mesesRango = () => U.meses(S.filtros.desde, finRango());

  function contar(el, valor, formato) {
    if (reducido || valor == null || !Number.isFinite(valor)) { el.textContent = valor == null ? "—" : formato(valor); return; }
    const inicio = performance.now(), dur = 900;
    const paso = (t) => {
      const k = Math.min(1, (t - inicio) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = formato(valor * e);
      if (k < 1) requestAnimationFrame(paso);
    };
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

  /* ---------- Enmascaramiento de datos personales ---------- */
  function mostrarPII(r, campo) {
    const valor = r[campo] || "";
    if (r.tipo_cliente === "Corporativo" && campo !== "telefono") return { txt: valor, cls: "" }; // razón social y RUC no son datos personales
    if (S.rol.pii === "oculto") return { txt: "Restringido", cls: "masked" };
    if (S.rol.pii === "ver" && S.piiVisible) return { txt: valor, cls: "revealed" };
    if (!valor) return { txt: "—", cls: "masked" };
    if (campo === "cliente") return { txt: valor.split(" ").map((p) => p.slice(0, 2) + "•••").join(" "), cls: "masked" };
    if (campo === "documento") return { txt: valor.startsWith("CE") ? `CE•••${valor.slice(-3)}` : `••••${valor.slice(-4)}`, cls: "masked" };
    if (campo === "telefono") return { txt: `${valor[0]}•• ••• ${valor.slice(-3)}`, cls: "masked" };
    return { txt: valor, cls: "" };
  }

  /* ---------- Filtros ---------- */
  function renderFiltros() {
    const f = S.filtros, permitidas = sedesRol();
    const todas = permitidas.every((s) => f.sedes.includes(s));
    $("f-sedes").innerHTML =
      `<button class="chip ${todas ? "is-active" : ""}" data-sede="*" type="button">Todas</button>` +
      D.SEDES.map((s) => {
        const ok = permitidas.includes(s), on = f.sedes.includes(s) && !todas;
        return `<button class="chip ${on ? "is-active" : ""} ${ok ? "" : "is-locked"}" data-sede="${s}" type="button" ${ok ? "" : 'disabled title="Tu rol no tiene acceso a esta sede"'}>${ok ? `<span class="chip__dot" style="background:${G.SEDE[s]}"></span>` : icono("i-lock")}${s}</button>`;
      }).join("");
    $("f-periodo").innerHTML = PERIODOS.map((p) => `<button class="chip ${f.periodo === p.id ? "is-active" : ""}" data-periodo="${p.id}" type="button">${p.nombre}</button>`).join("");
    $("f-servicio").innerHTML = `<option value="Todos">Todos los servicios</option>` + D.SERVICIOS.map((s) => `<option ${f.servicio === s ? "selected" : ""}>${s}</option>`).join("");
    $("f-cliente").innerHTML = `<option value="Todos">Todos los clientes</option>` + D.TIPOS_CLIENTE.map((s) => `<option value="${s}" ${f.cliente === s ? "selected" : ""}>${s === "Socio" ? "Socios" : s === "Visitante" ? "Visitantes" : "Corporativos"}</option>`).join("");
  }

  function renderResumen(n, hayBase) {
    const f = S.filtros;
    const sedes = sedesRol().every((s) => f.sedes.includes(s)) ? (S.rol.sedes ? S.rol.sedes.join(", ") : "las 4 sedes") : f.sedes.join(", ");
    const extra = [f.servicio !== "Todos" ? f.servicio : null, f.cliente !== "Todos" ? `clientes ${f.cliente.toLowerCase()}s` : null].filter(Boolean).join(" · ");
    $("f-resumen").innerHTML = `Mostrando <strong>${fmt.num(n)} registros</strong> de ${esc(sedes)} · ${fmt.fecha(f.desde)} al ${fmt.fecha(finRango())}${extra ? " · " + esc(extra) : ""}${hayBase ? " · comparado con el mismo periodo del año anterior" : " · sin periodo comparable anterior"}`;
  }

  function aplicarSede(sede) {
    const permitidas = sedesRol();
    let sel = [...S.filtros.sedes];
    const todas = permitidas.every((s) => sel.includes(s));
    if (sede === "*") sel = [...permitidas];
    else if (todas) sel = [sede];
    else sel = sel.includes(sede) ? sel.filter((s) => s !== sede) : [...sel, sede];
    if (!sel.length) sel = [...permitidas];
    S.filtros.sedes = D.SEDES.filter((s) => sel.includes(s));
    TumiSound.play("filtro");
    actualizar();
  }

  /* ---------- KPIs ---------- */
  function sparkline(valores, color) {
    const v = valores.map((x) => (x == null ? null : x));
    const nums = v.filter((x) => x != null);
    if (nums.length < 2) return "";
    const min = Math.min(...nums), max = Math.max(...nums), w = 84, h = 30;
    const pts = v.map((x, i) => (x == null ? null : [(i / (v.length - 1)) * w, h - 3 - ((x - min) / (max - min || 1)) * (h - 6)])).filter(Boolean);
    const linea = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    const id = `g${Math.random().toString(36).slice(2, 8)}`;
    return `<svg class="kpi__spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${linea}L${pts[pts.length - 1][0]},${h}L${pts[0][0]},${h}Z" fill="url(#${id})"/><path d="${linea}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function delta(actual, anterior, tipo) {
    if (anterior == null || actual == null) return `<span class="delta delta--flat">sin base</span>`;
    let d, txt;
    if (tipo === "pts") { d = actual - anterior; txt = `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`; }
    else if (tipo === "ratio") { d = (actual - anterior) * 100; txt = `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`; }
    else { if (!anterior) return `<span class="delta delta--flat">nuevo</span>`; d = (actual / anterior - 1) * 100; txt = `${d >= 0 ? "+" : ""}${d.toFixed(1)} %`; }
    const cls = Math.abs(d) < 0.05 ? "flat" : d > 0 ? "up" : "down";
    return `<span class="delta delta--${cls}">${icono(d >= 0 ? "i-up" : "i-down")}${txt}</span>`;
  }

  function renderKPIs(k, serie) {
    const a = k.actual, b = k.anterior;
    const npsTxt = a.nps == null ? "Sin encuestas" : a.nps >= 50 ? "Excelente (sobre 50)" : a.nps >= 30 ? "Bueno" : "Por mejorar";
    const defs = [
      { id: "facturacion", label: "Facturación", ic: "i-receipt", color: C.blue, v: a.facturacion, f: (x) => fmt.soles(x), d: delta(a.facturacion, b?.facturacion), det: `Ticket promedio ${fmt.soles(a.ticket)}`, ir: "finanzas", s: serie.map((x) => x.facturacion) },
      { id: "cobranza", label: "Cobranza", ic: "i-wallet", color: C.green, v: a.cobranza == null ? null : a.cobranza * 100, f: (x) => `${x.toFixed(1)} %`, d: delta(a.cobranza, b?.cobranza, "ratio"), det: `Vencido ${fmt.soles(a.vencido)}`, ir: "cobranza", s: serie.map((x) => x.cobranza) },
      { id: "socios", label: "Socios activos", ic: "i-users", color: C.orange, v: a.socios, f: fmt.num, d: delta(a.socios, b?.socios), det: `${fmt.num(a.altas)} altas en el periodo`, ir: "socios", s: serie.map((x) => x.socios) },
      { id: "reservas", label: "Reservas", ic: "i-calendar", color: C.sky, v: a.reservas, f: fmt.num, d: delta(a.reservas, b?.reservas), det: `${fmt.num(a.personas)} personas`, ir: "reservas", s: serie.map((x) => x.reservas) },
      { id: "ocupacion", label: "Ocupación media", ic: "i-bed", color: C.amber, v: a.ocupacion, f: (x) => `${x.toFixed(1)} %`, d: delta(a.ocupacion, b?.ocupacion, "pts"), det: "Promedio en días de visita", ir: "experiencia", s: serie.map((x) => x.ocupacion) },
      { id: "nps", label: "NPS", ic: "i-smile", color: C.coral, v: a.nps, f: (x) => Math.round(x).toString(), d: delta(a.nps, b?.nps, "pts"), det: npsTxt, ir: "experiencia", s: serie.map((x) => x.nps) },
    ];
    $("kpis").innerHTML = defs.map((x) => `
      <button class="kpi" type="button" style="--kpi-color:${x.color}" data-ir="${x.ir}" aria-label="${x.label}: ver detalle">
        <div class="kpi__top"><span class="kpi__icon">${icono(x.ic)}</span>${x.d}</div>
        <div class="kpi__label">${x.label}</div>
        <div class="kpi__value" data-kpi="${x.id}">—</div>
        <div class="kpi__foot"><span class="kpi__detail">${x.det}</span>${sparkline(x.s, x.color)}</div>
      </button>`).join("");
    defs.forEach((x) => contar(document.querySelector(`[data-kpi="${x.id}"]`), x.v, x.f));
  }

  /* ---------- Gráficos ---------- */
  function renderGraficos(filas, k, serie) {
    const f = S.filtros, mm = mesesRango(), todas = filasRol();
    const sinFiltroLinea = f.servicio === "Todos" && f.cliente === "Todos";
    const diasMes = +U.finDeMes(corte.slice(0, 7)).slice(8), factorMes = +corte.slice(8) / diasMes;
    const metasMes = sinFiltroLinea ? D.metaPeriodo(S.datos.metas, f, mm) : {};
    if (metasMes[corte.slice(0, 7)]) metasMes[corte.slice(0, 7)] *= factorMes;
    const prono = finRango().slice(0, 7) === corte.slice(0, 7) ? D.pronostico(todas, f) : null;
    S.prono = D.pronostico(todas, f);

    chart("ch-ingresos", G.ingresos({ meses: mm, serie, metas: metasMes, prono }));

    // Mapa y comparativos por sede
    const statsSede = {};
    sedesRol().forEach((s) => {
      const fs = { ...f, sedes: [s] };
      const rows = D.filtrar(todas, fs);
      const kk = D.kpis(todas, fs).actual;
      statsSede[s] = { ...kk, n: rows.length };
    });
    const sedesInfo = S.datos.sedes.filter((s) => sedesRol().includes(s.sede));
    const mapa = chart("ch-mapa", G.mapa({ geo: S.datos.geo, sedes: sedesInfo, valores: statsSede, activas: f.sedes }));
    if (mapa && !mapa.__click) {
      mapa.on("click", (p) => { if (p.seriesType === "effectScatter" && sedesRol().includes(p.name)) { const solo = S.filtros.sedes.length === 1 && S.filtros.sedes[0] === p.name; aplicarSede(solo ? "*" : p.name); } });
      mapa.__click = true;
    }

    chart("ch-servicios", G.servicios({ datos: D.agrupar(filas, "servicio"), total: k.actual.facturacion }));
    const radarStats = Object.fromEntries(f.sedes.map((s) => [s, statsSede[s]]).filter(([, v]) => v && v.n > 0));
    chart("ch-radar", G.radar({ stats: radarStats }));

    const filasMeta = D.filtrar(todas, { ...f, servicio: "Todos", cliente: "Todos" });
    const metaItems = f.sedes.map((s) => {
      const metasS = D.metaPeriodo(S.datos.metas, { ...f, sedes: [s] }, mm);
      if (metasS[corte.slice(0, 7)]) metasS[corte.slice(0, 7)] *= factorMes;
      const meta = Object.values(metasS).reduce((a, b) => a + b, 0);
      const real = filasMeta.filter((r) => r.sede === s).reduce((a, r) => a + r.monto_total, 0);
      return { sede: s, real, meta };
    }).filter((x) => x.meta > 0);
    chart("ch-metas", G.metas({ items: metaItems }));

    // Calendario
    const conteos = {};
    D.filtrar(todas, f, { conFecha: false }).forEach((r) => {
      if (D.util.esReserva(r) && r.fecha_visita >= f.desde && r.fecha_visita <= f.hasta) conteos[r.fecha_visita] = (conteos[r.fecha_visita] || 0) + 1;
    });
    const anios = [2025, 2026].filter((y) => f.desde <= `${y}-12-31` && f.hasta >= `${y}-01-01`);
    const elCal = $("ch-calendario"), vertical = elCal.clientWidth < 620;
    const altoCal = vertical ? 600 : anios.length > 1 ? 330 : 220;
    if (elCal.style.height !== `${altoCal}px`) { elCal.style.height = `${altoCal}px`; S.charts["ch-calendario"]?.resize(); }
    chart("ch-calendario", G.calendario({ conteos, anios, vertical, rango: [f.desde, f.hasta] }));
    $("ch-canales").style.height = vertical ? "300px" : `${altoCal}px`;
    S.charts["ch-canales"]?.resize();
    chart("ch-canales", G.canales({ datos: D.agrupar(filas.filter(D.util.esReserva), "canal", () => 1) }));

    // Cobranza
    const conDeuda = D.filtrar(todas, { ...f, desde: D.INICIO_DATOS, hasta: corte });
    chart("ch-aging", G.antiguedad({ ...D.antiguedad(conDeuda), sedes: f.sedes }));
    chart("ch-metodos", G.metodos({ datos: D.agrupar(filas, "metodo_pago", "monto_pagado") }));
    const top = D.vencido(conDeuda).sort((a, b) => b.saldo_pendiente - a.saldo_pendiente).slice(0, 5);
    $("lista-deuda").innerHTML = top.length ? top.map((r, i) => {
      const cli = mostrarPII(r, "cliente");
      return `<li title="${esc(r.servicio)}"><span class="debt-list__rank">${i + 1}</span><div class="debt-list__who"><strong class="${cli.cls}">${esc(cli.txt)}</strong><small>${esc(r.sede)} · ${U.diffDays(corte, r.fecha_vencimiento)} días</small></div><span class="debt-list__amount">${fmt.soles(r.saldo_pendiente)}</span></li>`;
    }).join("") : `<li class="empty">Sin deuda vencida para estos filtros</li>`;

    // Socios
    chart("ch-socios", G.socios({ meses: mm, serie }));
    chart("ch-planes", G.planes({ datos: D.agrupar(filas.filter((r) => r.esMembresia), "plan_membresia", () => 1) }));

    // Experiencia
    const reservas = filas.filter(D.util.esReserva);
    const links = {};
    reservas.forEach((r) => {
      const a = `${r.origen}|${r.sede}`, b = `${r.sede}|${r.servicio}`;
      links[a] = (links[a] || 0) + r.personas;
      links[b] = (links[b] || 0) + r.personas;
    });
    chart("ch-sankey", G.sankey({ links: Object.entries(links).map(([k2, v]) => { const [source, target] = k2.split("|"); return { source, target, value: v }; }) }));
    chart("ch-nps", G.npsSedes({ items: f.sedes.map((s) => ({ sede: s, ...D.nps(filas.filter((r) => r.sede === s)) })) }));
    const bandas = ["< 50 %", "50–70 %", "70–85 %", "> 85 %"].map((b) => {
      const n = D.nps(filas.filter((r) => r.calificacion_nps != null && D.bandaOcupacion(r.ocupacion_sede_pct) === b));
      return { banda: b, nps: n.valor ?? 0, n: n.n };
    });
    chart("ch-occ-nps", G.ocupacionNps({ bandas }));
    const celdas = [];
    f.sedes.forEach((s, si) => {
      mm.forEach((m, mi) => {
        const v = filas.filter((r) => r.sede === s && !r.esMembresia && r.fecha_visita.slice(0, 7) === m);
        if (v.length) celdas.push([mi, si, v.reduce((a, r) => a + r.ocupacion_sede_pct, 0) / v.length]);
      });
    });
    chart("ch-occ-heat", G.ocupacionHeat({ meses: mm, sedes: f.sedes, celdas }));
  }

  /* ---------- Gobernanza ---------- */
  function renderGobernanza(filas) {
    const q = S.datos.calidad;
    $("calidad-sub").textContent = `${fmt.num(q.total)} registros × 31 campos = ${fmt.num(q.celdas)} datos evaluados`;
    chart("ch-calidad", G.calidad({ indice: q.indice }));
    $("dims").innerHTML = q.dims.map((d) => `<div><div class="dim__row"><span>${d.nombre}</span><span>${(d.valor * 100).toFixed(2)} %</span></div><div class="dim__bar"><i style="width:${(d.valor * 100).toFixed(2)}%"></i></div></div>`).join("");
    const conFallas = q.reglas.filter((r) => r.fallas.length).length;
    $("reglas-badge").textContent = conFallas ? `${q.afectados} registros por revisar` : "Todo en orden";
    $("reglas-badge").className = `badge ${conFallas ? "badge--warn" : "badge--ok"}`;
    $("reglas").innerHTML = q.reglas.map((r) => {
      const ok = !r.fallas.length;
      const estado = ok ? "Sin incidencias" : r.autocorrige ? `${r.fallas.length} autocorregido${r.fallas.length > 1 ? "s" : ""}` : `${r.fallas.length} caso${r.fallas.length > 1 ? "s" : ""}`;
      return `<li class="rule rule--${ok ? "ok" : "warn"}"><span class="rule__icon">${icono(ok ? "i-check" : r.autocorrige ? "i-zap" : "i-alert", "ic ic--sm")}</span><div><strong>${r.nombre}</strong><small>${r.detalle}</small></div><div style="text-align:right"><span class="rule__count">${estado}</span>${ok ? "" : `<br><button type="button" data-regla="${r.id}">Ver registros</button>`}</div></li>`;
    }).join("");

    // Datos personales
    const total = filas.length, consent = filas.filter((r) => r.consentimiento_datos === "Sí").length;
    $("pii-stats").innerHTML = `
      <span class="pii-stat"><strong>${total ? ((consent / total) * 100).toFixed(1) : 0} %</strong>con consentimiento</span>
      <span class="pii-stat"><strong>4</strong>campos sensibles</span>
      <span class="pii-stat"><strong>${S.rol.pii === "ver" ? (S.piiVisible ? "Visibles" : "Enmascarados") : S.rol.pii === "oculto" ? "Ocultos" : "Enmascarados"}</strong>para tu rol</span>
      <span class="pii-stat"><strong>30 s</strong>máximo de visualización</span>`;
    const btn = $("btn-pii");
    btn.disabled = S.rol.pii !== "ver";
    btn.title = S.rol.pii === "ver" ? "Mostrar datos personales durante 30 segundos" : "Tu rol no permite ver datos personales";
    btn.innerHTML = S.rol.pii !== "ver" ? `${icono("i-lock", "ic ic--sm")} <span>Sin permiso</span>` : S.piiVisible ? `${icono("i-eye-off", "ic ic--sm")} <span>Ocultar datos</span>` : `${icono("i-eye", "ic ic--sm")} <span>Mostrar datos</span>`;
    const ultimas = [...filas].sort((a, b) => (b.fecha_registro + b.id_registro).localeCompare(a.fecha_registro + a.id_registro)).slice(0, 8);
    $("pii-sub").textContent = `Últimas ${ultimas.length} operaciones del filtro actual`;
    $("tabla-pii").querySelector("tbody").innerHTML = ultimas.map((r) => {
      const c = mostrarPII(r, "cliente"), d = mostrarPII(r, "documento"), t = mostrarPII(r, "telefono");
      const cons = r.consentimiento_datos === "Sí" ? '<span class="tag tag--ok">Sí</span>' : r.consentimiento_datos === "No" ? '<span class="tag tag--no">No</span>' : '<span class="tag tag--bad">Falta</span>';
      return `<tr><td>${esc(r.id_registro)}</td><td>${fmt.fecha(r.fecha_registro)}</td><td>${esc(r.sede)}</td><td class="${c.cls}">${esc(c.txt)}</td><td class="${d.cls}">${esc(d.txt)}</td><td class="${t.cls}">${esc(t.txt)}</td><td>${esc(r.servicio)}</td><td class="num">${fmt.soles(r.monto_total, false)}</td><td>${cons}</td></tr>`;
    }).join("");

    const tagSens = { "Dato personal": "tag--pd", Confidencial: "tag--conf", Interno: "tag--int" };
    $("tabla-dicc").querySelector("tbody").innerHTML = S.datos.diccionario.map((d) => `<tr><td>${esc(d.campo)}</td><td>${esc(d.tipo)}</td><td>${esc(d.descripcion)}</td><td>${esc(d.regla_validacion)}</td><td><span class="tag ${tagSens[d.sensibilidad] || "tag--int"}">${esc(d.sensibilidad)}</span></td><td>${esc(d.responsable)}</td></tr>`).join("");
  }

  function renderBitacora() {
    $("bitacora").innerHTML = S.bitacora.map((b) => `<li><span class="audit__dot ${b.tipo === "warn" ? "audit__dot--warn" : b.tipo === "sec" ? "audit__dot--sec" : ""}"></span><div><time>${b.t.toDateString() === new Date().toDateString() ? hora(b.t) : b.t.toLocaleDateString("es-PE", { day: "numeric", month: "short" }) + " " + hora(b.t)} · ${esc(b.rol || "Sistema")}</time>${esc(b.texto)}</div></li>`).join("");
  }

  /* ---------- IA ---------- */
  function renderIA() {
    const lista = D.hallazgos(filasRol(), S.filtros, S.datos.calidad).slice(0, 6);
    $("insights-count").textContent = lista.length;
    const sevTxt = { alta: "Prioridad alta", media: "Atención", oportunidad: "Oportunidad" };
    $("insights").innerHTML = lista.length ? lista.map((h, i) => {
      const est = S.insights[h.id];
      return `<article class="insight insight--${h.sev} ${est === "validado" ? "is-validated" : est === "descartado" ? "is-discarded" : ""}" style="animation-delay:${i * 70}ms" data-insight="${h.id}">
        <div class="insight__top"><span class="insight__sev">${sevTxt[h.sev]}</span><span class="insight__conf">Confianza ${h.confianza} · n=${fmt.num(h.n)}</span></div>
        <h4>${esc(h.titulo)}</h4>
        <p>${esc(h.detalle)}</p>
        <p class="insight__action">→ ${esc(h.accion)}</p>
        <details><summary>¿Cómo lo calculé?</summary><p>${esc(h.calculo)}</p></details>
        ${est ? `<span class="insight__state">${est === "validado" ? "✓ Validado por una persona" : "Descartado · queda en bitácora"}</span>` : `<div class="insight__btns"><button type="button" data-accion="validado">Validar</button><button type="button" data-accion="descartado">Descartar</button></div>`}
      </article>`;
    }).join("") : `<p class="empty">Sin hallazgos relevantes para estos filtros. Todo en orden.</p>`;

    const p = S.prono;
    const metodo = {
      estacional: "Un modelo por sede: mismo mes del año anterior × tendencia de los últimos 10 meses",
      mixto: `Un modelo por sede: mismo mes del año anterior × tendencia de 10 meses. ${p.sedesPromedio.join(", ")} usa el promedio de sus últimos 3 meses por tener menos de un año de historia`,
      promedio: "Promedio de los últimos 3 meses (hay menos de 12 meses de historia para estos filtros)",
    }[p.metodo];
    $("ficha-modelo").innerHTML = `
      <dt>Propósito</dt><dd>Estimar la facturación de los próximos 3 meses para planificar personal, compras y metas.</dd>
      <dt>Método</dt><dd>${metodo}. Elegido por ser explicable para la gerencia.</dd>
      <dt>Datos de entrada</dt><dd>Facturación mensual agregada · ${p.historico} meses · sin datos personales.</dd>
      <dt>Error histórico</dt><dd><span class="metric">${p.mape == null ? "—" : (p.mape * 100).toFixed(1) + " %"}</span> de error medio (MAPE) al predecir los últimos 4 meses.</dd>
      <dt>Rango de confianza</dt><dd><span class="metric">± ${(p.banda * 100).toFixed(0)} %</span> alrededor del valor estimado.</dd>
      <dt>Próximo trimestre</dt><dd>${p.futuros.map((x) => `${fmt.mes(x.mes)}: <span class="metric">${fmt.soles(x.valor)}</span>`).join(" · ")}</dd>
      <dt>Limitaciones</dt><dd>No anticipa eventos extraordinarios (lluvias intensas, El Niño, nuevos feriados). Una sede nueva tiene confianza baja.</dd>
      <dt>Responsable</dt><dd>Analista de datos e IA · revisión trimestral del error y de posibles sesgos.</dd>`;
  }

  function preguntar(q) {
    const r = D.responder(filasRol(), S.filtros, q);
    const caja = $("ask-answer");
    caja.innerHTML = `${icono("i-bot", "ic ask__bot")}<div><p><span id="ask-text"></span><span class="caret"></span></p><small id="ask-pie"></small></div>`;
    const el = $("ask-text"), texto = r.texto;
    TumiSound.play("click");
    let i = 0;
    const tick = () => {
      i += reducido ? texto.length : 2;
      el.textContent = texto.slice(0, i);
      if (i < texto.length) setTimeout(tick, 14);
      else { caja.querySelector(".caret")?.remove(); $("ask-pie").textContent = r.pie; }
    };
    tick();
    auditar(`Consulta al asistente: «${q.length > 40 ? q.slice(0, 40) + "…" : D.PREGUNTAS.find((x) => x.id === q)?.texto || q}»`);
  }

  /* ---------- Automatizaciones ---------- */
  function renderAutomatizaciones() {
    const vencidos = D.vencido(D.filtrar(filasRol(), { ...S.filtros, desde: D.INICIO_DATOS, hasta: corte, servicio: "Todos", cliente: "Todos" }));
    const conConsent = new Set(vencidos.filter((r) => r.consentimiento_datos === "Sí").map((r) => r.id_cliente)).size;
    const clientes = new Set(vencidos.map((r) => r.id_cliente)).size;
    const items = [
      { id: "sync", ic: "i-refresh", color: C.blue, titulo: "Sincronización con Google Sheets", texto: "Lee la hoja de registros, valida y recalcula todos los indicadores.", meta: `Cada ${CFG.refrescoMinutos} min · última ${S.ultimaSync ? hora(S.ultimaSync) : "—"}`, boton: "Ejecutar ahora", accion: "sync" },
      { id: "calidad", ic: "i-shield", color: C.green, titulo: "Validación diaria de calidad", texto: "Apps Script revisa las 10 reglas y envía alerta si el índice baja de 98 %.", meta: `Diario 7:00 a. m. · índice actual ${(S.datos.calidad.indice * 100).toFixed(1)} %`, boton: "Ver reglas", accion: "reglas" },
      { id: "cobranza", ic: "i-message", color: "#25A55F", titulo: "Recordatorio de cobranza", texto: `WhatsApp a clientes con saldo vencido. Solo a quienes dieron consentimiento.`, meta: `Lun y jue 10:00 · ${conConsent} de ${clientes} clientes habilitados`, boton: "Vista previa", accion: "whatsapp" },
      { id: "reporte", ic: "i-mail", color: C.orange, titulo: "Reporte semanal a gerencia", texto: "PDF con KPIs, hallazgos y alertas, enviado por correo cada lunes.", meta: "Lunes 8:00 a. m. · gerencia@", boton: "Generar ahora", accion: "pdf" },
    ];
    $("automatizaciones").innerHTML = items.map((a) => `
      <article class="auto" style="--auto-color:${a.color}">
        <div class="auto__top"><span class="auto__icon">${icono(a.ic)}</span><label class="switch" title="Activar o pausar"><input type="checkbox" data-auto="${a.id}" ${S.auto[a.id] ? "checked" : ""} aria-label="${a.titulo}"><span></span></label></div>
        <h4>${a.titulo}</h4><p>${a.texto}</p>
        <div class="auto__meta">${icono("i-clock", "ic ic--sm")}${a.meta}</div>
        <button class="btn btn--outline btn--small" type="button" data-auto-accion="${a.accion}" ${S.auto[a.id] ? "" : "disabled"}>${a.boton}</button>
      </article>`).join("");
  }

  function vistaWhatsapp() {
    const vencidos = D.vencido(D.filtrar(filasRol(), { ...S.filtros, desde: D.INICIO_DATOS, hasta: corte, servicio: "Todos", cliente: "Todos" }));
    const ok = vencidos.filter((r) => r.consentimiento_datos === "Sí"), excluidos = vencidos.length - ok.length;
    const ej = ok[0];
    const nombre = ej ? (S.rol.pii === "ver" && S.piiVisible ? ej.cliente.split(" ")[0] : "{nombre}") : "{nombre}";
    modal("Recordatorio de cobranza por WhatsApp", `
      <p>Se enviará a <strong>${ok.length}</strong> operaciones con saldo vencido. <strong>${excluidos}</strong> ${excluidos === 1 ? "queda excluida" : "quedan excluidas"} automáticamente por no tener consentimiento registrado (Ley N.° 29733).</p>
      <div class="wa-preview">Hola ${esc(nombre)}, te saludamos de Club El Tumi ${esc(ej ? ej.sede : "{sede}")}. Tienes un saldo pendiente de <b>${ej ? fmt.soles(ej.saldo_pendiente, false) : "{monto}"}</b> por ${esc(ej ? ej.servicio.toLowerCase() : "{servicio}")}. Puedes pagarlo por Yape, transferencia o en recepción. Si ya lo hiciste, ignora este mensaje. ¡Te esperamos pronto!</div>
      <p class="modal-note">Controles de gobernanza: plantilla aprobada por Legal · máximo 2 envíos por cliente al mes · opción de baja en cada mensaje · cada envío queda en la bitácora.</p>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn btn--primary" id="wa-enviar" type="button">${icono("i-send")} Simular envío</button><button class="btn btn--text" type="button" data-cerrar>Cancelar</button></div>`);
    $("wa-enviar").addEventListener("click", () => {
      cerrarModal();
      TumiSound.play("exito");
      const ex = `${excluidos} excluido${excluidos === 1 ? "" : "s"}`;
      toast(`${ok.length} recordatorios programados (simulación). ${ex} por falta de consentimiento.`, "i-send");
      auditar(`Recordatorios de cobranza programados: ${ok.length} · ${ex} por consentimiento`, "sec");
    });
  }

  /* ---------- Exportación ---------- */
  function exportarCSV() {
    if (!S.rol.exporta) { toast("Tu rol no permite exportar datos.", "i-lock"); TumiSound.play("alerta"); return; }
    const filas = D.filtrar(filasRol(), S.filtros);
    const cols = Object.keys(S.datos.registros[0]).filter((c) => !["mes", "esMembresia"].includes(c));
    const sensibles = ["cliente", "documento", "telefono"];
    const linea = (r) => cols.map((c) => {
      const v = sensibles.includes(c) ? mostrarPII(r, c).txt : r[c] ?? "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",");
    const csv = "﻿" + [cols.join(","), ...filas.map(linea)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `club-el-tumi_${S.filtros.desde}_${finRango()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    TumiSound.play("exito");
    const enmascarado = !(S.rol.pii === "ver" && S.piiVisible);
    toast(`${fmt.num(filas.length)} registros exportados${enmascarado ? " con datos personales enmascarados" : ""}.`, "i-download");
    auditar(`Exportación CSV: ${filas.length} registros${enmascarado ? " (enmascarados)" : " (datos personales visibles)"}`, enmascarado ? "info" : "sec");
  }
  function reportePDF() {
    auditar("Reporte PDF generado");
    TumiSound.play("click");
    Object.values(S.charts).forEach((c) => c.resize());
    setTimeout(() => print(), 300);
  }

  /* ---------- Ciclo principal ---------- */
  function actualizar() {
    const f = S.filtros, todas = filasRol();
    const k = D.kpis(todas, f);
    const serie = D.serieMensual(todas, f, mesesRango());
    renderFiltros();
    renderResumen(k.filas.length, !!k.anterior);
    renderKPIs(k, serie);
    renderGraficos(k.filas, k, serie);
    renderGobernanza(k.filas);
    renderIA();
    renderAutomatizaciones();
  }

  function etiquetaFuente() {
    const pill = $("source-pill"), F = S.datos.fuente;
    pill.classList.toggle("is-live", F === "sheets");
    $("source-label").textContent = F === "sheets" ? "Google Sheets · en vivo" : F === "respaldo" ? "Respaldo local" : "Datos de demostración";
    $("source-sync").textContent = `Sincronizado ${hora(S.ultimaSync)}${F === "sheets" && S.auto.sync ? ` · cada ${CFG.refrescoMinutos} min` : ""}`;
    const n = S.datos.registros.length;
    $("hero-subtitle").textContent = `${fmt.num(n)} registros · 4 sedes · ${fmt.fecha(D.INICIO_DATOS)} al ${fmt.fecha(corte)}`;
  }

  async function sincronizar(manual = false) {
    const btn = $("btn-sync");
    btn.classList.add("is-spinning");
    try {
      S.datos = await D.cargar();
      S.ultimaSync = new Date();
      etiquetaFuente();
      actualizar();
      if (manual) {
        TumiSound.play("exito");
        toast(`Sincronización completa: ${fmt.num(S.datos.registros.length)} registros validados con 10 reglas.`, "i-refresh");
      }
      auditar(`Sincronización ${S.datos.fuente === "sheets" ? "con Google Sheets" : "con datos locales"}: ${fmt.num(S.datos.registros.length)} registros`);
    } catch (e) {
      console.error(e);
      toast("No se pudieron cargar los datos. Revisa la conexión.", "i-alert");
    } finally {
      setTimeout(() => btn.classList.remove("is-spinning"), 600);
    }
  }

  function programarSync() {
    clearInterval(S.timerSync);
    if (S.auto.sync && S.datos?.fuente === "sheets") S.timerSync = setInterval(() => sincronizar(false), CFG.refrescoMinutos * 60000);
  }

  function cambiarRol(id) {
    S.rol = ROLES.find((r) => r.id === id) || ROLES[0];
    S.piiVisible = false;
    clearTimeout(S.piiTimer);
    S.filtros.sedes = [...sedesRol()];
    $("btn-csv").disabled = !S.rol.exporta;
    TumiSound.play("seguro");
    toast(`Vista de ${S.rol.nombre}: ${S.rol.desc}.`, "i-shield");
    auditar(`Cambio de rol a ${S.rol.nombre}`, "sec");
    actualizar();
  }

  function eventos() {
    document.addEventListener("click", (e) => {
      const t = e.target.closest("button, [data-sede], [data-periodo]");
      if (!t) return;
      if (t.dataset.sede && !t.disabled) return aplicarSede(t.dataset.sede);
      if (t.dataset.periodo) {
        const p = PERIODOS.find((x) => x.id === t.dataset.periodo);
        Object.assign(S.filtros, { periodo: p.id, desde: p.desde, hasta: p.hasta });
        TumiSound.play("filtro");
        return actualizar();
      }
      if (t.dataset.ir) { TumiSound.play("click"); return document.getElementById(t.dataset.ir).scrollIntoView({ behavior: reducido ? "auto" : "smooth" }); }
      if (t.dataset.regla) {
        const r = S.datos.calidad.reglas.find((x) => x.id === t.dataset.regla);
        TumiSound.play("click");
        return modal(r.nombre, `<p>${r.fallas.length} registro${r.fallas.length > 1 ? "s" : ""} no cumple${r.fallas.length > 1 ? "n" : ""} la regla <strong>${esc(r.detalle)}</strong>.${r.autocorrige ? " Se corrigieron automáticamente y se notificó al responsable." : " Se notificó al responsable para corregirlo en Google Sheets."}</p><div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Registro</th><th>Detalle</th><th>Registrado por</th></tr></thead><tbody>${r.fallas.map((x) => `<tr><td>${esc(x.id)}</td><td>${esc(x.nota)}</td><td>${esc(x.usuario)}</td></tr>`).join("")}</tbody></table></div>`);
      }
      if (t.dataset.accion) {
        const card = t.closest("[data-insight]"), id = card.dataset.insight;
        S.insights[id] = t.dataset.accion;
        TumiSound.play(t.dataset.accion === "validado" ? "exito" : "click");
        auditar(`Hallazgo «${card.querySelector("h4").textContent.slice(0, 48)}…» ${t.dataset.accion}`, "warn");
        return renderIA();
      }
      if (t.dataset.autoAccion) {
        const a = t.dataset.autoAccion;
        if (a === "sync") return sincronizar(true);
        if (a === "reglas") { TumiSound.play("click"); return $("gobernanza").scrollIntoView({ behavior: reducido ? "auto" : "smooth" }); }
        if (a === "whatsapp") { TumiSound.play("click"); return vistaWhatsapp(); }
        if (a === "pdf") return reportePDF();
      }
      if (t.dataset.cerrar !== undefined) return cerrarModal();
    });

    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "f-servicio" || t.id === "f-cliente") {
        S.filtros[t.id === "f-servicio" ? "servicio" : "cliente"] = t.value;
        TumiSound.play("filtro");
        actualizar();
      }
      if (t.id === "rol") cambiarRol(t.value);
      if (t.dataset.auto) {
        S.auto[t.dataset.auto] = t.checked;
        TumiSound.play("toggle");
        const nombre = t.getAttribute("aria-label");
        auditar(`Automatización «${nombre}» ${t.checked ? "activada" : "pausada"}`, "warn");
        toast(`${nombre}: ${t.checked ? "activada" : "pausada"}.`, "i-zap");
        if (t.dataset.auto === "sync") programarSync();
        renderAutomatizaciones();
      }
    });

    document.addEventListener("mouseover", (e) => {
      const t = e.target.closest(".chip, .btn, .icon-btn, .kpi, .insight__btns button, .ask__chips button");
      if (t && t !== S.ultimoHover) { S.ultimoHover = t; TumiSound.play("hover"); }
    });

    $("btn-limpiar").addEventListener("click", () => {
      const p = PERIODOS[0];
      S.filtros = { sedes: [...sedesRol()], desde: p.desde, hasta: p.hasta, periodo: p.id, servicio: "Todos", cliente: "Todos" };
      TumiSound.play("filtro");
      actualizar();
    });
    $("btn-sync").addEventListener("click", () => sincronizar(true));
    $("btn-csv").addEventListener("click", exportarCSV);
    $("btn-pdf").addEventListener("click", reportePDF);
    $("btn-pii").addEventListener("click", () => {
      if (S.rol.pii !== "ver") return;
      S.piiVisible = !S.piiVisible;
      clearTimeout(S.piiTimer);
      TumiSound.play("seguro");
      if (S.piiVisible) {
        auditar("Datos personales visualizados (8 registros) · se ocultan en 30 s", "sec");
        toast("Datos personales visibles por 30 segundos. El acceso quedó registrado en la bitácora.", "i-eye");
        S.piiTimer = setTimeout(() => { S.piiVisible = false; renderGobernanza(D.filtrar(filasRol(), S.filtros)); auditar("Datos personales ocultados automáticamente"); }, 30000);
      }
      renderGobernanza(D.filtrar(filasRol(), S.filtros));
    });
    $("btn-sfx").addEventListener("click", (e) => {
      TumiSound.unlock();
      TumiSound.setSfx(!TumiSound.sfx);
      e.currentTarget.setAttribute("aria-pressed", TumiSound.sfx);
      e.currentTarget.innerHTML = icono(TumiSound.sfx ? "i-volume" : "i-volume-x");
      TumiSound.play("toggle");
    });
    $("btn-music").addEventListener("click", (e) => {
      TumiSound.setMusic(!TumiSound.music);
      e.currentTarget.setAttribute("aria-pressed", TumiSound.music);
      toast(TumiSound.music ? "Música ambiente andina activada." : "Música ambiente en pausa.", "i-music");
    });
    $("btn-tour").addEventListener("click", () => { TumiSound.unlock(); TumiTour.iniciar(); });
    $("modal-close").addEventListener("click", cerrarModal);
    $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") cerrarModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").hidden) cerrarModal(); });

    $("ask-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("ask-input").value.trim();
      if (q) preguntar(q);
    });

    const cerrarSplash = (conTour) => {
      TumiSound.unlock();
      $("splash").classList.add("is-hidden");
      document.body.classList.remove("is-locked");
      Object.values(S.charts).forEach((c) => c.resize());
      if (conTour) {
        TumiSound.setMusic(true);
        $("btn-music").setAttribute("aria-pressed", "true");
        setTimeout(() => TumiTour.iniciar(), 700);
      } else TumiSound.play("exito");
    };
    $("btn-iniciar").addEventListener("click", () => cerrarSplash(true));
    $("btn-explorar").addEventListener("click", () => cerrarSplash(false));

    let rz;
    addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { Object.values(S.charts).forEach((c) => c.resize()); if (S.datos) renderGraficos(D.filtrar(filasRol(), S.filtros), D.kpis(filasRol(), S.filtros), D.serieMensual(filasRol(), S.filtros, mesesRango())); }, 250); });

    const filtros = $("filtros");
    addEventListener("scroll", () => filtros.classList.toggle("is-stuck", filtros.getBoundingClientRect().top <= 0), { passive: true });
  }

  async function iniciar() {
    document.body.classList.add("is-locked");
    $("autor").textContent = CFG.autor;
    $("rol").innerHTML = ROLES.map((r) => `<option value="${r.id}">${r.nombre}</option>`).join("");
    $("ask-chips").innerHTML = D.PREGUNTAS.map((p) => `<button type="button" data-q="${p.id}">${p.texto}</button>`).join("");
    $("ask-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) preguntar(b.dataset.q); });
    $("btn-sfx").setAttribute("aria-pressed", TumiSound.sfx);
    $("btn-sfx").innerHTML = icono(TumiSound.sfx ? "i-volume" : "i-volume-x");
    eventos();
    TumiTour.init();
    await sincronizar(false);
    const q = S.datos.calidad;
    auditar(`Validación de calidad: 10 reglas · ${q.afectados} registros con incidencias · índice ${(q.indice * 100).toFixed(1)} %`, q.afectados ? "warn" : "info");
    S.bitacora.push(
      { t: new Date(Date.now() - 3.6e6 * 2.2), texto: "Validación diaria ejecutada por Apps Script · alerta enviada a admin.ica", tipo: "warn" },
      { t: new Date(Date.now() - 3.6e6 * 15), texto: "admin.lim descargó el reporte semanal (datos enmascarados)", tipo: "info" },
      { t: new Date(Date.now() - 3.6e6 * 26), texto: "Regla nueva publicada: consentimiento obligatorio antes de campañas", tipo: "sec" },
    );
    auditar("Sesión iniciada como Gerencia general", "sec");
    programarSync();
  }

  iniciar();
})();
