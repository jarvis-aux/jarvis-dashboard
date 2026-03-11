# Taneda Sniper — Specification & Research

## Restaurant Profile

- **Name:** Taneda (Sushi in Kaiseki)
- **Location:** 219 Broadway E, Ste 14, Capitol Hill, Seattle, WA 98102
- **Capacity:** 9-seat sushi bar. All guests start at the same time.
- **Seatings:** 2 per night — 5:15 PM and 7:45 PM (Wed–Sun)
- **Closed:** Mon, Tue
- **Price:** $255/person prepaid at booking + 20% service fee + WA sales tax (~10.25%)
  - Total per person: ~$255 + $51 service + ~$26 tax = **~$332/person**
  - For 2 guests: **~$664 total** charged at booking
- **Cuisine:** Traditional Japanese sushi + kaiseki, omakase only (chef's selection)
- **Dietary restrictions NOT accommodated:** Vegetarian, gluten-free, shellfish allergy, no-raw-fish
- **Website:** https://tanedaseattle.com/
- **Instagram:** @tanedaseattle (14K followers)
- **Tock URL:** https://www.exploretock.com/taneda
- **Experience URL:** https://www.exploretock.com/taneda/experience/329211/taneda-omakase
- **Experience ID:** 329211

## Reservation Mechanics

### Platform
- **Tock** (same platform as Toshokan — existing sniper infrastructure partially reusable)
- Switched from Yelp to Tock circa 2022 specifically to combat bots
- Taneda claims: "Since switching platforms, we've found that no bots have been making reservations in the Tock platform"

### Drop Schedule
- **Monthly release:** One batch per month, releasing the following month's dates
- **Typical pattern:** 3rd Saturday of the month at 11:00 AM Pacific
- **HOWEVER: The time varies.** Confirmed variations:
  - Feb 21, 2026 at 2:00 PM (was the most recent drop — a Saturday, but 2 PM not 11 AM)
  - One historical example: Mon 3/21/22 at 11 AM for April dates (a Monday, not Saturday)
  - Instagram post snippet: "be ready before 11am" (multiple sources)
- **The Tock page itself shows the next drop:** Currently displays:
  > "All reservations sold out. New reservations will be released on **March 21, 2026 at 1:00 PM CDT.**"
- March 21, 2026 is a **Saturday** — fits the "3rd Saturday" pattern
- Time is **1:00 PM CDT** (= 11:00 AM PDT Seattle time) — so the "11 AM" reports from Seattle-based people are correct; it's just displayed in CDT on our browser

### Drop for May dates (our target)
- **Expected:** ~3rd Saturday of April = **Saturday, April 18, 2026**
- **Need to verify:** The Tock banner will update after the March 21 drop to show the April drop date/time
- **Action required:** Monitor Tock page starting March 22 for the April drop announcement

### Sell-out Speed
- Per Taneda's own Instagram: "thousands of people refreshing the page at 11am"
- "Reservations are all taken within a few seconds of our releases"
- Reddit users report trying for "literal years" and failing
- Yelp 2022 report: "Opened at 12:30, all spots taken" (30 min late = zero chance)

### Capacity Math
- 9 seats per seating × 2 seatings/night = 18 seats/night max
- But parties of 1-4 means actual bookable slots vary (fewer parties = more seats wasted)
- Open Wed-Sun = 5 nights/week × ~4.3 weeks = ~21-22 service nights per month
- Rough total: ~180-200 seats released per month
- With "thousands" competing: sub-1% success rate for any individual attempt

### Policy: 1 Reservation Per Month
- Enforced since Dec 2024 (announced on Instagram Dec 20, 2024)
- "Any more reservations made will be canceled and forfeited to a different customer"
- This means: ONE shot per month per Tock account. Cannot book multiple dates and cancel.
- **Implication for sniper:** Must pick the target date/time BEFORE the drop. No hedging.

### Cancellation Policy
- Must cancel 48+ hours in advance for a refund
- No refunds after 48 hours for ANY reason (including COVID, travel delays)
- Must confirm reservation 6+ hours in advance or it auto-cancels

## Tock Page Structure (Verified March 11, 2026)

### Main Page (exploretock.com/taneda)
- Hero image + restaurant description
- Single experience listing: "Taneda Omakase"
  - Type: Prepaid reservation
  - Party size: 1-4
  - Price: $255/person
  - Status: "Sold out" button (disabled) + "Notify" button
- Alert: "If you are a party of 1, please join our waitlist by leaving a note stating that it is for 1 seat."
- Bottom banner: "All reservations sold out. New reservations will be released on [DATE] at [TIME]."

### Experience Dialog (clicking the experience)
- Opens a modal/dialog: "Search availability for Taneda Omakase at Taneda"
- Party size selector: +/- buttons, default 2 guests
- Date picker: Calendar showing current + next month
  - Disabled dates = Mon/Tue + sold out dates
  - Enabled dates = Wed-Sun with possible availability (but all currently sold out)
- Time slots shown: 5:15 PM and 7:45 PM with "Notify" buttons
- "Taneda Omakase is sold out" alert with "Notify" link

### Notify/Waitlist Form
- URL pattern: `/taneda/waitlist?date=YYYY-MM-DD&experienceId=329211&fromPage=experience&size=N`
- Fields:
  - Party size (dropdown: 1-4)
  - Experience (dropdown: "Any experience" or "Taneda Omakase")
  - Date (date picker, can select multiple)
  - Start time (dropdown: 5:15 PM – 9:30 PM in 15-min increments)
  - End time (dropdown: same range)
  - Notes (free text)
  - "Set Notify" button

### Login State
- We are NOT logged into Tock on the openclaw browser profile as of this recon
- Login page: exploretock.com/login
  - Options: Google, Apple, email/password
  - Andrew's Tock account: liuandrewy@gmail.com (patronId 268964)
  - **Need to log in before the drop** — existing Keychain JWT may work for API but browser session needs fresh login

## Comparison with Toshokan

| Factor | Toshokan | Taneda |
|--------|----------|--------|
| Platform | Tock | Tock |
| Capacity | Larger (multiple tables) | 9 seats × 2 seatings |
| Price | $170/pp ($204 w/ service) | $255/pp (~$332 w/ service+tax) |
| Drop pattern | Monthly, 1st of month, 10 AM CST | Monthly, ~3rd Saturday, 11 AM PT / 1 PM CT |
| Sell-out speed | Minutes | Seconds |
| 1-per-month limit | No | Yes (since Dec 2024) |
| Experience ID | 483774 (ticketTypeId) | 329211 (experienceId) |
| BusinessId | 25489 | Unknown (need to extract from browser) |
| CF protection level | Aggressive (API lock blocked) | TBD (claimed "no bots") |
| Payment | Credit card on file | Prepaid at booking ($255×N) |

## Sniper Strategy

### Key Differences from Toshokan Approach
1. **Speed is more critical.** Taneda sells out in seconds vs. minutes.
2. **1-per-month limit** means no hedging — must commit to a specific date/time before the drop.
3. **"No bots" claim** suggests Tock may have additional protections on this venue.
4. **Prepaid** means payment must complete as part of the booking flow (not post-booking).
5. **We need to know the exact drop date/time** before April — monitor the Tock banner after March 21.

### Target for Seattle Trip
- **Trip dates:** May 1-3, 2026 (Fri-Sun)
- **Ideal Taneda date:** Friday May 1 (splurge dinner) or Saturday May 2
- **Preferred time:** 7:45 PM (later seating gives more daytime flexibility)
- **Fallback time:** 5:15 PM
- **Party size:** 2

### Pre-Drop Preparation
1. **Log into Tock** on the openclaw browser profile as liuandrewy@gmail.com
2. **Add/verify payment method** on the Tock account (credit card on file)
3. **Extract businessId** from browser network traffic while on the Taneda page
4. **Test the offerings API** from browser context to see if Taneda's API behaves like Toshokan's
5. **Monitor the Tock banner** starting March 22 for the April drop date/time announcement
6. **Set up a cron** to check the Tock page daily and alert when the April drop date is posted

### Booking Flow (Browser-Based)
When the drop happens:
1. Already on the Taneda experience page, logged in, payment on file
2. At drop time: Refresh page → click target date → click target time → click "Book" → confirm payment → complete
3. The entire flow must complete in <10 seconds to beat thousands of humans
4. Browser automation (not API) is the right approach given their "no bots" claim about Tock

### Risk Factors
- **Cloudflare:** May block rapid polling like it did with Toshokan
- **Tock anti-bot:** Their claim suggests possible additional protections
- **Speed:** Sub-10-second window is extremely tight for browser automation
- **Payment processing:** Prepaid means Stripe/payment must clear during checkout
- **1-per-month:** If we fail, we wait a full month for next attempt
- **Wrong date:** If we guess wrong on which date to target, we lose

### Open Questions
1. What is Taneda's businessId on Tock? (Extract from browser)
2. Does the offerings API work for Taneda or is it additionally protected?
3. What is the exact UI flow when dates ARE available? (We've only seen "sold out")
4. Does Tock show a "processing" or queue system during high-traffic drops?
5. Will the April drop date be the 3rd Saturday (April 18) or could it shift?
6. Does the Tock waitlist/notify actually result in availability for cancellations?

## Timeline

| Date | Action |
|------|--------|
| Now (Mar 11) | Initial recon complete. Document findings. |
| Mar 21 (Sat) | **March drop day.** Observe the drop (don't book — just study the UI behavior during high traffic). Check if the April drop date appears after. |
| Mar 22+ | Monitor Tock banner daily for April drop date announcement. |
| ~Apr 11 | Begin pre-drop prep: login, payment verification, test runs on Tock. |
| ~Apr 18 (expected) | **TARGET: April drop for May dates.** Execute sniper. |
| May 1-3 | Seattle trip. Taneda dinner if successful. |

## Related Docs
- **Build plan:** `docs/taneda-sniper-plan.md` (architecture, timeline, risk matrix)
- **Toshokan spec (learnings source):** `docs/tock-sniper-spec.md`
- **Toshokan post-mortem:** `memory/2026-03-01.md`
- **Toshokan build session:** `memory/2026-02-28.md`
- **Existing sniper code:** `scripts/tock-sniper/sniper.py` (1,230 lines)
- **CDP client:** `~/.openclaw/skills/cdp-fetch/scripts/cdp_client.py`
- **Proto codec:** `~/.openclaw/skills/cdp-fetch/scripts/proto_codec.py`
- **Seattle trip dining research:** `docs/seattle-trip/research-dining-v4-final.md`

## Sources
- Tock page (live recon, March 11, 2026)
- tanedaseattle.com/reservation.html
- Reddit r/Seattle threads (May 2025, Feb 2022)
- The Infatuation Seattle guide
- Instagram @tanedaseattle snippets (via search results)
- Yelp forum discussions
- Seattle trip research (docs/seattle-trip/research-dining-v4-final.md)
