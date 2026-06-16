import { describe, it, expect } from "vitest";
import { formatTokens } from "@/lib/utils";

describe("formatTokens", () => {
  it("renders null/undefined as an em-dash, never 0", () => {
    expect(formatTokens(null)).toBe("—");
    expect(formatTokens(undefined)).toBe("—");
  });

  it("keeps a literal zero distinct from null", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("formats thousands with a K suffix", () => {
    expect(formatTokens(12_500)).toMatch(/K$/);
    expect(formatTokens(12_500)).toContain("12");
  });

  it("formats millions with an M suffix", () => {
    expect(formatTokens(3_400_000)).toMatch(/M$/);
    expect(formatTokens(3_400_000)).toContain("3");
  });
});
