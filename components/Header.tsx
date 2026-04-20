"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 초기 로그인 상태 확인
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    // 로그인/로그아웃 이벤트 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <header className="w-full sticky top-0 z-50 bg-white shadow-sm">
      {/* Top row: Center logo + Right nav */}
      <div className="header-top" style={{ position: "relative", justifyContent: "center" }}>
        <Link href="/" className="no-underline">
          <Image
            src="/h1_logo_og.jpg"
            alt="K-stat 로고"
            width={235}
            height={49}
            priority
            style={{ width: "235px", height: "49px", objectFit: "contain" }}
          />
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 0, fontSize: 13, color: "#555", position: "absolute", right: 32 }}>
          {/* 회원사 가입 */}
          <span style={{ display: "flex", alignItems: "center" }}>
            <Link href="/upgrade" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
              회원사 가입
            </Link>
          </span>

          {/* KITA.NET */}
          <span style={{ display: "flex", alignItems: "center" }}>
            <span style={{ color: "#ddd", margin: "0 8px" }}>|</span>
            <a href="#" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
              KITA.NET
            </a>
          </span>

          {/* 로그인 / 로그아웃 */}
          <span style={{ display: "flex", alignItems: "center" }}>
            <span style={{ color: "#ddd", margin: "0 8px" }}>|</span>
            {user ? (
              <>
                <Link href="/mypage" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                  마이페이지
                </Link>
                <span style={{ color: "#ddd", margin: "0 8px" }}>|</span>
                <button
                  onClick={handleLogout}
                  style={{ background: "none", border: "none", padding: 0, color: "#555", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                  로그아웃
                </button>
              </>
            ) : (
              <Link href="/login" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
                onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                로그인
              </Link>
            )}
          </span>

          {/* 나머지 메뉴 */}
          {["통계가이드 ▼", "업데이트 현황", "공지사항"].map((item) => (
            <span key={item} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ color: "#ddd", margin: "0 8px" }}>|</span>
              <a href="#" style={{ color: "#555", textDecoration: "none", whiteSpace: "nowrap" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#E02020")}
                onMouseLeave={e => (e.currentTarget.style.color = "#555")}>
                {item}
              </a>
            </span>
          ))}
        </div>
      </div>

      {/* GNB */}
      <div className="header-gnb">
        {["국내통계", "해외무역통계", "IMF 세계통계", "맞춤분석", "자사통계"].map(menu => (
          <a key={menu} className="gnb-item">{menu}</a>
        ))}
      </div>
    </header>
  );
}
