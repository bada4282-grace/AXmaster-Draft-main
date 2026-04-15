import { supabase } from "@/lib/supabase";

export interface ChatLog {
  id: string;
  user_id: string;
  role: "user" | "bot";
  content: string;
  created_at: string;
}

// 채팅 메시지 저장 (비로그인 시 아무 것도 안 함)
export async function saveChatLog(role: "user" | "bot", content: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("chat_logs")
    .insert({ user_id: user.id, role, content });
  if (error) throw error;
}

// 최근 채팅 로그 조회 (비로그인 시 빈 배열)
export async function getChatLogs(limit = 50): Promise<ChatLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("chat_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChatLog[];
}
