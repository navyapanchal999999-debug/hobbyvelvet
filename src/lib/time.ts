/** 12-hour clock with AM/PM, e.g. "6:38 AM". Used for every time shown in the app. */
export function fmtTime(input: string | number | Date) {
  const d = new Date(input);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Short elapsed time: "just now", "1m ago", "3h ago", "2d ago". */
export function ago(input: string | number | Date, now: number = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(input).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(input).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** "5 New Messages" / "1 New Message". */
export function newMessagesLabel(n: number) {
  return `${n} New Message${n === 1 ? "" : "s"}`;
}
