"use client";
import { useState, useRef, useEffect } from "react";

interface ChatMessage { role: "bot" | "user"; text: string; }

interface ChatBotProps {
  open: boolean;
  onToggle: () => void;
  initialMessage: string;
}

export default function ChatBot({ open, onToggle, initialMessage }: ChatBotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
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
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>K-stat AI 어시스턴트</div>
          <div style={{ fontSize: 10, color: "#999" }}>무역통계 전문 AI</div>
        </div>
      </div>

      {/* Messages */}
      <div className="chatbot-messages">
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 4 }}>
            {msg.role === "bot" && (
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, flexShrink:0, marginTop:2 }}>🤖</div>
            )}
            <div className={msg.role === "bot" ? "chatbot-msg-bot" : "chatbot-msg-user"}>
              {msg.text}
            </div>
          </div>
        ))}
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
      <button className="chatbot-close-btn" onClick={onToggle} title="챗봇 접기">
        ↓
      </button>
    </div>
  );
}
