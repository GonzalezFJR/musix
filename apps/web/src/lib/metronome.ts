// Metrónomo propio (Web Audio). AlphaTab solo ofrece un clic por pulso sin
// acentos ni subdivisiones, así que generamos nuestro propio "click track".
//
// ⚠️ Sincronización: se alinea con el INICIO de reproducción y usa el tempo base
// de la partitura. Con cambios de tempo a mitad de pieza puede desfasar; el
// `offsetMs` permite ajustar el adelanto/retraso respecto al audio de AlphaTab.

export type Subdivision = "half" | "quarter" | "eighth" | "sixteenth";
export type AccentPattern = "none" | "first" | "first-third";

export interface MetronomeConfig {
  subdivision: Subdivision;
  accent: AccentPattern;
}

// Pulsos por negra para cada subdivisión.
const FACTOR: Record<Subdivision, number> = {
  half: 0.5,
  quarter: 1,
  eighth: 2,
  sixteenth: 4,
};

export class MetronomeEngine {
  private ctx?: AudioContext;
  private timer?: number;
  private nextTime = 0; // tiempo (s, reloj de audio) del próximo clic
  private pulse = 0; // índice de pulso desde el inicio
  private readonly lookahead = 25; // ms entre revisiones del planificador
  private readonly aheadTime = 0.12; // s de horizonte de planificación

  tempo = 120; // BPM (negra)
  numerator = 4; // pulsos por compás
  speed = 1; // factor de velocidad de reproducción
  subdivision: Subdivision = "quarter";
  accent: AccentPattern = "first";
  offsetMs = 0; // ajuste fino de alineación con el audio

  get enabled() {
    return this.timer != null;
  }

  start() {
    this.stop();
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.pulse = 0;
    this.nextTime = this.ctx.currentTime + this.offsetMs / 1000 + 0.06;
    this.timer = window.setInterval(() => this.schedule(), this.lookahead);
  }

  stop() {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = undefined;
  }

  private pulseSeconds() {
    return 60 / (this.tempo * this.speed) / FACTOR[this.subdivision];
  }

  private isAccented(beatInBar: number) {
    if (beatInBar < 0) return false;
    if (this.accent === "first") return beatInBar === 0;
    if (this.accent === "first-third") return beatInBar === 0 || beatInBar === 2;
    return false;
  }

  private schedule() {
    if (!this.ctx) return;
    const factor = FACTOR[this.subdivision];
    const pulsesPerBar = this.numerator * factor;
    while (this.nextTime < this.ctx.currentTime + this.aheadTime) {
      const posInBar = this.pulse % pulsesPerBar;
      const onBeat = posInBar % factor === 0; // cae en un pulso métrico
      const beatInBar = onBeat ? posInBar / factor : -1;
      this.click(this.nextTime, this.isAccented(beatInBar), onBeat);
      this.nextTime += this.pulseSeconds();
      this.pulse++;
    }
  }

  private click(time: number, accented: boolean, onBeat: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accented ? 1600 : onBeat ? 1000 : 760;
    const vol = accented ? 0.5 : onBeat ? 0.32 : 0.18;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}
