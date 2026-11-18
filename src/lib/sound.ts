// All TALK sounds are synthesised in the browser — no files, no push popups.
type Note = [freq: number, ms: number, type?: OscillatorType];

export const TONES: { name: string; notes: Note[] }[] = [
  { name: "Glass", notes: [[1318, 90, "sine"], [1760, 160, "sine"]] },
  { name: "Pop", notes: [[660, 60, "triangle"], [990, 90, "triangle"]] },
  { name: "Chime", notes: [[784, 120, "sine"], [988, 120, "sine"], [1175, 220, "sine"]] },
  { name: "Ping", notes: [[1568, 180, "sine"]] },
  { name: "Drop", notes: [[1046, 70, "sine"], [784, 70, "sine"], [523, 140, "sine"]] },
  { name: "Bubble", notes: [[440, 50, "sine"], [660, 50, "sine"], [880, 90, "sine"]] },
  { name: "Bell", notes: [[880, 260, "triangle"], [1320, 260, "sine"]] },
  { name: "Tick", notes: [[2000, 30, "square"], [0, 60], [2000, 30, "square"]] },
  { name: "Soft", notes: [[523, 160, "sine"], [659, 220, "sine"]] },
  { name: "Arcade", notes: [[988, 60, "square"], [1319, 60, "square"], [1976, 120, "square"]] },
];

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from any tap so later sounds are allowed to play. */
export function unlockAudio() {
  audio();
}

function playNotes(notes: Note[], volume = 0.18) {
  const ac = audio();
  if (!ac) return 0;
  let t = ac.currentTime + 0.01;
  for (const [freq, ms, type = "sine"] of notes) {
    const dur = ms / 1000;
    if (freq > 0) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    t += dur;
  }
  return t - ac.currentTime;
}

export function playTone(index: number) {
  const tone = TONES[(Math.max(1, Math.min(10, index)) - 1) as number];
  playNotes(tone.notes);
}

let ringTimer: ReturnType<typeof setInterval> | null = null;
export function startRinging(kind: "incoming" | "outgoing") {
  stopRinging();
  const pattern: Note[] =
    kind === "incoming"
      ? [[880, 180, "sine"], [1108, 180, "sine"], [0, 80], [880, 180, "sine"], [1108, 260, "sine"]]
      : [[440, 400, "sine"], [480, 400, "sine"]];
  const play = () => playNotes(pattern, kind === "incoming" ? 0.22 : 0.08);
  play();
  ringTimer = setInterval(play, kind === "incoming" ? 2200 : 3000);
}
export function stopRinging() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}
