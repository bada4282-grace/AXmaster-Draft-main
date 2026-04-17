"use client";
import { useState, useCallback, useRef, useEffect, memo } from "react";
import { usePathname } from "next/navigation";
import ChatBot from "@/components/ChatBot";

// props가 고정값이므로 페이지 이동 시 절대 re-render되지 않음
const StableChatBot = memo(ChatBot);

const HIDDEN_PATHS = ["/login", "/signup"];

export default function PersistentChatBot() {
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(true);
  const asideRef = useRef<HTMLElement>(null);

  // 사이드바 트랜지션 완료 시 resize 이벤트 발생 → Recharts 차트 리사이즈
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === "width") {
        window.dispatchEvent(new Event("resize"));
      }
    };
    el.addEventListener("transitionend", onEnd);
    return () => el.removeEventListener("transitionend", onEnd);
  }, []);

  const handleToggle = useCallback(() => {
    setChatOpen(prev => !prev);
    // 트랜지션 완료 후 resize 이벤트 발생 (transitionend 이벤트와 함께 보완)
    setTimeout(() => window.dispatchEvent(new Event("resize")), 350);
  }, []);

  // 로그인/회원가입 페이지에서는 챗봇 숨김 (Hook 뒤에 위치해야 함)
  if (HIDDEN_PATHS.includes(pathname)) {
    return null;
  }

  return (
    <aside ref={asideRef} className={`app-chatbot-sidebar${chatOpen ? "" : " collapsed"}`}>
      <button
        className="chatbot-slider-btn"
        onClick={handleToggle}
        title={chatOpen ? "챗봇 접기" : "챗봇 펼치기"}
        aria-label={chatOpen ? "챗봇 접기" : "챗봇 펼치기"}
      >
        {chatOpen ? "›" : "‹"}
      </button>
      <div className="app-chatbot-inner">
        <div className="dashboard-card chatbot-card">
          <StableChatBot
            open={true}
            showInternalToggle={false}
            initialMessage="글로벌 무역통계 대시보드입니다. 특정 국가나 품목에 대해 질문해주세요."
          />
        </div>
      </div>
    </aside>
  );
}
