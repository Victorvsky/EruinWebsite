# Eruin website (www.eruin.dev)

Static site, no build system, deployed on Vercel (push to master = deploy). `index.html` is the whole landing page — styles inline.

## Devlog

Posts live in `devlog/posts/*.md` (frontmatter: title, description, date, optional tags/cover/coverAlt/slug — see header comment in `build-devlog.js`).

To publish a post:
1. Add/edit a markdown file in `devlog/posts/` (name it `YYYY-MM-DD-slug.md`)
2. Run `node build-devlog.js` — regenerates `devlog/<slug>/index.html`, `devlog/index.html`, `devlog/feed.xml`, and the devlog entries in `sitemap.xml`
3. Commit both the markdown source and the generated files

Generated devlog HTML is never edited by hand; page templates and the shared devlog CSS live inside `build-devlog.js`. The main page's look (fonts, colors, grain, rune dividers) is mirrored there — if the landing page theme changes, update `SHARED_CSS` in the script too.
