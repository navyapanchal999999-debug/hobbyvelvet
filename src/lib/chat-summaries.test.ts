import { describe, expect, it } from "vitest";
import { listLine, totalUnread, type Summary } from "./chat-summaries";

const row = (p: Partial<Summary>): Summary => ({
  other_id: "b",
  last_id: "m1",
  last_kind: "text",
  last_body: "secret text",
  last_sender: "b",
  last_at: "2026-01-01T10:00:00Z",
  unread: 0,
  ...p,
});

describe("chat list unread indicators", () => {
  it("hides unread text and shows '5 New Messages'", () => {
    expect(listLine(row({ unread: 5 }), "a")).toEqual({ type: "unread", label: "5 New Messages" });
  });
  it("uses the singular for one unread message", () => {
    expect(listLine(row({ unread: 1 }), "a")).toEqual({ type: "unread", label: "1 New Message" });
  });
  it("shows the last message once everything is read", () => {
    expect(listLine(row({ unread: 0 }), "a")).toMatchObject({ type: "message", body: "secret text", mine: false });
  });
  it("adds up unread counts across conversations", () => {
    const m = new Map([["b", row({ unread: 3 })], ["c", row({ other_id: "c", unread: 2 })]]);
    expect(totalUnread(m)).toBe(5);
  });
});
