"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      await signUp(name, username, password, email);
      router.push("/login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8" }}>
      <div style={{ background: "white", padding: 40, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: "#333" }}>회원가입</h1>
        <form onSubmit={handleSubmit}>
          {/* 이름 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>이름</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {/* 아이디 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>아이디</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {/* 이메일 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="example@domain.com"
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {/* 비밀번호 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 11, color: "#999", marginTop: 4 }}>비밀번호는 8자 이상이어야 합니다.</p>
          </div>

          {/* 비밀번호 확인 */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: "#555", display: "block", marginBottom: 6 }}>비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {error && <p style={{ color: "#E02020", fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "12px", background: "#E02020", color: "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#777" }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" style={{ color: "#E02020", fontWeight: 600 }}>로그인</Link>
        </p>
      </div>
    </div>
  );
}
