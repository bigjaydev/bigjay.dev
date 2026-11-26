import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bangSupported, createBangListener, playBangSound } from "./bang";
import { createGame, fireAt, tickTarget, type GameState } from "./game";
import { createGazeTracker, type GazePoint } from "./gaze";

type Phase = "idle" | "booting" | "live" | "error";

export default function Deadeye() {
	const stageRef = useRef<HTMLDivElement>(null);
	const previewRef = useRef<HTMLDivElement>(null);
	const targetElRef = useRef<HTMLDivElement>(null);
	const trackerRef = useRef<ReturnType<typeof createGazeTracker> | null>(null);
	const bangRef = useRef<ReturnType<typeof createBangListener> | null>(null);
	const gameRef = useRef<GameState>(createGame());
	const gazeRef = useRef<GazePoint | null>(null);
	const aimRef = useRef({ x: 0.5, y: 0.5 });
	const phaseRef = useRef<Phase>("idle");
	const lastTs = useRef(0);

	const reticleRef = useRef<HTMLDivElement>(null);
	const shootRef = useRef<() => void>(() => undefined);

	const [phase, setPhase] = useState<Phase>("idle");
	const [error, setError] = useState("");
	const [game, setGame] = useState<GameState>(() => createGame());
	const [gaze, setGaze] = useState<GazePoint | null>(null);
	const [flash, setFlash] = useState(0);
	const [heard, setHeard] = useState("");
	const [listening, setListening] = useState(false);
	const voiceOk = typeof window !== "undefined" && bangSupported();

	useEffect(() => {
		gameRef.current = game;
	}, [game]);

	useEffect(() => {
		phaseRef.current = phase;
	}, [phase]);

	useEffect(() => {
		return () => {
			bangRef.current?.stop();
			trackerRef.current?.stop();
		};
	}, []);

	// Always listen — don’t tie to phase effect timing. Sync phaseRef before setState in arm().
	useEffect(() => {
		const isFireKey = (e: KeyboardEvent) =>
			e.code === "Space" ||
			e.key === " " ||
			e.key === "Spacebar" ||
			e.code === "KeyB" ||
			e.key === "b" ||
			e.key === "B";

		const onKeyDown = (e: KeyboardEvent) => {
			if (phaseRef.current !== "live") return;
			if (e.repeat) return;
			if (e.key === "c" || e.key === "C") {
				trackerRef.current?.calibrateCenter();
				return;
			}
			if (!isFireKey(e)) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			shootRef.current();
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (phaseRef.current !== "live") return;
			if (!isFireKey(e)) return;
			// Stop focused <button> from receiving Space click-on-keyup.
			e.preventDefault();
			e.stopImmediatePropagation();
		};

		document.addEventListener("keydown", onKeyDown, true);
		document.addEventListener("keyup", onKeyUp, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
			document.removeEventListener("keyup", onKeyUp, true);
		};
	}, []);

	useEffect(() => {
		if (phase !== "live") return;
		let raf = 0;
		let gazePaint = 0;
		const loop = (now: number) => {
			const dt = lastTs.current ? Math.min(0.05, (now - lastTs.current) / 1000) : 0.016;
			lastTs.current = now;

			const sample = trackerRef.current?.sample(now) ?? null;
			gazeRef.current = sample;
			if (sample) {
				aimRef.current = { x: sample.x, y: sample.y };
				const ret = reticleRef.current;
				if (ret) {
					ret.style.left = `${sample.x * 100}%`;
					ret.style.top = `${sample.y * 100}%`;
					ret.style.opacity = String(0.35 + sample.confidence * 0.65);
				}
				if (now - gazePaint > 80) {
					gazePaint = now;
					setGaze(sample);
				}
			}

			const nextTarget = tickTarget(gameRef.current.target, dt);
			gameRef.current = { ...gameRef.current, target: nextTarget };
			const el = targetElRef.current;
			if (el) {
				el.style.left = `${nextTarget.x * 100}%`;
				el.style.top = `${nextTarget.y * 100}%`;
				el.style.width = `${nextTarget.r * 2 * 100}%`;
			}

			const fxAlive = gameRef.current.fx.filter((f) => now - f.born < 700);
			if (fxAlive.length !== gameRef.current.fx.length) {
				const next = { ...gameRef.current, fx: fxAlive };
				gameRef.current = next;
				setGame(next);
			}

			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [phase]);

	const lastShotKey = useRef(0);
	function shoot(reason = "manual") {
		if (phaseRef.current !== "live") return;
		const now = performance.now();
		// keydown+keyup both bound — only one shot per press
		if (now - lastShotKey.current < 180) return;
		lastShotKey.current = now;
		const aim = aimRef.current;
		playBangSound();
		setFlash((n) => n + 1);
		setHeard(reason === "click" ? "click" : "key");
		const next = fireAt(gameRef.current, aim, now);
		gameRef.current = next;
		setGame(next);
	}
	shootRef.current = () => shoot("key");

	async function arm() {
		setPhase("booting");
		setError("");
		setHeard("");
		setListening(false);
		try {
			const tracker = createGazeTracker();
			trackerRef.current = tracker;
			await tracker.start();
			if (previewRef.current) {
				previewRef.current.innerHTML = "";
				const v = tracker.video;
				v.style.width = "100%";
				v.style.height = "100%";
				v.style.objectFit = "cover";
				v.style.transform = "scaleX(-1)";
				previewRef.current.appendChild(v);
			}

			const listener = createBangListener({
				onBang: () => {
					if (phaseRef.current !== "live") return;
					const now = performance.now();
					if (now - lastShotKey.current < 180) return;
					lastShotKey.current = now;
					playBangSound();
					setFlash((n) => n + 1);
					const next = fireAt(gameRef.current, aimRef.current, now);
					gameRef.current = next;
					setGame(next);
				},
				onHeard: (text) => setHeard(text),
				onListening: (on) => setListening(on),
			});
			bangRef.current = listener;
			await listener.start();

			const fresh = createGame();
			gameRef.current = fresh;
			setGame(fresh);
			phaseRef.current = "live";
			setPhase("live");
			// Click the range once so the browser tab has keyboard focus (IDE webviews often don’t).
			requestAnimationFrame(() => {
				stageRef.current?.focus({ preventScroll: true });
			});
		} catch (err) {
			trackerRef.current?.stop();
			trackerRef.current = null;
			bangRef.current?.stop();
			bangRef.current = null;
			setPhase("error");
			setError(err instanceof Error ? err.message : "Could not open camera.");
		}
	}

	function disarm() {
		bangRef.current?.stop();
		bangRef.current = null;
		trackerRef.current?.stop();
		trackerRef.current = null;
		if (previewRef.current) previewRef.current.innerHTML = "";
		setGaze(null);
		setHeard("");
		setListening(false);
		setPhase("idle");
	}

	function recalibrate() {
		trackerRef.current?.calibrateCenter();
		setGame((g) => ({
			...g,
			message: "Recalibrated — look at the mark and say bang",
		}));
	}

	const aim = gaze ?? { x: aimRef.current.x, y: aimRef.current.y, confidence: 0 };
	const accuracy =
		game.shots > 0 ? Math.round((game.hits / game.shots) * 100) : 0;

	return (
		<div style={wrap}>
			<div style={atmosphere} aria-hidden="true">
				<div style={halogen} />
				<div style={gridFloor} />
				<div style={vignette} />
			</div>

			<div style={shell}>
				<header style={header}>
					<div>
						<p style={eyebrow}>Firing range · eye + voice</p>
						<h2 style={brand}>Deadeye</h2>
						<p style={tagline}>
							Look at the mark. Say <em style={emph}>bang</em>. Camera tracks your gaze; the mic is the trigger.
						</p>
					</div>
					<div style={scoreboard}>
						<div style={stat}>
							<span style={statLabel}>Score</span>
							<span style={statValue}>{game.score}</span>
						</div>
						<div style={stat}>
							<span style={statLabel}>Streak</span>
							<span style={statValue}>{game.streak}</span>
						</div>
						<div style={stat}>
							<span style={statLabel}>Acc</span>
							<span style={statValue}>{accuracy}%</span>
						</div>
					</div>
				</header>

				<div
					ref={stageRef}
					style={stage}
					tabIndex={0}
					role="application"
					aria-label="Deadeye firing range. Click or press Space to shoot."
					onPointerDown={(e) => {
						stageRef.current?.focus({ preventScroll: true });
						// Click the playfield to shoot (reliable when Space can’t reach the page).
						if ((e.target as HTMLElement).closest("button")) return;
						shoot("click");
					}}
				>
					<div style={rangeWall} />

					{/* Target */}
					<div
						ref={targetElRef}
						style={{
							...target,
							left: `${game.target.x * 100}%`,
							top: `${game.target.y * 100}%`,
							width: `${game.target.r * 2 * 100}%`,
							aspectRatio: "1",
							animation: phase === "live" ? "deadeye-bob 2.4s ease-in-out infinite" : undefined,
						}}
						aria-hidden="true"
					>
						<span style={targetRing} />
						<span style={targetBull} />
					</div>

					{/* Gaze reticle */}
					{phase === "live" && (
						<div
							ref={reticleRef}
							style={{
								...reticle,
								left: `${aim.x * 100}%`,
								top: `${aim.y * 100}%`,
								opacity: 0.35 + aim.confidence * 0.65,
							}}
							aria-hidden="true"
						>
							<span style={reticleCrossH} />
							<span style={reticleCrossV} />
							<span style={reticleDot} />
						</div>
					)}

					{/* Shot FX */}
					{game.fx.map((f) => (
						<div
							key={f.id}
							style={{
								...shotBurst,
								left: `${f.x * 100}%`,
								top: `${f.y * 100}%`,
								borderColor: f.hit ? "#9dff6a" : "#ff7a45",
								boxShadow: f.hit
									? "0 0 28px rgba(157,255,106,0.55)"
									: "0 0 22px rgba(255,122,69,0.45)",
							}}
							aria-hidden="true"
						/>
					))}

					{flash > 0 && (
						<div
							key={flash}
							style={muzzleFlash}
							aria-hidden="true"
						/>
					)}

					<div style={stageHud}>
						<p style={hudMsg}>{game.message}</p>
						{phase === "live" && (
							<p style={hudHint}>
								{gaze && gaze.confidence > 0.2
									? listening
										? "Mic live · shout, click range, or Space"
										: "Shout / click range to shoot…"
									: "Face the camera — hold still ~1s to auto-zero"}
							</p>
						)}
						{phase === "live" && heard ? (
							<p style={hudHeard}>heard: {heard}</p>
						) : null}
					</div>

					<div style={camChip}>
						<div ref={previewRef} style={camPreview} />
						<span style={camLabel}>
							{phase === "live" ? "live gaze" : "camera"}
						</span>
					</div>
				</div>

				<div style={controls}>
					{phase === "idle" || phase === "error" ? (
						<button type="button" style={armBtn} onClick={() => void arm()}>
							Arm range
						</button>
					) : phase === "booting" ? (
						<button type="button" style={{ ...armBtn, opacity: 0.7 }} disabled>
							Loading face model…
						</button>
					) : (
						<>
							<button type="button" style={ghostBtn} onClick={disarm}>
								Stand down
							</button>
							<button
								type="button"
								style={ghostBtn}
								onClick={recalibrate}
								title="Look at the screen center, then click"
							>
								Recenter gaze
							</button>
							<button
								type="button"
								style={ghostBtn}
								onClick={() => shoot("click")}
								title="Also: click the range, Space, or B — browser tab must be focused"
							>
								Fire
							</button>
						</>
					)}
					{!voiceOk ? (
						<p style={warn}>Voice recognition unavailable — use Space / Fire after arming.</p>
					) : (
						<p style={hint}>
							Look at center ~1s to zero, then aim with your head. Shoot by shout, clicking the range, or
							Fire. For Space to work, click the page first so the browser—not the editor—has focus.
						</p>
					)}
					{error ? <p style={warn}>{error}</p> : null}
				</div>
			</div>
		</div>
	);
}

const wrap: CSSProperties = {
	position: "relative",
	overflow: "hidden",
	minHeight: "72vh",
	color: "#e8efe6",
	fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
	background: "#0a100e",
	borderTop: "1px solid #1c2a22",
};

const atmosphere: CSSProperties = {
	position: "absolute",
	inset: 0,
	pointerEvents: "none",
};

const halogen: CSSProperties = {
	position: "absolute",
	inset: "-20% 10% auto",
	height: "55%",
	background:
		"radial-gradient(ellipse at 50% 0%, rgba(255,186,72,0.18), transparent 60%), radial-gradient(ellipse at 20% 30%, rgba(90,180,120,0.08), transparent 50%)",
};

const gridFloor: CSSProperties = {
	position: "absolute",
	left: "50%",
	bottom: "-5%",
	width: "140%",
	height: "38%",
	transform: "translateX(-50%) perspective(500px) rotateX(62deg)",
	background:
		"linear-gradient(180deg, transparent, rgba(10,16,14,0.85)), repeating-linear-gradient(90deg, transparent 0 48px, rgba(120,180,140,0.12) 48px 49px), repeating-linear-gradient(0deg, transparent 0 48px, rgba(120,180,140,0.1) 48px 49px)",
	opacity: 0.55,
	animation: "deadeye-floor 12s linear infinite",
};

const vignette: CSSProperties = {
	position: "absolute",
	inset: 0,
	background: "radial-gradient(ellipse at center, transparent 40%, rgba(4,8,6,0.75) 100%)",
};

const shell: CSSProperties = {
	position: "relative",
	zIndex: 1,
	padding: "1.25rem 1.35rem 1.75rem",
	maxWidth: 980,
	margin: "0 auto",
};

const header: CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	gap: "1.25rem",
	alignItems: "end",
	flexWrap: "wrap",
	marginBottom: "1rem",
};

const eyebrow: CSSProperties = {
	margin: 0,
	fontSize: 11,
	letterSpacing: "0.2em",
	textTransform: "uppercase",
	color: "#9dff6a",
};

const brand: CSSProperties = {
	margin: "0.3rem 0 0",
	fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif',
	fontWeight: 700,
	fontSize: "clamp(3rem, 9vw, 5rem)",
	lineHeight: 0.85,
	letterSpacing: "0.04em",
	textTransform: "uppercase",
	color: "#f2f7ef",
};

const tagline: CSSProperties = {
	margin: "0.7rem 0 0",
	maxWidth: 380,
	fontSize: 14,
	lineHeight: 1.45,
	color: "#9aafa0",
	fontFamily: '"Libre Baskerville", Georgia, serif',
};

const emph: CSSProperties = {
	fontStyle: "italic",
	color: "#ffba48",
};

const scoreboard: CSSProperties = {
	display: "flex",
	gap: "1rem",
};

const stat: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	alignItems: "flex-end",
	minWidth: 56,
};

const statLabel: CSSProperties = {
	fontSize: 10,
	letterSpacing: "0.16em",
	textTransform: "uppercase",
	color: "#6f8576",
};

const statValue: CSSProperties = {
	fontFamily: '"Barlow Condensed", sans-serif',
	fontSize: 28,
	fontWeight: 600,
	lineHeight: 1,
	color: "#e8efe6",
};

const stage: CSSProperties = {
	position: "relative",
	height: "min(58vh, 520px)",
	minHeight: 320,
	border: "1px solid #24362c",
	background:
		"linear-gradient(180deg, #121a16 0%, #0d1411 55%, #0a100e 100%)",
	overflow: "hidden",
	isolation: "isolate",
	outline: "none",
};

const rangeWall: CSSProperties = {
	position: "absolute",
	inset: 0,
	background:
		"repeating-linear-gradient(90deg, transparent 0 70px, rgba(255,255,255,0.015) 70px 71px), radial-gradient(ellipse at 50% 30%, rgba(40,70,50,0.35), transparent 65%)",
	pointerEvents: "none",
};

const target: CSSProperties = {
	position: "absolute",
	transform: "translate(-50%, -50%)",
	borderRadius: "50%",
	background:
		"radial-gradient(circle at 35% 30%, #ffd27a, #e85d2a 45%, #7a1f0c 78%, #3a0e06 100%)",
	boxShadow: "0 0 0 2px rgba(255,220,160,0.25), 0 12px 28px rgba(0,0,0,0.45)",
	zIndex: 2,
};

const targetRing: CSSProperties = {
	position: "absolute",
	inset: "18%",
	borderRadius: "50%",
	border: "2px solid rgba(255,240,200,0.55)",
};

const targetBull: CSSProperties = {
	position: "absolute",
	inset: "38%",
	borderRadius: "50%",
	background: "#1a0804",
	boxShadow: "inset 0 0 0 2px rgba(255,200,120,0.4)",
};

const reticle: CSSProperties = {
	position: "absolute",
	width: 44,
	height: 44,
	transform: "translate(-50%, -50%)",
	zIndex: 4,
	pointerEvents: "none",
	transition: "opacity 0.15s ease",
};

const reticleCrossH: CSSProperties = {
	position: "absolute",
	left: 0,
	right: 0,
	top: "50%",
	height: 1,
	background: "rgba(157,255,106,0.85)",
	transform: "translateY(-50%)",
};

const reticleCrossV: CSSProperties = {
	position: "absolute",
	top: 0,
	bottom: 0,
	left: "50%",
	width: 1,
	background: "rgba(157,255,106,0.85)",
	transform: "translateX(-50%)",
};

const reticleDot: CSSProperties = {
	position: "absolute",
	left: "50%",
	top: "50%",
	width: 6,
	height: 6,
	borderRadius: "50%",
	background: "#9dff6a",
	transform: "translate(-50%, -50%)",
	boxShadow: "0 0 10px rgba(157,255,106,0.8)",
};

const shotBurst: CSSProperties = {
	position: "absolute",
	width: 52,
	height: 52,
	transform: "translate(-50%, -50%)",
	borderRadius: "50%",
	border: "2px solid",
	animation: "deadeye-burst 0.55s ease-out forwards",
	zIndex: 5,
	pointerEvents: "none",
};

const muzzleFlash: CSSProperties = {
	position: "absolute",
	inset: 0,
	background: "radial-gradient(circle at 50% 70%, rgba(255,200,80,0.28), transparent 55%)",
	animation: "deadeye-flash 0.22s ease-out forwards",
	pointerEvents: "none",
	zIndex: 3,
};

const stageHud: CSSProperties = {
	position: "absolute",
	left: 14,
	bottom: 14,
	zIndex: 6,
	maxWidth: "60%",
};

const hudMsg: CSSProperties = {
	margin: 0,
	fontSize: 13,
	color: "#d5e4d8",
};

const hudHint: CSSProperties = {
	margin: "0.35rem 0 0",
	fontSize: 11,
	letterSpacing: "0.08em",
	textTransform: "uppercase",
	color: "#6f8576",
};

const hudHeard: CSSProperties = {
	margin: "0.3rem 0 0",
	fontSize: 12,
	color: "#ffba48",
	opacity: 0.9,
};

const camChip: CSSProperties = {
	position: "absolute",
	right: 12,
	bottom: 12,
	zIndex: 6,
	width: 112,
	display: "flex",
	flexDirection: "column",
	gap: 4,
};

const camPreview: CSSProperties = {
	width: "100%",
	aspectRatio: "4 / 3",
	overflow: "hidden",
	border: "1px solid #2a3d32",
	background: "#06100c",
};

const camLabel: CSSProperties = {
	fontSize: 10,
	letterSpacing: "0.14em",
	textTransform: "uppercase",
	color: "#6f8576",
	textAlign: "right",
};

const controls: CSSProperties = {
	marginTop: "1rem",
	display: "flex",
	flexWrap: "wrap",
	gap: "0.65rem",
	alignItems: "center",
};

const armBtn: CSSProperties = {
	appearance: "none",
	border: "1px solid #9dff6a",
	background: "linear-gradient(180deg, #1c2a1e, #101812)",
	color: "#c8ff9e",
	padding: "0.75rem 1.2rem",
	fontFamily: '"Barlow Condensed", sans-serif',
	fontSize: 18,
	letterSpacing: "0.12em",
	textTransform: "uppercase",
	cursor: "pointer",
	boxShadow: "0 0 0 4px rgba(157,255,106,0.08)",
};

const ghostBtn: CSSProperties = {
	appearance: "none",
	border: "1px solid #31463a",
	background: "transparent",
	color: "#b7cbbd",
	padding: "0.65rem 0.95rem",
	fontFamily: "inherit",
	fontSize: 12,
	letterSpacing: "0.06em",
	cursor: "pointer",
};

const hint: CSSProperties = {
	margin: 0,
	flex: "1 1 220px",
	fontSize: 12,
	lineHeight: 1.4,
	color: "#6f8576",
};

const warn: CSSProperties = {
	margin: 0,
	flex: "1 1 100%",
	fontSize: 12,
	color: "#ff9a6a",
};

if (typeof document !== "undefined") {
	const id = "deadeye-keyframes";
	if (!document.getElementById(id)) {
		const style = document.createElement("style");
		style.id = id;
		style.textContent = `
@keyframes deadeye-floor {
  from { background-position: 0 0, 0 0, 0 0; }
  to { background-position: 0 0, 49px 0, 0 49px; }
}
@keyframes deadeye-bob {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.12); }
}
@keyframes deadeye-burst {
  0% { transform: translate(-50%, -50%) scale(0.35); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
}
@keyframes deadeye-flash {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
`;
		document.head.appendChild(style);
	}
}
