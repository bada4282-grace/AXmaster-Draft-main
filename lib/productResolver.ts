/**
 * LLM 기반 MTI 품목 키워드 리졸버
 *
 * 규칙 기반 매칭(`extractKeywords`)이 찾지 못했거나 복합 질의에서 일부만 잡힌 경우,
 * 사용자의 자연어 표현(오타·축약·상위 개념·제품명)을
 * MTI 카탈로그의 공식 품목명으로 의미 매핑합니다.
 *
 * - 1~6자리 MTI 전체를 카탈로그로 노출 (~1,300개)
 * - 카탈로그 섹션은 prompt caching(ephemeral)으로 재사용 비용 절감
 * - 반환된 코드는 MTI_LOOKUP로 재검증 (환각 방지)
 * - 프롬프트 규칙으로 오타 교정(≤2글자 차이)·유사도(≥90%)·복합 질의 대응 강제
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
    // 1~6자리 전부 노출. 환각은 아래 프롬프트 규칙 + lookup[code] 재검증으로 차단.
    rows.push(`${code}:${name}`);
  }
  _catalogCache = rows.join("\n");
  return _catalogCache;
}

// 결과 캐시 (동일 질문 중복 호출 방지)
const _resultCache = new Map<string, { code: string; name: string }[]>();
const MAX_CACHE = 200;

// 자주 쓰이는 동의어·통칭의 하드코딩 매핑. LLM 호출 전 사전 검사 → 안정성·속도 향상.
// 각 값은 MTI_LOOKUP 에 실제 존재하는 1~6자리 코드여야 한다.
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
  // 섬유 계열 — 상위 카테고리·축약 표현 해소
  { keywords: ["섬유", "섬유류"], code: "4" },                             // 섬유류 (1자리 대분류)
  { keywords: ["합성섬유", "합섬", "인조섬유"], code: "411" },             // 인조섬유
  { keywords: ["직물", "원단"], code: "43" },                              // 직물
  { keywords: ["의류", "옷"], code: "441" },                                // 의류
  { keywords: ["원사", "섬유사", "방적사"], code: "42" },                   // 섬유사
  { keywords: ["폴리에스터", "폴리에스테르"], code: "4111" },               // 폴리에스텔섬유
  // MTI 1자리 대분류 — 카테고리성 광범위 질의 진입점 (chatContext의 하위 자동 전개가 세부 품목 노출)
  { keywords: ["농림수산물", "농수산물", "농수축산물"], code: "0" },        // 농림수산물
  { keywords: ["광산물", "광물류"], code: "1" },                            // 광산물
  { keywords: ["화학제품", "화공품", "화학공업제품"], code: "2" },           // 화학공업제품
  { keywords: ["플라스틱고무가죽"], code: "3" },                            // 플라스틱·고무·가죽제품
  { keywords: ["생활용품류"], code: "5" },                                   // 생활용품 (대분류)
  { keywords: ["철강금속", "철강금속제품", "금속제품"], code: "6" },         // 철강금속제품
  { keywords: ["기계류", "기계"], code: "7" },                              // 기계류
  { keywords: ["전자전기", "전기전자", "전자전기제품", "전기전자제품"], code: "8" }, // 전자전기제품
  { keywords: ["잡제품"], code: "9" },                                       // 잡제품
  // MTI 2자리 자주 쓰이는 통칭
  { keywords: ["농산물"], code: "01" },
  { keywords: ["축산물", "육류"], code: "02" },
  { keywords: ["임산물"], code: "03" },
  { keywords: ["수산물", "해산물"], code: "04" },
  { keywords: ["석유화학"], code: "21" },
  { keywords: ["정밀화학"], code: "22" },
  { keywords: ["플라스틱제품", "플라스틱"], code: "31" },
  { keywords: ["고무제품", "고무"], code: "32" },
  { keywords: ["가죽", "모피"], code: "33" },
  { keywords: ["비철금속"], code: "62" },
  { keywords: ["산업기계"], code: "72" },
  { keywords: ["정밀기계", "정밀기기"], code: "73" },
  { keywords: ["수송기계"], code: "74" },
  { keywords: ["산업용전자", "산업용전자제품"], code: "81" },
  { keywords: ["가전제품", "가전"], code: "82" },
  { keywords: ["전자부품"], code: "83" },
  { keywords: ["전기기기"], code: "84" },
  { keywords: ["완구", "장난감"], code: "56" },
  { keywords: ["악기"], code: "53" },
  { keywords: ["문구"], code: "55" },
  { keywords: ["공예품"], code: "57" },
  { keywords: ["의료위생", "의료용품", "위생용품"], code: "95" },
  { keywords: ["보석", "귀금속"], code: "96" },
  { keywords: ["안경", "콘택트렌즈"], code: "94" },
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
  const rules = `규칙 (반드시 준수):
1. 카탈로그에 실제로 존재하는 code만 반환합니다 (1~6자리 숫자 문자열, MTI 계층).
2. 오타 교정: 사용자 입력이 공식 품목명과 자모·음절 **2개 이하** 차이이고 의미가 명백하면 교정해 매핑합니다.
   허용 예: "이약품" → "의약품"(2262) / "반드체" → "반도체"(8311) / "자등차" → "승용차"(7412).
   금지 예: 3글자 이상 다름, 전혀 다른 분야로 추정.
3. 의미 유사성: 기능·용도·소재가 **90% 이상 동일**하다고 확신할 때만 매핑합니다.
   금지 예: "합성섬유"(411) → "합성수지"(214) — 이름 일부가 겹쳐도 분야가 다르면 매핑 금지.
4. 복합 질의: "커튼과 합성섬유" 같이 품목이 여럿이면 각각 별도 코드를 **최대 8개**까지 반환합니다.
5. 카테고리성 질의 세부 분해: "합성섬유", "전자제품", "화장품" 처럼 여러 세부 품목을 포괄하는 질의는
   **상위 카테고리 코드 1개 + 그 카테고리의 대표 세부 품목 2~4개(4자리 또는 6자리)** 를 함께 반환합니다.
   예: "합성섬유" → ["411","4111","4112","4113","4119"]
       "전자제품" → ["83","8311","8361","8123"]
6. 상위 카테고리 단독 질의: "섬유 수출"처럼 대분류만 원하면 상위 코드(예: "4" 섬유류) 1~2개만 반환합니다.
7. 일반 질문·인사·국가명만 언급된 경우, 또는 확신이 90% 미만이면 **빈 배열 []** 을 반환합니다. 추측 금지.
8. 반드시 JSON 배열만 응답하세요. 설명·주석·코드펜스 금지.
   올바른 예: ["2262"] / ["5126","411","4111","4113"] / []`;

  let text = "";
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 200,
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
