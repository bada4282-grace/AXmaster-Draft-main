# K-stat 무역통계 대시보드 — 작업 가이드

> 이 파일은 세션 시작 시 자동으로 컨텍스트에 로드됩니다. Claude는 이 내용을 기준으로 작업합니다.
> 기준 문서: `PRD.md` (v4.0) / `PLAN.md` (v4.0 반영)

---

## 1. 프로젝트 개요

- **서비스**: K-stat 무역통계 대시보드 — 한국무역협회 K-stat을 대체하는 AI 연동 무역통계 시각화 웹앱
- **배포**: Vercel (Next.js 16 App Router)
- **데이터 범위**: 2020.01 ~ 2026.02 (한국 기준 대세계 수출입)

### 브랜치 전략

| 브랜치 | 역할 |
|--------|------|
| `main` | 프로덕션 배포 브랜치 |
| `Draft` | 통합·스테이징 브랜치 (기여자 브랜치가 여기로 먼저 병합된 뒤 `main`으로 승격) |
| `Chatbot-*`, `Dashboard-*` | 기여자별 기능 개발 브랜치 (예: `Chatbot-Nina`, `Chatbot-Sowon`, `Dashboard-John`, `Dashboard-Sol`) |

- 각 기여자는 자신의 네이밍 규칙(`<영역>-<이름>`) 브랜치에서 작업한다.
- `main`으로 직접 푸시하지 않는다 — 반드시 `Draft` 경유.
- 같은 영역(챗봇/대시보드) 내에서 변경이 겹칠 수 있으므로, 병합 전 `Draft`와 rebase/merge로 동기화한다.

---

## 2. 기술 스택 (핵심)

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16.2.3 (App Router), React 19, TypeScript 5, Turbopack |
| DB | Supabase (PostgreSQL) — `agg_*` 집계 테이블 + `trade_mti6` 월별 원데이터 + RPC 3종 |
| LLM | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), Anthropic SDK 0.88.0 |
| 지도 | MapLibre GL + react-map-gl + world-atlas TopoJSON |
| 차트 | Recharts 3.8.1 (Treemap / LineChart / BarChart) |
| 인증 | Supabase Auth (username → `username@kstat.local` 변환) |
| 이메일·PDF | Resend 6 (`/api/send-email`) + html2pdf.js 0.14 |
| 폰트 | **Noto Sans KR 전역 통일** (이메일 템플릿만 Malgun Gothic fallback) |

---

## 3. 작업 방식 (사용자와의 협업 규칙)

### 3-1. 문서 업데이트는 **전면 교체 금지 · 추가형**

`PRD-v2.md`, `PLAN-v2.md` 같은 기존 문서를 업데이트할 때는:

- **원본 섹션 구조·표·체크리스트를 그대로 유지**한다.
- 변경된 부분만 **`[v4.0]` 같은 태그로 병기**하거나, 해당 표/리스트 내에 행을 추가한다.
- 구버전 색상·수치·결정사항은 **`v3.0 (deprecated)`** 형태로 남겨 히스토리를 보존한다.
- 완전히 새로운 내용은 **신규 섹션**(예: `## 14-B`, `## Phase 13`)으로 추가한다.
- `git diff --stat`으로 insertion/deletion 비율을 확인 — deletion이 insertion에 근접하면 잘못 쓰고 있다는 신호.

> **과거 실수 사례**: PRD를 361 insertions / 260 deletions로 전면 재작성 → 사용자가 "내용을 아예 바꿔버리면 안됩니다"라고 지적. 되돌린 뒤 279/86으로 재작업.

### 3-2. 응답 톤 · 길이

- **한국어로 답변**. 사용자는 한국어로 작업을 지시한다.
- 툴 호출 사이의 설명은 **짧고 구체적으로** (한 문장).
- 최종 응답은 **100자 이내가 기본**. 감사 인사·추가 제안은 생략.
- 수정 내역 요약은 **bullet 3~5개 이내**, 과장·장황 금지.

### 3-3. UI 변경은 브라우저 검증 필요

- Turbopack 개발 서버(`npm run dev`)를 띄우고 **실제 브라우저에서 확인**한 뒤에만 "완료" 보고.
- 타입체크·ESLint 통과 ≠ 기능 정상. 골든 경로와 엣지 케이스 모두 확인.
- 브라우저 확인이 불가능한 환경이면 **"UI 검증 미수행" 명시**하고 사용자에게 확인 요청.

### 3-4. 반복 피드백은 메모리에 남기지 않고 코드에 반영

- 색상·폰트·halo 두께 같은 세부 UX는 여러 라운드 수정이 흔함.
- 매 라운드마다 이전 라운드 결정을 존중하고, 사용자가 요청한 변경 **그 부분만** 수정.
- "방금 수정을 undo" 요청이 잦음 → `git diff`로 현재 상태 확인 후 정확히 되돌리기.

---

## 4. 핵심 컨벤션 (절대 변경 금지)

### 4-1. 한국 금융 색상 관례

- **상승 / 양수 / 흑자 = 빨간색 `#E02020` ▲**
- **하락 / 음수 / 적자 = 파란색 `#185FA5` ▼**
- **변동 없음 / 중립 = 회색 `#999` 또는 `-`**

> 서구권 관례(상승=녹색)와 반대다. 절대 뒤집지 말 것.

### 4-2. 월별/연간 라벨 구분

- **월 선택 조회 시** → `"전년 동기 대비"` (+ `· N월` 옵션)
- **연도 전체 조회 시** → `"전년 대비"`
- 이 구분은 KPIBar, 지도 툴팁, 트리맵 툴팁, ProductTrend/TopCountries 툴팁 **모든 곳에 일관 적용**.

### 4-3. 부분 집계 연도 배지 & LLM 주입

- 2026년 같은 미완성 연도는 **"ⓘ 부분 데이터(1~N월)"** 배지 표시 (노랑 배경 `#FEF3C7`, 갈색 텍스트 `#92400E`).
- LLM 컨텍스트에는 `getYearCoverageNote()` + `getProductSamePeriodYoY()`로 **"유효 비교(전년 동기 누적)"** 라인 자동 주입.
- **절대 금지**: LLM이 부분 집계 수치를 연간 수치와 단순 비교하거나 월평균 환산하는 것.

### 4-4. 지도 색상 — 수출 블루 / 수입 코럴

```
수출: #002B5C(1-3위) → #0A3D6B → #1A6FA0 → #6A9EC0 → #B0D0E8 → #DCE8F0
수입: #B02020(1-3위) → #D04545 → #E07060 → #ECA090 → #F4C8BC → #FAE8E4
```

> 이전 v3.0 단일 틸(Teal) 그라데이션에서 v4.0에 교체됨. 복구 지시가 없는 한 유지.

### 4-5. 한국어 범위 표현과 Strikethrough

- react-markdown의 `remarkGfm`은 `{ singleTilde: false }` 로 사용.
- 이유: `"2020년~2025년"`, `"1~12월"` 같은 한국어 범위 표현이 strikethrough로 잘못 파싱됨.

### 4-6. MTI_LOOKUP 런타임 교정

- Supabase agg_treemap 이름이 CSV 시드 파싱 버그로 `"불꽃점화식 1"` 처럼 잘려 저장된 케이스 있음.
- `toProductNode` / `mapToProductNode`에서 `MTI_LOOKUP[code]` 로 런타임 교정하는 로직 **유지 필수**.

### 4-7. useSearchParams는 Suspense 필요

- `useSearchParams()` 쓰는 클라이언트 컴포넌트는 **`<Suspense fallback={...}>` 로 감싸야** Next.js 정적 프리렌더 빌드 통과.
- `PersistentChatBot`, 각 페이지의 `*Content` 컴포넌트가 이 패턴을 따름.

### 4-8. 챗봇 sessionStorage 키

- 키 prefix: `kstat_chat_messages_<userId>` 또는 `kstat_chat_messages_guest`
- 최대 50개 메시지 유지
- 로그인↔게스트 전환 시 키 분리로 혼선 방지
- 복원 race 방지: `authChecked` + `sessionInitializedRef` + `hasRestoredRef`

---

## 5. 폴더 구조 (핵심)

```
/app
  /api
    /chat          → Haiku 스트리밍 (시스템 프롬프트 5대 규칙 블록)
    /route-buttons → Haiku 4단계 우선순위 라우트 버튼
    /welcome       → Haiku 맞춤 환영 메시지 (2문장)
    /faq           → Haiku 추천 질문 3개
    /macro         → Supabase macro_indicators + Exchange Rate API
    /report        → Haiku 보고서 HTML (KITA 브랜드)
    /send-email    → Resend 이메일 발송
/components
  ChatBot.tsx / PersistentChatBot.tsx / FilterBar.tsx / KPIBar.tsx
  WorldMap.tsx / TreemapChart.tsx / MacroSection.tsx / RechartsTooltip.tsx
/lib
  data.ts / staticData.ts              → 경량 KPI + MTI 룩업
  dataSupabase.ts                      → agg_* 테이블 조회 (5분 캐시)
  supabase.ts                          → 클라이언트 + RPC + getLatestYYMM
  chatContext.ts                       → buildChatContext + resolveRouteButtons
  productResolver.ts                   → LLM 기반 MTI 품목 의미 매퍼
  countryIso.ts                        → 244개 한국어 ↔ ISO alpha-2
  useIncompleteMonthRange.ts           → 부분 집계 연도 훅
  chat.ts / auth.ts / supabaseServer.ts
```

---

## 6. 자주 틀리는 부분 (Gotcha)

| 증상 | 원인 | 해결 |
|------|------|------|
| 1월 MoM이 `-`로 표시 | TimeseriesTooltip이 전월(=전년 12월)을 모름 | `prevYearLastMonth` prop 전달 |
| 2026년 3~12월 선택해도 반응 없음 | 데이터 없는 기간 차단 | FilterBar의 noDataToast 로직 유지 |
| 품목 "제약"이 인식 안됨 | 규칙 매칭 실패 | `productResolver.ts`의 LLM 폴백 (prompt caching) |
| `?tradeType=` vs `?mode=` 혼용 | URL 파라미터 이중 규약 | FilterBar는 둘 다 읽되 쓰기는 `tradeType` 우선 |
| 트리맵 셀 이름이 `"불꽃점화식 1"` | CSV 시드 파싱 버그 | `MTI_LOOKUP` 런타임 교정 |
| TOP5 라벨 halo 흐림 | textShadow 단일 레이어 | 3-layer `rgba(0,0,0,1)` blur 4/4/8 중첩 |

---

## 7. 의존성 · 빌드 · 개발 환경

- `npm install` / `npm run dev` (Turbopack) / `npm run build`
- **Shell**: Windows 11 + bash (Unix 구문 사용 — 포워드 슬래시, `/dev/null` 등)
- **필수 env** (`.env.local`):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `ANTHROPIC_API_KEY` (선택: `ANTHROPIC_MODEL`)
  - `EXCHANGE_RATE_API_KEY`
  - `RESEND_API_KEY`
  - `NEXT_PUBLIC_SITE_URL` (보고서 로고 절대 URL용)
- **Supabase 시드**: `scripts/seed-supabase.js` (수동 실행)
- **집계 테이블 DDL**: `scripts/create-agg-tables.sql`

---

## 8. Git & PR 관례

- 커밋 메시지는 **한국어**, 접두사 없음. 예: `"지도 TOP5 라벨 halo 굵기 유지 + 색상 rgba(0,0,0,1)로 강화"`
- 커밋 전 사용자 **명시적 승인** 필수 (사용자가 "커밋해줘" 라고 하기 전까지 커밋 금지).
- force push · `git reset --hard` · `--no-verify` 는 **사용자 명시 요청 시에만**.
- PR은 사용자가 별도 요청할 때만 생성 (기본은 브랜치 푸시만).
- 기여자 브랜치(`<영역>-<이름>`)에서 `Draft`로 PR → 검토 후 `Draft`에서 `main`으로 승격.
- 다른 기여자 브랜치를 함부로 건드리지 않는다.

## 8-B. CLAUDE.md 파일 관리

| 파일 | git 관리 | 용도 |
|------|---------|------|
| `CLAUDE.md` | **커밋됨** (모든 팀원 공유) | 팀 공용 규칙·컨벤션·프로젝트 컨텍스트 |
| `CLAUDE.local.md` | **`.gitignore`에 포함** | 개인별 메모·로컬 오버라이드 (예: 내 로컬 포트, 개인 FAQ) |
| `~/.claude/CLAUDE.md` | (리포 밖, 사용자 홈) | 모든 프로젝트 공통 개인 설정 |

- 팀 공용 변경은 `CLAUDE.md`에 커밋하고, 개인 취향·로컬 설정은 `CLAUDE.local.md`에 둔다.
- `CLAUDE.md`에 특정 개인의 브랜치명·로컬 경로·개인 워크플로를 직접 박아넣지 않는다.

---

## 9. 참조 문서

- **PRD.md** (v4.0) — 기능 명세, 데이터 레이어, UI 컴포넌트, 색상 체계, 챗봇 시스템, 변경 이력
- **PLAN.md** (v4.0) — Phase 0~15 진행 상태, Track별 체크리스트, 검증 시나리오, 용어 정리
- 두 문서 업데이트 시 §3-1 "추가형" 규칙 엄수.
- ~~과거 `PRD-v2.md` / `PLAN-v2.md` 파일명은 더 이상 사용하지 않는다.~~ 현재 저장소 표준은 `PRD.md` / `PLAN.md`.
