# 챗봇 인증 + 채팅 로그 + Welcome Message 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase Auth로 이메일/비밀번호 로그인을 구현하고, 로그인 사용자의 채팅 로그를 저장하며, 재접속 시 Claude API로 개인화된 welcome message를 표시한다.

**Architecture:** Supabase 내장 Auth 사용. `lib/auth.ts`가 인증 함수를 담당하고, `lib/chat.ts`가 채팅 로그 CRUD를 담당한다. Welcome message는 `/api/welcome` Route Handler에서 Claude API를 호출해 생성한다.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2, @anthropic-ai/sdk, TypeScript

---

## 파일 구조

| 파일 | 작업 | 역할 |
|------|------|------|
| `.env.example` | 수정 | 머지 충돌 해결 |
| `lib/auth.ts` | 신규 | signUp / signIn / signOut / getUser |
| `lib/chat.ts` | 신규 | saveChatLog / getChatLogs |
| `app/login/page.tsx` | 신규 | 로그인 페이지 |
| `app/signup/page.tsx` | 신규 | 회원가입 페이지 |
| `app/api/welcome/route.ts` | 신규 | Claude API 호출 → welcome message |
| `components/Header.tsx` | 수정 | "로그인" 링크 → /login, 로그인 시 "로그아웃" 표시 |
| `components/ChatBot.tsx` | 수정 | 로그인 확인, 로그 저장, welcome message 표시 |

---

## Task 1: .env.example 머지 충돌 해결 + @anthropic-ai/sdk 설치

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: .env.example 머지 충돌 해결**

`.env.example` 전체를 아래 내용으로 교체:

```
NEXT_PUBLIC_SUPABASE_URL=       # Supabase Project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # Supabase Publishable Key
SUPABASE_SECRET_KEY=            # Supabase Secret Key
ANTHROPIC_API_KEY=              # Claude API Key
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
EXCHANGE_RATE_API_KEY=          # ExchangeRate API Key
```

- [ ] **Step 2: @anthropic-ai/sdk 설치**

```bash
npm install @anthropic-ai/sdk
```

Expected: `added N packages` 출력 (에러 없음)

- [ ] **Step 3: ANTHROPIC_MODEL 환경변수 .env.local에 추가**

`.env.local` 파일에 아래 줄 추가:

```
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

- [ ] **Step 4: 커밋**

```bash
git add .env.example package.json package-lock.json
git commit -m "chore: fix env.example conflict and install anthropic sdk"
```

---

## Task 2: Supabase chat_logs 테이블 + RLS 설정

**Files:**
- 없음 (Supabase 대시보드에서 직접 실행)

- [ ] **Step 1: Supabase 대시보드 접속**

https://supabase.com → 기존 프로젝트 선택 → SQL Editor 열기

- [ ] **Step 2: 테이블 생성 SQL 실행**

아래 SQL을 SQL Editor에 붙여넣고 실행:

```sql
-- chat_logs 테이블 생성
create table chat_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text check (role in ('user', 'bot')) not null,
  content text not null,
  created_at timestamptz default now() not null
);

-- 인덱스 (사용자별 조회 성능)
create index chat_logs_user_id_idx on chat_logs(user_id, created_at desc);

-- RLS 활성화 (다른 사용자 데이터 접근 차단)
alter table chat_logs enable row level security;

-- 본인 로그만 읽기 허용
create policy "본인 로그 읽기"
  on chat_logs for select
  using (auth.uid() = user_id);

-- 본인 로그만 저장 허용
create policy "본인 로그 저장"
  on chat_logs for insert
  with check (auth.uid() = user_id);
```

- [ ] **Step 3: 테이블 생성 확인**

Supabase 대시보드 → Table Editor → `chat_logs` 테이블이 보이면 성공

---

## Task 3: lib/auth.ts 생성

**Files:**
- Create: `lib/auth.ts`

- [ ] **Step 1: lib/auth.ts 생성**

```typescript
import { supabase } from "@/lib/supabase";

// 회원가입
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// 로그인
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// 로그아웃
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 현재 로그인된 사용자 반환 (없으면 null)
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/auth.ts
git commit -m "feat: add auth helpers (signUp, signIn, signOut, getUser)"
```

---

## Task 4: lib/chat.ts 생성

**Files:**
- Create: `lib/chat.ts`

- [ ] **Step 1: lib/chat.ts 생성**

```typescript
import { supabase } from "@/lib/supabase";

export interface ChatLog {
  id: string;
  user_id: string;
  role: "user" | "bot";
  content: string;
  created_at: string;
}

// 채팅 메시지 저장 (비로그인 시 아무 것도 안 함)
export async function saveChatLog(role: "user" | "bot", content: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("chat_logs")
    .insert({ user_id: user.id, role, content });
  if (error) throw error;
}

// 최근 채팅 로그 조회 (비로그인 시 빈 배열)
export async function getChatLogs(limit = 50): Promise<ChatLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("chat_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChatLog[];
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/chat.ts
git commit -m "feat: add chat log helpers (saveChatLog, getChatLogs)"
```

---

## Task 5: app/login/page.tsx 생성

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: app/login/page.tsx 생성**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8" }}>
      <div style={{ background: "white", padding: 40, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: "#333" }}>로그인</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          {error && <p style={{ color: "#E02020", fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "12px", background: "#E02020", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#777" }}>
          계정이 없으신가요?{" "}
          <Link href="/signup" style={{ color: "#E02020", fontWeight: 600 }}>회원가입</Link>
        </p>
      </div>
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

http://localhost:3000/login 접속 → 로그인 폼이 보이면 성공

- [ ] **Step 4: 커밋**

```bash
git add app/login/page.tsx
git commit -m "feat: add login page"
```

---

## Task 6: app/signup/page.tsx 생성

**Files:**
- Create: `app/signup/page.tsx`

- [ ] **Step 1: app/signup/page.tsx 생성**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(email, password);
      router.push("/login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8" }}>
      <div style={{ background: "white", padding: 40, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: "#333" }}>회원가입</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>비밀번호 (6자 이상)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          {error && <p style={{ color: "#E02020", fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "12px", background: "#E02020", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#777" }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "#E02020", fontWeight: 600 }}>로그인</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 브라우저 확인**

http://localhost:3000/signup 접속 → 회원가입 폼이 보이면 성공
"로그인" 링크 클릭 → /login으로 이동하면 성공

- [ ] **Step 3: 커밋**

```bash
git add app/signup/page.tsx
git commit -m "feat: add signup page"
```

---

## Task 7: Header.tsx 수정

**Files:**
- Modify: `components/Header.tsx`

- [ ] **Step 1: Header.tsx 전체 교체**

현재 "로그인"은 `href="#"` 으로 비어있다. 로그인 상태에 따라 "로그인"(/login) 또는 "로그아웃"을 표시하도록 수정:

```tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 초기 로그인 상태 확인
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    // 로그인/로그아웃 이벤트 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
  };

  const navItems = ["KITA.NET", "통계가이드 ▼", "업데이트 현황", "공지사항"];

  return (
    <header className="w-full sticky top-0 z-50 bg-white shadow-sm">
      {/* Top row: Center logo + Right nav */}
      <div className="header-top" style={{ position: "relative", justifyContent: "center" }}>
        <Link href="/" className="no-underline">
          <Image
            src="/h1_logo_og.jpg"
            alt="K-stat 로고"
            width={235}
            height={49}
            priority
            style={{ width: "235px", height: "49px", objectFit: "contain" }}
          />
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 0, fontSize: 13, color: "#555", position: "absolute", right: 32 }}>
          {/* KITA.NET */}
          <span style={{ display: "flex", alignItems: "center" }}>
            <a href="#" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
              KITA.NET
            </a>
          </span>

          {/* 로그인 / 로그아웃 */}
          <span style={{ display: "flex", alignItems: "center" }}>
            <span style={{ color: "#ddd", margin: "0 8px" }}>|</span>
            {user ? (
              <button
                onClick={handleLogout}
                style={{ background: "none", border: "none", padding: 0, color: "#555", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
                onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                로그아웃
              </button>
            ) : (
              <Link href="/login" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
                onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                로그인
              </Link>
            )}
          </span>

          {/* 나머지 메뉴 */}
          {navItems.slice(1).map((item) => (
            <span key={item} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ color: "#ddd", margin: "0 8px" }}>|</span>
              <a href="#" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
                onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                {item}
              </a>
            </span>
          ))}
        </div>
      </div>

      {/* GNB */}
      <div className="header-gnb">
        {["국내통계", "해외무역통계", "IMF 세계통계", "맞춤분석", "자사통계"].map(menu => (
          <a key={menu} className="gnb-item">{menu}</a>
        ))}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 브라우저 확인**

http://localhost:3000 → Header에 "로그인" 링크가 보이면 성공
클릭 시 /login으로 이동하면 성공

- [ ] **Step 3: 커밋**

```bash
git add components/Header.tsx
git commit -m "feat: update header with login/logout state"
```

---

## Task 8: app/api/welcome/route.ts 생성

**Files:**
- Create: `app/api/welcome/route.ts`

- [ ] **Step 1: app/api/welcome/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LogEntry {
  role: "user" | "bot";
  content: string;
}

export async function POST(request: NextRequest) {
  const { logs } = await request.json() as { logs: LogEntry[] };

  // 채팅 로그가 없으면 null 반환 (기본 인사말 사용)
  if (!logs || logs.length === 0) {
    return NextResponse.json({ message: null });
  }

  // 채팅 로그를 텍스트로 변환
  const logText = logs
    .map(log => `${log.role === "user" ? "사용자" : "AI"}: ${log.content}`)
    .join("\n");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const response = await client.messages.create({
    model,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `아래는 K-STAT 무역통계 서비스를 이용한 사용자의 채팅 기록입니다.

${logText}

이 채팅 기록을 바탕으로 사용자가 관심 있는 업종, 타겟 국가, 품목을 유추하여 환영 메시지를 한국어로 2~3문장 작성해주세요.
"안녕하세요!"로 시작하고, 무역통계와 관련된 자연스러운 내용으로 마무리하세요.`,
      },
    ],
  });

  const message = response.content[0].type === "text" ? response.content[0].text : null;
  return NextResponse.json({ message });
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: API 동작 확인**

```bash
curl -X POST http://localhost:3000/api/welcome \
  -H "Content-Type: application/json" \
  -d '{"logs":[{"role":"user","content":"베트남 반도체 수출 데이터 보여줘"}]}'
```

Expected: `{"message":"안녕하세요!..."}` 형태의 JSON 응답

- [ ] **Step 4: 커밋**

```bash
git add app/api/welcome/route.ts
git commit -m "feat: add welcome message API route using Claude"
```

---

## Task 9: ChatBot.tsx 수정

**Files:**
- Modify: `components/ChatBot.tsx`

- [ ] **Step 1: ChatBot.tsx 전체 교체**

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
        // 비로그인: 기본 인사말
        setMessages([{ role: "bot", text: initialMessage }]);
        return;
      }

      setWelcomeLoading(true);
      try {
        const logs = await getChatLogs(50);

        if (logs.length === 0) {
          // 첫 방문: 기본 인사말
          setMessages([{ role: "bot", text: initialMessage }]);
          return;
        }

        // 이전 로그 복원 + welcome message 생성
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
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");

    const botReply = "해당 질문에 대한 분석 결과를 준비 중입니다. 실제 서비스에서는 AI가 무역통계를 기반으로 응답합니다.";

    setMessages(prev => [
      ...prev,
      { role: "user", text: userMsg },
      { role: "bot", text: botReply },
    ]);

    // 로그인 사용자만 저장
    await saveChatLog("user", userMsg);
    await saveChatLog("bot", botReply);
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
                {msg.text}
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
          placeholder="질문을 입력하세요..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <button className="chatbot-send-btn" onClick={send}>▶</button>
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

- [ ] **Step 3: 전체 흐름 브라우저 확인**

1. http://localhost:3000 → 비로그인 상태에서 챗봇 열기 → 기본 인사말 표시 확인
2. Header "로그인" 클릭 → /login 이동 확인
3. /signup 에서 테스트 계정 생성 (예: test@test.com / 123456)
4. /login 에서 로그인 → 홈으로 이동 확인
5. 챗봇에서 메시지 전송 → Supabase 대시보드에서 chat_logs 테이블에 저장 확인
6. 페이지 새로고침 후 챗봇 열기 → "맞춤 메시지 준비 중..." 표시 후 welcome message 표시 확인
7. Header에 "로그아웃" 표시 확인, 클릭 시 "로그인"으로 변경 확인

- [ ] **Step 4: 커밋**

```bash
git add components/ChatBot.tsx
git commit -m "feat: integrate auth and chat logs into ChatBot with welcome message"
```
