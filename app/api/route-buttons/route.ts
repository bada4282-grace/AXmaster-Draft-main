import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MTI_LOOKUP } from "@/lib/data";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ButtonSpec {
  type: "country" | "product" | "home";
  name?: string;
  trade?: "export" | "import";
}

export async function POST(request: NextRequest) {
  let question: string;
  let answer: string;

  try {
    const body = await request.json();
    question = body.question ?? "";
    answer = body.answer ?? "";
  } catch {
    return NextResponse.json({ buttons: [] });
  }

  if (!question.trim() || !answer.trim()) {
    return NextResponse.json({ buttons: [] });
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `K-STAT 무역통계 챗봇 대화를 분석하여 대시보드 바로가기 버튼을 생성합니다.

<question>${question}</question>

위 질문만 분석하세요. 답변 내용은 무시하세요.

사용자가 질문에서 명시적으로 요청한 항목만 추출하세요:
- 국가 페이지: {"type":"country","name":"국가명","trade":"export 또는 import"}
- 품목 페이지: {"type":"product","name":"실제 품목명"}
- 메인 대시보드: {"type":"home"}

핵심 규칙:
1. 질문에 명시된 것만. 추론/추천 금지
2. "대중국 수출" → {"type":"country","name":"중국","trade":"export"}
3. "대미국 수입" → {"type":"country","name":"미국","trade":"import"}
4. "중국이 수출을 많이 한 품목" → {"type":"country","name":"중국","trade":"export"} (국가 페이지에서 품목 확인)
5. "반도체 세부 항목" → {"type":"product","name":"반도체"}
6. "무역수지", "전체", "총" → {"type":"home"}
7. product의 name은 반드시 실제 무역 품목명이어야 함 (반도체, 자동차, 석유제품 등). "중국 수출 품목" 같은 설명문은 품목명이 아님 — 절대 사용 금지
8. "수출입" 또는 방향 미지정 → export
9. 질문에 없는 국가/품목 절대 생성 금지
10. 최대 4개

JSON 배열만 출력:
[{"type":"...","name":"...","trade":"..."}]`,
        },
      ],
    });

    const first = response.content[0];
    if (first?.type !== "text") return NextResponse.json({ buttons: [] });

    const jsonMatch = first.text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return NextResponse.json({ buttons: [] });

    let parsed: ButtonSpec[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ buttons: [] });
    }
    if (!Array.isArray(parsed)) return NextResponse.json({ buttons: [] });

    // 구조화된 데이터 → 안전한 버튼으로 변환
    const buttons = parsed
      .filter((b): b is ButtonSpec => !!b.type)
      .slice(0, 4)
      .map((b) => {
        if (b.type === "country" && b.name) {
          const tradeLabel = b.trade === "import" ? "수입" : "수출";
          const mode = b.trade === "import" ? "import" : "export";
          return {
            label: `${b.name} ${tradeLabel} 데이터 확인하기`,
            href: `/country/${encodeURIComponent(b.name)}?mode=${mode}`,
            type: "exact" as const,
          };
        }
        if (b.type === "product" && b.name) {
          // MTI_LOOKUP에서 이름→코드 역조회 (4자리 우선)
          const mti = MTI_LOOKUP as Record<string, string>;
          let bestCode = "";
          for (const [c, n] of Object.entries(mti)) {
            if (n === b.name) {
              if (!bestCode || c.length === 4 || (c.length < bestCode.length && bestCode.length !== 4)) {
                bestCode = c;
              }
            }
          }
          // 실제 MTI에 존재하지 않는 품목명이면 버튼 생성 안 함
          if (!bestCode) return null;
          return {
            label: `${b.name} 데이터 확인하기`,
            href: `/product/${encodeURIComponent(b.name)}?code=${bestCode}`,
            type: "exact" as const,
          };
        }
        if (b.type === "home") {
          return {
            label: "전체 무역 현황 대시보드",
            href: "/",
            type: "exact" as const,
          };
        }
        return null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    return NextResponse.json({ buttons });
  } catch {
    return NextResponse.json({ buttons: [] });
  }
}
