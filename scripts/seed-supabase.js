/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * CSV → Supabase 사전 집계 테이블 시드 스크립트
 * 실행: node scripts/seed-supabase.js
 *
 * 사전 조건:
 *   1. Supabase에서 scripts/create-agg-tables.sql 실행 완료
 *   2. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 설정
 *
 * 특징:
 *   - Top N 제한 없이 전체 1,310개 품목 × 전체 국가 데이터 삽입
 *   - 대시보드와 챗봇 모두 이 테이블에서 데이터를 조회
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ─── 환경변수 로드 (.env.local) ──────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of envContent.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── 경로 ────────────────────────────────────────────────────────────────
const CSV_PATH = path.join(__dirname, '..', 'tradedata_ctr_mti6.csv');
const MTI_CSV_PATH = path.join(__dirname, '..', 'MTI-data.csv');

// ─── 국가명 정규화 ───────────────────────────────────────────────────────
const CTR_NORMALIZE = { '인도(인디아)': '인도' };
function normCtr(name) { return CTR_NORMALIZE[name] || name; }

const YEARS = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];

// ─── MTI 룩업 ────────────────────────────────────────────────────────────
console.log('MTI 데이터 로드 중...');
const mtiLookup = {};
{
  const lines = fs.readFileSync(MTI_CSV_PATH, 'utf8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
    if (cols.length >= 2) mtiLookup[cols[0]] = cols[1];
  }
  console.log(`MTI 룩업 ${Object.keys(mtiLookup).length}개`);
}

// ─── CSV 파싱 & 집계 ─────────────────────────────────────────────────────
console.log('CSV 파싱 중...');
const raw = fs.readFileSync(CSV_PATH, 'utf8').split('\n');

// 집계 맵
const prodByYear = {};        // { code: { year: { exp, imp } } }
const prodCtrByYear = {};     // { code: { year: { country: { exp, imp } } } }
const ctrByYear = {};         // { year: { country: { exp, imp } } }
const ctrMonthly = {};        // { year: { country: { month: { exp, imp } } } }
const ctrProdByYear = {};     // { year: { country: { code: { exp, imp } } } }

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
  const code = cols[2];
  const exp = parseFloat(cols[3]) || 0;
  const imp = parseFloat(cols[6]) || 0;

  if (!code || !/^\d/.test(code)) continue;

  // 품목별 연간
  if (!prodByYear[code]) prodByYear[code] = {};
  if (!prodByYear[code][yr]) prodByYear[code][yr] = { exp: 0, imp: 0 };
  prodByYear[code][yr].exp += exp;
  prodByYear[code][yr].imp += imp;

  // 품목별 국가별
  if (!prodCtrByYear[code]) prodCtrByYear[code] = {};
  if (!prodCtrByYear[code][yr]) prodCtrByYear[code][yr] = {};
  if (!prodCtrByYear[code][yr][ctr]) prodCtrByYear[code][yr][ctr] = { exp: 0, imp: 0 };
  prodCtrByYear[code][yr][ctr].exp += exp;
  prodCtrByYear[code][yr][ctr].imp += imp;

  // 국가별 연간
  if (!ctrByYear[yr]) ctrByYear[yr] = {};
  if (!ctrByYear[yr][ctr]) ctrByYear[yr][ctr] = { exp: 0, imp: 0 };
  ctrByYear[yr][ctr].exp += exp;
  ctrByYear[yr][ctr].imp += imp;

  // 국가별 월별
  if (!ctrMonthly[yr]) ctrMonthly[yr] = {};
  if (!ctrMonthly[yr][ctr]) ctrMonthly[yr][ctr] = {};
  if (!ctrMonthly[yr][ctr][mm]) ctrMonthly[yr][ctr][mm] = { exp: 0, imp: 0 };
  ctrMonthly[yr][ctr][mm].exp += exp;
  ctrMonthly[yr][ctr][mm].imp += imp;

  // 국가별 품목별 (트리맵용)
  if (!ctrProdByYear[yr]) ctrProdByYear[yr] = {};
  if (!ctrProdByYear[yr][ctr]) ctrProdByYear[yr][ctr] = {};
  if (!ctrProdByYear[yr][ctr][code]) ctrProdByYear[yr][ctr][code] = { exp: 0, imp: 0 };
  ctrProdByYear[yr][ctr][code].exp += exp;
  ctrProdByYear[yr][ctr][code].imp += imp;
}

console.log('집계 완료. Supabase 삽입 시작...');

// ─── 배치 INSERT 헬퍼 ───────────────────────────────────────────────────
async function batchInsert(table, rows, batchSize = 500) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`  [${table}] 배치 ${i}~${i + batch.length} 에러:`, error.message);
    }
    inserted += batch.length;
  }
  console.log(`  [${table}] ${inserted}행 삽입 완료`);
}

// ─── 테이블 비우기 ───────────────────────────────────────────────────────
async function truncateTable(table) {
  const { error } = await supabase.from(table).delete().neq('year', '__never__');
  if (error) console.error(`  [${table}] 비우기 에러:`, error.message);
}

async function main() {
  // 1. agg_product_trend — 품목별 연간 추이 (전체)
  console.log('\n1/6 agg_product_trend...');
  await truncateTable('agg_product_trend');
  const trendRows = [];
  for (const [code, years] of Object.entries(prodByYear)) {
    const mti = parseInt(code.charAt(0), 10) || 0;
    const name = mtiLookup[code] || code;
    for (const [yr, { exp, imp }] of Object.entries(years)) {
      if (exp > 0 || imp > 0) {
        trendRows.push({ code, name, year: yr, mti, exp_amt: exp, imp_amt: imp });
      }
    }
  }
  await batchInsert('agg_product_trend', trendRows);

  // 2. agg_product_countries — 품목별 국가별 (전체)
  console.log('\n2/6 agg_product_countries...');
  await truncateTable('agg_product_countries');
  const pcRows = [];
  for (const [code, years] of Object.entries(prodCtrByYear)) {
    for (const [yr, countries] of Object.entries(years)) {
      for (const [ctr, { exp, imp }] of Object.entries(countries)) {
        if (exp > 0 || imp > 0) {
          pcRows.push({ code, year: yr, country: ctr, exp_amt: exp, imp_amt: imp });
        }
      }
    }
  }
  await batchInsert('agg_product_countries', pcRows);

  // 3. agg_country_ranking — 국가별 순위 (전체)
  console.log('\n3/6 agg_country_ranking...');
  await truncateTable('agg_country_ranking');
  const crRows = [];
  for (const yr of YEARS) {
    if (!ctrByYear[yr]) continue;
    const totalExp = Object.values(ctrByYear[yr]).reduce((s, c) => s + c.exp, 0);
    const totalImp = Object.values(ctrByYear[yr]).reduce((s, c) => s + c.imp, 0);
    const sortedExp = Object.entries(ctrByYear[yr]).sort((a, b) => b[1].exp - a[1].exp);
    const sortedImp = Object.entries(ctrByYear[yr]).sort((a, b) => b[1].imp - a[1].imp);
    const expRankMap = {};
    sortedExp.forEach(([c], i) => { expRankMap[c] = i + 1; });
    const impRankMap = {};
    sortedImp.forEach(([c], i) => { impRankMap[c] = i + 1; });
    for (const [ctr, { exp, imp }] of Object.entries(ctrByYear[yr])) {
      crRows.push({
        year: yr, country: ctr,
        exp_amt: exp, imp_amt: imp,
        rank_exp: expRankMap[ctr] || 0,
        rank_imp: impRankMap[ctr] || 0,
        share_exp: totalExp > 0 ? Math.round(exp / totalExp * 1000) / 10 : 0,
        share_imp: totalImp > 0 ? Math.round(imp / totalImp * 1000) / 10 : 0,
      });
    }
  }
  await batchInsert('agg_country_ranking', crRows);

  // 4. agg_country_timeseries — 국가별 월별 시계열
  console.log('\n4/6 agg_country_timeseries...');
  await truncateTable('agg_country_timeseries');
  const tsRows = [];
  for (const yr of YEARS) {
    if (!ctrMonthly[yr]) continue;
    for (const [ctr, months] of Object.entries(ctrMonthly[yr])) {
      for (const [mm, { exp, imp }] of Object.entries(months)) {
        tsRows.push({ year: yr, country: ctr, month: mm, exp_amt: exp, imp_amt: imp });
      }
    }
  }
  await batchInsert('agg_country_timeseries', tsRows);

  // 5. agg_treemap — 연간 품목 트리맵 (전체)
  console.log('\n5/6 agg_treemap...');
  await truncateTable('agg_treemap');
  const tmRows = [];
  for (const [code, years] of Object.entries(prodByYear)) {
    const mti = parseInt(code.charAt(0), 10) || 0;
    const name = mtiLookup[code] || code;
    for (const [yr, { exp, imp }] of Object.entries(years)) {
      if (exp > 0 || imp > 0) {
        tmRows.push({ year: yr, code, name, mti, exp_amt: exp, imp_amt: imp });
      }
    }
  }
  await batchInsert('agg_treemap', tmRows);

  // 6. agg_country_treemap — 국가별 품목 트리맵 (전체)
  console.log('\n6/6 agg_country_treemap...');
  await truncateTable('agg_country_treemap');
  const ctRows = [];
  for (const yr of YEARS) {
    if (!ctrProdByYear[yr]) continue;
    for (const [ctr, codes] of Object.entries(ctrProdByYear[yr])) {
      for (const [code, { exp, imp }] of Object.entries(codes)) {
        if (exp > 0 || imp > 0) {
          const mti = parseInt(code.charAt(0), 10) || 0;
          const name = mtiLookup[code] || code;
          ctRows.push({ year: yr, country: ctr, code, name, mti, exp_amt: exp, imp_amt: imp });
        }
      }
    }
  }
  await batchInsert('agg_country_treemap', ctRows);

  console.log('\n시드 완료!');
}

main().catch(err => {
  console.error('시드 실패:', err);
  process.exit(1);
});
