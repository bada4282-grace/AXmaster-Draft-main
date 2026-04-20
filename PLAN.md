# PLAN.md — 무역통계 대시보드 개발 계획

> 기준 문서: PRD-v4.0
> 작성일: 2026-04-13
> 최종 수정: 2026-04-19 (v4.0 반영 — 부분 집계 커버리지, LLM 리졸버, 챗봇 지속성, 툴팁/배지 시스템, 보고서 파이프라인, 지도 컬러 블루/코럴 이원화)
> 구현 방식: 페이즈별 순차 진행 + 페이즈 내 트랙 병렬 구현

---

## 읽기 전에

- **페이즈(Phase):** 순서대로 진행. 이전 페이즈 완료 후 다음 시작.
- **트랙(Track):** 같은 페이즈 안에서 동시에 진행 가능한 작업 묶음.
- **완료 처리:** `[x]` = 구현 완료, `[ ]` = 미구현/향후 과제
- **블로커:** ⚠️ 표시된 항목은 외부 결정 또는 팀 확인이 필요한 선행 조건.

---

## 전체 흐름

```
Phase 0: 프로젝트 초기화                    ✅ 완료
    ↓
Phase 1: 데이터 레이어                      ✅ 완료 (v4.0: Supabase 집계 테이블로 재편)
    ↓
Phase 2: 공통 컴포넌트                      ✅ 완료 (v4.0: 툴팁 6종 · TierDropdown · 커버리지 배지)
    ↓
Phase 3: 상태 관리 (URL 파라미터 기반)       ✅ 완료 (v4.0: 홈 필터도 URL 동기화)
    ↓
Phase 4: P1 랜딩 — 국가별 탭 (지도)         ✅ 완료 (v4.0: 블루/코럴 2색 체계, TOP5 라벨)
  + Phase 5: P1 랜딩 — 품목별 탭 (트리맵)   ✅ 완료 (병렬) (v4.0: CategoryChipButton, Cell 툴팁)
    ↓
Phase 6: P2-A 국가별 상세페이지             ✅ 완료 (v4.0: 좌측 카드 강화, 시계열 TimeseriesTooltip)
    ↓
Phase 7: P2-B 품목별 상세페이지             ✅ 완료 (v4.0: ProductTrendTooltip, TopCountriesTooltip)
    ↓
Phase 8: LLM 챗봇 연동                     ✅ 완료 (v4.0: 시스템 프롬프트 5대 규칙, LLM 품목 리졸버)
    ↓
Phase 9: 거시경제 데이터 연동               ✅ 완료
    ↓
Phase 10: 인증 시스템                       ✅ 완료
    ↓
Phase 11: 반응형 UI                         ✅ 완료 (v4.0: 전역 폰트 Noto Sans KR 통일)
    ↓
Phase 12: 통합 테스트 및 배포               🔲 미착수
    ↓
(v4.0 신규) Phase 13: 부분 집계 커버리지 시스템    ✅ 완료
    ↓
(v4.0 신규) Phase 14: 챗봇 지속성 & 개인화         ✅ 완료
    ↓
(v4.0 신규) Phase 15: 보고서·이메일·PDF 파이프라인   ✅ 완료
```

---

## Phase 0 — 프로젝트 초기화 ✅

> 목표: 개발 환경 완전 세팅.

- [x] Next.js 16 프로젝트 생성 (TypeScript + Tailwind CSS 4)
- [x] Supabase 프로젝트 생성 및 `.env.local` 연결
- [x] Recharts, react-map-gl, MapLibre GL 패키지 설치
- [x] Natural Earth TopoJSON 데이터 준비
- [x] 폴더 구조 확정

```
/app
  /api
    /chat          ← LLM 챗봇 API (스트리밍)
    /macro         ← 거시경제 데이터 API
    /welcome       ← 환영 메시지 API
    /faq           ← [v4.0] 질문 추천 API
    /route-buttons ← [v4.0] LLM 기반 라우트 버튼 파이프라인
    /report        ← [v4.0] 보고서 HTML 생성 API
    /send-email    ← [v4.0] Resend 기반 이메일 발송 API
  /country/[name]  ← P2-A 국가별 상세
  /product/[name]  ← P2-B 품목별 상세
  /login           ← 로그인
  /signup          ← 회원가입
  not-found.tsx    ← 404 페이지
  page.tsx         ← 메인 대시보드
  layout.tsx       ← 공통 레이아웃 (Noto Sans KR · PersistentChatBot · Suspense)
/components
  Header.tsx       ← 헤더 + GNB
  HeroBanner.tsx   ← 배너
  FilterBar.tsx    ← 필터 바 ([v4.0] TierDropdown)
  KPIBar.tsx       ← KPI 카드 바 ([v4.0] 3모드 자동 전환 + 부분 집계 배지)
  WorldMap.tsx     ← 코로플레스 지도 ([v4.0] 블루/코럴 2색 · TOP5 라벨)
  TreemapChart.tsx ← 트리맵 ([v4.0] Cell 툴팁 · CategoryChipButton)
  MacroSection.tsx ← 거시경제 섹션
  ChatBot.tsx      ← 챗봇 UI ([v4.0] sessionStorage 지속성)
  PersistentChatBot.tsx ← 챗봇 사이드바 래퍼 ([v4.0] Suspense + memo)
  RechartsTooltip.tsx   ← [v4.0] 커스텀 툴팁 6종
/lib
  data.ts          ← 경량 re-export 레이어 ([v4.0] KPI + MTI 룩업만)
  staticData.ts    ← [v4.0 추가] 정적 경량 데이터 원본
  dataSupabase.ts  ← [v4.0 추가] agg_* 테이블 조회 (5분 메모리 캐시)
  supabase.ts      ← Supabase 클라이언트 + RPC 호출 ([v4.0] getLatestYYMM · getIncompleteMonthRange)
  supabaseServer.ts ← 서버사이드 유틸리티
  chat.ts          ← 챗봇 로그 CRUD
  chatContext.ts   ← 챗봇 컨텍스트 빌더 + 라우트 버튼 ([v4.0] view narrowing + 유효 비교 주입)
  countryIso.ts    ← [v4.0 추가] 244개 한국어 국가명 ↔ ISO alpha-2 공용 매핑
  productResolver.ts ← [v4.0 추가] LLM 기반 MTI 품목 의미 매퍼 (prompt caching)
  useIncompleteMonthRange.ts ← [v4.0 추가] 부분 집계 연도 React 훅
  auth.ts          ← 인증 함수
/scripts
  create-agg-tables.sql ← [v4.0] Supabase agg_* 집계 테이블 생성 DDL
  seed-supabase.js      ← [v4.0] 정적 → Supabase 시드 스크립트
```

> **v3.0 대비:** `tradeData.generated.ts`(~394K LOC) 제거, Supabase `agg_*` 테이블로 이전.

---

## Phase 1 — 데이터 레이어 ✅

> 목표: 이중 데이터 레이어 (정적 + 동적) 완성.

### Track A — 정적 경량 데이터

- [x] ~~`tradeData.generated.ts` 생성 (~394K LOC)~~ → **v4.0: 제거**, Supabase `agg_*` 테이블로 이전
- [x] `lib/staticData.ts` — **v4.0 추가**, 클라이언트 번들 포함 경량 데이터(~50KB)
- [x] 연도별 KPI 집계 (`KPI_BY_YEAR`)
- [x] MTI 룩업 (`MTI_LOOKUP` ~890개 3·4단위 포함)
- [x] MTI 대분류 색상/명칭 (`MTI_COLORS`, `MTI_NAMES`)
- [x] `lib/data.ts` — re-export 레이어 (v4.0 재작성)

### Track B — Supabase DB 세팅

- [x] `trade_mti6` 테이블 생성 (YYMM 기준 월별 데이터)
- [x] `chat_logs` 테이블 생성 (user_id, role, content, created_at)
- [x] **v4.0: `macro_indicators` 테이블** — 월별 거시경제 지표 12종
- [x] **v4.0: `agg_*` 집계 테이블 6종** (`scripts/create-agg-tables.sql`):
  - `agg_treemap` (year, code, name, mti, exp_amt, imp_amt)
  - `agg_product_trend` / `agg_product_top_countries`
  - `agg_country_ranking` / `agg_country_kpi`
  - `agg_country_treemap` / `agg_country_timeseries`
- [x] **v4.0: 시드 스크립트** `scripts/seed-supabase.js` (정적 → Supabase 배치 삽입)
- [x] RPC 함수 `get_treemap_mti6` 생성
- [x] RPC 함수 `get_country_map_mti6` 생성
- [x] RPC 함수 `get_country_treemap_mti6` 생성

### Track C — 데이터 조회 함수 (lib/dataSupabase.ts — v4.0 추가)

> **v3.0 대비 변경:** 기존 `lib/data.ts` 동기 함수(`getCountryData` 등)는 **Supabase `agg_*` 조회 async 함수로 전면 교체**. 5분 메모리 캐시 적용.

- [x] `getCountryRankingAsync(year, tradeType)` — `agg_country_ranking` 조회
- [x] `getCountryKpiAsync(year, countryName)` — `agg_country_kpi` 조회
- [x] `getCountryTimeseriesAsync(year, countryName)` — `agg_country_timeseries` 조회
- [x] `getCountryTreemapDataAsync(year, countryName, tradeType)` — `agg_country_treemap` 조회
- [x] `getTreemapDataAsync(year, tradeType)` — `agg_treemap` 조회
- [x] `getProductTrendAsync(code, tradeType)` — `agg_product_trend` 조회
- [x] `getProductTopCountriesAsync(code, year, tradeType)` — `agg_product_top_countries` 조회
- [x] `getAggregatedProductTrend(codePrefix, tradeType)` — 프리픽스 합산
- [x] `getAggregatedTopCountries(codePrefix, year, tradeType)` — 프리픽스 합산
- [x] `aggregateTreemapByDepth(data, depth)` — 클라이언트 측 N단위 집계 (유지)
- [x] **CSV 파싱 버그 교정:** `toProductNode` / `mapToProductNode` 가 `MTI_LOOKUP`으로 불완전한 이름 보정
- [x] `lib/data.ts` re-export — `getMapColor`, MTI 색상/이름, 유틸리티 함수

### Track D — Supabase 조회 함수 (lib/supabase.ts)

- [x] `getMonthlyTreemapData(year, month, tradeType)` — 월별 트리맵 RPC
- [x] `getMonthlyCountryMapData(year, month, tradeType)` — 월별 지도 RPC (인-메모리 캐싱 + in-flight 중복 방지)
- [x] `getCountryMonthlyTreemapData(year, month, countryName, tradeType)` — 국가별 월별 트리맵 RPC
- [x] `getAvailableMonths(year)` — 연도별 데이터 존재 월 조회
- [x] **v4.0: `getLatestYYMM()`** — 10분 TTL 캐시, 커버리지 판정의 단일 원천
- [x] **v4.0: `getIncompleteMonthRange(year)`** — `"1~N월"` 또는 `null`

### Track E — 국가명 매핑

- [x] ISO 코드 ↔ 한국어 국가명 매핑 (WorldMap.tsx 내 180개국+)
- [x] GeoJSON 영문명 ↔ CTR_NAME 한국어 매핑
- [x] **v4.0: `lib/countryIso.ts` 공용 모듈 분리** — 244개 한국어 국가명 → ISO alpha-2 + `countryNameToFlag` / `isoToFlagEmoji` 헬퍼
- [x] **v4.0: ISO 숫자코드 → alpha-2 매핑 확장** — `ISO_NUM_TO_ALPHA2` (WorldMap에서 world-atlas 파싱용)

---

## Phase 2 — 공통 컴포넌트 ✅

> 목표: 모든 페이지에서 공유하는 UI 컴포넌트 완성.

### Track A — 헤더 + 배너

- [x] Header 컴포넌트 (K-stat 로고, KITA.NET 링크, 로그인/로그아웃)
- [x] HeroBanner 컴포넌트

### Track B — 필터 바 (FilterBar)

- [x] 연도 셀렉터 (2020~2026, 기본값: 2026)
- [x] 월 셀렉터 (전체/1~12월)
- [x] 수출/수입 토글
- [x] MTI 단위 셀렉터 (1~6단위)
- [x] 국가 선택 드롭다운
- [x] 품목 페이지 월 비활성화 옵션 (`disableMonthPeriod`)
- [x] 모드별 표시/숨김 (`mode="country"` / `mode="product"`)
- [x] **v4.0: 커스텀 TierDropdown** — 네이티브 `<select>` 대체, 체크 아이콘 + 포털 없는 팝오버
- [x] **v4.0: 2026년 3~12월 선택 시 토스트 차단** (1.8s fade, 2.4s hide)
- [x] **v4.0: "전체" → "전체 보기"** 라벨 변경
- [x] **v4.0: URL 동기화** — `router.replace(scroll:false)` 로 연도/월/방향 즉시 반영
- [ ] ~~금액조회 셀렉터 (해당월/누적/연간)~~ — 미구현
- [ ] ~~대륙별 드롭다운~~ — 미구현

### Track C — KPI 카드 바 (KPIBar)

- [x] 3개 카드: 수출 / 수입 / 무역수지
- [x] 전년 대비 증감률 (정적 데이터 기반)
- [x] 전년 동기 대비 (월 선택 시, Supabase 조회)
- [x] 전월 대비 (불완전 연도 자동 탐지)
- [x] 불완전 연도 최신 월 자동 감지 (`getAvailableMonths`)
- [x] 증감률 숨김 조건 (데이터 없음, 변화율 0%)
- [x] 색상: 상승 빨간색(#E02020) ▲ / 하락 파란색(#185FA5) ▼
- [x] **v4.0: `useIncompleteMonthRange` 훅 사용** — `getLatestYYMM` 기반 단일 원천
- [x] **v4.0: 3모드 자동 전환 로직 명시** — 월 선택=전년 동기 대비 / 부분 연도=전월 대비 / 완전 연도=전년 대비
- [x] **v4.0: 증감률 포맷** — 2자리 기본, `.00`→`.0` 축약 (`3.76` / `0.02` / `3.8`)
- [x] **v4.0: 부분 집계 "ⓘ 부분 데이터(1~N월)" 배지**

### Track D — 챗봇 사이드바

- [x] PersistentChatBot — Sticky 사이드바 (접기/펼치기)
- [x] ChatBot — 메시지 UI, 스트리밍, 마크다운 렌더링
- [x] 접기/펼치기 시 window resize 이벤트 (Recharts 반응형)
- [x] /login, /signup 페이지에서 숨김
- [x] FAQ 제안 버튼
- [x] 글꼴 크기 조절
- [x] **v4.0: `<Suspense fallback={null}>` 래핑** — `useSearchParams` 정적 프리렌더 빌드 에러 해결
- [x] **v4.0: `memo(ChatBot)` StableChatBot** — 페이지 이동 시 re-render 방지
- [x] **v4.0: `transitionend` + 350ms 보정 타이머** — 트랜지션 완료 후 Recharts 리사이즈
- [ ] ~~Split Panel 75:25 레이아웃~~ → Sticky 사이드바로 대체

### Track E — 커스텀 툴팁 (RechartsTooltip — v4.0 대폭 확장)

- [x] RechartsPayloadTooltip — 공통 셸 (흰 배경 + 하단 꼬리)
- [x] **v4.0: `TimeseriesTooltip`** — 시계열 라인차트, 전월 대비 증감(▲/▼/–), `prevYearLastMonth` prop으로 1월 MoM 버그 해결
- [x] **v4.0: `ProductTrendTooltip`** — 품목 연도 추이, 3케이스 처리 (확정/신규 진입/진행 중)
- [x] **v4.0: `TopCountriesTooltip`** — 상위 국가 바차트, 점유율·순위·전년 대비 YoY
- [x] **v4.0: Treemap Cell 툴팁** — 품목명·카테고리·MTI·금액·점유율·전년(동기) 대비 (포털 렌더링)
- [x] **v4.0: Treemap Category 툴팁** — 대분류 합계·하위 품목 수·점유율·YoY
- [x] **v4.0: `rechartsTooltipFollowProps`** — 커서 오른쪽 8px 오프셋 + 자동 flip
- [x] 불완전 연도 경고 표시 (`incompleteLabels` + `incompleteMonthRanges`)
- [x] **v4.0: 월별/연간 라벨 자동 전환** — "전년 동기 대비" vs "전년 대비"

---

## Phase 3 — 상태 관리 ✅

> 목표: URL 파라미터 + React useState로 필터 상태 관리.

- [x] URL searchParams 기반 상태 관리 (`useSearchParams` + `useRouter`)
- [x] 연도/월/수출수입 모드 URL 파라미터 동기화
- [x] 탭 상태 URL 파라미터 (`?tab=country` / `?tab=product`)
- [x] MTI 단위 URL 파라미터 (`?mtiDepth=N`)
- [x] 국가 상세: `?year=`, `?mode=`, `?tab=`, `?mtiDepth=`
- [x] 품목 상세: `?code=`, `?year=`, `?tab=`
- [x] **v4.0: 홈(`/`) 전체 필터 URL 동기화** — `?tab=`, `?year=`, `?mode=`, `?month=`, `?country=`, `?mtiDepth=` 모두 chatBot `pageContext` 추출용
- [x] **v4.0: URL → state 동기화** — `urlMode`/`urlYear` 변경 시 `useEffect`로 state 재설정 (같은 페이지에서 모드/연도만 바뀔 때)
- [ ] ~~Zustand 전역 스토어~~ — URL params + useState로 대체

---

## Phase 4 — P1 랜딩 (국가별 탭 — 지도) ✅

> 목표: 코로플레스 지도 완성.

### Track A — 지도 렌더링

- [x] MapLibre GL + react-map-gl 초기화 (~~Leaflet.js~~ 미사용)
- [x] ~~Natural Earth TopoJSON~~ → **v4.0: `world-atlas@2 countries-110m.json`** (CDN)
- [x] ISO 코드 기반 180개국+ 매핑
- [x] TOP30 산출 → 6단계 색상 매핑

**v3.0 색상 (단일 틸) — v4.0에서 교체됨:**

```typescript
// v3.0 (deprecated)
rank 1~3:   "#054744"  // 가장 진한 틸
rank 4~9:   "#0A6E5C"
rank 10~15: "#1A9E7F"
rank 16~21: "#5DC4A0"
rank 22~30: "#A5DFC4"
rank 30+:   "#DCF3EF"  // 가장 밝은 틸
```

**v4.0 색상 (수출 블루 / 수입 코럴 2색 분화):**

```typescript
// v4.0 — lib/data.ts + WorldMap.tsx::getMapColor(rank, mode)
// 수출 (Blue)
rank 1~3:   "#002B5C"  // 딥 네이비
rank 4~9:   "#0A3D6B"
rank 10~15: "#1A6FA0"
rank 16~21: "#6A9EC0"
rank 22~30: "#B0D0E8"
rank 30+:   "#DCE8F0"

// 수입 (Coral)
rank 1~3:   "#B02020"  // 딥 로즈
rank 4~9:   "#D04545"
rank 10~15: "#E07060"
rank 16~21: "#ECA090"
rank 22~30: "#F4C8BC"
rank 30+:   "#FAE8E4"
```

### Track B — 지도 인터랙션

- [x] 호버 툴팁 — 국가명 + 수출(수입)액 + 순위
- [x] TOP30 국가 클릭 → `/country/[name]` 이동
- [x] 월 선택 시 Supabase RPC로 해당 월 데이터 조회
- [x] 인-메모리 캐싱 + in-flight 중복 요청 방지
- [x] **v4.0: 툴팁 강화** — 국가명·금액·순위(X/Y위)·점유율·**전년(동기) 대비**·TOP1 품목
- [x] **v4.0: 툴팁 라벨 자동 전환** — 연도 조회="전년 대비" / 월 조회="전년 동기 대비 · N월"
- [x] **v4.0: 부분 집계 연도 배지** — 툴팁에 "ⓘ 부분 데이터(1~N월)"

### Track C — TOP5 마커 라벨 (v4.0 신규)

- [x] React Marker로 TOP5 국가명 + 금액 라벨 렌더
- [x] 흰 글씨 + 검정 halo (`textShadow: 0 0 4px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,1)`)
- [x] Noto Sans KR 12px 700
- [x] `pointerEvents: none` 으로 호버 방해 없음

### Track D — 커스텀 TierDropdown (v4.0 신규)

- [x] 네이티브 `<select>` 대체 컴포넌트
- [x] 체크 아이콘으로 현재 선택 표시
- [x] 포털 없는 팝오버 (지도/카드 컨테이너 바운더리 내부 렌더)
- [x] WorldMap 상단 · 국가 상세 좌측 · FilterBar 등 다중 재사용

---

## Phase 5 — P1 랜딩 (품목별 탭 — 트리맵) ✅

> 목표: MTI 6단위 트리맵 + MTI 단위 전환.

### Track A — 트리맵 렌더링

- [x] Recharts Treemap 구현 (~~D3.js~~ 미사용)
- [x] MTI 6단위 기본 표시 (198개+)
- [x] MTI 1~6단위 깊이 전환 (`aggregateTreemapByDepth`)
- [x] 대분류별 10색 체계 적용
- [x] 금액 "억" 단위 표시
- [x] 10포인트 애니메이션
- [x] 월 선택 시 Supabase RPC로 해당 월 데이터 조회

### Track B — 인터랙션

- [x] 품목 클릭 → `/product/[name]` 상세페이지 이동
- [x] 커스텀 툴팁 (품목명 + 금액)
- [x] **v4.0: Cell 툴팁 확장** — 품목명·(연도+월?)·카테고리·MTI·금액·점유율·전년(동기) 대비 (포털 렌더링)
- [x] **v4.0: Category 툴팁** — 대분류 aggregates (합계·하위 품목 수·점유율·YoY)
- [ ] ~~줌인/줌아웃 토글~~ — 미구현 (클릭 시 상세페이지 직접 이동으로 대체)
- [ ] ~~하단 대분류 아이콘 필터 10개~~ → **v4.0: 상단 CategoryChipButton 10개** (MTI 아이콘 + 명칭 + Category 툴팁)
- [ ] ~~TOP3 품목만 "상세 페이지 보기"~~ — 모든 품목 클릭 가능으로 변경

### Track C — v4.0 신규 강화

- [x] **MTI SVG 아이콘 10종** (곡식, 다이아몬드, 플라스크, 육각형, 실타래, 집, 너트, 기어, 번개, 그리드)
- [x] **월별 조회 시 서브타이틀** — `{year}년 {month}월` 노출
- [x] **CategoryChipButton** — 10개 대분류 칩, 클릭 시 강조, monthRange/yoyLabel props
- [x] **formatAmount 단위 적응** — 억/만/달러 자동 전환 (`986.3` → `$986.3억`, `0.00634` → `$63.4만`)

---

## Phase 6 — P2-A 국가별 상세페이지 ✅

> 목표: 국가별 트리맵(품목 탭) + 시계열 추이 탭 완성.

### Track A — 페이지 구조

- [x] URL 파라미터 파싱: `/country/[name]?year=YYYY&mode=import&tab=timeseries&mtiDepth=3`
- [x] 좌측 카드: 지역(대륙), 국가명, 순위, 비중 (수출/수입 모드 연동)
- [x] KPI 카드: 대[국가] 수출액 / 수입액 / 무역수지 (getCountryKpi)
- [x] "← 돌아가기" → 메인 대시보드
- [x] FilterBar (mode="country"): 연도, 월, 수출/수입, MTI 단위
- [x] **v4.0: 좌측 카드 강화** — 국기 이모지(`countryNameToFlag`), 순위 X/Y위 분모, YoY 순위 변동(▲/▼), 부분 집계 배지

### Track B — 서브탭 1: 품목별 트리맵

- [x] 해당 국가 품목 구성 Recharts Treemap
- [x] MTI 단위 선택 가능 (FilterBar 연동, **v4.0: 커스텀 TierDropdown**)
- [x] 월 선택 시 Supabase RPC 조회 (`get_country_treemap_mti6`)
- [x] 연간 데이터 조회 (`getCountryTreemapDataAsync` → `agg_country_treemap`)
- [x] 호버 툴팁 (품목명 + 금액) — **v4.0: Cell/Category 툴팁 적용**
- [x] 클릭 시 이동 없음

### Track C — 서브탭 2: 시계열 추이

- [x] Recharts LineChart — 월별 수출/수입/무역수지
- [x] ~~정적 데이터 기반~~ → **v4.0: `getCountryTimeseriesAsync` (`agg_country_timeseries` 테이블)**
- [x] 연도 선택 가능
- [x] **v4.0: `TimeseriesTooltip`** — 전월 대비 증감(▲/▼/–), `prevYearLastMonth` prop으로 1월 MoM 계산 버그 해결

---

## Phase 7 — P2-B 품목별 상세페이지 ✅

> 목표: 품목별 금액 추이 + 상위 국가 탭 완성.

### Track A — 페이지 구조

- [x] URL 파라미터: `/product/[name]?code=XXX&year=YYYY&tab=countries`
- [x] 좌측 카드: 품목명, 연간 수출(수입)액, 전년 대비 증감률
- [x] KPI 카드: 전체 수출/수입/무역수지
- [x] "← 돌아가기" → 메인 대시보드
- [x] FilterBar (mode="product"): 연도, 수출/수입, 국가 (월 비활성화)
- [x] **v4.0: 부분 집계 연도 배지** — 좌측 카드에 "ⓘ 부분 데이터(1~N월)" 표시, 전년 대비 증감률 숨김

### Track B — 서브탭 1: 금액 추이

- [x] Recharts LineChart/BarChart — 연도별 금액 추이
- [x] 코드 프리픽스 기준 합산 (`getAggregatedProductTrend`)
- [x] 불완전 연도 자동 감지 (Supabase `getAvailableMonths`)
- [x] ~~"⚠ 불완전 연도(1~2월)"~~ → **v4.0: "ⓘ 부분 데이터(1~N월)" 배지** (노랑 배경 `#FEF3C7` + 갈색 텍스트 `#92400E`)
- [x] 12개월 데이터 완전 시 경고 자동 제거
- [x] **v4.0: `ProductTrendTooltip`** — 3 케이스 (확정 연도 / 신규 진입 / 진행 중) + `incompleteMonthRanges` prop

### Track C — 서브탭 2: 상위 국가

- [x] Recharts BarChart — 상위 10개국 바 차트
- [x] 코드 프리픽스 합산 (`getAggregatedTopCountries`)
- [x] 커스텀 툴팁 — **v4.0: `TopCountriesTooltip`** (점유율·순위·전년 대비 YoY 포함)
- [x] **v4.0: `currentData`/`prevData` props** 로 순위·YoY 계산용 이전 연도 데이터 전달

### 변경점 (초안 대비)

- ~~3개 탭 (상세품목별 / 추이 / 상위국)~~ → **2개 탭 (금액 추이 / 상위 국가)**
- ~~드릴다운 2단계 (대분류→중분류)~~ → 코드 프리픽스 기반 합산 방식
- ~~전월 수출입액·증감률 고정값 (trade_fixed_kpi)~~ → 연간 기준 + 불완전 연도 자동 감지
- ~~브레드크럼 (전체 › 대분류명)~~ → 미구현

---

## Phase 8 — LLM 챗봇 연동 ✅

> 목표: Claude Haiku 4.5 기반 스트리밍 챗봇 + 컨텍스트 인젝션.

### Track A — API 라우트

- [x] `/api/chat` 엔드포인트 (POST)
- [x] Anthropic SDK v0.88.0 클라이언트
- [x] 스트리밍 응답 (ReadableStream + TextEncoder)
- [x] 메시지 검증 (빈 메시지 제거, 연속 동일 role 제거)
- [x] 이전 대화 맥락 처리
- [x] **v4.0: 이전 대화 격리** — 기본적으로 모델에 history 미전달(첫 질문에 집중). 웰컴 인사말만 있는 첫 턴 예외 처리

### Track B — 시스템 프롬프트 + 동적 컨텍스트

- [x] 고정 시스템 프롬프트 (도메인 지식 + 가드레일)
- [x] `buildChatContext(message, pageContext?)` — 메시지 분석 → 관련 데이터 자동 주입
  - 국가명 매칭 → KPI·순위 데이터
  - 품목명 매칭 → 추이·상위국 데이터
  - MTI 코드 검증 → 코드 기반 조회
  - 연도 추출 → 해당 연도 데이터
- [x] `==주제==` 하이라이트 포맷
- [x] **v4.0: 시스템 프롬프트 5대 규칙 블록** — 시점 표현, 데이터 커버리지, 추세·단정 어휘, 헤드라인·토픽, 화면 범위 엄수
- [x] **v4.0: 오늘 날짜 동적 주입** — `${todayStr}` 포맷으로 "최근" 기준 고정
- [x] **v4.0: 현재 질문 집중 규칙** — "이전 질문" 관련 참조는 1문단 2문장으로만 응답
- [x] **v4.0: 첫 턴 수락 응답 예외** — `[바로 직전 인사말]` 블록이 있고 "네/좋아/그래" 답변이면 인사말 주제 이어받음
- [x] **v4.0: `questionReferencesScreen(question)`** — "화면/여기/지금/현재 대시보드/트리맵/차트/지도" 등 화면 참조 키워드 감지, true일 때만 `pageContext` 주입
- [x] **v4.0: View narrowing** — `pageContext.view` 에 따라 timeseries/products/countries/trend 각 뷰에 맞는 데이터만 주입
- [x] **v4.0: LLM 품목 리졸버 폴백** (`lib/productResolver.ts`)
  - 규칙 매칭 실패 + `hasProductIntent=true` 일 때만 호출
  - MTI 3·4단위 카탈로그(~890개)를 prompt caching (ephemeral)
  - temperature: 0, max_tokens: 80, JSON 배열만 반환
  - 결과 캐시 (최대 200개 LRU)
  - 의미 매핑 예: "제약→의약품", "자동차→승용차", "스마트폰→무선전화기"
  - 환각 방지: 반환 코드는 `MTI_LOOKUP`으로 재검증
- [x] **v4.0: 부분 집계 연도 유효 비교 자동 주입** (`getProductSamePeriodYoY`)
  - 전년 같은 기간(1~N월) 누적을 사전 계산
  - `※ 유효 비교(전년 동기 누적): ...` 라인 + `※ 위 유효 비교 수치만 인용…` 지시 삽입
- [x] **v4.0: 커버리지 주석 자동 주입** (`getYearCoverageNote`) — 현재 화면 상태, 전체 KPI, 국가 블록, 연도별 추이 4곳

### Track C — 네비게이션 버튼 (이중 파이프라인)

**규칙 기반 (`resolveRouteButtons` in `lib/chatContext.ts`):**

- [x] 국가명 → `/country/[name]` 버튼 (국가명 주변 10자에서 수출/수입 맥락 감지)
- [x] 품목명 → `/product/[name]` 버튼 (MTI_LOOKUP 정확 매칭 + 유사 후보 탐색)
- [x] 키워드 감지: 추이→timeseries탭, 상위국가→countries탭
- [x] MTI 단위 감지 → `?mtiDepth=N`
- [x] 연도 감지 → `?year=YYYY`
- [x] **v4.0: 무역 일반 용어 제외 토큰** — "무역/수지/수출/수입/증감/현황/추이/데이터" 등은 품목 후보에서 제외

**v4.0 LLM 파이프라인 (`POST /api/route-buttons`):**

- [x] 4단계 우선순위 프롬프트 (답변 "~~도 보시겠습니까?" 파싱 > 다른 탭 > 명시 국가·품목 > 홈)
- [x] `pageContext` 요약 주입
- [x] 현재 페이지와 완전 동일한 버튼 필터
- [x] 최대 3개 반환
- [x] `country` / `product` / `home` 3타입
- [x] `MTI_LOOKUP` 역조회로 품목명 → 코드 변환 (4자리 우선)

### Track D — 채팅 기록 & 지속성

- [x] `saveChatLog(role, content)` — Supabase 저장 (로그인 사용자)
- [x] `getChatLogs(limit=50)` — 기록 조회
- [x] `/api/welcome` — 이전 대화 기반 맞춤 환영 메시지 (2문장, "지난번에 ~ 확인하셨네요" 패턴)
- [x] **v4.0: `/api/faq`** — 채팅 로그 기반 추천 질문 3개 (JSON 배열, 20자 이내, 로그 등장 국가·품목만 기반)
- [x] **v4.0: sessionStorage 지속성** — `kstat_chat_messages_<userId>` 또는 `_guest` 키, 최대 50개, F5/네비게이션 유지
- [x] **v4.0: 복원 race 방지** — `authChecked` + `sessionInitializedRef` + `hasRestoredRef`
- [x] **v4.0: 게스트↔로그인 전환** — 키 분리로 혼선 방지

### Track E — 챗봇 UI

- [x] 마크다운 렌더링 (react-markdown + remark-gfm + rehype-raw)
- [x] **v4.0: `singleTilde: false`** — 한국어 `2020년~2025년` 범위 표현 strikethrough 오파싱 해결
- [x] **v4.0: `==하이라이트==` → `<mark>` / `**볼드**` → `<strong>` 전처리**
- [x] 스트리밍 실시간 표시 (타이핑 인디케이터)
- [x] FAQ 제안 버튼 (로그인 시 `/api/faq`, 게스트 기본 4개)
- [x] 글꼴 크기 조절
- [x] 접기/펼치기 토글
- [x] **v4.0: `resolvePageContext`** — URL searchParams에서 `pageContext` 재조립 (tradeType/mode 이중 읽기)

---

## Phase 9 — 거시경제 데이터 연동 ✅

> 목표: 거시경제 지표 대시보드 표시 + LLM 컨텍스트 주입.

- [x] `/api/macro` API 엔드포인트
- [x] MacroSection 컴포넌트 (8개 지표 카드)
- [x] 원/달러 환율 (Exchange Rate API v6, 1시간 revalidate)
- [x] 한국은행 기준금리 (`KR_BASE_RATE`)
- [x] BSI (기업경기실사지수) (`KR_BSI_MFG` / `KR_BSI_NON_MFG`) — 챗봇 컨텍스트용, 카드는 EBSI 우선
- [x] EBSI (수출기업경기실사지수) (`KR_EBSI`)
- [x] 산업생산 전년비 (`KR_PROD_YOY`)
- [x] 소비자물가 전년비 (`KR_CPI_YOY`) — 챗봇 컨텍스트용
- [x] 브렌트유 (`BRENT_OIL`)
- [x] SCFI (컨테이너운임지수) (`SCFI`)
- [x] **v4.0: Supabase `macro_indicators` 테이블 이전** — `NEXT_PUBLIC_MACRO_JSON` 정적 조회 → 테이블 쿼리로 교체
- [x] **v4.0: 미니 trend 차트 + 기간 라벨** — 각 카드에 전체 기간 스파크라인
- [x] **v4.0: 12종 전체 지표 LLM 컨텍스트 주입** — `MACRO_KEYWORD_MAP` + 지표 해석 가이드(BSI/PMI 기준선, 금리 소수→% 변환 안내)

---

## Phase 10 — 인증 시스템 ✅

> 목표: 로그인/회원가입 + 챗봇 기록 연동.

- [x] `/login` 페이지 (username/password)
- [x] `/signup` 페이지 (회원가입)
- [x] Supabase Auth 연동 (username → username@kstat.local 변환)
- [x] 세션 관리 (sessionStorage)
- [x] Header 로그인/로그아웃 버튼 연동
- [x] 로그인 사용자: 챗봇 기록 저장/조회 활성화

---

## Phase 11 — 반응형 UI ✅

> 목표: PC 중심 반응형 레이아웃.

- [x] Tailwind CSS 4 기반 스타일링
- [x] `clamp()` 함수로 유동적 사이징
- [x] Sticky 헤더 + Sticky 챗봇 사이드바
- [x] 챗봇 사이드바 접기/펼치기 (280~360px, `clamp(280px, 22vw, 360px)`)
- [x] 접기/펼치기 시 Recharts 차트 자동 리사이즈
- [x] globals.css 공통 스타일 (~2000줄)
- [x] **v4.0: 플랫폼 전역 폰트 통일** — Noto Sans KR (Google Fonts preconnect + `<link>`)
  - `app/layout.tsx` `<body style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>`
  - `app/globals.css` body font-family
  - 지도 TOP5 라벨, FilterBar NoData 토스트 동일 폰트
  - 이메일 템플릿(`/api/report`)만 Malgun Gothic fallback (메일 클라이언트 호환)
- [ ] 태블릿 전용 레이아웃 최적화
- [ ] 모바일 전용 레이아웃 (하단 슬라이드업 챗봇)

---

## Phase 12 — 통합 테스트 및 배포 🔲

> 목표: 주요 사용자 시나리오 E2E 테스트 통과 후 배포.

### Track A — E2E 테스트

| 테스트 ID | 시나리오 | 상태 |
|-----------|---------|------|
| TC-01 | 메인 → 중국 클릭 → 국가 상세 진입 | 미작성 |
| TC-02 | 국가 상세 → 수입 토글 → KPI + 트리맵 갱신 | 미작성 |
| TC-03 | 국가 상세 시계열 탭 → 연도 선택 | 미작성 |
| TC-04 | 품목 트리맵 → 클릭 → 품목 상세 진입 | 미작성 |
| TC-05 | 품목 상세 → 금액 추이 탭 → 불완전 연도 표시 | 미작성 |
| TC-06 | 품목 상세 → 상위 국가 탭 → TOP10 바차트 | 미작성 |
| TC-07 | 챗봇 → 국가 질의 → 컨텍스트 인젝션 + 라우트 버튼 | 미작성 |
| TC-08 | 월 선택 → KPI 전년 동기 대비 증감률 정확성 | 미작성 |
| TC-09 | MTI 단위 전환 (1~6) → 트리맵 재집계 | 미작성 |
| TC-10 | 로그인 → 챗봇 기록 저장 → 재접속 시 복원 | 미작성 |

### Track B — 배포

- [ ] 환경 변수 프로덕션 설정
- [ ] Vercel 배포
- [ ] 커스텀 도메인 연결
- [ ] 배포 후 TC-01~TC-10 재검증

### v4.0 신규 검증 시나리오

| 테스트 ID | 시나리오 | 상태 |
|-----------|---------|------|
| TC-11 | 2026년 품목 추이 → "ⓘ 부분 데이터(1~2월)" 배지 표시 | 수동 검증 완료 |
| TC-12 | 챗봇 "제약 수출" → LLM 리졸버가 "의약품"으로 매핑 | 수동 검증 완료 |
| TC-13 | 챗봇 → F5 새로고침 → sessionStorage 50개 메시지 복원 | 수동 검증 완료 |
| TC-14 | 부분 집계 연도 질문 → "유효 비교(전년 동기 누적)" 자동 주입 | 수동 검증 완료 |
| TC-15 | 챗봇 응답 "~~도 보시겠습니까?" → 정확한 라우트 버튼 생성 | 수동 검증 완료 |
| TC-16 | 지도 수입 모드 토글 → 코럴 그라데이션 전환 | 수동 검증 완료 |
| TC-17 | 1월 선택 → TimeseriesTooltip에서 전년 12월 대비 MoM 표시 | 수동 검증 완료 |
| TC-18 | 트리맵 CategoryChip 호버 → 대분류 aggregates 툴팁 | 수동 검증 완료 |

---

## Phase 13 — 부분 집계 커버리지 시스템 ✅ (v4.0 신규)

> 목표: 2026년 1~2월 같은 부분 집계 연도가 연간 수치로 오해되지 않도록 UI·LLM 전 영역에 커버리지 정보 주입.

### Track A — 공용 커버리지 판정

- [x] `getLatestYYMM()` — 10분 TTL 프로세스 캐시, `trade_mti6` MAX(YYMM)
- [x] `getIncompleteMonthRange(year)` — `"1~N월"` 또는 `null`
- [x] `useIncompleteMonthRange(year)` React 훅
- [x] `useOngoingYearInfo()` React 훅 — `{ year, monthRange } | null`

### Track B — UI 배지

- [x] "ⓘ 부분 데이터(1~N월)" 배지 (노랑 배경 `#FEF3C7` + 갈색 텍스트 `#92400E`)
- [x] KPIBar · RechartsTooltip · 좌측 카드 · 지도 툴팁 · 트리맵 툴팁 전 지점 노출
- [x] 12개월 완전 집계 시 자동 제거

### Track C — LLM 주입

- [x] `getYearCoverageNote(year)` — `※ YYYY년은 1~N월까지만 집계되어 있으며 연간 합계가 아닌 부분 누적치입니다` 라인
- [x] 4곳 자동 주입 — 현재 화면 상태 블록 / 전체 KPI / 국가 블록 / 연도별 추이
- [x] `getProductSamePeriodYoY(code, year, dir)` — "유효 비교(전년 동기 누적)" 사전 계산
- [x] 시스템 프롬프트 규칙 — "월평균·일평균 환산 우회 금지", "유효 비교 라인만 인용"

### Track D — KPIBar 3모드 전환

- [x] 월 선택 = 전년 동기 대비 · N월
- [x] 부분 연도 + 월 미선택 = 전월 대비 · N월 (자동 전월 탐지)
- [x] 완전 연도 + 월 미선택 = 전년 대비

---

## Phase 14 — 챗봇 지속성 & 개인화 ✅ (v4.0 신규)

> 목표: 챗봇 대화가 F5/페이지 이동 시에도 유지되고, 사용자별 맞춤 환영/FAQ가 제공되도록 함.

### Track A — sessionStorage 지속성

- [x] `kstat_chat_messages_<userId>` 또는 `_guest` 키
- [x] 최대 50개 메시지 유지 (MAX_STORED_MESSAGES)
- [x] 복원 race 방지 — `authChecked` + `sessionInitializedRef` + `hasRestoredRef`
- [x] 게스트 → 로그인 전환 시 키 분리로 혼선 방지

### Track B — 개인화 엔드포인트

- [x] `POST /api/welcome` — 최근 사용자 질문 기반 맞춤 환영 메시지 (2문장, "지난번에 ~ 확인하셨네요" 패턴)
- [x] `POST /api/faq` — 채팅 로그 기반 추천 질문 3개 (JSON 배열, 20자 이내, 등장한 국가·품목만 기반)
- [x] 환영 메시지 null 반환 시 기본 인사말 사용

### Track C — LLM 품목 리졸버

- [x] `lib/productResolver.ts` — Anthropic SDK + MTI 3·4단위 카탈로그(~890개, ~9KB)
- [x] Prompt caching (ephemeral) — 카탈로그 섹션 재사용
- [x] temperature: 0, max_tokens: 80, JSON 배열만
- [x] 결과 LRU 캐시 (200개)
- [x] `hasProductIntent(question)` 가드로 불필요한 호출 방지
- [x] `MTI_LOOKUP` 재검증으로 환각 방지

---

## Phase 15 — 보고서·이메일·PDF 파이프라인 ✅ (v4.0 신규)

> 목표: 챗봇 대화 내용을 KITA 브랜드 보고서로 생성, 이메일 발송 또는 PDF 다운로드.

### Track A — 보고서 생성

- [x] `POST /api/report` — Anthropic Haiku가 대화 내용 → HTML 이메일 템플릿
- [x] 키컬러: 딥 네이비 `#1A237E` + 시안 `#00BCD4` (2색 한정)
- [x] table-layout inline CSS (Gmail·Outlook·Apple Mail·Naver Mail 호환)
- [x] 로고: 절대 URL (`NEXT_PUBLIC_SITE_URL/h1_logo_og.jpg`)
- [x] 섹션 넘버링 (①②③④) · 두괄식 핵심요약 · 액션 아이템
- [x] Malgun Gothic / 맑은 고딕 / Apple SD Gothic Neo fallback

### Track B — 이메일 발송

- [x] `POST /api/send-email` — Resend 6 SDK
- [x] 발신자: `K-stat <onboarding@resend.dev>`
- [x] `RESEND_API_KEY` 환경변수

### Track C — PDF 다운로드

- [x] 클라이언트 `html2pdf.js` 0.14
- [x] 보고서 DOM → PDF 변환 (이메일 템플릿 그대로 사용)

---

## 미구현 항목 (향후 과제)

| 항목 | 초안 계획 | 현재 상태 | 우선순위 |
|------|----------|----------|---------|
| 금액조회 필터 (해당월/누적/연간) | Phase 2 | 미구현 | P3 |
| 대륙별 국가 드롭다운 | Phase 2 | 미구현 | P3 |
| 트리맵 줌인/줌아웃 토글 | Phase 5 | 상세페이지 이동으로 대체 | — |
| 대분류 아이콘 필터 10개 | Phase 5 | ~~MTI 단위 셀렉터로 대체~~ → **v4.0: CategoryChipButton으로 구현** | ✅ |
| 품목 상세 3번째 탭 (상세품목별) | Phase 7 | 미구현 (2탭 구조) | P3 |
| 드릴다운 2단계 (대분류→중분류) | Phase 7 | 코드 프리픽스 합산으로 대체 | — |
| 브레드크럼 (전체 › 대분류) | Phase 7 | 미구현 | P3 |
| 태블릿 전용 레이아웃 | Phase 11 | 부분 대응 | P2 |
| 모바일 전용 레이아웃 | Phase 11 | 미구현 | P2 |
| E2E 테스트 | Phase 12 | 미착수 | P1 |
| CSV/Excel 다운로드 | 없음 | 미구현 (**v4.0: PDF만 지원**) | P3 |
| 정적 데이터 자동 갱신 파이프라인 | 없음 | 수동 스크립트 (`scripts/seed-supabase.js`) | P2 |
| Supabase `agg_*` 증분 갱신 | v4.0 | 수동 재시드 | P2 |

---

## 해결된 블로커

| 항목 | 초안 상태 | 해결 결과 |
|------|----------|----------|
| LLM 모델 확정 | 미확정 (Claude vs OpenAI) | **Claude Haiku 4.5** 확정 |
| TOP30 기준 | 미확정 (실시간 vs 고정) | 필터 기반 **동적 산출** |
| 거시경제 API 소스 | 미확정 (ECOS/KOSIS/FRED) | Exchange Rate API + 자체 수집 |
| GeoJSON ↔ CTR_NAME 매핑 | 팀 작업 필요 | ISO 코드 기반 **180개국+ 완료** |
| 홍콩·대만 표기 | 멘토 확인 필요 | CSV 원본 그대로 표시 |
| 챗봇 히스토리 유지 | 팀 결정 필요 | PersistentChatBot으로 **페이지 이동 시 유지** |

---

## 용어 정리

| 용어 | 설명 |
|------|------|
| 정적 데이터 | ~~tradeData.generated.ts~~ → **v4.0: `lib/staticData.ts` 경량 데이터(KPI + MTI 룩업)** |
| 동적 데이터 | Supabase `agg_*` 테이블(연간) + RPC(월별)로 런타임에 조회하는 데이터 |
| MTI N단위 | MTI 코드의 앞 N자리로 집계하는 품목 분류 깊이. 6단위가 가장 세분화. |
| 코드 프리픽스 | MTI 6자리 코드의 앞부분 (예: "83" → 전자·전기 중분류). 합산 조회에 사용. |
| 인-메모리 캐싱 | 동일 파라미터 RPC 재호출 방지를 위한 브라우저 메모리 캐시. |
| in-flight 중복 방지 | 같은 요청이 진행 중이면 새 요청을 보내지 않고 기존 Promise를 공유. |
| 불완전 연도 / **부분 집계 연도** | 12개월 데이터가 모두 존재하지 않는 연도. **v4.0: `getLatestYYMM` + `getIncompleteMonthRange` 단일 판정** |
| 유효 비교(전년 동기 누적) | **v4.0: `getProductSamePeriodYoY`**로 계산한 같은 기간 전년 누적 금액 — 월평균 환산 오남용 방지 |
| PersistentChatBot | 페이지 이동 시에도 유지되는 챗봇 사이드바 래퍼 컴포넌트. **v4.0: `<Suspense>` + `memo`** |
| 코로플레스 지도 | 지역별로 수치에 따라 색상 농도를 다르게 표시하는 지도. **v4.0: 수출 블루 / 수입 코럴 2색** |
| pageContext | 사용자가 현재 보고 있는 화면 상태(country/productName/year/month/tradeType/view/mtiDepth). URL에서 추출 |
| View narrowing | **v4.0**: `pageContext.view` 에 따라 LLM 컨텍스트에 주입할 데이터 범위를 timeseries/products/countries/trend 로 제한 |
| TierDropdown | **v4.0**: 네이티브 `<select>` 를 대체한 체크 아이콘 포털리스 커스텀 드롭다운 |
| CategoryChipButton | **v4.0**: 트리맵 상단 10개 MTI 대분류 칩 (아이콘 + 명칭) |
| LLM 품목 리졸버 | **v4.0**: `lib/productResolver.ts` — 규칙 매칭 실패 시 Haiku가 의미 매핑 (prompt caching) |
| sessionStorage 지속성 | **v4.0**: `kstat_chat_messages_<userId>` 키로 최대 50개 메시지 F5 유지 |
| FOB | Free On Board. 수출 금액 기준. 선적 시점까지의 비용만 포함. |
| CIF | Cost, Insurance and Freight. 수입 금액 기준. 보험료·운임 포함. |
