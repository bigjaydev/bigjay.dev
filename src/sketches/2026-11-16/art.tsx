import { useId } from "react";
import type { ReadingId, Shape } from "./lab";

function shade(z: number): string {
	if (z > 0.72) return "#f7f8fa";
	if (z > 0.35) return "#e4e8ee";
	if (z > 0) return "#c9d0d8";
	if (z > -0.4) return "#b3bcc6";
	return "#8f98a3";
}

function Helix({ uid }: { uid: string }) {
	const turns = 2.25;
	const steps = 70;
	const cx = 100;
	const rx = 36;
	const top = 34;
	const height = 190;
	const strands: { x: number; y: number; z: number }[][] = [[], []];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const angle = t * turns * Math.PI * 2 - 0.9;
		const y = top + t * height;
		strands[0].push({ x: cx + Math.sin(angle) * rx, y, z: Math.cos(angle) });
		strands[1].push({
			x: cx + Math.sin(angle + Math.PI) * rx,
			y,
			z: Math.cos(angle + Math.PI),
		});
	}

	type Bit = { z: number; d: string; w: number; c: string };
	const bits: Bit[] = [];
	for (let i = 2; i < steps; i += 4) {
		const a = strands[0][i];
		const b = strands[1][i];
		if (!a || !b) continue;
		const z = (a.z + b.z) / 2 - 0.05;
		bits.push({
			z,
			d: `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
			w: 2.4,
			c: z > 0 ? "#d5dbe3" : "#c0c7d0",
		});
	}
	for (const strand of strands) {
		for (let i = 0; i < strand.length - 1; i++) {
			const a = strand[i];
			const b = strand[i + 1];
			if (!a || !b) continue;
			const z = (a.z + b.z) / 2;
			const d = `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
			bits.push({ z, d, w: 9, c: shade(z) });
			if (z > 0.45) bits.push({ z: z + 0.02, d, w: 3, c: "rgba(255,255,255,0.7)" });
		}
	}
	bits.sort((a, b) => a.z - b.z);

	return (
		<g>
			<ellipse cx="100" cy="242" rx="42" ry="7" fill="#d5dbe3" />
			{bits.map((bit, index) => (
				<path
					key={`${uid}-h-${index}`}
					d={bit.d}
					fill="none"
					stroke={bit.c}
					strokeWidth={bit.w}
					strokeLinecap="round"
				/>
			))}
		</g>
	);
}

function Sphere({ uid, fringes }: { uid: string; fringes: 0 | 1 | 2 }) {
	const body = fringes === 0 ? 54 : 48;
	const outer = fringes === 0 ? body : fringes === 1 ? 72 : 86;
	const spikes = Array.from({ length: 13 }, (_, index) => {
		const angle = -Math.PI / 2 + (index * Math.PI * 2) / 13;
		const reach = 15 + (index % 3 === 0 ? 5 : 0);
		const x1 = 100 + Math.cos(angle) * outer;
		const y1 = 128 + Math.sin(angle) * outer * 0.9;
		const x2 = 100 + Math.cos(angle) * (outer + reach);
		const y2 = 128 + Math.sin(angle) * (outer + reach) * 0.9;
		return { x1, y1, x2, y2, front: Math.sin(angle) > -0.05 };
	});
	const back = spikes.filter((spike) => !spike.front);
	const front = spikes.filter((spike) => spike.front);

	const spike = (spike: (typeof spikes)[number], key: string) => (
		<g key={key}>
			<line
				x1={spike.x1}
				y1={spike.y1}
				x2={spike.x2}
				y2={spike.y2}
				stroke="#b4bdc7"
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<circle cx={spike.x2} cy={spike.y2} r="3.3" fill="#f4f6f8" stroke="#a8b1bb" strokeWidth="1" />
		</g>
	);

	return (
		<g>
			<ellipse cx="100" cy="236" rx="48" ry="8" fill="#d7dde4" />
			{back.map((item, index) => spike(item, `${uid}-sb-${index}`))}
			{fringes === 2 && (
				<circle
					cx="100"
					cy="128"
					r="86"
					fill="none"
					stroke={`url(#${uid}-membrane)`}
					strokeWidth="9"
				/>
			)}
			{fringes >= 1 && (
				<circle
					cx="100"
					cy="128"
					r="72"
					fill="none"
					stroke={`url(#${uid}-membrane)`}
					strokeWidth="10"
				/>
			)}
			<circle cx="100" cy="128" r={body} fill={`url(#${uid}-body)`} />
			<ellipse cx="116" cy="146" rx="26" ry="20" fill="#6e7782" opacity="0.16" />
			<path
				d="M68 112 Q100 96 136 116"
				fill="none"
				stroke="#8d97a2"
				strokeWidth="1.2"
				opacity="0.55"
			/>
			<path
				d="M62 136 Q100 158 140 132"
				fill="none"
				stroke="#8d97a2"
				strokeWidth="1.15"
				opacity="0.4"
			/>
			<path
				d="M100 80 Q116 128 100 176"
				fill="none"
				stroke="#8d97a2"
				strokeWidth="1.1"
				opacity="0.35"
			/>
			<ellipse cx="82" cy="106" rx="20" ry="12" fill="#ffffff" opacity="0.62" />
			{front.map((item, index) => spike(item, `${uid}-sf-${index}`))}
		</g>
	);
}

function hexagon(cx: number, cy: number, rx: number, ry: number): string {
	return Array.from({ length: 6 }, (_, index) => {
		const angle = -Math.PI / 2 + (index * Math.PI) / 3;
		return `${(cx + Math.cos(angle) * rx).toFixed(1)},${(cy + Math.sin(angle) * ry).toFixed(1)}`;
	}).join(" ");
}

function Phage({ uid }: { uid: string }) {
	return (
		<g>
			<ellipse cx="100" cy="242" rx="46" ry="7" fill="#d7dde4" />
			<path
				d="M100 196 C 78 214, 58 228, 42 246"
				fill="none"
				stroke="#b7c0ca"
				strokeWidth="2.6"
				strokeLinecap="round"
			/>
			<path
				d="M100 196 C 122 214, 144 228, 162 244"
				fill="none"
				stroke="#b7c0ca"
				strokeWidth="2.6"
				strokeLinecap="round"
			/>
			<path
				d="M92 196 C 74 214, 62 218, 48 206"
				fill="none"
				stroke="#c5ccd4"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			<path
				d="M108 196 C 128 214, 140 216, 156 204"
				fill="none"
				stroke="#c5ccd4"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			<rect x="86" y="124" width="28" height="70" rx="8" fill={`url(#${uid}-tail)`} />
			{Array.from({ length: 6 }, (_, index) => (
				<line
					key={`${uid}-seg-${index}`}
					x1="88"
					x2="112"
					y1={134 + index * 10}
					y2={134 + index * 10}
					stroke="#9aa3ad"
					strokeWidth="1.2"
					opacity="0.7"
				/>
			))}
			<rect x="80" y="116" width="40" height="12" rx="4" fill="#c5ccd4" />
			<polygon points={hexagon(100, 74, 42, 48)} fill={`url(#${uid}-body)`} />
			<polygon points="100,34 128,52 120,78 100,70 80,52" fill="#ffffff" opacity="0.38" />
			<line x1="100" y1="28" x2="100" y2="120" stroke="#8d97a2" strokeWidth="1.1" opacity="0.4" />
			<line x1="64" y1="74" x2="136" y2="74" stroke="#8d97a2" strokeWidth="1.1" opacity="0.35" />
		</g>
	);
}

const SPOTS: Record<Shape, { id: ReadingId; label: string; x: string; y: string }[]> = {
	sphere: [
		{ id: "coat", label: "Coat", x: "80%", y: "26%" },
		{ id: "genome", label: "Genome", x: "50%", y: "49%" },
		{ id: "dock", label: "Dock", x: "20%", y: "68%" },
	],
	helix: [
		{ id: "coat", label: "Coat", x: "69%", y: "27%" },
		{ id: "genome", label: "Genome", x: "36%", y: "50%" },
		{ id: "dock", label: "Dock", x: "66%", y: "73%" },
	],
	phage: [
		{ id: "coat", label: "Coat", x: "76%", y: "16%" },
		{ id: "genome", label: "Genome", x: "50%", y: "28%" },
		{ id: "dock", label: "Dock", x: "22%", y: "90%" },
	],
};

export function SpecimenArt({
	shape,
	fringes,
	focus,
	onFocus,
}: {
	shape: Shape;
	fringes: 0 | 1 | 2;
	focus: ReadingId;
	onFocus: (id: ReadingId) => void;
}) {
	const uid = useId().replace(/:/g, "");
	return (
		<div className="relative w-full" style={{ aspectRatio: "200 / 260" }}>
			<svg viewBox="0 0 200 260" className="absolute inset-0 h-full w-full" aria-hidden>
				<defs>
					<radialGradient id={`${uid}-body`} cx="32%" cy="28%" r="78%">
						<stop offset="0%" stopColor="#fbfcfd" />
						<stop offset="42%" stopColor="#d7dde4" />
						<stop offset="78%" stopColor="#aeb6c0" />
						<stop offset="100%" stopColor="#7c868f" />
					</radialGradient>
					<linearGradient id={`${uid}-membrane`} x1="0" y1="0" x2="1" y2="1">
						<stop offset="0%" stopColor="#f7f8fa" />
						<stop offset="55%" stopColor="#d5dbe3" />
						<stop offset="100%" stopColor="#aeb6c0" />
					</linearGradient>
					<linearGradient id={`${uid}-tail`} x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stopColor="#c5ccd4" />
						<stop offset="45%" stopColor="#f4f6f8" />
						<stop offset="100%" stopColor="#9aa3ad" />
					</linearGradient>
				</defs>
				{shape === "helix" && <Helix uid={uid} />}
				{shape === "sphere" && <Sphere uid={uid} fringes={fringes} />}
				{shape === "phage" && <Phage uid={uid} />}
			</svg>
			{SPOTS[shape].map((spot) => {
				const active = focus === spot.id;
				return (
					<button
						key={spot.id}
						type="button"
						data-hotspot={spot.id}
						aria-pressed={active}
						aria-label={spot.label}
						onClick={() => onFocus(spot.id)}
						className={`absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white shadow-sm ${
							active ? "border-[#f25c1d]" : "border-[#c5ccd4] hover:border-[#8e97a2]"
						}`}
						style={{ left: spot.x, top: spot.y }}
					>
						<span className={`size-1.5 rounded-full ${active ? "bg-[#f25c1d]" : "bg-[#9aa3ad]"}`} />
					</button>
				);
			})}
		</div>
	);
}

const GLYPHS: Record<string, { form: "bottle" | "capsule" | "jar"; a: string; b: string }> = {
	saline: { form: "bottle", a: "#d5e6f6", b: "#f7f8fa" },
	surfactant: { form: "bottle", a: "#e3d2f6", b: "#f7f8fa" },
	delipidant: { form: "bottle", a: "#f6d3ae", b: "#e39a62" },
	ribose: { form: "capsule", a: "#7ea2ff", b: "#f7f8fa" },
	polymerase: { form: "capsule", a: "#ffb088", b: "#f7f8fa" },
	nuclease: { form: "jar", a: "#c6e4d6", b: "#8fb9a6" },
	helicase: { form: "capsule", a: "#f3b6cf", b: "#f7f8fa" },
	glycan: { form: "bottle", a: "#c5dff8", b: "#7ea2ff" },
	peptide: { form: "bottle", a: "#e3d2f6", b: "#b79adf" },
	lectin: { form: "jar", a: "#d7ebc8", b: "#8fb56a" },
	clamp: { form: "bottle", a: "#f6d3ae", b: "#e08a4f" },
	chill: { form: "bottle", a: "#d5e6f6", b: "#9ec0e0" },
	warm: { form: "bottle", a: "#ffd2ba", b: "#f25c1d" },
	acid: { form: "bottle", a: "#e7f0b8", b: "#c5d46a" },
	alkali: { form: "bottle", a: "#e3d2f6", b: "#b79adf" },
	one: { form: "capsule", a: "#d7dde4", b: "#f7f8fa" },
	two: { form: "capsule", a: "#7ea2ff", b: "#f3b6cf" },
	smear: { form: "jar", a: "#e7ebf6", b: "#9aa8d6" },
};

export function Glyph({ id }: { id: string }) {
	const spec = GLYPHS[id] ?? { form: "bottle" as const, a: "#d7dde4", b: "#f7f8fa" };
	if (spec.form === "capsule") {
		return (
			<svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden>
				<g transform="rotate(-32 24 24)">
					<rect x="6" y="16" width="36" height="16" rx="8" fill={spec.b} />
					<path d="M6 24 a8 8 0 0 1 8-8 h10 v16 h-10 a8 8 0 0 1-8-8z" fill={spec.a} />
					<rect x="22" y="18" width="3" height="12" rx="1" fill="#ffffff" opacity="0.45" />
				</g>
			</svg>
		);
	}
	if (spec.form === "jar") {
		return (
			<svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden>
				<rect x="14" y="8" width="20" height="6" rx="2" fill={spec.b} />
				<rect x="11" y="14" width="26" height="26" rx="7" fill={spec.a} />
				<rect x="15" y="18" width="6" height="14" rx="3" fill="#ffffff" opacity="0.4" />
				{id === "smear" && (
					<g fill="#9aa8d6">
						<circle cx="20" cy="30" r="2" />
						<circle cx="27" cy="28" r="2" />
						<circle cx="31" cy="33" r="2" />
						<circle cx="23" cy="35" r="2" />
					</g>
				)}
			</svg>
		);
	}
	return (
		<svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden>
			<rect x="19" y="4" width="10" height="7" rx="2" fill={spec.b} />
			<rect x="16" y="10" width="16" height="5" rx="1.5" fill="#d5dbe3" />
			<rect x="12" y="15" width="24" height="26" rx="7" fill={spec.a} />
			<rect x="16" y="20" width="5" height="14" rx="2.5" fill="#ffffff" opacity="0.4" />
			{id === "surfactant" && (
				<g fill="#ffffff" opacity="0.7">
					<circle cx="28" cy="26" r="2.2" />
					<circle cx="32" cy="32" r="1.5" />
					<circle cx="26" cy="34" r="1.2" />
				</g>
			)}
		</svg>
	);
}

export function ViabilityChart({
	bars,
	picked,
}: {
	bars: { id: string; label: string; value: number }[];
	picked: string | null;
}) {
	const label = bars.map((bar) => `${bar.label} ${bar.value} percent`).join(", ");
	return (
		<svg
			viewBox="0 0 220 108"
			className="h-auto w-full"
			role="img"
			aria-label={`Viability. ${label}.`}
		>
			{bars.map((bar, index) => {
				const height = Math.max(6, (bar.value / 100) * 58);
				const x = 18 + index * 52;
				const y = 68 - height;
				const chosen = picked === bar.id;
				return (
					<g key={bar.id}>
						<rect x={x} y="10" width="28" height="58" rx="8" fill="#e7ebf0" />
						<rect
							x={x}
							y={y}
							width="28"
							height={height}
							rx="8"
							fill={chosen ? "#f25c1d" : "#7ea2ff"}
						/>
						<text
							x={x + 14}
							y={y - 4}
							textAnchor="middle"
							fontSize="9"
							fill="#5c6370"
							fontFamily="Inter, sans-serif"
						>
							{bar.value}
						</text>
						<text
							x={x + 14}
							y="96"
							textAnchor="middle"
							fontSize="10"
							fill="#5c6370"
							fontFamily="Inter, sans-serif"
						>
							{bar.label}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

export function SpectrumChart({ bins, doseLabel }: { bins: number[]; doseLabel: string }) {
	return (
		<svg
			viewBox="0 0 220 78"
			className="h-auto w-full"
			role="img"
			aria-label={`Variant spectrum, ${doseLabel}.`}
		>
			<line x1="12" y1="62" x2="208" y2="62" stroke="#d5dbe3" strokeWidth="1" />
			{bins.map((bin, index) => {
				const height = Math.max(2, bin * 48);
				const x = 16 + index * 28;
				return (
					<rect
						key={index}
						x={x}
						y={62 - height}
						width="16"
						height={height}
						rx="5"
						fill="#7ea2ff"
					/>
				);
			})}
		</svg>
	);
}

export function LoadChart({ series, drawKey }: { series: number[] | null; drawKey: number }) {
	const width = 360;
	const height = 132;
	const padX = 28;
	const padY = 16;
	const points = (series ?? [40, 40, 40, 40, 40, 40, 40, 40]).map((value, index, all) => {
		const x = padX + (index / (all.length - 1)) * (width - padX - 8);
		const y = padY + (1 - Math.min(100, Math.max(0, value)) / 100) * (height - padY - 22);
		return { x, y };
	});
	const line = points
		.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
		.join(" ");
	const first = points[0];
	const last = points[points.length - 1];
	const base = height - 22;
	const area = first && last ? `${line} L ${last.x} ${base} L ${first.x} ${base} Z` : "";

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className="h-auto w-full"
			role="img"
			aria-label={
				series
					? `Viral load from ${series[0]} to ${series[series.length - 1]} over 8 hours.`
					: "No assay yet."
			}
		>
			{[0, 25, 50, 75, 100].map((tick) => {
				const y = padY + (1 - tick / 100) * (height - padY - 22);
				return (
					<g key={tick}>
						<line x1={padX} x2={width - 8} y1={y} y2={y} stroke="#e1e6ec" strokeWidth="1" />
						<text x="2" y={y + 3} fontSize="9" fill="#9aa1ab" fontFamily="Inter, sans-serif">
							{tick}
						</text>
					</g>
				);
			})}
			<text x={padX} y={height - 4} fontSize="9" fill="#9aa1ab" fontFamily="Inter, sans-serif">
				0 h
			</text>
			<text
				x={width - 8}
				y={height - 4}
				textAnchor="end"
				fontSize="9"
				fill="#9aa1ab"
				fontFamily="Inter, sans-serif"
			>
				8 h
			</text>
			{series && first && last && (
				<>
					<path d={area} fill="#7ea2ff" opacity="0.16" />
					<path
						key={drawKey}
						d={line}
						fill="none"
						stroke="#5b7cff"
						strokeWidth="2.4"
						strokeLinejoin="round"
						strokeLinecap="round"
						pathLength={1}
						strokeDasharray={1}
						strokeDashoffset={1}
						style={{ animation: "antidote-draw 700ms ease-out forwards" }}
					/>
					<circle cx={last.x} cy={last.y} r="4.5" fill="#f25c1d" />
				</>
			)}
		</svg>
	);
}
