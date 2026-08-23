// Synthesized "thock" keystroke sounds.
//
// TypeThock-original, procedurally generated audio modeled on deep "cream
// thock" mechanical keyboards (lubed linears in a foam-filled case): each
// press is an impact — a pitched body that lands around 150-175 Hz and drops
// immediately, a sub-bass case thump, and only a whisper of filtered noise
// for keycap texture. High-frequency energy is deliberately minimal and the
// master bus is rolled off, so long sessions stay soothing. Everything is
// generated locally with the Web Audio API; there are no audio samples and
// no network fetches.

export type KeystrokeSoundKind = "key" | "space" | "backspace";

export interface ThockPlan {
  /** Frequency the impact body starts at, in hertz. */
  readonly bodyStartHz: number;
  /** Frequency the body settles to right after impact, in hertz. */
  readonly bodyRestHz: number;
  /** Exponential decay length of the body envelope, in seconds. */
  readonly bodyDecaySeconds: number;
  /** Sub-bass case-thump frequency, in hertz. */
  readonly subHz: number;
  /** Peak amplitude of the sub thump before master volume. */
  readonly subPeakGain: number;
  /** Decay length of the sub thump, in seconds. */
  readonly subDecaySeconds: number;
  /** Low-pass cutoff shaping the faint keycap-tap noise, in hertz. */
  readonly tapCutoffHz: number;
  /** Peak amplitude of the keycap-tap noise layer. */
  readonly tapPeakGain: number;
  /** Human-timing jitter applied before the impact starts, in seconds. */
  readonly startDelaySeconds: number;
}

const KIND_BASES: Record<
  KeystrokeSoundKind,
  {
    bodyStartHz: number;
    bodyRestHz: number;
    bodyDecaySeconds: number;
    subHz: number;
    subPeakGain: number;
    tapCutoffHz: number;
  }
> = {
  key: {
    bodyStartHz: 172,
    bodyRestHz: 104,
    bodyDecaySeconds: 0.125,
    subHz: 78,
    subPeakGain: 0.34,
    tapCutoffHz: 1350,
  },
  space: {
    bodyStartHz: 148,
    bodyRestHz: 88,
    bodyDecaySeconds: 0.155,
    subHz: 64,
    subPeakGain: 0.46,
    tapCutoffHz: 1150,
  },
  backspace: {
    bodyStartHz: 162,
    bodyRestHz: 96,
    bodyDecaySeconds: 0.138,
    subHz: 71,
    subPeakGain: 0.4,
    tapCutoffHz: 1250,
  },
};

/**
 * Plans one keystroke sound. Pure so tests can pin the acoustic envelope:
 * the impact sits in the low "cream thock" register with a fast pitch drop,
 * spaces land deepest, and every parameter jitters per press so long sessions
 * never sound machine-gunned.
 */
export function planThock(
  kind: KeystrokeSoundKind,
  random: () => number = Math.random,
): ThockPlan {
  const base = KIND_BASES[kind];
  const jitter = (fraction: number): number =>
    1 + (random() * 2 - 1) * fraction;
  return {
    bodyStartHz: Math.round(base.bodyStartHz * jitter(0.08)),
    bodyRestHz: Math.round(base.bodyRestHz * jitter(0.08)),
    bodyDecaySeconds: base.bodyDecaySeconds * jitter(0.14),
    subHz: Math.round(base.subHz * jitter(0.07)),
    subPeakGain: base.subPeakGain * jitter(0.18),
    subDecaySeconds: 0.06 * jitter(0.15),
    tapCutoffHz: Math.round(base.tapCutoffHz * jitter(0.12)),
    tapPeakGain: 0.16 * jitter(0.25),
    startDelaySeconds: random() * 0.01,
  };
}

let graph: {
  context: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
} | null = null;

function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  if (typeof window.AudioContext === "function") return window.AudioContext;
  const scoped = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return typeof scoped.webkitAudioContext === "function"
    ? scoped.webkitAudioContext
    : null;
}

function perceptualMasterGain(volume: number): number {
  const clamped = Math.min(1, Math.max(0, volume));
  // Perceptual loudness curve so the volume slider feels roughly linear.
  return 0.9 * Math.pow(clamped, 1.4);
}

function ensureGraph(volume: number): typeof graph {
  const Ctor = audioContextConstructor();
  if (Ctor === null) return null;
  try {
    if (graph === null) {
      const context = new Ctor();
      // Gentle roll-off so no layer can ever sound sharp or fatiguing.
      const softener = context.createBiquadFilter();
      softener.type = "lowpass";
      softener.frequency.value = 5_500;
      softener.Q.value = 0.4;
      softener.connect(context.destination);
      const master = context.createGain();
      master.connect(softener);
      const length = Math.floor(context.sampleRate * 0.25);
      const noise = context.createBuffer(1, length, context.sampleRate);
      const channel = noise.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        channel[index] = Math.random() * 2 - 1;
      }
      graph = { context, master, noise };
    }
    graph.master.gain.value = perceptualMasterGain(volume);
    return graph;
  } catch {
    graph = null;
    return null;
  }
}

/** Unlocks audio output from a user gesture without playing anything. */
export function primeKeyboardSound(): void {
  try {
    const active = ensureGraph(1);
    if (active === null) return;
    if (active.context.state !== "running") {
      void active.context.resume().catch(() => {});
    }
  } catch {
    // Sound is presentation sugar; failures here must stay silent.
  }
}

/**
 * Plays one synthesized keystroke. Safe to call on every keypress: the graph
 * is created lazily on first use, suspended contexts resume opportunistically,
 * and any failure degrades to silence.
 */
export function playKeystroke(
  kind: KeystrokeSoundKind,
  volume: number,
): void {
  try {
    const active = ensureGraph(volume);
    if (active === null) return;
    const { context, master, noise } = active;
    if (context.state !== "running") {
      void context.resume().catch(() => {});
    }
    const plan = planThock(kind);
    const attackAt = context.currentTime + Math.max(0, plan.startDelaySeconds);

    // Layer 1: the "thock" itself — a pitched impact body whose frequency
    // drops instantly on landing, like a keycap striking a foam-damped plate.
    const body = context.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(plan.bodyStartHz, attackAt);
    body.frequency.exponentialRampToValueAtTime(
      Math.max(30, plan.bodyRestHz),
      attackAt + 0.028,
    );

    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.000_1, attackAt);
    bodyGain.gain.linearRampToValueAtTime(0.5, attackAt + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(
      0.000_1,
      attackAt + plan.bodyDecaySeconds,
    );

    body.connect(bodyGain);
    bodyGain.connect(master);

    // Layer 2: sub-bass case thump giving the sound its depth and warmth.
    const sub = context.createOscillator();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(plan.subHz, attackAt);
    sub.frequency.exponentialRampToValueAtTime(
      Math.max(25, plan.subHz * 0.7),
      attackAt + plan.subDecaySeconds,
    );

    const subGain = context.createGain();
    subGain.gain.setValueAtTime(0.000_1, attackAt);
    subGain.gain.linearRampToValueAtTime(plan.subPeakGain, attackAt + 0.005);
    subGain.gain.exponentialRampToValueAtTime(
      0.000_1,
      attackAt + plan.subDecaySeconds,
    );

    sub.connect(subGain);
    subGain.connect(master);

    // Layer 3: whisper of low-passed noise for keycap contact texture.
    const tapSource = context.createBufferSource();
    tapSource.buffer = noise;

    const tapFilter = context.createBiquadFilter();
    tapFilter.type = "lowpass";
    tapFilter.frequency.value = plan.tapCutoffHz;
    tapFilter.Q.value = 0.7;

    const tapGain = context.createGain();
    tapGain.gain.setValueAtTime(0.000_1, attackAt);
    tapGain.gain.linearRampToValueAtTime(plan.tapPeakGain, attackAt + 0.002);
    tapGain.gain.exponentialRampToValueAtTime(0.000_1, attackAt + 0.03);

    tapSource.connect(tapFilter);
    tapFilter.connect(tapGain);
    tapGain.connect(master);

    const stopAt =
      attackAt + Math.max(plan.bodyDecaySeconds, plan.subDecaySeconds) + 0.05;
    const cleanup = () => {
      body.disconnect();
      bodyGain.disconnect();
      sub.disconnect();
      subGain.disconnect();
      tapSource.disconnect();
      tapFilter.disconnect();
      tapGain.disconnect();
    };
    body.onended = cleanup;
    body.start(attackAt);
    sub.start(attackAt);
    sub.stop(stopAt);
    tapSource.start(attackAt);
    tapSource.stop(attackAt + 0.06);
    body.stop(stopAt);
  } catch {
    // Sound is presentation sugar; failures here must stay silent.
  }
}
