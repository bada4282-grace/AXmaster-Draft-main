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
