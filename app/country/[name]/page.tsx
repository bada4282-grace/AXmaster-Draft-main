"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import ChatBot from "@/components/ChatBot";
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

export default function CountryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const name = decodeURIComponent(params.name as string);

  const [year, setYear] = useState(DEFAULT_YEAR);
  const [tradeType, setTradeType] = useState<TradeType>("수출");
  const [subTab, setSubTab] = useState<"품목별" | "시계열 추이">("품목별");
  const [chatOpen, setChatOpen] = useState(true);

  // 연도별 국가 데이터 (연도 바뀌면 순위도 달라질 수 있음)
  const country = getCountryByName(name) ?? {
    name, iso: "??", region: "기타", rank: 1,
    export: "0", import: "0", region2: "기타",
    topProducts: [], nameEn: name, share: 0,
  };

  // 해당 국가의 연도별 KPI
  const kpi = getCountryKpi(year, name);
  const timeseries = getCountryTimeseries(year, name);

  // 시계열 Y축 범위 계산
  const allValues = timeseries.flatMap((d) => [d.export, d.import]);
  const minVal = allValues.length ? Math.floor(Math.min(...allValues) * 0.9) : 0;
  const maxVal = allValues.length ? Math.ceil(Math.max(...allValues) * 1.1) : 100;
  const balances = timeseries.map((d) => d.balance);
  const minBal = balances.length ? Math.floor(Math.min(...balances) * 1.1) : -50;
  const maxBal = balances.length ? Math.ceil(Math.max(...balances) * 1.1) : 50;

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

    const timeout = setTimeout(() => {
      setLineAnimActive(true);
      setDisplayData(timeseries);
    }, 50);

    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, subTab]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="main-tab-active">국가별</button>
          <button className="main-tab-inactive" onClick={() => router.push("/")}>품목별</button>
        </div>

        {/* Dashboard card */}
        <div className="dashboard-card">
          <FilterBar
            mode="country"
            showCountrySelect={country.name}
            defaultYear={DEFAULT_YEAR}
            onYearChange={setYear}
            onTradeTypeChange={setTradeType}
          />

          {kpi ? (
            <KPIBar
              exportVal={kpi.export}
              importVal={kpi.import}
              balance={kpi.balance}
              balancePositive={kpi.positive}
            />
          ) : (
            <KPIBar year={year} />
          )}

          <div style={{ display: "flex", height: 380 }}>
            {/* Left info cards */}
            <div className="left-cards">
              <button className="back-btn" onClick={() => router.push("/")}>← 돌아가기</button>

              <div className="left-cards-stack">
                <div className="info-card">
                  <div className="info-card-label">{country.region}</div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{country.iso}</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{country.name}</div>
                </div>

                <div className="info-card">
                  <div className="info-card-label">{tradeType} 국가 순위 ({year})</div>
                  <div className="info-card-value">{country.rank}위</div>
                </div>

                <div className="info-card">
                  <div className="info-card-label">전체 {tradeType} 비중</div>
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
                {subTab === "시계열 추이" && (
                  <select
                    className="filter-select"
                    style={{ marginLeft: "auto", minWidth: 72 }}
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                    <option value="2023">2023</option>
                  </select>
                )}
              </div>

              <div style={{ flex: 1, padding: 8, overflow: "hidden" }}>
                {subTab === "품목별" ? (
                  <TreemapChart forCountry countryName={country.name} year={year} tradeType={tradeType} />
                ) : timeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayData} margin={{ top: 8, right: 44, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis
                        yAxisId="left"
                        domain={[minVal, maxVal]}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[minBal, maxBal]}
                        tick={{ fontSize: 10 }}
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
                      <Line yAxisId="left" type="monotone" dataKey="import" stroke="#E02020"
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

            {/* Chatbot */}
            {chatOpen && (
              <ChatBot
                open={true}
                onToggle={() => setChatOpen(false)}
                initialMessage={`${country.name}과의 교역 현황입니다. 특정 품목에 대해 질문해주세요.`}
              />
            )}
          </div>
        </div>

        <div className="macro-section">
          <div className="macro-title">거시경제 지표</div>
        </div>
      </div>

      {!chatOpen && (
        <button className="chatbot-open-btn" onClick={() => setChatOpen(true)}>↑</button>
      )}
    </div>
  );
}
