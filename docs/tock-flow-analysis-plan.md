# Tock Booking Flow Analysis Plan

## Objective
Map the booking flow (up to 10-minute lock/hold) across 6 Tock sushi restaurants to identify commonalities and variability. Build a generalized booking engine that can handle any of them, especially Taneda where we can't test the live flow ahead of time.

## Target Restaurants

| # | Restaurant | Slug | City | Price | Availability | Category |
|---|-----------|------|------|-------|-------------|----------|
| 1 | Taneda | /taneda | Seattle | $$$$ | Sold out (monthly drops) | Hard — target |
| 2 | Toshokan | /toshokan | Austin | $$$$ | Sold out (monthly drops) | Hard — prior target |
| 3 | Tsuke Edomae | /tsukeedomae | Austin | $$ | Likely sold out / limited | Hard |
| 4 | Sushi Bar Austin Downtown | /sushibaraustin | Austin | $$$ | Likely available | Bookable |
| 5 | Otoko x Watertrade | /otoko | Austin | $$$$ | Likely available | Bookable |
| 6 | Craft Omakase | /craft-omakase-austin | Austin | $$$ | Likely available | Bookable |

**Key insight:** Restaurants 4-6 likely have open availability, meaning we can walk through the FULL booking flow (up to lock) without waiting for a drop. Restaurants 1-3 are sold out, so we can only observe the "sold out" state and compare UI structure.

## Analysis Method

For each restaurant, capture:

### A. Page Structure (static analysis)
1. Navigate to restaurant's Tock page
2. Snapshot the main page — note experience listings, pricing, party size limits
3. Click into the experience — snapshot the search/calendar dialog
4. Note: date button format, time slot format, "Sold out" vs "Book" button states
5. Extract from page source or network: businessId, businessGroupId, experienceId, ticketTypeId

### B. Booking Flow (bookable restaurants only)
1. Select a future date with availability
2. Select a time slot
3. Click "Book" / "Reserve" / equivalent CTA
4. Observe: does it open a new page? Modal? Inline expansion?
5. Continue through any party size confirmation, dietary notes, policy acknowledgment
6. Arrive at the payment/checkout page — this is where the **10-minute lock** starts
7. Screenshot + snapshot at each step
8. **DO NOT complete payment** — let the lock expire
9. Note: was CVC required? Was card-on-file auto-selected? Any checkboxes?

### C. Data Points to Compare

| Dimension | What to Look For |
|-----------|-----------------|
| **Experience structure** | Single experience vs. multiple? Prepaid vs. free reservation? |
| **Calendar UI** | Same component across all? Button format? Date disabled = sold out or just past? |
| **Time slots** | Discrete buttons vs. dropdown? How many seatings? |
| **Party size** | Pre-selected default? Min/max? Where in the flow? |
| **CTA button** | "Book" vs "Reserve" vs "Complete" — text and data-testid |
| **Booking flow** | Modal → checkout page? Or inline? How many clicks to lock? |
| **Lock behavior** | When does the 10-min hold start? At "Book" click or at checkout page load? |
| **Payment page** | Stripe iframe? Card on file auto-populated? CVC required? |
| **Acknowledgments** | Checkboxes? Policy acceptance? Dietary notes? |
| **URL patterns** | Does URL change at each step? Can we deep-link to checkout? |
| **Error states** | "Someone else selected this" — where does it appear? What buttons exist? |
| **Success signal** | What URL/text indicates a successful lock? |

## Execution Order

### Phase 1: Snapshot All Pages (30 min)
Visit all 6 restaurants, capture the main page and experience dialog. Quick comparison of structure.

### Phase 2: Walk Through Bookable Flows (45 min)
For restaurants with availability (likely Sushi Bar Austin, Otoko, Craft Omakase):
- Complete the full flow up to lock (3 restaurants × ~15 min each)
- Screenshot every state transition
- Log all button texts, selectors, URL changes

### Phase 3: Compare Sold-Out States (15 min)
For Taneda, Toshokan, Tsuke Edomae:
- Document the "sold out" UI — what changes when availability appears?
- Note any structural differences from the bookable restaurants

### Phase 4: Synthesize (30 min)
- Build a comparison matrix
- Identify the common flow (the "happy path" that works everywhere)
- Identify variability points (where the engine needs to be adaptive)
- Write the generalized booking engine spec

## Deliverables
1. `docs/tock-flow-comparison.md` — Side-by-side comparison matrix
2. Updated `docs/taneda-sniper-plan.md` — Refined click engine spec based on real data
3. Screenshots in `scripts/tock-sniper/experiments/flow-analysis/`

## Scope Boundary
**Goal: Get to the 10-minute lock.** We are NOT:
- Completing payment
- Testing the purchase API
- Building the full checkout flow yet
- Cancelling any real reservations

The lock expires on its own after ~10 minutes. No cleanup needed.
