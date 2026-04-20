const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const outputDir = path.resolve(__dirname, config.outputDir);
const historyFile = path.join(outputDir, 'history.json');

function loadHistory() {
  if (!fs.existsSync(historyFile)) {
    console.log('히스토리 파일이 없습니다. tracker.js를 먼저 실행하세요.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
}

function rankReport() {
  const history = loadHistory().sort((a, b) => a.date.localeCompare(b.date));
  const dates = history.map(h => h.date);

  console.log(`\n=== YesStyle 순위 히스토리 리포트 ===`);
  console.log(`기간: ${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)\n`);

  // 전 기간에 걸쳐 등장한 상품들의 순위 추이
  const productHistory = {};
  history.forEach(day => {
    (day.products || []).forEach(p => {
      const key = p.id || p.name;
      if (!key) return;
      if (!productHistory[key]) productHistory[key] = { name: p.name, brand: p.brand, ranks: {} };
      productHistory[key].ranks[day.date] = p.rank;
    });
  });

  // 최근 날짜 기준 정렬
  const latestDate = dates[dates.length - 1];
  const sorted = Object.entries(productHistory)
    .filter(([, v]) => v.ranks[latestDate] !== undefined)
    .sort(([, a], [, b]) => a.ranks[latestDate] - b.ranks[latestDate]);

  // 테이블 출력
  const header = ['순위', '브랜드', '상품명', ...dates].join('\t');
  console.log(header);
  console.log('-'.repeat(80));

  sorted.slice(0, 50).forEach(([, p]) => {
    const rankCols = dates.map(d => p.ranks[d] !== undefined ? `#${p.ranks[d]}` : '-');
    const row = [p.ranks[latestDate], p.brand, p.name.slice(0, 30), ...rankCols].join('\t');
    console.log(row);
  });

  // CSV로도 저장
  const reportFile = path.join(outputDir, `report_${latestDate}.csv`);
  const csvLines = [
    ['key', 'brand', 'name', ...dates].join(','),
    ...sorted.map(([key, p]) => {
      const cols = [
        `"${key}"`,
        `"${p.brand.replace(/"/g, '""')}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        ...dates.map(d => p.ranks[d] || '')
      ];
      return cols.join(',');
    })
  ];
  fs.writeFileSync(reportFile, csvLines.join('\n'), 'utf-8');
  console.log(`\n리포트 저장: ${reportFile}`);
}

rankReport();
