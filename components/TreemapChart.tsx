"use client";
import { useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { getTreemapData, getCountryTreemapData, MTI_COLORS, MTI_NAMES, ProductNode, DEFAULT_YEAR, type TradeType } from "@/lib/data";
import { useRouter } from "next/navigation";
import { rechartsTooltipSurfaceProps } from "@/components/RechartsTooltip";

interface CustomContentProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; value?: number;
  data: ProductNode[];
}

function CustomContent({ x = 0, y = 0, width = 0, height = 0, name, value, data }: CustomContentProps) {
  if (width < 10 || height < 10) return null;
  const item = data.find((d) => d.name === name);
  const color = item?.color ?? "#3B82F6";
  const fontSize = width > 120 ? 14 : width > 60 ? 11 : 9;

  return (
    <g>
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
              ${value}억
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
        {label}: <strong>${item.value}억</strong>
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
  countryName?: string;    // forCountry=true 일 때 해당 국가명
  year?: string;
  tradeType?: TradeType;
}

export default function TreemapChart({
  forCountry = false,
  countryName,
  year = DEFAULT_YEAR,
  tradeType = "수출",
}: TreemapChartProps) {
  const router = useRouter();
  // 국가 상세 페이지: 해당 국가와의 교역 품목 데이터
  // 메인 대시보드: 전체 글로벌 데이터
  const treemapData = forCountry && countryName
    ? getCountryTreemapData(year, countryName, tradeType)
    : getTreemapData(year, tradeType);
  const [zoomedMti, setZoomedMti] = useState<number | null>(null);

  const displayData = zoomedMti !== null
    ? treemapData.filter((d) => d.mti === zoomedMti)
    : treemapData;

  const chartData = [{
    name: "root",
    children: displayData.map((d) => ({ name: d.name, size: d.value })),
  }];

  const handleClick = (data: any) => {
    if (!data?.name) return;
    const item = treemapData.find((d) => d.name === data.name);
    if (!item) return;
    if (forCountry) return;
    router.push(`/product/${encodeURIComponent(item.name)}`);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={chartData}
            dataKey="size"
            aspectRatio={4 / 3}
            onClick={handleClick}
            content={<CustomContent data={treemapData} />}
          >
            <Tooltip
              content={<CustomTooltip data={treemapData} tradeType={tradeType} />}
              {...rechartsTooltipSurfaceProps}
            />
          </Treemap>
        </ResponsiveContainer>
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
