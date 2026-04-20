import { supabase } from "@/lib/supabase";

// 회원가입 — 사용자가 입력한 실제 이메일을 Supabase 인증 식별자로 사용.
// username(아이디)은 user_metadata 에만 저장(표시·로그인 아이디용).
export async function signUp(
  name: string,
  username: string,
  password: string,
  email: string,
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, username, email },
    },
  });
  if (error) throw error;
  return data;
}

// 로그인 — 아이디(username) 또는 이메일 어느 쪽이든 허용.
// "@" 가 있으면 이메일로 바로 로그인, 없으면 RPC 로 이메일 조회 후 로그인.
export async function signIn(identifier: string, password: string) {
  let email = identifier.trim();

  if (!email.includes("@")) {
    const { data: foundEmail, error: rpcErr } = await supabase.rpc("get_email_by_username", {
      p_username: email,
    });
    if (rpcErr) {
      console.warn("[signIn] email lookup failed:", rpcErr.message);
      throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
    if (!foundEmail) {
      throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
    email = foundEmail as string;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// 로그아웃
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 현재 로그인된 사용자 반환 (없으면 null)
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─────────────────────────────────────────────────────────────
// 회원 등급
// ─────────────────────────────────────────────────────────────

export type UserTier = "guest" | "free" | "paid";

export interface UserProfile {
  tier: "free" | "paid";
  tierRequest: "paid" | null;
  requestedAt: string | null;
  isAdmin: boolean;
}

// 현재 사용자의 등급 반환. 비로그인은 'guest'.
export async function getUserTier(): Promise<UserTier> {
  const user = await getUser();
  if (!user) return "guest";

  const { data, error } = await supabase
    .from("user_profiles")
    .select("tier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // RLS 설정/네트워크 이슈 시 DevTools에서 원인 파악용 경고
    console.warn("[getUserTier] profile read failed:", error.message);
    return "free";
  }
  if (!data) return "free"; // 프로필 없음 → free로 간주 (fail-closed)
  return data.tier as "free" | "paid";
}

// 현재 사용자의 전체 프로필 (tier / tier_request / is_admin) 반환. 비로그인은 null.
export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("tier, tier_request, requested_at, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[getUserProfile] profile read failed:", error.message);
    return { tier: "free", tierRequest: null, requestedAt: null, isAdmin: false };
  }
  if (!data) return { tier: "free", tierRequest: null, requestedAt: null, isAdmin: false };

  return {
    tier: (data.tier as "free" | "paid") ?? "free",
    tierRequest: (data.tier_request as "paid" | null) ?? null,
    requestedAt: (data.requested_at as string | null) ?? null,
    isAdmin: Boolean(data.is_admin),
  };
}

// 유료 회원 전환 신청 — tier_request='paid' + requested_at=now()
export async function requestPaidUpgrade(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const { error } = await supabase
    .from("user_profiles")
    .update({ tier_request: "paid", requested_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}
