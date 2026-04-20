"use client";
import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { supabase } from "@/lib/supabase";
import { saveChatLog, getChatLogs } from "@/lib/chat";
import { getUserTier, type UserTier } from "@/lib/auth";
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

interface ChatMessage {
  role: "bot" | "user";
  text: string;
  routeButtons?: RouteButton[];
  kind?: "notice"; // 말풍선 variant — 연노랑 공지 박스로 분기
}

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

// 보고서 기능 안내 notice 의 현재 표준 문구 (주입 지점과 동일)
const NOTICE_TEXT_REPORT = "💡 대화 요약 보고서를 📋 PDF 또는 📧 메일로 받아보세요!";

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
    // notice 메시지는 과거 버전 문구가 저장되어 있을 수 있음 — 복원 시점에 현재 표준 문구로 정규화
    const normalized = msgs.map(m =>
      m.kind === "notice" && m.role === "bot" ? { ...m, text: NOTICE_TEXT_REPORT } : m
    );
    return normalized.length > 0 ? normalized : null;
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

/** 로그인 사용자의 채팅 로그·현재 화면 컨텍스트를 AI 에 보내 맞춤 FAQ 3개를 생성.
 *  회원은 반드시 본인의 대화 기반 생성 결과만 표시한다 — 정적 템플릿 폴백 금지.
 *  API 실패·유효하지 않은 응답이면 null 반환 → 호출부에서 FAQ 숨김. */
async function fetchUserFaq(
  logs: { role: string; content: string }[],
  pageContext?: PageContext,
): Promise<string[] | null> {
  try {
    const res = await fetch("/api/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs, pageContext }),
    });
    const { questions } = await res.json();
    if (Array.isArray(questions) && questions.length === 3 && questions.every((q: unknown) => typeof q === "string" && q.trim().length > 0)) {
      try { sessionStorage.setItem(USER_FAQ_KEY, JSON.stringify(questions)); } catch {}
      return questions;
    }
    return null;
  } catch {
    return null;
  }
}

function resolvePageContext(
  pathname: string | null,
  searchParams: URLSearchParams | null,
): PageContext | undefined {
  if (!pathname) return undefined;

  const year = searchParams?.get("year") ?? undefined;
  const month = searchParams?.get("month") ?? undefined;
  // URL 이중 규약: `tradeType` 이 쓰기 규약의 우선(Source of truth). `mode` 는 상세 페이지 라우트 호환용.
  // 두 값이 충돌하면(예: mode=export & tradeType=import) tradeType 의 값을 채택한다.
  const modeRaw = searchParams?.get("tradeType") ?? searchParams?.get("mode");
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
  // view 는 필터 유무와 상관없이 항상 tab 기준으로 결정 → LLM 이 현재 탭을 항상 인지
  if (pathname === "/") {
    const country = searchParams?.get("country")
      ? decodeURIComponent(searchParams.get("country")!)
      : undefined;
    const view: PageContext["view"] =
      tabParam === "product" ? "products" : "countries";
    return { country, year, month, tradeType: tradeType ?? "수출", view, mtiDepth };
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
  const [sentInSession, setSentInSession] = useState(false);

  // 이메일 모달 state
  const [emailModal, setEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  // PDF 모달 state
  const [pdfModal, setPdfModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // 회원 등급 (guest/free/paid) — 보고서 기능 gate
  const [userTier, setUserTier] = useState<UserTier>("guest");
  useEffect(() => {
    let cancelled = false;
    getUserTier().then(t => { if (!cancelled) setUserTier(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // 유료 회원이 아닐 때 표시할 안내 모달 상태
  const [tierGateModal, setTierGateModal] = useState(false);

  // 유료 회원이 아니면 안내 모달을 열고 false 반환
  const guardPaidReport = (): boolean => {
    if (userTier === "paid") return true;
    setTierGateModal(true);
    return false;
  };

  // 이메일 모달 열릴 때 유저 이메일 자동 채우기
  // user.email은 가입 시 `{username}@kstat.local` 내부 식별자이므로,
  // 실제 연락 이메일은 user_metadata.email에 저장된다 (lib/auth.ts signUp 참조).
  useEffect(() => {
    if (emailModal) {
      const realEmail = (user?.user_metadata as { email?: string } | undefined)?.email ?? "";
      setEmailInput(realEmail);
    }
    if (!emailModal) {
      setEmailInput("");
      setSendStatus("idle");
    }
  }, [emailModal, user]);

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
  // FAQ 로더에서 최신 messages를 참조하되 effect 재실행은 user 발화 수 변화에만 걸기 위한 ref
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; });
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

  // 로그인 사용자: AI 기반 맞춤 FAQ 로드 (free·paid 공통)
  // 트리거: user/open 변화 + 현재 세션의 user 발화 수가 늘어날 때
  // 데이터: DB 로그(getChatLogs) + 현재 세션 messages 병합 (DB 저장 전 최근 발화까지 반영)
  const sessionUserMsgCount = messages.filter(m => m.role === "user").length;
  useEffect(() => {
    if (!user) {
      setUserFaq(null);
      try { sessionStorage.removeItem(USER_FAQ_KEY); } catch {}
      return;
    }
    if (!open) return;

    // 세션 캐시가 있으면 우선 표시 (깜빡임 방지)
    const cached = getCachedUserFaq();
    if (cached) setUserFaq(cached);

    let cancelled = false;
    getChatLogs(30).then(dbLogs => {
      if (cancelled) return;

      // DB 로그 + 현재 세션 user 발화 병합 (DB에 없는 세션 발화만 추가)
      const dbUserContents = new Set(dbLogs.filter(l => l.role === "user").map(l => l.content));
      const sessionUserLogs = messagesRef.current
        .filter(m => m.role === "user" && !dbUserContents.has(m.text))
        .map(m => ({ role: "user" as const, content: m.text }));
      const combined = [
        ...dbLogs.map(l => ({ role: l.role, content: l.content })),
        ...sessionUserLogs,
      ];

      const hasUserMsgs = combined.filter(l => l.role === "user").length > 0;
      if (!hasUserMsgs) {
        if (!cancelled) {
          setUserFaq(null);
          try { sessionStorage.removeItem(USER_FAQ_KEY); } catch {}
        }
        return null;
      }
      // 현재 화면 컨텍스트도 함께 전송 — Haiku 가 기능·뷰 심화 질문을 제안하도록
      const pageCtx = resolvePageContext(pathname, searchParams);
      return fetchUserFaq(combined, pageCtx);
    }).then(faq => {
      if (cancelled) return;
      if (faq) {
        setUserFaq(faq);
      } else {
        setUserFaq(null);
        try { sessionStorage.removeItem(USER_FAQ_KEY); } catch {}
      }
    }).catch(() => {
      if (!cancelled) {
        setUserFaq(null);
        try { sessionStorage.removeItem(USER_FAQ_KEY); } catch {}
      }
    });
    return () => { cancelled = true; };
    // pathname/searchParams 는 pageContext 를 위해 참조하지만, 챗봇 재오픈 또는 발화 수 변화로만 재실행.
    // 페이지 이동 시마다 FAQ API 가 호출되지 않도록 의도적으로 deps 에서 제외.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open, sessionUserMsgCount]);

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
      setTimeout(() => {
        setMessages(prev => [...prev, { role: "bot", text: NOTICE_TEXT_REPORT, kind: "notice" }]);
      }, 1000);
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
          setTimeout(() => {
            setMessages(prev => [...prev, { role: "bot", text: NOTICE_TEXT_REPORT, kind: "notice" }]);
          }, 1000);
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
        setTimeout(() => {
          setMessages(prev => [...prev, { role: "bot", text: NOTICE_TEXT_REPORT, kind: "notice" }]);
        }, 1000);
      } catch {
        setMessages([{ role: "bot", text: fallback }]);
        setTimeout(() => {
          setMessages(prev => [...prev, { role: "bot", text: NOTICE_TEXT_REPORT, kind: "notice" }]);
        }, 1000);
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
    setSendStatus("sending");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const reportRes = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          messages,
          userName: user?.user_metadata?.name ?? null
        }),
      });
      if (reportRes.status === 403) {
        setEmailModal(false);
        setSendStatus("idle");
        setTierGateModal(true);
        return;
      }
      const reportData = await reportRes.json();
      console.log("report 응답:", reportData);

      const emailRes = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailInput, html: reportData.html }),
      });
      const emailData = await emailRes.json();
      console.log("email 응답:", emailData);
      setSendStatus("done");
      setTimeout(() => {
        setEmailModal(false);
        setEmailInput("");
        setSendStatus("idle");
      }, 5000);
    } catch (e) {
      console.error("오류:", e);
      setSendStatus("error");
    }
  };

  const downloadPdf = async () => {
    setIsDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const reportRes = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          messages,
          userName: user?.user_metadata?.name ?? null
        }),
      });
      if (reportRes.status === 403) {
        setIsDownloading(false);
        setPdfModal(false);
        setTierGateModal(true);
        return;
      }
      const reportData = await reportRes.json();

      // html2pdf 동적 로드
      const html2pdf = (await import("html2pdf.js")).default;
      const element = document.createElement("div");
      element.innerHTML = reportData.html;
      document.body.appendChild(element);

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "").slice(2);
      await html2pdf().set({
        margin: 0,
        filename: `K-stat_대화요약리포트_${today}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(element).save();

      document.body.removeChild(element);
      setPdfModal(false);
    } catch (e) {
      console.error("PDF 오류:", e);
      alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsDownloading(false);
    }
  };

  const send = async (overrideMsg?: string) => {
    const msgToSend = overrideMsg ?? input;
    if (!msgToSend.trim() || isStreaming) return;
    const userMsg = msgToSend.trim();
    if (!overrideMsg) setInput("");
    setIsStreaming(true);
    setSentInSession(true);

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
          body: JSON.stringify({ question: userMsg, answer: fullResponse, pageContext }),
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
            <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>📧 대화 내용 요약 리포트 받기</div>
            <input
              type="email"
              placeholder="이메일 주소 입력"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              disabled={sendStatus === "sending"}
              style={{
                border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px",
                fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
              }}
              onKeyDown={e => { if (e.key === "Enter") sendReport(); }}
            />
            {sendStatus === "sending" && (
              <div style={{ fontSize: 12, color: "#C41E3A", textAlign: "center" }}>
                보고서 생성 중... 잠시만 기다려주세요 ⏳
              </div>
            )}
            {sendStatus === "done" && (
              <div style={{ fontSize: 12, color: "#2e7d32", textAlign: "center", fontWeight: 600 }}>
                ✅ 전송 완료! 메일을 확인해주세요
              </div>
            )}
            {sendStatus === "error" && (
              <div style={{ fontSize: 12, color: "#C41E3A", textAlign: "center" }}>
                ❌ 오류가 발생했습니다. 다시 시도해주세요
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setEmailModal(false); setEmailInput(""); setSendStatus("idle"); }}
                disabled={sendStatus === "sending" || sendStatus === "done"}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #ddd",
                  background: "#f5f5f5", fontSize: 13, cursor: (sendStatus === "sending" || sendStatus === "done") ? "not-allowed" : "pointer",
                  color: "#555",
                }}
              >
                취소
              </button>
              <button
                onClick={sendReport}
                disabled={sendStatus === "sending" || sendStatus === "done"}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: (sendStatus === "sending" || sendStatus === "done") ? "#ccc" : "#C41E3A", fontSize: 13,
                  cursor: (sendStatus === "sending" || sendStatus === "done") ? "not-allowed" : "pointer", color: "#fff", fontWeight: 600,
                }}
              >
                {sendStatus === "sending" ? "전송 중..." : "발송"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF 확인 모달 */}
      {pdfModal && (
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
            <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>📋 PDF 다운로드</div>
            <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.6 }}>
              대화 내용 요약 보고서를 PDF로 다운받으시겠습니까?
            </p>
            {isDownloading && (
              <div style={{ fontSize: 12, color: "#C41E3A", textAlign: "center" }}>
                PDF 생성 중... 잠시만 기다려주세요 ⏳
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setPdfModal(false)}
                disabled={isDownloading}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #ddd",
                  background: "#f5f5f5", fontSize: 13, cursor: isDownloading ? "not-allowed" : "pointer",
                  color: "#555",
                }}
              >
                취소
              </button>
              <button
                onClick={downloadPdf}
                disabled={isDownloading}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                  background: isDownloading ? "#ccc" : "#C41E3A", fontSize: 13,
                  cursor: isDownloading ? "not-allowed" : "pointer", color: "#fff", fontWeight: 600,
                }}
              >
                {isDownloading ? "생성 중..." : "다운로드"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 유료 회원 전용 안내 모달 (게스트·무료 공통) */}
      {tierGateModal && (
        <div
          onClick={() => setTierGateModal(false)}
          style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, borderRadius: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, padding: "24px 20px",
              width: 300, display: "flex", flexDirection: "column", gap: 14,
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              position: "relative",
            }}
          >
            <button
              onClick={() => setTierGateModal(false)}
              aria-label="닫기"
              style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer", lineHeight: 1 }}
            >
              ✕
            </button>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>
              📋 대화 요약 보고서
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.6 }}>
              {userTier === "guest"
                ? "대화 요약 보고서(PDF·이메일)는 유료 회원 전용 기능입니다.\n로그인 후 회원사 가입을 신청해주세요."
                : "대화 요약 보고서(PDF·이메일)는 유료 회원 전용 기능입니다.\n회원사 가입을 신청하시면 관리자 승인 후 이용하실 수 있습니다."}
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
              <a
                href={userTier === "guest" ? "/login" : "/upgrade"}
                style={{
                  padding: "10px 20px", borderRadius: 8, background: "#C41E3A",
                  color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none",
                  textAlign: "center", minWidth: 160,
                }}
              >
                {userTier === "guest" ? "로그인 / 회원가입" : "회원사 가입하기"}
              </a>
            </div>
          </div>
        </div>
      )}


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
              {((user.user_metadata as { name?: string; username?: string; email?: string } | undefined)?.name
                ?? (user.user_metadata as { username?: string } | undefined)?.username
                ?? (user.user_metadata as { email?: string } | undefined)?.email
                ?? "")}님 로그인 중
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
                onClick={() => { if (guardPaidReport()) setEmailModal(true); }}
                title={userTier === "paid" ? "메일로 받기" : "유료 회원 전용"}
                style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: userTier === "paid" ? 1 : 0.6 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#fde8e8")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
              >
                📧
              </button>
              {userTier === "paid" && messages.filter(m => m.role === "user").length >= 3 && (
                <div style={{ position: "absolute", top: -2, right: -2, width: 6, height: 6, borderRadius: "50%", background: "#C41E3A" }} />
              )}
            </div>
            <button
              onClick={() => { if (guardPaidReport()) setPdfModal(true); }}
              title={userTier === "paid" ? "PDF로 받기" : "유료 회원 전용"}
              style={{ width: 22, height: 22, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: userTier === "paid" ? 1 : 0.6 }}
              onMouseEnter={e => (e.currentTarget.style.background = "#fde8e8")}
              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
            >
              📋
            </button>
            <button
              onClick={() => {
                // sessionStorage + 발화 기록 초기화
                clearStoredMessages(user?.id ?? null);
                setMessages([]);
                // FAQ 숨김 플래그 해제 → 로그인 사용자의 맞춤 FAQ 재표시
                setSentInSession(false);
                // welcome 재-페치 허용 → 로그인 사용자는 개인화 인사말 다시 받기
                welcomeFetchedRef.current = false;
                hasRestoredRef.current = false;
                setWelcomeTrigger(t => t + 1);
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
                style={
                  msg.kind === "notice"
                    ? { fontSize, background: "#FEF3C7", color: "#92400E" }
                    : { fontSize }
                }
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

      {/* FAQ 버튼 — 비로그인: 첫 메시지 전까지만, 로그인: 맞춤 FAQ (현재 세션에서 질문 전까지) */}
      {(user ? (!!userFaq && !sentInSession) : !messages.some(m => m.role === "user")) && (
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