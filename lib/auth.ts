import { supabase } from "@/lib/supabase";

// 내부 이메일 변환 (아이디 → Supabase용 이메일)
function toEmail(username: string) {
  return `${username}@kstat.local`;
}

// 회원가입 (이름, 아이디, 비밀번호)
export async function signUp(name: string, username: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: toEmail(username),
    password,
    options: {
      data: { name, username },
    },
  });
  if (error) throw error;
  return data;
}

// 로그인 (아이디, 비밀번호)
export async function signIn(username: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
    password,
  });
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

// 현재 사용자의 등급 반환. 비로그인은 'guest'.
export async function getUserTier(): Promise<UserTier> {
  const user = await getUser();
  if (!user) return "guest";

  const { data, error } = await supabase
    .from("user_profiles")
    .select("tier")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return "free"; // 프로필 조회 실패 시 free로 간주
  return data.tier as UserTier;
}
