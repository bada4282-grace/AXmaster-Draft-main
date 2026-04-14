"use client";
import { useState, useEffect, useRef } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { getTreemapData, getCountryTreemapData, MTI_COLORS, MTI_NAMES, ProductNode, DEFAULT_YEAR, type TradeType } from "@/lib/data";
import { getMonthlyTreemapData, getCountryMonthlyTreemapData } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { rechartsTooltipSurfaceProps } from "@/components/RechartsTooltip";

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

function CustomContent({ x = 0, y = 0, width = 0, height = 0, name, value = 0, data, animKey = 0 }: CustomContentProps) {
  if (width < 10 || height < 10) return null;
  if (!name || name === "root") return null;

  const item = data.find((d) => d.name === name);
  const color = item?.color ?? "#3B82F6";
  const fontSize = width > 120 ? 14 : width > 60 ? 11 : 9;
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g
      style={{
        transformOrigin: `${cx}px ${cy}px`,
        animation: `tcell-${animKey} 0.5s cubic-bezier(0.22, 1, 0.36, 1) both`,
      }}
    >
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={1} />
      {width > 40 && height > 25 && (
        <>
          <text
            x={x + width / 2} y={y + height / 2 - (width > 80 ? 8 : 4)}
            textAnchor="middle" fill="white" fontSize={fontSize} fontWeight={600}
            style={{ pointerEvents: "none" }}
          >
            {width > 80 ? name : (name?.slice(0, 4) ?? "")}
          </text>
          {width > 50 && height > 40 && (
            <text
              x={x + width / 2} y={y + height / 2 + (width > 80 ? 10 : 8)}
              textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={Math.max(fontSize - 2, 8)}
              style={{ pointerEvents: "none" }}
            >
              {formatAmount(value)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function CustomTooltip({
  active, payload, data, tradeType,
}: {
  active?: boolean; payload?: any[]; data: ProductNode[]; tradeType: TradeType;
}) {
  if (!active || !payload?.length) return null;
  const item = data.find((d) => d.name === payload[0]?.payload?.name);
  if (!item) return null;
  const label = tradeType === "수입" ? "수입액" : "수출액";
  const ctrlabel = tradeType === "수입" ? "상위 수입국" : "상위 수출국";
  return (
    <div className="tooltip-shell">
      <p className="tooltip-shell-title">{item.name}</p>
      <p className="tooltip-shell-line">
        {label}: <strong>{formatAmount(item.value)}</strong>
      </p>
      {item.topCountries && item.topCountries.length > 0 && (
        <>
          <p className="tooltip-shell-line" style={{ marginTop: 8, fontWeight: 600, color: "#64748b" }}>
            {ctrlabel}:
          </p>
          <ul className="tooltip-shell-list">
            {item.topCountries.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </>
      )}
      <p className="tooltip-shell-hint" style={{ marginTop: 10 }}>
        클릭하면 상세 페이지로 이동
      </p>
    </div>
  );
}

interface TreemapChartProps {
  forCountry?: boolean;
  countryName?: string;
  year?: string;
  month?: string;
  tradeType?: TradeType;
}

export default function TreemapChart({
  forCountry = false,
  countryName,
  year = DEFAULT_YEAR,
  month = "",
  tradeType = "수출",
}: TreemapChartProps) {
  const router = useRouter();

  const annualData = forCountry && countryName
    ? getCountryTreemapData(year, countryName, tradeType)
    : getTreemapData(year, tradeType);

  const [treemapData, setTreemapData] = useState<ProductNode[]>(annualData);
  const [noData, setNoData] = useState(false);
  const [zoomedMti, setZoomedMti] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [animating, setAnimating] = useState(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!month) {
      setNoData(false);
      setTreemapData(annualData);
      startTreemapAnimation();
      return;
    }
    const fetch = forCountry && countryName
      ? getCountryMonthlyTreemapData(year, month, countryName, tradeType)
      : getMonthlyTreemapData(year, month, tradeType);

    fetch
      .then((data) => {
        if (data.length === 0) {
          setNoData(true);
          setTreemapData([]);
        } else {
          setNoData(false);
          setTreemapData(data);
        }
      })
      .catch(() => {
        setNoData(false);
        setTreemapData(annualData);
      })
      .finally(() => startTreemapAnimation());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, tradeType, countryName, forCountry]);

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) {
        clearTimeout(animTimeoutRef.current);
      }
    };
  }, []);

  const displayData = zoomedMti !== null
    ? treemapData.filter((d) => d.mti === zoomedMti)
    : treemapData;

  const chartData = [{
    name: "root",
    children: displayData.filter((d) => d.value > 0).map((d) => ({ name: d.name, size: d.value })),
  }];

  const handleClick = (data: any) => {
    if (!data?.name) return;
    const item = treemapData.find((d) => d.name === data.name);
    if (!item) return;
    if (forCountry) return;
    router.push(`/product/${encodeURIComponent(item.name)}`);
  };

  return (
    <div className="w-full h-full flex flex-col relative">
      <style>{`
        @keyframes tcell-${animKey} {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div className="flex-1 min-h-0">
        {noData ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: "#94a3b8", fontSize: 13,
            border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc",
          }}>
            데이터가 없습니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={chartData}
              dataKey="size"
              aspectRatio={4 / 3}
              isAnimationActive={false}
              onClick={handleClick}
              content={<CustomContent data={treemapData} animKey={animating ? animKey : -1} />}
            >
              <Tooltip
                content={<CustomTooltip data={treemapData} tradeType={tradeType} />}
                {...rechartsTooltipSurfaceProps}
              />
            </Treemap>
          </ResponsiveContainer>
        )}
      </div>

      {/* MTI 카테고리 필터 */}
      <div className="flex items-center justify-center gap-1 pt-2 flex-wrap">
        {Object.entries(MTI_COLORS).map(([mti, color]) => (
          <button
            key={mti}
            title={MTI_NAMES[Number(mti)]}
            onClick={() => setZoomedMti(zoomedMti === Number(mti) ? null : Number(mti))}
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
              zoomedMti === Number(mti) ? "border-gray-800 scale-110" : "border-white"
            }`}
            style={{ background: color as string }}
          />
        ))}
        {zoomedMti !== null && (
          <button
            onClick={() => setZoomedMti(null)}
            className="text-xs text-gray-500 ml-1 hover:text-gray-800"
          >
            전체
          </button>
        )}
      </div>
    </div>
  );
}
