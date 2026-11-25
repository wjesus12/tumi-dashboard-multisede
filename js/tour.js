/* Recorrido guiado: resalta cada zona del tablero y explica su valor de negocio. */
window.TumiTour = (() => {
  const PASOS = [
    { tab: "resumen", sel: '[data-tour="fuente"]', titulo: "Datos en vivo desde Google Sheets", texto: "El tablero lee una hoja compartida. Cuando recepción registra una venta, aquí se actualiza solo cada 5 minutos o al sincronizar." },
    { tab: "resumen", sel: '[data-tour="roles"]', titulo: "Cada persona ve lo que le corresponde", texto: "Un administrador de sede solo ve su sede y nadie ve DNI ni teléfonos sin autorización. Prueba cambiar el rol." },
    { tab: "resumen", sel: '[data-tour="kpis"]', titulo: "El pulso del negocio en seis cifras", texto: "Comparadas con el mismo periodo del año anterior. Clic en cualquiera para ir a su pestaña." },
    { tab: "resumen", sel: '[data-tour="pestanas"]', titulo: "Nueve pestañas, cada una con un propósito", texto: "Dinero, cobranza, socios, turistas, comparador, detalle, gobernanza e IA. También puedes usar las teclas 1 a 9." },
    { tab: "resumen", sel: '[data-tour="postales"]', titulo: "Las cuatro sedes de un vistazo", texto: "Cada postal resume facturación, cobranza, NPS y ocupación, con un estado automático. Clic para filtrar todo por esa sede." },
    { tab: "dinero", sel: '[data-tour="ingresos"]', titulo: "Lo vendido, lo cobrado y lo que viene", texto: "La brecha entre barras y línea verde es dinero por cobrar. La zona amarilla es el pronóstico de IA con su rango." },
    { tab: "turistas", sel: '[data-tour="experiencia"]', titulo: "Pensado para el turista", texto: "De dónde viene cada visitante, qué sede elige y qué experiencia disfruta. Clave para campañas y agencias." },
    { tab: "cara", sel: '[data-tour="cara"]', titulo: "Cara a cara", texto: "Elige dos sedes y compáralas en seis dimensiones para decidir dónde invertir y qué replicar." },
    { tab: "detalle", sel: '[data-tour="detalle"]', titulo: "Tu propia tabla dinámica", texto: "Agrupa por sede, servicio, canal o cliente. Ordena por cualquier columna y despliega cada fila." },
    { tab: "gobernanza", sel: '[data-tour="gobernanza"]', titulo: "Datos en los que se puede confiar", texto: "Índice de calidad, 10 reglas automáticas, recorrido del dato, Ley 29733 y bitácora de auditoría." },
    { tab: "ia", sel: '[data-tour="ia"]', titulo: "IA responsable, no caja negra", texto: "Cada hallazgo explica cómo se calculó y espera que una persona lo valide." },
    { tab: "ia", sel: '[data-tour="automatizacion"]', titulo: "Menos trabajo manual", texto: "Sincronización, validación, cobranza por WhatsApp y reporte semanal automáticos. Gracias por recorrer la propuesta." },
  ];
  let i = 0, activo = false;
  const $ = (id) => document.getElementById(id);

  function posicionar() {
    if (!activo) return;
    const el = document.querySelector(PASOS[i].sel);
    if (!el) return;
    const r = el.getBoundingClientRect(), pad = 8;
    const spot = $("tour-spot"), card = $("tour-card");
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height + pad * 2, innerHeight - 20)}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight, m = 16;
    let top = r.bottom + 18;
    if (top + ch > innerHeight - m) top = r.top - ch - 18;
    if (top < m) top = Math.min(innerHeight - ch - m, Math.max(m, r.top + 20));
    let left = Math.min(Math.max(m, r.left), innerWidth - cw - m);
    card.style.top = `${top}px`; card.style.left = `${left}px`;
  }

  function mostrar(n) {
    i = Math.max(0, Math.min(PASOS.length - 1, n));
    const p = PASOS[i];
    if (p.tab && window.TumiApp && TumiApp.tab !== p.tab) TumiApp.irA(p.tab, { scroll: false, sonido: false });
    const el = document.querySelector(p.sel);
    $("tour-step").textContent = `Paso ${i + 1} de ${PASOS.length}`;
    $("tour-title").textContent = p.titulo;
    $("tour-text").textContent = p.texto;
    $("tour-prev").disabled = i === 0;
    $("tour-next").innerHTML = i === PASOS.length - 1 ? "Finalizar" : 'Siguiente <svg class="ic ic--sm"><use href="#i-chev-r"/></svg>';
    $("tour-dots").innerHTML = PASOS.map((_, k) => `<i class="${k === i ? "is-on" : ""}"></i>`).join("");
    if (el) {
      const r = el.getBoundingClientRect();
      const destino = scrollY + r.top - Math.max(90, (innerHeight - Math.min(r.height, innerHeight * .6)) / 2.4);
      scrollTo({ top: Math.max(0, destino), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    TumiSound.play("paso");
    setTimeout(posicionar, 420);
    setTimeout(posicionar, 900);
  }

  function iniciar() {
    activo = true;
    $("tour").hidden = false;
    mostrar(0);
    $("tour-next").focus({ preventScroll: true });
  }
  function terminar() {
    activo = false;
    $("tour").hidden = true;
    TumiSound.play("exito");
  }

  function init() {
    $("tour-next").addEventListener("click", () => (i === PASOS.length - 1 ? terminar() : mostrar(i + 1)));
    $("tour-prev").addEventListener("click", () => mostrar(i - 1));
    $("tour-skip").addEventListener("click", terminar);
    addEventListener("resize", posicionar);
    addEventListener("scroll", () => requestAnimationFrame(posicionar), { passive: true });
    document.addEventListener("keydown", (e) => {
      if (!activo) return;
      if (e.key === "Escape") terminar();
      if (e.key === "ArrowRight") i === PASOS.length - 1 ? terminar() : mostrar(i + 1);
      if (e.key === "ArrowLeft") mostrar(i - 1);
    });
  }

  return { init, iniciar, terminar, get activo() { return activo; } };
})();
