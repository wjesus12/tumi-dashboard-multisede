# Centro de Inteligencia Multisede · Club El Tumi

Propuesta de dashboard comercial para **Club El Tumi** (Lima, Chiclayo, Ica y Tarapoto) construida con tres ejes:
**gobernanza de datos, gobernanza de IA y diseño profesional**, pensada para un negocio turístico y recreativo.

> Proyecto independiente elaborado como muestra de trabajo. Todos los datos son **100 % simulados**.
> El logo y la marca pertenecen a Club El Tumi.

## Qué muestra

| Sección | Contenido |
|---|---|
| 01 · Pulso del negocio | 6 KPI (facturación, cobranza, socios activos, reservas, ocupación, NPS) con variación vs. el año anterior y minigráficos |
| 02 · Facturación y pronóstico | Facturado vs. cobrado, metas por mes, pronóstico de IA a 3 meses con rango de confianza, mapa del Perú, mix de servicios, radar de sedes y medidores de meta |
| 03 · Reservas y temporadas | Calendario de calor diario (veranos, feriados, fines de semana) y canales de reserva |
| 04 · Cobranza y cartera | Antigüedad de la deuda por sede, medios de pago y prioridad de gestión con datos protegidos |
| 05 · Socios y suscripciones | Socios activos por plan, altas y renovaciones |
| 06 · Experiencia del turista | Flujo origen → sede → experiencia, NPS por sede, efecto de la saturación en la satisfacción y ocupación mensual |
| 07 · Gobernanza de datos | Índice de calidad en vivo, 10 reglas automáticas, linaje del dato, enmascaramiento de datos personales (Ley N.° 29733), bitácora de auditoría y diccionario de datos |
| 08 · IA responsable | Hallazgos automáticos explicables con nivel de confianza y validación humana, preguntas en lenguaje natural y ficha del modelo |
| 09 · Automatizaciones | Sincronización con Google Sheets, validación diaria, recordatorios de cobranza por WhatsApp (solo con consentimiento) y reporte semanal |

Incluye recorrido guiado de 10 pasos, roles de acceso (gerencia, administrador por sede, analista, auditor),
música ambiente andina generativa y efectos de sonido creados con Web Audio, exportación CSV y reporte PDF.

## Base de datos

`data/registros.csv`: **2.000 registros × 31 columnas**, del 01/01/2025 al 24/11/2026, más tres tablas de apoyo
(`sedes`, `metas_mensuales`, `diccionario_datos`). Todas vienen juntas en `data/plantilla_google_sheets.xlsx`
(una pestaña por tabla), lista para importar a Google Sheets.

Los datos incluyen estacionalidad turística real por región, feriados peruanos, la apertura de Tarapoto en 2026,
un deterioro de cobranza y satisfacción en Ica (para que la IA lo detecte) y 14 incidencias de calidad sembradas
a propósito para demostrar el panel de gobernanza. Se regeneran con:

```bash
python3 scripts/generar_datos.py
```

## Conectar Google Sheets en vivo

1. En Google Sheets: **Archivo › Importar** › `data/plantilla_google_sheets.xlsx` › *Reemplazar hoja de cálculo*.
2. **Compartir** › Acceso general: *Cualquier persona con el enlace* › *Lector*.
3. Copiar el ID de la hoja (el texto entre `/d/` y `/edit` en la URL) y pegarlo en `js/config.js` → `googleSheetId`.

Para probar sin tocar el código, agregar `?sheet=ID_DE_LA_HOJA` al final de la URL del dashboard.
El tablero se resincroniza cada 5 minutos y valida los datos en cada lectura.

### Automatización con Apps Script

`apps-script/Code.gs` agrega a la hoja un menú **Club El Tumi**, una validación diaria que marca en amarillo las
celdas con errores y envía alerta por correo, y un resumen semanal a gerencia. Instrucciones dentro del archivo.

## Ejecutar en local

```bash
python3 -m http.server 8080
```

Abrir `http://localhost:8080`. (Se necesita un servidor: el navegador no lee los CSV con `file://`.)

## Tecnología

HTML, CSS y JavaScript sin frameworks · [Apache ECharts 5.5](https://echarts.apache.org) · Montserrat + Sora ·
contorno del Perú de Natural Earth (`world-atlas`) · Google Sheets · Google Apps Script · Netlify
(con cabeceras de seguridad y CSP estricta en `netlify.toml`).
