import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LogEntry {
  role: "user" | "bot";
  content: string;
}

interface PageContextInput {
  country?: string;
  productName?: string;
  productCode?: string;
  year?: string;
  month?: string;
  tradeType?: "수출" | "수입";
  view?: "timeseries" | "products" | "countries" | "trend";
  mtiDepth?: number;
}

function formatPageContext(pc?: PageContextInput): string {
  if (!pc) return "홈(전체 대시보드) — 세계 지도·전체 트리맵·거시 지표 열람 중";
  const parts: string[] = [];
  if (pc.country) parts.push(`국가 상세 페이지: ${pc.country}`);
  if (pc.productName) parts.push(`품목 상세 페이지: ${pc.productName}${pc.productCode ? ` (MTI ${pc.productCode})` : ""}`);
  if (pc.year) parts.push(`연도: ${pc.year}`);
  if (pc.month) parts.push(`월: ${pc.month}월`);
  if (pc.tradeType) parts.push(`방향: ${pc.tradeType}`);
  if (pc.view === "timeseries") parts.push("활성 뷰: 월별 시계열");
  else if (pc.view === "products") parts.push("활성 뷰: 품목별 트리맵");
  else if (pc.view === "countries") parts.push("활성 뷰: 상위 수출·수입국");
  else if (pc.view === "trend") parts.push("활성 뷰: 연도별 금액 추이");
  if (pc.mtiDepth) parts.push(`MTI 분류 깊이: ${pc.mtiDepth}단위`);
  return parts.length > 0 ? parts.join(" | ") : "홈(전체 대시보드)";
}

const FEATURES_CATALOG = `[K-STAT 대시보드 주요 기능]
- 세계 지도: 국가별 수출/수입 금액 시각화 (클릭 시 국가 상세 페이지 이동)
- 품목별 트리맵: MTI 1~6단위 분류, 드릴다운 가능
- 국가 상세 페이지(/country/[국가]): 월별 시계열, 주요 교역 품목, 수출·수입 KPI
- 품목 상세 페이지(/product/[품목]): 연도별 금액 추이, 상위 수출·수입국, 경쟁국 비교
- 거시경제 섹션: 한국·미국·중국 기준금리, PMI, BSI, EBSI, 산업생산, CPI, 브렌트유, SCFI
- 필터: 연도(2020~2026) / 월 / 수출·수입 방향
- 대화 요약 보고서 생성: PDF·이메일 발송 (유료 회원 전용)
- 챗봇 대시보드 연동: 질문에 언급된 국가·품목의 상세 페이지로 버튼 한 번에 이동`;

export async function POST(request: NextRequest) {
  let logs: LogEntry[] = [];
  let pageContext: PageContextInput | undefined;

  try {
    const body = await request.json();
    logs = body.logs ?? [];
    pageContext = body.pageContext;
  } catch {
    return NextResponse.json({ questions: null });
  }

  const userMessages = logs.filter(l => l.role === "user");
  if (userMessages.length === 0) {
    return NextResponse.json({ questions: null });
  }

  const recentUserText = userMessages.map(l => l.content).join("\n");
  const pageContextLine = formatPageContext(pageContext);
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 400,
      temperature: 0.4,
      system: `너는 K-STAT 무역통계 대시보드의 후속 질문 큐레이터다. 사용자가 우리 대시보드를 더 깊이·유의미하게 활용하도록 유도하는 고품질 후속 질문 3개를 제안한다. 오직 JSON 배열만 출력한다. 설명·코드펜스·앞뒤 텍스트·주석 금지.

${FEATURES_CATALOG}`,
      messages: [
        {
          role: "user",
          content: `[사용자 최근 질문 로그]
${recentUserText}

[사용자가 지금 보고 있는 화면]
${pageContextLine}

위 두 가지를 종합해서 후속 질문 3개를 만든다.

생성 규칙 (절대 준수):
1. 3개 질문은 **서로 다른 차원**을 다룬다. 다음 중 3개 서로 다른 유형을 섞어라:
   (a) **대시보드 심화 탐색** — 국가·품목 상세 페이지의 다른 뷰(시계열, 상위국, 연도별 추이) 전환을 자연스럽게 유도
   (b) **분석적 인사이트** — 거시경제 지표(금리·환율·PMI·유가)와 교역 변동의 관계, 추이의 원인, 경쟁국 비교
   (c) **현재 컨텍스트 확장** — 지금 보고 있는 화면에서 한 발 더 들어간 심층 질문 (홈이면 관심 분야로 좁히도록 유도)
   (d) **보고서·실무 활용** — 대화 요약 보고서, 의사결정 지원 (단, 유료 기능이므로 과도한 홍보 금지)
2. 채팅 로그에 실제로 등장한 국가/품목만 사용. 없는 국가·품목 임의 추가 금지.
3. 단순 "~는?" "~알려줘" 형태 지양. "원인은?" "어떻게 비교?" "월별로 보면?" 같이 다각도 탐색 유도.
4. 각 질문 **25자 이내**, 자연스러운 구어체, 실제 사용자가 클릭하고 싶게.
5. "~ 대시보드에서 ~ 확인하기" 같은 직접 지시형도 허용 (우리 기능을 알려주는 역할).
6. **자기완결성 필수**: 질문만 읽어도 무엇을 묻는지 알 수 있어야 한다. "추천 3개국", "그 품목", "위 국가", "방금 본 것" 같은 **지시·대용 표현 절대 금지**. 로그에 "의약품 유망국으로 미국·중국·베트남"이 있었다면 → "미국·중국·베트남 의약품 수출 비교" 처럼 **구체 엔티티를 질문에 포함**.

출력: JSON 배열만. 예) ["반도체 수출 상위국 어떻게 비교?","중국 교역과 금리의 관계는?","월별 추이로 성수기 찾기"]`,
        },
        // Prefill — Haiku 가 설명 대신 배열 리터럴부터 쓰도록 유도
        { role: "assistant", content: "[" },
      ],
    });

    const first = response.content[0];
    if (first?.type !== "text") return NextResponse.json({ questions: null });

    // prefill "[" 로 시작했으므로 응답은 '"질문1", ..., "질문3"]' 형태.
    // 방어적으로 가장 바깥 [...] 패턴도 추출 가능하도록 한다.
    const raw = first.text.trim();
    const combined = raw.startsWith("[") ? raw : `[${raw}`;
    const match = combined.match(/\[[\s\S]*?\]/);
    const jsonText = match ? match[0] : combined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      console.warn("[/api/faq] JSON parse failed. Raw:", raw, "err:", err);
      return NextResponse.json({ questions: null });
    }

    if (
      Array.isArray(parsed) &&
      parsed.length >= 3 &&
      parsed.slice(0, 3).every(q => typeof q === "string" && q.trim().length > 0)
    ) {
      return NextResponse.json({ questions: parsed.slice(0, 3) });
    }
    console.warn("[/api/faq] invalid shape:", parsed);
    return NextResponse.json({ questions: null });
  } catch (err) {
    console.error("[/api/faq] anthropic error:", err);
    return NextResponse.json({ questions: null });
  }
}
