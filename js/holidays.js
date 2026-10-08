/* =========================================================
 * holidays.js — 日期工具、台灣連假、請假最佳化
 * 日期一律用 "YYYY-MM-DD" 字串，避免時區造成差一天
 * ========================================================= */

// ---------- 日期工具 ----------
const DAY_MS = 86400000;
const WEEK = '日一二三四五六';
const pad2 = (n) => String(n).padStart(2, '0');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function toUTC(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (str, n) => fromUTC(toUTC(str) + n * DAY_MS);
const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
const weekday = (str) => new Date(toUTC(str)).getUTCDay();

// 10/9（五）
const md = (str) => `${+str.slice(5, 7)}/${+str.slice(8, 10)}（${WEEK[weekday(str)]}）`;
const mdShort = (str) => `${+str.slice(5, 7)}/${+str.slice(8, 10)}`;

// ---------- 假日判斷 ----------
const HOLIDAY_SET = new Set();
for (const h of HOLIDAYS) {
  for (let d = h.start; d <= h.end; d = addDays(d, 1)) HOLIDAY_SET.add(d);
}

function isWeekend(str) {
  const w = weekday(str);
  return w === 0 || w === 6;
}
const isOff = (str) => isWeekend(str) || HOLIDAY_SET.has(str);

// 區間內要上班（需請假）的天數
function workdaysBetween(a, b) {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (!isOff(d)) n++;
  return n;
}

// 連假出發的票價倍率（連假前 2 天出發也算旺季）
function holidayFactor(depart) {
  for (const h of HOLIDAYS) {
    if (depart >= addDays(h.start, -2) && depart <= h.end) return h.peak || HOLIDAY_PEAK;
  }
  return 1;
}

// 某段期間內的連假
const holidaysBetween = (from, to) => HOLIDAYS.filter((h) => h.end >= from && h.start <= to);

// ---------- 請假最佳化 ----------
// 針對一個連假，算出「請 0 ~ maxLeave 天假」最多能連休幾天
function leaveOptions(h, maxLeave) {
  const options = [];
  for (let k = 0; k <= maxLeave; k++) {
    let best = null;
    for (let s = -9; s <= 0; s++) {
      for (let e = 0; e <= 9; e++) {
        const start = addDays(h.start, s);
        const end = addDays(h.end, e);
        const days = diffDays(start, end) + 1;
        if (days > 16) continue;
        const leave = workdaysBetween(start, end);
        if (leave > k) continue;
        if (!best || days > best.days || (days === best.days && leave < best.leave)) {
          best = { start, end, days, leave };
        }
      }
    }
    // 多請一天假卻沒有多放幾天，就不列出
    if (best && (!options.length || best.days > options[options.length - 1].days)) {
      options.push({ ...best, holiday: h });
    }
  }
  return options;
}

// 小日曆：每一天一格，顯示假日／週末／請假
function dayStrip(start, end) {
  let html = '<span class="day-strip">';
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const cls = HOLIDAY_SET.has(d) ? 'd-hol' : isWeekend(d) ? 'd-wkd' : 'd-leave';
    const tip = cls === 'd-hol' ? '國定假日' : cls === 'd-wkd' ? '週末' : '請假';
    html += `<i class="${cls}" title="${md(d)} ${tip}">${WEEK[weekday(d)]}</i>`;
  }
  return html + '</span>';
}

// ---------- 畫面：連假攻略 ----------
function renderHolidays() {
  const s = state;
  const box = $('#holidayContent');
  const maxLeave = parseInt($('#maxLeave').value, 10);
  const from = addDays(todayStr(), 1);
  const minDays = MIN_TRIP_DAYS[AIRPORTS[s.dest].region];

  // 每個請假方案，都用目前航線算一次票價
  const groups = [];
  for (const h of holidaysBetween(from, addDays(from, 365))) {
    const rows = [];
    for (const o of leaveOptions(h, maxLeave)) {
      if (o.start < from) continue;
      const trial = { ...s, trip: 'RT', depart: o.start, ret: o.end };
      const cash = [...searchDirect(trial), ...searchTransfer(trial)];
      if (!cash.length) continue;
      const best = cash.reduce((a, b) => (a.total < b.total ? a : b));
      rows.push({ ...o, best, perDay: best.total / o.days, short: o.days < minDays });
    }
    if (rows.length) groups.push({ h, rows });
  }

  const all = groups.flatMap((g) => g.rows).filter((r) => !r.short);
  if (!all.length) {
    box.innerHTML = `<p class="empty">未來一年沒有足夠天數的連假可以飛${AIRPORTS[s.dest].city}（建議至少 ${minDays} 天），
      試試把「最多請幾天假」調高。</p>`;
    return;
  }
  const cheapest = all.reduce((a, b) => (a.best.total < b.best.total ? a : b));
  const bestValue = all.reduce((a, b) => (a.perDay < b.perDay ? a : b));

  const applyBtn = (r) =>
    `<button class="btn-small" data-apply data-depart="${r.start}" data-ret="${r.end}">套用這個日期</button>`;

  box.innerHTML = `
    <h2 class="panel-title">${cityName(s.origin)} → ${cityName(s.dest)} 連假攻略</h2>
    <p class="muted">未來一年的台灣連假，搭配請假能連休幾天、全家（${paxText(s)}）最低票價多少。
      飛${AIRPORTS[s.dest].city}建議至少 ${minDays} 天。</p>

    <div class="pick-grid">
      <div class="pick-card">
        <span class="pick-tag">⭐ 每天最划算</span>
        <h3>${bestValue.holiday.name}</h3>
        <p>${md(bestValue.start)} → ${md(bestValue.end)}<br>
           ${bestValue.leave ? `請 ${bestValue.leave} 天假，` : '不用請假，'}連休 <b>${bestValue.days}</b> 天</p>
        ${dayStrip(bestValue.start, bestValue.end)}
        <p class="pick-price">${money(bestValue.best.total)} <small>· 每天 ${money(bestValue.perDay)}</small></p>
        ${applyBtn(bestValue)}
      </div>
      <div class="pick-card">
        <span class="pick-tag">💰 總價最省</span>
        <h3>${cheapest.holiday.name}</h3>
        <p>${md(cheapest.start)} → ${md(cheapest.end)}<br>
           ${cheapest.leave ? `請 ${cheapest.leave} 天假，` : '不用請假，'}連休 <b>${cheapest.days}</b> 天</p>
        ${dayStrip(cheapest.start, cheapest.end)}
        <p class="pick-price">${money(cheapest.best.total)} <small>· 每天 ${money(cheapest.perDay)}</small></p>
        ${applyBtn(cheapest)}
      </div>
    </div>

    <div class="strip-legend">
      <span><i class="d-hol">日</i>國定假日</span>
      <span><i class="d-wkd">日</i>週末</span>
      <span><i class="d-leave">日</i>需請假</span>
    </div>

    ${groups.map(({ h, rows }) => `
      <section class="holiday-card">
        <header>
          <h3>${h.name}</h3>
          <span class="muted">${md(h.start)}${h.end !== h.start ? ` – ${md(h.end)}` : ''}
            · 票價約漲 ${Math.round(((h.peak || HOLIDAY_PEAK) - 1) * 100)}%</span>
        </header>
        <div class="table-scroll">
        <table class="holiday-table">
          <thead><tr><th>請假</th><th>日期</th><th>連休</th><th>全家最低票價</th><th>每天</th><th></th></tr></thead>
          <tbody>
          ${rows.map((r) => `
            <tr class="${r.short ? 'is-short' : ''}">
              <td><b>${r.leave ? `請 ${r.leave} 天` : '不用請'}</b></td>
              <td>${md(r.start)} → ${md(r.end)}<br>${dayStrip(r.start, r.end)}</td>
              <td><b>${r.days} 天</b>${r.leave ? `<br><small class="muted">1 天假換 ${(r.days / r.leave).toFixed(1)} 天</small>` : ''}</td>
              <td>${money(r.best.total)}<br><small class="muted">${AIRLINES[r.best.airline].name} · ${TYPE_LABEL[r.best.type]}</small></td>
              <td>${money(r.perDay)}</td>
              <td>${r.short ? `<small class="muted">⚠️ 天數偏短</small>` : applyBtn(r)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        </div>
      </section>`).join('')}

    <p class="muted small">連假日期依法規推算，請以行政院人事行政總處公告為準。可在 js/data.js 的 HOLIDAYS 修改。</p>`;
}
