/* Osta Flowers — interactions: preloader, scroll reveals, mobile menu, the stem */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- preloader ---------- */
  var preloader = document.getElementById('preloader');
  if (preloader) {
    var seen = false;
    try { seen = sessionStorage.getItem('osta-seen') === '1'; } catch (e) {}
    if (reduceMotion || seen) {
      preloader.remove();
    } else {
      var hide = function () {
        preloader.classList.add('done');
        try { sessionStorage.setItem('osta-seen', '1'); } catch (e) {}
        setTimeout(function () { preloader.remove(); }, 700);
      };
      if (document.readyState === 'complete') setTimeout(hide, 900);
      else window.addEventListener('load', function () { setTimeout(hide, 500); });
      setTimeout(hide, 2200); /* hard cap: never hold the page hostage */
    }
  }

  /* ---------- header state ---------- */
  var header = document.getElementById('siteHeader');
  var onHeaderScroll = function () {
    header.classList.toggle('scrolled', window.scrollY > 10);
  };
  window.addEventListener('scroll', onHeaderScroll, { passive: true });
  onHeaderScroll();

  /* ---------- smooth scrolling ----------
     Lenis eases the page instead of stepping it, so the wheel and trackpad
     glide. It drives the real window scroll, so scrollY, the stem and the
     reveals all keep working. Touch keeps its native inertia, and anyone
     asking for reduced motion never gets the scroller at all — for them the
     stylesheet's plain scroll-behavior stays in charge. */
  var lenis = null;
  if (!reduceMotion && window.Lenis) {
    lenis = new window.Lenis({
      lerp: 0.09,          /* how hard the page chases the pointer: lower = longer glide */
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false     /* phones already have momentum; don't fight it */
    });
    var frame = function (time) {
      lenis.raf(time);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    /* In-page links: the browser's own anchor jump is off while Lenis owns the
       scroll, so hand them to the scroller. Lenis reads scroll-padding-top
       itself, so the fixed header is already accounted for — don't pass an
       offset here or the gap is counted twice. Focus moves as a real anchor
       jump would, which keeps the skip-link honest. */
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link || link.hasAttribute('data-no-smooth')) return;
      var id = link.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, {
        duration: 1.2,
        onComplete: function () {
          if (history.replaceState) history.replaceState(null, '', id);
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      });
    });
  }

  /* ---------- mobile menu ----------
     [hidden] can't be part of the animation — display:none cancels transitions
     — so it comes off before opening and goes back on only once the closing
     one has run. CLOSE_MS covers the longest close transition in main.css
     (0.06s delay + 0.4s blind) plus a frame or two of slack: cutting it fine
     hid the blind while it still had a tenth of the screen left to travel, and
     the last sliver popped. The panel is click-through and invisible for that
     extra moment, so overshooting costs nothing. */
  var CLOSE_MS = 560;
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');
  var menuTimer = null;
  var closeMenu = function () {
    clearTimeout(menuTimer);
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
    menu.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lenis) lenis.start();
    menuTimer = setTimeout(function () {
      /* Nothing has claimed focus on the way out — hand it back to the burger
         rather than let a hidden link drop it on the body. */
      var stranded = menu.contains(document.activeElement);
      menu.hidden = true;
      if (stranded) burger.focus();
    }, reduceMotion ? 0 : CLOSE_MS);
  };
  burger.addEventListener('click', function () {
    var open = burger.getAttribute('aria-expanded') === 'true';
    if (open) { closeMenu(); return; }
    clearTimeout(menuTimer);
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Закрыть меню');
    menu.hidden = false;
    /* Read a layout value so the closed state is committed before .is-open
       lands on it; without this the browser coalesces both into one frame and
       there is nothing to animate from. */
    void menu.offsetWidth;
    menu.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (lenis) lenis.stop();
    var first = menu.querySelector('a');
    if (first) first.focus({ preventScroll: true });
  });
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      burger.focus();
    }
  });

  /* ---------- scroll reveals ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- the stem ----------
     One continuous red line growing down the page as you scroll,
     with a bud + leaf marking the start of every section.

     The stem lives in the empty gutter to the left of the content and must
     never reach into it. Every screen has a different gutter, so the lane is
     measured from the layout itself and the drawing is sized to fit:
       wide lane  -> the full wave, buds and leaves
       medium     -> a shallower wave, shorter or no leaves
       narrow     -> a straight hairline hugging the edge
     The SVG is built in real pixels (viewBox width == CSS width), so strokes
     never distort no matter how wide the lane turns out to be. */
  var stem = document.querySelector('.stem');
  var svg = document.getElementById('stemSvg');
  var stemLine = null, nodes = [], docH = 0, lineLen = 0, boxW = 0;
  var NS = 'http://www.w3.org/2000/svg';
  var SECTIONS = ['#studio', '#vitrina', '#vecher', '#sobytiya', '#otzyvy', '#kontakty'];
  var MAX_W = 120;   /* the widest the stem ever draws, however roomy the page */
  var MIN_W = 8;     /* below this there is no room for a line at all */
  var MIN_VW = 761;  /* phones have no gutter to spare: no stem at all below this */
  var PROBES = '.header-inner, .hero-inner, main .container';

  /* Distance from the left edge of the viewport to where content actually
     starts. offsetTop/offsetLeft are used instead of getBoundingClientRect so
     the reveal transforms can't skew the measurement. */
  function laneWidth() {
    var min = Infinity;
    document.querySelectorAll(PROBES).forEach(function (el) {
      var left = 0, node = el;
      while (node && node !== document.body) { left += node.offsetLeft; node = node.offsetParent; }
      min = Math.min(min, left + (parseFloat(getComputedStyle(el).paddingLeft) || 0));
    });
    return min === Infinity ? 0 : Math.max(0, min);
  }

  /* Geometry of the stem for a given lane, all in CSS pixels. */
  function measure() {
    /* On phones the only lane left is the page gutter, so the stem collapses to
       a bare hairline pinned to the screen edge — a stray rule, not a signature.
       Drop it entirely and let the layout breathe. */
    if (window.innerWidth < MIN_VW) return null;
    var lane = laneWidth();
    var gap = Math.min(20, Math.max(6, lane * 0.15));  /* breathing room before the text */
    var w = Math.min(MAX_W, lane - gap);
    if (w < MIN_W) return null;
    var amp = w >= 24 ? Math.min(26, w * 0.22) : 0;    /* no wave in a hairline lane */
    var room = w / 2 - amp - 4;                        /* what's left for a leaf */
    return {
      w: w,
      cx: w / 2,
      amp: amp,
      leaf: room >= 12 ? Math.min(27, room) : 0,
      bud: Math.max(2, Math.min(3.5, w * 0.06))
    };
  }

  function buildStem() {
    if (!svg || !stem) return;
    var g = measure();
    lastH = document.body.scrollHeight;
    lastW = g ? g.w : 0;
    /* No lane: drop the drawing too, so a wide-window stem doesn't linger in
       the DOM after a resize or an orientation flip onto a phone. */
    if (!g) {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      stem.hidden = true; stemLine = null; nodes = [];
      return;
    }
    stem.hidden = false;

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    docH = lastH;
    boxW = g.w;
    stem.style.width = boxW.toFixed(1) + 'px';
    svg.setAttribute('viewBox', '0 0 ' + boxW.toFixed(1) + ' ' + docH);
    svg.setAttribute('preserveAspectRatio', 'none');
    nodes = [];

    var xAt = function (y) { return g.cx + g.amp * Math.sin(y / 640 * Math.PI * 2); };

    var d = 'M ' + xAt(0).toFixed(1) + ' 0';
    for (var y = 12; y <= docH; y += 12) {
      d += ' L ' + xAt(y).toFixed(1) + ' ' + y;
    }
    stemLine = document.createElementNS(NS, 'path');
    stemLine.setAttribute('class', 'stem-line');
    stemLine.setAttribute('d', d);
    svg.appendChild(stemLine);
    lineLen = stemLine.getTotalLength();
    stemLine.style.strokeDasharray = lineLen + ' ' + lineLen;
    stemLine.style.strokeDashoffset = String(lineLen);

    SECTIONS.forEach(function (sel, i) {
      var el = document.querySelector(sel);
      if (!el) return;
      var y = el.offsetTop + 60;
      if (y > docH - 40) return;
      var x = xAt(y);
      var side = i % 2 === 0 ? 1 : -1;
      var leaf = null;

      if (g.leaf) {
        var k = g.leaf / 27;  /* scale the whole leaf, so its shape survives */
        leaf = document.createElementNS(NS, 'path');
        leaf.setAttribute('class', 'stem-leaf');
        leaf.setAttribute('d', 'M ' + x.toFixed(1) + ' ' + y +
          ' q ' + (side * 16 * k).toFixed(1) + ' ' + (-4 * k).toFixed(1) +
          ' ' + (side * 27 * k).toFixed(1) + ' ' + (-16 * k).toFixed(1));
        svg.appendChild(leaf);
      }

      var bud = document.createElementNS(NS, 'circle');
      bud.setAttribute('class', 'stem-node');
      bud.setAttribute('cx', x.toFixed(1));
      bud.setAttribute('cy', y);
      bud.setAttribute('r', g.bud.toFixed(1));
      svg.appendChild(bud);

      nodes.push({ y: y, bud: bud, leaf: leaf });
    });

    drawStem();
  }

  var ticking = false;
  function drawStem() {
    if (!stemLine) return;
    var progress;
    if (reduceMotion) {
      progress = 1;
    } else {
      /* the stem tip rides ~80% down the current viewport */
      var tip = window.scrollY + window.innerHeight * 0.8;
      progress = Math.min(1, Math.max(0, tip / docH));
    }
    stemLine.style.strokeDashoffset = String(lineLen * (1 - progress));
    var grownY = progress * docH;
    nodes.forEach(function (n) {
      var on = grownY >= n.y;
      n.bud.classList.toggle('bloom', on);
      if (n.leaf) n.leaf.classList.toggle('bloom', on);
    });
  }

  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { drawStem(); ticking = false; });
  }, { passive: true });

  /* Rebuild whenever the lane or the length of the page moves: viewport
     resize, orientation flip, late images, webfonts swapping in. */
  var resizeTimer, lastW = -1, lastH = -1;
  function refreshStem() {
    var g = measure();
    var w = g ? g.w : 0;
    if (Math.abs(w - lastW) < 0.5 && document.body.scrollHeight === lastH) return;
    buildStem();
  }
  function scheduleStem() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refreshStem, 150);
  }

  /* While a window is actually being dragged the rebuild is still debounced,
     so squeeze the drawing into the shrinking lane on every frame. It goes a
     little narrow for a moment; it never crosses into the text. */
  var clamping = false;
  function clampStem() {
    if (!stem || !boxW) return;
    var g = measure();
    if (!g) { stem.hidden = true; return; }
    stem.hidden = false;
    stem.style.width = Math.min(boxW, g.w).toFixed(1) + 'px';
  }
  function onViewportChange() {
    if (!clamping) {
      clamping = true;
      requestAnimationFrame(function () { clamping = false; clampStem(); });
    }
    scheduleStem();
  }
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleStem).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleStem);

  buildStem();
  window.addEventListener('load', refreshStem);

  /* Lenis moves the page on its own frame; native scroll events can lag a
     frame or two behind it. Drive the header and the stem from Lenis directly
     so the line never trails the content it's drawn beside. */
  if (lenis) {
    lenis.on('scroll', function () {
      onHeaderScroll();
      drawStem();
    });
  }

  /* ---------- footer year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
