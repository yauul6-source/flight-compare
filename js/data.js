/* =========================================================
 * data.js — 模擬資料
 * 想新增機場、航線或修改規則，改這個檔案就好。
 * ========================================================= */

// 機場：城市名稱、經緯度（用來算距離）、所屬地區（用來算稅金）
const AIRPORTS = {
  TPE: { city: '台北（桃園）', lat: 25.08, lon: 121.23, region: 'TW' },
  KHH: { city: '高雄',         lat: 22.58, lon: 120.35, region: 'TW' },
  RMQ: { city: '台中',         lat: 24.26, lon: 120.62, region: 'TW' },
  NRT: { city: '東京（成田）', lat: 35.77, lon: 140.39, region: 'NEA' },
  KIX: { city: '大阪（關西）', lat: 34.43, lon: 135.23, region: 'NEA' },
  ICN: { city: '首爾（仁川）', lat: 37.46, lon: 126.44, region: 'NEA' },
  HKG: { city: '香港',         lat: 22.31, lon: 113.91, region: 'SEA' },
  MNL: { city: '馬尼拉',       lat: 14.51, lon: 121.02, region: 'SEA' },
  BKK: { city: '曼谷',         lat: 13.69, lon: 100.75, region: 'SEA' },
  KUL: { city: '吉隆坡',       lat: 2.74,  lon: 101.70, region: 'SEA' },
  SIN: { city: '新加坡',       lat: 1.36,  lon: 103.99, region: 'SEA' },
  DXB: { city: '杜拜',         lat: 25.25, lon: 55.36,  region: 'ME' },
  LHR: { city: '倫敦',         lat: 51.47, lon: -0.45,  region: 'EU' },
  CDG: { city: '巴黎',         lat: 49.01, lon: 2.55,   region: 'EU' },
  LAX: { city: '洛杉磯',       lat: 33.94, lon: -118.41, region: 'NA' },
  JFK: { city: '紐約',         lat: 40.64, lon: -73.78, region: 'NA' },
  SYD: { city: '雪梨',         lat: -33.94, lon: 151.18, region: 'OC' },
};

// 可選的出發地（台灣）與目的地
const ORIGINS = ['TPE', 'KHH', 'RMQ'];
const DESTINATIONS = ['NRT', 'KIX', 'ICN', 'HKG', 'BKK', 'SIN', 'LHR', 'CDG', 'LAX', 'JFK', 'SYD'];

// 航空公司：mult = 票價倍率（越高越貴），lcc = 是否為廉價航空
const AIRLINES = {
  CI: { name: '中華航空',   mult: 1.05 },
  BR: { name: '長榮航空',   mult: 1.08 },
  JX: { name: '星宇航空',   mult: 1.12 },
  JL: { name: '日本航空',   mult: 1.10 },
  CX: { name: '國泰航空',   mult: 1.06 },
  KE: { name: '大韓航空',   mult: 0.98 },
  SQ: { name: '新加坡航空', mult: 1.10 },
  TG: { name: '泰國航空',   mult: 0.95 },
  EK: { name: '阿聯酋航空', mult: 1.00 },
  IT: { name: '台灣虎航',   mult: 0.72, lcc: true },
  TR: { name: '酷航',       mult: 0.70, lcc: true },
};

// 直飛航線：DIRECT[出發地][目的地] = 有飛的航空公司
const DIRECT = {
  TPE: {
    NRT: ['CI', 'BR', 'JX', 'JL', 'IT'],
    KIX: ['CI', 'BR', 'JX', 'IT'],
    ICN: ['CI', 'BR', 'KE', 'IT'],
    HKG: ['CI', 'BR', 'CX', 'JX'],
    BKK: ['CI', 'BR', 'TG', 'JX'],
    SIN: ['CI', 'BR', 'SQ', 'TR'],
    LHR: ['CI', 'BR'],
    CDG: ['BR'],
    LAX: ['CI', 'BR', 'JX'],
    JFK: ['CI', 'BR'],
    SYD: ['CI'],
  },
  KHH: {
    NRT: ['CI', 'IT'],
    KIX: ['CI', 'IT'],
    ICN: ['KE', 'IT'],
    HKG: ['CX'],
    BKK: ['CI'],
    SIN: ['TR'],
  },
  RMQ: {
    NRT: ['IT'],
    ICN: ['IT'],
    HKG: ['CI'],
  },
};

// 轉機點：在哪個城市轉機、由哪家航空公司飛
const HUBS = [
  { hub: 'HKG', airline: 'CX' },
  { hub: 'ICN', airline: 'KE' },
  { hub: 'NRT', airline: 'JL' },
  { hub: 'BKK', airline: 'TG' },
  { hub: 'SIN', airline: 'SQ' },
  { hub: 'DXB', airline: 'EK' },
];
// 繞路比例上限：轉機總距離 ÷ 直線距離 超過這個值就不列入
const MAX_DETOUR = 1.45;
// 轉機票相對直飛的折扣
const TRANSFER_DISCOUNT = 0.85;

// 外站四段票的外站城市：factor = 該外站市場票價相對台灣的倍率（越低越便宜）
const OUTSTATIONS = [
  { code: 'HKG', factor: 0.68 },
  { code: 'BKK', factor: 0.62 },
  { code: 'MNL', factor: 0.63 },
  { code: 'KUL', factor: 0.64 },
  { code: 'ICN', factor: 0.72 },
];
// 飛去外站的廉航來回票，相對一般票價的倍率
const POSITIONING_RATE = 0.7;
// 從高雄/台中出發搭四段票，要先搭高鐵到桃園（每位大人來回價，兒童半價）
const HSR_ROUND_TRIP = { TPE: 0, KHH: 2980, RMQ: 1400 };

// 廉航額外費用（每人每趟單程）：傳統航空已含在票價內
const LCC_FEES = {
  bagShort: 1100,     // 托運行李 20kg，航程 3,000 公里以內
  bagLong: 1800,      // 托運行李 20kg，航程超過 3,000 公里
  bagShortMaxKm: 3000,
  seat: 300,          // 選位（全家要坐一起）
  meal: 250,          // 機上餐點
};

// 信用卡（通用範例，實際回饋請依你的卡片條件修改）
// miles 卡：每刷 ntdPerMile 元得 1 哩；刷 bonusAirlines 的機票改用 bonusNtdPerMile
// cashback 卡：rate = 現金回饋比例
// insurance：刷卡買機票送旅平險
const CREDIT_CARDS = [
  { id: 'ci',    name: '華航聯名卡',       type: 'miles', program: 'DF', ntdPerMile: 20, bonusAirlines: ['CI'], bonusNtdPerMile: 10, insurance: true },
  { id: 'br',    name: '長榮聯名卡',       type: 'miles', program: 'BR', ntdPerMile: 20, bonusAirlines: ['BR'], bonusNtdPerMile: 10, insurance: true },
  { id: 'am',    name: '亞洲萬里通聯名卡', type: 'miles', program: 'AM', ntdPerMile: 20, bonusAirlines: ['CX'], bonusNtdPerMile: 12, insurance: true },
  { id: 'trip',  name: '旅遊回饋卡',       type: 'cashback', rate: 0.03, insurance: true },
  { id: 'basic', name: '一般現金回饋卡',   type: 'cashback', rate: 0.01, insurance: false, default: true },
];
// 刷卡送旅平險，等於省下自己買保險的錢（每位旅客）
const INSURANCE_VALUE = 500;

// 往返機場的交通費（每位大人來回，兒童半價）
const AIRPORT_TRANSPORT = { TPE: 320, KHH: 120, RMQ: 220 };

// 人數計價
const CHILD_RATE = 0.75;   // 兒童 = 大人 75%
const INFANT_RATE = 0.10;  // 嬰兒 = 大人 10%
const ONE_WAY_RATE = 0.6;  // 單程 = 來回 60%

// 淡旺季：1 月 ~ 12 月的票價倍率
const SEASON = [1.15, 1.10, 0.95, 1.00, 0.90, 0.95, 1.20, 1.20, 0.85, 0.95, 0.90, 1.15];

// 台灣國定連假（已含週末與補假）
// ⚠️ 依「紀念日及節日實施條例」推算，請以行政院人事行政總處公告為準，每年記得更新
// peak = 連假出發的票價倍率（沒寫就用 HOLIDAY_PEAK）
const HOLIDAYS = [
  { name: '國慶日連假',     start: '2026-10-09', end: '2026-10-11' },
  { name: '光復節連假',     start: '2026-10-24', end: '2026-10-26' },
  { name: '行憲紀念日連假', start: '2026-12-25', end: '2026-12-27' },
  { name: '元旦連假',       start: '2027-01-01', end: '2027-01-03' },
  { name: '春節連假',       start: '2027-02-04', end: '2027-02-10', peak: 1.35 },
  { name: '228 連假',       start: '2027-02-27', end: '2027-03-01' },
  { name: '兒童節清明連假', start: '2027-04-02', end: '2027-04-05' },
  { name: '勞動節連假',     start: '2027-04-30', end: '2027-05-02' },
  { name: '端午節',         start: '2027-06-09', end: '2027-06-09' },
  { name: '中秋節',         start: '2027-09-15', end: '2027-09-15' },
  { name: '教師節',         start: '2027-09-28', end: '2027-09-28' },
  { name: '國慶日連假',     start: '2027-10-09', end: '2027-10-11' },
  { name: '光復節連假',     start: '2027-10-23', end: '2027-10-25' },
  { name: '行憲紀念日連假', start: '2027-12-24', end: '2027-12-26' },
];
const HOLIDAY_PEAK = 1.15;

// 各地區建議的最少旅遊天數（太短會標示提醒）
const MIN_TRIP_DAYS = { NEA: 3, SEA: 3, ME: 5, EU: 7, NA: 7, OC: 6 };

// 四段票效期（天）：自第 1 段起算
const FOURSEG_VALIDITY_DAYS = 365;

// 里程計劃：airlines = 可以用這個計劃兌換的航空公司
// mult = 所需里程倍率，surcharge = 稅金/燃油附加費倍率
const MILEAGE_PROGRAMS = [
  { id: 'DF', name: '華夏哩程酷計劃', owner: '中華航空', alliance: 'SkyTeam',       airlines: ['CI', 'KE'],       mult: 1.00, surcharge: 1.0 },
  { id: 'BR', name: '無限萬哩遊',     owner: '長榮航空', alliance: 'Star Alliance', airlines: ['BR', 'SQ', 'TG'], mult: 1.05, surcharge: 1.0 },
  { id: 'AM', name: '亞洲萬里通',     owner: '國泰航空', alliance: 'oneworld',      airlines: ['CX', 'JL'],       mult: 0.90, surcharge: 1.5 },
];

// 經濟艙來回所需里程（依單程飛行距離分級）
const AWARD_BANDS = [
  { maxKm: 1000,     miles: 12000 },
  { maxKm: 2500,     miles: 20000 },
  { maxKm: 5000,     miles: 30000 },
  { maxKm: 8000,     miles: 45000 },
  { maxKm: 11000,    miles: 60000 },
  { maxKm: Infinity, miles: 75000 },
];

// 里程票每位大人來回的稅金（依目的地地區）
const REGION_TAX = { NEA: 2500, SEA: 2200, ME: 4000, EU: 7500, NA: 4500, OC: 3800 };
