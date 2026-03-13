interface LogoProps {
  size?: number
  className?: string
}

export default function Logo({ size = 200, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        {/* Starburst clip */}
        <clipPath id="circleClip">
          <circle cx="200" cy="200" r="180" />
        </clipPath>
        {/* Sunglasses lens gradient */}
        <linearGradient id="lensGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00e8c8" />
          <stop offset="100%" stopColor="#008b8b" />
        </linearGradient>
        {/* Face gradient */}
        <radialGradient id="faceGrad" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#ffd23f" />
          <stop offset="100%" stopColor="#d4a017" />
        </radialGradient>
      </defs>

      {/* Outer ring */}
      <circle cx="200" cy="200" r="195" fill="#1a1a1a" stroke="#ff3b3b" strokeWidth="6" />

      {/* Starburst rays */}
      <g clipPath="url(#circleClip)">
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15) * Math.PI / 180
          const x2 = 200 + Math.cos(angle) * 250
          const y2 = 200 + Math.sin(angle) * 250
          const nextAngle = ((i + 1) * 15) * Math.PI / 180
          const x3 = 200 + Math.cos(nextAngle) * 250
          const y3 = 200 + Math.sin(nextAngle) * 250
          return (
            <polygon
              key={i}
              points={`200,200 ${x2},${y2} ${x3},${y3}`}
              fill={i % 2 === 0 ? '#ff3b3b' : '#00c4a0'}
              opacity="0.85"
            />
          )
        })}
      </g>

      {/* Inner circle background */}
      <circle cx="200" cy="210" r="120" fill="#1a1a1a" opacity="0.3" />

      {/* ── MONKEY FACE ── */}

      {/* Ears */}
      <ellipse cx="100" cy="175" rx="38" ry="42" fill="#2a1a0a" stroke="#111" strokeWidth="4" />
      <ellipse cx="100" cy="175" rx="22" ry="26" fill="#d4a017" />
      <ellipse cx="300" cy="175" rx="38" ry="42" fill="#2a1a0a" stroke="#111" strokeWidth="4" />
      <ellipse cx="300" cy="175" rx="22" ry="26" fill="#d4a017" />

      {/* Head (dark fur) */}
      <ellipse cx="200" cy="205" rx="105" ry="115" fill="#2a1a0a" stroke="#111" strokeWidth="4" />

      {/* Face (lighter area) */}
      <ellipse cx="200" cy="230" rx="75" ry="80" fill="url(#faceGrad)" stroke="#111" strokeWidth="3" />

      {/* Fur tuft on top */}
      <path
        d="M170 105 Q185 75 200 90 Q215 75 230 105"
        fill="#2a1a0a"
        stroke="#111"
        strokeWidth="3"
      />

      {/* ── SUNGLASSES ── */}

      {/* Bridge */}
      <rect x="183" y="195" width="34" height="8" rx="4" fill="#333" stroke="#111" strokeWidth="2" />

      {/* Left lens */}
      <rect x="118" y="180" width="72" height="42" rx="10" fill="url(#lensGrad)" stroke="#222" strokeWidth="4" />
      {/* Left lens reflection grid */}
      <g opacity="0.35">
        <line x1="130" y1="185" x2="130" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="145" y1="185" x2="145" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="160" y1="185" x2="160" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="175" y1="185" x2="175" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="122" y1="195" x2="186" y2="195" stroke="#fff" strokeWidth="1.5" />
        <line x1="122" y1="208" x2="186" y2="208" stroke="#fff" strokeWidth="1.5" />
      </g>
      {/* Left lens shine */}
      <rect x="125" y="185" width="18" height="10" rx="3" fill="#fff" opacity="0.2" />

      {/* Right lens */}
      <rect x="210" y="180" width="72" height="42" rx="10" fill="url(#lensGrad)" stroke="#222" strokeWidth="4" />
      {/* Right lens reflection grid */}
      <g opacity="0.35">
        <line x1="222" y1="185" x2="222" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="237" y1="185" x2="237" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="252" y1="185" x2="252" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="267" y1="185" x2="267" y2="217" stroke="#fff" strokeWidth="1.5" />
        <line x1="214" y1="195" x2="278" y2="195" stroke="#fff" strokeWidth="1.5" />
        <line x1="214" y1="208" x2="278" y2="208" stroke="#fff" strokeWidth="1.5" />
      </g>
      {/* Right lens shine */}
      <rect x="217" y="185" width="18" height="10" rx="3" fill="#fff" opacity="0.2" />

      {/* Glasses arms */}
      <line x1="118" y1="200" x2="85" y2="190" stroke="#333" strokeWidth="5" strokeLinecap="round" />
      <line x1="282" y1="200" x2="315" y2="190" stroke="#333" strokeWidth="5" strokeLinecap="round" />

      {/* ── NOSE & MOUTH ── */}

      {/* Nose */}
      <ellipse cx="193" cy="248" rx="8" ry="6" fill="#2a1a0a" />
      <ellipse cx="207" cy="248" rx="8" ry="6" fill="#2a1a0a" />

      {/* Smile */}
      <path
        d="M168 270 Q200 298 232 270"
        fill="none"
        stroke="#2a1a0a"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Chin dimple */}
      <path
        d="M190 288 Q200 295 210 288"
        fill="none"
        stroke="#c49a1a"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* ── "TOKEN MONKEY" TEXT BANNER ── */}
      <path
        id="topArc"
        d="M60 200 A140 140 0 0 1 340 200"
        fill="none"
      />
      <text
        fontFamily="'Bangers', 'Impact', sans-serif"
        fontSize="32"
        fill="#ffd23f"
        stroke="#111"
        strokeWidth="1.5"
        letterSpacing="6"
        fontWeight="400"
      >
        <textPath href="#topArc" startOffset="50%" textAnchor="middle">
          TOKEN MONKEY
        </textPath>
      </text>

      {/* Bottom ring decoration */}
      <path
        id="bottomArc"
        d="M80 260 A140 140 0 0 0 320 260"
        fill="none"
      />
      <text
        fontFamily="'Space Grotesk', sans-serif"
        fontSize="16"
        fill="#00d4aa"
        letterSpacing="4"
        fontWeight="600"
      >
        <textPath href="#bottomArc" startOffset="50%" textAnchor="middle">
          P2P AI CHALLENGES
        </textPath>
      </text>
    </svg>
  )
}
