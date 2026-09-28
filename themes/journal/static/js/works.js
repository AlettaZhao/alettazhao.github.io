(function () {
  document.documentElement.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // fade items in as they scroll into view
  var items = document.querySelectorAll('.reveal');
  // arriving from a link like /works/#crossprobe: show that item and bring it into view
  var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) {
    target.classList.add('is-in');
    requestAnimationFrame(function () { target.scrollIntoView({ block: 'start' }); });
  }

  // anything already on screen shows at once, even if the observer is slow to fire
  items.forEach(function (el) {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });

    // play muted previews while on screen, pause when scrolled away
    if (!reduce) {
      var vo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
          else if (!v.paused) v.pause();
        });
      }, { threshold: 0.6 });
      document.querySelectorAll('video.work-main').forEach(function (v) { vo.observe(v); });
    }
  } else {
    items.forEach(function (el) { el.classList.add('is-in'); });
  }

  // thumbnails swap the stage image
  document.querySelectorAll('.work-item').forEach(function (item) {
    var stage = item.querySelector('.work-stage');
    var video = stage.querySelector('video');
    var img = stage.querySelector('img.work-main');
    item.querySelectorAll('.work-thumb').forEach(function (btn) {
      btn.addEventListener('click', function () {
        item.querySelectorAll('.work-thumb').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        if (btn.hasAttribute('data-video')) {
          if (img && video) { img.remove(); img = null; video.hidden = false; if (!reduce) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } }
          return;
        }
        if (video) { video.pause(); video.hidden = true; }
        if (!img) {
          img = document.createElement('img');
          img.className = 'work-main';
          img.alt = '';
          stage.appendChild(img);
          img.src = btn.dataset.src;
          img.classList.toggle('is-contain', btn.dataset.fit === 'contain');
          return;
        }
        if (img.src === btn.dataset.src) return;
        img.classList.add('is-fading');
        setTimeout(function () {
          img.src = btn.dataset.src;
          img.classList.toggle('is-contain', btn.dataset.fit === 'contain');
          img.onload = function () { img.classList.remove('is-fading'); };
        }, reduce ? 0 : 200);
      });
    });
  });

  // lightbox: view a project's images and video large
  var lb = document.createElement('div');
  lb.className = 'lb';
  lb.hidden = true;
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Media viewer');
  lb.innerHTML =
    '<div class="lb-stage"></div>' +
    '<button type="button" class="lb-btn lb-close" aria-label="Close">&times;</button>' +
    '<button type="button" class="lb-btn lb-prev" aria-label="Previous">&lsaquo;</button>' +
    '<button type="button" class="lb-btn lb-next" aria-label="Next">&rsaquo;</button>' +
    '<div class="lb-count"></div>';
  document.body.appendChild(lb);
  var lbStage = lb.querySelector('.lb-stage');
  var lbCount = lb.querySelector('.lb-count');
  var lbPrev = lb.querySelector('.lb-prev');
  var lbNext = lb.querySelector('.lb-next');
  var list = [], at = 0, opener = null, pausedVideo = null;

  function mediaOf(item) {
    var thumbs = item.querySelectorAll('.work-thumb');
    var video = item.querySelector('video.work-main');
    if (thumbs.length) {
      return Array.prototype.map.call(thumbs, function (b) {
        return b.hasAttribute('data-video') ? { video: true, src: video.currentSrc || video.src } : { src: b.dataset.src };
      });
    }
    var main = item.querySelector('.work-main');
    if (!main || main.classList.contains('work-ph')) return [];
    return [main.tagName === 'VIDEO' ? { video: true, src: main.currentSrc || main.src } : { src: main.src }];
  }

  function show(i) {
    at = (i + list.length) % list.length;
    var m = list[at];
    lbStage.innerHTML = '';
    var el;
    if (m.video) {
      el = document.createElement('video');
      el.src = m.src;
      el.controls = true;
      el.playsInline = true;
      el.autoplay = true;
    } else {
      el = document.createElement('img');
      el.src = m.src;
      el.alt = '';
    }
    lbStage.appendChild(el);
    var many = list.length > 1;
    lbPrev.hidden = lbNext.hidden = !many;
    lbCount.textContent = many ? (at + 1) + ' / ' + list.length : '';
  }

  function open(item, from) {
    list = mediaOf(item);
    if (!list.length) return;
    var active = item.querySelector('.work-thumb.is-active');
    var idx = active ? Array.prototype.indexOf.call(item.querySelectorAll('.work-thumb'), active) : 0;
    var v = item.querySelector('video.work-main');
    if (v && !v.paused) { v.pause(); pausedVideo = v; }
    opener = from || null;
    lb.hidden = false;
    document.documentElement.classList.add('lb-open');
    show(idx);
    lb.querySelector('.lb-close').focus();
  }

  function close() {
    lb.hidden = true;
    lbStage.innerHTML = '';
    document.documentElement.classList.remove('lb-open');
    if (pausedVideo && !reduce) { var p = pausedVideo.play(); if (p && p.catch) p.catch(function () {}); }
    pausedVideo = null;
    if (opener) opener.focus();
  }

  lb.querySelector('.lb-close').addEventListener('click', close);
  lbPrev.addEventListener('click', function () { show(at - 1); });
  lbNext.addEventListener('click', function () { show(at + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target === lbStage) close(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && list.length > 1) show(at - 1);
    else if (e.key === 'ArrowRight' && list.length > 1) show(at + 1);
  });

  document.querySelectorAll('.work-item').forEach(function (item) {
    var stage = item.querySelector('.work-stage');
    if (!mediaOf(item).length) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'work-expand';
    btn.setAttribute('aria-label', 'View larger');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h5v5"/><path d="M9 20h-5v-5"/><path d="M20 4l-6 6"/><path d="M4 20l6 -6"/></svg>';
    stage.appendChild(btn);
    btn.addEventListener('click', function () { open(item, btn); });
    // clicking an image opens it too; clicks on a video stay with its own controls
    stage.addEventListener('click', function (e) {
      if (e.target.tagName === 'IMG' && e.target.classList.contains('work-main')) open(item, btn);
    });
  });
})();
