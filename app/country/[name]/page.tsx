"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import {
  DEFAULT_YEAR,
  type TradeType,
  type CountryData,
  type MonthlyData,
} from "@/lib/data";
import {
  getCountryRankingAsync,
  getCountryKpiAsync,
  getCountryTimeseriesAsync,
  type CountryKPIAsync,
} from "@/lib/dataSupabase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { RechartsPayloadTooltip, rechartsTooltipSurfaceProps } from "@/components/RechartsTooltip";

const TreemapChart = dynamic(() => import("@/components/TreemapChart"), { ssr: false });
import MacroSection from "@/components/MacroSection";

function CountryDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = decodeURIComponent(params.name as string);

  const initialTradeType: TradeType = searchParams.get("mode") === "import" ? "수입" : "수출";
  const initialYear = searchParams.get("year") ?? DEFAULT_YEAR;
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>(initialTradeType);
  const [subTab, setSubTab] = useState<"품목별" | "시계열 추이">(
    searchParams.get("tab") === "timeseries" ? "시계열 추이" : "품목별"
  );
  const [mtiDepth, setMtiDepth] = useState(
    Number(searchParams.get("mtiDepth") ?? 3)
  );
  const [mtiCategoryActive, setMtiCategoryActive] = useState(false);

  const [loadingCount, setLoadingCount] = useState(0);
  const isLoading = loadingCount > 0;
  const handleLoadingChange = useCallback((loading: boolean) => {
    setLoadingCount((c) => c + (loading ? 1 : -1));
  }, []);

  // 국가 데이터 — Supabase에서 비동기 로드
  const defaultCountry: CountryData = {
    name, iso: "??", region: "기타", rank: 1,
    export: "0", import: "0", nameEn: name,
    topProducts: [], topImportProducts: [], share: 0,
  };
  const [country, setCountry] = useState<CountryData>(defaultCountry);
  const [kpi, setKpi] = useState<CountryKPIAsync | undefined>(undefined);
  const [prevKpi, setPrevKpi] = useState<CountryKPIAsync | undefined>(undefined);
  const [timeseries, setTimeseries] = useState<MonthlyData[]>([]);

  useEffect(() => {
    let cancelled = false;
    const prevYearStr = String(parseInt(year) - 1);

    // 국가 순위
    getCountryRankingAsync(year, tradeType).then(ranks => {
      if (cancelled) return;
      const fmt1 = (v: number) => (Math.round(v / 1e8 * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const r = ranks.find(r => r.country === name);
      if (r) {
        setCountry({
          ...defaultCountry,
          rank: tradeType === "수입" ? r.rank_imp : r.rank_exp,
          export: fmt1(r.exp_amt),
          import: fmt1(r.imp_amt),
          share: tradeType === "수입" ? r.share_imp : r.share_exp,
        });
      }
    }).catch(() => {});

    // KPI (현재 + 전년)
    getCountryKpiAsync(year, name).then(d => { if (!cancelled) setKpi(d); }).catch(() => {});
    getCountryKpiAsync(prevYearStr, name).then(d => { if (!cancelled) setPrevKpi(d); }).catch(() => {});

    // 시계열
    getCountryTimeseriesAsync(year, name).then(d => { if (!cancelled) setTimeseries(d); }).catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, name, tradeType]);

  // 증감률 자체 계산
  const pctChg = (cur: number, prev: number) =>
    prev > 0 ? Math.round(Math.abs((cur - prev) / prev * 10000)) / 100 : 0;

  const countryExportChange = (kpi && prevKpi && prevKpi.rawExport > 0)
    ? pctChg(kpi.rawExport, prevKpi.rawExport)
    : 0;
  const countryExportUp = (kpi && prevKpi)
    ? kpi.rawExport >= prevKpi.rawExport
    : true;
  const countryImportChange = (kpi && prevKpi && prevKpi.rawImport > 0)
    ? pctChg(kpi.rawImport, prevKpi.rawImport)
    : 0;
  const countryImportUp = (kpi && prevKpi)
    ? kpi.rawImport >= prevKpi.rawImport
    : true;

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

        {/* Breadcrumb bar — 드릴다운 페이지에서만 표시 */}
        <div className="breadcrumb-bar">
          <button className="breadcrumb-back-btn" onClick={() => router.push("/?tab=country")}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            돌아가기
          </button>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-text">국가별</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{country.name}</span>
        </div>

        <div className="main-content-layout">
          {/* Dashboard card */}
          <div className="dashboard-card dashboard-main-card">
            <FilterBar
              mode="country"
              showCountrySelect={country.name}
              defaultYear={initialYear}
              onYearChange={setYear}
              onMonthChange={setMonth}
              onTradeTypeChange={setTradeType}
              disableMonthPeriod={subTab === "시계열 추이"}
            />

            {kpi ? (
              <KPIBar
                year={year}
                month={month}
                tradeType={tradeType}
                exportVal={kpi.export}
                exportChange={countryExportChange}
                exportUp={countryExportUp}
                importVal={kpi.import}
                importChange={countryImportChange}
                importUp={countryImportUp}
                balance={kpi.balance}
                balancePositive={kpi.positive}
              />
            ) : (
              <KPIBar year={year} month={month} tradeType={tradeType} />
            )}

            <div className="split-panel" style={{ position: "relative" }}>
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
                        <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>
                          ⚠ 데이터 불충분
                        </span>
                      )}
                    </>
                  )}
                  {subTab === "품목별" && (
                    <select
                      value={mtiDepth}
                      onChange={(e) => setMtiDepth(Number(e.target.value))}
                      className="filter-select"
                      style={{ width: 140, ...(mtiCategoryActive ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
                      disabled={mtiCategoryActive}
                    >
                      <option value={1}>1단위 (대분류)</option>
                      <option value={2}>2단위 (중분류)</option>
                      <option value={3}>3단위 (소분류)</option>
                      <option value={4}>4단위</option>
                      <option value={6}>6단위 (최소분류)</option>
                    </select>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, padding: 8, overflow: "hidden" }}>
                {subTab === "품목별" ? (
                  <TreemapChart forCountry countryName={country.name} year={year} month={month} tradeType={tradeType} mtiDepth={mtiDepth} onLoadingChange={handleLoadingChange} onCategoryChange={(mti) => setMtiCategoryActive(mti !== null)} />
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

              {isLoading && (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 50,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,0.6)",
                  backdropFilter: "blur(2px)",
                  borderRadius: 12,
                }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
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

        <MacroSection />
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
