"use client";
import { Suspense, useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import MacroSection from "@/components/MacroSection";
import {
  getTreemapData,
  getCountryTreemapData,
  getAggregatedProductTrend,
  getAggregatedTopCountries,
  aggregateTreemapByDepth,
  DEFAULT_YEAR,
  type TradeType,
} from "@/lib/data";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  RechartsPayloadTooltip,
  RechartsBarCountryTooltip,
  rechartsTooltipSurfaceProps,
} from "@/components/RechartsTooltip";

export default function ProductDetailPage() {
  return (
    <Suspense>
      <ProductDetailContent />
    </Suspense>
  );
}

function ProductDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = decodeURIComponent(params.name as string);
  const codeParam = searchParams.get("code") ?? "";

  const [year, setYear] = useState(DEFAULT_YEAR);
  const [tradeType, setTradeType] = useState<TradeType>("수출");
  const [country, setCountry] = useState("");
  const [subTab, setSubTab] = useState<"금액 추이" | "상위 국가">("금액 추이");

  // 해당 품목 정보 찾기 (6단위 또는 집계 코드)
  const treemapData = getTreemapData(DEFAULT_YEAR, tradeType);
  const isAggregated = codeParam.length > 0 && codeParam.length < 6;

  // 6단위: 기존 방식으로 찾기 / 집계: aggregateTreemapByDepth로 찾기
  const product = isAggregated
    ? aggregateTreemapByDepth(treemapData, codeParam.length).find((p) => p.code === codeParam)
      ?? aggregateTreemapByDepth(getTreemapData(DEFAULT_YEAR, "수출"), codeParam.length).find((p) => p.code === codeParam)
    : treemapData.find((p) => p.name === name)
      ?? getTreemapData(DEFAULT_YEAR, "수출").find((p) => p.name === name);

  const productCode = codeParam || (product?.code ?? "");

  // 해당 품목의 연간 추이 (tradeType 반영, 국가 선택 시 국가별 데이터)
  const rawTrend = productCode
    ? country
      ? ["2020", "2021", "2022", "2023", "2024", "2025", "2026"].map((y) => {
          const base = getCountryTreemapData(y, country, tradeType);
          if (isAggregated) {
            const agg = aggregateTreemapByDepth(base, codeParam.length).find((p) => p.code === codeParam);
            return { year: y, value: agg?.value ?? 0 };
          }
          const d = base.find((p) => p.name === name);
          return { year: y, value: d?.value ?? 0 };
        })
      : getAggregatedProductTrend(productCode, tradeType)
    : [];
  // "2026(1-2월)" → "2026" 으로 정리, 괄호가 있으면 불완전 데이터로 표시
  const incompleteYears = new Set<string>();
  const trend = rawTrend.map((d) => {
    const clean = d.year.replace(/\(.*\)/, "").trim();
    if (clean !== d.year) incompleteYears.add(clean);
    return { ...d, year: clean };
  });
  const trendValues = trend.map((d) => d.value).filter((v) => v > 0);
  const trendMin = trendValues.length ? Math.floor(Math.min(...trendValues) * 0.85) : 0;
  const trendMax = trendValues.length ? Math.ceil(Math.max(...trendValues) * 1.1) : 100;

  // 상위 국가 (tradeType 반영)
  const topCountries = productCode ? getAggregatedTopCountries(productCode, year, tradeType).slice(0, 10) : [];

  // ── 애니메이션: 국가 상세 페이지와 동일한 패턴 ──
  const flatTrend = trend.map((d) => ({ ...d, value: trendMin }));
  const flatCountries = topCountries.map((d) => ({ ...d, value: 0 }));

  const [displayTrend, setDisplayTrend] = useState(flatTrend);
  const [displayCountries, setDisplayCountries] = useState(flatCountries);
  const [animActive, setAnimActive] = useState(false);

  useEffect(() => {
    setAnimActive(false);
    setDisplayTrend(flatTrend);
    setDisplayCountries(flatCountries);

    const startId = setTimeout(() => {
      setAnimActive(true);
      setDisplayTrend(trend);
      setDisplayCountries(topCountries);
    }, 50);

    const stopId = setTimeout(() => {
      setAnimActive(false);
    }, 850);

    return () => {
      clearTimeout(startId);
      clearTimeout(stopId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, year, tradeType]);

  // 현재 연도 금액 & 전년 대비 증감 — 추이 데이터에서 직접 조회 (Top30 제한 없음)
  const prevYear = String(parseInt(year) - 1);
  const currentVal = trend.find((d) => d.year === year)?.value ?? 0;
  const prevVal = trend.find((d) => d.year === prevYear)?.value ?? 0;
  const changeRate = prevVal ? ((currentVal - prevVal) / prevVal * 100).toFixed(1) : null;
  const tradeLabel = tradeType === "수입" ? "수입" : "수출";
  const tooltipFollowProps = {
    ...rechartsTooltipSurfaceProps,
    isAnimationActive: false,
    cursor: false,
    offset: 18,
    position: undefined,
    reverseDirection: { x: true, y: true },
    allowEscapeViewBox: { x: false, y: false },
    wrapperStyle: {
      ...rechartsTooltipSurfaceProps.wrapperStyle,
      transition: "none",
      pointerEvents: "none",
    },
  } as const;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div className="page-main-container">
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="main-tab-inactive" onClick={() => router.push("/")}>국가별</button>
          <button className="main-tab-active">품목별</button>
        </div>

        <div className="main-content-layout">
          {/* Dashboard card */}
          <div className="dashboard-card dashboard-main-card">
            <FilterBar mode="product" defaultYear={DEFAULT_YEAR} onYearChange={setYear} onTradeTypeChange={setTradeType} onCountryChange={setCountry} disableMonthPeriod />
            <KPIBar year={year} />

            <div className="split-panel" style={{ height: 380 }}>
            {/* Left info cards */}
            <div className="left-cards">
              <div className="left-cards-stack">
                <div className="info-card">
                  <div className="info-card-label">품목명</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{name}</div>
                  {productCode && (
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                      MTI {productCode}{isAggregated && " (집계)"}
                    </div>
                  )}
                </div>

                <div className="info-card">
                  <div className="info-card-label">{year}년 {tradeLabel}액</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {currentVal.toLocaleString()} 억
                  </div>
                  <div style={{ fontSize: 10, color: "#888", fontWeight: 500 }}>달러</div>
                </div>

                {changeRate !== null && (
                  <div className="info-card">
                    <div className="info-card-label">전년 대비</div>
                    <div style={{
                      fontSize: 18, fontWeight: 900,
                      color: parseFloat(changeRate) >= 0 ? "#E02020" : "#185FA5",
                    }}>
                      {Math.abs(parseFloat(changeRate))}%
                    </div>
                    <div style={{ fontSize: 10, color: parseFloat(changeRate) >= 0 ? "#E02020" : "#185FA5", fontWeight: 500 }}>
                      {parseFloat(changeRate) >= 0 ? "상승" : "하락"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main viz */}
            <div className="dashboard-area" style={{ display: "flex", flexDirection: "column" }}>
              {/* Sub tabs */}
              <div className="subtab-bar">
                {(["금액 추이", "상위 국가"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSubTab(tab)}
                    className={subTab === tab ? "subtab-active" : "subtab-inactive"}
                  >{tab}</button>
                ))}
                <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4, alignSelf: "center" }}>
                  * 연간 기준 (월 선택과 무관)
                </span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="back-btn" onClick={() => router.push("/?tab=product")}>← 돌아가기</button>
                </div>
              </div>

              <div style={{ flex: 1, padding: 12, overflow: "hidden" }}>
                {subTab === "금액 추이" ? (
                  trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={displayTrend} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                        <YAxis domain={[trendMin, trendMax]} tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}억`} />
                        <Tooltip
                          content={(props) => (
                            <RechartsPayloadTooltip {...props} title={name} incompleteLabels={incompleteYears} />
                          )}
                          {...tooltipFollowProps}
                        />
                        <Line
                          type="monotone" dataKey="value" stroke="#14B8A6" strokeWidth={2.5}
                          dot={{ r: 4, fill: "#14B8A6" }} activeDot={{ r: 6 }} name={`${tradeLabel}액(억$)`}
                          isAnimationActive={animActive}
                          animationDuration={700} animationEasing="ease-out"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      height: "100%", color: "#94a3b8", fontSize: 13 }}>
                      추이 데이터가 없습니다.
                    </div>
                  )
                ) : (
                  topCountries.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={displayCountries} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="country" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}억`} />
                        <Tooltip
                          content={(props) => <RechartsBarCountryTooltip {...props} tradeLabel={tradeLabel} />}
                          {...tooltipFollowProps}
                        />
                        <Bar
                          dataKey="value"
                          fill="#14B8A6"
                          radius={[4, 4, 0, 0]}
                          barSize={42}
                          name={`${tradeLabel}액(억$)`}
                          isAnimationActive={animActive}
                          animationDuration={700} animationEasing="ease-out"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                      height: "100%", color: "#94a3b8", fontSize: 13 }}>
                      데이터가 없습니다.
                    </div>
                  )
                )}
              </div>
            </div>

            </div>
          </div>

        </div>

        <MacroSection />
      </div>
    </div>
  );
}