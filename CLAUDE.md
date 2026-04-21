# YesStyle 순위 트래커 — 프로젝트 컨텍스트

## 프로젝트 개요
- JUMISO(jumiso.co.kr) 브랜드 담당자가 YesStyle Beauty 카테고리 순위를 자동 추적하는 도구
- Node.js + Playwright(headless Chromium)로 크롤링, GitHub Actions로 매일 자동 실행
- GitHub Pages(`/docs` 폴더)에 대시보드 배포

## 파일 구조
```
tracker.js       — 크롤러 (Playwright)
dashboard.js     — 히스토리 데이터 → docs/index.html 생성
config.json      — URL, maxPages, outputDir, targetProducts 설정
data/            — history.json + 날짜별 JSON/CSV
docs/            — GitHub Pages 정적 파일 (index.html)
.github/workflows/daily-tracker.yml — 자동화 워크플로우
```

## 자동화 구조
- **GitHub Actions**: UTC 01:00(KST 10:00) 매일 실행 → `node tracker.js` → `node dashboard.js` → `git push`
- **로컬 Windows 작업 스케줄러**: `do-register.bat` 실행하면 등록됨 (09:00 매일)
- 로컬 실행 후 데이터를 GitHub에 반영하려면 수동 `git push` 필요

## 크롤링 핵심 정보
- YesStyle CSS module 클래스: `itemContainer`, `itemPrice`(판매가), `itemSellPrice`(원가), `newReviewCount`
- 통화: 서버 IP 기준 자동 결정 (GitHub Actions = 미국 IP = USD, 로컬 한국 IP = KRW)
- 각 제품 필드: `rank, id, name, brand, price, priceNum, originalPrice, originalPriceNum, currency, badge, reviewCount, link, img`

## 대시보드 동작 방식
- `dashboard.js`가 `data/history.json`을 읽어 `PRODUCT_MAP` JS 객체로 변환 후 HTML에 embed
- 모든 필터링은 클라이언트 사이드 (서버 불필요)
- `docs/index.html` 하나의 파일로 완결

## 대시보드 주요 기능
- 기간 필터 (7일/14일/30일/전체)
- 브랜드 필터 (복수 선택 가능)
- 키워드 검색
- KO/EN 언어 토글 (`localStorage` 저장)
- 순위 트렌드 차트 (Chart.js 4.4.0), TOP N 버튼 (20/30/50/100)
  - 브랜드 선택 시 TOP N 무관하게 해당 브랜드 제품 전체 표시
- JUMISO 브랜드 항상 표시 배너
- 브랜드 인사이트 블록: 브랜드 선택 시 브랜드별 개별 블록으로 표시
  - TOP 10/50/100 내 제품 수, 평균 순위, 최고 순위 제품, 리뷰 증가, 순위 상승/하락 수
- 최신 순위 TOP 50: 브랜드 선택 여부와 무관하게 항상 전체 순위 표시
- 리뷰 증가 TOP 10, 신규 진입

## 주요 수정 이력 (버그/설계 결정)
- `itemSellPrice` 클래스명이 실제로는 "원가"임 (YesStyle 네이밍 역설). `itemPrice`가 실제 판매가
- 리뷰 수 delta: `reviewCount != null` 체크 필요 (null이면 0으로 fallback되어 전체 리뷰 수가 신규처럼 보임)
- 통화 cookie/URL 파라미터 오버라이드 불가 — 서버사이드 TCP IP 기반이므로 `currency` 필드만 저장
- GitHub Pages: root 또는 `/docs` 폴더만 지원 → `dashboardDir = 'docs'`

## 대시보드 수정 후 반영 방법
```bash
node dashboard.js          # docs/index.html 재생성
git add dashboard.js docs/
git commit -m "feat/fix: 내용"
git push
```

## config.json 구조
```json
{
  "url": "https://www.yesstyle.com/en/beauty-beauty/list.html/bcc.15478_bpt.46?sb=136",
  "category": "Beauty",
  "maxPages": 3,
  "targetProducts": [],
  "outputDir": "data"
}
```
`targetProducts`가 빈 배열이면 전체 상품 저장. 특정 브랜드/제품만 추적하려면 이름 일부나 ID 추가.
