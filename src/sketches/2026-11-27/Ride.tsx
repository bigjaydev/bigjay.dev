import { useEffect, useRef, useState, type CSSProperties } from "react";
import { drawScene } from "./draw";
import {
	DEFAULT_PARAMS,
	createSim,
	step,
	telemetry,
	type Params,
	type SimState,
} from "./sim";

type SliderSpec = {
	key: keyof Params;
	label: string;
	min: number;
	max: number;
	step: number;
	fmt: (v: number) => string;
	hint: string;
};

const SLIDERS: SliderSpec[] = [
	{
		key: "springRate",
		label: "Spring rate",
		min: 6000,
		max: 42000,
		step: 500,
		fmt: (v) => `${(v / 1000).toFixed(1)} kN/m`,
		hint: "Softer = more body travel over bumps; stiffer = flatter but harsher.",
	},
	{
		key: "springDamp",
		label: "Damper",
		min: 400,
		max: 6000,
		step: 50,
		fmt: (v) => `${v.toFixed(0)} N·s/m`,
		hint: "Controls rebound. Too little and the buggy oscillates; too much feels packed down.",
	},
	{
		key: "tirePressure",
		label: "Tire pressure",
		min: 10,
		max: 48,
		step: 1,
		fmt: (v) => `${v.toFixed(0)} psi`,
		hint: "Low psi squashes and adds drag; high psi is harsh. Grip peaks near 30 psi.",
	},
	{
		key: "peakTorque",
		label: "Peak torque",
		min: 80,
		max: 520,
		step: 10,
		fmt: (v) => `${v.toFixed(0)} N·m`,
		hint: "Raises the whole torque curve — more shove at the wheels.",
	},
	{
		key: "redline",
		label: "Redline",
		min: 3500,
		max: 8500,
		step: 100,
		fmt: (v) => `${v.toFixed(0)} rpm`,
		hint: "Where power peaks and the curve falls off. Higher redline = wider powerband.",
	},
	{
		key: "throttle",
		label: "Throttle",
		min: 0,
		max: 1,
		step: 0.01,
		fmt: (v) => `${(v * 100).toFixed(0)}%`,
		hint: "Scales delivered torque. Watch RPM, torque, and power dots on the curve.",
	},
];

const PRESETS: Array<{ name: string; patch: Partial<Params> }> = [
	{ name: "Trail", patch: { springRate: 16000, springDamp: 2000, tirePressure: 26 } },
	{ name: "Stiff", patch: { springRate: 34000, springDamp: 4200, tirePressure: 38 } },
	{ name: "Balloon", patch: { springRate: 12000, springDamp: 1600, tirePressure: 14 } },
	{ name: "Torque", patch: { peakTorque: 420, redline: 5200, throttle: 0.7 } },
	{ name: "Revvy", patch: { peakTorque: 220, redline: 7800, throttle: 0.85 } },
];

export default function Ride() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const simRef = useRef<SimState>(createSim());
	const paramsRef = useRef<Params>({ ...DEFAULT_PARAMS });
	const [params, setParams] = useState<Params>({ ...DEFAULT_PARAMS });
	const [hint, setHint] = useState(SLIDERS[0]!.hint);
	const [paused, setPaused] = useState(false);

	useEffect(() => {
		paramsRef.current = params;
	}, [params]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let raf = 0;
		let last = performance.now();
		let alive = true;

		const resize = () => {
			const parent = canvas.parentElement;
			if (!parent) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const w = parent.clientWidth;
			const h = parent.clientHeight;
			canvas.width = Math.max(1, Math.floor(w * dpr));
			canvas.height = Math.max(1, Math.floor(h * dpr));
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(canvas.parentElement!);

		const loop = (now: number) => {
			if (!alive) return;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			if (!paused) {
				simRef.current = step(simRef.current, paramsRef.current, dt);
			}
			const s = simRef.current;
			const p = paramsRef.current;
			const tel = telemetry(s, p);
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			drawScene(ctx, w, h, s, p, tel);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, [paused]);

	const set = (key: keyof Params, value: number) => {
		setParams((prev) => ({ ...prev, [key]: value }));
	};

	const reset = () => {
		simRef.current = createSim();
		setParams({ ...DEFAULT_PARAMS });
		setPaused(false);
	};

	return (
		<div className="ride-root-20261127" style={rootStyle}>
			<style>{`
				@media (max-width: 820px) {
					.ride-root-20261127 {
						grid-template-columns: 1fr !important;
						grid-template-rows: minmax(260px, 1fr) auto;
						height: auto !important;
						min-height: calc(100dvh - 13.5rem);
					}
					.ride-root-20261127 aside {
						border-left: none !important;
						border-top: 1px solid rgba(232, 226, 200, 0.12);
						max-height: 46vh;
					}
				}
			`}</style>
			<div style={stageStyle}>
				<canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
			</div>

			<aside style={panelStyle}>
				<header style={headerStyle}>
					<div>
						<div style={titleStyle}>Suspension Lab</div>
						<p style={subStyle}>Top + side views — watch all four springs compress as you tune the setup.</p>
					</div>
					<div style={btnRow}>
						<button type="button" style={btnStyle} onClick={() => setPaused((p) => !p)}>
							{paused ? "Resume" : "Pause"}
						</button>
						<button type="button" style={btnStyle} onClick={reset}>
							Reset
						</button>
					</div>
				</header>

				<div style={presetRow}>
					{PRESETS.map((pr) => (
						<button
							key={pr.name}
							type="button"
							style={chipStyle}
							onClick={() => setParams((prev) => ({ ...prev, ...pr.patch }))}
						>
							{pr.name}
						</button>
					))}
				</div>

				<div style={slidersStyle}>
					{SLIDERS.map((spec) => (
						<label
							key={spec.key}
							style={sliderLabel}
							onFocus={() => setHint(spec.hint)}
							onPointerEnter={() => setHint(spec.hint)}
						>
							<span style={sliderHead}>
								<span>{spec.label}</span>
								<span style={valStyle}>{spec.fmt(params[spec.key])}</span>
							</span>
							<input
								type="range"
								min={spec.min}
								max={spec.max}
								step={spec.step}
								value={params[spec.key]}
								onChange={(e) => set(spec.key, Number(e.target.value))}
								style={rangeStyle}
							/>
						</label>
					))}
				</div>

				<p style={hintStyle}>{hint}</p>
			</aside>
		</div>
	);
}

const rootStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
	gap: 0,
	height: "calc(100dvh - 13.5rem)",
	minHeight: 420,
	borderRadius: 12,
	overflow: "hidden",
	border: "1px solid rgba(40, 36, 28, 0.35)",
	background: "#1a2430",
	fontFamily: "Inter, system-ui, sans-serif",
	color: "#e8e4d8",
};

const stageStyle: CSSProperties = {
	position: "relative",
	minWidth: 0,
	minHeight: 0,
	background: "#1a2430",
};

const panelStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 12,
	padding: "14px 14px 16px",
	background: "linear-gradient(165deg, #2a3128 0%, #1e241c 55%, #181c16 100%)",
	borderLeft: "1px solid rgba(232, 226, 200, 0.12)",
	overflow: "auto",
};

const headerStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 10,
};

const titleStyle: CSSProperties = {
	fontFamily: "'Libre Baskerville', Georgia, serif",
	fontSize: 20,
	fontWeight: 600,
	letterSpacing: "-0.02em",
	color: "#f0ead8",
};

const subStyle: CSSProperties = {
	margin: "4px 0 0",
	fontSize: 12,
	lineHeight: 1.4,
	color: "#a8b09a",
};

const btnRow: CSSProperties = {
	display: "flex",
	gap: 8,
};

const btnStyle: CSSProperties = {
	flex: 1,
	padding: "7px 10px",
	borderRadius: 6,
	border: "1px solid rgba(232, 226, 200, 0.22)",
	background: "rgba(0,0,0,0.25)",
	color: "#e8e4d8",
	fontSize: 12,
	fontWeight: 600,
	cursor: "pointer",
};

const presetRow: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: 6,
};

const chipStyle: CSSProperties = {
	padding: "4px 9px",
	borderRadius: 4,
	border: "1px solid rgba(232, 162, 58, 0.35)",
	background: "rgba(232, 162, 58, 0.08)",
	color: "#e8a23a",
	fontSize: 11,
	fontWeight: 600,
	cursor: "pointer",
};

const slidersStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 10,
};

const sliderLabel: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 4,
	cursor: "default",
};

const sliderHead: CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	fontSize: 12,
	color: "#d5d8cc",
};

const valStyle: CSSProperties = {
	fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
	fontSize: 11,
	color: "#e8a23a",
};

const rangeStyle: CSSProperties = {
	width: "100%",
	accentColor: "#e8a23a",
	cursor: "pointer",
};

const hintStyle: CSSProperties = {
	margin: 0,
	padding: "10px 11px",
	borderRadius: 8,
	background: "rgba(0,0,0,0.28)",
	border: "1px solid rgba(232, 226, 200, 0.08)",
	fontSize: 12,
	lineHeight: 1.45,
	color: "#b8c0ae",
};
