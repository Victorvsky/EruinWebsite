#!/usr/bin/env node
/**
 * Eruin devlog generator — zero dependencies.
 *
 * Usage:  node build-devlog.js
 *
 * Reads markdown posts from devlog/posts/*.md and generates:
 *   devlog/<slug>/index.html   one page per post
 *   devlog/index.html          the archive page
 *   devlog/feed.xml            RSS feed
 * and refreshes the /devlog entries in sitemap.xml.
 *
 * Post format (frontmatter between --- lines, then markdown):
 *   ---
 *   title: The title
 *   description: One-line summary used for cards, meta tags and RSS.
 *   date: 2026-08-29
 *   tags: voice, local-ai, ue5
 *   cover: /lake.webp          (optional, shown atop the post + used for og:image)
 *   coverAlt: alt text         (optional)
 *   slug: custom-slug          (optional, default: filename minus date prefix)
 *   ---
 *
 * Markdown supported: # headings, paragraphs, **bold**, *italic*, `code`,
 * fenced ``` code blocks (with language label), [links](url), ![images](src),
 * > blockquotes, - / 1. lists, --- rune dividers. Raw HTML passes through.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'devlog', 'posts');
const OUT_DIR = path.join(ROOT, 'devlog');
const SITE = 'https://www.eruin.dev';

/* ── helpers ─────────────────────────────────────────────────────────── */

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function roman(n) {
  const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
    [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = '';
  for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
  return out;
}

function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July',
    'August','September','October','November','December'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function readingTime(md) {
  const words = md.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/* ── frontmatter ─────────────────────────────────────────────────────── */

function parsePost(file) {
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter (--- block)`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  for (const req of ['title', 'description', 'date']) {
    if (!meta[req]) throw new Error(`${file}: frontmatter missing "${req}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date must be YYYY-MM-DD`);
  const slug = meta.slug || file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const tags = (meta.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const body = m[2].trim();
  return { ...meta, slug, tags, body, minutes: readingTime(body), file };
}

/* ── markdown → html ─────────────────────────────────────────────────── */

function inline(text) {
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${esc(c)}</code>`);
    return '\x00' + (codes.length - 1) + '\x00';
  });
  text = text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const ext = /^https?:\/\//.test(href) && !href.startsWith(SITE);
      return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return text.replace(/\x00(\d+)\x00/g, (_, i) => codes[i]);
}

function mdToHtml(md) {
  const fences = [];
  md = md.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    fences.push({ lang, code: code.replace(/\s+$/, '') });
    return '\x00F' + (fences.length - 1) + '\x00';
  });

  const isBlockStart = s =>
    /^(#{1,6}\s|>|[-*]\s|\d+\.\s|<|\x00F\d+\x00$)/.test(s) || /^(-{3,}|\*{3,})$/.test(s);

  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();

    if (!t) { i++; continue; }

    const fence = t.match(/^\x00F(\d+)\x00$/);
    if (fence) {
      const { lang, code } = fences[Number(fence[1])];
      out.push(`<div class="codebox">${lang ? `<span class="codelang">${esc(lang)}</span>` : ''}<pre><code>${esc(code)}</code></pre></div>`);
      i++; continue;
    }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.max(2, Math.min(h[1].length, 6)); // page h1 is the post title
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++; continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(t)) {
      out.push('<div class="rune-row"><span class="rune-line l"></span><span class="rune-diamond"></span><span class="rune-line r"></span></div>');
      i++; continue;
    }

    if (t.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        q.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
      const ordered = /^\d+\.\s+/.test(t);
      const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(re, ''))}</li>`);
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // raw HTML block: pass through untouched until blank line
    if (t.startsWith('<')) {
      const raw = [];
      while (i < lines.length && lines[i].trim()) { raw.push(lines[i]); i++; }
      out.push(raw.join('\n'));
      continue;
    }

    // paragraph: always consume at least the current line
    const para = [t];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* ── shared page chrome ──────────────────────────────────────────────── */

const SHARED_CSS = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --accent: #e0b24a; --accent-glow: #f6d073;
  --crystal: #8b5cf6; --crystal-glow: #a78bfa;
  --night: #0b0611; --moonlight: #ede4f8; --silver: #d0c4e0;
}
html { scroll-behavior: smooth; }
body { font-family: 'Crimson Text', serif; background: var(--night); color: var(--moonlight); overflow-x: hidden; -webkit-font-smoothing: antialiased; }
a { color: var(--accent-glow); text-decoration: none; }
a:hover { color: #fff; }
::selection { background: rgba(224,178,74,.3); color: #fff; }
.grain { position: fixed; inset: 0; z-index: 60; pointer-events: none; mix-blend-mode: overlay; opacity: .07;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%22.9%22 numOctaves=%222%22/></filter><rect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22/></svg>'); }
#navbar { position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding: 1.05rem clamp(1.2rem, 4vw, 2.6rem);
  background: linear-gradient(180deg, rgba(11,6,17,.7), transparent);
  transition: background .4s ease, padding .4s ease; }
#navbar.scrolled { background: rgba(11,6,17,.82); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(139,92,246,.12); padding: .75rem clamp(1.2rem, 4vw, 2.6rem); }
.nav-wordmark { font-family: 'Cinzel Decorative', serif; font-weight: 700; font-size: 1.35rem; letter-spacing: .22em;
  background: linear-gradient(180deg, #f6d073, #c9902f);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.nav-right { display: flex; align-items: center; gap: clamp(1rem, 2.4vw, 2.1rem); flex-wrap: wrap; }
.nav-link { font-family: 'Cinzel', serif; font-size: .74rem; font-weight: 500; letter-spacing: .22em;
  text-transform: uppercase; color: rgba(208,196,224,.72); transition: color .3s; }
.nav-link:hover { color: var(--accent-glow); }
.nav-cta { font-family: 'Cinzel', serif; font-size: .72rem; font-weight: 600; letter-spacing: .16em;
  text-transform: uppercase; color: #1a1208; padding: .55rem 1.15rem; border-radius: 3px;
  background: linear-gradient(135deg, var(--accent-glow), var(--accent)); box-shadow: 0 4px 18px rgba(224,178,74,.28); }
.nav-cta:hover { color: #1a1208; filter: brightness(1.06); }
.eyebrow { font-family: 'Cinzel', serif; font-size: .75rem; font-weight: 600; letter-spacing: .42em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 1rem; }
.display { font-family: 'Cinzel Decorative', serif; font-weight: 700; line-height: 1.25;
  background: linear-gradient(180deg, #ede4f8, #c9b8e0);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.rune-row { display: flex; align-items: center; justify-content: center; gap: 1.2rem; margin: 2.6rem 0; }
.rune-line { height: 1px; flex: 1; max-width: 120px; }
.rune-line.l { background: linear-gradient(90deg, transparent, rgba(224,178,74,.4)); }
.rune-line.r { background: linear-gradient(90deg, rgba(224,178,74,.4), transparent); }
.rune-diamond { width: 8px; height: 8px; background: var(--accent); transform: rotate(45deg); box-shadow: 0 0 10px var(--accent-glow); }
.reveal { opacity: 0; transform: translateY(34px); transition: opacity .9s ease, transform .9s ease; }
.reveal.visible { opacity: 1; transform: translateY(0); }
.tag { display: inline-flex; align-items: center; gap: .4rem; font-family: 'Cinzel', serif; font-size: .64rem;
  letter-spacing: .1em; text-transform: uppercase; color: var(--accent-glow);
  padding: .34rem .7rem; border: 1px solid rgba(224,178,74,.3); border-radius: 20px; background: rgba(224,178,74,.06); }
footer { border-top: 1px solid rgba(139,92,246,.1); padding: 3.4rem 2rem; text-align: center; background: var(--night); }
.footer-logo { font-family: 'Cinzel Decorative', serif; font-size: 1.6rem; font-weight: 700; letter-spacing: .18em;
  background: linear-gradient(180deg, #f6d073, #c9902f);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 1.2rem; }
.footer-links { display: flex; gap: 2rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.4rem; }
.footer-links a { font-family: 'Cinzel', serif; font-size: .78rem; letter-spacing: .16em; text-transform: uppercase;
  color: rgba(208,196,224,.5); transition: color .3s; }
.footer-links a:hover { color: var(--accent-glow); }
.footer-copy { font-size: .85rem; color: rgba(208,196,224,.28); }
`;

const SHARED_JS = `
const navbar = document.getElementById('navbar');
const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 40);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 90);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
reveals.forEach(el => observer.observe(el));
`;

function nav(active) {
  return `<nav id="navbar">
  <a href="/" class="nav-wordmark">ERUIN</a>
  <div class="nav-right">
    <span class="nav-links">
      <a href="/#pillars" class="nav-link">Features</a>
      <a href="/#world" class="nav-link" style="margin-left:2rem;">The World</a>
      <a href="/devlog/" class="nav-link" style="margin-left:2rem;${active === 'devlog' ? 'color:var(--accent-glow);' : ''}">Devlog</a>
    </span>
    <a href="https://store.steampowered.com/app/4695190/Eruin/" target="_blank" rel="noopener" class="nav-cta">Wishlist</a>
  </div>
</nav>`;
}

const FOOTER = `<footer>
  <div class="footer-logo">Eruin</div>
  <nav class="footer-links">
    <a href="/">Home</a>
    <a href="/devlog/">Devlog</a>
    <a href="/devlog/feed.xml">RSS</a>
    <a href="https://store.steampowered.com/app/4695190/Eruin/" target="_blank" rel="noopener">Steam</a>
    <a href="https://discord.gg/JYqdYUT4u7" target="_blank" rel="noopener">Discord</a>
  </nav>
  <p class="footer-copy">&copy; 2026 Eruin. All rights reserved.</p>
</footer>`;

const HEAD_COMMON = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0b0611">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Eruin Devlog" href="${SITE}/devlog/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;500;600;700&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap" rel="stylesheet">
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>`;

/* ── post page ───────────────────────────────────────────────────────── */

function renderPost(post, idx, posts) {
  const url = `${SITE}/devlog/${post.slug}/`;
  const ogImage = post.cover ? SITE + post.cover : `${SITE}/library_header_920x430_square_corners.png`;
  const prev = posts[idx + 1]; // posts sorted newest-first
  const next = posts[idx - 1];

  const pager = (prev || next) ? `<div class="pager">
    ${prev ? `<a class="pager-link" href="/devlog/${prev.slug}/"><span class="pager-k">&larr; Older entry</span><span class="pager-v">${esc(prev.title)}</span></a>` : '<span></span>'}
    ${next ? `<a class="pager-link r" href="/devlog/${next.slug}/"><span class="pager-k">Newer entry &rarr;</span><span class="pager-v">${esc(next.title)}</span></a>` : '<span></span>'}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_COMMON}
<title>${esc(post.title)} &middot; Eruin Devlog</title>
<meta name="description" content="${esc(post.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Eruin">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(post.description)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(post.title)}">
<meta name="twitter:description" content="${esc(post.description)}">
<meta name="twitter:image" content="${ogImage}">
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.description,
  datePublished: post.date,
  image: ogImage,
  url,
  author: { '@type': 'Organization', name: 'Eruin' },
  isPartOf: { '@type': 'Blog', name: 'Eruin Devlog', url: `${SITE}/devlog/` }
}, null, 2)}
</script>
<style>
${SHARED_CSS}
#progress { position: fixed; top: 0; left: 0; height: 2px; width: 0; z-index: 55;
  background: linear-gradient(90deg, var(--accent), var(--accent-glow)); box-shadow: 0 0 12px rgba(224,178,74,.6); }
.post-hero { padding: 9.5rem clamp(1.2rem, 4vw, 2.6rem) 3rem; text-align: center;
  background: radial-gradient(ellipse 70% 55% at 50% 0%, rgba(139,92,246,.14), transparent 70%), var(--night); }
.post-hero .entry-num { font-family: 'Cinzel Decorative', serif; font-size: .95rem; color: rgba(224,178,74,.55); letter-spacing: .2em; margin-bottom: 1.1rem; }
.post-hero h1 { font-size: clamp(1.9rem, 4.6vw, 3.1rem); max-width: 900px; margin: 0 auto; }
.post-meta { display: flex; align-items: center; justify-content: center; gap: 1.1rem; flex-wrap: wrap;
  margin-top: 1.5rem; font-family: 'Cinzel', serif; font-size: .72rem; letter-spacing: .18em;
  text-transform: uppercase; color: rgba(208,196,224,.55); }
.post-meta .sep { color: rgba(224,178,74,.45); }
.post-tags { display: flex; gap: .55rem; justify-content: center; flex-wrap: wrap; margin-top: 1.3rem; }
.post-cover { max-width: 980px; margin: 2.6rem auto 0; border-radius: 8px; overflow: hidden;
  border: 1px solid rgba(139,92,246,.16); box-shadow: 0 30px 90px rgba(0,0,0,.55), 0 0 60px rgba(139,92,246,.06); }
.post-cover img { width: 100%; display: block; }
article { max-width: 720px; margin: 0 auto; padding: 2rem clamp(1.2rem, 4vw, 2rem) 5rem;
  font-size: 1.16rem; line-height: 1.85; color: rgba(224,215,242,.88); }
article p { margin-bottom: 1.4rem; }
article h2, article h3, article h4 { font-family: 'Cinzel', serif; font-weight: 600; color: var(--moonlight);
  margin: 2.6rem 0 1rem; line-height: 1.35; }
article h2 { font-size: 1.65rem; }
article h2::before { content: '◇  '; color: var(--accent); font-size: .8em; }
article h3 { font-size: 1.3rem; }
article a { border-bottom: 1px solid rgba(224,178,74,.35); }
article a:hover { border-color: #fff; }
article img { max-width: 100%; border-radius: 8px; border: 1px solid rgba(139,92,246,.16);
  box-shadow: 0 20px 60px rgba(0,0,0,.45); margin: .6rem 0 1.4rem; }
article ul, article ol { margin: 0 0 1.4rem 1.4rem; }
article li { margin-bottom: .55rem; }
article li::marker { color: var(--accent); }
article blockquote { border-left: 2px solid var(--accent); padding: .4rem 0 .4rem 1.4rem; margin: 1.8rem 0;
  font-style: italic; font-size: 1.22rem; color: #e4d9f2; }
article code { font-family: 'Consolas', 'Menlo', monospace; font-size: .86em;
  background: rgba(139,92,246,.12); border: 1px solid rgba(139,92,246,.18);
  border-radius: 4px; padding: .1em .4em; color: #d8ccf0; }
.codebox { position: relative; margin: 1.8rem 0; border-radius: 8px; overflow: hidden;
  border: 1px solid rgba(139,92,246,.22);
  background: linear-gradient(160deg, rgba(24,16,42,.95), rgba(12,8,22,.98));
  box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.codebox::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent); }
.codelang { position: absolute; top: .6rem; right: .9rem; font-family: 'Cinzel', serif; font-size: .6rem;
  letter-spacing: .2em; text-transform: uppercase; color: rgba(224,178,74,.55); }
.codebox pre { padding: 1.4rem 1.3rem; overflow-x: auto; }
.codebox code { font-family: 'Consolas', 'Menlo', monospace; font-size: .88rem; line-height: 1.65;
  background: none; border: none; padding: 0; color: #cfc3e8; }
.pager { max-width: 720px; margin: 0 auto; padding: 0 clamp(1.2rem, 4vw, 2rem) 3rem;
  display: flex; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap; }
.pager-link { display: flex; flex-direction: column; gap: .4rem; max-width: 46%; }
.pager-link.r { text-align: right; margin-left: auto; }
.pager-k { font-family: 'Cinzel', serif; font-size: .64rem; letter-spacing: .2em; text-transform: uppercase; color: rgba(208,196,224,.5); }
.pager-v { font-family: 'Cinzel', serif; font-size: .95rem; color: var(--accent-glow); line-height: 1.4; }
.pager-link:hover .pager-v { color: #fff; }
.post-cta { text-align: center; padding: 0 1.5rem 6rem; }
.post-cta p { font-style: italic; color: rgba(208,196,224,.6); margin-bottom: 1.4rem; }
.btn-gold { display: inline-flex; align-items: center; gap: .7rem; padding: 1rem 2.2rem;
  font-family: 'Cinzel', serif; font-size: .9rem; font-weight: 600; letter-spacing: .13em; text-transform: uppercase;
  color: #1a1208; border-radius: 3px; background: linear-gradient(135deg, var(--accent-glow), var(--accent));
  box-shadow: 0 8px 34px rgba(224,178,74,.34); transition: transform .35s ease, box-shadow .35s ease; }
.btn-gold:hover { color: #1a1208; transform: translateY(-2px); box-shadow: 0 12px 44px rgba(224,178,74,.5); }
@media (max-width: 780px) { .nav-links { display: none; } .pager-link { max-width: 100%; } }
</style>
</head>
<body>
<div class="grain"></div>
<div id="progress"></div>
${nav('devlog')}

<header class="post-hero">
  <div class="entry-num">Devlog &middot; Entry ${roman(post.entryNum)}</div>
  <h1 class="display">${esc(post.title)}</h1>
  <div class="post-meta">
    <span>${prettyDate(post.date)}</span>
    <span class="sep">◇</span>
    <span>${post.minutes} min read</span>
  </div>
  ${post.tags.length ? `<div class="post-tags">${post.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  ${post.cover ? `<div class="post-cover"><img src="${post.cover}" alt="${esc(post.coverAlt || '')}"></div>` : ''}
</header>

<article>
${mdToHtml(post.body)}
</article>

<div class="rune-row" style="max-width:400px;margin:0 auto 2.6rem;"><span class="rune-line l"></span><span class="rune-diamond"></span><span class="rune-line r"></span></div>

${pager}

<div class="post-cta">
  <p>Enjoying the journey behind Eruin?</p>
  <a href="https://store.steampowered.com/app/4695190/Eruin/" target="_blank" rel="noopener" class="btn-gold">Wishlist on Steam</a>
</div>

${FOOTER}

<script>
${SHARED_JS}
const bar = document.getElementById('progress');
const onProgress = () => {
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
};
window.addEventListener('scroll', onProgress, { passive: true });
onProgress();
</script>
</body>
</html>
`;
}

/* ── archive page ────────────────────────────────────────────────────── */

function renderIndex(posts) {
  const cards = posts.map(p => `
  <a class="entry reveal" href="/devlog/${p.slug}/">
    <div class="entry-side">
      <div class="entry-roman">${roman(p.entryNum)}</div>
      <div class="entry-date">${prettyDate(p.date)}</div>
    </div>
    <div class="entry-main">
      <h2>${esc(p.title)}</h2>
      <p>${esc(p.description)}</p>
      <div class="entry-foot">
        ${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        <span class="entry-read">${p.minutes} min read &rarr;</span>
      </div>
    </div>
  </a>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_COMMON}
<title>Devlog &middot; Eruin</title>
<meta name="description" content="Tech devlogs from the making of Eruin, a voice-first fantasy mystery RPG powered by local AI. Voice pipelines, local LLMs, Unreal Engine, and everything in between.">
<link rel="canonical" href="${SITE}/devlog/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Eruin">
<meta property="og:title" content="Eruin Devlog: Notes from the Workshop">
<meta property="og:description" content="Tech devlogs from the making of Eruin: voice pipelines, local LLMs, Unreal Engine, and everything in between.">
<meta property="og:image" content="${SITE}/library_header_920x430_square_corners.png">
<meta property="og:url" content="${SITE}/devlog/">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: 'Eruin Devlog',
  url: `${SITE}/devlog/`,
  description: 'Tech devlogs from the making of Eruin, a voice-first fantasy mystery RPG powered by local AI.',
  publisher: { '@type': 'Organization', name: 'Eruin' }
}, null, 2)}
</script>
<style>
${SHARED_CSS}
.dl-hero { padding: 10rem clamp(1.2rem, 4vw, 2.6rem) 4rem; text-align: center;
  background: radial-gradient(ellipse 70% 55% at 50% 0%, rgba(139,92,246,.16), transparent 70%), var(--night); }
.dl-hero h1 { font-size: clamp(2.2rem, 5.4vw, 3.6rem); }
.dl-hero p { max-width: 560px; margin: 1.5rem auto 0; font-size: 1.15rem; line-height: 1.75;
  color: rgba(208,196,224,.75); font-style: italic; }
.entries { max-width: 860px; margin: 0 auto; padding: 1rem clamp(1.2rem, 4vw, 2rem) 7rem;
  display: flex; flex-direction: column; gap: 1.3rem; }
.entry { display: flex; gap: 2rem; padding: 2.1rem 2.2rem; border-radius: 6px;
  background: linear-gradient(160deg, rgba(34,24,58,.7), rgba(18,12,32,.85));
  border: 1px solid rgba(139,92,246,.12); position: relative; overflow: hidden;
  transition: transform .45s ease, border-color .45s ease, box-shadow .45s ease; }
.entry::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent); opacity: 0; transition: opacity .45s ease; }
.entry:hover { transform: translateY(-5px); border-color: rgba(224,178,74,.35); box-shadow: 0 24px 60px rgba(0,0,0,.4); }
.entry:hover::before { opacity: 1; }
.entry-side { flex: none; width: 105px; text-align: center; }
.entry-roman { font-family: 'Cinzel Decorative', serif; font-size: 1.7rem; color: rgba(224,178,74,.6); line-height: 1; }
.entry-date { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: .14em; text-transform: uppercase;
  color: rgba(208,196,224,.45); margin-top: .7rem; line-height: 1.5; }
.entry-main h2 { font-family: 'Cinzel', serif; font-weight: 600; font-size: 1.35rem; color: var(--moonlight);
  line-height: 1.35; margin-bottom: .6rem; transition: color .3s; }
.entry:hover .entry-main h2 { color: var(--accent-glow); }
.entry-main p { font-size: 1.05rem; line-height: 1.7; color: rgba(208,196,224,.7); }
.entry-foot { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; margin-top: 1.1rem; }
.entry-read { font-family: 'Cinzel', serif; font-size: .66rem; letter-spacing: .14em; text-transform: uppercase;
  color: rgba(208,196,224,.45); margin-left: auto; }
.empty { text-align: center; font-style: italic; color: rgba(208,196,224,.5); padding: 3rem 0 6rem; }
@media (max-width: 640px) {
  .entry { flex-direction: column; gap: 1.1rem; padding: 1.7rem 1.4rem; }
  .entry-side { width: auto; display: flex; align-items: baseline; gap: .9rem; text-align: left; }
  .entry-date { margin-top: 0; }
  .nav-links { display: none; }
}
</style>
</head>
<body>
<div class="grain"></div>
${nav('devlog')}

<header class="dl-hero">
  <div class="eyebrow">From the Workshop</div>
  <h1 class="display">The Devlog</h1>
  <p>Field notes from building a voice-first RPG: local AI, voice pipelines, Unreal Engine, and the occasional frog.</p>
  <div class="rune-row" style="max-width:340px;margin:2.2rem auto 0;"><span class="rune-line l"></span><span class="rune-diamond"></span><span class="rune-line r"></span></div>
</header>

<main class="entries">
${posts.length ? cards : '<p class="empty">The first entry is still being inscribed…</p>'}
</main>

${FOOTER}

<script>
${SHARED_JS}
</script>
</body>
</html>
`;
}

/* ── rss ─────────────────────────────────────────────────────────────── */

function renderFeed(posts) {
  const items = posts.slice(0, 20).map(p => `  <item>
    <title>${esc(p.title)}</title>
    <link>${SITE}/devlog/${p.slug}/</link>
    <guid isPermaLink="true">${SITE}/devlog/${p.slug}/</guid>
    <pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate>
    <description>${esc(p.description)}</description>
  </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Eruin Devlog</title>
  <link>${SITE}/devlog/</link>
  <atom:link href="${SITE}/devlog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Tech devlogs from the making of Eruin, a voice-first fantasy mystery RPG powered by local AI.</description>
  <language>en</language>
${items}
</channel>
</rss>
`;
}

/* ── sitemap ─────────────────────────────────────────────────────────── */

function updateSitemap(posts) {
  const file = path.join(ROOT, 'sitemap.xml');
  let keep = [];
  if (fs.existsSync(file)) {
    const xml = fs.readFileSync(file, 'utf8');
    keep = (xml.match(/<url>[\s\S]*?<\/url>/g) || []).filter(u => !u.includes('/devlog'));
  }
  const newest = posts.length ? posts[0].date : new Date().toISOString().slice(0, 10);
  const devlogUrls = [
    `  <url>\n    <loc>${SITE}/devlog/</loc>\n    <lastmod>${newest}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ...posts.map(p => `  <url>\n    <loc>${SITE}/devlog/${p.slug}/</loc>\n    <lastmod>${p.date}</lastmod>\n    <priority>0.6</priority>\n  </url>`)
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...keep.map(u => '  ' + u), ...devlogUrls].join('\n')}\n</urlset>\n`;
  fs.writeFileSync(file, xml);
}

/* ── main ────────────────────────────────────────────────────────────── */

function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.error('No devlog/posts directory found.');
    process.exit(1);
  }

  const posts = fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(parsePost)
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.file < b.file ? -1 : 1);

  posts.forEach((p, i) => { p.entryNum = i + 1; }); // oldest = Entry I
  posts.reverse(); // newest first for listing/feed

  const slugs = new Set(posts.map(p => p.slug));
  if (slugs.size !== posts.length) throw new Error('Duplicate slugs detected — set a unique "slug" in frontmatter.');

  // remove generated dirs for deleted posts (only dirs containing exactly index.html)
  for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'posts' || slugs.has(entry.name)) continue;
    const dir = path.join(OUT_DIR, entry.name);
    const contents = fs.readdirSync(dir);
    if (contents.length === 1 && contents[0] === 'index.html') {
      fs.rmSync(dir, { recursive: true });
      console.log(`removed stale /devlog/${entry.name}/`);
    }
  }

  posts.forEach((p, i) => {
    const dir = path.join(OUT_DIR, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderPost(p, i, posts));
    console.log(`built /devlog/${p.slug}/  (Entry ${roman(p.entryNum)})`);
  });

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndex(posts));
  fs.writeFileSync(path.join(OUT_DIR, 'feed.xml'), renderFeed(posts));
  updateSitemap(posts);
  console.log(`built /devlog/ index, feed.xml, sitemap.xml — ${posts.length} post(s).`);
}

main();
