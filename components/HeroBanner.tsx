export default function HeroBanner() {
  return (
    <div className="hero-banner">
      {/* Background chart lines */}
      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.18 }} preserveAspectRatio="none">
        <polyline points="0,110 120,85 250,92 380,62 520,72 660,48 780,65 920,38 1060,52 1200,30 1400,42"
          fill="none" stroke="#4d9fd6" strokeWidth="2"/>
        <polyline points="0,120 150,100 280,108 420,78 560,88 700,60 830,76 980,52 1100,66 1300,45 1400,55"
          fill="none" stroke="#e05555" strokeWidth="1.5" strokeDasharray="6,5"/>
        <polyline points="0,95 100,115 200,80 350,105 500,65 650,90 800,55 950,80 1100,45 1250,70 1400,35"
          fill="none" stroke="#66bb6a" strokeWidth="1" strokeDasharray="3,4" opacity="0.6"/>
      </svg>

      <p style={{ color:"rgba(255,255,255,0.55)", fontSize:12, marginBottom:6, position:"relative", letterSpacing:1 }}>
        무역통계를 알면 무역이 보인다!
      </p>
      <h1 style={{ color:"#fff", fontSize:28, fontWeight:700, position:"relative", letterSpacing:-0.5 }}>
        글로벌 무역통계 서비스 K-stat
      </h1>
    </div>
  );
}
