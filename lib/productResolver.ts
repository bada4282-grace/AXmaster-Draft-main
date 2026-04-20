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

// 자주 쓰이는 동의어·통칭의 하드코딩 매핑. LLM 호출 전 사전 검사 → 안정성·속도 향상.
// 각 값은 MTI_LOOKUP 에 실제 존재하는 3 또는 4자리 코드여야 한다.
const COMMON_SYNONYMS: { keywords: string[]; code: string }[] = [
  { keywords: ["제약", "신약", "의약", "약품"], code: "2262" },           // 의약품
  { keywords: ["화장품", "뷰티"], code: "2272" },                          // 화장품 (2272: 비누치약및화장품)
  { keywords: ["자동차", "승용차", "완성차"], code: "7412" },              // 승용차
  { keywords: ["스마트폰", "휴대폰", "핸드폰"], code: "8123" },             // 이동전화기
  { keywords: ["반도체", "메모리"], code: "8311" },                       // 전자집적회로
  { keywords: ["디스플레이", "OLED", "oled", "LCD", "lcd"], code: "8361" }, // 평판디스플레이
  { keywords: ["조선", "선박", "배", "컨테이너선", "유조선"], code: "7461" }, // 선박
  { keywords: ["배터리", "이차전지"], code: "8352" },                      // 축전지
  { keywords: ["석유제품", "경유", "휘발유", "원유"], code: "133" },       // 석유제품
  { keywords: ["철강", "강판"], code: "61" },                             // 철강제품
];

function resolveBySynonymMap(question: string): ResolvedProduct[] {
  const lookup = MTI_LOOKUP as Record<string, string>;
  const matched: ResolvedProduct[] = [];
  const seen = new Set<string>();
  for (const entry of COMMON_SYNONYMS) {
    if (entry.keywords.some((kw) => question.includes(kw))) {
      if (!seen.has(entry.code) && lookup[entry.code]) {
        matched.push({ code: entry.code, name: lookup[entry.code] });
        seen.add(entry.code);
      }
    }
  }
  return matched;
}

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
  if (!question || question.trim().length === 0) return [];

  const cacheKey = question.trim();
  const cached = _resultCache.get(cacheKey);
  if (cached) return cached;

  // 1) 하드코딩된 동의어 맵 선검사 — 가장 흔한 키워드는 LLM 없이 즉시 해소
  const synonymHits = resolveBySynonymMap(question);
  if (synonymHits.length > 0) {
    _resultCache.set(cacheKey, synonymHits);
    return synonymHits;
  }

  // 2) LLM 기반 의미 매핑 (키 누락 시 폴백 없음 → 빈 배열)
  if (!process.env.ANTHROPIC_API_KEY) return [];

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
