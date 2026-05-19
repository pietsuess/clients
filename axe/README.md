# Axe & Reel - pitch site

Spec rebuild of axeandreel.com. Single file (`index.html`), no build step.

The current site reads like a default Squarespace. This pitch keeps the shop's
actual brand (quiet, slow, Pacific Northwest, exploration-minded) but adds
the functional layer that's missing: real product browsing, a working bag, a
feed that feels live, a proper visit page.

## Brand direction kept from the current site

- Warm cream paper, charcoal ink, generous whitespace
- Restrained serif wordmark, italic ampersand, "Saltspring Island B.C." subline
- Rick Ridgeway quote opens the hero, verbatim
- Their existing philosophical voice ("As children we roam free...",
  "Exploring is a basic part of human nature") used as the about story
- Catalog flavour stays - camping, fishing, workwear, vintage, 35mm cameras,
  lanterns, books

## What's new and functional

- **Sticky top bar** with shop / about / consign / visit, a search button, and
  a bag pill that opens the drawer
- **Hero** built around the Ridgeway quote, with corner stamps (coords, est.
  year, address number) and a 4-column meta strip
- **About story** with a sticky pull-quote on the left and the shop's existing
  copy on the right, drop-capped in moss green
- **Shop grid** - 18 mock items across 5 categories, line-art SVG icons, filter
  chips, just-in / sold badges, a detail modal with specs
- **Cart drawer** that actually works (add, remove, subtotal, mock checkout)
- **Feed section** on a moss background - three IG-style notes in the shop's
  voice, linked to the real account
- **Consignment explainer** - i / ii / iii, the 60/40 terms made plain
- **Visit** - hand-drawn-feeling SVG map of the island with a moss pin, hours
  in a slow-Sunday format, address, phone, email, parking
- **Newsletter** in cream, the shop's own pitch ("a short letter, once a week")
- **Footer** - oversized wordmark lockup, four columns, nothing extra

Desktop-first per the design system. The layout fills the width. Body text is
justified with last line left. Headings are big serif and italic on key
phrases (moss green) for the moments that matter.

## What's mocked vs. what it would take to launch

| Feature           | Now                                  | At launch                                              |
| ----------------- | ------------------------------------ | ------------------------------------------------------ |
| Product inventory | 18 hand-written items                | Square Catalog API or a JSON the owner edits weekly    |
| Cart / checkout   | Local only, "Continue to checkout"   | Square Checkout (same pattern used on other SSI shops) |
| Feed              | 3 typeset notes in shop voice        | IG Graph API or a weekly bake worker                   |
| Newsletter        | Stub form                            | Mailchimp endpoint                                     |
| Search            | Prompt-based                         | Inline search-as-you-type                              |
| Map               | Hand-drawn SVG of the island         | Mapbox tile (or keep this - it's quieter)              |

## Color and type

- Paper: `#EEE7D7` / `#E4DCC8` / `#F5F0E2`
- Ink: `#1A1812` / `#36322A`
- Muted: `#6F685B`
- Moss accent: `#38473A`
- Rust (held in reserve): `#8A4A2A`
- Display: Cormorant Garamond (free, Google Fonts) - matches their existing serif
- Body: Inter
- Mono labels: JetBrains Mono

## Files

```
site/
├── index.html      # the whole site
├── README.md       # this
└── assets/         # original PNGs and IG screenshots, currently unused
                    # (kept on disk, not referenced from the page)
```

The cartoon PNGs and IG screenshots that were in the parent folder are not used.
They were copied into `assets/` as a precaution but the page does not reference
them. Safe to delete.

## To run

Open `index.html` in a browser. No build step.

## Notes for the pitch

- The biggest functional gap on the current site is that you can't see what's
  actually in the shop. The consignment model relies on rotation, so the site
  has to rotate too. This build is structured around a Friday drop.
- The cart is real. Going from this mock to a working Square checkout is a
  one-day swap, not a rebuild.
- The map is hand-drawn rather than a live tile because it reads as part of
  the brand. Open to swapping in Mapbox if the owner prefers exact-location.
- One open question: how strict to be about photography. Right now the shop
  uses real lifestyle photos. This pitch is photo-less because we don't have
  rights-cleared imagery. Best version of the live site swaps the line-art
  icons for real product photos as inventory comes in.
