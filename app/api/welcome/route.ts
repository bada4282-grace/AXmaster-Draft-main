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
    return NextResponse.json({ message: null });
  }

  // 채팅 로그가 없으면 null 반환 (기본 인사말 사용)
  if (logs.length === 0) {
    return NextResponse.json({ message: null });
  }

  // user 메시지만 추출하여 최근 관심사 파악
  const userMessages = logs.filter(l => l.role === "user");
  if (userMessages.length === 0) {
    return NextResponse.json({ message: null });
  }

  const recentUserText = userMessages
    .map(l => l.content)
    .join("\n");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `아래는 K-STAT 무역통계 서비스에서 사용자가 최근에 한 질문들입니다. 맨 아래가 가장 최근 질문입니다.

${recentUserText}

이 질문 목록을 보고, 사용자가 지난번에 이미 확인한 내용을 파악한 뒤, 그것과 연관되지만 아직 확인하지 않은 새로운 정보를 제안하는 환영 메시지를 작성하세요.

예시 흐름:
- 지난번에 "중국 제약 수출 추이"를 확인했다면 → "지난번에 중국 제약 수출을 확인하셨네요. 이번엔 미국 시장과의 비교 데이터를 살펴볼까요?"
- 지난번에 "반도체 수출 현황"을 확인했다면 → "지난번에 반도체 수출 현황을 보셨네요. 최근 미국향 반도체 수출 흐름도 확인해 드릴까요?"

규칙:
- "안녕하세요!"로 시작
- 2문장 이내
- 첫 문장: 지난번에 확인한 내용을 자연스럽게 언급 ("지난번에 ~를 확인하셨네요.")
- 둘째 문장: 그것과 연관된 새로운 제안 ("이번엔 ~도 알려드릴까요?" / "~현황도 살펴볼까요?")
- 이미 확인한 것을 다시 제안하지 말 것
- "도움이 되시길 바랍니다", "무엇이든 질문해주세요" 같은 범용 문구 사용 금지
- 설명 없이 환영 메시지 본문만 출력`,
        },
      ],
    });

    const first = response.content[0];
    const message = first?.type === "text" ? first.text : null;
    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ message: null });
  }
}
