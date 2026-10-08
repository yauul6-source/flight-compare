/* =========================================================
 * flex.js — 日期彈性 ±3 天價格表
 * 列 = 去程日期，欄 = 回程日期；以目前選的日期為基準比較便宜或貴
 * ========================================================= */

const FLEX_DAYS = 3;

// 某組日期最便宜的現金票（全家總價）
function cheapestFor(s) {
  const cash = [...searchDirect(s), ...searchTransfer(s)];
  return cash.length ? cash.reduce((a, b) => (a.total < b.total ? a : b)) : null;
}

const shortMoney = (n) => Math.round(n).toLocaleString('zh-TW');

function renderFlex() {
  const s = state;
  const box = $('#flexContent');
  const minDate = addDays(todayStr(), 1);
  const offsets = [];
  for (let i = -FLEX_DAYS; i <= FLEX_DAYS; i++) offsets.push(i);

  const departs = offsets.map((i) => addDays(s.depart, i));
  const rets = s.trip === 'RT' ? offsets.map((i) => addDays(s.ret, i)) : [null];

  const current = cheapestFor(s);
  if (!current) {
    box.innerHTML = '<p class="empty">這條航線沒有現金票資料。</p>';
    return;
  }

  // 算出每一格
  const grid = departs.map((d) => rets.map((r) => {
    if (d < minDate || (r && r < d)) return null;
    const best = cheapestFor({ ...s, depart: d, ret: r || s.ret });
    return best ? { d, r, price: best.total, best } : null;
  }));
  const cells = grid.flat().filter(Boolean);
  const cheapest = cells.reduce((a, b) => (a.price < b.price ? a : b));
  const maxAbs = Math.max(...cells.map((c) => Math.abs(c.price - current.total))) || 1;
  const save = current.total - cheapest.price;

  const holidayTag = (d) => (holidayFactor(d) > 1 ? '<em class="fx-hol">連假</em>' : '');

  const cellHtml = (c) => {
    if (!c) return '<td class="fx-na">—</td>';
    const diff = c.price - current.total;
    const isCur = c.d === s.depart && (!c.r || c.r === s.ret);
    // 越便宜越綠、越貴越紅（以目前日期為中間值）
    const strength = Math.round((Math.abs(diff) / maxAbs) * 45);
    const color = diff < 0 ? 'var(--good)' : 'var(--bad)';
    const bg = isCur || !diff ? '' : `style="background:color-mix(in srgb, ${color} ${strength}%, var(--surface))"`;
    const diffText = isCur ? '目前' : diff < 0 ? `省 ${shortMoney(-diff)}` : diff > 0 ? `多 ${shortMoney(diff)}` : '同價';
    const nights = c.r ? `，${diffDays(c.d, c.r)} 晚` : '';
    return `
      <td ${bg} class="${isCur ? 'fx-cur' : ''} ${c === cheapest ? 'fx-best' : ''}">
        <button data-flex-d="${c.d}" data-flex-r="${c.r || ''}"
                title="${md(c.d)} 出發${c.r ? ` → ${md(c.r)} 回程` : ''}${nights}，${money(c.price)}（${AIRLINES[c.best.airline].name}）">
          <b>${shortMoney(c.price)}</b>
          <small>${c === cheapest && !isCur ? '★ 最便宜' : diffText}</small>
        </button>
      </td>`;
  };

  box.innerHTML = `
    <h2 class="panel-title">日期彈性 ±${FLEX_DAYS} 天</h2>
    <p class="muted">${cityName(s.origin)} → ${cityName(s.dest)} · ${paxText(s)}的全家最低票價（NT$）。點任一格就改用那組日期。</p>

    ${save > 0
      ? `<p class="callout callout-good">✅ 改成 <b>${md(cheapest.d)} 出發${cheapest.r ? `、${md(cheapest.r)} 回程` : ''}</b>
           最便宜，全家 ${money(cheapest.price)}，比目前省 <b>${money(save)}</b>。</p>`
      : `<p class="callout callout-good">✅ 你選的日期已經是前後 ${FLEX_DAYS} 天內最便宜的。</p>`}

    <div class="fx-legend">
      <span>便宜</span><i class="fx-scale"></i><span>貴</span>
      <span class="muted">（以目前日期 <b class="fx-cur-key">目前</b> 為基準）</span>
    </div>

    <div class="table-scroll">
      <table class="fx-table">
        <thead>
          <tr>
            <th class="fx-corner">${s.trip === 'RT' ? '去程 ＼ 回程' : '去程'}</th>
            ${s.trip === 'RT'
              ? rets.map((r) => `<th>${md(r)}${HOLIDAY_SET.has(r) ? '<em class="fx-hol">連假</em>' : ''}</th>`).join('')
              : '<th>全家最低票價</th>'}
          </tr>
        </thead>
        <tbody>
          ${s.trip === 'RT'
            ? departs.map((d, i) => `<tr><th>${md(d)}${holidayTag(d)}</th>${grid[i].map(cellHtml).join('')}</tr>`).join('')
            : departs.map((d, i) => `<tr><th>${md(d)}${holidayTag(d)}</th>${cellHtml(grid[i][0])}</tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted small">「連假」= 這天出發屬於連假旺季，票價較高。表格只比較票價，不含真實總成本的隱藏費用。</p>`;
}
