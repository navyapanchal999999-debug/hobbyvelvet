import { useLayoutEffect, useRef, type RefObject } from "react";

type VirtualKeyboard = EventTarget & { overlaysContent: boolean; boundingRect: DOMRect };

/**
 * Floating-composer keyboard handling, without React re-renders.
 *
 * Android Chrome: the VirtualKeyboard API makes the keyboard overlay the page,
 * so nothing in the layout moves; we read the keyboard height and lift only the
 * composer. Elsewhere (iOS Safari, older browsers) the visual viewport is used,
 * and any pan the browser applies is cancelled by moving the screen back.
 *
 * Writes on `rootRef`: --kb (keyboard height px), --vv-top (pan offset px),
 * data-kb="open" | "closed".
 */
export function useKeyboardInset(rootRef: RefObject<HTMLElement | null>, onChange?: (kb: number, prev: number) => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;
    const vv = window.visualViewport;
    if (vk) vk.overlaysContent = true;

    let raf = 0;
    let lastKb = -1;
    let lastTop = -1;
    const apply = () => {
      raf = 0;
      const vkH = vk ? Math.round(vk.boundingRect.height) : 0;
      const layoutH = document.documentElement.clientHeight;
      const top = vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
      const vvKb = vv ? Math.max(0, Math.round(layoutH - vv.height - vv.offsetTop)) : 0;
      let kb = Math.max(vkH, vvKb);
      if (kb < 80) kb = 0; // browser bars, not a keyboard
      if (top !== lastTop) {
        lastTop = top;
        el.style.setProperty("--vv-top", `${top}px`);
      }
      if (kb !== lastKb) {
        const prev = lastKb;
        lastKb = kb;
        el.style.setProperty("--kb", `${kb}px`);
        el.dataset["kb"] = kb > 0 ? "open" : "closed";
        if (prev >= 0) cb.current?.(kb, prev);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    vk?.addEventListener("geometrychange", schedule);
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    apply();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vk?.removeEventListener("geometrychange", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (vk) vk.overlaysContent = false;
    };
  }, [rootRef]);
}
