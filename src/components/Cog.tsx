import { useMemo } from "react";

type Rand = () => number;

type CogGeometry = {
  cx: number;
  cy: number;
  baseR: number;
  innerR: number;
  teethPath: string;
};

type Spoke = { x1: number; y1: number; x2: number; y2: number };

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): Rand {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCog(key: string, size = 200): CogGeometry {
  const seed = hashString(key);
  const rand = rng(seed);

  const cx = size / 2;
  const cy = size / 2;

  const teeth = 12 + Math.floor(rand() * 8);

  const baseR = size * (0.28 + rand() * 0.05);
  const outerR = baseR * (1.2 + rand() * 0.1);
  const innerR = baseR * (0.45 + rand() * 0.2);

  let d = "";

  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 1) / teeth) * Math.PI * 2;
    const am = (a0 + a1) / 2;

    const x1 = cx + Math.cos(a0) * baseR;
    const y1 = cy + Math.sin(a0) * baseR;

    const x2 = cx + Math.cos(am) * outerR;
    const y2 = cy + Math.sin(am) * outerR;

    const x3 = cx + Math.cos(a1) * baseR;
    const y3 = cy + Math.sin(a1) * baseR;

    d += `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} `;
  }

  return { cx, cy, baseR, innerR, teethPath: d };
}

type CogProps = { seed: string; size?: number };

export default function Cog({ seed, size = 200 }: CogProps) {
  const cog = useMemo(() => buildCog(seed, size), [seed, size]);

  const spokes = useMemo((): Spoke[] => {
    const count = 6;
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count;
      return {
        x1: cog.cx,
        y1: cog.cy,
        x2: cog.cx + Math.cos(angle) * cog.baseR,
        y2: cog.cy + Math.sin(angle) * cog.baseR,
      };
    });
  }, [cog]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width="100%" height="100%" fill="white" />

      {/* outer gear shape */}
      <path
        d={cog.teethPath}
        fill="none"
        stroke="black"
        strokeWidth="2"
      />

      {/* base circle */}
      <circle
        cx={cog.cx}
        cy={cog.cy}
        r={cog.baseR}
        fill="none"
        stroke="black"
        strokeWidth="2"
      />

      {/* spokes (adds “machine feel”) */}
      {spokes.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="black"
          strokeWidth="1"
          opacity="0.5"
        />
      ))}

      {/* hub */}
      <circle
        cx={cog.cx}
        cy={cog.cy}
        r={cog.innerR}
        fill="none"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  );
}
