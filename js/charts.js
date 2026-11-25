/* Constructores de gráficos (Apache ECharts) con la identidad visual de Club El Tumi. */
window.TumiCharts = (() => {
  const C = {
    navy: "#0A2A5E", blue: "#1751A0", sky: "#0095C9", aqua: "#37BEE9", sun: "#FFCC00", lemon: "#F2E203",
    orange: "#F18E14", amber: "#E3A500", green: "#5DB130", coral: "#EF6F51", ink: "#10233F", ink2: "#44566F",
    ink3: "#7A889D", line: "#E2E9F2", grey: "#C9D3E0",
  };
  const SEDE = { Lima: C.blue, Chiclayo: C.orange, Ica: C.amber, Tarapoto: C.green };
  const SERVICIO = {
    "Entradas y piscinas": C.aqua, Hospedaje: C.blue, Camping: C.green, Restaurante: C.orange,
    Aventura: C.sun, Eventos: C.coral, "Membresía anual": C.navy,
  };
  const PLAN = { Individual: C.aqua, Familiar: C.blue, Corporativo: C.orange };
  const CANAL = { WhatsApp: "#25A55F", Presencial: C.blue, Web: C.aqua, "Redes sociales": C.coral, "Agencias y corporativo": C.orange };
  const METODO = { "Yape / Plin": "#7B3FBF", Tarjeta: C.blue, Efectivo: C.green, Transferencia: C.aqua };
  const TRAMOS = [C.aqua, C.sun, C.orange, C.coral, "#B42318"];
  const ORIGEN = { "Misma ciudad": "#8FA6C4", "Otras regiones": C.sky, Extranjero: C.navy };
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const FONT = "Montserrat, system-ui, sans-serif";
  const NUM = "Sora, Montserrat, sans-serif";

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
  };

  const tooltip = (extra = {}) => ({
    backgroundColor: "rgba(10,42,94,.96)", borderWidth: 0, padding: [10, 14], confine: true,
    textStyle: { color: "#fff", fontSize: 12, fontFamily: FONT },
    extraCssText: "border-radius:14px;box-shadow:0 12px 30px rgba(5,20,50,.3);", ...extra,
  });
  const base = (extra = {}) => ({
    textStyle: { fontFamily: FONT }, animationDuration: 1000, animationEasing: "cubicOut",
    animationDurationUpdate: 700, tooltip: tooltip(), ...extra,
  });
  const leyenda = (extra = {}) => ({ icon: "roundRect", itemWidth: 12, itemHeight: 8, itemGap: 14, textStyle: { color: C.ink2, fontSize: 11, fontFamily: FONT }, ...extra });
  const ejeValor = (formatter, extra = {}) => ({
    type: "value", axisLabel: { color: C.ink3, fontSize: 10, formatter, fontFamily: NUM },
    splitLine: { lineStyle: { color: C.line, type: "dashed" } }, ...extra,
  });
  const ejeCat = (data, extra = {}) => ({
    type: "category", data, axisTick: { show: false }, axisLine: { lineStyle: { color: C.line } },
    axisLabel: { color: C.ink3, fontSize: 10, fontFamily: FONT }, ...extra,
  });
  const grad = (a, b, horizontal = false) => new echarts.graphic.LinearGradient(0, 0, horizontal ? 1 : 0, horizontal ? 0 : 1, [{ offset: 0, color: a }, { offset: 1, color: b }]);
  const punto = (color) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:6px"></span>`;
  const compacto = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}k` : v);

  function vacio(texto = "Sin datos para estos filtros") {
    return { graphic: { type: "text", left: "center", top: "middle", style: { text: texto, fill: C.ink3, font: `600 13px ${FONT}` } }, series: [] };
  }

  /* 1 · Facturación vs cobranza + meta + pronóstico */
  function ingresos({ meses, serie, metas, prono }) {
    if (!serie.some((s) => s.facturacion > 0)) return vacio();
    const etiquetas = meses.map(fmt.mes);
    const futuros = prono ? prono.futuros.map((f) => fmt.mes(f.mes)) : [];
    const n = meses.length, total = n + futuros.length;
    const idxCorte = prono ? meses.indexOf(prono.mesCorte) : -1;
    const fact = serie.map((s, i) => ({
      value: Math.round(s.facturacion),
      itemStyle: i === idxCorte ? { color: grad("rgba(23,81,160,.75)", "rgba(55,190,233,.55)") } : undefined,
    }));
    const proyeccion = Array(total).fill(null);
    if (idxCorte >= 0) proyeccion[idxCorte] = Math.max(0, Math.round(prono.cierreEstimado - prono.parcial));
    const pron = Array(total).fill(null), bajo = Array(total).fill(null), rango = Array(total).fill(null);
    if (prono && idxCorte === n - 1) {
      pron[idxCorte] = Math.round(prono.cierreEstimado);
      bajo[idxCorte] = pron[idxCorte]; rango[idxCorte] = 0;
      prono.futuros.forEach((f, i) => {
        const v = f.valor;
        pron[n + i] = Math.round(v);
        bajo[n + i] = Math.round(v * (1 - prono.banda));
        rango[n + i] = Math.round(v * 2 * prono.banda);
      });
    }
    const metaSerie = meses.map((m) => (metas[m] ? Math.round(metas[m]) : null));
    return base({
      legend: leyenda({ top: 0, left: 0, data: ["Facturado", "Cobrado", "Meta", ...(prono && idxCorte === n - 1 ? ["Pronóstico IA"] : [])] }),
      grid: { left: 8, right: 12, top: 42, bottom: 6, containLabel: true },
      tooltip: tooltip({
        trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(55,190,233,.08)" } },
        formatter(ps) {
          const i = ps[0].dataIndex;
          if (i >= n) {
            const f = prono.futuros[i - n];
            return `<b>${futuros[i - n]} · pronóstico</b><br>${punto(C.orange)}Estimado: <b>${fmt.soles(f.valor)}</b><br>Rango: ${fmt.soles(f.valor * (1 - prono.banda))} – ${fmt.soles(f.valor * (1 + prono.banda))}`;
          }
          const s = serie[i];
          let h = `<b>${etiquetas[i]}${i === idxCorte ? " · mes en curso" : ""}</b><br>${punto(C.blue)}Facturado: <b>${fmt.soles(s.facturacion)}</b><br>${punto(C.green)}Cobrado: <b>${fmt.soles(s.cobrado)}</b> (${fmt.pct(s.cobranza)})`;
          if (metaSerie[i]) h += `<br>${punto(C.orange)}Meta: ${fmt.soles(metaSerie[i])} · cumplimiento ${fmt.pct(s.facturacion / metaSerie[i], 0)}`;
          if (i === idxCorte) h += `<br><span style="opacity:.75">Proyección al cierre: ${fmt.soles(prono.cierreEstimado)}</span>`;
          return h;
        },
      }),
      xAxis: ejeCat([...etiquetas, ...futuros], { axisLabel: { color: C.ink3, fontSize: 10, hideOverlap: true } }),
      yAxis: ejeValor((v) => `S/ ${compacto(v)}`),
      series: [
        { name: "Facturado", type: "bar", stack: "f", data: [...fact, ...Array(futuros.length).fill(null)], barMaxWidth: 26, itemStyle: { color: grad(C.blue, C.aqua), borderRadius: [0, 0, 0, 0] }, emphasis: { itemStyle: { color: grad(C.navy, C.blue) } } },
        { name: "Proyección del mes", type: "bar", stack: "f", data: proyeccion, barMaxWidth: 26, itemStyle: { color: "rgba(55,190,233,.18)", borderColor: C.aqua, borderType: "dashed", borderWidth: 1, borderRadius: [8, 8, 0, 0] }, tooltip: { show: false } },
        { name: "Cobrado", type: "line", data: serie.map((s) => Math.round(s.cobrado)), smooth: true, symbol: "circle", symbolSize: 7, lineStyle: { width: 3, color: C.green }, itemStyle: { color: C.green, borderColor: "#fff", borderWidth: 2 }, z: 5 },
        { name: "Meta", type: "scatter", data: metaSerie, symbol: "rect", symbolSize: [30, 4], itemStyle: { color: C.orange, borderColor: "#fff", borderWidth: 1 }, z: 7 },
        { name: "banda-base", type: "line", data: bajo, stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, tooltip: { show: false }, silent: true },
        { name: "Rango de confianza", type: "line", data: rango, stack: "banda", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: "rgba(255,204,0,.28)" }, tooltip: { show: false }, silent: true },
        { name: "Pronóstico IA", type: "line", data: pron, symbol: "emptyCircle", symbolSize: 8, lineStyle: { width: 3, type: [8, 6], color: "#E08A00" }, itemStyle: { color: "#E08A00" }, z: 6,
          markArea: futuros.length && idxCorte === n - 1 ? { silent: true, itemStyle: { color: "rgba(255,204,0,.06)" }, label: { show: true, position: "insideTop", color: "#A55A00", fontSize: 10, fontWeight: 700, formatter: "Pronóstico" }, data: [[{ xAxis: futuros[0] }, { xAxis: futuros[futuros.length - 1] }]] } : undefined },
      ],
    });
  }

  /* 2 · Mapa del Perú con las sedes */
  let mapaRegistrado = false;
  function mapa({ geo, sedes, valores, activas }) {
    if (!mapaRegistrado) { echarts.registerMap("peru", geo); mapaRegistrado = true; }
    const max = Math.max(1, ...Object.values(valores).map((v) => v.facturacion));
    const lima = sedes.find((s) => s.sede === "Lima");
    const datos = sedes.map((s) => {
      const v = valores[s.sede] || { facturacion: 0 };
      const activa = activas.includes(s.sede);
      return {
        name: s.sede, value: [s.lon, s.lat, v.facturacion],
        symbolSize: 12 + 24 * Math.sqrt(v.facturacion / max),
        itemStyle: { color: SEDE[s.sede], opacity: activa ? 1 : .25, borderColor: "#fff", borderWidth: 2, shadowBlur: 12, shadowColor: "rgba(10,42,94,.35)" },
        label: { opacity: activa ? 1 : .4, position: { Lima: "left", Chiclayo: "left", Ica: "right", Tarapoto: "right" }[s.sede] || "right" },
      };
    });
    return base({
      tooltip: tooltip({
        formatter(p) {
          if (p.seriesType !== "effectScatter") return "";
          const v = valores[p.name] || {};
          return `<b>${p.name}</b><br>Facturación: <b>${fmt.soles(v.facturacion)}</b><br>Reservas: ${fmt.num(v.reservas)}<br>Ocupación media: ${v.ocupacion == null ? "—" : v.ocupacion.toFixed(0) + " %"}<br>NPS: ${v.nps == null ? "—" : Math.round(v.nps)}<br><span style="opacity:.7">Clic para filtrar</span>`;
        },
      }),
      geo: {
        map: "peru", roam: false, silent: true, top: 18, bottom: 18, left: "center", aspectScale: .96,
        itemStyle: { areaColor: grad("#EAF6FD", "#CFEAF9"), borderColor: C.aqua, borderWidth: 1.5, shadowColor: "rgba(23,81,160,.18)", shadowBlur: 18, shadowOffsetY: 6 },
      },
      series: [
        {
          type: "lines", coordinateSystem: "geo", zlevel: 1, silent: true,
          effect: { show: true, period: 4, trailLength: .35, symbol: "circle", symbolSize: 4, color: C.sun },
          lineStyle: { color: C.aqua, width: 1.4, opacity: .55, curveness: .28 },
          data: lima ? sedes.filter((s) => s.sede !== "Lima").map((s) => ({ coords: [[lima.lon, lima.lat], [s.lon, s.lat]] })) : [],
        },
        {
          type: "effectScatter", coordinateSystem: "geo", zlevel: 2, data: datos, cursor: "pointer",
          rippleEffect: { brushType: "stroke", scale: 3, period: 3.5 },
          label: { show: true, formatter: "{b}", distance: 8, color: C.ink, fontWeight: 700, fontSize: 12, fontFamily: FONT, textBorderColor: "#fff", textBorderWidth: 3 },
        },
      ],
    });
  }

  /* 3 · Mix de ingresos por servicio */
  function servicios({ datos, total }) {
    const items = Object.entries(datos).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!items.length) return vacio();
    return base({
      title: { text: fmt.soles(total), subtext: "Total facturado", left: "center", top: "37%", textStyle: { fontFamily: NUM, fontSize: 18, fontWeight: 700, color: C.ink }, subtextStyle: { fontSize: 10, color: C.ink3, fontFamily: FONT }, itemGap: 2 },
      tooltip: tooltip({ trigger: "item", formatter: (p) => `${punto(p.color)}<b>${p.name}</b><br>${fmt.soles(p.value)} · ${p.percent.toFixed(1)} %` }),
      legend: leyenda({ bottom: 0, left: "center", icon: "circle", itemWidth: 8, itemGap: 8, textStyle: { color: C.ink2, fontSize: 10 } }),
      series: [{
        type: "pie", radius: ["50%", "74%"], center: ["50%", "44%"], padAngle: 2,
        itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, formatter: (p) => (p.percent >= 6 ? `${p.percent.toFixed(0)}%` : ""), color: C.ink2, fontSize: 10, fontFamily: NUM, fontWeight: 600 },
        labelLine: { length: 6, length2: 6, lineStyle: { color: C.line } },
        emphasis: { scaleSize: 8 },
        data: items.map(([k, v]) => ({ name: k, value: Math.round(v), itemStyle: { color: SERVICIO[k] } })),
      }],
    });
  }

  /* 4 · Radar comparativo */
  function radar({ stats }) {
    const sedes = Object.keys(stats);
    if (!sedes.length) return vacio();
    const dims = [
      ["Facturación", (s) => s.facturacion], ["Cobranza", (s) => s.cobranza ?? 0], ["Ocupación", (s) => s.ocupacion ?? 0],
      ["NPS", (s) => ((s.nps ?? 0) + 100) / 2], ["Socios", (s) => s.socios], ["Ticket", (s) => s.ticket ?? 0],
    ];
    const max = dims.map(([, f]) => Math.max(1e-9, ...sedes.map((k) => f(stats[k]))));
    return base({
      tooltip: tooltip({
        trigger: "item",
        formatter(p) {
          const s = stats[p.name];
          return `<b>${p.name}</b><br>Facturación: ${fmt.soles(s.facturacion)}<br>Cobranza: ${fmt.pct(s.cobranza)}<br>Ocupación: ${s.ocupacion == null ? "—" : s.ocupacion.toFixed(0) + " %"}<br>NPS: ${s.nps == null ? "—" : Math.round(s.nps)}<br>Socios activos: ${fmt.num(s.socios)}<br>Ticket promedio: ${fmt.soles(s.ticket)}`;
        },
      }),
      legend: leyenda({ bottom: 0, left: "center", icon: "circle", itemWidth: 8 }),
      radar: {
        center: ["50%", "47%"], radius: "64%", splitNumber: 4,
        indicator: dims.map(([n]) => ({ name: n, max: 100 })),
        axisName: { color: C.ink2, fontSize: 10, fontWeight: 600, fontFamily: FONT },
        splitArea: { areaStyle: { color: ["#FAFCFE", "#F2F7FC"] } },
        splitLine: { lineStyle: { color: C.line } }, axisLine: { lineStyle: { color: C.line } },
      },
      series: [{
        type: "radar", symbol: "circle", symbolSize: 5,
        data: sedes.map((k) => ({
          name: k, value: dims.map(([, f], i) => Math.round((f(stats[k]) / max[i]) * 100)),
          lineStyle: { color: SEDE[k], width: 2 }, itemStyle: { color: SEDE[k] }, areaStyle: { color: SEDE[k], opacity: .12 },
        })),
      }],
    });
  }

  /* 5 · Cumplimiento de meta (medidores) */
  function metas({ items }) {
    if (!items.length) return vacio("Sin metas para este periodo");
    const pos = {
      1: [["50%", "52%"]], 2: [["27%", "50%"], ["73%", "50%"]],
      3: [["25%", "30%"], ["75%", "30%"], ["50%", "76%"]], 4: [["25%", "28%"], ["75%", "28%"], ["25%", "76%"], ["75%", "76%"]],
    }[items.length];
    const radio = items.length === 1 ? "78%" : items.length === 2 ? "56%" : "40%";
    return base({
      tooltip: tooltip({ formatter: (p) => `<b>${p.data.sede}</b><br>Real: ${fmt.soles(p.data.real)}<br>Meta: ${fmt.soles(p.data.meta)}<br>Cumplimiento: <b>${p.value} %</b>` }),
      series: items.map((it, i) => ({
        type: "gauge", center: pos[i], radius: radio, startAngle: 215, endAngle: -35, min: 0, max: 120,
        progress: { show: true, roundCap: true, width: items.length > 2 ? 9 : 13, itemStyle: { color: SEDE[it.sede] } },
        axisLine: { roundCap: true, lineStyle: { width: items.length > 2 ? 9 : 13, color: [[1, "#EDF2F8"]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        anchor: { show: false },
        title: { offsetCenter: [0, items.length > 2 ? "68%" : "62%"], color: C.ink2, fontSize: 11, fontWeight: 700, fontFamily: FONT },
        detail: { offsetCenter: [0, "4%"], valueAnimation: true, formatter: "{value}%", color: C.ink, fontFamily: NUM, fontWeight: 700, fontSize: items.length > 2 ? 16 : 24 },
        data: [{ value: Math.round((it.real / it.meta) * 100), name: it.sede, sede: it.sede, real: it.real, meta: it.meta }],
      })),
    });
  }

  /* 6 · Calendario de calor */
  function calendario({ conteos, anios, vertical, rango }) {
    const datos = Object.entries(conteos);
    if (!datos.length) return vacio();
    const valores = datos.map(([, v]) => v).sort((a, b) => a - b);
    const p95 = valores[Math.floor(valores.length * .95)] || 1;
    const cal = (i, y) => ({
      range: String(y), orient: vertical ? "vertical" : "horizontal",
      ...(vertical
        ? { left: anios.length > 1 ? (i === 0 ? "10%" : "56%") : "22%", width: anios.length > 1 ? "36%" : "62%", top: 40, bottom: 70, cellSize: ["auto", "auto"] }
        : { left: anios.length > 1 ? 36 : 22, right: 12, top: 26 + i * 140, cellSize: ["auto", anios.length > 1 ? 14 : 18] }),
      itemStyle: { borderColor: "#fff", borderWidth: 2, color: "#F5F8FB" }, splitLine: { show: false },
      dayLabel: { firstDay: 1, nameMap: ["D", "L", "M", "M", "J", "V", "S"], color: C.ink3, fontSize: 9, fontFamily: FONT },
      monthLabel: { nameMap: MESES, color: C.ink2, fontSize: 10, fontFamily: FONT, fontWeight: 600 },
      yearLabel: { show: vertical, color: C.blue, fontFamily: NUM, fontWeight: 700, fontSize: 13, margin: vertical ? 22 : 26 },
    });
    return base({
      tooltip: tooltip({ formatter: (p) => `<b>${fmt.fecha(p.value[0])}</b><br>${p.value[1]} reserva${p.value[1] === 1 ? "" : "s"}` }),
      visualMap: {
        min: 0, max: p95, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 140,
        text: ["Más", "Menos"], textStyle: { color: C.ink3, fontSize: 10 },
        inRange: { color: ["#E6F4FC", "#9ED8F2", C.aqua, C.blue, C.navy] },
      },
      calendar: anios.map((y, i) => cal(i, y)),
      graphic: vertical || anios.length < 2 ? [] : anios.map((y, i) => ({ type: "text", left: 0, top: 10 + i * 140, style: { text: String(y), fill: C.blue, font: `700 12px ${NUM}` } })),
      series: anios.map((y, i) => ({
        type: "heatmap", coordinateSystem: "calendar", calendarIndex: i,
        data: datos.filter(([d]) => d.startsWith(String(y)) && d >= rango[0] && d <= rango[1]),
      })),
    });
  }

  /* 7 · Canales de reserva */
  function canales({ datos }) {
    const items = Object.entries(datos).sort((a, b) => a[1] - b[1]);
    const tot = items.reduce((a, x) => a + x[1], 0);
    if (!tot) return vacio();
    return base({
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      tooltip: tooltip({ formatter: (p) => `<b>${p.name}</b><br>${fmt.num(p.value)} reservas · ${(p.value / tot * 100).toFixed(1)} %` }),
      xAxis: { type: "value", show: false },
      yAxis: ejeCat(items.map(([k]) => k), { axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 11, fontWeight: 600, fontFamily: FONT } }),
      series: [{
        type: "bar", barWidth: 18, showBackground: true, backgroundStyle: { color: "#F2F6FA", borderRadius: 10 },
        data: items.map(([k, v]) => ({ value: v, itemStyle: { color: grad(CANAL[k] || C.sky, CANAL[k] || C.sky, true), borderRadius: 10 } })),
        label: { show: true, position: "right", formatter: (p) => `${(p.value / tot * 100).toFixed(0)} %`, color: C.ink, fontFamily: NUM, fontWeight: 700, fontSize: 11 },
      }],
    });
  }

  /* 8 · Antigüedad de la cartera */
  function antiguedad({ tramos, porSede, sedes }) {
    const s = sedes.filter((x) => porSede[x]);
    if (!s.length) return vacio("Sin saldos pendientes");
    return base({
      legend: leyenda({ top: 0, left: 0 }),
      grid: { left: 8, right: 16, top: 40, bottom: 4, containLabel: true },
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => `<b>${ps[0].name}</b><br>` + ps.map((p) => `${punto(p.color)}${p.seriesName}: <b>${fmt.soles(p.value)}</b>`).join("<br>") }),
      xAxis: ejeValor((v) => `S/ ${compacto(v)}`),
      yAxis: ejeCat(s, { axisLabel: { color: C.ink2, fontSize: 11, fontWeight: 600, fontFamily: FONT } }),
      series: tramos.map((t, i) => ({
        name: t, type: "bar", stack: "a", barWidth: 22, data: s.map((x) => Math.round(porSede[x][t])),
        itemStyle: { color: TRAMOS[i], borderColor: "#fff", borderWidth: 1 }, emphasis: { focus: "series" },
      })),
    });
  }

  /* 9 · Medios de pago */
  function metodos({ datos }) {
    const items = Object.entries(datos).filter(([k, v]) => v > 0 && k !== "Sin pago");
    if (!items.length) return vacio();
    return base({
      tooltip: tooltip({ trigger: "item", formatter: (p) => `${punto(p.color)}<b>${p.name}</b><br>${fmt.soles(p.value)} · ${p.percent.toFixed(1)} %` }),
      legend: leyenda({ bottom: 0, left: "center", icon: "circle", itemWidth: 8, itemGap: 8, textStyle: { fontSize: 10, color: C.ink2 } }),
      series: [{
        type: "pie", roseType: "radius", radius: ["16%", "70%"], center: ["50%", "44%"],
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, position: "inside", formatter: (p) => (p.percent >= 8 ? `${Math.round(p.percent)}%` : ""), fontFamily: NUM, fontSize: 10, fontWeight: 700, color: "#fff" },
        data: items.map(([k, v]) => ({ name: k, value: Math.round(v), itemStyle: { color: METODO[k] || C.sky } })),
      }],
    });
  }

  /* 10 · Socios activos por plan + altas y renovaciones (dos paneles con el mismo eje de meses) */
  function socios({ meses, serie }) {
    if (!serie.some((s) => s.socios > 0 || s.altas > 0)) return vacio();
    const et = meses.map(fmt.mes);
    const planes = Object.keys(PLAN);
    return base({
      legend: leyenda({ top: 0, left: 0 }),
      grid: [{ left: 8, right: 8, top: 58, height: "48%", containLabel: true }, { left: 8, right: 8, top: "74%", bottom: 6, containLabel: true }],
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: tooltip({ trigger: "axis" }),
      xAxis: [
        ejeCat(et, { gridIndex: 0, axisLabel: { show: false } }),
        ejeCat(et, { gridIndex: 1, axisLabel: { color: C.ink3, fontSize: 10, hideOverlap: true } }),
      ],
      yAxis: [
        ejeValor((v) => v, { gridIndex: 0, name: "Socios activos", nameTextStyle: { color: C.ink3, fontSize: 10, align: "left" } }),
        ejeValor((v) => v, { gridIndex: 1, splitNumber: 2, name: "Altas y renovaciones", nameTextStyle: { color: C.ink3, fontSize: 10, align: "left" } }),
      ],
      series: [
        ...planes.map((p) => ({
          name: `Plan ${p}`, type: "line", stack: "s", smooth: true, symbol: "none", data: serie.map((s) => s.porPlan[p] || 0),
          lineStyle: { width: 1.5, color: PLAN[p] }, itemStyle: { color: PLAN[p] }, areaStyle: { color: grad(PLAN[p], "rgba(255,255,255,.25)"), opacity: .9 },
          emphasis: { focus: "series" },
        })),
        { name: "Altas", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: serie.map((s) => s.altas), barMaxWidth: 12, itemStyle: { color: C.green, borderRadius: [4, 4, 0, 0] } },
        { name: "Renovaciones", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: serie.map((s) => s.renovaciones), barMaxWidth: 12, itemStyle: { color: C.sun, borderRadius: [4, 4, 0, 0] } },
      ],
    });
  }

  /* 11 · Planes de membresía (media dona) */
  function planes({ datos }) {
    const items = Object.entries(datos).filter(([, v]) => v > 0);
    const tot = items.reduce((a, x) => a + x[1], 0);
    if (!tot) return vacio("Sin ventas de membresía en el periodo");
    return base({
      title: { text: fmt.num(tot), subtext: "membresías vendidas", left: "center", top: "52%", textStyle: { fontFamily: NUM, fontSize: 26, fontWeight: 700, color: C.ink }, subtextStyle: { fontSize: 11, color: C.ink3 }, itemGap: 2 },
      tooltip: tooltip({ trigger: "item", formatter: (p) => `${punto(p.color)}<b>Plan ${p.name}</b><br>${fmt.num(p.value)} membresías · ${p.percent.toFixed(1)} %` }),
      legend: leyenda({ bottom: 6, left: "center", icon: "circle", itemWidth: 8 }),
      series: [{
        type: "pie", radius: ["58%", "92%"], center: ["50%", "66%"], startAngle: 180, endAngle: 360, padAngle: 2,
        itemStyle: { borderRadius: 10, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, position: "inside", formatter: (p) => (p.percent > 7 ? `${p.percent.toFixed(0)}%` : ""), color: "#fff", fontFamily: NUM, fontWeight: 700, fontSize: 12 },
        data: items.map(([k, v]) => ({ name: k, value: v, itemStyle: { color: PLAN[k] } })),
      }],
    });
  }

  /* 12 · Flujo origen → sede → servicio */
  function sankey({ links }) {
    if (!links.length) return vacio();
    const nombres = new Set();
    links.forEach((l) => { nombres.add(l.source); nombres.add(l.target); });
    const color = (n) => ORIGEN[n] || SEDE[n] || SERVICIO[n] || C.sky;
    return base({
      tooltip: tooltip({ trigger: "item", formatter: (p) => (p.dataType === "edge" ? `${p.data.source} → ${p.data.target}<br><b>${fmt.num(p.value)}</b> personas` : `<b>${p.name}</b><br>${fmt.num(p.value)} personas`) }),
      series: [{
        type: "sankey", left: 8, right: 120, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 12, layoutIterations: 48,
        draggable: false, emphasis: { focus: "adjacency" },
        data: [...nombres].map((n) => ({ name: n, itemStyle: { color: color(n), borderRadius: 4 } })),
        links, lineStyle: { color: "gradient", curveness: .5, opacity: .32 },
        label: { color: C.ink, fontSize: 11, fontWeight: 600, fontFamily: FONT },
      }],
    });
  }

  /* 13 · NPS por sede (barras divergentes al 100 %) */
  function npsSedes({ items }) {
    const s = items.filter((x) => x.n > 0);
    if (!s.length) return vacio("Sin encuestas en el periodo");
    const pctOf = (x, k) => +(x[k] / x.n * 100).toFixed(1);
    return base({
      legend: leyenda({ top: 0, left: 0, data: ["Detractores", "Pasivos", "Promotores"] }),
      grid: { left: 8, right: 14, top: 40, bottom: 6, containLabel: true },
      tooltip: tooltip({ trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => { const it = s[ps[0].dataIndex]; return `<b>${it.sede}</b> · NPS <b>${Math.round(it.valor)}</b><br>` + ps.map((p) => `${punto(p.color)}${p.seriesName}: ${p.value} %`).join("<br>") + `<br><span style="opacity:.7">${it.n} respuestas</span>`; } }),
      xAxis: { type: "value", max: 100, show: false },
      yAxis: ejeCat(s.map((x) => x.sede), {
        inverse: true, axisLine: { show: false },
        axisLabel: {
          formatter: (v, i) => `{a|${v}}\n{b|NPS ${Math.round(s[i].valor)}}`,
          rich: { a: { color: C.ink, fontWeight: 700, fontSize: 12, fontFamily: FONT, lineHeight: 18 }, b: { color: C.blue, fontFamily: NUM, fontWeight: 700, fontSize: 11 } },
        },
      }),
      series: [
        ["Detractores", "det", C.coral], ["Pasivos", "pas", C.grey], ["Promotores", "prom", C.green],
      ].map(([n, k, col], j) => ({
        name: n, type: "bar", stack: "n", barWidth: 26, data: s.map((x) => pctOf(x, k)),
        itemStyle: { color: col, borderRadius: j === 0 ? [8, 0, 0, 8] : j === 2 ? [0, 8, 8, 0] : 0 },
        label: { show: true, formatter: (p) => (p.value >= 9 ? `${Math.round(p.value)}%` : ""), color: j === 1 ? C.ink2 : "#fff", fontFamily: NUM, fontWeight: 700, fontSize: 10 },
      })),
    });
  }

  /* 14 · NPS según ocupación */
  function ocupacionNps({ bandas }) {
    const b = bandas.filter((x) => x.n > 0);
    if (!b.length) return vacio("Sin encuestas en el periodo");
    const colorDe = (v) => (v >= 55 ? C.green : v >= 40 ? C.aqua : v >= 25 ? C.sun : C.coral);
    return base({
      legend: leyenda({ top: 0, left: 0, data: ["NPS", "Respuestas"] }),
      grid: { left: 8, right: 8, top: 40, bottom: 6, containLabel: true },
      tooltip: tooltip({ trigger: "axis", formatter: (ps) => `<b>Ocupación ${ps[0].name}</b><br>` + ps.map((p) => `${punto(p.color)}${p.seriesName}: <b>${Math.round(p.value)}</b>`).join("<br>") }),
      xAxis: ejeCat(b.map((x) => x.banda), { axisLabel: { color: C.ink2, fontSize: 11, fontWeight: 600 }, name: "Ocupación de la sede el día de la visita", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: C.ink3, fontSize: 10 } }),
      yAxis: [ejeValor((v) => v), ejeValor((v) => v, { splitLine: { show: false } })],
      series: [
        { name: "NPS", type: "bar", barWidth: "46%", data: b.map((x) => ({ value: Math.round(x.nps), itemStyle: { color: colorDe(x.nps), borderRadius: x.nps >= 0 ? [10, 10, 0, 0] : [0, 0, 10, 10] } })), label: { show: true, position: "top", formatter: "{c}", fontFamily: NUM, fontWeight: 700, color: C.ink, fontSize: 13 } },
        { name: "Respuestas", type: "line", yAxisIndex: 1, data: b.map((x) => x.n), smooth: true, symbol: "circle", symbolSize: 7, lineStyle: { color: C.ink3, width: 2, type: "dashed" }, itemStyle: { color: C.ink3 } },
      ],
    });
  }

  /* 15 · Ocupación por mes y sede */
  function ocupacionHeat({ meses, sedes, celdas }) {
    if (!celdas.length) return vacio();
    return base({
      grid: { left: 8, right: 8, top: 8, bottom: 52, containLabel: true },
      tooltip: tooltip({ formatter: (p) => `<b>${sedes[p.value[1]]} · ${fmt.mes(meses[p.value[0]])}</b><br>Ocupación media: <b>${p.value[2].toFixed(1)} %</b>` }),
      xAxis: ejeCat(meses.map(fmt.mes), { splitArea: { show: false }, axisLabel: { color: C.ink3, fontSize: 10, hideOverlap: true } }),
      yAxis: ejeCat(sedes, { inverse: true, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 11, fontWeight: 600 } }),
      visualMap: { min: 20, max: 90, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 140, text: ["Lleno", "Holgado"], textStyle: { color: C.ink3, fontSize: 10 }, inRange: { color: ["#E6F4FC", "#9ED8F2", C.aqua, C.blue, C.navy] } },
      series: [{
        type: "heatmap", data: celdas.map((c) => ({ value: c, label: { color: c[2] < 45 ? C.ink : "#fff" } })), itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 6 },
        label: { show: meses.length <= 14, formatter: (p) => Math.round(p.value[2]), fontSize: 10, fontFamily: NUM, fontWeight: 600 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(10,42,94,.35)" } },
      }],
    });
  }

  /* 16 · Índice de calidad (anillo) */
  function calidad({ indice }) {
    const v = +(indice * 100).toFixed(1);
    const col = v >= 98 ? ["#6EE37F", C.aqua] : v >= 95 ? [C.sun, C.orange] : [C.coral, C.orange];
    return base({
      series: [{
        type: "gauge", startAngle: 90, endAngle: -270, min: 0, max: 100, radius: "90%", center: ["50%", "52%"],
        progress: { show: true, roundCap: true, width: 14, itemStyle: { color: grad(col[0], col[1], true) } },
        axisLine: { lineStyle: { width: 14, color: [[1, "rgba(255,255,255,.12)"]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        title: { offsetCenter: [0, "30%"], color: "rgba(255,255,255,.7)", fontSize: 11, fontFamily: FONT },
        detail: { offsetCenter: [0, "-6%"], valueAnimation: true, formatter: "{value}%", color: "#fff", fontFamily: NUM, fontWeight: 700, fontSize: 30 },
        data: [{ value: v, name: "Índice global" }],
      }],
    });
  }

  return { C, SEDE, SERVICIO, PLAN, fmt, ingresos, mapa, servicios, radar, metas, calendario, canales, antiguedad, metodos, socios, planes, sankey, npsSedes, ocupacionNps, ocupacionHeat, calidad };
})();
