"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUser, getUserProfile, signOut, type UserProfile } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

type UIState =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "ready"; user: User; profile: UserProfile };

export default function MyPage() {
  const router = useRouter();
  const [state, setState] = useState<UIState>({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (!user) { setState({ kind: "guest" }); return; }
      const profile = await getUserProfile();
      if (!profile) { setState({ kind: "guest" }); return; }
      setState({ kind: "ready", user, profile });
    })();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch {}
  };

  if (state.kind === "loading") {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <p style={{ color: "#777" }}>불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (state.kind === "guest") {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <h1 style={h1Style}>마이페이지</h1>
          <p style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>로그인 후 이용 가능합니다.</p>
          <Link
            href="/login"
            style={{ ...primaryBtnStyle, display: "inline-block", textDecoration: "none", textAlign: "center", width: "100%", boxSizing: "border-box" }}
          >
            로그인 페이지로 이동
          </Link>
        </div>
      </div>
    );
  }

  const { user, profile } = state;
  const name = (user.user_metadata as { name?: string } | undefined)?.name ?? "";
  const username = (user.user_metadata as { username?: string } | undefined)?.username ?? "";
  const realEmail = (user.user_metadata as { email?: string } | undefined)?.email ?? "";

  const tierLabel =
    profile.tier === "paid" ? "유료 회원" : "무료 회원";
  const tierColor = profile.tier === "paid" ? "#E02020" : "#777";

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <h1 style={h1Style}>마이페이지</h1>

        <div style={{ marginBottom: 24 }}>
          <div style={rowStyle}><span style={labelStyle}>이름</span><span>{name || "-"}</span></div>
          <div style={rowStyle}><span style={labelStyle}>아이디</span><span>{username || "-"}</span></div>
          <div style={rowStyle}><span style={labelStyle}>이메일</span><span>{realEmail || "-"}</span></div>
          <div style={rowStyle}>
            <span style={labelStyle}>회원 등급</span>
            <span style={{ color: tierColor, fontWeight: 600 }}>{tierLabel}</span>
          </div>
          {profile.isAdmin && (
            <div style={rowStyle}>
              <span style={labelStyle}>권한</span>
              <span style={{ color: "#185FA5", fontWeight: 600 }}>관리자</span>
            </div>
          )}
        </div>

        {profile.tier === "free" && profile.tierRequest === null && (
          <Link
            href="/upgrade"
            style={{ display: "block", padding: "12px 14px", background: "#FEF3C7", borderRadius: 8, color: "#92400E", fontSize: 13, textDecoration: "none", textAlign: "center", fontWeight: 600 }}
          >
            회원사 가입 (유료 회원 신청) →
          </Link>
        )}

        {profile.tier === "free" && profile.tierRequest === "paid" && (
          <div style={{ padding: "12px 14px", background: "#FEF3C7", borderRadius: 8, color: "#92400E", fontSize: 13 }}>
            ⓘ 승인 대기 중입니다. 관리자의 승인 후 유료 기능을 이용하실 수 있습니다.
          </div>
        )}

        {profile.tier === "paid" && (
          <div style={{ padding: "12px 14px", background: "#FEE2E2", borderRadius: 8, color: "#991B1B", fontSize: 13, fontWeight: 600 }}>
            ✓ 유료 회원입니다. 대화 요약 보고서를 이용하실 수 있습니다.
          </div>
        )}

        {profile.isAdmin && (
          <Link
            href="/admin"
            style={{ display: "block", marginTop: 16, textAlign: "center", color: "#185FA5", fontSize: 13, textDecoration: "underline" }}
          >
            관리자 페이지 →
          </Link>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          style={{ marginTop: 20, width: "100%", padding: "10px", background: "#fff", color: "#777", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
        >
          로그아웃
        </button>

        <Link href="/" style={{ display: "block", marginTop: 12, textAlign: "center", color: "#777", fontSize: 12, textDecoration: "none" }}>
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
  width: 400,
  maxWidth: "100%",
};

const h1Style: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 24,
  color: "#333",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid #f0f0f0",
  fontSize: 14,
  color: "#333",
};

const labelStyle: React.CSSProperties = {
  color: "#777",
  fontSize: 13,
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
