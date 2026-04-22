import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MTI_LOOKUP } from "@/lib/data";
import type { PageContext } from "@/lib/chatContext";
import { COMMON_SYNONYMS } from "@/lib/productResolver";

// 사용자/LLM이 던지는 자연어 품목명("합성섬유")을 MTI 공식명("인조섬유")으로 정규화.
// 1순위: MTI_LOOKUP 값 직접 매칭 → 2순위: COMMON_SYNONYMS 동의어 역매핑.
function resolveProductNameToMti(name: string): { code: string; officialName: string } | null {
  const lookup = MTI_LOOKUP as Record<string, string>;
  // 1순위: MTI 공식명 직접 매칭 (4자리 우선)
  let bestCode = "";
  for (const [c, n] of Object.entries(lookup)) {
    if (n === name) {
      if (!bestCode || c.length === 4 || (c.length < bestCode.length && bestCode.length !== 4)) {
        bestCode = c;
      }
    }
  }
  if (bestCode) return { code: bestCode, officialName: lookup[bestCode] };
  // 2순위: 동의어 맵에서 키워드 포함 여부 검사 (자동차 → 741 등)
  for (const entry of COMMON_SYNONYMS) {
    if (entry.keywords.some((kw) => name.includes(kw)) && lookup[entry.code]) {
      return { code: entry.code, officialName: lookup[entry.code] };
    }
  }
  return null;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ButtonSpec {
  type: "country" | "product" | "home";
  name?: string;
  trade?: "export" | "import";
  /** 국가: "products" | "timeseries" · 품목: "trend" | "countries" */
  tab?: "products" | "timeseries" | "trend" | "countries";
}

function summarizePageContext(pc: PageContext | undefined | null): string {
  if (!pc) return "없음";
  const parts: string[] = [];
  if (pc.country) parts.push(`국가=${pc.country}`);
  if (pc.productName) parts.push(`품목=${pc.productName}`);
  if (pc.year) parts.push(`연도=${pc.year}`);
  if (pc.tradeType) parts.push(`방향=${pc.tradeType}`);
  if (pc.view) parts.push(`현재 뷰=${pc.view}`);
  return parts.length ? parts.join(", ") : "없음";
}

export async function POST(request: NextRequest) {
  let question: string;
  let answer: string;
  let pageContext: PageContext | undefined;

  try {
    const body = await request.json();
    question = body.question ?? "";
    answer = body.answer ?? "";
    pageContext = body.pageContext;
  } catch {
    return NextResponse.json({ buttons: [] });
  }

  if (!question.trim() || !answer.trim()) {
    return NextResponse.json({ buttons: [] });
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
  const pageSummary = summarizePageContext(pageContext);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `K-STAT 무역통계 챗봇 대화를 분석하여 대시보드 바로가기 버튼을 생성합니다.

<current_page>${pageSummary}</current_page>
<question>${question}</question>
<answer>${answer}</answer>

버튼 선택 우선순위(위에서부터 먼저 걸리는 것을 선택):

**1순위: 답변 마지막의 "~~도 보시겠습니까?" / "~~도 확인해볼까요?" 제안 파싱 (최우선)**
답변 마지막 문장이 추가 정보를 제안하면 그 대상을 정확히 추출하여 버튼 생성.
- 예: "OLED의 국가별 수출 상세도 보시겠습니까?" → {"type":"product","name":"OLED","trade":"export","tab":"countries"}
- 예: "미국의 월별 시계열도 보시겠습니까?" → {"type":"country","name":"미국","trade":"export","tab":"timeseries"}
- 예: "반도체의 연도별 추이도 보시겠습니까?" → {"type":"product","name":"반도체","tab":"trend"}

**2순위: 현재 페이지의 "다른 탭" 제안 (화면/대시보드 관련 질문일 때)**
current_page가 있고 질문이 "화면", "대시보드", "여기"를 언급하면, 현재 페이지의 다른 탭을 1~2개 제안:
- 현재 품목 페이지의 trend 뷰 → 같은 품목의 countries 탭("상위 국가") 제안
- 현재 품목 페이지의 countries 뷰 → 같은 품목의 trend 탭("금액 추이") 제안
- 현재 국가 페이지의 products 뷰 → 같은 국가의 timeseries 탭("시계열 추이") 제안
- 현재 국가 페이지의 timeseries 뷰 → 같은 국가의 products 탭("품목별 트리맵") 제안

**3순위: 질문에 명시된 국가·품목 기반 버튼**
질문에 특정 국가/품목이 명시된 경우 해당 페이지 버튼.
- "대중국 수출" → {"type":"country","name":"중국","trade":"export"}
- "대미국 수입" → {"type":"country","name":"미국","trade":"import"}
- "반도체 세부 항목" → {"type":"product","name":"반도체"}

**4순위: 무역수지·전체 현황 질문 → 메인 대시보드**
- "무역수지", "전체 현황" → {"type":"home"}

**구조 (JSON 객체)**
- 국가: {"type":"country","name":"국가명","trade":"export" 또는 "import","tab":"products" | "timeseries"}
- 품목: {"type":"product","name":"실제 품목명","tab":"trend" | "countries","trade":"export" | "import"}
- 홈: {"type":"home"}

**핵심 규칙**
1. **1순위 제안이 있으면 그것만 생성하고 나머지는 생략**. 사용자가 이미 구체적 제안을 받았으니 추가 버튼은 혼란만 유발.
2. product의 name은 반드시 실제 무역 품목명(반도체, 자동차, OLED, 석유제품 등). "OLED 국가별 수출 상세" 같은 설명문은 불가.
3. "수출입"·방향 미지정 → "export"
4. tab 필드가 없으면 해당 페이지의 기본 탭으로 간주(국가→products, 품목→trend)
5. 현재 페이지와 **완전히 동일한** 버튼은 생성하지 마세요 (같은 페이지에서 정확히 같은 탭 반복 금지)
6. 최대 3개

JSON 배열만 출력:
[{"type":"...","name":"...","trade":"...","tab":"..."}]`,
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

    // 현재 페이지와 완전 동일한 버튼은 필터링
    const isSameAsCurrent = (b: ButtonSpec): boolean => {
      if (!pageContext) return false;
      if (b.type === "country" && pageContext.country === b.name) {
        const sameTrade =
          (b.trade === "export" && pageContext.tradeType === "수출") ||
          (b.trade === "import" && pageContext.tradeType === "수입");
        const sameTab =
          (b.tab ?? "products") === (pageContext.view === "timeseries" ? "timeseries" : "products");
        return sameTrade && sameTab;
      }
      if (b.type === "product" && pageContext.productName === b.name) {
        const sameTab =
          (b.tab ?? "trend") === (pageContext.view === "countries" ? "countries" : "trend");
        return sameTab;
      }
      return false;
    };

    const buttons = parsed
      .filter((b): b is ButtonSpec => !!b.type)
      .filter((b) => !isSameAsCurrent(b))
      .slice(0, 3)
      .map((b) => {
        if (b.type === "country" && b.name) {
          const tradeLabel = b.trade === "import" ? "수입" : "수출";
          const mode = b.trade === "import" ? "import" : "export";
          const tab = b.tab === "timeseries" ? "timeseries" : "";
          const params = new URLSearchParams({ mode });
          if (tab) params.set("tab", tab);
          const suffix = tab === "timeseries" ? " 월별 시계열" : " 데이터 확인하기";
          return {
            label: `${b.name} ${tradeLabel}${suffix}`,
            href: `/country/${encodeURIComponent(b.name)}?${params.toString()}`,
            type: "exact" as const,
          };
        }
        if (b.type === "product" && b.name) {
          // 자연어 품목명("합성섬유") → MTI 공식명+코드("인조섬유", 411) 로 정규화
          const resolved = resolveProductNameToMti(b.name);
          if (!resolved) return null;
          const params = new URLSearchParams({ code: resolved.code });
          const tab = b.tab === "countries" ? "countries" : "";
          if (tab) params.set("tab", tab);
          // 질문이 수입 맥락이면 품목 상세 페이지도 수입 뷰로 진입하도록 mode 전달
          if (b.trade === "import") params.set("mode", "import");
          const tradeLabel = b.trade === "import" ? "수입" : "";
          const labelSuffix = tab === "countries" ? " 상위 국가" : " 데이터 확인하기";
          return {
            label: `${resolved.officialName}${tradeLabel ? ` ${tradeLabel}` : ""}${labelSuffix}`,
            href: `/product/${encodeURIComponent(resolved.officialName)}?${params.toString()}`,
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
