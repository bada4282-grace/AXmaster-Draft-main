"use client";
import { useState } from "react";
import { getCountryData, getTreemapData } from "@/lib/data";

interface FilterBarProps {
  mode?: "country" | "product";
  showCountrySelect?: string;
  onYearChange?: (year: string) => void;
  onMonthChange?: (month: string) => void;
  onPeriodChange?: (period: string) => void;
  onTradeTypeChange?: (type: "수출" | "수입") => void;
  defaultYear?: string;
}

export default function FilterBar({
  mode = "country",
  showCountrySelect,
  onYearChange,
  onMonthChange,
  onPeriodChange,
  onTradeTypeChange,
  defaultYear = "2026",
}: FilterBarProps) {
  const [tradeType, setTradeType] = useState<"수출" | "수입">("수출");
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState("");
  const [period, setPeriod] = useState("annual");

  const handleTradeType = (t: "수출" | "수입") => {
    setTradeType(t);
    onTradeTypeChange?.(t);
  };

  const handleYear = (y: string) => {
    setYear(y);
    onYearChange?.(y);
  };

  // 해당 연도의 국가/품목 목록 (수출 기준으로 목록 표시)
  const countryNames = getCountryData(year, "수출").map((c) => c.name);
  const productNames = getTreemapData(year, "수출").map((p) => p.name);

  return (
    <div className="filter-bar">
      <div className="filter-section">
        <div className="toggle-btn-group">
          <button
            className={`toggle-btn ${tradeType === "수출" ? "active" : ""}`}
            onClick={() => handleTradeType("수출")}
          >수출</button>
          <button
            className={`toggle-btn ${tradeType === "수입" ? "active" : ""}`}
            onClick={() => handleTradeType("수입")}
          >수입</button>
        </div>
      </div>

      <div className="filter-section filter-section-divider">
        <div className="filter-group-inline">
          <select
            className="filter-select"
            value={year}
            onChange={(e) => handleYear(e.target.value)}
            style={{ width: 96 }}
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
          </select>

          <select
            className="filter-select"
            value={month}
            onChange={(e) => { setMonth(e.target.value); onMonthChange?.(e.target.value); }}
            style={{ width: 96 }}
          >
            <option value="">월 (전체)</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={String(i + 1).padStart(2, "0")}>
                {i + 1}월
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            style={{ width: 96 }}
            value={period}
            onChange={(e) => { setPeriod(e.target.value); onPeriodChange?.(e.target.value); }}
          >
            <option value="annual">연간</option>
            <option value="cumulative">누적</option>
            <option value="monthly">해당월</option>
          </select>
        </div>
      </div>

      <div className="filter-section filter-section-divider">
        <div className="filter-group-inline">
          {mode === "product" ? (
            <>
              <select className="filter-select" style={{ width: 120 }}>
                <option>한국</option>
              </select>
              <span className="filter-trade-arrow" aria-hidden="true">
                {tradeType === "수출" ? "→" : "←"}
              </span>
              <select className="filter-select" style={{ width: 140 }}>
                <option value="">수입국 (전체)</option>
                {countryNames.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <select className="filter-select" style={{ width: 140 }}>
                <option value="">품목 (전체)</option>
                {productNames.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <select
                className="filter-select"
                style={{ width: 140 }}
                defaultValue={showCountrySelect ?? ""}
              >
                {showCountrySelect ? (
                  <option value={showCountrySelect}>{showCountrySelect}</option>
                ) : (
                  <>
                    <option value="">수입국 (전체)</option>
                    {countryNames.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </>
                )}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
