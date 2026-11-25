/**
 * Club El Tumi · Automatizaciones de gobernanza en Google Sheets (Apps Script).
 *
 * Instalación: en la hoja de cálculo, Extensiones › Apps Script › pegar este archivo › guardar.
 * Luego ejecutar una vez `crearDisparadores` y aceptar los permisos.
 *   - Validación diaria de calidad (7:00 a. m.) con alerta por correo si el índice baja de 98 %.
 *   - Resumen semanal a gerencia (lunes 8:00 a. m.).
 *   - Menú «Club El Tumi» para ejecutar todo a mano.
 */
const CONFIG = {
  hojaRegistros: 'registros',
  hojaBitacora: 'calidad_log',
  correoGerencia: 'gerencia@ejemplo.com', // reemplazar por el correo real
  umbralCalidad: 0.98,
  obligatorios: ['id_registro', 'fecha_registro', 'fecha_visita', 'sede', 'servicio', 'canal', 'tipo_cliente',
    'id_cliente', 'cliente', 'documento', 'telefono', 'monto_total', 'monto_pagado', 'estado_pago', 'consentimiento_datos'],
  sedes: ['Lima', 'Chiclayo', 'Ica', 'Tarapoto'],
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Club El Tumi')
    .addItem('Validar calidad de datos', 'validarDatos')
    .addItem('Enviar resumen semanal ahora', 'resumenSemanal')
    .addSeparator()
    .addItem('Programar automatizaciones', 'crearDisparadores')
    .addToUi();
}

function crearDisparadores() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('validarDatos').timeBased().atHour(7).everyDays(1).create();
  ScriptApp.newTrigger('resumenSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
}

function leerRegistros_() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(CONFIG.hojaRegistros);
  const valores = hoja.getDataRange().getValues();
  const encabezado = valores.shift().map(String);
  const idx = Object.fromEntries(encabezado.map((c, i) => [c, i]));
  return { hoja, valores, encabezado, idx };
}

const texto_ = (v) => (v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v).trim());

/** Ejecuta las reglas de calidad, marca en amarillo las celdas con problemas y deja constancia en la bitácora. */
function validarDatos() {
  const { hoja, valores, encabezado, idx } = leerRegistros_();
  const fondos = valores.map((fila) => fila.map(() => null));
  const marcar = (r, campo) => { fondos[r][idx[campo]] = '#FFF3BF'; };
  const ids = {};
  valores.forEach((f) => { const id = texto_(f[idx.id_registro]); ids[id] = (ids[id] || 0) + 1; });
  const conIncidencias = new Set();

  valores.forEach((f, r) => {
    const v = (c) => texto_(f[idx[c]]);
    CONFIG.obligatorios.forEach((c) => { if (v(c) === '') { marcar(r, c); conIncidencias.add(r); } });
    if (ids[v('id_registro')] > 1) { marcar(r, 'id_registro'); conIncidencias.add(r); }
    if (v('telefono') && !/^9\d{8}$/.test(v('telefono'))) { marcar(r, 'telefono'); conIncidencias.add(r); }
    if (v('documento') && !/^(\d{8}|\d{11}|CE\d{7})$/.test(v('documento'))) { marcar(r, 'documento'); conIncidencias.add(r); }
    if (!CONFIG.sedes.includes(v('sede'))) { marcar(r, 'sede'); conIncidencias.add(r); }
    if (v('fecha_visita') < v('fecha_registro')) { marcar(r, 'fecha_visita'); conIncidencias.add(r); }
    if (Number(f[idx.monto_pagado]) > Number(f[idx.monto_total]) + 0.01) { marcar(r, 'monto_pagado'); conIncidencias.add(r); }
  });

  if (valores.length) hoja.getRange(2, 1, valores.length, encabezado.length).setBackgrounds(fondos);
  const indice = valores.length ? 1 - conIncidencias.size / valores.length : 1;

  const ss = SpreadsheetApp.getActive();
  const log = ss.getSheetByName(CONFIG.hojaBitacora) || ss.insertSheet(CONFIG.hojaBitacora);
  if (log.getLastRow() === 0) log.appendRow(['fecha_hora', 'registros', 'con_incidencias', 'indice_calidad', 'ejecutado_por']);
  log.appendRow([new Date(), valores.length, conIncidencias.size, indice, Session.getEffectiveUser().getEmail() || 'disparador']);

  if (indice < CONFIG.umbralCalidad) {
    MailApp.sendEmail({
      to: CONFIG.correoGerencia,
      subject: `Club El Tumi · Alerta de calidad de datos (${(indice * 100).toFixed(1)} %)`,
      htmlBody: `<p>La validación diaria encontró <b>${conIncidencias.size}</b> registros con incidencias de ${valores.length}.</p>
                 <p>Las celdas a corregir están marcadas en amarillo en la pestaña <b>${CONFIG.hojaRegistros}</b>.</p>`,
    });
  }
  return indice;
}

/** Correo semanal con facturación, cobranza y deuda vencida por sede (solo cifras agregadas, sin datos personales). */
function resumenSemanal() {
  const { valores, idx } = leerRegistros_();
  const hoy = new Date();
  const desde = texto_(new Date(hoy.getTime() - 7 * 864e5));
  const hoyTxt = texto_(hoy);
  const porSede = {};
  CONFIG.sedes.forEach((s) => { porSede[s] = { facturado: 0, cobrado: 0, vencido: 0, reservas: 0 }; });

  valores.forEach((f) => {
    const sede = texto_(f[idx.sede]);
    if (!porSede[sede]) return;
    const fecha = texto_(f[idx.fecha_registro]);
    const saldo = Number(f[idx.saldo_pendiente]) || 0;
    if (fecha >= desde) {
      porSede[sede].facturado += Number(f[idx.monto_total]) || 0;
      porSede[sede].cobrado += Number(f[idx.monto_pagado]) || 0;
      porSede[sede].reservas += 1;
    }
    if (saldo > 0 && texto_(f[idx.fecha_vencimiento]) < hoyTxt) porSede[sede].vencido += saldo;
  });

  const soles = (n) => 'S/ ' + n.toLocaleString('es-PE', { maximumFractionDigits: 0 });
  const filas = CONFIG.sedes.map((s) => {
    const d = porSede[s];
    const pct = d.facturado ? ((d.cobrado / d.facturado) * 100).toFixed(1) + ' %' : '—';
    return `<tr><td>${s}</td><td>${d.reservas}</td><td>${soles(d.facturado)}</td><td>${pct}</td><td>${soles(d.vencido)}</td></tr>`;
  }).join('');

  MailApp.sendEmail({
    to: CONFIG.correoGerencia,
    subject: `Club El Tumi · Resumen semanal ${desde} al ${hoyTxt}`,
    htmlBody: `<h2 style="color:#1751A0">Resumen semanal multisede</h2>
      <table cellpadding="8" style="border-collapse:collapse;font-family:Arial">
        <tr style="background:#1751A0;color:#fff"><th>Sede</th><th>Operaciones</th><th>Facturado</th><th>Cobranza</th><th>Deuda vencida</th></tr>${filas}
      </table>
      <p style="color:#555">Detalle completo en el Centro de Inteligencia Multisede.</p>`,
  });
}
