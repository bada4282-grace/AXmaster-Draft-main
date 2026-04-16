"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/lib/supabase";
import { saveChatLog, getChatLogs } from "@/lib/chat";
import { resolveRouteButtons } from "@/lib/chatContext";
import type { RouteButton } from "@/lib/chatContext";
import type { User } from "@supabase/supabase-js";

function TypingIndicator() {
  return (
    <div className="chatbot-typing">
      <span /><span /><span />
    </div>
  );
}

function renderBotText(text: string): React.ReactNode {
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

interface ChatMessage { role: "bot" | "user"; text: string; routeButtons?: RouteButton[]; }

interface ChatBotProps {
  open: boolean;
  onToggle?: () => void;
  initialMessage: string;
  showInternalToggle?: boolean;
}

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
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [fontSize, setFontSize] = useState(12);
  const [isStreaming, setIsStreaming] = useState(false);
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [welcomeTrigger, setWelcomeTrigger] = useState(0);
  const currentUserIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const welcomeFetchedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 16));
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 10));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const initialMessageRef = useRef(initialMessage);
  useEffect(() => { initialMessageRef.current = initialMessage; });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      currentUserIdRef.current = session?.user?.id ?? null;
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null;
      const newUser = session?.user ?? null;
      const prevUserId = currentUserIdRef.current;

      currentUserIdRef.current = newUserId;

      if (event === "SIGNED_IN") {
        setUser(newUser);
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
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open || welcomeFetchedRef.current) return;
    welcomeFetchedRef.current = true;

    const currentUser = user;
    const fallback = initialMessageRef.current;

    if (!currentUser) {
      setMessages([{ role: "bot", text: fallback }]);
      welcomeFetchedRef.current = false;
      return;
    }

    const loadWelcome = async () => {
      setMessages([{ role: "bot", text: "" }]);
      setWelcomeLoading(true);

      try {
        const logs = await getChatLogs(5);

        if (logs.length === 0) {
          setMessages([{ role: "bot", text: fallback }]);
          return;
        }

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
  }, [open, user, welcomeTrigger]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const send = async (overrideMsg?: string) => {
    const msgToSend = overrideMsg ?? input;
    if (!msgToSend.trim() || isStreaming) return;
    const userMsg = msgToSend.trim();
    if (!overrideMsg) setInput("");
    setIsStreaming(true);

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
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "bot", text: fullResponse },
        ]);
      }

      const finalChunk = decoder.decode();
      if (finalChunk) {
        fullResponse += finalChunk;
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "bot", text: fullResponse },
        ]);
      }

      saveResponse = true;

      // 스트리밍 완료 후 라우팅 버튼 계산해서 마지막 봇 메시지에 추가
      const routeButtons = resolveRouteButtons(userMsg);
      if (routeButtons.length > 0) {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "bot", text: fullResponse, routeButtons },
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
          {user && (
            <div style={{ fontSize: 10, color: "#999" }}>
              {user.email} 로그인 중
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "#999", marginRight: 2 }}>Aa</span>
            <button onClick={decreaseFontSize} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14, color: "#555", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>−</button>
            <button onClick={increaseFontSize} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14, color: "#555", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
          </div>
          <button
            onClick={() => setMessages([{ role: "bot", text: initialMessage }])}
            title="대화 내용 지우기"
            style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#fde8e8")}
            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="chatbot-messages" style={{ minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 4, width: "100%" }}>
              {msg.role === "bot" && (
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 2 }}>🤖</div>
              )}
              <div
                className={msg.role === "bot" ? "chatbot-msg-bot" : "chatbot-msg-user"}
                style={{ fontSize }}
              >
                {msg.role === "bot"
                  ? (msg.text === "" && (isStreaming || welcomeLoading) && i === messages.length - 1
                      ? <TypingIndicator />
                      : renderBotText(msg.text))
                  : msg.text}
              </div>
            </div>
            {msg.role === "bot" && msg.routeButtons && msg.routeButtons.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 24 }}>
                {/* 정확 매칭 버튼 */}
                {msg.routeButtons.filter(btn => btn.type !== "candidate").map((btn, j) => (
                  <button
                    key={j}
                    onClick={() => router.push(btn.href)}
                    style={{
                      background: "#fff",
                      border: "1px solid #E02020",
                      borderRadius: 12,
                      padding: "4px 10px",
                      fontSize: 11,
                      color: "#E02020",
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: 500,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#fde8e8"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                  >
                    📊 {btn.label}
                  </button>
                ))}
                {/* 유사 후보 버튼 */}
                {msg.routeButtons.some(btn => btn.type === "candidate") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 10, color: "#888" }}>혹시 이 품목을 찾으시나요?</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {msg.routeButtons.filter(btn => btn.type === "candidate").map((btn, j) => (
                        <button
                          key={j}
                          onClick={() => router.push(btn.href)}
                          style={{
                            background: "#fff",
                            border: "1px solid #94a3b8",
                            borderRadius: 12,
                            padding: "3px 8px",
                            fontSize: 10,
                            color: "#475569",
                            cursor: "pointer",
                            fontWeight: 500,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* FAQ 버튼 */}
      {!messages.some(m => m.role === "user") && (
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
      )}

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