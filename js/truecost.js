/* =========================================================
 * truecost.js — 真實總成本
 * 票價 ＋ 廉航行李／選位／餐點 ＋ 機場交通 ＋ 時間價值
 * ========================================================= */

// 讀取「真實總成本設定」
function costSettings() {
  return {
    bag: $('#optBag').checked,
    seat: $('#optSeat').checked,
    meal: $('#optMeal').checked,
    transport: $('#optTransport').checked,
    timeValue: Math.max(0, parseFloat($('#optTime').value) || 0),
    cards: CREDIT_CARDS.filter((c) => $(`#card-${c.id}`).checked),
    insurance: $('#optInsurance').checked,
    mileValue: parseFloat($('#mileValue').value) || 0,
  };
}

// 信用卡勾選框（從 CREDIT_CARDS 產生）
function renderCardOptions() {
  $('#cardOptions').innerHTML = CREDIT_CARDS.map((c) => {
    const rule = c.type === 'miles'
      ? `NT$${c.ntdPerMile}=1哩，刷${c.bonusAirlines.map((a) => AIRLINES[a].name).join('、')} NT$${c.bonusNtdPerMile}=1哩`
      : `現金回饋 ${c.rate * 100}%`;
    return `
      <label class="check card-check">
        <input type="checkbox" id="card-${c.id}" ${c.default ? 'checked' : ''}>
        <span><b>${c.name}</b><small>${rule}${c.insurance ? '・送旅平險' : ''}</small></span>
      </label>`;
  }).join('');
}

// 從使用者有的卡中，挑出這筆消費回饋最多的那張
function bestCard(o, chargeable, s, cfg) {
  const travellers = s.adults + s.children + s.infants;
  let best = null;
  for (const c of cfg.cards) {
    let value, desc;
    if (c.type === 'miles') {
      const rate = c.bonusAirlines.includes(o.airline) ? c.bonusNtdPerMile : c.ntdPerMile;
      const miles = Math.floor(chargeable / rate);
      value = miles * cfg.mileValue;
      desc = `累積 ${miles.toLocaleString('zh-TW')} 哩`;
    } else {
      value = chargeable * c.rate;
      desc = `現金回饋 ${c.rate * 100}%`;
    }
    if (cfg.insurance && c.insurance) {
      value += INSURANCE_VALUE * travellers;
      desc += '＋送旅平險';
    }
    if (!best || value > best.value) best = { card: c, value: round10(value), desc };
  }
  return best && best.value > 0 ? best : null;
}

// 目前是用「真實總成本」還是「只看票價」排序
const useTrueCost = () => document.querySelector('input[name="sortMode"]:checked').value === 'true';
const priceOf = (o) => (useTrueCost() ? o.tc.total : o.total);

const bagFee = (km) => (km <= LCC_FEES.bagShortMaxKm ? LCC_FEES.bagShort : LCC_FEES.bagLong);

// 算出一個選項的隱藏費用
function trueCost(o, s, cfg, fastest) {
  const items = [];
  const add = (label, amount) => { if (amount > 0) items.push({ label, amount: round10(amount) }); };
  const ways = s.trip === 'RT' ? 2 : 1;
  const seated = s.adults + s.children; // 嬰兒不佔位、不另付行李

  if (o.type === 'direct' || o.type === 'transfer') {
    if (AIRLINES[o.airline].lcc) {
      const km = distKm(s.origin, s.dest);
      if (cfg.bag) add('廉航托運行李', bagFee(km) * ways * seated);
      if (cfg.seat && seated > 1) add('全家坐一起選位', LCC_FEES.seat * ways * seated);
      if (cfg.meal) add('機上餐點', LCC_FEES.meal * ways * seated);
    }
    if (cfg.timeValue) add('多花的時間', (o.hours - fastest) * ways * seated * cfg.timeValue);
  }

  if (o.type === 'fourseg') {
    // 主航段是華航/長榮（已含行李），但飛去外站的是廉航
    const km = distKm(s.origin, o.outstation);
    if (cfg.bag) add('飛外站廉航行李', bagFee(km) * 2 * seated);
    if (cfg.seat && seated > 1) add('飛外站廉航選位', LCC_FEES.seat * 2 * seated);
    if (cfg.meal) add('飛外站廉航餐點', LCC_FEES.meal * 2 * seated);
  }

  // 刷卡金額：機票（里程票只刷稅金）＋廉航加購費用，不含交通與時間
  const addOns = items.filter((i) => i.label !== '多花的時間').reduce((a, b) => a + b.amount, 0);
  const chargeable = (o.type === 'miles' ? o.taxTotal : o.total) + addOns;

  if (cfg.transport) add('往返機場交通', AIRPORT_TRANSPORT[s.origin] * (s.adults + s.children * 0.5));

  const fees = items.reduce((a, b) => a + b.amount, 0);
  const card = bestCard(o, chargeable, s, cfg);
  const rebate = card ? card.value : 0;
  return { items, fees, card, rebate, extra: fees - rebate, total: o.total + fees - rebate };
}

// 幫所有選項加上 o.tc（真實總成本）
function refreshTrueCost() {
  const cfg = costSettings();
  const cash = [...results.direct, ...results.transfer];
  const fastest = cash.length ? Math.min(...cash.map((o) => o.hours)) : 0;
  for (const o of [...cash, ...results.fourseg.list, ...results.miles]) {
    o.tc = trueCost(o, state, cfg, fastest);
  }
}

// 選項的簡短名稱（用在提醒文字）
function optionLabel(o) {
  if (o.type === 'miles') return `${o.program.name}里程兌換`;
  if (o.type === 'fourseg') return `${AIRPORTS[o.outstation].city}外站四段票`;
  return `${AIRLINES[o.airline].name}${TYPE_LABEL[o.type]}`;
}

// 「看似便宜」提醒：票價最低的不是真正最划算時顯示
function renderCostCallout(all) {
  const box = $('#costCallout');
  if (!all.length) { box.innerHTML = ''; return; }
  const byFare = all.reduce((a, b) => (a.total < b.total ? a : b));
  const byTrue = all.reduce((a, b) => (a.tc.total < b.tc.total ? a : b));
  if (byFare === byTrue) {
    const tc = byFare.tc;
    box.innerHTML = tc.fees || tc.rebate
      ? `<p class="callout callout-good">✅ 票價最便宜的 <b>${optionLabel(byFare)}</b>，
           算進隱藏費用${tc.rebate ? '與刷卡回饋' : ''}後仍然最划算（${money(tc.total)}）。</p>`
      : '';
    return;
  }
  box.innerHTML = `
    <p class="callout callout-warn">
      💡 <b>看似便宜的陷阱：</b>只看票價最便宜的是 <b>${optionLabel(byFare)}</b>（${money(byFare.total)}），
      但${byFare.tc.items.length ? `加上${byFare.tc.items.map((i) => i.label).join('、')}` : ''}${byFare.tc.rebate ? `${byFare.tc.items.length ? '、' : ''}扣掉刷卡回饋` : ''}後要 <b>${money(byFare.tc.total)}</b>。<br>
      算進所有花費，真正最划算的是 <b>${optionLabel(byTrue)}</b>（${money(byTrue.tc.total)}），
      省下 ${money(byFare.tc.total - byTrue.tc.total)}。
    </p>`;
}
