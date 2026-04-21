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

const dates = history.map(h => h.date);
const latest = history[history.length - 1];
const prev = history.length >= 2 ? history[history.length - 2] : null;

// 제품별 히스토리 빌드
const productMap = {};
history.forEach(day => {
  (day.products || []).forEach(p => {
    const key = p.id || p.name;
    if (!key) return;
    if (!productMap[key]) productMap[key] = { id: p.id, name: p.name, brand: p.brand, ranks: {}, reviews: {}, prices: {} };
    productMap[key].ranks[day.date] = p.rank;
    if (p.reviewCount != null) productMap[key].reviews[day.date] = p.reviewCount;
    if (p.priceNum) productMap[key].prices[day.date] = { num: p.priceNum, currency: p.currency };
  });
});

// 최신 순위 기준 정렬된 상품 목록
const latestDate = latest.date;
const prevDate = prev ? prev.date : null;
const sortedProducts = Object.values(productMap)
  .filter(p => p.ranks[latestDate] !== undefined)
  .sort((a, b) => a.ranks[latestDate] - b.ranks[latestDate]);

// 순위 변동 계산
function rankDiff(p) {
  if (!prevDate || p.ranks[prevDate] === undefined) return null;
  return p.ranks[prevDate] - p.ranks[latestDate];
}

function reviewDiff(p) {
  if (!prevDate || p.reviews[prevDate] === undefined || p.reviews[latestDate] === undefined) return null;
  return p.reviews[latestDate] - p.reviews[prevDate];
}

function diffBadge(diff) {
  if (diff === null) return '<span class="badge new">신규</span>';
  if (diff > 0) return `<span class="badge up">▲${diff}</span>`;
  if (diff < 0) return `<span class="badge down">▼${Math.abs(diff)}</span>`;
  return '<span class="badge same">-</span>';
}

// JUMISO 제품 데이터
const BRAND = 'JUMISO';
const jumisoProducts = Object.values(productMap)
  .filter(p => p.brand.toUpperCase() === BRAND)
  .sort((a, b) => (a.ranks[latestDate] ?? 9999) - (b.ranks[latestDate] ?? 9999));

const jumisoChartDatasets = jumisoProducts.map((p, i) => ({
  label: p.name.slice(0, 35),
  data: dates.map(d => p.ranks[d] !== undefined ? p.ranks[d] + 1 : null),
  borderColor: ['#6c5ce7', '#fd79a8'][i % 2],
  backgroundColor: ['#6c5ce7', '#fd79a8'][i % 2],
  tension: 0.3,
  pointRadius: 4,
  spanGaps: true
}));

const jumisoRows = jumisoProducts.map(p => {
  const diff = rankDiff(p);
  const rdiff = reviewDiff(p);
  const rank = p.ranks[latestDate];
  const rankStr = rank !== undefined ? `#${rank + 1}` : '<span style="color:#b2bec3">미진입</span>';
  return `
    <tr>
      <td class="rank">${rankStr}</td>
      <td class="diff-cell">${rank !== undefined ? diffBadge(diff) : ''}</td>
      <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.${p.id}" target="_blank">${p.name}</a></td>
      <td class="price">${formatPrice(p)}</td>
      <td class="reviews">${p.reviews[latestDate]?.toLocaleString() ?? '-'}${rdiff !== null && rdiff > 0 ? `<span class="review-gain"> +${rdiff}</span>` : ''}</td>
    </tr>`;
}).join('') || '<tr><td colspan="5" class="empty">JUMISO 제품 없음</td></tr>';

// 리뷰 증가 TOP 10
const reviewGainers = sortedProducts
  .map(p => ({ ...p, gain: reviewDiff(p) }))
  .filter(p => p.gain !== null && p.gain > 0)
  .sort((a, b) => b.gain - a.gain)
  .slice(0, 10);

// 신규 진입 / 이탈
const newEntries = sortedProducts.filter(p => !prevDate || p.ranks[prevDate] === undefined).slice(0, 10);
const dropped = prevDate
  ? Object.values(productMap).filter(p => p.ranks[prevDate] !== undefined && p.ranks[latestDate] === undefined).slice(0, 10)
  : [];

// 차트 데이터 — 상위 20개 제품 순위 트렌드
const top20 = sortedProducts.slice(0, 20);
const chartColors = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'
];
const chartDatasets = top20.map((p, i) => ({
  label: `${p.brand} ${p.name}`.slice(0, 30),
  data: dates.map(d => p.ranks[d] !== undefined ? p.ranks[d] + 1 : null),
  borderColor: chartColors[i],
  backgroundColor: chartColors[i],
  tension: 0.3,
  pointRadius: dates.length <= 7 ? 4 : 2,
  spanGaps: true
}));

// 통화 표시
const currency = latest.products?.[0]?.currency || 'USD';
const currencySymbol = currency === 'KRW' ? '₩' : '$';

function formatPrice(p) {
  const pd = p.prices[latestDate];
  if (!pd) return '-';
  return `${pd.currency === 'KRW' ? '₩' : '$'}${pd.num.toLocaleString()}`;
}

// TOP 10 테이블 행 생성
const top10Rows = sortedProducts.slice(0, 10).map(p => {
  const diff = rankDiff(p);
  const rdiff = reviewDiff(p);
  return `
    <tr>
      <td class="rank">#${p.ranks[latestDate] + 1}</td>
      <td class="diff-cell">${diffBadge(diff)}</td>
      <td class="brand">${p.brand}</td>
      <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.${p.id}" target="_blank">${p.name}</a></td>
      <td class="price">${formatPrice(p)}</td>
      <td class="reviews">${p.reviews[latestDate]?.toLocaleString() ?? '-'}${rdiff !== null && rdiff > 0 ? `<span class="review-gain"> +${rdiff}</span>` : ''}</td>
    </tr>`;
}).join('');

// 리뷰 증가 TOP 10 행
const reviewRows = reviewGainers.map(p => `
  <tr>
    <td class="rank">#${p.ranks[latestDate] + 1}</td>
    <td class="brand">${p.brand}</td>
    <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.${p.id}" target="_blank">${p.name}</a></td>
    <td class="reviews">${p.reviews[latestDate]?.toLocaleString() ?? '-'}</td>
    <td class="gain">+${p.gain.toLocaleString()}</td>
  </tr>`).join('') || '<tr><td colspan="5" class="empty">데이터 부족 (2일 이상 필요)</td></tr>';

// 신규 진입 행
const newRows = newEntries.length
  ? newEntries.map(p => `
  <tr>
    <td class="rank">#${p.ranks[latestDate] + 1}</td>
    <td class="brand">${p.brand}</td>
    <td class="name"><a href="https://www.yesstyle.com/en/info.html/pid.${p.id}" target="_blank">${p.name}</a></td>
    <td class="price">${formatPrice(p)}</td>
  </tr>`).join('')
  : '<tr><td colspan="4" class="empty">신규 진입 없음</td></tr>';

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YesStyle 순위 대시보드</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f6fa; color: #2d3436; }
  .header { background: #2d3436; color: white; padding: 24px 32px; }
  .header h1 { font-size: 22px; font-weight: 600; }
  .header .meta { font-size: 13px; color: #b2bec3; margin-top: 6px; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat-card { background: white; border-radius: 10px; padding: 16px 20px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  .stat-card .label { font-size: 12px; color: #636e72; text-transform: uppercase; letter-spacing: .5px; }
  .stat-card .value { font-size: 26px; font-weight: 700; margin-top: 4px; color: #2d3436; }
  .stat-card .sub { font-size: 12px; color: #b2bec3; margin-top: 2px; }
  .card { background: white; border-radius: 10px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,.06); margin-bottom: 20px; }
  .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: #2d3436; }
  .chart-wrap { position: relative; height: 340px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #636e72; padding: 8px 10px; border-bottom: 2px solid #f0f0f0; }
  td { padding: 10px 10px; border-bottom: 1px solid #f5f6fa; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f9f9fb; }
  td.rank { font-weight: 700; font-size: 15px; width: 56px; }
  td.brand { color: #636e72; font-size: 12px; width: 120px; }
  td.name a { color: #2d3436; text-decoration: none; }
  td.name a:hover { color: #0984e3; text-decoration: underline; }
  td.price { color: #0984e3; font-weight: 600; width: 90px; }
  td.reviews { color: #636e72; width: 110px; }
  td.gain { color: #00b894; font-weight: 700; width: 80px; }
  td.diff-cell { width: 52px; }
  .review-gain { color: #00b894; font-size: 11px; margin-left: 4px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .badge.up { background: #d4f5e9; color: #00b894; }
  .badge.down { background: #ffeaa7; color: #e17055; }
  .badge.same { background: #f0f0f0; color: #b2bec3; }
  .badge.new { background: #dfe6e9; color: #636e72; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .empty { color: #b2bec3; text-align: center; padding: 20px; }
  .jumiso-banner { background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border-radius: 10px; padding: 20px 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(108,92,231,.3); }
  .jumiso-banner h2 { font-size: 15px; font-weight: 700; margin-bottom: 14px; letter-spacing: .5px; }
  .jumiso-banner table { color: white; }
  .jumiso-banner th { color: rgba(255,255,255,.7); border-bottom-color: rgba(255,255,255,.2); }
  .jumiso-banner td { border-bottom-color: rgba(255,255,255,.1); }
  .jumiso-banner td.rank { color: white; }
  .jumiso-banner td.price { color: #ffeaa7; }
  .jumiso-banner td.reviews { color: rgba(255,255,255,.8); }
  .jumiso-banner .review-gain { color: #55efc4; }
  .jumiso-banner a { color: white; }
  .jumiso-banner .badge.up { background: rgba(255,255,255,.2); color: white; }
  .jumiso-banner .badge.down { background: rgba(255,255,255,.15); color: #ffeaa7; }
  .jumiso-banner .badge.same { background: rgba(255,255,255,.1); color: rgba(255,255,255,.6); }
  .jumiso-banner .badge.new { background: rgba(255,255,255,.15); color: white; }
  .jumiso-chart-wrap { position: relative; height: 200px; margin-top: 16px; }
  @media (max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } td.brand { display: none; } }
</style>
</head>
<body>
<div class="header">
  <h1>YesStyle 순위 대시보드</h1>
  <div class="meta">카테고리: ${config.category || 'Beauty'} · 마지막 업데이트: ${latestDate} · 통화: ${currency}</div>
</div>
<div class="container">

  <div class="jumiso-banner">
    <h2>JUMISO 브랜드 현황</h2>
    <table>
      <thead><tr><th>순위</th><th>변동</th><th>제품명</th><th>가격</th><th>리뷰 수</th></tr></thead>
      <tbody>${jumisoRows}</tbody>
    </table>
    ${jumisoChartDatasets.length > 0 && dates.length >= 2 ? `
    <div class="jumiso-chart-wrap">
      <canvas id="jumisoChart"></canvas>
    </div>` : ''}
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="label">추적 제품 수</div>
      <div class="value">${latest.totalCrawled?.toLocaleString() ?? sortedProducts.length}</div>
      <div class="sub">오늘 크롤링</div>
    </div>
    <div class="stat-card">
      <div class="label">누적 일수</div>
      <div class="value">${dates.length}</div>
      <div class="sub">${dates[0]} ~</div>
    </div>
    <div class="stat-card">
      <div class="label">1위 제품</div>
      <div class="value" style="font-size:14px;margin-top:8px;">${sortedProducts[0]?.name?.slice(0, 18) ?? '-'}</div>
      <div class="sub">${sortedProducts[0]?.brand ?? ''}</div>
    </div>
    <div class="stat-card">
      <div class="label">오늘 신규 진입</div>
      <div class="value">${newEntries.length}</div>
      <div class="sub">이탈 ${dropped.length}개</div>
    </div>
  </div>

  <div class="card">
    <h2>상위 20위 순위 트렌드</h2>
    <div class="chart-wrap">
      <canvas id="rankChart"></canvas>
    </div>
  </div>

  <div class="card">
    <h2>오늘의 TOP 10</h2>
    <table>
      <thead><tr><th>순위</th><th>변동</th><th>브랜드</th><th>제품명</th><th>가격</th><th>리뷰 수</th></tr></thead>
      <tbody>${top10Rows}</tbody>
    </table>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>리뷰 증가 TOP 10 (판매량 지표)</h2>
      <table>
        <thead><tr><th>순위</th><th>브랜드</th><th>제품명</th><th>총 리뷰</th><th>+신규</th></tr></thead>
        <tbody>${reviewRows}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>오늘 신규 진입</h2>
      <table>
        <thead><tr><th>순위</th><th>브랜드</th><th>제품명</th><th>가격</th></tr></thead>
        <tbody>${newRows}</tbody>
      </table>
    </div>
  </div>

</div>
<script>
const ctx = document.getElementById('rankChart').getContext('2d');
new Chart(ctx, {
  type: 'line',
  data: {
    labels: ${JSON.stringify(dates)},
    datasets: ${JSON.stringify(chartDatasets)}
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        reverse: true,
        min: 1,
        max: 20,
        ticks: { stepSize: 1, callback: v => '#' + v },
        title: { display: true, text: '순위' }
      },
      x: { grid: { display: false } }
    },
    plugins: {
      legend: {
        position: 'right',
        labels: { font: { size: 11 }, boxWidth: 12, padding: 8 }
      },
      tooltip: {
        callbacks: {
          label: ctx => \` \${ctx.dataset.label}: #\${ctx.raw}\`
        }
      }
    }
  }
});
${jumisoChartDatasets.length > 0 && dates.length >= 2 ? `
const jumisoCtx = document.getElementById('jumisoChart').getContext('2d');
new Chart(jumisoCtx, {
  type: 'line',
  data: {
    labels: ${JSON.stringify(dates)},
    datasets: ${JSON.stringify(jumisoChartDatasets)}
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y: {
        reverse: true,
        min: 1,
        ticks: { stepSize: 10, callback: v => '#' + v, color: 'rgba(255,255,255,.7)' },
        grid: { color: 'rgba(255,255,255,.1)' },
        title: { display: true, text: '순위', color: 'rgba(255,255,255,.7)' }
      },
      x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,.7)' } }
    },
    plugins: {
      legend: { labels: { color: 'white', font: { size: 12 }, boxWidth: 12 } },
      tooltip: { callbacks: { label: ctx => \` \${ctx.dataset.label}: #\${ctx.raw}\` } }
    }
  }
});` : ''}
</script>
</body>
</html>`;

const outFile = path.join(dashboardDir, 'index.html');
fs.writeFileSync(outFile, html, 'utf-8');
console.log(`대시보드 생성 완료: ${outFile}`);
