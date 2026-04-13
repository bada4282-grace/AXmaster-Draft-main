"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getCountryData, getMapColor, DEFAULT_YEAR, type TradeType } from "@/lib/data";
import { getMonthlyCountryMapData, type MonthlyCountryMapItem } from "@/lib/supabase";

// @ts-ignore
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const ISO_NUM_TO_ALPHA2: Record<string, string> = {
  "156": "CN", "840": "US", "704": "VN", "392": "JP", "344": "HK",
  "036": "AU", "356": "IN", "702": "SG", "158": "TW", "276": "DE",
  "484": "MX", "458": "MY", "608": "PH", "826": "GB", "528": "NL",
  "764": "TH", "616": "PL", "360": "ID", "124": "CA", "682": "SA",
  "792": "TR", "380": "IT", "250": "FR", "724": "ES", "076": "BR",
};

interface Tooltip {
  x: number; y: number;
  country: string;
  rank?: number;
  export?: string;
  topProducts?: string[];
  isTop30: boolean;
}

interface WorldMapProps {
  year?: string;
  month?: string;
  tradeType?: TradeType;
}

export default function WorldMap({ year = DEFAULT_YEAR, month = "", tradeType = "수출" }: WorldMapProps) {
  const router = useRouter();
  const annualData = getCountryData(year, tradeType);

  // 월별 데이터: ctr_name → { rank, total_amt }
  const [monthlyMap, setMonthlyMap] = useState<Map<string, MonthlyCountryMapItem>>(new Map());

  useEffect(() => {
    if (!month) {
      setMonthlyMap(new Map());
      return;
    }
    getMonthlyCountryMapData(year, month, tradeType)
      .then((rows) => {
        console.log("[WorldMap] monthly rows:", rows.length, "sample:", rows[0]);
        const m = new Map<string, MonthlyCountryMapItem>();
        rows.forEach((r) => m.set(r.ctr_name, r));
        console.log("[WorldMap] annualData names sample:", annualData.slice(0, 5).map(d => d.name));
        setMonthlyMap(m);
      })
      .catch((e) => { console.error("[WorldMap] fetch error:", e); setMonthlyMap(new Map()); });
  }, [year, month, tradeType]);

  const isMonthly = month !== "" && monthlyMap.size > 0;

  // iso 코드 → 표시용 국가 정보 반환 (월별 우선, 없으면 연간)
  const resolveCountry = (alpha2: string) => {
    const annual = annualData.find((d) => d.iso === alpha2);
    if (!annual) return null;
    if (isMonthly) {
      const m = monthlyMap.get(annual.name);
      if (m) return { ...annual, rank: Number(m.rank), export: String(Math.round(m.total_amt / 1e8)) };
    }
    return annual;
  };

  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([20, 10]);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const getCountryColor = (isoNum: string) => {
    const alpha2 = ISO_NUM_TO_ALPHA2[isoNum];
    if (!alpha2) return "#CDE8DA";
    const c = resolveCountry(alpha2);
    if (!c) return "#CDE8DA";
    // 월별 모드: TOP30에 없으면 연간 기본색
    if (isMonthly && !monthlyMap.get(c.name)) return "#CDE8DA";
    return getMapColor(c.rank);
  };

  return (
    <div className="relative w-full h-full bg-[#F2FBFF]" style={{ minHeight: 340 }}>
      {/* Zoom controls */}
      <div className="absolute bottom-10 right-2 z-10 flex flex-col gap-1">
        {[
          { label: "+", fn: () => setZoom((z) => Math.min(z + 0.5, 6)) },
          { label: "−", fn: () => setZoom((z) => Math.max(z - 0.5, 1)) },
        ].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            className="bg-white border border-gray-300 text-base w-7 h-7 flex items-center justify-center rounded shadow hover:bg-gray-50 font-medium"
          >
            {label}
          </button>
        ))}
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [20, 15] }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ coordinates, zoom: z }: { coordinates: [number, number]; zoom: number }) => {
            setCenter(coordinates);
            setZoom(z);
          }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map((geo: any) => {
                const isoNum = String(geo.id ?? "").padStart(3, "0");
                const alpha2 = ISO_NUM_TO_ALPHA2[isoNum];
                const cData = alpha2 ? resolveCountry(alpha2) : null;
                const isClickable = !!cData && cData.rank <= 30;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={getCountryColor(isoNum)}
                    stroke="#fff"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none", cursor: isClickable ? "pointer" : "default" },
                      hover: { outline: "none", fill: "#FFD700", opacity: 0.9 },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={(evt: React.MouseEvent<SVGPathElement>) => {
                      setTooltip({
                        x: evt.clientX,
                        y: evt.clientY,
                        country: cData?.name ?? geo.properties?.name ?? "알 수 없음",
                        rank: cData?.rank,
                        export: cData?.export,
                        topProducts: isMonthly ? undefined : cData?.topProducts,
                        isTop30: isClickable,
                      });
                    }}
                    onMouseMove={(evt: React.MouseEvent<SVGPathElement>) => {
                      setTooltip((prev) =>
                        prev ? { ...prev, x: evt.clientX, y: evt.clientY } : null
                      );
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => {
                      if (isClickable) {
                        const annual = annualData.find((d) => d.iso === alpha2);
                        if (annual) {
                          const mode = tradeType === "수입" ? "import" : "export";
                          router.push(`/country/${encodeURIComponent(annual.name)}?mode=${mode}`);
                        }
                      }
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 flex-wrap text-[9px]">
        <span className="text-gray-600 mr-1 font-medium">{tradeType === "수입" ? "수입액" : "수출액"} 순위</span>
        {[
          { color: "#0F4C5C", label: "1~3위" },
          { color: "#1D6F78", label: "4~9위" },
          { color: "#3E8F92", label: "10~15위" },
          { color: "#66AFA9", label: "16~21위" },
          { color: "#95CBC0", label: "22~30위" },
          { color: "#CDE8DA", label: "TOP30 외" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-0.5">
            <div className="w-5 h-3 rounded-sm" style={{ background: color }} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="tooltip-shell tooltip-shell--fixed"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, calc(-100% - 12px))",
            }}
          >
            <p className="tooltip-shell-title">{tooltip.country}</p>
            {tooltip.isTop30 ? (
              <>
                <p className="tooltip-shell-line">
                  {tradeType === "수입" ? "수입" : "수출"} 순위: <strong>{tooltip.rank}위</strong>
                </p>
                <p className="tooltip-shell-line">
                  {tradeType === "수입" ? "수입액" : "수출액"}: <strong>${tooltip.export}억</strong>
                </p>
                {tooltip.topProducts && tooltip.topProducts.length > 0 && (
                  <>
                    <p className="tooltip-shell-line" style={{ marginTop: 10, fontWeight: 600, color: "#64748b" }}>
                      상위 품목:
                    </p>
                    <ul className="tooltip-shell-list">
                      {tooltip.topProducts.map((p) => (
                        <li key={p}>• {p}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="tooltip-shell-hint">클릭 → 상세페이지</p>
              </>
            ) : (
              <p className="tooltip-shell-sub" style={{ margin: 0, color: "#94a3b8" }}>
                상세 데이터 제한
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
