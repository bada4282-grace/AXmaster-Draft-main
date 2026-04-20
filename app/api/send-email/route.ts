import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { to, html } = await req.json();

  try {
    await resend.emails.send({
      from: "K-stat <noreply@kitaaxmu4.kr>",
      to,
      subject: "K-stat 무역 분석 보고서",
      html,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}