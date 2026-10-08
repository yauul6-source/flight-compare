/* =========================================================
 * app.js — 比價邏輯與畫面
 * 流程：讀取表單 → 計算四種購買方式 → 畫出各分頁
 * ========================================================= */

// ---------- 小工具 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// 由文字產生「固定的亂數」：同樣的航線與日期，每次都得到同樣的價格
function hashStr(str) {
  let h = 2166136261;
  for (const ch of str) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand(key) {
  let t = hashStr(key) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // 0 ~ 1
}

// 兩個機場之間的直線距離（公里）
function distKm(a, b) {
  const A = AIRPORTS[a], B = AIRPORTS[b];
  const toRad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * toRad;
  const dLon = (B.lon - A.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(A.lat * toRad) * Math.cos(B.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// 依距離估算經濟艙來回基本票價
function baseFare(km) {
  return 4000 + 9 * Math.pow(km, 0.85);
}

const round10 = (n) => Math.round(n / 10) * 10;
const money = (n) => 'NT$ ' + Math.round(n).toLocaleString('zh-TW');
const pct = (n) => Math.round(Math.abs(n) * 100) + '%';
const cityName = (code) => `${AIRPORTS[code].city} ${code}`;
const flightHours = (km) => km / 800 + 0.5;

function fmtHours(h) {
  let hh = Math.floor(h);
  let mm = Math.round(((h - hh) * 60) / 5) * 5;
  if (mm === 60) { hh += 1; mm = 0; }
  return mm ? `${hh} 小時 ${mm} 分` : `${hh} 小時`;
}

// 依人數換算成「幾張大人票」
function paxUnits(s) {
  return s.adults + s.children * CHILD_RATE + s.infants * INFANT_RATE;
}
function paxText(s) {
  const parts = [`${s.adults} 位大人`];
  if (s.children) parts.push(`${s.children} 位兒童`);
  if (s.infants) parts.push(`${s.infants} 位嬰兒`);
  return parts.join('、');
}

const departMonth = (s) => parseInt(s.depart.slice(5, 7), 10) - 1;

// ---------- 外部查詢連結 ----------
function googleFlightsLink(s, from, to) {
  let q = `Flights from ${from} to ${to} on ${s.depart}`;
  if (s.trip === 'RT') q += ` through ${s.ret}`;
  return 'https://www.google.com/travel/flights?hl=zh-TW&curr=TWD&q=' + encodeURIComponent(q);
}
function skyscannerLink(s, from, to) {
  const yymmdd = (d) => d.slice(2).replace(/-/g, '');
  let url = `https://www.skyscanner.com.tw/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${yymmdd(s.depart)}/`;
  if (s.trip === 'RT') url += `${yymmdd(s.ret)}/`;
  url += `?adultsv2=${s.adults}`;
  const ages = [...Array(s.children).fill(8), ...Array(s.infants).fill(1)];
  if (ages.length) url += `&childrenv2=${ages.join('%7C')}`;
  return url;
}
function linksHtml(s, from, to) {
  return `
    <a href="${googleFlightsLink(s, from, to)}" target="_blank" rel="noopener">Google Flights ↗</a>
    <a href="${skyscannerLink(s, from, to)}" target="_blank" rel="noopener">Skyscanner ↗</a>`;
}

// ---------- 計算票價 ----------

// 每位大人的現金票價（淡旺季 × 連假 × 隨機波動）
function cashFare(code, km, s, key, factor = 1) {
  const noise = 0.9 + 0.2 * rand(key + s.depart + s.ret);
  let price = baseFare(km) * AIRLINES[code].mult * SEASON[departMonth(s)] *
    holidayFactor(s.depart) * noise * factor;
  if (s.trip === 'OW') price *= ONE_WAY_RATE;
  return round10(price);
}

// 1. 直飛
function searchDirect(s) {
  const airlines = (DIRECT[s.origin] || {})[s.dest] || [];
  const km = distKm(s.origin, s.dest);
  return airlines.map((code) => {
    const perAdult = cashFare(code, km, s, `D${s.origin}${s.dest}${code}`);
    return {
      type: 'direct', airline: code, route: [s.origin, s.dest],
      hours: flightHours(km), perAdult, total: perAdult * paxUnits(s),
    };
  });
}

// 2. 轉機
function searchTransfer(s) {
  const d0 = distKm(s.origin, s.dest);
  const list = [];
  for (const { hub, airline } of HUBS) {
    if (hub === s.origin || hub === s.dest) continue;
    const d1 = distKm(s.origin, hub);
    const d2 = distKm(hub, s.dest);
    const detour = (d1 + d2) / d0;
    if (detour > MAX_DETOUR) continue; // 繞太遠，不合理

    const layover = 1.5 + rand(`L${s.origin}${hub}${s.dest}`) * 3;
    const factor = TRANSFER_DISCOUNT * (1 + (detour - 1) * 0.5);
    const perAdult = cashFare(airline, d0, s, `T${s.origin}${hub}${s.dest}${airline}`, factor);
    list.push({
      type: 'transfer', airline, route: [s.origin, hub, s.dest],
      hours: flightHours(d1) + flightHours(d2) + layover, layover,
      perAdult, total: perAdult * paxUnits(s),
    });
  }
  return list.sort((a, b) => a.perAdult - b.perAdult).slice(0, 5);
}

// 3. 外站四段票：外站 → 台北 → 目的地 → 台北 → 外站
function searchFourSeg(s) {
  if (s.trip === 'OW') return { list: [], reason: '外站四段票是來回票，請選擇「來回」行程。' };
  const carriers = (DIRECT.TPE[s.dest] || []).filter((c) => c === 'CI' || c === 'BR');
  if (!carriers.length) return { list: [], reason: '華航、長榮沒有從台北直飛這個目的地，無法組成四段票。' };

  const stations = s.outstation === 'ALL'
    ? OUTSTATIONS
    : OUTSTATIONS.filter((o) => o.code === s.outstation);

  const list = [];
  for (const st of stations) {
    const X = st.code;
    if (X === s.dest || X === s.origin) continue;

    // 主票：選華航或長榮中比較便宜的
    const km = distKm(X, 'TPE') + distKm('TPE', s.dest);
    const options = carriers.map((c) => ({
      airline: c, fare: cashFare(c, km, s, `F${X}${s.dest}${c}`, st.factor),
    }));
    const best = options.sort((a, b) => a.fare - b.fare)[0];

    // 先用廉航飛去外站（來回）
    const posNoise = 0.9 + 0.2 * rand(`P${s.origin}${X}`);
    const positioning = round10(baseFare(distKm(s.origin, X)) * POSITIONING_RATE * posNoise);
    // 高雄/台中出發要先搭高鐵到桃園
    const rail = HSR_ROUND_TRIP[s.origin] || 0;

    const units = paxUnits(s);
    const total = (best.fare + positioning) * units + rail * (s.adults + s.children * 0.5);
    list.push({
      type: 'fourseg', airline: best.airline, outstation: X,
      route: [X, 'TPE', s.dest, 'TPE', X],
      fare: best.fare, positioning, rail,
      perAdult: best.fare + positioning + rail, total,
    });
  }
  list.sort((a, b) => a.total - b.total);
  if (!list.length) return { list, reason: '所選外站與出發地或目的地相同，請換一個外站。' };
  return { list, reason: '' };
}

// 4. 里程兌換
function searchMiles(s, cashOptions, mileValue) {
  const km = distKm(s.origin, s.dest);
  const band = AWARD_BANDS.find((b) => km <= b.maxKm);
  const flown = new Set(cashOptions.map((o) => o.airline));
  const oneWay = s.trip === 'OW';

  return MILEAGE_PROGRAMS
    .filter((p) => p.airlines.some((a) => flown.has(a)))
    .map((p) => {
      let milesAdult = Math.round((band.miles * p.mult) / 500) * 500;
      if (oneWay) milesAdult = Math.round(milesAdult / 2 / 500) * 500;
      const milesTotal = Math.round(milesAdult * paxUnits(s));

      const taxAdult = round10(REGION_TAX[AIRPORTS[s.dest].region] * p.surcharge * (oneWay ? 0.6 : 1));
      const taxTotal = taxAdult * (s.adults + s.children) + taxAdult * INFANT_RATE * s.infants;

      return {
        type: 'miles', program: p, airline: p.airlines.find((a) => flown.has(a)),
        partners: p.airlines.filter((a) => flown.has(a)),
        milesAdult, milesTotal, taxAdult, taxTotal,
        perAdult: milesAdult * mileValue + taxAdult,
        total: milesTotal * mileValue + taxTotal,
      };
    })
    .sort((a, b) => a.total - b.total);
}

// ---------- 狀態 ----------
let state = null;     // 目前的搜尋條件
let results = null;   // 計算結果
let activeFilter = 'all';
const balances = {};  // 使用者輸入的里程餘額

function readForm() {
  return {
    trip: document.querySelector('input[name="trip"]:checked').value,
    origin: $('#origin').value,
    dest: $('#dest').value,
    depart: $('#depart').value,
    ret: $('#return').value,
    adults: parseInt($('#adults').value, 10) || 0,
    children: parseInt($('#children').value, 10) || 0,
    infants: parseInt($('#infants').value, 10) || 0,
    outstation: $('#outstation').value,
  };
}

function validate(s) {
  const errors = [];
  if (s.origin === s.dest) errors.push('出發地和目的地不能相同。');
  if (!s.depart) errors.push('請選擇去程日期。');
  if (s.trip === 'RT' && !s.ret) errors.push('請選擇回程日期。');
  if (s.trip === 'RT' && s.ret && s.ret < s.depart) errors.push('回程日期不能早於去程日期。');
  if (s.adults < 1) errors.push('至少需要 1 位大人。');
  if (s.infants > s.adults) errors.push('每位大人最多只能帶 1 位嬰兒。');
  if (s.adults + s.children > 9) errors.push('大人加兒童最多 9 位。');
  return errors;
}

function runSearch() {
  const s = readForm();
  const errors = validate(s);
  const box = $('#formError');
  if (errors.length) {
    box.textContent = errors.join(' ');
    box.hidden = false;
    return;
  }
  box.hidden = true;
  state = s;
  plan = null; // 換了搜尋條件，四段票規劃器重新自動排程

  const direct = searchDirect(s);
  const transfer = searchTransfer(s);
  const fourseg = searchFourSeg(s);
  results = { direct, transfer, fourseg };
  recalcMiles();
  renderAll();
}

// 里程會因「1 哩價值」改變而重算
function recalcMiles() {
  const mileValue = parseFloat($('#mileValue').value) || 0;
  results.miles = searchMiles(state, [...results.direct, ...results.transfer], mileValue);
  results.mileValue = mileValue;
}

function cheapestCash() {
  const cash = [...results.direct, ...results.transfer];
  return cash.length ? cash.reduce((a, b) => (a.total < b.total ? a : b)) : null;
}

// ---------- 畫面：摘要 ----------
function renderSummary() {
  const s = state;
  refreshTrueCost();
  const best = (arr) => (arr.length ? arr.reduce((a, b) => (priceOf(a) < priceOf(b) ? a : b)) : null);
  const tiles = [
    { label: '直飛最低', item: best(results.direct), cls: 'direct' },
    { label: '轉機最低', item: best(results.transfer), cls: 'transfer' },
    { label: '外站四段票最低', item: best(results.fourseg.list), cls: 'fourseg' },
    { label: '里程兌換（等值現金）', item: best(results.miles), cls: 'miles' },
  ];
  const all = tiles.filter((t) => t.item);
  const overall = all.length ? all.reduce((a, b) => (priceOf(a.item) < priceOf(b.item) ? a : b)) : null;

  $('#summary').innerHTML = `
    <p class="summary-title">
      ${cityName(s.origin)} → ${cityName(s.dest)} ·
      ${s.trip === 'RT' ? `來回 ${s.depart} ～ ${s.ret}` : `單程 ${s.depart}`} · ${paxText(s)}
    </p>
    ${tiles.map((t) => `
      <div class="stat-tile ${t === overall ? 'is-best' : ''}">
        <span class="badge badge-${t.cls}">${t.label}</span>
        <strong>${t.item ? money(priceOf(t.item)) : '—'}</strong>
        <small>${!t.item ? '此條件下無選項' : useTrueCost() ? '全家真實總成本' : '全家票價總計'}</small>
        ${t === overall ? '<em class="best-flag">★ 最划算</em>' : ''}
      </div>`).join('')}
  `;
}

// ---------- 畫面：比價結果 ----------
const TYPE_LABEL = { direct: '直飛', transfer: '轉機', fourseg: '外站四段票', miles: '里程兌換' };

function resultCard(o, isBest) {
  const s = state;
  let title, routeText, meta, priceNote, links;

  if (o.type === 'direct' || o.type === 'transfer') {
    title = AIRLINES[o.airline].name;
    routeText = o.route.join(' → ');
    meta = o.type === 'direct'
      ? `單程約 ${fmtHours(o.hours)} · 不需轉機`
      : `單程約 ${fmtHours(o.hours)} · 在 ${AIRPORTS[o.route[1]].city} 轉機（候機約 ${fmtHours(o.layover)}）`;
    if (AIRLINES[o.airline].lcc) meta += ' · 廉航，不含托運行李與餐點';
    priceNote = `每位大人 ${money(o.perAdult)}`;
    links = linksHtml(s, s.origin, s.dest);
  } else if (o.type === 'fourseg') {
    title = `${AIRLINES[o.airline].name} · 外站：${AIRPORTS[o.outstation].city}`;
    routeText = o.route.join(' → ');
    meta = `含飛往外站的廉航來回 ${money(o.positioning)}/人${o.rail ? `、高鐵 ${money(o.rail)}/人` : ''} · 加送 2 趟${AIRPORTS[o.outstation].city}旅遊`;
    priceNote = `每位大人 ${money(o.perAdult)}`;
    links = `<a href="#" data-goto="fourseg">看四段票詳情 →</a>`;
  } else {
    title = `${o.program.name}（${o.program.owner}）`;
    routeText = `${s.origin} → ${s.dest} · 可兌換：${o.partners.map((a) => AIRLINES[a].name).join('、')}`;
    meta = `${o.milesTotal.toLocaleString('zh-TW')} 哩 + 稅金 ${money(o.taxTotal)} · 以 1 哩 = NT$ ${results.mileValue} 換算`;
    priceNote = '等值現金';
    links = `<a href="#" data-goto="miles">看里程詳情 →</a>`;
  }

  // 真實總成本：顯示隱藏費用明細
  const tc = o.tc;
  const showTrue = useTrueCost() && (tc.items.length || tc.card);
  const costList = showTrue
    ? `<ul class="cost-items">
        ${tc.items.map((i) => `<li>${i.label} ${money(i.amount)}</li>`).join('')}
        ${tc.card ? `<li class="card-item">💳 刷${tc.card.card.name}：${tc.card.desc} −${money(tc.rebate)}</li>` : ''}
      </ul>`
    : '';
  const priceBreakdown = `票價 ${money(o.total)}${tc.fees ? ` ＋ 費用 ${money(tc.fees)}` : ''}${tc.rebate ? ` − 回饋 ${money(tc.rebate)}` : ''}`;

  return `
    <article class="result-card ${isBest ? 'is-best' : ''}">
      <div class="rc-main">
        <div class="rc-head">
          <span class="badge badge-${o.type}">${TYPE_LABEL[o.type]}</span>
          ${isBest ? `<span class="best-flag">★ ${useTrueCost() ? '最划算' : '最便宜'}</span>` : ''}
        </div>
        <h3>${title}</h3>
        <p class="rc-route">${routeText}</p>
        <p class="rc-meta">${meta}</p>
        ${costList}
      </div>
      <div class="rc-price">
        <strong>${money(priceOf(o))}</strong>
        <small>${showTrue ? priceBreakdown : priceNote}</small>
        <div class="rc-links">${links}</div>
      </div>
    </article>`;
}

function renderResults() {
  refreshTrueCost();
  const all = [...results.direct, ...results.transfer, ...results.fourseg.list, ...results.miles]
    .sort((a, b) => priceOf(a) - priceOf(b));
  renderCostCallout(all);
  const shown = activeFilter === 'all' ? all : all.filter((o) => o.type === activeFilter);
  const bestOption = all[0];

  if (!shown.length) {
    const hint = activeFilter === 'fourseg' && results.fourseg.reason
      ? results.fourseg.reason
      : '這個條件下沒有符合的選項，試試其他目的地或出發地。';
    $('#resultList').innerHTML = `<p class="empty">${hint}</p>`;
    return;
  }
  $('#resultList').innerHTML = shown.map((o) => resultCard(o, o === bestOption)).join('');
}

// ---------- 畫面：價格趨勢 ----------
function buildHistory() {
  const s = state;
  const cash = [...results.direct, ...results.transfer];
  // 此航線「最便宜的航空公司」的基準價（不含淡旺季與隨機波動）
  const cheapestMult = Math.min(...cash.map((o) =>
    AIRLINES[o.airline].mult * (o.type === 'transfer' ? TRANSFER_DISCOUNT : 1)));
  const ref = baseFare(distKm(s.origin, s.dest)) * cheapestMult * (s.trip === 'OW' ? ONE_WAY_RATE : 1);

  const today = new Date();
  const points = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const m = d.getMonth();
    const noise = 0.9 + 0.2 * rand(`H${s.origin}${s.dest}${s.trip}${d.getFullYear()}${m}`);
    points.push({
      label: `${d.getFullYear()}/${String(m + 1).padStart(2, '0')}`,
      short: `${m + 1}月`,
      value: round10(ref * SEASON[m] * noise),
    });
  }
  return points;
}

function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function trendChartSvg(points, avg, current) {
  const W = 720, H = 300, pl = 72, pr = 24, pt = 20, pb = 36;
  const vals = [...points.map((p) => p.value), current, avg];
  const step = niceStep((Math.max(...vals) - Math.min(...vals)) / 4 || 1000);
  const yMin = Math.floor((Math.min(...vals) - step * 0.3) / step) * step;
  const yMax = Math.ceil((Math.max(...vals) + step * 0.3) / step) * step;
  const x = (i) => pl + (i * (W - pl - pr)) / (points.length - 1);
  const y = (v) => pt + ((yMax - v) / (yMax - yMin)) * (H - pt - pb);

  let grid = '';
  for (let v = yMin; v <= yMax; v += step) {
    grid += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis-label" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${(v / 1000).toLocaleString('zh-TW')}k</text>`;
  }
  const xLabels = points.map((p, i) =>
    `<text class="axis-label" x="${x(i)}" y="${H - 12}" text-anchor="middle">${p.short}</text>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const dots = points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4"/>`).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img"
         aria-label="過去 12 個月最低票價折線圖">
      ${grid}
      ${xLabels}
      <line class="ref-avg" x1="${pl}" x2="${W - pr}" y1="${y(avg)}" y2="${y(avg)}"/>
      <text class="ref-label" x="${W - pr}" y="${y(avg) - 6}" text-anchor="end">平均 ${money(avg)}</text>
      <line class="ref-now" x1="${pl}" x2="${W - pr}" y1="${y(current)}" y2="${y(current)}"/>
      <text class="ref-label" x="${pl + 6}" y="${y(current) - 6}">目前報價 ${money(current)}</text>
      <path class="line" d="${path}"/>
      ${dots}
      <line class="crosshair" id="crosshair" y1="${pt}" y2="${H - pb}" x1="0" x2="0" visibility="hidden"/>
      <rect class="hit" x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}"
            data-pl="${pl}" data-pr="${pr}" data-w="${W}"/>
    </svg>`;
}

function renderTrend() {
  const s = state;
  const cash = [...results.direct, ...results.transfer];
  if (!cash.length) {
    $('#trendContent').innerHTML = '<p class="empty">這條航線沒有現金票資料，無法顯示趨勢。</p>';
    return;
  }
  const points = buildHistory();
  const values = points.map((p) => p.value);
  const avg = round10(values.reduce((a, b) => a + b, 0) / values.length);
  const min = Math.min(...values), max = Math.max(...values);
  const minPoint = points.find((p) => p.value === min);
  const current = Math.min(...cash.map((o) => o.perAdult));
  const diff = (current - avg) / avg;

  // 購買建議
  let advice, level;
  if (diff <= -0.1) {
    level = 'good';
    advice = `目前報價比 12 個月平均便宜 ${pct(diff)}，是不錯的入手時機。`;
  } else if (diff < 0.1) {
    level = 'warn';
    advice = `目前報價和平均差不多（${diff < 0 ? '低' : '高'} ${pct(diff)}），可以再觀察一下。`;
  } else {
    level = 'bad';
    advice = `目前報價比平均貴 ${pct(diff)}。如果日期有彈性，可以考慮改到較便宜的月份。`;
  }
  const season = SEASON[departMonth(s)];
  const seasonText = season >= 1.1 ? '旺季（寒暑假或過年）' : season <= 0.9 ? '淡季' : '平季';
  const levelIcon = { good: '✅', warn: '⏳', bad: '⚠️' }[level];

  $('#trendContent').innerHTML = `
    <h2 class="panel-title">${cityName(s.origin)} → ${cityName(s.dest)} 價格趨勢</h2>
    <p class="muted">過去 12 個月，每月出發的最低${s.trip === 'RT' ? '來回' : '單程'}票價（每位大人）</p>

    <div class="advice advice-${level}">
      <strong>${levelIcon} 購買建議</strong>
      <p>${advice}</p>
      <p>你選的出發月份（${departMonth(s) + 1} 月）屬於<strong>${seasonText}</strong>。
         歷史上最便宜的是 <strong>${minPoint.label}</strong>（${money(min)}）。</p>
    </div>

    <div class="trend-stats">
      <div class="stat-tile"><small>最低</small><strong>${money(min)}</strong></div>
      <div class="stat-tile"><small>平均</small><strong>${money(avg)}</strong></div>
      <div class="stat-tile"><small>最高</small><strong>${money(max)}</strong></div>
      <div class="stat-tile"><small>目前報價</small><strong>${money(current)}</strong></div>
    </div>

    <div class="chart-legend">
      <span><i class="lg-line"></i>每月最低價</span>
      <span><i class="lg-avg"></i>12 個月平均</span>
      <span><i class="lg-now"></i>目前報價</span>
    </div>
    <div class="chart-wrap" id="chartWrap">
      ${trendChartSvg(points, avg, current)}
      <div class="tooltip" id="tooltip" hidden></div>
    </div>

    <details class="table-view">
      <summary>以表格檢視</summary>
      <table>
        <thead><tr><th>月份</th><th>最低票價</th><th>與平均相比</th></tr></thead>
        <tbody>
          ${points.map((p) => {
            const d = (p.value - avg) / avg;
            return `<tr><td>${p.label}</td><td>${money(p.value)}</td>
              <td>${d < 0 ? '便宜' : '貴'} ${pct(d)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </details>`;

  bindChartHover(points, avg);
}

// 滑鼠移到圖上時顯示十字線與數值
function bindChartHover(points, avg) {
  const wrap = $('#chartWrap');
  const svg = wrap.querySelector('svg');
  const hit = svg.querySelector('.hit');
  const cross = svg.querySelector('#crosshair');
  const tip = $('#tooltip');
  const dots = svg.querySelectorAll('.dot');
  const W = +hit.dataset.w, pl = +hit.dataset.pl, pr = +hit.dataset.pr;

  function show(evt) {
    const rect = svg.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const sx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(points.length - 1,
      Math.round(((sx - pl) / (W - pl - pr)) * (points.length - 1))));
    const cx = pl + (i * (W - pl - pr)) / (points.length - 1);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    dots.forEach((d, k) => d.classList.toggle('active', k === i));

    const p = points[i];
    const d = (p.value - avg) / avg;
    tip.innerHTML = `<b>${p.label}</b><br>${money(p.value)}<br><span>比平均${d < 0 ? '便宜' : '貴'} ${pct(d)}</span>`;
    tip.hidden = false;
    const px = (cx / W) * rect.width;
    const left = Math.min(px + 12, rect.width - tip.offsetWidth - 4);
    tip.style.left = `${px + 12 + tip.offsetWidth > rect.width ? px - tip.offsetWidth - 12 : left}px`;
    tip.style.top = '8px';
  }
  function hide() {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.classList.remove('active'));
    tip.hidden = true;
  }
  hit.addEventListener('mousemove', show);
  hit.addEventListener('touchstart', show, { passive: true });
  hit.addEventListener('touchmove', show, { passive: true });
  hit.addEventListener('mouseleave', hide);
}

// ---------- 畫面：外站四段票 ----------
function renderFourSeg() {
  const s = state;
  const { list, reason } = results.fourseg;
  const box = $('#foursegContent');
  if (!list.length) {
    box.innerHTML = `<p class="empty">${reason}</p>`;
    return;
  }
  // 四段票的主航段是華航/長榮直飛，所以優先跟「直飛」比較；沒有直飛才跟最便宜的票比
  const directBest = results.direct.length
    ? results.direct.reduce((a, b) => (a.total < b.total ? a : b)) : null;
  const cash = directBest || cheapestCash();
  const cashTotal = cash ? cash.total : null;
  const units = paxUnits(s);
  if (!plan || !list.some((o) => o.outstation === plan.code)) plan = defaultPlan();

  box.innerHTML = plannerShellHtml() + `
    <h2 class="panel-title">外站四段票比較（${paxText(s)}）</h2>
    ${cash ? `<p class="muted">比較基準：從${AIRPORTS[s.origin].city}直接買最便宜的${TYPE_LABEL[cash.type]}票
      ${AIRLINES[cash.airline].name}，總價 <strong>${money(cashTotal)}</strong></p>` : ''}
    <div class="fs-list">
    ${list.map((o, idx) => {
      const X = AIRPORTS[o.outstation].city;
      const save = cashTotal != null ? cashTotal - o.total : null;
      const verdict = save == null ? ''
        : save > 0 ? `<span class="verdict good">✅ 省下 ${money(save)}</span>`
        : `<span class="verdict bad">✖ 多花 ${money(-save)}（但多 2 趟${X}旅遊）</span>`;
      return `
      <article class="fs-card ${idx === 0 ? 'is-best' : ''}">
        <header>
          <h3>外站：${X}（${o.outstation}）· ${AIRLINES[o.airline].name}</h3>
          ${verdict}
        </header>
        <ol class="timeline">
          <li><b>出發前</b>${AIRPORTS[s.origin].city} → ${X}（廉航，先去外站玩）</li>
          <li><b>第 1 段</b>${X} → 台北（結束外站旅行回台）</li>
          <li><b>第 2 段</b>台北 → ${AIRPORTS[s.dest].city}（${s.depart}）</li>
          <li><b>第 3 段</b>${AIRPORTS[s.dest].city} → 台北（${s.ret}）</li>
          <li><b>第 4 段</b>台北 → ${X}（一年內再去外站玩）</li>
          <li><b>最後</b>${X} → ${AIRPORTS[s.origin].city}（廉航回家）</li>
        </ol>
        <table class="breakdown">
          <tr><td>四段票（每位大人）</td><td>${money(o.fare)}</td></tr>
          <tr><td>飛往外站廉航來回（每位大人）</td><td>${money(o.positioning)}</td></tr>
          ${o.rail ? `<tr><td>高鐵到桃園來回（每位大人，兒童半價）</td><td>${money(o.rail)}</td></tr>` : ''}
          <tr><td>人數換算</td><td>× ${units.toFixed(2)} 張大人票</td></tr>
          <tr class="sum"><td>總價</td><td>${money(o.total)}</td></tr>
        </table>
        <div class="rc-links">
          <span class="muted">查真實票價：</span>
          <a href="${googleFlightsLink(s, o.outstation, s.dest)}" target="_blank" rel="noopener">四段票（${o.outstation}→${s.dest}）↗</a>
          <a href="${googleFlightsLink(s, s.origin, o.outstation)}" target="_blank" rel="noopener">飛往外站（${s.origin}→${o.outstation}）↗</a>
        </div>
      </article>`;
    }).join('')}
    </div>`;
  bindPlanner();
  renderPlannerOut();
}

// ---------- 畫面：里程兌換 ----------
function renderBalanceInputs() {
  $('#balanceInputs').innerHTML = MILEAGE_PROGRAMS.map((p) => `
    <label class="field">
      <span>我的${p.name}里程</span>
      <input type="number" min="0" step="1000" data-program="${p.id}"
             value="${balances[p.id] ?? ''}" placeholder="選填">
    </label>`).join('');
}

function renderMiles() {
  const s = state;
  const box = $('#milesContent');
  const list = results.miles;
  if (!list.length) {
    box.innerHTML = '<p class="empty">這條航線沒有可用里程兌換的航空公司。</p>';
    return;
  }
  const cash = cheapestCash();
  box.innerHTML = `
    <h2 class="panel-title">里程兌換 vs 現金票（${paxText(s)}）</h2>
    ${cash ? `<p class="muted">最便宜現金票：${AIRLINES[cash.airline].name}（${TYPE_LABEL[cash.type]}）總價 <strong>${money(cash.total)}</strong></p>` : ''}
    <div class="table-scroll">
    <table class="miles-table">
      <thead>
        <tr><th>里程計劃</th><th>每位大人</th><th>全家所需里程</th><th>稅金</th>
            <th>等值現金</th><th>跟現金票比</th><th>我的里程</th></tr>
      </thead>
      <tbody>
      ${list.map((o) => {
        const save = cash ? cash.total - o.total : 0;
        const verdict = !cash ? '—'
          : save > 0 ? `<span class="verdict good">✅ 划算，省 ${money(save)}</span>`
          : `<span class="verdict bad">✖ 不划算，多 ${money(-save)}</span>`;
        const bal = balances[o.program.id];
        const balText = bal == null || bal === '' ? '<span class="muted">未填</span>'
          : bal >= o.milesTotal ? '<span class="verdict good">✅ 足夠</span>'
          : `<span class="verdict bad">還差 ${(o.milesTotal - bal).toLocaleString('zh-TW')} 哩</span>`;
        return `<tr>
          <td><b>${o.program.name}</b><br><small class="muted">${o.program.owner} · ${o.program.alliance}<br>
              可搭：${o.partners.map((a) => AIRLINES[a].name).join('、')}</small></td>
          <td>${o.milesAdult.toLocaleString('zh-TW')} 哩</td>
          <td>${o.milesTotal.toLocaleString('zh-TW')} 哩</td>
          <td>${money(o.taxTotal)}</td>
          <td><b>${money(o.total)}</b></td>
          <td>${verdict}</td>
          <td>${balText}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    </div>
    <p class="muted small">
      等值現金 = 所需里程 × 1 哩價值 + 稅金。兒童需 75% 里程、嬰兒 10%。
      里程票位有限，實際能否訂到請上航空公司官網查詢。
      想知道「1 哩值多少」：一般常用 NT$ 0.3～0.5 估算。
    </p>`;
}

// ---------- 全部重畫 ----------
function renderAll() {
  renderSummary();
  renderResults();
  renderFlex();
  renderHolidays();
  renderTrend();
  renderFourSeg();
  renderMiles();
}

// ---------- 分頁籤 ----------
function showTab(name) {
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name));
  $$('.panel').forEach((p) => { p.hidden = p.id !== `panel-${name}`; });
}

// ---------- 初始化 ----------
function fillSelect(sel, codes, selected) {
  sel.innerHTML = codes.map((c) =>
    `<option value="${c}" ${c === selected ? 'selected' : ''}>${cityName(c)}</option>`).join('');
}

function init() {
  fillSelect($('#origin'), ORIGINS, 'TPE');
  fillSelect($('#dest'), DESTINATIONS, 'LHR');
  $('#outstation').innerHTML = '<option value="ALL">自動比較全部外站</option>' +
    OUTSTATIONS.map((o) => `<option value="${o.code}">${cityName(o.code)}</option>`).join('');

  // 預設日期：30 天後出發，玩 7 天
  const today = todayStr();
  $('#depart').value = addDays(today, 30);
  $('#return').value = addDays(today, 37);
  $('#depart').min = addDays(today, 1);
  $('#return').min = addDays(today, 1);

  // 單程時隱藏回程日期
  $$('input[name="trip"]').forEach((r) => r.addEventListener('change', () => {
    $('#returnField').hidden = readForm().trip === 'OW';
  }));

  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch();
  });

  $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  $('#filterChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    $$('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderResults();
  });

  // 結果卡片上的「看詳情」連結
  $('#resultList').addEventListener('click', (e) => {
    const link = e.target.closest('[data-goto]');
    if (!link) return;
    e.preventDefault();
    showTab(link.dataset.goto);
  });

  renderCardOptions();

  // 真實總成本設定、排序方式改變時重算
  const rerankResults = () => {
    if (!results) return;
    renderSummary();
    renderResults();
  };
  $('#costSettings').addEventListener('input', rerankResults);
  $$('input[name="sortMode"]').forEach((r) => r.addEventListener('change', rerankResults));

  // 彈性日期：點一格就改用那組日期
  $('#flexContent').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-flex-d]');
    if (!cell) return;
    $('#depart').value = cell.dataset.flexD;
    if (cell.dataset.flexR) $('#return').value = cell.dataset.flexR;
    runSearch();
  });

  // 連假攻略：改請假天數時重算；按「套用這個日期」直接搜尋
  $('#maxLeave').addEventListener('change', () => {
    if (!results) return;
    renderHolidays();
    plan = null;
    renderFourSeg();
  });
  $('#holidayContent').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-apply]');
    if (!btn) return;
    document.querySelector('input[name="trip"][value="RT"]').checked = true;
    $('#returnField').hidden = false;
    $('#depart').value = btn.dataset.depart;
    $('#return').value = btn.dataset.ret;
    runSearch();
    showTab('results');
    $('#summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // 里程設定改變時重算
  renderBalanceInputs();
  $('#mileValue').addEventListener('input', () => {
    if (!results) return;
    recalcMiles();
    renderSummary();
    renderResults();
    renderMiles();
  });
  $('#balanceInputs').addEventListener('input', (e) => {
    const id = e.target.dataset.program;
    if (!id) return;
    balances[id] = e.target.value === '' ? null : parseInt(e.target.value, 10);
    if (results) renderMiles();
  });

  runSearch(); // 一打開就先顯示預設搜尋結果
}

init();
