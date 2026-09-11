/* =========================================================
   booking.js — календар, свободни часове, валидация, потвърждение
   ---------------------------------------------------------
   Демо режим: заетите часове се генерират детерминистично за
   всяка дата + вече направените резервации се пазят в localStorage.
   За реален бекенд виж секция „Как да свържа истински имейл“ в README.md.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Настройки ---------- */
  var CONFIG = {
    // Работно време по дни (0 = неделя ... 6 = събота). null = почивен ден.
    hours: {
      0: null,
      1: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
      2: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
      3: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
      4: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
      5: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00'],
      6: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00']
    },
    daysAhead: 60,          // колко напред може да се резервира
    durationMin: 60,        // времетраене на тренировка (за Google Calendar)
    storageKey: 'mk_bookings_v1',
    trainerEmail: 'hello@martinkovachev.bg',
    location: 'Fit Studio, бул. „Витоша“ 100, София'
  };

  var MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
    'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];

  /* ---------- Елементи ---------- */
  var grid = document.getElementById('calendar-grid');
  var monthLabel = document.getElementById('month-label');
  var prevBtn = document.getElementById('prev-month');
  var nextBtn = document.getElementById('next-month');
  var slotsBox = document.getElementById('slots');
  var form = document.getElementById('booking-form');
  var summaryBox = document.getElementById('summary');
  var summaryText = document.getElementById('summary-text');
  if (!grid || !form) return;

  /* ---------- Състояние ---------- */
  var today = startOfDay(new Date());
  var maxDate = addDays(today, CONFIG.daysAhead);
  var viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
  var selectedDate = null;
  var selectedTime = null;

  /* ---------- Помощни ---------- */
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var c = new Date(d); c.setDate(c.getDate() + n); return c; }
  function sameDay(a, b) { return a && b && a.toDateString() === b.toDateString(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function formatLong(d) {
    var wd = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'][d.getDay()];
    return d.getDate() + ' ' + MONTHS[d.getMonth()].toLowerCase() + ' ' + d.getFullYear() + ' г. (' + wd + ')';
  }

  function loadBookings() {
    try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {}; }
    catch (e) { return {}; }
  }

  function saveBooking(dateKey, time) {
    var all = loadBookings();
    all[dateKey] = all[dateKey] || [];
    if (all[dateKey].indexOf(time) === -1) all[dateKey].push(time);
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(all)); } catch (e) { /* private mode */ }
  }

  // Детерминистичен „зает“ статус, за да изглежда графикът реалистично в демото.
  function pseudoBusy(dateKey, time) {
    var s = dateKey + time, h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return h % 10 < 4; // ~40% заети
  }

  function slotsFor(date) {
    var list = CONFIG.hours[date.getDay()];
    if (!list) return [];
    if (!sameDay(date, today)) return list.slice();
    // За днес показваме само часове поне 2 часа напред.
    var limit = new Date();
    limit.setHours(limit.getHours() + 2);
    return list.filter(function (t) {
      var parts = t.split(':');
      var d = new Date(date);
      d.setHours(+parts[0], +parts[1], 0, 0);
      return d > limit;
    });
  }

  function freeSlotsFor(date) {
    var booked = loadBookings()[key(date)] || [];
    return slotsFor(date).filter(function (t) {
      return booked.indexOf(t) === -1 && !pseudoBusy(key(date), t);
    });
  }

  function isSelectable(date) {
    return date >= today && date <= maxDate && freeSlotsFor(date).length > 0;
  }

  /* ---------- Рендер на календара ---------- */
  function renderCalendar() {
    var year = viewDate.getFullYear();
    var month = viewDate.getMonth();
    monthLabel.textContent = MONTHS[month] + ' ' + year;

    grid.innerHTML = '';

    var first = new Date(year, month, 1);
    var offset = (first.getDay() + 6) % 7;            // понеделник = 0
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    for (var i = 0; i < offset; i++) {
      var empty = document.createElement('span');
      empty.className = 'day is-empty';
      empty.setAttribute('aria-hidden', 'true');
      grid.appendChild(empty);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      (function (dayNum) {
        var date = new Date(year, month, dayNum);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'day';
        btn.textContent = dayNum;
        btn.setAttribute('role', 'gridcell');

        var free = isSelectable(date);
        btn.disabled = !free;

        if (sameDay(date, today)) btn.classList.add('is-today');
        if (sameDay(date, selectedDate)) btn.classList.add('is-selected');

        if (free) {
          var count = freeSlotsFor(date).length;
          btn.setAttribute('aria-label', formatLong(date) + ' — ' + count + ' свободни часа');
          var dot = document.createElement('span');
          dot.className = 'day__dot';
          btn.appendChild(dot);
          btn.addEventListener('click', function () { selectDate(date); });
        } else {
          btn.setAttribute('aria-label', formatLong(date) + ' — няма свободни часове');
        }

        grid.appendChild(btn);
      })(d);
    }

    prevBtn.disabled = new Date(year, month, 1) <= new Date(today.getFullYear(), today.getMonth(), 1);
    nextBtn.disabled = new Date(year, month + 1, 1) > maxDate;
  }

  /* ---------- Избор на дата и час ---------- */
  function selectDate(date) {
    selectedDate = date;
    selectedTime = null;
    renderCalendar();
    renderSlots();
    updateSummary();
  }

  function renderSlots() {
    slotsBox.innerHTML = '';

    if (!selectedDate) {
      slotsBox.innerHTML = '<p class="slots__empty">Първо избери дата от календара.</p>';
      return;
    }

    var all = slotsFor(selectedDate);
    var free = freeSlotsFor(selectedDate);

    if (!all.length) {
      slotsBox.innerHTML = '<p class="slots__empty">За тази дата няма часове. Избери друг ден.</p>';
      return;
    }

    all.forEach(function (time) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot';
      btn.textContent = time;
      var isFree = free.indexOf(time) !== -1;
      btn.disabled = !isFree;
      btn.setAttribute('aria-label', time + (isFree ? ' — свободен' : ' — зает'));

      btn.addEventListener('click', function () {
        selectedTime = time;
        slotsBox.querySelectorAll('.slot').forEach(function (s) { s.classList.remove('is-selected'); });
        btn.classList.add('is-selected');
        updateSummary();
      });

      slotsBox.appendChild(btn);
    });
  }

  function updateSummary() {
    var pkg = document.getElementById('package').value;
    if (selectedDate && selectedTime) {
      summaryText.textContent = formatLong(selectedDate) + ', ' + selectedTime + ' ч.' + (pkg ? ' — ' + pkg : '');
      summaryBox.classList.add('is-ready');
    } else if (selectedDate) {
      summaryText.textContent = formatLong(selectedDate) + ' — избери час.';
      summaryBox.classList.remove('is-ready');
    } else {
      summaryText.textContent = 'Все още няма избрана дата и час.';
      summaryBox.classList.remove('is-ready');
    }
  }

  prevBtn.addEventListener('click', function () {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    renderCalendar();
  });
  nextBtn.addEventListener('click', function () {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    renderCalendar();
  });
  document.getElementById('package').addEventListener('change', updateSummary);

  /* ---------- Валидация ---------- */
  function setError(id, message) {
    var box = document.getElementById('err-' + id);
    var input = document.getElementById(id);
    if (box) box.textContent = message || '';
    if (input && input.closest('.field')) input.closest('.field').classList.toggle('has-error', !!message);
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  function validate() {
    var ok = true;
    var name = document.getElementById('name').value.trim();
    var phone = document.getElementById('phone').value.trim();
    var email = document.getElementById('email').value.trim();
    var pkg = document.getElementById('package').value;
    var gdpr = document.getElementById('gdpr').checked;

    ok = setError('name', name.length < 3 ? 'Моля, въведи име и фамилия.' : '') && ok;
    ok = setError('phone', /^[0-9+\s()-]{6,}$/.test(phone) ? '' : 'Моля, въведи валиден телефон.') && ok;
    ok = setError('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'Моля, въведи валиден имейл.') && ok;
    ok = setError('package', pkg ? '' : 'Избери пакет.') && ok;
    ok = setError('gdpr', gdpr ? '' : 'Необходимо е съгласие, за да продължим.') && ok;

    if (!selectedDate || !selectedTime) {
      summaryText.textContent = 'Избери дата и час от календара по-горе.';
      summaryBox.classList.remove('is-ready');
      summaryBox.style.borderColor = 'var(--danger)';
      ok = false;
    } else {
      summaryBox.style.borderColor = '';
    }
    return ok;
  }

  ['name', 'phone', 'email', 'package', 'gdpr'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { setError(id, ''); });
  });

  /* ---------- Модал ---------- */
  var modal = document.getElementById('modal');
  var modalBox = modal ? modal.querySelector('.modal__box') : null;
  var lastFocused = null;

  function openModal() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (modalBox) modalBox.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  if (modal) {
    modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  /* ---------- Google Calendar + имейл ---------- */
  function gcalDates(date, time) {
    var parts = time.split(':');
    var start = new Date(date);
    start.setHours(+parts[0], +parts[1], 0, 0);
    var end = new Date(start.getTime() + CONFIG.durationMin * 60000);

    function fmt(d) {
      return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
             pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
    }
    return fmt(start) + '/' + fmt(end);
  }

  function buildLinks(data) {
    var title = 'Тренировка с Мартин Ковачев — ' + data.package;
    var details = 'Резервация за ' + data.name + '\nТелефон: ' + data.phone +
      '\nПакет: ' + data.package + (data.goal ? '\nБележка: ' + data.goal : '');

    var gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(title) +
      '&dates=' + gcalDates(data.date, data.time) +
      '&details=' + encodeURIComponent(details) +
      '&location=' + encodeURIComponent(CONFIG.location);

    var mail = 'mailto:' + CONFIG.trainerEmail +
      '?subject=' + encodeURIComponent('Нова резервация — ' + data.name) +
      '&body=' + encodeURIComponent(
        'Здравей, Мартин,\n\nБих искал/а да запазя тренировка:\n\n' +
        'Дата: ' + formatLong(data.date) + '\n' +
        'Час: ' + data.time + '\n' +
        'Пакет: ' + data.package + '\n' +
        'Име: ' + data.name + '\n' +
        'Телефон: ' + data.phone + '\n' +
        'Имейл: ' + data.email + '\n' +
        (data.goal ? 'Бележка: ' + data.goal + '\n' : '') +
        '\nПоздрави,\n' + data.name);

    return { gcal: gcal, mail: mail };
  }

  /* ---------- Изпращане ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) {
      var firstError = form.querySelector('.has-error input, .has-error select');
      if (firstError) firstError.focus();
      else document.getElementById('calendar').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var data = {
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim(),
      package: document.getElementById('package').value,
      goal: document.getElementById('goal').value.trim(),
      date: selectedDate,
      time: selectedTime
    };

    saveBooking(key(data.date), data.time);

    var details = document.getElementById('modal-details');
    details.innerHTML =
      '<div><b>Дата:</b> ' + formatLong(data.date) + '</div>' +
      '<div><b>Час:</b> ' + data.time + ' ч. (' + CONFIG.durationMin + ' мин)</div>' +
      '<div><b>Пакет:</b> ' + data.package + '</div>' +
      '<div><b>Име:</b> ' + data.name + '</div>' +
      '<div><b>Локация:</b> ' + CONFIG.location + '</div>';

    document.getElementById('modal-text').textContent =
      'Изпратихме потвърждение на ' + data.email + '. Ще се чуем на ' + data.phone + ' за финално потвърждение.';

    var links = buildLinks(data);
    document.getElementById('gcal-link').href = links.gcal;
    document.getElementById('mail-link').href = links.mail;

    openModal();

    form.reset();
    selectedTime = null;
    renderCalendar();
    renderSlots();
    updateSummary();
  });

  /* ---------- Старт ---------- */
  renderCalendar();
  renderSlots();
})();
