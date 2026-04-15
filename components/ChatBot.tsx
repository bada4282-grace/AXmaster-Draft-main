"use client";
import { useState, useRef, useEffect, Fragment } from "react";
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

// 마크다운 기호 앞뒤 공백 보장 (이미 공백 있으면 추가 안 함)
function addMarkdownSpaces(text: string): string {
  return text
    .replace(/([^\s])\*\*/g, "$1 **")
    .replace(/\*\*([^\s])/g, "** $1")
    .replace(/^(#{1,3})([^\s#])/gm, "$1 $2");
}

function renderBotText(text: string): React.ReactNode {
  const lines = addMarkdownSpaces(text).split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {line}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ));
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
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const welcomeFetchedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const send = async (overrideMsg?: string) => {
    const msgToSend = overrideMsg ?? input;
    if (!msgToSend.trim() || isStreaming) return;
    const userMsg = msgToSend.trim();
    if (!overrideMsg) setInput("");
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
            챗봇이 고민 중입니다...
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 4 }}>
              {msg.role === "bot" && (
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 2 }}>🤖</div>
              )}
              <div className={msg.role === "bot" ? "chatbot-msg-bot" : "chatbot-msg-user"}>
                {msg.role === "bot"
                  ? (msg.text === "" && isStreaming && i === messages.length - 1
                      ? <TypingIndicator />
                      : renderBotText(msg.text))
                  : msg.text}
              </div>
            </div>
          ))
        )}
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
