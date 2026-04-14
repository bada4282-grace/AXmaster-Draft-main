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

  const systemPrompt = `당신은 한국 무역통계 전문 AI 어시스턴트입니다.
아래 데이터를 바탕으로 사용자 질문에 한국어로 답변하세요.
수치는 구체적으로 인용하고, 분석이 필요한 경우 데이터 간 상관관계를 설명하세요.
데이터에 없는 내용은 추측하지 말고 "해당 데이터가 없습니다"라고 명시하세요.

${context ? `[참고 데이터]\n${context}` : "[참고 데이터 없음 — 일반적인 무역 지식으로 답변]"}`;

  const stream = await client.messages.stream({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history,
      { role: "user", content: message },
    ],
  });

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
