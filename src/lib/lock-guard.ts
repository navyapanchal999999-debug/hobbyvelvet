// While a file picker or a call is open the page can be hidden on purpose;
// those moments must not lock the app.
let holds = 0;
let pickerUntil = 0;

export function holdLock() {
  holds += 1;
  return () => {
    holds = Math.max(0, holds - 1);
  };
}

/** Allow the page to be hidden for a short while (e.g. opening the photo picker). */
export function allowPicker(ms = 120_000) {
  pickerUntil = Date.now() + ms;
  const clear = () => {
    setTimeout(() => {
      pickerUntil = 0;
    }, 800);
    window.removeEventListener("focus", clear);
  };
  window.addEventListener("focus", clear);
}

export function lockSuppressed() {
  return holds > 0 || Date.now() < pickerUntil;
}
