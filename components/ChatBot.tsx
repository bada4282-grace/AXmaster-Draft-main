"use client";
import { useState, useRef, useEffect } from "react";

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const [fontSize, setFontSize] = useState(12);
  const increaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 16));
  const decreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 10));
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 입력 내용에 따라 textarea 높이 자동 조절
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text?: string) => {
    const userMsg = (text ?? input).trim();
    if (!userMsg) return;
    setInput("");
    setMessages(prev => [
      ...prev,
      { role: "user", text: userMsg },
      { role: "bot", text: "해당 질문에 대한 분석 결과를 준비 중입니다. 실제 서비스에서는 AI가 무역통계를 기반으로 응답합니다." },
    ]);
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
        </div>
        {/* 폰트 크기 조절 버튼 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#999", marginRight: 2 }}>Aa</span>
          <button onClick={decreaseFontSize} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14, color: "#555", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>−</button>
          <button onClick={increaseFontSize} style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14, color: "#555", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
        </div>
      </div>

      {/* Messages */}
      <div className="chatbot-messages">
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 4 }}>
            {msg.role === "bot" && (
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, flexShrink:0, marginTop:2 }}>🤖</div>
            )}
            <div className={msg.role === "bot" ? "chatbot-msg-bot" : "chatbot-msg-user"} style={{ fontSize }}>
              {msg.text}
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
          placeholder="질문을 입력하세요..."
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
