const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const TODAY = new Date().toISOString().slice(0, 10);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadHistory(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

async function crawlPage(page, pageNum) {
  const url = `${config.url}&pn=${pageNum}`;
  console.log(`  페이지 ${pageNum} 크롤링: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  return await page.evaluate((startRank) => {
    const items = [];

    // YesStyle CSS module 클래스 (부분 매칭)
    const found = Array.from(document.querySelectorAll('[class*="itemContainer"]'));

    found.forEach((el, idx) => {
      const rank = startRank + idx;

      // itemContainer 자체가 <a> 태그
      const link = el.tagName === 'A' ? el.href : (el.querySelector('a')?.href || '');
      const idMatch = link.match(/pid\.(\d+)/);
      const id = idMatch ? idMatch[1] : '';

      // 상품명+브랜드 (itemTitle에 "브랜드 - 상품명" 형식)
      const titleEl = el.querySelector('[class*="itemTitle"]');
      const titleText = titleEl ? titleEl.textContent.trim() : '';
      const dashIdx = titleText.indexOf(' - ');
      const brand = dashIdx >= 0 ? titleText.slice(0, dashIdx).trim() : '';
      const name = dashIdx >= 0 ? titleText.slice(dashIdx + 3).trim() : titleText;

      // 가격: itemSellPrice가 실제 표시 가격, itemPrice는 원가
      const sellPriceEl = el.querySelector('[class*="itemSellPrice"]');
      const priceEl = el.querySelector('[class*="itemPrice"]');
      const price = (sellPriceEl || priceEl)?.textContent.replace(/\s+/g, ' ').trim() || '';

      // 카테고리 베스트셀러 랭크 배지 (있을 경우)
      const badgeEl = el.querySelector('[class*="categoryBestsellerRankBadge"], [class*="RankBadge"]');
      const badge = badgeEl ? badgeEl.textContent.trim() : '';

      // 이미지
      const imgEl = el.querySelector('img');
      const img = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

      if (name || id) {
        items.push({ rank, id, name, brand, price, badge, link, img });
      }
    });

    return items;
  }, (pageNum - 1) * 60);
}

async function run() {
  console.log(`\n=== YesStyle 순위 트래커 시작 (${TODAY}) ===\n`);

  const outputDir = path.resolve(__dirname, config.outputDir);
  ensureDir(outputDir);

  const historyFile = path.join(outputDir, 'history.json');
  const history = loadHistory(historyFile);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  let allProducts = [];

  try {
    for (let p = 1; p <= config.maxPages; p++) {
      const items = await crawlPage(page, p);
      if (items.length === 0) {
        console.log(`  페이지 ${p}: 상품 없음, 중단`);
        break;
      }
      allProducts = allProducts.concat(items);
      console.log(`  페이지 ${p}: ${items.length}개 상품 수집`);
      if (p < config.maxPages) await page.waitForTimeout(1500);
    }
  } catch (err) {
    console.error('크롤링 오류:', err.message);
  } finally {
    await browser.close();
  }

  if (allProducts.length === 0) {
    console.error('\n상품을 찾지 못했습니다. 사이트 구조가 변경되었을 수 있습니다.');
    console.log('디버그 모드로 재실행하려면: node tracker.js --debug');
    process.exit(1);
  }

  // 특정 상품 필터링 (config.targetProducts가 있을 때)
  let tracked = allProducts;
  if (config.targetProducts && config.targetProducts.length > 0) {
    const targets = config.targetProducts.map(t => t.toLowerCase());
    tracked = allProducts.filter(p =>
      targets.some(t =>
        p.name.toLowerCase().includes(t) ||
        p.brand.toLowerCase().includes(t) ||
        p.id.includes(t)
      )
    );
    console.log(`\n타겟 상품 필터링: ${allProducts.length}개 중 ${tracked.length}개 매칭`);
  }

  // 오늘 데이터 저장
  const todayData = {
    date: TODAY,
    url: config.url,
    totalCrawled: allProducts.length,
    products: tracked
  };

  // 날짜별 JSON 저장
  const dailyFile = path.join(outputDir, `${TODAY}.json`);
  fs.writeFileSync(dailyFile, JSON.stringify(todayData, null, 2), 'utf-8');
  console.log(`\n오늘 데이터 저장: ${dailyFile}`);

  // CSV 저장
  const csvFile = path.join(outputDir, `${TODAY}.csv`);
  const csvHeader = 'date,rank,id,brand,name,price,badge,link\n';
  const csvRows = tracked.map(p =>
    `"${TODAY}","${p.rank}","${p.id}","${(p.brand||'').replace(/"/g, '""')}","${(p.name||'').replace(/"/g, '""')}","${p.price||''}","${p.badge||''}","${p.link||''}"`
  ).join('\n');
  fs.writeFileSync(csvFile, csvHeader + csvRows, 'utf-8');
  console.log(`CSV 저장: ${csvFile}`);

  // 히스토리 누적 저장
  const existing = history.findIndex(h => h.date === TODAY);
  if (existing >= 0) history[existing] = todayData;
  else history.push(todayData);
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');

  // 순위 변동 출력
  printRankChanges(history, tracked);

  console.log(`\n총 ${tracked.length}개 상품 순위 기록 완료\n`);
}

function printRankChanges(history, today) {
  if (history.length < 2) {
    console.log('\n(첫 번째 실행이므로 순위 변동 비교 없음)');
    return;
  }

  // 어제 데이터 찾기
  const sorted = history.slice().sort((a, b) => a.date.localeCompare(b.date));
  const prev = sorted[sorted.length - 2];

  console.log(`\n--- 순위 변동 (${prev.date} → ${TODAY}) ---`);

  const prevMap = {};
  (prev.products || []).forEach(p => {
    const key = p.id || p.name;
    if (key) prevMap[key] = p.rank;
  });

  let changeCount = 0;
  today.slice(0, 20).forEach(p => {
    const key = p.id || p.name;
    const prevRank = prevMap[key];
    if (prevRank === undefined) {
      console.log(`  #${p.rank} ${p.brand} ${p.name} [신규 진입]`);
      changeCount++;
    } else if (prevRank !== p.rank) {
      const diff = prevRank - p.rank;
      const arrow = diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`;
      console.log(`  #${p.rank} ${p.brand} ${p.name} ${arrow} (이전 #${prevRank})`);
      changeCount++;
    }
  });

  if (changeCount === 0) console.log('  상위 20위 내 순위 변동 없음');
}

// 디버그 모드: 실제 DOM 구조 확인
async function debugMode() {
  console.log('\n=== 디버그 모드 ===');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
  await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const classes = new Set();
    document.querySelectorAll('[class]').forEach(el => {
      el.className.split(' ').forEach(c => { if (c.includes('product') || c.includes('item') || c.includes('list')) classes.add(c); });
    });
    return { url: location.href, productClasses: Array.from(classes).slice(0, 30) };
  });

  console.log('현재 URL:', info.url);
  console.log('상품 관련 클래스:', info.productClasses.join(', '));
  console.log('\n브라우저를 닫으면 종료됩니다...');
  await page.waitForTimeout(30000);
  await browser.close();
}

if (process.argv.includes('--debug')) {
  debugMode().catch(console.error);
} else {
  run().catch(console.error);
}
