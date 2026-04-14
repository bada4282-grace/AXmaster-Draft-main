import { supabase } from "@/lib/supabase";

// 회원가입
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// 로그인
export async function signIn(email: string, password: string) {
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
