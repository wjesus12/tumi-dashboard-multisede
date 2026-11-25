/* Constructores de gráficos (Apache ECharts) con la identidad visual de Club El Tumi. */
window.TumiCharts = (() => {
  const C = {
    navy: "#0A2A5E", blue: "#1751A0", sky: "#0095C9", aqua: "#37BEE9", sun: "#FFCC00", lemon: "#F2E203",
    orange: "#F18E14", amber: "#E3A500", green: "#5DB130", greenD: "#3E8E22", red: "#C2410C", coral: "#E4572E",
    ink: "#0A2A5E", ink2: "#46597A", ink3: "#8593AA", line: "#E4E8EF", soft: "#EEF1F5", grey: "#D5DCE6", sand: "#FBF7EE",
  };
  const SEDE = { Lima: C.blue, Chiclayo: C.orange, Ica: C.amber, Tarapoto: C.green };
  const SERVICIO = { "Entradas y piscinas": C.aqua, Hospedaje: C.blue, Camping: C.green, Restaurante: C.amber, Aventura: C.sun, Eventos: C.orange, "Membresía anual": C.navy };
  const PLAN = { Individual: C.aqua, Familiar: C.blue, Corporativo: C.orange };
  const CANAL = { WhatsApp: "#25A55F", Presencial: C.blue, Web: C.aqua, "Redes sociales": C.coral, "Agencias y corporativo": C.orange };
  const METODO = { "Yape / Plin": "#7B3FBF", Tarjeta: C.blue, Efectivo: C.green, Transferencia: C.aqua };
  const TRAMOS = [C.aqua, C.sun, C.orange, C.coral, "#9F1D12"];
  const ORIGEN = { "Misma ciudad": "#B8C4D6", "Otras regiones": C.sky, Extranjero: C.navy };
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const F = "Montserrat, system-ui, sans-serif";

  const fmt = {
    soles(n, corto = true) {
      if (n == null || Number.isNaN(n)) return "—";
      const a = Math.abs(n);
      if (corto && a >= 1e6) return `S/ ${(n / 1e6).toFixed(2)} M`;
      if (corto && a >= 1e4) return `S/ ${(n / 1e3).toFixed(1)} mil`;
      return `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: corto ? 0 : 2, minimumFractionDigits: corto ? 0 : 2 })}`;
    },
    num: (n) => (n == null ? "—" : Math.round(n).toLocaleString("es-PE")),
    pct: (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)} %`),
    mes: (ym) => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`,
    fecha: (iso) => { const [y, m, d] = iso.split("-"); return `${+d} ${MESES[+m - 1]} ${y}`; },
    fechaCorta: (iso) => { const [, m, d] = iso.split("-"); return `${+d} ${MESES[+m - 1]}`; },
  };
  const k = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}k` : v);

  const tooltip = (extra = {}) => ({
    backgroundColor: "rgba(10,42,94,.97)", borderWidth: 0, padding: [10, 14], confine: true,
    textStyle: { color: "#fff", fontSize: 12, fontFamily: F }, extraCssText: "border-radius:3px;box-shadow:none;", ...extra,
  });
  const base = (extra = {}) => ({ textStyle: { fontFamily: F }, animationDuration: 900, animationEasing: "cubicOut", animationDurationUpdate: 600, tooltip: tooltip(), ...extra });
  const leyenda = (extra = {}) => ({ icon: "rect", itemWidth: 10, itemHeight: 10, itemGap: 16, textStyle: { color: C.ink2, fontSize: 11.5, fontFamily: F }, ...extra });
  const vy = (formatter, extra = {}) => ({ type: "value", axisLabel: { color: C.ink3, fontSize: 10.5, formatter, fontFamily: F }, splitLine: { lineStyle: { color: C.soft } }, ...extra });
  const cat = (data, extra = {}) => ({ type: "category", data, axisTick: { show: false }, axisLine: { lineStyle: { color: "#C9D1DD" } }, axisLabel: { color: C.ink2, fontSize: 11, fontFamily: F, hideOverlap: true }, ...extra });
  const punto = (c) => `<span style="display:inline-block;width:8px;height:8px;background:${c};margin-right:6px"></span>`;
  const vacio = (t = "Sin datos para estos filtros") => ({ graphic: { type: "text", left: "center", top: "middle", style: { text: t, fill: C.ink3, font: `600 13px ${F}` } }, series: [] });

  /* Facturación vs cobranza + meta + pronóstico */
  function ingresos({ meses, serie, metas, prono, compacto = false }) {
    if (!serie.some((s) => s.facturacion > 0)) return vacio();
    const et = meses.map(fmt.mes);
    const fut = prono && !compacto ? prono.futuros.map((f) => fmt.mes(f.mes)) : [];
    const n = meses.length, total = n + fut.length, iC = prono ? meses.indexOf(prono.mesCorte) : -1;
    const conProno = fut.length && iC === n - 1;
    const pron = Array(total).fill(null), bajo = Array(total).fill(null), rango = Array(total).fill(null);
    if (conProno) {
      pron[iC] = bajo[iC] = Math.round(prono.cierreEstimado); rango[iC] = 0;
      prono.futuros.forEach((f, i) => { pron[n + i] = Math.round(f.valor); bajo[n + i] = Math.round(f.valor * (1 - prono.banda)); rango[n + i] = Math.round(f.valor * 2 * prono.banda); });
    }
    const metaS = meses.map((m) => (metas[m] ? Math.round(metas[m]) : null));
    let iMax = 0, iMin = 0;
    serie.forEach((s, i) => { if (s.facturacion > serie[iMax].facturacion) iMax = i; if (i !== iC && s.facturacion < serie[iMin].facturacion) iMin = i; });
    const marcas = compacto || n < 4 ? [] : [
      { name: "Mejor mes", coord: [iMax, serie[iMax].facturacion] },
      ...(iMin !== iMax ? [{ name: "Mes más flojo", coord: [iMin, serie[iMin].facturacion] }] : []),
    ];
    return base({
      legend: compacto ? undefined : leyenda({ top: 0, left: 0, data: ["Facturado", "Cobrado", "Meta", ...(conProno ? ["Pronóstico IA"] : [])] }),
      grid: { left: 4, right: conProno ? 70 : 12, top: compacto ? 16 : 44, bottom: 4, containLabel: true },
      tooltip: tooltip({
        trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(55,190,233,.08)" } },
        formatter(ps) {
          const i = ps[0].dataIndex;
          if (i >= n) { const f = prono.futuros[i - n]; return `<b>${fut[i - n]} · pronóstico</b><br>${punto(C.orange)}Estimado <b>${fmt.soles(f.valor)}</b><br>Rango ${fmt.soles(f.valor * (1 - prono.banda))} – ${fmt.soles(f.valor * (1 + prono.banda))}`; }
          const s = serie[i];
          let h = `<b>${et[i]}${i === iC ? " · mes en curso" : ""}</b><br>${punto(C.blue)}Facturado <b>${fmt.soles(s.facturacion)}</b><br>${punto(C.green)}Cobrado <b>${fmt.soles(s.cobrado)}</b> (${fmt.pct(s.cobranza)})`;
          if (metaS[i]) h += `<br>${punto(C.orange)}Meta ${fmt.soles(metaS[i])} · ${fmt.pct(s.facturacion / metaS[i], 0)}`;
          if (i === iC && prono) h += `<br><span style="opacity:.7">Cierre estimado ${fmt.soles(prono.cierreEstimado)}</span>`;
          return h;
        },
      }),
      xAxis: cat([...et, ...fut]),
      yAxis: vy((v) => `S/ ${k(v)}`),
      series: [
        { name: "Facturado", type: "bar", data: [...serie.map((s, i) => ({ value: Math.round(s.facturacion), itemStyle: { color: i === iC ? "#8FB0DD" : C.blue } })), ...Array(fut.length).fill(null)], barMaxWidth: 26,
          markPoint: marcas.length ? { symbol: "rect", symbolSize: [1, 1], label: { show: true, position: "top", distance: 16, formatter: "{b}", backgroundColor: "rgba(255,255,255,.85)", padding: [2, 4], color: C.ink, fontFamily: F, fontWeight: 700, fontSize: 11 }, data: marcas } : undefined },
        { name: "Cobrado", type: "line", data: serie.map((s) => Math.round(s.cobrado)), symbol: "circle", symbolSize: 6, lineStyle: { width: 2.5, color: C.green }, itemStyle: { color: C.green }, z: 5 },
        { name: "Meta", type: "scatter", data: metaS, symbol: "rect", symbolSize: [26, 3], itemStyle: { color: C.orange }, z: 6 },
        { name: "b1", type: "line", data: bajo, stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, tooltip: { show: false }, silent: true },
        { name: "Rango", type: "line", data: rango, stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: "rgba(255,204,0,.3)" }, tooltip: { show: false }, silent: true },
        { name: "Pronóstico IA", type: "line", data: pron, symbol: "circle", symbolSize: 6, lineStyle: { width: 2.5, type: [7, 5], color: "#E08A00" }, itemStyle: { color: "#E08A00" }, z: 7,
          endLabel: conProno ? { show: true, formatter: (p) => fmt.soles(p.value), color: "#8A4B00", fontFamily: F, fontWeight: 700, fontSize: 11 } : undefined },
      ],
    });
  }

  /* Mapa del Perú */
  let mapaRegistrado = false;
  function mapa({ geo, sedes, valores, activas }) {
    if (!mapaRegistrado) { echarts.registerMap("peru", geo); mapaRegistrado = true; }
    const max = Math.max(1, ...Object.values(valores).map((v) => v.facturacion));
    const lima = sedes.find((s) => s.sede === "Lima");
    const pos = { Lima: "left", Chiclayo: "left", Ica: "right", Tarapoto: "right" };
    return base({
      tooltip: tooltip({ formatter: (p) => { if (p.seriesType !== "scatter") return ""; const v = valores[p.name] || {}; return `<b>${p.name}</b><br>Facturación <b>${fmt.soles(v.facturacion)}</b><br>Reservas ${fmt.num(v.reservas)}<br>Ocupación ${v.ocupacion == null ? "—" : v.ocupacion.toFixed(0) + " %"} · NPS ${v.nps == null ? "—" : Math.round(v.nps)}<br><span style="opacity:.7">Clic para filtrar</span>`; } }),
      geo: { map: "peru", roam: false, silent: true, top: 16, bottom: 16, left: "center", aspectScale: .96, itemStyle: { areaColor: C.sand, borderColor: "#C9B98F", borderWidth: 1 } },
      series: [
        { type: "lines", coordinateSystem: "geo", silent: true, effect: { show: true, period: 5, trailLength: .2, symbol: "circle", symbolSize: 4, color: C.orange }, lineStyle: { color: C.aqua, width: 1.5, type: [4, 4], curveness: .25 },
          data: lima ? sedes.filter((s) => s.sede !== "Lima").map((s) => ({ coords: [[lima.lon, lima.lat], [s.lon, s.lat]] })) : [] },
        { type: "scatter", coordinateSystem: "geo", cursor: "pointer",
          data: sedes.map((s) => { const v = valores[s.sede] || { facturacion: 0 }; const on = activas.includes(s.sede); return { name: s.sede, value: [s.lon, s.lat, v.facturacion], symbolSize: 12 + 26 * Math.sqrt(v.facturacion / max), itemStyle: { color: SEDE[s.sede], opacity: on ? 1 : .3, borderColor: "#fff", borderWidth: 2 }, label: { position: pos[s.sede], opacity: on ? 1 : .45 } }; }),
          label: { show: true, distance: 8, formatter: (p) => `{a|${p.name}}\n{b|${fmt.soles(p.value[2])}}`, rich: { a: { fontFamily: F, fontWeight: 800, fontSize: 12, color: C.ink, lineHeight: 16 }, b: { fontFamily: F, fontSize: 11, color: C.ink2 } } },
          emphasis: { scale: 1.15 } },
      ],
    });
  }

  /* Mix por servicio */
  function servicios({ datos, total }) {
    const items = Object.entries(datos).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!items.length) return vacio();
    const tot = items.reduce((a, x) => a + x[1], 0);
    return base({
      tooltip: tooltip({ trigger: "item", formatter: (p) => `${punto(p.color)}<b>${p.name}</b><br>${fmt.soles(p.value)} · ${p.percent.toFixed(1)} %` }),
      legend: leyenda({ orient: "vertical", right: 0, top: "middle", itemGap: 10, formatter: (n) => { const v = datos[n] || 0; return `${n}  ${Math.round((v / tot) * 100)} %`; } }),
      graphic: [{ type: "text", left: "21%", top: "44%", style: { text: fmt.soles(total), font: `800 15px ${F}`, fill: C.ink, textAlign: "center" } }],
      series: [{ type: "pie", radius: ["54%", "78%"], center: ["27%", "50%"], label: { show: false }, itemStyle: { borderColor: "#fff", borderWidth: 2 }, emphasis: { scaleSize: 6 },
        data: items.map(([n, v]) => ({ name: n, value: Math.round(v), itemStyle: { color: SERVICIO[n] } })) }],
    });
  }

  /* Cumplimiento de meta: arcos de sol */
  function metas({ items }) {
    if (!items.length) return vacio("Sin metas para este periodo");
    const n = items.length;
    return base({
      tooltip: tooltip({ formatter: (p) => `<b>${p.data.sede}</b><br>Real ${fmt.soles(p.data.real)}<br>Meta ${fmt.soles(p.data.meta)}<br>Cumplimiento <b>${p.value} %</b>` }),
      series: items.map((it, i) => ({
        type: "gauge", startAngle: 180, endAngle: 0, min: 0, max: 120, center: [`${((i + .5) / n) * 100}%`, "66%"], radius: n > 2 ? "52%" : "70%",
        progress: { show: true, width: 14, itemStyle: { color: SEDE[it.sede] } }, axisLine: { lineStyle: { width: 14, color: [[1, C.soft]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, anchor: { show: false },
        title: { offsetCenter: [0, "30%"], color: C.ink2, fontSize: 12, fontWeight: 700, fontFamily: F },
        detail: { offsetCenter: [0, "-12%"], valueAnimation: true, formatter: "{value}%", color: C.ink, fontFamily: F, fontWeight: 800, fontSize: n > 2 ? 18 : 24 },
        data: [{ value: Math.round((it.real / it.meta) * 100), name: it.sede, sede: it.sede, real: it.real, meta: it.meta }],
      })),
    });
  }

  /* Calendario de reservas */
  function calendario({ conteos, anios, vertical, rango }) {
    const datos = Object.entries(conteos);
    if (!datos.length) return vacio();
    const vals = datos.map(([, v]) => v).sort((a, b) => a - b), p95 = vals[Math.floor(vals.length * .95)] || 1;
    const cal = (i, y) => ({
      range: String(y), orient: vertical ? "vertical" : "horizontal",
      ...(vertical ? { left: anios.length > 1 ? (i ? "56%" : "10%") : "22%", width: anios.length > 1 ? "36%" : "62%", top: 40, bottom: 60, cellSize: ["auto", "auto"] }
        : { left: anios.length > 1 ? 40 : 24, right: 6, top: 28 + i * 132, cellSize: ["auto", anios.length > 1 ? 14 : 18] }),
      itemStyle: { borderColor: C.sand, borderWidth: 3, color: "#F1ECE0" }, splitLine: { show: false },
      dayLabel: { firstDay: 1, nameMap: ["D", "L", "M", "M", "J", "V", "S"], color: C.ink3, fontSize: 10, fontFamily: F },
      monthLabel: { nameMap: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], color: C.ink, fontSize: 11.5, fontFamily: F, fontWeight: 700 },
      yearLabel: { show: vertical, color: C.blue, fontFamily: F, fontWeight: 800, fontSize: 13 },
    });
    return base({
      tooltip: tooltip({ formatter: (p) => `<b>${fmt.fecha(p.value[0])}</b><br>${p.value[1]} reserva${p.value[1] === 1 ? "" : "s"}` }),
      visualMap: { show: false, min: 0, max: p95, inRange: { color: ["#EAF6FC", "#9ED8F2", C.aqua, C.blue, C.navy] } },
      graphic: vertical || anios.length < 2 ? [] : anios.map((y, i) => ({ type: "text", left: 0, top: 10 + i * 132, style: { text: String(y), fill: C.blue, font: `800 12px ${F}` } })),
      calendar: anios.map((y, i) => cal(i, y)),
      series: anios.map((y, i) => ({ type: "heatmap", coordinateSystem: "calendar", calendarIndex: i, data: datos.filter(([d]) => d.startsWith(String(y)) && d >= rango[0] && d <= rango[1]) })),
    });
  }

  function canales({ datos }) {
    const items = Object.entries(datos).sort((a, b) => a[1] - b[1]), tot = items.reduce((a, x) => a + x[1], 0);
    if (!tot) return vacio();
    return base({
      grid: { left: 4, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: tooltip({ formatter: (p) => `<b>${p.name}</b><br>${fmt.num(p.value)} reservas · ${((p.value / tot) * 100).toFixed(1)} %` }),
      xAxis: { type: "value", show: false },
      yAxis: cat(items.map(([n]) => n), { axisLine: { show: false }, axisLabel: { color: C.ink, fontSize: 12, fontWeight: 600, fontFamily: F } }),
      series: [{ type: "bar", barWidth: 14, data: items.map(([n, v]) => ({ value: v, itemStyle: { color: CANAL[n] || C.sky } })), label: { show: true, position: "right", formatter: (p) => `${Math.round((p.value / tot) * 100)} %`, color: C.ink, fontFamily: F, fontWeight: 800, fontSize: 12 } }],
    });
  }

  function antiguedad({ tramos, porSede, sedes }) {
    const s = sedes.filter((x) => porSede[x]);
    if (!s.length) return vacio("Sin saldos pendientes");
    return base({
      legend: leyenda({ top: 0, left: 0 }),
      grid: { left: 4, right: 16, top: 40, bottom: 4, containLabel: true },
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => `<b>${ps[0].name}</b><br>` + ps.map((p) => `${punto(p.color)}${p.seriesName} <b>${fmt.soles(p.value)}</b>`).join("<br>") }),
      xAxis: vy((v) => `S/ ${k(v)}`),
      yAxis: cat(s, { axisLabel: { color: C.ink, fontSize: 12, fontWeight: 700, fontFamily: F } }),
      series: tramos.map((t, i) => ({ name: t, type: "bar", stack: "a", barWidth: 18, data: s.map((x) => Math.round(porSede[x][t])), itemStyle: { color: TRAMOS[i] }, emphasis: { focus: "series" } })),
    });
  }

  function metodos({ datos }) {
    const items = Object.entries(datos).filter(([n, v]) => v > 0 && n !== "Sin pago");
    if (!items.length) return vacio();
    return base({
      tooltip: tooltip({ trigger: "item", formatter: (p) => `${punto(p.color)}<b>${p.name}</b><br>${fmt.soles(p.value)} · ${p.percent.toFixed(1)} %` }),
      legend: leyenda({ bottom: 0, left: "center", itemGap: 12 }),
      series: [{ type: "pie", roseType: "radius", radius: ["16%", "68%"], center: ["50%", "44%"], itemStyle: { borderColor: "#fff", borderWidth: 2 },
        label: { show: true, position: "inside", formatter: (p) => (p.percent >= 8 ? `${Math.round(p.percent)}%` : ""), color: "#fff", fontFamily: F, fontWeight: 800, fontSize: 11 },
        data: items.map(([n, v]) => ({ name: n, value: Math.round(v), itemStyle: { color: METODO[n] || C.sky } })) }],
    });
  }

  function socios({ meses, serie }) {
    if (!serie.some((s) => s.socios > 0 || s.altas > 0)) return vacio();
    const et = meses.map(fmt.mes);
    return base({
      legend: leyenda({ top: 0, left: 0 }),
      grid: [{ left: 4, right: 8, top: 52, height: "50%", containLabel: true }, { left: 4, right: 8, top: "76%", bottom: 4, containLabel: true }],
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: tooltip({ trigger: "axis" }),
      xAxis: [cat(et, { gridIndex: 0, axisLabel: { show: false } }), cat(et, { gridIndex: 1 })],
      yAxis: [vy((v) => v, { gridIndex: 0 }), vy((v) => v, { gridIndex: 1, splitNumber: 2 })],
      series: [
        ...Object.keys(PLAN).map((p) => ({ name: `Plan ${p}`, type: "line", stack: "s", smooth: true, symbol: "none", data: serie.map((s) => s.porPlan[p] || 0), lineStyle: { width: 1.5, color: PLAN[p] }, itemStyle: { color: PLAN[p] }, areaStyle: { color: PLAN[p], opacity: .78 }, emphasis: { focus: "series" } })),
        { name: "Altas", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: serie.map((s) => s.altas), barMaxWidth: 12, itemStyle: { color: C.green } },
        { name: "Renovaciones", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: serie.map((s) => s.renovaciones), barMaxWidth: 12, itemStyle: { color: C.sun } },
      ],
    });
  }

  function planes({ datos }) {
    const items = Object.entries(datos).filter(([, v]) => v > 0), tot = items.reduce((a, x) => a + x[1], 0);
    if (!tot) return vacio("Sin ventas de membresía en el periodo");
    return base({
      graphic: [{ type: "text", left: "center", top: "56%", style: { text: fmt.num(tot), font: `800 30px ${F}`, fill: C.ink, textAlign: "center" } }, { type: "text", left: "center", top: "67%", style: { text: "membresías vendidas", font: `500 12px ${F}`, fill: C.ink3, textAlign: "center" } }],
      tooltip: tooltip({ trigger: "item", formatter: (p) => `${punto(p.color)}<b>Plan ${p.name}</b><br>${fmt.num(p.value)} · ${p.percent.toFixed(1)} %` }),
      legend: leyenda({ bottom: 8, left: "center" }),
      series: [{ type: "pie", radius: ["58%", "90%"], center: ["50%", "68%"], startAngle: 180, endAngle: 360, itemStyle: { borderColor: "#fff", borderWidth: 3 },
        label: { show: true, position: "inside", formatter: (p) => (p.percent > 7 ? `${Math.round(p.percent)}%` : ""), color: "#fff", fontFamily: F, fontWeight: 800, fontSize: 12 },
        data: items.map(([n, v]) => ({ name: n, value: v, itemStyle: { color: PLAN[n] } })) }],
    });
  }

  function sankey({ links }) {
    if (!links.length) return vacio();
    const nombres = new Set(); links.forEach((l) => { nombres.add(l.source); nombres.add(l.target); });
    const color = (n) => ORIGEN[n] || SEDE[n] || SERVICIO[n] || C.sky;
    return base({
      tooltip: tooltip({ trigger: "item", formatter: (p) => (p.dataType === "edge" ? `${p.data.source} → ${p.data.target}<br><b>${fmt.num(p.value)}</b> personas` : `<b>${p.name}</b><br>${fmt.num(p.value)} personas`) }),
      series: [{ type: "sankey", left: 0, right: 132, top: 6, bottom: 6, nodeWidth: 12, nodeGap: 12, layoutIterations: 48, emphasis: { focus: "adjacency" },
        data: [...nombres].map((n) => ({ name: n, itemStyle: { color: color(n), borderWidth: 0 } })), links,
        lineStyle: { color: "gradient", curveness: .5, opacity: .28 }, label: { color: C.ink, fontSize: 12, fontWeight: 700, fontFamily: F } }],
    });
  }

  function npsSedes({ items }) {
    const s = items.filter((x) => x.n > 0);
    if (!s.length) return vacio("Sin encuestas en el periodo");
    const pc = (x, key) => +((x[key] / x.n) * 100).toFixed(0);
    return base({
      legend: leyenda({ top: 0, left: 0, data: ["Detractores", "Pasivos", "Promotores"] }),
      grid: { left: 4, right: 8, top: 40, bottom: 4, containLabel: true },
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => { const it = s[ps[0].dataIndex]; return `<b>${it.sede}</b> · NPS <b>${Math.round(it.valor)}</b><br>` + ps.map((p) => `${punto(p.color)}${p.seriesName} ${p.value} %`).join("<br>") + `<br><span style="opacity:.7">${it.n} respuestas</span>`; } }),
      xAxis: { type: "value", max: 100, show: false },
      yAxis: cat(s.map((x) => x.sede), { inverse: true, axisLine: { show: false }, axisLabel: { formatter: (v, i) => `{a|${v}}\n{b|NPS ${Math.round(s[i].valor)}}`, rich: { a: { color: C.ink, fontWeight: 800, fontSize: 12, fontFamily: F, lineHeight: 17 }, b: { color: C.blue, fontFamily: F, fontWeight: 700, fontSize: 11 } } } }),
      series: [["Detractores", "det", C.coral], ["Pasivos", "pas", C.grey], ["Promotores", "prom", C.green]].map(([n, key, col], j) => ({
        name: n, type: "bar", stack: "n", barWidth: 22, data: s.map((x) => pc(x, key)), itemStyle: { color: col },
        label: { show: true, formatter: (p) => (p.value >= 9 ? `${p.value}%` : ""), color: j === 1 ? C.ink2 : "#fff", fontFamily: F, fontWeight: 700, fontSize: 10.5 },
      })),
    });
  }

  function ocupacionNps({ bandas }) {
    const b = bandas.filter((x) => x.n > 0);
    if (!b.length) return vacio("Sin encuestas en el periodo");
    const col = (v) => (v >= 50 ? C.green : v >= 40 ? C.aqua : v >= 25 ? C.sun : C.coral);
    return base({
      grid: { left: 4, right: 4, top: 30, bottom: 30, containLabel: true },
      tooltip: tooltip({ trigger: "axis", formatter: (ps) => `<b>Ocupación ${ps[0].name}</b><br>NPS <b>${ps[0].value}</b><br>${b[ps[0].dataIndex].n} respuestas` }),
      xAxis: cat(b.map((x) => x.banda), { axisLabel: { color: C.ink, fontSize: 12, fontWeight: 600, interval: 0 }, name: "ocupación de la sede el día de la visita", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: C.ink3, fontSize: 11 } }),
      yAxis: { type: "value", show: false },
      series: [{ type: "bar", barWidth: "46%", data: b.map((x) => ({ value: Math.round(x.nps), itemStyle: { color: col(x.nps) } })), label: { show: true, position: "top", formatter: "NPS {c}", fontFamily: F, fontWeight: 800, color: C.ink, fontSize: 12 } }],
    });
  }

  function ocupacionHeat({ meses, sedes, celdas }) {
    if (!celdas.length) return vacio();
    return base({
      grid: { left: 4, right: 4, top: 6, bottom: 4, containLabel: true },
      tooltip: tooltip({ formatter: (p) => `<b>${sedes[p.value[1]]} · ${fmt.mes(meses[p.value[0]])}</b><br>Ocupación media <b>${p.value[2].toFixed(1)} %</b>` }),
      xAxis: cat(meses.map(fmt.mes), { splitArea: { show: false } }),
      yAxis: cat(sedes, { inverse: true, axisLine: { show: false }, axisLabel: { color: C.ink, fontSize: 12, fontWeight: 700 } }),
      visualMap: { show: false, min: 20, max: 85, inRange: { color: ["#EAF6FC", "#9ED8F2", C.aqua, C.blue, C.navy] } },
      series: [{ type: "heatmap", data: celdas.map((c) => ({ value: c, label: { color: c[2] < 45 ? C.ink : "#fff" } })), itemStyle: { borderColor: "#fff", borderWidth: 3 },
        label: { show: meses.length <= 14, formatter: (p) => Math.round(p.value[2]), fontSize: 10.5, fontFamily: F, fontWeight: 700 } }],
    });
  }

  /* Índice de calidad: tres arcos de sol (completitud, validez, consistencia) */
  function calidad({ dims, indice }) {
    const arcos = [["Completitud", C.green, "94%"], ["Validez", C.sun, "74%"], ["Consistencia", C.orange, "54%"]];
    const val = (n) => (dims.find((d) => d.nombre === n)?.valor ?? 1) * 100;
    return base({
      tooltip: tooltip({ formatter: (p) => `<b>${p.seriesName}</b> ${p.value.toFixed(2)} %` }),
      graphic: [{ type: "text", left: "center", bottom: 22, style: { text: `${(indice * 100).toFixed(1)} %`, font: `800 30px ${F}`, fill: "#fff", textAlign: "center" } }, { type: "text", left: "center", bottom: 4, style: { text: "índice global", font: `500 11px ${F}`, fill: "rgba(255,255,255,.65)", textAlign: "center" } }],
      series: arcos.map(([n, c, r]) => ({ name: n, type: "gauge", startAngle: 180, endAngle: 0, min: 98, max: 100, radius: r, center: ["50%", "70%"],
        progress: { show: true, width: 14, itemStyle: { color: c } }, axisLine: { lineStyle: { width: 14, color: [[1, "rgba(255,255,255,.1)"]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, title: { show: false }, detail: { show: false }, data: [{ value: Math.max(98, val(n)) }] })),
    });
  }

  /* Cara a cara: barras desde el centro */
  function cara({ a, b, sa, sb, ancho = 800 }) {
    const met = [["Facturación", "facturacion", (v) => fmt.soles(v)], ["Cobranza", "cobranza", (v) => fmt.pct(v, 0)], ["Ocupación", "ocupacion", (v) => (v == null ? "—" : `${v.toFixed(0)} %`)],
      ["NPS", "nps", (v) => (v == null ? "—" : Math.round(v))], ["Socios activos", "socios", fmt.num], ["Ticket promedio", "ticket", (v) => fmt.soles(v)]];
    const norm = (k2) => { const x = sa[k2] ?? 0, y = sb[k2] ?? 0; const off = k2 === "nps" ? 100 : 0; const m = Math.max(x + off, y + off, 1e-9); return [((x + off) / m) * 100, ((y + off) / m) * 100]; };
    const fila = met.map(([n, key]) => norm(key));
    const mejor = (i) => { const key = met[i][1]; return (sa[key] ?? -1e9) >= (sb[key] ?? -1e9) ? 0 : 1; };
    return base({
      tooltip: { show: false },
      grid: [{ left: "15%", width: "27%", top: 10, bottom: 10 }, { left: "58%", width: "27%", top: 10, bottom: 10 }],
      xAxis: [{ type: "value", inverse: true, max: 110, show: false }, { type: "value", gridIndex: 1, max: 110, show: false }],
      yAxis: [
        { type: "category", data: met.map((m) => m[0]), inverse: true, position: "right", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { margin: ancho * .08, align: "center", color: C.ink, fontFamily: F, fontWeight: 700, fontSize: 12.5 } },
        { type: "category", gridIndex: 1, data: met.map((m) => m[0]), inverse: true, show: false },
      ],
      series: [
        { type: "bar", data: fila.map((f, i) => ({ value: f[0], itemStyle: { color: SEDE[a], opacity: mejor(i) === 0 ? 1 : .45 } })), barWidth: 18, label: { show: true, position: "left", fontFamily: F, fontWeight: 800, color: C.ink, fontSize: 12, formatter: (p) => met[p.dataIndex][2](sa[met[p.dataIndex][1]]) } },
        { type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: fila.map((f, i) => ({ value: f[1], itemStyle: { color: SEDE[b], opacity: mejor(i) === 1 ? 1 : .45 } })), barWidth: 18, label: { show: true, position: "right", fontFamily: F, fontWeight: 800, color: C.ink, fontSize: 12, formatter: (p) => met[p.dataIndex][2](sb[met[p.dataIndex][1]]) } },
      ],
    });
  }

  function caraLinea({ meses, a, b, va, vb }) {
    return base({
      legend: leyenda({ top: 0, left: 0 }),
      grid: { left: 4, right: 12, top: 40, bottom: 4, containLabel: true },
      tooltip: tooltip({ trigger: "axis", valueFormatter: (v) => fmt.soles(v) }),
      xAxis: cat(meses.map(fmt.mes), { boundaryGap: false }),
      yAxis: vy((v) => `S/ ${k(v)}`),
      series: [[a, va], [b, vb]].map(([n, v]) => ({ name: n, type: "line", data: v, smooth: .3, symbol: "circle", symbolSize: 6, lineStyle: { width: 3, color: SEDE[n] }, itemStyle: { color: SEDE[n] }, areaStyle: { color: SEDE[n], opacity: .08 } })),
    });
  }

  return { C, SEDE, SERVICIO, PLAN, fmt, ingresos, mapa, servicios, metas, calendario, canales, antiguedad, metodos, socios, planes, sankey, npsSedes, ocupacionNps, ocupacionHeat, calidad, cara, caraLinea };
})();
