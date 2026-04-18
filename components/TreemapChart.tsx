"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Treemap, ResponsiveContainer } from "recharts";
import { aggregateTreemapByDepth, MTI_COLORS, MTI_NAMES, type ProductNode, DEFAULT_YEAR, type TradeType } from "@/lib/data";
import { getMonthlyTreemapData, getCountryMonthlyTreemapData } from "@/lib/supabase";
import { getTreemapDataAsync, getCountryTreemapDataAsync } from "@/lib/dataSupabase";
import { useIncompleteMonthRange } from "@/lib/useIncompleteMonthRange";
import { useRouter } from "next/navigation";

/** MTI 대분류별 SVG 아이콘 path */
const MTI_ICON_PATHS: Record<number, React.ReactNode> = {
  // 0 농림수산물 — 벼 이삭 (줄기 + 늘어진 낟알 + 잎)
  0: <><path d="M9 2c0 0-1 2-2 3.5S4.5 8 5 9s2 0.5 3-0.5S10 5.5 9 2z" /><path d="M8 6c0 0-2 1.5-3 3S3 13 3.5 13.5s2-0.5 2.5-2S10 8 8 6z" /><path d="M7 10.5c0 0-2 2-2.5 3.5S4 17.5 4.5 18s1.5-0.5 2-2S9 12.5 7 10.5z" /><path d="M9 2c1 3 2 8 3 12s2 6 3 8" /><path d="M15 13c2-3 5-4 6-3s-1 3-3 4-3 0.5-3-1z" /><path d="M14 17c1.5-2 4-3 5-2s-0.5 2.5-2 3-3 0-3-1z" /><path d="M15 21h-6" /></>,
  // 1 광산물 — 다이아몬드
  1: <><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20" /></>,
  // 2 화학공업제품 — 플라스크
  2: <><path d="M9 3h6v5l4 8a2 2 0 0 1-1.8 3H6.8A2 2 0 0 1 5 16l4-8V3" /><path d="M9 3h6" /></>,
  // 3 플라스틱·고무·가죽 — 육각형(분자)
  3: <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z" />,
  // 4 섬유류 — 실타래
  4: <><circle cx="12" cy="12" r="7" /><path d="M5 12c0-3 3-5.5 7-5.5s7 2.5 7 5.5" /><path d="M5 12c0 3 3 5.5 7 5.5s7-2.5 7-5.5" /></>,
  // 5 생활용품 — 집
  5: <><path d="M3 10l9-7 9 7" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /></>,
  // 6 철강·금속 — 너트/볼트
  6: <><path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z" /><circle cx="12" cy="12" r="3" /></>,
  // 7 기계·운송장비 — 기어
  7: <><circle cx="12" cy="12" r="3" /><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-4.2-6.8l-1.4 1.4M5.6 18.4l-1.4 1.4m0-15.6l1.4 1.4m12.8 12.8l1.4 1.4" /></>,
  // 8 전자·전기 — 번개
  8: <path d="M13 2L4 14h7l-2 8 10-12h-7z" fill="currentColor" />,
  // 9 잡제품 — 그리드
  9: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
};

// 금액을 적절한 단위로 포맷 (value는 억 단위 기준)
// 예: 986.3 → "$986.3억" / 0.00634 → "$63.4만" / 82 → "$82억"
function formatAmount(v: number): string {
  if (v >= 1) {
    const rounded = Math.floor(v * 10) / 10;
    return `$${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}억`;
  }
  const man = Math.floor(v * 10000 * 10) / 10; // 만 단위, 소수 1자리
  if (man >= 0.1) return `$${man}만`;
  return `$${Math.round(v * 1e8).toLocaleString()}`;
}

interface CustomContentProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; value?: number;
  data: ProductNode[];
  animKey?: number;
}

// MTI 대분류별 폰트 색상 (배경색 위 텍스트)
const MTI_FONT_COLORS: Record<number, string> = {
  0: "#FFFFFF",
  1: "#FFFFFF",
  2: "#FFFFFF",
  3: "#FFFFFF",
  4: "#FFFFFF",
  5: "#FFFFFF",
  6: "#FFFFFF",
  7: "#FFFFFF",
  8: "#FFFFFF",
  9: "#FFFFFF",
};

function CustomContent({ x = 0, y = 0, width = 0, height = 0, name, value = 0, data, animKey = 0 }: CustomContentProps) {
  if (width < 10 || height < 10) return null;
  if (!name || name === "root") return null;

  const item = data.find((d) => d.name === name);
  const color = item?.color ?? "#3B82F6";
  const mti = item?.mti ?? 0;
  const fontColor = MTI_FONT_COLORS[mti] ?? "#333";
  const pad = 4;
  const baseFontSize = width > 120 ? 14 : width > 60 ? 11 : 9;
  const nameLen = (name ?? "").length;
  const availWidth = width - pad * 2;
  const availHeight = height - pad * 2;
  // 한글 기준 글자 폭 ≈ fontSize, 줄높이 ≈ fontSize * 1.3
  // 가로에 들어가는 글자 수 = availWidth / fontSize
  // 필요한 줄 수 = nameLen / 가로글자수
  // 필요한 높이 = 줄수 * fontSize * 1.3 + 금액텍스트(~14px)
  // fontSize를 줄여가며 맞추기
  let fontSize = baseFontSize;
  while (fontSize > 7) {
    const charsPerLine = Math.floor(availWidth / fontSize);
    if (charsPerLine < 1) { fontSize--; continue; }
    const lines = Math.ceil(nameLen / charsPerLine);
    const textHeight = lines * fontSize * 1.3 + (height > 38 ? 14 : 0);
    if (textHeight <= availHeight) break;
    fontSize--;
  }
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g
      style={{
        cursor: "pointer",
        transformOrigin: `${cx}px ${cy}px`,
        animation: `tcell-${animKey} 0.5s cubic-bezier(0.22, 1, 0.36, 1) both`,
      }}
    >
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={1} />
      {width > 36 && height > 22 && (
        <foreignObject x={x + pad} y={y} width={width - pad * 2} height={height}>
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              pointerEvents: "none",
              padding: `${pad}px 0`,
            }}
          >
            <span style={{
              color: fontColor,
              fontSize,
              fontWeight: 600,
              lineHeight: 1.2,
              textAlign: "center",
              wordBreak: "break-all",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: height > 50 ? 3 : 2,
              WebkitBoxOrient: "vertical",
            }}>
              {name}
            </span>
            {height > 38 && (
              <span style={{
                color: fontColor,
                opacity: 0.75,
                fontSize: Math.max(fontSize - 2, 8),
                marginTop: 2,
                whiteSpace: "nowrap",
              }}>
                {formatAmount(value)}
              </span>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

interface TooltipState {
  x: number;
  y: number;
  item: ProductNode;
}

interface TreemapChartProps {
  forCountry?: boolean;
  countryName?: string;
  year?: string;
  month?: string;
  tradeType?: TradeType;
  mtiDepth?: number;
  onLoadingChange?: (loading: boolean) => void;
  onCategoryChange?: (mti: number | null) => void;
}

export default function TreemapChart({
  forCountry = false,
  countryName,
  year = DEFAULT_YEAR,
  month = "",
  tradeType = "수출",
  mtiDepth = 3,
  onLoadingChange,
  onCategoryChange,
}: TreemapChartProps) {
  const router = useRouter();

  const [treemapData, setTreemapData] = useState<ProductNode[]>([]);
  const [prevYearRaw, setPrevYearRaw] = useState<ProductNode[]>([]);
  const [noData, setNoData] = useState(false);
  const [zoomedMti, setZoomedMti] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [animating, setAnimating] = useState(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const startTreemapAnimation = () => {
    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current);
    }
    setAnimKey((k) => k + 1);
    setAnimating(true);
    animTimeoutRef.current = setTimeout(() => {
      setAnimating(false);
    }, 520);
  };

  useEffect(() => {
    let mounted = true;
    onLoadingChange?.(true);

    const loadData = async () => {
      if (!month) {
        // 연간: Supabase 집계 테이블에서 조회
        const data = forCountry && countryName
          ? await getCountryTreemapDataAsync(year, countryName, tradeType)
          : await getTreemapDataAsync(year, tradeType);
        if (!mounted) return;
        if (data.length === 0) {
          setNoData(true);
          setTreemapData([]);
        } else {
          setNoData(false);
          setTreemapData(data);
        }
      } else {
        // 월별: 기존 Supabase RPC
        const data = forCountry && countryName
          ? await getCountryMonthlyTreemapData(year, month, countryName, tradeType)
          : await getMonthlyTreemapData(year, month, tradeType);
        if (!mounted) return;
        if (data.length === 0) {
          setNoData(true);
          setTreemapData([]);
        } else {
          setNoData(false);
          setTreemapData(data);
        }
      }
    };

    loadData()
      .catch(() => { if (mounted) { setNoData(false); setTreemapData([]); } })
      .finally(() => { if (mounted) { startTreemapAnimation(); onLoadingChange?.(false); } });

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, tradeType, countryName, forCountry]);

  // 전년 대비 증감률을 위한 전년 동기 데이터 로드 (툴팁에 사용)
  // 연간: 전년 연간 | 월별: 전년 동일 월
  useEffect(() => {
    let mounted = true;
    const prevYear = String(parseInt(year, 10) - 1);
    const loadPrev = async () => {
      try {
        const prevData = !month
          ? (forCountry && countryName
              ? await getCountryTreemapDataAsync(prevYear, countryName, tradeType)
              : await getTreemapDataAsync(prevYear, tradeType))
          : (forCountry && countryName
              ? await getCountryMonthlyTreemapData(prevYear, month, countryName, tradeType)
              : await getMonthlyTreemapData(prevYear, month, tradeType));
        if (mounted) setPrevYearRaw(prevData);
      } catch {
        if (mounted) setPrevYearRaw([]);
      }
    };
    loadPrev();
    return () => { mounted = false; };
  }, [year, month, tradeType, countryName, forCountry]);

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) {
        clearTimeout(animTimeoutRef.current);
      }
    };
  }, []);

  const aggregatedData = aggregateTreemapByDepth(treemapData, mtiDepth);
  // 카테고리 버튼 클릭 시: 전체 데이터에서 해당 카테고리 Top 30 표시
  // 단위 셀렉터 변경 시: Top 100 기반 집계 데이터 표시
  const displayData = zoomedMti !== null
    ? treemapData
        .filter((d) => d.mti === zoomedMti)
        .sort((a, b) => b.value - a.value)
        .slice(0, 30)
    : aggregatedData;

  // 비중(%) 계산용 전체 합계 — 화면에 표시된 데이터 전체 기준
  const totalValue = useMemo(
    () => treemapData.reduce((s, d) => s + d.value, 0) || 1,
    [treemapData],
  );

  // 전년 데이터 code → value 매핑 (6자리 원본 기준, 확대 뷰에서 사용)
  const prevRawByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of prevYearRaw) m.set(p.code, p.value);
    return m;
  }, [prevYearRaw]);

  // 전년 데이터 code → value 매핑 (mtiDepth로 집계, 일반 뷰에서 사용)
  const prevAggByCode = useMemo(() => {
    const agg = aggregateTreemapByDepth(prevYearRaw, mtiDepth);
    const m = new Map<string, number>();
    for (const p of agg) m.set(p.code, p.value);
    return m;
  }, [prevYearRaw, mtiDepth]);

  // 불완전 연도 + 연간 조회 판별 (KPIBar와 동일 기준) — 전년 대비 비교가 무의미
  const currentCalendarYear = new Date().getFullYear();
  const isAnnualIncomplete = !month && parseInt(year, 10) >= currentCalendarYear;
  // 실제 집계 월 범위 ("1~2월" 등) — 배지에 표기
  const incompleteMonthRange = useIncompleteMonthRange(year);

  // 카테고리별 집계(금액·비중·전년 대비·상위3) 사전 계산 — 모든 MTI + ALL
  const categoryAggregates = useMemo(() => {
    const totalCurrent = treemapData.reduce((s, d) => s + d.value, 0);
    const totalPrev = prevYearRaw.reduce((s, d) => s + d.value, 0);
    const byMti = new Map<number, { curr: ProductNode[]; prev: ProductNode[] }>();
    for (const d of treemapData) {
      const e = byMti.get(d.mti) ?? { curr: [], prev: [] };
      e.curr.push(d);
      byMti.set(d.mti, e);
    }
    for (const d of prevYearRaw) {
      const e = byMti.get(d.mti) ?? { curr: [], prev: [] };
      e.prev.push(d);
      byMti.set(d.mti, e);
    }
    const per: Record<number, {
      amount: number;
      share: number;
      yoy: number | null;
      topItems: { name: string; value: number }[];
    }> = {};
    for (const [m, { curr, prev }] of byMti.entries()) {
      const amount = curr.reduce((s, d) => s + d.value, 0);
      const prevAmount = prev.reduce((s, d) => s + d.value, 0);
      const share = totalCurrent > 0 ? (amount / totalCurrent) * 100 : 0;
      const yoy = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : null;
      const topItems = [...curr]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((d) => ({ name: d.name, value: d.value }));
      per[m] = { amount, share, yoy, topItems };
    }
    const all = {
      amount: totalCurrent,
      share: 100,
      yoy: totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : null,
      topItems: [...treemapData]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((d) => ({ name: d.name, value: d.value })),
    };
    return { per, all };
  }, [treemapData, prevYearRaw]);

  const onTreemapMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as SVGElement;
    const g = target.closest?.("g");
    const rect = g?.querySelector?.("rect");
    if (!rect) { setTooltip(null); return; }
    const fill = rect.getAttribute("fill");
    if (!fill || fill === "#fff" || fill === "transparent") { setTooltip(null); return; }
    const fo = g?.querySelector?.("foreignObject");
    const nameSpan = fo?.querySelector?.("span");
    const cellName = nameSpan?.textContent;
    if (!cellName) { setTooltip(null); return; }
    const item = displayData.find((d) => d.name === cellName);
    if (!item) { setTooltip(null); return; }
    setTooltip({ x: e.clientX, y: e.clientY, item });
  }, [displayData]);

  const onTreemapMouseLeave = useCallback(() => { setTooltip(null); }, []);

  const chartData = [{
    name: "root",
    children: displayData.filter((d) => d.value > 0).map((d) => ({ name: d.name, size: d.value })),
  }];

  const handleClick = (data: { name?: string } | null) => {
    if (!data?.name) return;
    const item = displayData.find((d) => d.name === data.name);
    if (!item) return;
    const params = new URLSearchParams({ code: item.code, year });
    router.push(`/product/${encodeURIComponent(item.name)}?${params.toString()}`);
  };

  return (
    <div className="w-full h-full flex flex-col relative" onMouseLeave={onTreemapMouseLeave}>
      <style>{`
        @keyframes tcell-${animKey} {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        .mti-icon-btn {
          height: 26px;
          display: flex; align-items: center; justify-content: center;
          gap: 4px;
          border-radius: 6px;
          border: 2px solid transparent;
          background: #f1f5f9;
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
        }
        .mti-icon-btn:hover {
          background: var(--mti-color);
          transform: translateY(-1px);
          border-color: var(--mti-color);
        }
        .mti-icon-btn:hover svg {
          stroke: #fff;
        }
        .mti-icon-btn:hover span {
          color: #fff !important;
        }
        .mti-icon-btn--active {
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }
        .mti-icon-btn--active svg {
          stroke: #fff;
        }
        .mti-icon-btn[data-tooltip] {
          position: relative;
        }
        .mti-icon-btn[data-tooltip]::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          padding: 4px 8px;
          background: #1e293b;
          color: #fff;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.3;
          white-space: nowrap;
          border-radius: 4px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .mti-icon-btn[data-tooltip]:hover::after {
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }
      `}</style>

      <div className="flex-1 min-h-0">
        {noData || displayData.filter((d) => d.value > 0).length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "#94a3b8", fontSize: 13,
            border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc",
          }}>
            데이터가 없습니다.
          </div>
        ) : (
          <div onMouseMove={onTreemapMouseMove} onMouseLeave={onTreemapMouseLeave} style={{ width: "100%", height: "100%" }}>
            <ResponsiveContainer width="100%" height="100%" style={{ cursor: "pointer" }}>
              <Treemap
                data={chartData}
                dataKey="size"
                aspectRatio={4 / 3}
                isAnimationActive={false}
                onClick={handleClick}
                content={<CustomContent data={displayData} animKey={animating ? animKey : -1} />}
              />
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* MTI 대분류 아이콘 필터 (호버 시 상세 툴팁 노출) */}
      <div style={{ display: "flex", width: "100%", flexShrink: 0, paddingTop: 4 }}>
        {Object.entries(MTI_COLORS).map(([mti, color]) => {
          const n = Number(mti);
          const isActive = zoomedMti === n;
          return (
            <CategoryChipButton
              key={mti}
              mti={n}
              label={MTI_NAMES[n]}
              color={color as string}
              isActive={isActive}
              isAnnualIncomplete={isAnnualIncomplete}
              monthRange={incompleteMonthRange}
              aggregate={categoryAggregates.per[n] ?? { amount: 0, share: 0, yoy: null, topItems: [] }}
              onClick={() => {
                const next = isActive ? null : n;
                setZoomedMti(next);
                onCategoryChange?.(next);
                startTreemapAnimation();
              }}
            />
          );
        })}
        <CategoryChipButton
          mti="all"
          label="전체 품목"
          color="#94A3B8"
          isActive={zoomedMti === null}
          isAnnualIncomplete={isAnnualIncomplete}
          monthRange={incompleteMonthRange}
          aggregate={categoryAggregates.all}
          onClick={() => {
            setZoomedMti(null);
            onCategoryChange?.(null);
            startTreemapAnimation();
          }}
        />
      </div>

      {/* 마우스 추적 툴팁 — 카테고리 dot + 품목 / 카테고리·MTI코드 / 금액·비중 / 전년 대비 */}
      {tooltip && typeof document !== "undefined" && (() => {
        const item = tooltip.item;
        const sharePct = (item.value / totalValue) * 100;
        const prevValue = zoomedMti !== null
          ? prevRawByCode.get(item.code) ?? 0
          : prevAggByCode.get(item.code) ?? 0;

        // 전년 대비 줄 계산 — 불완전 연도·연간 조회면 "부분 데이터(1~N월)", 전년 0/미존재면 "-"
        let yoyLine: React.ReactNode;
        if (isAnnualIncomplete) {
          yoyLine = (
            <span style={{ color: "#999" }}>
              - <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>
                ⓘ 부분 데이터{incompleteMonthRange ? `(${incompleteMonthRange})` : ""}
              </span>
            </span>
          );
        } else if (prevValue <= 0) {
          yoyLine = <span style={{ color: "#999" }}>- 전년 대비</span>;
        } else {
          const diff = item.value - prevValue;
          const pct = Math.abs(diff / prevValue) * 100;
          const up = diff >= 0;
          const noChange = Math.abs(diff) < 1e-9;
          const color = noChange ? "#999" : up ? "#E02020" : "#185FA5";
          const arrow = noChange ? "-" : up ? "▲" : "▼";
          const sign = noChange ? "" : up ? "+" : "-";
          yoyLine = (
            <span style={{ color }}>
              {arrow} 전년 대비 {sign}{pct.toFixed(1)}%
            </span>
          );
        }

        return createPortal(
          <div
            className="tooltip-shell tooltip-shell--fixed"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, calc(-100% - 12px))",
            }}
          >
            {/* 1줄: 카테고리 dot + 품목명 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span>{item.name}</span>
            </div>
            {/* 2줄: 카테고리명 · MTI 코드 */}
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              {MTI_NAMES[item.mti] ?? "기타"} · MTI {item.code}
            </div>
            {/* 3줄: 금액 · 비중 */}
            <div style={{ fontSize: 12, marginTop: 4, fontWeight: 500 }}>
              {formatAmount(item.value)} · {sharePct.toFixed(1)}%
            </div>
            {/* 4줄: 전년 대비 증감 */}
            <div style={{ fontSize: 12, marginTop: 4 }}>{yoyLine}</div>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}

// ─── 카테고리 칩 버튼 + 호버 툴팁 ─────────────────────────────────────
// WCAG 1.4.13: Dismissible(ESC) / Hoverable(툴팁 hover 유지) / Persistent(호버 중 유지)

interface CategoryAggregate {
  amount: number;
  share: number;
  yoy: number | null;
  topItems: { name: string; value: number }[];
}

interface CategoryChipButtonProps {
  mti: number | "all";
  label: string;
  color: string;
  isActive: boolean;
  isAnnualIncomplete: boolean;
  /** 부분 집계 월 범위 ("1~2월" 등) — 배지 표기에 사용 */
  monthRange: string | null;
  aggregate: CategoryAggregate;
  onClick: () => void;
}

function CategoryChipButton({
  mti, label, color, isActive, isAnnualIncomplete, monthRange, aggregate, onClick,
}: CategoryChipButtonProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ cx: number; topY: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = `mti-tip-${mti}`;

  const clearEnter = () => { if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; } };
  const clearLeave = () => { if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; } };

  const openNow = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ cx: r.left + r.width / 2, topY: r.top });
    setShow(true);
  }, []);

  const handleEnter = useCallback(() => {
    clearLeave();
    clearEnter();
    enterTimer.current = setTimeout(openNow, 300);
  }, [openNow]);

  const handleLeave = useCallback(() => {
    clearEnter();
    clearLeave();
    leaveTimer.current = setTimeout(() => setShow(false), 100);
  }, []);

  const handleFocus = useCallback(() => {
    clearEnter();
    clearLeave();
    openNow();
  }, [openNow]);

  const handleBlur = useCallback(() => { setShow(false); }, []);

  // 모바일: 첫 tap → 툴팁 표시(필터 보류), 두 번째 tap → 필터 적용
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!show) {
      e.preventDefault();
      openNow();
    }
  }, [show, openNow]);

  // ESC → 닫기
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShow(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  // unmount cleanup
  useEffect(() => () => { clearEnter(); clearLeave(); }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-pressed={isActive}
        aria-describedby={show ? tipId : undefined}
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onTouchStart={handleTouchStart}
        className={`mti-icon-btn${isActive ? " mti-icon-btn--active" : ""}`}
        style={{
          "--mti-color": color,
          flex: 1,
          borderRadius: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isActive ? color : undefined,
          borderColor: isActive ? color : "transparent",
        } as React.CSSProperties}
      >
        {mti === "all" ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? "#fff" : "#64748b", lineHeight: 1 }}>
            ALL
          </span>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke={isActive ? "#fff" : color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {MTI_ICON_PATHS[mti]}
            </svg>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: isActive ? "#fff" : "#475569",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 80,
            }}>
              {label}
            </span>
          </>
        )}
      </button>
      {show && pos && typeof document !== "undefined" && createPortal(
        <CategoryTooltip
          id={tipId}
          position={pos}
          iconPath={mti === "all" ? null : MTI_ICON_PATHS[mti]}
          iconColor={color}
          label={label}
          aggregate={aggregate}
          isAnnualIncomplete={isAnnualIncomplete}
          monthRange={monthRange}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        />,
        document.body,
      )}
    </>
  );
}

interface CategoryTooltipProps {
  id: string;
  position: { cx: number; topY: number };
  iconPath: React.ReactNode | null;
  iconColor: string;
  label: string;
  aggregate: CategoryAggregate;
  isAnnualIncomplete: boolean;
  monthRange: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function CategoryTooltip({
  id, position, iconPath, iconColor, label, aggregate, isAnnualIncomplete, monthRange,
  onMouseEnter, onMouseLeave,
}: CategoryTooltipProps) {
  const { amount, share, yoy, topItems } = aggregate;

  // 전년 대비 라인 — 색상은 KPIBar와 동일하게 #E02020(상승)/#185FA5(하락)/회색 동률
  let yoyNode: React.ReactNode;
  if (isAnnualIncomplete) {
    // 다른 곳들(KPIBar / RechartsTooltip / country page)과 문구 통일
    yoyNode = (
      <span style={{ color: "#A5A39A", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span>–</span>
        <span style={{ fontSize: 10, opacity: 0.85 }}>
          ⓘ 부분 데이터{monthRange ? `(${monthRange})` : ""}
        </span>
      </span>
    );
  } else if (yoy === null) {
    yoyNode = <span style={{ color: "#A5A39A" }}>–</span>;
  } else {
    const abs = Math.abs(yoy);
    const noChange = abs < 0.05; // 반올림 기준 0.0%
    const up = yoy >= 0;
    const color = noChange ? "#A5A39A" : up ? "#E02020" : "#185FA5";
    const arrow = noChange ? "–" : up ? "▲" : "▼";
    const sign = noChange ? "" : up ? "+" : "-";
    yoyNode = (
      <span style={{ color }}>
        {arrow} {sign}{abs.toFixed(1)}%
      </span>
    );
  }

  return (
    <div
      id={id}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        left: position.cx,
        top: position.topY - 8,
        transform: "translate(-50%, -100%)",
        minWidth: 200,
        maxWidth: 240,
        padding: "10px 12px",
        borderRadius: 8,
        background: "#1F1E1C",
        color: "#F5F4EE",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: 12,
        lineHeight: 1.5,
        zIndex: 1000,
        pointerEvents: "auto",
      }}
    >
      {/* 헤더: 아이콘 + 카테고리명 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>
        {iconPath && (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={iconColor}
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {iconPath}
          </svg>
        )}
        <span>{label}</span>
      </div>
      {/* 값 3줄 */}
      <CategoryTooltipRow label="금액" value={formatAmount(amount)} />
      <CategoryTooltipRow label="비중" value={`${share.toFixed(1)}%`} />
      <CategoryTooltipRow label="전년 대비" value={yoyNode} />
      {/* 구분선 + 상위 품목 */}
      {topItems.length > 0 && (
        <>
          <div style={{ height: 0.5, background: "rgba(245,244,238,0.2)", margin: "8px 0 6px" }} />
          <div style={{ color: "#C9C7BE", fontSize: 11, marginBottom: 4 }}>상위 품목</div>
          {topItems.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, marginTop: 2 }}>
              <span style={{ color: "#A5A39A", flexShrink: 0, width: 26 }}>{i + 1}위</span>
              <span style={{
                color: "#F5F4EE",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {it.name}
              </span>
            </div>
          ))}
        </>
      )}
      {/* 하단 중앙 삼각 포인터 */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -5,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: "5px solid #1F1E1C",
        }}
      />
    </div>
  );
}

function CategoryTooltipRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
      <span style={{ color: "#C9C7BE" }}>{label}</span>
      <span style={{ color: "#F5F4EE", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
