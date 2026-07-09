// A shrill three-beep alarm, synthesized with the Web Audio API so no audio
// asset needs to ship. Browsers require a prior user gesture to allow audio;
// the Start-timer click satisfies that for the rest of the session.
let audioCtx: AudioContext | null = null;

export function playAlarm() {
  audioCtx ??= new AudioContext();
  const ctx = audioCtx;
  if (ctx.state === "suspended") ctx.resume();

  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const start = now + i * 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1400, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.25);
  }
}
