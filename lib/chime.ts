let unlocked = false;

export function unlockInboxAudio() {
  if (typeof window === "undefined" || unlocked) return;
  unlocked = true;
  const ctx = new AudioContext();
  void ctx.resume();
  window.setTimeout(() => ctx.close(), 200);
}

export function playInboxChime() {
  if (typeof window === "undefined") return;
  unlockInboxAudio();
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 784;
  gain.gain.value = 0.05;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.16);
  window.setTimeout(() => ctx.close(), 300);
}
