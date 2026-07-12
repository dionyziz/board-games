# Data pipeline — Airtable → `games.json` + local covers

Jason's collection lives in a public Airtable shared view. Airtable serves it as
an index-compressed msgpack payload that can't be scraped server-side, so we use
a headless browser to intercept the app's own signed data request and re-issue it
with `allowMsgpackOfResult=false` to get plain JSON. This preserves the request's
signed `accessPolicy`, so no token is required.

**Already run on 2026-07-12** — outputs are committed:
- `airtable-raw.json` — full decoded Airtable app payload (snapshot).
- `bgg-cache/*.json` — raw BoardGameGeek JSON per game (offline re-enrichment).
- `enrich-report.json` — per-game dimension source + agreement score.
- `games.json` — normalized + enriched collection (copied to `../src/data/games.json`).
- `../public/covers/*.jpg` — 210 downloaded cover images.

## Re-running

Requires Node ≥ 18 and Playwright's Chromium (`npx playwright install chromium`).

```bash
cd scripts
npm i playwright-core          # only dep needed for the fetch steps
node 1-fetch-airtable.js       # → airtable-raw.json    (headless browser)
node 2-build-games.js          # → games.json           (normalize + slugs)
node 3-download-covers.js      # → ../public/covers/*    + ../src/data/games.json
node 4-fetch-bgg.js            # → bgg-cache/*           (headless; ~4 min)
node 5-enrich.js               # → merge metadata + box dims into games.json
npm i sharp
node 6-prepare-textures.js     # → ../public/textures/*   + colors into games.json
```

Steps 2, 5 and 6 are pure (no browser) and safe to re-run to tweak output.

`public/covers/` (108 MB originals) and `scripts/bgg-cache/` (16 MB) are both
regenerable — consider git-ignoring them; only `public/textures/` (15 MB) ships.

## BGG data source (important)

BGG's documented **XML API is dead** — `boardgamegeek.com/xmlapi2/*` returns
`401 Unauthorized` (needs login) as of 2025, even via a browser. We instead use
BGG's own **undocumented JSON API at `api.geekdo.com`** (open), through a headless
browser for Cloudflare cookies. Per game we pull `geekitems` (metadata),
`dynamicinfo` (complexity/rating/rank) and the `boardgameversion` link list
(physical dimensions).

### Box dimensions
Dimensions are per-edition and contributor-entered in **mixed units**.
`5-enrich.js` normalizes to cm (max side >15 ⇒ cm, else inches×2.54),
edition-matches to the owned copy (title size-variants like "Mini"/"XXL"; Greek
editions for Greek titles), then cross-checks across editions (cluster → median,
with an `agreement` score). Coverage: **196/210 real, 14 estimated** via a
category/format fallback (`box.estimatedSize: true`).

## Notes / gotchas
- The signed image URLs in the raw payload **expire**, which is why step 3
  downloads every cover locally. Re-run steps 1→3 together if you re-fetch.
- Some covers are actually PNG bytes saved with a `.jpg` extension — browsers
  sniff content type so this renders fine; the texture-prep step (see PLAN.md
  §4.3) will re-encode them to `.webp` anyway.
- `airtable-raw.json` is the source of truth for a re-import; `2-build-games.js`
  is pure and can be re-run without a browser.

## `games.json` shape

```jsonc
{
  "source": "Airtable — Jason's tabletop games",
  "fetchedAt": "2026-07-12",
  "count": 210,
  "fields": [ { "name": "Name", "type": "text" }, ... ],
  "games": [
    {
      "id": "codenames-178900",         // slug = transliterated title + bggId
      "recordId": "recTSLUjqlnwxdo1v",
      "title": "Codenames",
      "bggId": 178900,
      "bggUrl": "https://boardgamegeek.com/boardgame/178900/codenames",
      "optimalPlayers": ["4","5","6","7","8","9+"],
      "weight": 1,                        // Jason's 1–5 (Airtable "Weight")
      "notes": "", "expansions": "", "sleeves": [], "tags": [],
      "cover": "/covers/codenames-178900.jpg",

      // --- from BGG enrichment (step 5) ---
      "year": 2015,
      "players": { "min": 2, "max": 8 },
      "playtime": { "min": 15, "max": 15 },
      "minAge": 14,
      "designers": ["Vlaada Chvátil"],
      "artists": ["..."],
      "publishers": ["Czech Games Edition", "..."],
      "categories": ["Card Game", "Deduction", "Party Game", "..."],
      "mechanics": ["Communication Limits", "Team-Based Game", "..."],
      "families": ["..."],
      "complexity": 1.25,                 // BGG avgweight (1–5, finer)
      "bggRating": 7.52,
      "bggRank": 82,
      "shortDescription": "...",
      "description": "...",               // full plain-text
      "box": {
        "size": { "w": 16.2, "h": 23.2, "d": 5.0 },  // cm
        "unit": "cm",
        "source": "bgg-median",           // or bgg-greek-edition / bgg-variant:* / estimated
        "versionsUsed": 33,
        "versionsWithDims": 33,
        "agreement": 0.98,                // 1.0 = all editions agree
        "estimatedSize": false
      }
    }
  ]
}
```

## Collection stats
- **210 games**, all with a cover image; **203** have a BoardGameGeek link.
- Metadata (year/players/playtime/designers/complexity/description) for **203**.
- Box dimensions for **all 210**: **196 real** (BGG, cross-checked across
  editions), **14 estimated**. 28 have `agreement < 0.8` (editions vary) — see
  `enrich-report.json`.
- Jason's own weight distribution: `1`→40, `2`→74, `3`→78, `4`→16, `5`→2.
- Titles include Greek-language editions (transliterated for slugs; Greek
  editions preferred for their box dimensions where available).
