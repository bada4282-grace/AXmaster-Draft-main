"use client";
import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import {
  getCountryByName,
  getCountryTimeseries,
  getCountryKpi,
  DEFAULT_YEAR,
  type TradeType,
} from "@/lib/data";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { RechartsPayloadTooltip, rechartsTooltipSurfaceProps } from "@/components/RechartsTooltip";

const TreemapChart = dynamic(() => import("@/components/TreemapChart"), { ssr: false });

function CountryDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = decodeURIComponent(params.name as string);

  const initialTradeType: TradeType = searchParams.get("mode") === "import" ? "수입" : "수출";
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [month, setMonth] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>(initialTradeType);
  const [subTab, setSubTab] = useState<"품목별" | "시계열 추이">("품목별");
  const [mtiDepth, setMtiDepth] = useState(3);


  // 연도·수출입 모드에 따라 순위·비중이 달라짐
  const country = getCountryByName(name, year, tradeType) ?? {
    name, iso: "??", region: "기타", rank: 1,
    export: "0", import: "0", region2: "기타",
    topProducts: [], nameEn: name, share: 0,
  };

  // 해당 국가의 연도별 KPI
  const kpi = getCountryKpi(year, name);
  const timeseries = getCountryTimeseries(year, name);

  // Y축 깔끔한 눈금 계산 (50, 100, 150… 같은 round number)
  function niceScale(rawMin: number, rawMax: number, targetTicks = 5) {
    const range = rawMax - rawMin || 1;
    const rawStep = range / (targetTicks - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = ([1, 2, 5, 10].map((f) => f * mag).find((s) => s >= rawStep) ?? mag * 10);
    const min = Math.floor(rawMin / step) * step;
    const max = Math.ceil(rawMax / step) * step;
    const ticks: number[] = [];
    for (let v = min; v <= max + step * 0.01; v = Math.round((v + step) * 1e9) / 1e9) ticks.push(v);
    return { min, max, step, ticks };
  }

  const allValues = timeseries.flatMap((d) => [d.export, d.import]);
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 100;
  const leftScale = niceScale(rawMin * 0.9, rawMax * 1.1);
  const minVal = leftScale.min;
  const maxVal = leftScale.max;

  const balances = timeseries.map((d) => d.balance);
  const rawMinBal = balances.length ? Math.min(...balances) : -50;
  const rawMaxBal = balances.length ? Math.max(...balances) : 50;
  const balScale = niceScale(
    rawMinBal < 0 ? rawMinBal * 1.1 : rawMinBal * 0.9,
    rawMaxBal > 0 ? rawMaxBal * 1.1 : rawMaxBal * 0.9,
  );
  const minBal = balScale.min;
  const maxBal = balScale.max;

  const flatData = timeseries.map((d) => ({
    ...d,
    export: minVal,
    import: minVal,
    balance: minBal,
  }));

  const [displayData, setDisplayData] = useState(flatData);
  const [lineAnimActive, setLineAnimActive] = useState(false);

  useEffect(() => {
    setLineAnimActive(false);
    setDisplayData(flatData);

    const startTimeout = setTimeout(() => {
      setLineAnimActive(true);
      setDisplayData(timeseries);
    }, 50);

    const stopTimeout = setTimeout(() => {
      setLineAnimActive(false);
    }, 850);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(stopTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, subTab]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div className="page-main-container">
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="main-tab-active" onClick={() => router.push("/")}>국가별</button>
          <button className="main-tab-inactive" onClick={() => router.push("/?tab=product")}>품목별</button>
        </div>

        <div className="main-content-layout">
          {/* Dashboard card */}
          <div className="dashboard-card dashboard-main-card">
            <FilterBar
              mode="country"
              showCountrySelect={country.name}
              defaultYear={DEFAULT_YEAR}
              onYearChange={setYear}
              onMonthChange={setMonth}
              onTradeTypeChange={setTradeType}
              disableMonthPeriod={subTab === "시계열 추이"}
            />

            {kpi ? (
              <KPIBar
                tradeType={tradeType}
                exportVal={kpi.export}
                importVal={kpi.import}
                balance={kpi.balance}
                balancePositive={kpi.positive}
              />
            ) : (
              <KPIBar year={year} tradeType={tradeType} />
            )}

            <div className="split-panel">
            {/* Left info cards */}
            <div className="left-cards">
              <div className="left-cards-stack">
                <div className="info-card">
                  <div className="info-card-label" style={{ fontSize: 12 }}>선택 국가</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{country.name}</div>
                </div>

                <div className="info-card">
                  <div className="info-card-label" style={{ fontSize: 12 }}>{tradeType} 국가 순위 ({year})</div>
                  <div className="info-card-value">{country.rank}위</div>
                </div>

                <div className="info-card">
                  <div className="info-card-label" style={{ fontSize: 12 }}>{tradeType} 비중</div>
                  <div className="info-card-value">{country.share}%</div>
                </div>
              </div>
            </div>

            {/* Main viz */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Breadcrumb */}
              <div style={{ fontSize: 11, color: "#94a3b8", padding: "4px 8px 0" }}>
                <span
                  style={{ cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => router.push("/?tab=country")}
                >전체</span>
                <span style={{ margin: "0 4px" }}>›</span>
                <span style={{ color: "#475569", fontWeight: 600 }}>{country.name}</span>
              </div>

              {/* Sub tabs */}
              <div className="subtab-bar">
                {(["품목별", "시계열 추이"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSubTab(tab)}
                    className={subTab === tab ? "subtab-active" : "subtab-inactive"}
                  >{tab}</button>
                ))}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  {subTab === "시계열 추이" && (
                    <>
                      {year === "2026" && (
                        <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
                          ⚠ 불완전 연도 (1~2월)
                        </span>
                      )}
                    </>
                  )}
                  {subTab === "품목별" && (
                    <select
                      value={mtiDepth}
                      onChange={(e) => setMtiDepth(Number(e.target.value))}
                      className="filter-select"
                      style={{ width: 140 }}
                    >
                      <option value={1}>1단위 (대분류)</option>
                      <option value={2}>2단위 (중분류)</option>
                      <option value={3}>3단위 (소분류)</option>
                      <option value={4}>4단위</option>
                      <option value={6}>6단위 (최소분류)</option>
                    </select>
                  )}
                  <button className="back-btn" onClick={() => router.push("/")}>← 돌아가기</button>
                </div>
              </div>

              <div style={{ flex: 1, padding: 8, overflow: "hidden" }}>
                {subTab === "품목별" ? (
                  <TreemapChart forCountry countryName={country.name} year={year} month={month} tradeType={tradeType} mtiDepth={mtiDepth} />
                ) : timeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayData} margin={{ top: 8, right: 44, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis
                        yAxisId="left"
                        domain={[minVal, maxVal]}
                        ticks={leftScale.ticks}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `$${v}억`}
                        width={52}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[minBal, maxBal]}
                        ticks={balScale.ticks}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${v}억`}
                        width={44}
                      />
                      <Tooltip
                        content={(props) => (
                          <RechartsPayloadTooltip {...props} title={country.name} />
                        )}
                        {...rechartsTooltipSurfaceProps}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line yAxisId="left" type="monotone" dataKey="export" stroke="#185FA5"
                        strokeWidth={2} dot={{ r: 3 }} name="수출"
                        isAnimationActive={lineAnimActive}
                        animationDuration={700} animationEasing="ease-out" />
                      <Line yAxisId="left" type="monotone" dataKey="import" stroke="#F97316"
                        strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} name="수입"
                        isAnimationActive={lineAnimActive}
                        animationDuration={700} animationEasing="ease-out" />
                      <Line yAxisId="right" type="monotone" dataKey="balance" stroke="#22C55E"
                        strokeWidth={2} dot={{ r: 3 }} name="무역수지"
                        isAnimationActive={lineAnimActive}
                        animationDuration={700} animationEasing="ease-out" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                    height: "100%", color: "#94a3b8", fontSize: 13 }}>
                    {year}년 {country.name} 데이터가 없습니다.
                  </div>
                )}
              </div>
            </div>

            </div>
          </div>

        </div>

        <div className="macro-section">
          <div className="macro-title">거시경제 지표</div>
        </div>
      </div>
    </div>
  );
}

export default function CountryDetailPage() {
  return (
    <Suspense fallback={null}>
      <CountryDetailContent />
    </Suspense>
  );
}
