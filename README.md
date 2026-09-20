# Bolt Group — static site

A pure **HTML / CSS / JS** copy of [bolt.business](https://bolt.business/), pulled from the
live WordPress + Elementor site and made fully self-contained. No build step, no
framework, no CMS — just files.

## Deploy

**Push to `main` and it goes live.** The repo is connected to Netlify, which publishes
`site/` with no build command — <https://bolt-business.netlify.app>.

Branches other than `main` do not deploy. Pull requests get a preview URL.

**Manual deploy**, if you ever need to bypass git:

```bash
netlify deploy --prod --dir site
```

**Drag & drop:** drag the `site/` folder onto <https://app.netlify.com/drop>.

**Anywhere else:** copy the contents of `site/` to any static host — it is just files.

### How the git connection is wired

The Netlify project lives on the **Fullstack Bolt** team (Ricardo's account) while the
repo is under the **martoast** GitHub account. Because those are two different accounts,
this is connected with a read-only **deploy key** plus a repo **webhook** rather than the
usual Netlify GitHub App:

- GitHub deploy key `Netlify (bolt-business) deploy key` — lets Netlify clone the repo
- GitHub webhook → `https://api.netlify.com/hooks/github` — tells Netlify a push happened

If deploys ever stop firing, check those two first (Settings → Deploy keys, and
Settings → Webhooks, on the GitHub repo). Deleting either one breaks automatic deploys.

## Layout

```
site/
  index.html            → /            Home (Spanish)
  historia/index.html   → /historia/   Historia
  en/inicio/index.html  → /en/inicio/  Home (English)
  en/history/index.html → /en/history/ History (English)
  assets/fonts/         Self-hosted Roboto, Roboto Slab, Hubot Sans (no Google Fonts calls)
  wp-content/           Images, video, Elementor CSS/JS, per-page Elementor stylesheets
  wp-includes/          jQuery + the WordPress core JS the theme depends on
```

The `wp-content` / `wp-includes` paths are kept exactly as the original site had them.
That is deliberate: every stylesheet, script and `srcset` then resolves without further
rewriting, so the copy renders identically. Rename them later if you want, but do it as
a find-and-replace across all four HTML files and the CSS.

## How faithful is it?

Rendered at 1440px wide and compared to the live site pixel by pixel, the home page
first viewport diffs by **0 pixels**. Whole-page captures differ only where the page is
genuinely non-deterministic — the client-logo marquee is always scrolling, so two
captures catch it at different offsets.

Verified working locally: the animated counters (7 / 4), the logo carousels, the nav
menu, the hero and section videos, and Elementor's lazy-loaded JS chunks.

## Working on it locally

```bash
cd site && python3 -m http.server 8010
# → http://127.0.0.1:8010
```

Open it through a server, not `file://` — the pages use relative asset paths and
Elementor's JS loads additional chunks at runtime.

## Changes made on top of the replica

These are deliberate departures from the old WordPress site. Everything else
still matches it.

**Logo marquee** (`assets/bolt.css`) — the two logo rows were an Elementor
image carousel that stepped from logo to logo, with an inline script trying to
smooth it out by reaching into Swiper. Both are gone. The rows are now a CSS
marquee: the logos are in the track twice and one cycle shifts it by exactly
one copy, so the loop is seamless and never settles. It pauses on hover and on
keyboard focus. Logo size is unchanged (213.33px wide at 1440+, the same as
before) and it still shows 9 / 3 / 2 logos at the old breakpoints.

**Brand switcher on mobile** (`assets/bolt.js`, `assets/bolt.css`) — the brand
panels sit above the logo grid, so on a phone the grid was below the fold and
tapping a logo changed a panel that was off-screen above. Under 768px the panel
now opens as a sheet over the page, with a close button, backdrop, Escape and
swipe-down. Desktop is untouched. The panel element is moved into the sheet and
moved back on close, never copied, so each brand's copy exists once in the
document — which is also what keeps the translations in step.

**One page, two languages** (`assets/i18n.*.js`) — see below.

**Living hero** (`assets/hero/hero-globe.jpg`, the `.bolt-arcs` SVG in
`index.html`, styles in `assets/bolt.css`) — the old hero was one flat JPG with
the network arcs painted into it, so nothing about it could move. The photo is
now a clean globe with no arcs, and the network is drawn over it as SVG with
light travelling along each route.

The trick that holds it together: the `<svg>` uses the photo's own pixel space
(`viewBox="0 0 2560 1040"`) with `preserveAspectRatio="xMidYMid slice"`, which
crops exactly the way `background-size: cover; background-position: center`
does. So every arc stays pinned to its city at any viewport size, with no
JavaScript and no resize handler.

Each route is three strokes: a dim always-on rail, a wide soft glow and a
bright core. The glow and core carry `pathLength="1"`, so a
`stroke-dasharray` of `0.13 0.87` is a dash covering 13% of the route, and
animating `stroke-dashoffset` from 0 to 1 walks it end to end. Per-arc speed
and stagger are the inline `--d` and `--t` custom properties.

The globe was matched to the original shot by measurement, not by eye: a script
reads the planet's bright rim per column in both images and a least-squares fit
gives the crop that lands one curve on the other.

It matches by **zooming in** on a render whose globe was too small, never by
shrinking one that was too big. Shrinking leaves a gap that has to be padded,
and padding the top of this frame cuts a hard edge straight through the
atmosphere glow - a flat black band right where the navbar sits. Zooming in can
only ever fill the frame.

To change the network, edit the `NODES` and `ARCS` tables in the generator
(kept out of the repo) or just hand-edit the paths in `index.html` — the
coordinates are plain image pixels. Node dots were snapped to the brightest
city-light cluster within 70px of each hand-picked point, which is why they sit
on real lights rather than in the ocean.

## Languages

Spanish and English used to be separate pages. They are now one page that
switches in the browser.

- `assets/i18n.home.js` and `assets/i18n.historia.js` hold every Spanish string
  on their page paired with its English, in document order, plus the `<title>`,
  meta description and `lang` for each language.
- The switcher in the header swaps them without reloading. The choice is
  remembered (localStorage) and reflected in the URL as `?lang=en`.
- **Spanish is the default**, as it was at these URLs before. To follow the
  visitor's browser language instead, there is a one-line change marked in
  `initLanguage()` in `assets/bolt.js`.
- `/en/inicio/` and `/en/history/` 301 to `/?lang=en` and `/historia/?lang=en`.

**To edit copy:** change the Spanish in the HTML *and* its English in the
matching `i18n.*.js` entry. They are paired by the Spanish string, so if you
change Spanish text without updating the pair, that one string simply stops
translating — nothing else breaks.

Where the English was shorter than the Spanish (the method steps, a few
paragraphs on Historia that the English page condensed), the extra lines are
blanked and their `<br>` — or the whole element, if it empties — is hidden,
then restored when you switch back.

## Sharing and SEO

The old WordPress site had **no** description, no `og:` tags and no share
image — a link pasted into WhatsApp showed "Bolt Group" and nothing else. That
is now built properly:

- `assets/social/og-home.jpg` and `og-historia.jpg` (1200x630, made from the
  site's own hero art and wordmark)
- full Open Graph + Twitter card tags, a real meta description, canonical,
  `hreflang`, `robots.txt` and `sitemap.xml`

**The URLs in those tags are absolute, and must stay that way.** WhatsApp,
Facebook, LinkedIn and Slack fetch the page from their own servers, so a
relative `og:image` yields no preview at all.

### Moving to bolt.business (or any other domain)

Every absolute URL sits between the `<!-- bolt:social -->` markers in the two
HTML pages, plus `robots.txt` and `sitemap.xml`. One pass updates them all:

```bash
cd site
grep -rl 'bolt-business.netlify.app' . \
  | xargs sed -i '' 's|https://bolt-business\.netlify\.app|https://bolt.business|g'
```

Then re-share the link — WhatsApp and Facebook cache previews aggressively.
Facebook's Sharing Debugger (`developers.facebook.com/tools/debug/`) has a
"Scrape Again" button that clears it; LinkedIn has Post Inspector. WhatsApp
has no manual tool and clears on its own, usually within a day — adding
`?x=1` to the URL forces a fresh preview in the meantime.

### One limitation

The preview is always the **Spanish** one, including for `?lang=en`. Link
scrapers do not run JavaScript, so they only ever see what is in the HTML, and
the language switch happens in the browser. Fixing it properly would mean
serving two real documents again, which is what we just removed. For a business
whose primary market is Mexico this is the right trade; if English previews
become important, the cheapest fix is a Netlify Edge Function rewriting the
`og:` tags when `?lang=en` is present.

## Known gaps

- **The blog is not included.** `/blog/` (and `/en/blog-en/`) still link to the live
  WordPress site. It is a dynamic, multi-post section; porting it is a separate job —
  decide whether it moves to a static generator, an external service, or gets dropped.
- **The contact form has no backend.** It was an Elementor Pro form, which posted to
  WordPress. The markup and styling are intact but submissions go nowhere until it is
  wired up (Netlify Forms is the cheapest option — add `netlify` to the `<form>` tag).
- **The `Contacto` nav button is translated to `Contact`.** Their English page
  left that one button in Spanish; a bilingual toggle that leaves the main call
  to action untranslated reads as a bug, so it is translated here.
- **Historia's English is shorter than its Spanish.** Their English page
  condenses three paragraphs into one and drops the "one-stop shop" sentence.
  That is carried over as-is rather than machine-translated; if you want the
  full text in English, it needs writing.
- WordPress-only plumbing was stripped: XML-RPC, the REST/oEmbed discovery tags, RSS
  feed links, and the emoji polyfill. None of it affects rendering.

## Where it came from

Mirrored with a script that fetched each page's production HTML through ScraperAPI,
then pulled every stylesheet, script, font, image and video it referenced — recursing
into CSS `url()` rules and into Elementor's webpack chunk map — and rewrote every
absolute URL to a relative one.
