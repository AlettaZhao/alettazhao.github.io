// Tap Card shared library: storage, QR drawing, vCard, card rendering.
// Needs config.js and qrcode-generator loaded first. Talks to Supabase over plain
// fetch (no client library), so the card a stranger scans loads as fast as possible.
window.TC = (() => {
  const cfg = window.TAPCARD_CONFIG || {};
  const live = !!(cfg.supabaseUrl && cfg.supabaseKey);
  const bucket = cfg.bucket || 'tapcard';
  const BASE = new URL('./', document.currentScript.src).href;

  const ACCENTS = [
    { name: 'Vermilion', hex: '#d9542b' },
    { name: 'Cobalt', hex: '#2f63d6' },
    { name: 'Moss', hex: '#2e7d4f' },
    { name: 'Violet', hex: '#7a4fd0' },
    { name: 'Raspberry', hex: '#c2185b' },
    { name: 'Ink', hex: '#1b1a17' }
  ];

  // Short links: …/t/?alex for the card, …/t/qr.html?alex for the scan page.
  const cardUrl = slug => `${BASE}?${slug}`;
  const qrUrl = slug => `${BASE}qr.html?${slug}`;
  const RESERVED = ['edit', 'u', 'via', 'new', 'qr'];
  const slugOk = s => /^[a-z0-9][a-z0-9-]{1,31}$/.test(s) && !RESERVED.includes(s);
  // Reads the slug from ?alex, ?alex&via=tap, or the older ?u=alex.
  function slugFromQuery(search) {
    const P = new URLSearchParams(search);
    if (P.get('u')) return P.get('u').toLowerCase();
    for (const [k, v] of P) if (v === '' && !RESERVED.includes(k.toLowerCase())) return k.toLowerCase();
    return '';
  }
  const slugify = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

  // ---------- storage ----------
  const API = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const HDR = { apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey };
  async function api(path, opts = {}) {
    let res;
    try { res = await fetch(API + path, Object.assign({}, opts, { headers: Object.assign({}, HDR, opts.headers) })); }
    catch (e) { fail('network'); }
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) fail(body || res.statusText);
    return body;
  }
  const rpc = (name, args) => api('/rest/v1/rpc/' + name, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args)
  });

  // Last-seen copy of each card, so the scan page still opens with no signal.
  const CACHE = 'tapcard-cache-';
  const cached = slug => { try { return JSON.parse(localStorage.getItem(CACHE + slug)); } catch (e) { return null; } };
  const remember = (slug, d) => { try { d ? localStorage.setItem(CACHE + slug, JSON.stringify(d)) : localStorage.removeItem(CACHE + slug); } catch (e) {} };

  const DEMO_KEY = 'tapcard-demo';
  const demoRead = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch (e) { return {}; } };
  const demoWrite = all => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(all)); } catch (e) { throw new Error('storage_full'); } };
  const demoToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

  function errCode(e) {
    const m = (e && typeof e === 'object' ? (e.message || e.error_description || e.error || e.code) : e) || '';
    for (const c of ['bad_invite', 'slug_taken', 'bad_token', 'storage_full']) if (m.includes(c)) return c;
    if (/cards_slug_check/.test(m)) return 'bad_slug';
    if (/size|too large|exceeded|413/i.test(m)) return 'too_large';
    if (/mime|type/i.test(m)) return 'bad_type';
    return 'network';
  }
  const fail = e => { const err = new Error(errCode(e)); err.detail = e; throw err; };

  async function getCard(slug) {
    if (!live) { const c = demoRead()[slug]; return c ? c.data : null; }
    const rows = await api('/rest/v1/cards?select=data&slug=eq.' + encodeURIComponent(slug));
    const d = rows && rows[0] ? rows[0].data : null;
    remember(slug, d);
    return d;
  }

  async function upload(slug, blob, ext, contentType) {
    if (!live) return new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
    });
    const path = `${slug}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await api(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { 'Content-Type': contentType }, body: blob });
    return `${API}/storage/v1/object/public/${bucket}/${path}`;
  }

  // Optional add-on functions (import.sql). Missing ones resolve to null instead of failing.
  async function checkInvite(invite) {
    if (!live) return true;
    try { return await rpc('check_invite', { p_invite: invite }); }
    catch (e) { return null; } // add-on not installed (or offline): we'll find out at publish time
  }
  async function fetchPage(url, invite) {
    if (!live) throw new Error('blocked');
    return await rpc('fetch_page', { p_url: url, p_invite: invite });
  }

  async function createCard(slug, invite, data) {
    if (!live) {
      const all = demoRead();
      if (all[slug]) fail('slug_taken');
      const token = demoToken(); all[slug] = { data, token }; demoWrite(all); return token;
    }
    return await rpc('create_card', { p_slug: slug, p_invite: invite, p_data: data });
  }

  async function updateCard(slug, token, data) {
    if (!live) {
      const all = demoRead();
      if (!all[slug] || all[slug].token !== token) fail('bad_token');
      all[slug].data = data; demoWrite(all); return true;
    }
    await rpc('update_card', { p_slug: slug, p_token: token, p_data: data });
    remember(slug, data);
    return true;
  }

  async function deleteCard(slug, token) {
    if (!live) {
      const all = demoRead();
      if (!all[slug] || all[slug].token !== token) fail('bad_token');
      delete all[slug]; demoWrite(all); return true;
    }
    await rpc('delete_card', { p_slug: slug, p_token: token });
    remember(slug, null);
    return true;
  }

  // ---------- safety helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function href(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^blob:/i.test(u)) return u; // local, same-origin previews only
    if (!live && /^data:(image|application\/pdf|text\/vcard)/i.test(u)) return u;
    if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(u)) return 'https://' + u;
    return '';
  }
  const hexOk = h => /^#[0-9a-f]{6}$/i.test(h || '') ? h : ACCENTS[0].hex;
  const prettyHost = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };

  // ---------- vCard ----------
  function vcard(d) {
    const v = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
    const parts = (d.name || '').trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    const lines = ['BEGIN:VCARD', 'VERSION:3.0',
      `N:${v(last)};${v(parts.join(' '))};;;`,
      `FN:${v(d.name)}${d.altName ? ' (' + v(d.altName) + ')' : ''}`];
    if (d.affiliation) lines.push(`ORG:${v(d.affiliation)}`);
    if (d.role) lines.push(`TITLE:${v(d.role)}`);
    if (d.email) lines.push(`EMAIL;TYPE=INTERNET:${v(d.email)}`);
    const site = href(d.website); if (site) lines.push(`URL:${site}`);
    const li = href(d.linkedin); if (li) lines.push(`URL;TYPE=LinkedIn:${li}`);
    if (d.event) lines.push(`NOTE:Met at ${v(d.event)}.`);
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  }

  // ---------- QR ----------
  const INK = '#1b1a17';
  function qrMatrix(url) {
    const q = qrcode(0, 'H'); q.addData(url); q.make();
    const n = q.getModuleCount();
    const hole = (Math.round(n * 0.26) | 1);
    const h0 = (n - hole) / 2, h1 = h0 + hole;
    const eye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c) || eye(r, c)) continue;
      if (r >= h0 - .5 && r < h1 + .5 && c >= h0 - .5 && c < h1 + .5) continue;
      cells.push([r, c]);
    }
    return { n, hole, cells };
  }

  let svgId = 0;
  // Rounded-dot QR with soft eyes and the photo in the middle (level H keeps it scannable).
  function qrSvg(url, photo, accent) {
    const { n, hole, cells } = qrMatrix(url);
    const id = 'av' + (++svgId);
    const dots = cells.map(([r, c]) => `<rect x="${c + .06}" y="${r + .06}" width=".88" height=".88" rx=".32"/>`).join('');
    const eye = (x, y) =>
      `<rect x="${x + .5}" y="${y + .5}" width="6" height="6" rx="1.9" fill="none" stroke="${INK}" stroke-width="1"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".9" fill="${INK}"/>`;
    const cx = n / 2, rad = hole / 2;
    const p = href(photo);
    const centre = p
      ? `<circle cx="${cx}" cy="${cx}" r="${rad}" fill="#fff"/>
         <image href="${esc(p)}" x="${cx - rad}" y="${cx - rad}" width="${hole}" height="${hole}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
         <circle cx="${cx}" cy="${cx}" r="${rad - .7}" fill="none" stroke="${hexOk(accent)}" stroke-width=".35"/>`
      : `<circle cx="${cx}" cy="${cx}" r="${rad * .38}" fill="${hexOk(accent)}"/>`;
    return `<svg viewBox="0 0 ${n} ${n}" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="${id}"><circle cx="${cx}" cy="${cx}" r="${rad - .7}"/></clipPath></defs>
      <g fill="${INK}">${dots}</g>${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}${centre}</svg>`;
  }

  function loadImg(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
    });
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  // Same QR, painted onto a canvas (for PNG downloads).
  async function qrToCanvas(ctx, x, y, size, url, photo, accent) {
    const { n, hole, cells } = qrMatrix(url);
    const m = size / n;
    ctx.fillStyle = INK;
    for (const [r, c] of cells) { rr(ctx, x + (c + .06) * m, y + (r + .06) * m, .88 * m, .88 * m, .32 * m); ctx.fill(); }
    for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      ctx.lineWidth = m; ctx.strokeStyle = INK;
      rr(ctx, x + (ex + .5) * m, y + (ey + .5) * m, 6 * m, 6 * m, 1.9 * m); ctx.stroke();
      rr(ctx, x + (ex + 2) * m, y + (ey + 2) * m, 3 * m, 3 * m, .9 * m); ctx.fill();
    }
    const cx = x + size / 2, cy = y + size / 2, rad = hole / 2 * m;
    const img = await loadImg(href(photo));
    if (img) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rad - .7 * m, 0, 7); ctx.clip();
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, cx - rad, cy - rad, rad * 2, rad * 2);
      ctx.restore();
      ctx.strokeStyle = hexOk(accent); ctx.lineWidth = .35 * m;
      ctx.beginPath(); ctx.arc(cx, cy, rad - .7 * m, 0, 7); ctx.stroke();
    } else {
      ctx.fillStyle = hexOk(accent); ctx.beginPath(); ctx.arc(cx, cy, rad * .38, 0, 7); ctx.fill();
    }
  }

  async function qrPng(url, photo, accent) {
    const size = 1000, pad = 70, c = document.createElement('canvas');
    c.width = c.height = size + pad * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await qrToCanvas(ctx, pad, pad, size, url, photo, accent);
    return c;
  }

  async function wallpaper(d, slug) {
    const W = 1170, H = 2532, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    try { await document.fonts.ready; } catch (e) {}
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, W, H);
    const side = 740, pad = 56, top = 880, x = (W - side) / 2;
    ctx.fillStyle = '#fff'; rr(ctx, x - pad, top - pad, side + pad * 2, side + pad * 2, 64); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
    await qrToCanvas(ctx, x, top, side, cardUrl(slug), d.photo, d.accent);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    let y = top + side + pad + 150;
    const fit = (text, font, size, max) => { let s = size; do { ctx.font = font.replace('#', s); s -= 4; } while (ctx.measureText(text).width > max && s > 30); };
    ctx.fillStyle = INK; fit(d.name || '', '600 #px Fraunces, Georgia, serif', 100, W - 140); ctx.fillText(d.name || '', W / 2, y);
    ctx.fillStyle = '#6b675e';
    if (d.altName) { y += 80; ctx.font = '500 46px Inter, "Microsoft YaHei", "PingFang SC", sans-serif'; ctx.fillText(d.altName, W / 2, y); }
    const line = [d.role, d.affiliation].filter(Boolean).join(' · ');
    if (line) { y += 76; fit(line, '400 #px Inter, system-ui, sans-serif', 42, W - 140); ctx.fillText(line, W / 2, y); }
    y += 110; ctx.fillStyle = hexOk(d.accent); ctx.font = '600 38px Inter, system-ui, sans-serif';
    const tag = ('Scan to connect' + (d.event ? ' · ' + d.event : '')).toUpperCase();
    ctx.letterSpacing = '4px'; ctx.fillText(tag, W / 2, y);
    return c;
  }

  function saveCanvas(canvas, filename) {
    canvas.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  // ---------- card rendering ----------
  const ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

  // Returns HTML for the card. `opts.via` = 'tap' | 'scan' | null (no footer), `opts.animate`.
  function cardHtml(d, opts = {}) {
    const a = opts.animate ? ' reveal' : '';
    let t = .3; const delay = () => opts.animate ? ` style="animation-delay:${(t += .1).toFixed(2)}s"` : '';
    const site = href(d.website), cv = href(d.cv), vcf = href(d.vcf), photo = href(d.photo);
    const f = d.featured || {};
    const fl = href(f.link);
    const initials = (d.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const links = [
      d.email && ['Email', 'mailto:' + d.email.trim()],
      href(d.linkedin) && ['LinkedIn', href(d.linkedin)],
      href(d.scholar) && ['Google Scholar', href(d.scholar)],
      href(d.orcid) && ['ORCID', href(d.orcid)],
      href(d.github) && ['GitHub', href(d.github)]
    ].filter(Boolean);
    return `
    ${d.event ? `<p class="tc-hello${a}"${delay()}>Nice to meet you · ${esc(d.event)}</p>` : ''}
    <div class="tc-id${a}"${delay()}>
      ${photo ? `<img src="${esc(photo)}" alt="">` : `<div class="tc-initials">${esc(initials)}</div>`}
      <div>
        <h1>${esc(d.name || 'Your name')}${d.altName ? `<span class="tc-alt">${esc(d.altName)}</span>` : ''}</h1>
        <p class="tc-role">${esc([d.role, d.affiliation].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    ${d.bio ? `<p class="tc-lede${a}"${delay()}>${esc(d.bio)}</p>` : ''}
    <div class="tc-primary${a}"${delay()}>
      ${vcf || opts.preview ? `<a class="tc-btn main" href="${esc(vcf || '#')}" download="${esc(slugify(d.name || 'contact') || 'contact')}.vcf"><span>Save my contact<small>Adds me to your phone</small></span>${icon('plus')}</a>` : ''}
      ${cv ? `<a class="tc-btn" href="${esc(cv)}" target="_blank" rel="noopener"><span>CV<small>PDF</small></span>${icon('doc')}</a>` : ''}
      ${site ? `<a class="tc-btn" href="${esc(site)}" target="_blank" rel="noopener"><span>Homepage<small>${esc(prettyHost(site))}</small></span>${icon('arrow')}</a>` : ''}
    </div>
    ${f.title ? `<section class="tc-feature${a}"${delay()}>
      <p class="tc-tag">${esc(f.label || 'Featured')}</p>
      <h2>${esc(f.title)}</h2>
      ${f.meta ? `<p>${esc(f.meta)}</p>` : ''}
      ${fl ? `<a href="${esc(fl)}" target="_blank" rel="noopener">${esc(f.linkLabel || 'Take a look')} →</a>` : ''}
    </section>` : ''}
    ${links.length ? `<nav class="tc-links${a}"${delay()}>${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${l}</a>`).join('')}</nav>` : ''}
    ${opts.via ? `<p class="tc-foot${a}"${delay()}>${opts.via === 'tap' ? 'You got here by tapping my phone.' : 'You got here by scanning my code.'} Hi 👋</p>` : ''}`;
  }

  function applyAccent(el, accent) { el.style.setProperty('--accent', hexOk(accent)); }

  return {
    live, BASE, ACCENTS, cardUrl, qrUrl, slugOk, slugify, slugFromQuery,
    getCard, cached, upload, checkInvite, fetchPage, createCard, updateCard, deleteCard,
    esc, href, hexOk, vcard, qrSvg, qrPng, wallpaper, saveCanvas, cardHtml, applyAccent
  };
})();
