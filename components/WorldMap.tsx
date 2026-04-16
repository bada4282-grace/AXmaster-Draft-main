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

import { getCountryData, getTreemapData, DEFAULT_YEAR, type TradeType, type CountryData } from "@/lib/data";

// 민트-틸 그라데이션 팔레트 (rank 1~30 기준, 5구간)
function getMapColor(rank: number): string {
  if (rank <= 3)  return "#054744"; // 1~3위   — 딥 다크 틸
  if (rank <= 9)  return "#1A9088"; // 4~9위   — 다크 틸
  if (rank <= 15) return "#50B8AD"; // 10~15위 — 미디엄 틸
  if (rank <= 21) return "#6DCAB9"; // 16~21위 — 라이트 틸
  if (rank <= 30) return "#A8E0D4"; // 22~30위 — 연한 민트 틸
  return "#DCF3EF";                 // 30위 밖 — 유지
}

// 필터 모드 전용 색상 — #DCF3EF 와 대비가 확보되도록 강화
function getFilterColor(rank: number): string {
  if (rank <= 3)  return "#054744";
  if (rank <= 9)  return "#1A9088";
  if (rank <= 15) return "#50B8AD";
  if (rank <= 21) return "#6DCAB9";
  if (rank <= 30) return "#6DC4B5"; // #A8E0D4 → 더 진하게
  return "#DCF3EF";
}
import { getMonthlyCountryMapData, queryTrade, type MonthlyCountryMapItem } from "@/lib/supabase";

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
};

// 한국어 국가명 → ISO alpha-2 (Supabase monthly 데이터의 ctr_name 매핑용)
// 다양한 표기 변형 포함
const KO_NAME_TO_ISO: Record<string, string> = {
  "중국": "CN", "미국": "US", "베트남": "VN", "일본": "JP", "홍콩": "HK",
  "대만": "TW", "싱가포르": "SG", "인도": "IN", "호주": "AU", "멕시코": "MX",
  "독일": "DE", "말레이시아": "MY", "인도네시아": "ID", "폴란드": "PL", "필리핀": "PH",
  "튀르키예": "TR", "터키": "TR",
  "캐나다": "CA", "태국": "TH", "네덜란드": "NL", "헝가리": "HU",
  "사우디아라비아": "SA", "사우디": "SA",
  "영국": "GB",
  "이탈리아": "IT", "프랑스": "FR", "스페인": "ES", "브라질": "BR",
  "러시아": "RU", "러시아연방": "RU",
  "아랍에미리트": "AE", "UAE": "AE", "아랍 에미리트": "AE",
  "이스라엘": "IL", "벨기에": "BE",
  "스위스": "CH", "스웨덴": "SE", "오스트리아": "AT", "덴마크": "DK",
  "노르웨이": "NO", "핀란드": "FI", "체코": "CZ", "루마니아": "RO",
  "남아프리카공화국": "ZA", "남아프리카": "ZA", "남아공": "ZA",
  "아르헨티나": "AR", "칠레": "CL", "콜롬비아": "CO",
  "파키스탄": "PK", "방글라데시": "BD",
  "이집트": "EG", "나이지리아": "NG",
  "카자흐스탄": "KZ", "우즈베키스탄": "UZ",
  // 추가 국가 (Supabase CTR_NAME 기준)
  "이란": "IR", "이라크": "IQ", "쿠웨이트": "KW", "카타르": "QA", "오만": "OM",
  "요르단": "JO", "바레인": "BH", "레바논": "LB",
  "캄보디아": "KH", "미얀마": "MM", "라오스": "LA", "스리랑카": "LK", "네팔": "NP",
  "뉴질랜드": "NZ",
  "페루": "PE", "에콰도르": "EC", "우루과이": "UY",
  "우크라이나": "UA", "포르투갈": "PT", "그리스": "GR", "불가리아": "BG",
  "크로아티아": "HR", "슬로바키아": "SK", "슬로베니아": "SI",
  "리투아니아": "LT", "라트비아": "LV", "에스토니아": "EE",
  "세르비아": "RS", "아제르바이잔": "AZ",
  "케냐": "KE", "가나": "GH", "탄자니아": "TZ", "에티오피아": "ET",
  "모로코": "MA", "튀니지": "TN", "알제리": "DZ",
};

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
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#F2FBFF" } }],
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
// 품목별 국가 순위 캐시
const _productRankCache = new Map<string, MonthlyCountryMapItem[]>();

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
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function WorldMap({
  year = DEFAULT_YEAR,
  month = "",
  tradeType = "수출",
}: WorldMapProps) {
  const router    = useRouter();
  const mapRef        = useRef<MapRef>(null);
  const hoverIdRef    = useRef<number | null>(null);
  const markerHoverRef = useRef(false);

  // FilterBar에서 선택한 품목을 URL에서 읽어 지도 필터로 적용
  const selectedProduct = useSearchParams().get("product") ?? "";

  const countryData = getCountryData(year, tradeType);

  // ─ 품목별 국가 순위 (Supabase 실시간 조회) ─
  const [productCountryRanks, setProductCountryRanks] = useState<MonthlyCountryMapItem[] | null>(null);

  useEffect(() => {
    if (!selectedProduct) { setProductCountryRanks(null); return; }

    const cacheKey = `${year}-${month}-${selectedProduct}-${tradeType}`;
    if (_productRankCache.has(cacheKey)) {
      setProductCountryRanks(_productRankCache.get(cacheKey)!);
      return;
    }

    let mounted = true;
    const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
    const monthsToFetch = month
      ? [`${year}${month}`]
      : MONTHS.map((m) => `${year}${m}`);

    const totals = new Map<string, number>();
    let _amtCol: string | null = null;

    // 금액 컬럼 다단계 탐지 (컬럼명이 DB마다 다를 수 있음)
    const detectAmtCol = (row: any): string | null => {
      const keys = Object.keys(row);
      const isExport = tradeType !== "수입";
      // 1순위: 모드 접두사 + amt/amnt/amount/hamnt 패턴
      const modeRe = isExport ? /exp/i : /imp/i;
      for (const re of [/amt$/i, /amnt$/i, /amount$/i, /hamnt$/i, /amt/i, /amnt/i]) {
        const col = keys.find((k) => modeRe.test(k) && re.test(k));
        if (col) return col;
      }
      // 2순위: amt/amnt/amount 패턴 (모드 무관)
      for (const re of [/amt/i, /amnt/i, /amount/i, /금액/i]) {
        const col = keys.find((k) => re.test(k) && typeof row[k] === "number" && row[k] > 0);
        if (col) return col;
      }
      // 3순위: 큰 숫자 컬럼 (무역금액은 수만 이상, MTI 코드나 ID는 작음)
      const bigCols = keys
        .filter((k) => typeof row[k] === "number" && row[k] > 10000 && !/id$|^id|_cd$|_code$/i.test(k))
        .sort((a, b) => Number(row[b]) - Number(row[a]));
      return bigCols[0] ?? null;
    };

    Promise.allSettled(
      monthsToFetch.map(async (yymm) => {
        const rows = await queryTrade({ mtiName: selectedProduct, yymm });
        if (!rows?.length) return;
        if (!_amtCol) _amtCol = detectAmtCol(rows[0] as any);
        if (!_amtCol) return;
        const col = _amtCol;
        rows.forEach((row: any) => {
          const ctr = (row["CTR_NAME"] ?? row["ctr_name"] ?? "").trim();
          const amt = Number(row[col] ?? 0);
          if (ctr && amt > 0) totals.set(ctr, (totals.get(ctr) ?? 0) + amt);
        });
      })
    ).then(() => {
      if (!mounted) return;
      const sorted: MonthlyCountryMapItem[] = Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([ctr_name, total_amt], i) => ({ ctr_name, total_amt, rank: i + 1 }));
      const result = sorted.length > 0 ? sorted : null;
      if (result) _productRankCache.set(cacheKey, result);
      setProductCountryRanks(result);
    });

    return () => { mounted = false; };
  }, [selectedProduct, year, month, tradeType]);

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
    getMonthlyCountryMapData(year, month, tradeType)
      .then((rows) => { if (mounted) setMonthlyRanks(rows); })
      .catch(() => { if (mounted) setMonthlyRanks(null); });
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

  // 품목 국가 ISO 맵 (product rank → ISO alpha-2)
  // 동적 데이터 없으면 정적 topCountries + topProducts 역색인 fallback
  const productByIso = useMemo((): Map<string, number> | null => {
    if (!selectedProduct) return null;
    if (productCountryRanks?.length) {
      const m = new Map<string, number>();
      productCountryRanks.forEach((row) => {
        const iso = KO_NAME_TO_ISO[row.ctr_name];
        if (iso) m.set(iso, row.rank);
      });
      if (m.size > 0) return m;
    }
    // Fallback: topCountries(상품 정적) + topProducts 역색인(국가 정적)
    const productIsoSet = new Set<string>();

    const found = getTreemapData(year, tradeType).find((p) => p.name === selectedProduct);
    found?.topCountries?.forEach((name) => {
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
    found?.topCountries?.forEach((name, i) => {
      const iso = KO_NAME_TO_ISO[name];
      if (iso && !m.has(iso)) m.set(iso, i + 1);
    });
    return m.size > 0 ? m : null;
  }, [selectedProduct, productCountryRanks, year, tradeType, activeCountryData]);

  const top5Countries = useMemo(
    () => activeCountryData.filter((c) => c.rank <= 5).sort((a, b) => a.rank - b.rank),
    [activeCountryData]
  );

  // ─ GeoJSON 기본 데이터 로드 ─
  const [baseGeoJSON, setBaseGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => { loadBaseGeoJSON().then(setBaseGeoJSON); }, []);

  // ─ 순위 구간 필터 ─
  const [filterTier, setFilterTier] = useState<string>("all");

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
              ? (filterTier === "all" ? getMapColor(effectiveRank) : getFilterColor(effectiveRank))
              : "#DCF3EF",
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
    if (map && hoverIdRef.current !== null) {
      map.setFeatureState({ source: "countries", id: hoverIdRef.current }, { hover: false });
      hoverIdRef.current = null;
    }
    // 마커 위에 호버 중이면 툴팁 유지
    if (!markerHoverRef.current) setTooltip(null);
  }, []);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const features = (e as any).features as any[] | undefined;
    if (!features || features.length === 0) {
      clearHover();
      return;
    }

    const f  = features[0];
    const id = f.id as number | undefined;

    // 이전 hover 해제
    if (hoverIdRef.current !== null && hoverIdRef.current !== id) {
      map.setFeatureState({ source: "countries", id: hoverIdRef.current }, { hover: false });
    }
    if (id !== undefined) {
      map.setFeatureState({ source: "countries", id }, { hover: true });
      hoverIdRef.current = id;
    }

    const p           = f.properties ?? {};
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
  }, [clearHover]);

  const onMouseLeave = useCallback(() => clearHover(), [clearHover]);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const features = (e as any).features as any[] | undefined;
    if (!features || features.length === 0) return;
    const p = features[0].properties ?? {};
    if (p.is_top30 && p.country_name) {
      const mode = tradeType === "수입" ? "import" : "export";
      router.push(`/country/${encodeURIComponent(p.country_name as string)}?mode=${mode}`);
    }
  }, [router, tradeType]);

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
      <div className="relative flex-1 bg-[#F2FBFF]">
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
          cursor={tooltip?.isTop30 ? "pointer" : "grab"}
        >
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
                    router.push(`/country/${encodeURIComponent(country.name)}?mode=${mode}`);
                  }}
                >
                  {country.name}
                </span>
              </Marker>
            );
          })}
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
            {[
              { color: "#DCF3EF" },
              { color: "#A8E0D4" },
              { color: "#6DCAB9" },
              { color: "#50B8AD" },
              { color: "#1A9088" },
              { color: "#054744" },
            ].map(({ color }) => (
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

      {/* 툴팁 */}
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="tooltip-shell tooltip-shell--fixed"
            style={{
              left:      tooltip.x,
              top:       tooltip.y,
              transform: "translate(-50%, calc(-100% - 12px))",
            }}
          >
            <p className="tooltip-shell-title">{tooltip.country}</p>
            {tooltip.isTop30 ? (
              <>
                <p className="tooltip-shell-line">
                  {tradeType === "수입" ? "수입" : "수출"} 순위:{" "}
                  <strong>{tooltip.rank}위</strong>
                </p>
                <p className="tooltip-shell-line">
                  {tradeType === "수입" ? "수입액" : "수출액"}:{" "}
                  <strong>${tooltip.exportVal}억</strong>
                </p>
                <p
                  className="tooltip-shell-line"
                  style={{ marginTop: 10, fontWeight: 600, color: "#64748b" }}
                >
                  상위 품목:
                </p>
                <ul className="tooltip-shell-list">
                  {tooltip.topProducts?.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
                <p className="tooltip-shell-hint">클릭 → 상세페이지</p>
              </>
            ) : (
              <p
                className="tooltip-shell-sub"
                style={{ margin: 0, color: "#94a3b8" }}
              >
                상세 데이터 제한
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}