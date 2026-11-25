/* Configuración de la fuente de datos.
 *
 * Para conectar Google Sheets en vivo:
 *   1. Importa data/plantilla_google_sheets.xlsx en Google Sheets (Archivo › Importar).
 *   2. Compartir › "Cualquier persona con el enlace" › Lector.
 *   3. Pega el ID de la hoja en googleSheetId (lo que va entre /d/ y /edit en la URL).
 * También se puede probar sin tocar el código: ?sheet=ID_DE_LA_HOJA al final de la URL.
 */
window.TUMI_CONFIG = {
  googleSheetId: "",
  pestanas: {
    registros: "registros",
    sedes: "sedes",
    metas: "metas_mensuales",
    diccionario: "diccionario_datos",
  },
  refrescoMinutos: 5,
  // Fecha de corte para calcular deuda vencida. Vacío = hoy. Los datos de ejemplo llegan al 24/11/2026.
  fechaCorte: "2026-11-24",
  autor: "Wilmer",
};
