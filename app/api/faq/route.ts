import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LogEntry {
  role: "user" | "bot";
  content: string;
}

export async function POST(request: NextRequest) {
  let logs: LogEntry[] = [];

  try {
    const body = await request.json();
    logs = body.logs ?? [];
  } catch {
    return NextResponse.json({ questions: null });
  }

  const userMessages = logs.filter(l => l.role === "user");
  if (userMessages.length === 0) {
    return NextResponse.json({ questions: null });
  }

  const recentUserText = userMessages.map(l => l.content).join("\n");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `아래는 K-STAT 무역통계 대시보드에서 한 사용자가 최근에 한 질문들입니다.

<chat_log>
${recentUserText}
</chat_log>

위 채팅 로그를 분석하여, 이 사용자가 다음에 궁금해할 만한 후속 질문 3개를 추천하세요.

핵심 규칙:
- 반드시 채팅 로그에 실제로 등장하는 국가명, 품목명, 주제만 기반으로 할 것
- 채팅 로그에 언급되지 않은 국가나 품목을 임의로 추천하지 말 것 (이것이 가장 중요한 규칙입니다)
- 이미 물어본 질문을 그대로 반복하지 말 것. 같은 주제의 다른 각도 질문을 제안
- 예: 사용자가 "중국 반도체 수출"을 물었다면 → "중국 반도체 수입은?" 또는 "대만 반도체 수출과 비교하면?" 등
- K-STAT 대시보드 데이터(국가별 수출입, 품목별 추이, 거시경제 지표)로 답변 가능한 질문만
- 각 질문은 20자 이내, 간결한 구어체
- 3개 질문이 가능하면 서로 다른 관점을 다루도록

출력 형식 (JSON 배열만 출력, 설명이나 다른 텍스트 없이):
["질문1", "질문2", "질문3"]`,
        },
      ],
    });

    const first = response.content[0];
    if (first?.type !== "text") return NextResponse.json({ questions: null });

    const parsed = JSON.parse(first.text);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((q: unknown) => typeof q === "string")) {
      return NextResponse.json({ questions: parsed });
    }
    return NextResponse.json({ questions: null });
  } catch {
    return NextResponse.json({ questions: null });
  }
}
