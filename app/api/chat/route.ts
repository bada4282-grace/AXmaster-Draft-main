import { NextResponse } from "next/server";
import {
  fetchCountryProducts,
  fetchAllProducts,
  fetchCountryRanking,
  formatProductRows,
  formatCountryRows,
} from "@/lib/supabaseServer";

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  context?: string;
  country?: string;
  product?: string;
  year?: string;
}

interface OpenAIErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

interface OpenAIChatCompletionBody {
  choices?: Array<{ message?: { content?: string } }>;
}

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/** Supabase CTR_NAME 컬럼에 실재하는 주요 국가 목록 */
const KNOWN_COUNTRIES = [
  "미국","중국","일본","독일","베트남","홍콩","대만","싱가포르","인도","호주",
  "사우디아라비아","아랍에미리트","말레이시아","태국","인도네시아","멕시코","캐나다",
  "영국","프랑스","이탈리아","네덜란드","스페인","러시아","브라질","폴란드",
  "헝가리","체코","벨기에","스위스","터키","이란","이라크","쿠웨이트","카타르",
  "이스라엘","남아프리카공화국","나이지리아","이집트","필리핀","캄보디아",
  "방글라데시","파키스탄","스리랑카","뉴질랜드","칠레","아르헨티나","콜롬비아",
  "페루","카자흐스탄","우즈베키스탄","우크라이나","포르투갈","스웨덴","노르웨이",
  "덴마크","핀란드","오스트리아","그리스","루마니아","불가리아","크로아티아",
];

/** 주요 MTI 품목명 */
const KNOWN_PRODUCTS = [
  "반도체","자동차","석유제품","선박","철강","화학제품","기계류","전자부품",
  "무선통신기기","평판디스플레이","컴퓨터","가전제품","석유화학","의약품",
  "섬유류","의류","신발","식품","농산물","수산물","광산물","곡실류","석탄",
  "원유","천연가스","플라스틱","고무","종이","목재","유리","도자기","금속",
  "전기기기","정밀기기","광학기기","항공기","철도차량","자동차부품",
];

/** 사용자 메시지에서 수입/수출 모드 감지 */
function detectMode(text: string): "export" | "import" {
  if (text.includes("수입")) return "import";
  return "export";
}

/** 사용자 메시지에서 국가·품목 키워드 추출 */
function extractKeywords(messages: ChatMessage[], country?: string, product?: string) {
  if (country && product) return { country, product };
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return {
    country: country ?? KNOWN_COUNTRIES.find((c) => lastUser.includes(c)),
    product: product ?? KNOWN_PRODUCTS.find((p) => lastUser.includes(p)),
    text: lastUser,
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await req.json() as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "요청 본문(JSON)이 올바르지 않습니다." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages가 비어 있습니다." }, { status: 400 });
  }

  const { country, product, text } = extractKeywords(body.messages, body.country, body.product);
  const mode = detectMode(text ?? "");
  const modeLabel = mode === "import" ? "수입" : "수출";
  const year = body.year;

  console.log(`[chat/route] country=${country ?? "none"} product=${product ?? "none"} year=${year ?? "none"} mode=${mode}`);

  // ── Supabase RPC로 관련 데이터 조회 ────────────────────────────────────────
  let tradeDataBlock = "";
  try {
    const blocks: string[] = [];

    if (country) {
      // 특정 국가의 품목별 집계
      const rows = await fetchCountryProducts({ country, year, mode, limit: 10 });
      const formatted = formatProductRows(rows, `${country} ${modeLabel} 상위품목`);
      if (formatted) blocks.push(formatted);
    } else if (product) {
      // 특정 품목의 전체 집계
      const rows = await fetchAllProducts({ year, mode, limit: 15 });
      const formatted = formatProductRows(rows, `전체 ${modeLabel} 품목순위`);
      if (formatted) blocks.push(formatted);
    } else {
      // 국가 순위 + 전체 품목 순위 병렬 조회
      const [cRows, pRows] = await Promise.all([
        fetchCountryRanking({ year, mode, limit: 15 }),
        fetchAllProducts({ year, mode, limit: 10 }),
      ]);
      const cf = formatCountryRows(cRows, `${modeLabel} 국가순위`);
      const pf = formatProductRows(pRows, `${modeLabel} 품목순위`);
      if (cf) blocks.push(cf);
      if (pf) blocks.push(pf);
    }

    if (blocks.length > 0) {
      tradeDataBlock = `\n\n아래는 Supabase에서 조회한 실제 무역 데이터다. 반드시 이 데이터를 기반으로 답하라:\n\`\`\`\n${blocks.join("\n\n")}\n\`\`\``;
    }

    console.log(`[chat/route] tradeDataBlock length: ${tradeDataBlock.length}`);
  } catch (e) {
    console.error("[chat/route] Supabase error:", e instanceof Error ? e.message : e);
  }

  // ── 시스템 프롬프트 구성 ─────────────────────────────────────────────────
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const systemPrompt = [
    "너는 대한민국 무역통계 대시보드(K-stat)를 돕는 AI 어시스턴트다.",
    "수출입 금액 단위는 억 달러(USD)이며, 간결·정확하게 한국어로 답하라.",
    "제공된 데이터에 없는 내용은 '데이터가 없습니다'라고 답하고 임의로 추측하지 마라.",
    body.context ? `현재 페이지 문맥: ${body.context}` : "",
    tradeDataBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const chatMessages: Array<{ role: "system" | "assistant" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...body.messages.map((msg) => ({
      role: msg.role as "assistant" | "user",
      content: msg.content,
    })),
  ];

  // ── OpenAI 호출 ─────────────────────────────────────────────────────────
  try {
    const openaiRes = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: chatMessages, temperature: 0.3 }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json() as OpenAIErrorBody;
      return NextResponse.json(
        { error: err.error?.message ?? "OpenAI API 호출에 실패했습니다." },
        { status: openaiRes.status },
      );
    }

    const openaiData = await openaiRes.json() as OpenAIChatCompletionBody;
    const reply = openaiData.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json({ error: "LLM 응답 텍스트를 찾지 못했습니다." }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "OpenAI API 통신 중 오류가 발생했습니다." }, { status: 500 });
  }
}
