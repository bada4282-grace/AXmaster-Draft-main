"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import HeroBanner from "@/components/HeroBanner";
import FilterBar from "@/components/FilterBar";
import KPIBar from "@/components/KPIBar";
import ChatBot from "@/components/ChatBot";
import {
  getTreemapData,
  getProductTrend,
  getProductTopCountries,
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
  const params = useParams();
  const router = useRouter();
  const name = decodeURIComponent(params.name as string);

  const [year, setYear] = useState(DEFAULT_YEAR);
  const [tradeType, setTradeType] = useState<TradeType>("수출");
  const [subTab, setSubTab] = useState<"금액 추이" | "상위 국가">("금액 추이");
  const [chatOpen, setChatOpen] = useState(true);

  // 해당 품목 정보 찾기 (기본 연도 + 현재 tradeType 기준)
  const treemapData = getTreemapData(DEFAULT_YEAR, tradeType);
  const product = treemapData.find((p) => p.name === name)
    // 수입 전환 후 목록에 없으면 수출 목록에서 코드만 가져옴
    ?? getTreemapData(DEFAULT_YEAR, "수출").find((p) => p.name === name);

  // 해당 품목의 연간 추이 (tradeType 반영)
  const trend = product ? getProductTrend(product.code, tradeType) : [];
  const trendValues = trend.map((d) => d.value).filter((v) => v > 0);
  const trendMin = trendValues.length ? Math.floor(Math.min(...trendValues) * 0.85) : 0;
  const trendMax = trendValues.length ? Math.ceil(Math.max(...trendValues) * 1.1) : 100;

  // 상위 국가 (tradeType 반영)
  const topCountries = product ? getProductTopCountries(product.code, year, tradeType) : [];

  // 현재 연도 금액 & 전년 대비 증감 (tradeType 반영)
  const currentYearData = getTreemapData(year, tradeType).find((p) => p.name === name);
  const prevYearData = getTreemapData(String(parseInt(year) - 1), tradeType).find((p) => p.name === name);
  const currentVal = currentYearData?.value ?? 0;
  const prevVal = prevYearData?.value ?? 0;
  const changeRate = prevVal ? ((currentVal - prevVal) / prevVal * 100).toFixed(1) : null;
  const tradeLabel = tradeType === "수입" ? "수입" : "수출";

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      <Header />
      <HeroBanner />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>
        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className="main-tab-inactive" onClick={() => router.push("/")}>국가별</button>
          <button className="main-tab-active">품목별</button>
        </div>

        {/* Dashboard card */}
        <div className="dashboard-card">
          <FilterBar mode="product" defaultYear={DEFAULT_YEAR} onYearChange={setYear} onTradeTypeChange={setTradeType} />
          <KPIBar year={year} />

          <div style={{ display: "flex", height: 380 }}>
            {/* Left info cards */}
            <div className="left-cards">
              <button className="back-btn" onClick={() => router.push("/?tab=product")}>← 돌아가기</button>

              <div className="left-cards-stack">
                <div className="info-card">
                  <div className="info-card-label">품목명</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{name}</div>
                  {product && (
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                      MTI {product.code}
                    </div>
                  )}
                </div>

                <div className="info-card">
                  <div className="info-card-label">{year}년 {tradeLabel}액</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    $ {currentVal.toLocaleString()}억
                  </div>
                </div>

                {changeRate !== null && (
                  <div className="info-card">
                    <div className="info-card-label">전년 대비</div>
                    <div style={{
                      fontSize: 18, fontWeight: 900,
                      color: parseFloat(changeRate) >= 0 ? "#E02020" : "#185FA5",
                    }}>
                      {parseFloat(changeRate) >= 0 ? "▲" : "▼"} {Math.abs(parseFloat(changeRate))}%
                    </div>
                  </div>
                )}
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
                {subTab === "상위 국가" && (
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

              <div style={{ flex: 1, padding: 12, overflow: "hidden" }}>
                {subTab === "금액 추이" ? (
                  trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                        <YAxis domain={[trendMin, trendMax]} tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          content={(props) => (
                            <RechartsPayloadTooltip {...props} title={name} />
                          )}
                          {...rechartsTooltipSurfaceProps}
                        />
                        <Line
                          type="monotone" dataKey="value" stroke="#14B8A6" strokeWidth={2.5}
                          dot={{ r: 4, fill: "#14B8A6" }} activeDot={{ r: 6 }} name={`${tradeLabel}액(억$)`}
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
                      <BarChart data={topCountries} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="country" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          content={(props) => <RechartsBarCountryTooltip {...props} />}
                          {...rechartsTooltipSurfaceProps}
                        />
                        <Bar dataKey="value" fill="#3B3BFF" radius={[4, 4, 0, 0]} name={`${tradeLabel}액(억$)`} />
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

            {/* Chatbot */}
            {chatOpen && (
              <ChatBot
                open={true}
                onToggle={() => setChatOpen(false)}
                initialMessage={`${name} 수출 현황입니다. 궁금한 점을 질문해주세요.`}
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
