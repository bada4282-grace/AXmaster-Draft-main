"use client";
import { useState, Suspense } from "react";
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
            <div className="split-panel">
              <div className="dashboard-area">
                {mainTab === "국가별" ? (
                <WorldMap year={year} month={month} tradeType={tradeType} />
                ) : (
                  <div style={{ width: "100%", height: "100%", padding: 8 }}>
                    <TreemapChart year={year} month={month} tradeType={tradeType} mtiDepth={mtiDepth} forCountry={!!productCountry} countryName={productCountry || undefined} />
                  </div>
                )}
              </div>
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
