import { Canvas } from "@react-three/fiber";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import { type ViewMode } from "./controls";
import { WorldScene } from "./scene";
import {
	SEASONS,
	WEATHERS,
	type ClimateState,
	type Season,
	type Weather,
	buildWorld,
	defaultClimate,
	pickSeasonalWeather,
	seasonFromYear,
	stepAtmosphere,
	stepPrecipitation,
	stepSnowCover,
	weatherAllowed,
} from "./sim";

export default function World() {
	const [seed, setSeed] = useState(() => (Math.random() * 1e9) | 0);
	const world = useMemo(() => buildWorld(seed), [seed]);

	const climateRef = useRef<ClimateState>(defaultClimate());
	const [season, setSeasonState] = useState<Season>(climateRef.current.season);
	const [weather, setWeatherState] = useState<Weather>(climateRef.current.weather);
	const [dayPhase, setDayPhase] = useState(climateRef.current.dayPhase);
	const [clockLabel, setClockLabel] = useState("07:40");
	const [snowLabel, setSnowLabel] = useState(0);
	const [viewMode, setViewMode] = useState<ViewMode>("fly");
	const viewModeRef = useRef<ViewMode>("fly");
	viewModeRef.current = viewMode;

	const [playDay, setPlayDay] = useState(true);
	const [playYear, setPlayYear] = useState(true);
	const [playWeather, setPlayWeather] = useState(true);
	const [daySpeed, setDaySpeed] = useState(1);
	const [yearSpeed, setYearSpeed] = useState(1);

	const playDayRef = useRef(playDay);
	const playYearRef = useRef(playYear);
	const playWeatherRef = useRef(playWeather);
	const daySpeedRef = useRef(daySpeed);
	const yearSpeedRef = useRef(yearSpeed);
	const weatherTimer = useRef(18 + Math.random() * 10);
	playDayRef.current = playDay;
	playYearRef.current = playYear;
	playWeatherRef.current = playWeather;
	daySpeedRef.current = daySpeed;
	yearSpeedRef.current = yearSpeed;

	useEffect(() => {
		let frame = 0;
		let last = performance.now();
		let uiAccum = 0;
		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const c = climateRef.current;
			const daySpeed = Math.max(0.05, daySpeedRef.current);
			// Atmosphere / precip / weather cycle track day timeline speed.
			const climateDt = dt * daySpeed;
			if (playDayRef.current) c.dayPhase = (c.dayPhase + dt * 0.02 * daySpeed) % 1;
			if (playYearRef.current) {
				c.yearPhase = (c.yearPhase + dt * 0.004 * yearSpeedRef.current) % 1;
				const next = seasonFromYear(c.yearPhase);
				if (next !== c.season) {
					c.season = next;
					setSeasonState(next);
					if (!weatherAllowed(next, c.weather)) {
						const w = pickSeasonalWeather(next);
						c.weather = w;
						setWeatherState(w);
					}
				}
			}

			if (playWeatherRef.current) {
				weatherTimer.current -= climateDt;
				if (weatherTimer.current <= 0) {
					const next = pickSeasonalWeather(c.season, Math.random(), c.weather);
					c.weather = next;
					setWeatherState(next);
					weatherTimer.current = 14 + Math.random() * 16;
				}
			}

			stepAtmosphere(c, climateDt);
			stepPrecipitation(c, climateDt);
			c.snowCover = stepSnowCover(c.snowCover, c.weather, c.season, climateDt, c.precipAmount);

			uiAccum += dt;
			if (uiAccum > 0.2) {
				uiAccum = 0;
				const h = Math.floor(c.dayPhase * 24);
				const m = Math.floor((c.dayPhase * 24 * 60) % 60);
				setClockLabel(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
				setDayPhase(c.dayPhase);
				setSnowLabel(c.snowCover);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, []);

	const setSeason = (next: Season) => {
		const idx = SEASONS.indexOf(next);
		const c = climateRef.current;
		c.season = next;
		c.yearPhase = (idx + 0.5) / SEASONS.length;
		setSeasonState(next);
		if (!weatherAllowed(next, c.weather)) {
			const w = pickSeasonalWeather(next);
			c.weather = w;
			setWeatherState(w);
		}
	};

	const setWeather = (next: Weather) => {
		climateRef.current.weather = next;
		setWeatherState(next);
		// Manual pick pauses the auto cycle briefly so the choice sticks.
		weatherTimer.current = 22 + Math.random() * 8;
	};

	const onDaySlider = (value: number) => {
		climateRef.current.dayPhase = value;
		setDayPhase(value);
		const h = Math.floor(value * 24);
		const m = Math.floor((value * 24 * 60) % 60);
		setClockLabel(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
	};

	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				height: "min(78vh, 820px)",
				minHeight: 420,
				borderRadius: 12,
				overflow: "hidden",
				background: "#0c1218",
				fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
			}}
		>
			<Canvas
				shadows
				dpr={[1, 1.75]}
				camera={{ position: [32, 28, 42], fov: 48, near: 0.4, far: 280 }}
				gl={{ antialias: true, toneMappingExposure: 1.05 }}
				style={{ width: "100%", height: "100%", touchAction: "none" }}
			>
				<WorldScene
					config={world.config}
					noise={world.noise}
					heightField={world.heightField}
					trees={world.trees}
					rocks={world.rocks}
					season={season}
					climateRef={climateRef}
					viewMode={viewMode}
					viewModeRef={viewModeRef}
				/>
			</Canvas>

			<div
				style={{
					position: "absolute",
					inset: 0,
					pointerEvents: "none",
					background:
						"linear-gradient(180deg, rgba(8,12,18,0.35) 0%, transparent 18%, transparent 72%, rgba(8,12,18,0.45) 100%)",
				}}
			/>

			<header
				style={{
					position: "absolute",
					top: 16,
					left: 18,
					right: 18,
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					gap: 12,
					pointerEvents: "none",
				}}
			>
				<div>
					<div
						style={{
							fontFamily: '"Fraunces", "IBM Plex Serif", Georgia, serif',
							fontSize: "clamp(1.6rem, 3vw, 2.15rem)",
							letterSpacing: "-0.03em",
							color: "#f2efe6",
							textShadow: "0 1px 12px rgba(0,0,0,0.45)",
							lineHeight: 1.05,
						}}
					>
						Terraform
					</div>
					<div style={{ marginTop: 4, fontSize: 13, color: "rgba(230,226,214,0.72)" }}>
						{viewMode === "fly"
							? "Fly · click to look · WASD move · E/Q up down · Shift sprint"
							: "Walk · click to look · WASD run · Space jump · Shift sprint"}
					</div>
				</div>
				<div
					style={{
						fontVariantNumeric: "tabular-nums",
						fontSize: 13,
						color: "rgba(242,239,230,0.85)",
						textAlign: "right",
						lineHeight: 1.45,
					}}
				>
					<div>{clockLabel}</div>
					<div style={{ textTransform: "capitalize", opacity: 0.8 }}>
						{season} · {weather}
					</div>
					<div style={{ opacity: 0.55, fontSize: 11 }}>
						snow pack {Math.round(snowLabel * 100)}% · seed {seed}
					</div>
				</div>
			</header>

			<div
				style={{
					position: "absolute",
					left: 14,
					right: 14,
					bottom: 14,
					display: "flex",
					flexWrap: "wrap",
					gap: 8,
					alignItems: "flex-end",
					justifyContent: "space-between",
					pointerEvents: "none",
				}}
			>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8, pointerEvents: "auto" }}>
					<Panel>
						<Label>View</Label>
						<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
							<Chip active={viewMode === "fly"} onClick={() => setViewMode("fly")}>
								fly
							</Chip>
							<Chip active={viewMode === "fps"} onClick={() => setViewMode("fps")}>
								walk
							</Chip>
						</div>
					</Panel>

					<Panel>
						<Label>Season</Label>
						<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
							{SEASONS.map((s) => (
								<Chip key={s} active={season === s} onClick={() => setSeason(s)}>
									{s}
								</Chip>
							))}
						</div>
						<div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
							<Chip active={playYear} onClick={() => setPlayYear((v) => !v)}>
								{playYear ? "year ▶" : "year ❚❚"}
							</Chip>
							<input
								type="range"
								min={0.25}
								max={4}
								step={0.25}
								value={yearSpeed}
								onChange={(e) => setYearSpeed(Number(e.target.value))}
								style={sliderStyle}
								title="Year speed"
							/>
						</div>
					</Panel>

					<Panel>
						<Label>Day / night</Label>
						<input
							type="range"
							min={0}
							max={1}
							step={0.001}
							value={dayPhase}
							onChange={(e) => onDaySlider(Number(e.target.value))}
							style={{ ...sliderStyle, width: 140 }}
						/>
						<div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
							<Chip active={playDay} onClick={() => setPlayDay((v) => !v)}>
								{playDay ? "clock ▶" : "clock ❚❚"}
							</Chip>
							<input
								type="range"
								min={0.25}
								max={6}
								step={0.25}
								value={daySpeed}
								onChange={(e) => setDaySpeed(Number(e.target.value))}
								style={sliderStyle}
								title="Day speed"
							/>
						</div>
					</Panel>

					<Panel>
						<Label>Weather</Label>
						<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
							{WEATHERS.map((w) => (
								<Chip key={w} active={weather === w} onClick={() => setWeather(w)}>
									{w}
								</Chip>
							))}
						</div>
						<div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
							<Chip active={playWeather} onClick={() => setPlayWeather((v) => !v)}>
								{playWeather ? "cycle ▶" : "cycle ❚❚"}
							</Chip>
						</div>
					</Panel>
				</div>

				<button
					type="button"
					onClick={() => {
						climateRef.current.snowCover = 0;
						setSnowLabel(0);
						setSeed((Math.random() * 1e9) | 0);
					}}
					style={{
						pointerEvents: "auto",
						border: "1px solid rgba(242,239,230,0.28)",
						background: "rgba(18, 24, 30, 0.72)",
						color: "#f2efe6",
						borderRadius: 999,
						padding: "10px 16px",
						fontSize: 13,
						letterSpacing: "0.04em",
						textTransform: "uppercase",
						cursor: "pointer",
						backdropFilter: "blur(8px)",
					}}
				>
					Regenerate
				</button>
			</div>
		</div>
	);
}

function Panel({ children }: { children: ReactNode }) {
	return (
		<div
			style={{
				background: "rgba(14, 18, 24, 0.72)",
				border: "1px solid rgba(242,239,230,0.14)",
				borderRadius: 10,
				padding: "10px 12px",
				backdropFilter: "blur(10px)",
				maxWidth: 280,
			}}
		>
			{children}
		</div>
	);
}

function Label({ children }: { children: ReactNode }) {
	return (
		<div
			style={{
				fontSize: 10,
				letterSpacing: "0.12em",
				textTransform: "uppercase",
				color: "rgba(230,226,214,0.55)",
				marginBottom: 6,
			}}
		>
			{children}
		</div>
	);
}

function Chip({
	children,
	active,
	onClick,
}: {
	children: ReactNode;
	active?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				border: active ? "1px solid rgba(242,239,230,0.55)" : "1px solid rgba(242,239,230,0.16)",
				background: active ? "rgba(242,239,230,0.16)" : "transparent",
				color: "#f2efe6",
				borderRadius: 6,
				padding: "4px 8px",
				fontSize: 12,
				textTransform: "capitalize",
				cursor: "pointer",
			}}
		>
			{children}
		</button>
	);
}

const sliderStyle: CSSProperties = {
	width: 88,
	accentColor: "#c4b48a",
};
