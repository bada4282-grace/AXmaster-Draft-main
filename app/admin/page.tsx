"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/lib/auth";

interface PendingRequest {
  user_id: string;
  requested_at: string | null;
  name: string | null;
  username: string | null;
  email: string | null;
}

type UIState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "ready" };

export default function AdminPage() {
  const router = useRouter();
  const [state, setState] = useState<UIState>({ kind: "loading" });
  const [rows, setRows] = useState<PendingRequest[]>([]);
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setActionErr("");
    const { data, error } = await supabase.rpc("list_pending_paid_requests");
    if (error) {
      setActionErr(error.message);
      setRows([]);
      return;
    }
    setRows((data as PendingRequest[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await getUserProfile();
      if (!profile || profile.isAdmin !== true) {
        setState({ kind: "forbidden" });
        setTimeout(() => router.replace("/"), 1500);
        return;
      }
      setState({ kind: "ready" });
      await loadPending();
    })();
  }, [router, loadPending]);

  const approve = async (userId: string) => {
    setBusyId(userId);
    setActionErr("");
    try {
      const { error } = await supabase.rpc("approve_paid_request", { target_user_id: userId });
      if (error) throw new Error(error.message);
      await loadPending();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "승인 실패");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (userId: string) => {
    setBusyId(userId);
    setActionErr("");
    try {
      const { error } = await supabase.rpc("reject_paid_request", { target_user_id: userId });
      if (error) throw new Error(error.message);
      await loadPending();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "거절 실패");
    } finally {
      setBusyId(null);
    }
  };

  if (state.kind === "loading") {
    return (
      <div style={wrapStyle}>
        <p style={{ color: "#777" }}>권한 확인 중…</p>
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div style={wrapStyle}>
        <div style={{ background: "white", padding: 32, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <p style={{ color: "#E02020", fontWeight: 600, marginBottom: 8 }}>접근 권한이 없습니다.</p>
          <p style={{ color: "#777", fontSize: 13 }}>홈으로 이동합니다…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...wrapStyle, alignItems: "flex-start", padding: "40px 20px" }}>
      <div style={{ background: "white", padding: 32, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: "100%", maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#333" }}>관리자 — 유료 회원 신청</h1>
          <Link href="/mypage" style={{ fontSize: 13, color: "#777", textDecoration: "none" }}>← 마이페이지</Link>
        </div>

        {actionErr && (
          <p style={{ color: "#E02020", fontSize: 13, marginBottom: 12 }}>{actionErr}</p>
        )}

        {rows.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", background: "#fafafa", borderRadius: 8 }}>
            대기 중인 신청이 없습니다.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #eee" }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>아이디</th>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>신청일</th>
                <th style={thStyle}>처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={tdStyle}>{r.name ?? "-"}</td>
                  <td style={tdStyle}>{r.username ?? "-"}</td>
                  <td style={tdStyle}>{r.email ?? "-"}</td>
                  <td style={tdStyle}>{r.requested_at ? new Date(r.requested_at).toLocaleDateString("ko-KR") : "-"}</td>
                  <td style={{ ...tdStyle, display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => approve(r.user_id)}
                      disabled={busyId === r.user_id}
                      style={{ padding: "6px 12px", background: "#E02020", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: busyId === r.user_id ? 0.6 : 1 }}
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      onClick={() => reject(r.user_id)}
                      disabled={busyId === r.user_id}
                      style={{ padding: "6px 12px", background: "#fff", color: "#777", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, cursor: "pointer", opacity: busyId === r.user_id ? 0.6 : 1 }}
                    >
                      거절
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  fontSize: 12,
  color: "#777",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 8px",
  fontSize: 13,
  color: "#333",
  verticalAlign: "middle",
};
