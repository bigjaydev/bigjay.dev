/** Twelve kilometres on a side. The playable basin sits inside a rim of mountains. */
export const WORLD = 12000;
export const HALF = WORLD / 2;
export const LIMIT = 5200;
export const RADAR_RANGE = 780;

export const CRATER = { x: 2500, z: 700, radius: 1700 };
export const WATER_Y = -8;

export const START = { x: -4700, z: -2500 };

const SEED = 20261118;

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function wrapAngle(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function dampAngle(current: number, target: number, dt: number, rate: number): number {
	return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

/** Yaw that points from one point toward another. Zero looks along +Z. */
export function yawTo(x: number, z: number, tx: number, tz: number): number {
	return Math.atan2(tx - x, tz - z);
}

function hash2(ix: number, iz: number): number {
	let n = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
	n = Math.imul(n ^ SEED, 1274126177);
	n = n ^ (n >>> 13);
	return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
	const x0 = Math.floor(x);
	const z0 = Math.floor(z);
	const tx = x - x0;
	const tz = z - z0;
	const sx = tx * tx * (3 - 2 * tx);
	const sz = tz * tz * (3 - 2 * tz);
	const v00 = hash2(x0, z0);
	const v10 = hash2(x0 + 1, z0);
	const v01 = hash2(x0, z0 + 1);
	const v11 = hash2(x0 + 1, z0 + 1);
	const a = v00 + (v10 - v00) * sx;
	const b = v01 + (v11 - v01) * sx;
	return a + (b - a) * sz;
}

function craterDelta(x: number, z: number): number {
	const dx = x - CRATER.x;
	const dz = z - CRATER.z;
	const dist = Math.hypot(dx, dz);
	const radius = CRATER.radius;
	if (dist >= radius) return 0;
	const unit = dist / radius;
	const island = 240;
	let bowl = Math.cos(unit * Math.PI) * 0.5 + 0.5;
	if (dist < island) bowl = 0;
	else bowl *= clamp((dist - island) / 200, 0, 1);
	let delta = -bowl * 62;
	const rim = Math.exp(-((unit - 0.86) ** 2) / 0.0032);
	delta += rim * 30;
	if (dist < island) delta += 6 * (1 - dist / island);
	return delta;
}

function borderDelta(x: number, z: number): number {
	const edge = Math.min(HALF - Math.abs(x), HALF - Math.abs(z));
	if (edge >= 1500) return 0;
	const t = 1 - edge / 1500;
	return t * t * t * 340;
}

/** Rolling hills under the cliffs. Pads are founded on this, so bases stay flat. */
export function baseHeight(x: number, z: number): number {
	const broad = valueNoise(x * 0.00019 + 2, z * 0.00017 - 1) - 0.5;
	const hills = valueNoise(x * 0.00062 + 19, z * 0.00058 - 7) - 0.5;
	const dunes = valueNoise(x * 0.0015 + 4, z * 0.0015 - 3) - 0.5;
	return broad * 78 + hills * 36 + dunes * 8 + craterDelta(x, z) + borderDelta(x, z);
}

function escarp(field: number, freq: number, x: number, z: number): number {
	const folded = field - Math.round(field);
	const dist = folded / freq;
	const pass = valueNoise(x * 0.00085 + field * 3, z * 0.00085 - 2);
	const open = pass > 0.58;
	const amp = open ? 3 : 22;
	const s = dist / (open ? 36 : 8);
	return (s / Math.sqrt(1 + s * s)) * amp;
}

function scarpField(x: number, z: number): number {
	const warp = valueNoise(x * 0.00055 + 3, z * 0.00048) - 0.5;
	const warp2 = valueNoise(x * 0.00115 + 1.2, z * 0.00105) - 0.5;
	const field = x * 0.0007 + z * 0.00022 + warp * 1.15 + warp2 * 0.4;
	const cliff = escarp(field, 0.00086, x, z);
	const ridge = valueNoise(x * 0.00095 + 8, z * 0.00125 - 3);
	const spine = 1 - Math.abs(ridge * 2 - 1);
	const crest = spine > 0.78 ? (spine - 0.78) / 0.22 : 0;
	return cliff + crest * crest * 32;
}

function channel(dist: number, floor: number, lip: number): number {
	if (dist >= lip) return 0;
	if (dist <= floor) return -1;
	const t = (dist - floor) / (lip - floor);
	const s = t * t * (3 - 2 * t);
	return -(1 - s);
}

function canyonCut(x: number, z: number): number {
	const x1 = -1700 + Math.sin(z * 0.00072) * 540 + Math.sin(z * 0.0019) * 140;
	const fade1 = clamp(1 - Math.abs(z) / 4600, 0, 1);
	const lip1 = 46 + (valueNoise(z * 0.0016, 4.2) > 0.74 ? 36 : 0);
	const cut1 = channel(Math.abs(x - x1), 30, lip1) * 40 * fade1;

	const z2 = -900 + Math.sin(x * 0.00048) * 420 + Math.sin(x * 0.0014 + 2) * 90;
	const fade2 = clamp(1 - Math.abs(x + 400) / 5200, 0, 1);
	const lip2 = 42 + (valueNoise(x * 0.0015, 8.4) > 0.76 ? 40 : 0);
	const cut2 = channel(Math.abs(z - z2), 26, lip2) * 34 * fade2;

	const x3 = 2200 + Math.sin(z * 0.0011 + 1.4) * 280;
	const fade3 = clamp((z + 800) / 1800, 0, 1) * clamp((3200 - z) / 1200, 0, 1);
	const cut3 = channel(Math.abs(x - x3), 18, 40) * 28 * fade3;
	return cut1 + cut2 + cut3;
}

function mesa(x: number, z: number): number {
	if (x < 400) return 0;
	const blend = clamp((x - 400) / 900, 0, 1);
	const n = valueNoise(x * 0.00072 + 6, z * 0.00068 - 4);
	const step = Math.round(n * 5) / 5;
	return (step - 0.5) * 42 * blend;
}

function outcrop(x: number, z: number): number {
	const n = valueNoise(x * 0.0036 + 11, z * 0.0036 - 2);
	if (n < 0.8) return 0;
	const t = (n - 0.8) / 0.2;
	return t * t * 18;
}

function featureMask(x: number, z: number): number {
	let mask = 1;
	for (const pad of PADS) {
		const dist = Math.hypot(x - pad.x, z - pad.z);
		const inner = pad.flat + 24;
		if (dist < inner) return 0;
		if (dist < inner + 110) mask = Math.min(mask, (dist - inner) / 110);
	}
	const crater = Math.hypot(x - CRATER.x, z - CRATER.z);
	if (crater < CRATER.radius * 0.92) return 0;
	if (crater < CRATER.radius * 1.08)
		mask = Math.min(mask, (crater - CRATER.radius * 0.92) / (CRATER.radius * 0.16));
	return mask;
}

/** Ground before the roads are cut through it. */
export function landHeight(x: number, z: number): number {
	return (
		baseHeight(x, z) +
		(scarpField(x, z) + canyonCut(x, z) + mesa(x, z) + outcrop(x, z)) * featureMask(x, z)
	);
}

type Stamp = { x: number; z: number; h: number };

const ROUTES: Array<Array<[number, number]>> = [
	[
		[-4700, -2500],
		[-3900, -2200],
		[-3000, -2000],
		[-1800, -1750],
		[-600, -1550],
		[250, -1400],
		[1100, -700],
		[1800, -100],
		[2500, 700],
	],
	[
		[-4700, -2500],
		[-4000, -3200],
		[-3100, -3800],
		[-2100, -4200],
	],
	[
		[-4700, -2500],
		[-4500, -1400],
		[-4100, -200],
		[-3600, 800],
		[-3300, 1500],
	],
	[
		[-3300, 1500],
		[-2400, 900],
		[-1200, 0],
		[-200, -800],
		[250, -1400],
	],
	[
		[2500, 700],
		[2100, 1300],
		[1600, 1900],
		[1200, 2400],
	],
	[
		[1200, 2400],
		[400, 2100],
		[-800, 1900],
		[-2000, 1700],
		[-3300, 1500],
	],
	[
		[-4700, -2500],
		[2500, 700],
	],
	[
		[-4700, -2500],
		[-2100, -4200],
	],
	[
		[-4700, -2500],
		[-3300, 1500],
	],
	[
		[-4700, -2500],
		[250, -1400],
	],
	[
		[-4700, -2500],
		[1200, 2400],
	],
];

const ROAD_BIN = 220;
const roadBins = new Map<number, Stamp[]>();

function roadKey(ix: number, iz: number): number {
	return (ix + 64) * 512 + (iz + 64);
}

function densify(points: Array<[number, number]>, step: number): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = 0; i < points.length - 1; i++) {
		const [x0, z0] = points[i];
		const [x1, z1] = points[i + 1];
		const length = Math.hypot(x1 - x0, z1 - z0);
		const count = Math.max(1, Math.ceil(length / step));
		for (let k = 0; k < count; k++) {
			const t = k / count;
			out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
		}
	}
	out.push(points[points.length - 1]);
	return out;
}

function buildRoads() {
	for (const route of ROUTES) {
		const points = densify(route, 36);
		let height = landHeight(points[0][0], points[0][1]);
		for (let i = 0; i < points.length; i++) {
			const [x, z] = points[i];
			if (i > 0) {
				const dist = Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
				const land = landHeight(x, z);
				height = clamp(land, height - dist * 0.4, height + dist * 0.2);
			}
			const stamp = { x, z, h: height };
			const key = roadKey(Math.floor(x / ROAD_BIN), Math.floor(z / ROAD_BIN));
			const list = roadBins.get(key);
			if (list) list.push(stamp);
			else roadBins.set(key, [stamp]);
		}
	}
}

function roadWeight(dist: number): number {
	if (dist <= 72) return 1;
	if (dist >= 180) return 0;
	const t = (dist - 72) / (180 - 72);
	const s = t * t * (3 - 2 * t);
	return 1 - s;
}

/** How strongly a graded road owns this point, and the height it wants. */
export function roadAt(x: number, z: number): { h: number; weight: number } | null {
	const ix = Math.floor(x / ROAD_BIN);
	const iz = Math.floor(z / ROAD_BIN);
	let weightSum = 0;
	let heightSum = 0;
	let nearest = 1e9;
	for (let dz = -1; dz <= 1; dz++) {
		for (let dx = -1; dx <= 1; dx++) {
			const list = roadBins.get(roadKey(ix + dx, iz + dz));
			if (!list) continue;
			for (const stamp of list) {
				const dist = Math.hypot(stamp.x - x, stamp.z - z);
				if (dist > 190) continue;
				const weight = 1 / (10 + dist);
				weightSum += weight;
				heightSum += stamp.h * weight;
				if (dist < nearest) nearest = dist;
			}
		}
	}
	if (weightSum <= 0) return null;
	const weight = roadWeight(nearest);
	if (weight <= 0) return null;
	return { h: heightSum / weightSum, weight };
}

/** Hills, scarps, canyons, and the roads cut through them. */
export function rawHeight(x: number, z: number): number {
	const land = landHeight(x, z);
	const road = roadAt(x, z);
	if (!road) return land;
	return land + (road.h - land) * road.weight;
}

export type StructureKind = "base" | "relay" | "citadel" | "supply" | "tower";

export type Pad = {
	id: string;
	kind: StructureKind;
	name: string;
	x: number;
	z: number;
	y: number;
	flat: number;
	hp: number;
};

const SPECS: Array<Omit<Pad, "y">> = [
	{ id: "base", kind: "base", name: "Firebase", x: START.x, z: START.z, flat: 58, hp: 0 },
	{ id: "kite", kind: "relay", name: "Kite", x: -2100, z: -4200, flat: 42, hp: 300 },
	{ id: "mast", kind: "relay", name: "Mast", x: -3300, z: 1500, flat: 42, hp: 300 },
	{ id: "spur", kind: "relay", name: "Spur", x: 250, z: -1400, flat: 42, hp: 300 },
	{ id: "cairn", kind: "relay", name: "Cairn", x: 1200, z: 2400, flat: 44, hp: 320 },
	{ id: "citadel", kind: "citadel", name: "Citadel", x: CRATER.x, z: CRATER.z, flat: 90, hp: 1400 },
	{
		id: "supply-start",
		kind: "supply",
		name: "Supply",
		x: START.x + 22,
		z: START.z - 20,
		flat: 16,
		hp: 0,
	},
	{ id: "supply-west", kind: "supply", name: "Supply", x: -2500, z: -600, flat: 16, hp: 0 },
	{ id: "supply-mid", kind: "supply", name: "Supply", x: -350, z: 350, flat: 16, hp: 0 },
	{ id: "supply-rim", kind: "supply", name: "Supply", x: 1550, z: 450, flat: 16, hp: 0 },
];

export const PADS: Pad[] = SPECS.map((spec) => ({ ...spec, y: baseHeight(spec.x, spec.z) }));

buildRoads();

export function terrainHeight(x: number, z: number): number {
	let height = rawHeight(x, z);
	for (const pad of PADS) {
		const dx = x - pad.x;
		const dz = z - pad.z;
		const reach = pad.flat;
		const distSq = dx * dx + dz * dz;
		if (distSq >= reach * reach) continue;
		const unit = 1 - Math.sqrt(distSq) / reach;
		const blend = unit * unit * (3 - 2 * unit);
		height += (pad.y - height) * blend;
	}
	return height;
}

/** Ground the hovercraft sits on. The crater holds a ring lake around the citadel island. */
export function surface(x: number, z: number): number {
	const ground = terrainHeight(x, z);
	if (ground >= WATER_Y) return ground;
	const dist = Math.hypot(x - CRATER.x, z - CRATER.z);
	if (dist > 200 && dist < 1080) return WATER_Y;
	return ground;
}

export function groundNormal(x: number, z: number): { x: number; y: number; z: number } {
	const step = 3.5;
	const left = surface(x - step, z);
	const right = surface(x + step, z);
	const down = surface(x, z - step);
	const up = surface(x, z + step);
	const nx = left - right;
	const nz = down - up;
	const ny = step * 2;
	const length = Math.hypot(nx, ny, nz) || 1;
	return { x: nx / length, y: ny / length, z: nz / length };
}

export type Geyser = { x: number; z: number; y: number };

const GEYSER_SPOTS: Array<[number, number]> = [
	[-1500, -2500],
	[-900, -3600],
	[-3100, 500],
	[-1700, 2300],
	[700, 1300],
	[1900, -700],
	[3400, 1500],
	[2100, 1900],
	[4000, 250],
	[900, -2700],
	[-4300, -900],
	[3100, -200],
	[2500, 1650],
	[-200, -2000],
];

export const GEYSERS: Geyser[] = GEYSER_SPOTS.map(([x, z]) => ({ x, z, y: surface(x, z) }));

export type PropKind = 0 | 1 | 2 | 3 | 4 | 5;

export type Prop = {
	x: number;
	y: number;
	z: number;
	yaw: number;
	sx: number;
	sy: number;
	sz: number;
	kind: PropKind;
	radius: number;
};

const ROCK_STEP = 72;
const RUIN_STEP = 680;
const ROCK_REACH = 640;

const RUINS: Array<[number, number, number]> = [
	[-4380, -2280, 0.9],
	[-4120, -2680, 2.1],
	[-3900, -1700, 0.4],
	[-3000, -3200, 1.1],
	[-2200, -900, 2.2],
	[-900, -2100, 0.6],
	[200, -700, 1.7],
	[1600, -1800, 0.2],
	[-3500, 600, 2.5],
	[-600, 1600, 1.3],
	[2700, 1900, 0.8],
	[3900, -400, 1.6],
	[-1400, 2800, 0.35],
	[800, 900, 2.0],
];

let rockOriginX = Number.POSITIVE_INFINITY;
let rockOriginZ = 0;
let rockCache: Prop[] = [];

const blockerPool: Prop[] = Array.from({ length: 64 }, () => ({
	x: 0,
	y: 0,
	z: 0,
	yaw: 0,
	sx: 1,
	sy: 1,
	sz: 1,
	kind: 0,
	radius: 1,
}));
let blockerCount = 0;

function rockBlocked(x: number, z: number): boolean {
	for (const pad of PADS) {
		const reach = pad.kind === "supply" ? 14 : pad.flat + 10;
		const dx = x - pad.x;
		const dz = z - pad.z;
		if (dx * dx + dz * dz < reach * reach) return true;
	}
	return false;
}

function pushProp(
	out: Prop[],
	x: number,
	z: number,
	yaw: number,
	sx: number,
	sy: number,
	sz: number,
	kind: PropKind,
	radius: number,
) {
	if (rockBlocked(x, z)) return;
	const road = roadAt(x, z);
	if (road && road.weight > 0.72) return;
	const ground = surface(x, z);
	if (ground <= WATER_Y + 0.5) return;
	out.push({ x, y: ground, z, yaw, sx, sy, sz, kind, radius });
}

function emitRock(out: Prop[], ix: number, iz: number) {
	const roll = hash2(ix + 19, iz - 41);
	if (roll > 0.4) return;
	const x = ix * ROCK_STEP + (hash2(ix + 3, iz) - 0.5) * ROCK_STEP * 0.85;
	const z = iz * ROCK_STEP + (hash2(ix, iz + 7) - 0.5) * ROCK_STEP * 0.85;
	const size = hash2(ix + 11, iz - 5);
	const yaw = hash2(ix - 8, iz + 4) * Math.PI * 2;
	const kind: PropKind = size > 0.84 ? 1 : size > 0.58 ? 2 : 0;
	if (kind === 1) {
		pushProp(out, x, z, yaw, 1.3 + size, 2.6 + size * 3.2, 1.3 + size, 1, 1.5);
	} else if (kind === 2) {
		pushProp(
			out,
			x,
			z,
			yaw,
			2.2 + size * 2.4,
			0.55 + size * 0.4,
			1.5 + size * 1.4,
			2,
			1.6 + size * 1.8,
		);
	} else {
		const scale = 3.2 + size * 6.4;
		pushProp(out, x, z, yaw, scale, scale * (0.7 + size * 0.45), scale * 0.9, 0, scale * 0.58);
	}
	if (size > 0.7) {
		const ox = (hash2(ix + 21, iz) - 0.5) * 14;
		const oz = (hash2(ix, iz - 9) - 0.5) * 14;
		const pebble = 1.4 + size * 1.6;
		pushProp(out, x + ox, z + oz, yaw + 1.2, pebble, pebble * 0.8, pebble, 0, pebble * 0.55);
	}
}

function emitRuin(out: Prop[], x: number, z: number, yaw: number) {
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	const place = (
		lx: number,
		lz: number,
		kind: PropKind,
		sx: number,
		sy: number,
		sz: number,
		radius: number,
		turn = 0,
	) => {
		pushProp(out, x + lx * c - lz * s, z + lx * s + lz * c, yaw + turn, sx, sy, sz, kind, radius);
	};
	place(-7, -5, 4, 5.5, 2.4, 1.4, 3.4);
	place(6, -5, 4, 4.2, 1.7, 1.3, 2.8, 0.08);
	place(-6, 5, 4, 4.6, 2.8, 1.3, 3.1, 0.04);
	place(5, 6, 4, 3.4, 1.2, 1.2, 2.4, -0.1);
	place(-2.5, 0, 3, 1, 3.6, 1, 1.15);
	place(2.4, 0.6, 3, 1, 1.7, 1, 1.05, 0.4);
	place(0, -1.5, 5, 3.8, 0.45, 1.1, 2.2, 0.6);
	place(1.2, 2.4, 2, 2.6, 0.5, 1.8, 1.7, 0.3);
}

function emitRuinCell(out: Prop[], ix: number, iz: number) {
	const roll = hash2(ix + 90, iz - 17);
	if (roll < 0.62) return;
	const x = ix * RUIN_STEP + (hash2(ix, iz + 3) - 0.5) * 220;
	const z = iz * RUIN_STEP + (hash2(ix + 4, iz) - 0.5) * 220;
	emitRuin(out, x, z, roll * Math.PI * 2);
}

function propsNear(x: number, z: number, reach: number, out: Prop[]) {
	const rockSpan = reach + ROCK_STEP;
	const ix0 = Math.floor((x - rockSpan) / ROCK_STEP);
	const ix1 = Math.floor((x + rockSpan) / ROCK_STEP);
	const iz0 = Math.floor((z - rockSpan) / ROCK_STEP);
	const iz1 = Math.floor((z + rockSpan) / ROCK_STEP);
	for (let iz = iz0; iz <= iz1; iz++) {
		for (let ix = ix0; ix <= ix1; ix++) emitRock(out, ix, iz);
	}
	const ruinSpan = reach + 40;
	const rx0 = Math.floor((x - ruinSpan) / RUIN_STEP);
	const rx1 = Math.floor((x + ruinSpan) / RUIN_STEP);
	const rz0 = Math.floor((z - ruinSpan) / RUIN_STEP);
	const rz1 = Math.floor((z + ruinSpan) / RUIN_STEP);
	for (let iz = rz0; iz <= rz1; iz++) {
		for (let ix = rx0; ix <= rx1; ix++) emitRuinCell(out, ix, iz);
	}
	for (const [rx, rz, yaw] of RUINS) {
		if ((rx - x) ** 2 + (rz - z) ** 2 > (reach + 24) ** 2) continue;
		emitRuin(out, rx, rz, yaw);
	}
}

/** Boulders, slabs, and ruins near the camera. Rebuilt when the tank travels a short way. */
export function rocksAround(x: number, z: number): Prop[] {
	if (Math.abs(x - rockOriginX) < 36 && Math.abs(z - rockOriginZ) < 36) return rockCache;
	rockOriginX = x;
	rockOriginZ = z;
	const props: Prop[] = [];
	propsNear(x, z, ROCK_REACH, props);
	rockCache = props.filter(
		(prop) => (prop.x - x) ** 2 + (prop.z - z) ** 2 <= ROCK_REACH * ROCK_REACH,
	);
	return rockCache;
}

function takeBlocker(): Prop | null {
	if (blockerCount >= blockerPool.length) return null;
	const prop = blockerPool[blockerCount];
	blockerCount += 1;
	return prop;
}

/** Solids that stop a tank. Reuses one buffer, so read it before the next call. */
export function gatherBlockers(x: number, z: number): number {
	blockerCount = 0;
	const found: Prop[] = [];
	propsNear(x, z, 20, found);
	for (const prop of found) {
		if ((prop.x - x) ** 2 + (prop.z - z) ** 2 > (prop.radius + 6) ** 2) continue;
		const slot = takeBlocker();
		if (!slot) break;
		slot.x = prop.x;
		slot.y = prop.y;
		slot.z = prop.z;
		slot.yaw = prop.yaw;
		slot.sx = prop.sx;
		slot.sy = prop.sy;
		slot.sz = prop.sz;
		slot.kind = prop.kind;
		slot.radius = prop.radius;
	}
	return blockerCount;
}

export function blockerAt(index: number): Prop {
	return blockerPool[index];
}

function tooSteep(x: number, z: number, tx: number, tz: number): boolean {
	const dist = Math.hypot(tx - x, tz - z);
	if (dist < 0.001) return false;
	const rise = surface(tx, tz) - surface(x, z);
	return rise > 0.35 && rise / dist > 0.85;
}

/** Keep the part of the step that runs along a cliff instead of into it. */
function alongCliff(x: number, z: number, tx: number, tz: number): { x: number; z: number } {
	if (!tooSteep(x, z, tx, tz)) return { x: tx, z: tz };
	const step = 5;
	const gx = surface(x + step, z) - surface(x - step, z);
	const gz = surface(x, z + step) - surface(x, z - step);
	const glen = Math.hypot(gx, gz) || 1;
	const ux = gx / glen;
	const uz = gz / glen;
	let dx = tx - x;
	let dz = tz - z;
	const up = dx * ux + dz * uz;
	if (up > 0) {
		dx -= ux * up;
		dz -= uz * up;
	}
	if (dx * dx + dz * dz < 0.02) return { x, z };
	const sx = clamp(x + dx, -LIMIT, LIMIT);
	const sz = clamp(z + dz, -LIMIT, LIMIT);
	if (tooSteep(x, z, sx, sz)) return { x, z };
	return { x: sx, z: sz };
}

/** Step across the basin. Steep faces slide you along the wall. Rocks ease you aside. */
export function settle(
	x: number,
	z: number,
	nx: number,
	nz: number,
	body = 1.6,
): { x: number; z: number } {
	let tx = clamp(nx, -LIMIT, LIMIT);
	let tz = clamp(nz, -LIMIT, LIMIT);
	const slid = alongCliff(x, z, tx, tz);
	tx = slid.x;
	tz = slid.z;
	const count = gatherBlockers(tx, tz);
	for (let i = 0; i < count; i++) {
		const solid = blockerPool[i];
		if (solid.radius < 1.35) continue;
		const dx = tx - solid.x;
		const dz = tz - solid.z;
		const gap = Math.hypot(dx, dz);
		const min = solid.radius * 0.82 + body * 0.65;
		if (gap >= min) continue;
		const nxDir = gap > 0.05 ? dx / gap : 1;
		const nzDir = gap > 0.05 ? dz / gap : 0;
		const push = Math.min(min - gap, 1.6);
		tx += nxDir * push;
		tz += nzDir * push;
	}
	tx = clamp(tx, -LIMIT, LIMIT);
	tz = clamp(tz, -LIMIT, LIMIT);
	const after = alongCliff(x, z, tx, tz);
	return after;
}

export function worldToMap(
	x: number,
	z: number,
	width: number,
	height: number,
): { x: number; y: number } {
	return {
		x: ((x + HALF) / WORLD) * width,
		y: ((HALF - z) / WORLD) * height,
	};
}

export function mapToWorld(
	px: number,
	py: number,
	width: number,
	height: number,
): { x: number; z: number } {
	return {
		x: -HALF + (px / width) * WORLD,
		z: HALF - (py / height) * WORLD,
	};
}

/** Relief chart for the satellite map. Large features only, so it stays cheap. */
export function paintMap(canvas: HTMLCanvasElement): void {
	const size = 280;
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const image = ctx.createImageData(size, size);
	const data = image.data;
	for (let py = 0; py < size; py++) {
		const z = HALF - ((py + 0.5) / size) * WORLD;
		for (let px = 0; px < size; px++) {
			const x = -HALF + ((px + 0.5) / size) * WORLD;
			const height = rawHeight(x, z);
			const slope =
				Math.abs(rawHeight(x + 80, z) - height) + Math.abs(rawHeight(x, z + 80) - height);
			let red = 108 + height * 1.15 - slope * 1.6;
			let green = 68 + height * 0.72 - slope * 1.4;
			let blue = 46 + height * 0.32 - slope;
			const dist = Math.hypot(x - CRATER.x, z - CRATER.z);
			if (height < WATER_Y && dist > 200 && dist < 1080) {
				red = 62;
				green = 104;
				blue = 112;
			}
			const index = (py * size + px) * 4;
			data[index] = clamp(red, 0, 255);
			data[index + 1] = clamp(green, 0, 255);
			data[index + 2] = clamp(blue, 0, 255);
			data[index + 3] = 255;
		}
	}
	ctx.putImageData(image, 0, 0);
}
