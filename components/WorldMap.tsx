"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import "maplibre-gl/dist/maplibre-gl.css";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMap, { Source, Layer, Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { feature as topoFeature } from "topojson-client";

import { DEFAULT_YEAR, type TradeType, type CountryData } from "@/lib/data";
import { KO_NAME_TO_ISO } from "@/lib/countryIso";
import {
  getCountryRankingAsync,
  getCountryTreemapDataAsync,
  getTreemapDataAsync,
  type CountryRanking,
} from "@/lib/dataSupabase";
import { useOngoingYearInfo } from "@/lib/useIncompleteMonthRange";
import type { ProductNode } from "@/lib/data";

// 수출: 블루 그라데이션 / 수입: 코럴 그라데이션
function getMapColor(rank: number, mode: "수출" | "수입" = "수출"): string {
  if (mode === "수입") {
    if (rank <= 3)  return "#B02020"; // 딥 로즈
    if (rank <= 9)  return "#D04545"; // 코럴 레드
    if (rank <= 15) return "#E07060"; // 소프트 코럴
    if (rank <= 21) return "#ECA090"; // 피치
    if (rank <= 30) return "#F4C8BC"; // 라이트 피치
    return "#FAE8E4";               // 30위 밖
  }
  // 수출 — 블루
  if (rank <= 3)  return "#002B5C"; // 딥 네이비
  if (rank <= 9)  return "#0A3D6B"; // 다크 블루
  if (rank <= 15) return "#1A6FA0"; // 블루
  if (rank <= 21) return "#6A9EC0"; // 소프트 블루
  if (rank <= 30) return "#B0D0E8"; // 라이트 블루
  return "#DCE8F0";                 // 30위 밖
}

function getFilterColor(rank: number, mode: "수출" | "수입" = "수출"): string {
  return getMapColor(rank, mode);
}
import { getMonthlyCountryMapData, type MonthlyCountryMapItem } from "@/lib/supabase";

// ─── 상수 ────────────────────────────────────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ISO 숫자코드 → alpha-2 매핑
const ISO_NUM_TO_ALPHA2: Record<string, string> = {
  "156": "CN", "840": "US", "704": "VN", "392": "JP", "344": "HK",
  "158": "TW", "702": "SG", "356": "IN", "036": "AU", "484": "MX",
  "276": "DE", "458": "MY", "360": "ID", "616": "PL", "608": "PH",
  "792": "TR", "124": "CA", "764": "TH", "528": "NL", "348": "HU",
  "682": "SA", "826": "GB", "380": "IT", "250": "FR", "724": "ES",
  "076": "BR", "643": "RU", "784": "AE", "376": "IL", "056": "BE",
  "756": "CH", "752": "SE", "040": "AT", "208": "DK", "578": "NO",
  "246": "FI", "203": "CZ", "642": "RO", "710": "ZA", "032": "AR",
  "152": "CL", "170": "CO", "586": "PK", "050": "BD", "818": "EG",
  "566": "NG", "398": "KZ", "860": "UZ",
  // 추가 국가 ISO 숫자 코드
  "364": "IR", "368": "IQ", "414": "KW", "634": "QA", "512": "OM",
  "400": "JO", "048": "BH", "422": "LB",
  "116": "KH", "104": "MM", "418": "LA", "144": "LK", "524": "NP",
  "554": "NZ",
  "604": "PE", "218": "EC", "858": "UY",
  "804": "UA", "620": "PT", "300": "GR", "100": "BG",
  "191": "HR", "703": "SK", "705": "SI",
  "440": "LT", "428": "LV", "233": "EE",
  "688": "RS", "031": "AZ",
  "404": "KE", "288": "GH", "834": "TZ", "231": "ET",
  "504": "MA", "788": "TN", "012": "DZ",
  // 아프리카
  "024": "AO", "072": "BW", "108": "BI", "120": "CM", "140": "CF",
  "148": "TD", "174": "KM", "178": "CG", "180": "CD", "262": "DJ",
  "226": "GQ", "232": "ER", "266": "GA", "270": "GM", "324": "GN",
  "384": "CI", "426": "LS", "430": "LR", "434": "LY", "450": "MG",
  "454": "MW", "466": "ML", "478": "MR", "508": "MZ", "516": "NA",
  "562": "NE", "646": "RW", "686": "SN", "694": "SL", "706": "SO",
  "716": "ZW", "728": "SS", "736": "SD", "748": "SZ", "768": "TG",
  "800": "UG", "894": "ZM",
  // 유럽
  "008": "AL", "070": "BA", "112": "BY", "196": "CY", "352": "IS",
  "372": "IE", "438": "LI", "442": "LU", "470": "MT", "498": "MD",
  "499": "ME", "807": "MK",
  // 아시아
  "004": "AF", "064": "BT", "096": "BN", "268": "GE",
  "496": "MN", "408": "KP", "410": "KR", "417": "KG", "762": "TJ",
  "795": "TM", "760": "SY", "887": "YE",
  // 아메리카
  "068": "BO", "188": "CR", "192": "CU", "214": "DO", "222": "SV",
  "320": "GT", "328": "GY", "332": "HT", "340": "HN", "388": "JM",
  "558": "NI", "591": "PA", "600": "PY", "740": "SR", "780": "TT",
  "862": "VE",
  // 오세아니아
  "090": "SB", "242": "FJ", "540": "NC", "548": "VU", "598": "PG",
  // GeoJSON 110m 누락분
  "051": "AM", "044": "BS", "084": "BZ", "204": "BJ", "626": "TL",
  "630": "PR", "854": "BF",
};

// KO_NAME_TO_ISO는 lib/countryIso.ts로 이동 (WorldMap과 국가 상세 페이지가 공유)

// TOP5 레이블 위치 (지리적 중심 좌표)
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "CN": [104,   35  ], "US": [-98,   39  ], "VN": [108,   16  ],
  "JP": [136,   36  ], "HK": [113,   23.5], "AU": [133,  -27  ],
  "IN": [78,    22  ], "SG": [103.8,  1.4], "TW": [122,   22  ],
  "DE": [10,    51  ], "MX": [-102,  23  ], "MY": [109,    4  ],
  "PH": [122,   12  ], "GB": [-2,    54  ], "NL": [5.3,  52.3 ],
  "TH": [101,   15  ], "PL": [20,    52  ], "ID": [117,   -2  ],
  "CA": [-96,   60  ], "SA": [45,    24  ], "TR": [35,    39  ],
  "IT": [12,    42  ], "FR": [2.5,   46  ], "ES": [-4,    40  ],
  "BR": [-52,  -10  ],
};

// MapLibre 최소 스타일 (배경색만 — 타일 서버 필요 없음)
const MAP_STYLE: any = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#FFFFFF" } }],
};

// ─── GeoJSON 로드 (topojson → GeoJSON 변환, 모듈 캐싱) ───────────────────────
// ─── Antimeridian artifact 방지 ────────────────────────────────────────────
// 문제: 독립 정규화는 인접 정점 간 점프(179° → -179°)를 남겨둠
//       → MapLibre가 최단 2° 경로 대신 358° 경로로 선을 그어 가로선 생성
// 해결: 연속 와인딩(continuous winding) — 이전 정점과의 차이가 항상 ±180° 이내가
//       되도록 경도를 누적 조정. 그 후 [-180, 180] 밖으로 나간 값은 클램프.
function normLng(lng: number): number {
  let v = lng % 360;
  if (v > 180)  v -= 360;
  if (v < -180) v += 360;
  return v;
}
function normalizeRing(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const out: number[][] = [[normLng(ring[0][0]), ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    const prev = out[out.length - 1][0];
    let lng = normLng(ring[i][0]);
    // 이전 정점과의 차이를 항상 ±180° 이내로 유지
    if (lng - prev > 180)  lng -= 360;
    if (lng - prev < -180) lng += 360;
    out.push([lng, ring[i][1]]);
  }
  // 연속화 후 범위를 벗어난 값은 클램프 (폴리곤 분할 없이 artifact 제거)
  return out.map(([lng, lat]) => [Math.max(-180, Math.min(180, lng)), lat]);
}
function normalizeGeometry(geom: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geom.type === "Polygon") {
    return { ...geom, coordinates: geom.coordinates.map(normalizeRing) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      ...geom,
      coordinates: geom.coordinates.map((poly) => poly.map(normalizeRing)),
    };
  }
  return geom;
}

let _geoCache: GeoJSON.FeatureCollection | null = null;

async function loadBaseGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  if (_geoCache) return _geoCache;
  const res  = await fetch(GEO_URL);
  const topo = await res.json() as any;
  const raw  = topoFeature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
  // 경도 정규화 → antimeridian artifact 방지
  _geoCache = {
    ...raw,
    features: raw.features.map((f) => ({
      ...f,
      geometry: normalizeGeometry(f.geometry as GeoJSON.Geometry),
    })),
  };
  return _geoCache;
}

// 한국어 국가명 헬퍼
const _DisplayNames: any = typeof Intl !== "undefined" ? (Intl as any).DisplayNames : null;
const _koNames = _DisplayNames ? new _DisplayNames(["ko"], { type: "region" }) : null;
function getKoreanName(alpha2?: string, fallback?: string): string {
  if (alpha2 && _koNames) {
    try {
      const ko = _koNames.of(alpha2) as string | undefined;
      if (ko && ko !== alpha2) return ko;
    } catch { /* invalid code */ }
  }
  return fallback ?? "";
}

// ─── Point-in-polygon (ray casting) ─────────────────────────────────────────
// 낮은 줌에서 queryRenderedFeatures의 simplified geometry 오차를 보정하기 위해
// 원본 GeoJSON 좌표 기반으로 정확한 국가를 판별
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geom: GeoJSON.Geometry): boolean {
  if (geom.type === "Polygon") {
    return pointInRing(lng, lat, geom.coordinates[0]);
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly) => pointInRing(lng, lat, poly[0]));
  }
  return false;
}

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface Tooltip {
  x: number; y: number;
  country: string;
  rank?: number;
  exportVal?: string;
  topProducts?: string[];
  isTop30: boolean;
}

interface WorldMapProps {
  year?: string;
  month?: string;
  tradeType?: TradeType;
  onLoadingChange?: (loading: boolean) => void;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function WorldMap({
  year = DEFAULT_YEAR,
  month = "",
  tradeType = "수출",
  onLoadingChange,
}: WorldMapProps) {
  const router    = useRouter();
  const mapRef        = useRef<MapRef>(null);
  const hoverIdRef    = useRef<number | null>(null);
  const markerHoverRef = useRef(false);

  // FilterBar에서 선택한 품목을 URL에서 읽어 지도 필터로 적용
  const selectedProduct = useSearchParams().get("product") ?? "";

  // ─ 진행 중 연도 정보 (부분 데이터 배지 + 툴팁 "ⓘ 누적" 라벨) ─
  const ongoingInfo = useOngoingYearInfo();

  // ─ Raw rankings (현재 + 전년) — 비중·순위·전년 대비 계산용 ─
  const [rawRankings, setRawRankings] = useState<CountryRanking[]>([]);
  const [prevRawRankings, setPrevRawRankings] = useState<CountryRanking[]>([]);
  useEffect(() => {
    let cancelled = false;
    const prevYearStr = String(parseInt(year, 10) - 1);
    Promise.all([
      getCountryRankingAsync(year, tradeType),
      getCountryRankingAsync(prevYearStr, tradeType),
    ]).then(([curr, prev]) => {
      if (cancelled) return;
      setRawRankings(curr);
      setPrevRawRankings(prev);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [year, tradeType]);

  // ─ 국가별 1위 품목 on-demand 캐시 ─
  // 호버 시점에 fetch, 5분 TTL은 getCountryTreemapDataAsync 내부에 이미 있음
  const [topProductMap, setTopProductMap] = useState<Map<string, { name: string; value: number } | null>>(new Map());
  const fetchingTopProductRef = useRef<Set<string>>(new Set());
  const topProductKey = useCallback(
    (country: string) => `${country}|${year}|${tradeType}`,
    [year, tradeType],
  );
  const ensureTopProduct = useCallback((country: string) => {
    const key = topProductKey(country);
    if (topProductMap.has(key) || fetchingTopProductRef.current.has(key)) return;
    fetchingTopProductRef.current.add(key);
    getCountryTreemapDataAsync(year, country, tradeType)
      .then((items) => {
        const sorted = [...items].sort((a, b) => b.value - a.value);
        const top = sorted[0];
        setTopProductMap((prev) => {
          const next = new Map(prev);
          next.set(key, top ? { name: top.name, value: top.value } : null);
          return next;
        });
      })
      .catch(() => {})
      .finally(() => { fetchingTopProductRef.current.delete(key); });
  }, [topProductMap, topProductKey, year, tradeType]);

  // ─ 국가 데이터 (Supabase에서 비동기 로드) ─
  const [countryData, setCountryData] = useState<CountryData[]>([]);
  useEffect(() => {
    let cancelled = false;
    getCountryRankingAsync(year, tradeType).then(ranks => {
      if (cancelled) return;
      const fmt1 = (v: number) => (Math.round(v / 1e8 * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      setCountryData(ranks.map(r => ({
        iso: KO_NAME_TO_ISO[r.country] ?? "??",
        name: r.country,
        nameEn: r.country,
        rank: tradeType === "수입" ? r.rank_imp : r.rank_exp,
        export: fmt1(tradeType === "수입" ? r.imp_amt : r.exp_amt),
        import: fmt1(r.imp_amt),
        region: "",
        topProducts: [],
        topImportProducts: [],
        share: tradeType === "수입" ? r.share_imp : r.share_exp,
      })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [year, tradeType]);

  // ─ 품목별 국가 순위 (Supabase에서 비동기 로드) ─
  const [productTopIso, setProductTopIso] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!selectedProduct) { setProductTopIso(null); return; }
    let cancelled = false;
    getTreemapDataAsync(year, tradeType).then(treemap => {
      if (cancelled) return;
      const product = treemap.find(p => p.name === selectedProduct);
      if (!product?.topCountries?.length) { setProductTopIso(null); return; }
      const isoSet = new Set<string>();
      product.topCountries.forEach(name => {
        const iso = KO_NAME_TO_ISO[name];
        if (iso) isoSet.add(iso);
      });
      setProductTopIso(isoSet.size > 0 ? isoSet : null);
    }).catch(() => setProductTopIso(null));
    return () => { cancelled = true; };
  }, [selectedProduct, year, tradeType]);

  // ─ Pretendard 폰트 로드 ─
  useEffect(() => {
    const id = "pretendard-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css";
    document.head.appendChild(link);
  }, []);

  // ─ 월별 Supabase 데이터 ─
  const [monthlyRanks, setMonthlyRanks] = useState<MonthlyCountryMapItem[] | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!month) { return () => { mounted = false; }; }
    onLoadingChange?.(true);
    getMonthlyCountryMapData(year, month, tradeType)
      .then((rows) => { if (mounted) setMonthlyRanks(rows); })
      .catch(() => { if (mounted) setMonthlyRanks(null); })
      .finally(() => { if (mounted) onLoadingChange?.(false); });
    return () => { mounted = false; };
  }, [year, month, tradeType]);

  // ─ 연간 집계: 정적 데이터 사용 (Supabase 호출 불필요) ─

  const activeCountryData = useMemo((): CountryData[] => {
    // 월 미선택(연간) 시 정적 데이터를 그대로 사용 — Supabase 호출 없음
    if (!month) return countryData;
    const effectiveRanks = monthlyRanks;
    if (!effectiveRanks) return countryData;

    const rankByName = new Map<string, MonthlyCountryMapItem>();
    effectiveRanks.forEach((row) => rankByName.set(row.ctr_name, row));

    // 1. static 국가 rank 업데이트
    const staticIsoSet = new Set(countryData.map((c) => c.iso));
    const updated = countryData.map((country) => {
      const monthly = rankByName.get(country.name) ?? rankByName.get(country.nameEn);
      if (!monthly) return { ...country, rank: 999, export: "0" };
      return { ...country, rank: monthly.rank, export: (monthly.total_amt / 1e8).toFixed(1) };
    });

    // 2. static에 없는 Supabase 국가 추가 (rank 1~30)
    const extras: CountryData[] = [];
    effectiveRanks.forEach((row) => {
      if (row.rank > 30) return;
      const iso = KO_NAME_TO_ISO[row.ctr_name];
      if (!iso || staticIsoSet.has(iso)) return;
      extras.push({
        iso,
        name: row.ctr_name,
        nameEn: "",
        rank: row.rank,
        export: (row.total_amt / 1e8).toFixed(1),
        import: "0",
        region: "",
        topProducts: [],
        topImportProducts: [],
        share: 0,
      });
    });

    return [...updated, ...extras];
  }, [countryData, month, monthlyRanks]);

  // 품목 국가 ISO 맵 (Supabase treemap + activeCountryData 역색인)
  const [treemapCache, setTreemapCache] = useState<ProductNode[]>([]);
  useEffect(() => {
    let cancelled = false;
    getTreemapDataAsync(year, tradeType).then(data => {
      if (!cancelled) setTreemapCache(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [year, tradeType]);

  const productByIso = useMemo((): Map<string, number> | null => {
    if (!selectedProduct) return null;
    const productIsoSet = new Set<string>();

    const found = treemapCache.find((p: ProductNode) => p.name === selectedProduct);
    found?.topCountries?.forEach((name: string) => {
      const iso = KO_NAME_TO_ISO[name];
      if (iso) productIsoSet.add(iso);
    });

    activeCountryData.forEach((c) => {
      if (c.iso && (c.topProducts ?? []).includes(selectedProduct)) {
        productIsoSet.add(c.iso);
      }
    });

    if (productIsoSet.size === 0) return null;

    const m = new Map<string, number>();
    activeCountryData.forEach((c) => { if (productIsoSet.has(c.iso)) m.set(c.iso, c.rank); });
    found?.topCountries?.forEach((name: string, i: number) => {
      const iso = KO_NAME_TO_ISO[name];
      if (iso && !m.has(iso)) m.set(iso, i + 1);
    });
    return m.size > 0 ? m : null;
  }, [selectedProduct, treemapCache, activeCountryData]);

  const top5Countries = useMemo(
    () => activeCountryData.filter((c) => c.rank <= 5).sort((a, b) => a.rank - b.rank),
    [activeCountryData]
  );

  // ─ GeoJSON 기본 데이터 로드 ─
  const [baseGeoJSON, setBaseGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => { loadBaseGeoJSON().then(setBaseGeoJSON); }, []);

  // ─ 순위 구간 필터 ─
  const [filterTier, setFilterTier] = useState<string>("all");
  const [zoomPct, setZoomPct] = useState(100);
  const BASE_ZOOM = 1.0;

  // ─ choropleth 색상 주입 ─
  const coloredGeoJSON = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!baseGeoJSON) return null;

    // 월별/연간 Supabase rank를 ISO alpha-2 기준으로 직접 맵핑
    // (static 20개국 리스트에 없는 22~30위 국가도 커버)
    const monthlyByIso = new Map<string, MonthlyCountryMapItem>();
    if (month && monthlyRanks) {
      monthlyRanks.forEach((row) => {
        const iso = KO_NAME_TO_ISO[row.ctr_name];
        if (iso) monthlyByIso.set(iso, row);
      });
    }

    return {
      type: "FeatureCollection",
      features: baseGeoJSON.features.map((f) => {
        const isoNum = String(f.id ?? "").padStart(3, "0");
        const alpha2 = ISO_NUM_TO_ALPHA2[isoNum] ?? "";

        // 1순위: activeCountryData (static + 월별 업데이트)
        const cData = alpha2 ? activeCountryData.find((d) => d.iso === alpha2) : undefined;
        // 2순위: Supabase 직접 lookup (22~30위 국가가 static에 없을 때 fallback)
        const mRow  = alpha2 ? monthlyByIso.get(alpha2) : undefined;

        const rank      = cData ? cData.rank : (mRow ? mRow.rank : 999);
        const exportVal = cData ? cData.export : (mRow ? (mRow.total_amt / 1e8).toFixed(1) : "0");
        const isTop30   = rank <= 30;
        const countryName = cData?.name || getKoreanName(alpha2 || undefined);

        // 품목 필터: 선택 시 품목별 실시간 순위 사용, 미선택 시 전체 순위
        const productRank = productByIso && alpha2 ? (productByIso.get(alpha2) ?? 999) : null;
        const effectiveRank = productRank !== null ? productRank : rank;
        const isColored = productByIso
          ? (!!alpha2 && productByIso.has(alpha2))
          : (rank <= 30);

        const inTier =
          filterTier === "all"   ? true :
          filterTier === "1-3"   ? effectiveRank >= 1  && effectiveRank <= 3  :
          filterTier === "4-9"   ? effectiveRank >= 4  && effectiveRank <= 9  :
          filterTier === "10-15" ? effectiveRank >= 10 && effectiveRank <= 15 :
          filterTier === "16-21" ? effectiveRank >= 16 && effectiveRank <= 21 :
          filterTier === "22-30" ? effectiveRank >= 22 && effectiveRank <= 30 : false;

        return {
          ...f,
          id: typeof f.id === "number" ? f.id : Number(isoNum) || 0,
          properties: {
            alpha2,
            fill_color:   (isColored && inTier)
              ? (filterTier === "all" ? getMapColor(effectiveRank, tradeType) : getFilterColor(effectiveRank, tradeType))
              : (tradeType === "수입" ? "#FAE8E4" : "#DCE8F0"),
            rank:         effectiveRank,
            is_top30:     (effectiveRank <= 30) ? 1 : 0,
            country_name: countryName,
            export_val:   exportVal,
            top_products: (cData?.topProducts ?? []).join("||"),
          },
        };
      }),
    };
  }, [baseGeoJSON, activeCountryData, filterTier, month, monthlyRanks, productTopIso]);

  // ─ 툴팁 ─
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const clearHover = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && hoverIdRef.current !== null && map.getSource("countries")) {
      map.setFeatureState({ source: "countries", id: hoverIdRef.current }, { hover: false });
      hoverIdRef.current = null;
    }
    setTooltip(null);
  }, []);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (markerHoverRef.current) return;
    const map = mapRef.current?.getMap();
    if (!map || !map.getLayer("countries-fill")) return;

    const features = map.queryRenderedFeatures(e.point, { layers: ["countries-fill"] });
    if (!features || features.length === 0) {
      clearHover();
      return;
    }

    // 커서의 실제 경위도를 [-180, 180] 범위로 정규화
    let lng = e.lngLat.lng % 360;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    const lat = e.lngLat.lat;

    // point-in-polygon으로 정확한 국가 판별 (낮은 줌에서 simplified geometry 오차 보정)
    let p: Record<string, any> = features[0].properties ?? {};
    let id: number | undefined = features[0].id as number | undefined;

    if (coloredGeoJSON) {
      const candidateAlphas = new Set(
        features.map((feat) => feat.properties?.alpha2 as string).filter(Boolean)
      );
      // 1차: queryRenderedFeatures 후보 중 실제 포인트를 포함하는 피처
      let matched = coloredGeoJSON.features.find(
        (feat) => candidateAlphas.has(feat.properties?.alpha2) && pointInGeometry(lng, lat, feat.geometry)
      );
      // 2차: 후보에 없으면 전체 GeoJSON에서 검색
      if (!matched) {
        matched = coloredGeoJSON.features.find((feat) => pointInGeometry(lng, lat, feat.geometry));
      }
      if (matched) {
        p = matched.properties ?? p;
        id = typeof matched.id === "number" ? matched.id : id;
      }
    }

    // 이전 hover 해제
    if (hoverIdRef.current !== null && hoverIdRef.current !== id) {
      map.setFeatureState({ source: "countries", id: hoverIdRef.current }, { hover: false });
    }
    if (id !== undefined) {
      map.setFeatureState({ source: "countries", id }, { hover: true });
      hoverIdRef.current = id;
    }

    const countryName = p.country_name || getKoreanName(p.alpha2 || undefined);
    const oe          = e.originalEvent as MouseEvent;
    setTooltip({
      x: oe.clientX,
      y: oe.clientY,
      country:     countryName,
      rank:        p.rank < 999 ? (p.rank as number) : undefined,
      exportVal:   p.export_val as string,
      topProducts: p.top_products
        ? (p.top_products as string).split("||").filter(Boolean)
        : [],
      isTop30: !!p.is_top30,
    });
    // 수출 데이터 있는 국가면 1위 품목 사전 로드 (캐시됨)
    if (countryName && p.rank !== undefined && Number(p.rank) < 999) {
      ensureTopProduct(countryName);
    }
  }, [clearHover, coloredGeoJSON, ensureTopProduct]);

  const onMouseLeave = useCallback(() => clearHover(), [clearHover]);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    if (markerHoverRef.current) return;
    const map = mapRef.current?.getMap();
    if (!map || !map.getLayer("countries-fill")) return;
    const features = map.queryRenderedFeatures(e.point, { layers: ["countries-fill"] });
    if (!features || features.length === 0) return;

    // point-in-polygon으로 정확한 국가 판별
    let p: Record<string, any> = features[0].properties ?? {};
    if (coloredGeoJSON) {
      let lng = e.lngLat.lng % 360;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      const lat = e.lngLat.lat;
      const candidateAlphas = new Set(
        features.map((feat) => feat.properties?.alpha2 as string).filter(Boolean)
      );
      let matched = coloredGeoJSON.features.find(
        (feat) => candidateAlphas.has(feat.properties?.alpha2) && pointInGeometry(lng, lat, feat.geometry)
      );
      if (!matched) {
        matched = coloredGeoJSON.features.find((feat) => pointInGeometry(lng, lat, feat.geometry));
      }
      if (matched) p = matched.properties ?? p;
    }

    if (p.country_name && p.rank && Number(p.rank) < 999) {
      const mode = tradeType === "수입" ? "import" : "export";
      router.push(`/country/${encodeURIComponent(p.country_name as string)}?mode=${mode}&year=${year}`);
    }
  }, [router, tradeType, coloredGeoJSON]);

  // ─ 로드 후 컨테이너 너비 기반 minZoom 동적 설정 ─
  // MapLibre 타일 기준: zoom z 에서 세계 너비 = 512 * 2^z px
  // "세계 한 바퀴 ≥ 화면 너비" 조건: 2^minZ ≥ containerWidth / 512
  const onMapLoad = useCallback(() => {
    const raw = mapRef.current?.getMap() as any;
    if (!raw) return;
    const containerEl = raw.getContainer() as HTMLElement;
    const { width } = containerEl.getBoundingClientRect();
    if (!width) return;
    // minZoom = 세계 1벌이 화면 너비를 정확히 채우는 줌
    // → 이 이하로 줌아웃 불가 = world copy 동시 노출 방지
    const minZ = Math.log2(width / 512);
    raw.setMinZoom(Math.max(minZ, 0.3));
  }, []);

  // ─ 렌더 ─
  return (
    <div className="flex flex-col w-full h-full" style={{ minHeight: 340 }}>
      {/* 지도 영역 */}
      <div className="relative flex-1 bg-[#FFFFFF]" onMouseLeave={() => { markerHoverRef.current = false; clearHover(); setTooltip(null); }}>
        <ReactMap
          ref={mapRef}
          mapStyle={MAP_STYLE}
          initialViewState={{ longitude: 155, latitude: 20, zoom: 1.0 }}
          renderWorldCopies={true}
          dragRotate={false}
          pitchWithRotate={false}
          style={{ width: "100%", height: "100%" }}
          interactiveLayerIds={coloredGeoJSON ? ["countries-fill"] : []}
          onLoad={onMapLoad}
          onMouseMove={onMouseMove as any}
          onMouseLeave={onMouseLeave}
          onClick={onClick as any}
          cursor={tooltip?.rank ? "pointer" : "grab"}
          onZoom={(e) => {
            const z = e.viewState.zoom;
            setZoomPct(Math.round((Math.pow(2, z) / Math.pow(2, BASE_ZOOM)) * 100));
          }}
        >
          {/* 부분 데이터 배지 — 우상단 (진행 중 연도에만 표시) */}
          {ongoingInfo && ongoingInfo.year === year && (
            <div style={{
              position: "absolute",
              top: 12,
              right: 120,
              zIndex: 10,
              background: "#fff",
              border: "0.5px solid #e5e7eb",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              color: "#64748b",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}>
              ⓘ {year}년 {ongoingInfo.monthRange} 누적
            </div>
          )}

          {/* 순위 구간 필터 — 우상단 */}
          <div style={{
            position:        "absolute",
            top:             12,
            right:           12,
            zIndex:          10,
          }}>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              style={{
                appearance:      "none",
                backgroundColor: "rgba(255,255,255,0.88)",
                backdropFilter:  "blur(6px)",
                border:          "1px solid rgba(255,255,255,0.6)",
                borderRadius:    8,
                padding:         "5px 28px 5px 11px",
                fontSize:        11,
                fontWeight:      600,
                color:           "#1f2937",
                boxShadow:       "0 2px 10px rgba(0,0,0,0.12)",
                cursor:          "pointer",
                outline:         "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat:   "no-repeat",
                backgroundPosition: "right 9px center",
              }}
            >
              <option value="all">전체 보기</option>
              <option value="1-3">1 ~ 3위</option>
              <option value="4-9">4 ~ 9위</option>
              <option value="10-15">10 ~ 15위</option>
              <option value="16-21">16 ~ 21위</option>
              <option value="22-30">22 ~ 30위</option>
            </select>
          </div>

          {coloredGeoJSON && (
            <Source id="countries" type="geojson" data={coloredGeoJSON}>
              {/* fill: choropleth 색상 + hover 시 금색 */}
              <Layer
                id="countries-fill"
                type="fill"
                paint={{
                  "fill-color": [
                    "case",
                    ["boolean", ["feature-state", "hover"], false],
                    "#FFD700",
                    ["get", "fill_color"],
                  ],
                  "fill-opacity": 0.9,
                }}
              />
              {/* 국가 경계선 */}
              <Layer
                id="countries-border"
                type="line"
                paint={{
                  "line-color": "#ffffff",
                  "line-width": 0.5,
                }}
              />
            </Source>
          )}

          {/* TOP5 순위 레이블 — 품목 선택 시 숨김 */}
          {!selectedProduct && top5Countries.map((country) => {
            const coords = COUNTRY_CENTROIDS[country.iso];
            if (!coords) return null;
            return (
              <Marker
                key={country.iso}
                longitude={coords[0]}
                latitude={coords[1]}
                anchor="center"
              >
                <span
                  style={{
                    color:         "white",
                    fontSize:      10,
                    fontWeight:    700,
                    fontFamily:    "'Pretendard', 'Noto Sans KR', sans-serif",
                    textShadow:    "0 0 4px rgba(4,22,30,1), 0 0 4px rgba(4,22,30,1), 0 0 8px rgba(4,22,30,0.8)",
                    pointerEvents: "auto",
                    whiteSpace:    "nowrap",
                    userSelect:    "none",
                    cursor:        "pointer",
                    padding:       "30px 40px",
                    margin:        "-30px -40px",
                    zIndex:        10,
                  }}
                  onMouseEnter={(e) => {
                    markerHoverRef.current = true;
                    const el = e.currentTarget as HTMLElement;
                    const rect = el.getBoundingClientRect();
                    setTooltip({
                      x:           rect.left + rect.width / 2,
                      y:           rect.top,
                      country:     country.name,
                      rank:        country.rank,
                      exportVal:   country.export,
                      topProducts: country.topProducts ?? [],
                      isTop30:     true,
                    });
                  }}
                  onMouseLeave={() => {
                    markerHoverRef.current = false;
                    setTooltip(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const mode = tradeType === "수입" ? "import" : "export";
                    router.push(`/country/${encodeURIComponent(country.name)}?mode=${mode}&year=${year}`);
                  }}
                >
                  {country.name}
                </span>
              </Marker>
            );
          })}
          {/* 배율 컨트롤 — 좌하단 */}
          <div style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(255,255,255,0.88)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.6)",
            borderRadius: 8,
            boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
            padding: "3px 6px",
          }}>
            <button
              onClick={() => { const m = mapRef.current?.getMap(); if (m) m.zoomOut(); }}
              style={{
                border: "none", background: "none", cursor: "pointer",
                fontSize: 14, fontWeight: 700, color: "#4b5563",
                width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >−</button>
            <span style={{
              fontSize: 11, fontWeight: 600, color: "#1f2937",
              minWidth: 40, textAlign: "center", userSelect: "none",
            }}>{zoomPct}%</span>
            <button
              onClick={() => { const m = mapRef.current?.getMap(); if (m) m.zoomIn(); }}
              style={{
                border: "none", background: "none", cursor: "pointer",
                fontSize: 14, fontWeight: 700, color: "#4b5563",
                width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >+</button>
          </div>
        </ReactMap>
      </div>

      {/* 범례 — 지도 아래 흰색 바 */}
      <div style={{
        height: 44,
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 16,
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 600, whiteSpace: "nowrap" }}>
          {tradeType === "수입" ? "수입액" : "수출액"} 순위
        </span>
        <div style={{ flex: 1 }}>
          {/* 구간별 색상 바 */}
          <div style={{ display: "flex", width: "100%", height: 10, borderRadius: 3, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
            {(tradeType === "수입" ? [
              { color: "#FAE8E4" },
              { color: "#F4C8BC" },
              { color: "#ECA090" },
              { color: "#E07060" },
              { color: "#D04545" },
              { color: "#B02020" },
            ] : [
              { color: "#DCE8F0" },
              { color: "#B0D0E8" },
              { color: "#6A9EC0" },
              { color: "#1A6FA0" },
              { color: "#0A3D6B" },
              { color: "#002B5C" },
            ]).map(({ color }) => (
              <div key={color} style={{ flex: 1, backgroundColor: color }} />
            ))}
          </div>
          {/* 눈금 라벨 */}
          <div style={{ display: "flex", marginTop: 3 }}>
            {["30위 밖", "22~30위", "16~21위", "10~15위", "4~9위", "1~3위"].map((label) => (
              <div key={label} style={{ flex: 1, textAlign: "center" }}>
                <span style={{ fontSize: 8, color: "#6b7280" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 툴팁 — 금액 추이·상위 국가 툴팁과 일관된 양식 */}
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          (() => {
            const rank = tooltip.rank;
            const hasData = rank !== undefined && rank > 0;
            // 월별 조회 모드에서는 rawRankings(연간)과 데이터 스페이스가 다르므로
            // 비중·전년 대비는 생략하고 feature가 넣어준 mode-aware 수치만 표시.
            const isMonthly = !!month;
            const curr = !isMonthly && hasData
              ? rawRankings.find((r) => r.country === tooltip.country)
              : null;
            const prev = !isMonthly && hasData
              ? prevRawRankings.find((r) => r.country === tooltip.country)
              : null;
            const isOngoing = !isMonthly && ongoingInfo?.year === year;
            const isImport = tradeType === "수입";
            const tradeLabel = isImport ? "수입" : "수출";
            const fmt1 = (v: number) => {
              const rounded = Math.round(Math.abs(v) * 10) / 10;
              const withComma = rounded.toLocaleString("en-US", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              });
              const sign = v < 0 ? "-" : "";
              return `${sign}$${withComma}억`;
            };
            // 현재 값
            //  · 연간 모드: rawRankings의 정확한 억달러 수치
            //  · 월별 모드: feature의 mode-aware 문자열(formatted) 사용
            const currAmtAnnual = curr ? (isImport ? curr.imp_amt : curr.exp_amt) / 1e8 : 0;
            const currAmtDisplay = isMonthly
              ? (tooltip.exportVal ? `$${tooltip.exportVal}억` : "-")
              : fmt1(currAmtAnnual);
            const prevAmt = prev ? (isImport ? prev.imp_amt : prev.exp_amt) / 1e8 : 0;
            const share = curr ? (isImport ? curr.share_imp : curr.share_exp) : 0;
            const totalCountries = rawRankings.length;
            const topProd = topProductMap.get(topProductKey(tooltip.country)) ?? null;

            // 위치: 커서 오른쪽·아래쪽 12px 오프셋 (화면 경계에서 반전)
            const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
            const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
            const flipX = tooltip.x > vw * 0.8;
            const flipY = tooltip.y > vh * 0.8;
            const translateX = flipX ? "calc(-100% - 12px)" : "12px";
            const translateY = flipY ? "calc(-100% - 12px)" : "12px";

            // 전년 대비 노드 (연간 모드 전용 — 월별은 별도 처리가 필요해 생략)
            let yoyNode: React.ReactNode = null;
            if (isMonthly) {
              yoyNode = null;
            } else if (isOngoing) {
              yoyNode = <span style={{ color: "#999" }}>- 비교 불가</span>;
            } else if (!prev || prevAmt === 0) {
              yoyNode = <span style={{ color: "#999" }}>- 데이터 없음</span>;
            } else {
              const diff = currAmtAnnual - prevAmt;
              const pct = (diff / prevAmt) * 100;
              const up = diff >= 0;
              const noChange = Math.abs(pct) < 0.05;
              const color = noChange ? "#999" : up ? "#E02020" : "#185FA5";
              const arrow = noChange ? "–" : up ? "▲" : "▼";
              const sign = noChange ? "" : up ? "+" : "-";
              yoyNode = (
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", color }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {arrow} {sign}{Math.abs(pct).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 11 }}>
                    ({sign}{fmt1(Math.abs(diff))})
                  </span>
                </span>
              );
            }

            const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 6 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#1f2937" }}>{value}</span>
              </div>
            );
            const Divider = () => <div style={{ height: 0.5, background: "#e5e7eb", marginTop: 8 }} />;

            // 품목명 10자 ellipsis
            const productName = topProd
              ? (topProd.name.length > 10 ? `${topProd.name.slice(0, 10)}…` : topProd.name)
              : null;
            const shareLabel = share < 0.1 && share > 0 ? "<0.1%" : `${share.toFixed(1)}%`;

            return (
              <div
                style={{
                  position: "fixed",
                  left: tooltip.x,
                  top: tooltip.y,
                  transform: `translate(${translateX}, ${translateY})`,
                  background: "#fff",
                  border: "0.5px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "12px 14px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  minWidth: 220,
                  maxWidth: 260,
                  zIndex: 1000,
                  pointerEvents: "none",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1f2937" }}>{tooltip.country}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {year}년{isMonthly ? ` ${parseInt(month, 10)}월` : ""}
                </div>
                {isOngoing && ongoingInfo?.monthRange && (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    ⓘ {year}년 {ongoingInfo.monthRange} 누적
                  </div>
                )}

                {!hasData ? (
                  <>
                    <Divider />
                    <Row label={`${tradeLabel}액`} value={<span style={{ color: "#999" }}>- 데이터 없음</span>} />
                  </>
                ) : (
                  <>
                    <Divider />
                    <Row label={`${tradeLabel}액`} value={currAmtDisplay} />
                    {!isMonthly && <Row label="비중" value={shareLabel} />}
                    <Row label="순위" value={`${rank}위 / ${totalCountries}`} />
                    {!isMonthly && (
                      <>
                        <Divider />
                        <Row label="전년 대비" value={yoyNode} />
                      </>
                    )}
                    {productName && (
                      <>
                        <Divider />
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                          주요 {isImport ? "수입 " : ""}품목
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, fontSize: 12 }}>
                          <span style={{ color: "#1f2937" }}>1위  {productName}</span>
                          <span style={{ color: "#1f2937", fontWeight: 500 }}>{fmt1(topProd!.value)}</span>
                        </div>
                      </>
                    )}
                    {isOngoing && (
                      <>
                        <Divider />
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                          ⓘ 연말 확정 전 부분 데이터
                        </div>
                      </>
                    )}
                    <Divider />
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, textAlign: "right" }}>
                      클릭하여 상세 보기 →
                    </div>
                  </>
                )}
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
}