# 챗봇 AI 응답 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자의 무역통계 질문을 Claude API로 분석해 스트리밍으로 실시간 답변을 제공한다.

**Architecture:** 질문에서 국가명/품목명/연도를 추출해 lib/data.ts에서 관련 데이터를 조회하고, 이를 컨텍스트로 Claude API에 전달한다. 응답은 서버에서 스트리밍으로 전송되며, ChatBot.tsx에서 실시간으로 화면에 출력된다.

**Tech Stack:** Next.js 16 App Router, @anthropic-ai/sdk (스트리밍), TypeScript

---

## 파일 구조

| 파일 | 작업 | 역할 |
|------|------|------|
| `lib/chatContext.ts` | 신규 | 키워드 추출 + 무역 데이터 조회 + Claude 프롬프트 조립 |
| `app/api/chat/route.ts` | 신규 | Claude 스트리밍 API Route Handler |
| `components/ChatBot.tsx` | 수정 | `send()` 함수를 스트리밍 수신으로 교체, `isStreaming` 상태 추가 |

---

## Task 1: lib/chatContext.ts 생성

**Files:**
- Create: `lib/chatContext.ts`

- [ ] **Step 1: lib/chatContext.ts 생성**

```typescript
import {
  getCountryData,
  getCountryKpi,
  getCountryTimeseries,
  getProductTopCountries,
  getProductTrend,
  getCountryTreemapData,
  DEFAULT_YEAR,
  KPI_BY_YEAR,
} from "@/lib/data";
import {
  TREEMAP_EXP_DATA_BY_YEAR,
  COUNTRY_DATA_BY_YEAR,
} from "@/lib/tradeData.generated";

interface ExtractedKeywords {
  countries: string[];
  productCodes: string[];
  productNames: string[];
  year: string;
}

// TREEMAP 데이터에서 품목명 → 코드 역조회 맵 구성
function buildProductLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const yearData of Object.values(TREEMAP_EXP_DATA_BY_YEAR)) {
    for (const item of yearData) {
      if (!lookup.has(item.name)) {
        lookup.set(item.name, item.code);
      }
    }
  }
  return lookup;
}

// COUNTRY_DATA_BY_YEAR에서 국가명 목록 구성
function buildCountryList(): string[] {
  const names = new Set<string>();
  for (const yearData of Object.values(COUNTRY_DATA_BY_YEAR)) {
    for (const c of yearData) names.add(c.name);
  }
  return Array.from(names);
}

const PRODUCT_LOOKUP = buildProductLookup();
const COUNTRY_LIST = buildCountryList();

// 질문에서 국가명, 품목명, 연도 추출 (부분 일치)
export function extractKeywords(question: string): ExtractedKeywords {
  const yearMatch = question.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : DEFAULT_YEAR;

  const countries = COUNTRY_LIST.filter(name => question.includes(name));

  const productCodes: string[] = [];
  const productNames: string[] = [];
  for (const [name, code] of PRODUCT_LOOKUP.entries()) {
    if (question.includes(name) && !productCodes.includes(code)) {
      productCodes.push(code);
      productNames.push(name);
    }
  }

  return { countries, productCodes, productNames, year };
}

// 추출된 키워드 기반으로 무역 데이터 조회 후 컨텍스트 문자열 조립
export function buildChatContext(question: string): string {
  const { countries, productCodes, productNames, year } = extractKeywords(question);
  const sections: string[] = [];

  // 전체 KPI 요약 (항상 포함)
  const kpi = (KPI_BY_YEAR as Record<string, {
    export: { value: string };
    import: { value: string };
    balance: { value: string };
  }>)[year];
  if (kpi) {
    sections.push(
      `[${year}년 전체 무역 요약]\n수출: ${kpi.export.value}억달러, 수입: ${kpi.import.value}억달러, 무역수지: ${kpi.balance.value}억달러`
    );
  }

  // 국가별 데이터
  for (const country of countries) {
    const countryData = getCountryData(year).find(c => c.name === country);
    const kpiData = getCountryKpi(year, country);
    const timeseries = getCountryTimeseries(year, country);

    let section = `[${country} 교역 데이터 (${year}년)]\n`;
    if (countryData) {
      section += `수출순위: ${countryData.rank}위, 수출액: ${countryData.export}억달러, 수입액: ${countryData.import}억달러\n`;
      section += `주요수출품: ${countryData.topProducts.join(", ")}\n`;
    }
    if (kpiData) {
      section += `KPI — 수출: ${kpiData.export}, 수입: ${kpiData.import}, 수지: ${kpiData.balance}\n`;
    }
    if (timeseries.length > 0) {
      const recent = timeseries.slice(-3).map(m => `${m.month} 수출${m.export}억달러`).join(", ");
      section += `최근 월별: ${recent}`;
    }
    sections.push(section);
  }

  // 품목별 데이터
  for (let i = 0; i < productCodes.length; i++) {
    const code = productCodes[i];
    const name = productNames[i];
    const topCountries = getProductTopCountries(code, year, "수출");
    const trend = getProductTrend(code, "수출");

    let section = `[${name} 수출 데이터]\n`;
    if (topCountries.length > 0) {
      section += `상위 수출국: ${topCountries.slice(0, 5).map(c => `${c.country}(${c.value}억달러)`).join(", ")}\n`;
    }
    if (trend.length > 0) {
      const recent = trend.slice(-3).map(t => `${t.year}년 ${t.value}억달러`).join(", ");
      section += `연도별 추이: ${recent}`;
    }
    sections.push(section);
  }

  // 국가 × 품목 교차 데이터
  if (countries.length > 0 && productCodes.length > 0) {
    for (const country of countries) {
      const treemap = getCountryTreemapData(year, country, "수출");
      const relevant = treemap.filter(p => productCodes.includes(p.code)).slice(0, 5);
      if (relevant.length > 0) {
        sections.push(
          `[${country} × 품목 교차 데이터]\n` +
          relevant.map(p => `${p.name}: ${p.value}억달러`).join(", ")
        );
      }
    }
  }

  return sections.join("\n\n");
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음 (lib/supabase.ts 기존 에러 제외)

- [ ] **Step 3: 커밋**

```bash
git add lib/chatContext.ts
git commit -m "feat: add chat context builder with keyword extraction"
```

---

## Task 2: app/api/chat/route.ts 생성

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: app/api/chat/route.ts 생성**

```typescript
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildChatContext } from "@/lib/chatContext";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  let message: string;
  let history: HistoryEntry[];

  try {
    const body = await request.json();
    message = body.message ?? "";
    history = body.history ?? [];
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!message.trim()) {
    return new Response("Message required", { status: 400 });
  }

  const context = buildChatContext(message);
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const systemPrompt = `당신은 한국 무역통계 전문 AI 어시스턴트입니다.
아래 데이터를 바탕으로 사용자 질문에 한국어로 답변하세요.
수치는 구체적으로 인용하고, 분석이 필요한 경우 데이터 간 상관관계를 설명하세요.
데이터에 없는 내용은 추측하지 말고 "해당 데이터가 없습니다"라고 명시하세요.

${context ? `[참고 데이터]\n${context}` : "[참고 데이터 없음 — 일반적인 무역 지식으로 답변]"}`;

  const stream = await client.messages.stream({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history,
      { role: "user", content: message },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[답변 생성 중 오류가 발생했습니다.]"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add streaming chat API route with context injection"
```

---

## Task 3: ChatBot.tsx 수정 — 스트리밍 수신

**Files:**
- Modify: `components/ChatBot.tsx`

- [ ] **Step 1: ChatBot.tsx 전체 교체**

`send()` 함수를 스트리밍 방식으로 교체하고 `isStreaming` 상태를 추가한다.

```tsx
"use client";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { saveChatLog, getChatLogs } from "@/lib/chat";
import type { User } from "@supabase/supabase-js";

interface ChatMessage { role: "bot" | "user"; text: string; }

interface ChatBotProps {
  open: boolean;
  onToggle?: () => void;
  initialMessage: string;
  showInternalToggle?: boolean;
}

export default function ChatBot({
  open,
  onToggle,
  initialMessage,
  showInternalToggle = true,
}: ChatBotProps) {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const welcomeFetchedRef = useRef(false);

  // 로그인 상태 감지
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // 챗봇이 열릴 때 welcome message 생성
  useEffect(() => {
    if (!open || welcomeFetchedRef.current) return;
    welcomeFetchedRef.current = true;

    const loadWelcome = async () => {
      if (!user) {
        setMessages([{ role: "bot", text: initialMessage }]);
        return;
      }

      setWelcomeLoading(true);
      try {
        const logs = await getChatLogs(50);

        if (logs.length === 0) {
          setMessages([{ role: "bot", text: initialMessage }]);
          return;
        }

        const restored: ChatMessage[] = logs.map(log => ({
          role: log.role,
          text: log.content,
        }));

        const res = await fetch("/api/welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logs }),
        });
        const { message } = await res.json();

        setMessages([
          ...restored,
          { role: "bot", text: message ?? initialMessage },
        ]);
      } catch {
        setMessages([{ role: "bot", text: initialMessage }]);
      } finally {
        setWelcomeLoading(false);
      }
    };

    loadWelcome();
  }, [open, user, initialMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg = input.trim();
    setInput("");
    setIsStreaming(true);

    // 최근 10개 메시지를 히스토리로 전달
    const history = messages.slice(-10).map(m => ({
      role: m.role === "user" ? "user" : "assistant" as const,
      content: m.text,
    }));

    // 사용자 메시지 + 빈 봇 메시지 추가
    setMessages(prev => [
      ...prev,
      { role: "user", text: userMsg },
      { role: "bot", text: "" },
    ]);

    let fullResponse = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        // 마지막 봇 메시지를 실시간으로 업데이트
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "bot", text: fullResponse },
        ]);
      }
    } catch {
      fullResponse = "답변 생성 중 오류가 발생했습니다.";
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "bot", text: fullResponse },
      ]);
    } finally {
      setIsStreaming(false);
      // 로그인 사용자만 저장
      await saveChatLog("user", userMsg);
      if (fullResponse) await saveChatLog("bot", fullResponse);
    }
  };

  if (!open) {
    return (
      <button className="chatbot-open-btn" onClick={onToggle} title="챗봇 열기">
        ↑
      </button>
    );
  }

  return (
    <div className="chatbot-panel">
      {/* Header */}
      <div className="chatbot-header">
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "linear-gradient(135deg, #ffd6d6, #ffb3b3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, flexShrink: 0,
        }}>🤖</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>K-stat AI 어시스턴트</div>
          <div style={{ fontSize: 10, color: "#999" }}>
            {user ? `${user.email} 로그인 중` : "무역통계 전문 AI"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="chatbot-messages">
        {welcomeLoading ? (
          <div style={{ textAlign: "center", color: "#aaa", fontSize: 13, padding: 20 }}>
            맞춤 메시지 준비 중...
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 4 }}>
              {msg.role === "bot" && (
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 2 }}>🤖</div>
              )}
              <div className={msg.role === "bot" ? "chatbot-msg-bot" : "chatbot-msg-user"}>
                {msg.text || (isStreaming && i === messages.length - 1 ? "▌" : "")}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="chatbot-input-area">
        <input
          className="chatbot-input"
          placeholder={isStreaming ? "답변 생성 중..." : "질문을 입력하세요..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          disabled={isStreaming}
        />
        <button
          className="chatbot-send-btn"
          onClick={send}
          disabled={isStreaming}
          style={{ opacity: isStreaming ? 0.5 : 1 }}
        >▶</button>
      </div>

      {/* Close button */}
      {showInternalToggle && onToggle && (
        <button className="chatbot-close-btn" onClick={onToggle} title="챗봇 접기">
          ↓
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 브라우저 확인**

```bash
npm run dev
```

1. http://localhost:3000 → 챗봇 열기
2. "베트남 수출액 알려줘" 입력 → 스트리밍 답변 출력 확인
3. "반도체 수출 현황 분석해줘" 입력 → 데이터 기반 답변 확인
4. 답변 생성 중 입력창 비활성화 확인
5. 로그인 후 채팅 → Supabase chat_logs에 저장 확인

- [ ] **Step 4: 커밋**

```bash
git add components/ChatBot.tsx
git commit -m "feat: replace placeholder bot reply with streaming AI response"
```
