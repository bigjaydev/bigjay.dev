// Hand-built night city. Roads are a grid; blocks are the cells between them.

export const WORLD_W = 2800;
export const WORLD_H = 2160;

export const ROADS_X = [120, 760, 1400, 2040, 2680];
export const ROADS_Y = [120, 760, 1400, 2040];
export const ROAD_HALF = 56;
export const SIDEWALK = 58;

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export type SolidKind = "block" | "water" | "crusher" | "kiosk";
export type Hue = "magenta" | "cyan" | "amber";

export type Solid = Rect & { kind: SolidKind; hue: Hue };
export type Tree = { x: number; y: number; r: number };

export type Paint = "civilian" | "edsel" | "cop" | "taxi";
export type SpawnAi = "none" | "taxi";

export type CarSpawn = {
	x: number;
	y: number;
	angle: number;
	color: string;
	paint: Paint;
	ai: SpawnAi;
	edselIndex: number;
	path: Point[];
};

export type PedSpawn = {
	x: number;
	y: number;
	axis: "x" | "y";
	min: number;
	max: number;
	dir: number;
	speed: number;
	color: string;
};

export type Label = { text: string; x: number; y: number };

export type CellKind =
	| "towers"
	| "park"
	| "studio"
	| "plaza"
	| "shop"
	| "hangar"
	| "mid"
	| "beach"
	| "dealer"
	| "yard"
	| "station"
	| "docks";

const GRID: CellKind[][] = [
	["towers", "park", "studio", "plaza"],
	["shop", "hangar", "mid", "beach"],
	["dealer", "yard", "station", "docks"],
];

export function cell(c: number, r: number): Rect {
	const x = ROADS_X[c] + ROAD_HALF + SIDEWALK;
	const y = ROADS_Y[r] + ROAD_HALF + SIDEWALK;
	const w = ROADS_X[c + 1] - ROAD_HALF - SIDEWALK - x;
	const h = ROADS_Y[r + 1] - ROAD_HALF - SIDEWALK - y;
	return { x, y, w, h };
}

function sidewalkX(c: number): number {
	return ROADS_X[c] + ROAD_HALF + SIDEWALK / 2;
}

type Built = {
	kinds: CellKind[][];
	cells: Rect[][];
	solids: Solid[];
	trees: Tree[];
	cars: CarSpawn[];
	peds: PedSpawn[];
	phones: Point[];
	labels: Label[];
	water: Rect[];
	podium: Point;
	crusher: Point;
	crate: Point;
	pad: Point;
	tape: Point;
	stage: Point;
	boxes: Point[];
	line: Point;
	respawn: Point;
	start: Point;
};

function block(
	x: number,
	y: number,
	w: number,
	h: number,
	hue: Hue,
	kind: SolidKind = "block",
): Solid {
	return { x, y, w, h, hue, kind };
}

function solidsFor(kind: CellKind, b: Rect): Solid[] {
	if (kind === "towers") {
		const alley = 86;
		const colW = (b.w - alley) / 2;
		const rowH = (b.h - alley) / 2;
		return [
			block(b.x, b.y, colW, rowH - 10, "magenta"),
			block(b.x, b.y + rowH + alley + 10, colW, rowH - 10, "magenta"),
			block(b.x + colW + alley, b.y, colW, rowH - 10, "cyan"),
			block(b.x + colW + alley, b.y + rowH + alley + 10, colW, rowH - 10, "cyan"),
		];
	}
	if (kind === "studio") return [block(b.x, b.y, b.w, b.h * 0.66, "magenta")];
	if (kind === "shop") return [block(b.x, b.y, b.w * 0.6, b.h, "amber")];
	if (kind === "hangar") return [];
	if (kind === "mid") {
		return [
			block(b.x, b.y, b.w * 0.58, b.h * 0.44, "magenta"),
			block(b.x + b.w * 0.36, b.y + b.h * 0.56, b.w * 0.64, b.h * 0.44, "cyan"),
		];
	}
	if (kind === "beach") {
		return [block(b.x + b.w * 0.56, b.y, b.w * 0.44, b.h, "cyan", "water")];
	}
	if (kind === "dealer") return [block(b.x + 18, b.y + 16, 96, 72, "amber", "kiosk")];
	if (kind === "yard") {
		return [block(b.x + b.w * 0.22, b.y + 14, b.w * 0.56, b.h * 0.3, "magenta", "crusher")];
	}
	if (kind === "station") return [block(b.x, b.y, b.w, b.h * 0.6, "cyan")];
	if (kind === "docks") {
		return [
			block(b.x + 24, b.y + 28, 78, 54, "amber"),
			block(b.x + b.w - 110, b.y + 36, 84, 60, "cyan"),
			block(b.x + b.w * 0.5 - 90, b.y + b.h * 0.28, 180, 22, "magenta"),
		];
	}
	if (kind === "plaza") return [block(b.x + b.w / 2 - 78, b.y + 18, 156, 34, "magenta")];
	return [];
}

function linePath(axis: "x" | "y", fixed: number, from: number, to: number): Point[] {
	if (axis === "x")
		return [
			{ x: from, y: fixed },
			{ x: to, y: fixed },
		];
	return [
		{ x: fixed, y: from },
		{ x: fixed, y: to },
	];
}

function build(): Built {
	const cells = GRID.map((row, r) => row.map((_, c) => cell(c, r)));
	const solids: Solid[] = [
		{ x: -800, y: -800, w: 800, h: WORLD_H + 1600, kind: "block", hue: "magenta" },
		{ x: WORLD_W, y: -800, w: 800, h: WORLD_H + 1600, kind: "block", hue: "magenta" },
		{ x: -800, y: -800, w: WORLD_W + 1600, h: 800, kind: "block", hue: "magenta" },
		{ x: -800, y: WORLD_H, w: WORLD_W + 1600, h: 800, kind: "block", hue: "magenta" },
	];
	const trees: Tree[] = [];
	const water: Rect[] = [];

	for (let r = 0; r < GRID.length; r++) {
		for (let c = 0; c < GRID[r].length; c++) {
			const kind = GRID[r][c];
			const b = cells[r][c];
			for (const solid of solidsFor(kind, b)) {
				solids.push(solid);
				if (solid.kind === "water") water.push(solid);
			}
		}
	}

	const park = cells[0][1];
	const podium = { x: park.x + park.w / 2, y: park.y + park.h / 2 };
	const treeSpots = [
		[-150, -120],
		[150, -130],
		[-140, 130],
		[155, 125],
		[0, -160],
	];
	for (const [dx, dy] of treeSpots) {
		trees.push({ x: podium.x + dx, y: podium.y + dy, r: 18 });
	}

	const yard = cells[2][1];
	const crusher = { x: yard.x + yard.w / 2, y: yard.y + yard.h * 0.68 };

	const hangar = cells[1][1];
	const crate = { x: hangar.x + hangar.w / 2, y: hangar.y + hangar.h * 0.46 };

	const beach = cells[1][3];
	const pad = { x: beach.x + beach.w * 0.28, y: beach.y + beach.h * 0.58 };

	const studio = cells[0][2];
	const tape = { x: studio.x + studio.w / 2, y: studio.y + studio.h * 0.84 };

	const docks = cells[2][3];
	const stage = { x: docks.x + docks.w / 2, y: docks.y + docks.h * 0.2 };

	const shop = cells[1][0];
	const boxes = [0, 1, 2].map((i) => ({
		x: shop.x + shop.w * 0.78,
		y: shop.y + shop.h * (0.28 + i * 0.22),
	}));

	const plaza = cells[0][3];
	const line = { x: plaza.x + plaza.w / 2, y: plaza.y + plaza.h * 0.72 };

	const station = cells[2][2];
	const respawn = { x: station.x + station.w / 2, y: station.y + station.h * 0.82 };

	const home = cells[0][0];
	const sideX = sidewalkX(0);
	const alleyY = home.y + home.h / 2;
	const start = { x: sideX, y: alleyY };
	const phones = [
		{ x: sideX + 48, y: alleyY },
		{ x: sidewalkX(3), y: beach.y + beach.h * 0.35 },
		{ x: sidewalkX(0), y: cells[2][0].y + 70 },
	];

	const labels: Label[] = [
		{ text: "PARK", x: podium.x, y: park.y + 28 },
		{ text: "STUDIO", x: tape.x, y: tape.y - 36 },
		{ text: "LAUNCH", x: line.x, y: line.y - 48 },
		{ text: "SHOP", x: boxes[1].x, y: shop.y + 28 },
		{ text: "HANGAR", x: crate.x, y: hangar.y + 56 },
		{ text: "BEACH", x: pad.x, y: pad.y - 48 },
		{ text: "LOT", x: cells[2][0].x + cells[2][0].w * 0.62, y: cells[2][0].y + 36 },
		{ text: "CRUSHER", x: crusher.x, y: crusher.y - 52 },
		{ text: "PRECINCT", x: respawn.x, y: station.y + station.h * 0.66 },
		{ text: "STAGE", x: stage.x, y: stage.y - 44 },
		{ text: "FM 171", x: cells[1][2].x + cells[1][2].w * 0.28, y: cells[1][2].y + 36 },
	];

	const dealer = cells[2][0];
	const cars: CarSpawn[] = [
		spawn(120, alleyY + 150, Math.PI / 2, "#ff2bd6", "civilian"),
		spawn(148, 980, -Math.PI / 2, "#2de2ff", "civilian"),
		spawn(420, 148, 0, "#ff8a3d", "civilian"),
		spawn(1180, 92, Math.PI, "#c084fc", "civilian"),
		spawn(1860, 148, 0, "#f4f4f8", "civilian"),
		spawn(2620, 520, Math.PI / 2, "#7cffb2", "civilian"),
		spawn(2070, 1100, Math.PI / 2, "#ffd56a", "civilian"),
		spawn(560, 1984, 0, "#ff4d8d", "civilian"),
		spawn(1680, 2090, Math.PI, "#6ecbff", "civilian"),
		spawn(respawn.x + 70, respawn.y - 20, Math.PI, "#d7e7ff", "cop"),
		spawn(dealer.x + 150, dealer.y + 180, -0.35, "#f3e2b0", "edsel", 0),
		spawn(dealer.x + 270, dealer.y + 230, 0.25, "#f7edd0", "edsel", 1),
		spawn(dealer.x + 190, dealer.y + 320, -0.05, "#e7d7a4", "edsel", 2),
		spawn(420, 760, 0, "#9b8cff", "taxi", -1, linePath("x", 760, 240, 2500)),
		spawn(2300, 1400, Math.PI, "#b9a6ff", "taxi", -1, linePath("x", 1400, 2460, 220)),
		spawn(1400, 360, Math.PI / 2, "#d5ccff", "taxi", -1, linePath("y", 1400, 240, 1880)),
	];

	const peds: PedSpawn[] = [
		ped(park.x + 30, park.y - 28, "x", park.x + 10, park.x + park.w - 10, 1, 38, "#ff8ad8"),
		ped(studio.x + 40, studio.y - 28, "x", studio.x, studio.x + studio.w, -1, 32, "#8af4ff"),
		ped(sidewalkX(1), park.y + 40, "y", park.y + 20, park.y + park.h - 20, 1, 34, "#ffd0a8"),
		ped(
			shop.x + shop.w + 24,
			shop.y + 40,
			"y",
			shop.y + 16,
			shop.y + shop.h - 16,
			1,
			30,
			"#d7c6ff",
		),
		ped(
			plaza.x + 20,
			plaza.y + plaza.h - 24,
			"x",
			plaza.x + 16,
			plaza.x + plaza.w - 16,
			1,
			28,
			"#ffe08a",
		),
		ped(
			beach.x + 30,
			beach.y + beach.h - 30,
			"x",
			beach.x + 16,
			beach.x + beach.w * 0.48,
			-1,
			26,
			"#ffb3c7",
		),
	];

	return {
		kinds: GRID,
		cells,
		solids,
		trees,
		cars,
		peds,
		phones,
		labels,
		water,
		podium,
		crusher,
		crate,
		pad,
		tape,
		stage,
		boxes,
		line,
		respawn,
		start,
	};
}

function spawn(
	x: number,
	y: number,
	angle: number,
	color: string,
	paint: Paint,
	edselIndex = -1,
	path: Point[] = [],
): CarSpawn {
	return {
		x,
		y,
		angle,
		color,
		paint,
		ai: paint === "taxi" ? "taxi" : "none",
		edselIndex,
		path,
	};
}

function ped(
	x: number,
	y: number,
	axis: "x" | "y",
	min: number,
	max: number,
	dir: number,
	speed: number,
	color: string,
): PedSpawn {
	return { x, y, axis, min, max, dir, speed, color };
}

export const CITY = build();

export function edselSpawns(): CarSpawn[] {
	return CITY.cars.filter((car) => car.paint === "edsel");
}
