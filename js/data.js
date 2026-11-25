/* Capa de datos: carga (Google Sheets o CSV local), limpieza, reglas de calidad y métricas.
 * Todas las definiciones de KPI viven aquí para que cada gráfico use exactamente el mismo cálculo.
 */
window.TumiData = (() => {
  const CFG = window.TUMI_CONFIG;
  const SEDES = ["Lima", "Chiclayo", "Ica", "Tarapoto"];
  const SERVICIOS = ["Entradas y piscinas", "Hospedaje", "Camping", "Restaurante", "Aventura", "Eventos", "Membresía anual"];
  const TIPOS_CLIENTE = ["Socio", "Visitante", "Corporativo"];
  const PLANES = ["Individual", "Familiar", "Corporativo"];
  const CANALES = ["WhatsApp", "Presencial", "Web", "Redes sociales", "Agencias y corporativo"];
  const ORIGENES = ["Misma ciudad", "Otras regiones", "Extranjero"];
  const INICIO_DATOS = "2025-01-01";
  const NUMERICOS = ["personas", "noches", "precio_unitario", "descuento_pct", "monto_total", "monto_pagado", "saldo_pendiente", "ocupacion_sede_pct", "calificacion_nps"];
  const corte = CFG.fechaCorte || new Date().toISOString().slice(0, 10);

  /* ---------- Utilidades de fecha ---------- */
  const ms = (iso) => Date.parse(iso + "T00:00:00Z");
  const addDays = (iso, n) => new Date(ms(iso) + n * 864e5).toISOString().slice(0, 10);
  const diffDays = (a, b) => Math.round((ms(a) - ms(b)) / 864e5);
  const addYears = (iso, n) => `${+iso.slice(0, 4) + n}${iso.slice(4)}`;
  function meses(desde, hasta) {
    const out = [];
    let y = +desde.slice(0, 4), m = +desde.slice(5, 7);
    const fy = +hasta.slice(0, 4), fm = +hasta.slice(5, 7);
    while (y < fy || (y === fy && m <= fm)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  const finDeMes = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const sumarMeses = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

  /* ---------- Lectura ---------- */
  function parseCSV(texto) {
    const filas = [];
    let campo = "", fila = [], comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') comillas = false;
        else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === ",") { fila.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        fila.push(campo); campo = "";
        if (fila.some((v) => v !== "")) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    if (campo !== "" || fila.length) { fila.push(campo); if (fila.some((v) => v !== "")) filas.push(fila); }
    const [enc, ...cuerpo] = filas;
    const claves = enc.map((h) => h.trim());
    return cuerpo.map((f) => Object.fromEntries(claves.map((k, j) => [k, (f[j] ?? "").trim()])));
  }

  async function texto(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} al leer ${url}`);
    return r.text();
  }
  const urlSheets = (id, pestana) =>
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(pestana)}`;

  function numero(v) {
    if (v === "" || v == null) return null;
    let s = String(v).replace(/[S/\s%]/g, "");
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function fecha(v) {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v;
  }

  async function cargar() {
    const id = new URLSearchParams(location.search).get("sheet") || CFG.googleSheetId;
    const P = CFG.pestanas;
    let fuente = "demo", crudos = null;
    if (id) {
      try {
        crudos = await Promise.all([P.registros, P.sedes, P.metas, P.diccionario].map((p) => texto(urlSheets(id, p))));
        fuente = "sheets";
      } catch (e) {
        console.warn("No se pudo leer Google Sheets, se usa el respaldo local:", e);
        fuente = "respaldo";
      }
    }
    if (!crudos) crudos = await Promise.all(["registros", "sedes", "metas_mensuales", "diccionario_datos"].map((n) => texto(`data/${n}.csv`)));
    const geo = await fetch("data/peru.geo.json").then((r) => r.json());
    const [registrosCrudos, sedes, metas, diccionario] = crudos.map(parseCSV);
    const calidad = evaluarCalidad(registrosCrudos, diccionario);
    const registros = registrosCrudos.map(normalizar);
    return { fuente, registros, sedes: sedes.map((s) => ({ ...s, lat: +s.lat, lon: +s.lon })), metas: metas.map((m) => ({ ...m, meta_facturacion: numero(m.meta_facturacion), meta_altas_socios: numero(m.meta_altas_socios) })), diccionario, calidad, geo, cargado: new Date() };
  }

  function normalizar(r) {
    const o = { ...r };
    const sede = SEDES.find((s) => s.toLowerCase() === (r.sede || "").trim().toLowerCase());
    o.sede = sede || r.sede;
    NUMERICOS.forEach((k) => { o[k] = numero(r[k]); });
    ["personas", "noches", "precio_unitario", "descuento_pct", "monto_total", "monto_pagado", "saldo_pendiente"].forEach((k) => { if (o[k] == null) o[k] = 0; });
    ["fecha_registro", "fecha_visita", "fecha_vencimiento"].forEach((k) => { o[k] = fecha(r[k]); });
    o.mes = o.fecha_registro.slice(0, 7);
    o.esMembresia = o.servicio === "Membresía anual";
    return o;
  }

  /* ---------- Gobernanza: reglas de calidad ---------- */
  function evaluarCalidad(filas, diccionario) {
    const obligatorios = diccionario.filter((d) => d.obligatorio === "Sí").map((d) => d.campo);
    const total = filas.length;
    const ids = {};
    filas.forEach((f) => { ids[f.id_registro] = (ids[f.id_registro] || 0) + 1; });
    let celdasVacias = 0;
    const reglas = [
      { id: "completitud", nombre: "Campos obligatorios completos", detalle: `${obligatorios.length} campos obligatorios por registro`, dimension: "Completitud", fallas: [] },
      { id: "unico", nombre: "Identificador único", detalle: "Sin códigos de registro repetidos", dimension: "Unicidad", fallas: [] },
      { id: "rango", nombre: "Fecha dentro del periodo", detalle: `Registro entre 01/01/2025 y ${corte.split("-").reverse().join("/")}`, dimension: "Validez", fallas: [] },
      { id: "sede", nombre: "Sede en el catálogo oficial", detalle: "Corrección automática de mayúsculas y espacios", dimension: "Validez", fallas: [], autocorrige: true },
      { id: "telefono", nombre: "Teléfono con formato válido", detalle: "9 dígitos, inicia en 9", dimension: "Validez", fallas: [] },
      { id: "documento", nombre: "Documento con formato válido", detalle: "DNI 8 dígitos · RUC 11 · CE", dimension: "Validez", fallas: [] },
      { id: "fechas", nombre: "Visita posterior al registro", detalle: "fecha_visita ≥ fecha_registro", dimension: "Consistencia", fallas: [] },
      { id: "pagado", nombre: "Cobrado no supera lo facturado", detalle: "monto_pagado ≤ monto_total", dimension: "Consistencia", fallas: [] },
      { id: "saldo", nombre: "Saldo cuadra con los montos", detalle: "saldo = total − pagado", dimension: "Consistencia", fallas: [] },
      { id: "consentimiento", nombre: "Consentimiento registrado (Ley 29733)", detalle: "Obligatorio antes de campañas", dimension: "Cumplimiento", fallas: [] },
    ];
    const R = Object.fromEntries(reglas.map((r) => [r.id, r]));
    filas.forEach((f) => {
      const id = f.id_registro || "(sin código)";
      const vacios = obligatorios.filter((c) => (f[c] ?? "") === "");
      celdasVacias += vacios.length;
      if (vacios.length) R.completitud.fallas.push({ id, nota: `Vacío: ${vacios.join(", ")}`, usuario: f.registrado_por });
      if (ids[f.id_registro] > 1) R.unico.fallas.push({ id, nota: "Código repetido", usuario: f.registrado_por });
      const fr = fecha(f.fecha_registro), fv = fecha(f.fecha_visita);
      if (!(fr >= INICIO_DATOS && fr <= corte)) R.rango.fallas.push({ id, nota: fr, usuario: f.registrado_por });
      if (!SEDES.includes(f.sede)) R.sede.fallas.push({ id, nota: `"${f.sede}" → corregido`, usuario: f.registrado_por });
      if (f.telefono && !/^9\d{8}$/.test(f.telefono)) R.telefono.fallas.push({ id, nota: `Teléfono "${f.telefono}"`, usuario: f.registrado_por });
      if (f.documento && !/^(\d{8}|\d{11}|CE\d{7})$/.test(f.documento)) R.documento.fallas.push({ id, nota: "Formato de documento inválido", usuario: f.registrado_por });
      if (fv && fr && fv < fr) R.fechas.fallas.push({ id, nota: `Visita ${fv} antes del registro ${fr}`, usuario: f.registrado_por });
      const t = numero(f.monto_total) || 0, p = numero(f.monto_pagado) || 0, s = numero(f.saldo_pendiente) || 0;
      if (p > t + .01) R.pagado.fallas.push({ id, nota: `Cobrado S/ ${p} > facturado S/ ${t}`, usuario: f.registrado_por });
      if (Math.abs(t - p - s) > .01 && p <= t) R.saldo.fallas.push({ id, nota: "Saldo no cuadra", usuario: f.registrado_por });
      if (!f.consentimiento_datos) R.consentimiento.fallas.push({ id, nota: "Sin consentimiento registrado", usuario: f.registrado_por });
    });
    const filasCon = (dim) => new Set(reglas.filter((r) => r.dimension === dim).flatMap((r) => r.fallas.map((x) => x.id))).size;
    const dims = [
      { nombre: "Completitud", valor: 1 - celdasVacias / (total * obligatorios.length) },
      { nombre: "Unicidad", valor: Object.keys(ids).length / total },
      { nombre: "Validez", valor: 1 - filasCon("Validez") / total },
      { nombre: "Consistencia", valor: 1 - filasCon("Consistencia") / total },
      { nombre: "Cumplimiento legal", valor: 1 - filasCon("Cumplimiento") / total },
    ];
    const indice = dims.reduce((a, d) => a + d.valor, 0) / dims.length;
    const afectados = new Set(reglas.flatMap((r) => r.fallas.map((x) => x.id)));
    return { total, reglas, dims, indice, afectados: afectados.size, celdas: total * Object.keys(filas[0] || {}).length };
  }

  /* ---------- Filtros ---------- */
  function filtrar(filas, f, { conFecha = true } = {}) {
    return filas.filter((r) =>
      f.sedes.includes(r.sede) &&
      (!conFecha || (r.fecha_registro >= f.desde && r.fecha_registro <= f.hasta)) &&
      (f.servicio === "Todos" || r.servicio === f.servicio) &&
      (f.cliente === "Todos" || r.tipo_cliente === f.cliente));
  }
  function periodoAnterior(f) {
    const desde = addYears(f.desde, -1);
    return desde >= INICIO_DATOS ? { ...f, desde, hasta: addYears(f.hasta, -1) } : null;
  }

  /* ---------- Definiciones de KPI ---------- */
  const suma = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
  const esReserva = (r) => !r.esMembresia && r.estado_reserva !== "Cancelada";
  function nps(filas) {
    const v = filas.map((r) => r.calificacion_nps).filter((x) => x != null);
    if (!v.length) return { valor: null, n: 0, prom: 0, pas: 0, det: 0 };
    const prom = v.filter((x) => x >= 9).length, det = v.filter((x) => x <= 6).length;
    return { valor: ((prom - det) / v.length) * 100, n: v.length, prom, pas: v.length - prom - det, det };
  }
  function cobranzaVencida(filas) {
    const due = filas.filter((r) => r.fecha_vencimiento < corte && r.monto_total > 0);
    const t = suma(due, "monto_total");
    return { ratio: t ? suma(due, "monto_pagado") / t : null, total: t, n: due.length };
  }
  function ocupacionMedia(filas) {
    const v = filas.filter((r) => !r.esMembresia && r.ocupacion_sede_pct != null);
    return v.length ? suma(v, "ocupacion_sede_pct") / v.length : null;
  }
  function sociosActivos(filas, f, alDia) {
    const vigentes = new Map();
    filas.forEach((r) => {
      if (r.tipo_operacion === "Venta" || !f.sedes.includes(r.sede)) return;
      if (r.fecha_registro <= alDia && r.fecha_registro > addDays(alDia, -365)) {
        const prev = vigentes.get(r.id_cliente);
        if (!prev || prev.fecha_registro < r.fecha_registro) vigentes.set(r.id_cliente, r);
      }
    });
    const porPlan = Object.fromEntries(PLANES.map((p) => [p, 0]));
    vigentes.forEach((r) => { porPlan[r.plan_membresia] = (porPlan[r.plan_membresia] || 0) + 1; });
    return { total: vigentes.size, porPlan };
  }
  function vencido(filas) {
    return filas.filter((r) => r.saldo_pendiente > 0 && r.fecha_vencimiento < corte);
  }

  function kpis(todas, f) {
    const filas = filtrar(todas, f);
    const fin = f.hasta < corte ? f.hasta : corte;
    const calc = (rows, alDia) => {
      const reservas = rows.filter(esReserva);
      const fact = suma(rows, "monto_total");
      return {
        facturacion: fact,
        cobrado: suma(rows, "monto_pagado"),
        cobranza: fact ? suma(rows, "monto_pagado") / fact : null,
        vencido: suma(vencido(rows), "saldo_pendiente"),
        reservas: reservas.length,
        personas: suma(reservas, "personas"),
        ocupacion: ocupacionMedia(rows),
        nps: nps(rows).valor,
        socios: sociosActivos(todas, f, alDia).total,
        altas: rows.filter((r) => r.tipo_operacion === "Alta de socio").length,
        ticket: reservas.length ? suma(reservas, "monto_total") / reservas.length : null,
      };
    };
    const actual = calc(filas, fin);
    const pf = periodoAnterior(f);
    const anterior = pf ? calc(filtrar(todas, pf), addYears(fin, -1)) : null;
    return { actual, anterior, filas };
  }

  function serieMensual(todas, f, mesesLista) {
    const porMes = Object.fromEntries(mesesLista.map((m) => [m, []]));
    filtrar(todas, f).forEach((r) => { if (porMes[r.mes]) porMes[r.mes].push(r); });
    return mesesLista.map((m) => {
      const rows = porMes[m];
      const fact = suma(rows, "monto_total");
      const alDia = finDeMes(m) < corte ? finDeMes(m) : corte;
      const soc = sociosActivos(todas, f, alDia);
      const reservas = rows.filter(esReserva);
      return {
        mes: m, facturacion: fact, cobrado: suma(rows, "monto_pagado"), cobranza: fact ? suma(rows, "monto_pagado") / fact : null,
        reservas: reservas.length, ocupacion: ocupacionMedia(rows), nps: nps(rows).valor,
        socios: soc.total, porPlan: soc.porPlan,
        altas: rows.filter((r) => r.tipo_operacion === "Alta de socio").length,
        renovaciones: rows.filter((r) => r.tipo_operacion === "Renovación de socio").length,
      };
    });
  }

  function metaPeriodo(metas, f, mesesLista) {
    const set = new Set(mesesLista);
    const out = {};
    metas.forEach((m) => {
      if (!f.sedes.includes(m.sede) || !set.has(m.periodo)) return;
      out[m.periodo] = (out[m.periodo] || 0) + (m.meta_facturacion || 0);
    });
    return out;
  }

  /* ---------- Pronóstico explicable: un modelo por sede (estacionalidad del año anterior × tendencia) ----------
   * Se modela cada sede por separado para que la apertura de una sede nueva no se confunda con crecimiento. */
  function pronostico(todas, f) {
    const mesCorte = corte.slice(0, 7), inicioMes = INICIO_DATOS.slice(0, 7);
    const factorCierre = +finDeMes(mesCorte).slice(8) / Math.max(1, +corte.slice(8));
    const porSede = {};
    filtrar(todas, { ...f, desde: INICIO_DATOS, hasta: corte }).forEach((r) => {
      porSede[r.sede] = porSede[r.sede] || {};
      porSede[r.sede][r.mes] = (porSede[r.sede][r.mes] || 0) + r.monto_total;
    });
    const modelo = (vals) => {
      const v = (m) => (m === mesCorte ? (vals[m] || 0) * factorCierre : vals[m] || 0);
      const crecimiento = (ref) => {
        let act = 0, ant = 0;
        for (let i = 1; i <= 10; i++) {
          const m = sumarMeses(ref, -i), ma = sumarMeses(m, -12);
          if (ma < inicioMes) continue;
          act += v(m); ant += v(ma);
        }
        return ant > 0 ? act / ant : null;
      };
      const predecir = (m, ref) => {
        const g = crecimiento(ref), base = v(sumarMeses(m, -12));
        if (g && base > 0) return { valor: base * g, metodo: "estacional" };
        const ult = [1, 2, 3].map((i) => v(sumarMeses(ref, -i))).filter((x) => x > 0);
        return { valor: ult.length ? ult.reduce((a, b) => a + b, 0) / ult.length : 0, metodo: "promedio" };
      };
      return { v, predecir };
    };
    const sedes = Object.keys(porSede);
    const modelos = sedes.map((s) => modelo(porSede[s]));
    const total = (fn) => modelos.reduce((a, md) => a + fn(md), 0);

    // Prueba retrospectiva: ¿qué tan bien habría predicho los últimos 4 meses cerrados?
    const errores = [4, 3, 2, 1].map((k) => {
      const m = sumarMeses(mesCorte, -k);
      const p = total((md) => md.predecir(m, m).valor), real = total((md) => md.v(m));
      return real > 0 ? Math.abs(p - real) / real : null;
    }).filter((x) => x != null);
    const mape = errores.length ? errores.reduce((a, b) => a + b, 0) / errores.length : null;
    const ref = sumarMeses(mesCorte, 1);
    const futuros = [1, 2, 3].map((k) => { const m = sumarMeses(mesCorte, k); return { mes: m, valor: total((md) => md.predecir(m, ref).valor) }; });
    const sedesPromedio = sedes.filter((s, i) => modelos[i].predecir(ref, ref).metodo === "promedio");
    const metodo = !sedes.length || sedesPromedio.length === sedes.length ? "promedio" : sedesPromedio.length ? "mixto" : "estacional";
    const parcial = sedes.reduce((a, s) => a + (porSede[s][mesCorte] || 0), 0);
    return {
      mesCorte, parcial, cierreEstimado: parcial * factorCierre, futuros, mape, metodo, sedesPromedio,
      banda: Math.max(0.08, Math.min(0.4, mape ?? 0.25)), historico: meses(INICIO_DATOS, mesCorte).length,
    };
  }

  /* ---------- Agregaciones para gráficos ---------- */
  function agrupar(filas, clave, valor = "monto_total") {
    const out = {};
    filas.forEach((r) => { const k = typeof clave === "function" ? clave(r) : r[clave]; out[k] = (out[k] || 0) + (typeof valor === "function" ? valor(r) : r[valor] || 0); });
    return out;
  }
  function antiguedad(filas) {
    const tramos = ["Por vencer", "1-30 días", "31-60 días", "61-90 días", "Más de 90 días"];
    const out = {};
    filas.filter((r) => r.saldo_pendiente > 0).forEach((r) => {
      const d = diffDays(corte, r.fecha_vencimiento);
      const t = d <= 0 ? tramos[0] : d <= 30 ? tramos[1] : d <= 60 ? tramos[2] : d <= 90 ? tramos[3] : tramos[4];
      out[r.sede] = out[r.sede] || Object.fromEntries(tramos.map((x) => [x, 0]));
      out[r.sede][t] += r.saldo_pendiente;
    });
    return { tramos, porSede: out };
  }
  function bandaOcupacion(o) { return o < 50 ? "< 50 %" : o < 70 ? "50–70 %" : o <= 85 ? "70–85 %" : "> 85 %"; }

  function porVencerMembresias(todas, f, dias = 60) {
    const ultimas = new Map();
    todas.forEach((r) => {
      if (r.tipo_operacion === "Venta" || !f.sedes.includes(r.sede)) return;
      const p = ultimas.get(r.id_cliente);
      if (!p || p.fecha_registro < r.fecha_registro) ultimas.set(r.id_cliente, r);
    });
    const lim = addDays(corte, dias);
    return [...ultimas.values()].filter((r) => { const v = addDays(r.fecha_registro, 365); return v >= corte && v <= lim; });
  }

  /* ---------- Asistente analítico: hallazgos explicables ---------- */
  const confianza = (n) => (n >= 100 ? "Alta" : n >= 30 ? "Media" : "Baja");
  const pct = (x, d = 0) => `${(x * 100).toFixed(d)} %`;
  const soles = (n) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

  function hallazgos(todas, f, calidad) {
    const out = [];
    const fin = f.hasta < corte ? f.hasta : corte;
    const filas = filtrar(todas, f);

    // 1. Deterioro de cobranza por sede
    f.sedes.forEach((sede) => {
      const base = { ...f, sedes: [sede] };
      const corteRec = addDays(fin, -120);
      const rec = cobranzaVencida(filtrar(todas, { ...base, desde: corteRec > f.desde ? corteRec : f.desde, hasta: fin }));
      const ant = cobranzaVencida(filtrar(todas, { ...base, desde: INICIO_DATOS, hasta: addDays(corteRec, -1) }));
      if (rec.total > 2500 && ant.total > 2500 && rec.ratio < 0.88 && ant.ratio - rec.ratio > 0.07) {
        const deudores = vencido(filtrar(todas, { ...base, desde: INICIO_DATOS, hasta: corte }));
        const conConsent = deudores.filter((r) => r.consentimiento_datos === "Sí").length;
        out.push({
          id: `cob-${sede}`, sev: "alta",
          titulo: `La cobranza de ${sede} cayó a ${pct(rec.ratio)} en los últimos 4 meses`,
          detalle: `Antes cobraba el ${pct(ant.ratio)} de lo vencido. Hay ${deudores.length} operaciones con saldo vencido por ${soles(deudores.reduce((a, r) => a + r.saldo_pendiente, 0))}.`,
          accion: `Revisar las ventas en cuotas de ${sede} y activar el recordatorio automático por WhatsApp para ${conConsent} clientes con consentimiento.`,
          calculo: `cobrado ÷ facturado en operaciones ya vencidas · ${sede} · ventana ${corteRec} a ${fin} (${rec.n} operaciones) vs. periodo previo (${ant.n})`,
          n: rec.n + ant.n,
        });
      }
    });

    // 2. Caída de satisfacción por sede
    f.sedes.forEach((sede) => {
      const rows = filtrar(todas, { ...f, sedes: [sede] }, { conFecha: false }).filter((r) => r.fecha_visita <= fin);
      const lim = addDays(fin, -100);
      const rec = nps(rows.filter((r) => r.fecha_visita >= lim)), ant = nps(rows.filter((r) => r.fecha_visita < lim));
      if (rec.n >= 12 && ant.n >= 20 && ant.valor - rec.valor >= 15) {
        out.push({
          id: `nps-${sede}`, sev: ant.valor - rec.valor >= 25 ? "alta" : "media",
          titulo: `El NPS de ${sede} bajó ${Math.round(ant.valor - rec.valor)} puntos en los últimos 100 días`,
          detalle: `Pasó de ${Math.round(ant.valor)} a ${Math.round(rec.valor)}. Los detractores ya son el ${pct(rec.det / rec.n)} de las respuestas.`,
          accion: `Llamar a los detractores en menos de 48 h y revisar mantenimiento y atención en ${sede}.`,
          calculo: `NPS = % calificaciones 9-10 − % calificaciones 0-6 · ${rec.n} respuestas recientes vs. ${ant.n} anteriores`,
          n: rec.n + ant.n,
        });
      }
    });

    // 3. Saturación y experiencia
    const alta = nps(filas.filter((r) => r.ocupacion_sede_pct > 85)), normal = nps(filas.filter((r) => r.ocupacion_sede_pct <= 70));
    if (alta.n >= 15 && normal.n >= 30 && normal.valor - alta.valor >= 8) {
      out.push({
        id: "saturacion", sev: "media",
        titulo: `Con ocupación sobre 85 %, el NPS cae ${Math.round(normal.valor - alta.valor)} puntos`,
        detalle: `Días tranquilos: NPS ${Math.round(normal.valor)}. Días saturados: NPS ${Math.round(alta.valor)}. La experiencia se resiente justo en temporada alta.`,
        accion: "Activar aforo dinámico con reservas por horario y reforzar personal los días con pronóstico de alta ocupación.",
        calculo: `NPS de visitas con ocupación > 85 % (${alta.n} respuestas) vs. ≤ 70 % (${normal.n} respuestas)`,
        n: alta.n + normal.n,
      });
    }

    // 4. Renovaciones por vencer
    const porVencer = porVencerMembresias(todas, f);
    if (porVencer.length >= 3) {
      const valor = porVencer.reduce((a, r) => a + r.monto_total * 0.9, 0);
      out.push({
        id: "renovaciones", sev: "media",
        titulo: `${porVencer.length} membresías vencen en los próximos 60 días`,
        detalle: `Representan cerca de ${soles(valor)} en renovaciones. Cada socio que no renueva deja de visitar y de consumir.`,
        accion: "Programar una campaña de renovación anticipada con beneficio por pronto pago (solo a socios con consentimiento).",
        calculo: `Última membresía de cada socio + 365 días entre ${corte} y ${addDays(corte, 60)}`,
        n: porVencer.length, exacto: true,
      });
    }

    // 5. Concentración en fines de semana
    const reservas = filas.filter(esReserva);
    if (reservas.length >= 40) {
      const porDia = [0, 0, 0, 0, 0, 0, 0];
      reservas.forEach((r) => { porDia[new Date(r.fecha_visita + "T12:00:00Z").getUTCDay()]++; });
      const finde = (porDia[0] + porDia[6]) / reservas.length;
      if (finde >= 0.45) {
        out.push({
          id: "finde", sev: "oportunidad",
          titulo: `El ${pct(finde)} de las reservas cae en sábado o domingo`,
          detalle: `Un martes recibe ${(porDia[2] / Math.max(1, porDia[0]) * 100).toFixed(0)} reservas por cada 100 de un domingo: hay capacidad ociosa entre semana.`,
          accion: "Lanzar paquetes de martes a jueves para colegios, empresas y adultos mayores, con tarifa diferenciada.",
          calculo: `Reservas por día de visita (excluye membresías y cancelaciones) · ${reservas.length} reservas`,
          n: reservas.length,
        });
      }
    }

    // 6. Crecimiento del canal web
    const ms2 = meses(f.desde, fin);
    if (ms2.length >= 10) {
      const prim = new Set(ms2.slice(0, 6)), ult = new Set(ms2.slice(-6));
      const share = (set) => { const rr = reservas.filter((r) => set.has(r.mes)); return rr.length ? rr.filter((r) => r.canal === "Web").length / rr.length : 0; };
      const a = share(prim), b = share(ult);
      if (b - a >= 0.03) {
        out.push({
          id: "web", sev: "oportunidad",
          titulo: `La web pasó de ${pct(a)} a ${pct(b)} de las reservas`,
          detalle: "El turista ya reserva en línea por su cuenta. Hoy las tarifas están publicadas como imágenes y no hay pago en línea.",
          accion: "Implementar un motor de reservas con disponibilidad en tiempo real y pago con Yape o tarjeta.",
          calculo: "Participación del canal Web: primeros 6 meses vs. últimos 6 meses del periodo",
          n: reservas.length,
        });
      }
    }

    // 7. Arranque de Tarapoto
    if (f.sedes.includes("Tarapoto")) {
      const t = filas.filter((r) => r.sede === "Tarapoto");
      if (t.length >= 20) {
        const ext = t.filter((r) => r.origen !== "Misma ciudad").length / t.length;
        const nn = nps(t);
        out.push({
          id: "tarapoto", sev: "oportunidad",
          titulo: `Tarapoto: ${pct(ext)} de sus visitantes son turistas de fuera de la ciudad`,
          detalle: `En sus primeros meses factura ${soles(suma(t, "monto_total"))}${nn.valor != null ? ` con NPS ${Math.round(nn.valor)}, el más alto de la red` : ""}.`,
          accion: "Alianzas con agencias y vuelos a Tarapoto, y paquetes de hospedaje + aventura en temporada seca (jun–sep).",
          calculo: `Visitantes con origen distinto a "Misma ciudad" ÷ total · ${t.length} registros de Tarapoto`,
          n: t.length,
        });
      }
    }

    // 8. Calidad de datos
    if (calidad.afectados > 0) {
      const usuarios = {};
      calidad.reglas.forEach((r) => r.fallas.forEach((x) => { usuarios[x.usuario] = (usuarios[x.usuario] || 0) + 1; }));
      const [topU, topN] = Object.entries(usuarios).sort((a, b) => b[1] - a[1])[0];
      out.push({
        id: "calidad", sev: "media",
        titulo: `${calidad.afectados} registros necesitan corrección en origen`,
        detalle: `El índice de calidad es ${pct(calidad.indice, 1)}. El usuario con más incidencias es «${topU}» (${topN}).`,
        accion: "Agregar validaciones en el formulario de ingreso y una capacitación de 15 minutos al equipo que registra.",
        calculo: "10 reglas de validación ejecutadas sobre el 100 % de los registros en cada sincronización",
        n: calidad.total, exacto: true,
      });
    }

    const orden = { alta: 0, media: 1, oportunidad: 2 };
    return out.map((h) => ({ ...h, confianza: h.exacto ? "Exacta" : confianza(h.n) })).sort((a, b) => orden[a.sev] - orden[b.sev]);
  }

  /* ---------- Preguntas en lenguaje natural (respuestas calculadas, deterministas) ---------- */
  const PREGUNTAS = [
    { id: "factura", texto: "¿Qué sede factura más?", claves: /factur|vend|ingres|gana/ },
    { id: "deuda", texto: "¿Qué sede tiene más deuda vencida?", claves: /deud|venc|cobr|mor/ },
    { id: "servicio", texto: "¿Cuál es el servicio que más aporta?", claves: /servici|rentab|aport|produc/ },
    { id: "tarapoto", texto: "¿Cómo va Tarapoto desde su apertura?", claves: /tarapoto|apertura|nueva sede/ },
    { id: "dia", texto: "¿Qué día conviene promocionar?", claves: /d[ií]a|semana|promo/ },
    { id: "socios", texto: "¿Cuántos socios vencen pronto?", claves: /soci|membres|renov/ },
    { id: "nps", texto: "¿Qué sede recomiendan más?", claves: /nps|satisf|recomiend|experien/ },
    { id: "canal", texto: "¿Por dónde reservan los turistas?", claves: /canal|whatsapp|web|redes/ },
  ];
  function responder(todas, f, pregunta) {
    const q = pregunta.toLowerCase();
    const p = PREGUNTAS.find((x) => x.id === pregunta) || PREGUNTAS.find((x) => x.claves.test(q));
    const filas = filtrar(todas, f);
    const pie = `Calculado sobre ${filas.length.toLocaleString("es-PE")} registros con los filtros activos · sin usar datos personales`;
    if (!p) return { texto: "Todavía no sé responder esa pregunta. Prueba con facturación, deuda, servicios, Tarapoto, días de la semana, socios, satisfacción o canales.", pie: "" };
    if (!filas.length) return { texto: "No hay registros para los filtros actuales. Amplía el periodo o las sedes.", pie: "" };
    const ranking = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    switch (p.id) {
      case "factura": {
        const r = ranking(agrupar(filas, "sede")), tot = r.reduce((a, x) => a + x[1], 0);
        return { texto: `${r[0][0]} lidera con ${soles(r[0][1])} (${pct(r[0][1] / tot)} del total)${r[1] ? `, seguida de ${r[1][0]} con ${soles(r[1][1])}` : ""}. Total del periodo: ${soles(tot)}.`, pie };
      }
      case "deuda": {
        const v = vencido(filtrar(todas, { ...f, desde: INICIO_DATOS, hasta: corte }));
        if (!v.length) return { texto: "No hay deuda vencida con los filtros actuales. ¡Buena noticia!", pie };
        const r = ranking(agrupar(v, "sede", "saldo_pendiente")), tot = r.reduce((a, x) => a + x[1], 0);
        return { texto: `${r[0][0]} concentra ${soles(r[0][1])} de deuda vencida, el ${pct(r[0][1] / tot)} del total (${soles(tot)} en ${v.length} operaciones).`, pie };
      }
      case "servicio": {
        const r = ranking(agrupar(filas, "servicio")), tot = r.reduce((a, x) => a + x[1], 0);
        const n = filas.filter((x) => x.servicio === r[0][0] && x.monto_total > 0).length;
        return { texto: `${r[0][0]} aporta ${soles(r[0][1])} (${pct(r[0][1] / tot)}), con un ticket promedio de ${soles(r[0][1] / Math.max(1, n))}. Le sigue ${r[1] ? r[1][0] : "—"}.`, pie };
      }
      case "tarapoto": {
        const t = todas.filter((x) => x.sede === "Tarapoto");
        if (!t.length) return { texto: "Aún no hay registros de Tarapoto.", pie };
        const nn = nps(t), ext = t.filter((x) => x.origen !== "Misma ciudad").length / t.length;
        const primero = t.map((x) => x.fecha_registro).sort()[0];
        return { texto: `Desde su primer registro (${primero.split("-").reverse().join("/")}) Tarapoto facturó ${soles(suma(t, "monto_total"))} en ${t.filter(esReserva).length} reservas. El ${pct(ext)} de sus visitantes viene de fuera de la ciudad${nn.valor != null ? ` y su NPS es ${Math.round(nn.valor)}` : ""}.`, pie: "Calculado sobre todos los registros de Tarapoto · sin usar datos personales" };
      }
      case "dia": {
        const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"], c = [0, 0, 0, 0, 0, 0, 0];
        const rr = filas.filter(esReserva);
        rr.forEach((x) => { c[new Date(x.fecha_visita + "T12:00:00Z").getUTCDay()]++; });
        const max = c.indexOf(Math.max(...c)), min = c.indexOf(Math.min(...c));
        return { texto: `El ${dias[max]} concentra el ${pct(c[max] / rr.length)} de las reservas y el ${dias[min]} solo el ${pct(c[min] / rr.length)}. Conviene promocionar el ${dias[min]} con paquetes para colegios, empresas y adultos mayores.`, pie };
      }
      case "socios": {
        const pv = porVencerMembresias(todas, f);
        return { texto: `${pv.length} membresías vencen en los próximos 60 días (${pv.filter((x) => x.consentimiento_datos === "Sí").length} con consentimiento para contactarlos). Socios activos hoy: ${sociosActivos(todas, f, corte).total}.`, pie };
      }
      case "nps": {
        const r = f.sedes.map((s) => [s, nps(filas.filter((x) => x.sede === s))]).filter((x) => x[1].n >= 5).sort((a, b) => b[1].valor - a[1].valor);
        if (!r.length) return { texto: "No hay suficientes encuestas para estos filtros.", pie };
        return { texto: `${r[0][0]} tiene el mejor NPS (${Math.round(r[0][1].valor)})${r.length > 1 ? ` y ${r[r.length - 1][0]} el más bajo (${Math.round(r[r.length - 1][1].valor)})` : ""}. Un NPS sobre 50 se considera excelente en turismo.`, pie };
      }
      case "canal": {
        const rr = filas.filter(esReserva), r = ranking(agrupar(rr, "canal", () => 1));
        return { texto: `${r[0][0]} es el canal principal (${pct(r[0][1] / rr.length)} de las reservas), seguido de ${r[1] ? `${r[1][0]} (${pct(r[1][1] / rr.length)})` : "—"}. La web representa el ${pct((agrupar(rr, "canal", () => 1).Web || 0) / rr.length)}.`, pie };
      }
    }
    return { texto: "", pie: "" };
  }

  return {
    SEDES, SERVICIOS, TIPOS_CLIENTE, PLANES, CANALES, ORIGENES, INICIO_DATOS, corte, PREGUNTAS,
    cargar, filtrar, kpis, serieMensual, metaPeriodo, pronostico, agrupar, antiguedad, bandaOcupacion,
    nps, vencido, sociosActivos, porVencerMembresias, hallazgos, responder,
    util: { meses, addDays, diffDays, finDeMes, sumarMeses, addYears, esReserva, suma },
  };
})();
