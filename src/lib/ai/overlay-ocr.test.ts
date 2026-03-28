import sharp from "sharp";
import { extractOverlayTextFromImageUrl } from "@/lib/ai/overlay-ocr";

const mockCreate = jest.fn();

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: class OpenAI {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_opts: { apiKey: string }) {
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };
      }
    },
  };
});

describe("extractOverlayTextFromImageUrl", () => {
  let sampleImageBytes: Buffer;

  beforeAll(async () => {
    sampleImageBytes = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    mockCreate.mockReset();
    process.env.OPENAI_API_KEY = "test";
    global.fetch = jest.fn().mockResolvedValue(
      new Response(sampleImageBytes, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })
    ) as unknown as typeof fetch;
  });

  it("returns null for non-http(s) urls", async () => {
    const text = await extractOverlayTextFromImageUrl({ imageUrl: "data:image/png;base64,abc" });
    expect(text).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("downloads, normalizes to JPEG data URL, and passes detail=low to OpenAI", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ overlay_text: "SAVE 20%\\nTODAY" }) } }],
    });
    const text = await extractOverlayTextFromImageUrl({ imageUrl: "https://example.com/ad.png" });
    expect(text).toBe("SAVE 20%\nTODAY");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/ad.png",
      expect.objectContaining({ redirect: "follow" })
    );
    const call = mockCreate.mock.calls[0]?.[0] as {
      messages: Array<{ content: Array<{ image_url?: { url: string; detail?: string } }> }>;
    };
    const imagePart = call.messages[1]?.content?.[1] as { image_url: { url: string; detail: string } };
    expect(imagePart?.image_url?.url?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(imagePart?.image_url?.detail).toBe("low");
  });

  it("filters brand-like single tokens", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ overlay_text: "NIKE" }) } }],
    });
    const text = await extractOverlayTextFromImageUrl({ imageUrl: "https://example.com/ad.png" });
    expect(text).toBeNull();
  });
});
