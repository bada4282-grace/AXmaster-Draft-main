"use client";
import { useState, useRef, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import ChatBot from "@/components/ChatBot";
import { DEFAULT_YEAR, type TradeType } from "@/lib/data";
import MacroSection from "@/components/MacroSection";

const WorldMap = dynamic(() => import("@/components/WorldMap"), { ssr: false });
const TreemapChart = dynamic(() => import("@/components/TreemapChart"), { ssr: false });


function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") === "product" ? "품목별" : "국가별";
  const [mainTab, setMainTab] = useState<"국가별" | "품목별">(initialTab);

  const handleTabChange = (tab: "국가별" | "품목별") => {
    setMainTab(tab);
    router.replace(`/?tab=${tab === "국가별" ? "country" : "product"}`);
  };
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(220);
  const splitPanelRef = useRef<HTMLDivElement>(null);
  const [splitPanelWidth, setSplitPanelWidth] = useState(0);

  /* split-panel 너비를 감시해 최대 챗봇 너비(절반)를 계산 */
  useEffect(() => {
    const el = splitPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setSplitPanelWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxChatWidth = splitPanelWidth > 0 ? Math.floor(splitPanelWidth / 2) : 550;

  const [year, setYear] = useState(DEFAULT_YEAR);
  const [tradeType, setTradeType] = useState<TradeType>("수출");
  const [month, setMonth] = useState("");
  const [, setPeriod] = useState("annual");

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", padding: "20px 24px" }}>
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          {(["국가별", "품목별"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={mainTab === tab ? "main-tab-active" : "main-tab-inactive"}
              style={tab === "국가별" ? { transform: "translateX(6px)" } : undefined}
            >{tab}</button>
          ))}
        </div>

        {/* Dashboard card */}
        <div className="dashboard-card">
          <FilterBar
            mode={mainTab === "품목별" ? "product" : "country"}
            defaultYear={DEFAULT_YEAR}
            onYearChange={setYear}
            onMonthChange={setMonth}
            onPeriodChange={setPeriod}
            onTradeTypeChange={setTradeType}
          />

          <KPIBar year={year} tradeType={tradeType} />

          {/* Split panel */}
          <div className="split-panel" ref={splitPanelRef}>
            <div className="dashboard-area">
              {mainTab === "국가별" ? (
                <WorldMap year={year} month={month} tradeType={tradeType} />
              ) : (
                <div style={{ width: "100%", height: "100%", padding: 8 }}>
                  <TreemapChart year={year} month={month} tradeType={tradeType} />
                </div>
              )}
            </div>

            {chatOpen && (
              <ChatBot
                open={true}
                onToggle={() => setChatOpen(false)}
                width={Math.min(chatWidth, maxChatWidth)}
                onWidthChange={w => setChatWidth(Math.min(w, maxChatWidth))}
                maxWidth={maxChatWidth}
                year={year}
                initialMessage={
                  mainTab === "국가별"
                    ? "글로벌 무역통계 대시보드입니다. 특정 국가나 품목에 대해 질문해주세요."
                    : "품목별 수출 현황입니다. 특정 품목에 대해 질문해주세요."
                }
              />
            )}
          </div>
        </div>

        <MacroSection />
      </div>

      {!chatOpen && (
        <button className="chatbot-open-btn" onClick={() => setChatOpen(true)}>🤖</button>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
