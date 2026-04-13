import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 국가 + 품목 기준 교역 데이터 조회
export async function queryTrade({
  ctrName,
  mtiName,
  yymm,
}: {
  ctrName?: string;
  mtiName?: string;
  yymm?: string;
}) {
  let query = supabase.from("trade_by_country").select("*");

  if (ctrName) query = query.ilike('"CTR_NAME"', `%${ctrName}%`);
  if (mtiName) query = query.ilike('"MTI_NAME"', `%${mtiName}%`);
  if (yymm)   query = query.eq('"YYMM"', yymm);

  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data;
}
