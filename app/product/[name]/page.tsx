"use client";
import { Suspense, useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import MacroSection from "@/components/MacroSection";
import {
  aggregateTreemapByDepth,
  DEFAULT_YEAR,
  MTI_LOOKUP,
  type TradeType,
} from "@/lib/data";
import {
  getTreemapDataAsync,
  getCountryTreemapDataAsync,
  getProductTrendAsync,
  getProductTopCountriesAsync,
} from "@/lib/dataSupabase";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  RechartsPayloadTooltip,
  ProductTrendTooltip,
  TopCountriesTooltip,
  rechartsTooltipFollowProps,
} from "@/components/RechartsTooltip";
import { getAvailableMonths } from "@/lib/supabase";
import { useIncompleteMonthRange, useOngoingYearInfo } from "@/lib/useIncompleteMonthRange";

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

  const initialYear = searchParams.get("year") ?? DEFAULT_YEAR;
  const [year, setYear] = useState(initialYear);
  const urlMode = searchParams.get("mode");
  const [tradeType, setTradeType] = useState<TradeType>(
    urlMode === "import" ? "수입" : "수출"
  );
  const [country, setCountry] = useState("");
  const [subTab, setSubTab] = useState<"금액 추이" | "상위 국가">(
    searchParams.get("tab") === "countries" ? "상위 국가" : "금액 추이"
  );

  // 같은 페이지에서 URL 의 tab 파라미터가 외부 요인(챗봇 라우팅 버튼 등)으로
  // 변경되었을 때 subTab state 를 동기화한다. 사용자가 탭 버튼을 수동 클릭하는
  // 경로는 setSubTab + router.push 가 같은 값을 쓰므로 루프 없음.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    setSubTab(tabParam === "countries" ? "상위 국가" : "금액 추이");
  }, [searchParams]);

  const isAggregated = codeParam.length > 0 && codeParam.length < 6;

  // 품목 정보 + 추이 데이터 — Supabase에서 비동기 로드
  const [productCode, setProductCode] = useState(codeParam);
  const [rawTrend, setRawTrend] = useState<{ year: string; value: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadProductData = async () => {
      // 1. 품목 코드 결정
      let code = codeParam;
      if (!code) {
        // 트리맵에서 정확 매칭
        const treemap = await getTreemapDataAsync(DEFAULT_YEAR, tradeType);
        const found = treemap.find(p => p.name === name);
        if (!found) {
          const expTreemap = await getTreemapDataAsync(DEFAULT_YEAR, "수출");
          const expFound = expTreemap.find(p => p.name === name);
          if (expFound) {
            code = expFound.code;
          } else {
            // MTI_LOOKUP에서 이름→코드 역조회 (4자리 코드 우선)
            const mti = MTI_LOOKUP as Record<string, string>;
            let bestCode = "";
            for (const [c, n] of Object.entries(mti)) {
              if (n === name) {
                if (!bestCode || c.length === 4 || (c.length < bestCode.length && bestCode.length !== 4)) {
                  bestCode = c;
                }
              }
            }
            code = bestCode;
          }
        } else {
          code = found.code;
        }
      }
      if (cancelled) return;
      setProductCode(code);
      if (!code) { setRawTrend([]); return; }

      // 2. 추이 데이터
      if (country) {
        // 국가 필터 시: 연도별로 국가×품목 트리맵에서 값 추출
        // 데이터 없는 연도는 value=0으로 채워 차트에서 연속된 선으로 이어지게 함
        const years = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"];
        const results = await Promise.all(years.map(async (y) => {
          const base = await getCountryTreemapDataAsync(y, country, tradeType);
          if (isAggregated) {
            const agg = aggregateTreemapByDepth(base, codeParam.length).find(p => p.code === codeParam);
            return { year: y, value: agg?.value ?? 0 };
          }
          const d = base.find(p => p.name === name);
          return { year: y, value: d?.value ?? 0 };
        }));
        if (!cancelled) setRawTrend(results);
      } else {
        const trend = await getProductTrendAsync(code, tradeType);
        if (!cancelled) setRawTrend(trend);
      }
    };
    loadProductData().catch(() => { if (!cancelled) setRawTrend([]); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, codeParam, tradeType, country]);
  // "2026(1-2월)" → "2026" 으로 정리, 괄호가 있으면 불완전 데이터로 표시
  const currentFullYear = String(new Date().getFullYear());
  const initialIncompleteYears = new Set<string>();
  const trendCleaned = rawTrend.map((d) => {
    const clean = d.year.replace(/\(.*\)/, "").trim();
    if (clean !== d.year) initialIncompleteYears.add(clean);
    // 현재 연도 이상은 불완전 연도로 처리
    if (parseInt(clean, 10) >= parseInt(currentFullYear, 10)) initialIncompleteYears.add(clean);
    return { ...d, year: clean };
  });

  // X축에 2020~현재 연도 전체를 항상 표시 — 데이터 없는 연도는 value=0으로 채워 연속된 선으로 이어지게 함
  const DATA_START_YEAR = 2020;
  const DATA_END_YEAR = parseInt(currentFullYear, 10);
  const trendByYear = new Map(trendCleaned.map((d) => [d.year, d.value]));
  const trend: { year: string; value: number }[] = [];
  for (let y = DATA_START_YEAR; y <= DATA_END_YEAR; y++) {
    const yStr = String(y);
    trend.push({ year: yStr, value: trendByYear.get(yStr) ?? 0 });
  }

  // Supabase에서 불완전 연도별 실제 월 범위 조회 → 12개월 완전 시 경고 제거
  const [resolvedIncompleteYears, setResolvedIncompleteYears] = useState<Set<string>>(initialIncompleteYears);
  const [incompleteMonthRanges, setIncompleteMonthRanges] = useState<Record<string, string>>({});
  useEffect(() => {
    const yearsToCheck = Array.from(initialIncompleteYears);
    if (yearsToCheck.length === 0) {
      setResolvedIncompleteYears(new Set());
      setIncompleteMonthRanges({});
      return;
    }
    let cancelled = false;
    Promise.all(
      yearsToCheck.map(async (yr) => {
        const months = await getAvailableMonths(yr);
        return { yr, months };
      })
    ).then((results) => {
      if (cancelled) return;
      const ranges: Record<string, string> = {};
      const resolved = new Set(initialIncompleteYears);
      for (const { yr, months } of results) {
        if (months.length >= 12) {
          // 12개월 데이터 모두 존재 → 완전 연도 → 경고 제거
          resolved.delete(yr);
        } else if (months.length > 0) {
          const minMonth = months[0];
          const maxMonth = months[months.length - 1];
          ranges[yr] = minMonth === maxMonth ? `${minMonth}월` : `${minMonth}~${maxMonth}월`;
        }
      }
      setResolvedIncompleteYears(resolved);
      setIncompleteMonthRanges(ranges);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTrend.length, tradeType]);
  const trendValues = trend.map((d) => d.value).filter((v) => v > 0);
  const trendMin = trendValues.length ? Math.floor(Math.min(...trendValues) * 0.85) : 0;
  const trendMax = trendValues.length ? Math.ceil(Math.max(...trendValues) * 1.1) : 100;

  // 상위 국가 (Supabase에서 비동기 로드) — 전체 국가 저장, 차트는 렌더 시점에 슬라이스
  const [topCountriesAll, setTopCountriesAll] = useState<{ country: string; value: number }[]>([]);
  const [prevTopCountriesAll, setPrevTopCountriesAll] = useState<{ country: string; value: number }[]>([]);
  useEffect(() => {
    if (!productCode) { setTopCountriesAll([]); setPrevTopCountriesAll([]); return; }
    let cancelled = false;
    const prevYearStr = String(parseInt(year, 10) - 1);
    // 현재 연도 + 전년 병렬 조회 (getProductTopCountriesAsync는 내부 캐시 5분 TTL 보유 — 중복 호출 자동 회피)
    Promise.all([
      getProductTopCountriesAsync(productCode, year, tradeType),
      getProductTopCountriesAsync(productCode, prevYearStr, tradeType),
    ]).then(([curr, prev]) => {
      if (cancelled) return;
      setTopCountriesAll(curr);
      setPrevTopCountriesAll(prev);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [productCode, year, tradeType]);
  // 차트 표시용 상위 10개 (슬라이스) — 툴팁의 비중·순위는 전체 기준
  const topCountries = topCountriesAll.slice(0, 10);

  // ── 애니메이션: 데이터 로드 완료를 명시적으로 추적 ──
  const [displayTrend, setDisplayTrend] = useState<{ year: string; value: number }[]>([]);
  const [displayCountries, setDisplayCountries] = useState<{ country: string; value: number }[]>([]);
  const [animActive, setAnimActive] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  // rawTrend/topCountries가 변경될 때 버전 증가 → 애니메이션 트리거
  const prevRawTrendLen = useRef(0);
  const prevTopCountriesLen = useRef(0);
  useEffect(() => {
    if (rawTrend.length !== prevRawTrendLen.current || topCountries.length !== prevTopCountriesLen.current) {
      prevRawTrendLen.current = rawTrend.length;
      prevTopCountriesLen.current = topCountries.length;
      setDataVersion(v => v + 1);
    }
  }, [rawTrend, topCountries]);

  // subTab 변경 시에도 애니메이션
  useEffect(() => {
    setDataVersion(v => v + 1);
  }, [subTab]);

  // dataVersion 변경 시 애니메이션 실행
  useEffect(() => {
    if (trend.length === 0 && topCountries.length === 0) {
      setDisplayTrend([]);
      setDisplayCountries([]);
      return;
    }

    setAnimActive(false);
    setDisplayTrend(trend.map((d) => ({ ...d, value: trendMin })));
    setDisplayCountries(topCountries.map((d) => ({ ...d, value: 0 })));

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
  }, [dataVersion]);

  // 현재 연도 금액 & 전년 대비 증감 — 추이 데이터에서 직접 조회 (Top30 제한 없음)
  const prevYear = String(parseInt(year) - 1);
  const currentVal = trend.find((d) => d.year === year)?.value ?? 0;
  const prevVal = trend.find((d) => d.year === prevYear)?.value ?? 0;
  // 불완전 연도(현재 연도 or 전년)가 포함되면 증감율 표시하지 않음
  const isComplete = !resolvedIncompleteYears.has(year) && !resolvedIncompleteYears.has(prevYear);
  const changeRate = (isComplete && prevVal) ? ((currentVal - prevVal) / prevVal * 100).toFixed(1) : null;
  const tradeLabel = tradeType === "수입" ? "수입" : "수출";
  const productMonthRange = useIncompleteMonthRange(year);
  // 진행 중인 연도 정보 (2026년 1~N월 누적) — 금액 추이 툴팁/점선 처리용
  const ongoingInfo = useOngoingYearInfo();

  // ─── 품목별 KPI: 수출·수입 양쪽 데이터로 KPIBar에 전달 (Supabase 비동기) ───
  const [prodKpi, setProdKpi] = useState({ expCur: 0, expPrev: 0, impCur: 0, impPrev: 0 });
  useEffect(() => {
    if (!productCode) { setProdKpi({ expCur: 0, expPrev: 0, impCur: 0, impPrev: 0 }); return; }
    let cancelled = false;

    const getVal = async (tt: TradeType, yr: string): Promise<number> => {
      if (country) {
        const base = await getCountryTreemapDataAsync(yr, country, tt);
        if (isAggregated) {
          const agg = aggregateTreemapByDepth(base, codeParam.length).find(p => p.code === codeParam);
          return agg?.value ?? 0;
        }
        return base.find(p => p.name === name)?.value ?? 0;
      }
      const t = await getProductTrendAsync(productCode, tt);
      const clean = (s: string) => String(s).replace(/\(.*\)/, "").trim();
      return t.find(d => clean(d.year) === yr)?.value ?? 0;
    };

    Promise.all([
      getVal("수출", year), getVal("수출", prevYear),
      getVal("수입", year), getVal("수입", prevYear),
    ]).then(([ec, ep, ic, ip]) => {
      if (!cancelled) setProdKpi({ expCur: ec, expPrev: ep, impCur: ic, impPrev: ip });
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productCode, year, prevYear, country, tradeType]);

  const pctChg = (cur: number, prev: number) =>
    prev > 0 ? Math.round(Math.abs((cur - prev) / prev * 10000)) / 100 : 0;

  const prodExpVal = prodKpi.expCur.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const prodImpVal = prodKpi.impCur.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const prodBalance = Math.abs(prodKpi.expCur - prodKpi.impCur);
  const prodBalVal = prodBalance.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const prodExpChange = (isComplete && prodKpi.expPrev > 0) ? pctChg(prodKpi.expCur, prodKpi.expPrev) : 0;
  const prodExpUp = prodKpi.expCur >= prodKpi.expPrev;
  const prodImpChange = (isComplete && prodKpi.impPrev > 0) ? pctChg(prodKpi.impCur, prodKpi.impPrev) : 0;
  const prodImpUp = prodKpi.impCur >= prodKpi.impPrev;
  // 툴팁 위치는 공통 follow props 사용 — 커서 오른쪽 8px, 경계에서 자동 flip
  const tooltipFollowProps = rechartsTooltipFollowProps;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div className="page-main-container">
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <button className="main-tab-inactive" onClick={() => router.push("/")}>국가별</button>
          <button className="main-tab-active">품목별</button>
        </div>

        {/* Breadcrumb bar — 드릴다운 페이지에서만 표시 */}
        <div className="breadcrumb-bar">
          <button className="breadcrumb-back-btn" onClick={() => router.push("/?tab=product")}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            돌아가기
          </button>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-text">품목별</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{name}</span>
        </div>

        <div className="main-content-layout">
          {/* Dashboard card */}
          <div className="dashboard-card dashboard-main-card">
            <FilterBar mode="product" defaultYear={initialYear} onYearChange={setYear} onTradeTypeChange={setTradeType} onCountryChange={setCountry} disableMonthPeriod />
            <KPIBar
              year={year}
              exportVal={prodExpVal}
              exportChange={prodExpChange}
              exportUp={prodExpUp}
              importVal={prodImpVal}
              importChange={prodImpChange}
              importUp={prodImpUp}
              balance={prodBalVal}
              balancePositive={prodKpi.expCur >= prodKpi.impCur}
            />

            <div className="split-panel" style={{ position: "relative" }}>
            {/* Left info cards */}
            <div className="left-cards">
              <div className="left-cards-stack">
                <div className="info-card">
                  <div className="info-card-label">품목명</div>
                  <div className="info-card-value">{name}</div>
                  {productCode && (
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                      MTI {productCode}{isAggregated && " (집계)"}
                    </div>
                  )}
                </div>

                <div className="info-card">
                  <div className="info-card-label">{year}년 {tradeLabel}액</div>
                  <div className="info-card-value">
                    {currentVal.toLocaleString()} 억
                  </div>
                  <div style={{ fontSize: 10, color: "#888" }}>달러</div>
                </div>

                <div className="info-card">
                  <div className="info-card-label">전년 대비</div>
                  {changeRate !== null ? (() => {
                    const rv = parseFloat(changeRate);
                    const absV = Math.abs(rv);
                    const isZero = absV === 0;
                    const color = isZero ? "#999" : rv >= 0 ? "#E02020" : "#185FA5";
                    const arrow = isZero ? "" : rv >= 0 ? "▲ " : "▼ ";
                    // 소수점 2자리, .00은 .0으로 축약
                    const fmt = absV.toFixed(2).replace(/0$/, "").replace(/\.$/, ".0");
                    return (
                      <>
                        <div className="info-card-value" style={{ color }}>
                          {arrow}{fmt}%
                        </div>
                        <div style={{ fontSize: 10, color }}>
                          {isZero ? "변동 없음" : rv >= 0 ? "상승" : "하락"}
                        </div>
                      </>
                    );
                  })() : (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#999" }}>-</div>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 500 }}>
                        ⓘ 부분 데이터{productMonthRange ? `(${productMonthRange})` : ""}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Main viz */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
              </div>


              <div style={{ flex: 1, padding: 8, overflow: "hidden" }}>

                {subTab === "금액 추이" ? (
                  trend.length > 0 ? (
                    (() => {
                      // 단일 데이터 + 두 dataKey (null 마스킹) — X 카테고리 매핑 정합성 유지
                      // valueConfirmed: 확정 연도만 값, 진행 중 연도는 null
                      // valueBridge: 진행 중 연도 + 바로 이전 확정 연도(=앵커)만 값, 그 외 null
                      const ongoingY = ongoingInfo?.year ?? null;
                      const ongoingIdx = ongoingY ? displayTrend.findIndex((d) => d.year === ongoingY) : -1;
                      const anchorYear = ongoingIdx > 0 ? displayTrend[ongoingIdx - 1].year : null;
                      const chartTrend = displayTrend.map((d) => ({
                        ...d,
                        valueConfirmed: d.year === ongoingY ? null : d.value,
                        valueBridge:
                          d.year === ongoingY || (anchorYear && d.year === anchorYear) ? d.value : null,
                      }));
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartTrend} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                        <YAxis domain={[trendMin, trendMax]} tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}억`} />
                        <Tooltip
                          content={(props) => (
                            <ProductTrendTooltip
                              {...props}
                              title={name}
                              trend={displayTrend}
                              tradeLabel={tradeLabel}
                              ongoingYear={ongoingInfo?.year ?? null}
                              ongoingMonthRange={ongoingInfo?.monthRange ?? null}
                            />
                          )}
                          {...tooltipFollowProps}
                        />
                        <Line
                          type="monotone" dataKey="valueConfirmed" stroke="#14B8A6" strokeWidth={2.5}
                          dot={{ r: 4, fill: "#14B8A6" }} activeDot={{ r: 6 }} name={`${tradeLabel}액`}
                          isAnimationActive={animActive}
                          animationDuration={700} animationEasing="ease-out"
                          connectNulls={false}
                        />
                        <Line
                          type="monotone" dataKey="valueBridge" stroke="#14B8A6" strokeWidth={2.5}
                          strokeDasharray="5 4"
                          dot={(props: { cx?: number; cy?: number; payload?: { year?: string } }) => {
                            const { cx, cy, payload } = props;
                            if (cx == null || cy == null) return <g />;
                            // 진행 중 연도의 점만 외곽선 렌더, 확정 연도(= 브릿지 앵커)는 점 숨김(확정 Line dot과 중복 방지)
                            if (payload?.year === ongoingInfo?.year) {
                              return (
                                <circle cx={cx} cy={cy} r={4} fill="#fff" stroke="#14B8A6" strokeWidth={2} />
                              );
                            }
                            return <g />;
                          }}
                          activeDot={{ r: 6, fill: "#14B8A6" }}
                          isAnimationActive={animActive}
                          animationDuration={700} animationEasing="ease-out"
                          legendType="none"
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                      );
                    })()
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
                          content={(props) => (
                            <TopCountriesTooltip
                              {...props}
                              year={year}
                              tradeLabel={tradeLabel}
                              currentData={topCountriesAll}
                              prevData={prevTopCountriesAll}
                              ongoingYear={ongoingInfo?.year ?? null}
                              ongoingMonthRange={ongoingInfo?.monthRange ?? null}
                            />
                          )}
                          {...tooltipFollowProps}
                          cursor={{ fill: "transparent" }}
                        />
                        <Bar
                          dataKey="value"
                          fill="#2371C8"
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