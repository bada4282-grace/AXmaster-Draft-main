# 챗봇 AI 응답 설계

**날짜:** 2026-04-14
**범위:** 2단계 — 실제 무역통계 질문 답변 (스트리밍, 키워드 기반 컨텍스트 주입)

---

## 개요

사용자가 챗봇에 무역통계 질문을 입력하면, 서버에서 관련 데이터를 조회해 Claude API에 전달하고 스트리밍으로 답변을 출력한다. 단순 조회("베트남 수출액은?")부터 분석("반도체 수출이 증가한 이유는?")까지 모두 지원한다.

---

## 1. 전체 흐름

```
사용자 메시지 입력
  → POST /api/chat { message, history }
      1. 질문에서 키워드 추출 (국가명, 품목명, 연도)
      2. 관련 무역 데이터 조회 (lib/data.ts 함수 활용)
      3. Claude API 스트리밍 호출
      4. 텍스트 청크를 실시간으로 클라이언트에 전송
  → ChatBot 화면에 한 글자씩 출력
  → 완료 후 로그인 사용자: chat_logs에 저장
```

---

## 2. 파일 구조

### 신규 파일
```
lib/chatContext.ts          — 키워드 추출 + 데이터 조회 + 프롬프트 조립
app/api/chat/route.ts       — Claude 스트리밍 API Route Handler
```

### 수정 파일
```
components/ChatBot.tsx      — /api/chat 호출, 스트리밍 수신 및 실시간 출력
```

---

## 3. lib/chatContext.ts

### 키워드 추출
질문 텍스트에서 국가명, 품목명, 연도를 추출한다.
- 국가명: lib/data.ts의 COUNTRY_DATA 목록과 대조
- 품목명: MTI_NAMES 목록과 대조 (반도체, 자동차 등)
- 연도: 4자리 숫자 패턴 (없으면 DEFAULT_YEAR 사용)

### 데이터 조회 (추출된 키워드 기준)
| 조건 | 조회 함수 |
|------|-----------|
| 국가 언급 | `getCountryData()`, `getCountryKpi()`, `getCountryTimeseries()` |
| 품목 언급 | `getProductTopCountries()`, `getProductTrend()` |
| 국가 + 품목 | `getCountryTreemapData()` |
| 키워드 없음 | 전체 KPI 요약만 포함 |

### 프롬프트 구조
```
당신은 한국 무역통계 전문 AI 어시스턴트입니다.
아래 데이터를 바탕으로 사용자 질문에 한국어로 답변하세요.
수치는 구체적으로 인용하고, 분석이 필요한 경우 데이터 간 상관관계를 설명하세요.

[무역 데이터]
{조회된 데이터 JSON}

질문: {사용자 메시지}
```

---

## 4. app/api/chat/route.ts

- POST 요청 수신: `{ message: string, history: {role, content}[] }`
- `buildChatContext(message)` 호출로 프롬프트 조립
- `anthropic.messages.stream()` 으로 스트리밍 호출
- `TransformStream`으로 청크를 클라이언트에 실시간 전달
- 에러 발생 시 `{ error: "답변 생성 중 오류가 발생했습니다." }` 반환

---

## 5. ChatBot.tsx 변경

### send() 함수 변경
```
기존: 고정 텍스트 즉시 표시
변경: POST /api/chat → ReadableStream 수신 → 글자 단위 append
```

### 상태 추가
- `isStreaming: boolean` — 스트리밍 중 입력창/버튼 비활성화
- 스트리밍 중 봇 메시지는 빈 문자열로 시작해 실시간으로 채워짐

### 로그 저장
- 스트리밍 완료 후 `saveChatLog("user", message)` + `saveChatLog("bot", fullResponse)` 호출
- 비로그인 사용자는 저장 없이 화면에만 표시

---

## 6. 미구현 사항 (추후 적용)

### 거시경제 지표 연계
사용자가 "2025년에 XX 제품의 수출액이 증가한 이유가 뭐야?" 같은 분석 질문 시, LLM이 무역통계와 거시경제 지표의 상관관계를 도출해 상세 답변을 제공하는 것이 최종 목표다.

**데이터 소스 계획:**
- B안: Supabase에 거시경제 지표 테이블 생성 (GDP, 금리, CPI, 환율, 유가, BDI 등 시계열)
- C안: 외부 API 실시간 연동 (EXCHANGE_RATE_API_KEY 활용)
- B + C 병행 사용 예정

구현 시 `buildChatContext()`에 거시경제 데이터 섹션을 추가하면 됨.
