export type Cue = "perfect" | "success" | "fail";

/** Which sound an attempt gets. Pure so it can be tested; playing it is separate. */
export function cueFor(feedback: "perfect" | "completed" | "failed"): Cue {
  if (feedback === "failed") return "fail";
  return feedback === "perfect" ? "perfect" : "success";
}

/** Each cue is a few short notes (Hz, ms). Quiet, brief, and never the only signal. */
export const CUES: Readonly<Record<Cue, readonly (readonly [number, number])[]>> = {
  perfect: [
    [660, 90],
    [880, 90],
    [1175, 160],
  ],
  success: [
    [660, 90],
    [880, 140],
  ],
  fail: [[220, 200]],
};

let context: AudioContext | null = null;

/**
 * Plays a cue with the Web Audio API (no audio files, no dependency). Does nothing where audio is
 * unavailable. The visible feedback never depends on it: sound is an optional extra (AGENTS 19).
 */
export function playCue(cue: Cue): void {
  try {
    const Audio = window.AudioContext;
    if (typeof Audio !== "function") return;
    context ??= new Audio();
    const audio = context;
    void audio.resume();
    let start = audio.currentTime;
    for (const [frequency, ms] of CUES[cue]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + ms / 1000 + 0.02);
      start += ms / 1000;
    }
  } catch {
    // No sound is not an error.
  }
}
