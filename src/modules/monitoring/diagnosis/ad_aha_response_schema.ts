/**
 * OpenAI Chat Completions `response_format.json_schema` (strict) for a single ad diagnosis.
 * Must stay in sync with `AdAhaDiagnosisSchema` in validation.ts.
 */
export const AD_AHA_SINGLE_RESPONSE_SCHEMA = {
  name: "ad_aha_diagnosis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "ad_id",
      "bottleneck",
      "evidence",
      "fixes",
      "priority_fix",
      "audits",
    ],
    properties: {
      ad_id: { type: "string" },
      bottleneck: {
        type: "string",
        enum: ["CTR", "CPC", "CVR", "HOOK", "MIXED", "OTHER"],
      },
      evidence: {
        type: "array",
        minItems: 3,
        items: { type: "string" },
      },
      fixes: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fix", "type", "specificity_check"],
          properties: {
            fix: { type: "string" },
            type: { type: "string", enum: ["hook", "creative", "audience"] },
            specificity_check: {
              type: "object",
              additionalProperties: false,
              required: ["mentions_caption_token", "has_concrete_element"],
              properties: {
                mentions_caption_token: { type: "boolean" },
                has_concrete_element: { type: "boolean" },
              },
            },
          },
        },
      },
      priority_fix: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "primary_section", "follow_section", "rationale"],
        properties: {
          headline: { type: "string" },
          primary_section: {
            type: "string",
            enum: ["transcript_0_5s", "caption", "creative_visual", "audience"],
          },
          follow_section: {
            type: "string",
            enum: ["transcript_0_5s", "caption", "fixes_to_ship", "none"],
          },
          rationale: { type: "string" },
        },
      },
      audits: {
        type: "object",
        additionalProperties: false,
        required: ["caption", "transcript_0_5s", "ocr_text"],
        properties: {
          caption: {
            type: "object",
            additionalProperties: false,
            required: ["reason", "impact", "evidence", "suggestions"],
            properties: {
              reason: { type: "string" },
              impact: { type: "string" },
              evidence: { type: "array", items: { type: "string" } },
              suggestions: { type: "array", items: { type: "string" } },
            },
          },
          transcript_0_5s: {
            type: "object",
            additionalProperties: false,
            required: ["reason", "evidence", "suggestions"],
            properties: {
              reason: { type: "string" },
              evidence: { type: "array", items: { type: "string" } },
              suggestions: {
                type: "array",
                minItems: 0,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["line", "change_type", "based_on"],
                  properties: {
                    line: { type: "string" },
                    change_type: {
                      type: "string",
                      enum: [
                        "specificity",
                        "pattern_interrupt",
                        "outcome_shift",
                        "angle",
                        "emotion",
                        "structure",
                      ],
                    },
                    based_on: { type: "string" },
                  },
                },
              },
            },
          },
          ocr_text: {
            type: "object",
            additionalProperties: false,
            required: ["reason", "impact", "evidence", "suggestions"],
            properties: {
              reason: { type: "string" },
              impact: { type: "string" },
              evidence: { type: "array", items: { type: "string" } },
              suggestions: {
                type: "array",
                minItems: 0,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["line", "change_type", "based_on"],
                  properties: {
                    line: { type: "string" },
                    change_type: {
                      type: "string",
                      enum: [
                        "specificity",
                        "pattern_interrupt",
                        "outcome_shift",
                        "angle",
                        "emotion",
                        "structure",
                      ],
                    },
                    based_on: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
