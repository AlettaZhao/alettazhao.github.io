// Reads a CV (PDF) or a homepage and guesses the card fields from it.
// Everything is a best guess: the maker shows the result for the person to fix.
window.TCImport = (() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

  // ---------- shared guessing ----------
  const ROLE = /\b(Ph\.?\s?D\.?\s+(?:candidate|student|researcher)|Doctoral\s+(?:candidate|student|researcher)|Post-?doc(?:toral)?(?:\s+(?:researcher|fellow|scholar))?|(?:Assistant|Associate|Full|Adjunct|Visiting)\s+Professor|Professor|Lecturer|Senior\s+Lecturer|Research\s+(?:scientist|fellow|associate|assistant|engineer)|Research(?:er)?\s+Scientist|Master'?s\s+student|M\.?Sc\.?\s+student|Undergraduate\s+(?:student|researcher)|Researcher|Designer|Engineer)\b/i;
  const ORG_WORD = '(?:University|Universit[àa]|Universit[äa]t|Universit[ée]|Universidad|Universidade|Universiteit|Uniwersytet|Institute|Institut|Instituto|Istituto|Politecnico|Polytechnic|College|Academy|Hochschule|École|Ecole|Laboratory|Lab|Research\\s+Cent(?:er|re))';
  // Words of an organisation name must sit on one line, and stop at a full stop.
  const ORG = new RegExp(`((?:[A-Z][\\w'’&-]*[ \\t]+){0,4}${ORG_WORD}(?:[ \\t]+(?:of|di|de|des|du|der|für|for|del|della|degli|at|in)[ \\t]+(?:[A-Z][\\w'’&-]*)(?:[ \\t]+[A-Z][\\w'’&-]*){0,3})?)`);
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const ORCID = /\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/;
  const SKIP_HOST = /(^|\.)(doi\.org|ieeexplore\.ieee\.org|dl\.acm\.org|acm\.org|springer\.com|link\.springer\.com|arxiv\.org|sciencedirect\.com|researchgate\.net|wikipedia\.org|google\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|facebook\.com|instagram\.com|bit\.ly|creativecommons\.org)$/i;

  function niceCase(s) {
    // "JANE DOE" → "Jane Doe"; leaves mixed-case and CJK alone.
    return s === s.toUpperCase() && /[A-Z]/.test(s)
      ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s;
  }
  function looksLikeName(s) {
    s = (s || '').trim();
    if (!s || s.length > 48 || /[\d@|/:]/.test(s)) return false;
    if (/curriculum|vitae|resume|résumé|homepage|home page|portfolio|welcome|about|publications/i.test(s)) return false;
    if (/^[\p{Script=Han}\s·]{2,8}$/u.test(s)) return true;
    const words = s.split(/\s+/);
    return words.length >= 2 && words.length <= 5 && words.every(w => /^[\p{Lu}][\p{L}'’.-]*$/u.test(w) || /^(van|von|de|da|di|del|der|le|la)$/i.test(w));
  }
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();

  function classify(url, out) {
    if (/^mailto:/i.test(url)) { out.email = out.email || decodeURIComponent(url.slice(7).split('?')[0]); return; }
    let u;
    try { u = new URL(/^https?:/i.test(url) ? url : 'https://' + url); } catch (e) { return; }
    const h = u.hostname.replace(/^www\./, '');
    const href = u.href.replace(/[.,;)]+$/, '');
    if (/linkedin\.com$/.test(h) && /\/in\//.test(u.pathname)) out.linkedin = out.linkedin || href;
    else if (/scholar\.google\./.test(h)) out.scholar = out.scholar || href;
    else if (/orcid\.org$/.test(h)) out.orcid = out.orcid || href;
    else if (h === 'github.com' && u.pathname.split('/').filter(Boolean).length === 1) out.github = out.github || href;
    else if (/\.pdf$/i.test(u.pathname) && /cv|resume|vitae/i.test(u.pathname)) out.cv = out.cv || href;
    else if (!SKIP_HOST.test(h) && !/\.(pdf|png|jpe?g|gif|zip|mp4)$/i.test(u.pathname)) (out._sites = out._sites || []).push(href);
  }

  function guessFromText(text, out) {
    if (!out.email) { const m = text.match(EMAIL); if (m) out.email = m[0]; }
    if (!out.orcid) { const m = text.match(ORCID); if (m) out.orcid = 'https://orcid.org/' + m[1]; }
    if (!out.role) { const m = text.match(ROLE); if (m) out.role = niceCase(clean(m[1])).replace(/^(\w)/, c => c.toUpperCase()); }
    if (!out.affiliation) { const m = text.match(ORG); if (m) out.affiliation = clean(m[1]).replace(/^(?:at|the)\s+/i, '').slice(0, 80); }
    const urls = text.match(/\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b(?:linkedin\.com\/in|github\.com|orcid\.org|scholar\.google\.[a-z.]+)\/[^\s<>"')\]]+/gi) || [];
    urls.forEach(x => classify(x.replace(/^www\./i, 'https://www.'), out));
  }

  function finish(out) {
    if (!out.website && out._sites && out._sites.length) out.website = out._sites[0];
    delete out._sites;
    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return out;
  }

  // ---------- PDF ----------
  let pdfReady = null;
  function loadPdfJs() {
    if (pdfReady) return pdfReady;
    pdfReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js'; s.onerror = () => rej(new Error('pdf_lib'));
      s.onload = async () => {
        try {
          // Workers can't load cross-origin scripts directly; wrap it in a same-origin blob.
          const code = await (await fetch(PDFJS + 'pdf.worker.min.js')).text();
          const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
          window.pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(url);
        } catch (e) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; }
        res(window.pdfjsLib);
      };
      document.head.appendChild(s);
    });
    return pdfReady;
  }

  async function fromPdf(file) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = {};
    let text = '', biggest = { size: 0, str: '' };
    for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      // Rebuild lines by vertical position so phrases aren't split mid-way.
      const lines = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const size = Math.hypot(it.transform[2], it.transform[3]);
        const y = Math.round(it.transform[5]);
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push({ x: it.transform[4], s: it.str, size });
      }
      const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]);
      for (const [, items] of sorted) {
        items.sort((a, b) => a.x - b.x);
        const line = clean(items.map(i => i.s).join(' '));
        text += line + '\n';
        if (p === 1) {
          const size = Math.max(...items.map(i => i.size));
          if (size > biggest.size + .5 && looksLikeName(niceCase(line))) biggest = { size, str: line };
        }
      }
      for (const a of await page.getAnnotations()) {
        if (a.url) classify(a.url, out);
        else if (a.unsafeUrl && /^mailto:/i.test(a.unsafeUrl)) out.email = out.email || a.unsafeUrl.slice(7).split('?')[0];
      }
    }
    if (biggest.str) out.name = niceCase(biggest.str);
    else {
      const first = text.split('\n').map(clean).find(looksLikeName);
      if (first) out.name = niceCase(first);
    }
    // A Chinese/Japanese/Korean name next to the Latin one (common on CVs).
    const cjk = text.slice(0, 400).match(/[\p{Script=Han}]{2,4}/u);
    if (cjk && out.name && !/\p{Script=Han}/u.test(out.name)) out.altName = cjk[0];
    guessFromText(text.slice(0, 4000), out);
    return finish(out);
  }

  // ---------- homepage ----------
  async function fetchHtml(url, rpcFetch) {
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (r.ok) return await r.text();
    } catch (e) {}
    // Most university sites don't allow direct reads from a browser; ask the database to fetch it.
    if (rpcFetch) return await rpcFetch(url);
    throw new Error('blocked');
  }

  async function fromUrl(url, rpcFetch) {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const html = await fetchHtml(url, rpcFetch);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const meta = n => doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.getAttribute('content') || '';
    const abs = h => { try { return new URL(h, url).href; } catch (e) { return ''; } };
    const out = { website: url };

    const cands = [meta('og:site_name'), meta('author'), ...(doc.title || '').split(/\s[|–—·:-]\s/), meta('og:title'),
      ...[...doc.querySelectorAll('h1, h2')].slice(0, 4).map(h => h.textContent)].map(clean);
    const name = cands.find(looksLikeName);
    if (name) out.name = niceCase(name);

    const desc = clean(meta('og:description') || meta('description'));
    if (desc && desc.length > 20 && !/^welcome/i.test(desc)) {
      const first = desc.match(/^.{20,220}?[.!?](\s|$)/);
      out.bio = (first ? first[0] : desc.slice(0, 217) + (desc.length > 217 ? '…' : '')).trim();
    }

    const img = meta('og:image') || [...doc.querySelectorAll('img')].map(i => i.getAttribute('src') || '')
      .find(s => /avatar|profile|headshot|portrait|photo|\bme\b/i.test(s)) || '';
    if (img && /^https:/i.test(abs(img))) out.photo = abs(img);

    for (const a of doc.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (/^mailto:/i.test(h)) { out.email = out.email || decodeURIComponent(h.slice(7).split('?')[0]); continue; }
      const full = abs(h);
      if (!/^https?:/i.test(full)) continue;
      const label = clean(a.textContent).toLowerCase();
      if (!out.cv && (/^(cv|resume|résumé|curriculum vitae)$/.test(label) || /(cv|resume|vitae)[^/]*\.pdf$/i.test(full))) { out.cv = full; continue; }
      if (new URL(full).host !== new URL(url).host) classify(full, out);
    }
    delete out._sites; // other sites linked from a homepage are rarely "the" homepage
    doc.querySelectorAll('script, style, nav, footer').forEach(n => n.remove());
    const parts = [], walk = doc.body ? doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT) : null;
    while (walk && walk.nextNode()) { const t = clean(walk.currentNode.nodeValue); if (t) parts.push(t); }
    guessFromText(parts.join('\n').slice(0, 6000), out);
    out.website = url;
    return finish(out);
  }

  return { fromPdf, fromUrl, looksLikeName };
})();
