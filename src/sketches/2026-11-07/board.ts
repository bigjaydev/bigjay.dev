export const COLS = 30;
export const PITCH = 18;
export const PAD_L = 36;

export const LANE_Y = {
	tp: 18,
	tm: 36,
	a: 68,
	b: 86,
	c: 104,
	d: 122,
	e: 140,
	f: 208,
	g: 226,
	h: 244,
	i: 262,
	j: 280,
	bm: 314,
	bp: 332,
} as const;

export const VIEW = { x: 0, y: -148, w: 600, h: 506 };

export const BATTERY_BODY = { x: 22, y: -140, w: 58, h: 76 };

export type StripRow = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";
export type RailId = "tp" | "tm" | "bp" | "bm";

export type Hole =
	| { kind: "strip"; row: StripRow; col: number }
	| { kind: "rail"; rail: RailId; col: number };

export type LedColor = "red" | "yellow" | "green";

export type Part =
	| { id: string; type: "resistor"; a: Hole; b: Hole; ohms: number }
	| { id: string; type: "pot"; a: Hole; w: Hole; b: Hole; ohms: number; position: number }
	| { id: string; type: "capacitor"; a: Hole; b: Hole; farads: number }
	| { id: string; type: "led"; a: Hole; b: Hole; color: LedColor }
	| { id: string; type: "speaker"; a: Hole; b: Hole }
	| { id: string; type: "button"; a: Hole; b: Hole }
	| { id: string; type: "battery"; a: Hole; b: Hole; volts: number }
	| { id: string; type: "timer"; col: number };

export type Wire = { id: string; a: Hole; b: Hole; color: string };

export type Doc = { parts: Part[]; wires: Wire[] };

export const WIRE_COLORS = [
	"#ef6a33",
	"#f0c93d",
	"#7bc96f",
	"#4aa3ff",
	"#f4f1ea",
	"#2b2b2b",
	"#e5484d",
	"#b07cff",
];

export const LED_COLOR: Record<LedColor, string> = {
	red: "#e23b32",
	yellow: "#f0c42e",
	green: "#3cba5a",
};

const RED = "#e5484d";
const BLACK = "#2b2b2b";
const YELLOW = "#f0c93d";
const ORANGE = "#ef6a33";

/** Notch on the left. Bottom row is pins 1–4, top row is 8–5. */
export const TIMER_LAYOUT: { pin: number; row: StripRow; dx: number; name: string }[] = [
	{ pin: 1, row: "f", dx: 0, name: "GND" },
	{ pin: 2, row: "f", dx: 1, name: "TRIG" },
	{ pin: 3, row: "f", dx: 2, name: "OUT" },
	{ pin: 4, row: "f", dx: 3, name: "RST" },
	{ pin: 5, row: "e", dx: 3, name: "CTRL" },
	{ pin: 6, row: "e", dx: 2, name: "THR" },
	{ pin: 7, row: "e", dx: 1, name: "DIS" },
	{ pin: 8, row: "e", dx: 0, name: "VCC" },
];

const TOP_ROWS: StripRow[] = ["a", "b", "c", "d", "e"];
const BOT_ROWS: StripRow[] = ["f", "g", "h", "i", "j"];
const RAILS: RailId[] = ["tp", "tm", "bp", "bm"];

export function colX(col: number): number {
	return PAD_L + (col - 1) * PITCH + PITCH / 2;
}

export function holeKey(hole: Hole): string {
	return hole.kind === "strip" ? `${hole.row}${hole.col}` : `${hole.rail}${hole.col}`;
}

export function sameHole(a: Hole, b: Hole): boolean {
	return holeKey(a) === holeKey(b);
}

export function strip(row: StripRow, col: number): Hole {
	return { kind: "strip", row, col };
}

export function rail(id: RailId, col: number): Hole {
	return { kind: "rail", rail: id, col };
}

export function holeXY(hole: Hole): { x: number; y: number } {
	const y = hole.kind === "strip" ? LANE_Y[hole.row] : LANE_Y[hole.rail];
	return { x: colX(hole.col), y };
}

export function holeLabel(hole: Hole): string {
	if (hole.kind === "strip") return `${hole.row}${hole.col}`;
	const sign = hole.rail === "tp" || hole.rail === "bp" ? "+" : "−";
	const side = hole.rail.startsWith("t") ? "top" : "bottom";
	return `${side} ${sign}${hole.col}`;
}

export function timerHole(col: number, pin: number): Hole {
	const spec = TIMER_LAYOUT[pin - 1];
	return { kind: "strip", row: spec.row, col: col + spec.dx };
}

export function leadHoles(part: Part): Hole[] {
	if (part.type === "timer") return TIMER_LAYOUT.map((pin) => timerHole(part.col, pin.pin));
	if (part.type === "pot") return [part.a, part.w, part.b];
	return [part.a, part.b];
}

export function occupiedKeys(parts: Part[]): Set<string> {
	const taken = new Set<string>();
	for (const part of parts) {
		for (const hole of leadHoles(part)) taken.add(holeKey(hole));
	}
	return taken;
}

export function sameNode(a: Hole, b: Hole): boolean {
	if (a.kind === "rail" && b.kind === "rail") return a.rail === b.rail;
	if (a.kind === "strip" && b.kind === "strip" && a.col === b.col) {
		const top = TOP_ROWS.includes(a.row) && TOP_ROWS.includes(b.row);
		const bot = BOT_ROWS.includes(a.row) && BOT_ROWS.includes(b.row);
		return top || bot;
	}
	return false;
}

export type Lane = {
	id: string;
	y: number;
	label: string;
	color: string;
	group: "tp" | "tm" | "top" | "bot" | "bm" | "bp";
	hole: (col: number) => Hole;
};

export const LANES: Lane[] = [
	{
		id: "tp",
		y: LANE_Y.tp,
		label: "+",
		color: "#e5484d",
		group: "tp",
		hole: (col) => rail("tp", col),
	},
	{
		id: "tm",
		y: LANE_Y.tm,
		label: "−",
		color: "#3b82c4",
		group: "tm",
		hole: (col) => rail("tm", col),
	},
	...TOP_ROWS.map((row) => ({
		id: row,
		y: LANE_Y[row],
		label: row,
		color: "#8d847a",
		group: "top" as const,
		hole: (col: number) => strip(row, col),
	})),
	...BOT_ROWS.map((row) => ({
		id: row,
		y: LANE_Y[row],
		label: row,
		color: "#8d847a",
		group: "bot" as const,
		hole: (col: number) => strip(row, col),
	})),
	{
		id: "bm",
		y: LANE_Y.bm,
		label: "−",
		color: "#3b82c4",
		group: "bm",
		hole: (col) => rail("bm", col),
	},
	{
		id: "bp",
		y: LANE_Y.bp,
		label: "+",
		color: "#e5484d",
		group: "bp",
		hole: (col) => rail("bp", col),
	},
];

export function breadboardGroups(): string[][] {
	const groups: string[][] = [];
	for (const id of RAILS) {
		const keys: string[] = [];
		for (let col = 1; col <= COLS; col++) keys.push(holeKey(rail(id, col)));
		groups.push(keys);
	}
	for (let col = 1; col <= COLS; col++) {
		groups.push(TOP_ROWS.map((row) => holeKey(strip(row, col))));
		groups.push(BOT_ROWS.map((row) => holeKey(strip(row, col))));
	}
	return groups;
}

export function allHoles(): { hole: Hole; key: string; x: number; y: number }[] {
	const holes: { hole: Hole; key: string; x: number; y: number }[] = [];
	for (const lane of LANES) {
		for (let col = 1; col <= COLS; col++) {
			const hole = lane.hole(col);
			holes.push({ hole, key: holeKey(hole), x: colX(col), y: lane.y });
		}
	}
	return holes;
}

export const HOLES = allHoles();

export function nearestHole(x: number, y: number, max = 9): Hole | null {
	let best: Hole | null = null;
	let bestD = max * max;
	for (const hole of HOLES) {
		const d = (hole.x - x) ** 2 + (hole.y - y) ** 2;
		if (d <= bestD) {
			best = hole.hole;
			bestD = d;
		}
	}
	return best;
}

export function groupRect(hole: Hole): { x: number; y: number; w: number; h: number } {
	if (hole.kind === "rail") {
		const y = LANE_Y[hole.rail];
		return { x: colX(1) - 8, y: y - 8, w: (COLS - 1) * PITCH + 16, h: 16 };
	}
	const rows = TOP_ROWS.includes(hole.row) ? TOP_ROWS : BOT_ROWS;
	const ys = rows.map((row) => LANE_Y[row]);
	const top = Math.min(...ys);
	const bottom = Math.max(...ys);
	return { x: colX(hole.col) - 8, y: top - 8, w: 16, h: bottom - top + 16 };
}

export function wireCurve(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): {
	d: string;
	cx: number;
	cy: number;
} {
	const cx = (x1 + x2) / 2;
	const dist = Math.hypot(x2 - x1, y2 - y1);
	const lift = Math.min(84, 16 + dist * 0.28);
	const cy = (y1 + y2) / 2 - lift;
	return { d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, cx, cy };
}

export function nearWire(
	x: number,
	y: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	max = 7,
): boolean {
	const { cx, cy } = wireCurve(x1, y1, x2, y2);
	const maxD = max * max;
	for (let i = 0; i <= 18; i++) {
		const t = i / 18;
		const u = 1 - t;
		const px = u * u * x1 + 2 * u * t * cx + t * t * x2;
		const py = u * u * y1 + 2 * u * t * cy + t * t * y2;
		if ((px - x) ** 2 + (py - y) ** 2 <= maxD) return true;
	}
	return false;
}

export function batteryPosts(): { pos: { x: number; y: number }; neg: { x: number; y: number } } {
	return {
		pos: { x: BATTERY_BODY.x + 18, y: BATTERY_BODY.y + BATTERY_BODY.h },
		neg: { x: BATTERY_BODY.x + 40, y: BATTERY_BODY.y + BATTERY_BODY.h },
	};
}

export function timerFrame(col: number): { x: number; y: number; w: number; h: number } {
	const x0 = colX(col);
	const x1 = colX(col + 3);
	const mid = (LANE_Y.e + LANE_Y.f) / 2;
	const h = 46;
	return { x: x0 - 14, y: mid - h / 2, w: x1 - x0 + 28, h };
}

const BAND = [
	"#1c1c1c",
	"#6b3a1f",
	"#c4312e",
	"#e07020",
	"#e6c229",
	"#3d8c4a",
	"#2f5fbf",
	"#7a45a8",
	"#8a8a8a",
	"#f4f4f4",
];

export function resistorBands(ohms: number): string[] {
	let value = Math.max(ohms, 1);
	let multiplier = 0;
	while (value >= 100) {
		value /= 10;
		multiplier += 1;
	}
	let sig = Math.round(value);
	if (sig >= 100) {
		sig = 10;
		multiplier += 1;
	}
	const d1 = Math.floor(sig / 10);
	const d2 = sig % 10;
	return [BAND[d1], BAND[d2], BAND[multiplier], "#d4a84b"];
}

function trim(n: number): string {
	if (n >= 100) return n.toFixed(0);
	if (n >= 10) return String(Number(n.toFixed(1)));
	return String(Number(n.toFixed(2)));
}

export function formatOhms(ohms: number): string {
	if (ohms >= 1e6) return `${trim(ohms / 1e6)} MΩ`;
	if (ohms >= 1e3) return `${trim(ohms / 1e3)} kΩ`;
	return `${trim(ohms)} Ω`;
}

export function formatFarads(farads: number): string {
	if (farads >= 1e-3) return `${trim(farads * 1e3)} mF`;
	if (farads >= 1e-6) return `${trim(farads * 1e6)} µF`;
	if (farads >= 1e-9) return `${trim(farads * 1e9)} nF`;
	return `${trim(farads * 1e12)} pF`;
}

export function formatVolts(volts: number): string {
	if (!Number.isFinite(volts)) return "—";
	return `${volts.toFixed(2)} V`;
}

export function formatHz(hz: number): string {
	if (!Number.isFinite(hz) || hz <= 0) return "—";
	if (hz >= 1e6) return `${trim(hz / 1e6)} MHz`;
	if (hz >= 1e3) return `${trim(hz / 1e3)} kHz`;
	if (hz >= 100) return `${hz.toFixed(0)} Hz`;
	if (hz >= 10) return `${hz.toFixed(1)} Hz`;
	return `${hz.toFixed(2)} Hz`;
}

const TIMER_COL = 12;

function powerWiring(): Wire[] {
	return [
		{ id: "wg", color: BLACK, a: strip("j", TIMER_COL), b: rail("tm", TIMER_COL) },
		{ id: "wv", color: RED, a: strip("a", TIMER_COL), b: rail("tp", TIMER_COL) },
		{ id: "wr", color: RED, a: strip("j", TIMER_COL + 3), b: rail("tp", TIMER_COL + 3) },
	];
}

/** Classic astable LED blinker, about 1.4 Hz. */
export function blinker(): Doc {
	const col = TIMER_COL;
	return {
		parts: [
			{ id: "bat", type: "battery", volts: 5, a: rail("tp", 3), b: rail("tm", 3) },
			{ id: "ic", type: "timer", col },
			{ id: "r1", type: "resistor", ohms: 10_000, a: rail("tp", col + 1), b: strip("a", col + 1) },
			{
				id: "r2",
				type: "pot",
				ohms: 100_000,
				position: 0.47,
				a: strip("d", col + 4),
				w: strip("d", col + 5),
				b: strip("d", col + 6),
			},
			{
				id: "c1",
				type: "capacitor",
				farads: 10e-6,
				a: strip("b", col + 6),
				b: rail("tm", col + 6),
			},
			{ id: "rled", type: "resistor", ohms: 330, a: strip("j", col + 2), b: strip("j", col + 8) },
			{ id: "led", type: "led", color: "red", a: strip("i", col + 8), b: rail("tm", col + 8) },
		],
		wires: [
			...powerWiring(),
			{ id: "wt", color: YELLOW, a: strip("j", col + 1), b: strip("a", col + 2) },
			{ id: "w6", color: ORANGE, a: strip("a", col + 2), b: strip("a", col + 6) },
			{ id: "wp", color: "#4aa3ff", a: strip("d", col + 1), b: strip("d", col + 4) },
			{ id: "ww", color: "#7bc96f", a: strip("d", col + 5), b: strip("d", col + 6) },
		],
	};
}

/** Audible astable, about 146 Hz, with the LED still on the output. */
export function tone(): Doc {
	const base = blinker();
	return {
		parts: [
			...base.parts.map((part) => {
				if (part.id === "r1" && part.type === "resistor") return { ...part, ohms: 1_000 };
				if (part.id === "r2" && part.type === "pot") return { ...part, position: 0.1 };
				if (part.id === "c1" && part.type === "capacitor") return { ...part, farads: 470e-9 };
				return part;
			}),
			{ id: "rs", type: "resistor", ohms: 220, a: strip("h", TIMER_COL + 2), b: strip("h", 24) },
			{ id: "sp", type: "speaker", a: strip("g", 24), b: strip("g", 28) },
		],
		wires: [...base.wires, { id: "wsp", color: BLACK, a: strip("j", 28), b: rail("tm", 28) }],
	};
}

/** Monostable pulse of about 1.1 s. Press the button. */
export function oneshot(): Doc {
	const col = TIMER_COL;
	return {
		parts: [
			{ id: "bat", type: "battery", volts: 5, a: rail("tp", 3), b: rail("tm", 3) },
			{ id: "ic", type: "timer", col },
			{ id: "r1", type: "resistor", ohms: 100_000, a: rail("tp", col + 1), b: strip("a", col + 1) },
			{
				id: "c1",
				type: "capacitor",
				farads: 10e-6,
				a: strip("b", 10),
				b: rail("tm", 10),
			},
			{ id: "rpull", type: "resistor", ohms: 10_000, a: rail("tp", 18), b: strip("a", 18) },
			{ id: "btn", type: "button", a: strip("c", 18), b: strip("c", 22) },
			{ id: "rled", type: "resistor", ohms: 330, a: strip("j", col + 2), b: strip("j", 26) },
			{ id: "led", type: "led", color: "red", a: strip("i", 26), b: rail("tm", 26) },
		],
		wires: [
			...powerWiring(),
			{ id: "w76", color: ORANGE, a: strip("d", col + 1), b: strip("d", col + 2) },
			{ id: "wc", color: ORANGE, a: strip("d", 10), b: strip("d", col + 1) },
			{ id: "w2", color: YELLOW, a: strip("b", 18), b: strip("j", col + 1) },
			{ id: "wbg", color: BLACK, a: strip("a", 22), b: rail("tm", 22) },
		],
	};
}
