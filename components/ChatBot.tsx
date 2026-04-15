"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/lib/supabase";
import { saveChatLog, getChatLogs } from "@/lib/chat";
import type { User } from "@supabase/supabase-js";

function TypingIndicator() {
  return (
    <div className="chatbot-typing">
      <span /><span /><span />
    </div>
  );
}

function renderBotText(text: string): React.ReactNode {
  // ==토픽== → <mark>토픽</mark> 변환
  const processed = text.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        mark: ({ children }) => <mark className="chatbot-highlight">{children}</mark>,
        p: ({ children }) => <p style={{ margin: "4px 0" }}>{children}</p>,
        strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
        ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: 18 }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
        h1: ({ children }) => <div style={{ fontWeight: 800, fontSize: 15, margin: "6px 0 2px" }}>{children}</div>,
        h2: ({ children }) => <div style={{ fontWeight: 700, fontSize: 14, margin: "6px 0 2px" }}>{children}</div>,
        h3: ({ children }) => <div style={{ fontWeight: 700, fontSize: 13, margin: "4px 0 2px" }}>{children}</div>,
        table: ({ children }) => (
          <table style={{ borderCollapse: "collapse", margin: "6px 0", fontSize: 11, width: "100%" }}>{children}</table>
        ),
        th: ({ children }) => (
          <th style={{ border: "1px solid #ddd", padding: "3px 6px", background: "#f5f5f5", fontWeight: 600 }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{ border: "1px solid #ddd", padding: "3px 6px" }}>{children}</td>
        ),
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

interface ChatMessage { role: "bot" | "user"; text: string; }

interface ChatBotProps {
  open: boolean;
  onToggle?: () => void;
  initialMessage: string;
  showInternalToggle?: boolean;
}

// ─────────────────────────────────────────────────────────────
// FAQ_QUESTIONS: 현재는 하드코딩된 질문 목록입니다.
// 추후 Supabase DB 연동 시, 실제 사용자 질문 빈도 데이터를
// 기반으로 상위 N개를 동적으로 불러오는 방식으로 교체 예정입니다.
// ─────────────────────────────────────────────────────────────
const FAQ_QUESTIONS = [
  "올해 수출 1위 국가는?",
  "반도체 수출 현황 알려줘",
  "최근 무역수지는?",
];

export default function ChatBot({
  open,
  onToggle,
  initialMessage,
  showInternalToggle = true,
}: ChatBotProps) {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [fontSize, setFontSize] = useState(12);
  const [isStreaming, setIsStreaming] = useState(false);
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  // SIGNED_IN이 발생할 때마다 증가 — user 참조가 동일해도 welcome effect 재실행 보장
  const [welcomeTrigger, setWelcomeTrigger] = useState(0);
  // onAuthStateChange 클로저에서 현재 user id를 참조하기 위한 ref
  const currentUserIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const welcomeFetchedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 16));
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 10));

  // 입력 내용에 따라 textarea 높이 자동 조절
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // initialMessage는 항상 최신 값을 참조하도록 ref 유지
  const initialMessageRef = useRef(initialMessage);
  useEffect(() => { initialMessageRef.current = initialMessage; });

  // 로그인 상태 감지 — 이벤트 종류에 따라 메시지 처리 분기
  useEffect(() => {
    // getSession()은 로컬 스토리지에서 즉시 읽음 → 네트워크 없이 초기 user 확보
    supabase.auth.getSession().then(({ data: { session } }) => {
      currentUserIdRef.current = session?.user?.id ?? null;
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null;
      const newUser = session?.user ?? null;
      const prevUserId = currentUserIdRef.current;

      // ref는 항상 최신 상태 유지 (state 변경 없이 타이밍 이슈 방지)
      currentUserIdRef.current = newUserId;

      if (event === "SIGNED_IN") {
        setUser(newUser);
        // userId가 실제로 바뀐 경우만 welcome 리셋 (토큰 갱신·Alt+Tab 복귀 제외)
        if (newUserId !== prevUserId) {
          welcomeFetchedRef.current = false;
          setMessages([]);
          setWelcomeTrigger(t => t + 1);
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        welcomeFetchedRef.current = true;
        setMessages([{ role: "bot", text: initialMessageRef.current }]);
      }
      // TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED 등:
      // user 정보 변경 없으므로 setUser 호출하지 않음 → welcome effect 재실행 없음
    });
    return () => subscription.unsubscribe();
  }, []);

  // 챗봇이 열릴 때 또는 로그인 시 welcome message 생성
  useEffect(() => {
    if (!open || welcomeFetchedRef.current) return;
    welcomeFetchedRef.current = true;

    const currentUser = user; // effect 실행 시점의 user를 고정
    const fallback = initialMessageRef.current;

    // 비로그인 상태: 기본 메시지 표시 후 ref를 false로 되돌려
    // 로그인 시 이 effect가 다시 실행될 수 있도록 허용
    if (!currentUser) {
      setMessages([{ role: "bot", text: fallback }]);
      welcomeFetchedRef.current = false;
      return;
    }

    // 로그인 상태: 개인화 welcome 로드
    const loadWelcome = async () => {
      // 로딩 중 타이핑 인디케이터 표시
      setMessages([{ role: "bot", text: "" }]);
      setWelcomeLoading(true);

      try {
        const logs = await getChatLogs(5);

        if (logs.length === 0) {
          setMessages([{ role: "bot", text: fallback }]);
          return;
        }

        // 최신 5개 로그를 컨텍스트로 사용 — 화면에 복원하지 않음
        const recentLogs = logs;
        const res = await fetch("/api/welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logs: recentLogs }),
        });
        const { message } = await res.json();

        setMessages([{ role: "bot", text: message ?? fallback }]);
      } catch {
        setMessages([{ role: "bot", text: fallback }]);
      } finally {
        setWelcomeLoading(false);
      }
    };

    loadWelcome();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, welcomeTrigger]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (overrideMsg?: string) => {
    const msgToSend = overrideMsg ?? input;
    if (!msgToSend.trim() || isStreaming) return;
    const userMsg = msgToSend.trim();
    if (!overrideMsg) setInput("");
    setIsStreaming(true);

    // 최근 10개 메시지를 히스토리로 전달 (빈 메시지·연속 같은 role 제거, user로 시작 보장)
    type HistoryMsg = { role: "user" | "assistant"; content: string };
    const rawHistory = messages.slice(-10)
      .filter(m => m.text.trim().length > 0)
      .map((m): HistoryMsg => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }))
      .reduce<HistoryMsg[]>((acc, m) => {
        if (acc.length > 0 && acc[acc.length - 1].role === m.role) return acc;
        acc.push(m);
        return acc;
      }, []);
    const firstUserIdx = rawHistory.findIndex(m => m.role === "user");
    const history = firstUserIdx > 0 ? rawHistory.slice(firstUserIdx) : rawHistory;

    // 사용자 메시지 + 빈 봇 메시지 추가
    setMessages(prev => [
      ...prev,
      { role: "user", text: userMsg },
      { role: "bot", text: "" },
    ]);

    let fullResponse = "";
    let saveResponse = false;

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

      // flush remaining bytes in decoder buffer
      const finalChunk = decoder.decode();
      if (finalChunk) {
        fullResponse += finalChunk;
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "bot", text: fullResponse },
        ]);
      }

      saveResponse = true;
    } catch {
      fullResponse = "답변 생성 중 오류가 발생했습니다.";
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "bot", text: fullResponse },
      ]);
    } finally {
      setIsStreaming(false);
      try {
        await saveChatLog("user", userMsg);
        if (saveResponse && fullResponse) await saveChatLog("bot", fullResponse);
      } catch {
        // log save failure is non-fatal
      }
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
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#333" }}>K-stat AI 어시스턴트</div>
          <div style={{ fontSize: 10, color: "#999" }}>
            {user ? `${user.email} 로그인 중` : "무역통계 전문 AI"}
          </div>
        </div>
        {/* 폰트 크기 조절 버튼 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#999", marginRight: 2 }}>Aa</span>
          <button onClick={decreaseFontSize} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14, color: "#555", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>−</button>
          <button onClick={increaseFontSize} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14, color: "#555", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
        </div>
      </div>

      {/* Messages */}
      <div className="chatbot-messages" style={{ minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 4 }}>
            {msg.role === "bot" && (
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 2 }}>🤖</div>
            )}
            <div className={msg.role === "bot" ? "chatbot-msg-bot" : "chatbot-msg-user"} style={{ fontSize, ...(msg.role === "bot" ? { maxHeight: 110, overflowY: "auto" } : {}) }}>
              {msg.role === "bot"
                ? (msg.text === "" && (isStreaming || welcomeLoading) && i === messages.length - 1
                    ? <TypingIndicator />
                    : renderBotText(msg.text))
                : msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* FAQ 버튼 - 항상 표시 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 12px 8px" }}>
        {FAQ_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => send(q)}
            style={{
              textAlign: "left", background: "#fff", border: "1px solid #e0e0e0",
              borderRadius: 16, padding: "6px 12px", fontSize: 12, color: "#333",
              cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#fde8e8")}
            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="chatbot-input-area" style={{ alignItems: "flex-end" }}>
        <textarea
          ref={textareaRef}
          className="chatbot-input"
          placeholder={isStreaming ? "답변 생성 중..." : "질문을 입력하세요..."}
          value={input}
          rows={1}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          style={{
            resize: "none",
            overflow: "hidden",
            lineHeight: "1.5",
            maxHeight: "120px",
            overflowY: "hidden",
            fontFamily: "inherit",
            paddingTop: 5,
          }}
        />
        <button className="chatbot-send-btn" onClick={() => send()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", transform: "translate(-2px, 1px)" }}>
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
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
