import { describe, expect, it } from "vitest";
import { csv } from "./api";

describe("csv", () => {
  it("splits, trims and drops empties", () => expect(csv(" a, b ,,c ")).toEqual(["a", "b", "c"]));
  it("handles empty input", () => expect(csv("")).toEqual([]));
});

import { money } from "./api";
describe("money", () => {
  it("formats cents", () => expect(money(1998)).toBe("$19.98"));
  it("formats zero", () => expect(money(0)).toBe("$0.00"));
});
