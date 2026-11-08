import {
	breadboardGroups,
	formatHz,
	holeKey,
	HOLES,
	timerHole,
	type Hole,
	type Part,
	type Wire,
} from "./board";

const MAX = 64;
const BLEED = 1e-8;
const ROUT = 40;
const RDIS = 12;
const RDIV = 5_000;
const RPULL = 100_000;
const LED_RS = 15;
const SPEAKER_R = 8;
const BUTTON_R = 4;
const POT_RMIN = 1;

const LED_VF = { red: 1.8, yellow: 2.05, green: 2.2 };

type TimerBuilt = { id: string; pins: number[]; mid: number };

type Built = {
	signature: string;
	nodeCount: number;
	shorted: boolean;
	hasSource: boolean;
	volts: number;
	pos: number;
	resistors: { a: number; b: number; g: number }[];
	caps: { id: string; a: number; b: number; farads: number }[];
	leds: { id: string; a: number; b: number; vf: number }[];
	speakers: { id: string; a: number; b: number }[];
	buttons: { id: string; a: number; b: number }[];
	timers: TimerBuilt[];
	holeNode: Map<string, number>;
};

type TimerRun = {
	latch: boolean;
	high: boolean;
	lastRise: number | null;
	period: number | null;
	lastEdge: number;
};

function findFunction(pairs: [string, string][]): (key: string) => string {
	const parent = new Map<string, string>();
	const find = (key: string): string => {
		let root = parent.get(key);
		if (!root) {
			parent.set(key, key);
			return key;
		}
		while (root !== parent.get(root)) root = parent.get(root)!;
		let cur = key;
		while (cur !== root) {
			const next = parent.get(cur)!;
			parent.set(cur, root);
			cur = next;
		}
		return root;
	};
	const union = (a: string, b: string) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent.set(ra, rb);
	};
	for (const group of breadboardGroups()) {
		for (let i = 1; i < group.length; i++) union(group[0], group[i]);
	}
	for (const [a, b] of pairs) union(a, b);
	return find;
}

function build(
	parts: Part[],
	wires: Wire[],
): { ok: true; built: Built } | { ok: false; message: string } {
	const batteries = parts.filter((part) => part.type === "battery");
	if (batteries.length > 1) return { ok: false, message: "One battery is enough." };

	const pairs: [string, string][] = wires.map((wire) => [holeKey(wire.a), holeKey(wire.b)]);
	const find = findFunction(pairs);
	const battery = batteries[0];
	const shorted = battery ? find(holeKey(battery.a)) === find(holeKey(battery.b)) : false;

	const rootNode = new Map<string, number>();
	let nextId = 1;
	const nodeFor = (root: string): number => {
		const existing = rootNode.get(root);
		if (existing !== undefined) return existing;
		const id = nextId++;
		rootNode.set(root, id);
		return id;
	};

	if (battery && !shorted) rootNode.set(find(holeKey(battery.b)), 0);

	const resistors: Built["resistors"] = [];
	const caps: Built["caps"] = [];
	const leds: Built["leds"] = [];
	const speakers: Built["speakers"] = [];
	const buttons: Built["buttons"] = [];
	const timers: TimerBuilt[] = [];
	const sig: string[] = [];

	for (const part of parts) {
		if (part.type === "timer") {
			const pins = [0];
			const roots: string[] = [];
			for (let pin = 1; pin <= 8; pin++) {
				const root = find(holeKey(timerHole(part.col, pin)));
				roots.push(root);
				pins.push(nodeFor(root));
			}
			const mid = nextId++;
			timers.push({ id: part.id, pins, mid });
			sig.push(`t:${part.id}:${roots.join(",")}`);
			continue;
		}
		if (part.type === "pot") {
			const ra = find(holeKey(part.a));
			const rw = find(holeKey(part.w));
			const rb = find(holeKey(part.b));
			const travel = Math.min(1, Math.max(0, part.position));
			resistors.push({
				a: nodeFor(ra),
				b: nodeFor(rw),
				g: 1 / Math.max(part.ohms * travel, POT_RMIN),
			});
			resistors.push({
				a: nodeFor(rw),
				b: nodeFor(rb),
				g: 1 / Math.max(part.ohms * (1 - travel), POT_RMIN),
			});
			sig.push(`pot:${part.id}:${ra}:${rw}:${rb}`);
			continue;
		}
		const ra = find(holeKey(part.a));
		const rb = find(holeKey(part.b));
		const a = nodeFor(ra);
		const b = nodeFor(rb);
		sig.push(`${part.type}:${part.id}:${ra}:${rb}`);
		if (part.type === "resistor") resistors.push({ a, b, g: 1 / part.ohms });
		else if (part.type === "capacitor") caps.push({ id: part.id, a, b, farads: part.farads });
		else if (part.type === "led") leds.push({ id: part.id, a, b, vf: LED_VF[part.color] });
		else if (part.type === "speaker") speakers.push({ id: part.id, a, b });
		else if (part.type === "button") buttons.push({ id: part.id, a, b });
	}
	for (const wire of wires)
		sig.push(`w:${wire.id}:${find(holeKey(wire.a))}:${find(holeKey(wire.b))}`);

	const pos = battery && !shorted ? nodeFor(find(holeKey(battery.a))) : 0;
	const nodeCount = nextId;
	const holeNode = new Map<string, number>();
	for (const hole of HOLES) {
		const node = rootNode.get(find(hole.key));
		if (node !== undefined) holeNode.set(hole.key, node);
	}

	return {
		ok: true,
		built: {
			signature: sig.join("|"),
			nodeCount,
			shorted,
			hasSource: Boolean(battery) && !shorted,
			volts: battery && battery.type === "battery" ? battery.volts : 0,
			pos,
			resistors,
			caps,
			leds,
			speakers,
			buttons,
			timers,
			holeNode,
		},
	};
}

function solve(A: Float64Array, b: Float64Array, n: number): boolean {
	for (let k = 0; k < n; k++) {
		let pivot = k;
		let max = Math.abs(A[k * n + k]);
		for (let i = k + 1; i < n; i++) {
			const value = Math.abs(A[i * n + k]);
			if (value > max) {
				max = value;
				pivot = i;
			}
		}
		if (max < 1e-14) return false;
		if (pivot !== k) {
			for (let j = k; j < n; j++) {
				const tmp = A[k * n + j];
				A[k * n + j] = A[pivot * n + j];
				A[pivot * n + j] = tmp;
			}
			const tmp = b[k];
			b[k] = b[pivot];
			b[pivot] = tmp;
		}
		const diag = A[k * n + k];
		for (let i = k + 1; i < n; i++) {
			const factor = A[i * n + k] / diag;
			for (let j = k + 1; j < n; j++) A[i * n + j] -= factor * A[k * n + j];
			b[i] -= factor * b[k];
		}
	}
	for (let i = n - 1; i >= 0; i--) {
		let sum = b[i];
		const diag = A[i * n + i];
		if (Math.abs(diag) < 1e-14) return false;
		for (let j = i + 1; j < n; j++) sum -= A[i * n + j] * b[j];
		b[i] = sum / diag;
	}
	return true;
}

export class Engine {
	ledLevel = new Map<string, number>();
	lampOn = new Map<string, boolean>();
	speakerMotion = 0;
	audioSample = 0;
	summary = "Add a battery to power the board.";
	fault: string | null = null;
	supply = 0;
	period: number | null = null;
	heavy = false;
	probeKey: string | null = null;
	readonly scope = new Float32Array(32_768);
	scopeI = 0;
	scopeN = 0;

	private built: Built | null = null;
	private v = new Float64Array(1);
	private capV = new Map<string, number>();
	private ledOn = new Map<string, boolean>();
	private timers = new Map<string, TimerRun>();
	private time = 0;
	private speakerPrev = 0;
	private speakerHp = 0;
	private readonly A = new Float64Array(MAX * MAX);
	private readonly rhs = new Float64Array(MAX);

	load(parts: Part[], wires: Wire[]): void {
		const result = build(parts, wires);
		if (!result.ok) {
			this.built = null;
			this.fault = result.message;
			this.summary = result.message;
			return;
		}
		const same =
			this.built?.signature === result.built.signature && this.v.length === result.built.nodeCount;
		this.built = result.built;
		if (!same) {
			this.v = new Float64Array(result.built.nodeCount);
			this.capV.clear();
			this.ledOn.clear();
			this.timers.clear();
			this.scopeI = 0;
			this.scopeN = 0;
			this.time = 0;
			this.speakerPrev = 0;
			this.speakerHp = 0;
			this.period = null;
		}
		if (!result.built.hasSource && !result.built.shorted) {
			this.summary = "Add a battery to power the board.";
		}
	}

	voltage(hole: Hole): number | null {
		if (!this.built) return null;
		const node = this.built.holeNode.get(holeKey(hole));
		if (node === undefined) return null;
		return this.v[node] ?? 0;
	}

	step(dt: number, pressed: ReadonlySet<string>): void {
		const built = this.built;
		if (!built) return;
		if (built.shorted) {
			this.fault = "The battery leads are shorted.";
			this.summary = this.fault;
			this.audioSample = 0;
			this.speakerMotion = 0;
			this.pushScope(0);
			return;
		}

		const nVolt = built.nodeCount - 1;
		const n = nVolt + (built.hasSource ? 1 : 0);
		if (n <= 0) {
			this.summary = "Add a battery to power the board.";
			this.pushScope(NaN);
			return;
		}
		if (n > MAX) {
			this.fault = "This board is too tangled to simulate.";
			this.summary = this.fault;
			return;
		}

		this.A.fill(0, 0, n * n);
		this.rhs.fill(0, 0, n);
		const mi = (node: number): number | null => (node === 0 ? null : node - 1);

		const stampG = (a: number, b: number, g: number) => {
			if (!Number.isFinite(g) || g === 0) return;
			const ia = mi(a);
			const ib = mi(b);
			if (ia !== null) this.A[ia * n + ia] += g;
			if (ib !== null) this.A[ib * n + ib] += g;
			if (ia !== null && ib !== null) {
				this.A[ia * n + ib] -= g;
				this.A[ib * n + ia] -= g;
			}
		};
		const stampI = (into: number, from: number, current: number) => {
			const ia = mi(into);
			const ib = mi(from);
			if (ia !== null) this.rhs[ia] += current;
			if (ib !== null) this.rhs[ib] -= current;
		};

		for (let node = 1; node < built.nodeCount; node++) stampG(node, 0, BLEED);
		for (const resistor of built.resistors) stampG(resistor.a, resistor.b, resistor.g);
		for (const cap of built.caps) {
			const g = cap.farads / dt;
			const previous = this.capV.get(cap.id) ?? 0;
			stampG(cap.a, cap.b, g);
			stampI(cap.a, cap.b, g * previous);
		}
		for (const speaker of built.speakers) stampG(speaker.a, speaker.b, 1 / SPEAKER_R);
		for (const button of built.buttons) {
			if (pressed.has(button.id)) stampG(button.a, button.b, 1 / BUTTON_R);
		}
		for (const led of built.leds) {
			if (!this.ledOn.get(led.id)) continue;
			stampG(led.a, led.b, 1 / LED_RS);
			stampI(led.a, led.b, led.vf / LED_RS);
		}

		for (const timer of built.timers) {
			const run = this.runtime(timer.id);
			const pin = timer.pins;
			const vcc = this.v[pin[8]] - this.v[pin[1]];
			const powered = vcc > 2.5;
			stampG(pin[8], pin[5], 1 / RDIV);
			stampG(pin[5], timer.mid, 1 / RDIV);
			stampG(timer.mid, pin[1], 1 / RDIV);
			stampG(pin[4], pin[8], 1 / RPULL);
			if (powered && run.latch) stampG(pin[3], pin[8], 1 / ROUT);
			if (powered && !run.latch) {
				stampG(pin[3], pin[1], 1 / ROUT);
				stampG(pin[7], pin[1], 1 / RDIS);
			}
		}

		if (built.hasSource) {
			const iIdx = nVolt;
			const ip = mi(built.pos);
			if (ip !== null) {
				this.A[ip * n + iIdx] -= 1;
				this.A[iIdx * n + ip] += 1;
			}
			this.rhs[iIdx] += built.volts;
		}

		if (!solve(this.A, this.rhs, n)) {
			this.fault = "This wiring can't be solved.";
			this.summary = this.fault;
			this.audioSample = 0;
			return;
		}
		this.fault = null;
		this.v[0] = 0;
		for (let i = 0; i < nVolt; i++) this.v[i + 1] = this.rhs[i];
		const batteryCurrent = built.hasSource ? this.rhs[nVolt] : 0;

		for (const cap of built.caps) {
			this.capV.set(cap.id, (this.v[cap.a] ?? 0) - (this.v[cap.b] ?? 0));
		}
		for (const led of built.leds) {
			const drop = (this.v[led.a] ?? 0) - (this.v[led.b] ?? 0);
			const was = this.ledOn.get(led.id) ?? false;
			const on = was ? drop > led.vf - 0.25 : drop > led.vf + 0.05;
			this.ledOn.set(led.id, on);
			const current = on ? Math.max(0, (drop - led.vf) / LED_RS) : 0;
			this.ledLevel.set(led.id, Math.max(0, Math.min(1, current / 0.008)));
		}

		this.time += dt;
		let period: number | null = null;
		for (const timer of built.timers) {
			const run = this.runtime(timer.id);
			const pin = timer.pins;
			const v1 = this.v[pin[1]] ?? 0;
			const v8 = this.v[pin[8]] ?? 0;
			const vcc = v8 - v1;
			const powered = vcc > 2.5;
			const reset = (this.v[pin[4]] ?? 0) - v1 < 0.7;
			const trigger = (this.v[pin[2]] ?? 0) < (this.v[timer.mid] ?? 0) - 0.008;
			const threshold = (this.v[pin[6]] ?? 0) > (this.v[pin[5]] ?? 0) + 0.008;
			if (!powered || reset) run.latch = false;
			else if (trigger) run.latch = true;
			else if (threshold) run.latch = false;

			const high = powered && (this.v[pin[3]] ?? 0) - v1 > vcc * 0.5;
			if (high && !run.high) {
				if (run.lastRise !== null) {
					const measured = this.time - run.lastRise;
					if (measured > dt * 4) run.period = measured;
				}
				run.lastRise = this.time;
				run.lastEdge = this.time;
			} else if (high !== run.high) {
				run.lastEdge = this.time;
			}
			run.high = high;
			if (run.period !== null && this.time - run.lastEdge > Math.max(1.2, run.period * 1.8)) {
				run.period = null;
			}
			this.lampOn.set(timer.id, high);
			if (run.period && period === null) period = run.period;
		}
		this.period = period;

		let speaker = 0;
		for (const spk of built.speakers) speaker += (this.v[spk.a] ?? 0) - (this.v[spk.b] ?? 0);
		const hp = speaker - this.speakerPrev + 0.995 * this.speakerHp;
		this.speakerPrev = speaker;
		this.speakerHp = hp;
		this.speakerMotion = hp;
		this.audioSample = Math.tanh(hp * 3.2);
		this.supply = built.volts;
		this.heavy = Math.abs(batteryCurrent) > 0.35;
		this.pushScope(this.readProbe());
	}

	describe(): string {
		if (this.fault) return this.fault;
		const built = this.built;
		if (!built || !built.hasSource) return "Add a battery to power the board.";
		if (built.timers.length === 0) {
			return this.heavy
				? `${built.volts.toFixed(0)} V · heavy load`
				: `${built.volts.toFixed(0)} V on the rails.`;
		}
		const bits = built.timers.map((timer) => {
			const run = this.timers.get(timer.id);
			const pin = timer.pins;
			const powered = (this.v[pin[8]] ?? 0) - (this.v[pin[1]] ?? 0) > 2.5;
			if (!powered || !run) return "off";
			if (run.period) return run.period < 1 / 8000 ? "too fast" : formatHz(1 / run.period);
			return run.high ? "output high" : "output low";
		});
		return `555 · ${bits.join(" · ")}${this.heavy ? " · heavy load" : ""}`;
	}

	private readProbe(): number {
		if (!this.built || !this.probeKey) return NaN;
		const node = this.built.holeNode.get(this.probeKey);
		if (node === undefined) return NaN;
		return this.v[node] ?? NaN;
	}

	private pushScope(sample: number): void {
		this.scope[this.scopeI] = sample;
		this.scopeI = (this.scopeI + 1) % this.scope.length;
		this.scopeN = Math.min(this.scope.length, this.scopeN + 1);
	}

	private runtime(id: string): TimerRun {
		let run = this.timers.get(id);
		if (!run) {
			run = { latch: false, high: false, lastRise: null, period: null, lastEdge: 0 };
			this.timers.set(id, run);
		}
		return run;
	}
}
