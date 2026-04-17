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

  // buildChatContext는 대용량 데이터 접근을 포함하므로 에러를 명시적으로 잡습니다
  let context = "";
  try {
    context = await buildChatContext(message);
  } catch (err) {
    console.error("[chat/route] buildChatContext error:", err);
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  // 웰컴 메시지/FAQ 응답 감지 — 사용자의 첫 번째 메시지 이전 assistant 메시지만 맥락으로 사용
  // 일반 질문에서는 history를 전송하지 않아 이전 토픽이 섞이는 것을 방지
  const validHistory = history
    .filter(m => m.content.trim().length > 0)
    .reduce<HistoryEntry[]>((acc, m) => {
      if (acc.length > 0 && acc[acc.length - 1].role === m.role) return acc;
      acc.push(m);
      return acc;
    }, []);

  // 웰컴/FAQ 맥락: 첫 user 메시지 이전의 assistant 메시지만 추출
  const firstUserIdx = validHistory.findIndex(m => m.role === "user");
  let priorContext = "";
  if (firstUserIdx > 0) {
    priorContext = validHistory.slice(0, firstUserIdx)
      .map(m => m.content).join("\n");
  } else if (firstUserIdx < 0) {
    priorContext = validHistory.map(m => m.content).join("\n");
  }

  // 일반 질문에서는 history를 보내지 않음 — 각 질문을 독립적으로 처리
  // 이전 OLED 질문 후 플라스틱 질문 시 OLED가 섞이는 문제 완전 차단
  const finalHistory: HistoryEntry[] = [];

  const systemPrompt = `당신은 한국 무역통계 전문 AI 어시스턴트입니다. 아래 데이터를 기반으로 사용자 질문에 한국어로 자연스럽게 답변하세요.

답변 규칙:
- 수치는 아래 데이터에서 정확히 인용하세요.
- 데이터에서 직접 확인되지 않아도, 제공된 수치를 바탕으로 합리적으로 추론하여 답변할 수 있습니다.
- "제공된 데이터에 따르면", "참고 데이터에 의하면" 같은 표현은 쓰지 마세요. 자연스럽게 답변하세요.
- 무역통계와 전혀 무관한 질문(예: 날씨, 요리 등)에만 "답변하기 어렵습니다"라고 하세요.
- 데이터가 부분적으로 있으면 있는 것을 바탕으로 최대한 답변하세요.
- 답변 첫 부분에 사용자 질문의 핵심 토픽을 ==토픽== 형식으로 감싸세요. 예: ==반도체 수출 현황==. 토픽 하이라이트는 답변당 1~2개만 사용하세요.
- 거시경제 지표가 제공된 경우, 무역 데이터의 변동을 설명할 때 관련 지표와의 상관관계를 자연스럽게 언급하세요. 단, 모든 답변에 강제로 넣지 말고, 설명에 도움이 될 때만 활용하세요.
- 거시경제 지표와 무역 데이터의 관계를 설명할 때 인과관계를 단정짓지 말고 "~의 영향이 있을 수 있습니다", "~와 관련이 있는 것으로 보입니다" 같은 표현을 사용하세요.
- 불확실성이나 한계는 딱 한 번만 간결하게 언급하세요. "명확하지 않다", "확실하지 않다", "데이터가 부족하다" 같은 유보적 표현을 반복하면 신뢰도가 하락합니다. 한계를 언급한 후에는 있는 데이터로 자신있게 분석하세요.
- 사용자의 현재 질문에만 집중하여 답변하세요. 이전 대화에서 다뤘던 내용을 반복하거나 요약하지 마세요. 이전 질문과 관련이 있더라도, 현재 질문이 묻는 것에만 정확히 답변하세요.
- 사용자가 여러 질문을 한 번에 한 경우, 각 질문을 별도 문단으로 나누어 답변하세요. 각 문단에 ==토픽== 소제목을 붙여 구분하세요. 하나의 문단에 여러 주제를 섞지 마세요.
${priorContext ? `\n[이전 대화 맥락]\n당신이 사용자에게 먼저 한 말:\n${priorContext}\n사용자가 이에 대해 이어서 대답하고 있습니다. 이 맥락을 반영하여 답변하세요.` : ""}
${context ? `\n[데이터]\n${context}` : "\n[데이터 없음]"}`;

  let stream;
  try {
    stream = await client.messages.stream({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...finalHistory,
        { role: "user", content: message },
      ],
    });
  } catch (err) {
    console.error("[chat/route] Anthropic stream error:", err);
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
