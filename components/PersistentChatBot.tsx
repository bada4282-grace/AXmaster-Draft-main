"use client";
import { Suspense, useState, useCallback, useRef, useEffect, memo } from "react";
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
          {/* ChatBot 내부에서 useSearchParams()를 사용하므로, 정적 프리렌더 대상 페이지
              (/_not-found 포함)에서도 안전하도록 Suspense로 감싼다. */}
          <Suspense fallback={null}>
            <StableChatBot
              open={true}
              showInternalToggle={false}
              initialMessage="안녕하세요! K-stat AI 어시스턴트입니다. 국가·품목·거시경제 지표에 대해 질문해 보세요. 로그인하시면 대화 기록이 저장되어 맞춤형 분석을 받으실 수 있습니다."
            />
          </Suspense>
        </div>
      </div>
    </aside>
  );
}
