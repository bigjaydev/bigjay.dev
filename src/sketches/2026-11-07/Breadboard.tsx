import {
	memo,
	useEffect,
	useRef,
	useState,
	type MutableRefObject,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from "react";
import {
	BATTERY_BODY,
	batteryPosts,
	blinker,
	colX,
	COLS,
	formatFarads,
	formatOhms,
	formatVolts,
	groupRect,
	holeKey,
	holeLabel,
	holeXY,
	HOLES,
	LANES,
	LANE_Y,
	leadHoles,
	LED_COLOR,
	nearestHole,
	nearWire,
	occupiedKeys,
	strip,
	oneshot,
	resistorBands,
	sameHole,
	sameNode,
	TIMER_LAYOUT,
	timerFrame,
	timerHole,
	tone,
	VIEW,
	WIRE_COLORS,
	wireCurve,
	type Doc,
	type Hole,
	type LedColor,
	type Part,
	type Wire,
} from "./board";
import { Engine } from "./simulate";

const SIM_HZ = 16_000;

type Tool =
	| "select"
	| "wire"
	| "resistor"
	| "pot"
	| "capacitor"
	| "led"
	| "speaker"
	| "button"
	| "timer"
	| "battery"
	| "erase";

type Selection = { kind: "part" | "wire"; id: string } | null;

type LiveRefs = {
	status: HTMLSpanElement | null;
	probe: HTMLSpanElement | null;
	drop: HTMLSpanElement | null;
	canvas: HTMLCanvasElement | null;
};

const TOOLS: { id: Tool; label: string }[] = [
	{ id: "select", label: "Select" },
	{ id: "wire", label: "Wire" },
	{ id: "resistor", label: "Resistor" },
	{ id: "pot", label: "Pot" },
	{ id: "capacitor", label: "Capacitor" },
	{ id: "led", label: "LED" },
	{ id: "speaker", label: "Speaker" },
	{ id: "button", label: "Button" },
	{ id: "timer", label: "555" },
	{ id: "battery", label: "Battery" },
	{ id: "erase", label: "Erase" },
];

const TOOL_HELP: Record<Tool, string> = {
	select: "Click a part to edit it. Click a hole to probe it. Hold a button to close it.",
	wire: "Click two holes to jumper them.",
	resistor: "Click two holes, then set the value.",
	pot: "Click a row. It takes that hole and the next two. The middle pin is the wiper.",
	capacitor: "Positive lead first. 1 µF and above are electrolytic.",
	led: "Anode first, then the cathode. The flat mark is the cathode.",
	speaker: "Click two holes, then turn sound on.",
	button: "Click two holes. Press the cap afterwards.",
	timer: "Click a column. The notch stays left, and pin 1 is the bottom pin beside it.",
	battery: "Positive hole, then negative. The top rails are the usual place.",
	erase: "Click a part or a wire.",
};

const RESISTOR_PRESETS = [220, 330, 1_000, 10_000, 47_000, 100_000];
const POT_PRESETS = [1_000, 10_000, 100_000, 1_000_000];
const CAP_PRESETS = [100e-9, 1e-6, 10e-6, 100e-6];

function localPoint(svg: SVGSVGElement, event: { clientX: number; clientY: number }) {
	const point = svg.createSVGPoint();
	point.x = event.clientX;
	point.y = event.clientY;
	const matrix = svg.getScreenCTM();
	if (!matrix) return null;
	const local = point.matrixTransform(matrix.inverse());
	return { x: local.x, y: local.y };
}

function LeadPart({
	part,
	selected,
	label,
	children,
}: {
	part: Extract<Part, { a: Hole; b: Hole }>;
	selected: boolean;
	label?: string;
	children: ReactNode;
}) {
	const a = holeXY(part.a);
	const b = holeXY(part.b);
	const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
	const len = Math.max(18, Math.hypot(b.x - a.x, b.y - a.y));
	const mx = (a.x + b.x) / 2;
	const my = (a.y + b.y) / 2;
	const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
	let labelX = horizontal ? mx : mx + 16;
	let labelY = horizontal ? my - 14 : my + 3;
	if (!horizontal && my < LANE_Y.a) {
		labelX = mx + 18;
		labelY = LANE_Y.tp - 10;
	}
	return (
		<g>
			<line
				x1={a.x}
				y1={a.y}
				x2={b.x}
				y2={b.y}
				stroke="#8d8274"
				strokeWidth={1.5}
				pointerEvents="none"
			/>
			<g transform={`translate(${mx} ${my}) rotate(${angle})`}>
				{selected ? (
					<rect
						x={-len / 2}
						y={-14}
						width={len}
						height={28}
						rx={8}
						fill="none"
						stroke="#fecef5"
						strokeWidth={1.4}
					/>
				) : null}
				{children}
			</g>
			{label ? (
				<text
					x={labelX}
					y={labelY}
					textAnchor={horizontal ? "middle" : "start"}
					fontSize={9}
					fill="#4a433c"
					pointerEvents="none"
				>
					{label}
				</text>
			) : null}
		</g>
	);
}

function PartGraphic({
	part,
	selected,
	onPress,
	onErase,
	onSelect,
	onTurn,
}: {
	part: Part;
	selected: boolean;
	onPress: (id: string, down: boolean) => void;
	onErase: (id: string) => void;
	onSelect: (id: string) => void;
	onTurn: (id: string, position: number) => void;
}) {
	if (part.type === "resistor") {
		const a = holeXY(part.a);
		const b = holeXY(part.b);
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const body = Math.min(56, Math.max(32, len * 0.62));
		const bands = resistorBands(part.ohms);
		return (
			<LeadPart part={part} selected={selected} label={formatOhms(part.ohms)}>
				<rect x={-body / 2} y={-5.5} width={body} height={11} rx={2} fill="url(#resistor-body)" />
				{bands.map((color, index) => (
					<rect
						key={color + index}
						x={-body / 2 + 5 + index * ((body - 14) / 4)}
						y={-5.5}
						width={2.6}
						height={11}
						fill={color}
					/>
				))}
			</LeadPart>
		);
	}

	if (part.type === "capacitor") {
		const electrolytic = part.farads >= 1e-6;
		return (
			<LeadPart part={part} selected={selected} label={formatFarads(part.farads)}>
				{electrolytic ? (
					<>
						<rect x={-8} y={-11} width={16} height={22} rx={2} fill="#ddd6cc" stroke="#b7b0a4" />
						<rect x={3} y={-11} width={5} height={22} fill="#f7f4ee" />
					</>
				) : (
					<ellipse rx={9} ry={11} fill="#e4c27a" stroke="#b89245" />
				)}
			</LeadPart>
		);
	}

	if (part.type === "led") {
		const color = LED_COLOR[part.color];
		return (
			<LeadPart part={part} selected={selected}>
				<circle
					className="led-glow"
					data-led-glow={part.id}
					r={12}
					fill={color}
					filter="url(#bb-glow)"
				/>
				<circle r={6.5} fill={color} />
				<path d="M2.2 -6.2 L6.4 0 L2.2 6.2 Z" fill="#f3eee6" />
			</LeadPart>
		);
	}

	if (part.type === "speaker") {
		return (
			<LeadPart part={part} selected={selected}>
				<circle r={12} fill="#2c2b29" />
				<g data-cone={part.id}>
					<circle r={7} fill="#d9d3c9" />
					<circle r={2.2} fill="#2c2b29" />
				</g>
			</LeadPart>
		);
	}

	if (part.type === "button") {
		return (
			<g
				onPointerDown={(event) => {
					event.stopPropagation();
					if (event.button !== 0) return;
					const erase = event.currentTarget.ownerSVGElement?.dataset.tool === "erase";
					if (erase) {
						onErase(part.id);
						return;
					}
					event.currentTarget.setPointerCapture(event.pointerId);
					onPress(part.id, true);
				}}
				onPointerUp={() => onPress(part.id, false)}
				onPointerCancel={() => onPress(part.id, false)}
				onLostPointerCapture={() => onPress(part.id, false)}
			>
				<LeadPart part={part} selected={selected}>
					<rect x={-16} y={-11} width={32} height={22} rx={4} fill="#3a3632" pointerEvents="none" />
					<g data-button-cap={part.id} className="cursor-pointer" pointerEvents="auto">
						<rect x={-12} y={-9} width={24} height={16} rx={3} fill="#efeae2" />
						<text y={3} textAnchor="middle" fontSize={7} fill="#3a3632" pointerEvents="none">
							PUSH
						</text>
					</g>
				</LeadPart>
			</g>
		);
	}

	if (part.type === "pot") {
		const wiper = holeXY(part.w);
		const deg = -140 + part.position * 280;
		const rad = ((deg - 90) * Math.PI) / 180;
		return (
			<g>
				<rect
					x={wiper.x - 22}
					y={wiper.y - 13}
					width={44}
					height={26}
					rx={5}
					fill="#2c2a28"
					stroke={selected ? "#fecef5" : "#111"}
					strokeWidth={selected ? 1.6 : 1}
					pointerEvents="none"
				/>
				<g
					className="cursor-grab"
					style={{ touchAction: "none" }}
					onPointerDown={(event) => {
						event.stopPropagation();
						if (event.button !== 0) return;
						const erase = event.currentTarget.ownerSVGElement?.dataset.tool === "erase";
						if (erase) {
							onErase(part.id);
							return;
						}
						onSelect(part.id);
						event.currentTarget.setPointerCapture(event.pointerId);
						event.currentTarget.dataset.x = String(event.clientX);
						event.currentTarget.dataset.p = String(part.position);
					}}
					onPointerMove={(event) => {
						if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
						const startX = Number(event.currentTarget.dataset.x);
						const start = Number(event.currentTarget.dataset.p);
						const position = Math.min(1, Math.max(0, start + (event.clientX - startX) / 160));
						onTurn(part.id, position);
					}}
				>
					<circle cx={wiper.x} cy={wiper.y} r={10} fill="transparent" />
					<circle cx={wiper.x} cy={wiper.y} r={7.5} fill="#d9d3c9" pointerEvents="none" />
					<line
						x1={wiper.x}
						y1={wiper.y}
						x2={wiper.x + Math.cos(rad) * 5}
						y2={wiper.y + Math.sin(rad) * 5}
						stroke="#2c2a28"
						strokeWidth={1.6}
						strokeLinecap="round"
						pointerEvents="none"
					/>
				</g>
				<text
					x={wiper.x}
					y={wiper.y - 20}
					textAnchor="middle"
					fontSize={9}
					fill="#4a433c"
					pointerEvents="none"
				>
					{formatOhms(part.ohms)}
				</text>
			</g>
		);
	}

	if (part.type === "battery") {
		const posts = batteryPosts();
		const positive = holeXY(part.a);
		const negative = holeXY(part.b);
		const red = wireCurve(posts.pos.x, posts.pos.y, positive.x, positive.y);
		const black = wireCurve(posts.neg.x, posts.neg.y, negative.x, negative.y);
		return (
			<g>
				<path d={red.d} fill="none" stroke="#e5484d" strokeWidth={3} strokeLinecap="round" />
				<path d={black.d} fill="none" stroke="#2b2b2b" strokeWidth={3} strokeLinecap="round" />
				<rect
					x={BATTERY_BODY.x}
					y={BATTERY_BODY.y}
					width={BATTERY_BODY.w}
					height={BATTERY_BODY.h}
					rx={7}
					fill="#2a2926"
					stroke={selected ? "#fecef5" : "#111"}
					strokeWidth={selected ? 2 : 1}
				/>
				<text
					x={BATTERY_BODY.x + BATTERY_BODY.w / 2}
					y={BATTERY_BODY.y + 32}
					textAnchor="middle"
					fill="#f4efe8"
					fontSize={14}
					fontFamily="Space Grotesk, sans-serif"
				>
					{part.volts.toFixed(0)}V
				</text>
				<circle
					data-battery-led=""
					cx={BATTERY_BODY.x + BATTERY_BODY.w / 2}
					cy={BATTERY_BODY.y + 50}
					r={3.5}
					fill="#fecef5"
					opacity={0.3}
				/>
				<circle cx={posts.pos.x} cy={posts.pos.y} r={3.2} fill="#e5484d" />
				<circle cx={posts.neg.x} cy={posts.neg.y} r={3.2} fill="#d7d7d7" />
			</g>
		);
	}

	const frame = timerFrame(part.col);
	return (
		<g>
			{TIMER_LAYOUT.map((pin) => {
				const x = colX(part.col + pin.dx);
				const y = LANE_Y[pin.row];
				const y2 = pin.row === "e" ? frame.y : frame.y + frame.h;
				return (
					<line key={pin.pin} x1={x} y1={y} x2={x} y2={y2} stroke="#c5c5c5" strokeWidth={2.4} />
				);
			})}
			<rect
				x={frame.x}
				y={frame.y}
				width={frame.w}
				height={frame.h}
				rx={4}
				fill="#232321"
				stroke={selected ? "#fecef5" : "#111"}
				strokeWidth={selected ? 2 : 1}
			/>
			<circle cx={frame.x + 2} cy={frame.y + frame.h / 2} r={8} fill="#f3eee6" />
			<text
				x={frame.x + frame.w / 2 + 4}
				y={frame.y + frame.h / 2 + 4}
				textAnchor="middle"
				fill="#f3eee6"
				fontSize={13}
				fontFamily="Space Grotesk, sans-serif"
			>
				555
			</text>
			{TIMER_LAYOUT.map((pin) => (
				<text
					key={pin.pin}
					x={colX(part.col + pin.dx)}
					y={pin.row === "e" ? frame.y + 12 : frame.y + frame.h - 5}
					textAnchor="middle"
					fontSize={8}
					fill={pin.pin === 1 ? "#fecef5" : "#ddd8d0"}
				>
					{pin.pin}
				</text>
			))}
			<circle cx={colX(part.col + 2)} cy={frame.y + frame.h / 2 + 12} r={3} fill="#3a342f" />
			<circle
				className="lamp-glow"
				data-lamp={part.id}
				cx={colX(part.col + 2)}
				cy={frame.y + frame.h / 2 + 12}
				r={3}
				fill="#fecef5"
			/>
		</g>
	);
}

function drawScope(canvas: HTMLCanvasElement, engine: Engine) {
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (width < 2 || height < 2) return;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	const pixelW = Math.floor(width * dpr);
	const pixelH = Math.floor(height * dpr);
	if (canvas.width !== pixelW || canvas.height !== pixelH) {
		canvas.width = pixelW;
		canvas.height = pixelH;
	}
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.fillStyle = "#101211";
	ctx.fillRect(0, 0, width, height);

	const supply = engine.supply > 1 ? engine.supply : 5;
	const top = supply * 1.2;
	const yOf = (volts: number) => height - 10 - (volts / top) * (height - 20);
	ctx.strokeStyle = "rgba(254,206,245,0.13)";
	ctx.lineWidth = 1;
	ctx.font = "11px Inter, sans-serif";
	ctx.fillStyle = "rgba(254,206,245,0.45)";
	for (const fraction of [0, 1 / 3, 2 / 3, 1]) {
		const y = yOf(supply * fraction);
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	ctx.fillText("0", 6, yOf(0) - 3);
	ctx.fillText("⅔", 6, yOf((2 / 3) * supply) - 3);

	const windowSec = engine.period ? Math.min(2, Math.max(0.025, engine.period * 3.2)) : 1.6;
	const samples = Math.min(engine.scopeN, Math.floor(windowSec * SIM_HZ));
	ctx.fillText(
		windowSec >= 1 ? `${windowSec.toFixed(1)} s` : `${Math.round(windowSec * 1000)} ms`,
		width - 48,
		14,
	);
	if (samples < 2) return;

	const start = (engine.scopeI - samples + engine.scope.length) % engine.scope.length;
	ctx.beginPath();
	ctx.strokeStyle = "#fecef5";
	ctx.lineWidth = 1.5;
	let drawing = false;
	const columns = Math.max(1, Math.floor(width));
	for (let column = 0; column < columns; column++) {
		const from = Math.floor((column / columns) * samples);
		const to = Math.max(from + 1, Math.floor(((column + 1) / columns) * samples));
		let min = Infinity;
		let max = -Infinity;
		for (let index = from; index < to; index++) {
			const sample = engine.scope[(start + index) % engine.scope.length];
			if (!Number.isFinite(sample)) continue;
			if (sample < min) min = sample;
			if (sample > max) max = sample;
		}
		if (!Number.isFinite(min)) {
			drawing = false;
			continue;
		}
		const high = yOf(max);
		const low = yOf(min);
		if (!drawing) {
			ctx.moveTo(column, (high + low) / 2);
			drawing = true;
		}
		ctx.lineTo(column, high);
		if (low !== high) ctx.lineTo(column, low);
	}
	ctx.stroke();
}

const LivePanel = memo(function LivePanel({
	api,
	showDrop,
}: {
	api: MutableRefObject<LiveRefs | null>;
	showDrop: boolean;
}) {
	const status = useRef<HTMLSpanElement>(null);
	const probe = useRef<HTMLSpanElement>(null);
	const drop = useRef<HTMLSpanElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		api.current = {
			status: status.current,
			probe: probe.current,
			drop: drop.current,
			canvas: canvas.current,
		};
	}, [api, showDrop]);

	return (
		<div className="mt-4">
			<div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
				<span ref={status} className="font-space-grotesk text-sm text-[#fecef5]" />
				<span ref={probe} className="text-[#f4efe8]/75" />
			</div>
			<canvas ref={canvas} className="h-28 w-full rounded-xl bg-[#101211]" />
			{showDrop ? (
				<p className="mt-2 text-xs text-[#f4efe8]/70">
					Across this part <span ref={drop} />
				</p>
			) : (
				<p className="mt-2 text-xs text-[#f4efe8]/45">
					The trace follows the probed hole. ⅓ and ⅔ are the 555’s thresholds.
				</p>
			)}
		</div>
	);
});

function LogSlider({
	min,
	max,
	value,
	onChange,
}: {
	min: number;
	max: number;
	value: number;
	onChange: (value: number) => void;
}) {
	const span = Math.log(max / min);
	const position = Math.min(1, Math.max(0, Math.log(value / min) / span));
	return (
		<input
			type="range"
			min={0}
			max={1000}
			value={Math.round(position * 1000)}
			aria-label="Value"
			onChange={(event) => onChange(min * Math.exp((Number(event.target.value) / 1000) * span))}
			className="mt-2 w-full accent-[#fecef5]"
		/>
	);
}

export default function Breadboard() {
	const initial = blinker();
	const initialTimer = initial.parts.find((part) => part.type === "timer");
	const [parts, setParts] = useState(initial.parts);
	const [wires, setWires] = useState(initial.wires);
	const [tool, setTool] = useState<Tool>("select");
	const [wireColor, setWireColor] = useState(WIRE_COLORS[0]);
	const [pending, setPending] = useState<Hole | null>(null);
	const [selected, setSelected] = useState<Selection>(null);
	const [probe, setProbe] = useState<Hole | null>(
		initialTimer && initialTimer.type === "timer" ? timerHole(initialTimer.col, 3) : null,
	);
	const [hint, setHint] = useState(
		"Pin 3 is already blinking an LED. Drag the pot right to slow it down.",
	);
	const [canUndo, setCanUndo] = useState(false);
	const [sound, setSound] = useState(false);

	const [engine] = useState(() => new Engine());
	const pressedRef = useRef(new Set<string>());
	const pressedUntil = useRef(new Map<string, number>());
	const docRef = useRef<Doc>({ parts, wires });
	const toolRef = useRef(tool);
	const pendingRef = useRef(pending);
	const colorRef = useRef(wireColor);
	const probeRef = useRef(probe);
	const selectedRef = useRef(selected);
	const history = useRef<Doc[]>([]);
	const idRef = useRef(1);
	const svgRef = useRef<SVGSVGElement>(null);
	const hiRef = useRef<SVGRectElement>(null);
	const ghostRef = useRef<SVGPathElement>(null);
	const timerGhostRef = useRef<SVGRectElement>(null);
	const potGhostRef = useRef<SVGRectElement>(null);
	const liveRef = useRef<LiveRefs | null>(null);
	const audioOwns = useRef(false);
	const soundRef = useRef(false);
	const audioRef = useRef<AudioContext | null>(null);
	const actions = useRef({ undo() {}, erase() {} });

	docRef.current = { parts, wires };
	toolRef.current = tool;
	pendingRef.current = pending;
	colorRef.current = wireColor;
	probeRef.current = probe;
	selectedRef.current = selected;
	soundRef.current = sound;

	const selectedPart =
		selected?.kind === "part" ? (parts.find((part) => part.id === selected.id) ?? null) : null;
	const selectedWire =
		selected?.kind === "wire" ? (wires.find((wire) => wire.id === selected.id) ?? null) : null;

	function nextId() {
		idRef.current += 1;
		return `p${idRef.current}`;
	}

	function commit(next: Doc, record = true) {
		if (record) {
			history.current.push(docRef.current);
			if (history.current.length > 40) history.current.shift();
			setCanUndo(true);
		}
		docRef.current = next;
		setParts(next.parts);
		setWires(next.wires);
	}

	function undo() {
		const previous = history.current.pop();
		if (!previous) return;
		docRef.current = previous;
		setParts(previous.parts);
		setWires(previous.wires);
		setCanUndo(history.current.length > 0);
		setSelected(null);
		setPending(null);
	}

	function setButton(id: string, down: boolean) {
		if (down) {
			pressedUntil.current.delete(id);
			if (pressedRef.current.has(id)) return;
			pressedRef.current.add(id);
			for (let step = 0; step < 4; step++) engine.step(1 / SIM_HZ, pressedRef.current);
			return;
		}
		const until = performance.now() + 80;
		pressedUntil.current.set(id, until);
		window.setTimeout(() => {
			if ((pressedUntil.current.get(id) ?? Infinity) > performance.now()) return;
			pressedRef.current.delete(id);
			pressedUntil.current.delete(id);
		}, 90);
	}

	function releaseExpired(now: number) {
		for (const [id, until] of pressedUntil.current) {
			if (until > now) continue;
			pressedRef.current.delete(id);
			pressedUntil.current.delete(id);
		}
	}

	function removePart(id: string) {
		pressedRef.current.delete(id);
		pressedUntil.current.delete(id);
		commit({
			parts: docRef.current.parts.filter((part) => part.id !== id),
			wires: docRef.current.wires,
		});
		setSelected(null);
	}

	function removeWire(id: string) {
		commit({
			parts: docRef.current.parts,
			wires: docRef.current.wires.filter((wire) => wire.id !== id),
		});
		setSelected(null);
	}

	actions.current.undo = undo;
	actions.current.erase = () => {
		const current = selectedRef.current;
		if (!current) return;
		if (current.kind === "part") removePart(current.id);
		else removeWire(current.id);
	};

	function load(factory: () => Doc, message: string) {
		const next = factory();
		commit(next);
		const timer = next.parts.find((part) => part.type === "timer");
		setProbe(timer && timer.type === "timer" ? timerHole(timer.col, 3) : null);
		setSelected(null);
		setPending(null);
		setHint(message);
		pressedRef.current.clear();
		pressedUntil.current.clear();
	}

	function chooseTool(next: Tool) {
		setTool(next);
		setPending(null);
	}

	function placeTimer(col: number) {
		if (col < 1 || col > COLS - 3) {
			setHint("The 555 needs four columns.");
			return;
		}
		const taken = occupiedKeys(docRef.current.parts);
		const blocked = TIMER_LAYOUT.some((pin) => taken.has(holeKey(timerHole(col, pin.pin))));
		if (blocked) {
			setHint("Those eight holes need to be free.");
			return;
		}
		const id = nextId();
		commit({
			parts: [...docRef.current.parts, { id, type: "timer", col }],
			wires: docRef.current.wires,
		});
		setSelected({ kind: "part", id });
		setProbe(timerHole(col, 3));
		setHint("Pin 1 is pink. Count counter-clockwise from the notch.");
	}

	function placePot(hole: Hole) {
		if (hole.kind !== "strip") {
			setHint("Pots sit on a row. A rail is one node, so all three pins would be shorted.");
			return;
		}
		if (hole.col > COLS - 2) {
			setHint("A pot needs three holes in a row.");
			return;
		}
		if (docRef.current.parts.length >= 16) {
			setHint("The board is full.");
			return;
		}
		const pins = [0, 1, 2].map((dx) => strip(hole.row, hole.col + dx));
		const taken = occupiedKeys(docRef.current.parts);
		if (pins.some((pin) => taken.has(holeKey(pin)))) {
			setHint("Those three holes need to be free.");
			return;
		}
		const id = nextId();
		commit({
			parts: [
				...docRef.current.parts,
				{ id, type: "pot", a: pins[0], w: pins[1], b: pins[2], ohms: 10_000, position: 0.5 },
			],
			wires: docRef.current.wires,
		});
		setSelected({ kind: "part", id });
		setProbe(pins[1]);
		setHint("Middle pin is the wiper. Drag the knob, or use the slider.");
	}

	function placeLead(kind: Tool, a: Hole, b: Hole) {
		if (sameHole(a, b)) {
			setHint("Pick two different holes.");
			return;
		}
		if (kind === "wire") {
			if (docRef.current.wires.length >= 24) {
				setHint("That's enough wire.");
				return;
			}
			commit({
				parts: docRef.current.parts,
				wires: [...docRef.current.wires, { id: nextId(), a, b, color: colorRef.current }],
			});
			if (sameNode(a, b)) setHint("That jumper lands on holes that were already connected.");
			return;
		}
		if (docRef.current.parts.length >= 16) {
			setHint("The board is full.");
			return;
		}
		if (kind === "battery" && docRef.current.parts.some((part) => part.type === "battery")) {
			setHint("One battery is enough. Select it to change the voltage.");
			return;
		}
		const taken = occupiedKeys(docRef.current.parts);
		if (taken.has(holeKey(a)) || taken.has(holeKey(b))) {
			setHint("That hole already has a component lead.");
			return;
		}
		const id = nextId();
		const part: Part | null =
			kind === "resistor"
				? { id, type: "resistor", a, b, ohms: 10_000 }
				: kind === "capacitor"
					? { id, type: "capacitor", a, b, farads: 10e-6 }
					: kind === "led"
						? { id, type: "led", a, b, color: "red" }
						: kind === "speaker"
							? { id, type: "speaker", a, b }
							: kind === "button"
								? { id, type: "button", a, b }
								: kind === "battery"
									? { id, type: "battery", a, b, volts: 5 }
									: null;
		if (!part) return;
		commit({ parts: [...docRef.current.parts, part], wires: docRef.current.wires });
		setSelected({ kind: "part", id });
		if (sameNode(a, b)) setHint("Those holes share a node, so this part is shorted.");
		else if (kind === "speaker") setHint("Turn sound on to hear the speaker.");
		else setHint("");
	}

	useEffect(() => {
		engine.load(parts, wires);
	}, [engine, parts, wires]);

	useEffect(() => {
		engine.probeKey = probe ? holeKey(probe) : null;
	}, [engine, probe]);

	useEffect(() => {
		let frame = 0;
		let last = performance.now();
		const loop = (now: number) => {
			releaseExpired(now);
			if (!audioOwns.current) {
				const elapsed = Math.min(0.1, (now - last) / 1000);
				const steps = Math.min(900, Math.round(elapsed * SIM_HZ));
				for (let index = 0; index < steps; index++) engine.step(1 / SIM_HZ, pressedRef.current);
			}
			last = now;

			const svg = svgRef.current;
			if (svg) {
				for (const glow of svg.querySelectorAll<SVGElement>("[data-led-glow]")) {
					const id = glow.getAttribute("data-led-glow");
					glow.style.opacity = String(id ? (engine.ledLevel.get(id) ?? 0) : 0);
				}
				for (const lamp of svg.querySelectorAll<SVGElement>("[data-lamp]")) {
					const id = lamp.getAttribute("data-lamp");
					lamp.style.opacity = id && engine.lampOn.get(id) ? "1" : "0";
				}
				const motion =
					engine.supply > 0 ? (engine.speakerMotion / Math.max(0.4, engine.supply)) * 6 : 0;
				for (const cone of svg.querySelectorAll<SVGElement>("[data-cone]")) {
					cone.setAttribute("transform", `translate(0 ${motion.toFixed(2)})`);
				}
				for (const cap of svg.querySelectorAll<SVGElement>("[data-button-cap]")) {
					const id = cap.getAttribute("data-button-cap");
					cap.setAttribute("transform", id && pressedRef.current.has(id) ? "translate(0 2)" : "");
				}
				const batteryLed = svg.querySelector("[data-battery-led]");
				if (batteryLed)
					batteryLed.setAttribute(
						"opacity",
						engine.fault ? "0.2" : engine.supply > 0 ? "1" : "0.25",
					);
			}

			const live = liveRef.current;
			if (live?.status) {
				const text = engine.describe();
				if (live.status.textContent !== text) live.status.textContent = text;
			}
			if (live?.probe) {
				const hole = probeRef.current;
				const volts = hole ? engine.voltage(hole) : null;
				const text = hole
					? `${holeLabel(hole)}  ${volts === null ? "open" : formatVolts(volts)}`
					: "Click a hole to probe";
				if (live.probe.textContent !== text) live.probe.textContent = text;
			}
			if (live?.drop) {
				const current = selectedRef.current;
				const part =
					current?.kind === "part"
						? docRef.current.parts.find((item) => item.id === current.id)
						: undefined;
				let text = "—";
				if (part && part.type !== "timer") {
					const positive = engine.voltage(part.a);
					const negative = engine.voltage(part.b);
					text = positive === null || negative === null ? "open" : formatVolts(positive - negative);
				}
				if (live.drop.textContent !== text) live.drop.textContent = text;
			}
			if (live?.canvas) drawScope(live.canvas, engine);
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			void audioRef.current?.close();
			audioRef.current = null;
		};
	}, [engine]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
				return;
			if (event.key === "Escape") setPending(null);
			if ((event.key === "Delete" || event.key === "Backspace") && selectedRef.current) {
				event.preventDefault();
				actions.current.erase();
			}
			if (event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				actions.current.undo();
			}
			if (event.key === " ") {
				const current = selectedRef.current;
				const part =
					current?.kind === "part"
						? docRef.current.parts.find((item) => item.id === current.id)
						: undefined;
				if (part?.type === "button") {
					event.preventDefault();
					setButton(part.id, true);
				}
			}
		};
		const onUp = (event: KeyboardEvent) => {
			if (event.key !== " ") return;
			const current = selectedRef.current;
			if (current?.kind === "part") setButton(current.id, false);
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("keyup", onUp);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("keyup", onUp);
		};
	}, []);

	function toggleSound() {
		if (!audioRef.current) {
			const ctx = new AudioContext();
			const gain = ctx.createGain();
			gain.gain.value = 0.4;
			const node = ctx.createScriptProcessor(2048, 0, 1);
			let carry = 0;
			node.onaudioprocess = (event) => {
				const out = event.outputBuffer.getChannelData(0);
				if (!soundRef.current) {
					out.fill(0);
					audioOwns.current = false;
					return;
				}
				audioOwns.current = true;
				const ratio = SIM_HZ / ctx.sampleRate;
				for (let index = 0; index < out.length; index++) {
					carry += ratio;
					const steps = carry | 0;
					for (let step = 0; step < steps; step++) engine.step(1 / SIM_HZ, pressedRef.current);
					if (steps > 0) carry -= steps;
					out[index] = engine.audioSample;
				}
			};
			node.connect(gain);
			gain.connect(ctx.destination);
			audioRef.current = ctx;
		}
		const next = !soundRef.current;
		soundRef.current = next;
		setSound(next);
		if (next) {
			audioOwns.current = true;
			void audioRef.current.resume();
		} else audioOwns.current = false;
	}

	function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
		const svg = svgRef.current;
		if (!svg) return;
		const point = localPoint(svg, event);
		if (!point) return;
		const hole = nearestHole(point.x, point.y, 11);
		const highlight = hiRef.current;
		if (highlight) {
			if (hole) {
				const rect = groupRect(hole);
				highlight.setAttribute("x", String(rect.x));
				highlight.setAttribute("y", String(rect.y));
				highlight.setAttribute("width", String(rect.w));
				highlight.setAttribute("height", String(rect.h));
				highlight.setAttribute("opacity", "0.9");
			} else highlight.setAttribute("opacity", "0");
		}
		const ghost = ghostRef.current;
		const start = pendingRef.current;
		if (ghost && start) {
			const from = holeXY(start);
			const end = hole ? holeXY(hole) : point;
			ghost.setAttribute("d", wireCurve(from.x, from.y, end.x, end.y).d);
			ghost.setAttribute("opacity", "1");
		} else ghost?.setAttribute("opacity", "0");

		const chip = timerGhostRef.current;
		if (chip && toolRef.current === "timer" && hole && hole.col <= COLS - 3) {
			const frame = timerFrame(hole.col);
			chip.setAttribute("x", String(frame.x));
			chip.setAttribute("y", String(frame.y));
			chip.setAttribute("width", String(frame.w));
			chip.setAttribute("height", String(frame.h));
			chip.setAttribute("opacity", "1");
		} else chip?.setAttribute("opacity", "0");

		const potGhost = potGhostRef.current;
		if (potGhost && toolRef.current === "pot" && hole?.kind === "strip" && hole.col <= COLS - 2) {
			const center = holeXY(strip(hole.row, hole.col + 1));
			potGhost.setAttribute("x", String(center.x - 22));
			potGhost.setAttribute("y", String(center.y - 13));
			potGhost.setAttribute("width", "44");
			potGhost.setAttribute("height", "26");
			potGhost.setAttribute("opacity", "1");
		} else potGhost?.setAttribute("opacity", "0");
	}

	function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
		if (event.button !== 0) return;
		const svg = svgRef.current;
		if (!svg) return;
		const point = localPoint(svg, event);
		if (!point) return;
		const hole = nearestHole(point.x, point.y, 9);
		const currentTool = toolRef.current;
		const part = findPart(point.x, point.y, hole);
		const wire = hole ? null : findWire(point.x, point.y);

		if (currentTool === "erase") {
			if (part) removePart(part.id);
			else if (wire) removeWire(wire.id);
			else if (hole) {
				const owner = docRef.current.parts.find((item) =>
					leadHoles(item).some((lead) => sameHole(lead, hole)),
				);
				if (owner) removePart(owner.id);
				else {
					const end = docRef.current.wires.find(
						(item) => sameHole(item.a, hole) || sameHole(item.b, hole),
					);
					if (end) removeWire(end.id);
				}
			}
			return;
		}

		if (currentTool === "select") {
			if (hole) {
				setProbe(hole);
				const owner = docRef.current.parts.find((item) =>
					leadHoles(item).some((lead) => sameHole(lead, hole)),
				);
				if (owner) setSelected({ kind: "part", id: owner.id });
				else {
					const end = docRef.current.wires.find(
						(item) => sameHole(item.a, hole) || sameHole(item.b, hole),
					);
					setSelected(end ? { kind: "wire", id: end.id } : null);
				}
				return;
			}
			if (part) setSelected({ kind: "part", id: part.id });
			else if (wire) setSelected({ kind: "wire", id: wire.id });
			return;
		}

		if (!hole) {
			if (part?.type === "battery" || part?.type === "timer")
				setSelected({ kind: "part", id: part.id });
			return;
		}
		if (currentTool === "timer") {
			placeTimer(hole.col);
			return;
		}
		if (currentTool === "pot") {
			placePot(hole);
			return;
		}
		const waiting = pendingRef.current;
		if (!waiting) {
			setPending(hole);
			return;
		}
		placeLead(currentTool, waiting, hole);
		setPending(null);
	}

	function findPart(x: number, y: number, hole: Hole | null): Part | null {
		const list = docRef.current.parts;
		for (let index = list.length - 1; index >= 0; index--) {
			const part = list[index];
			if (part.type === "battery") {
				const body = BATTERY_BODY;
				if (x >= body.x && x <= body.x + body.w && y >= body.y && y <= body.y + body.h) return part;
				continue;
			}
			if (part.type === "timer") {
				const frame = timerFrame(part.col);
				if (x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h)
					return part;
				continue;
			}
			if (part.type === "pot") {
				const center = holeXY(part.w);
				if (Math.abs(x - center.x) <= 22 && Math.abs(y - center.y) <= 14) return part;
				continue;
			}
			if (hole) continue;
			const a = holeXY(part.a);
			const b = holeXY(part.b);
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const length = dx * dx + dy * dy;
			if (length < 1) continue;
			let t = ((x - a.x) * dx + (y - a.y) * dy) / length;
			t = Math.max(0, Math.min(1, t));
			if (t < 0.18 || t > 0.82) continue;
			const distance = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
			if (distance < 14) return part;
		}
		return null;
	}

	function findWire(x: number, y: number): Wire | null {
		const list = docRef.current.wires;
		for (let index = list.length - 1; index >= 0; index--) {
			const wire = list[index];
			const a = holeXY(wire.a);
			const b = holeXY(wire.b);
			if (nearWire(x, y, a.x, a.y, b.x, b.y)) return wire;
		}
		return null;
	}

	function patch(id: string, update: (part: Part) => Part) {
		commit(
			{
				parts: docRef.current.parts.map((part) => (part.id === id ? update(part) : part)),
				wires: docRef.current.wires,
			},
			false,
		);
	}

	const plateRight = colX(COLS) + 16;

	return (
		<div className="mx-auto max-w-6xl px-6 pb-16">
			<style>{`
				.led-glow, .lamp-glow { opacity: 0; }
			`}</style>
			<div className="rounded-3xl bg-[#191b1a] p-4 text-[#f4efe8] select-none sm:p-5">
				<div className="grid items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
					<aside>
						<div className="flex flex-wrap gap-1.5 lg:flex-col">
							{TOOLS.map((item) => (
								<button
									key={item.id}
									type="button"
									aria-pressed={tool === item.id}
									onClick={() => chooseTool(item.id)}
									className={`rounded-full px-3 py-1.5 text-left text-sm ${
										tool === item.id
											? "bg-[#fecef5] text-[#191b1a]"
											: "text-[#f4efe8] hover:bg-white/10"
									}`}
								>
									{item.label}
								</button>
							))}
						</div>
						{tool === "wire" || selectedWire ? (
							<div className="mt-3 flex flex-wrap gap-1.5">
								{WIRE_COLORS.map((color) => (
									<button
										key={color}
										type="button"
										aria-label={`Wire color ${color}`}
										onClick={() => {
											setWireColor(color);
											if (selectedWire) {
												commit(
													{
														parts,
														wires: wires.map((wire) =>
															wire.id === selectedWire.id ? { ...wire, color } : wire,
														),
													},
													false,
												);
											}
										}}
										className="h-5 w-5 rounded-full border border-white/30"
										style={{
											background: color,
											outline: wireColor === color ? "2px solid #fecef5" : undefined,
											outlineOffset: 1,
										}}
									/>
								))}
							</div>
						) : null}
						<p className="mt-3 text-xs leading-5 text-[#f4efe8]/60">{TOOL_HELP[tool]}</p>
						<div className="mt-4 flex flex-wrap gap-1.5">
							<button
								type="button"
								onClick={() => load(blinker, "Astable blinker. Pin 3 drives the LED.")}
								className="rounded-full px-2.5 py-1 text-xs text-[#f4efe8]/80 underline-offset-2 hover:underline"
							>
								Blinker
							</button>
							<button
								type="button"
								onClick={() => load(tone, "Turn sound on. The LED flickers with the tone.")}
								className="rounded-full px-2.5 py-1 text-xs text-[#f4efe8]/80 underline-offset-2 hover:underline"
							>
								Tone
							</button>
							<button
								type="button"
								onClick={() => load(oneshot, "Press the button. Holding it keeps the output high.")}
								className="rounded-full px-2.5 py-1 text-xs text-[#f4efe8]/80 underline-offset-2 hover:underline"
							>
								One-shot
							</button>
							<button
								type="button"
								onClick={() =>
									load(() => ({ parts: [], wires: [] }), "Pick a part, then click its holes.")
								}
								className="rounded-full px-2.5 py-1 text-xs text-[#f4efe8]/80 underline-offset-2 hover:underline"
							>
								Clear
							</button>
							<button
								type="button"
								onClick={undo}
								disabled={!canUndo}
								className="rounded-full px-2.5 py-1 text-xs text-[#f4efe8]/80 underline-offset-2 hover:underline disabled:opacity-30"
							>
								Undo
							</button>
						</div>
						<button
							type="button"
							aria-pressed={sound}
							onClick={toggleSound}
							className={`mt-3 rounded-full px-3 py-1.5 text-sm ${
								sound ? "bg-[#fecef5] text-[#191b1a]" : "bg-white/10 text-[#f4efe8]"
							}`}
						>
							{sound ? "Sound on" : "Sound off"}
						</button>
						<ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] leading-5 text-[#f4efe8]/55">
							<li>1 GND</li>
							<li>8 VCC</li>
							<li>2 TRIG</li>
							<li>7 DIS</li>
							<li>3 OUT</li>
							<li>6 THR</li>
							<li>4 RST</li>
							<li>5 CTRL</li>
						</ul>
						<details className="mt-3 text-xs leading-5 text-[#f4efe8]/60">
							<summary className="cursor-pointer text-[#f4efe8]/80">Wiring a 555</summary>
							<p className="mt-2">
								Astable: pin 1 to ground, pins 8 and 4 to +. Tie 2 to 6. Capacitor from there to
								ground. R2 from pin 7 to pin 6, R1 from + to pin 7. LED and resistor on pin 3. f ≈
								1.44 / ((R1 + 2 R2) C). The blinker uses a pot as R2, with the wiper tied to one
								end.
							</p>
							<p className="mt-2">
								One-shot: tie pin 6 to pin 7, resistor from + to that node, capacitor to ground.
								Pull pin 2 up, and momentarily short it to ground. Pulse ≈ 1.1 RC.
							</p>
						</details>
					</aside>

					<div className="min-w-0">
						{hint ? <p className="mb-2 text-xs text-[#f4efe8]/55">{hint}</p> : null}
						{pending ? (
							<p className="mb-2 text-xs text-[#fecef5]">Click the second hole. Escape cancels.</p>
						) : null}
						<div className="overflow-x-auto">
							<svg
								ref={svgRef}
								viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
								className={`h-auto w-full min-w-[760px] touch-manipulation ${
									tool === "select" ? "cursor-pointer" : "cursor-crosshair"
								}`}
								role="application"
								aria-label="Solderless breadboard"
								data-tool={tool}
								onPointerDown={onPointerDown}
								onPointerMove={onPointerMove}
								onPointerLeave={() => {
									hiRef.current?.setAttribute("opacity", "0");
									ghostRef.current?.setAttribute("opacity", "0");
									timerGhostRef.current?.setAttribute("opacity", "0");
								}}
								onContextMenu={(event) => {
									event.preventDefault();
									setPending(null);
								}}
							>
								<defs>
									<linearGradient id="resistor-body" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0" stopColor="#f3d7b0" />
										<stop offset="0.45" stopColor="#e4c196" />
										<stop offset="1" stopColor="#c9a36e" />
									</linearGradient>
									<filter id="bb-glow" x="-80%" y="-80%" width="260%" height="260%">
										<feGaussianBlur stdDeviation="2.4" />
									</filter>
								</defs>
								<rect x={12} y={-4} width={plateRight - 12} height={352} rx={16} fill="#f3eee6" />
								<rect x={28} y={156} width={plateRight - 44} height={36} rx={8} fill="#e4dccf" />
								{LANES.filter((lane) => lane.group !== "top" && lane.group !== "bot").map(
									(lane) => (
										<line
											key={lane.id}
											x1={colX(1)}
											x2={colX(COLS)}
											y1={lane.y}
											y2={lane.y}
											stroke={lane.color}
											strokeWidth={1.4}
											opacity={0.55}
										/>
									),
								)}
								<rect ref={hiRef} rx={6} fill="#f6c4e6" opacity={0} pointerEvents="none" />
								{wires.map((wire) => {
									const a = holeXY(wire.a);
									const b = holeXY(wire.b);
									const curve = wireCurve(a.x, a.y, b.x, b.y);
									const active = selectedWire?.id === wire.id;
									return (
										<g key={wire.id}>
											{active ? (
												<path
													d={curve.d}
													fill="none"
													stroke="#fecef5"
													strokeWidth={8}
													strokeLinecap="round"
													opacity={0.7}
												/>
											) : null}
											<path
												d={curve.d}
												fill="none"
												stroke="rgba(40,32,28,0.28)"
												strokeWidth={5}
												strokeLinecap="round"
											/>
											<path
												d={curve.d}
												fill="none"
												stroke={wire.color}
												strokeWidth={3}
												strokeLinecap="round"
											/>
										</g>
									);
								})}
								{parts.map((part) => (
									<PartGraphic
										key={part.id}
										part={part}
										selected={selectedPart?.id === part.id}
										onPress={(id, down) => {
											setButton(id, down);
											if (down) setSelected({ kind: "part", id });
										}}
										onErase={removePart}
										onSelect={(id) => setSelected({ kind: "part", id })}
										onTurn={(id, position) =>
											patch(id, (item) => (item.type === "pot" ? { ...item, position } : item))
										}
									/>
								))}
								{HOLES.map((hole) => (
									<circle
										key={hole.key}
										cx={hole.x}
										cy={hole.y}
										r={2.7}
										fill="#322e2b"
										pointerEvents="none"
									/>
								))}
								{LANES.map((lane) => (
									<text
										key={lane.id}
										x={20}
										y={lane.y + 3}
										textAnchor="middle"
										fontSize={10}
										fill={lane.color}
										pointerEvents="none"
									>
										{lane.label}
									</text>
								))}
								{Array.from({ length: COLS }, (_, index) => (
									<text
										key={index}
										x={colX(index + 1)}
										y={52}
										textAnchor="middle"
										fontSize={8}
										fill="#9a9186"
										pointerEvents="none"
									>
										{index + 1}
									</text>
								))}
								{probe ? (
									<circle
										cx={holeXY(probe).x}
										cy={holeXY(probe).y}
										r={6}
										fill="none"
										stroke="#fecef5"
										strokeWidth={1.5}
										pointerEvents="none"
									/>
								) : null}
								{pending ? (
									<circle
										cx={holeXY(pending).x}
										cy={holeXY(pending).y}
										r={6}
										fill="none"
										stroke="#ef6a33"
										strokeWidth={1.5}
										pointerEvents="none"
									/>
								) : null}
								<path
									ref={ghostRef}
									fill="none"
									stroke="#fecef5"
									strokeWidth={2.4}
									strokeDasharray="5 4"
									opacity={0}
									pointerEvents="none"
								/>
								<rect
									ref={timerGhostRef}
									fill="rgba(254,206,245,0.16)"
									stroke="#fecef5"
									strokeDasharray="4 3"
									rx={4}
									opacity={0}
									pointerEvents="none"
								/>
								<rect
									ref={potGhostRef}
									fill="rgba(254,206,245,0.16)"
									stroke="#fecef5"
									strokeDasharray="4 3"
									rx={5}
									opacity={0}
									pointerEvents="none"
								/>
							</svg>
						</div>
						<p className="mt-2 text-[11px] leading-5 text-[#f4efe8]/45">
							Five holes in a column are one node. The center gap splits the two sides. Each colored
							rail runs the full length.
						</p>
						<LivePanel
							api={liveRef}
							showDrop={Boolean(selectedPart && selectedPart.type !== "timer")}
						/>
						{selectedPart && selectedPart.type !== "timer" ? (
							<div className="mt-3">
								{selectedPart.type === "resistor" ? (
									<>
										<p className="text-sm">{formatOhms(selectedPart.ohms)}</p>
										<LogSlider
											min={100}
											max={1_000_000}
											value={selectedPart.ohms}
											onChange={(ohms) =>
												patch(selectedPart.id, (part) =>
													part.type === "resistor" ? { ...part, ohms } : part,
												)
											}
										/>
										<div className="mt-2 flex flex-wrap gap-1.5">
											{RESISTOR_PRESETS.map((ohms) => (
												<button
													key={ohms}
													type="button"
													onClick={() =>
														patch(selectedPart.id, (part) =>
															part.type === "resistor" ? { ...part, ohms } : part,
														)
													}
													className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] hover:border-[#fecef5]"
												>
													{formatOhms(ohms)}
												</button>
											))}
										</div>
									</>
								) : null}
								{selectedPart.type === "pot" ? (
									<>
										<p className="text-sm">Wiper {Math.round(selectedPart.position * 100)}%</p>
										<input
											type="range"
											min={0}
											max={1000}
											value={Math.round(selectedPart.position * 1000)}
											aria-label="Wiper"
											onChange={(event) => {
												const position = Number(event.target.value) / 1000;
												patch(selectedPart.id, (part) =>
													part.type === "pot" ? { ...part, position } : part,
												);
											}}
											className="mt-2 w-full accent-[#fecef5]"
										/>
										<p className="mt-3 text-sm">Track {formatOhms(selectedPart.ohms)}</p>
										<LogSlider
											min={1_000}
											max={1_000_000}
											value={selectedPart.ohms}
											onChange={(ohms) =>
												patch(selectedPart.id, (part) =>
													part.type === "pot" ? { ...part, ohms } : part,
												)
											}
										/>
										<div className="mt-2 flex flex-wrap gap-1.5">
											{POT_PRESETS.map((ohms) => (
												<button
													key={ohms}
													type="button"
													onClick={() =>
														patch(selectedPart.id, (part) =>
															part.type === "pot" ? { ...part, ohms } : part,
														)
													}
													className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] hover:border-[#fecef5]"
												>
													{formatOhms(ohms)}
												</button>
											))}
										</div>
										<p className="mt-2 text-xs text-[#f4efe8]/60">
											Outer pins are the track. Tie the wiper to one end to use it as a variable
											resistor.
										</p>
									</>
								) : null}
								{selectedPart.type === "capacitor" ? (
									<>
										<p className="text-sm">{formatFarads(selectedPart.farads)}</p>
										<LogSlider
											min={10e-9}
											max={470e-6}
											value={selectedPart.farads}
											onChange={(farads) =>
												patch(selectedPart.id, (part) =>
													part.type === "capacitor" ? { ...part, farads } : part,
												)
											}
										/>
										<div className="mt-2 flex flex-wrap gap-1.5">
											{CAP_PRESETS.map((farads) => (
												<button
													key={farads}
													type="button"
													onClick={() =>
														patch(selectedPart.id, (part) =>
															part.type === "capacitor" ? { ...part, farads } : part,
														)
													}
													className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] hover:border-[#fecef5]"
												>
													{formatFarads(farads)}
												</button>
											))}
										</div>
									</>
								) : null}
								{selectedPart.type === "led" ? (
									<div className="flex gap-2">
										{(["red", "yellow", "green"] as LedColor[]).map((color) => (
											<button
												key={color}
												type="button"
												aria-label={`${color} LED`}
												onClick={() =>
													patch(selectedPart.id, (part) =>
														part.type === "led" ? { ...part, color } : part,
													)
												}
												className="h-6 w-6 rounded-full border"
												style={{
													background: LED_COLOR[color],
													borderColor: selectedPart.color === color ? "#fecef5" : "transparent",
												}}
											/>
										))}
									</div>
								) : null}
								{selectedPart.type === "battery" ? (
									<div className="flex gap-2">
										{[5, 9, 12].map((volts) => (
											<button
												key={volts}
												type="button"
												onClick={() =>
													patch(selectedPart.id, (part) =>
														part.type === "battery" ? { ...part, volts } : part,
													)
												}
												className={`rounded-full px-3 py-1 text-sm ${
													selectedPart.volts === volts
														? "bg-[#fecef5] text-[#191b1a]"
														: "bg-white/10"
												}`}
											>
												{volts} V
											</button>
										))}
									</div>
								) : null}
								{selectedPart.type === "button" ? (
									<p className="text-xs text-[#f4efe8]/60">
										Hold the cap, or select it and hold space.
									</p>
								) : null}
								{selectedPart.type === "speaker" ? (
									<p className="text-xs text-[#f4efe8]/60">
										8 Ω. Sound follows the voltage across it.
									</p>
								) : null}
							</div>
						) : null}
						{selectedPart?.type === "timer" ? (
							<p className="mt-3 text-xs text-[#f4efe8]/60">
								Notch to the left. Pins 1–4 run along the bottom, 8–5 along the top. The lamp is the
								output.
							</p>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
