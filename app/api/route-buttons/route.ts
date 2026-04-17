import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `아래는 K-STAT 무역통계 대시보드의 챗봇 대화입니다.

<question>${question}</question>
<answer>${answer}</answer>

이 대화 내용을 분석하여, 사용자가 대시보드에서 확인하면 좋을 페이지 링크 버튼을 생성하세요.

가능한 버튼 유형:
1. 국가 상세: {"label": "{국가} {수출|수입} 데이터 확인하기", "href": "/country/{국가명}", "mode": "export|import"}
2. 품목 상세: {"label": "{품목} 데이터 확인하기", "href": "/product/{품목명}", "code": "MTI코드(선택)"}
3. 메인 대시보드: {"label": "전체 무역 현황 대시보드", "href": "/"}

규칙:
- 답변에서 실제로 언급된 국가/품목만 버튼 생성
- 국가별로 수출인지 수입인지 답변 내용에서 정확히 판단
- "무역수지"는 품목이 아님 — 메인 대시보드 버튼으로 제공
- 최대 4개까지
- 답변과 무관한 버튼 생성 금지

출력 형식 (JSON 배열만, 다른 텍스트 없이):
[{"label": "...", "href": "..."}]`,
        },
      ],
    });

    const first = response.content[0];
    if (first?.type !== "text") return NextResponse.json({ buttons: [] });

    // JSON 배열 추출 (마크다운 코드블록 안에 있을 수 있음)
    const jsonMatch = first.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ buttons: [] });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return NextResponse.json({ buttons: [] });

    const buttons = parsed
      .filter((b: { label?: string; href?: string }) => b.label && b.href)
      .map((b: { label: string; href: string; mode?: string; code?: string }) => {
        let href = b.href;
        const params = new URLSearchParams();
        if (b.mode === "import") params.set("mode", "import");
        if (b.code) params.set("code", b.code);
        const qs = params.toString();
        if (qs) href += (href.includes("?") ? "&" : "?") + qs;
        return { label: b.label, href, type: "exact" as const };
      })
      .slice(0, 4);

    return NextResponse.json({ buttons });
  } catch {
    return NextResponse.json({ buttons: [] });
  }
}
