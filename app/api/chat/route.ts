import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildChatContext, type PageContext } from "@/lib/chatContext";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  let message: string;
  let history: HistoryEntry[];
  let pageContext: PageContext | undefined;

  try {
    const body = await request.json();
    message = body.message ?? "";
    history = body.history ?? [];
    pageContext = body.pageContext;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!message.trim()) {
    return new Response("Message required", { status: 400 });
  }

  // buildChatContext는 대용량 데이터 접근을 포함하므로 에러를 명시적으로 잡습니다
  let context = "";
  try {
    context = await buildChatContext(message, pageContext);
  } catch (err) {
    console.error("[chat/route] buildChatContext error:", err);
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  // 이전 대화 맥락은 일절 모델에 전달하지 않는다 — 현재 질문에만 집중하도록 완전 격리
  // (이전 국가/연도/품목 토픽이 현재 답변에 섞이는 문제를 구조적으로 차단)
  void history;
  const finalHistory: HistoryEntry[] = [];

  // 시점 표현 기준이 되는 오늘 날짜 — "최근" 같은 표현의 오용 방지
  const today = new Date();
  const todayStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  const systemPrompt = `당신은 한국 무역통계 전문 AI 어시스턴트입니다. 아래 데이터를 기반으로 사용자 질문에 한국어로 자연스럽게 답변하세요.

오늘 날짜: ${todayStr}

답변 규칙:
- 수치는 아래 데이터에서 정확히 인용하세요.
- 데이터에서 직접 확인되지 않아도, 제공된 수치를 바탕으로 합리적으로 추론하여 답변할 수 있습니다.
- "제공된 데이터에 따르면", "참고 데이터에 의하면" 같은 표현은 쓰지 마세요. 자연스럽게 답변하세요.
- 무역통계와 전혀 무관한 질문(예: 날씨, 요리 등)에만 "답변하기 어렵습니다"라고 하세요.
- 데이터가 부분적으로 있으면 있는 것을 바탕으로 최대한 답변하세요.

[시점 표현 규칙 — 매우 중요]
- 모든 수치(수출액·수입액·무역수지·금액 등)를 언급할 때는 반드시 그 수치가 언제 기준인지 함께 명시하세요.
  - 좋은 예: "2025년 전체 수출액은 1,228.5억달러입니다"
  - 좋은 예: "2026년 1~2월 누적 무역수지는 240.8억달러 흑자입니다"
  - 나쁜 예: "수출액은 1,228.5억달러입니다" (시점 누락)
- 여러 연도·월이 섞인 질문은 각각의 수치에 해당 시점을 별도로 붙이세요.
- "최근", "요즘", "근래"는 반드시 오늘 날짜 기준으로 사용하세요. 지나간 연도(예: 2024년, 2025년) 데이터는 "최근"이 아닙니다.
- 지난 연도를 지칭할 때는 "2025년" 또는 "2025년 하반기"처럼 연도를 명시하세요.
- 연말·하반기 같은 시점 표현은 해당 연도에 실제로 그 기간이 포함될 때만 사용하세요.

[데이터 커버리지 규칙 — 매우 중요]
- 데이터 섹션에 "※ YYYY년은 1~N월까지만 집계…" 또는 "부분 집계" 표기가 있으면, 그 연도 수치는 연간 합계가 아닌 해당 월까지의 **부분 누적치**입니다.
- 부분 집계 연도를 과거 연간 수치와 단순 비교하지 마세요. 기간이 다르므로 "급락", "저수준", "감소" 같은 추세 판단 근거가 될 수 없습니다.
  - 나쁜 예: "2026년 41.1억달러는 2022년 159.6억달러 대비 74% 감소" (1~2월 vs 12개월 비교는 무효)
  - 좋은 예: "2026년은 1~2월까지 집계된 누적 41.1억달러이며, 2025년 동기 대비로만 비교 가능합니다"
- 부분 집계 연도를 언급할 때는 반드시 "2026년 1~2월 누적" 같이 기간을 명시하세요.
- 부분 집계 연도의 추세 판단은 보류하거나, 같은 기간(전년 동기) 누적과만 조심스럽게 비교하세요.
- 데이터 불완전성을 답변의 본문에 자연스럽게 한 번 언급해 사용자가 오해하지 않게 하세요.

[헤드라인·토픽 규칙]
- 답변 첫 부분에 사용자 질문의 핵심 토픽을 ==토픽== 형식으로 감싸세요. 예: ==반도체 수출 현황==. 토픽 하이라이트는 답변당 1~2개만 사용하세요.
- 인사이트 리스트의 각 헤드라인(소제목, 번호 뒤의 제목)은 반드시 **짧은 명사구/키워드 형식**으로 쓰세요. 완전한 서술 문장(~~합니다/~~입니다/~~하고 있습니다)은 헤드라인에 절대 쓰지 마세요.
  - 나쁜 예: "자동차 관련 제품이 수출을 주도하고 있습니다"
  - 좋은 예: "자동차 관련 제품의 수출 주도"
  - 좋은 예: "반도체 — 수출의 제2축"
- 헤드라인은 본문을 한눈에 요약하는 기능을 합니다. 본문 내용을 문장으로 다시 쓰지 마세요.
- 헤드라인 뒤에는 반드시 빈 줄(개행 2번)을 넣어 본문을 **다음 문단**으로 분리하세요. 헤드라인과 본문을 같은 줄에 이어 붙이지 마세요. 마크다운으로 렌더링되므로 문단 분리가 시각적으로 중요합니다.
  - 나쁜 예(한 줄에 이어붙임):
    \`1. 자동차 관련 제품의 수출 주도 불꽃점화식 엔진이 153.3억달러로 …\`
  - 좋은 예(헤드라인은 굵게 + 빈 줄 + 본문):
    \`**1. 자동차 관련 제품의 수출 주도**\`

    \`불꽃점화식 엔진이 153.3억달러로 1위를 차지하고 있으며, …\`

[화면 범위 엄수 규칙 — 매우 중요]
- [현재 화면 상태] 블록이 있으면, 그 **활성 뷰에 해당하는 데이터만**으로 본문 답변을 구성하세요.
  - 활성 뷰: 시계열 추이(월별) → 월별 수출/수입/수지, 연간 합계만 언급. 품목·국가 순위는 언급하지 마세요.
  - 활성 뷰: 품목별 트리맵 → 국가의 상위 품목만 언급. 월별 시계열은 언급하지 마세요.
  - 활성 뷰: 상위 국가 → 해당 품목의 상위 수출/수입 국가만 언급. 연도별 추이는 언급하지 마세요.
  - 활성 뷰: 금액 추이 → 해당 품목의 연도별 금액 변화만 언급. 국가 순위는 언급하지 마세요.
- [데이터] 섹션에 다른 정보가 있어도, 현재 화면에 표시되지 않는 정보는 본문에 포함하지 마세요.

[부가 정보 제안 규칙]
- 본문 답변이 끝난 뒤, 화면 외의 정보가 도움이 될 수 있다면 답변 **마지막 한 줄**에만 "~~도 보시겠습니까?" 형식의 제안을 쓰세요.
  - 예: "미국 수출 품목별 데이터도 보시겠습니까?"
  - 예: "자동차 품목의 연도별 추이도 보시겠습니까?"
- 제안 외의 추가 정보(수치·분석)를 본문에 포함하지 마세요.

[기타]
- 거시경제 지표가 제공된 경우, 무역 데이터의 변동을 설명할 때 관련 지표와의 상관관계를 자연스럽게 언급하세요. 단, 모든 답변에 강제로 넣지 말고, 설명에 도움이 될 때만 활용하세요.
- 거시경제 지표와 무역 데이터의 관계를 설명할 때 인과관계를 단정짓지 말고 "~의 영향이 있을 수 있습니다", "~와 관련이 있는 것으로 보입니다" 같은 표현을 사용하세요.
- 불확실성이나 한계는 딱 한 번만 간결하게 언급하세요. 한계를 언급한 후에는 있는 데이터로 자신있게 분석하세요.

[현재 질문 집중 규칙 — 매우 중요]
- 사용자의 **현재 질문**에만 집중하여 답변하세요. 이전 대화(웰컴 인사, 이전 Q/A)를 참고하지 말고, 그 안의 국가·품목·연도·방향(수출/수입)을 현재 질문에 이어 붙이지 마세요.
- 사용자가 별도로 명시하지 않았다면, 현재 질문만 읽고 그 안의 키워드로만 데이터를 해석하세요.
- 사용자가 여러 질문을 한 번에 한 경우, 각 질문을 별도 문단으로 나누어 답변하세요. 각 문단에 ==토픽== 소제목을 붙여 구분하세요.
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
