# 거시경제 지표 챗봇 연동 설계

> 챗봇이 무역통계 질문에 답변할 때, 거시경제 지표와의 상관관계를 자체 판단하여 분석 수준을 조절하는 기능

## 목표

사용자가 "2025년에 왜 수출액이 증가했어?" 같은 질문을 하면, Claude가 무역 데이터뿐 아니라 거시경제 지표(금리, BSI, PMI, 유가, 운임 등)를 함께 참고하여 더 구체적인 답변을 제공한다. 모든 답변에 강제하지 않고, Claude가 맥락에 따라 단순 참조 ~ 상관관계 도출까지 유연하게 판단한다.

## 데이터 소스

**파일**: `거시경제지표.xlsx` (시트: 데이터)
- 62행, 월별 (2021.01 ~ 2026.02)
- 13개 컬럼 (기준년월 + 12개 지표)

**메타데이터** (시트: 메타데이터): 각 지표의 출처와 설명

## 데이터 구조

### Supabase 테이블: `macro_indicators`

```sql
CREATE TABLE macro_indicators (
  "YYMM"            TEXT PRIMARY KEY,
  "KR_BASE_RATE"    NUMERIC,  -- 한국 기준금리 (소수, 0.025 = 2.5%)
  "KR_BSI_MFG"      NUMERIC,  -- 한국 제조업 BSI (100 이상 긍정)
  "KR_BSI_NON_MFG"  NUMERIC,  -- 한국 비제조업 BSI
  "KR_EBSI"         NUMERIC,  -- 한국 수출기업 BSI
  "KR_PROD_YOY"     NUMERIC,  -- 산업생산 전년동기비 (소수)
  "KR_CPI_YOY"      NUMERIC,  -- CPI 전년동기비 (소수)
  "US_BASE_RATE"    NUMERIC,  -- 미국 기준금리 (소수)
  "US_PMI_MFG"      NUMERIC,  -- 미국 제조업 PMI (50 기준)
  "CN_BASE_RATE"    NUMERIC,  -- 중국 기준금리 (소수)
  "CN_PMI_MFG"      NUMERIC,  -- 중국 제조업 PMI (50 기준)
  "BRENT_OIL"       NUMERIC,  -- 브렌트유 ($/bbl)
  "SCFI"            NUMERIC   -- 상하이컨테이너운임지수
);
```

### 정적 데이터: `tradeData.generated.ts`

```ts
export const MACRO_INDICATORS: Record<string, {
  KR_BASE_RATE: number; KR_BSI_MFG: number; KR_BSI_NON_MFG: number;
  KR_EBSI: number; KR_PROD_YOY: number; KR_CPI_YOY: number;
  US_BASE_RATE: number; US_PMI_MFG: number;
  CN_BASE_RATE: number; CN_PMI_MFG: number;
  BRENT_OIL: number; SCFI: number;
}> = { "202602": { ... }, ... };

export const MACRO_META: { key: string; label: string; desc: string }[] = [
  { key: "KR_BASE_RATE", label: "한국 기준금리", desc: "한국은행이 결정하는 기준금리로..." },
  ...
];
```

## 챗봇 컨텍스트 주입

### 주입 판단 로직 (`buildMacroContext`)

| 질문 패턴 | 주입 범위 |
|-----------|----------|
| 연도 키워드 (예: "2025년") | 해당 연도 12개월 지표 |
| 분석 키워드 ("왜", "이유", "원인", "배경") | 해당 연도 + 전년도 지표 |
| 특정 지표 언급 ("금리", "유가", "환율") | 해당 지표의 전체 기간 추이 |
| 일반 현황 질문 | 최근 6개월 요약 |

### 주입 텍스트 포맷

```
[거시경제 지표 — 2025년]
기준년월 | 한국금리 | 제조업BSI | EBSI | 산업생산 | CPI | 미국금리 | 미국PMI | 중국금리 | 중국PMI | 브렌트유 | SCFI
202501  | 2.5%   | 71      | 115.8 | 7.1%   | 2%  | 3.75%  | 52.6  | 3%     | 49.3  | $66.6  | 1316
...

[지표 해석 가이드]
- BSI/EBSI: 100 이상 긍정적 전망, 미만 부정적
- PMI: 50 이상 확장, 미만 위축
- 금리: 소수 표시 (0.025 = 2.5%)
- 산업생산/CPI: 전년 동기 대비 증감률
```

### 시스템 프롬프트 추가

> "거시경제 지표가 제공된 경우, 무역 데이터의 변동을 설명할 때 관련 지표와의 상관관계를 자연스럽게 언급하세요. 단, 모든 답변에 강제로 넣지 말고, 설명에 도움이 될 때만 활용하세요. 인과관계를 단정짓지 말고 '~의 영향이 있을 수 있습니다' 같은 표현을 사용하세요."

## 구현 범위

### 수정 대상

| 파일 | 변경 |
|------|------|
| `scripts/upload-macro.sql` | 신규 — DDL 스크립트 |
| `scripts/generate-data.js` | 엑셀 파싱 → `MACRO_INDICATORS` + `MACRO_META` export 추가 |
| `lib/tradeData.generated.ts` | 자동 재생성 — 거시경제 데이터 포함 |
| `lib/chatContext.ts` | `buildMacroContext()` 추가, `buildChatContext()`에 통합 |
| `app/api/chat/route.ts` | 시스템 프롬프트에 거시경제 해석 지시 추가 |

### 범위 밖

- `components/MacroSection.tsx` 대시보드 표시 변경
- `app/api/macro/route.ts` 기존 환율 API
- `lib/supabaseServer.ts` Supabase 조회 (향후 실시간 전환 시 추가)

## 데이터 업로드 흐름

1. `generate-data.js`가 `거시경제지표.xlsx` → `MACRO_INDICATORS` + `MACRO_META` 생성
2. `거시경제지표.xlsx` → CSV 변환 → Supabase `macro_indicators` 테이블에 수동 업로드
