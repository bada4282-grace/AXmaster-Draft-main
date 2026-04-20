import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getTierFromRequest } from "@/lib/authServer";

const client = new Anthropic();

const LOGO_URL = `${process.env.NEXT_PUBLIC_SITE_URL}/h1_logo_og.jpg`;

const REPORT_SYSTEM_PROMPT = `# 역할 (Role)
너는 20년차 시니어 이메일 디자이너이자 HTML 마크업 전문가야.
Gmail·Outlook·Apple Mail·Naver Mail 전 클라이언트 호환성을 최우선으로 고려해서,
inline CSS 기반의 table-layout HTML 이메일을 작성한다.

# 작업 (Task)
아래에 제공되는 [대화 내용]을 분석해서,
지정된 HTML 템플릿의 {{변수}} 자리를 실제 내용으로 채워 넣어
완성된 KITA 브랜드 대화 요약 보고서 이메일을 출력해.

# 입력 (Input)
- [수신자명]: 보고서를 받을 사람의 이름
- [대화 내용]: 오늘 Claude와 사용자가 나눈 채팅 원문 또는 요지
- [발신자 정보]: 이름, 소속, 연락처, 이메일 (없으면 placeholder 유지)

# 로고 처리 규칙
img src는 반드시 [로고 URL]에서 제공된 절대 URL을 사용할 것. 상대경로(/h1_logo_og.jpg 등) 절대 사용 금지.

# 디자인 규칙

## 1. 키컬러 시스템 (2색 한정)
- 메인 (헤더/제목/강조): 딥 네이비 #1A237E
- 액센트 (그라데이션 바/보더/링크): 시안 #00BCD4
- 액센트 텍스트: 다크 시안 #00838F
- 본문: #37474F, 부가 본문: #455A64, 서브 텍스트: #78909C
- 배경: #F5F7FA, 카드: #FFFFFF, 인포박스: #F8F9FC, 액션박스: #E0F7FA, 구분선: #ECEFF1
⚠️ 핑크/퍼플/그린/오렌지 등 추가 컬러 사용 금지. 모든 섹션 제목은 네이비(#1A237E)로 통일.
③ 결론 및 액션 아이템 섹션 제목만 시안 텍스트(#00838F) 허용.

## 2. 구조 원칙
- 최대 너비 600px 중앙 정렬 카드 레이아웃
- 상단 5px / 하단 4px 네이비→시안 그라데이션 바
- 섹션별 넘버링(①②③④)
- 논리 흐름: 헤더(로고+날짜라벨) → 인사말 → 메타정보 → 핵심요약 → 주요논의 → 액션아이템 → 참고사항 → 서명
- 모든 CSS는 inline style로만 작성
- 레이아웃은 table 기반
- 한글 폰트 스택: 'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',Arial,sans-serif

## 3. 헤더 라인 규칙
- 좌측: K-stat 로고 이미지
- 우측: {{날짜라벨}} = YYYY.MM.DD · 대화주제기반_부제(한국어 8-15자)
- 예시: 2026.04.18 · 무역통계 일일 브리핑
- "DAILY CONVERSATION REPORT" 같은 영문 라벨 사용 금지

## 4. 콘텐츠 톤
- 간결하고 정중한 비즈니스 한국어
- 불릿포인트는 ul/li 사용
- 핵심요약은 두괄식

# HTML 템플릿

<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>KITA 대화 요약 보고서</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F7FA;font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F7FA;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(26,35,126,0.08);">
          <tr>
            <td style="height:5px;background:linear-gradient(90deg,#1A237E 0%,#00BCD4 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px 40px 22px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle" style="font-size:0;line-height:0;">
                    <img src="{{로고URL}}" alt="KITA" width="100" style="display:inline-block;border:0;outline:none;max-width:100px;height:auto;vertical-align:middle;">
                  </td>
                  <td align="right" valign="middle" style="font-size:11px;color:#78909C;letter-spacing:0.5px;font-weight:500;line-height:1;">
                    {{날짜라벨}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#ECEFF1;font-size:0;line-height:0;">&nbsp;</div></td></tr>
          <tr>
            <td style="padding:28px 40px 16px 40px;">
              <p style="margin:0;font-size:17px;color:#1A237E;font-weight:700;">{{수신자}}님, 안녕하세요</p>
              <p style="margin:10px 0 0 0;font-size:14px;color:#455A64;line-height:1.7;">오늘 진행된 대화 내용을 요약한 보고서를 발송드립니다.<br>아래 내용을 확인해 주시기 바랍니다.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 40px 24px 40px;">
              <table width="100%" cellpadding="14" cellspacing="0" border="0" style="background-color:#F8F9FC;border-left:4px solid #00BCD4;border-radius:4px;">
                <tr>
                  <td style="font-size:13px;color:#546E7A;line-height:1.9;">
                    <strong style="color:#1A237E;">📅 대화 일시</strong>ㆍ{{대화날짜}}<br>
                    <strong style="color:#1A237E;">💬 주요 주제</strong>ㆍ{{대화주제}}<br>
                    <strong style="color:#1A237E;">👥 참여자</strong>ㆍ{{참여자}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 20px 40px;">
              <h2 style="margin:0;font-size:18px;color:#1A237E;font-weight:700;border-bottom:2px solid #1A237E;padding-bottom:12px;letter-spacing:-0.3px;">📋 대화 내용 보고서</h2>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 8px 40px;">
              <h3 style="margin:0 0 10px 0;font-size:15px;color:#1A237E;font-weight:700;">① 핵심 요약</h3>
              <p style="margin:0;font-size:14px;color:#37474F;line-height:1.75;">{{핵심요약내용}}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 8px 40px;">
              <h3 style="margin:0 0 10px 0;font-size:15px;color:#1A237E;font-weight:700;">② 주요 논의 사항</h3>
              <ul style="margin:0;padding-left:20px;font-size:14px;color:#37474F;line-height:1.85;">{{주요논의리스트_li태그들}}</ul>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 8px 40px;">
              <h3 style="margin:0 0 10px 0;font-size:15px;color:#00838F;font-weight:700;">③ 결론 및 액션 아이템</h3>
              <table width="100%" cellpadding="16" cellspacing="0" border="0" style="background-color:#E0F7FA;border-left:4px solid #00BCD4;border-radius:4px;">
                <tr><td style="font-size:14px;color:#37474F;line-height:1.85;">{{액션아이템}}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px 40px;">
              <h3 style="margin:0 0 10px 0;font-size:15px;color:#1A237E;font-weight:700;">④ 추가 참고사항</h3>
              <p style="margin:0;font-size:14px;color:#37474F;line-height:1.75;">{{추가메모}}</p>
            </td>
          </tr>
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#ECEFF1;font-size:0;line-height:0;">&nbsp;</div></td></tr>
          <tr>
            <td style="padding:24px 40px 32px 40px;">
              <p style="margin:0;font-size:12px;color:#90A4AE;line-height:1.6;">본 보고서는 AI 기반 대화 요약 시스템으로 자동 생성되었습니다.<br>문의사항은 언제든 회신 부탁드립니다.</p>
              <p style="margin:18px 0 0 0;font-size:13px;color:#37474F;line-height:1.7;">
                <strong style="color:#1A237E;">Best Regards,</strong><br>
                K-stat AI 어시스턴트<br>한국무역협회 Trade AX 팀<br>Tel. 02-6000-5454<br>
                Email. <a href="mailto:tradeax@kita.net" style="color:#00838F;text-decoration:none;border-bottom:1px solid #00BCD4;">tradeax@kita.net</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#1A237E 0%,#00BCD4 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td align="center" style="padding:20px 20px;font-size:11px;color:#B0BEC5;">© KITA Trade AX Master Program. All rights reserved.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>

# 변수 매핑 규칙
- {{로고URL}}: 반드시 [로고 URL]로 제공된 절대 URL 그대로 사용
- {{날짜라벨}}: 반드시 [오늘 날짜(dot)]을 사용 + " · " + 한국어 부제 8-15자 (예: 2026.04.18 · 무역통계 일일 브리핑)
- {{수신자}}: 수신자 이름 (알 수 없으면 "고객")
- {{대화날짜}}: 반드시 [오늘 날짜]를 그대로 사용 (절대 임의 날짜 금지)
- {{대화주제}}: 대화 전체 1줄 주제
- {{참여자}}: 예) "사용자, K-stat AI"
- {{핵심요약내용}}: 3~4문장 두괄식 요약
- {{주요논의리스트_li태그들}}: li 태그 3~6개
- {{액션아이템}}: 향후 할 일, ☑️ 이모지 + 항목 간 br 줄바꿈
- {{추가메모}}: 없으면 "해당 없음"
- {{발신자명}}, {{소속}}, {{연락처}}, {{이메일}}: 미제공 시 placeholder 유지

# 출력 지시사항
1. 모든 {{변수}}를 실제 내용으로 치환한 완성된 HTML만 출력.
2. 코드블록 없이 순수 HTML만 반환 (마크다운 불필요).
3. 민감정보(API 키, 개인정보 등)는 자동 마스킹.
4. {{로고URL}}은 반드시 [로고 URL]의 절대 URL로 치환할 것. 상대경로 절대 사용 금지.`;

export async function POST(req: NextRequest) {
  // 유료 회원 전용: tier 검증 (클라이언트 우회 방지용 서버 측 방어)
  const tier = await getTierFromRequest(req);
  if (tier !== "paid") {
    return NextResponse.json(
      { error: "대화 요약 보고서는 유료 회원 전용 기능입니다." },
      { status: 403 },
    );
  }

  const { messages, userName } = await req.json();

  const conversationText = messages
    .map((m: { role: string; text: string }) =>
      `${m.role === "user" ? "사용자" : "AI"}: ${m.text}`
    )
    .join("\n");

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const todayFormatted = `${yyyy}년 ${mm}월 ${dd}일 (${dayNames[now.getDay()]})`;
  const todayDot = `${yyyy}.${mm}.${dd}`;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4000,
    system: REPORT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `[로고 URL]: ${LOGO_URL}
[수신자명]: ${userName ?? "고객"}
[오늘 날짜]: ${todayFormatted}
[오늘 날짜(dot)]: ${todayDot}
[대화 내용]
${conversationText}`,
      },
    ],
  });

  const html = (response.content[0] as { type: string; text: string }).text;
  return NextResponse.json({ html });
}