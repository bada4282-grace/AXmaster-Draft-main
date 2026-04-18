"use client";
import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/lib/supabase";
import { saveChatLog, getChatLogs } from "@/lib/chat";
import type { PageContext, RouteButton } from "@/lib/chatContext";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_YEAR } from "@/lib/data";
import { getCountryRankingAsync, getTreemapDataAsync } from "@/lib/dataSupabase";

function TypingIndicator() {
  return (
    <div className="chatbot-typing">
      <span /><span /><span />
    </div>
  );
}

function renderBotText(text: string): React.ReactNode {
  // ==하이라이트== → <mark> 변환
  // **bold** → <strong> 변환 (ReactMarkdown이 놓치는 경우 대비)
  // 한국어 범위 표현("1월~12월", "2020년~2025년")이 strikethrough로 잘못 렌더링되지
  // 않도록 remark-gfm의 strikethrough 자체를 비활성화해서 해결 (아래 plugin 옵션 참고).
  const processed = text
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return (
    <ReactMarkdown
      // singleTilde: false → "2020년~2025년"처럼 단일 물결표가 strikethrough로 잘못 파싱되지 않도록
      remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
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

const GUEST_FAQ_KEY = "kstat_guest_faq";
const USER_FAQ_KEY = "kstat_user_faq";
// 채팅 내역 sessionStorage 키 접두사 — 사용자별/게스트로 분리해 로그인 전환 시 혼선 방지
const MESSAGES_KEY_PREFIX = "kstat_chat_messages_";
const MAX_STORED_MESSAGES = 50;

function messagesKey(userId: string | null | undefined): string {
  return `${MESSAGES_KEY_PREFIX}${userId ?? "guest"}`;
}

function loadStoredMessages(userId: string | null | undefined): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(messagesKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const msgs = parsed.filter(
      (m): m is ChatMessage =>
        m && (m.role === "bot" || m.role === "user") && typeof m.text === "string",
    );
    return msgs.length > 0 ? msgs : null;
  } catch {
    return null;
  }
}

function persistMessages(userId: string | null | undefined, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    sessionStorage.setItem(messagesKey(userId), JSON.stringify(trimmed));
  } catch {
    /* quota 등 — 무시 */
  }
}

function clearStoredMessages(userId: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(messagesKey(userId));
  } catch {
    /* 무시 */
  }
}

const DEFAULT_GUEST_FAQ = [
  "올해 수출 1위 국가는?",
  "반도체 수출 현황 알려줘",
  "최근 거시경제 지표 요약해줘",
];

function getOrBuildGuestFaq(): string[] {
  try {
    const cached = sessionStorage.getItem(GUEST_FAQ_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* SSR or parse error */ }
  return DEFAULT_GUEST_FAQ;
}

/** Supabase에서 국가/품목 목록을 가져와 게스트 FAQ를 동적 생성 */
async function buildDynamicGuestFaq(): Promise<string[]> {
  try {
    const [ranks, products] = await Promise.all([
      getCountryRankingAsync(DEFAULT_YEAR, "수출"),
      getTreemapDataAsync(DEFAULT_YEAR, "수출"),
    ]);
    const top10c = ranks.slice(0, 10);
    const top10p = products.slice(0, 10);
    const rc = top10c[Math.floor(Math.random() * top10c.length)];
    const rp = top10p[Math.floor(Math.random() * top10p.length)];
    const faq = [
      rc ? `올해 대${rc.country} 수출입 현황은?` : DEFAULT_GUEST_FAQ[0],
      rp ? `${rp.name} 수출 추이와 상위 국가는?` : DEFAULT_GUEST_FAQ[1],
      "최근 거시경제 지표 요약해줘",
    ];
    try { sessionStorage.setItem(GUEST_FAQ_KEY, JSON.stringify(faq)); } catch {}
    return faq;
  } catch {
    return DEFAULT_GUEST_FAQ;
  }
}

function getCachedUserFaq(): string[] | null {
  try {
    const cached = sessionStorage.getItem(USER_FAQ_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

/** 로그인했지만 채팅 로그가 없을 때 — 게스트 FAQ와 다른 질문 */
const LOGGED_IN_DEFAULT_FAQ = [
  "올해 한국 수출입 총액은?",
  "최근 무역수지 흑자 추이는?",
  "주요 거시경제 지표 변동 알려줘",
];

/** 로그인 사용자의 채팅 로그를 AI에 보내 맞춤 FAQ 3개를 생성 */
async function fetchUserFaq(logs: { role: string; content: string }[]): Promise<string[]> {
  try {
    const res = await fetch("/api/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });
    const { questions } = await res.json();
    if (Array.isArray(questions) && questions.length === 3) {
      try { sessionStorage.setItem(USER_FAQ_KEY, JSON.stringify(questions)); } catch {}
      return questions;
    }
    return LOGGED_IN_DEFAULT_FAQ;
  } catch {
    return LOGGED_IN_DEFAULT_FAQ;
  }
}

function resolvePageContext(
  pathname: string | null,
  searchParams: URLSearchParams | null,
): PageContext | undefined {
  if (!pathname) return undefined;

  const year = searchParams?.get("year") ?? undefined;
  const month = searchParams?.get("month") ?? undefined;
  // FilterBar는 `tradeType=`을 쓰고 상세 페이지 라우트는 `mode=`를 쓴다 — 둘 다 인식
  const modeRaw = searchParams?.get("mode") ?? searchParams?.get("tradeType");
  const tradeType: PageContext["tradeType"] =
    modeRaw === "import" ? "수입" : modeRaw === "export" ? "수출" : undefined;
  const tabParam = searchParams?.get("tab");
  const mtiDepthRaw = searchParams?.get("mtiDepth");
  const mtiDepth = mtiDepthRaw ? Number(mtiDepthRaw) : undefined;

  const countryMatch = pathname.match(/^\/country\/([^/?#]+)/);
  if (countryMatch) {
    const country = decodeURIComponent(countryMatch[1]);
    const view: PageContext["view"] =
      tabParam === "timeseries" ? "timeseries" : "products";
    return { country, year, month, tradeType: tradeType ?? "수출", view, mtiDepth };
  }

  const productMatch = pathname.match(/^\/product\/([^/?#]+)/);
  if (productMatch) {
    const productName = decodeURIComponent(productMatch[1]);
    const productCode = searchParams?.get("code") ?? undefined;
    const view: PageContext["view"] =
      tabParam === "countries" ? "countries" : "trend";
    return { productName, productCode, year, month, tradeType, view, mtiDepth };
  }

  // 홈 페이지 (`/`) — 필터(year/month/mode/country/mtiDepth)가 URL에 동기화됨
  if (pathname === "/") {
    const country = searchParams?.get("country")
      ? decodeURIComponent(searchParams.get("country")!)
      : undefined;
    // 홈의 대시보드 뷰 타입 — 국가별 탭은 world map, 품목별 탭은 treemap
    const view: PageContext["view"] =
      tabParam === "product" ? "products" : "countries";
    if (country || year || month || tradeType || mtiDepth) {
      return { country, year, month, tradeType: tradeType ?? "수출", view, mtiDepth };
    }
  }

  return year || tradeType || mtiDepth ? { year, tradeType, mtiDepth } : undefined;
}

export default function ChatBot({
  open,
  onToggle,
  initialMessage,
  showInternalToggle = true,
}: ChatBotProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [fontSize, setFontSize] = useState(12);
  const [isStreaming, setIsStreaming] = useState(false);
  const [guestFaq, setGuestFaq] = useState(DEFAULT_GUEST_FAQ);
  const [userFaq, setUserFaq] = useState<string[] | null>(null);

  // 이메일 모달 state
  const [emailModal, setEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Hydrate FAQ from sessionStorage on client to avoid SSR mismatch
  useEffect(() => {
    const cached = getOrBuildGuestFaq();
    if (cached !== DEFAULT_GUEST_FAQ) setGuestFaq(cached);
    const cachedUser = getCachedUserFaq();
    if (cachedUser) setUserFaq(cachedUser);
  }, []);

  // 게스트 FAQ: 세션 캐시가 없으면 Supabase에서 동적 생성
  useEffect(() => {
    try { if (sessionStorage.getItem(GUEST_FAQ_KEY)) return; } catch {}
    buildDynamicGuestFaq().then(setGuestFaq).catch(() => {});
  }, []);
  const [welcomeLoading, setWelcomeLoading] = useState(false);
  const [welcomeTrigger, setWelcomeTrigger] = useState(0);
  // 초기 세션 확인 완료 여부 — auth 하이드레이션 전에는 welcome/persist 이펙트가 동작하지 않도록 차단
  const [authChecked, setAuthChecked] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const welcomeFetchedRef = useRef(false);
  // 복원 시도 완료 여부 — persist 이펙트가 복원 전에 빈 배열을 덮어쓰지 않도록 가드
  const hasRestoredRef = useRef(false);
  // 초기 세션 관측(재하이드레이션) vs 실제 로그인/로그아웃 구분
  const sessionInitializedRef = useRef(false);
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
    // 초기 세션 동기화 — getSession과 onAuthStateChange 중 먼저 도달하는 쪽이 초기화 처리
    const initializeSession = (userId: string | null, u: User | null) => {
      if (sessionInitializedRef.current) return;
      sessionInitializedRef.current = true;
      currentUserIdRef.current = userId;
      setUser(u);
      setAuthChecked(true);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      initializeSession(session?.user?.id ?? null, session?.user ?? null);
    }).catch(() => {
      initializeSession(null, null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null;
      const newUser = session?.user ?? null;

      // 마운트 직후 초기 세션 재하이드레이션(INITIAL_SESSION / 최초 SIGNED_IN)은
      // "사용자 전환"으로 오판하지 않도록 storage를 건드리지 않는다.
      if (!sessionInitializedRef.current) {
        initializeSession(newUserId, newUser);
        return;
      }

      const prevUserId = currentUserIdRef.current;
      currentUserIdRef.current = newUserId;

      if (event === "SIGNED_IN") {
        setUser(newUser);
        if (newUserId !== prevUserId) {
          // 초기화 이후에 발생한 실제 사용자 전환 — 이전 세션 저장본을 제거
          clearStoredMessages(prevUserId);
          clearStoredMessages(newUserId);
          welcomeFetchedRef.current = false;
          hasRestoredRef.current = false;
          setMessages([]);
          setWelcomeTrigger(t => t + 1);
        }
      } else if (event === "SIGNED_OUT") {
        clearStoredMessages(prevUserId);
        clearStoredMessages(null);
        setUser(null);
        setUserFaq(null);
        welcomeFetchedRef.current = true;
        hasRestoredRef.current = true;
        setMessages([{ role: "bot", text: initialMessageRef.current }]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // 로그인 사용자: AI 기반 맞춤 FAQ 로드 (세션 캐시 우선)
  useEffect(() => {
    if (!user) {
      setUserFaq(null);
      try { sessionStorage.removeItem(USER_FAQ_KEY); } catch {}
      return;
    }
    // 캐시가 있으면 API 호출 생략
    const cached = getCachedUserFaq();
    if (cached) { setUserFaq(cached); return; }

    let cancelled = false;
    getChatLogs(30).then(logs => {
      if (cancelled) return;
      const hasUserMsgs = logs.filter(l => l.role === "user").length > 0;
      if (!hasUserMsgs) {
        if (!cancelled) setUserFaq(LOGGED_IN_DEFAULT_FAQ);
        return;
      }
      return fetchUserFaq(logs);
    }).then(faq => {
      if (!cancelled && faq) setUserFaq(faq);
    }).catch(() => {
      if (!cancelled) setUserFaq(LOGGED_IN_DEFAULT_FAQ);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    // auth 확인 전에는 어떤 메시지도 세팅하지 않는다 — 로그인 사용자가 잠깐 게스트 인사말을 보는 현상 차단
    if (!open || !authChecked || welcomeFetchedRef.current) return;
    welcomeFetchedRef.current = true;

    const currentUser = user;
    const fallback = initialMessageRef.current;

    // 1. sessionStorage에 이전 채팅 내역이 있으면 복원 (새로고침/네비게이션 대응)
    const restored = loadStoredMessages(currentUser?.id ?? null);
    if (restored && restored.length > 0) {
      setMessages(restored);
      hasRestoredRef.current = true;
      return;
    }
    hasRestoredRef.current = true;

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
  }, [open, user, welcomeTrigger, authChecked]);

  // 채팅 내역을 sessionStorage에 백업 — 새로고침/네비게이션 후 복원에 사용
  // auth 확인 + 복원 시도 완료 이후에만 동작 — 로그인 사용자 키에 게스트 fallback이 덮이는 레이스를 방지
  useEffect(() => {
    if (!authChecked || !hasRestoredRef.current) return;
    if (messages.length === 0) return;
    persistMessages(user?.id ?? null, messages);
  }, [messages, user, authChecked]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const sendReport = async () => {
    if (!emailInput.trim()) return;
    setIsSending(true);
    try {
      const reportRes = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const reportData = await reportRes.json();
      console.log("report 응답:", reportData);

      const emailRes = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailInput, html: reportData.html }),
      });
      const emailData = await emailRes.json();
      console.log("email 응답:", emailData);
      alert("전송 완료!");
      setEmailModal(false);
      setEmailInput("");
    } catch (e) {
      console.error("오류:", e);
      alert("오류 발생!");
    } finally {
      setIsSending(false);
    }
  };

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
      const pageContext = resolvePageContext(pathname, searchParams);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history, pageContext }),
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

      // 스트리밍 완료 후 AI 기반 라우팅 버튼 생성
      try {
        const btnRes = await fetch("/api/route-buttons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: userMsg, answer: fullResponse }),
        });
        const { buttons } = await btnRes.json();
        if (Array.isArray(buttons) && buttons.length > 0) {
          const routeButtons: RouteButton[] = buttons.map((b: { label: string; href: string }) => ({
            label: b.label,
            href: b.href,
            type: "exact" as const,
          }));
          setMessages(prev => [
            ...prev.slice(0, -1),
            { role: "bot", text: fullResponse, routeButtons },
          ]);
        }
      } catch { /* 버튼 생성 실패 시 무시 */ }
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
    <div className="chatbot-panel" style={{ position: "relative" }}>
      {/* 이메일 모달 */}
      {emailModal && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, borderRadius: 16,
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: "24px 20px",
            width: 280, display: "flex", flexDirection: "column", gap: 12,
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>📧 보고서 이메일 발송</div>
            <input
              type="email"
              placeholder="이메일 주소 입력"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              disabled={isSending}
              style={{
                border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px",
                fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
              }}
              onKeyDown={e => { if (e.key === "Enter") sendReport(); }}
            />
            {isSending && (
              <div style={{ fontSize: 12, color: "#C41E3A", textAlign: "center" }}>
                보고서 생성 중... 잠시만 기다려주세요 ⏳
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setEmailModal(false); setEmailInput(""); }}
                disabled={isSending}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #ddd",
                  background: "#f5f5f5", fontSize: 13, cursor: isSending ? "not-allowed" : "pointer",
                  color: "#555",
                }}
              >
                취소
              </button>
              <button
                onClick={sendReport}
                disabled={isSending}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: isSending ? "#ccc" : "#C41E3A", fontSize: 13,
                  cursor: isSending ? "not-allowed" : "pointer", color: "#fff", fontWeight: 600,
                }}
              >
                {isSending ? "전송 중..." : "발송"}
              </button>
            </div>
          </div>
        </div>
      )}

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
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ position: "relative", display: "inline-flex" }}>
              <button
                onClick={() => setEmailModal(true)}
                title="메일로 받기"
                style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#fde8e8")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
              >
                📧
              </button>
              {messages.filter(m => m.role === "user").length >= 3 && (
                <div style={{ position: "absolute", top: -2, right: -2, width: 6, height: 6, borderRadius: "50%", background: "#C41E3A" }} />
              )}
            </div>
            <button
              onClick={() => {
                clearStoredMessages(user?.id ?? null);
                setMessages([{ role: "bot", text: initialMessage }]);
              }}
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

      {/* FAQ 버튼 — 비로그인: 고정 3개, 로그인: 추후 맞춤 FAQ */}
      {!messages.some(m => m.role === "user") && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 12px 8px" }}>
        {(user && userFaq ? userFaq : guestFaq).map((q, i) => (
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
          disabled={isStreaming}
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
            ...(isStreaming ? { opacity: 0.5, cursor: "not-allowed" } : {}),
          }}
        />
        <button className="chatbot-send-btn" onClick={() => send()} disabled={isStreaming} style={isStreaming ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
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