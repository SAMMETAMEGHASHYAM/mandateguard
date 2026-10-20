import { describe, expect, it } from "vitest";
import {
  clockUtc,
  initials,
  percent,
  relativeTime,
  shortId,
  titleize,
} from "./format";

describe("relativeTime", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("formats recent timestamps", () => {
    expect(relativeTime("2026-10-19T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-19T11:55:00Z", now)).toBe("5m ago");
    expect(relativeTime("2026-10-19T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-10-17T12:00:00Z", now)).toBe("2d ago");
  });

  it("treats naive timestamps as UTC", () => {
    expect(relativeTime("2026-10-19T11:55:00", now)).toBe("5m ago");
  });

  it("falls back for empty or invalid input", () => {
    expect(relativeTime("", now)).toBe("—");
    expect(relativeTime("not-a-date", now)).toBe("—");
  });
});

describe("clockUtc", () => {
  it("renders a stable HH:MM:SS time", () => {
    expect(clockUtc("2026-10-19T12:34:56Z")).toBe("12:34:56");
    expect(clockUtc("2026-10-19T12:34:56")).toBe("12:34:56");
    expect(clockUtc("")).toBe("—");
  });
});

describe("shortId", () => {
  it("keeps short identifiers and truncates long ones", () => {
    expect(shortId("ABC123")).toBe("ABC123");
    expect(shortId("0123456789ABCDEF", 8)).toBe("01234567…");
    expect(shortId("")).toBe("—");
  });
});

describe("percent", () => {
  it("clamps to a whole percentage between 0 and 100", () => {
    expect(percent(0, 100)).toBe(0);
    expect(percent(50, 100)).toBe(50);
    expect(percent(150, 100)).toBe(100);
    expect(percent(10, 0)).toBe(0);
  });
});

describe("initials", () => {
  it("uses at most two words", () => {
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("OfficeDepot Demo")).toBe("OD");
    expect(initials("printer_paper")).toBe("PP");
    expect(initials("")).toBe("");
  });
});

describe("titleize", () => {
  it("converts enum values into labels", () => {
    expect(titleize("PENDING_APPROVAL")).toBe("Pending approval");
    expect(titleize("ORDER_CREATED")).toBe("Order created");
    expect(titleize("")).toBe("");
  });
});
