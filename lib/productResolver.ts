/**
 * LLM 기반 MTI 품목 키워드 리졸버
 *
 * 규칙 기반 매칭(`extractKeywords`)이 찾지 못한 경우 호출되어,
 * 사용자의 자연어 표현("제약", "신약", "자동차 부품" 등)을
 * MTI 카탈로그의 공식 품목명으로 의미 매핑합니다.
 *
 * - 3+4자리 MTI 코드를 프롬프트 카탈로그로 사용 (~890개, ~9KB)
 * - 카탈로그 섹션은 prompt caching(ephemeral)으로 재사용 비용 절감
 * - 반환된 코드는 MTI_LOOKUP로 재검증 (환각 방지)
 */
import Anthropic from "@anthropic-ai/sdk";
import { MTI_LOOKUP } from "@/lib/data";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let _catalogCache: string | null = null;
function buildCatalog(): string {
  if (_catalogCache) return _catalogCache;
  const lookup = MTI_LOOKUP as Record<string, string>;
  const rows: string[] = [];
  for (const [code, name] of Object.entries(lookup)) {
    if (code.length === 3 || code.length === 4) {
      rows.push(`${code}:${name}`);
    }
  }
  _catalogCache = rows.join("\n");
  return _catalogCache;
}

// 결과 캐시 (동일 질문 중복 호출 방지)
const _resultCache = new Map<string, { code: string; name: string }[]>();
const MAX_CACHE = 200;

export interface ResolvedProduct {
  code: string;
  name: string;
}

/**
 * 사용자 질문에서 언급된 품목을 MTI 코드로 의미 매핑합니다.
 * 환경변수(ANTHROPIC_API_KEY) 미설정 / 오류 시 빈 배열.
 */
export async function resolveProductCodesViaLLM(
  question: string,
): Promise<ResolvedProduct[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  if (!question || question.trim().length === 0) return [];

  const cacheKey = question.trim();
  const cached = _resultCache.get(cacheKey);
  if (cached) return cached;

  const catalog = buildCatalog();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const header =
    "당신은 한국 MTI(품목 분류) 코드 매퍼입니다. 사용자 질문에서 언급된 품목을, 주어진 MTI 카탈로그의 코드로 매핑하세요.";
  const rules = `규칙:
- 사용자가 동의어/유사어/상위 개념/제품명으로 표현해도 의미가 일치하는 코드를 선택합니다.
  예: "제약", "약", "신약" → "의약품" / "자동차" → "승용차" / "스마트폰" → "무선전화기" / "반도체" → "전자집적회로" 등.
- 카탈로그에 실제로 존재하는 code만 반환합니다 (code는 3자리 또는 4자리 숫자 문자열).
- 의미가 일치하는 가장 적합한 1~3개만 선택합니다. 일반 질문·인사·국가명만 언급된 경우 빈 배열을 반환합니다.
- 반드시 JSON 배열만 응답하세요. 설명·주석·코드펜스 금지.
  올바른 예: ["2262"]
  올바른 예(없음): []`;

  let text = "";
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 80,
      temperature: 0,
      system: [
        { type: "text", text: header },
        {
          type: "text",
          text: `[MTI 카탈로그 — code:name]\n${catalog}\n\n${rules}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: question }],
    });
    text = resp.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
  } catch (err) {
    console.error("[productResolver] Anthropic error:", err);
    return [];
  }

  // JSON 배열 추출
  let codes: string[] = [];
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        codes = parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* malformed JSON — 빈 배열 */
    }
  }

  const lookup = MTI_LOOKUP as Record<string, string>;
  const result: ResolvedProduct[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) continue;
    if (lookup[c]) {
      result.push({ code: c, name: lookup[c] });
      seen.add(c);
    }
  }

  if (_resultCache.size > MAX_CACHE) {
    const firstKey = _resultCache.keys().next().value;
    if (firstKey !== undefined) _resultCache.delete(firstKey);
  }
  _resultCache.set(cacheKey, result);
  return result;
}
