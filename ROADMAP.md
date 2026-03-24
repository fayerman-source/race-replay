# Race Replay Roadmap

## Purpose

Preserve the current product state, implementation decisions, and commercialization ideas so work can resume quickly when this becomes a higher priority.

Last updated: 2026-03-23

## Current Product Snapshot

The project is now a working static replay prototype for 800m indoor races on a 200m banked track.

What it currently does:
- Loads replay data from structured JSON
- Supports multiple replayable races from one site
- Selects a replay by URL query parameter
- Animates runners from official split data
- Uses a shared race model so splits, ordering, and track positions come from the same source of truth
- Supports one active heat at a time
- Highlights a focus runner
- Is suitable for static hosting such as GitHub Pages

Current replay IDs:
- `skye-oceanbreeze-section-2`
- `chloe-oceanbreeze-section-1`

Shareable URL pattern:
- `/ ?replay=skye-oceanbreeze-section-2`
- `/ ?replay=chloe-oceanbreeze-section-1`

## Key Files

- [index.html](/home/fayerman/race-replay/index.html)
- [js/app.js](/home/fayerman/race-replay/js/app.js)
- [js/heat-data.js](/home/fayerman/race-replay/js/heat-data.js)
- [js/race-model.js](/home/fayerman/race-replay/js/race-model.js)
- [js/utils.js](/home/fayerman/race-replay/js/utils.js)
- [data/custom_800m_heats.json](/home/fayerman/race-replay/data/custom_800m_heats.json)

## Implemented So Far

### Replay/Data Architecture

- Moved replay data into `data/custom_800m_heats.json`
- Added replay-level structure with stable IDs
- Added query-param routing via `?replay=...`
- Kept the app static-site friendly

### Race Model

- Introduced a dedicated race model in `js/race-model.js`
- Unified official distance, leader state, split reachability, and rendered positions under one source of truth
- Added lane-aware indoor 800m behavior
- Reintroduced staggered starts for outer lanes
- Added merge and overtaking logic after the break

### UI/Replay Improvements

- Replaced lane labels in runner dots with initials
- Reduced marker size to improve readability
- Added official checkpoint overlays
- Changed track labels to `STA` and `FIN`
- Removed redundant focus text next to Skye's marker
- Improved live splits so future splits stay hidden until reached

### Current Hosting State

- Replay work committed and pushed to `main`
- GitHub Pages is the intended first deployment target

## Product Positioning

The strongest version of this idea is not a direct-to-parent app. The stronger positioning is:

- white-labeled replay feature for results/timing platforms
- premium add-on for timers and meet operators
- fan-engagement layer on top of official split/result data

Most plausible customer types:
- timing companies
- meet directors
- results/data platforms
- governing bodies and major event organizers

## Opportunity Hypothesis

### Why this may be commercially useful

The replay turns static result tables into something easier for parents, coaches, and fans to understand and share.

Potential value:
- better parent/fan engagement
- more premium meet presentation
- more time on site for results platforms
- differentiation for timing companies
- possible sponsorship inventory around replay pages

### Most Likely Early Deal Shapes

- Paid pilot for a meet or season
- Annual white-label license
- Premium feature partnership
- Narrow exclusivity deal only if minimum guarantees are strong

### Realistic Near-Term Pricing Hypothesis

These are rough working ranges, not comps:

- Pilot: `5k-25k`
- Small annual license: `15k-75k`
- Larger embedded annual license: `75k-250k+`

These numbers improve materially if the product gains:
- direct data-feed ingestion
- strong engagement metrics
- evidence of demand from timers or major meets

## World Athletics Opportunity

World Athletics is worth tracking as a potential long-term partner, customer, or inspiration point.

Why:
- They run premium global events where storytelling matters
- Their official results pages expose more granular split data than most youth/high-school meet platforms
- Their 800m pages publicly show split columns at `100m` intervals, not just `200m`

This matters because:
- finer split granularity makes the replay more accurate
- a replay product becomes more compelling when fed by higher-resolution official data
- the same engine could eventually support elite-event storytelling, not only youth/high-school meets

Specific currently relevant context:
- The World Athletics Indoor Championships Kujawy Pomorze 26 are in Torun, Poland on `20-22 March 2026`
- World Athletics timetable pages list women's and men's 800m heats on `20 March 2026`
- Official result pages for 800m events expose `100m`, `200m`, `300m`, `400m`, `500m`, `600m`, and `700m` split columns

Important caveat:
- World Athletics may be interested, but they are a much slower and more complex target than timers or regional platforms
- This is probably not the first outbound pitch target
- It is, however, a very good strategic reference customer or validation target

## Risks

### Data Rights

Commercializing scraped result pages is not a durable strategy.

Safer long-term approaches:
- direct files/exports from timers
- licensed data feeds
- platform/API partnerships

### Workflow Risk

If replay creation stays too manual, it will be hard to sell at scale.

### Copy Risk

If the value is obvious but implementation is easy, platforms may build a simpler version internally.

### ROI Risk

The product cannot rely only on "this is cool." It needs evidence that it improves:
- engagement
- retention
- meet value
- differentiation

## Highest-Value Next Product Steps

### Product

1. Add a simple landing page or replay picker so parents do not need query parameters
2. Add mobile polish and validation
3. Tighten runner movement realism further, especially lane changes and passing behavior
4. Support additional race formats once the 800m flow is stable

### Data

1. Add cleaner ingestion from official exports instead of manual copy/paste
2. Support real lane assignments consistently
3. Support higher-resolution splits when available

### Business Validation

1. Build 3-5 polished replay examples
2. Show them to parents, coaches, timers, and meet directors
3. Ask whether they would use, share, or pay for this
4. Track replay starts, shares, and time on page

## Suggested Resume Plan

When this project becomes active again, the best order is:

1. Finish GitHub Pages deployment and confirm public links
2. Add a replay picker landing page
3. Run a short validation round with parents/coaches/timers
4. Reduce manual data ingestion
5. Prepare a simple pitch deck or one-pager for partners

## Sources Worth Rechecking Later

These were useful references at the time of writing and may inform future outreach:

- World Athletics Indoor Championships home:
  https://worldathletics.org/competitions/world-athletics-indoor-championships
- World Athletics timetable for Kujawy Pomorze 26:
  https://worldathletics.org/Competitions/world-athletics-indoor-championships/world-athletics-indoor-championships-8626/timetable/byday
- Example World Athletics 800m results page with granular split columns:
  https://worldathletics.org/competitions/world-athletics-indoor-championships/world-athletics-indoor-championships-7136586/results/women/800-metres/final/result
- AthleticNET:
  https://www.athletic.net/
- AthleticNET timer partner dashboard:
  https://support.athletic.net/article/sbzf25hum1-partner-dashboard
- FloSports acquisition of DirectAthletics:
  https://www.flosports.tv/2023/06/05/flosports-acquires-sports-data-management-leader-directathletics/
- HY-TEK Track & Field Meet Management:
  https://hytek.active.com/track-meet-management.html

## One-Sentence Strategic Summary

This project is most promising as a licensable replay layer for official race data, starting with timers and meet operators, with World Athletics-style high-resolution split feeds representing a compelling future upside.
