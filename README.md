# Centro de Inteligencia Multisede · Club El Tumi

Propuesta de dashboard comercial para **Club El Tumi** (Lima, Chiclayo, Ica y Tarapoto) construida con tres ejes:
**gobernanza de datos, gobernanza de IA y diseño profesional**, pensada para un negocio turístico y recreativo.

> Proyecto independiente elaborado como muestra de trabajo. Todos los datos son **100 % simulados**.
> El logo y la marca pertenecen a Club El Tumi.

## Qué muestra: 9 pestañas, cada una con un propósito

| Pestaña | Para qué sirve |
|---|---|
| Resumen | Ver cómo vamos, qué sede necesita atención y qué hacer hoy: 6 indicadores, postales de las 4 sedes con estado automático y las prioridades del día |
| Facturación | Facturado vs. cobrado, metas, pronóstico de IA a 3 meses con rango de confianza, mapa de la red y mix de servicios |
| Cobranza | Antigüedad de la deuda, a quién llamar primero, medios de pago y recordatorio por WhatsApp solo con consentimiento |
| Socios | Socios activos por plan, altas, renovaciones y membresías que vencen en 60 días |
| Temporadas y turistas | Calendario de reservas, canales, viaje del visitante (origen → sede → experiencia), NPS y efecto de la saturación |
| Cara a cara | Comparador interactivo de dos sedes en seis dimensiones |
| Detalle | Tabla dinámica: agrupar por sede, servicio, canal o cliente, ordenar, buscar y desplegar filas |
| Gobernanza | Índice de calidad en vivo, 10 reglas automáticas, recorrido del dato, enmascaramiento (Ley N.° 29733), bitácora y diccionario |
| IA y automatización | Hallazgos explicables con validación humana, preguntas a los datos, ficha del modelo y automatizaciones |

Los títulos de cada pestaña se escriben solos según los datos (por ejemplo, «Vendemos más, pero cobramos menos»).
Incluye roles de acceso, recorrido guiado, atajos de teclado (1 a 9), música andina generativa, exportación CSV y PDF.

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

HTML, CSS y JavaScript sin frameworks · [Apache ECharts 5.5](https://echarts.apache.org) · Montserrat ·
contorno del Perú de Natural Earth (`world-atlas`) · Google Sheets · Google Apps Script · Netlify
(con cabeceras de seguridad y CSP estricta en `netlify.toml`).
