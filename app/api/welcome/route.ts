import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LogEntry {
  role: "user" | "bot";
  content: string;
}

export async function POST(request: NextRequest) {
  const { logs } = await request.json() as { logs: LogEntry[] };

  // 채팅 로그가 없으면 null 반환 (기본 인사말 사용)
  if (!logs || logs.length === 0) {
    return NextResponse.json({ message: null });
  }

  // 채팅 로그를 텍스트로 변환
  const logText = logs
    .map(log => `${log.role === "user" ? "사용자" : "AI"}: ${log.content}`)
    .join("\n");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const response = await client.messages.create({
    model,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `아래는 K-STAT 무역통계 서비스를 이용한 사용자의 채팅 기록입니다.

${logText}

이 채팅 기록을 바탕으로 사용자가 관심 있는 업종, 타겟 국가, 품목을 유추하여 환영 메시지를 한국어로 2~3문장 작성해주세요.
"안녕하세요!"로 시작하고, 무역통계와 관련된 자연스러운 내용으로 마무리하세요.`,
      },
    ],
  });

  const message = response.content[0].type === "text" ? response.content[0].text : null;
  return NextResponse.json({ message });
}
