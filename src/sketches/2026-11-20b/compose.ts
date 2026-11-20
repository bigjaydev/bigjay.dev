export const FRAME_W = 960;
export const FRAME_H = 640;

export type Point = { x: number; y: number };

export type Pine = {
	x: number;
	baseY: number;
	height: number;
	width: number;
	fill: string;
	tiers: number;
	lean: number;
	taper: number;
	jag: number;
};

export type Layer = {
	fill: string;
	treeFill: string;
	ridge: Point[];
	snow: Point[][];
	pines: Pine[];
};

export type Mist = {
	/** Top of the soft mist band. */
	y: number;
	height: number;
	/** Solid mist color; opacity is applied via gradient stops. */
	color: string;
	peakOpacity: number;
	/** Phase seed so each band undulates differently. */
	phase: number;
};

export type Scene = {
	seed: number;
	w: number;
	h: number;
	sky: [string, string];
	layers: Layer[];
	mists: Mist[];
	ground: string;
	accent: { x: number; y: number; r: number; fill: string } | null;
};

export type ComposeOptions = {
	depth: number;
	trees: number;
	mist: number;
	/** Force a palette index for consistent branding (e.g. thumbnails). */
	paletteIndex?: number;
	/** Force an exact silhouette layer count. */
	layerCount?: number;
};

export const THUMB_PALETTE = 0;

/** Deliberate layout plan driven by composition.md rules. */
type Plan = {
	focusX: number;
	secondaryX: number;
	tertiaryX: number | null;
	horizon: number;
	skyOpen: number;
	massSide: -1 | 1;
	diagonal: number;
	peakBoost: number;
	mode: "thirds" | "golden" | "diagonal" | "triangle";
};

const PHI = 0.6180339887;

const PALETTES = [
	{
		sky: ["#d9dee6", "#b7c0cc"] as [string, string],
		layers: ["#aeb6c2", "#87919f", "#556070", "#2a323f"],
		trees: ["#a6aeb9", "#748090", "#3f4a59", "#141a22"],
		snow: "#e6ebf1",
		mist: "#d6dce4",
		ground: "#1c222c",
		accent: "rgba(232, 236, 242, 0.55)",
	},
	{
		sky: ["#dde2e0", "#b8c2bf"] as [string, string],
		layers: ["#aeb8b4", "#879490", "#55635e", "#283330"],
		trees: ["#a6b0ab", "#74827c", "#3f4d48", "#121916"],
		snow: "#e8eeeb",
		mist: "#d8deda",
		ground: "#1a211f",
		accent: "rgba(236, 240, 237, 0.5)",
	},
	{
		sky: ["#e0dde4", "#c0bbc8"] as [string, string],
		layers: ["#b4aebc", "#908a99", "#5c5666", "#2e2936"],
		trees: ["#aca6b4", "#7c7686", "#45404f", "#16131c"],
		snow: "#ece8f0",
		mist: "#dcd8e2",
		ground: "#1d1a24",
		accent: "rgba(238, 234, 242, 0.48)",
	},
];

function mulberry32(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function smoothstep(t: number) {
	const x = clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

function pick<T>(rand: () => number, items: T[]): T {
	return items[Math.floor(rand() * items.length)] ?? items[0]!;
}

function shadeHex(hex: string, delta: number): string {
	const raw = hex.replace("#", "");
	if (raw.length !== 6) return hex;
	const channel = (start: number) => {
		const value = clamp(parseInt(raw.slice(start, start + 2), 16) + delta, 0, 255);
		return value.toString(16).padStart(2, "0");
	};
	return `#${channel(0)}${channel(2)}${channel(4)}`;
}

type ShadeField = { ax: number; ay: number; bx: number; by: number; cx: number; cy: number };

function makeShadeField(rand: () => number): ShadeField {
	return {
		ax: 0.006 + rand() * 0.01,
		ay: 0.008 + rand() * 0.012,
		bx: 0.014 + rand() * 0.02,
		by: 0.01 + rand() * 0.016,
		cx: rand() * Math.PI * 2,
		cy: rand() * Math.PI * 2,
	};
}

function clumpedTreeFill(base: string, x: number, y: number, field: ShadeField): string {
	const wave =
		Math.sin(x * field.ax + y * field.ay + field.cx) * 0.55 +
		Math.sin(x * field.bx - y * field.by + field.cy) * 0.35 +
		Math.sin((x + y) * 0.0045 + field.cx * 0.5) * 0.1;
	const delta = Math.round(wave * 5);
	return shadeHex(base, clamp(delta, -6, 5));
}

function sampleColors(colors: string[], count: number): string[] {
	if (count <= 1) return [colors[colors.length - 1]!];
	if (count === colors.length) return [...colors];
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1);
		out.push(colors[Math.round(t * (colors.length - 1))]!);
	}
	return out;
}

/** Rule of thirds / golden ratio anchors with edge awareness. */
function planComposition(rand: () => number, w: number, h: number): Plan {
	const mode = pick(rand, ["thirds", "golden", "diagonal", "triangle"] as const);
	const thirdL = w / 3;
	const thirdR = (2 * w) / 3;
	const goldL = w * (1 - PHI);
	const goldR = w * PHI;
	const massSide: -1 | 1 = rand() < 0.5 ? -1 : 1;

	let focusX: number;
	let secondaryX: number;
	let tertiaryX: number | null = null;
	let diagonal = 0;
	let peakBoost = 1;

	if (mode === "thirds") {
		// Emphasis on a thirds intersection; secondary on the opposite third (asymmetrical balance).
		focusX = massSide < 0 ? thirdR + (rand() - 0.5) * w * 0.06 : thirdL + (rand() - 0.5) * w * 0.06;
		secondaryX = massSide < 0 ? thirdL + (rand() - 0.5) * w * 0.05 : thirdR + (rand() - 0.5) * w * 0.05;
		if (rand() < 0.55) tertiaryX = w * 0.5 + (rand() - 0.5) * w * 0.08; // odd-number peak group
		peakBoost = 1.05 + rand() * 0.2;
	} else if (mode === "golden") {
		focusX = massSide < 0 ? goldR : goldL;
		secondaryX = massSide < 0 ? goldL : goldR;
		focusX += (rand() - 0.5) * w * 0.04;
		secondaryX += (rand() - 0.5) * w * 0.04;
		peakBoost = 1.1 + rand() * 0.2;
	} else if (mode === "diagonal") {
		// Leading diagonal: rising ridge toward focus, secondary lower on the opposite side.
		focusX = massSide < 0 ? lerp(thirdR, w * 0.78, rand()) : lerp(w * 0.22, thirdL, rand());
		secondaryX = massSide < 0 ? lerp(w * 0.18, thirdL, rand()) : lerp(thirdR, w * 0.82, rand());
		diagonal = massSide * (0.35 + rand() * 0.35);
		peakBoost = 1 + rand() * 0.15;
	} else {
		// Triangular: three peaks (odd number) forming a stable pyramid structure.
		const apex = massSide < 0 ? thirdR : thirdL;
		focusX = apex + (rand() - 0.5) * w * 0.05;
		secondaryX = focusX - massSide * w * (0.22 + rand() * 0.08);
		tertiaryX = focusX + massSide * w * (0.18 + rand() * 0.08);
		secondaryX = clamp(secondaryX, w * 0.12, w * 0.88);
		tertiaryX = clamp(tertiaryX, w * 0.12, w * 0.88);
		peakBoost = 1.15 + rand() * 0.2;
	}

	// Negative space: keep meaningful sky; horizon near upper third / golden.
	const skyOpen = mode === "golden" ? h * (1 - PHI) * (0.85 + rand() * 0.2) : h * (0.28 + rand() * 0.1);
	const horizon = skyOpen + h * (0.08 + rand() * 0.06);

	return {
		focusX: clamp(focusX, w * 0.18, w * 0.82),
		secondaryX: clamp(secondaryX, w * 0.1, w * 0.9),
		tertiaryX,
		horizon: clamp(horizon, h * 0.28, h * 0.48),
		skyOpen,
		massSide,
		diagonal,
		peakBoost,
		mode,
	};
}

function ridgePath(
	rand: () => number,
	w: number,
	baseY: number,
	amp: number,
	steps: number,
	plan: Plan,
	layerT: number,
): Point[] {
	const peaks: { x: number; boost: number; width: number }[] = [
		{ x: plan.focusX, boost: amp * plan.peakBoost * lerp(0.55, 1.15, layerT), width: w * 0.34 },
		{ x: plan.secondaryX, boost: amp * lerp(0.35, 0.75, layerT), width: w * 0.24 },
	];
	if (plan.tertiaryX != null) {
		peaks.push({ x: plan.tertiaryX, boost: amp * lerp(0.25, 0.55, layerT), width: w * 0.2 });
	}

	const phase = rand() * Math.PI * 2;
	const points: Point[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = t * w;
		let lift = 0;
		for (const peak of peaks) {
			const falloff = smoothstep(1 - Math.min(1, Math.abs(x - peak.x) / peak.width));
			lift += falloff * peak.boost;
		}
		// Diagonal leading line across the ridge.
		lift += plan.diagonal * amp * (t - 0.5) * lerp(0.15, 0.55, layerT);
		const roll = Math.sin(t * Math.PI * 2.05 + phase) * amp * 0.1;
		const jag = (rand() - 0.5) * amp * 0.07;
		const edgeSettle = smoothstep(Math.min(t, 1 - t) * 4.2);
		points.push({
			x,
			y: baseY - amp * 0.1 - (lift + roll + jag) * (0.3 + edgeSettle * 0.7),
		});
	}
	// Edge awareness: settle corners so silhouettes don't tangent awkwardly.
	points[0] = { x: 0, y: baseY - amp * 0.06 };
	points[points.length - 1] = { x: w, y: baseY - amp * (0.05 + rand() * 0.1) };
	return points;
}

function snowPatches(rand: () => number, points: Point[], chance: number, depth: number): Point[][] {
	if (chance <= 0.05) return [];
	const patches: Point[][] = [];
	const span = Math.max(4, Math.floor(points.length / 10));
	for (let i = 2; i < points.length - 3; i += span) {
		if (rand() > chance) continue;
		const a = points[i]!;
		const b = points[i + 1]!;
		const c = points[Math.min(points.length - 1, i + 2)]!;
		const drop = lerp(8, 22, 1 - depth) * (0.7 + rand() * 0.6);
		patches.push([
			{ x: a.x, y: a.y + 1 },
			{ x: b.x, y: b.y - drop * 0.15 },
			{ x: c.x, y: c.y + 1 },
			{ x: lerp(a.x, c.x, 0.55), y: Math.max(a.y, c.y) + drop },
		]);
	}
	return patches;
}

function sampleRidgeY(points: Point[], x: number): number {
	if (points.length === 0) return 0;
	if (x <= points[0]!.x) return points[0]!.y;
	const last = points[points.length - 1]!;
	if (x >= last.x) return last.y;
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i]!;
		const b = points[i + 1]!;
		if (x < a.x || x > b.x) continue;
		const t = (x - a.x) / Math.max(1e-6, b.x - a.x);
		return lerp(a.y, b.y, t);
	}
	return last.y;
}

function makePine(
	rand: () => number,
	x: number,
	baseY: number,
	height: number,
	fill: string,
	contrast: number,
): Pine {
	const near = contrast > 0.55;
	const skinny = rand() < 0.3;
	const stout = !skinny && rand() < 0.22;
	const widthScale = skinny ? 0.16 + rand() * 0.1 : stout ? 0.32 + rand() * 0.12 : 0.22 + rand() * 0.11;
	return {
		x,
		baseY,
		height: height * (0.82 + rand() * 0.34),
		width: height * widthScale,
		fill,
		tiers: near ? 3 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2),
		lean: (rand() - 0.5) * lerp(0.06, 0.2, contrast),
		taper: 0.5 + rand() * 0.55,
		jag: lerp(0.04, 0.16, contrast) + rand() * 0.08,
	};
}

function layerTrees(
	rand: () => number,
	w: number,
	h: number,
	ridge: Point[],
	treeFill: string,
	contrast: number,
	amount: number,
	layerBottom: number,
	front: boolean,
	plan: Plan,
): Pine[] {
	const pines: Pine[] = [];
	const rows = front
		? 8 + Math.round(lerp(2, 4, amount))
		: 14 + Math.round(lerp(8, 4, contrast) * lerp(1, 1.3, amount));
	const heightBase = front ? lerp(36, 78, amount) : lerp(14, 72, contrast);
	const shadeField = front ? makeShadeField(rand) : null;

	for (let row = 0; row < rows; row++) {
		const rowT = rows === 1 ? 0.4 : row / (rows - 1);
		const slopeT = front ? Math.pow(rowT, 0.9) : Math.pow(rowT, 0.75);
		const depthBoost = contrast < 0.75 ? lerp(3.6, 2.2, contrast / 0.75) : 1;
		const count = Math.round(
			(front ? lerp(48, 78, amount) : lerp(240, 140, contrast) * depthBoost) *
				lerp(1.05, 1.35, amount) *
				(front ? lerp(2.35, 0.85, rowT) : lerp(1.05, 0.95, rowT)),
		);
		const spacing = w / Math.max(1, count);
		const stagger = (row % 2) * spacing * 0.5;

		for (let i = 0; i < count; i++) {
			let x = front
				? ((i + 0.5) / count) * w + (rand() - 0.5) * spacing * 0.25 + stagger * 0.3
				: i * spacing + stagger + (rand() - 0.5) * spacing * 0.55;
			if (x < -14 || x > w + 14) continue;

			// Asymmetrical balance: denser forest mass on one side; negative space near focal peak.
			const side = (x - w * 0.5) / (w * 0.5);
			const onMass = side * plan.massSide;
			const awayFromFocus = clamp(Math.abs(x - plan.focusX) / (w * 0.5), 0, 1);
			if (awayFromFocus < 0.14 && rowT < 0.35 && rand() < lerp(0.75, 0.35, contrast)) continue;
			if (onMass < -0.15 && rand() < lerp(0.22, 0.08, contrast)) continue;
			// Framing: pull a bit of near-edge weight on the mass side.
			if (front && onMass > 0.35 && rand() < 0.18) {
				x = clamp(x + plan.massSide * spacing * 0.4, 0, w);
			}

			const ridgeY = sampleRidgeY(ridge, clamp(x, 0, w));
			let baseY: number;
			let height: number;
			if (front) {
				const overshoot = lerp(-10, 110, Math.pow(rowT, 1.15));
				baseY = lerp(ridgeY + 8, h + overshoot, slopeT) + (rand() - 0.45) * 14;
				const depthY = clamp((baseY - ridgeY) / Math.max(80, h + 90 - ridgeY), 0, 1);
				height = lerp(26, 175, Math.pow(depthY, 0.9)) * (0.78 + rand() * 0.44);
			} else {
				const floor = ridgeY + Math.max(80, layerBottom - ridgeY);
				baseY = clamp(
					lerp(ridgeY + 6, floor, slopeT) + (rand() - 0.45) * 18,
					ridgeY + 3,
					floor,
				);
				const nearness = clamp((baseY - ridgeY) / Math.max(12, floor - ridgeY), 0, 1);
				height = heightBase * lerp(0.5, 1.2, nearness) * (0.75 + rand() * 0.45);
			}
			const fill =
				front && shadeField ? clumpedTreeFill(treeFill, x, baseY, shadeField) : treeFill;
			pines.push(makePine(rand, x, baseY, height, fill, contrast));
		}
	}

	return pines.sort((a, b) => a.baseY - b.baseY);
}

export function composeScene(seed: number, options: ComposeOptions): Scene {
	const rand = mulberry32(seed);
	const palette =
		options.paletteIndex != null
			? (PALETTES[options.paletteIndex % PALETTES.length] ?? PALETTES[0]!)
			: pick(rand, PALETTES);
	const w = FRAME_W;
	const h = FRAME_H;

	const depth = clamp(options.depth, 0, 1);
	const treeAmount = clamp(options.trees, 0, 1);
	const mistAmount = clamp(options.mist, 0, 1);

	const plan = planComposition(rand, w, h);
	// Odd-number preference for layer stacks when depth allows.
	const layerCount =
		options.layerCount != null
			? clamp(Math.round(options.layerCount), 3, 4)
			: depth < 0.34
				? 3
				: depth < 0.72
					? rand() < 0.65
						? 3
						: 4
					: 4;
	const fills = sampleColors(palette.layers, layerCount);
	const treeFills = sampleColors(palette.trees, layerCount);

	const layers: Layer[] = [];
	const baseYs: number[] = [];
	for (let i = 0; i < layerCount; i++) {
		const t = i / Math.max(1, layerCount - 1);
		baseYs.push(lerp(plan.horizon, h * 0.78, Math.pow(t, 0.9)));
	}

	for (let i = 0; i < layerCount; i++) {
		const t = i / Math.max(1, layerCount - 1);
		const baseY = baseYs[i]!;
		const amp = lerp(h * 0.18, h * 0.36, t) * (0.85 + rand() * 0.28);
		const steps = 16 + Math.floor(lerp(6, 16, t));
		const ridge = ridgePath(rand, w, baseY, amp, steps, plan, t);
		const fill = fills[i]!;
		const treeFill = treeFills[i]!;
		const snowChance = t > 0.15 && t < 0.75 ? lerp(0.5, 0.12, t) * (0.35 + depth * 0.5) : 0;
		const front = i === layerCount - 1;
		const layerBottom = front
			? baseY + amp * 0.35
			: lerp(baseY + amp * 0.2, baseYs[i + 1] ?? h * 0.88, 0.95);

		layers.push({
			fill,
			treeFill: front ? fill : treeFill,
			ridge,
			snow: snowPatches(rand, ridge, snowChance, t),
			pines: layerTrees(
				rand,
				w,
				h,
				ridge,
				front ? fill : treeFill,
				t,
				treeAmount,
				layerBottom,
				front,
				plan,
			),
		});
	}

	// One soft veil between each silhouette pair so depth reads as atmosphere, not hard cutouts.
	const mists: Mist[] = [];
	if (mistAmount > 0.02) {
		for (let i = 0; i < layerCount - 1; i++) {
			const ridge = layers[i]!.ridge;
			let sum = 0;
			for (const point of ridge) sum += point.y;
			const contactY = sum / Math.max(1, ridge.length);
			const depthT = i / Math.max(1, layerCount - 2);
			const height = lerp(52, 110, mistAmount) * lerp(0.85, 1.2, depthT) * (0.85 + rand() * 0.3);
			mists.push({
				y: contactY - height * lerp(0.35, 0.55, rand()),
				height,
				color: palette.mist,
				peakOpacity: lerp(0.22, 0.55, mistAmount) * lerp(0.75, 1.05, 1 - depthT * 0.35),
				phase: rand() * Math.PI * 2,
			});
		}
	}

	// Accent at a thirds/golden sky intersection opposite the mass — balance without competing.
	const accent =
		rand() < 0.55
			? {
					x: clamp(
						plan.massSide < 0 ? w * (0.22 + rand() * 0.12) : w * (0.66 + rand() * 0.12),
						w * 0.12,
						w * 0.88,
					),
					y: clamp(plan.skyOpen * (0.35 + rand() * 0.35), h * 0.08, plan.horizon * 0.75),
					r: lerp(9, 22, rand()),
					fill: palette.accent,
				}
			: null;

	return {
		seed,
		w,
		h,
		sky: palette.sky,
		layers,
		mists,
		ground: palette.ground,
		accent,
	};
}

export function pointsToClosedPath(points: Point[], w: number, h: number): string {
	if (points.length === 0) return "";
	const first = points[0]!;
	let d = `M 0 ${h} L ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
	for (let i = 1; i < points.length; i++) {
		const p = points[i]!;
		d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
	}
	d += ` L ${w} ${h} Z`;
	return d;
}

export function polygonPath(points: Point[]): string {
	if (points.length === 0) return "";
	const first = points[0]!;
	let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
	for (let i = 1; i < points.length; i++) {
		const p = points[i]!;
		d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
	}
	return `${d} Z`;
}

export function pinePath(pine: Pine): string {
	const { x, baseY, height, width, tiers, lean, taper, jag } = pine;
	let d = "";
	for (let i = 0; i < tiers; i++) {
		const t = i / Math.max(1, tiers - 0.35);
		const topY = baseY - height + height * t * 0.68;
		const bottomY = baseY - height * (0.12 + (1 - t) * 0.52);
		const half = width * (0.38 + t * (0.55 + taper * 0.35));
		const midX = x + lean * height * (0.15 + t * 0.85);
		const leftJag = half * (1 - jag * (i % 2 === 0 ? 1 : 0.35));
		const rightJag = half * (1 - jag * (i % 2 === 1 ? 1 : 0.35));
		const tipX = midX + lean * height * 0.04;
		d += `M ${tipX.toFixed(1)} ${topY.toFixed(1)} L ${(midX - leftJag).toFixed(1)} ${bottomY.toFixed(1)} L ${(midX + rightJag).toFixed(1)} ${bottomY.toFixed(1)} Z `;
	}
	const trunkW = width * (0.05 + jag * 0.08);
	const trunkTop = baseY - height * 0.14;
	const trunkLean = lean * height * 0.08;
	d += `M ${(x - trunkW + trunkLean * 0.2).toFixed(1)} ${baseY.toFixed(1)} L ${(x + trunkW + trunkLean * 0.2).toFixed(1)} ${baseY.toFixed(1)} L ${(x + trunkW * 0.7 + trunkLean).toFixed(1)} ${trunkTop.toFixed(1)} L ${(x - trunkW * 0.7 + trunkLean).toFixed(1)} ${trunkTop.toFixed(1)} Z`;
	return d;
}

export function sceneSnow(scene: Scene): string {
	for (const palette of PALETTES) {
		if (palette.ground === scene.ground) return palette.snow;
	}
	return "#e6ebf1";
}

/** Soft undulating mist band — transparent edges, denser mid. */
export function mistBandPath(mist: Mist, w: number): string {
	const steps = 14;
	const top: Point[] = [];
	const bottom: Point[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = t * w;
		const wave =
			Math.sin(t * Math.PI * 2.2 + mist.phase) * mist.height * 0.12 +
			Math.sin(t * Math.PI * 4.1 + mist.phase * 1.7) * mist.height * 0.06;
		const bulge = Math.sin(t * Math.PI) * mist.height * 0.08;
		top.push({ x, y: mist.y + wave - bulge });
		bottom.push({
			x,
			y: mist.y + mist.height + wave * 0.55 + bulge * 0.4,
		});
	}
	const first = top[0]!;
	let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
	for (let i = 1; i < top.length; i++) {
		const p = top[i]!;
		d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
	}
	for (let i = bottom.length - 1; i >= 0; i--) {
		const p = bottom[i]!;
		d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
	}
	return `${d} Z`;
}

function mistMarkup(mist: Mist, w: number, id: string): string {
	const opacity = mist.peakOpacity.toFixed(3);
	return [
		`<defs>`,
		`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">`,
		`<stop offset="0%" stop-color="${mist.color}" stop-opacity="0"/>`,
		`<stop offset="35%" stop-color="${mist.color}" stop-opacity="${opacity}"/>`,
		`<stop offset="62%" stop-color="${mist.color}" stop-opacity="${opacity}"/>`,
		`<stop offset="100%" stop-color="${mist.color}" stop-opacity="0"/>`,
		`</linearGradient>`,
		`</defs>`,
		`<path d="${mistBandPath(mist, w)}" fill="url(#${id})"/>`,
	].join("");
}

/** Stable seed from a sketch id so each thumbnail stays unique and repeatable. */
export function seedFromId(id: string): number {
	let hash = 2166136261;
	for (let i = 0; i < id.length; i++) {
		hash ^= id.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function renderLayerMarkup(
	scene: Scene,
	layers: Layer[],
	options: {
		sky?: boolean;
		accent?: boolean;
		/** Global mist indexes drawn after each local layer (by local order). */
		mistAfterLocal?: number[];
		/** Extra mist drawn after all local layers (between parallax stacks). */
		mistTail?: number[];
		idPrefix?: string;
	},
): string {
	const snow = sceneSnow(scene);
	const prefix = options.idPrefix ?? "m";
	const parts: string[] = [];
	if (options.sky) {
		parts.push(
			`<defs><linearGradient id="${prefix}-sky" x1="0" y1="0" x2="0" y2="1">`,
			`<stop offset="0%" stop-color="${scene.sky[0]}"/>`,
			`<stop offset="100%" stop-color="${scene.sky[1]}"/>`,
			`</linearGradient></defs>`,
			`<rect width="${scene.w}" height="${scene.h}" fill="url(#${prefix}-sky)"/>`,
		);
	}
	if (options.accent && scene.accent) {
		parts.push(
			`<circle cx="${scene.accent.x.toFixed(1)}" cy="${scene.accent.y.toFixed(1)}" r="${scene.accent.r.toFixed(1)}" fill="${scene.accent.fill}"/>`,
		);
	}
	layers.forEach((layer, localIndex) => {
		parts.push(`<path d="${pointsToClosedPath(layer.ridge, scene.w, scene.h)}" fill="${layer.fill}"/>`);
		for (const patch of layer.snow) {
			parts.push(`<path d="${polygonPath(patch)}" fill="${snow}" opacity="0.7"/>`);
		}
		for (const pine of layer.pines) {
			parts.push(`<path d="${pinePath(pine)}" fill="${pine.fill}"/>`);
		}
		const mistIndex = options.mistAfterLocal?.[localIndex];
		if (mistIndex != null) {
			const mist = scene.mists[mistIndex];
			if (mist) parts.push(mistMarkup(mist, scene.w, `${prefix}-mist-${mistIndex}`));
		}
	});
	for (const mistIndex of options.mistTail ?? []) {
		const mist = scene.mists[mistIndex];
		if (mist) parts.push(mistMarkup(mist, scene.w, `${prefix}-mist-tail-${mistIndex}`));
	}
	return parts.join("");
}

function wrapSvg(scene: Scene, body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.w} ${scene.h}" width="${scene.w}" height="${scene.h}">${body}</svg>`;
}

export function sceneToSvg(scene: Scene): string {
	return wrapSvg(
		scene,
		renderLayerMarkup(scene, scene.layers, {
			sky: true,
			accent: true,
			mistAfterLocal: scene.layers.map((_, index) => index),
			idPrefix: "full",
		}),
	);
}

/** Split a scene into back / mid / front SVGs for parallax thumbnails. */
export function sceneToParallaxSvgs(scene: Scene): [string, string, string] {
	const count = Math.max(1, scene.layers.length);
	const backCount = Math.max(1, Math.ceil(count / 3));
	const midCount = Math.max(1, Math.floor(count / 3));
	const back = scene.layers.slice(0, backCount);
	const mid = scene.layers.slice(backCount, backCount + midCount);
	const front = scene.layers.slice(backCount + midCount);

	// Parallax thumbs stay crisp; live mist is layered in CSS between the PNGs.
	return [
		wrapSvg(
			scene,
			renderLayerMarkup(scene, back, {
				sky: true,
				accent: true,
				idPrefix: "back",
			}),
		),
		wrapSvg(
			scene,
			renderLayerMarkup(scene, mid.length ? mid : back.slice(-1), {
				idPrefix: "mid",
			}),
		),
		wrapSvg(
			scene,
			renderLayerMarkup(scene, front.length ? front : scene.layers.slice(-1), {
				idPrefix: "front",
			}),
		),
	];
}
