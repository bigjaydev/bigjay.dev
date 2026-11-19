import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { WORLD_H, WORLD_W } from "./city";
import { VIEW_H, drawGame, drawMinimap } from "./draw";
import {
	closePhone,
	createGame,
	dropMission,
	jobsDone,
	startMission,
	stepGame,
	type Game,
	type Mode,
} from "./game";
import { MISSIONS, missionById, type MissionId } from "./missions";
import { Score } from "./sound";

const MOVE_KEYS = new Set([
	"KeyW",
	"KeyA",
	"KeyS",
	"KeyD",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
]);

const EMPTY = { x: 0, y: 0, sprint: false, interact: false };

type Hud = {
	mode: Mode;
	mission: MissionId | null;
	objective: string;
	prompt: string;
	wanted: number;
	jobs: number;
	cash: number;
	banner: string;
	near: string;
};

function readHud(game: Game): Hud {
	return {
		mode: game.mode,
		mission: game.active,
		objective: game.objective,
		prompt: game.prompt,
		wanted: game.wanted,
		jobs: jobsDone(game),
		cash: game.cash,
		banner: game.bannerT > 0 ? game.banner : "",
		near: game.near,
	};
}

function sameHud(a: Hud, b: Hud): boolean {
	return (
		a.mode === b.mode &&
		a.mission === b.mission &&
		a.objective === b.objective &&
		a.prompt === b.prompt &&
		a.wanted === b.wanted &&
		a.jobs === b.jobs &&
		a.cash === b.cash &&
		a.banner === b.banner &&
		a.near === b.near
	);
}

function controlTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLButtonElement ||
		target instanceof HTMLLabelElement
	);
}

export default function Payphone() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const mapRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const liveRef = useRef<HTMLDivElement>(null);
	const gameRef = useRef<Game | null>(null);
	if (gameRef.current === null) gameRef.current = createGame();
	const camRef = useRef({ x: gameRef.current.player.x, y: gameRef.current.player.y });
	const keysRef = useRef(new Set<string>());
	const joyRef = useRef({ x: 0, y: 0 });
	const interactRef = useRef(false);
	const armRef = useRef(0);
	const scoreRef = useRef<Score | null>(null);
	const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
	const [hud, setHud] = useState<Hud>(() => readHud(gameRef.current as Game));
	const [touch, setTouch] = useState(false);
	const [volume, setVolume] = useState(0.72);
	const [soundOn, setSoundOn] = useState(false);
	const [fileName, setFileName] = useState("");
	const [trackMode, setTrackMode] = useState<"synth" | "file">("synth");
	const [audioError, setAudioError] = useState("");

	function publish() {
		const game = gameRef.current;
		if (!game) return;
		const next = readHud(game);
		setHud((prev) => (sameHud(prev, next) ? prev : next));
	}

	function unlock() {
		const score = scoreRef.current;
		if (!score) return;
		score.unlock();
		setSoundOn(true);
		setTrackMode(score.mode);
		setAudioError(score.error);
	}

	function begin() {
		const game = gameRef.current;
		if (!game) return;
		if (game.mode === "ready") game.mode = "play";
		unlock();
		wrapRef.current?.focus();
		publish();
	}

	useLayoutEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const fit = () => {
			const top = el.getBoundingClientRect().top;
			const view = window.visualViewport?.height ?? window.innerHeight;
			el.style.height = `${Math.max(280, Math.floor(view - top))}px`;
			const coarse = window.matchMedia("(pointer: coarse)").matches;
			setTouch(coarse || window.innerWidth < 840);
		};
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		fit();
		const header = el.parentElement?.previousElementSibling;
		const observer = new ResizeObserver(fit);
		if (header instanceof Element) observer.observe(header);
		window.addEventListener("resize", fit);
		window.visualViewport?.addEventListener("resize", fit);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", fit);
			window.visualViewport?.removeEventListener("resize", fit);
			document.body.style.overflow = previousOverflow;
		};
	}, []);

	useEffect(() => {
		const score = new Score();
		scoreRef.current = score;
		return () => {
			score.close();
			scoreRef.current = null;
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!canvas || !wrap) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		let frameId = 0;
		let last = performance.now();
		let spoke = 0;

		const loop = (now: number) => {
			frameId = requestAnimationFrame(loop);
			const game = gameRef.current;
			if (!game) return;
			const dt = Math.min(0.033, (now - last) / 1000);
			last = now;
			if (document.hidden) return;

			const rect = canvas.getBoundingClientRect();
			if (rect.width < 2 || rect.height < 2) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bufferW = Math.round(rect.width * dpr);
			const bufferH = Math.round(rect.height * dpr);
			if (canvas.width !== bufferW || canvas.height !== bufferH) {
				canvas.width = bufferW;
				canvas.height = bufferH;
			}

			let x = 0;
			let y = 0;
			if (keysRef.current.has("KeyA") || keysRef.current.has("ArrowLeft")) x -= 1;
			if (keysRef.current.has("KeyD") || keysRef.current.has("ArrowRight")) x += 1;
			if (keysRef.current.has("KeyW") || keysRef.current.has("ArrowUp")) y -= 1;
			if (keysRef.current.has("KeyS") || keysRef.current.has("ArrowDown")) y += 1;
			x += joyRef.current.x;
			y += joyRef.current.y;
			const mag = Math.hypot(x, y);
			if (mag > 1) {
				x /= mag;
				y /= mag;
			}
			const input = {
				x,
				y,
				sprint: keysRef.current.has("ShiftLeft") || keysRef.current.has("ShiftRight"),
				interact: interactRef.current,
			};
			interactRef.current = false;
			if (game.mode === "ready") stepGame(game, EMPTY, dt);
			else stepGame(game, input, dt);

			const score = scoreRef.current;
			if (score) {
				if (!score.unlocked) game.sfx.length = 0;
				else {
					let cue = game.sfx.shift();
					while (cue) {
						score.play(cue);
						cue = game.sfx.shift();
					}
				}
				const bars = score.levels();
				bars.forEach((level, index) => {
					const bar = barRefs.current[index];
					if (bar) bar.style.transform = `scaleY(${0.2 + level * 0.8})`;
				});
			}

			const look = game.player.carId != null ? 0.28 : 0.12;
			const follow = 1 - Math.exp(-dt * 4.6);
			camRef.current.x += (game.player.x + game.player.vx * look - camRef.current.x) * follow;
			camRef.current.y += (game.player.y + game.player.vy * look - camRef.current.y) * follow;

			const scale = rect.height / VIEW_H;
			const viewW = rect.width / scale;
			if (viewW < WORLD_W) {
				camRef.current.x = Math.min(WORLD_W - viewW / 2, Math.max(viewW / 2, camRef.current.x));
			} else camRef.current.x = WORLD_W / 2;
			if (VIEW_H < WORLD_H) {
				camRef.current.y = Math.min(WORLD_H - VIEW_H / 2, Math.max(VIEW_H / 2, camRef.current.y));
			} else camRef.current.y = WORLD_H / 2;
			const magShake = game.shake * scale * 0.45;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			drawGame(ctx, game, {
				cssW: rect.width,
				cssH: rect.height,
				scale,
				x: camRef.current.x,
				y: camRef.current.y,
				shakeX: Math.sin(game.age * 70) * magShake,
				shakeY: Math.cos(game.age * 54) * magShake,
			});

			const map = mapRef.current;
			if (map) {
				const mapRect = map.getBoundingClientRect();
				const mapW = Math.max(1, Math.round(mapRect.width * dpr));
				const mapH = Math.max(1, Math.round(mapRect.height * dpr));
				if (map.width !== mapW || map.height !== mapH) {
					map.width = mapW;
					map.height = mapH;
				}
				const mapCtx = map.getContext("2d");
				if (mapCtx) {
					mapCtx.setTransform(1, 0, 0, 1, 0, 0);
					drawMinimap(mapCtx, game, mapW, mapH);
				}
			}

			wrap.dataset.mode = game.mode;
			wrap.dataset.mission = game.active ?? "";
			wrap.dataset.jobs = String(jobsDone(game));
			wrap.dataset.wanted = String(game.wanted);
			wrap.dataset.near = game.near;
			wrap.dataset.cash = String(game.cash);
			publish();

			if (game.mode === "play" && now - spoke > 1400 && liveRef.current) {
				spoke = now;
				const mission = game.active ? missionById(game.active) : null;
				const line = mission
					? `${mission.event}, ${mission.year}. ${game.objective}`
					: "The payphone is ringing.";
				if (liveRef.current.textContent !== line) liveRef.current.textContent = line;
			}
		};

		frameId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frameId);
	}, []);

	const mission = hud.mission ? missionById(hud.mission) : null;
	const prompt = hud.mode === "play" && hud.prompt ? (touch ? hud.prompt : `E  ${hud.prompt}`) : "";

	return (
		<div
			ref={wrapRef}
			tabIndex={0}
			role="application"
			aria-label="Neon payphone. WASD or arrows to move. E to use a car, a payphone, or a pickup. Shift to sprint."
			data-payphone
			data-mode={hud.mode}
			data-mission={hud.mission ?? ""}
			data-jobs={hud.jobs}
			data-wanted={hud.wanted}
			onContextMenu={(event) => event.preventDefault()}
			onKeyDown={(event) => {
				if (controlTarget(event.target) && event.target !== wrapRef.current) return;
				const game = gameRef.current;
				if (!game) return;
				if (MOVE_KEYS.has(event.code) || event.code === "Space") event.preventDefault();
				if (
					game.mode === "phone" &&
					(event.code === "Escape" || event.code === "KeyE" || event.code === "KeyF")
				) {
					if (!event.repeat) {
						closePhone(game);
						publish();
					}
					event.preventDefault();
					return;
				}
				if (
					game.mode === "ready" &&
					(MOVE_KEYS.has(event.code) || event.code === "Enter" || event.code === "KeyE")
				) {
					begin();
				}
				if (
					MOVE_KEYS.has(event.code) ||
					event.code === "ShiftLeft" ||
					event.code === "ShiftRight"
				) {
					keysRef.current.add(event.code);
				}
				if (
					!event.repeat &&
					(event.code === "KeyE" || event.code === "KeyF" || event.code === "Enter")
				) {
					interactRef.current = true;
					unlock();
				}
			}}
			onKeyUp={(event) => {
				keysRef.current.delete(event.code);
			}}
			onBlur={() => {
				keysRef.current.clear();
				joyRef.current = { x: 0, y: 0 };
			}}
			onPointerDown={(event) => {
				const target = event.target;
				if (target instanceof HTMLElement && target.closest("button, input, label, a")) return;
				wrapRef.current?.focus();
				unlock();
			}}
			className="relative w-full touch-none bg-[#07010f] text-white outline-none select-none focus-visible:ring-2 focus-visible:ring-[#2de2ff]"
		>
			<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(90% 55% at 78% 100%, rgba(255,45,130,0.16), transparent 46%), radial-gradient(70% 40% at 50% 0%, rgba(255,140,60,0.12), transparent 42%), repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px)",
				}}
			/>
			<div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_90px_rgba(0,0,0,0.55)]" />

			<div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1 p-2 sm:p-3">
				<div className="flex items-start gap-2">
					<canvas
						ref={mapRef}
						className="h-16 w-24 shrink-0 rounded-md border border-cyan-200/30 bg-black/40"
						aria-hidden="true"
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<p className="font-space-grotesk truncate text-sm tracking-wide text-white">
								${hud.cash} · {hud.jobs}/5
							</p>
							<div className="flex gap-0.5" aria-label={`Wanted level ${hud.wanted}`}>
								{[0, 1, 2].map((star) => (
									<Star key={star} on={star < hud.wanted} />
								))}
							</div>
						</div>
						<p className="mt-1 truncate text-sm text-white/90">
							{hud.mode === "play" && hud.objective ? hud.objective : "Find a payphone"}
						</p>
						{mission ? (
							<p className="truncate text-xs tracking-wide text-[#7af3ff]">
								{mission.event}, {mission.year}
							</p>
						) : (
							<p className="truncate text-xs text-white/55">Jobs from 19 November</p>
						)}
					</div>
				</div>
			</div>

			{prompt ? (
				<div
					className={`pointer-events-none absolute left-1/2 z-20 max-w-[90%] -translate-x-1/2 rounded-full border border-white/25 bg-black/60 px-4 py-1.5 text-center text-sm text-white ${touch ? "bottom-48" : "bottom-14"}`}
				>
					{prompt}
				</div>
			) : null}

			{hud.banner ? (
				<div className="pointer-events-none absolute top-[24%] left-1/2 z-30 w-[min(28rem,92%)] -translate-x-1/2 rounded-2xl border border-cyan-200/50 bg-black/75 px-4 py-3 text-center shadow-[0_0_30px_rgba(45,226,255,0.25)]">
					<p className="text-[11px] tracking-[0.22em] text-[#7af3ff]">JOB DONE</p>
					<p className="font-space-grotesk mt-1 text-xl">{hud.banner}</p>
				</div>
			) : null}

			{hud.mode === "busted" ? (
				<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55">
					<div className="text-center">
						<p className="font-space-grotesk text-4xl">Busted</p>
						<p className="mt-2 text-sm text-white/75">Back on the sidewalk.</p>
					</div>
				</div>
			) : null}

			{hud.mode === "phone" ? (
				<div
					className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-3 pb-28"
					onClick={() => {
						if (performance.now() < armRef.current) return;
						const game = gameRef.current;
						if (!game) return;
						closePhone(game);
						publish();
					}}
				>
					<div
						className="max-h-[78%] w-full max-w-md overflow-y-auto rounded-2xl border border-cyan-200/40 bg-[#120814] p-4 shadow-[0_0_40px_rgba(255,43,214,0.25)]"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-space-grotesk bg-gradient-to-b from-white via-[#c8fbff] to-[#ff4bd8] bg-clip-text text-2xl text-transparent">
									Payphone
								</p>
								<p className="mt-1 text-xs tracking-[0.16em] text-[#7af3ff]">19 NOVEMBER</p>
							</div>
							<button
								type="button"
								onClick={() => {
									const game = gameRef.current;
									if (!game) return;
									closePhone(game);
									publish();
								}}
								className="rounded-full px-3 py-1 text-sm text-white/80 hover:bg-white/10"
							>
								Hang up
							</button>
						</div>
						<p className="mt-3 text-sm text-white/70">
							{jobsDone(gameRef.current as Game) === MISSIONS.length
								? "That's every job for 19 November."
								: "One job at a time. Picking another drops the one you're on."}
						</p>
						<ul className="mt-3 space-y-2">
							{MISSIONS.map((item) => {
								const done = gameRef.current?.done[item.id] ?? false;
								const active = hud.mission === item.id;
								return (
									<li key={item.id}>
										<button
											type="button"
											disabled={done}
											aria-pressed={active}
											onClick={() => {
												if (performance.now() < armRef.current) return;
												const game = gameRef.current;
												if (!game || done) return;
												startMission(game, item.id);
												publish();
											}}
											className={`w-full rounded-xl border px-3 py-2 text-left disabled:opacity-45 ${
												active
													? "border-[#2de2ff] bg-cyan-200/10"
													: "border-white/15 hover:border-white/40"
											}`}
										>
											<span className="flex items-center justify-between gap-2">
												<span className="font-medium">{item.title}</span>
												<span className="text-xs text-[#ff8ad2]">${item.pay}</span>
											</span>
											<span className="mt-0.5 block text-xs text-[#7af3ff]">
												{item.event}, {item.year}
											</span>
											<span className="mt-1 block text-sm text-white/75">
												{done ? item.done : item.history} {done ? "" : item.task}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
						{hud.mission ? (
							<button
								type="button"
								onClick={() => {
									const game = gameRef.current;
									if (!game) return;
									dropMission(game);
									publish();
								}}
								className="mt-3 text-sm text-white/70 underline"
							>
								Drop this job
							</button>
						) : null}
					</div>
				</div>
			) : null}

			{hud.mode === "ready" ? (
				<button
					type="button"
					onClick={begin}
					className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-end border-0 bg-gradient-to-t from-[#07010f] via-[#07010f]/75 to-transparent pb-16 text-white"
				>
					<span className="font-space-grotesk bg-gradient-to-b from-white via-[#d9fbff] to-[#ff4bd8] bg-clip-text text-4xl text-transparent">
						The phone is ringing
					</span>
					<span className="mt-3 max-w-md px-6 text-center text-sm text-white/80">
						{touch
							? "Stick to walk. USE takes a car, answers the payphone, or picks something up."
							: "WASD or arrows to move. E to use. Shift to sprint. Steal a car if you want one."}
					</span>
					<span className="mt-5 rounded-full border border-cyan-200/50 px-4 py-1.5 text-sm">
						Step out
					</span>
				</button>
			) : null}

			{touch && hud.mode === "play" ? (
				<>
					<div
						data-joystick
						className="absolute bottom-4 left-4 z-40 h-28 w-28 rounded-full border border-cyan-200/40 bg-black/35"
						onPointerDown={(event) => {
							event.preventDefault();
							event.stopPropagation();
							event.currentTarget.setPointerCapture(event.pointerId);
							moveStick(event, joyRef);
							unlock();
						}}
						onPointerMove={(event) => {
							if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
							moveStick(event, joyRef);
						}}
						onPointerUp={(event) => {
							joyRef.current = { x: 0, y: 0 };
							if (event.currentTarget.hasPointerCapture(event.pointerId)) {
								event.currentTarget.releasePointerCapture(event.pointerId);
							}
						}}
						aria-hidden="true"
					>
						<div className="pointer-events-none absolute top-1/2 left-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff2bd6]/80" />
					</div>
					<button
						type="button"
						data-use
						className="absolute right-4 bottom-6 z-40 h-20 w-20 rounded-full border border-cyan-200/60 bg-[#2de2ff] text-sm font-semibold text-[#071018]"
						onPointerDown={(event) => {
							event.preventDefault();
							event.stopPropagation();
							armRef.current = performance.now() + 500;
							interactRef.current = true;
							unlock();
							wrapRef.current?.focus();
						}}
					>
						USE
					</button>
				</>
			) : null}

			{!touch && hud.mode === "play" ? (
				<p className="pointer-events-none absolute bottom-3 left-3 z-20 text-xs tracking-wide text-white/55">
					WASD move · E use · Shift sprint
				</p>
			) : null}

			<div
				className={`absolute z-40 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-2 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-xs ${touch ? "bottom-36 left-1/2 w-[min(100%-1.5rem,28rem)] -translate-x-1/2" : "right-3 bottom-3"}`}
			>
				<span className="flex h-4 items-end gap-0.5" aria-hidden="true">
					{[0, 1, 2, 3, 4].map((index) => (
						<span
							key={index}
							ref={(node) => {
								barRefs.current[index] = node;
							}}
							className="block h-3 w-1 origin-bottom rounded-sm bg-[#ff2bd6]"
						/>
					))}
				</span>
				<label className="flex items-center gap-1 text-white/80">
					<span className="sr-only">Volume</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={volume}
						aria-label="Volume"
						onPointerDown={unlock}
						onChange={(event) => {
							const next = Number(event.target.value);
							setVolume(next);
							scoreRef.current?.setVolume(next);
							unlock();
						}}
						className="w-16 accent-[#ff2bd6] sm:w-24"
					/>
				</label>
				{trackMode === "file" ? (
					<button
						type="button"
						onClick={() => {
							scoreRef.current?.useSynth();
							setTrackMode("synth");
							setAudioError("");
							unlock();
						}}
						className="rounded-full px-2 py-1 text-white/85 hover:bg-white/10"
					>
						Soundtrack
					</button>
				) : (
					<span className="hidden text-white/55 sm:inline">{soundOn ? "FM 171" : "Sound off"}</span>
				)}
				<label className="cursor-pointer rounded-full bg-white/10 px-2 py-1 text-white hover:bg-white/15">
					{fileName && trackMode === "file" ? trimName(fileName) : "Play your own track"}
					<input
						type="file"
						accept="audio/*"
						className="sr-only"
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (!file || !scoreRef.current) return;
							scoreRef.current.loadFile(file);
							setFileName(scoreRef.current.fileName);
							setTrackMode(scoreRef.current.mode);
							setAudioError(scoreRef.current.error);
							setSoundOn(true);
						}}
					/>
				</label>
				{audioError ? <span className="text-[#ff8ad2]">{audioError}</span> : null}
			</div>
			<div ref={liveRef} className="sr-only" aria-live="polite" />
		</div>
	);
}

function trimName(name: string): string {
	if (name.length <= 22) return name;
	return `${name.slice(0, 20)}…`;
}

function moveStick(
	event: ReactPointerEvent<HTMLDivElement>,
	joyRef: { current: { x: number; y: number } },
) {
	const rect = event.currentTarget.getBoundingClientRect();
	let x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
	let y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
	const mag = Math.hypot(x, y);
	if (mag > 1) {
		x /= mag;
		y /= mag;
	}
	if (mag < 0.16) {
		x = 0;
		y = 0;
	}
	joyRef.current = { x, y };
}

function Star({ on }: { on: boolean }) {
	return (
		<svg
			viewBox="0 0 20 20"
			className={`h-4 w-4 ${on ? "fill-[#ff2bd6] drop-shadow-[0_0_6px_#ff2bd6]" : "fill-transparent stroke-[#ff2bd6]/45"}`}
			strokeWidth={1.4}
			aria-hidden="true"
		>
			<path d="M10 1.6 12.3 7h5.7l-4.6 3.4 1.8 5.5L10 12.6 4.8 15.9l1.8-5.5L2 7h5.7z" />
		</svg>
	);
}
