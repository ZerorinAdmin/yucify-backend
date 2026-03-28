import {
  extractFirstQuotedSnippet,
  hasOnlyDegenerateQuotedSnippet,
  includesQuotedSnippet,
  isHollowQuotedSeePlaceholder,
  prepareSeeForQuoteChecks,
} from "../quote_detection";

describe("quote_detection", () => {
  it("accepts ASCII double-quoted see text", () => {
    const s = '"Multiple loans stressing you out?"';
    expect(includesQuotedSnippet(s)).toBe(true);
    expect(extractFirstQuotedSnippet(s)).toBe("Multiple loans stressing you out?");
  });

  it("accepts JSON-style escaped quotes in a parsed string value", () => {
    const s = '"Multiple loans?"';
    expect(includesQuotedSnippet(s)).toBe(true);
  });

  it("normalizes curly double quotes to match", () => {
    const s = "\u201CMultiple loans stressing you out?\u201D";
    expect(includesQuotedSnippet(s)).toBe(true);
    expect(prepareSeeForQuoteChecks(s)).toContain('"Multiple loans stressing you out?"');
  });

  it("normalizes guillemets", () => {
    const s = "\u00ABMultiple loans\u00BB";
    expect(includesQuotedSnippet(s)).toBe(true);
    expect(extractFirstQuotedSnippet(s)).toBe("Multiple loans");
  });

  it("strips zero-width space before quotes", () => {
    const s = "\u200B\u201CMultiple loans\u201D";
    expect(includesQuotedSnippet(s)).toBe(true);
  });

  it("accepts long single-quoted snippet after normalizing singles", () => {
    const s = "\u2018Multiple loans stressing you out?\u2019";
    expect(includesQuotedSnippet(s)).toBe(true);
    expect(extractFirstQuotedSnippet(s)).toBe("Multiple loans stressing you out?");
  });

  it("rejects too-short inner segment", () => {
    expect(includesQuotedSnippet('"ab"')).toBe(false);
    expect(includesQuotedSnippet("'short'")).toBe(false);
  });

  it("detects hollow empty-quote placeholder from model", () => {
    expect(isHollowQuotedSeePlaceholder('""')).toBe(true);
    expect(isHollowQuotedSeePlaceholder('"   "')).toBe(true);
    expect(isHollowQuotedSeePlaceholder('"Real hook text here"')).toBe(false);
  });

  it("detects whitespace-only quoted inner as degenerate", () => {
    expect(hasOnlyDegenerateQuotedSnippet('"   "')).toBe(true);
    expect(hasOnlyDegenerateQuotedSnippet('"abc"')).toBe(false);
  });
});
