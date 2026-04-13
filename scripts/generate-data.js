/**
 * 무역통계 CSV → lib/tradeData.generated.ts 변환 스크립트
 * 실행: node scripts/generate-data.js
 */
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'trade_by_country_mti3.csv');
const OUT_PATH = path.join(__dirname, '..', 'lib', 'tradeData.generated.ts');

// ── 국가명 정규화 ─────────────────────────────────────────────────────────
const CTR_NORMALIZE = { '인도(인디아)': '인도' };
function normCtr(name) { return CTR_NORMALIZE[name] || name; }

// ── 표시명 → ISO alpha-2 ──────────────────────────────────────────────────
const CTR_ISO2 = {
  '중국': 'CN', '미국': 'US', '베트남': 'VN', '홍콩': 'HK', '대만': 'TW',
  '일본': 'JP', '인도': 'IN', '싱가포르': 'SG', '호주': 'AU', '멕시코': 'MX',
  '말레이시아': 'MY', '캐나다': 'CA', '필리핀': 'PH', '독일': 'DE', '튀르키예': 'TR',
  '폴란드': 'PL', '인도네시아': 'ID', '태국': 'TH', '네덜란드': 'NL', '영국': 'GB',
  '사우디아라비아': 'SA', '이탈리아': 'IT', '프랑스': 'FR', '스페인': 'ES', '브라질': 'BR',
  '체코': 'CZ', '헝가리': 'HU', '슬로바키아': 'SK', '러시아': 'RU',
};

const ISO2_EN = {
  CN: 'China', US: 'United States', VN: 'Vietnam', HK: 'Hong Kong', TW: 'Taiwan',
  JP: 'Japan', IN: 'India', SG: 'Singapore', AU: 'Australia', MX: 'Mexico',
  MY: 'Malaysia', CA: 'Canada', PH: 'Philippines', DE: 'Germany', TR: 'Turkey',
  PL: 'Poland', ID: 'Indonesia', TH: 'Thailand', NL: 'Netherlands', GB: 'United Kingdom',
  SA: 'Saudi Arabia', IT: 'Italy', FR: 'France', ES: 'Spain', BR: 'Brazil',
  RU: 'Russia', CZ: 'Czech Republic', HU: 'Hungary', SK: 'Slovakia',
};

const ISO2_REGION = {
  CN: '동아시아', HK: '동아시아', TW: '동아시아', JP: '동아시아',
  VN: '동남아시아', SG: '동남아시아', MY: '동남아시아', PH: '동남아시아',
  TH: '동남아시아', ID: '동남아시아',
  IN: '남아시아',
  AU: '오세아니아',
  US: '북아메리카', CA: '북아메리카', MX: '북아메리카',
  DE: '유럽', GB: '유럽', NL: '유럽', PL: '유럽', FR: '유럽',
  IT: '유럽', ES: '유럽', CZ: '유럽', HU: '유럽', SK: '유럽',
  TR: '서아시아', SA: '서아시아', RU: '유럽/아시아',
  BR: '남아메리카',
};

const YEARS = ['2023', '2024', '2025', '2026'];
const TOP_N_COUNTRIES = 20;
const TOP_N_PRODUCTS = 28;
const TOP_N_PRODUCT_COUNTRIES = 5;

// ─── 파싱 ─────────────────────────────────────────────────────────────────
console.log('CSV 파싱 중...');
const raw = fs.readFileSync(CSV_PATH, 'utf8').split('\n');

const kpi = {};
const ctrExp = {}, ctrImp = {};
const ctrProdExp = {}, ctrProdImp = {};        // 국가별 품목명→수출/수입 (top3 표시용)
const ctrProdCodeExp = {}, ctrProdCodeImp = {}; // 국가별 품목코드→수출/수입 (트리맵용)
const prodExp = {}, prodImp = {};
const prodName = {}, prodMti1 = {};
const prodCtrExp = {}, prodCtrImp = {};
const ctrMonthly = {};

for (const yr of YEARS) {
  kpi[yr] = { exp: 0, imp: 0 };
  ctrExp[yr] = {}; ctrImp[yr] = {};
  ctrProdExp[yr] = {}; ctrProdImp[yr] = {};
  ctrProdCodeExp[yr] = {}; ctrProdCodeImp[yr] = {};
  prodExp[yr] = {}; prodImp[yr] = {};
  prodCtrExp[yr] = {}; prodCtrImp[yr] = {};
  ctrMonthly[yr] = {};
}

for (let i = 1; i < raw.length; i++) {
  const line = raw[i].trim();
  if (!line) continue;
  const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
  if (cols.length < 8) continue;

  const yymm = cols[0];
  const yr = yymm.slice(0, 4);
  if (!YEARS.includes(yr)) continue;

  const mm = yymm.slice(4, 6);
  const ctr = normCtr(cols[1]);
  const mtiCd = cols[2];
  const mtiName = cols[3];
  const mti1 = mtiCd ? mtiCd.slice(0, 1) : '';
  const exp = parseFloat(cols[4]) || 0;
  const imp = parseFloat(cols[7]) || 0;

  if (!mtiCd || !/^\d/.test(mtiCd)) continue;

  // KPI
  kpi[yr].exp += exp;
  kpi[yr].imp += imp;

  // 국가별 수출/수입 합계
  ctrExp[yr][ctr] = (ctrExp[yr][ctr] || 0) + exp;
  ctrImp[yr][ctr] = (ctrImp[yr][ctr] || 0) + imp;

  // 국가별 상위 품목명 (top3 툴팁용)
  if (!ctrProdExp[yr][ctr]) ctrProdExp[yr][ctr] = {};
  ctrProdExp[yr][ctr][mtiName] = (ctrProdExp[yr][ctr][mtiName] || 0) + exp;

  if (!ctrProdImp[yr][ctr]) ctrProdImp[yr][ctr] = {};
  ctrProdImp[yr][ctr][mtiName] = (ctrProdImp[yr][ctr][mtiName] || 0) + imp;

  // 국가별 품목코드별 합계 (트리맵용)
  if (!ctrProdCodeExp[yr][ctr]) ctrProdCodeExp[yr][ctr] = {};
  ctrProdCodeExp[yr][ctr][mtiCd] = (ctrProdCodeExp[yr][ctr][mtiCd] || 0) + exp;

  if (!ctrProdCodeImp[yr][ctr]) ctrProdCodeImp[yr][ctr] = {};
  ctrProdCodeImp[yr][ctr][mtiCd] = (ctrProdCodeImp[yr][ctr][mtiCd] || 0) + imp;

  // 품목별 합계
  prodExp[yr][mtiCd] = (prodExp[yr][mtiCd] || 0) + exp;
  prodImp[yr][mtiCd] = (prodImp[yr][mtiCd] || 0) + imp;
  if (!prodName[mtiCd]) { prodName[mtiCd] = mtiName; prodMti1[mtiCd] = mti1; }

  // 품목별 국가 수출
  if (!prodCtrExp[yr][mtiCd]) prodCtrExp[yr][mtiCd] = {};
  prodCtrExp[yr][mtiCd][ctr] = (prodCtrExp[yr][mtiCd][ctr] || 0) + exp;

  // 품목별 국가 수입
  if (!prodCtrImp[yr][mtiCd]) prodCtrImp[yr][mtiCd] = {};
  prodCtrImp[yr][mtiCd][ctr] = (prodCtrImp[yr][mtiCd][ctr] || 0) + imp;

  // 국가별 월별
  if (!ctrMonthly[yr][ctr]) ctrMonthly[yr][ctr] = {};
  if (!ctrMonthly[yr][ctr][mm]) ctrMonthly[yr][ctr][mm] = { exp: 0, imp: 0 };
  ctrMonthly[yr][ctr][mm].exp += exp;
  ctrMonthly[yr][ctr][mm].imp += imp;
}

console.log('집계 완료. 데이터 구조 생성 중...');

const fmt1 = v => Math.round(v / 1e8 * 10) / 10;
const fmtStr = v => fmt1(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function changeRate(cur, prev) {
  if (!prev) return 0;
  return Math.round((cur - prev) / prev * 1000) / 10;
}

// ─── KPI ─────────────────────────────────────────────────────────────────
const kpiOut = {};
for (const yr of YEARS) {
  const prevYr = String(parseInt(yr) - 1);
  kpiOut[yr] = {
    export: {
      value: fmtStr(kpi[yr].exp),
      change: Math.abs(changeRate(kpi[yr].exp, kpi[prevYr]?.exp || 0)),
      up: kpi[yr].exp >= (kpi[prevYr]?.exp || 0),
    },
    import: {
      value: fmtStr(kpi[yr].imp),
      change: Math.abs(changeRate(kpi[yr].imp, kpi[prevYr]?.imp || 0)),
      up: kpi[yr].imp >= (kpi[prevYr]?.imp || 0),
    },
    balance: {
      value: fmtStr(Math.abs(kpi[yr].exp - kpi[yr].imp)),
      positive: kpi[yr].exp >= kpi[yr].imp,
    },
  };
}

// ─── 국가별 데이터 (연별 top20, 수출 기준) ───────────────────────────────
const countryDataOut = {};
for (const yr of YEARS) {
  const totalExp = kpi[yr].exp;
  const sorted = Object.entries(ctrExp[yr]).sort((a, b) => b[1] - a[1]).slice(0, TOP_N_COUNTRIES);
  countryDataOut[yr] = sorted.map(([ctr, expAmt], idx) => {
    const impAmt = ctrImp[yr][ctr] || 0;
    const top3Exp = Object.entries(ctrProdExp[yr][ctr] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    const top3Imp = Object.entries(ctrProdImp[yr][ctr] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    const iso = CTR_ISO2[ctr] || '??';
    return {
      iso,
      name: ctr,
      nameEn: ISO2_EN[iso] || ctr,
      rank: idx + 1,
      export: String(fmt1(expAmt)),
      import: String(fmt1(impAmt)),
      region: ISO2_REGION[iso] || '기타',
      topProducts: top3Exp,       // 수출 상위 품목
      topImportProducts: top3Imp, // 수입 상위 품목
      share: Math.round(expAmt / totalExp * 1000) / 10,
    };
  });
}

// ─── 국가별 데이터 (연별 top20, 수입 기준) ───────────────────────────────
const countryImpDataOut = {};
for (const yr of YEARS) {
  const totalImp = kpi[yr].imp;
  const sorted = Object.entries(ctrImp[yr]).sort((a, b) => b[1] - a[1]).slice(0, TOP_N_COUNTRIES);
  countryImpDataOut[yr] = sorted.map(([ctr, impAmt], idx) => {
    const expAmt = ctrExp[yr][ctr] || 0;
    const top3Imp = Object.entries(ctrProdImp[yr][ctr] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    const iso = CTR_ISO2[ctr] || '??';
    return {
      iso,
      name: ctr,
      nameEn: ISO2_EN[iso] || ctr,
      rank: idx + 1,
      export: String(fmt1(expAmt)),
      import: String(fmt1(impAmt)),
      region: ISO2_REGION[iso] || '기타',
      topProducts: top3Imp,       // 수입 탭에서는 수입 상위 품목 표시
      topImportProducts: top3Imp,
      share: Math.round(impAmt / totalImp * 1000) / 10,
    };
  });
}

// ─── MTI 색상 & 명칭 ─────────────────────────────────────────────────────
const MTI_COLORS = {
  '0': '#22C55E', '1': '#F59E0B', '2': '#8B5CF6', '3': '#F97316',
  '4': '#EC4899', '5': '#14B8A6', '6': '#6B7280', '7': '#1E40AF',
  '8': '#3B82F6', '9': '#9CA3AF',
};
const MTI_NAMES = {
  '0': '농림수산물', '1': '광산물', '2': '화학공업제품', '3': '플라스틱·고무·가죽',
  '4': '섬유류', '5': '생활용품', '6': '철강·금속', '7': '기계·운송장비',
  '8': '전자·전기', '9': '잡제품',
};

// ─── 트리맵 데이터 (연별 top28, 수출 기준) ──────────────────────────────
const treemapExpOut = {};
for (const yr of YEARS) {
  const sorted = Object.entries(prodExp[yr]).sort((a, b) => b[1] - a[1]).slice(0, TOP_N_PRODUCTS);
  treemapExpOut[yr] = sorted.map(([cd, expAmt]) => {
    const mti1 = prodMti1[cd] || '9';
    const top3 = Object.entries(prodCtrExp[yr][cd] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    return {
      code: cd, name: prodName[cd] || cd,
      value: fmt1(expAmt), mti: parseInt(mti1) || 9,
      color: MTI_COLORS[mti1] || '#9CA3AF', topCountries: top3,
    };
  });
}

// ─── 트리맵 데이터 (연별 top28, 수입 기준) ──────────────────────────────
const treemapImpOut = {};
for (const yr of YEARS) {
  const sorted = Object.entries(prodImp[yr]).sort((a, b) => b[1] - a[1]).slice(0, TOP_N_PRODUCTS);
  treemapImpOut[yr] = sorted.map(([cd, impAmt]) => {
    const mti1 = prodMti1[cd] || '9';
    const top3 = Object.entries(prodCtrImp[yr][cd] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    return {
      code: cd, name: prodName[cd] || cd,
      value: fmt1(impAmt), mti: parseInt(mti1) || 9,
      color: MTI_COLORS[mti1] || '#9CA3AF', topCountries: top3,
    };
  });
}

// ─── 국가별 월별 시계열 ───────────────────────────────────────────────────
const timeseriesOut = {};
for (const yr of YEARS) {
  timeseriesOut[yr] = {};
  // 수출+수입 top20 합집합 국가
  const expNames = (countryDataOut[yr] || []).map(c => c.name);
  const impNames = (countryImpDataOut[yr] || []).map(c => c.name);
  const allNames = [...new Set([...expNames, ...impNames])];
  for (const ctr of allNames) {
    const monthly = ctrMonthly[yr][ctr] || {};
    const months = Object.keys(monthly).sort();
    timeseriesOut[yr][ctr] = months.map(mm => {
      const { exp, imp } = monthly[mm];
      const expB = fmt1(exp);
      const impB = fmt1(imp);
      return {
        month: `${parseInt(mm)}월`,   // "1월", "2월", ... "12월"
        export: expB,
        import: impB,
        balance: Math.round((expB - impB) * 10) / 10,
      };
    });
  }
}

// ─── 품목별 연간 추이 (수출 & 수입) ─────────────────────────────────────
// top28은 수출 2024 기준
const top28codes = Object.entries(prodExp['2024']).sort((a, b) => b[1] - a[1])
  .slice(0, TOP_N_PRODUCTS).map(e => e[0]);
// 수입 top28 (2024 기준)
const top28ImpCodes = Object.entries(prodImp['2024']).sort((a, b) => b[1] - a[1])
  .slice(0, TOP_N_PRODUCTS).map(e => e[0]);
const allProdCodes = [...new Set([...top28codes, ...top28ImpCodes])];

const productExpTrendOut = {};
const productImpTrendOut = {};
for (const cd of allProdCodes) {
  productExpTrendOut[cd] = YEARS.map(yr => ({
    year: yr === '2026' ? '2026(1-2월)' : yr,
    value: fmt1(prodExp[yr][cd] || 0),
  }));
  productImpTrendOut[cd] = YEARS.map(yr => ({
    year: yr === '2026' ? '2026(1-2월)' : yr,
    value: fmt1(prodImp[yr][cd] || 0),
  }));
}

// ─── 품목별 상위 국가 (수출 & 수입) ─────────────────────────────────────
const productExpTopCtrsOut = {};
const productImpTopCtrsOut = {};
for (const cd of allProdCodes) {
  productExpTopCtrsOut[cd] = {};
  productImpTopCtrsOut[cd] = {};
  for (const yr of YEARS) {
    const sortedExp = Object.entries(prodCtrExp[yr][cd] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, TOP_N_PRODUCT_COUNTRIES);
    productExpTopCtrsOut[cd][yr] = sortedExp.map(([country, v]) => ({ country, value: fmt1(v) }));

    const sortedImp = Object.entries(prodCtrImp[yr][cd] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, TOP_N_PRODUCT_COUNTRIES);
    productImpTopCtrsOut[cd][yr] = sortedImp.map(([country, v]) => ({ country, value: fmt1(v) }));
  }
}

// ─── 국가별 KPI ──────────────────────────────────────────────────────────
const countryKpiOut = {};
for (const yr of YEARS) {
  countryKpiOut[yr] = {};
  const allCtrs = new Set([...Object.keys(ctrExp[yr]), ...Object.keys(ctrImp[yr])]);
  for (const ctr of allCtrs) {
    const expAmt = ctrExp[yr][ctr] || 0;
    const impAmt = ctrImp[yr][ctr] || 0;
    countryKpiOut[yr][ctr] = {
      export: String(fmt1(expAmt)),
      import: String(fmt1(impAmt)),
      balance: String(fmt1(Math.abs(expAmt - impAmt))),
      positive: expAmt >= impAmt,
    };
  }
}

// ─── 국가별 품목 트리맵 (수출·수입) ────────────────────────────────────────
// 수출·수입 양쪽 top20에 등장하는 국가들을 모두 포함
const countryTreemapExpOut = {}; // [yr][ctrName] = [{code, name, value, mti, color}, ...]
const countryTreemapImpOut = {};

for (const yr of YEARS) {
  countryTreemapExpOut[yr] = {};
  countryTreemapImpOut[yr] = {};

  const allCtrNames = new Set([
    ...(countryDataOut[yr] || []).map(c => c.name),
    ...(countryImpDataOut[yr] || []).map(c => c.name),
  ]);

  for (const ctr of allCtrNames) {
    // 수출 트리맵
    const expEntries = Object.entries(ctrProdCodeExp[yr][ctr] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, TOP_N_PRODUCTS);
    countryTreemapExpOut[yr][ctr] = expEntries.map(([cd, amt]) => {
      const mti1 = prodMti1[cd] || '9';
      return {
        code: cd,
        name: prodName[cd] || cd,
        value: fmt1(amt),
        mti: parseInt(mti1) || 9,
        color: MTI_COLORS[mti1] || '#9CA3AF',
      };
    });

    // 수입 트리맵
    const impEntries = Object.entries(ctrProdCodeImp[yr][ctr] || {})
      .sort((a, b) => b[1] - a[1]).slice(0, TOP_N_PRODUCTS);
    countryTreemapImpOut[yr][ctr] = impEntries.map(([cd, amt]) => {
      const mti1 = prodMti1[cd] || '9';
      return {
        code: cd,
        name: prodName[cd] || cd,
        value: fmt1(amt),
        mti: parseInt(mti1) || 9,
        color: MTI_COLORS[mti1] || '#9CA3AF',
      };
    });
  }
}

// ─── TS 파일 생성 ─────────────────────────────────────────────────────────
console.log('TypeScript 파일 생성 중...');

const ts = `// !! 자동 생성된 파일입니다. 수정하지 마세요 !!
// 생성: scripts/generate-data.js
// 원본: trade_by_country_mti3.csv

export const KPI_BY_YEAR = ${JSON.stringify(kpiOut, null, 2)} as const;

export const COUNTRY_DATA_BY_YEAR: Record<string, {
  iso: string; name: string; nameEn: string; rank: number;
  export: string; import: string; region: string;
  topProducts: string[]; topImportProducts: string[]; share: number;
}[]> = ${JSON.stringify(countryDataOut, null, 2)};

export const COUNTRY_IMP_DATA_BY_YEAR: Record<string, {
  iso: string; name: string; nameEn: string; rank: number;
  export: string; import: string; region: string;
  topProducts: string[]; topImportProducts: string[]; share: number;
}[]> = ${JSON.stringify(countryImpDataOut, null, 2)};

export const MTI_COLORS: Record<number, string> = {
${Object.entries(MTI_COLORS).map(([k, v]) => `  ${k}: "${v}"`).join(',\n')},
};

export const MTI_NAMES: Record<number, string> = {
${Object.entries(MTI_NAMES).map(([k, v]) => `  ${k}: "${v}"`).join(',\n')},
};

export const TREEMAP_EXP_DATA_BY_YEAR: Record<string, {
  code: string; name: string; value: number;
  mti: number; color: string; topCountries: string[];
}[]> = ${JSON.stringify(treemapExpOut, null, 2)};

export const TREEMAP_IMP_DATA_BY_YEAR: Record<string, {
  code: string; name: string; value: number;
  mti: number; color: string; topCountries: string[];
}[]> = ${JSON.stringify(treemapImpOut, null, 2)};

export const TIMESERIES_BY_YEAR_COUNTRY: Record<string, Record<string, {
  month: string; export: number; import: number; balance: number;
}[]>> = ${JSON.stringify(timeseriesOut, null, 2)};

export const PRODUCT_EXP_TREND_BY_CODE: Record<string, {
  year: string; value: number;
}[]> = ${JSON.stringify(productExpTrendOut, null, 2)};

export const PRODUCT_IMP_TREND_BY_CODE: Record<string, {
  year: string; value: number;
}[]> = ${JSON.stringify(productImpTrendOut, null, 2)};

export const PRODUCT_EXP_TOP_COUNTRIES_BY_CODE: Record<string, Record<string, {
  country: string; value: number;
}[]>> = ${JSON.stringify(productExpTopCtrsOut, null, 2)};

export const PRODUCT_IMP_TOP_COUNTRIES_BY_CODE: Record<string, Record<string, {
  country: string; value: number;
}[]>> = ${JSON.stringify(productImpTopCtrsOut, null, 2)};

export const COUNTRY_KPI_BY_YEAR: Record<string, Record<string, {
  export: string; import: string; balance: string; positive: boolean;
}>> = ${JSON.stringify(countryKpiOut, null, 2)};

export const COUNTRY_TREEMAP_EXP_BY_YEAR: Record<string, Record<string, {
  code: string; name: string; value: number; mti: number; color: string;
}[]>> = ${JSON.stringify(countryTreemapExpOut, null, 2)};

export const COUNTRY_TREEMAP_IMP_BY_YEAR: Record<string, Record<string, {
  code: string; name: string; value: number; mti: number; color: string;
}[]>> = ${JSON.stringify(countryTreemapImpOut, null, 2)};
`;

fs.writeFileSync(OUT_PATH, ts, 'utf8');
const size = (fs.statSync(OUT_PATH).size / 1024).toFixed(0);
console.log(`완료! → ${OUT_PATH} (${size} KB)`);
