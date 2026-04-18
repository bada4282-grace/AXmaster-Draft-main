import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { to, messages } = await req.json();

  const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
        h1 { font-size: 22px; border-bottom: 2px solid #C41E3A; padding-bottom: 10px; }
        .msg-user { background: #f5f5f5; padding: 10px 14px; border-radius: 8px; margin: 8px 0; }
        .msg-bot { padding: 10px 14px; margin: 8px 0; }
        .label { font-size: 11px; color: #999; margin-bottom: 4px; }
      </style>
    </head>
    <body>
      <h1>K-stat 무역 분석 보고서</h1>
      <p style="color:#999; font-size:13px;">생성일: ${new Date().toLocaleDateString('ko-KR')}</p>
      ${messages.map((m: { role: string; text: string }) => `
        <div class="${m.role === 'user' ? 'msg-user' : 'msg-bot'}">
          <div class="label">${m.role === 'user' ? '사용자' : 'K-stat AI'}</div>
          <div>${m.text}</div>
        </div>
      `).join('')}
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: "K-stat <onboarding@resend.dev>",
      to,
      subject: "K-stat 무역 분석 보고서",
      html,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}