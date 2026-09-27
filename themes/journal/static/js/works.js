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
})();
