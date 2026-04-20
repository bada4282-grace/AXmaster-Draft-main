import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type ServerTier = "guest" | "free" | "paid";

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// 요청의 Authorization: Bearer <JWT> 를 검증하고, user_profiles.tier 를 반환한다.
// 토큰이 없거나 무효하면 'guest'. 프로필 조회 실패 시 fail-closed 로 'free'.
export async function getTierFromRequest(req: NextRequest): Promise<ServerTier> {
  const token = extractBearer(req);
  if (!token) return "guest";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) {
    console.error("[getTierFromRequest] Supabase env missing");
    return "guest";
  }

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user) return "guest";

  const { data, error } = await sb
    .from("user_profiles")
    .select("tier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[getTierFromRequest] profile read failed:", error.message);
    return "free";
  }
  return (data?.tier as "free" | "paid") ?? "free";
}
