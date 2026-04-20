# PRD — 무역통계 대시보드 (Trade Intelligence Dashboard)

> 작성일: 2026-04-09
> 최종 수정: 2026-04-19
> 상태: v4.0 (현재 구현 반영)
> 대상: 개발팀 전체 / 멘토 검토용
> 주요 변경:
>   - v2.0 초안 → v3.0: 실제 구현 완료 상태 반영
>   - v3.0 → v4.0: 지도 컬러 블루/코럴 이원화, 데이터 레이어 Supabase 집계 테이블 이전, 부분 집계 연도 커버리지 시스템, LLM 품목 리졸버, 챗봇 sessionStorage 지속성, 보고서 이메일/PDF, 커스텀 툴팁 6종, TierDropdown, 좌측 카드 강화, 라우트버튼 LLM 파이프라인 반영

---

## 1. 서비스 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | K-stat 무역통계 대시보드 |
| 목적 | 한국무역협회 K-stat 기존 서비스를 대체하는 AI 연동 무역통계 시각화 웹 앱 |
| 핵심 가치 | 숫자만 나열된 기존 통계를 LLM과 결합해 "왜?"를 설명해주는 인사이트 서비스 |
| 주 사용자 | 무역회사 실무자, 대학교수, 연구진 (월 약 3~5만 명) |
| 플랫폼 | 반응형 웹 (PC 우선, 태블릿·모바일 지원) |
| 데이터 범위 | 2020.01 ~ 2026.02, 한국 기준 대세계 수출입 |
| 배포 | Vercel (Next.js 16) |

---

## 2. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 16.2.3 (App Router) | React 19, TypeScript |
| 스타일링 | Tailwind CSS 4 + globals.css | 인라인 스타일 병용 |
| 지도 | MapLibre GL + react-map-gl | 코로플레스 구현 (~~Leaflet.js~~ 미사용) |
| 지도 데이터 | world-atlas@2 countries-110m.json (TopoJSON, CDN) | topojson-client로 파싱, ISO 숫자→alpha-2 매핑 (180개국+) |
| 차트 | Recharts 3.8.1 | 트리맵·라인·바 차트 전체 (~~D3.js~~ 미사용) |
| 백엔드 DB | Supabase (PostgreSQL) | RPC 함수 + trade_mti6 + 집계 테이블 `agg_*` + `macro_indicators` + `chat_logs` |
| LLM | **Claude Haiku 4.5** (Anthropic SDK 0.88.0) | 스트리밍 응답, 컨텍스트 인젝션, prompt caching |
| 거시경제 API | Exchange Rate API v6 + 자체 수집 `macro_indicators` | /api/macro 엔드포인트 |
| 인증 | Supabase Auth | 이메일/비밀번호 기반 (username@kstat.local 변환) |
| 마크다운 | react-markdown 10 + remark-gfm 4 + rehype-raw 7 | 챗봇 응답 렌더링 (`singleTilde:false`로 한국어 `~` 범위 표현 보호) |
| 이메일 | Resend 6 | 보고서 이메일 발송 (/api/send-email) — v4.0 추가 |
| PDF | html2pdf.js 0.14 | 클라이언트 측 보고서 PDF 다운로드 — v4.0 추가 |
| 폰트 | Noto Sans KR (Google Fonts) | `app/layout.tsx`에서 전역 적용, 이메일 템플릿만 Malgun Gothic fallback |

---

## 3. 데이터 명세

### 3-1. 핵심 데이터

**이중 데이터 레이어 구조:**

| 레이어 | 소스 | 용도 |
|--------|------|------|
| 정적 경량 데이터 | `lib/staticData.ts` → `lib/data.ts` re-export (~50KB) | KPI 요약, MTI 룩업/색상/명칭만 클라이언트 번들 포함 |
| 동적 집계 데이터 | `lib/dataSupabase.ts` → Supabase `agg_*` 테이블 (5분 메모리 캐시) | 연간 국가·품목 집계, 품목 추이, 상위 국가, 국가 KPI |
| 동적 월별 데이터 | Supabase RPC (`trade_mti6` 기반) — 인-메모리 캐싱 + in-flight 중복 방지 | 월 선택 시 KPI·지도·트리맵 실시간 조회 |

> **v4.0 변경:** 기존 `tradeData.generated.ts`(~394K LOC) 번들 포함 정적 데이터는 **Supabase 집계 테이블로 완전 이전**. 클라이언트 번들이 대폭 축소되고 데이터 갱신이 DB 배포만으로 가능해짐.

**정적 경량 데이터 (`lib/staticData.ts`, `lib/data.ts`가 re-export):**

| 데이터 | 설명 |
|--------|------|
| `KPI_BY_YEAR` | 연도별 전체 수출/수입/무역수지 + 전년 대비 증감률 (~2KB) |
| `MTI_LOOKUP` | MTI 1~6단위 코드 → 품목명 룩업 (~39KB, ~890개 3·4단위 포함) |
| `MTI_COLORS` | MTI 대분류(1단위) 10색 체계 |
| `MTI_NAMES` | MTI 대분류 한국어 명칭 |

> 과거 `COUNTRY_DATA` / `TREEMAP_DATA` / `TIMESERIES_BY_YEAR_COUNTRY` / `PRODUCT_*_BY_CODE` 는 **Supabase 집계 테이블(`agg_*`)로 이전**되었으며, `lib/dataSupabase.ts`의 `async` 함수들(`getTreemapDataAsync`, `getCountryRankingAsync`, `getCountryKpiAsync`, `getCountryTimeseriesAsync`, `getProductTrendAsync`, `getProductTopCountriesAsync`, `getAggregatedProductTrend`, `getAggregatedTopCountries`, `getCountryTreemapDataAsync` 등)으로 조회.

**Supabase 테이블:**

| 테이블 | 설명 |
|--------|------|
| `trade_mti6` | 월별 무역 원데이터 (YYMM 기준) |
| `agg_treemap` | (year, code, name, mti, exp_amt, imp_amt) — MTI 6단위 품목 집계 |
| `agg_product_trend` | (year, code, name, exp_amt, imp_amt) — 품목×연도 추이 |
| `agg_product_top_countries` | 품목별 상위 교역국 (연간) |
| `agg_country_ranking` | 연도×방향별 국가 순위 |
| `agg_country_kpi` | 국가 단위 KPI (수출·수입·수지·전년 대비) |
| `agg_country_treemap` | 국가별 품목 구성 (연간) |
| `agg_country_timeseries` | 연도×국가별 월별 시계열 |
| `macro_indicators` | 거시경제 지표 월별 시계열 (12종) |
| `chat_logs` | 챗봇 대화 기록 (user_id, role, content, created_at) |
| `auth.users` | Supabase 내장 인증 테이블 |

**Supabase RPC 함수:**

| RPC | 파라미터 | 반환 |
|-----|---------|------|
| `get_treemap_mti6` | p_yymm, p_mode, p_mti_depth | MTI 코드별 금액 (트리맵용) |
| `get_country_map_mti6` | p_yymm, p_mode | 국가별 순위·금액 (지도용) |
| `get_country_treemap_mti6` | p_yymm, p_ctr_name, p_mode, p_mti_depth | 특정 국가 품목 구성 |

### 3-2. MTI 품목 분류 체계

```
MTI 1단위 (대분류, 10개)
 └ MTI 2단위 (중분류, 49개)
   └ MTI 3단위 (소분류, 198개)
     └ MTI 4단위
       └ MTI 5단위
         └ MTI 6단위 ← DB 저장 기준 + UI 기본 표시 단위
```

> **구현 완료:** FilterBar에서 MTI 1~6단위 깊이 선택 가능. `aggregateTreemapByDepth(data, depth)` 함수로 6단위 데이터를 N단위로 실시간 집계.

### 3-3. 데이터 품질 주의사항

- **IMP_AMT = 0인 행 42.3%:** 수입 집계 쿼리에 0값 제외 처리
- **수출 FOB / 수입 CIF:** 동일 품목도 수입 금액이 높게 나올 수 있음
- **2026년 데이터:** 1~2월만 존재 → **부분 집계 연도 커버리지 시스템 구축 (v4.0)**
- **홍콩:** 중계무역 허브 → LLM 시스템 프롬프트에 명시
- **라이베리아·마셜제도:** 선박 등록지 → LLM 시스템 프롬프트에 명시
- **CSV 시드 콤마 파싱 버그:** Supabase에 `"불꽃점화식 1"`처럼 잘려 저장된 품목명을 런타임에 `MTI_LOOKUP`으로 교정 (`toProductNode` / `mapToProductNode`)

**부분 집계 연도 커버리지 시스템 (v4.0 신규):**

| 요소 | 역할 |
|------|------|
| `getLatestYYMM()` | 10분 TTL 프로세스 캐시, `trade_mti6` MAX(YYMM) — 전체 커버리지 판단의 단일 원천 |
| `getIncompleteMonthRange(year)` | `"1~N월"` 또는 `null` 반환 |
| `useIncompleteMonthRange(year)` / `useOngoingYearInfo()` | React 훅 — UI 배지 렌더링 |
| **"ⓘ 부분 데이터(1~N월)" 배지** | KPIBar, RechartsTooltip, 좌측 카드, 지도 툴팁, 트리맵 툴팁 등 전 지점 노출 |
| `getYearCoverageNote(year)` | 챗봇 컨텍스트 4곳에 `※ YYYY년은 1~N월까지만 집계…` 라인 자동 주입 |
| `getProductSamePeriodYoY(code, year, dir)` | 부분 집계 연도에 대해 **"유효 비교(전년 동기 누적)"** 라인을 사전 계산해 LLM에 주입 — 월평균 환산 같은 잘못된 비교 원천 차단 |

### 3-4. 거시경제 지표 (구현 완료)

MacroSection 컴포넌트에서 8개 지표 표시:

| 지표 | 출처 | 비고 |
|------|------|------|
| USD/KRW 환율 | Exchange Rate API v6 (1시간 revalidate) | `EXCHANGE_RATE_API_KEY` |
| 한국 기준금리 | `macro_indicators.KR_BASE_RATE` | 소수 → % 변환 |
| EBSI (수출기업경기실사) | `macro_indicators.KR_EBSI` | 기준 100 |
| 산업생산 증감률 | `macro_indicators.KR_PROD_YOY` | 전년 동기 대비 |
| 중국 PMI | `macro_indicators.CN_PMI_MFG` | 기준 50 |
| 미국 기준금리 | `macro_indicators.US_BASE_RATE` | 소수 → % |
| 브렌트유 | `macro_indicators.BRENT_OIL` | $/배럴 |
| SCFI | `macro_indicators.SCFI` | 상하이컨테이너운임지수 |

> v4.0 변경: MacroSection 대시보드 카드는 8종(USD/KRW 포함)으로 재선정. `macro_indicators` 테이블에는 KR_BSI_MFG / KR_BSI_NON_MFG / KR_CPI_YOY / US_PMI_MFG / CN_BASE_RATE 등까지 총 12종이 저장되어 있으며, **챗봇 컨텍스트 주입에는 12종 전체** 사용.

---

## 4. 전체 페이지 구조

```
/login — 로그인
/signup — 회원가입
    │
    ▼
/ — 메인 대시보드 (탭 두 개짜리 단일 화면)
  │
  ├─ [국가별 탭]
  │    └─ TOP30 국가 클릭 → /country/[name] 국가별 상세
  │                              └─ 돌아가기 → / (국가별 탭)
  │
  └─ [품목별 탭]
       └─ 품목 클릭 → /product/[name] 품목별 상세
                          └─ 돌아가기 → / (품목별 탭)
```

**URL 라우팅:**

| 페이지 | URL |
|--------|-----|
| 메인 (국가별 탭) | `/?tab=country` |
| 메인 (품목별 탭) | `/?tab=product` |
| 메인 필터 동기화 (v4.0) | `/?tab=...&year=YYYY&mode=import&month=MM&country=...&mtiDepth=N` |
| 국가별 상세 | `/country/[name]?year=YYYY&mode=import&tab=timeseries&mtiDepth=3` |
| 품목별 상세 | `/product/[name]?code=XXX&year=YYYY&mode=import&tab=countries` |
| 로그인 | `/login` |
| 회원가입 | `/signup` |

> **v4.0 변경:** 홈(`/`)의 모든 필터 상태(연도·월·방향·국가·MTI 단위)가 URL searchParams로 동기화됨 → 챗봇 `pageContext`가 URL에서 바로 추출 가능.

---

## 5. 공통 UI 컴포넌트

### 5-1. 레이아웃 — 사이드바 챗봇

```
┌──────────────────────────────────────┬───────────────┐
│  메인 대시보드 영역 (가변)            │  챗봇 사이드바  │
│  (.main-content)                     │  (280~360px)  │
│                                      │  접기/펼치기   │
│                                      │  토글 버튼     │
└──────────────────────────────────────┴───────────────┘
```

- ~~Split Panel 75:25 비율~~ → 접기/펼치기 가능한 **Sticky 사이드바** 방식으로 구현
- 챗봇 접기 → 메인 영역 100% 확장 + `transitionend` 이벤트 + 350ms 보정 타이머로 `window.resize` 디스패치 (Recharts 반응형 대응)
- `/login`, `/signup` 페이지에서는 챗봇 사이드바 숨김
- PersistentChatBot 컴포넌트로 전역 관리 (페이지 이동 시에도 유지)
- **v4.0:** `PersistentChatBot`을 `<Suspense fallback={null}>`로 감싸 `useSearchParams` 정적 프리렌더 빌드 에러 해결
- **v4.0:** `memo(ChatBot)` → `StableChatBot` 으로 props 고정 시 re-render 방지

### 5-2. 헤더 (Header)

- Sticky 상단 고정
- K-stat 로고 + KITA.NET 외부 링크
- 로그인/로그아웃 버튼
- GNB 내비게이션 메뉴

### 5-3. 필터 바 (FilterBar)

| 필터 | 옵션 | 기본값 | 비고 |
|------|------|--------|------|
| 연도 | 2020~2026 | 2026 (DEFAULT_YEAR) | URL `?year=` 동기화 |
| 월 | 전체 / 1~12월 | 전체 | 품목 상세 페이지에서 비활성화 (`disableMonthPeriod`) |
| 수출/수입 토글 | 수출 / 수입 | 수출 | URL `?tradeType=` 또는 `?mode=` |
| MTI 단위 | 1~6단위 | 3 (국가 상세) / 6 (기본) | **v4.0: 커스텀 TierDropdown** (체크 아이콘 + 포털 없는 팝오버) |
| 국가 선택 | 드롭다운 | 전체 보기 | mode에 따라 표시 (라벨 "전체" → "전체 보기"로 v4.0 변경) |

> **변경점:** 초안의 "금액조회(해당월/누적/연간)" 필터 미구현. "대륙별 드롭다운" 미구현.

- **v4.0:** 2026년 3~12월 선택 시 "데이터 없음" 토스트 표시 (1.8s fade, 2.4s hide)
- **v4.0:** 필터 변경 시 `router.replace` 로 URL 동기화(스크롤 유지) → KPIBar/지도/트리맵이 URL에서 필터 값 재조회

### 5-4. KPI 카드 바 (KPIBar)

3개 카드 항상 표시: **수출** | **수입** | **무역수지**

**증감률 로직 (3가지 모드):**

| 조건 | 비교 기준 | 레이블 |
|------|----------|--------|
| 월 선택 시 | Supabase에서 전년 동월 데이터 조회 | (전년 동기 대비 · N월) |
| 불완전 연도 + 월 미선택 | 최신 월 자동 탐지 → 전월 데이터 비교 | (전월 대비 · N월) |
| 완전 연도 + 월 미선택 | 정적 데이터 전년 대비 | (전년 대비) |

- 색상: 상승 = 빨간색(#E02020) ▲ / 하락 = 파란색(#185FA5) ▼ (한국 금융 관례)
- 무역수지: 흑자 = 빨간색(+) / 적자 = 파란색(-)
- 불완전 연도 자동 탐지 완료 (`useIncompleteMonthRange` 훅 — `getLatestYYMM` 기반, `getAvailableMonths` RPC는 상세 페이지에서 월 범위 정확도 검증용으로 병행 사용)
- **v4.0:** 증감률 포맷 2자리 기본, `.00`은 `.0`으로 축약 (`3.76` / `0.02` / `3.8`); 0% 또는 0 근접값은 숨김/`-`
- **v4.0:** 부분 집계 연도에서는 월 미선택 시 전년 대비 숨김 → 자동으로 "전월 대비 · N월" 모드로 전환

### 5-5. 거시경제 섹션 (MacroSection)

- 메인 대시보드 하단에 8개 거시경제 지표 카드 표시
- `/api/macro` 엔드포인트에서 데이터 조회
- 환율은 실시간 API, 나머지는 자체 수집 데이터
- **v4.0:** 각 카드는 값 + 전월 대비 변화율(▲/▼ + %) + 미니 trend 차트 + 기간 라벨 포함

### 5-6. 커스텀 툴팁 시스템 (v4.0 추가)

`components/RechartsTooltip.tsx` 에 6종 재사용 가능한 툴팁 정의:

| 툴팁 | 용도 | 특징 |
|------|------|------|
| `RechartsPayloadTooltip` | 공통 카드 셸 (흰 배경 + 하단 꼬리) | 제목·서브타이틀·부분 데이터 배지 |
| `TimeseriesTooltip` | 월별 시계열 라인차트 | 전월 대비 증감 ▲/▼/– + **`prevYearLastMonth` prop으로 1월 MoM 계산** |
| `ProductTrendTooltip` | 품목별 금액 추이 | 3 케이스 처리 (확정 연도 / 신규 진입 / 진행 중) |
| `TopCountriesTooltip` | 상위 국가 바차트 | 점유율 · 순위 · 전년 대비 YoY |
| Treemap Cell 툴팁 | 트리맵 셀 호버 | 품목명 · 카테고리 · MTI · 금액 · 점유율 · 전년(동기) 대비 |
| Category 툴팁 | 트리맵 대분류 칩 | 대분류 합계 · 하위 품목 수 · 점유율 · YoY |

- 커서 오른쪽 8px 오프셋(`rechartsTooltipFollowProps`)
- 차트 경계에서 자동 flip (`allowEscapeViewBox: { x:false, y:false }`)
- 포털 렌더링(document.body) — 트리맵/맵 경계 외부에도 표시
- 월 선택 시 "**전년 동기 대비**", 연간 조회 시 "**전년 대비**" 라벨 자동 전환

---

## 6. P1 — 메인 대시보드 (국가별 탭)

### 6-1. 레이아웃

```
┌─────────────────────────────────────────────────────┐
│  [Header] K-stat 로고 | KITA.NET | 로그인            │
├─────────────────────────────────────────────────────┤
│  [HeroBanner]                                       │
├─────────────────────────────────────────────────────┤
│  [탭] 국가별 (활성) | 품목별                          │
├─────────────────────────────────────────────────────┤
│  [필터 바]  연도 | 월 | 수출/수입                      │
├─────────────────────────────────────────────────────┤
│  [KPI]  수출 | 수입 | 무역수지                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [코로플레스 지도 — MapLibre GL]                      │
│  국가별 수출액(또는 수입액) 색상 강도 표현             │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [거시경제 지표 8개]                                  │
└─────────────────────────────────────────────────────┘
```

### 6-2. 지도 구현 (WorldMap)

- **렌더링:** MapLibre GL + react-map-gl (~~Leaflet.js~~ 미사용)
- **데이터:** `world-atlas@2 countries-110m.json` TopoJSON → ISO 숫자→alpha-2 매핑 (180개국+)
- **월 선택 시:** Supabase RPC(`get_country_map_mti6`)로 해당 월 국가별 데이터 조회
- **연간 데이터:** `agg_country_ranking` 테이블 (`getCountryRankingAsync`)
- **인-메모리 캐싱 + in-flight 중복 요청 방지** 구현
- **v4.0: TOP5 마커 라벨** — 국가명 + 수출(수입)액, 흰 글씨 + 검정 halo(`textShadow: 0 0 4px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,1)`), Noto Sans KR 12px 700
- **v4.0: 국가별 품목 배지** — 선택 국가의 TOP 품목 미니 칩
- **v4.0: 커스텀 TierDropdown** — 지도 위/좌측에서 재사용 가능한 체크 아이콘 팝오버

### 6-3. 지도 인터랙션

| 동작 | TOP30 국가 | TOP30 외 국가 |
|------|-----------|--------------|
| 호버 | 툴팁: 국가명·금액·순위(X/Y위)·점유율·전년(동기) 대비·TOP1 품목 | — |
| 클릭 | `/country/[name]` 상세페이지 이동 | 반응 없음 |
| 색상 | 순위 기반 6단계 그라데이션 (수출=블루 / 수입=코럴) | 가장 밝은 색 |

**v4.0: 툴팁 라벨 규칙** — 연도 전체 조회 → "전년 대비" / 월 선택 조회 → "**전년 동기 대비 · N월**". 부분 집계 연도일 때 "ⓘ 부분 데이터(1~N월)" 배지 동반.

### 6-4. 색상 구간 (getMapColor) — v4.0 전면 교체

> **v4.0 변경:** 단일 틸 그라데이션 → **수출 블루 / 수입 코럴** 2색 체계로 분화. 모드 전환 시 시각 구분이 즉각적.

| 순위 | 수출 (Blue) | 수입 (Coral) |
|------|------------|-------------|
| 1 ~ 3위 | `#002B5C` 딥 네이비 | `#B02020` 딥 로즈 |
| 4 ~ 9위 | `#0A3D6B` 다크 블루 | `#D04545` 코럴 레드 |
| 10 ~ 15위 | `#1A6FA0` 블루 | `#E07060` 소프트 코럴 |
| 16 ~ 21위 | `#6A9EC0` 소프트 블루 | `#ECA090` 피치 |
| 22 ~ 30위 | `#B0D0E8` 라이트 블루 | `#F4C8BC` 라이트 피치 |
| TOP30 외 | `#DCE8F0` | `#FAE8E4` |

> **v3.0 버전 참고(보존):** v3.0은 단일 틸 그라데이션(#054744 → #DCF3EF, TOP30 외 가장 밝은 틸). v4.0에서 위 블루/코럴 2색으로 교체됨.

---

## 7. P1 — 메인 대시보드 (품목별 탭)

### 7-1. 트리맵 구현 (TreemapChart)

- **라이브러리:** Recharts Treemap (~~D3.js~~ 미사용)
- **기본 단위:** MTI 6단위 품목 (FilterBar에서 1~6단위 전환 가능)
- **집계 로직:** `aggregateTreemapByDepth(data, depth)` — 6단위 데이터를 선택 깊이로 합산
- **색상:** MTI 대분류(1단위) 기준 10색 체계
- **클릭:** 품목 클릭 → `/product/[name]` 상세페이지 이동
- **월 선택 시:** Supabase RPC(`get_treemap_mti6`)로 해당 월 데이터 조회
- **애니메이션:** 10포인트 트랜지션

**트리맵 색상 체계 (구현된 값):**

| MTI | 대분류 | 색상 |
|-----|-------|------|
| 0 | 농림수산물 | #3B6D11 (Green) |
| 1 | 광산물 | #854F0B (Amber) |
| 2 | 화학공업제품 | #534AB7 (Purple) |
| 3 | 플라스틱·고무 | #993C1D (Coral) |
| 4 | 섬유류 | #993556 (Pink) |
| 5 | 생활용품 | #0F6E56 (Teal) |
| 6 | 철강·금속 | #444441 (Gray) |
| 7 | 기계·운송장비 | #0C447C (Blue 진) |
| 8 | 전자·전기 | #185FA5 (Blue 연) |
| 9 | 잡제품 | #888884 (Gray 연) |

### 7-2. 변경점 (초안 대비)

- ~~줌인/줌아웃 토글~~ 미구현 → 클릭 시 바로 상세페이지 이동
- ~~하단 대분류 아이콘 필터 10개~~ 미구현 → MTI 단위 셀렉터로 대체 / **v4.0: 상단 카테고리 칩 필터(CategoryChipButton) 추가** — 10개 MTI 대분류 아이콘+명칭, 클릭 시 해당 대분류 강조 + Category 툴팁
- ~~호버 시 상위 수출국 TOP3 툴팁~~ → 품목명 + 금액 표시 / **v4.0: Cell 툴팁 확장** — 품목명·카테고리·MTI·금액·점유율·전년(동기) 대비
- ~~TOP3 품목만 "상세 페이지 보기"~~ → 모든 품목 클릭 가능
- **v4.0: MTI SVG 아이콘** — 각 대분류에 고유 아이콘(곡식, 다이아몬드, 플라스크, 육각형 분자, 실타래, 집, 너트, 기어, 번개, 그리드)
- **v4.0: 월별 조회 시 `{year}년 {month}월` 서브타이틀** 노출

---

## 8. P2-A — 국가별 상세페이지 (`/country/[name]`)

### 8-1. 진입 경로

메인 지도에서 국가 클릭 → `/country/[name]`  
URL 파라미터: `?year=YYYY&mode=import&tab=timeseries&mtiDepth=3`

### 8-2. 레이아웃

```
┌─────────────────────────────────────────────┬──────────┐
│  [필터 바]  연도 | 월 | 수출/수입 | MTI 단위  │          │
├─────────────────────────────────────────────┤  챗봇    │
│  [KPI]  대[국가] 수출 | 수입 | 무역수지       │  사이드바  │
├──────────────┬──────────────────────────────┤          │
│  [좌측 카드]  │  [서브탭] 품목별 | 시계열 추이 │          │
│  ← 돌아가기  │                              │          │
│  지역(대륙)   │  [메인 시각화]               │          │
│  국가명       │                              │          │
│  순위         │                              │          │
│  전체 비중    │                              │          │
└──────────────┴──────────────────────────────┴──────────┘
```

### 8-3. 좌측 카드

| 항목 | 수출 모드 | 수입 모드 |
|------|----------|----------|
| 돌아가기 | 메인 국가별 탭 복귀 | 동일 |
| 지역 | 대륙명 | 동일 |
| 국가명 | ISO코드 + 국가명 | 동일 |
| 순위 | 수출 순위 (필터 연동) | 수입 순위 |
| 비중 | 전체 수출 대비 % | 전체 수입 대비 % |

**v4.0 강화:**

- **국기 이모지** — `countryNameToFlag` (ISO alpha-2 → 리저널 인디케이터 변환, `lib/countryIso.ts`)
- **순위 분모 표시** — "12/195위" 같이 전체 분모 노출
- **YoY 순위 변동** — 전년 순위 대비 상승/하락 (▲3 / ▼2 등)
- **부분 집계 연도 배지** — "ⓘ 부분 데이터(1~N월)"

### 8-4. 서브탭 1 — 품목별 트리맵

- Recharts Treemap으로 해당 국가 품목 구성 시각화
- MTI 단위 선택 가능 (FilterBar 연동, **v4.0: 커스텀 TierDropdown**)
- 월 선택 시 Supabase RPC(`get_country_treemap_mti6`) 조회
- 연간 데이터: `agg_country_treemap` 테이블 (`getCountryTreemapDataAsync`)
- 클릭 시 이동 없음 (호버 툴팁만 표시) — **v4.0: Cell/Category 툴팁 시스템 적용**

### 8-5. 서브탭 2 — 시계열 추이

- Recharts LineChart로 월별 수출/수입/무역수지 표시
- `getCountryTimeseriesAsync` (`agg_country_timeseries` 테이블 기반, **v4.0: 정적 데이터에서 이전**)
- 연도 선택 가능
- **v4.0: `TimeseriesTooltip`** — 전월 대비 증감(▲/▼/–), 1월 MoM 계산 시 `prevYearLastMonth` prop으로 전년 12월 값 제공 (1월 `-` 버그 해결)

### 8-6. 국가별 KPI (getCountryKpi)

- 해당 국가 수출액/수입액/무역수지 + 전년 대비 증감률
- **v4.0: `agg_country_kpi` 테이블 조회 (`getCountryKpiAsync`)** — 월 선택 시 Supabase RPC 연동은 KPIBar 내부에서 처리

---

## 9. P2-B — 품목별 상세페이지 (`/product/[name]`)

### 9-1. 진입 경로

메인 트리맵에서 품목 클릭 → `/product/[name]`  
URL 파라미터: `?code=XXX&year=YYYY&tab=countries`

### 9-2. 레이아웃

```
┌─────────────────────────────────────────────┬──────────┐
│  [필터 바]  연도 | 수출/수입 | 국가            │          │
│  (월 선택 비활성화)                           │  챗봇    │
├─────────────────────────────────────────────┤  사이드바  │
│  [KPI]  수출 | 수입 | 무역수지               │          │
├──────────────┬──────────────────────────────┤          │
│  [좌측 카드]  │  [서브탭] 금액 추이 | 상위 국가 │          │
│  ← 돌아가기  │                              │          │
│  품목명       │  [메인 시각화]               │          │
│  연간 수출액  │                              │          │
│  전년 대비    │                              │          │
└──────────────┴──────────────────────────────┴──────────┘
```

### 9-3. 좌측 카드

| 항목 | 설명 |
|------|------|
| 품목명 | URL 파라미터에서 추출 |
| MTI 코드 | `?code=` 쿼리 (코드 프리픽스 집계 시) |
| 연간 수출(수입)액 | 선택 연도 기준 |
| 전년 대비 증감률 | 불완전 연도 감지 → 포함 시 증감률 미표시 / **v4.0: "ⓘ 부분 데이터(1~N월)" 배지** |

> **변경점:** 초안의 "전월 수출액·증감률 고정값" → 실제로는 **연간 기준** + **불완전 연도 자동 감지** 방식

### 9-4. 서브탭 1 — 금액 추이

- Recharts LineChart/BarChart로 연도별 금액 추이 표시
- `getAggregatedProductTrend(codePrefix, tradeType)`로 코드 프리픽스 기준 합산 (`agg_product_trend` 테이블)
- 불완전 연도 표시: Supabase `getAvailableMonths` + `useIncompleteMonthRange` → **"ⓘ 부분 데이터(1~N월)" 배지** (v3.0 `"⚠ 불완전 연도"` → v4.0 현재 라벨)
- **v4.0: `ProductTrendTooltip`** — 3 케이스 (확정 연도 / 신규 진입 / 진행 중) + `incompleteMonthRanges` prop

### 9-5. 서브탭 2 — 상위 국가

- Recharts BarChart로 상위 10개국 표시
- `getAggregatedTopCountries(codePrefix, year, tradeType)` (`agg_product_top_countries` 테이블)
- 커스텀 툴팁 — **v4.0: `TopCountriesTooltip`** (점유율·순위·전년 대비 YoY 포함)

> **변경점:** 초안의 3개 탭(상세품목별/추이/상위국) → 실제 **2개 탭**(금액 추이/상위 국가)

---

## 10. LLM 챗봇 연동

### 10-1. 아키텍처

```
[ChatBot.tsx]
   ├─▶ POST /api/chat           → Anthropic SDK → Claude Haiku 4.5 (stream)
   ├─▶ POST /api/route-buttons  → Haiku (JSON → 라우트 버튼)            [v4.0]
   ├─▶ POST /api/welcome        → Haiku (맞춤 환영 메시지, 2문장)        [v4.0]
   ├─▶ POST /api/faq            → Haiku (추천 질문 3개, JSON 배열)       [v4.0]
   ├─▶ GET  /api/macro          → Supabase macro_indicators
   └─▶ POST /api/report         → Haiku (보고서 HTML)
         └─▶ POST /api/send-email → Resend                              [v4.0]
```

- **모델:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`, env `ANTHROPIC_MODEL`로 override 가능)
- **SDK:** @anthropic-ai/sdk v0.88.0
- **스트리밍:** ReadableStream + TextEncoder (글자 단위 실시간 표시) — `/api/chat`만
- **v4.0: Prompt Caching** — `productResolver.ts`의 MTI 카탈로그(~890개, ~9KB)에 `cache_control: { type: "ephemeral" }` 적용

### 10-2. 시스템 프롬프트 (고정 + 동적)

- 한국 무역통계 분석 어시스턴트 역할
- 정확한 데이터 인용 강조
- `==주제==` 하이라이트 포맷 사용 (응답당 1~2개)
- 거시경제 지표 연계 해석 안내
- FOB/CIF, 홍콩 중계무역, 선박 등록지 도메인 지식

**v4.0 규칙 블록 (모두 `/api/chat` 시스템 프롬프트에 명시):**

| 블록 | 핵심 규칙 |
|------|----------|
| 역할·날짜 | 오늘 날짜(`${todayStr}`) 동적 주입 → "최근"의 기준점 고정 |
| 시점 표현 | 모든 수치에 언제 기준인지 명시. "최근/요즘"은 지난 연도에 사용 금지 |
| 데이터 커버리지 | 부분 집계 연도를 연간과 단순 비교 금지. **월평균·일평균 환산 우회 금지**. "유효 비교(전년 동기 누적)" 라인만 인용 |
| 추세·단정 어휘 | "매년/지속/심화/악화/장기/만성적"은 3개 이상 연속 포인트에서만. 체리피킹 금지 |
| 헤드라인·토픽 | 소제목은 짧은 명사구(서술문 금지). 헤드라인 뒤 빈 줄 필수 |
| 화면 범위 엄수 | `[현재 화면 상태]` 블록이 있으면 활성 뷰(timeseries/products/countries/trend)에 해당하는 데이터만 답변 |
| 부가 정보 제안 | 마지막 한 줄에만 "~~도 보시겠습니까?" |
| 현재 질문 집중 | 이전 Q/A 참조 금지. 복합 질문은 문단 분리. "이전 질문" 관련 질문은 1문단 2문장으로만 응답 |
| 첫 턴 예외 | `[바로 직전 인사말]` 블록이 있고 사용자가 "네/좋아/그래" 같은 짧은 수락이면 인사말이 제안한 주제를 이어받음 |

### 10-3. 동적 컨텍스트 인젝션 (buildChatContext)

매 질의 시 사용자 메시지를 분석하여 관련 데이터 자동 주입:

| 감지 항목 | 처리 |
|----------|------|
| 현재 화면 상태 | `questionReferencesScreen(question)` 이 true일 때만 `pageContext` 주입 (키워드: 화면·여기·지금·현재 대시보드·트리맵·차트·지도·시각화·표시된) |
| 국가명 | `getCountryList` 캐시(`agg_country_ranking` 기반)에서 매칭 |
| 품목명 | `PRODUCT_LOOKUP`(6단위) → `MTI_LOOKUP`(4단위 우선) → **v4.0: LLM 의미 폴백** |
| MTI 코드 | `VALID_CODE_PREFIXES` 검증 → 코드 기반 조회 |
| 연도 | `\b20\d{2}\b` 매치 또는 `pageContext.year` 폴백(화면 참조 시에만) |
| 방향 | "수출/수입" 토큰 + 국가명 주변 10자 맥락 + `pageContext.tradeType` 폴백 |
| 거시경제 | `MACRO_KEYWORD_MAP` 12종 지표 키워드 매칭 |

**v4.0: LLM 품목 리졸버 (`resolveProductCodesViaLLM`)**

- 규칙 매칭 실패 + `hasProductIntent(question)=true` 일 때만 호출
- MTI 3·4단위 카탈로그(~890개)를 prompt caching (ephemeral)
- temperature: 0, max_tokens: 80, JSON 배열만 반환
- 결과 캐시 (최대 200개 LRU)
- 의미 매핑 예: "제약→의약품", "자동차→승용차", "스마트폰→무선전화기", "반도체→전자집적회로"
- 환각 방지: 반환 코드는 `MTI_LOOKUP`으로 재검증

**v4.0: View narrowing**

| 활성 뷰 | 컨텍스트 범위 제한 |
|---------|------------------|
| `timeseries` | 월별 시계열만, 품목·국가 순위 제외 |
| `products` | 국가의 상위 품목만, 월별 시계열 제외 |
| `countries` | 상위 국가만, 연도별 추이 제외 |
| `trend` | 연도별 추이만, 국가 순위 제외 |

**v4.0: 부분 집계 연도 유효 비교 자동 주입**

- `getProductSamePeriodYoY(code, year, dir)` 가 전년 같은 기간(1~N월) 누적을 사전 계산
- 컨텍스트에 `※ 유효 비교(전년 동기 누적): 2026년 1~2월 X억달러 vs 2025년 1~2월 Y억달러 (+Z%)` 라인 + `※ 위 유효 비교 수치만 인용해서 추세를 말하세요` 지시 삽입

### 10-4. 네비게이션 버튼 — 이중 파이프라인 (v4.0 확장)

**규칙 기반 (`resolveRouteButtons` in `lib/chatContext.ts`) — 기존 유지:**

- 국가명 언급 → `/country/[name]` 버튼
- 품목명 언급 → `/product/[name]` 버튼
- "추이" 키워드 → `?tab=timeseries` 파라미터 추가
- "상위 국가" 키워드 → `?tab=countries` 파라미터 추가
- MTI 단위 감지 → `?mtiDepth=N` 파라미터 추가
- 연도 감지 → `?year=YYYY` 파라미터 추가

**v4.0 LLM 파이프라인 (`POST /api/route-buttons`):**

4단계 우선순위로 Haiku가 JSON 버튼 배열 생성:

1. **1순위:** 답변 말미 "~~도 보시겠습니까?" 파싱 → 제안 대상 추출 (최우선)
2. **2순위:** `pageContext`가 있고 화면 관련 질문이면 **다른 탭** 제안
3. **3순위:** 질문에 명시된 국가·품목 기반 버튼
4. **4순위:** 무역수지·전체 현황 질문 → `{type:"home"}`

- 현재 페이지와 **완전히 동일한** 버튼은 필터링
- 최대 3개
- 버튼 타입: `country` / `product` / `home`

### 10-5. 채팅 기록 & 지속성 (v4.0 확장)

| 기능 | 구현 |
|------|------|
| Supabase 영구 저장 | `chat_logs` 테이블 (로그인 사용자만), 최대 50개 조회 |
| **v4.0: sessionStorage 지속성** | `kstat_chat_messages_<userId>` 또는 `_guest` 키, 최대 50개 |
| **v4.0: F5/페이지 이동 유지** | `authChecked` + `sessionInitializedRef` + `hasRestoredRef`로 race 방지 |
| **v4.0: 게스트↔로그인 전환** | 키 분리로 혼선 방지 |
| `/api/welcome` | 이전 대화 기반 맞춤 환영 메시지 (2문장 이내, "지난번에 ~를 확인하셨네요" 패턴) |
| **v4.0: `/api/faq`** | 채팅 로그 기반 추천 질문 3개 (JSON 배열, 20자 이내, 로그에 등장한 국가·품목만 기반) |

### 10-6. 챗봇 UI 기능

- 마크다운 렌더링 (GFM: 테이블, 취소선, 리스트) — **v4.0: `singleTilde: false`** 로 한국어 `2020년~2025년` 범위 표현 strikethrough 잘못 파싱 해결
- `==하이라이트==` → `<mark>` / `**볼드**` → `<strong>` 전처리
- FAQ 제안 버튼 (로그인 시 `/api/faq`, 게스트는 기본 4개)
- 글꼴 크기 조절
- 타이핑 인디케이터
- 접기/펼치기 토글

### 10-7. 보고서 생성 & 이메일 (v4.0 신규)

| 엔드포인트 | 기능 |
|------------|------|
| `POST /api/report` | Haiku가 대화 내용 → KITA 브랜드 HTML 이메일 템플릿. 키컬러: 딥 네이비 `#1A237E` + 시안 `#00BCD4`, table-layout inline CSS, Malgun Gothic fallback |
| `POST /api/send-email` | Resend로 이메일 발송 (`noreply@kitaaxmu4.kr` → 수신자, 커스텀 도메인 연결) |
| 클라이언트 PDF | `html2pdf.js`로 보고서 PDF 다운로드 |

---

## 11. 인증 시스템

| 기능 | 구현 |
|------|------|
| 회원가입 | Supabase Auth signUp (username → username@kstat.local 변환) |
| 로그인 | Supabase Auth signIn |
| 로그아웃 | 세션 클리어 |
| 세션 관리 | sessionStorage 기반 |
| 인증 필요 기능 | 챗봇 대화 기록 저장/조회 |

---

## 12. 반응형 UI

- Tailwind CSS 4 기반
- `clamp()` 함수로 유동적 사이징
- `vw` 단위로 뷰포트 대응
- 챗봇 사이드바: 280~360px 가변 폭, 접기 가능
- Sticky 헤더 + Sticky 사이드바
- 챗봇 접기/펼치기 시 window resize 이벤트로 Recharts 차트 반응형 리사이즈
- **v4.0: 플랫폼 전역 폰트 통일** — Noto Sans KR (Google Fonts) — `app/layout.tsx` + `globals.css` + 지도 TOP5 라벨까지 통일. 이메일 템플릿(`/api/report`)만 메일 클라이언트 호환을 위해 Malgun Gothic fallback 사용.

---

## 13. 상태 관리

**URL 파라미터 + React useState** 방식 (~~Zustand~~ 미사용):

| 상태 | 관리 방식 |
|------|----------|
| 연도/월/수출수입 | URL searchParams + useState |
| 탭 (국가별/품목별) | URL `?tab=` |
| 서브탭 | useState + URL `?tab=timeseries\|countries` |
| MTI 단위 | URL `?mtiDepth=` + useState |
| 챗봇 열기/닫기 | useState (PersistentChatBot) |
| 로딩 상태 | useState(loadingCount) 카운터 |
| 채팅 기록 | useState 배열 + Supabase 저장 + **v4.0: sessionStorage 50개 유지** |
| **v4.0: 최신 YYMM** | 10분 TTL 모듈 레벨 캐시 (`getLatestYYMM`) |
| **v4.0: 집계 데이터** | 5분 TTL 모듈 레벨 캐시 (`lib/dataSupabase.ts`) |
| **v4.0: 월별 지도 RPC** | 무제한 캐시 + in-flight Promise 공유 |

> 페이지 간 전역 상태 동기화 없음 — 각 페이지가 독립적으로 URL 파라미터 읽기

---

## 14. v3.0 변경 이력 (초안 대비 실제 구현)

| 항목 | 초안 (v2.0) | 실제 구현 (v3.0) |
|------|-------------|-----------------|
| 지도 라이브러리 | Leaflet.js | MapLibre GL + react-map-gl |
| 차트 라이브러리 | D3.js + recharts 혼용 | Recharts 단일 |
| 상태 관리 | Zustand 전역 스토어 | URL params + useState |
| LLM 모델 | 미확정 (Claude vs OpenAI) | Claude Haiku 4.5 확정 |
| MTI 단위 | 3단위 (소분류) 기준 | **6단위 기준 + 1~6단위 선택 가능** |
| 거시경제 | 미확정 (ECOS/KOSIS/FRED) | /api/macro (8개 지표 구현) |
| 레이아웃 | Split Panel 75:25 | Sticky 사이드바 (접기/펼치기) |
| 트리맵 줌 | 대분류 줌인/줌아웃 토글 | 클릭 시 상세페이지 직접 이동 |
| 품목 상세 탭 | 3개 (상세품목/추이/상위국) | **2개 (금액 추이/상위 국가)** |
| 금액조회 필터 | 해당월/누적/연간 | 미구현 |
| 대륙별 필터 | 대륙 드롭다운 | 미구현 |
| 인증 | 없음 | Supabase Auth (로그인/회원가입) |
| 대시보드 색상 | 블루 계열 (#042C53~) | **틸(Teal) 계열** (#054744~) |
| 챗봇 네비게이션 | 없음 | 자동 라우트 버튼 생성 |
| 불완전 연도 | 레이블만 표시 | **Supabase 월 범위 조회 + 자동 감지** |
| 데이터 레이어 | Supabase 실시간 쿼리 | **이중 구조** (정적 연간 + 동적 월별) |
| 데이터 범위 | 2023~2026 | **2020~2026** |

---

## 14-B. v4.0 변경 이력 (v3.0 대비 실제 구현)

| 항목 | v3.0 | v4.0 (현재) |
|------|------|------------|
| 지도 색상 체계 | 단일 틸(Teal) 그라데이션 (#054744~#DCF3EF) | **수출=블루 (#002B5C~#DCE8F0) / 수입=코럴 (#B02020~#FAE8E4) 2색 분화** |
| 지도 TOP5 라벨 | 없음 | **흰 글씨 + 검정 halo(`textShadow 3-layer`) + Noto Sans KR 12px 700 마커** |
| 지도 툴팁 | 국가명 + 금액 + 순위 | 국가명·금액·순위(X/Y위)·점유율·**전년(동기) 대비**·TOP1 품목 |
| 정적 데이터 번들 | `tradeData.generated.ts` (~394K LOC) 포함 | **Supabase `agg_*` 집계 테이블로 이전**, 번들은 KPI+MTI_LOOKUP만 (~50KB) |
| 월별 RPC 성능 | 기본 호출 | 인-메모리 캐시 + in-flight Promise 공유로 중복 요청 방지 |
| 부분 집계 연도 처리 | 레이블만 표시 | **`getLatestYYMM`+`getIncompleteMonthRange` 공용 판정 + "ⓘ 부분 데이터(1~N월)" 배지 전역 노출** |
| 부분 집계 연도 LLM | 경고 문구만 | **`getProductSamePeriodYoY`로 "유효 비교(전년 동기 누적)" 사전 계산 주입 + 월평균 환산 금지 규칙** |
| KPI 비교 모드 | 전년 대비 고정 | **월 선택=전년 동기 대비 / 부분 연도 월 미선택=전월 대비 N월 / 완전 연도=전년 대비 3모드 자동** |
| 1월 MoM 계산 | `-` 표시 버그 | **`prevYearLastMonth` prop으로 전년 12월 값 비교** |
| 챗봇 지속성 | 새로고침 시 초기화 | **sessionStorage 50개 메시지 유지** (userId별 키 분리) |
| 품목 인식 | 규칙 기반 정확 매칭만 | **+LLM 의미 매핑** (prompt caching, "제약→의약품" 등) |
| 챗봇 라우트 버튼 | 규칙 기반만 | **+`/api/route-buttons` LLM 4단계 우선순위 파이프라인** |
| 환영/FAQ | 정적 인사말·기본 4개 | **Haiku `/api/welcome`·`/api/faq`로 개인화** |
| 시스템 프롬프트 | 단순 가이드 | **시점·커버리지·추세·헤드라인·화면범위 5대 규칙 블록 + 현재 질문 집중 규칙** |
| 툴팁 시스템 | 기본 Recharts 툴팁 | **6종 커스텀 툴팁 (Timeseries/ProductTrend/TopCountries/Treemap Cell·Category + 공통 셸), 포털 렌더링, 월별/연간 라벨 자동 전환** |
| MTI 드롭다운 | 네이티브 `<select>` | **커스텀 TierDropdown** (체크 아이콘 + 포털 없는 팝오버) |
| 국가 드롭다운 라벨 | "전체" | "**전체 보기**" |
| 국가 상세 좌측 카드 | 지역·국가명·순위·비중 | **+ 국기 이모지, X/Y위 분모, YoY 순위 변동** |
| 국가 드롭다운 키워드 감지 | 없음 | **2026년 3~12월 선택 시 토스트 차단** |
| 트리맵 카테고리 필터 | 미구현 | **상단 CategoryChipButton 10개 (아이콘 + 명칭 + Category 툴팁)** |
| 트리맵 셀 툴팁 | 품목명 + 금액 | **품목명·카테고리·MTI·금액·점유율·전년(동기) 대비** |
| 홈(`/`) URL 동기화 | 탭만 | **모든 필터 상태가 URL searchParams에 동기화** (챗봇 pageContext 추출용) |
| 보고서 | 없음 | **`/api/report` Haiku HTML + `/api/send-email` Resend + html2pdf.js PDF** |
| 국가명↔ISO 매핑 | WorldMap 내장 | **`lib/countryIso.ts` 공용 모듈로 분리** (244개 한국어 → ISO alpha-2) |
| 불완전 연도 훅 | inline state | **`lib/useIncompleteMonthRange.ts` 공용 훅** (`useIncompleteMonthRange` / `useOngoingYearInfo`) |
| 마크다운 Strikethrough | 기본 GFM | **`singleTilde:false`** 로 `2020년~2025년` 범위 표현 보호 |
| 빌드 에러 (useSearchParams) | 빌드 실패 | **`<Suspense fallback={null}>` 래핑으로 해결** |
| 새 lib 모듈 | — | `countryIso.ts`, `productResolver.ts`, `useIncompleteMonthRange.ts`, `dataSupabase.ts`, `staticData.ts` |
| 새 API 라우트 | chat / macro / welcome | **+ route-buttons / faq / report / send-email** |

---

## 15. 미해결 / 향후 과제

| 항목 | 상태 | 비고 |
|------|------|------|
| 금액조회 필터 (해당월/누적/연간) | 미구현 | 우선순위 낮음 |
| 대륙별 국가 드롭다운 필터 | 미구현 | |
| 트리맵 줌인/줌아웃 | 미구현 | 상세페이지 이동으로 대체 |
| 대분류 아이콘 필터 | **v4.0: CategoryChipButton으로 구현** | 상단 칩 방식 |
| CSV/Excel 데이터 다운로드 | 미구현 | **v4.0: PDF는 html2pdf.js로 지원** |
| 정적 데이터 자동 갱신 파이프라인 | 미구현 | 현재 수동 스크립트 (`scripts/seed-supabase.js`) |
| E2E 테스트 (Playwright/Cypress) | 미구현 | |
| 커스텀 도메인 | 미설정 | |
| 태블릿/모바일 전용 레이아웃 | 부분 대응 | P2 |
