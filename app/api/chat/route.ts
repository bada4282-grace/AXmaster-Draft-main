import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildChatContext } from "@/lib/chatContext";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  let message: string;
  let history: HistoryEntry[];

  try {
    const body = await request.json();
    message = body.message ?? "";
    history = body.history ?? [];
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!message.trim()) {
    return new Response("Message required", { status: 400 });
  }

  const context = buildChatContext(message);
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const systemPrompt = `당신은 한국 무역통계 전문 AI 어시스턴트입니다. 아래 데이터를 기반으로 사용자 질문에 한국어로 자연스럽게 답변하세요.

답변 규칙:
- 수치는 아래 데이터에서 정확히 인용하세요.
- 데이터에서 직접 확인되지 않아도, 제공된 수치를 바탕으로 합리적으로 추론하여 답변할 수 있습니다.
- "제공된 데이터에 따르면", "참고 데이터에 의하면" 같은 표현은 쓰지 마세요. 자연스럽게 답변하세요.
- 무역통계와 전혀 무관한 질문(예: 날씨, 요리 등)에만 "답변하기 어렵습니다"라고 하세요.
- 데이터가 부분적으로 있으면 있는 것을 바탕으로 최대한 답변하세요.

${context ? `[데이터]\n${context}` : "[데이터 없음]"}`;

  let stream;
  try {
    stream = await client.messages.stream({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...history,
        { role: "user", content: message },
      ],
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "답변 생성 중 오류가 발생했습니다." }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[답변 생성 중 오류가 발생했습니다.]"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
