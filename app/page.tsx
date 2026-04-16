"use client";
import { useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
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
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [tradeType, setTradeType] = useState<TradeType>("수출");
  const [month, setMonth] = useState("");
  const [, setPeriod] = useState("annual");
  const [mtiDepth, setMtiDepth] = useState(3);
  const [productCountry, setProductCountry] = useState("");

  // 로딩 상태 관리 (WorldMap / TreemapChart)
  const [loadingCount, setLoadingCount] = useState(0);
  const isLoading = loadingCount > 0;
  const handleLoadingChange = useCallback((loading: boolean) => {
    setLoadingCount((c) => c + (loading ? 1 : -1));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div className="page-main-container">
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

        <div className="main-content-layout">
          {/* Dashboard card */}
          <div className="dashboard-card dashboard-main-card">
            <FilterBar
              mode={mainTab === "품목별" ? "product" : "country"}
              defaultYear={DEFAULT_YEAR}
              onYearChange={setYear}
              onMonthChange={setMonth}
              onPeriodChange={setPeriod}
              onTradeTypeChange={setTradeType}
              mtiDepth={mainTab === "품목별" ? mtiDepth : undefined}
              onMtiDepthChange={setMtiDepth}
              onCountryChange={setProductCountry}
            />

            <KPIBar year={year} tradeType={tradeType} />

            {/* Main dashboard content */}
            <div className="split-panel" style={{ position: "relative" }}>
              <div className="dashboard-area">
                {mainTab === "국가별" ? (
                <WorldMap year={year} month={month} tradeType={tradeType} onLoadingChange={handleLoadingChange} />
                ) : (
                  <div style={{ width: "100%", height: "100%", padding: 8 }}>
                    <TreemapChart year={year} month={month} tradeType={tradeType} mtiDepth={mtiDepth} forCountry={!!productCountry} countryName={productCountry || undefined} onLoadingChange={handleLoadingChange} />
                  </div>
                )}
              </div>

              {/* 로딩 오버레이 */}
              {isLoading && (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 50,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,0.6)",
                  backdropFilter: "blur(2px)",
                  borderRadius: 12,
                }}>
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  }}>
                    <svg width="36" height="36" viewBox="0 0 36 36" style={{ animation: "dash-spin 0.8s linear infinite" }}>
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#1A9088" strokeWidth="3"
                        strokeDasharray="66 22" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>로딩 중...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Macro section */}
        <MacroSection />
      </div>
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
