# Ads Health — Diagnosis Page (Requirements)

**Version:** 1.0  
**Audience:** Engineers + AI coding agents  
**Scope:** Account-level and ad-level diagnosis on the **Health** experience, built **on top of** existing Meta metrics and creatives data.

---

## 1. Purpose

Deliver a **Diagnosis** flow that answers:

1. **System:** “What’s the biggest problem across my account?”  
2. **Ad-level:** “Which ads are driving that problem and why?”

**Detection and prioritization are deterministic (rules + aggregates).**  
**Natural-language explanation and suggested fixes may use AI** only as specified in §8, with strict JSON validation — consistent with Repto’s rule: *no AI for health scoring or metric calculation*; AI only structures narrative recommendations from **already computed** signals.

---

## 2. Relationship to existing product

| Existing | This feature |
|----------|----------------|
| `ad_metrics` (daily spend, impressions, clicks, CTR, CPC, frequency, ROAS) | Primary numeric input |
| `ad_creatives` (`creative_type`, `body`, `video_url`, …) | `type` (video vs image) + `copy` |
| `src/lib/health/engine.ts` — per-ad **HEALTHY / DECLINING / FATIGUED** over 7 days | **Optional** secondary signal for UI badges; **do not replace** account diagnosis rules unless explicitly integrated in a later iteration |
| `/api/meta/health` | May be reused or extended; new endpoints acceptable if cleaner |

---

## 3. Goals & non-goals

### 3.1 Goals

- Normalize ads into a single in-memory **`NormalizedAd`** for analysis (see §6).  
- Compute **account aggregates** (weighted CTR/CPC, CVR where conversions exist).  
- **Classify** primary account issue via **rule IDs** (not LLM).  
- Quantify **% of spend affected** by the primary issue.  
- **Segment** video vs image performance (weighted metrics).  
- Run **ad-level rules** on top-N spend ads.  
- Produce **structured outputs** for UI (§7, §9).  
- Optional **AI** passes: system summary + per-ad insights, **max 300 tokens per request**, validated JSON only.

### 3.2 Non-goals (explicit)

- Predictive modeling, budget optimization, auto-changing campaigns in Meta.  
- Replacing the existing **7-day rule engine** status without a separate decision.  
- Scraping or live re-fetch beyond existing APIs/tokens.  
- Using AI to **decide** LOW_CTR vs HIGH_CPC — rules only.

---

## 4. User stories

- As a marketer, I want to see **one primary account problem** with **impact (% spend)** so I know where to focus.  
- As a marketer, I want **video vs image** breakdown so I know if format is the driver.  
- As a marketer, I want **top 3 spending ads** analyzed with **concrete fixes** when something is wrong.  
- As a marketer, I want results scoped to my **selected date range** (align with dashboard where applicable).

---

## 5. Functional requirements

| ID | Requirement | Acceptance criteria |
|----|-------------|----------------------|
| FR-01 | Load metrics for the user’s **active ad account** and selected **date range** | Same ownership checks as other Meta routes; empty state if no data |
| FR-02 | Build `NormalizedAd[]` from DB rows + creatives join | Every ad in range has stable `id`, spend-weighted consistency |
| FR-03 | Implement `getSystemMetrics(ads)` | Returns `totalSpend`, `avgCTR` (spend-weighted), `avgCPC` (spend-weighted), `totalClicks`, `totalConversions`, `cvr` |
| FR-04 | Implement `detectPrimaryProblem(metrics)` | Returns a **closed enum** of problem IDs; order of checks documented; **thresholds from ENV** (see §6.3) |
| FR-05 | Implement `getImpact(ads, problem)` | Returns **0–100** % of spend where the problem’s predicate holds |
| FR-06 | Implement `segmentPerformance(ads)` | Returns `videoCTR`, `imageCTR` (spend-weighted); empty segment → `null` or omit with UI handling |
| FR-07 | System AI pass (optional toggle) | Input = JSON of rules output only; output matches **SystemDiagnosisSchema** (§7.1); validate with Zod; on failure, show rules-only UI |
| FR-08 | Select **top 3 ads by spend** for deep dive | Stable sort; tie-break by `ad_id` |
| FR-09 | `analyzeAdIssues(ad)` returns **list of issue IDs** | Same enum family as account or documented subset |
| FR-10 | Per-ad AI pass (optional) | Output matches **AdDiagnosisSchema** (§7.2); validate; fallback without AI |
| FR-11 | **Health / Diagnosis page UI** renders combined result | Sections: summary card, impact, segment, optional AI narrative, top ads list |
| FR-12 | Rate-limit AI endpoints | Align with existing AI rate limits pattern |
| FR-13 | Structured logging | Log AI failures; never leak raw errors to client |

---

## 6. Data & algorithms

### 6.1 `NormalizedAd` (canonical shape)

```typescript
type NormalizedAd = {
  id: string;              // ad_id
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;             // 0–100 as stored today, or 0–1 — **pick one and document in code**
  cpc: number;
  conversions: number;     // from actions/conversion data if available; else 0
  type: "video" | "image" | "carousel" | "unknown";
  copy: string;            // primary body from ad_creatives
};
```

**Conversions:** If not yet in `ad_metrics`, define v1 as `0` or pull from existing actions aggregation if already available — **do not block** v1 on new Meta fields; document the source in code.

### 6.2 Aggregates

- **Weighted average** by spend:  
  `weightedAvg(ads, metricKey) = sum(ad[metric]*ad.spend)/sum(ad.spend)` when `sum(spend)>0`.  
- **CVR:** `totalClicks > 0 ? totalConversions / totalClicks : 0`.

### 6.3 Problem detection (rule IDs)

Default **evaluation order** (first match wins unless product specifies multi-issue — v1: **single primary**):

| Problem ID | Predicate (configurable via ENV) |
|------------|-----------------------------------|
| `LOW_CTR` | `avgCTR < HEALTH_DIAG_CTR_MIN` |
| `LOW_CVR` | `cvr < HEALTH_DIAG_CVR_MIN` and `totalClicks >= HEALTH_DIAG_MIN_CLICKS` |
| `HIGH_CPC` | `avgCPC > HEALTH_DIAG_CPC_MAX` |
| `HEALTHY` | none of the above |

Suggested ENV names (defaults can mirror the brainstorm: `2`, `0.02`, `5` in account currency units — **document units**):

- `HEALTH_DIAG_CTR_MIN`  
- `HEALTH_DIAG_CVR_MIN`  
- `HEALTH_DIAG_CPC_MAX`  
- `HEALTH_DIAG_MIN_CLICKS`  
- `HEALTH_DIAG_AD_CTR_THRESHOLD` (for ad-level LOW_CTR)  
- `HEALTH_DIAG_AD_CPC_THRESHOLD` (for ad-level HIGH_CPC)

### 6.4 Impact

For primary problem `P`, define predicate `predP(ad)` per problem (e.g. LOW_CTR: `ad.ctr < HEALTH_DIAG_AD_CTR_THRESHOLD`). Then:

`impactPct = 100 * sum(spend where predP) / totalSpend` (0 if totalSpend=0).

### 6.5 Ad-level issues

`analyzeAdIssues(ad)` returns e.g. `LOW_CTR`, `HIGH_CPC`, `NO_CONVERSIONS` (`conversions === 0` and `clicks >= threshold`), using the same ENV philosophy.

---

## 7. AI contracts (strict JSON)

**Constraints:** Max **300 tokens** per request; temperature low; **no** free-form storage without validation.

### 7.1 `SystemDiagnosisSchema` (Zod)

Logical shape (implement exact Zod in code):

```json
{
  "main_issue": "string",
  "impact_summary": "string",
  "source": "string",
  "why": ["string"],
  "actions": ["string"]
}
```

**Input to model (example):**  
`problem`, `avgCTR`, `avgCPC`, `cvr`, `impactPct`, `dominantType` (`"video" | "image" | "mixed"`), `sample_copy[]` (1–3 strings, truncated).

### 7.2 `AdDiagnosisSchema` (Zod)

```json
{
  "ad_id": "string",
  "issue_label": "string",
  "hook_score": 1,
  "why": ["string"],
  "fix": ["string"],
  "examples": ["string"]
}
```

`hook_score`: integer **1–5**. Reject/regenerate or drop AI block if invalid.

---

## 8. Architecture (Clean Architecture)

```
Controller (API route)
  → Service (orchestration: normalize → rules → optional AI)
    → Repository (Supabase reads for metrics + creatives)
    → Rules engine (pure functions, unit-tested)
    → AI client (optional, validated output)
```

- **No** business logic in route handlers beyond parsing/validation.  
- **All** external APIs through service layer.

---

## 9. API surface (suggested)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/meta/diagnosis?from=&to=` | Returns rules output + optional cached AI payloads |
| `POST` | `/api/meta/diagnosis/analyze` | User-triggered refresh of AI sections (rate-limited) |

Exact paths may vary; keep **one** clear contract documented in OpenAPI-style comments or `validation.ts`.

---

## 10. UI — Diagnosis page

1. **Account summary:** primary problem badge, impact %, dominant format (video/image).  
2. **Metrics strip:** total spend, weighted CTR/CPC, CVR (if applicable).  
3. **Optional AI card:** `main_issue`, `why`, `actions` — only if validation passed.  
4. **Top 3 ads:** name, spend, issue tags, hook_score (if AI), fixes/examples.  
5. **Empty / loading / error** states consistent with dashboard patterns (shadcn).

---

## 11. Persistence (optional v1.1)

- Cache last successful **system + ad AI JSON** per `(user_id, ad_account_id, date_range_hash)` to avoid repeat calls.  
- v1 may be **ephemeral** (compute on each request) if simpler.

---

## 12. Testing

| Layer | Minimum |
|-------|---------|
| Rules | Unit tests: `detectPrimaryProblem`, `getImpact`, `segmentPerformance`, `analyzeAdIssues` with fixed fixtures |
| Schemas | Zod reject invalid AI payloads |
| API | Integration test: authenticated request returns 200 + shape (mock AI) |

Target **≥80%** coverage on new service + rules module.

---

## 13. Implementation order (for agents)

1. Types + `NormalizedAd` builder from existing tables.  
2. Pure functions: metrics, `detectPrimaryProblem`, `getImpact`, `segmentPerformance`, `getTopAds`, `analyzeAdIssues`.  
3. API route + wiring + empty states.  
4. UI page sections with **rules-only** path.  
5. AI integration + Zod + rate limit + fallbacks.  
6. Tests + optional cache.

---

## 14. Open questions (resolve before or during implementation)

1. **CTR representation:** confirm whether DB stores CTR as 0–100 or fraction; normalize once in `NormalizedAd`.  
2. **Conversions:** definitive source for v1 (`ad_metrics` extension vs actions API rollup).  
3. **Currency:** `HEALTH_DIAG_CPC_MAX` in account currency vs normalized — document.  
4. **Carousel:** map to `type: "carousel"` and exclude or split in video/image segment (document choice).

---

## 15. Traceability to original brainstorm

| Original sketch | This spec |
|-----------------|-----------|
| Normalize `Ad` | §6.1 `NormalizedAd` |
| `getSystemMetrics` | FR-03, §6.2 |
| `detectPrimaryProblem` | FR-04, §6.3 + ENV |
| `getImpact` | FR-05, §6.4 |
| `segmentPerformance` | FR-06 |
| System AI + JSON | §7.1, FR-07 |
| Top 3 ads + `analyzeAd` | FR-08, FR-09 |
| Per-ad AI + JSON | §7.2, FR-10 |
| Final flow | §13 |

---

*End of requirements.*
