"""Base de datos de ejemplo (100% simulada) para el dashboard multisede de Club El Tumi.

Genera 2.000 registros de reservas y ventas entre el 01/01/2025 y el 24/11/2026, más las
tablas de apoyo. Cada CSV equivale a una pestaña de Google Sheets.
Uso: python3 scripts/generar_datos.py
"""
import csv
import datetime as dt
import math
import os
import random

random.seed(2025)
OUT = os.path.join(os.path.dirname(__file__), "..", "data")
INICIO, HOY = dt.date(2025, 1, 1), dt.date(2026, 11, 24)
TOTAL_REGISTROS = 2000

SEDES = {
    # nombre: región, lat, lon, apertura, habitaciones, parcelas de camping, aforo diario, peso comercial
    "Lima": ("Lima · Carabayllo", -11.80, -76.98, dt.date(2008, 1, 10), 42, 70, 1400, 1.00),
    "Chiclayo": ("Lambayeque", -6.77, -79.84, dt.date(2015, 3, 1), 30, 45, 950, 0.62),
    "Ica": ("Ica", -14.07, -75.73, dt.date(2018, 6, 1), 26, 40, 800, 0.52),
    "Tarapoto": ("San Martín", -6.49, -76.37, dt.date(2026, 6, 15), 24, 35, 600, 0.95),
}
CODIGO = {"Lima": "LIM", "Chiclayo": "CIX", "Ica": "ICA", "Tarapoto": "TPP"}
ESTACIONALIDAD = {
    "Lima": [1.60, 1.75, 1.35, 1.00, 0.70, 0.65, 0.95, 0.80, 0.85, 0.90, 1.00, 1.30],
    "Chiclayo": [1.50, 1.60, 1.40, 1.00, 0.85, 0.75, 0.95, 0.85, 0.85, 0.90, 0.95, 1.25],
    "Ica": [1.35, 1.45, 1.25, 1.05, 0.85, 0.85, 1.05, 0.95, 0.90, 0.95, 1.00, 1.20],
    "Tarapoto": [0.90, 0.85, 0.85, 0.95, 1.00, 1.15, 1.35, 1.25, 1.05, 1.00, 0.90, 1.10],
}
PESO_DIA = [0.55, 0.60, 0.62, 0.70, 1.05, 2.15, 2.35]  # lunes..domingo
FERIADOS = {dt.date.fromisoformat(d) for d in [
    "2025-01-01", "2025-04-17", "2025-04-18", "2025-05-01", "2025-06-07", "2025-06-29", "2025-07-23",
    "2025-07-28", "2025-07-29", "2025-08-06", "2025-08-30", "2025-10-08", "2025-11-01", "2025-12-08",
    "2025-12-09", "2025-12-25", "2026-01-01", "2026-04-02", "2026-04-03", "2026-05-01", "2026-06-07",
    "2026-06-29", "2026-07-23", "2026-07-28", "2026-07-29", "2026-08-06", "2026-08-30", "2026-10-08",
    "2026-11-01"]}

SERVICIOS = {
    # servicio: (peso, anticipación máx. en días)
    "Entradas y piscinas": (0.29, 6),
    "Hospedaje": (0.17, 35),
    "Camping": (0.10, 20),
    "Restaurante": (0.12, 3),
    "Aventura": (0.10, 7),
    "Eventos": (0.035, 60),
    "Membresía anual": (0.15, 0),
}
PLANES = {"Individual": 290, "Familiar": 480, "Corporativo": 1500}
ORIGEN = {
    "Lima": [("Misma ciudad", .76), ("Otras regiones", .17), ("Extranjero", .07)],
    "Chiclayo": [("Misma ciudad", .61), ("Otras regiones", .31), ("Extranjero", .08)],
    "Ica": [("Misma ciudad", .45), ("Otras regiones", .43), ("Extranjero", .12)],
    "Tarapoto": [("Misma ciudad", .32), ("Otras regiones", .50), ("Extranjero", .18)],
}
NOMBRES = ["Lucía", "Mateo", "Valeria", "Diego", "Camila", "Sebastián", "Ximena", "Joaquín", "Renata", "Thiago",
           "Daniela", "Rodrigo", "Fernanda", "Gabriel", "Mariana", "Adrián", "Antonella", "Nicolás", "Alessia",
           "Emilio", "Rosa", "Jorge", "Carmen", "Luis", "Milagros", "César", "Patricia", "Víctor", "Gianella",
           "Martín", "Kiara", "Álvaro", "Fiorella", "Bruno", "Noelia", "Fabricio"]
APELLIDOS = ["Quispe", "Flores", "Huamán", "Rojas", "Mendoza", "Chávez", "Ramírez", "Torres", "Vargas", "Castillo",
             "Paredes", "Salazar", "Gutiérrez", "Rivera", "Cárdenas", "Navarro", "Espinoza", "Villanueva", "Ccori",
             "Mamani", "Tello", "Arévalo", "Del Águila", "Panduro", "Sánchez", "Céspedes"]
EMPRESAS = ["Colegio San Agustín", "Minera Andina SAC", "Banco del Norte", "I.E. Santa Rosa", "Agroexport Ica SAC",
            "Clínica Los Olivos", "Constructora Selva SAC", "Colegio Pamer", "Textil Lambayeque SAC",
            "Universidad Señor de Sipán", "Corporación Pisco Sur", "Grupo Amazónico EIRL"]


def peso_dia(sede, d):
    info = SEDES[sede]
    if d < info[3]:
        return 0.0
    w = info[7] * ESTACIONALIDAD[sede][d.month - 1] * PESO_DIA[d.weekday()]
    if d in FERIADOS:
        w *= 2.4
    w *= 1 + 0.10 * (d - INICIO).days / 365  # crecimiento anual ~10 %
    if sede == "Tarapoto":
        meses = (d - info[3]).days / 30
        w *= min(1.0, 0.5 + 0.12 * meses)  # curva de arranque de la sede nueva
    return w


def ocupacion(sede, d):
    base = 0.40 * ESTACIONALIDAD[sede][d.month - 1] * (0.75 + 0.18 * PESO_DIA[d.weekday()])
    if d in FERIADOS:
        base *= 1.35
    return round(min(98.5, max(12.0, base * 100 * random.gauss(1, 0.07))), 1)


# --- Clientes (pool ficticio, con clientes que repiten) ---
def nuevo_cliente(i, sede):
    origen = random.choices([o for o, _ in ORIGEN[sede]], [w for _, w in ORIGEN[sede]])[0]
    extranjero = origen == "Extranjero"
    return {
        "id": f"CLI-{i:05d}",
        "nombre": f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)} {random.choice(APELLIDOS)}",
        "doc": f"CE{random.randint(1000000, 9999999)}" if extranjero else f"{random.randint(40000000, 79999999)}",
        "tel": f"9{random.randint(10000000, 99999999)}",
        "origen": origen,
        "sede": sede,
    }


clientes = {s: [] for s in SEDES}
contador_cli = 1
socios_vigentes = {s: [] for s in SEDES}  # (cliente, vence, plan)

# --- Muestreo de fechas y sedes ponderado por estacionalidad ---
dias = [INICIO + dt.timedelta(days=i) for i in range((HOY - INICIO).days + 1)]
pares = [(s, d) for s in SEDES for d in dias]
pesos = [peso_dia(s, d) for s, d in pares]
muestra = sorted(random.choices(pares, pesos, k=TOTAL_REGISTROS), key=lambda x: x[1])

registros = []
for n, (sede, f_reg) in enumerate(muestra, start=1):
    mes = f_reg.month
    w_serv = {k: v[0] for k, v in SERVICIOS.items()}
    if mes in (12, 1, 2):
        w_serv["Membresía anual"] *= 1.8
    if sede == "Tarapoto":
        w_serv["Hospedaje"] *= 1.6
        w_serv["Aventura"] *= 1.4
    servicio = random.choices(list(w_serv), list(w_serv.values()))[0]

    # Cliente
    vigentes = [x for x in socios_vigentes[sede] if x[1] >= f_reg]
    tipo_operacion, plan = "Venta", ""
    if servicio == "Membresía anual":
        renovables = [x for x in socios_vigentes[sede] if f_reg - dt.timedelta(days=45) <= x[1] <= f_reg + dt.timedelta(days=30)]
        if renovables and random.random() < 0.55:
            cli, _, plan = random.choice(renovables)
            tipo_operacion = "Renovación de socio"
        else:
            if clientes[sede] and random.random() < 0.35:
                cli = random.choice(clientes[sede])
            else:
                cli = nuevo_cliente(contador_cli, sede)
                contador_cli += 1
                clientes[sede].append(cli)
            plan = random.choices(list(PLANES), [0.42, 0.50, 0.08])[0]
            tipo_operacion = "Alta de socio"
        tipo_cliente = "Corporativo" if plan == "Corporativo" else "Socio"
    elif servicio == "Eventos" and random.random() < 0.7 or random.random() < 0.05:
        tipo_cliente = "Corporativo"
        cli = nuevo_cliente(contador_cli, sede)
        cli["nombre"] = random.choice(EMPRESAS)
        cli["doc"] = f"20{random.randint(100000000, 699999999)}"
        cli["origen"] = "Misma ciudad"
        contador_cli += 1
    elif vigentes and random.random() < 0.42:
        cli, _, plan = random.choice(vigentes)
        tipo_cliente = "Socio"
    else:
        tipo_cliente = "Visitante"
        if clientes[sede] and random.random() < 0.22:
            cli = random.choice(clientes[sede])
        else:
            cli = nuevo_cliente(contador_cli, sede)
            contador_cli += 1
            clientes[sede].append(cli)

    # Fechas
    anticip = SERVICIOS[servicio][1]
    f_vis = f_reg + dt.timedelta(days=random.randint(0, anticip) if anticip else 0)

    # Canal
    canales = {"WhatsApp": .36, "Presencial": .25, "Web": .14 + .05 * (f_reg - INICIO).days / 365,
               "Redes sociales": .13, "Agencias y corporativo": .04}
    if tipo_cliente == "Corporativo":
        canales = {"Agencias y corporativo": .7, "WhatsApp": .2, "Web": .1}
    if servicio in ("Restaurante",):
        canales = {"Presencial": .8, "WhatsApp": .2}
    canal = random.choices(list(canales), list(canales.values()))[0]

    # Cantidades y precio
    fin_de_semana = f_vis.weekday() >= 5 or f_vis in FERIADOS
    noches = 0
    if servicio == "Entradas y piscinas":
        personas, precio = random.randint(2, 10), 20 if fin_de_semana else 10
        bruto = precio * personas
    elif servicio == "Hospedaje":
        personas, noches = random.randint(2, 5), random.choices([1, 2, 3, 4], [.45, .33, .15, .07])[0]
        precio = {"Lima": 158, "Chiclayo": 150, "Ica": 145, "Tarapoto": 185}[sede]
        bruto = precio * noches * math.ceil(personas / 2)
    elif servicio == "Camping":
        personas, noches, precio = random.randint(2, 6), random.choices([1, 2], [.75, .25])[0], 35
        bruto = precio * personas * noches
    elif servicio == "Restaurante":
        personas, precio = random.randint(2, 10), 35
        bruto = precio * personas
    elif servicio == "Aventura":
        personas, precio = random.randint(1, 6), 35
        bruto = precio * personas
    elif servicio == "Eventos":
        personas, precio = random.randint(20, 70), 38
        bruto = precio * personas + 500
    else:
        personas = {"Individual": 1, "Familiar": 4, "Corporativo": 10}[plan]
        precio = PLANES[plan] * (0.9 if tipo_operacion == "Renovación de socio" else 1)
        bruto = precio

    descuento = 0
    if tipo_cliente == "Socio" and servicio in ("Hospedaje", "Camping"):
        descuento = 50  # beneficio publicado por el club
    elif tipo_cliente == "Socio" and servicio != "Membresía anual":
        descuento = 10
    elif tipo_cliente == "Corporativo" and servicio == "Eventos":
        descuento = random.choice([0, 5, 10])
    elif random.random() < 0.06:
        descuento = 15  # campañas promocionales

    # Estado de la reserva
    if f_vis > HOY:
        estado_reserva = "Confirmada"
    else:
        estado_reserva = random.choices(["Completada", "Cancelada", "No show"], [.90, .065, .035])[0]
    if servicio == "Membresía anual":
        estado_reserva = "Completada"

    total = 0.0 if estado_reserva == "Cancelada" else round(bruto * (1 - descuento / 100), 2)

    # Pago y cobranza
    credito = tipo_cliente == "Corporativo" or (servicio == "Membresía anual" and plan == "Familiar" and random.random() < .35)
    if estado_reserva == "Confirmada" and servicio in ("Hospedaje", "Eventos", "Camping"):
        credito = True
    ica_reciente = sede == "Ica" and f_reg >= dt.date(2026, 7, 1)
    if ica_reciente and servicio in ("Membresía anual", "Hospedaje", "Eventos") and random.random() < 0.6:
        credito = True  # la sede empezó a vender en cuotas sin control de riesgo
    plazo = 30 if credito else 0
    vence = f_reg + dt.timedelta(days=plazo)
    if total == 0:
        pagado = 0.0
    elif not credito:
        pagado = total
    else:
        prob_pago = 0.86 if vence < HOY else 0.45
        if ica_reciente:
            prob_pago -= 0.40  # deterioro de cobranza que el asistente analítico debe detectar
        r = random.random()
        pagado = total if r < prob_pago else round(total * random.choice([0, 0.3, 0.5]), 2)
    saldo = round(total - pagado, 2)
    if saldo == 0:
        estado_pago = "Anulado" if estado_reserva == "Cancelada" else "Pagado"
    elif vence < HOY:
        estado_pago = "Vencido"
    else:
        estado_pago = "Parcial" if pagado > 0 else "Pendiente"

    metodo = random.choices(["Yape / Plin", "Tarjeta", "Efectivo", "Transferencia"], [.34, .30, .18, .18])[0]
    if tipo_cliente == "Corporativo":
        metodo = "Transferencia"
    if pagado == 0:
        metodo = "Sin pago"

    # Experiencia del cliente (encuesta posterior a la visita)
    nps = ""
    if estado_reserva == "Completada" and f_vis <= HOY - dt.timedelta(days=1) and random.random() < 0.63:
        p_prom, p_detr = 0.63, 0.10
        occ = ocupacion(sede, f_vis)
        if occ > 85:
            p_prom, p_detr = 0.52, 0.18  # saturación en temporada alta
        if sede == "Ica" and f_vis >= dt.date(2026, 8, 15):
            p_prom, p_detr = 0.44, 0.27
        if sede == "Tarapoto":
            p_prom += 0.08
        r = random.random()
        nps = random.choice([9, 10]) if r < p_prom else (random.randint(0, 6) if r < p_prom + p_detr else random.choice([7, 8]))

    usuario = {
        "Web": "web.reservas",
        "WhatsApp": random.choice(["bot.whatsapp", f"asesor.{CODIGO[sede].lower()}"]),
        "Presencial": f"recepcion.{CODIGO[sede].lower()}",
        "Redes sociales": "community.manager",
        "Agencias y corporativo": "ventas.corporativas",
    }[canal]
    actualizado = dt.datetime.combine(min(HOY, f_reg + dt.timedelta(days=random.randint(0, 3))),
                                      dt.time(random.randint(8, 20), random.randint(0, 59)))

    if servicio == "Membresía anual":
        socios_vigentes[sede].append((cli, f_reg + dt.timedelta(days=365), plan))

    registros.append({
        "id_registro": f"TUM-{CODIGO[sede]}-{n:05d}",
        "fecha_registro": f_reg.isoformat(),
        "fecha_visita": f_vis.isoformat(),
        "sede": sede,
        "servicio": servicio,
        "tipo_operacion": tipo_operacion,
        "canal": canal,
        "tipo_cliente": tipo_cliente,
        "id_cliente": cli["id"],
        "cliente": cli["nombre"],
        "documento": cli["doc"],
        "telefono": cli["tel"],
        "origen": cli["origen"],
        "plan_membresia": plan or "Sin plan",
        "personas": personas,
        "noches": noches,
        "precio_unitario": round(precio, 2),
        "descuento_pct": descuento,
        "monto_total": total,
        "monto_pagado": pagado,
        "saldo_pendiente": saldo,
        "metodo_pago": metodo,
        "comprobante": "Factura" if tipo_cliente == "Corporativo" else "Boleta",
        "estado_reserva": estado_reserva,
        "estado_pago": estado_pago,
        "fecha_vencimiento": vence.isoformat(),
        "ocupacion_sede_pct": ocupacion(sede, f_vis),
        "calificacion_nps": nps,
        "consentimiento_datos": random.choices(["Sí", "No"], [.86, .14])[0],
        "registrado_por": usuario,
        "ultima_actualizacion": actualizado.strftime("%Y-%m-%d %H:%M"),
    })

# --- Incidencias de calidad intencionales: el panel de gobernanza debe detectarlas ---
def fila(i):
    return registros[i]

fila(137)["telefono"] = ""
fila(912)["telefono"] = "98765"
fila(1450)["telefono"] = ""
fila(388)["documento"] = "4512873"
fila(1603)["documento"] = ""
fila(701)["consentimiento_datos"] = ""
fila(1288)["consentimiento_datos"] = ""
fila(1777)["consentimiento_datos"] = ""
fila(560)["sede"] = "lima "
for i in (845, 1902):
    if fila(i)["monto_total"] > 0:
        fila(i)["monto_pagado"] = round(fila(i)["monto_total"] * 1.08, 2)
        fila(i)["saldo_pendiente"] = round(fila(i)["monto_total"] - fila(i)["monto_pagado"], 2)
for i in (1015, 1666):
    fila(i)["fecha_visita"] = (dt.date.fromisoformat(fila(i)["fecha_registro"]) - dt.timedelta(days=2)).isoformat()
fila(1234)["id_registro"] = fila(1233)["id_registro"]

COLUMNAS = list(registros[0].keys())
assert len(registros) == TOTAL_REGISTROS


def escribir(nombre, encabezado, filas):
    with open(os.path.join(OUT, nombre), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(encabezado)
        w.writerows(filas)
    print(f"{nombre}: {len(filas)} filas × {len(encabezado)} columnas")


escribir("registros.csv", COLUMNAS, [[r[c] for c in COLUMNAS] for r in registros])

escribir("sedes.csv",
         ["sede", "codigo", "region", "lat", "lon", "apertura", "habitaciones", "parcelas_camping", "aforo_diario", "responsable_datos"],
         [[s, CODIGO[s], v[0], v[1], v[2], v[3].isoformat(), v[4], v[5], v[6], f"admin.{CODIGO[s].lower()}"] for s, v in SEDES.items()])

# Metas mensuales (para medir cumplimiento): basadas en lo real con variación, para que unas se cumplan y otras no
metas = []
reales = {}
for r in registros:
    if r["sede"] in SEDES:
        k = (r["fecha_registro"][:7], r["sede"])
        reales.setdefault(k, [0.0, 0])
        reales[k][0] += r["monto_total"]
        reales[k][1] += r["tipo_operacion"] == "Alta de socio"
for (periodo, sede), (fact, altas) in sorted(reales.items()):
    metas.append([periodo, sede, round(fact * random.uniform(0.9, 1.12), -2), max(1, round(altas * random.uniform(0.85, 1.2)))])
escribir("metas_mensuales.csv", ["periodo", "sede", "meta_facturacion", "meta_altas_socios"], metas)

DICCIONARIO = [
    ("id_registro", "Texto", "Código único de la operación", "Sí", "Único, formato TUM-SEDE-00000", "Interno", "Comercial"),
    ("fecha_registro", "Fecha", "Día en que se registró la venta o reserva", "Sí", "Entre 01/01/2025 y hoy", "Interno", "Comercial"),
    ("fecha_visita", "Fecha", "Día de uso del servicio", "Sí", "≥ fecha_registro", "Interno", "Operaciones"),
    ("sede", "Catálogo", "Sede del club", "Sí", "Lima, Chiclayo, Ica o Tarapoto", "Interno", "Gerencia"),
    ("servicio", "Catálogo", "Línea de negocio", "Sí", "Catálogo de 7 servicios", "Interno", "Comercial"),
    ("tipo_operacion", "Catálogo", "Venta, alta o renovación de socio", "Sí", "Catálogo", "Interno", "Comercial"),
    ("canal", "Catálogo", "Medio por el que llegó la reserva", "Sí", "Catálogo de 5 canales", "Interno", "Marketing"),
    ("tipo_cliente", "Catálogo", "Socio, visitante o corporativo", "Sí", "Catálogo", "Interno", "Comercial"),
    ("id_cliente", "Texto", "Identificador seudonimizado del cliente", "Sí", "Formato CLI-00000", "Interno", "Comercial"),
    ("cliente", "Texto", "Nombre o razón social", "Sí", "Enmascarar fuera de Gerencia", "Dato personal", "Comercial"),
    ("documento", "Texto", "DNI (8 dígitos), CE o RUC (11 dígitos)", "Sí", "Formato válido · Ley 29733", "Dato personal", "Comercial"),
    ("telefono", "Texto", "Celular de contacto", "Sí", "9 dígitos, inicia en 9", "Dato personal", "Comercial"),
    ("origen", "Catálogo", "Procedencia del visitante", "Sí", "Misma ciudad, otras regiones, extranjero", "Interno", "Marketing"),
    ("plan_membresia", "Catálogo", "Plan del socio", "Sí", "Individual, Familiar, Corporativo o Sin plan", "Interno", "Comercial"),
    ("personas", "Entero", "Número de personas", "Sí", "≥ 1", "Interno", "Operaciones"),
    ("noches", "Entero", "Noches de hospedaje o camping", "Sí", "≥ 0", "Interno", "Operaciones"),
    ("precio_unitario", "Moneda S/", "Tarifa aplicada", "Sí", "> 0, según tarifario vigente", "Interno", "Comercial"),
    ("descuento_pct", "Porcentaje", "Descuento otorgado", "Sí", "0 a 50 %", "Interno", "Comercial"),
    ("monto_total", "Moneda S/", "Importe facturado", "Sí", "≥ 0", "Confidencial", "Contabilidad"),
    ("monto_pagado", "Moneda S/", "Importe cobrado", "Sí", "≤ monto_total", "Confidencial", "Tesorería"),
    ("saldo_pendiente", "Moneda S/", "Deuda por cobrar", "Sí", "= total − pagado, ≥ 0", "Confidencial", "Tesorería"),
    ("metodo_pago", "Catálogo", "Medio de pago", "Sí", "Catálogo", "Interno", "Tesorería"),
    ("comprobante", "Catálogo", "Boleta o factura", "Sí", "Factura si es corporativo", "Interno", "Contabilidad"),
    ("estado_reserva", "Catálogo", "Situación de la reserva", "Sí", "Confirmada, Completada, Cancelada, No show", "Interno", "Operaciones"),
    ("estado_pago", "Catálogo", "Situación del cobro", "Sí", "Pagado, Parcial, Pendiente, Vencido, Anulado", "Interno", "Tesorería"),
    ("fecha_vencimiento", "Fecha", "Fecha límite de pago", "Sí", "≥ fecha_registro", "Interno", "Tesorería"),
    ("ocupacion_sede_pct", "Porcentaje", "Ocupación de la sede el día de la visita", "Sí", "0 a 100", "Interno", "Operaciones"),
    ("calificacion_nps", "Entero 0-10", "Respuesta a la encuesta de recomendación", "No", "0 a 10 o vacío", "Interno", "Experiencia"),
    ("consentimiento_datos", "Sí / No", "Autorización de uso comercial de datos", "Sí", "Obligatorio · Ley 29733", "Dato personal", "Legal"),
    ("registrado_por", "Texto", "Usuario o sistema que registró la operación", "Sí", "Usuario autorizado", "Interno", "TI"),
    ("ultima_actualizacion", "Fecha y hora", "Último cambio del registro (auditoría)", "Sí", "≥ fecha_registro", "Interno", "TI"),
]
escribir("diccionario_datos.csv",
         ["campo", "tipo", "descripcion", "obligatorio", "regla_validacion", "sensibilidad", "responsable"], DICCIONARIO)

# Plantilla única para importar a Google Sheets (una pestaña por tabla)
try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    numericas = {"personas", "noches", "precio_unitario", "descuento_pct", "monto_total", "monto_pagado",
                 "saldo_pendiente", "ocupacion_sede_pct", "calificacion_nps", "lat", "lon", "habitaciones",
                 "parcelas_camping", "aforo_diario", "meta_facturacion", "meta_altas_socios"}
    for archivo in ["registros", "sedes", "metas_mensuales", "diccionario_datos"]:
        ws = wb.create_sheet(archivo)
        with open(os.path.join(OUT, archivo + ".csv"), encoding="utf-8") as f:
            lector = csv.reader(f)
            enc = next(lector)
            ws.append(enc)
            for fila_csv in lector:
                ws.append([float(v) if enc[j] in numericas and v != "" else v for j, v in enumerate(fila_csv)])
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="1751A0")
        ws.freeze_panes = "A2"
    wb.save(os.path.join(OUT, "plantilla_google_sheets.xlsx"))
    print("plantilla_google_sheets.xlsx lista")
except ImportError:
    print("openpyxl no instalado: se omite la plantilla .xlsx")
