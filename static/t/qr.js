(() => {
  const $ = id => document.getElementById(id);
  const slug = TC.slugFromQuery(location.search);
  const notice = (h, p) => {
    ['head', 'stage', 'caption', 'seg', 'foot'].forEach(id => $(id).hidden = true);
    $('notice').hidden = false;
    $('notice').innerHTML = `<h1 class="serif">${TC.esc(h)}</h1><p>${TC.esc(p)}</p>`;
  };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!slug) return notice('No card chosen', 'This page needs a card link.');

  const card = $('card'), seg = $('seg'), caption = $('caption');
  let MODES = [], mode = 0, shown = '';

  function setMode(i, instant) {
    if (!MODES[i] || (i === mode && !instant)) return;
    mode = i;
    card.classList.toggle('flip', i === 1);
    seg.classList.toggle('b', i === 1);
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i));
    const put = () => { $('capBig').textContent = MODES[i].big; $('capSmall').textContent = MODES[i].small; caption.classList.remove('swap'); };
    if (instant) return put();
    caption.classList.add('swap'); setTimeout(put, 250);
  }

  // Draws (or redraws) everything from one card's data.
  function render(d) {
    const sig = JSON.stringify(d);
    if (sig === shown) return;
    shown = sig;
    document.title = `${d.name} · Scan to connect`;
    TC.applyAccent(document.documentElement, d.accent);
    $('notice').hidden = true;
    ['head', 'stage', 'caption', 'foot'].forEach(id => $(id).hidden = false);
    $('pill').hidden = !d.event; $('event').textContent = d.event || '';
    $('name').textContent = d.name;
    $('sub').innerHTML = (d.altName ? `<b>${TC.esc(d.altName)}</b>` : '') + TC.esc([d.role, d.affiliation].filter(Boolean).join(' · '));
    const f = d.featured || {}, flink = TC.href(f.link);
    MODES = [{ url: TC.cardUrl(slug), big: 'Point your camera here', small: 'Card, CV & contact in one scan' }];
    if (flink) MODES.push({ url: flink, big: f.title || 'Take a look', small: f.meta || f.label || '' });
    $('front').innerHTML = TC.qrSvg(MODES[0].url, d.photo, d.accent);
    $('back').innerHTML = MODES[1] ? TC.qrSvg(MODES[1].url, d.photo, d.accent) : '';
    $('tab2').textContent = f.tab || 'My work';
    seg.hidden = !MODES[1];
    setMode(MODES[mode] ? mode : 0, true);
  }

  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(+b.dataset.i); });
  card.addEventListener('click', () => setMode(1 - mode));
  let sx = null;
  card.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  card.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 40) setMode(dx < 0 ? 1 : 0);
  });

  // Show the last saved copy at once (works offline), then refresh quietly.
  const saved = TC.cached(slug);
  if (saved) render(saved);
  TC.getCard(slug).then(d => {
    if (d) render(d);
    else if (!saved) notice('No card here', `Nobody has claimed “${slug}” yet.`);
    else notice('This card was deleted', 'Its owner removed it.');
  }).catch(() => { if (!saved) notice('No connection', 'Open this page once with internet and it will work offline after that.'); });

  // The owner (who has the edit key on this device) gets a quiet Edit link.
  try {
    const t = localStorage.getItem('tapcard-token-' + slug);
    if (t) { $('editLink').href = `./?edit=${encodeURIComponent(slug)}#${t}`; $('editLink').hidden = false; }
  } catch (e) {}

  // Keep the screen awake while someone is scanning.
  const awake = $('awake'), awakeTxt = $('awakeTxt');
  async function keepAwake() {
    try {
      const lock = await navigator.wakeLock.request('screen');
      awake.classList.add('on'); awakeTxt.textContent = 'Screen stays on';
      lock.addEventListener('release', () => { awake.classList.remove('on'); awakeTxt.textContent = 'Screen may dim'; });
    } catch (e) {}
  }
  if ('wakeLock' in navigator) {
    keepAwake();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
  } else awake.hidden = true;
  const fs = $('fs');
  if (!document.documentElement.requestFullscreen) fs.hidden = true;
  fs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  });
})();
