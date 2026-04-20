"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getUser, getUserProfile, requestPaidUpgrade, type UserProfile } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

type UIState =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "ready"; user: User; profile: UserProfile };

export default function UpgradePage() {
  const [state, setState] = useState<UIState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const reload = async () => {
    const user = await getUser();
    if (!user) { setState({ kind: "guest" }); return; }
    const profile = await getUserProfile();
    if (!profile) { setState({ kind: "guest" }); return; }
    setState({ kind: "ready", user, profile });
  };

  useEffect(() => { reload(); }, []);

  const handleRequest = async () => {
    setErrorMsg("");
    setSubmitting(true);
    try {
      await requestPaidUpgrade();
      await reload();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "신청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <h1 style={h1Style}>회원사 가입 (유료 회원 신청)</h1>

        <div style={{ fontSize: 14, color: "#555", lineHeight: 1.7, marginBottom: 24 }}>
          <p style={{ marginBottom: 12 }}>
            유료 회원이 되면 K-stat AI 어시스턴트의 <strong>대화 요약 보고서</strong> 기능을 이용하실 수 있습니다.
          </p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li style={{ marginBottom: 4 }}>PDF 다운로드로 대화 내용 보관</li>
            <li style={{ marginBottom: 4 }}>이메일 발송으로 관계자와 공유</li>
            <li>KITA 브랜드 템플릿 기반 전문 보고서</li>
          </ul>
        </div>

        {state.kind === "loading" && (
          <div style={infoBoxStyle}>불러오는 중…</div>
        )}

        {state.kind === "guest" && (
          <>
            <div style={{ ...infoBoxStyle, background: "#FEF3C7", color: "#92400E" }}>
              ⓘ 로그인 후 신청하실 수 있습니다.
            </div>
            <Link
              href="/login"
              style={{ ...primaryBtnStyle, display: "block", textAlign: "center", textDecoration: "none", marginTop: 12 }}
            >
              로그인 / 회원가입
            </Link>
          </>
        )}

        {state.kind === "ready" && state.profile.tier === "paid" && (
          <div style={{ ...infoBoxStyle, background: "#FEE2E2", color: "#991B1B", fontWeight: 600 }}>
            ✓ 이미 유료 회원이십니다. 모든 기능을 이용하실 수 있습니다.
          </div>
        )}

        {state.kind === "ready" && state.profile.tier === "free" && state.profile.tierRequest === "paid" && (
          <div style={{ ...infoBoxStyle, background: "#FEF3C7", color: "#92400E" }}>
            ⓘ 승인 대기 중입니다. 관리자의 승인 후 유료 기능을 이용하실 수 있습니다.
          </div>
        )}

        {state.kind === "ready" && state.profile.tier === "free" && state.profile.tierRequest === null && (
          <>
            <button
              type="button"
              onClick={handleRequest}
              disabled={submitting}
              style={{ ...primaryBtnStyle, width: "100%", opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
            >
              {submitting ? "신청 중…" : "유료 회원 신청"}
            </button>
            {errorMsg && (
              <p style={{ color: "#E02020", fontSize: 13, marginTop: 12 }}>{errorMsg}</p>
            )}
          </>
        )}

        <Link href="/" style={{ display: "block", marginTop: 20, textAlign: "center", color: "#777", fontSize: 12, textDecoration: "none" }}>
          ← 대시보드로 돌아가기
        </Link>
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8f8f8",
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  background: "white",
  padding: 40,
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  width: 440,
  maxWidth: "100%",
};

const h1Style: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 24,
  color: "#333",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "12px",
  background: "#E02020",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

const infoBoxStyle: React.CSSProperties = {
  padding: "14px 16px",
  background: "#f0f0f0",
  color: "#555",
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.5,
};
