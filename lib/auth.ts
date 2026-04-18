import { supabase } from "@/lib/supabase";

// 내부 이메일 변환 (아이디 → Supabase용 이메일)
function toEmail(username: string) {
  return `${username}@kstat.local`;
}

// 회원가입 (이름, 아이디, 비밀번호, 이메일)
// auth identifier는 `{username}@kstat.local` (내부용) 으로 유지하고,
// 실제 이메일은 user_metadata에 저장하여 연락·향후 인증용으로 보관.
export async function signUp(
  name: string,
  username: string,
  password: string,
  email: string,
) {
  const { data, error } = await supabase.auth.signUp({
    email: toEmail(username),
    password,
    options: {
      data: { name, username, email },
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
