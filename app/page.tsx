"use client";
import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import ChatBot from "@/components/ChatBot";
import { DEFAULT_YEAR, type TradeType } from "@/lib/data";

const WorldMap = dynamic(() => import("@/components/WorldMap"), { ssr: false });
const TreemapChart = dynamic(() => import("@/components/TreemapChart"), { ssr: false });

const MACRO_DATA = [
  { label: "USD/KRW", value: "1,372.5", change: "+0.3%", up: true },
  { label: "BDI (발틱지수)", value: "1,842", change: "-1.2%", up: false },
  { label: "두바이유 ($/bbl)", value: "82.4", change: "+0.8%", up: true },
  { label: "WTI ($/bbl)", value: "78.9", change: "+0.5%", up: true },
];

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
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [tradeType, setTradeType] = useState<TradeType>("수출");

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", padding: "20px 24px" }}>
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["국가별", "품목별"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={mainTab === tab ? "main-tab-active" : "main-tab-inactive"}
            >{tab}</button>
          ))}
        </div>

        {/* Dashboard card */}
        <div className="dashboard-card">
          <FilterBar
            mode={mainTab === "품목별" ? "product" : "country"}
            defaultYear={DEFAULT_YEAR}
            onYearChange={setYear}
            onTradeTypeChange={setTradeType}
          />

          <KPIBar year={year} tradeType={tradeType} />

          {/* Split panel */}
          <div className="split-panel">
            <div className="dashboard-area">
              {mainTab === "국가별" ? (
                <WorldMap year={year} tradeType={tradeType} />
              ) : (
                <div style={{ width: "100%", height: "100%", padding: 8 }}>
                  <TreemapChart year={year} tradeType={tradeType} />
                </div>
              )}
            </div>

            {chatOpen && (
              <ChatBot
                open={true}
                onToggle={() => setChatOpen(false)}
                initialMessage={
                  mainTab === "국가별"
                    ? "글로벌 무역통계 대시보드입니다. 특정 국가나 품목에 대해 질문해주세요."
                    : "품목별 수출 현황입니다. 특정 품목에 대해 질문해주세요."
                }
              />
            )}
          </div>
        </div>

        {/* Macro section */}
        <div className="macro-section">
          <div className="macro-title">거시경제 지표</div>
          <div className="macro-grid">
            {MACRO_DATA.map((item) => (
              <div key={item.label} className="macro-card">
                <div className="macro-card-label">{item.label}</div>
                <div className="macro-card-value">{item.value}</div>
                <div
                  className="macro-card-change"
                  style={{ color: item.up ? "#E02020" : "#185FA5" }}
                >
                  {item.change}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!chatOpen && (
        <button className="chatbot-open-btn" onClick={() => setChatOpen(true)}>↑</button>
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
