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

## Known gaps

- **The blog is not included.** `/blog/` (and `/en/blog-en/`) still link to the live
  WordPress site. It is a dynamic, multi-post section; porting it is a separate job —
  decide whether it moves to a static generator, an external service, or gets dropped.
- **The contact form has no backend.** It was an Elementor Pro form, which posted to
  WordPress. The markup and styling are intact but submissions go nowhere until it is
  wired up (Netlify Forms is the cheapest option — add `netlify` to the `<form>` tag).
- WordPress-only plumbing was stripped: XML-RPC, the REST/oEmbed discovery tags, RSS
  feed links, and the emoji polyfill. None of it affects rendering.

## Where it came from

Mirrored with a script that fetched each page's production HTML through ScraperAPI,
then pulled every stylesheet, script, font, image and video it referenced — recursing
into CSS `url()` rules and into Elementor's webpack chunk map — and rewrote every
absolute URL to a relative one.
