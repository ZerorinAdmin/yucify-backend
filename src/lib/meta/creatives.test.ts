import { extractVideoId, isMissingCreativeMediaColumnsError } from "./creatives";

describe("extractVideoId", () => {
  it("reads video_id from object_story_spec.video_data", () => {
    expect(
      extractVideoId({
        id: "c1",
        object_story_spec: { video_data: { video_id: "12345", image_url: "https://x" } },
      })
    ).toBe("12345");
  });

  it("reads first video_id from asset_feed_spec.videos", () => {
    expect(
      extractVideoId({
        id: "c2",
        asset_feed_spec: { videos: [{ video_id: "99" }, { video_id: "100" }] },
      })
    ).toBe("99");
  });

  it("returns undefined when no video id", () => {
    expect(
      extractVideoId({
        id: "c3",
        object_story_spec: { video_data: { image_url: "https://thumb" } },
      })
    ).toBeUndefined();
  });
});

describe("isMissingCreativeMediaColumnsError", () => {
  it("returns true for PostgREST schema cache unknown column", () => {
    expect(
      isMissingCreativeMediaColumnsError({
        message:
          "Could not find the 'video_url' column of 'ad_creatives' in the schema cache",
      })
    ).toBe(true);
  });

  it("returns true for PGRST204", () => {
    expect(isMissingCreativeMediaColumnsError({ message: "x", code: "PGRST204" })).toBe(true);
  });

  it("returns false for NOT NULL violation (also mentions video_url)", () => {
    expect(
      isMissingCreativeMediaColumnsError({
        message:
          'null value in column "video_url" of relation "ad_creatives" violates not-null constraint',
      })
    ).toBe(false);
  });
});
