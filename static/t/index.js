(() => {
  // Conferences offered as one-tap choices. Edit freely: label is what shows on the card.
  const EVENTS = ['ISMAR 2026 · Bari', 'VRST 2026', 'SIGGRAPH Asia 2026', 'IEEE VR 2027', 'CHI 2027'];

  // Shown in the preview until the person has entered anything. Fictional on purpose.
  const EXAMPLE = {
    name: 'Alex Morgan', role: 'PhD candidate', affiliation: 'Example University',
    bio: 'Designing touch feedback for people sharing the same mixed-reality space.',
    website: 'https://example.org', email: 'alex@example.org', scholar: 'https://scholar.google.com', orcid: 'https://orcid.org',
    cv: 'https://example.org/cv.pdf', accent: '#d9542b',
    featured: { label: 'At the conference', title: 'Touch at a distance: shared haptics for co-located MR', meta: 'Morgan, Lee & Okafor · Poster session B', link: 'https://example.org', linkLabel: 'Read the paper' }
  };

  const P = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const show = id => ['viewCard', 'viewMaker', 'viewDone'].forEach(v => $(v).hidden = v !== id);
  const viewSlug = P.has('edit') ? '' : TC.slugFromQuery(location.search);

  // ================= card view =================
  if (viewSlug) {
    document.body.classList.add('view-card');
    show('viewCard');
    TC.getCard(viewSlug).then(d => {
      if (!d) { $('cardRoot').innerHTML = `<div class="notice"><h1>No card here</h1><p>Nobody has claimed “${TC.esc(viewSlug)}” yet.</p></div>`; return; }
      document.title = d.name ? `${d.name}${d.event ? ' · ' + d.event : ''}` : 'Tap Card';
      TC.applyAccent(document.documentElement, d.accent);
      $('ripple').innerHTML = '<span></span><span></span><span></span>';
      $('cardRoot').innerHTML = TC.cardHtml(d, { animate: true, via: P.get('via') === 'tap' ? 'tap' : 'scan' });
    }).catch(() => {
      $('cardRoot').innerHTML = `<div class="notice"><h1>Couldn't load this card</h1><p>Check your connection and try again.</p></div>`;
    });
    return;
  }

  // ================= maker / editor =================
  show('viewMaker');
  const form = $('form'), F = n => form.elements[n];
  const editSlug = (P.get('edit') || '').toLowerCase();
  const tokenKey = s => 'tapcard-token-' + s;
  let token = decodeURIComponent(location.hash.slice(1)) || '';
  if (editSlug && !token) { try { token = localStorage.getItem(tokenKey(editSlug)) || ''; } catch (e) {} }
  if (editSlug && location.hash) {
    // Opened from the edit link: keep the key on this device, drop it from the address bar.
    try { localStorage.setItem(tokenKey(editSlug), token); } catch (e) {}
    history.replaceState(null, '', `?edit=${encodeURIComponent(editSlug)}`);
  }

  $('demoBanner').hidden = TC.live;
  $('inviteField').hidden = !TC.live;
  $('slugPrefix').textContent = TC.cardUrl('').replace(/^https?:\/\//, '');

  // state that isn't a plain input
  const state = { accent: TC.ACCENTS[0].hex, photo: '', photoBlob: null, cv: '', cvFile: null, drafted: false, inviteOk: false };

  // ---- step switching
  function toDraft() {
    $('start').hidden = true; form.hidden = false;
    // The invite field moves into the form; once the code is confirmed it stays out of the way.
    if (TC.live && !editSlug) { $('linkSet').appendChild($('inviteField')); $('inviteField').hidden = state.inviteOk; }
    state.drafted = true; render();
  }

  // ---- conference chips
  function syncEvents() {
    $('events').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === state.eventChoice));
    $('eventOther').hidden = state.eventChoice !== 'other';
  }
  [...EVENTS.map(e => [e, e]), ['Other…', 'other'], ['None', '']].forEach(([label, v]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.v = v;
    b.onclick = () => { state.eventChoice = v; syncEvents(); if (v === 'other') $('eventOther').focus(); render(); };
    $('events').appendChild(b);
  });
  state.eventChoice = EVENTS[0];
  const chosenEvent = () => state.eventChoice === 'other' ? $('eventOther').value.trim() : state.eventChoice;
  $('eventOther').addEventListener('input', render);

  // ---- big CV drop (step 1)
  const touch = matchMedia('(hover: none)').matches;
  function showBigCv() {
    const f = state.cvFile;
    $('cvBig').classList.toggle('has', !!f);
    $('cvBigLabel').textContent = f ? f.name : (touch ? 'Choose your CV' : 'Drop your CV here');
    $('cvBigSmall').textContent = f ? `${(f.size / 1048576).toFixed(1)} MB · ready` : 'PDF · we read your name, role, email and links from it';
    $('cvBigClear').hidden = !f;
  }
  function takeCv(f) {
    if (!f) return false;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { setGen('Your CV needs to be a PDF.', true); return false; }
    if (f.size > 5 * 1048576) { setGen('That PDF is over 5 MB. Try exporting a smaller one.', true); return false; }
    state.cvFile = f; state.cv = ''; setGen(''); showBigCv(); showCv(); render();
    return true;
  }
  $('cvBigFile').addEventListener('change', e => { takeCv(e.target.files[0]); e.target.value = ''; });
  // A file dropped outside the drop zones would make the browser open it and leave the page.
  window.addEventListener('dragover', e => { if (!e.target.closest || !e.target.closest('.drop, .bigdrop')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (e.target.closest && e.target.closest('.drop, .bigdrop')) return;
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && !$('start').hidden) takeCv(f);
  });
  $('cvBigClear').onclick = e => { e.preventDefault(); state.cvFile = null; showBigCv(); showCv(); render(); };
  function setGen(t, bad) { $('genStatus').textContent = t; $('genStatus').className = 'status' + (bad ? ' bad' : ''); }

  // ---- colour swatches
  TC.ACCENTS.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button'; b.title = a.name; b.setAttribute('aria-label', a.name); b.style.background = a.hex; b.dataset.hex = a.hex;
    b.onclick = () => { state.accent = a.hex; syncSwatches(); render(); };
    $('swatches').appendChild(b);
  });
  const syncSwatches = () => $('swatches').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.hex === state.accent));

  // ---- photo: crop to a square and shrink before upload
  async function squarePhoto(file) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(img.width, img.height), out = 600;
    const c = document.createElement('canvas'); c.width = c.height = out;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, out, out);
    URL.revokeObjectURL(url);
    return new Promise(res => c.toBlob(res, 'image/jpeg', .86));
  }
  function showPhoto() {
    const src = state.photoBlob ? URL.createObjectURL(state.photoBlob) : state.photo;
    const has = !!src;
    $('photoThumb').innerHTML = has ? `<img src="${TC.esc(src)}" alt="">` : $('photoThumb').dataset.empty;
    $('photoLabel').textContent = has ? 'Photo added' : 'Add a photo';
    $('photoSmall').textContent = has ? 'Tap to replace' : 'It also goes in the middle of your QR code';
    $('photoClear').hidden = !has;
    state.previewPhoto = src;
  }
  let photoPending = null;
  $('photoThumb').dataset.empty = $('photoThumb').innerHTML;
  F('photoFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!f.type.startsWith('image/')) return setStatus('That file isn’t an image.', true);
    photoPending = squarePhoto(f);
    try { state.photoBlob = await photoPending; showPhoto(); render(); setStatus(''); }
    catch (err) { setStatus('Couldn’t read that image. Try a JPG or PNG.', true); }
    e.target.value = '';
  });
  $('photoClear').onclick = e => { e.preventDefault(); state.photoBlob = null; state.photo = ''; showPhoto(); render(); };

  function showCv() {
    const has = !!(state.cvFile || state.cv);
    $('cvLabel').textContent = state.cvFile ? state.cvFile.name : state.cv ? 'CV uploaded' : 'Upload your CV';
    $('cvSmall').textContent = state.cvFile ? `${(state.cvFile.size / 1048576).toFixed(1)} MB · PDF` : state.cv ? 'Tap to replace' : 'PDF, max 5 MB';
    $('cvClear').hidden = !has;
  }
  F('cvFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.type !== 'application/pdf') { setStatus('Your CV needs to be a PDF.', true); e.target.value = ''; return; }
    if (f.size > 5 * 1048576) { setStatus('That PDF is over 5 MB. Try exporting a smaller one.', true); e.target.value = ''; return; }
    state.cvFile = f; state.cv = ''; showCv(); showBigCv(); render(); setStatus('');
    e.target.value = '';
  });
  $('cvClear').onclick = e => { e.preventDefault(); state.cvFile = null; state.cv = ''; showCv(); showBigCv(); render(); };

  // drag-over styling
  document.querySelectorAll('.drop, .bigdrop').forEach(d => {
    d.addEventListener('dragover', () => d.classList.add('over'));
    ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, () => d.classList.remove('over')));
  });

  // ---- collect the card data from the form
  function collect() {
    const v = n => (F(n).value || '').trim();
    const d = {
      name: v('name'), altName: v('altName'), role: v('role'), affiliation: v('affiliation'),
      bio: v('bio'), event: v('event'), website: v('website'), email: v('email'),
      linkedin: v('linkedin'), scholar: v('scholar'), orcid: v('orcid'), github: v('github'),
      accent: state.accent, photo: state.photo, cv: state.cv || v('cvLink')
    };
    const f = { label: v('fLabel'), tab: v('fTab'), title: v('fTitle'), meta: v('fMeta'), link: v('fLink'), linkLabel: v('fLinkLabel') };
    if (f.title || f.link) d.featured = f;
    return d;
  }

  // ---- live preview: a fictional example until there's something real to show
  function render() {
    const d = collect();
    const example = !state.drafted && !editSlug;
    let pv;
    if (example) pv = Object.assign({}, EXAMPLE, { event: chosenEvent() });
    else {
      pv = Object.assign({}, d, { photo: state.previewPhoto || d.photo, cv: state.cvFile ? TC.BASE + '#cv' : d.cv });
      if (!pv.name) pv.name = 'Your name';
    }
    const html = TC.cardHtml(pv, { via: 'scan', preview: true });
    $('preview').innerHTML = html;
    $('previewScreen').classList.toggle('example', example);
    $('exBadge').hidden = !example;
    $('peek').textContent = example ? 'See an example card' : 'Preview my card';
    $('previewCap').textContent = example ? 'An example card. Yours appears here as you go.' : 'Live preview · what people see after scanning';
    if (!$('sheet').hidden) $('sheetCard').innerHTML = html;
    TC.applyAccent(document.documentElement, example ? EXAMPLE.accent : d.accent);
    const n = ['website', 'email', 'linkedin', 'scholar', 'orcid', 'github'].filter(k => d[k]).length;
    $('linksCount').textContent = n ? `${n} added` : 'optional';
  }
  form.addEventListener('input', e => { if (e.target.name === 'name' && !slugTouched && !editSlug) autoSlug(); render(); });
  $('peek').onclick = () => { $('sheet').hidden = false; render(); document.body.style.overflow = 'hidden'; };
  $('sheetClose').onclick = () => { $('sheet').hidden = true; document.body.style.overflow = ''; };

  // ---- link name (slug)
  let slugTouched = false, slugTimer = null, createdSlug = null;
  const slugBase = () => TC.slugify(F('name').value) || TC.slugify((F('email').value || '').split('@')[0]);
  function autoSlug() { F('slug').value = slugBase(); checkSlug(); }
  F('slug').addEventListener('input', () => {
    slugTouched = true;
    F('slug').value = F('slug').value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    checkSlug();
  });
  function slugMsg(t, cls) { $('slugState').textContent = t; $('slugState').className = 'slugstate ' + (cls || ''); }
  function checkSlug() {
    clearTimeout(slugTimer);
    const s = F('slug').value;
    if (!s) return slugMsg('');
    if (!TC.slugOk(s)) return slugMsg('2–32 characters: letters, numbers and dashes.', 'bad');
    slugMsg('Checking…');
    slugTimer = setTimeout(async () => {
      try {
        const taken = await TC.getCard(s);
        if (F('slug').value !== s) return;
        slugMsg(taken ? 'Taken, try another.' : 'Available ✓', taken ? 'bad' : 'ok');
      } catch (e) { slugMsg(''); }
    }, 350);
  }
  // First free link name based on the person's name: alex-morgan, alex-morgan-2, …
  async function freeSlug(base) {
    base = (base || '').slice(0, 28) || 'me';
    for (let i = 1; i < 30; i++) {
      const s = i === 1 ? base : `${base}-${i}`;
      if (!TC.slugOk(s)) continue;
      try { if (!(await TC.getCard(s))) return s; } catch (e) { return s; }
    }
    return base;
  }

  function setStatus(t, bad) { $('status').textContent = t; $('status').className = 'status' + (bad ? ' bad' : ''); }

  // Show an error right under the field it's about, and bring that field into view.
  function fieldError(target, msg) {
    const input = typeof target === 'string' ? (F(target) || $(target)) : target, label = input.closest('label.f');
    const det = input.closest('details'); if (det) det.open = true;
    input.setAttribute('aria-invalid', 'true');
    let p = label.querySelector('.err');
    if (!p) { p = document.createElement('span'); p.className = 'err'; p.setAttribute('role', 'alert'); label.appendChild(p); }
    p.textContent = msg;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
    label.classList.remove('nudge'); void label.offsetWidth; label.classList.add('nudge');
    setStatus('');
  }
  document.addEventListener('input', e => {
    if (e.target.getAttribute && e.target.getAttribute('aria-invalid')) {
      e.target.removeAttribute('aria-invalid');
      const p = e.target.closest('label.f')?.querySelector('.err'); if (p) p.remove();
    }
    const lab = e.target.closest && e.target.closest('label.f.auto');
    if (lab) { lab.classList.remove('auto'); lab.querySelector('.autotag')?.remove(); }
  });
  function busyBtn(btn, text, idle) {
    btn.disabled = !!text;
    btn.innerHTML = text ? `<span class="spin" aria-hidden="true"></span>${TC.esc(text)}` : idle;
  }
  const busy = text => busyBtn($('go'), text, editSlug ? 'Save changes' : 'Publish my card');
  const MSG = {
    bad_invite: 'That invite code isn’t right.', slug_taken: 'That link name was just taken. Pick another.',
    bad_slug: 'Link name: 2–32 lowercase letters, numbers and dashes.', bad_token: 'This edit link isn’t valid any more.',
    too_large: 'A file is too big (5 MB max).', bad_type: 'That file type isn’t allowed.',
    storage_full: 'This browser’s demo storage is full. Try a smaller photo.', network: 'Something went wrong. Check your connection and try again.'
  };

  // ================= generate (step 1 → 2) =================
  const FIELDS = ['name', 'altName', 'role', 'affiliation', 'bio', 'website', 'email', 'linkedin', 'scholar', 'orcid', 'github'];
  function markAuto(name) {
    const label = F(name).closest('label.f');
    if (label.classList.contains('auto')) return;
    label.classList.add('auto');
    const tag = document.createElement('span'); tag.className = 'autotag'; tag.textContent = 'auto-filled';
    tag.title = 'Filled in for you. Edit it if it’s wrong.';
    label.appendChild(tag);
  }

  async function startDraft(found, notes) {
    for (const k of FIELDS) if (found[k] && !F(k).value) { F(k).value = found[k]; markAuto(k); }
    if (found.cv && !state.cvFile && !F('cvLink').value) { F('cvLink').value = found.cv; markAuto('cvLink'); }
    if (found.photo && !state.photo && !state.photoBlob) { state.photo = found.photo; showPhoto(); }
    F('event').value = chosenEvent();
    if (['website', 'email', 'linkedin', 'scholar', 'orcid', 'github'].some(k => F(k).value)) $('linksDetails').open = true;
    if (!slugTouched) { F('slug').value = await freeSlug(slugBase()); checkSlug(); }

    const got = FIELDS.filter(k => found[k]).length + (found.photo ? 1 : 0);
    const missing = [];
    if (!F('name').value) missing.push('your name');
    if (!state.photo && !state.photoBlob) missing.push('a photo');
    if (!F('role').value) missing.push('your role');
    const note = $('draftNote');
    if (found._tried) {
      note.innerHTML = `<b>${got ? `Here's your draft. We filled in ${got} thing${got > 1 ? 's' : ''}.` : 'We couldn’t read much from that.'}</b>
        Check the preview, fix anything that's off${missing.length ? ', and add ' + missing.join(', ').replace(/, ([^,]*)$/, ' and $1') : ''}. Then publish.
        ${notes.length ? `<ul>${notes.map(n => `<li>${TC.esc(n)}</li>`).join('')}</ul>` : ''}
        <button type="button" class="linkbtn" id="redo">Start again with a different CV</button>`;
      note.hidden = false;
      $('redo').onclick = () => { try { localStorage.removeItem(DRAFT); } catch (e) {} location.href = TC.BASE; };
    }
    toDraft();
    saveDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('gen').onclick = async () => {
    const url = $('homeUrl').value.trim();
    if (!state.cvFile && !url) { setGen('Drop in your CV or paste your homepage first, or type it in yourself.', true); $('cvBig').classList.add('nudge'); setTimeout(() => $('cvBig').classList.remove('nudge'), 400); return; }
    if (url && !TC.href(url)) return fieldError($('homeUrl'), 'That doesn’t look like a web address.');
    if (state.eventChoice === 'other' && !$('eventOther').value.trim()) { $('eventOther').focus(); return setGen('Type the conference name, or pick None.', true); }
    const invite = $('invite').value.trim();
    if (TC.live && !invite) return fieldError($('invite'), 'Add the invite code.');
    const idle = 'Generate my card';
    setGen('');
    try {
      if (TC.live) {
        busyBtn($('gen'), 'Checking invite code…', idle);
        const ok = await TC.checkInvite(invite);
        if (ok === false) { busyBtn($('gen'), '', idle); return fieldError($('invite'), MSG.bad_invite); }
        state.inviteOk = ok === true;
      }
      const found = { _tried: true }, notes = [];
      if (state.cvFile) {
        busyBtn($('gen'), 'Reading your CV…', idle);
        try { Object.assign(found, await TCImport.fromPdf(state.cvFile)); }
        catch (e) { notes.push('We couldn’t read text from your CV (it may be a scanned image). It will still be attached.'); }
      }
      if (url) {
        busyBtn($('gen'), 'Reading your homepage…', idle);
        try {
          const h = await TCImport.fromUrl(TC.href(url), u => TC.fetchPage(u, invite));
          for (const k of Object.keys(h)) if (!found[k] || k === 'website') found[k] = h[k];
        } catch (e) {
          found.website = found.website || TC.href(url);
          notes.push('Your homepage didn’t let us read it, so we just added it as a link.');
        }
      }
      busyBtn($('gen'), '', idle);
      await startDraft(found, notes);
    } catch (e) {
      busyBtn($('gen'), '', idle);
      setGen(MSG[e.message] || MSG.network, true);
    }
  };
  $('manual').onclick = () => {
    F('event').value = chosenEvent();
    toDraft();
    F('name').focus();
  };

  // ================= publish =================
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const slug = editSlug || F('slug').value;
    const d = collect();
    if (!d.name) return fieldError('name', 'Add your name.');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return fieldError('email', 'That email doesn’t look right.');
    for (const k of ['cvLink', 'website', 'linkedin', 'scholar', 'orcid', 'github', 'fLink']) {
      const val = F(k).value.trim();
      if (val && !TC.href(val)) return fieldError(k, 'That doesn’t look like a web link. It should start with https://');
    }
    if (!editSlug && !TC.slugOk(slug)) return fieldError('slug', slug ? MSG.bad_slug : 'Pick a link name.');
    const invite = $('invite').value.trim();
    if (!editSlug && TC.live && !invite) { $('inviteField').hidden = false; return fieldError($('invite'), 'Add the invite code.'); }
    busy('Saving…');
    if (photoPending) { try { await photoPending; } catch (e) {} } // a big photo may still be resizing
    try {
      // New card: claim the link with the invite code first, so a wrong code uploads nothing.
      if (!editSlug && createdSlug !== slug) {
        if (await TC.getCard(slug)) throw new Error('slug_taken');
        busy('Checking invite code…');
        token = await TC.createCard(slug, invite, { name: d.name, accent: d.accent });
        createdSlug = slug;
        try { localStorage.setItem(tokenKey(slug), token); } catch (e) {}
      }
      if (!state.photoBlob && state.photo && TC.live && !state.photo.startsWith(TC.storageUrl)) {
        try { // only works if that site allows it; otherwise we keep linking to it
          const r = await fetch(state.photo, { mode: 'cors' });
          if (r.ok) state.photoBlob = await squarePhoto(await r.blob());
        } catch (e) {}
      }
      if (state.photoBlob) { busy('Uploading photo…'); d.photo = await TC.upload(slug, state.photoBlob, 'jpg', 'image/jpeg'); state.photo = d.photo; state.photoBlob = null; }
      if (state.cvFile) { busy('Uploading CV…'); d.cv = await TC.upload(slug, state.cvFile, 'pdf', 'application/pdf'); }
      busy('Saving…');
      d.vcf = await TC.upload(slug, new Blob([TC.vcard(d)], { type: 'text/vcard' }), 'vcf', 'text/vcard');
      await TC.updateCard(slug, token, d);
      try { localStorage.setItem(tokenKey(slug), token); localStorage.removeItem(DRAFT); } catch (e) {}
      setStatus('');
      done(slug, d);
    } catch (err) {
      const m = MSG[err.message] || MSG.network;
      if (err.message === 'bad_invite') { $('inviteField').hidden = false; fieldError($('invite'), m); }
      else if (err.message === 'slug_taken') { fieldError('slug', m); slugMsg(''); }
      else setStatus(m, true);
    } finally { busy(''); }
  });

  $('del').onclick = async () => {
    if (!confirm('Delete your card for good? Your link and QR code will stop working.')) return;
    try {
      await TC.deleteCard(editSlug, token);
      try { localStorage.removeItem(tokenKey(editSlug)); } catch (e) {}
      location.href = TC.BASE;
    } catch (err) { setStatus(MSG[err.message] || MSG.network, true); }
  };

  // ---- success screen
  function done(slug, d) {
    show('viewDone'); window.scrollTo(0, 0);
    const card = TC.cardUrl(slug), edit = `${TC.BASE}?edit=${encodeURIComponent(slug)}#${token}`;
    $('doneTitle').innerHTML = editSlug ? 'Card <em>updated.</em>' : 'Your card is <em>live.</em>';
    $('doneUrl').textContent = card;
    $('editUrl').textContent = edit;
    $('openCard').href = card;
    $('openQr').href = TC.qrUrl(slug);
    $('doneQr').innerHTML = TC.qrSvg(TC.qrUrl(slug), d.photo, d.accent);
    if (d.email) {
      const body = `My Tap Card\n\nCard (what people see): ${card}\nScan page (open on my phone): ${TC.qrUrl(slug)}\n\nEdit link (keep private, it's the only way to edit):\n${edit}\n`;
      $('mailMe').href = `mailto:${encodeURIComponent(d.email)}?subject=${encodeURIComponent('My Tap Card links')}&body=${encodeURIComponent(body)}`;
      $('mailMe').hidden = false;
    }
    $('dlQr').onclick = async () => TC.saveCanvas(await TC.qrPng(card, d.photo, d.accent), `${slug}-qr.png`);
    $('dlWall').onclick = async () => TC.saveCanvas(await TC.wallpaper(d, slug), `${slug}-lockscreen.png`);
    // This device keeps the key (localStorage); the address bar shouldn't, in case someone shares it.
    if (!editSlug || location.hash) history.replaceState(null, '', `?edit=${encodeURIComponent(slug)}`);
  }
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText($(b.dataset.copy).textContent); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1500); } catch (e) {}
  });

  // ---- edit mode: load the existing card
  async function loadForEdit() {
    $('heroTitle').innerHTML = 'Edit your <em>card.</em>';
    $('heroSub').textContent = 'Changes go live as soon as you save. Your link and QR code stay the same.';
    $('start').hidden = true; form.hidden = false;
    busy('');
    $('del').hidden = false;
    $('linkSet').hidden = true;
    const d = await TC.getCard(editSlug).catch(() => null);
    if (!d) { setStatus('Couldn’t find this card.', true); $('go').disabled = true; return; }
    if (!token) setStatus('This link is missing its edit key, so changes won’t save.', true);
    for (const k of ['name', 'altName', 'role', 'affiliation', 'bio', 'event', 'website', 'email', 'linkedin', 'scholar', 'orcid', 'github']) F(k).value = d[k] || '';
    const uploadedCv = d.cv && /\/storage\/v1\/object\/public\/|^data:application\/pdf/.test(d.cv);
    if (uploadedCv) state.cv = d.cv; else F('cvLink').value = d.cv || '';
    state.photo = d.photo || ''; state.accent = TC.hexOk(d.accent);
    const f = d.featured || {};
    F('fLabel').value = f.label || ''; F('fTab').value = f.tab || ''; F('fTitle').value = f.title || '';
    F('fMeta').value = f.meta || ''; F('fLink').value = f.link || ''; F('fLinkLabel').value = f.linkLabel || '';
    if (f.title || f.link) $('featDetails').open = true;
    if (['website', 'email', 'linkedin', 'scholar', 'orcid', 'github'].some(k => d[k])) $('linksDetails').open = true;
    showPhoto(); showCv(); syncSwatches(); render();
  }

  // ---- draft: text fields are kept in this browser until the card is published
  const DRAFT = 'tapcard-draft';
  const DRAFT_FIELDS = ['name', 'altName', 'role', 'affiliation', 'bio', 'event', 'website', 'email', 'linkedin', 'scholar', 'orcid', 'github', 'cvLink',
    'fLabel', 'fTab', 'fTitle', 'fMeta', 'fLink', 'fLinkLabel', 'slug'];
  let draftTimer = null;
  function saveDraft() {
    if (editSlug || !state.drafted) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const o = { accent: state.accent, slugTouched, invite: $('invite').value, photo: state.photo };
      DRAFT_FIELDS.forEach(k => o[k] = F(k).value);
      try { localStorage.setItem(DRAFT, JSON.stringify(o)); } catch (e) {}
    }, 300);
  }
  form.addEventListener('input', saveDraft);
  $('swatches').addEventListener('click', saveDraft);
  if (!editSlug) {
    let o = null; try { o = JSON.parse(localStorage.getItem(DRAFT)); } catch (e) {}
    if (o && DRAFT_FIELDS.some(k => o[k])) {
      DRAFT_FIELDS.forEach(k => { if (o[k]) F(k).value = o[k]; });
      state.accent = TC.hexOk(o.accent); slugTouched = !!o.slugTouched;
      if (o.invite) $('invite').value = o.invite;
      if (o.photo) state.photo = o.photo;
      if (o.fTitle || o.fLink) $('featDetails').open = true;
      if (['website', 'email', 'linkedin', 'scholar', 'orcid', 'github'].some(k => o[k])) $('linksDetails').open = true;
      $('restored').hidden = false;
      toDraft();
      if (F('slug').value) checkSlug();
    }
  }
  $('startOver').onclick = () => { try { localStorage.removeItem(DRAFT); } catch (e) {} location.href = TC.BASE; };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  syncEvents(); syncSwatches(); showPhoto(); showCv(); showBigCv(); render();
  if (editSlug) loadForEdit();
})();
