# Onboarding Requirements (AI-Readable Spec)

This document defines the post-signup onboarding flow in a normalized, implementation-ready format.

## Global Configuration

```yaml
flow_id: post_signup_onboarding
version: 1
entry_route: /onboarding/intro
completion_route: /dashboard
required_sequence:
  - intro
  - proof
  - connect
  - analyzing
  - results
  - insight
  - next-step
onboarding_step_enum:
  - intro_completed
  - proof_seen
  - meta_connected
  - insight_viewed
  - completed
```

## User State Contract

```yaml
user_fields:
  persona:
    type: string | null
    allowed_values:
      - own_product
      - clients
      - freelancer_consultant
      - exploring
  onboarding_step:
    type: string | null
  meta_connected:
    type: boolean
  first_insight_viewed:
    type: boolean
  onboarding_completed_at:
    type: timestamp | null
runtime_state:
  ads_list: array
  diagnosis_summary: object | null
```

## Step Specifications

### 1) Intro

```yaml
id: intro
route: /onboarding/intro
purpose: Create immediate value perception and collect persona.
ui:
  headline: "Find what’s killing your ads in 30 seconds"
  subtext: "We analyze your ads and show exactly what’s stopping clicks, conversions, and scale."
  controls:
    persona_radio_group:
      required: true
      options:
        - { value: own_product, label: "Running ads for my own product" }
        - { value: clients, label: "Managing ads for clients" }
        - { value: freelancer_consultant, label: "Freelancing / consulting" }
        - { value: exploring, label: "Just exploring" }
  cta:
    primary:
      label: "Continue"
      disabled_until: persona_selected
actions:
  on_continue:
    - updateUser:
        persona: selectedPersona
        onboarding_step: intro_completed
navigation:
  next: /onboarding/proof
edge_cases:
  - Prefill persona if already saved.
  - Persist selected state on refresh.
```

### 2) Proof

```yaml
id: proof
route: /onboarding/proof
purpose: Increase motivation to connect Meta account.
ui:
  headline: "Here’s what you’ll see in seconds"
  demo_insight_card:
    type: static
    problem: "🚨 Your biggest issue: Low CTR"
    explanation: "People aren’t clicking — your hook isn’t stopping the scroll."
    impact: "You’re losing ~30% potential traffic before your funnel even starts."
    fix: "Change the first 3 seconds to clearly show the outcome."
  cta:
    primary:
      label: "Show me my ad insights →"
actions:
  on_continue:
    - updateUser:
        onboarding_step: proof_seen
navigation:
  next: /onboarding/connect
edge_cases:
  - This step is not skippable.
  - If already seen, allow forward navigation.
```

### 3) Connect

```yaml
id: connect
route: /onboarding/connect
purpose: Drive Meta connection using outcome framing.
ui:
  headline: "See what’s wasting your ad spend"
  bullets:
    - "Find why your ads aren’t converting"
    - "Get clear fixes, not just data"
    - "No manual analysis"
  trust_line: "🔒 Read-only access. We never edit ads."
  cta:
    primary: "Analyze my ads →"
    secondary: "Skip for now"
actions:
  on_primary_click:
    - triggerMetaOAuth: true
  on_oauth_success:
    - updateUser:
        meta_connected: true
        onboarding_step: meta_connected
navigation:
  on_oauth_success: /onboarding/analyzing
edge_cases:
  - OAuth failure: show retry state.
  - User cancel: remain on current page.
```

### 4) Analyzing

```yaml
id: analyzing
route: /onboarding/analyzing
purpose: Build perceived intelligence and anticipation.
ui:
  headline: "Analyzing your ads…"
  animated_steps:
    - "Scanning performance data…"
    - "Detecting bottlenecks…"
    - "Calculating missed conversions…"
behavior:
  loading_strategy: "2-4 seconds minimum OR until API resolves"
actions:
  - fetchAds
  - runDiagnosis
  - store_result_in_runtime_state
navigation:
  on_success: /onboarding/results
edge_cases:
  - API failure: show retry UI.
  - No ads found: show/redirect to empty-state handling.
```

### 5) Results

```yaml
id: results
route: /onboarding/results
purpose: Show problem severity before raw metrics.
ui:
  headline: "Your ads — ranked by biggest problems"
  card_requirements:
    status_labels:
      - "🚨 Low engagement"
      - "⚠️ Weak CTR"
      - "✅ Performing well"
    short_insight_examples:
      - "People aren’t stopping to watch"
      - "Users see it but don’t click"
    metrics_secondary:
      - CTR
      - CPC
  cta:
    primary: "Diagnose my ads →"
data_dependencies:
  - ads_list
  - diagnosis_summary
navigation:
  next: /onboarding/insight
edge_cases:
  - If no ads: show "No ads found — try another account".
```

### 6) Insight

```yaml
id: insight
route: /onboarding/insight
purpose: Deliver the AHA moment with concrete diagnosis framing.
ui:
  headline: "You’re losing clicks before people even enter your funnel"
  required_sections:
    - name: "Primary Insight"
      example: "CTR is your biggest bottleneck"
    - name: "What’s happening"
      example: "Only X% click, but Y% convert"
    - name: "What’s NOT the problem"
      example: "CPC is fine, audience not fatigued"
    - name: "What to fix"
      example:
        - "Your hook isn’t strong enough"
        - "People scroll before understanding value"
    - name: "Impact"
      example: "+X clicks, +Y conversions possible"
  cta:
    primary: "Show me what to fix first →"
actions:
  on_continue:
    - updateUser:
        first_insight_viewed: true
        onboarding_step: insight_viewed
navigation:
  next: /onboarding/next-step
edge_cases:
  - If diagnosis data missing: show fallback messaging.
```

### 7) Next Step

```yaml
id: next-step
route: /onboarding/next-step
purpose: Transition user into active product usage.
ui:
  headline: "Start fixing your worst-performing ads"
  subtext: "These ads are costing you the most missed conversions."
  cta:
    primary: "Show me what to fix first →"
actions:
  on_continue:
    - updateUser:
        onboarding_completed_at: now()
        onboarding_step: completed
navigation:
  next: /dashboard
```

## Global Gating Rules

```yaml
gating:
  if_onboarding_incomplete:
    condition: onboarding_completed_at is null
    redirect_non_onboarding_routes_to: /onboarding/intro
  if_onboarding_complete:
    condition: onboarding_completed_at is not null
    block_routes_matching: /onboarding/*
    redirect_to: /dashboard
sequence_enforcement:
  - Users should not access a later step before completing prior required steps.
```

## Implementation Prompt (for coding agents)

Build all onboarding routes and enforce global gating exactly as defined in this document. Persist user state updates at each step, enforce route sequence, handle edge cases per step, and route completed users to `/dashboard`.