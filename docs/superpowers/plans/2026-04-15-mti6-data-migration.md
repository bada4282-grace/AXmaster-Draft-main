# MTI 6단위 데이터 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MTI 3단위 무역데이터를 MTI 6단위로 전환하고, MTI 코드 룩업 테이블을 추가하여 대시보드와 챗봇이 세분화된 품목 데이터를 사용하도록 한다.

**Architecture:** 정적 파이프라인(`generate-data.js` → `tradeData.generated.ts`)을 새 CSV 포맷에 맞게 수정하고, Supabase에 `mti_lookup` 테이블과 갱신된 무역 데이터를 업로드한다. 프론트엔드 코드(`lib/data.ts`, `lib/chatContext.ts`)는 생성된 데이터 구조가 동일하므로 최소한의 수정만 필요.

**Tech Stack:** Node.js (generate-data.js), Supabase (PostgreSQL), Next.js, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `scripts/generate-data.js` | CSV 경로, MTI 룩업 로드, 컬럼 인덱스 조정, YEARS 확장 |
| Regenerate | `lib/tradeData.generated.ts` | 자동 생성 — 직접 수정 금지 |
| Modify | `lib/data.ts` | `DEFAULT_YEAR` 유지, 반도체 코드 상수 업데이트 (831→831110 등) |
| Modify | `lib/chatContext.ts` | 품목 룩업이 generated 데이터 기반이므로 자동 반영, 확인만 |
| Create | `scripts/upload-supabase.sql` | Supabase에 실행할 DDL/DML (mti_lookup 테이블, trade_mti6 테이블, RPC 함수) |

---

### Task 1: `generate-data.js` — MTI 룩업 로드 및 CSV 경로 변경

**Files:**
- Modify: `scripts/generate-data.js:1-15` (상수 및 경로)
- Modify: `scripts/generate-data.js:52-94` (파싱 루프)

- [ ] **Step 1: CSV 경로 변경 및 MTI 룩업 로드 추가**

`scripts/generate-data.js` 파일 상단을 수정한다:

```js
// 기존
const CSV_PATH = path.join(__dirname, '..', 'trade_by_country_mti3.csv');

// 변경
const CSV_PATH = path.join(__dirname, '..', 'tradedata_ctr_mti6.csv');
const MTI_CSV_PATH = path.join(__dirname, '..', 'MTI-data.csv');
```

YEARS 배열을 확장한다:

```js
// 기존
const YEARS = ['2023', '2024', '2025', '2026'];

// 변경
const YEARS = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];
```

TOP_N_PRODUCTS를 30으로 변경한다:

```js
// 기존
const TOP_N_PRODUCTS = 28;

// 변경
const TOP_N_PRODUCTS = 30;
```

MTI 룩업 로드 코드를 CSV 파싱 앞에 추가한다:

```js
// ─── MTI 코드 → 이름 룩업 ────────────────────────────────────────────────
console.log('MTI 룩업 로딩 중...');
const mtiLookup = {};
const mtiRaw = fs.readFileSync(MTI_CSV_PATH, 'utf8').split('\n');
for (let i = 1; i < mtiRaw.length; i++) {
  const line = mtiRaw[i].trim();
  if (!line) continue;
  const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
  if (cols.length >= 2) {
    mtiLookup[cols[0]] = cols[1];
  }
}
console.log(`MTI 룩업 완료: ${Object.keys(mtiLookup).length}개 코드`);
```

- [ ] **Step 2: 파싱 루프 컬럼 인덱스 조정**

새 CSV에는 MTI_NAME 컬럼이 없다. 컬럼 구조:
- `cols[0]` = YYMM
- `cols[1]` = CTR_NAME
- `cols[2]` = MTI_CD
- `cols[3]` = EXP_AMT (기존에는 MTI_NAME이었음)
- `cols[4]` = EXP_WGT
- `cols[5]` = EXP_QTY
- `cols[6]` = IMP_AMT
- `cols[7]` = IMP_WGT
- `cols[8]` = IMP_QTY

파싱 루프를 수정한다:

```js
for (let i = 1; i < raw.length; i++) {
  const line = raw[i].trim();
  if (!line) continue;
  const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
  if (cols.length < 7) continue;   // 최소 7컬럼 (YYMM~IMP_AMT)

  const yymm = cols[0];
  const yr = yymm.slice(0, 4);
  if (!YEARS.includes(yr)) continue;

  const mm = yymm.slice(4, 6);
  const ctr = normCtr(cols[1]);
  const mtiCd = cols[2];
  const mti1 = mtiCd ? mtiCd.slice(0, 1) : '';
  const exp = parseFloat(cols[3]) || 0;  // EXP_AMT (기존 cols[4])
  const imp = parseFloat(cols[6]) || 0;  // IMP_AMT (기존 cols[7])

  // MTI_NAME은 mtiLookup에서 조회
  const mtiName = mtiLookup[mtiCd] || mtiCd;

  if (!mtiCd || !/^\d/.test(mtiCd)) continue;

  // ... 이하 집계 로직은 기존과 동일 (mtiName 변수 참조 위치가 달라지지 않음)
```

- [ ] **Step 3: prodName 할당 수정**

기존 코드에서 `prodName[mtiCd]`에 CSV의 `mtiName`을 저장하던 부분:

```js
// 기존 (삭제 불필요, mtiName 변수가 이미 룩업 결과를 참조)
if (!prodName[mtiCd]) { prodName[mtiCd] = mtiName; prodMti1[mtiCd] = mti1; }
```

이 줄은 그대로 동작한다. `mtiName`이 이제 `mtiLookup[mtiCd]`에서 오므로 정확한 6단위 품목명이 들어간다.

- [ ] **Step 4: 생성 파일 주석 업데이트**

TS 파일 생성 부분의 주석을 수정한다:

```js
// 기존
// 원본: trade_by_country_mti3.csv

// 변경
// 원본: tradedata_ctr_mti6.csv + MTI-data.csv
```

- [ ] **Step 5: 스크립트 실행 및 결과 확인**

```bash
node scripts/generate-data.js
```

Expected: `완료! → lib/tradeData.generated.ts (XXXX KB)` 출력. 파일 크기가 기존(~1.4MB)보다 커질 수 있음 (7개 연도 + 6단위 품목).

생성된 파일의 첫 몇 줄을 확인하여 데이터가 올바른지 검증:

```bash
head -50 lib/tradeData.generated.ts
```

Expected: `KPI_BY_YEAR`에 2020~2026 데이터가 모두 포함.

- [ ] **Step 6: 빌드 확인**

```bash
npx next build
```

Expected: 빌드 성공. TypeScript 타입 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add scripts/generate-data.js lib/tradeData.generated.ts
git commit -m "feat: MTI 6단위 데이터로 generate-data.js 전환

- CSV 소스를 tradedata_ctr_mti6.csv로 변경
- MTI-data.csv 룩업으로 품목명 조회
- 연도 범위 2020~2026 확장, Top-N 30으로 변경"
```

---

### Task 2: `lib/data.ts` — 하드코딩 상수 업데이트

**Files:**
- Modify: `lib/data.ts:151-171` (반도체 코드 상수)

6단위 전환으로 반도체 코드가 `831` → 6단위 코드(예: `831110`)로 변경된다. `tradeData.generated.ts`를 확인하여 정확한 코드를 파악한 후 수정.

- [ ] **Step 1: 생성된 데이터에서 반도체 6단위 코드 확인**

```bash
grep -i "반도체" lib/tradeData.generated.ts | head -5
```

출력된 코드를 확인한다. (예: `831110` = 반도체)

- [ ] **Step 2: 하드코딩 상수 업데이트**

`lib/data.ts`의 하드코딩된 반도체 코드를 확인된 6단위 코드로 변경:

```ts
// 기존
export const SEMICONDUCTOR_TREND: YearlyTrend[] = getProductTrend("831", "수출");
export const TOP5_COUNTRIES_SEMICONDUCTOR: CountryValue[] =
  getProductTopCountries("831", DEFAULT_YEAR, "수출");

// 변경 (코드는 Step 1에서 확인한 값으로)
export const SEMICONDUCTOR_TREND: YearlyTrend[] = getProductTrend("831110", "수출");
export const TOP5_COUNTRIES_SEMICONDUCTOR: CountryValue[] =
  getProductTopCountries("831110", DEFAULT_YEAR, "수출");
```

> **주의:** 실제 코드는 `tradeData.generated.ts`에서 확인된 값을 사용할 것. 반도체가 여러 6단위 코드로 분리되었을 수 있음.

- [ ] **Step 3: 빌드 확인**

```bash
npx next build
```

Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add lib/data.ts
git commit -m "fix: 반도체 MTI 코드를 6단위로 업데이트"
```

---

### Task 3: `lib/chatContext.ts` — 품목 룩업 정상 작동 확인

**Files:**
- Modify: `lib/chatContext.ts` (필요시만)

`chatContext.ts`의 `buildProductLookup()`은 `TREEMAP_EXP_DATA_BY_YEAR`에서 동적으로 품목명→코드 맵을 구성한다. `tradeData.generated.ts`가 재생성되면 자동으로 6단위 품목이 반영된다.

- [ ] **Step 1: 룩업 동작 확인**

`lib/chatContext.ts`의 `buildProductLookup()` 함수는 generated 데이터를 순회하므로 코드 변경 불필요. 단, 6단위 품목명이 기존 3단위와 다를 수 있으므로 검증:

```bash
node -e "
const data = require('./lib/tradeData.generated');
const names = Object.values(data.TREEMAP_EXP_DATA_BY_YEAR['2026'] || {});
names.slice(0, 10).forEach(p => console.log(p.code, p.name));
"
```

Expected: 6단위 코드와 품목명이 출력됨.

- [ ] **Step 2: 커밋 (변경 있을 경우만)**

변경이 필요했다면:

```bash
git add lib/chatContext.ts
git commit -m "fix: chatContext 품목 룩업을 6단위 데이터에 맞게 조정"
```

---

### Task 4: Supabase — `mti_lookup` 테이블 생성

**Files:**
- Create: `scripts/upload-supabase.sql`

- [ ] **Step 1: SQL 스크립트 작성**

`scripts/upload-supabase.sql` 파일 생성:

```sql
-- ══════════════════════════════════════════════════════════════
-- 1. MTI 룩업 테이블
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS mti_lookup;
CREATE TABLE mti_lookup (
  mti_cd   TEXT PRIMARY KEY,
  mti_name TEXT NOT NULL
);

-- CSV 임포트 후 인덱스
CREATE INDEX idx_mti_lookup_cd_len ON mti_lookup (length(mti_cd));

-- ══════════════════════════════════════════════════════════════
-- 2. MTI 6단위 무역 데이터 테이블
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS trade_mti6;
CREATE TABLE trade_mti6 (
  id       BIGSERIAL PRIMARY KEY,
  yymm     TEXT NOT NULL,
  ctr_name TEXT NOT NULL,
  mti_cd   TEXT NOT NULL,
  exp_amt  NUMERIC DEFAULT 0,
  exp_wgt  NUMERIC DEFAULT 0,
  exp_qty  NUMERIC DEFAULT 0,
  imp_amt  NUMERIC DEFAULT 0,
  imp_wgt  NUMERIC DEFAULT 0,
  imp_qty  NUMERIC DEFAULT 0
);

-- 주요 인덱스
CREATE INDEX idx_trade_mti6_yymm ON trade_mti6 (yymm);
CREATE INDEX idx_trade_mti6_ctr ON trade_mti6 (ctr_name);
CREATE INDEX idx_trade_mti6_mti ON trade_mti6 (mti_cd);
CREATE INDEX idx_trade_mti6_yymm_mti ON trade_mti6 (yymm, mti_cd);

-- ══════════════════════════════════════════════════════════════
-- 3. RPC 함수: 품목별 집계 (MTI 깊이 지정 가능)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_treemap_mti6(
  p_yymm TEXT,
  p_mode TEXT DEFAULT 'export',
  p_mti_depth INT DEFAULT 6
)
RETURNS TABLE(mti_cd TEXT, mti_name TEXT, total_amt NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    LEFT(t.mti_cd, p_mti_depth) AS mti_cd,
    COALESCE(m.mti_name, LEFT(t.mti_cd, p_mti_depth)) AS mti_name,
    SUM(CASE WHEN p_mode = 'export' THEN t.exp_amt ELSE t.imp_amt END) AS total_amt
  FROM trade_mti6 t
  LEFT JOIN mti_lookup m ON m.mti_cd = LEFT(t.mti_cd, p_mti_depth)
  WHERE t.yymm = p_yymm
  GROUP BY LEFT(t.mti_cd, p_mti_depth), m.mti_name
  HAVING SUM(CASE WHEN p_mode = 'export' THEN t.exp_amt ELSE t.imp_amt END) > 0
  ORDER BY total_amt DESC;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 4. RPC 함수: 국가별 품목 집계 (MTI 깊이 지정 가능)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_country_treemap_mti6(
  p_yymm TEXT,
  p_ctr_name TEXT,
  p_mode TEXT DEFAULT 'export',
  p_mti_depth INT DEFAULT 6
)
RETURNS TABLE(mti_cd TEXT, mti_name TEXT, total_amt NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    LEFT(t.mti_cd, p_mti_depth) AS mti_cd,
    COALESCE(m.mti_name, LEFT(t.mti_cd, p_mti_depth)) AS mti_name,
    SUM(CASE WHEN p_mode = 'export' THEN t.exp_amt ELSE t.imp_amt END) AS total_amt
  FROM trade_mti6 t
  LEFT JOIN mti_lookup m ON m.mti_cd = LEFT(t.mti_cd, p_mti_depth)
  WHERE t.yymm = p_yymm AND t.ctr_name = p_ctr_name
  GROUP BY LEFT(t.mti_cd, p_mti_depth), m.mti_name
  HAVING SUM(CASE WHEN p_mode = 'export' THEN t.exp_amt ELSE t.imp_amt END) > 0
  ORDER BY total_amt DESC;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. RPC 함수: 국가 순위 (기존 호환)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_country_map_mti6(
  p_yymm TEXT,
  p_mode TEXT DEFAULT 'export'
)
RETURNS TABLE(ctr_name TEXT, rank BIGINT, total_amt NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.ctr_name,
    ROW_NUMBER() OVER (ORDER BY SUM(CASE WHEN p_mode = 'export' THEN t.exp_amt ELSE t.imp_amt END) DESC) AS rank,
    SUM(CASE WHEN p_mode = 'export' THEN t.exp_amt ELSE t.imp_amt END) AS total_amt
  FROM trade_mti6 t
  WHERE t.yymm = p_yymm
  GROUP BY t.ctr_name
  HAVING SUM(CASE WHEN p_mode = 'export' THEN t.exp_amt ELSE t.imp_amt END) > 0
  ORDER BY total_amt DESC;
END;
$$;
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/upload-supabase.sql
git commit -m "feat: Supabase DDL/RPC 스크립트 — mti_lookup, trade_mti6 테이블 및 MTI 깊이 지원 RPC"
```

---

### Task 5: Supabase — 데이터 업로드

이 작업은 Supabase 대시보드 또는 CLI에서 수행한다.

- [ ] **Step 1: SQL 실행 — 테이블 생성**

Supabase SQL Editor에서 `scripts/upload-supabase.sql`의 내용을 실행한다.

Expected: 테이블 2개(`mti_lookup`, `trade_mti6`)와 RPC 함수 3개가 생성됨.

- [ ] **Step 2: MTI-data.csv 업로드**

Supabase 대시보드 → Table Editor → `mti_lookup` → Import CSV:
- 파일: `MTI-data.csv`
- 컬럼 매핑: `MTI_CD` → `mti_cd`, `MTI_NAME` → `mti_name`

Expected: 2,457행 임포트.

- [ ] **Step 3: tradedata_ctr_mti6.csv 업로드**

CSV가 5M행(268MB)으로 대시보드 임포트 한계를 초과할 수 있다. 대안:

**방법 A — Supabase CLI (`supabase db` 사용):**
```bash
# psql 직접 연결
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -c "\COPY trade_mti6(yymm, ctr_name, mti_cd, exp_amt, exp_wgt, exp_qty, imp_amt, imp_wgt, imp_qty) FROM 'tradedata_ctr_mti6.csv' WITH CSV HEADER"
```

**방법 B — 분할 업로드 스크립트:**
CSV를 50만 행씩 분할 후 순차 임포트.

Expected: ~5,017,618행 임포트.

- [ ] **Step 4: 데이터 검증**

Supabase SQL Editor에서:

```sql
SELECT COUNT(*) FROM trade_mti6;
-- Expected: ~5,017,618

SELECT COUNT(*) FROM mti_lookup;
-- Expected: 2,457

-- RPC 테스트
SELECT * FROM get_treemap_mti6('202602', 'export', 6) LIMIT 10;
SELECT * FROM get_treemap_mti6('202602', 'export', 3) LIMIT 10;
-- Expected: 6단위와 3단위 각각 다른 집계 결과
```

---

### Task 6: `lib/supabaseServer.ts` — 새 RPC 함수 연동

**Files:**
- Modify: `lib/supabaseServer.ts`

기존 RPC 함수(`get_treemap_monthly`, `get_country_treemap_monthly`, `get_country_map_monthly`)를 새 함수로 교체하거나 병행한다.

- [ ] **Step 1: fetchAllProducts 수정**

```ts
export async function fetchAllProducts({
  year,
  mode = "export",
  limit = 15,
  mtiDepth = 6,
}: {
  year?: string;
  mode?: "export" | "import";
  limit?: number;
  mtiDepth?: number;
}): Promise<TradeProductRow[]> {
  const sb = getServerClient();

  const yymmList: string[] = [];
  if (year && year.length === 4) {
    for (let m = 12; m >= 1; m--) {
      yymmList.push(`${year}${String(m).padStart(2, "0")}`);
    }
  } else {
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      yymmList.push(
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }
  }

  for (const yymm of yymmList) {
    const { data, error } = await sb.rpc("get_treemap_mti6", {
      p_yymm: yymm,
      p_mode: mode,
      p_mti_depth: mtiDepth,
    });
    if (error) {
      console.error(`[fetchAllProducts] RPC error yymm=${yymm}:`, error.message);
      continue;
    }
    const rows = (data ?? []) as RpcTreemapRow[];
    const nonZero = rows.filter((r) => (r.total_amt ?? 0) > 0);
    if (nonZero.length === 0) continue;

    return nonZero
      .sort((a, b) => (b.total_amt ?? 0) - (a.total_amt ?? 0))
      .slice(0, limit)
      .map((r) => ({
        mti_name: r.mti_name ?? "",
        total_amt_usd: r.total_amt ?? 0,
        total_amt_100m: to100m(r.total_amt ?? 0),
      }));
  }

  return [];
}
```

- [ ] **Step 2: fetchCountryProducts 수정**

동일한 패턴으로 `get_country_treemap_mti6` RPC를 호출하도록 변경. `mtiDepth` 파라미터 추가.

```ts
export async function fetchCountryProducts({
  country,
  year,
  mode = "export",
  limit = 10,
  mtiDepth = 6,
}: {
  country: string;
  year?: string;
  mode?: "export" | "import";
  limit?: number;
  mtiDepth?: number;
}): Promise<TradeProductRow[]> {
  const sb = getServerClient();

  const yymmList: string[] = [];
  if (year && year.length === 4) {
    for (let m = 12; m >= 1; m--) {
      yymmList.push(`${year}${String(m).padStart(2, "0")}`);
    }
  } else {
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      yymmList.push(
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
      );
    }
  }

  for (const yymm of yymmList) {
    const { data, error } = await sb.rpc("get_country_treemap_mti6", {
      p_yymm: yymm,
      p_ctr_name: country,
      p_mode: mode,
      p_mti_depth: mtiDepth,
    });
    if (error) {
      console.error(`[fetchCountryProducts] RPC error yymm=${yymm}:`, error.message);
      continue;
    }
    const rows = (data ?? []) as RpcTreemapRow[];
    const nonZero = rows.filter((r) => (r.total_amt ?? 0) > 0);
    if (nonZero.length === 0) continue;

    return nonZero
      .sort((a, b) => (b.total_amt ?? 0) - (a.total_amt ?? 0))
      .slice(0, limit)
      .map((r) => ({
        mti_name: r.mti_name ?? "",
        total_amt_usd: r.total_amt ?? 0,
        total_amt_100m: to100m(r.total_amt ?? 0),
      }));
  }

  return [];
}
```

- [ ] **Step 3: fetchCountryRanking 수정**

```ts
// RPC 이름만 변경: get_country_map_monthly → get_country_map_mti6
const { data, error } = await sb.rpc("get_country_map_mti6", {
  p_yymm: yymm,
  p_mode: mode,
});
```

- [ ] **Step 4: 빌드 확인**

```bash
npx next build
```

Expected: 성공.

- [ ] **Step 5: 커밋**

```bash
git add lib/supabaseServer.ts
git commit -m "feat: supabaseServer를 새 MTI6 RPC 함수로 전환, mtiDepth 파라미터 추가"
```

---

### Task 7: 전체 통합 검증

- [ ] **Step 1: 개발 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 대시보드 확인**

브라우저에서 `localhost:3000`:
- 국가별 탭: 지도 + KPI 정상 표시
- 품목별 탭: 트리맵에 6단위 품목 Top 30 표시
- 국가 상세: 시계열 차트, 품목 트리맵 정상
- 품목 상세: 금액 추이, 상위 국가 정상

- [ ] **Step 3: 챗봇 검증**

챗봇에서 질문:
- "반도체 수출 현황 알려줘" → 6단위 품목명으로 응답
- "중국 수출 현황" → 국가 데이터 정상
- "2020년 수출 1위는?" → 2020년 데이터 응답 (확장된 연도 범위)

- [ ] **Step 4: 최종 커밋**

모든 검증 통과 후:

```bash
git add -A
git commit -m "feat: MTI 6단위 데이터 전환 완료 — 2020~2026, Top 30, Supabase RPC 연동"
```
