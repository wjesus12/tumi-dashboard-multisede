/* Sonido generado en el navegador con Web Audio (sin archivos externos):
 * efectos suaves de interacción y música ambiente andina generativa (quena, charango y colchón armónico).
 */
window.TumiSound = (() => {
  let ctx = null, master, sfxBus, musicBus, reverbSend, timer = null, nextBar = 0, barIndex = 0;
  let musicOn = false, lastHover = 0;
  let sfxOn = leer("tumi-sfx", true);

  function leer(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v === "1"; } catch { return def; } }
  function guardar(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* almacenamiento no disponible */ } }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      const reverb = ctx.createConvolver(); reverb.buffer = impulso(2.8);
      reverbSend = ctx.createGain(); reverbSend.gain.value = 0.35; reverbSend.connect(reverb); reverb.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master); sfxBus.connect(reverbSend);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master); musicBus.connect(reverbSend);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function impulso(seg) {
    const len = ctx.sampleRate * seg, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  function ruidoBuffer(seg) {
    const len = ctx.sampleRate * seg, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function nota(freq, { tipo = "sine", t = ctx.currentTime, dur = .2, vol = .1, ataque = .005, salida, vibrato = 0, detune = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vibrato, t + Math.min(.35, dur / 2));
      lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + .05);
    }
    o.connect(g); g.connect(salida || sfxBus);
    o.start(t); o.stop(t + dur + .05);
  }

  function soplo(t, dur, vol, salida) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = ruidoBuffer(dur + .1); f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(salida); s.start(t); s.stop(t + dur + .1);
  }

  const EFECTOS = {
    click() { nota(740, { dur: .09, vol: .12 }); nota(1110, { dur: .06, vol: .04, t: ctx.currentTime + .015 }); },
    hover() { nota(1650, { dur: .03, vol: .018 }); },
    toggle() { nota(660, { dur: .08, vol: .08, tipo: "triangle" }); nota(990, { dur: .12, vol: .07, tipo: "triangle", t: ctx.currentTime + .07 }); },
    filtro() {
      const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = ruidoBuffer(.4); f.type = "bandpass"; f.Q.value = 3;
      f.frequency.setValueAtTime(450, t); f.frequency.exponentialRampToValueAtTime(2600, t + .28);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + .06); g.gain.exponentialRampToValueAtTime(0.0001, t + .32);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + .4);
      nota(880, { dur: .18, vol: .04, tipo: "triangle", t: t + .12 });
    },
    exito() { [440, 523.25, 659.25, 880].forEach((f, i) => nota(f, { tipo: "triangle", dur: .5, vol: .08, t: ctx.currentTime + i * .085 })); },
    paso() { const t = ctx.currentTime; nota(523.25, { dur: .45, vol: .1, t }); nota(1569.8, { dur: .2, vol: .025, t }); },
    alerta() { nota(880, { tipo: "triangle", dur: .14, vol: .08 }); nota(659.25, { tipo: "triangle", dur: .22, vol: .08, t: ctx.currentTime + .13 }); },
    seguro() { nota(220, { tipo: "triangle", dur: .16, vol: .1 }); nota(330, { tipo: "triangle", dur: .25, vol: .08, t: ctx.currentTime + .1 }); },
  };

  function play(nombre) {
    if (!sfxOn || !ctx || ctx.state !== "running") return;
    if (nombre === "hover") { const n = performance.now(); if (n - lastHover < 70) return; lastHover = n; }
    try { EFECTOS[nombre] && EFECTOS[nombre](); } catch { /* el audio nunca debe romper la interfaz */ }
  }

  /* ---------- Música ambiente generativa ---------- */
  const BPM = 76, BEAT = 60 / BPM, BAR = BEAT * 4;
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const ACORDES = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]]; // Am7 · Fmaj7 · C · G
  const PENTA = [69, 72, 74, 76, 79, 81, 84]; // La menor pentatónica (quena)
  let pos = 2;

  function compas(t) {
    const acorde = ACORDES[barIndex % ACORDES.length];
    // Colchón armónico
    if (barIndex % 2 === 0) {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.connect(musicBus);
      acorde.forEach((m) => {
        [-6, 6].forEach((d) => nota(hz(m - 12), { tipo: "triangle", t, dur: BAR * 2.2, vol: .022, ataque: 1.8, salida: lp, detune: d }));
      });
      nota(hz(acorde[0] - 24), { t, dur: BAR * 2, vol: .05, ataque: .4, salida: musicBus });
    }
    // Charango: arpegio suave
    for (let b = 0; b < 8; b++) {
      if (Math.random() < .55) {
        const m = acorde[(b + barIndex) % acorde.length] + 12;
        nota(hz(m), { tipo: "triangle", t: t + b * BEAT / 2, dur: .55, vol: .028, salida: musicBus });
      }
    }
    // Quena: frase cada dos compases
    if (barIndex % 2 === 1 || Math.random() < .3) {
      let tt = t + BEAT * (Math.random() < .5 ? 0 : .5);
      const notas = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < notas && tt < t + BAR; i++) {
        pos = Math.max(0, Math.min(PENTA.length - 1, pos + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
        const dur = [BEAT * .5, BEAT, BEAT, BEAT * 1.5][Math.floor(Math.random() * 4)];
        nota(hz(PENTA[pos]), { tipo: "sine", t: tt, dur: dur * 1.1, vol: .045, ataque: .09, salida: musicBus, vibrato: 14 });
        soplo(tt, .12, .006, musicBus);
        tt += dur;
      }
    }
    // Bombo suave al inicio de cada compás
    nota(62, { t, dur: .35, vol: .06, salida: musicBus });
    barIndex++;
  }

  function programar() {
    while (nextBar < ctx.currentTime + 1.2) { compas(nextBar); nextBar += BAR; }
  }

  function setMusic(on) {
    musicOn = on;
    if (!ensure()) return;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    if (on) {
      if (!timer) { nextBar = t + .15; barIndex = 0; timer = setInterval(programar, 250); programar(); }
      musicBus.gain.linearRampToValueAtTime(.85, t + 2.5);
    } else {
      musicBus.gain.linearRampToValueAtTime(0, t + 1.4);
      setTimeout(() => { if (!musicOn && timer) { clearInterval(timer); timer = null; } }, 1500);
    }
  }

  function setSfx(on) { sfxOn = on; guardar("tumi-sfx", on); }

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return { unlock: ensure, play, setMusic, setSfx, get music() { return musicOn; }, get sfx() { return sfxOn; } };
})();
