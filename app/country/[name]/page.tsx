"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
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
import { TimeseriesTooltip, rechartsTooltipFollowProps } from "@/components/RechartsTooltip";
import { KO_NAME_TO_ISO } from "@/lib/countryIso";
import { useIncompleteMonthRange } from "@/lib/useIncompleteMonthRange";

const TreemapChart = dynamic(() => import("@/components/TreemapChart"), { ssr: false });
import MacroSection from "@/components/MacroSection";

function CountryDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = decodeURIComponent(params.name as string);

  const urlMode = searchParams.get("mode");
  const urlYear = searchParams.get("year");
  const initialTradeType: TradeType = urlMode === "import" ? "수입" : "수출";
  const initialYear = urlYear ?? DEFAULT_YEAR;
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState("");
  const [tradeType, setTradeType] = useState<TradeType>(initialTradeType);

  // URL 파라미터 변경 시 state 동기화 (같은 페이지에서 mode/year만 바뀔 때)
  useEffect(() => {
    const newTradeType: TradeType = urlMode === "import" ? "수입" : "수출";
    setTradeType(newTradeType);
  }, [urlMode]);

  useEffect(() => {
    if (urlYear) setYear(urlYear);
  }, [urlYear]);
  const [subTab, setSubTab] = useState<"품목별" | "시계열 추이">(
    searchParams.get("tab") === "timeseries" ? "시계열 추이" : "품목별"
  );

  // 같은 페이지에서 URL 의 tab 파라미터가 외부 요인(챗봇 라우팅 버튼 등) 으로
  // 변경되었을 때 subTab state 를 동기화한다.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    setSubTab(tabParam === "timeseries" ? "시계열 추이" : "품목별");
  }, [searchParams]);

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
  /** 전년 12월 — 1월 지점의 전월 대비 계산용 */
  const [prevYearDecember, setPrevYearDecember] = useState<MonthlyData | null>(null);
  /** 총 교역국 수 (분모) */
  const [totalCountries, setTotalCountries] = useState(0);
  /** 전년 동기 순위 (null = 전년도에 교역 없음/데이터 없음) */
  const [prevRank, setPrevRank] = useState<number | null>(null);
  /** 부분 집계 월 범위 ("1~2월" 형식), 완전 집계면 null */
  const monthRangeForYear = useIncompleteMonthRange(year);

  useEffect(() => {
    let cancelled = false;
    const prevYearStr = String(parseInt(year) - 1);

    // 국가 순위 (현재 연도)
    getCountryRankingAsync(year, tradeType).then(ranks => {
      if (cancelled) return;
      const fmt1 = (v: number) => (Math.round(v / 1e8 * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      const r = ranks.find(r => r.country === name);
      setTotalCountries(ranks.length);
      if (r) {
        setCountry({
          ...defaultCountry,
          iso: KO_NAME_TO_ISO[name] ?? "??",
          rank: tradeType === "수입" ? r.rank_imp : r.rank_exp,
          export: fmt1(r.exp_amt),
          import: fmt1(r.imp_amt),
          share: tradeType === "수입" ? r.share_imp : r.share_exp,
        });
      }
    }).catch(() => {});

    // 전년 순위 (변동 계산용)
    getCountryRankingAsync(prevYearStr, tradeType).then(ranks => {
      if (cancelled) return;
      const r = ranks.find(r => r.country === name);
      const rk = r ? (tradeType === "수입" ? r.rank_imp : r.rank_exp) : 0;
      setPrevRank(rk > 0 ? rk : null);
    }).catch(() => { if (!cancelled) setPrevRank(null); });

    // KPI (현재 + 전년)
    getCountryKpiAsync(year, name).then(d => { if (!cancelled) setKpi(d); }).catch(() => {});
    getCountryKpiAsync(prevYearStr, name).then(d => { if (!cancelled) setPrevKpi(d); }).catch(() => {});

    // 시계열 (현재 연도)
    getCountryTimeseriesAsync(year, name).then(d => { if (!cancelled) setTimeseries(d); }).catch(() => {});

    // 전년 시계열 — 1월 데이터 포인트의 전월(전년 12월) 매칭용
    getCountryTimeseriesAsync(prevYearStr, name).then(d => {
      if (cancelled) return;
      setPrevYearDecember(d.find(m => m.month === "12월") ?? null);
    }).catch(() => { if (!cancelled) setPrevYearDecember(null); });

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

  // 수출·수입·무역수지 3개 시리즈를 모두 왼쪽 Y축 한 스케일에 함께 표시
  // (오른쪽 Y축은 제거됨 — 단위가 같은 $ 금액이라 양축 병행이 혼란 유발)
  const allValues = timeseries.flatMap((d) => [d.export, d.import, d.balance]);
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 100;
  const leftScale = niceScale(
    rawMin < 0 ? rawMin * 1.1 : rawMin * 0.9,
    rawMax > 0 ? rawMax * 1.1 : rawMax * 0.9,
  );
  const minVal = leftScale.min;
  const maxVal = leftScale.max;

  const [displayData, setDisplayData] = useState<MonthlyData[]>([]);
  const [lineAnimActive, setLineAnimActive] = useState(false);
  const [tsVersion, setTsVersion] = useState(0);
  const prevTsLen = useRef(0);

  // timeseries 길이/내용 변경 감지 → 버전 증가
  useEffect(() => {
    if (timeseries.length !== prevTsLen.current) {
      prevTsLen.current = timeseries.length;
      setTsVersion(v => v + 1);
    }
  }, [timeseries]);

  // subTab 변경 시에도 애니메이션
  useEffect(() => {
    setTsVersion(v => v + 1);
  }, [subTab]);

  // 애니메이션 실행
  useEffect(() => {
    if (timeseries.length === 0) {
      setDisplayData([]);
      return;
    }

    setLineAnimActive(false);
    setDisplayData(timeseries.map((d) => ({
      ...d,
      export: minVal,
      import: minVal,
      balance: minVal,
    })));

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
  }, [tsVersion]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div className="page-main-container">
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
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
                  {country.iso && country.iso !== "??" && (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 6px",
                        background: "#f1f5f9",
                        color: "#475569",
                        borderRadius: 4,
                        letterSpacing: 0.5,
                        lineHeight: 1.2,
                      }}>
                        {country.iso}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://flagcdn.com/w80/${country.iso.toLowerCase()}.png`}
                        srcSet={`https://flagcdn.com/w160/${country.iso.toLowerCase()}.png 2x`}
                        alt={`${country.name} 국기`}
                        width={28}
                        height={21}
                        style={{
                          borderRadius: 3,
                          border: "1px solid #e2e8f0",
                          display: "block",
                          objectFit: "cover",
                        }}
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>

                <div className="info-card">
                  <div className="info-card-label" style={{ fontSize: 12 }}>{tradeType} 국가 순위 ({year})</div>
                  <div className="info-card-value">
                    {country.rank}위
                    {totalCountries > 0 && (
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b", marginLeft: 4 }}>
                        / {totalCountries}
                      </span>
                    )}
                  </div>
                  {(() => {
                    if (prevRank == null || country.rank <= 0) {
                      return (
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                          전년 순위 없음
                        </div>
                      );
                    }
                    const delta = prevRank - country.rank; // >0 상승, <0 하락, 0 동일
                    const tag =
                      delta === 0
                        ? <span style={{ color: "#6b7280" }}>–</span>
                        : delta > 0
                          ? <span style={{ color: "#E02020" }}>▲{delta}</span>
                          : <span style={{ color: "#185FA5" }}>▼{Math.abs(delta)}</span>;
                    return (
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        전년 {prevRank}위 {tag}
                      </div>
                    );
                  })()}
                </div>

                <div className="info-card">
                  <div className="info-card-label" style={{ fontSize: 12 }}>
                    한국 전체 {tradeType} 중 {country.name} 비중
                  </div>
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
                  {subTab === "시계열 추이" && monthRangeForYear && (
                    <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>
                      ⓘ 부분 데이터({monthRangeForYear})
                    </span>
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
                    <LineChart data={displayData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis
                        domain={[minVal, maxVal]}
                        ticks={leftScale.ticks}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (v === 0 ? "$0" : `$${v}억`)}
                        width={52}
                      />
                      <Tooltip
                        content={(props) => (
                          <TimeseriesTooltip
                            {...props}
                            title={country.name}
                            allData={timeseries}
                            prevYearLastMonth={prevYearDecember}
                            rows={
                              tradeType === "수입"
                                ? [
                                    { key: "import", name: "수입", color: "#F97316" },
                                    { key: "balance", name: "무역수지", color: "#22C55E" },
                                  ]
                                : [
                                    { key: "export", name: "수출", color: "#185FA5" },
                                    { key: "balance", name: "무역수지", color: "#22C55E" },
                                  ]
                            }
                          />
                        )}
                        {...rechartsTooltipFollowProps}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {/* 선택된 tradeType 라인만 렌더 — 수출/수입 뷰 혼동 방지. 무역수지는 공통 */}
                      {tradeType === "수출" && (
                        <Line type="monotone" dataKey="export" stroke="#185FA5"
                          strokeWidth={2} dot={{ r: 3 }} name="수출"
                          isAnimationActive={lineAnimActive}
                          animationDuration={700} animationEasing="ease-out" />
                      )}
                      {tradeType === "수입" && (
                        <Line type="monotone" dataKey="import" stroke="#F97316"
                          strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} name="수입"
                          isAnimationActive={lineAnimActive}
                          animationDuration={700} animationEasing="ease-out" />
                      )}
                      <Line type="monotone" dataKey="balance" stroke="#22C55E"
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
