# 거시경제 지표 챗봇 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챗봇이 무역통계 질문에 답변할 때 거시경제 지표(금리, BSI, PMI, 유가, SCFI 등)를 맥락에 따라 참조하여 분석 수준을 조절하는 기능을 구현한다.

**Architecture:** `generate-data.js`가 `거시경제지표.xlsx`를 파싱하여 `MACRO_INDICATORS`와 `MACRO_META`를 `tradeData.generated.ts`에 추가한다. `chatContext.ts`에 `buildMacroContext()` 함수를 추가하여 질문 패턴에 따라 적절한 범위의 거시경제 지표를 컨텍스트에 주입한다. `chat/route.ts`의 시스템 프롬프트에 거시경제 해석 지시를 추가한다.

**Tech Stack:** Node.js (generate-data.js, xlsx 패키지), Supabase (PostgreSQL), Next.js, TypeScript, Anthropic Claude API

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `scripts/upload-macro.sql` | Supabase DDL 스크립트 |
| Modify | `scripts/generate-data.js:408-484` | 엑셀 파싱 → MACRO_INDICATORS + MACRO_META export 추가 |
| Regenerate | `lib/tradeData.generated.ts` | 자동 생성 — 직접 수정 금지 |
| Modify | `lib/chatContext.ts:1-196` | buildMacroContext() 추가, buildChatContext()에 통합 |
| Modify | `app/api/chat/route.ts:67-77` | 시스템 프롬프트에 거시경제 해석 지시 추가 |

---

### Task 1: Supabase DDL 스크립트 작성

**Files:**
- Create: `scripts/upload-macro.sql`

- [ ] **Step 1: SQL 스크립트 작성**

`scripts/upload-macro.sql` 파일 생성:

```sql
-- ══════════════════════════════════════════════════════════════
-- 거시경제 지표 테이블
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS macro_indicators;
CREATE TABLE macro_indicators (
  "YYMM"            TEXT PRIMARY KEY,
  "KR_BASE_RATE"    NUMERIC,
  "KR_BSI_MFG"      NUMERIC,
  "KR_BSI_NON_MFG"  NUMERIC,
  "KR_EBSI"         NUMERIC,
  "KR_PROD_YOY"     NUMERIC,
  "KR_CPI_YOY"      NUMERIC,
  "US_BASE_RATE"    NUMERIC,
  "US_PMI_MFG"      NUMERIC,
  "CN_BASE_RATE"    NUMERIC,
  "CN_PMI_MFG"      NUMERIC,
  "BRENT_OIL"       NUMERIC,
  "SCFI"            NUMERIC
);

CREATE INDEX idx_macro_yymm ON macro_indicators ("YYMM");
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/upload-macro.sql
git commit -m "feat: Supabase DDL — macro_indicators 테이블"
```

---

### Task 2: `generate-data.js` — 거시경제 엑셀 파싱 추가

**Files:**
- Modify: `scripts/generate-data.js:1-10` (xlsx require 추가)
- Modify: `scripts/generate-data.js:478-484` (TS 출력에 MACRO_INDICATORS + MACRO_META 추가)

- [ ] **Step 1: xlsx require 추가**

`scripts/generate-data.js` 파일 상단에 추가:

```js
const XLSX = require('xlsx');
const MACRO_XLSX_PATH = path.join(__dirname, '..', '거시경제지표.xlsx');
```

- [ ] **Step 2: 거시경제 데이터 파싱 코드 추가**

TS 파일 생성 직전(`console.log('TypeScript 파일 생성 중...');` 바로 위)에 추가:

```js
// ─── 거시경제 지표 파싱 ──────────────────────────────────────────────────
console.log('거시경제 지표 로드 중...');
const macroIndicators = {};
const macroMeta = [];
try {
  const wb = XLSX.readFile(MACRO_XLSX_PATH);

  // 메타데이터 시트
  const metaWs = wb.Sheets['메타데이터'];
  if (metaWs) {
    const metaRows = XLSX.utils.sheet_to_json(metaWs, { header: 1 });
    const META_KEYS = [
      'KR_BASE_RATE', 'KR_BSI_MFG', 'KR_BSI_NON_MFG', 'KR_EBSI',
      'KR_PROD_YOY', 'KR_CPI_YOY', 'US_BASE_RATE', 'US_PMI_MFG',
      'CN_BASE_RATE', 'CN_PMI_MFG', 'BRENT_OIL', 'SCFI',
    ];
    for (let i = 1; i < metaRows.length; i++) {
      const row = metaRows[i];
      if (row.length >= 3 && META_KEYS[i - 1]) {
        macroMeta.push({ key: META_KEYS[i - 1], label: String(row[0]).replace(/\r?\n/g, ' ').trim(), desc: String(row[2]).trim() });
      }
    }
  }

  // 데이터 시트
  const dataWs = wb.Sheets['데이터'];
  if (dataWs) {
    const dataRows = XLSX.utils.sheet_to_json(dataWs, { header: 1 });
    for (let i = 1; i < dataRows.length; i++) {
      const r = dataRows[i];
      if (!r[0]) continue;
      const yymm = String(r[0]);
      macroIndicators[yymm] = {
        KR_BASE_RATE: r[1] ?? null,
        KR_BSI_MFG: r[2] ?? null,
        KR_BSI_NON_MFG: r[3] ?? null,
        KR_EBSI: r[4] ?? null,
        KR_PROD_YOY: r[5] ?? null,
        KR_CPI_YOY: r[6] ?? null,
        US_BASE_RATE: r[7] ?? null,
        US_PMI_MFG: r[8] ?? null,
        CN_BASE_RATE: r[9] ?? null,
        CN_PMI_MFG: r[10] ?? null,
        BRENT_OIL: r[11] ?? null,
        SCFI: r[12] ?? null,
      };
    }
  }
  console.log(`거시경제 지표 ${Object.keys(macroIndicators).length}개월 로드 완료`);
} catch (e) {
  console.warn('거시경제 지표 파일 없음 또는 파싱 실패:', e.message);
}
```

- [ ] **Step 3: TS 출력에 MACRO_INDICATORS + MACRO_META 추가**

`generate-data.js`의 TS 템플릿 문자열 끝부분, `MTI_LOOKUP` 뒤에 추가:

```js
export const MACRO_INDICATORS: Record<string, {
  KR_BASE_RATE: number | null; KR_BSI_MFG: number | null; KR_BSI_NON_MFG: number | null;
  KR_EBSI: number | null; KR_PROD_YOY: number | null; KR_CPI_YOY: number | null;
  US_BASE_RATE: number | null; US_PMI_MFG: number | null;
  CN_BASE_RATE: number | null; CN_PMI_MFG: number | null;
  BRENT_OIL: number | null; SCFI: number | null;
}> = ${JSON.stringify(macroIndicators, null, 2)};

export const MACRO_META: { key: string; label: string; desc: string }[] = ${JSON.stringify(macroMeta, null, 2)};
```

- [ ] **Step 4: 스크립트 실행 및 결과 확인**

```bash
node scripts/generate-data.js
```

Expected: `거시경제 지표 62개월 로드 완료` 출력. `lib/tradeData.generated.ts`에 `MACRO_INDICATORS`와 `MACRO_META`가 포함됨.

검증:

```bash
grep "MACRO_INDICATORS" lib/tradeData.generated.ts | head -1
grep "MACRO_META" lib/tradeData.generated.ts | head -1
```

- [ ] **Step 5: 빌드 확인**

```bash
npx next build
```

Expected: 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add scripts/generate-data.js lib/tradeData.generated.ts
git commit -m "feat: generate-data.js에 거시경제 지표 파싱 추가 (MACRO_INDICATORS, MACRO_META)"
```

---

### Task 3: `lib/chatContext.ts` — 거시경제 컨텍스트 주입

**Files:**
- Modify: `lib/chatContext.ts:1-12` (import 추가)
- Modify: `lib/chatContext.ts:96-196` (buildMacroContext 추가 + buildChatContext 통합)

- [ ] **Step 1: import 추가**

`lib/chatContext.ts` 상단 import에 추가:

```ts
import {
  MACRO_INDICATORS,
  MACRO_META,
} from "@/lib/tradeData.generated";
```

- [ ] **Step 2: 분석 키워드 감지 함수 추가**

`detectTradeType` 함수 아래에 추가:

```ts
// 분석/원인 질문인지 감지
function isAnalysisQuery(question: string): boolean {
  const keywords = [
    "왜", "이유", "원인", "배경", "영향", "요인", "때문",
    "어떻게", "변화", "증가", "감소", "하락", "상승", "추이",
  ];
  return keywords.some(kw => question.includes(kw));
}

// 거시경제 지표 언급 감지
function detectMacroKeywords(question: string): string[] {
  const MACRO_KEYWORD_MAP: Record<string, string[]> = {
    KR_BASE_RATE: ["금리", "기준금리", "한국은행", "통화정책"],
    KR_BSI_MFG: ["BSI", "bsi", "기업경기", "제조업 경기", "경기실사"],
    KR_BSI_NON_MFG: ["비제조업", "서비스업 경기"],
    KR_EBSI: ["EBSI", "ebsi", "수출기업", "수출 경기"],
    KR_PROD_YOY: ["산업생산", "생산지수", "생산 증감"],
    KR_CPI_YOY: ["물가", "CPI", "cpi", "인플레이션", "소비자물가"],
    US_BASE_RATE: ["미국 금리", "연준", "Fed", "fed", "연방기금"],
    US_PMI_MFG: ["미국 PMI", "미국 제조업", "ISM"],
    CN_BASE_RATE: ["중국 금리", "인민은행", "LPR"],
    CN_PMI_MFG: ["중국 PMI", "중국 제조업"],
    BRENT_OIL: ["유가", "원유", "브렌트", "오일"],
    SCFI: ["SCFI", "scfi", "운임", "컨테이너", "해운", "물류비"],
  };
  const matched: string[] = [];
  for (const [key, keywords] of Object.entries(MACRO_KEYWORD_MAP)) {
    if (keywords.some(kw => question.includes(kw))) {
      matched.push(key);
    }
  }
  return matched;
}
```

- [ ] **Step 3: buildMacroContext 함수 작성**

`extractKeywords` 함수 아래, `buildChatContext` 함수 위에 추가:

```ts
// 거시경제 지표 컨텍스트 조립
function buildMacroContext(question: string, year: string): string {
  const indicators = MACRO_INDICATORS as Record<string, Record<string, number | null>>;
  if (!indicators || Object.keys(indicators).length === 0) return "";

  const macroKeys = detectMacroKeywords(question);
  const analysis = isAnalysisQuery(question);

  // 주입할 YYMM 범위 결정
  let targetYymms: string[];

  if (macroKeys.length > 0) {
    // 특정 지표 언급 시 전체 기간
    targetYymms = Object.keys(indicators).sort().reverse();
  } else if (analysis) {
    // 분석 질문 시 해당 연도 + 전년도
    const prevYear = String(parseInt(year) - 1);
    targetYymms = Object.keys(indicators)
      .filter(ym => ym.startsWith(year) || ym.startsWith(prevYear))
      .sort().reverse();
  } else {
    // 일반 질문 시 해당 연도
    targetYymms = Object.keys(indicators)
      .filter(ym => ym.startsWith(year))
      .sort().reverse();
  }

  if (targetYymms.length === 0) return "";

  // 테이블 형태로 포맷
  const fmtPct = (v: number | null) => v == null ? "-" : `${(v * 100).toFixed(1)}%`;
  const fmtNum = (v: number | null, d = 1) => v == null ? "-" : v.toFixed(d);

  const header = "기준년월 | 한국금리 | 제조업BSI | 비제조BSI | EBSI | 산업생산 | CPI | 미국금리 | 미국PMI | 중국금리 | 중국PMI | 브렌트유 | SCFI";
  const rows = targetYymms.map(ym => {
    const d = indicators[ym];
    return `${ym} | ${fmtPct(d.KR_BASE_RATE)} | ${fmtNum(d.KR_BSI_MFG, 0)} | ${fmtNum(d.KR_BSI_NON_MFG, 0)} | ${fmtNum(d.KR_EBSI, 1)} | ${fmtPct(d.KR_PROD_YOY)} | ${fmtPct(d.KR_CPI_YOY)} | ${fmtPct(d.US_BASE_RATE)} | ${fmtNum(d.US_PMI_MFG, 1)} | ${fmtPct(d.CN_BASE_RATE)} | ${fmtNum(d.CN_PMI_MFG, 1)} | $${fmtNum(d.BRENT_OIL, 1)} | ${fmtNum(d.SCFI, 0)}`;
  });

  const guide = `[지표 해석 가이드]
- BSI/EBSI: 100 이상이면 긍정적 전망, 미만이면 부정적
- PMI: 50 이상 경기 확장, 미만 위축
- 금리: 백분율 표시 (2.5% = 0.025)
- 산업생산/CPI: 전년 동기 대비 증감률`;

  // 메타데이터 요약 (특정 지표 언급 시만)
  let metaSection = "";
  if (macroKeys.length > 0) {
    const meta = (MACRO_META as { key: string; label: string; desc: string }[])
      .filter(m => macroKeys.includes(m.key));
    if (meta.length > 0) {
      metaSection = "\n\n[언급된 지표 설명]\n" + meta.map(m => `- ${m.label}: ${m.desc}`).join("\n");
    }
  }

  return `[거시경제 지표]\n${header}\n${rows.join("\n")}\n\n${guide}${metaSection}`;
}
```

- [ ] **Step 4: buildChatContext에 거시경제 컨텍스트 통합**

`buildChatContext` 함수의 `return sections.join(...)` 직전에 추가:

```ts
  // 거시경제 지표 컨텍스트
  const macroCtx = buildMacroContext(question, year);
  if (macroCtx) {
    sections.push(macroCtx);
  }
```

- [ ] **Step 5: 빌드 확인**

```bash
npx next build
```

Expected: 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add lib/chatContext.ts
git commit -m "feat: chatContext에 거시경제 지표 컨텍스트 주입 (buildMacroContext)"
```

---

### Task 4: `app/api/chat/route.ts` — 시스템 프롬프트 업데이트

**Files:**
- Modify: `app/api/chat/route.ts:67-77` (시스템 프롬프트)

- [ ] **Step 1: 시스템 프롬프트에 거시경제 해석 지시 추가**

`app/api/chat/route.ts`의 시스템 프롬프트에서, 기존 답변 규칙 마지막 항목 뒤에 추가:

```ts
- 거시경제 지표가 제공된 경우, 무역 데이터의 변동을 설명할 때 관련 지표와의 상관관계를 자연스럽게 언급하세요. 단, 모든 답변에 강제로 넣지 말고, 설명에 도움이 될 때만 활용하세요.
- 거시경제 지표와 무역 데이터의 관계를 설명할 때 인과관계를 단정짓지 말고 "~의 영향이 있을 수 있습니다", "~와 관련이 있는 것으로 보입니다" 같은 표현을 사용하세요.
```

- [ ] **Step 2: 빌드 확인**

```bash
npx next build
```

Expected: 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add app/api/chat/route.ts
git commit -m "feat: 챗봇 시스템 프롬프트에 거시경제 지표 해석 지시 추가"
```

---

### Task 5: Supabase 데이터 업로드 + 통합 검증

- [ ] **Step 1: 엑셀 → CSV 변환**

```bash
node -e "
const XLSX = require('xlsx');
const fs = require('fs');
const wb = XLSX.readFile('거시경제지표.xlsx');
const ws = wb.Sheets['데이터'];
const csv = XLSX.utils.sheet_to_csv(ws);
// 헤더를 대문자 컬럼명으로 교체
const lines = csv.split('\n');
lines[0] = 'YYMM,KR_BASE_RATE,KR_BSI_MFG,KR_BSI_NON_MFG,KR_EBSI,KR_PROD_YOY,KR_CPI_YOY,US_BASE_RATE,US_PMI_MFG,CN_BASE_RATE,CN_PMI_MFG,BRENT_OIL,SCFI';
fs.writeFileSync('macro_indicators.csv', lines.join('\n'));
console.log('macro_indicators.csv 생성 완료');
"
```

- [ ] **Step 2: Supabase에 SQL 실행**

Supabase SQL Editor에서 `scripts/upload-macro.sql` 내용 실행.

- [ ] **Step 3: CSV 업로드**

Supabase Table Editor → `macro_indicators` → Import CSV → `macro_indicators.csv` 업로드.

Expected: 62행 임포트.

- [ ] **Step 4: 데이터 검증**

Supabase SQL Editor에서:

```sql
SELECT COUNT(*) FROM macro_indicators;
-- Expected: 62

SELECT * FROM macro_indicators WHERE "YYMM" = '202602';
-- Expected: KR_BASE_RATE=0.025, KR_BSI_MFG=72, ...
```

- [ ] **Step 5: 챗봇 검증**

개발 서버 실행 후 챗봇에서 질문:

1. "2025년에 왜 수출액이 증가했어?" → 거시경제 지표와 연계한 분석 답변 기대
2. "최근 유가 동향이 수출에 미치는 영향은?" → 브렌트유 데이터 참조한 답변 기대
3. "반도체 수출 현황 알려줘" → 거시경제 지표 강제 언급 없이 기존처럼 답변 기대

- [ ] **Step 6: 최종 커밋**

```bash
git add scripts/upload-macro.sql macro_indicators.csv
git commit -m "feat: 거시경제 지표 Supabase 업로드 스크립트 및 CSV"
```
