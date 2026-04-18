import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const conversationText = messages
    .map((m: { role: string; text: string }) =>
      `${m.role === "user" ? "사용자" : "AI"}: ${m.text}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `다음 대화 내용을 분석해서 무역 분석 보고서를 HTML로 만들어줘. 
HTML 코드만 반환하고 다른 설명은 하지 마.

스타일:
- 폰트: Noto Sans KR
- 보고서 제목, 생성일, 대화 요약, 주요 인사이트, 수출입 데이터 정리, 결론 순서로 구성
- K-stat 브랜드 컬러 #C41E3A 사용

대화 내용:
${conversationText}`,
      },
    ],
  });

  const html = (response.content[0] as { type: string; text: string }).text;
  return NextResponse.json({ html });
}