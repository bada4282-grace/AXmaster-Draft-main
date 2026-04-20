import { supabase } from "@/lib/supabase";

export interface ChatLog {
  id: string;
  user_id: string;
  role: "user" | "bot";
  content: string;
  created_at: string;
}

async function getCurrentUserId(): Promise<string | null> {
  // getSession()은 로컬 스토리지에서 읽어 네트워크 요청 없음 → 로그인 직후에도 안정적
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// 채팅 메시지 저장 (비로그인 시 아무 것도 안 함)
export async function saveChatLog(role: "user" | "bot", content: string) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("chat_logs")
    .insert({ user_id: userId, role, content });
  if (error) console.error("[saveChatLog] 저장 실패:", error.message);
}

// 최근 채팅 로그 조회 (비로그인 시 빈 배열)
// DB 에서 최신 N 개를 역순으로 가져온 뒤 시간 정방향(오래된→최신)으로 뒤집어 반환.
// LLM 프롬프트(welcome·FAQ)가 자연스러운 대화 흐름을 읽을 수 있도록 최신이 마지막에 오게 함.
export async function getChatLogs(limit = 50): Promise<ChatLog[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("chat_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getChatLogs] 조회 실패:", error.message);
    return [];
  }
  return ((data ?? []) as ChatLog[]).reverse();
}
