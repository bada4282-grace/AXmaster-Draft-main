# PLAN.md — 무역통계 대시보드 개발 계획

> 기준 문서: PRD-v3.0  
> 작성일: 2026-04-13  
> 최종 수정: 2026-04-17 (구현 완료 상태 반영)  
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
Phase 1: 데이터 레이어                      ✅ 완료
    ↓
Phase 2: 공통 컴포넌트                      ✅ 완료
    ↓
Phase 3: 상태 관리 (URL 파라미터 기반)       ✅ 완료
    ↓
Phase 4: P1 랜딩 — 국가별 탭 (지도)         ✅ 완료
  + Phase 5: P1 랜딩 — 품목별 탭 (트리맵)   ✅ 완료 (병렬)
    ↓
Phase 6: P2-A 국가별 상세페이지             ✅ 완료
    ↓
Phase 7: P2-B 품목별 상세페이지             ✅ 완료
    ↓
Phase 8: LLM 챗봇 연동                     ✅ 완료
    ↓
Phase 9: 거시경제 데이터 연동               ✅ 완료
    ↓
Phase 10: 인증 시스템                       ✅ 완료
    ↓
Phase 11: 반응형 UI                         ✅ 완료
    ↓
Phase 12: 통합 테스트 및 배포               🔲 미착수
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
    /chat          ← LLM 챗봇 API
    /macro         ← 거시경제 데이터 API
    /welcome       ← 환영 메시지 API
  /country/[name]  ← P2-A 국가별 상세
  /product/[name]  ← P2-B 품목별 상세
  /login           ← 로그인
  /signup          ← 회원가입
  page.tsx         ← 메인 대시보드
  layout.tsx       ← 공통 레이아웃
/components
  Header.tsx       ← 헤더 + GNB
  HeroBanner.tsx   ← 배너
  FilterBar.tsx    ← 필터 바
  KPIBar.tsx       ← KPI 카드 바
  WorldMap.tsx     ← 코로플레스 지도
  TreemapChart.tsx ← 트리맵
  MacroSection.tsx ← 거시경제 섹션
  ChatBot.tsx      ← 챗봇 UI
  PersistentChatBot.tsx ← 챗봇 사이드바 래퍼
  RechartsTooltip.tsx   ← 커스텀 툴팁
/lib
  data.ts          ← 정적 데이터 조회 함수
  tradeData.generated.ts ← 자동생성 정적 데이터 (~394K LOC)
  supabase.ts      ← Supabase 클라이언트 + RPC 호출
  supabaseServer.ts ← 서버사이드 유틸리티
  chat.ts          ← 챗봇 로그 CRUD
  chatContext.ts   ← 챗봇 컨텍스트 빌더 + 라우트 버튼
  auth.ts          ← 인증 함수
```

---

## Phase 1 — 데이터 레이어 ✅

> 목표: 이중 데이터 레이어 (정적 + 동적) 완성.

### Track A — 정적 데이터 (자동생성 파일)

- [x] `tradeData.generated.ts` 생성 (~394K LOC)
- [x] 연도별 KPI 집계 (`KPI_BY_YEAR`)
- [x] 연도×무역유형별 국가 데이터 (`COUNTRY_DATA`)
- [x] 연도×무역유형별 MTI 6단위 트리맵 데이터 (`TREEMAP_DATA`)
- [x] 연도×국가별 월별 시계열 (`TIMESERIES_BY_YEAR_COUNTRY`)
- [x] 품목별 연도 추이 (`PRODUCT_EXP/IMP_TREND_BY_CODE`)
- [x] 품목별 상위 교역국 (`PRODUCT_EXP/IMP_TOP_COUNTRIES_BY_CODE`)

### Track B — Supabase DB 세팅

- [x] `trade_mti6` 테이블 생성 (YYMM 기준 월별 데이터)
- [x] `chat_logs` 테이블 생성 (user_id, role, content, created_at)
- [x] RPC 함수 `get_treemap_mti6` 생성
- [x] RPC 함수 `get_country_map_mti6` 생성
- [x] RPC 함수 `get_country_treemap_mti6` 생성

### Track C — 데이터 조회 함수 (lib/data.ts)

- [x] `getCountryData(year, tradeType)` — 국가 목록 조회
- [x] `getCountryByName(name, year, tradeType)` — 단일 국가 조회
- [x] `getCountryByIso(iso, year, tradeType)` — ISO 코드 조회
- [x] `getMapColor(rank)` — 6단계 색상 매핑
- [x] `getTreemapData(year, tradeType)` — 트리맵 데이터
- [x] `aggregateTreemapByDepth(data, depth)` — MTI N단위 집계
- [x] `getCountryTimeseries(year, countryName)` — 월별 시계열
- [x] `getProductTrend(productCode, tradeType)` — 품목 연도 추이
- [x] `getAggregatedProductTrend(codePrefix, tradeType)` — 코드 프리픽스 합산 추이
- [x] `getProductTopCountries(code, year, tradeType)` — 품목별 상위국
- [x] `getAggregatedTopCountries(codePrefix, year, tradeType)` — 프리픽스 합산 상위국
- [x] `getCountryKpi(year, countryName)` — 국가별 KPI

### Track D — Supabase 조회 함수 (lib/supabase.ts)

- [x] `getMonthlyTreemapData(year, month, tradeType)` — 월별 트리맵 RPC
- [x] `getMonthlyCountryMapData(year, month, tradeType)` — 월별 지도 RPC (인-메모리 캐싱 + in-flight 중복 방지)
- [x] `getCountryMonthlyTreemapData(year, month, countryName, tradeType)` — 국가별 월별 트리맵 RPC
- [x] `getAvailableMonths(year)` — 연도별 데이터 존재 월 조회

### Track E — 국가명 매핑

- [x] ISO 코드 ↔ 한국어 국가명 매핑 (WorldMap.tsx 내 180개국+)
- [x] GeoJSON 영문명 ↔ CTR_NAME 한국어 매핑

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

### Track D — 챗봇 사이드바

- [x] PersistentChatBot — Sticky 사이드바 (접기/펼치기)
- [x] ChatBot — 메시지 UI, 스트리밍, 마크다운 렌더링
- [x] 접기/펼치기 시 window resize 이벤트 (Recharts 반응형)
- [x] /login, /signup 페이지에서 숨김
- [x] FAQ 제안 버튼
- [x] 글꼴 크기 조절
- [ ] ~~Split Panel 75:25 레이아웃~~ → Sticky 사이드바로 대체

### Track E — 커스텀 툴팁 (RechartsTooltip)

- [x] RechartsPayloadTooltip — 라인차트용
- [x] RechartsBarCountryTooltip — 바차트용
- [x] 불완전 연도 경고 표시 (`incompleteLabels` + `incompleteMonthRanges`)

---

## Phase 3 — 상태 관리 ✅

> 목표: URL 파라미터 + React useState로 필터 상태 관리.

- [x] URL searchParams 기반 상태 관리 (`useSearchParams` + `useRouter`)
- [x] 연도/월/수출수입 모드 URL 파라미터 동기화
- [x] 탭 상태 URL 파라미터 (`?tab=country` / `?tab=product`)
- [x] MTI 단위 URL 파라미터 (`?mtiDepth=N`)
- [x] 국가 상세: `?year=`, `?mode=`, `?tab=`, `?mtiDepth=`
- [x] 품목 상세: `?code=`, `?year=`, `?tab=`
- [ ] ~~Zustand 전역 스토어~~ — URL params + useState로 대체

---

## Phase 4 — P1 랜딩 (국가별 탭 — 지도) ✅

> 목표: 코로플레스 지도 완성.

### Track A — 지도 렌더링

- [x] MapLibre GL + react-map-gl 초기화 (~~Leaflet.js~~ 미사용)
- [x] Natural Earth TopoJSON 국가 경계 렌더링
- [x] ISO 코드 기반 180개국+ 매핑
- [x] TOP30 산출 → 6단계 틸(Teal) 색상 매핑

```typescript
// 실제 구현된 색상 (lib/data.ts - getMapColor)
rank 1~3:   "#054744"  // 가장 진한 틸
rank 4~9:   "#0A6E5C"
rank 10~15: "#1A9E7F"
rank 16~21: "#5DC4A0"
rank 22~30: "#A5DFC4"
rank 30+:   "#DCF3EF"  // 가장 밝은 틸
```

### Track B — 지도 인터랙션

- [x] 호버 툴팁 — 국가명 + 수출(수입)액 + 순위
- [x] TOP30 국가 클릭 → `/country/[name]` 이동
- [x] 월 선택 시 Supabase RPC로 해당 월 데이터 조회
- [x] 인-메모리 캐싱 + in-flight 중복 요청 방지

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
- [ ] ~~줌인/줌아웃 토글~~ — 미구현 (클릭 시 상세페이지 직접 이동으로 대체)
- [ ] ~~하단 대분류 아이콘 필터 10개~~ — 미구현 (MTI 단위 셀렉터로 대체)
- [ ] ~~TOP3 품목만 "상세 페이지 보기"~~ — 모든 품목 클릭 가능으로 변경

---

## Phase 6 — P2-A 국가별 상세페이지 ✅

> 목표: 국가별 트리맵(품목 탭) + 시계열 추이 탭 완성.

### Track A — 페이지 구조

- [x] URL 파라미터 파싱: `/country/[name]?year=YYYY&mode=import&tab=timeseries&mtiDepth=3`
- [x] 좌측 카드: 지역(대륙), 국가명, 순위, 비중 (수출/수입 모드 연동)
- [x] KPI 카드: 대[국가] 수출액 / 수입액 / 무역수지 (getCountryKpi)
- [x] "← 돌아가기" → 메인 대시보드
- [x] FilterBar (mode="country"): 연도, 월, 수출/수입, MTI 단위

### Track B — 서브탭 1: 품목별 트리맵

- [x] 해당 국가 품목 구성 Recharts Treemap
- [x] MTI 단위 선택 가능 (FilterBar 연동)
- [x] 월 선택 시 Supabase RPC 조회 (`get_country_treemap_mti6`)
- [x] 호버 툴팁 (품목명 + 금액)
- [x] 클릭 시 이동 없음

### Track C — 서브탭 2: 시계열 추이

- [x] Recharts LineChart — 월별 수출/수입/무역수지
- [x] 정적 데이터 기반 (`getCountryTimeseries`)
- [x] 연도 선택 가능

---

## Phase 7 — P2-B 품목별 상세페이지 ✅

> 목표: 품목별 금액 추이 + 상위 국가 탭 완성.

### Track A — 페이지 구조

- [x] URL 파라미터: `/product/[name]?code=XXX&year=YYYY&tab=countries`
- [x] 좌측 카드: 품목명, 연간 수출(수입)액, 전년 대비 증감률
- [x] KPI 카드: 전체 수출/수입/무역수지
- [x] "← 돌아가기" → 메인 대시보드
- [x] FilterBar (mode="product"): 연도, 수출/수입, 국가 (월 비활성화)

### Track B — 서브탭 1: 금액 추이

- [x] Recharts LineChart/BarChart — 연도별 금액 추이
- [x] 코드 프리픽스 기준 합산 (`getAggregatedProductTrend`)
- [x] 불완전 연도 자동 감지 (Supabase `getAvailableMonths`)
- [x] 불완전 연도 월 범위 표시 ("⚠ 불완전 연도(1~2월)")
- [x] 12개월 데이터 완전 시 경고 자동 제거

### Track C — 서브탭 2: 상위 국가

- [x] Recharts BarChart — 상위 10개국 바 차트
- [x] 코드 프리픽스 합산 (`getAggregatedTopCountries`)
- [x] 커스텀 툴팁 (RechartsBarCountryTooltip)

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

### Track B — 시스템 프롬프트 + 동적 컨텍스트

- [x] 고정 시스템 프롬프트 (도메인 지식 + 가드레일)
- [x] `buildChatContext(message)` — 메시지 분석 → 관련 데이터 자동 주입
  - 국가명 매칭 → KPI·순위 데이터
  - 품목명 매칭 → 추이·상위국 데이터
  - MTI 코드 검증 → 코드 기반 조회
  - 연도 추출 → 해당 연도 데이터
- [x] `==주제==` 하이라이트 포맷

### Track C — 네비게이션 버튼

- [x] `resolveRouteButtons(question)` — 자동 라우트 버튼 생성
- [x] 국가명 → `/country/[name]` 버튼
- [x] 품목명 → `/product/[name]` 버튼
- [x] 키워드 감지: 추이→timeseries탭, 상위국가→countries탭
- [x] MTI 단위 감지 → `?mtiDepth=N`
- [x] 연도 감지 → `?year=YYYY`

### Track D — 채팅 기록

- [x] `saveChatLog(role, content)` — Supabase 저장 (로그인 사용자)
- [x] `getChatLogs(limit=50)` — 기록 조회
- [x] `/api/welcome` — 이전 대화 기반 맞춤 환영 메시지

### Track E — 챗봇 UI

- [x] 마크다운 렌더링 (react-markdown + remark-gfm + rehype-raw)
- [x] 스트리밍 실시간 표시 (타이핑 인디케이터)
- [x] FAQ 제안 버튼
- [x] 글꼴 크기 조절
- [x] 접기/펼치기 토글

---

## Phase 9 — 거시경제 데이터 연동 ✅

> 목표: 거시경제 지표 대시보드 표시 + LLM 컨텍스트 주입.

- [x] `/api/macro` API 엔드포인트
- [x] MacroSection 컴포넌트 (8개 지표 카드)
- [x] 원/달러 환율 (Exchange Rate API 실시간)
- [x] 한국은행 기준금리
- [x] BSI (기업경기실사지수)
- [x] EBSI (수출기업경기실사지수)
- [x] 산업생산 전년비
- [x] 소비자물가 전년비
- [x] 브렌트유
- [x] SCFI (컨테이너운임지수)

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
- [x] 챗봇 사이드바 접기/펼치기 (280~360px)
- [x] 접기/펼치기 시 Recharts 차트 자동 리사이즈
- [x] globals.css 공통 스타일 (~2000줄)
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

---

## 미구현 항목 (향후 과제)

| 항목 | 초안 계획 | 현재 상태 | 우선순위 |
|------|----------|----------|---------|
| 금액조회 필터 (해당월/누적/연간) | Phase 2 | 미구현 | P3 |
| 대륙별 국가 드롭다운 | Phase 2 | 미구현 | P3 |
| 트리맵 줌인/줌아웃 토글 | Phase 5 | 상세페이지 이동으로 대체 | — |
| 대분류 아이콘 필터 10개 | Phase 5 | MTI 단위 셀렉터로 대체 | — |
| 품목 상세 3번째 탭 (상세품목별) | Phase 7 | 미구현 (2탭 구조) | P3 |
| 드릴다운 2단계 (대분류→중분류) | Phase 7 | 코드 프리픽스 합산으로 대체 | — |
| 브레드크럼 (전체 › 대분류) | Phase 7 | 미구현 | P3 |
| 태블릿 전용 레이아웃 | Phase 11 | 부분 대응 | P2 |
| 모바일 전용 레이아웃 | Phase 11 | 미구현 | P2 |
| E2E 테스트 | Phase 12 | 미착수 | P1 |
| CSV/Excel 다운로드 | 없음 | 미구현 | P3 |
| 정적 데이터 자동 갱신 파이프라인 | 없음 | 수동 빌드 | P2 |

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
| 정적 데이터 | tradeData.generated.ts에 빌드 시 포함된 연간 집계 데이터. DB 쿼리 불필요. |
| 동적 데이터 | Supabase RPC로 런타임에 조회하는 월별 데이터. |
| MTI N단위 | MTI 코드의 앞 N자리로 집계하는 품목 분류 깊이. 6단위가 가장 세분화. |
| 코드 프리픽스 | MTI 6자리 코드의 앞부분 (예: "83" → 전자·전기 중분류). 합산 조회에 사용. |
| 인-메모리 캐싱 | 동일 파라미터 RPC 재호출 방지를 위한 브라우저 메모리 캐시. |
| in-flight 중복 방지 | 같은 요청이 진행 중이면 새 요청을 보내지 않고 기존 Promise를 공유. |
| 불완전 연도 | 12개월 데이터가 모두 존재하지 않는 연도 (예: 2026년은 1~2월만 존재). |
| PersistentChatBot | 페이지 이동 시에도 유지되는 챗봇 사이드바 래퍼 컴포넌트. |
| 코로플레스 지도 | 지역별로 수치에 따라 색상 농도를 다르게 표시하는 지도. |
| FOB | Free On Board. 수출 금액 기준. 선적 시점까지의 비용만 포함. |
| CIF | Cost, Insurance and Freight. 수입 금액 기준. 보험료·운임 포함. |
