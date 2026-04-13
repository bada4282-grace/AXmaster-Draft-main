"use client";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
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
          {["KITA.NET", "로그인", "통계가이드 ▼", "업데이트 현황", "공지사항"].map((item, i) => (
            <span key={item} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <span style={{ color: "#ddd", margin: "0 8px" }}>|</span>}
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
