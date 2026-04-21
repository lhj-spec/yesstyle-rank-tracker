const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const outputDir = path.resolve(__dirname, config.outputDir);
const historyFile = path.join(outputDir, 'history.json');
const dashboardDir = path.resolve(__dirname, 'docs');

if (!fs.existsSync(historyFile)) {
  console.error('히스토리 파일이 없습니다. tracker.js를 먼저 실행하세요.');
  process.exit(1);
}
if (!fs.existsSync(dashboardDir)) fs.mkdirSync(dashboardDir, { recursive: true });

const history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'))
  .sort((a, b) => a.date.localeCompare(b.date));

const latestDate = history[history.length - 1].date;
const currency = history[history.length - 1].products?.[0]?.currency || 'USD';

// 제품별 전체 히스토리 빌드 (클라이언트에 내장할 데이터)
const productMap = {};
history.forEach(day => {
  (day.products || []).forEach(p => {
    const key = p.id || p.name;
    if (!key) return;
    if (!productMap[key]) productMap[key] = {
      id: p.id, name: p.name, brand: p.brand,
      ranks: {}, reviews: {}, prices: {}
    };
    productMap[key].ranks[day.date] = p.rank + 1; // 1-based
    if (p.reviewCount != null) productMap[key].reviews[day.date] = p.reviewCount;
    if (p.priceNum) productMap[key].prices[day.date] = { num: p.priceNum, currency: p.currency };
  });
});

const allDates = history.map(h => h.date);
const allProducts = Object.values(productMap);
const allBrands = [...new Set(allProducts.map(p => p.brand))].sort();

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YesStyle Rank Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f6fa; color: #2d3436; }

.header { background: #2d3436; color: white; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.header h1 { font-size: 20px; font-weight: 700; }
.header .meta { font-size: 12px; color: #b2bec3; }
.lang-toggle { display: flex; gap: 4px; }
.lang-btn { padding: 5px 12px; font-size: 12px; font-weight: 700; border: 1.5px solid rgba(255,255,255,.3); border-radius: 20px; cursor: pointer; background: transparent; color: rgba(255,255,255,.6); transition: all .15s; letter-spacing: .3px; }
.lang-btn.active { background: white; color: #2d3436; border-color: white; }

.container { max-width: 1280px; margin: 0 auto; padding: 20px 16px; }

/* JUMISO 배너 */
.jumiso-banner { background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border-radius: 12px; padding: 20px 24px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(108,92,231,.25); }
.jumiso-banner h2 { font-size: 14px; font-weight: 700; letter-spacing: .5px; margin-bottom: 14px; }
.jumiso-banner table { color: white; width: 100%; }
.jumiso-banner th { font-size: 11px; color: rgba(255,255,255,.65); border-bottom: 1px solid rgba(255,255,255,.2); padding: 6px 10px; text-align: left; text-transform: uppercase; }
.jumiso-banner td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.1); font-size: 13px; }
.jumiso-banner td.rank { font-weight: 700; width: 50px; }
.jumiso-banner td.price { color: #ffeaa7; font-weight: 600; width: 80px; }
.jumiso-banner td.reviews { color: rgba(255,255,255,.8); width: 100px; }
.jumiso-banner a { color: white; text-decoration: none; }
.jumiso-banner a:hover { text-decoration: underline; }
.jumiso-chart-wrap { height: 180px; margin-top: 16px; }

/* 필터 바 */
.filter-bar { background: white; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.06); display: flex; flex-direction: column; gap: 14px; }
.filter-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.filter-label { font-size: 11px; font-weight: 700; color: #636e72; text-transform: uppercase; letter-spacing: .5px; min-width: 56px; }
.date-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.date-btn { padding: 5px 12px; font-size: 12px; border: 1px solid #dfe6e9; border-radius: 20px; cursor: pointer; background: white; color: #636e72; transition: all .15s; }
.date-btn:hover { border-color: #6c5ce7; color: #6c5ce7; }
.date-btn.active { background: #6c5ce7; border-color: #6c5ce7; color: white; font-weight: 600; }
.date-custom { display: flex; align-items: center; gap: 6px; }
.date-custom input { border: 1px solid #dfe6e9; border-radius: 6px; padding: 5px 10px; font-size: 12px; color: #2d3436; }
.date-custom span { font-size: 12px; color: #b2bec3; }

.search-wrap { position: relative; flex: 1; min-width: 200px; max-width: 360px; }
.search-wrap input { width: 100%; border: 1px solid #dfe6e9; border-radius: 8px; padding: 8px 12px 8px 34px; font-size: 13px; color: #2d3436; outline: none; transition: border .15s; }
.search-wrap input:focus { border-color: #6c5ce7; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #b2bec3; font-size: 15px; pointer-events: none; }
.search-clear { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #b2bec3; font-size: 13px; display: none; }
.search-clear.show { display: block; }

.brand-tags { display: flex; gap: 6px; flex-wrap: wrap; max-height: 80px; overflow-y: auto; }
.brand-tag { padding: 4px 10px; font-size: 12px; border: 1px solid #dfe6e9; border-radius: 20px; cursor: pointer; background: white; color: #636e72; transition: all .15s; white-space: nowrap; }
.brand-tag:hover { border-color: #6c5ce7; color: #6c5ce7; }
.brand-tag.active { background: #6c5ce7; border-color: #6c5ce7; color: white; font-weight: 600; }
.filter-reset { padding: 5px 14px; font-size: 12px; border: 1px solid #dfe6e9; border-radius: 6px; cursor: pointer; background: white; color: #e17055; border-color: #fab1a0; transition: all .15s; }
.filter-reset:hover { background: #e17055; color: white; border-color: #e17055; }

/* 통계 카드 */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card { background: white; border-radius: 10px; padding: 16px 20px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.stat-card .label { font-size: 11px; color: #636e72; text-transform: uppercase; letter-spacing: .5px; }
.stat-card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
.stat-card .sub { font-size: 11px; color: #b2bec3; margin-top: 2px; }

/* 카드 */
.card { background: white; border-radius: 12px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,.06); margin-bottom: 20px; }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.card-header h2 { font-size: 14px; font-weight: 700; color: #2d3436; }
.card-header .hint { font-size: 11px; color: #b2bec3; }
.chart-wrap { height: 520px; }
.top-n-btns { display: flex; gap: 4px; }
.top-n-btn { padding: 4px 10px; font-size: 12px; border: 1px solid #dfe6e9; border-radius: 20px; cursor: pointer; background: white; color: #636e72; transition: all .15s; }
.top-n-btn:hover { border-color: #6c5ce7; color: #6c5ce7; }
.top-n-btn.active { background: #6c5ce7; border-color: #6c5ce7; color: white; font-weight: 600; }

/* 브랜드 인사이트 */
.brand-insight-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.insight-card { background: #f8f9ff; border-radius: 10px; padding: 14px 16px; border: 1px solid #ebe8ff; }
.insight-card .i-label { font-size: 11px; color: #636e72; text-transform: uppercase; letter-spacing: .4px; }
.insight-card .i-value { font-size: 22px; font-weight: 700; color: #2d3436; margin-top: 4px; }
.insight-card .i-sub { font-size: 11px; color: #b2bec3; margin-top: 2px; }
.insight-card.highlight { background: linear-gradient(135deg, #f3f0ff, #e8e0ff); border-color: #c9bbff; }
.insight-card.highlight .i-value { color: #6c5ce7; }
.insight-card.up .i-value { color: #00b894; }
.insight-card.down .i-value { color: #e17055; }
.dist-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 6px; gap: 2px; }
.dist-bar span { border-radius: 2px; transition: width .3s; }
.dist-legend { display: flex; gap: 10px; margin-top: 5px; flex-wrap: wrap; }
.dist-legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #636e72; }
.dist-legend-item span { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.brand-products-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
.brand-products-table th { font-size: 11px; color: #b2bec3; text-transform: uppercase; letter-spacing: .4px; padding: 6px 10px; border-bottom: 2px solid #f5f6fa; text-align: left; }
.brand-products-table td { padding: 9px 10px; border-bottom: 1px solid #f5f6fa; vertical-align: middle; }
.brand-products-table tr:last-child td { border-bottom: none; }
.brand-products-table tr:hover td { background: #fafbff; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

/* 테이블 */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #b2bec3; padding: 8px 10px; border-bottom: 2px solid #f5f6fa; }
td { padding: 10px 10px; border-bottom: 1px solid #f5f6fa; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fafbff; }
td.rank { font-weight: 700; font-size: 14px; width: 54px; color: #2d3436; }
td.diff-cell { width: 50px; }
td.brand { color: #636e72; font-size: 12px; width: 110px; }
td.name a { color: #2d3436; text-decoration: none; }
td.name a:hover { color: #6c5ce7; text-decoration: underline; }
td.price { color: #0984e3; font-weight: 600; width: 80px; }
td.reviews { color: #636e72; width: 100px; }
td.gain { color: #00b894; font-weight: 700; width: 70px; }
.review-gain { color: #00b894; font-size: 11px; margin-left: 4px; }
.badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.badge.up { background: #d4f5e9; color: #00b894; }
.badge.down { background: #fff3cd; color: #e17055; }
.badge.same { background: #f0f0f0; color: #b2bec3; }
.badge.new { background: #e8f4fd; color: #0984e3; }
.empty { color: #b2bec3; text-align: center; padding: 24px; font-size: 13px; }
.no-result { text-align: center; padding: 32px; color: #b2bec3; font-size: 13px; }

@media (max-width: 768px) {
  .grid-2 { grid-template-columns: 1fr; }
  td.brand { display: none; }
  .header { padding: 16px; }
  .container { padding: 12px; }
}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1 data-i18n="title">YesStyle 순위 대시보드</h1>
    <div class="meta"><span data-i18n="category">카테고리</span>: ${config.category || 'Beauty'} · <span data-i18n="lastUpdated">마지막 업데이트</span>: ${latestDate} · <span data-i18n="currency">통화</span>: ${currency}</div>
  </div>
  <div class="lang-toggle">
    <button class="lang-btn active" data-lang="ko">KO</button>
    <button class="lang-btn" data-lang="en">EN</button>
  </div>
</div>

<div class="container">

  <!-- JUMISO 고정 배너 -->
  <div class="jumiso-banner" id="jumisoBanner">
    <h2 data-i18n="jumisoBrand">JUMISO 브랜드 현황</h2>
    <table>
      <thead><tr><th data-i18n="rank">순위</th><th data-i18n="change">변동</th><th data-i18n="product">제품명</th><th data-i18n="price">가격</th><th data-i18n="reviews">리뷰 수</th></tr></thead>
      <tbody id="jumisoTableBody"></tbody>
    </table>
    <div class="jumiso-chart-wrap"><canvas id="jumisoChart"></canvas></div>
  </div>

  <!-- 필터 바 -->
  <div class="filter-bar">
    <div class="filter-row">
      <span class="filter-label" data-i18n="period">기간</span>
      <div class="date-btns">
        <button class="date-btn" data-days="7" data-i18n="day7">7일</button>
        <button class="date-btn" data-days="14" data-i18n="day14">14일</button>
        <button class="date-btn" data-days="30" data-i18n="day30">30일</button>
        <button class="date-btn active" data-days="0" data-i18n="all">전체</button>
      </div>
      <div class="date-custom">
        <input type="date" id="dateFrom">
        <span>~</span>
        <input type="date" id="dateTo">
      </div>
    </div>
    <div class="filter-row">
      <span class="filter-label" data-i18n="search">검색</span>
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" id="searchInput" data-i18n-placeholder="searchPlaceholder">
        <span class="search-clear" id="searchClear">✕</span>
      </div>
      <button class="filter-reset" id="filterReset" data-i18n="reset">초기화</button>
    </div>
    <div class="filter-row">
      <span class="filter-label" data-i18n="brand">브랜드</span>
      <div class="brand-tags" id="brandTags"></div>
    </div>
  </div>

  <!-- 통계 카드 -->
  <div class="stats">
    <div class="stat-card">
      <div class="label" data-i18n="statProductsLabel">표시 제품 수</div>
      <div class="value" id="statProducts">-</div>
      <div class="sub" id="statPeriod">-</div>
    </div>
    <div class="stat-card">
      <div class="label" data-i18n="statDaysLabel">조회 기간</div>
      <div class="value" id="statDays">-</div>
      <div class="sub" data-i18n="days">일</div>
    </div>
    <div class="stat-card">
      <div class="label" data-i18n="statTop1Label">1위 제품</div>
      <div class="value" id="statTop1" style="font-size:13px;margin-top:6px;">-</div>
      <div class="sub" id="statTop1Brand">-</div>
    </div>
    <div class="stat-card">
      <div class="label" data-i18n="statBrandsLabel">필터 브랜드</div>
      <div class="value" id="statBrands" data-i18n-default="all">전체</div>
      <div class="sub" data-i18n="selected">선택됨</div>
    </div>
  </div>

  <!-- 순위 트렌드 차트 -->
  <div class="card">
    <div class="card-header">
      <h2 id="trendTitle">-</h2>
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="top-n-btns" id="topNBtns">
          <button class="top-n-btn active" data-n="20">TOP 20</button>
          <button class="top-n-btn" data-n="30">TOP 30</button>
          <button class="top-n-btn" data-n="50">TOP 50</button>
          <button class="top-n-btn" data-n="100">TOP 100</button>
        </div>
        <span class="hint" id="trendHint"></span>
      </div>
    </div>
    <div class="chart-wrap"><canvas id="rankChart"></canvas></div>
  </div>

  <!-- 브랜드 인사이트 -->
  <div class="card" id="brandInsightCard" style="display:none">
    <div class="card-header">
      <h2 id="brandInsightTitle">-</h2>
      <span class="hint" id="brandInsightHint"></span>
    </div>
    <div class="brand-insight-grid" id="brandInsightGrid"></div>
    <div style="margin-top:16px;" id="brandInsightProducts"></div>
  </div>

  <!-- TOP 순위 테이블 -->
  <div class="card">
    <div class="card-header">
      <h2 id="tableTitle">-</h2>
      <span class="hint" id="tableHint"></span>
    </div>
    <table>
      <thead><tr><th data-i18n="rank">순위</th><th data-i18n="change">변동</th><th data-i18n="brand">브랜드</th><th data-i18n="product">제품명</th><th data-i18n="price">가격</th><th data-i18n="reviews">리뷰 수</th></tr></thead>
      <tbody id="rankTableBody"></tbody>
    </table>
  </div>

  <!-- 리뷰 증가 / 신규 진입 -->
  <div class="grid-2">
    <div class="card">
      <div class="card-header"><h2 data-i18n="reviewTop10">리뷰 증가 TOP 10</h2><span class="hint" data-i18n="vsPrevDay">전일 대비</span></div>
      <table>
        <thead><tr><th data-i18n="rank">순위</th><th data-i18n="brand">브랜드</th><th data-i18n="product">제품명</th><th data-i18n="totalReviews">총 리뷰</th><th data-i18n="newReviews">+신규</th></tr></thead>
        <tbody id="reviewTableBody"></tbody>
      </table>
    </div>
    <div class="card">
      <div class="card-header"><h2 id="newEntryTitle" data-i18n="newEntry">신규 진입</h2><span class="hint" id="newEntryHint"></span></div>
      <table>
        <thead><tr><th data-i18n="rank">순위</th><th data-i18n="brand">브랜드</th><th data-i18n="product">제품명</th><th data-i18n="price">가격</th></tr></thead>
        <tbody id="newEntryBody"></tbody>
      </table>
    </div>
  </div>

</div>

<script>
// ── 번역 ─────────────────────────────────────────────────
const T = {
  ko: {
    title: 'YesStyle 순위 대시보드', category: '카테고리', lastUpdated: '마지막 업데이트', currency: '통화',
    jumisoBrand: 'JUMISO 브랜드 현황',
    rank: '순위', change: '변동', product: '제품명', price: '가격', reviews: '리뷰 수', brand: '브랜드',
    period: '기간', day7: '7일', day14: '14일', day30: '30일', all: '전체',
    search: '검색', searchPlaceholder: '브랜드명 또는 제품명 검색...', reset: '초기화',
    statProductsLabel: '표시 제품 수', statDaysLabel: '조회 기간', days: '일',
    statTop1Label: '1위 제품', statBrandsLabel: '필터 브랜드', selected: '선택됨',
    reviewTop10: '리뷰 증가 TOP 10', vsPrevDay: '전일 대비',
    totalReviews: '총 리뷰', newReviews: '+신규', newEntry: '신규 진입',
    trendTop20: '상위 20위 순위 트렌드', trendSearch: '"{q}" 검색 결과 순위 트렌드',
    trendBrand: '[{b}] 순위 트렌드', latestRank: '최신 순위 TOP 50',
    searchResult: '"{q}" 검색 결과', brandRank: '[{b}] 제품 순위', baseDate: '기준일',
    noResult: '검색 결과가 없습니다.', needMoreData: '2일 이상 데이터 필요',
    noReviewGain: '리뷰 증가 없음', noNewEntry: '신규 진입 없음', noJumiso: 'JUMISO 제품 없음',
    notInRank: '미진입', newBadge: '신규',
  },
  en: {
    title: 'YesStyle Rank Dashboard', category: 'Category', lastUpdated: 'Last Updated', currency: 'Currency',
    jumisoBrand: 'JUMISO Brand Overview',
    rank: 'Rank', change: 'Change', product: 'Product', price: 'Price', reviews: 'Reviews', brand: 'Brand',
    period: 'Period', day7: '7 Days', day14: '14 Days', day30: '30 Days', all: 'All',
    search: 'Search', searchPlaceholder: 'Search by brand or product name...', reset: 'Reset',
    statProductsLabel: 'Products Shown', statDaysLabel: 'Period', days: 'days',
    statTop1Label: 'Rank #1', statBrandsLabel: 'Brand Filter', selected: 'selected',
    reviewTop10: 'Review Gainers TOP 10', vsPrevDay: 'vs. prev day',
    totalReviews: 'Total', newReviews: '+New', newEntry: 'New Entries',
    trendTop20: 'Top 20 Rank Trend', trendSearch: 'Search: "{q}" Rank Trend',
    trendBrand: '[{b}] Rank Trend', latestRank: 'Latest Rankings TOP 50',
    searchResult: 'Search: "{q}"', brandRank: '[{b}] Rankings', baseDate: 'As of',
    noResult: 'No results found.', needMoreData: 'Need 2+ days of data',
    noReviewGain: 'No review gains', noNewEntry: 'No new entries', noJumiso: 'No JUMISO products',
    notInRank: 'Not ranked', newBadge: 'New',
  }
};

let lang = localStorage.getItem('ys_lang') || 'ko';

function t(key, vars = {}) {
  let str = T[lang][key] || T.ko[key] || key;
  Object.entries(vars).forEach(([k, v]) => { str = str.replace(\`{\${k}}\`, v); });
  return str;
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  // statBrands 기본값 처리
  const sb = document.getElementById('statBrands');
  if (sb && (sb.textContent === T.ko.all || sb.textContent === T.en.all)) {
    sb.textContent = t('all');
  }
}

// ── 내장 데이터 ──────────────────────────────────────────
const ALL_DATES = ${JSON.stringify(allDates)};
const ALL_BRANDS = ${JSON.stringify(allBrands)};
const PRODUCT_MAP = ${JSON.stringify(productMap)};
const LATEST_DATE = '${latestDate}';
const CURRENCY = '${currency}';
const JUMISO_BRAND = 'JUMISO';

const CHART_COLORS = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#636e72',
  '#1a6b9a','#d4681e','#c43c3e','#4f9490','#3d8035',
  '#c9a030','#8a5a80','#e07a85','#7a5540','#8a8078'
];

// ── 상태 ─────────────────────────────────────────────────
let state = {
  dateFrom: ALL_DATES[0],
  dateTo: LATEST_DATE,
  selectedBrands: [],   // 빈 배열 = 전체
  searchQuery: '',
  topN: 20
};

// ── 차트 인스턴스 ─────────────────────────────────────────
let rankChartInst = null;
let jumisoChartInst = null;

// ── 유틸 ─────────────────────────────────────────────────
function fmt(p) {
  const pd = p.prices[state.dateTo] || p.prices[LATEST_DATE];
  if (!pd) return '-';
  return (pd.currency === 'KRW' ? '₩' : '$') + pd.num.toLocaleString();
}

function diffBadge(diff) {
  if (diff === null) return \`<span class="badge new">\${t('newBadge')}</span>\`;
  if (diff > 0) return \`<span class="badge up">▲\${diff}</span>\`;
  if (diff < 0) return \`<span class="badge down">▼\${Math.abs(diff)}</span>\`;
  return '<span class="badge same">-</span>';
}

function filteredDates() {
  return ALL_DATES.filter(d => d >= state.dateFrom && d <= state.dateTo);
}

function filteredProducts() {
  const dates = filteredDates();
  const endDate = dates[dates.length - 1];
  const q = state.searchQuery.toLowerCase();
  return Object.values(PRODUCT_MAP).filter(p => {
    if (p.ranks[endDate] === undefined) return false;
    if (state.selectedBrands.length > 0 && !state.selectedBrands.includes(p.brand)) return false;
    if (q && !p.brand.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => a.ranks[endDate] - b.ranks[endDate]);
}

// 검색어 있으면 전 기간에서 등장한 제품도 포함 (순위권 밖이어도)
function searchProducts() {
  const q = state.searchQuery.toLowerCase();
  if (!q) return [];
  return Object.values(PRODUCT_MAP).filter(p =>
    p.brand.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
  );
}

// ── 렌더: JUMISO 배너 ────────────────────────────────────
function renderJumiso() {
  const dates = ALL_DATES;
  const endDate = LATEST_DATE;
  const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;
  const products = Object.values(PRODUCT_MAP)
    .filter(p => p.brand.toUpperCase() === JUMISO_BRAND)
    .sort((a, b) => (a.ranks[endDate] ?? 9999) - (b.ranks[endDate] ?? 9999));

  const tbody = document.getElementById('jumisoTableBody');
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">JUMISO 제품 없음</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => {
    const rank = p.ranks[endDate];
    const prevRank = prevDate ? p.ranks[prevDate] : undefined;
    const diff = (rank && prevRank) ? prevRank - rank : null;
    const rdiff = (p.reviews[endDate] && prevDate && p.reviews[prevDate])
      ? p.reviews[endDate] - p.reviews[prevDate] : null;
    const rankStr = rank ? \`#\${rank}\` : \`<span style="opacity:.5">\${t('notInRank')}</span>\`;
    return \`<tr>
      <td class="rank">\${rankStr}</td>
      <td class="diff-cell">\${rank ? diffBadge(diff) : ''}</td>
      <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.\${p.id}" target="_blank">\${p.name}</a></td>
      <td class="price">\${fmt(p)}</td>
      <td class="reviews">\${p.reviews[endDate]?.toLocaleString() ?? '-'}\${rdiff > 0 ? \`<span class="review-gain"> +\${rdiff}</span>\` : ''}</td>
    </tr>\`;
  }).join('');

  // JUMISO 차트
  const jDates = ALL_DATES;
  if (jumisoChartInst) jumisoChartInst.destroy();
  if (products.length === 0 || jDates.length < 2) return;

  jumisoChartInst = new Chart(document.getElementById('jumisoChart'), {
    type: 'line',
    data: {
      labels: jDates,
      datasets: products.map((p, i) => ({
        label: p.name.slice(0, 35),
        data: jDates.map(d => p.ranks[d] || null),
        borderColor: ['rgba(255,255,255,.9)', 'rgba(255,255,200,.8)'][i % 2],
        backgroundColor: ['rgba(255,255,255,.9)', 'rgba(255,255,200,.8)'][i % 2],
        tension: 0.3, pointRadius: 3, spanGaps: true
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { reverse: true, ticks: { callback: v => '#'+v, color: 'rgba(255,255,255,.7)' }, grid: { color: 'rgba(255,255,255,.1)' } },
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,.7)' } }
      },
      plugins: {
        legend: { labels: { color: 'white', font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => \` \${c.dataset.label}: #\${c.raw}\` } }
      }
    }
  });
}

// ── 렌더: 순위 트렌드 차트 ───────────────────────────────
function renderTrendChart() {
  const dates = filteredDates();
  const endDate = dates[dates.length - 1];
  const q = state.searchQuery.toLowerCase();

  // 브랜드 선택 시 topN 무시하고 해당 브랜드 전체 제품 표시
  const brandSelected = state.selectedBrands.length > 0;
  let products;
  if (q) {
    products = searchProducts().sort((a, b) =>
      (a.ranks[endDate] ?? 9999) - (b.ranks[endDate] ?? 9999)
    ).slice(0, state.topN);
  } else if (brandSelected) {
    products = filteredProducts(); // topN 제한 없이 전체
  } else {
    products = filteredProducts().slice(0, state.topN);
  }

  const title = q
    ? t('trendSearch', { q: state.searchQuery })
    : brandSelected
      ? t('trendBrand', { b: state.selectedBrands.join(', ') })
      : t('trendTop20').replace('20', state.topN);

  document.getElementById('trendTitle').textContent = title;
  document.getElementById('trendHint').textContent = \`\${dates[0]} ~ \${dates[dates.length-1]}\`;

  if (rankChartInst) rankChartInst.destroy();

  if (!products.length) {
    document.getElementById('rankChart').getContext('2d').clearRect(0,0,9999,9999);
    return;
  }

  rankChartInst = new Chart(document.getElementById('rankChart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: products.map((p, i) => ({
        label: \`\${p.brand} \${p.name}\`.slice(0, 32),
        data: dates.map(d => p.ranks[d] || null),
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
        tension: 0.3,
        pointRadius: dates.length <= 10 ? 4 : 2,
        spanGaps: true
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          reverse: true, min: 1,
          max: brandSelected ? Math.max(...products.map(p => p.ranks[endDate] ?? 1), 1) + 5 : state.topN,
          ticks: { stepSize: state.topN <= 20 && !brandSelected ? 1 : state.topN <= 50 ? 5 : 10, callback: v => '#'+v },
          title: { display: true, text: lang === 'ko' ? '순위' : 'Rank' }
        },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 10, padding: 6 } },
        tooltip: { callbacks: { label: c => \` \${c.dataset.label}: #\${c.raw}\` } }
      }
    }
  });
}

// ── 렌더: 순위 테이블 ────────────────────────────────────
function renderRankTable() {
  const dates = filteredDates();
  const endDate = dates[dates.length - 1];
  const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;
  const q = state.searchQuery.toLowerCase();

  let products;
  if (q) {
    products = searchProducts().sort((a, b) =>
      (a.ranks[endDate] ?? 9999) - (b.ranks[endDate] ?? 9999)
    );
  } else {
    // 브랜드 필터 무관하게 항상 전체 TOP 50 표시
    products = Object.values(PRODUCT_MAP).filter(p => p.ranks[endDate] !== undefined)
      .sort((a, b) => a.ranks[endDate] - b.ranks[endDate]);
  }

  document.getElementById('tableTitle').textContent = q
    ? t('searchResult', { q: state.searchQuery })
    : t('latestRank');
  document.getElementById('tableHint').textContent = \`\${t('baseDate')}: \${endDate}\`;

  const display = products.slice(0, 50);
  const tbody = document.getElementById('rankTableBody');

  if (!display.length) {
    tbody.innerHTML = \`<tr><td colspan="6" class="no-result">\${t('noResult')}</td></tr>\`;
    return;
  }

  tbody.innerHTML = display.map(p => {
    const rank = p.ranks[endDate];
    const prevRank = prevDate ? p.ranks[prevDate] : undefined;
    const diff = (rank && prevRank) ? prevRank - rank : null;
    const rdiff = (p.reviews[endDate] && prevDate && p.reviews[prevDate])
      ? p.reviews[endDate] - p.reviews[prevDate] : null;
    const rankStr = rank ? \`#\${rank}\` : '<span style="color:#b2bec3">-</span>';
    return \`<tr>
      <td class="rank">\${rankStr}</td>
      <td class="diff-cell">\${diffBadge(rank ? diff : null)}</td>
      <td class="brand">\${p.brand}</td>
      <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.\${p.id}" target="_blank">\${p.name}</a></td>
      <td class="price">\${fmt(p)}</td>
      <td class="reviews">\${p.reviews[endDate]?.toLocaleString() ?? '-'}\${rdiff > 0 ? \`<span class="review-gain"> +\${rdiff}</span>\` : ''}</td>
    </tr>\`;
  }).join('');
}

// ── 렌더: 리뷰 증가 테이블 ──────────────────────────────
function renderReviewTable() {
  const dates = filteredDates();
  const endDate = dates[dates.length - 1];
  const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;

  if (!prevDate) {
    document.getElementById('reviewTableBody').innerHTML =
      \`<tr><td colspan="5" class="empty">\${t('needMoreData')}</td></tr>\`;
    return;
  }

  const gainers = filteredProducts()
    .map(p => ({ ...p, gain: (p.reviews[endDate] && p.reviews[prevDate]) ? p.reviews[endDate] - p.reviews[prevDate] : null }))
    .filter(p => p.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 10);

  document.getElementById('reviewTableBody').innerHTML = gainers.length
    ? gainers.map(p => \`<tr>
        <td class="rank">#\${p.ranks[endDate]}</td>
        <td class="brand">\${p.brand}</td>
        <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.\${p.id}" target="_blank">\${p.name}</a></td>
        <td class="reviews">\${p.reviews[endDate].toLocaleString()}</td>
        <td class="gain">+\${p.gain.toLocaleString()}</td>
      </tr>\`).join('')
    : \`<tr><td colspan="5" class="empty">\${t('noReviewGain')}</td></tr>\`;
}

// ── 렌더: 신규 진입 테이블 ──────────────────────────────
function renderNewEntry() {
  const dates = filteredDates();
  const endDate = dates[dates.length - 1];
  const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;

  const products = filteredProducts();
  const newEntries = prevDate
    ? products.filter(p => p.ranks[endDate] && !p.ranks[prevDate]).slice(0, 10)
    : [];

  document.getElementById('newEntryTitle').textContent = t('newEntry');
  document.getElementById('newEntryHint').textContent = prevDate ? \`vs. \${prevDate}\` : '';

  document.getElementById('newEntryBody').innerHTML = newEntries.length
    ? newEntries.map(p => \`<tr>
        <td class="rank">#\${p.ranks[endDate]}</td>
        <td class="brand">\${p.brand}</td>
        <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.\${p.id}" target="_blank">\${p.name}</a></td>
        <td class="price">\${fmt(p)}</td>
      </tr>\`).join('')
    : \`<tr><td colspan="4" class="empty">\${t('noNewEntry')}</td></tr>\`;
}

// ── 렌더: 통계 카드 ──────────────────────────────────────
function renderStats() {
  const dates = filteredDates();
  const endDate = dates[dates.length - 1];
  const products = filteredProducts();

  document.getElementById('statProducts').textContent = products.length.toLocaleString();
  document.getElementById('statPeriod').textContent = \`\${dates[0]} ~\`;
  document.getElementById('statDays').textContent = dates.length;
  document.getElementById('statTop1').textContent = products[0]?.name?.slice(0, 16) ?? '-';
  document.getElementById('statTop1Brand').textContent = products[0]?.brand ?? '';
  document.getElementById('statBrands').textContent =
    state.selectedBrands.length > 0 ? state.selectedBrands.length + (lang === 'ko' ? '개' : '') : t('all');
}

// ── 렌더: 브랜드 인사이트 ────────────────────────────────
// 단일 브랜드 인사이트 HTML 생성
function buildBrandInsightHtml(brand, endDate, prevDate) {
  const ko = lang === 'ko';
  const allProds  = Object.values(PRODUCT_MAP).filter(p => p.brand === brand);
  const ranked    = allProds.filter(p => p.ranks[endDate]).sort((a, b) => a.ranks[endDate] - b.ranks[endDate]);

  const top10  = ranked.filter(p => p.ranks[endDate] <= 10).length;
  const top50  = ranked.filter(p => p.ranks[endDate] <= 50).length;
  const top100 = ranked.filter(p => p.ranks[endDate] <= 100).length;
  const avg    = ranked.length ? Math.round(ranked.reduce((s, p) => s + p.ranks[endDate], 0) / ranked.length) : null;
  const best   = ranked[0];

  const totalReviews = ranked.reduce((s, p) => s + (p.reviews[endDate] || 0), 0);
  const newReviews   = prevDate
    ? ranked.reduce((s, p) => s + Math.max(0, (p.reviews[endDate] || 0) - (p.reviews[prevDate] || 0)), 0)
    : null;
  const rising  = prevDate ? ranked.filter(p => p.ranks[prevDate] && p.ranks[endDate] < p.ranks[prevDate]).length : null;
  const falling = prevDate ? ranked.filter(p => p.ranks[prevDate] && p.ranks[endDate] > p.ranks[prevDate]).length : null;

  const metrics = [
    { label: ko ? 'TOP 100 내 제품' : 'In TOP 100',      value: top100,                              sub: ko ? \`전체 \${allProds.length}개 중\` : \`of \${allProds.length} total\`,   cls: 'highlight' },
    { label: ko ? 'TOP 10 / TOP 50' : 'TOP 10 / TOP 50', value: \`\${top10} / \${top50}\`,              sub: ko ? '진입 제품 수' : 'products ranked',                               cls: '' },
    { label: ko ? '평균 순위' : 'Avg Rank',               value: avg ? \`#\${avg}\` : '-',               sub: ko ? '순위권 기준' : 'ranked only',                                    cls: '' },
    { label: ko ? '최고 순위' : 'Best Rank',              value: best ? \`#\${best.ranks[endDate]}\` : '-', sub: best ? best.name.slice(0, 22) : '-',                              cls: 'highlight' },
    { label: ko ? '총 리뷰 수' : 'Total Reviews',         value: totalReviews.toLocaleString(),        sub: ko ? '순위권 합산' : 'ranked products',                                cls: '' },
    { label: ko ? '일 신규 리뷰' : 'New Reviews/Day',     value: newReviews !== null ? \`+\${newReviews.toLocaleString()}\` : '-', sub: ko ? '판매량 지표' : 'sales proxy',        cls: newReviews > 0 ? 'up' : '' },
    { label: ko ? '상승 / 하락' : 'Rising / Falling',    value: rising !== null ? \`\${rising} / \${falling}\` : '-', sub: ko ? '전일 대비 제품 수' : 'vs prev day',               cls: rising > falling ? 'up' : rising < falling ? 'down' : '' },
  ];

  const metricsHtml = metrics.map(m => \`
    <div class="insight-card \${m.cls}">
      <div class="i-label">\${m.label}</div>
      <div class="i-value">\${m.value}</div>
      <div class="i-sub">\${m.sub}</div>
    </div>\`).join('');

  // 분포 바
  const d10 = top10, d50 = top50 - top10, d100 = top100 - top50;
  const pct = n => top100 ? Math.round(n / top100 * 100) : 0;
  const distHtml = top100 > 0 ? \`
    <div style="margin-top:16px;">
      <div style="font-size:12px;font-weight:700;color:#636e72;margin-bottom:8px;">\${ko ? '순위 분포' : 'Rank Distribution'}</div>
      <div class="dist-bar">
        <span style="width:\${pct(d10)}%;background:#6c5ce7;"></span>
        <span style="width:\${pct(d50)}%;background:#a29bfe;"></span>
        <span style="width:\${pct(d100)}%;background:#dfe6e9;"></span>
      </div>
      <div class="dist-legend">
        <div class="dist-legend-item"><span style="background:#6c5ce7"></span>TOP 10 (\${d10})</div>
        <div class="dist-legend-item"><span style="background:#a29bfe"></span>TOP 11–50 (\${d50})</div>
        <div class="dist-legend-item"><span style="background:#dfe6e9"></span>TOP 51–100 (\${d100})</div>
      </div>
    </div>\` : '';

  // 제품 상세 테이블
  const prodRows = ranked.map(p => {
    const diff  = prevDate && p.ranks[prevDate] ? p.ranks[prevDate] - p.ranks[endDate] : null;
    const rdiff = prevDate && p.reviews[prevDate] != null ? (p.reviews[endDate] || 0) - p.reviews[prevDate] : null;
    return \`<tr>
      <td style="font-weight:700;width:54px;">#\${p.ranks[endDate]}</td>
      <td style="width:50px;">\${diffBadge(diff)}</td>
      <td><a href="https://www.yesstyle.com/en/info.html/pid.\${p.id}" target="_blank" style="color:#2d3436;text-decoration:none;">\${p.name}</a></td>
      <td style="color:#0984e3;font-weight:600;width:80px;">\${fmt(p)}</td>
      <td style="color:#636e72;width:110px;">\${(p.reviews[endDate]||0).toLocaleString()}\${rdiff > 0 ? \`<span style="color:#00b894;font-size:11px;"> +\${rdiff}</span>\` : ''}</td>
    </tr>\`;
  }).join('');

  const prodHtml = ranked.length ? \`
    \${distHtml}
    <div style="font-size:12px;font-weight:700;color:#636e72;margin:16px 0 8px;">\${ko ? '제품별 상세' : 'Product Details'}</div>
    <table class="brand-products-table">
      <thead><tr>
        <th>\${ko?'순위':'Rank'}</th><th>\${ko?'변동':'Chg'}</th>
        <th>\${ko?'제품명':'Product'}</th><th>\${ko?'가격':'Price'}</th><th>\${ko?'리뷰 수':'Reviews'}</th>
      </tr></thead>
      <tbody>\${prodRows}</tbody>
    </table>\`
    : \`<div class="empty">\${ko ? '순위권 진입 제품 없음' : 'No products ranked'}</div>\`;

  return \`
    <div style="margin-bottom:28px;">
      <div style="font-size:15px;font-weight:700;color:#2d3436;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #6c5ce7;">
        \${brand} <span style="font-size:12px;font-weight:400;color:#b2bec3;margin-left:6px;">\${ko?'기준일':'as of'}: \${endDate}</span>
      </div>
      <div class="brand-insight-grid">\${metricsHtml}</div>
      \${prodHtml}
    </div>\`;
}

function renderBrandInsight() {
  const card = document.getElementById('brandInsightCard');
  if (state.selectedBrands.length === 0) { card.style.display = 'none'; return; }
  card.style.display = '';

  const ko = lang === 'ko';
  const dates   = filteredDates();
  const endDate = dates[dates.length - 1];
  const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;

  document.getElementById('brandInsightTitle').textContent =
    ko ? '브랜드 인사이트' : 'Brand Insights';
  document.getElementById('brandInsightHint').textContent =
    \`\${state.selectedBrands.length}\${ko ? '개 브랜드 선택됨' : ' brand(s) selected'}\`;

  // 브랜드별 각각 렌더링
  document.getElementById('brandInsightGrid').innerHTML = '';
  document.getElementById('brandInsightProducts').innerHTML =
    state.selectedBrands.map(b => buildBrandInsightHtml(b, endDate, prevDate)).join('');
}

// ── 전체 렌더 ────────────────────────────────────────────
function render() {
  renderStats();
  renderTrendChart();
  renderBrandInsight();
  renderRankTable();
  renderReviewTable();
  renderNewEntry();
}

// ── 브랜드 태그 초기화 ────────────────────────────────────
function initBrandTags() {
  const container = document.getElementById('brandTags');
  container.innerHTML = ALL_BRANDS.map(b => {
    const isJumiso = b.toUpperCase() === 'JUMISO';
    return \`<span class="brand-tag\${isJumiso ? ' active' : ''}" data-brand="\${b}">\${b}</span>\`;
  }).join('');

  // JUMISO 기본 선택
  state.selectedBrands = ['JUMISO'];

  container.addEventListener('click', e => {
    const tag = e.target.closest('.brand-tag');
    if (!tag) return;
    const brand = tag.dataset.brand;
    const idx = state.selectedBrands.indexOf(brand);
    if (idx >= 0) {
      state.selectedBrands.splice(idx, 1);
      tag.classList.remove('active');
    } else {
      state.selectedBrands.push(brand);
      tag.classList.add('active');
    }
    render();
  });
}

// ── 날짜 필터 초기화 ─────────────────────────────────────
function initDateFilters() {
  const fromInput = document.getElementById('dateFrom');
  const toInput = document.getElementById('dateTo');
  fromInput.min = toInput.min = ALL_DATES[0];
  fromInput.max = toInput.max = LATEST_DATE;
  fromInput.value = state.dateFrom;
  toInput.value = state.dateTo;

  document.querySelectorAll('.date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days);
      if (days === 0) {
        state.dateFrom = ALL_DATES[0];
      } else {
        const from = new Date(LATEST_DATE);
        from.setDate(from.getDate() - days + 1);
        state.dateFrom = from.toISOString().slice(0, 10);
      }
      state.dateTo = LATEST_DATE;
      fromInput.value = state.dateFrom;
      toInput.value = state.dateTo;
      render();
    });
  });

  fromInput.addEventListener('change', () => {
    state.dateFrom = fromInput.value;
    document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
    render();
  });
  toInput.addEventListener('change', () => {
    state.dateTo = toInput.value;
    document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
    render();
  });
}

// ── 검색 초기화 ──────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('searchInput');
  const clear = document.getElementById('searchClear');

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.searchQuery = input.value.trim();
      clear.classList.toggle('show', !!state.searchQuery);
      render();
    }, 250);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    state.searchQuery = '';
    clear.classList.remove('show');
    render();
  });
}

// ── 초기화 버튼 ──────────────────────────────────────────
function initResetBtn() {
  document.getElementById('filterReset').addEventListener('click', () => {
    state.dateFrom = ALL_DATES[0];
    state.dateTo = LATEST_DATE;
    state.selectedBrands = ['JUMISO'];
    state.searchQuery = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('show');
    document.getElementById('dateFrom').value = state.dateFrom;
    document.getElementById('dateTo').value = state.dateTo;
    document.querySelectorAll('.date-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.days === '0'));
    document.querySelectorAll('.brand-tag').forEach(t =>
      t.classList.toggle('active', t.dataset.brand.toUpperCase() === 'JUMISO'));
    render();
  });
}

// ── TOP N 버튼 ───────────────────────────────────────────
document.getElementById('topNBtns').addEventListener('click', e => {
  const btn = e.target.closest('.top-n-btn');
  if (!btn) return;
  state.topN = parseInt(btn.dataset.n);
  document.querySelectorAll('.top-n-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderTrendChart();
});

// ── 언어 토글 ────────────────────────────────────────────
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    localStorage.setItem('ys_lang', lang);
    applyLang();
    render();
    renderJumiso();
  });
});

// ── 초기 실행 ────────────────────────────────────────────
applyLang();
renderJumiso();
initBrandTags();
initDateFilters();
initSearch();
initResetBtn();
render();
</script>
</body>
</html>`;

const outFile = path.join(dashboardDir, 'index.html');
fs.writeFileSync(outFile, html, 'utf-8');
console.log(`대시보드 생성 완료: ${outFile}`);
