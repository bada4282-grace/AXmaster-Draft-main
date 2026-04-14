"use client";
import { useState, useEffect } from "react";
import type { MacroItem } from "@/app/api/macro/route";

const FALLBACK: MacroItem[] = [
  { label: "USD/KRW", value: "—", change: "로딩중", up: true },
  { label: "BDI (발틱지수)", value: "—", change: "로딩중", up: false },
  { label: "두바이유 ($/bbl)", value: "—", change: "로딩중", up: true },
  { label: "WTI ($/bbl)", value: "—", change: "로딩중", up: true },
];

export default function MacroSection() {
  const [data, setData] = useState<MacroItem[]>(FALLBACK);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((json: MacroItem[] | { error: string }) => {
        if (Array.isArray(json)) setData(json);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="macro-section">
      <div className="macro-title">거시경제 지표</div>
      <div className="macro-grid">
        {data.map((item) => (
          <div key={item.label} className="macro-card">
            <div className="macro-card-label">{item.label}</div>
            <div className="macro-card-value">{item.value}</div>
            <div
              className="macro-card-change"
              style={{ color: item.up ? "#E02020" : "#185FA5" }}
            >
              {item.change}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
