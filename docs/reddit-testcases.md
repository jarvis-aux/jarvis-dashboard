# Tock Reservation Drop Test Cases & Anti-Bot Reports (Reddit)

Compiled 2026-03-11 from Reddit threads. Grouped by pattern for sniper development reference.

---

## Pattern A: Monthly/Periodic Mass Drop (Tock)

### 1. Tsuke Edomae — Austin, TX
- **Tock URL:** `exploretock.com/tsukeedomae`
- **Drop schedule:** Every ~6 months, 9:00 AM CT sharp. VIPs get pre-access before public drop.
- **Capacity:** 8 seats per seating, 1–2 seatings/day. ~500 reservations per drop.
- **Sell-out time:** Under 2–5 seconds for prime dates. Weekdays last ~30s.
- **UI quirks:**
  - Prepaid ticket model (omakase experience, ~$150pp)
  - 10-minute hold timer once you click "Book Now" — expired holds re-release at ~drop+10min
  - Party size: mostly 2-tops; limited by 8-seat counter
  - Pro tip: click ANY date immediately to lock a 10-min hold, then try preferred dates from another device
- **Bot/anti-bot:** Multiple users convinced bots are involved. VIP list (4+ visits) gets pre-access, drastically reducing public inventory. No Cloudflare/CAPTCHA mentioned.
- **Threads:**
  - [Tsuke Edomae (Jan 2025)](https://www.reddit.com/r/austinfood/comments/1iahfqo/tsuke_edomae/) — 58 pts, 6-month drop details
  - [Reservations Immediately Gone (Aug 2024)](https://www.reddit.com/r/austinfood/comments/1f0xaec/tsuke_edomae_reservations_immediately_gone/) — 49 pts, bot suspicion
  - [Getting Reservations is Impossible (Sep 2023)](https://www.reddit.com/r/austinfood/comments/16qyljv/getting_tuske_edomae_reservations_is_impossible/) — 44 pts, multi-device strategy

### 2. The French Laundry — Yountville, CA
- **Tock URL:** `exploretock.com/tfl` (or via thefrenchlaundry.com)
- **Drop schedule:** 1st of every month, 10:00 AM PT. Releases following month's dates.
- **Sell-out time:** Under 1–2 minutes for 2-tops; 4-tops last slightly longer.
- **UI quirks:**
  - Prepaid tickets (~$350–400pp before wine)
  - 10-minute hold timer; expired holds re-release at ~10:10 AM
  - 2-tops are hardest (fewest available); 4-tops and 6-tops notably easier
  - Sometimes site throws "Something went wrong" error at drop time due to load
  - Nick Kokonas (Tock CEO) stated: 1,200+ queries/second hit Tock starting 5 min before Alinea drops; TFL presumably similar or higher
- **Bot/anti-bot:** One highly-upvoted comment (Jan 2026): *"Don't use a bot — Tock has gotten smart enough to detect them."* Python scripts mentioned on GitHub. Appointment Trader resale market active.
- **Threads:**
  - [Tips for TFL Reservation (Jan 2026)](https://www.reddit.com/r/finedining/comments/1qddheh/tips_for_getting_the_french_laundry_reservation/) — 123 pts, comprehensive strategy thread
  - [Are People Using AI? (Aug 2023)](https://www.reddit.com/r/thefrenchlaundry/comments/15fiot6/are_people_using_ai_to_get_reservations/) — 12 pts, Python script GitHub mention
  - [Tock Error (2026)](https://www.reddit.com/r/thefrenchlaundry/comments/1ricigw/tock_error/) — "Something went wrong" at drop time

### 3. Taneda Sushi in Kaiseki — Seattle, WA
- **Tock URL:** `exploretock.com/taneda-sushi-in-kaiseki-seattle-2`
- **Drop schedule:** 3rd Saturday of prior month, 11:00 AM PT
- **Capacity:** ~9 seats. Parties of 2–4 only (no solo).
- **Sell-out time:** Seconds. "Fully sold out about a few seconds each month."
- **UI quirks:**
  - Party-size constraint: 2–4 people only, no solo diners on Tock
  - 5 PM seating less competitive than 7 PM
  - Later dates in month and Wed/Thu less competitive
  - One user reported a "glitch" where drop happened 10 min late — that's how they got in
- **Bot/anti-bot:** Users suspect bots; no specific detection mentioned.
- **Threads:**
  - [How to Snag Taneda (May 2025)](https://www.reddit.com/r/Seattle/comments/1knlty7/if_youve_managed_to_snag_a_reservation_at/) — 17 pts, drop timing details
  - Referenced in [Top 3 Hardest Reservations (Jul 2024)](https://www.reddit.com/r/finedining/comments/1dygl77/top_3_hardest_reservations_in_america/) — "fully sold out in seconds"

### 4. Hayato — Los Angeles, CA
- **Tock URL:** `exploretock.com/hayato`
- **Drop schedule:** 1st of every month, 10:00 AM PT
- **Capacity:** ~7 seats. Regulars bypass Tock entirely.
- **Sell-out time:** Under 30 seconds.
- **UI quirks:**
  - Extremely limited seats (7)
  - Regulars/VIPs book directly with chef, bypassing Tock — public gets scraps
  - Prepaid omakase ticket
- **Bot/anti-bot:** Confirmed bot-and-resale problem. User found reservations being sold on scalper sites for $500–$1,000 each. Appointment Trader listings exist. One user: "19 months of trying" before success.
- **Threads:**
  - [Why I Can't Get a Hayato Reservation (Sep 2023)](https://www.reddit.com/r/FoodLosAngeles/comments/167d9so/well_i_finally_figured_out_why_i_cant_get_a/) — 149 pts, scalper site discovery
  - [How to Get Hayato (Dec 2023)](https://www.reddit.com/r/finedining/comments/18r0rk1/how_do_you_get_a_reservation_at_hayato/) — regulars bypass Tock
  - [Hayato Reservation Luck (Mar 2022)](https://www.reddit.com/r/FoodLosAngeles/comments/t4ec9u/anyone_have_luck_getting_a_reservation_at_hayato/) — "within seconds of 10:00 AM"

### 5. Atomix — New York, NY
- **Tock URL:** `exploretock.com/atomix`
- **Drop schedule:** Monday before the month, 2:00 PM ET (per user report; verify)
- **Sell-out time:** ~10 seconds for most slots; expired session holds re-release ~10–15 min later
- **UI quirks:**
  - Chef's counter vs. regular seating options
  - Prepaid tasting menu
  - "If you don't get it in the first 10 seconds, wait around for at least 15 minutes for other people's sessions to expire"
  - Tock auto-reloads when bookings go live (no manual refresh needed?)
  - Waitlist actually works — cancellations common due to scalper hoarding
- **Bot/anti-bot:** Not heavily botted per users, just legitimately high demand. "Atomix isn't botted out like Tatiana... you just have to set an alarm for the Tock full month drop."
- **Threads:**
  - [How to Get Atomix (Jul 2022)](https://www.reddit.com/r/FoodNYC/comments/w4l60g/how_to_get_a_reservation_at_atomix/)
  - [Very Difficult to Book Restaurants (Oct 2024)](https://www.reddit.com/r/FoodNYC/comments/1fwl9y2/question_about_very_difficult_to_book_restaurants/)

### 6. Alinea — Chicago, IL
- **Tock URL:** `exploretock.com/alinea`
- **Drop schedule:** Every 15th of the month, 11:00 PM CT (per 2021 report; may have changed)
- **Sell-out time:** Variable. Kitchen Table (most expensive) has more availability; Salon and Gallery sell fast.
- **UI quirks:**
  - Multiple experience tiers: Gallery, Salon, Kitchen Table — each is a separate ticket type
  - Kitchen Table significantly more expensive but easier to book
  - "Next available" search feature on Tock
  - Tock was BUILT by Alinea Group (Nick Kokonas) — this is the flagship restaurant
- **Bot/anti-bot:** Kokonas stated 1,200+ queries/sec hit Tock 5 min before Alinea drops. Tock was specifically designed to combat scalpers via prepaid model.
- **Threads:**
  - [Advice for Alinea Reservation (May 2021)](https://www.reddit.com/r/chicagofood/comments/nn5r9e/advicestrategies_to_get_a_reservation_at_alinea/)
  - [Alinea AMA (May 2017)](https://www.reddit.com/r/IAmA/comments/6cvfbc/we_own_alinea_next_the_aviary_roister_and/) — Nick Kokonas discusses Tock design

---

## Pattern B: Rolling/Weekly Drops (Tock)

### 7. n/naka — Los Angeles, CA
- **Tock URL:** `exploretock.com/n-naka`
- **Drop schedule:** Every Sunday, 10:00 AM PT
- **Sell-out time:** Seconds for prime slots; stragglers available with persistence
- **UI quirks:**
  - 2-tops much harder than 3–4–6 tops
  - Desktop browser faster than mobile
  - Prepaid tasting menu
  - Some regulars get reservations via direct email, bypassing Tock
  - Waitlist reportedly effective
- **Bot/anti-bot:** "The same bots that infiltrate sneaker sales and golf tee times are now going after dinner reservations and flipping them on Appointment Trader." Employee confirmed scalper awareness.
- **Threads:**
  - [n/naka Reservations (Aug 2023)](https://www.reddit.com/r/FoodLosAngeles/comments/15kvjo8/nnaka_reservations/)

### 8. Edulis — Toronto, ON
- **Tock URL:** `exploretock.com/edulis`
- **Drop schedule:** Monthly, 6:00 PM ET sharp
- **Sell-out time:** Very fast. Multiple months of attempts reported.
- **UI quirks:**
  - Pick slow nights (Tue/Wed/Thu) and off-peak times (5 PM, 9 PM)
  - Waitlist works if you respond fast
- **Bot/anti-bot:** User explicitly recommended botting with `github.com/azoff/tockstalk` (open-source Tock monitor). Amex Platinum concierge suggested as alternative.
- **Threads:**
  - [Edulis is Impossible (Oct 2023)](https://www.reddit.com/r/FoodToronto/comments/178qgtw/edulis_is_impossible/) — tockstalk GitHub link

---

## Pattern C: Prepaid Tock + Tasting Menu (Scalper-Resistant by Design)

### 9. Smyth — Chicago, IL
- **Tock URL:** `exploretock.com/smyth`
- **UI quirks:**
  - $325pp prepaid on Tock + 20% mandatory service fee + expected tip (controversial)
  - $5 Tock "reservation fee" on top
  - Prepaid model deters casual scalpers but not determined ones
- **Bot/anti-bot:** Prepaid = less scalper incentive (scalpers don't want to pre-fund $650+ per table). This was Tock's original anti-scalper design.
- **Threads:**
  - [Smyth Irks Me (Aug 2024)](https://www.reddit.com/r/chicagofood/comments/1eiamjs/smyth_irks_me_for_this/) — 492 pts, service fee controversy

### 10. Otoko / Watertrade — Austin, TX
- **Tock URL:** `exploretock.com/otoko`
- **Drop schedule:** ~1 month in advance, rolling
- **UI quirks:**
  - Bundled experience: reservation includes 30-min cocktail seating at Watertrade bar prior to omakase
  - Classic Omakase: $500pp prepaid ($646.25 total for 2 including 20% gratuity)
  - 3 different omakase tiers available
  - Tock transfer supported for resale at face value
- **Bot/anti-bot:** Not as hypercompetitive as Tsuke; availability exists if checked promptly.
- **Threads:**
  - [Otoko Transfer (Apr 2024)](https://www.reddit.com/r/austinfood/comments/1bypzmv/looking_to_transfer_otoko_omakase_reservation_2/)
  - [Omakase Recommendations (Sep 2024)](https://www.reddit.com/r/austinfood/comments/1fdgk9y/omakase_recommendations/)

---

## Pattern D: Bot Detection & Anti-Bot Intelligence

### 11. Tock Platform-Level Anti-Bot (General)
- **Key intelligence from Reddit:**
  - **"Tock has gotten smart enough to detect bots"** — r/finedining commenter, Jan 2026 (TFL context)
  - **1,200+ queries/second** hit Tock during Alinea drops (Nick Kokonas, Tock CEO/founder)
  - Tock's prepaid model was explicitly designed to deter scalping (no-shows cost scalpers real money)
  - **10-minute hold/lock timer** is standard — creates a second wave of availability at drop+10
  - **No Cloudflare or hCaptcha mentions found** — Tock may rely on rate limiting, session validation, and behavioral analysis rather than traditional CAPTCHA
  - **Chase Sapphire portal** can book some Tock restaurants (10% back with CSR) — separate booking pathway
  - **Tock auto-reload**: some users report the page auto-refreshes when slots go live (unconfirmed if server-push or polling)
- **Open-source tools mentioned:**
  - `github.com/azoff/tockstalk` — Tock reservation monitor/sniper
  - Python/Selenium automation scripts circulating
  - Appointment Trader ($6M+ revenue) and similar scalper marketplaces active

### 12. Legislative/Industry Response
- **Illinois ban on unauthorized reservation scalping** (Apr 2025) — 987 pts thread
  - Platforms (Resy, OpenTable, Tock, SevenRooms) called out for not blocking bots
  - NYC had similar law already but "it hasn't fixed reservations there at all"
  - Restaurant owners suggest: confirm-by-phone kills bot reservations
  - ID matching proposed but not widely implemented
- **Threads:**
  - [Illinois Ban (Apr 2025)](https://www.reddit.com/r/chicagofood/comments/1jufsb2/illinois_to_ban_unauthorized_restaurant/) — 987 pts
  - [Restaurants/Resy vs Bots (Sep 2023)](https://www.reddit.com/r/FoodNYC/comments/16tw7xg/are_restaurantsresy_doing_anything_to_combat_bots/) — "Hot restaurants just don't care"
  - [Dealing with Reservation Bots (May 2024)](https://www.reddit.com/r/restaurantowners/comments/1d4cgix/dealing_with_reservation_bots/) — owner perspective

---

## Summary: Key Sniper-Relevant Patterns

| Restaurant | City | Drop Time | Sell-out | Hold Timer | Party Quirks |
|---|---|---|---|---|---|
| Tsuke Edomae | Austin | 9 AM CT, ~6mo | 2–5s prime, 30s weekday | 10 min | 2-tops mostly, VIP pre-access |
| French Laundry | Yountville | 10 AM PT, 1st of month | <1 min (2-top) | 10 min | 4-top easier, site errors |
| Taneda | Seattle | 11 AM PT, 3rd Sat | Seconds | Unknown | 2–4 only, no solo |
| Hayato | Los Angeles | 10 AM PT, 1st of month | <30s | Unknown | 7 seats, regulars bypass Tock |
| Atomix | New York | 2 PM ET, Mon before month | ~10s | 10–15 min | Auto-reload, waitlist works |
| Alinea | Chicago | 11 PM CT, 15th | Variable | Standard | Multiple tiers, Kitchen Table easier |
| n/naka | Los Angeles | 10 AM PT, Sundays | Seconds | Standard | 2-tops hardest, desktop > mobile |
| Edulis | Toronto | 6 PM ET, monthly | Fast | Unknown | Slow nights easier |

### Tactical Takeaways for Sniper Development
1. **10-minute hold expiry** is universal on Tock — always implement a second-wave check at drop+10
2. **Party size matters** — 2-tops are always hardest; consider targeting 4-tops if flexible
3. **VIP pre-access** is common (Tsuke, Hayato) — public sees depleted inventory
4. **Desktop > mobile** — confirmed faster by multiple users
5. **Pre-filled profile + CC required** — Tock checkout needs profile complete before drop
6. **Tock detects bots** (per 2026 report) — behavioral mimicry and rate limiting are real concerns
7. **No CAPTCHA/Cloudflare observed** — Tock appears to use server-side detection, not challenge pages
8. **Site can error under load** (TFL "Something went wrong") — need retry logic for 500s
9. **tockstalk** (github.com/azoff/tockstalk) is a known open-source reference implementation
