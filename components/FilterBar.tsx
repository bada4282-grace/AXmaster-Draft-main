"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCountryData, getTreemapData } from "@/lib/data";

interface FilterBarProps {
  mode?: "country" | "product";
  showCountrySelect?: string;
  onYearChange?: (year: string) => void;
  onMonthChange?: (month: string) => void;
  onPeriodChange?: (period: string) => void;
  onTradeTypeChange?: (type: "수출" | "수입") => void;
  onCountryChange?: (country: string) => void;
  defaultYear?: string;
  mtiDepth?: number;
  onMtiDepthChange?: (depth: number) => void;
}

export default function FilterBar({
  mode = "country",
  showCountrySelect,
  onYearChange,
  onMonthChange,
  onPeriodChange,
  onTradeTypeChange,
  onCountryChange,
  defaultYear = "2026",
  mtiDepth,
  onMtiDepthChange,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tradeType, setTradeType] = useState<"수출" | "수입">("수출");
  const [year, setYear] = useState(defaultYear);
  // URL에서 초기값 읽기 — 새로고침 시 필터 유지
  const [month, setMonth] = useState(searchParams.get("month") ?? "");
  const [period, setPeriod] = useState("annual");

  const handleTradeType = (t: "수출" | "수입") => {
    setTradeType(t);
    onTradeTypeChange?.(t);
  };

  const handleYear = (y: string) => {
    setYear(y);
    onYearChange?.(y);
  };

  // 해당 연도의 국가/품목 목록 (현재 tradeType 기준)
  const countryNames = getCountryData(year, tradeType).map((c) => c.name);
  const productNames = getTreemapData(year, tradeType).map((p) => p.name);

  const handleMonth = (m: string) => {
    setMonth(m);
    onMonthChange?.(m);
    // KPIBar가 URL에서 month를 읽으므로 URL 동기화
    const params = new URLSearchParams(searchParams.toString());
    if (m) params.set("month", m);
    else params.delete("month");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleProduct = (p: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p) params.set("product", p);
    else params.delete("product");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleCountry = (name: string) => {
    if (!name) return;
    const mode = tradeType === "수입" ? "import" : "export";
    router.push(`/country/${encodeURIComponent(name)}?mode=${mode}`);
  };

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
            <option value="2022">2022</option>
            <option value="2021">2021</option>
            <option value="2020">2020</option>
          </select>

          <select
            className="filter-select"
            value={month}
            onChange={(e) => handleMonth(e.target.value)}
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
              <select
                className="filter-select"
                style={{ width: 140 }}
                onChange={(e) => onCountryChange?.(e.target.value)}
              >
                <option value="">수입국 (전체)</option>
                {countryNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <select
                className="filter-select"
                style={{ width: 140 }}
                value={searchParams.get("product") ?? ""}
                onChange={(e) => handleProduct(e.target.value)}
              >
                <option value="">품목 (전체)</option>
                {productNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <select
                className="filter-select"
                style={{ width: 140 }}
                defaultValue={showCountrySelect ?? ""}
                onChange={(e) => handleCountry(e.target.value)}
              >
                {showCountrySelect ? (
                  <option value={showCountrySelect}>{showCountrySelect}</option>
                ) : (
                  <>
                    <option value="">수입국 (전체)</option>
                    {countryNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </>
                )}
              </select>
            </>
          )}
        </div>
      </div>

      {mtiDepth !== undefined && onMtiDepthChange && (
        <div className="filter-section filter-section-divider">
          <select
            className="filter-select"
            value={mtiDepth}
            onChange={(e) => onMtiDepthChange(Number(e.target.value))}
            style={{ width: 80 }}
          >
            <option value={1}>1단위 (대분류)</option>
            <option value={2}>2단위 (중분류)</option>
            <option value={3}>3단위 (소분류)</option>
            <option value={4}>4단위</option>
            <option value={6}>6단위 (최소분류)</option>
          </select>
        </div>
      )}
    </div>
  );
}
