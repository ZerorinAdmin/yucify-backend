1️⃣ Total Active Ads + Format Split (Baseline)
Question:
Scan the Meta Ads Library for [Brand Name] (active ads only).
Give me the exact total number of active ads, split by video, image, carousel, and collection.
Also tell me which format dominates and what that signals about their scaling stage.
Why this matters:
Tells you budget confidence + what format is winning right now.

2️⃣ Product-wise Ad Distribution (Focus vs Experiment)
Question:
List all products being promoted by [Brand Name] in Meta Ads Library.
For each product, give the number of active ads, format mix, and identify hero product vs test products.
Why:
Brands don’t push everything equally. This shows where revenue is coming from.

3️⃣ Funnel Stage Segregation (TOF / MOF / BOF)
Question:
Classify all active ads into TOF, MOF, BOF based on messaging and CTA.
Give exact counts and percentage split across each funnel stage.
Why:
This exposes whether they’re building demand or harvesting demand.

4️⃣ Offer, Discount & Deal Analysis
Question:
Extract all offers, discounts, bundles, and pricing hooks used in the active ads.
Group them into percentage discounts, bundles, free gifts, limited-time offers, and tell me which is used most.
Why:
Shows pricing pressure and margin reality.

5️⃣ Primary Text Messaging Analysis (Words That Repeat)
Question:
Analyze all primary texts across active ads.
Identify top 15 repeated words/phrases, and cluster them into problem-led, benefit-led, trust-led, urgency-led messaging.
Why:
This is literally what Meta’s algorithm is being trained on.

6️⃣ Headline & CTA Pattern Extraction
Question:
Analyze all headlines and CTAs used by [Brand Name].
Identify recurring verbs, emotional triggers, and urgency cues, and tell me which intent (education vs conversion) dominates.
Why:
Headlines reveal whether ads are meant to stop scroll or close sale.

7️⃣ Creative Angle & UGC Strategy Breakdown
Question:
Break down ads by creative angle:
UGC, testimonials, before-after, problem-solution, demo, influencer, founder-led, brand film.
Give counts for each and tell me which angles are being scaled vs tested.
Why:
You stop guessing “what kind of creatives work” — you see it.

8️⃣ Strategic Summary + Exploitable Gaps
Question:
Based on the full Ads Library analysis of [Brand Name], summarize:
• Their core acquisition strategy
• What they are over-relying on
• What messaging or funnel stages are underutilized
• 3 clear gaps I can exploit to outperform them

9️⃣ Strategic recommendation and action plan
Provide personalized recommendation and action plan for user based on the competitor's ad analysis.

---

## Implementation Notes & Suggestions

### Data we have (from scraper)
- `ad_text` (primary text)
- `ad_headline`
- `ad_description`
- `cta`
- `display_format` (VIDEO, IMAGE, CAROUSEL, DCO)
- `landing_page_url`, `ad_start_date`, `is_active`

### Suggestions

**1. Renumber:** Both #8 and #9 were labeled 8 — fixed above (Strategic Summary = 8, Recommendation = 9).

**2. Collection format:** We have VIDEO, IMAGE, CAROUSEL. "Collection" (Meta's grid format) may map to CAROUSEL or DCO in our data. AI can infer from context. Consider adding COLLECTION as a display_format if we detect it.

**3. Product extraction (#2):** AI will infer products from ad copy. Some ads may not mention product names — AI should say "Could not identify distinct products" when unclear. Consider allowing "product" to be a theme/category (e.g. "Summer Sale", "New Arrival") when specific products aren't named.

**4. Hero vs test (#2, #7):** Define as: hero/scaled = highest ad count; test = 1–2 ads. AI can infer from volume.

**5. Token budget:** 8–9 sections with rich output ≈ 1500–2500 tokens. Recommend `max_tokens: 2500` for this report (different from the 300-token per-ad rule).

**6. Output schema:** Use strict JSON so UI can render sections. Suggested structure:
```json
{
  "total_active_ads": { "count": 50, "by_format": {...}, "dominant_format": "...", "scaling_signal": "..." },
  "product_distribution": [...],
  "funnel_stage": { "tof": {...}, "mof": {...}, "bof": {...} },
  "offers_discounts": {...},
  "messaging_analysis": {...},
  "headline_cta": {...},
  "creative_angles": {...},
  "strategic_summary": {...},
  "recommendations": [...]
}
```

**7. Fallbacks:** If < 2 ads, show "Not enough data for meaningful analysis, please analyze another competitor." and skip AI call. If headline/CTA missing for many ads, AI should note "Limited headline data" in that section.

**8. Personalization (#9):** "Personalized for user" needs user context (their business, goals). For v1, keep it as "Action plan based on competitor gaps" — no user profile required. Add personalization later if we collect user preferences.
