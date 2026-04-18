/**
 * 한국어 국가명 ↔ ISO alpha-2 매핑 (Supabase ctr_name 기준)
 * WorldMap, 국가 상세 페이지 등에서 공유
 */

export const KO_NAME_TO_ISO: Record<string, string> = {
  "중국": "CN", "미국": "US", "베트남": "VN", "일본": "JP", "홍콩": "HK",
  "대만": "TW", "싱가포르": "SG", "인도": "IN", "호주": "AU", "멕시코": "MX",
  "독일": "DE", "말레이시아": "MY", "인도네시아": "ID", "폴란드": "PL", "필리핀": "PH",
  "튀르키예": "TR", "터키": "TR",
  "캐나다": "CA", "태국": "TH", "네덜란드": "NL", "헝가리": "HU",
  "사우디아라비아": "SA", "사우디": "SA",
  "영국": "GB",
  "이탈리아": "IT", "프랑스": "FR", "스페인": "ES", "브라질": "BR",
  "러시아": "RU", "러시아연방": "RU",
  "아랍에미리트": "AE", "UAE": "AE", "아랍 에미리트": "AE", "아랍에미리트 연합": "AE",
  "이스라엘": "IL", "벨기에": "BE",
  "스위스": "CH", "스웨덴": "SE", "오스트리아": "AT", "덴마크": "DK",
  "노르웨이": "NO", "핀란드": "FI", "체코": "CZ", "루마니아": "RO",
  "남아프리카공화국": "ZA", "남아프리카": "ZA", "남아공": "ZA",
  "아르헨티나": "AR", "칠레": "CL", "콜롬비아": "CO",
  "파키스탄": "PK", "방글라데시": "BD",
  "이집트": "EG", "나이지리아": "NG",
  "카자흐스탄": "KZ", "우즈베키스탄": "UZ",
  "이란": "IR", "이라크": "IQ", "쿠웨이트": "KW", "카타르": "QA", "오만": "OM",
  "요르단": "JO", "바레인": "BH", "레바논": "LB",
  "캄보디아": "KH", "미얀마": "MM", "라오스": "LA", "스리랑카": "LK", "네팔": "NP",
  "뉴질랜드": "NZ",
  "페루": "PE", "에콰도르": "EC", "우루과이": "UY",
  "우크라이나": "UA", "포르투갈": "PT", "그리스": "GR", "불가리아": "BG",
  "크로아티아": "HR", "슬로바키아": "SK", "슬로베니아": "SI",
  "리투아니아": "LT", "라트비아": "LV", "에스토니아": "EE",
  "세르비아": "RS", "아제르바이잔": "AZ",
  "케냐": "KE", "가나": "GH", "탄자니아": "TZ", "에티오피아": "ET",
  "모로코": "MA", "튀니지": "TN", "알제리": "DZ",
  "아일랜드": "IE", "룩셈부르크": "LU", "몰타": "MT", "키프로스": "CY",
  "아이슬란드": "IS", "벨라루스": "BY", "몰도바": "MD",
  "보스니아-헤르체고비나": "BA", "보스니아헤르체고비나": "BA", "보스니아": "BA",
  "몬테네그로": "ME", "북마케도니아": "MK", "알바니아": "AL",
  "리히텐슈타인": "LI",
  "몽골": "MN", "조지아": "GE", "브루나이": "BN",
  "아프가니스탄": "AF", "부탄": "BT",
  "키르기스스탄": "KG", "키르기즈스탄": "KG",
  "타지키스탄": "TJ", "투르크메니스탄": "TM",
  "시리아": "SY", "예멘": "YE", "북한": "KP",
  "마카오": "MO", "동티모르": "TL",
  "인도(인디아)": "IN",
  "볼리비아": "BO", "파라과이": "PY", "코스타리카": "CR",
  "파나마": "PA", "쿠바": "CU", "도미니카공화국": "DO", "도미니카 공화국": "DO",
  "과테말라": "GT", "온두라스": "HN", "엘살바도르": "SV",
  "니카라과": "NI", "자메이카": "JM", "트리니다드토바고": "TT",
  "가이아나": "GY", "수리남": "SR", "베네수엘라": "VE", "아이티": "HT",
  "앙골라": "AO", "카메룬": "CM", "콩고민주공화국": "CD", "콩고": "CG",
  "코트디부아르": "CI", "세네갈": "SN", "르완다": "RW", "우간다": "UG",
  "잠비아": "ZM", "짐바브웨": "ZW", "모잠비크": "MZ", "마다가스카르": "MG",
  "수단": "SD", "남수단": "SS", "리비아": "LY", "말리": "ML",
  "보츠와나": "BW", "나미비아": "NA", "시에라리온": "SL", "소말리아": "SO",
  "파푸아뉴기니": "PG", "피지": "FJ",
  "아르메니아": "AM", "바하마": "BS", "벨리즈": "BZ",
  "베냉": "BJ", "부르키나파소": "BF", "푸에르토리코": "PR",
};

/**
 * 국가 한국어명 → ISO alpha-2 조회. 매핑에 없는 국가는 null.
 */
export function resolveCountryIso(name: string | null | undefined): string | null {
  if (!name) return null;
  return KO_NAME_TO_ISO[name] ?? null;
}

/**
 * ISO alpha-2 코드를 국기 이모지로 변환 (예: "KR" → "🇰🇷").
 * 매핑에 없는 코드는 빈 문자열 반환.
 */
export function isoToFlagEmoji(iso: string | null | undefined): string {
  if (!iso || iso.length !== 2 || iso === "??") return "";
  const upper = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const codePoints = upper
    .split("")
    .map((c) => 0x1f1e6 + c.charCodeAt(0) - "A".charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * 국가명 직접 입력 → 국기 이모지 (없으면 빈 문자열).
 */
export function countryNameToFlag(name: string | null | undefined): string {
  return isoToFlagEmoji(resolveCountryIso(name));
}
