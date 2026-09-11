/* =========================================================
   booking.js — календар, свободни часове, валидация, потвърждение
   ---------------------------------------------------------
   Заетите часове се четат НА ЖИВО от Google Calendar през
   Google Apps Script web app:

     GET  <webAppUrl>?date=YYYY-MM-DD  ->  { status: "success", busySlots: ["10:00", ...] }
     POST <webAppUrl>  (text/plain, JSON body)  ->  създава събитие в Календара

   Резервациите НЕ се пазят в браузъра — единственият източник на
   истина е Google Calendar.
   ========================================================= */
(function () {
  'use strict';

  /* =========================================================
     0. КОНФИГУРАЦИЯ НА GOOGLE APPS SCRIPT
     ========================================================= */
  var GOOGLE_SCRIPT_CONFIG = {
    enabled: true,
    // Заменете с Вашия генериран Web App URL:
    webAppUrl: 'https://script.google.com/macros/s/AKfycbzwqelKebMwkjPqzMPIKiOGo3IdGJ-H9XClkHG6ZPzwCiPzdvtV4eIcAWi6Et3eTBhkjA/exec'
  };

  /* ---------- Настройки на графика ---------- */
  var CONFIG = {
    // Работно време по дни (0 = неделя ... 6 = събота). null = почивен ден.
    // Часовете са през 1 астрономически час.
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
    durationMin: 60,        // времетраене на тренировка (1 час)
    leadTimeHours: 2,       // най-ранна резервация за днес
    trainerEmail: 'hello@martinkovachev.bg',
    location: 'Fit Studio, бул. „Витоша“ 100, София'
  };

  // Пакетите — цена и категория отиват към Календара и таблицата.
  var PACKAGES = {
    'Безплатна консултация': { category: 'Консултация', price: 0 },
    'Единична тренировка':   { category: 'Индивидуална', price: 60 },
    'Месечен абонамент':     { category: 'Индивидуална', price: 390 },
    'Онлайн план':           { category: 'Онлайн', price: 150 },
    'Групова тренировка':    { category: 'Групова', price: 25 },
    'Групов абонамент':      { category: 'Групова', price: 180 },
    'Bootcamp на открито':   { category: 'Групова', price: 20 }
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
  var currentBusySlots = [];      // заети часове за избраната дата (от Календара)
  var loadFailed = false;         // ако Календарът не отговори

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

  // Часовете по график за дадена дата (без да знаем кои са заети).
  function slotsFor(date) {
    var list = CONFIG.hours[date.getDay()];
    if (!list) return [];
    if (!sameDay(date, today)) return list.slice();

    // За днес показваме само часове поне N часа напред.
    var limit = new Date();
    limit.setHours(limit.getHours() + CONFIG.leadTimeHours);
    return list.filter(function (t) {
      var parts = t.split(':');
      var d = new Date(date);
      d.setHours(+parts[0], +parts[1], 0, 0);
      return d > limit;
    });
  }

  // Работен ден ли е (дали изобщо има часове по график).
  function isWorkingDay(date) {
    return date >= today && date <= maxDate && slotsFor(date).length > 0;
  }

  /* =========================================================
     1. ЗАЕТИ ЧАСОВЕ ОТ GOOGLE CALENDAR
     ========================================================= */
  function fetchBusySlots(dateStr) {
    currentBusySlots = [];
    loadFailed = false;

    if (!GOOGLE_SCRIPT_CONFIG.enabled || !GOOGLE_SCRIPT_CONFIG.webAppUrl) {
      return Promise.resolve();
    }

    var url = GOOGLE_SCRIPT_CONFIG.webAppUrl + '?date=' + encodeURIComponent(dateStr);

    return fetch(url)
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data && data.status === 'success' && Array.isArray(data.busySlots)) {
          currentBusySlots = data.busySlots;
        } else {
          currentBusySlots = [];
        }
      })
      .catch(function (err) {
        console.warn('Не успя да зареди заетите часове от Календара:', err);
        currentBusySlots = [];
        loadFailed = true;
      });
  }

  /* =========================================================
     2. КАЛЕНДАР
     ========================================================= */
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

        var open = isWorkingDay(date);
        btn.disabled = !open;

        if (sameDay(date, today)) btn.classList.add('is-today');
        if (sameDay(date, selectedDate)) btn.classList.add('is-selected');

        if (open) {
          btn.setAttribute('aria-label', formatLong(date) + ' — приемам резервации');
          var dot = document.createElement('span');
          dot.className = 'day__dot';
          btn.appendChild(dot);
          btn.addEventListener('click', function () { selectDate(date); });
        } else {
          btn.setAttribute('aria-label', formatLong(date) + ' — почивен ден');
        }

        grid.appendChild(btn);
      })(d);
    }

    prevBtn.disabled = new Date(year, month, 1) <= new Date(today.getFullYear(), today.getMonth(), 1);
    nextBtn.disabled = new Date(year, month + 1, 1) > maxDate;
  }

  /* =========================================================
     3. ИЗБОР НА ДАТА И ЧАС
     ========================================================= */
  function selectDate(date) {
    selectedDate = date;
    selectedTime = null;
    renderCalendar();
    updateSummary();

    renderLoadingSlots();
    fetchBusySlots(key(date)).then(function () {
      // Ако потребителят е сменил датата, докато заявката се е изпълнявала —
      // резултатът вече е неактуален.
      if (!sameDay(date, selectedDate)) return;
      renderSlots();
    });
  }

  function renderLoadingSlots() {
    slotsBox.innerHTML = '<p class="slots__empty">Проверявам свободните часове в календара…</p>';
  }

  function renderSlots() {
    slotsBox.innerHTML = '';

    if (!selectedDate) {
      slotsBox.innerHTML = '<p class="slots__empty">Първо избери дата от календара.</p>';
      return;
    }

    var all = slotsFor(selectedDate);

    if (!all.length) {
      slotsBox.innerHTML = '<p class="slots__empty">За тази дата няма часове. Избери друг ден.</p>';
      return;
    }

    all.forEach(function (time) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot';
      var isBusy = currentBusySlots.indexOf(time) !== -1;
      btn.textContent = time;
      btn.disabled = isBusy;
      btn.setAttribute('aria-label', time + (isBusy ? ' — зает' : ' — свободен'));

      if (!isBusy) {
        btn.addEventListener('click', function () {
          selectedTime = time;
          slotsBox.querySelectorAll('.slot').forEach(function (s) { s.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
          updateSummary();
        });
      }

      slotsBox.appendChild(btn);
    });

    if (loadFailed) {
      var note = document.createElement('p');
      note.className = 'slots__empty';
      note.textContent = 'Не успях да проверя календара в момента — ще потвърдим часа по телефона.';
      slotsBox.appendChild(note);
    }
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

  /* =========================================================
     4. ВАЛИДАЦИЯ
     ========================================================= */
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

  /* =========================================================
     5. МОДАЛ
     ========================================================= */
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

  /* =========================================================
     6. ИЗПРАЩАНЕ КЪМ GOOGLE APPS SCRIPT (Calendar + Sheets)
     ========================================================= */
  function sendToGoogleAppsScript(payload) {
    if (!GOOGLE_SCRIPT_CONFIG.enabled ||
        !GOOGLE_SCRIPT_CONFIG.webAppUrl ||
        GOOGLE_SCRIPT_CONFIG.webAppUrl === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
      console.warn('Google Apps Script URL не е настроен!');
      return Promise.resolve({ skipped: true });
    }

    // Използваме text/plain, за да избегнем CORS пре-флайт заявки от браузъра.
    return fetch(GOOGLE_SCRIPT_CONFIG.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      console.log('Успешно изпратено към Google Apps Script!');
      return response;
    }).catch(function (err) {
      console.error('Грешка при изпращане към Google Apps Script:', err);
      throw err;
    });
  }

  /* =========================================================
     7. ЛИНКОВЕ — Google Calendar + имейл
     ========================================================= */
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
    var title = 'Тренировка с Мартин Ковачев — ' + data.serviceName;
    var details = 'Резервация за ' + data.name + '\nТелефон: ' + data.phone +
      '\nПакет: ' + data.serviceName + (data.notes ? '\nБележка: ' + data.notes : '');

    var gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(title) +
      '&dates=' + gcalDates(selectedDateOf(data), data.rawTime) +
      '&details=' + encodeURIComponent(details) +
      '&location=' + encodeURIComponent(CONFIG.location);

    var mail = 'mailto:' + CONFIG.trainerEmail +
      '?subject=' + encodeURIComponent('Нова резервация — ' + data.name) +
      '&body=' + encodeURIComponent(
        'Здравей, Мартин,\n\nБих искал/а да запазя тренировка:\n\n' +
        'Дата: ' + data.dateFormatted + '\n' +
        'Час: ' + data.time + '\n' +
        'Пакет: ' + data.serviceName + '\n' +
        'Име: ' + data.name + '\n' +
        'Телефон: ' + data.phone + '\n' +
        'Имейл: ' + data.email + '\n' +
        (data.notes ? 'Бележка: ' + data.notes + '\n' : '') +
        '\nПоздрави,\n' + data.name);

    return { gcal: gcal, mail: mail };
  }

  function selectedDateOf(data) {
    var p = data.rawDate.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /* =========================================================
     8. SUBMIT
     ========================================================= */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) {
      var firstError = form.querySelector('.has-error input, .has-error select');
      if (firstError) firstError.focus();
      else document.getElementById('calendar').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var pkgName = document.getElementById('package').value;
    var pkgInfo = PACKAGES[pkgName] || { category: 'Тренировка', price: '' };

    var payload = {
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim(),
      notes: document.getElementById('goal').value.trim(),
      categoryLabel: pkgInfo.category,
      serviceName: pkgName,
      dateFormatted: formatLong(selectedDate),
      time: selectedTime,
      rawDate: key(selectedDate),
      rawTime: selectedTime,
      duration: CONFIG.durationMin,
      price: pkgInfo.price
    };

    var submitBtn = form.querySelector('button[type="submit"]');
    var originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Изпращам…';

    sendToGoogleAppsScript(payload)
      .catch(function () { /* грешката вече е логната — показваме потвърждението */ })
      .then(function () {
        var details = document.getElementById('modal-details');
        details.innerHTML =
          '<div><b>Дата:</b> ' + payload.dateFormatted + '</div>' +
          '<div><b>Час:</b> ' + payload.time + ' ч. (' + CONFIG.durationMin + ' мин)</div>' +
          '<div><b>Пакет:</b> ' + payload.serviceName + '</div>' +
          '<div><b>Име:</b> ' + payload.name + '</div>' +
          '<div><b>Локация:</b> ' + CONFIG.location + '</div>';

        document.getElementById('modal-text').textContent =
          'Записахме часа в календара и изпратихме потвърждение на ' + payload.email +
          '. Ще се чуем на ' + payload.phone + ' за финално потвърждение.';

        var links = buildLinks(payload);
        document.getElementById('gcal-link').href = links.gcal;
        document.getElementById('mail-link').href = links.mail;

        openModal();

        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;

        var bookedDate = selectedDate;
        form.reset();
        selectedTime = null;
        updateSummary();

        // Презареждаме заетите часове, за да излезе новият час като зает.
        renderLoadingSlots();
        fetchBusySlots(key(bookedDate)).then(function () {
          if (sameDay(bookedDate, selectedDate)) renderSlots();
        });
      });
  });

  /* ---------- Старт ---------- */
  renderCalendar();
  renderSlots();
})();
