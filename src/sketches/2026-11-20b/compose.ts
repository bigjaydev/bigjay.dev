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
	y: number;
	height: number;
	fill: string;
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
};

const PALETTES = [
	{
		sky: ["#d9dee6", "#b7c0cc"] as [string, string],
		// back → front ridge fills
		layers: ["#aeb6c2", "#87919f", "#556070", "#2a323f"],
		trees: ["#a6aeb9", "#748090", "#3f4a59", "#141a22"],
		snow: "#e6ebf1",
		mist: "rgba(214, 220, 228, 0.38)",
		ground: "#1c222c",
		accent: "rgba(232, 236, 242, 0.55)",
	},
	{
		sky: ["#dde2e0", "#b8c2bf"] as [string, string],
		layers: ["#aeb8b4", "#879490", "#55635e", "#283330"],
		trees: ["#a6b0ab", "#74827c", "#3f4d48", "#121916"],
		snow: "#e8eeeb",
		mist: "rgba(216, 222, 218, 0.36)",
		ground: "#1a211f",
		accent: "rgba(236, 240, 237, 0.5)",
	},
	{
		sky: ["#e0dde4", "#c0bbc8"] as [string, string],
		layers: ["#b4aebc", "#908a99", "#5c5666", "#2e2936"],
		trees: ["#aca6b4", "#7c7686", "#45404f", "#16131c"],
		snow: "#ece8f0",
		mist: "rgba(220, 216, 226, 0.36)",
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

function ridgePath(
	rand: () => number,
	w: number,
	baseY: number,
	amp: number,
	steps: number,
	focusX: number,
	focusBoost: number,
): Point[] {
	const sideA = clamp(focusX + (rand() < 0.5 ? -1 : 1) * w * (0.18 + rand() * 0.16), w * 0.12, w * 0.88);
	const sideB = clamp(w * (0.15 + rand() * 0.7), w * 0.1, w * 0.9);
	const sideBoostA = amp * (0.25 + rand() * 0.35);
	const sideBoostB = amp * (0.12 + rand() * 0.25);
	const phase = rand() * Math.PI * 2;

	const points: Point[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = t * w;
		const focus = smoothstep(1 - Math.min(1, Math.abs(x - focusX) / (w * 0.38)));
		const secondary =
			smoothstep(1 - Math.min(1, Math.abs(x - sideA) / (w * 0.22))) * sideBoostA +
			smoothstep(1 - Math.min(1, Math.abs(x - sideB) / (w * 0.18))) * sideBoostB;
		const roll = Math.sin(t * Math.PI * 2.1 + phase) * amp * 0.12;
		const jag = (rand() - 0.5) * amp * 0.08;
		const lift = focus * amp * focusBoost + secondary + roll + jag;
		const edgeSettle = smoothstep(Math.min(t, 1 - t) * 4);
		points.push({ x, y: baseY - amp * 0.12 - lift * (0.35 + edgeSettle * 0.65) });
	}
	points[0] = { x: 0, y: baseY - amp * 0.08 };
	points[points.length - 1] = { x: w, y: baseY - amp * (0.06 + rand() * 0.12) };
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
	focusX: number,
	layerBottom: number,
	front: boolean,
): Pine[] {
	const pines: Pine[] = [];
	// Front crowns the landmass. Back/mid layers fill the whole slope body as a forest field.
	const rows = front
		? 3 + Math.round(lerp(1, 2, amount))
		: 14 + Math.round(lerp(8, 4, contrast) * lerp(1, 1.3, amount));
	const heightBase = front ? lerp(48, 110, amount) : lerp(14, 72, contrast);

	for (let row = 0; row < rows; row++) {
		const rowT = rows === 1 ? 0.4 : row / (rows - 1);
		const slopeT = front ? lerp(0.05, 0.28, rowT) : Math.pow(rowT, 0.75);
		// Keep mid (contrast ~0.3–0.7) and back dense; only ease off at the front.
		const depthBoost = contrast < 0.75 ? lerp(3.6, 2.2, contrast / 0.75) : 1;
		const count = Math.round(
			(front ? lerp(48, 78, amount) : lerp(240, 140, contrast) * depthBoost) *
				lerp(1.05, 1.35, amount) *
				lerp(1.15, 0.95, rowT),
		);
		const spacing = w / Math.max(1, count);
		const stagger = (row % 2) * spacing * 0.5;

		for (let i = 0; i < count; i++) {
			const x = i * spacing + stagger + (rand() - 0.5) * spacing * 0.55;
			if (x < -14 || x > w + 14) continue;

			const awayFromFocus = clamp(Math.abs(x - focusX) / (w * 0.5), 0, 1);
			if (contrast < 0.25 && awayFromFocus < 0.12 && row === 0 && rand() < 0.35) continue;

			const ridgeY = sampleRidgeY(ridge, clamp(x, 0, w));
			// Back layers: use the full band down to the next layer, not a short crest fringe.
			const maxDrop = front
				? lerp(18, 46, amount)
				: Math.max(80, layerBottom - ridgeY);
			const floor = ridgeY + maxDrop;
			const baseY = clamp(
				lerp(ridgeY + 4, floor, slopeT) + (rand() - 0.45) * (front ? 10 : 18),
				ridgeY + 2,
				Math.min(floor, h * (front ? 0.92 : 0.98)),
			);
			const nearness = clamp((baseY - ridgeY) / Math.max(12, maxDrop), 0, 1);
			const height =
				heightBase *
				lerp(front ? 0.85 : 0.5, front ? 1.25 : 1.2, nearness) *
				(0.7 + rand() * 0.55) *
				(0.88 + awayFromFocus * 0.14);
			pines.push(makePine(rand, x, baseY, height, treeFill, contrast));
		}
	}

	if (front) {
		const extras = Math.round(lerp(6, 14, amount));
		for (let i = 0; i < extras; i++) {
			const x = (rand() < 0.5 ? rand() * 0.34 : 0.66 + rand() * 0.34) * w;
			const ridgeY = sampleRidgeY(ridge, clamp(x, 0, w));
			const baseY = ridgeY + lerp(8, 28, rand());
			pines.push(makePine(rand, x, baseY, lerp(90, 140, rand()), treeFill, contrast));
		}
	}

	return pines.sort((a, b) => a.baseY - b.baseY);
}

export function composeScene(seed: number, options: ComposeOptions): Scene {
	const rand = mulberry32(seed);
	const palette = pick(rand, PALETTES);
	const w = FRAME_W;
	const h = FRAME_H;

	const depth = clamp(options.depth, 0, 1);
	const treeAmount = clamp(options.trees, 0, 1);
	const mistAmount = clamp(options.mist, 0, 1);

	const layerCount = depth < 0.34 ? 3 : depth < 0.72 ? 3 + (rand() < 0.45 ? 1 : 0) : 4;
	const fills = sampleColors(palette.layers, layerCount);
	const treeFills = sampleColors(palette.trees, layerCount);

	const skyWeight = 0.3 + rand() * 0.14;
	const horizon = h * (skyWeight + 0.1);

	const focusChoice = rand();
	const focusX =
		focusChoice < 0.38
			? w * (0.28 + rand() * 0.08)
			: focusChoice < 0.76
				? w * (0.64 + rand() * 0.1)
				: w * (0.46 + rand() * 0.08);

	const layers: Layer[] = [];
	const baseYs: number[] = [];
	for (let i = 0; i < layerCount; i++) {
		const t = i / Math.max(1, layerCount - 1);
		baseYs.push(lerp(horizon, h * 0.78, Math.pow(t, 0.9)));
	}

	for (let i = 0; i < layerCount; i++) {
		const t = i / Math.max(1, layerCount - 1);
		const baseY = baseYs[i]!;
		const amp = lerp(h * 0.18, h * 0.36, t) * (0.85 + rand() * 0.28);
		const steps = 16 + Math.floor(lerp(6, 16, t));
		const focusBoost = lerp(0.4, 1.1, t) * (0.75 + rand() * 0.4);
		const ridge = ridgePath(rand, w, baseY, amp, steps, focusX, focusBoost);
		const fill = fills[i]!;
		const treeFill = treeFills[i]!;
		const snowChance = t > 0.15 && t < 0.75 ? lerp(0.5, 0.12, t) * (0.35 + depth * 0.5) : 0;
		const front = i === layerCount - 1;
		// Give back/mid forests a deep slope band before the next silhouette covers them.
		const layerBottom = front
			? baseY + amp * 0.35
			: lerp(baseY + amp * 0.2, baseYs[i + 1] ?? h * 0.88, 0.95);

		layers.push({
			fill,
			treeFill: front ? fill : treeFill, // front trunks melt into the landmass
			ridge,
			snow: snowPatches(rand, ridge, snowChance, t),
			pines: layerTrees(rand, w, h, ridge, front ? fill : treeFill, t, treeAmount, focusX, layerBottom, front),
		});
	}

	const mists: Mist[] = [];
	const mistBands = Math.round(lerp(0, 3, mistAmount));
	for (let i = 0; i < mistBands; i++) {
		const t = (i + 1) / (mistBands + 1);
		mists.push({
			y: lerp(horizon - 16, h * 0.68, t),
			height: lerp(24, 56, mistAmount) * (0.7 + rand() * 0.45),
			fill: palette.mist,
		});
	}

	const accent =
		rand() < 0.4
			? {
					x: lerp(w * 0.12, w * 0.88, rand()),
					y: lerp(h * 0.1, horizon * 0.85, rand()),
					r: lerp(10, 26, rand()),
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
