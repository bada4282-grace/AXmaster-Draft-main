"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tradeType, setTradeType] = useState<"수출" | "수입">("수출");
  const [year, setYear] = useState(defaultYear);
  // URL에서 초기값 읽기 — 새로고침 시 필터 유지
  const [month, setMonth] = useState(searchParams.get("month") ?? "");
  const [period, setPeriod] = useState("annual");

  // 데이터 없음 토스트
  const [noDataToast, setNoDataToast] = useState(false);
  const [toastFading, setToastFading] = useState(false);
  useEffect(() => {
    if (!noDataToast) return;
    // .dashboard-area에 position:relative 보장 (absolute 자식 배치용)
    const el = document.querySelector<HTMLElement>(".dashboard-area");
    if (el && getComputedStyle(el).position === "static") el.style.position = "relative";
    const fadeTimer = setTimeout(() => setToastFading(true), 1800);
    const hideTimer = setTimeout(() => { setNoDataToast(false); setToastFading(false); }, 2400);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, [noDataToast]);

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
    // 2026년 3~12월은 데이터 미존재
    if (year === "2026" && m && parseInt(m, 10) >= 3) {
      setNoDataToast(true);
      setToastFading(false);
      return;
    }
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
    <>
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
                value={showCountrySelect ?? ""}
                onChange={(e) => handleCountry(e.target.value)}
              >
                <option value="">수입국 (전체)</option>
                {countryNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    </div>

    {/* 데이터 없음 토스트 — .dashboard-area 중앙에 표시 */}
    {noDataToast && typeof document !== "undefined" && (() => {
      const target = document.querySelector(".dashboard-area");
      if (!target) return null;
      return createPortal(
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            pointerEvents: "none",
            opacity: toastFading ? 0 : 1,
            transition: "opacity 0.5s ease-out",
          }}
        >
          <div
            style={{
              background: "#fff",
              border: "1px solid #e8ecef",
              borderRadius: 12,
              padding: "24px 32px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontFamily: "'Noto Sans KR', sans-serif",
              animation: "nodata-slide-up 0.3s ease-out",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#F0FAF8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" stroke="#1A9088" strokeWidth="1.8"/>
                <line x1="10" y1="6" x2="10" y2="11" stroke="#1A9088" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="10" cy="14" r="1" fill="#1A9088"/>
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
                해당 기간의 데이터가 없습니다
              </span>
              <span style={{ fontSize: 12, fontWeight: 400, color: "#94a3b8" }}>
                2026년 2월까지 조회 가능합니다
              </span>
            </div>
          </div>
          <style>{`
            @keyframes nodata-slide-up {
              0% { transform: translateY(10px); opacity: 0; }
              100% { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>,
        target,
      );
    })()}
    </>
  );
}
