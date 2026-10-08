# 飛比價｜機票比價系統

純靜態網站（HTML / CSS / JS），比較從台灣出發的四種購買方式：

- **直飛**、**轉機**
- **外站四段票**：自動計算「廉航飛到外站 + 四段票」的總價，和直接買比較
- **里程兌換**：依「1 哩值多少錢」換算成等值現金

另外有 **12 個月價格趨勢圖** 與購買建議，並支援大人／兒童／嬰兒人數計價。

> 價格為模擬資料。每筆結果附 Google Flights／Skyscanner 連結，可查詢真實票價。

## 檔案結構

```
index.html      首頁
css/style.css   樣式（顏色在檔案最上方 :root）
js/data.js      模擬資料：機場、航線、航空公司、里程表、淡旺季、台灣連假
js/holidays.js  日期工具、連假攻略（請假最佳化）
js/planner.js   外站四段票規劃器（甘特圖、效期檢查、匯出行事曆）
js/truecost.js  真實總成本（廉航行李、選位、餐點、機場交通、時間價值）
js/flex.js      日期彈性 ±3 天價格表
js/app.js       比價計算與畫面
images/         圖片（logo.svg、hero.svg）
```

## 本機預覽

直接用瀏覽器打開 `index.html` 即可，不需要安裝任何東西。

## 上傳到 GitHub Pages

1. 在 GitHub 建立新的 repository（例如 `flight-compare`）
2. 點 **Add file → Upload files**，把上面所有檔案和資料夾拖進去，按 **Commit changes**
3. 到 **Settings → Pages**，Source 選 `Deploy from a branch`，Branch 選 `main`、資料夾 `/ (root)`，按 Save
4. 等 1～2 分鐘，網址會是 `https://你的帳號.github.io/flight-compare/`

## 想修改？

| 想做的事 | 改哪裡 |
|---|---|
| 新增目的地 | `js/data.js` 的 `AIRPORTS`、`DESTINATIONS`、`DIRECT` |
| 新增外站城市 | `js/data.js` 的 `OUTSTATIONS` |
| 調整兒童／嬰兒票價比例 | `js/data.js` 的 `CHILD_RATE`、`INFANT_RATE` |
| 調整淡旺季 | `js/data.js` 的 `SEASON`（1～12 月） |
| 調整廉航行李、選位費 | `js/data.js` 的 `LCC_FEES` |
| 改成自己的信用卡條件 | `js/data.js` 的 `CREDIT_CARDS` |
| 更新明年連假 | `js/data.js` 的 `HOLIDAYS`（依人事行政總處公告） |
| 換主色 | `css/style.css` 最上方的 `--accent` |
