"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface ChatMessage { role: "bot" | "user"; text: string; }
interface ApiMessage { role: "assistant" | "user"; content: string; }
interface ChatApiResponse { reply?: string; error?: string; }

interface ChatBotProps {
  open: boolean;
  onToggle: () => void;
  initialMessage: string;
  width: number;
  onWidthChange: (newWidth: number) => void;
  maxWidth: number;
  /** 현재 선택된 국가 (상세 페이지에서 주입) */
  country?: string;
  /** 현재 선택된 품목 (상세 페이지에서 주입) */
  product?: string;
  /** 현재 선택된 연도 */
  year?: string;
}

const MIN_WIDTH = 160;

export default function ChatBot({ open, onToggle, initialMessage, width, onWidthChange, maxWidth, country, product, year }: ChatBotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = dragStartX.current - e.clientX;
    const nextWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, dragStartWidth.current + delta));
    onWidthChange(nextWidth);
  }, [maxWidth, onWidthChange]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [width, onMouseMove, onMouseUp]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");

    const historyForApi: ApiMessage[] = [
      ...messages.map((msg): ApiMessage => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.text,
      })),
      { role: "user", content: userMsg },
    ];

    setMessages(prev => [
      ...prev,
      { role: "user", text: userMsg },
    ]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          context: initialMessage,
          country,
          product,
          year,
        }),
      });

      const data = await res.json() as ChatApiResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "챗봇 응답 생성에 실패했습니다.");
      }

      setMessages(prev => [
        ...prev,
        { role: "bot", text: data.reply ?? "응답을 생성하지 못했습니다." },
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "챗봇 호출 중 오류가 발생했습니다.";
      setMessages(prev => [
        ...prev,
        { role: "bot", text: `오류가 발생했습니다: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button className="chatbot-open-btn" onClick={onToggle} title="챗봇 열기">
        🤖
      </button>
    );
  }

  return (
    <div className="chatbot-panel" style={{ width, minWidth: MIN_WIDTH, maxWidth }}>
      <div className="chatbot-resize-handle" onMouseDown={handleMouseDown} title="드래그하여 크기 조절" />
      <div className="chatbot-header">
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "linear-gradient(135deg, #ffd6d6, #ffb3b3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, flexShrink: 0,
        }}>🤖</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>K-stat AI 어시스턴트</div>
      </div>

      <div className="chatbot-messages">
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 4 }}>
            {msg.role === "bot" && (
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 2 }}>🤖</div>
            )}
            <div className={msg.role === "bot" ? "chatbot-msg-bot" : "chatbot-msg-user"}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-start", gap: 4 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 2 }}>🤖</div>
            <div className="chatbot-msg-bot">응답을 생성하는 중입니다...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chatbot-input-area">
        <input
          className="chatbot-input"
          placeholder="질문을 입력하세요..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && void send()}
          disabled={loading}
        />
        <button className="chatbot-send-btn" onClick={() => void send()} disabled={loading}>
          ▶
        </button>
      </div>

      <button className="chatbot-close-btn" onClick={onToggle} title="챗봇 접기">
        ↓
      </button>
    </div>
  );
}
