import {
  charSimilarityRatio,
  isTooSimilarToOriginal,
  tokenOverlapRatio,
  validateTranscriptSuggestions,
} from "../transcript_suggestion_validation";

describe("charSimilarityRatio / tokenOverlapRatio", () => {
  it("identical strings have high char similarity", () => {
    expect(charSimilarityRatio("hello", "hello")).toBe(1);
  });

  it("tokenOverlapRatio rises when most content words overlap", () => {
    const a = "Overdue loans piling up then stop immediately today";
    const b = "Overdue loans piling up then stop right now please";
    expect(tokenOverlapRatio(a, b)).toBeGreaterThan(0.7);
  });
});

describe("isTooSimilarToOriginal", () => {
  const orig = "Overdue loans piling up? Then stop.";

  it("flags near-paraphrase", () => {
    expect(isTooSimilarToOriginal(orig, "Overdue loans piling up? Then stop now!")).toBe(true);
  });

  it("allows structurally different hook", () => {
    expect(isTooSimilarToOriginal(orig, "Paying three EMIs every month with no end in sight?")).toBe(
      false
    );
  });
});

describe("validateTranscriptSuggestions", () => {
  const orig = "Overdue loans piling up? Then stop.";

  it("accepts empty audit when no transcript", () => {
    const r = validateTranscriptSuggestions({
      originalTranscript: null,
      evidence: [],
      suggestions: [],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects evidence or suggestions when no transcript", () => {
    const r = validateTranscriptSuggestions({
      originalTranscript: "",
      evidence: ["x"],
      suggestions: [],
    });
    expect(r.ok).toBe(false);
  });

  it("requires evidence and 2–3 diverse suggestions with transcript", () => {
    const ok = validateTranscriptSuggestions({
      originalTranscript: orig,
      evidence: [`“${orig.slice(0, 20)}…” is weak`],
      suggestions: [
        {
          line: "Paying 3 overdue EMIs every month?",
          change_type: "specificity",
          based_on: "Concrete scenario",
        },
        {
          line: "This is why your loans keep getting worse",
          change_type: "pattern_interrupt",
          based_on: "Curiosity gap",
        },
      ],
    });
    expect(ok.ok).toBe(true);
  });

  it("rejects duplicate change_type only", () => {
    const r = validateTranscriptSuggestions({
      originalTranscript: orig,
      evidence: ["quoted"],
      suggestions: [
        { line: "Line one that is totally different structurally", change_type: "angle", based_on: "a" },
        { line: "Another unrelated opening about credit cards", change_type: "angle", based_on: "b" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects Act now", () => {
    const r = validateTranscriptSuggestions({
      originalTranscript: orig,
      evidence: ["e"],
      suggestions: [
        { line: "New angle about debt snowball", change_type: "angle", based_on: "x" },
        { line: "Act now to fix loans", change_type: "pattern_interrupt", based_on: "y" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects too-similar line", () => {
    const r = validateTranscriptSuggestions({
      originalTranscript: orig,
      evidence: ["e"],
      suggestions: [
        { line: "Completely different hook about savings", change_type: "angle", based_on: "a" },
        { line: orig, change_type: "pattern_interrupt", based_on: "b" },
      ],
    });
    expect(r.ok).toBe(false);
  });
});
