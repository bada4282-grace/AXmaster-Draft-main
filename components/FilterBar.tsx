"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { getCountryRankingAsync, getTreemapDataAsync } from "@/lib/dataSupabase";

interface FilterBarProps {
  mode?: "country" | "product";
  showCountrySelect?: string;
  onYearChange?: (year: string) => void;
  onMonthChange?: (month: string) => void;
  /** @deprecated 기간 셀렉트 제거됨 — 호환성 유지용 */
  onPeriodChange?: (period: string) => void;
  onTradeTypeChange?: (type: "수출" | "수입") => void;
  onCountryChange?: (country: string) => void;
  defaultYear?: string;
  /** 월·기간 셀렉트 비활성화 (연간 데이터만 사용하는 페이지용) */
  disableMonthPeriod?: boolean;
  mtiDepth?: number;
  onMtiDepthChange?: (depth: number) => void;
}

export default function FilterBar({
  mode = "country",
  showCountrySelect,
  onYearChange,
  onMonthChange,
  onTradeTypeChange,
  onCountryChange,
  defaultYear = "2026",
  disableMonthPeriod = false,
  mtiDepth,
  onMtiDepthChange,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tradeType, setTradeType] = useState<"수출" | "수입">(
    searchParams.get("tradeType") === "import" || searchParams.get("mode") === "import" ? "수입" : "수출"
  );
  const [year, setYear] = useState(defaultYear);
  // URL에서 초기값 읽기 — 새로고침 시 필터 유지
  const [month, setMonth] = useState(searchParams.get("month") ?? "");

  // 데이터 없음 토스트
  const [noDataToast, setNoDataToast] = useState(false);
  const [toastFading, setToastFading] = useState(false);
  useEffect(() => {
    if (!noDataToast) return;
    const fadeTimer = setTimeout(() => setToastFading(true), 1800);
    const hideTimer = setTimeout(() => { setNoDataToast(false); setToastFading(false); }, 2400);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, [noDataToast]);

  const handleTradeType = (t: "수출" | "수입") => {
    setTradeType(t);
    onTradeTypeChange?.(t);
    // URL 동기화 — 상세 페이지 이동 시 mode 유지
    const params = new URLSearchParams(searchParams.toString());
    params.set("tradeType", t === "수입" ? "import" : "export");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleYear = (y: string) => {
    setYear(y);
    onYearChange?.(y);
    // KPIBar가 URL에서 year를 읽으므로 URL 동기화
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", y);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // 해당 연도의 국가/품목 목록 (Supabase에서 비동기 로드)
  const [countryNames, setCountryNames] = useState<string[]>([]);
  const [productNames, setProductNames] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getCountryRankingAsync(year, tradeType).then(ranks => {
      if (!cancelled) setCountryNames(ranks.map(r => r.country));
    }).catch(() => {});
    getTreemapDataAsync(year, tradeType).then(data => {
      if (!cancelled) setProductNames([...new Set(data.map(p => p.name))]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [year, tradeType]);

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
    router.push(`/country/${encodeURIComponent(name)}?mode=${mode}&year=${year}`);
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
            style={{ width: 100 }}
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
            disabled={disableMonthPeriod}
            style={{ width: 120, ...(disableMonthPeriod ? { opacity: 0.4, cursor: "not-allowed", pointerEvents: "none" as const } : {}) }}
          >
            <option value="">연간 데이터</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={String(i + 1).padStart(2, "0")}>
                {i + 1}월
              </option>
            ))}
          </select>

          {mode === "product" && mtiDepth !== undefined && onMtiDepthChange && (
            <select
              className="filter-select"
              value={mtiDepth}
              onChange={(e) => onMtiDepthChange(Number(e.target.value))}
              style={{ width: 130 }}
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

      <div className="filter-section filter-section-divider">
        <div className="filter-group-inline">
          {mode === "product" ? (
            <>
              <select className="filter-select" style={{ width: 90 }}>
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

    {/* 데이터 없음 토스트 — 대시보드 영역 중앙에 표시 */}
    {noDataToast && typeof document !== "undefined" && (() => {
      const target = document.querySelector(".split-panel");
      if (!target) return null;
      // portal 대상에 position:relative 보장
      const el = target as HTMLElement;
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
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