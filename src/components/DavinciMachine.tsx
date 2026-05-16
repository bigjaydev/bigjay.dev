import { useEffect, useRef } from "react";

type Node = { x: number; y: number; r: number };
type Rand = () => number;

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

function drawDaVinciMachine(
  key: string,
  width = 600,
  height = 600,
): string {
  const seed = hashString(key);
  const rand = rng(seed);

  const nodes: Node[] = [];
  const parts: string[] = [];

  const nodeCount = 8 + Math.floor(rand() * 8);

  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      x: 50 + rand() * (width - 100),
      y: 50 + rand() * (height - 100),
      r: 10 + rand() * 25,
    });
  }

  for (let i = 0; i < nodeCount; i++) {
    const a = nodes[i]!;
    const connections = 1 + Math.floor(rand() * 3);

    for (let j = 0; j < connections; j++) {
      const b = nodes[Math.floor(rand() * nodeCount)]!;
      parts.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
          stroke="black" stroke-width="${1 + rand() * 2}" opacity="0.6" />`,
      );
    }
  }

  for (const n of nodes) {
    const spokes = 5 + Math.floor(rand() * 6);

    let spokesSvg = "";
    for (let i = 0; i < spokes; i++) {
      const angle = (Math.PI * 2 * i) / spokes;
      const x2 = n.x + Math.cos(angle) * n.r;
      const y2 = n.y + Math.sin(angle) * n.r;

      spokesSvg += `<line x1="${n.x}" y1="${n.y}" x2="${x2}" y2="${y2}"
        stroke="black" opacity="0.4" />`;
    }

    parts.push(`
      <circle cx="${n.x}" cy="${n.y}" r="${n.r}"
        fill="none" stroke="black" stroke-width="2" />
      ${spokesSvg}
    `);
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="white"/>
      ${parts.join("\n")}
    </svg>
  `;
}

type DavinciMachineProps = { seed: string };

export default function DavinciMachine({ seed }: DavinciMachineProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      console.log(drawDaVinciMachine(seed));
      ref.current.innerHTML = drawDaVinciMachine(seed);
    }
  }, [seed]);

  return <div ref={ref} />;
}
