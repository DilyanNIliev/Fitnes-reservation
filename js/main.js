/* =========================================================
   main.js — навигация, анимации, таймер, табове, преди/след
   ========================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Мобилно меню ---------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  function closeNav() {
    if (!nav) return;
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Отвори менюто');
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Затвори менюто' : 'Отвори менюто');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeNav();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
  }

  /* ---------- Header при скрол + активна секция ---------- */
  var header = document.getElementById('header');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__list a[href^="#"]'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function onScroll() {
    if (header) header.classList.toggle('is-stuck', window.scrollY > 24);

    var pos = window.scrollY + 140;
    var current = null;
    sections.forEach(function (sec) {
      if (sec.offsetTop <= pos) current = sec.id;
    });
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + current);
    });
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      onScroll();
      ticking = false;
    });
  }, { passive: true });
  onScroll();

  /* ---------- Reveal при скрол ---------- */
  var revealItems = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealItems.forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i % 4, 3) * 80) + 'ms';
      io.observe(el);
    });
  }

  /* ---------- Броячи в hero ---------- */
  var counters = document.querySelectorAll('[data-count]');

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduceMotion) {
      el.textContent = target.toFixed(decimals) + suffix;
      return;
    }
    var start = performance.now();
    var dur = 1400;
    function tick(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if ('IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        animateCounter(e.target);
        co.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { co.observe(el); });
  } else {
    counters.forEach(animateCounter);
  }

  /* ---------- Countdown за промоцията ---------- */
  var countdown = document.getElementById('countdown');
  if (countdown) {
    // Краят на промоцията: последният ден от текущия месец, 23:59:59.
    // Смени с фиксирана дата, ако имаш конкретен краен срок:
    // var deadline = new Date('2025-10-31T23:59:59');
    var now0 = new Date();
    var deadline = new Date(now0.getFullYear(), now0.getMonth() + 1, 0, 23, 59, 59);

    var fields = {
      days: countdown.querySelector('[data-cd="days"]'),
      hours: countdown.querySelector('[data-cd="hours"]'),
      minutes: countdown.querySelector('[data-cd="minutes"]'),
      seconds: countdown.querySelector('[data-cd="seconds"]')
    };

    function pad(n) { return String(n).padStart(2, '0'); }

    function tickCountdown() {
      var diff = deadline - new Date();
      if (diff <= 0) {
        Object.keys(fields).forEach(function (k) { if (fields[k]) fields[k].textContent = '00'; });
        clearInterval(timer);
        return;
      }
      var s = Math.floor(diff / 1000);
      if (fields.days) fields.days.textContent = pad(Math.floor(s / 86400));
      if (fields.hours) fields.hours.textContent = pad(Math.floor(s / 3600) % 24);
      if (fields.minutes) fields.minutes.textContent = pad(Math.floor(s / 60) % 60);
      if (fields.seconds) fields.seconds.textContent = pad(s % 60);
    }
    tickCountdown();
    var timer = setInterval(tickCountdown, 1000);
  }

  /* ---------- Табове: индивидуални / групови ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function activateTab(tab) {
    tabs.forEach(function (t) {
      var isCurrent = t === tab;
      t.classList.toggle('is-active', isCurrent);
      t.setAttribute('aria-selected', String(isCurrent));
      t.tabIndex = isCurrent ? 0 : -1;

      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) {
        panel.classList.toggle('is-hidden', !isCurrent);
        panel.hidden = !isCurrent;
        if (isCurrent) {
          panel.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
        }
      }
    });
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { activateTab(tab); });
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      activateTab(next);
    });
  });

  /* ---------- Бутоните на пакетите попълват формата ---------- */
  document.querySelectorAll('[data-package]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var select = document.getElementById('package');
      if (!select) return;
      var value = btn.getAttribute('data-package');
      var match = Array.prototype.slice.call(select.options).find(function (o) { return o.value === value || o.text === value; });
      if (match) {
        select.value = match.value || match.text;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  /* ---------- Слайдер "преди / след" ---------- */
  document.querySelectorAll('[data-compare]').forEach(function (viewer) {
    var range = viewer.querySelector('.ba__range');
    var wrap = viewer.querySelector('.ba__before-wrap');
    var handle = viewer.querySelector('.ba__handle');
    if (!range || !wrap) return;

    function apply(v) {
      wrap.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
      if (handle) handle.style.left = v + '%';
    }
    range.addEventListener('input', function () { apply(range.value); });
    apply(range.value);
  });

  /* ---------- Година във footer ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
