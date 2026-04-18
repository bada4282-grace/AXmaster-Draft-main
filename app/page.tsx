"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
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

  // URL에서 필터 상태를 초기 하이드레이트 — 새로고침/챗봇의 pageContext 추출에 대응
  const initialMode = searchParams.get("mode") === "import" ? "수입" : "수출";
  const initialYear = searchParams.get("year") ?? DEFAULT_YEAR;
  const initialMonth = searchParams.get("month") ?? "";
  const initialCountry = searchParams.get("country") ?? "";
  const initialMtiDepth = Number(searchParams.get("mtiDepth") ?? 3);

  const [year, setYear] = useState(initialYear);
  const [tradeType, setTradeType] = useState<TradeType>(initialMode);
  const [month, setMonth] = useState(initialMonth);
  const [, setPeriod] = useState("annual");
  const [mtiDepth, setMtiDepth] = useState(initialMtiDepth);
  const [productCountry, setProductCountry] = useState(initialCountry);
  const [mtiCategoryActive, setMtiCategoryActive] = useState(false);

  // 필터 상태 변경 시 URL 동기화 — 챗봇이 pageContext를 URL에서 읽어낼 수 있도록
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", mainTab === "국가별" ? "country" : "product");
    if (year && year !== DEFAULT_YEAR) params.set("year", year);
    if (tradeType === "수입") params.set("mode", "import");
    if (month) params.set("month", month);
    if (productCountry) params.set("country", productCountry);
    if (mtiDepth && mtiDepth !== 3) params.set("mtiDepth", String(mtiDepth));
    const next = `/?${params.toString()}`;
    if (typeof window !== "undefined" && window.location.pathname + window.location.search !== next) {
      router.replace(next, { scroll: false });
    }
  }, [mainTab, year, tradeType, month, productCountry, mtiDepth, router]);

  const handleTabChange = (tab: "국가별" | "품목별") => {
    setMainTab(tab);
  };

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
        {/* Main tabs — 국가별/품목별 (dashboard-card 바깥 위쪽) */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className={mainTab === "국가별" ? "main-tab-active" : "main-tab-inactive"}
            onClick={() => handleTabChange("국가별")}
          >국가별</button>
          <button
            className={mainTab === "품목별" ? "main-tab-active" : "main-tab-inactive"}
            onClick={() => handleTabChange("품목별")}
          >품목별</button>
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

            <KPIBar year={year} month={month} tradeType={tradeType} />

            {/* Main dashboard content */}
            <div className="split-panel" style={{ position: "relative" }}>
              <div className="dashboard-area">
                {mainTab === "국가별" ? (
                <WorldMap year={year} month={month} tradeType={tradeType} onLoadingChange={handleLoadingChange} />
                ) : (
                  <div style={{ width: "100%", height: "100%", padding: 8 }}>
                    <TreemapChart year={year} month={month} tradeType={tradeType} mtiDepth={mtiDepth} forCountry={!!productCountry} countryName={productCountry || undefined} onLoadingChange={handleLoadingChange} onCategoryChange={(mti) => setMtiCategoryActive(mti !== null)} />
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
