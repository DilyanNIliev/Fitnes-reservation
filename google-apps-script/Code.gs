/**
 * Google Apps Script — резервации за фитнес тренировки
 * ====================================================
 * Свързва сайта с Google Calendar (и по избор Google Sheets).
 *
 * Контракт със сайта (js/booking.js):
 *   GET  ?date=YYYY-MM-DD   ->  { status: "success", busySlots: ["10:00", "18:00"] }
 *   POST (text/plain, JSON) ->  създава събитие в Календара + ред в таблицата
 *
 * Инсталация:
 *   1. script.google.com -> New project -> постави този код
 *   2. Смени CALENDAR_ID, SHEET_ID и TRAINER_EMAIL по-долу
 *   3. Deploy -> New deployment -> Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *   4. Копирай Web App URL в js/booking.js -> GOOGLE_SCRIPT_CONFIG.webAppUrl
 */

/* ---------- Настройки ---------- */
var CALENDAR_ID   = 'primary';                  // или ID на отделен календар
var SHEET_ID      = '';                         // ID на Google Sheet (празно = без таблица)
var TRAINER_EMAIL = 'hello@martinkovachev.bg';  // за известие към треньора
var LOCATION      = 'Fit Studio, бул. „Витоша“ 100, София';
var SLOT_MINUTES  = 60;                         // тренировките са през 1 час

// Часовете по график — трябва да съвпадат с CONFIG.hours в js/booking.js.
// 0 = неделя, 1 = понеделник ... 6 = събота.
var WORKING_HOURS = {
  0: [],
  1: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
  2: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
  3: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
  4: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00', '20:00'],
  5: ['07:00', '08:00', '09:00', '10:00', '17:00', '18:00', '19:00'],
  6: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00']
};

/* =========================================================
   GET — кои часове са заети за дадена дата
   ========================================================= */
function doGet(e) {
  try {
    var dateStr = e && e.parameter ? e.parameter.date : null;
    if (!dateStr) {
      return jsonOutput({ status: 'error', message: 'Липсва параметър date' });
    }

    var parts = dateStr.split('-');
    var dayStart = new Date(+parts[0], +parts[1] - 1, +parts[2], 0, 0, 0);
    var dayEnd   = new Date(+parts[0], +parts[1] - 1, +parts[2], 23, 59, 59);

    var calendar = CALENDAR_ID === 'primary'
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(CALENDAR_ID);

    var events = calendar.getEvents(dayStart, dayEnd);
    var slots = WORKING_HOURS[dayStart.getDay()] || [];
    var busySlots = [];

    slots.forEach(function (slot) {
      var hm = slot.split(':');
      var slotStart = new Date(dayStart);
      slotStart.setHours(+hm[0], +hm[1], 0, 0);
      var slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60000);

      // Часът е зает, ако се застъпва с каквото и да е събитие в календара.
      var taken = events.some(function (ev) {
        return ev.getStartTime() < slotEnd && ev.getEndTime() > slotStart;
      });

      if (taken) busySlots.push(slot);
    });

    return jsonOutput({ status: 'success', date: dateStr, busySlots: busySlots });
  } catch (err) {
    return jsonOutput({ status: 'error', message: String(err) });
  }
}

/* =========================================================
   POST — записва резервацията
   ========================================================= */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var parts = data.rawDate.split('-');
    var hm = data.rawTime.split(':');
    var start = new Date(+parts[0], +parts[1] - 1, +parts[2], +hm[0], +hm[1], 0);
    var end = new Date(start.getTime() + (data.duration || SLOT_MINUTES) * 60000);

    var calendar = CALENDAR_ID === 'primary'
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(CALENDAR_ID);

    // Защита от двойна резервация: ако часът вече е зает, връщаме грешка.
    var overlapping = calendar.getEvents(start, end);
    if (overlapping.length > 0) {
      return jsonOutput({ status: 'error', message: 'Часът вече е зает' });
    }

    var title = data.serviceName + ' — ' + data.name;
    var description =
      'Име: ' + data.name + '\n' +
      'Телефон: ' + data.phone + '\n' +
      'Имейл: ' + data.email + '\n' +
      'Пакет: ' + data.serviceName + ' (' + data.categoryLabel + ')\n' +
      'Цена: ' + data.price + ' лв.\n' +
      'Бележка: ' + (data.notes || '—');

    calendar.createEvent(title, start, end, {
      description: description,
      location: LOCATION,
      guests: data.email,
      sendInvites: true
    });

    if (SHEET_ID) {
      SpreadsheetApp.openById(SHEET_ID).getSheets()[0].appendRow([
        new Date(), data.name, data.phone, data.email,
        data.categoryLabel, data.serviceName,
        data.dateFormatted, data.time, data.price, data.notes || ''
      ]);
    }

    // Известие към треньора
    if (TRAINER_EMAIL) {
      MailApp.sendEmail({
        to: TRAINER_EMAIL,
        subject: 'Нова резервация — ' + data.name + ', ' + data.dateFormatted + ' ' + data.time,
        body: description + '\n\nДата: ' + data.dateFormatted + ', ' + data.time + ' ч.'
      });
    }

    // Потвърждение към клиента
    if (data.email) {
      MailApp.sendEmail({
        to: data.email,
        subject: 'Потвърдена тренировка — ' + data.dateFormatted + ', ' + data.time + ' ч.',
        body: 'Здравей, ' + data.name + ',\n\n' +
              'Часът ти е запазен:\n\n' +
              'Дата: ' + data.dateFormatted + '\n' +
              'Час: ' + data.time + ' ч. (' + (data.duration || SLOT_MINUTES) + ' мин)\n' +
              'Пакет: ' + data.serviceName + '\n' +
              'Локация: ' + LOCATION + '\n\n' +
              'Ако нещо изникне, отмени най-късно 12 часа преди тренировката.\n\n' +
              'До скоро,\nМартин'
      });
    }

    return jsonOutput({ status: 'success' });
  } catch (err) {
    return jsonOutput({ status: 'error', message: String(err) });
  }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
