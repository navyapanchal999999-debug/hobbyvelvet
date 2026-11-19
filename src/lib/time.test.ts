import { describe, expect, it } from "vitest";
import { ago, fmtTime, newMessagesLabel } from "./time";

describe("time formatting", () => {
  it("uses the 12-hour clock with AM/PM", () => {
    expect(fmtTime(new Date(2026, 0, 1, 0, 5))).toBe("12:05 AM");
    expect(fmtTime(new Date(2026, 0, 1, 13, 7))).toBe("1:07 PM");
    expect(fmtTime(new Date(2026, 0, 1, 12, 0))).toBe("12:00 PM");
  });
  it("shows elapsed time like 1m ago", () => {
    const now = new Date(2026, 0, 1, 10, 0).getTime();
    expect(ago(now - 10_000, now)).toBe("just now");
    expect(ago(now - 60_000, now)).toBe("1m ago");
    expect(ago(now - 2 * 3600_000, now)).toBe("2h ago");
  });
  it("labels unread counts as N New Messages", () => {
    expect(newMessagesLabel(5)).toBe("5 New Messages");
    expect(newMessagesLabel(1)).toBe("1 New Message");
  });
});
