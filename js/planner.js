/* =========================================================
 * planner.js — 外站四段票規劃器
 * 6 個日期：去外站 → 第1段 → 第2段 → 第3段 → 第4段 → 回家
 * 第 2、3 段就是搜尋表單的去程、回程日期
 * ========================================================= */

let plan = null; // { code, pre, seg1, seg4, home }

// 外站短程旅遊：每個連假挑一個「請最少假、能玩 3 天以上」的方案
function tripWindows(from, to, maxLeave) {
  return holidaysBetween(from, to).map((h) => {
    const options = leaveOptions(h, maxLeave).filter((o) => o.start >= from && o.end <= to);
    return options.find((o) => o.days >= 3) || options[options.length - 1];
  }).filter(Boolean);
}

// 自動排出預設計畫：兩趟外站旅遊盡量排在連假
function defaultPlan() {
  const s = state;
  const list = results.fourseg.list;
  const maxLeave = parseInt($('#maxLeave').value, 10);
  const today = todayStr();

  // 第一趟外站：主行程出發前最接近的連假
  const before = tripWindows(addDays(today, 3), addDays(s.depart, -1), maxLeave);
  let pre, seg1;
  if (before.length) {
    const last = before[before.length - 1];
    pre = last.start;
    seg1 = last.end;
  } else {
    // 沒有連假：提早 2 天飛外站，第 1 段直接接第 2 段
    pre = addDays(s.depart, -2);
    seg1 = s.depart;
  }

  // 第二趟外站：主行程結束後、效期內請假最少又最長的連假
  const expiry = addDays(seg1, FOURSEG_VALIDITY_DAYS - 1);
  const after = tripWindows(addDays(s.ret, 7), expiry, maxLeave);
  let seg4, home;
  if (after.length) {
    const longest = after.reduce((a, b) =>
      (b.leave < a.leave || (b.leave === a.leave && b.days > a.days) ? b : a));
    seg4 = longest.start;
    home = longest.end;
  } else {
    seg4 = addDays(s.ret, 60);
    home = addDays(seg4, 3);
  }
  return { code: list[0].outstation, pre, seg1, seg4, home };
}

// 檢查計畫是否合理
function checkPlan(p) {
  const s = state;
  const today = todayStr();
  const expiry = addDays(p.seg1, FOURSEG_VALIDITY_DAYS - 1);
  const X = AIRPORTS[p.code].city;
  const checks = [];
  const add = (level, text) => checks.push({ level, text });

  if (p.pre <= today) add('err', '去外站的日期已經過了，請選擇未來的日期。');
  if (p.pre >= p.seg1) add('err', `要先飛到${X}，才能搭第 1 段回台北。`);
  else add('ok', `先飛${X}，${md(p.seg1)} 搭第 1 段回台北。`);

  if (p.seg1 > s.depart) add('err', '第 1 段必須在第 2 段（主行程出發）之前。');
  else if (p.seg1 === s.depart) add('warn', '第 1 段和第 2 段在同一天，會在台北直接轉機，請確認轉機時間足夠。');
  else add('ok', `第 1 段回台後 ${diffDays(p.seg1, s.depart)} 天出發主行程。`);

  if (p.seg4 <= s.ret) add('err', '第 4 段必須在第 3 段（主行程回國）之後。');

  const margin = diffDays(p.seg4, expiry);
  if (margin < 0) add('err', `第 4 段超過效期！必須在 ${md(expiry)} 前搭乘（自第 1 段起算 1 年）。`);
  else if (margin < 30) add('warn', `第 4 段離效期截止（${md(expiry)}）只剩 ${margin} 天，航班變動時沒有緩衝。`);
  else add('ok', `第 4 段在效期內，距離截止日 ${md(expiry)} 還有 ${margin} 天。`);

  if (p.home <= p.seg4) add('err', `回家的日期必須在第 4 段之後。`);

  return { checks, expiry };
}

// 計算每趟旅行要請幾天假
function leaveSummary(p) {
  const s = state;
  const X = AIRPORTS[p.code].city;
  const trips = [
    { name: `外站遊①　${X}`, start: p.pre, end: p.seg1, cls: 'g-trip' },
    { name: `主行程　${AIRPORTS[s.dest].city}`, start: s.depart, end: s.ret, cls: 'g-main' },
    { name: `外站遊②　${X}`, start: p.seg4, end: p.home, cls: 'g-trip' },
  ];
  for (const t of trips) {
    t.valid = t.start <= t.end;
    t.days = t.valid ? diffDays(t.start, t.end) + 1 : 0;
    t.leave = t.valid ? workdaysBetween(t.start, t.end) : 0;
    t.holidays = t.valid ? holidaysBetween(t.start, t.end).map((h) => h.name) : [];
  }
  return trips;
}

// 甘特圖：一整年一目了然
function ganttHtml(p, trips, expiry) {
  const from = addDays([todayStr(), p.pre].sort()[0], -7);
  const to = addDays([p.home, expiry].sort()[1], 14);
  const span = diffDays(from, to);
  const pos = (d) => (diffDays(from, d) / span) * 100;
  const width = (a, b) => Math.max(((diffDays(a, b) + 1) / span) * 100, 0.8);

  // 月份刻度
  let months = '';
  let m = `${from.slice(0, 7)}-01`;
  if (m < from) m = addDays(`${m.slice(0, 8)}28`, 4).slice(0, 7) + '-01';
  for (; m <= to; m = addDays(`${m.slice(0, 8)}28`, 4).slice(0, 7) + '-01') {
    const label = m.slice(5, 7) === '01' ? `${m.slice(0, 4)}/1` : `${+m.slice(5, 7)}月`;
    months += `<span style="left:${pos(m)}%">${label}</span>`;
  }

  const holidayMarks = holidaysBetween(from, to)
    .map((h) => `<i class="g-hol" style="left:${pos(h.start)}%;width:${width(h.start, h.end)}%" title="${h.name}"></i>`)
    .join('');
  const todayLine = `<i class="g-today" style="left:${pos(todayStr())}%"></i>`;
  const validity = `<i class="g-valid" style="left:${pos(p.seg1)}%;width:${width(p.seg1, expiry)}%"></i>`;

  return `
    <div class="gantt" role="img" aria-label="四段票全年行程圖">
      <div class="g-row g-axis"><span></span><div class="g-track">${months}</div></div>
      ${trips.map((t, i) => `
        <div class="g-row">
          <span class="g-label">${t.name}</span>
          <div class="g-track">
            ${i === 2 ? validity : ''}${holidayMarks}${todayLine}
            ${t.valid ? `<b class="g-bar ${t.cls}" style="left:${pos(t.start)}%;width:${width(t.start, t.end)}%"
                 title="${md(t.start)} → ${md(t.end)}"></b>` : ''}
          </div>
        </div>`).join('')}
    </div>
    <div class="strip-legend">
      <span><i class="lg-box g-trip"></i>外站旅遊</span>
      <span><i class="lg-box g-main"></i>主行程</span>
      <span><i class="lg-box g-valid"></i>四段票效期</span>
      <span><i class="lg-box g-hol"></i>國定連假</span>
      <span><i class="lg-box g-today"></i>今天</span>
    </div>`;
}

// 產生行事曆檔（.ics），可匯入 Google 日曆、iPhone 行事曆
function downloadIcs(p) {
  const s = state;
  const X = AIRPORTS[p.code].city;
  const O = AIRPORTS[s.origin].city;
  const D = AIRPORTS[s.dest].city;
  const events = [
    [p.pre, `✈ 飛往${X}（廉航）`],
    [p.seg1, `✈ 四段票第1段 ${X}→台北`],
    [s.depart, `✈ 四段票第2段 台北→${D}`],
    [s.ret, `✈ 四段票第3段 ${D}→台北`],
    [p.seg4, `✈ 四段票第4段 台北→${X}`],
    [p.home, `✈ ${X}→${O}（廉航）`],
  ];
  const ymd = (d) => d.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FlyCompare//ZH-TW', 'CALSCALE:GREGORIAN'];
  events.forEach(([d, title], i) => {
    lines.push('BEGIN:VEVENT', `UID:fourseg-${ymd(d)}-${i}@flycompare`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(addDays(d, 1))}`,
      `SUMMARY:${title}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `四段票行程-${p.code}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// 規劃器外框（輸入欄位），只在重新搜尋時重畫，避免打字時失去焦點
function plannerShellHtml() {
  const s = state;
  const list = results.fourseg.list;
  return `
    <section class="planner">
      <h2 class="panel-title">🗓️ 四段票規劃器</h2>
      <p class="muted">已依台灣連假自動排好日期，可自行修改。第 2、3 段就是上方搜尋的去回程日期。</p>
      <div class="planner-form">
        <label class="field"><span>外站</span>
          <select id="plCode">${list.map((o) => `<option value="${o.outstation}" ${o.outstation === plan.code ? 'selected' : ''}>
            ${cityName(o.outstation)}（${money(o.total)}）</option>`).join('')}</select></label>
        <label class="field"><span>① 飛往外站</span><input type="date" id="plPre" value="${plan.pre}"></label>
        <label class="field"><span>② 第 1 段 外站→台北</span><input type="date" id="plSeg1" value="${plan.seg1}"></label>
        <label class="field"><span>③ 第 2 段 台北→${AIRPORTS[s.dest].city}</span><input type="date" value="${s.depart}" disabled></label>
        <label class="field"><span>④ 第 3 段 ${AIRPORTS[s.dest].city}→台北</span><input type="date" value="${s.ret}" disabled></label>
        <label class="field"><span>⑤ 第 4 段 台北→外站</span><input type="date" id="plSeg4" value="${plan.seg4}"></label>
        <label class="field"><span>⑥ 外站→回家</span><input type="date" id="plHome" value="${plan.home}"></label>
      </div>
      <div id="plannerOut"></div>
    </section>`;
}

// 規劃結果（檢查、請假統計、甘特圖、連假建議）
function renderPlannerOut() {
  const s = state;
  const p = plan;
  const { checks, expiry } = checkPlan(p);
  const trips = leaveSummary(p);
  const totalLeave = trips.reduce((a, t) => a + t.leave, 0);
  const maxLeave = parseInt($('#maxLeave').value, 10);
  const icon = { ok: '✅', warn: '⚠️', err: '✖' };

  // 可選的連假（點一下就套用）
  const beforeChips = tripWindows(addDays(todayStr(), 3), addDays(s.depart, -1), maxLeave);
  const afterChips = tripWindows(addDays(s.ret, 1), expiry, maxLeave);
  const chip = (o, which) => `
    <button class="chip" data-plan="${which}" data-start="${o.start}" data-end="${o.end}">
      ${o.holiday.name} ${mdShort(o.start)}–${mdShort(o.end)}
      · ${o.leave ? `請 ${o.leave} 天` : '免請假'} · ${o.days} 天
    </button>`;

  $('#plannerOut').innerHTML = `
    <ul class="checks">
      ${checks.map((c) => `<li class="check-${c.level}">${icon[c.level]} ${c.text}</li>`).join('')}
    </ul>

    ${ganttHtml(p, trips, expiry)}

    <div class="table-scroll">
    <table class="leave-table">
      <thead><tr><th>旅程</th><th>日期</th><th>天數</th><th>需請假</th><th>碰到的連假</th></tr></thead>
      <tbody>
        ${trips.map((t) => `<tr>
          <td><b>${t.name}</b></td>
          <td>${t.valid ? `${md(t.start)} → ${md(t.end)}` : '<span class="verdict bad">日期順序錯誤</span>'}</td>
          <td>${t.days} 天</td>
          <td>${t.leave} 天</td>
          <td>${t.holidays.join('、') || '<span class="muted">—</span>'}</td>
        </tr>`).join('')}
        <tr class="sum"><td>合計</td><td></td><td>${trips.reduce((a, t) => a + t.days, 0)} 天</td>
          <td>${totalLeave} 天</td><td></td></tr>
      </tbody>
    </table>
    </div>

    <div class="chip-group">
      <p><b>外站遊① 可選的連假</b>（主行程出發前）</p>
      ${beforeChips.length ? beforeChips.map((o) => chip(o, 'first')).join('')
        : '<p class="muted small">出發前沒有連假，建議提早 1–2 天飛外站，第 1 段直接接第 2 段。</p>'}
    </div>
    <div class="chip-group">
      <p><b>外站遊② 可選的連假</b>（效期內，${md(expiry)} 前）</p>
      ${afterChips.length ? afterChips.map((o) => chip(o, 'second')).join('')
        : '<p class="muted small">效期內沒有合適的連假。</p>'}
    </div>

    <button class="btn-small" id="plIcs">📅 下載到行事曆（.ics）</button>
    <button class="btn-small btn-ghost" id="plReset">↺ 重新自動排程</button>`;
}

function bindPlanner() {
  const read = () => {
    plan = {
      code: $('#plCode').value,
      pre: $('#plPre').value,
      seg1: $('#plSeg1').value,
      seg4: $('#plSeg4').value,
      home: $('#plHome').value,
    };
    if (Object.values(plan).every(Boolean)) renderPlannerOut();
  };
  ['#plCode', '#plPre', '#plSeg1', '#plSeg4', '#plHome'].forEach((id) =>
    $(id).addEventListener('change', read));

  $('#plannerOut').addEventListener('click', (e) => {
    const c = e.target.closest('[data-plan]');
    if (c) {
      if (c.dataset.plan === 'first') {
        $('#plPre').value = c.dataset.start;
        $('#plSeg1').value = c.dataset.end;
      } else {
        $('#plSeg4').value = c.dataset.start;
        $('#plHome').value = c.dataset.end;
      }
      read();
    }
    if (e.target.id === 'plIcs') downloadIcs(plan);
    if (e.target.id === 'plReset') {
      plan = { ...defaultPlan(), code: plan.code };
      renderFourSeg();
    }
  });
}
