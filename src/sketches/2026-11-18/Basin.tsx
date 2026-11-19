import { Canvas } from "@react-three/fiber";
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { mapToWorld, paintMap, START } from "./world";
import { useBattle, BUILD_COST, type BuildKind, type Mode, type Seat } from "./store";
import { getScore, type Score } from "./sound";
import { BattleScene, type ControlState } from "./scene";

const DRIVE_KEYS = new Set([
	"KeyW",
	"KeyA",
	"KeyS",
	"KeyD",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Space",
]);

function controlTarget(target: EventTarget | null): boolean {
	return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export default function Basin() {
	const wrapRef = useRef<HTMLDivElement>(null);
	const hudRef = useRef<HTMLCanvasElement>(null);
	const mapTerrainRef = useRef<HTMLCanvasElement>(null);
	const mapIconRef = useRef<HTMLCanvasElement>(null);
	const liveRef = useRef<HTMLDivElement>(null);
	const audioRef = useRef<Score | null>(null);
	if (audioRef.current === null) audioRef.current = getScore();
	const controls = useRef<ControlState>({
		keys: new Set(),
		fire: false,
		shot: false,
		missile: false,
		aimX: 0,
		aimY: 0,
		zoom: 0,
		locked: false,
		pick: null,
	});
	const [mode, setMode] = useState<Mode>("ready");
	const [won, setWon] = useState(false);
	const [mapOpen, setMapOpen] = useState(false);
	const [kills, setKills] = useState(0);
	const [seat, setSeat] = useState<Seat>("tank");
	const [arm, setArm] = useState<BuildKind | null>(null);
	const [selected, setSelected] = useState(3);
	const filled = mode !== "ready";

	useLayoutEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const fit = () => {
			if (el.dataset.filled === "yes") {
				el.style.height = "100dvh";
				return;
			}
			el.style.height = "";
			const top = el.getBoundingClientRect().top;
			const view = window.visualViewport?.height ?? window.innerHeight;
			el.style.height = `${Math.max(240, Math.floor(view - top))}px`;
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
	}, [filled]);

	useEffect(() => {
		return useBattle.subscribe((state) => {
			setMode(state.mode);
			setWon(state.won);
			setMapOpen(state.mapOpen);
			setKills(state.kills);
			setSeat(state.seat);
			setArm(state.arm);
			setSelected(state.selected);
		});
	}, []);

	useEffect(() => {
		if (!mapOpen) return;
		const canvas = mapTerrainRef.current;
		if (!canvas || canvas.dataset.ready === "yes") return;
		paintMap(canvas);
		canvas.dataset.ready = "yes";
	}, [mapOpen]);

	useEffect(() => {
		if ((mapOpen || mode !== "live" || seat === "rts") && document.pointerLockElement)
			document.exitPointerLock();
	}, [mapOpen, mode, seat]);

	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;

		const onLock = () => {
			controls.current.locked = document.pointerLockElement === wrap;
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (controlTarget(event.target)) return;
			if (DRIVE_KEYS.has(event.code)) event.preventDefault();
			const battle = useBattle.getState();
			if (event.code === "KeyM" && !event.repeat && battle.mode === "live") {
				event.preventDefault();
				battle.toggleMap();
				return;
			}
			if (event.code === "Escape") {
				event.preventDefault();
				if (battle.mapOpen) {
					battle.closeMap();
					return;
				}
				if (battle.seat === "rts" && battle.mode === "live") {
					battle.command();
					return;
				}
				if (battle.mode === "live") {
					battle.pause();
					return;
				}
				if (battle.mode === "paused") {
					battle.resume();
					const node = wrapRef.current;
					if (node && useBattle.getState().seat !== "rts") void node.requestPointerLock();
				}
				return;
			}
			if (event.code === "KeyE" && !event.repeat && battle.mode === "live") {
				battle.interact();
				return;
			}
			if (event.code === "KeyB" && !event.repeat && battle.mode === "live") {
				battle.command();
				if (useBattle.getState().seat === "rts" && document.pointerLockElement)
					document.exitPointerLock();
				return;
			}
			if (event.code === "KeyC" && !event.repeat && battle.mode === "live") battle.toggleView();
			if (
				(event.code === "Enter" || event.code === "Space") &&
				(battle.mode === "ready" || battle.mode === "dead") &&
				!event.repeat
			) {
				engage();
				return;
			}
			if (event.code === "KeyF" && !event.repeat) controls.current.missile = true;
			controls.current.keys.add(event.code);
		};
		const onKeyUp = (event: KeyboardEvent) => {
			controls.current.keys.delete(event.code);
		};
		const onMouseMove = (event: MouseEvent) => {
			if (document.pointerLockElement !== wrap) return;
			controls.current.aimX += event.movementX;
			controls.current.aimY += event.movementY;
			if ((event.buttons & 1) === 1) controls.current.fire = true;
		};
		const onBlur = () => {
			controls.current.keys.clear();
			controls.current.fire = false;
		};

		document.addEventListener("pointerlockchange", onLock);
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("blur", onBlur);
		return () => {
			document.removeEventListener("pointerlockchange", onLock);
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("blur", onBlur);
			if (document.pointerLockElement === wrap) document.exitPointerLock();
		};
	}, []);

	function engage() {
		audioRef.current?.unlock();
		useBattle.getState().launch();
		wrapRef.current?.focus();
		const node = wrapRef.current;
		if (node && document.pointerLockElement !== node) void node.requestPointerLock();
	}

	function placeNav(event: ReactPointerEvent<HTMLCanvasElement>) {
		const rect = event.currentTarget.getBoundingClientRect();
		const point = mapToWorld(
			event.clientX - rect.left,
			event.clientY - rect.top,
			rect.width,
			rect.height,
		);
		useBattle.getState().setNav(point.x, point.z);
	}

	return (
		<div
			ref={wrapRef}
			tabIndex={0}
			role="application"
			aria-label="Icarus basin. WASD to drive a hover tank, mouse to aim, click to fire."
			data-basin
			data-mode={mode}
			data-filled={filled ? "yes" : "no"}
			data-seat={seat}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				const battle = useBattle.getState();
				if (battle.mode !== "live" || battle.mapOpen) return;
				const target = event.target;
				if (target instanceof Element && target.closest("button, a, input, textarea")) return;
				if (battle.seat === "rts") {
					const rect = event.currentTarget.getBoundingClientRect();
					controls.current.pick = {
						nx: ((event.clientX - rect.left) / rect.width) * 2 - 1,
						ny: -((event.clientY - rect.top) / rect.height) * 2 + 1,
					};
					return;
				}
				controls.current.fire = true;
				controls.current.shot = true;
				if (document.pointerLockElement !== wrapRef.current)
					void wrapRef.current?.requestPointerLock();
			}}
			onPointerUp={(event) => {
				if (event.button === 0) controls.current.fire = false;
			}}
			onWheel={(event) => {
				if (useBattle.getState().seat !== "rts") return;
				controls.current.zoom += Math.sign(event.deltaY);
			}}
			onContextMenu={(event) => {
				event.preventDefault();
				const battle = useBattle.getState();
				if (battle.mode === "live" && battle.seat === "tank") controls.current.missile = true;
			}}
			className={`touch-none outline-none select-none focus-within:ring-2 focus-within:ring-[#d6ff6a] ${
				filled ? "fixed inset-0 z-[90] h-[100dvh] w-screen" : "relative w-full"
			} ${mode === "live" && !mapOpen && seat !== "rts" ? "cursor-crosshair" : ""}`}
		>
			<Canvas
				className="h-full w-full"
				camera={{ fov: 62, near: 0.35, far: 720, position: [START.x, 18, START.z + 18] }}
				dpr={[1, 1.5]}
				shadows
				gl={{ antialias: true, powerPreference: "high-performance" }}
			>
				<BattleScene
					controls={controls}
					hud={hudRef}
					mapIcons={mapIconRef}
					audio={audioRef}
					status={wrapRef}
					live={liveRef}
				/>
			</Canvas>
			<canvas ref={hudRef} className="pointer-events-none absolute inset-0 h-full w-full" />
			{mode === "ready" || mode === "dead" ? (
				<button
					type="button"
					onClick={engage}
					className={`absolute inset-0 flex cursor-pointer flex-col border-0 text-white ${
						mode === "dead"
							? "items-center justify-center bg-black/60"
							: "items-end justify-end bg-gradient-to-t from-black/75 via-black/10 to-transparent p-8"
					}`}
				>
					<span className="font-space-grotesk text-4xl">
						{mode === "dead" ? "Hull lost" : "Icarus basin"}
					</span>
					<span className="mt-3 max-w-md text-sm text-white/80">
						{mode === "dead"
							? `${kills} ${kills === 1 ? "kill" : "kills"}${won ? " · citadel down" : ""}`
							: "A hover tank and a twelve kilometre basin. The citadel is on the compass."}
					</span>
					<span className="mt-2 max-w-md text-sm text-white/70">
						WASD drive · click cannon · F missile · E enters the command post · Esc pause
					</span>
					<span className="mt-5 rounded-full border border-white/40 px-4 py-1.5 text-sm">
						{mode === "dead" ? "Launch again" : "Launch"}
					</span>
				</button>
			) : null}
			{mode === "paused" ? (
				<button
					type="button"
					onClick={() => {
						useBattle.getState().resume();
						if (useBattle.getState().seat !== "rts") void wrapRef.current?.requestPointerLock();
					}}
					className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center border-0 bg-black/55 text-white"
				>
					<span className="font-space-grotesk text-4xl">Paused</span>
					<span className="mt-3 text-sm text-white/75">Esc or click to resume</span>
				</button>
			) : null}
			{seat === "rts" && mode === "live" && !mapOpen ? (
				<div
					className="absolute top-4 left-4 z-20 w-64 border border-[#d6ff6a]/60 bg-black/75 p-3 text-[#d6ff6a]"
					onPointerDown={(event) => event.stopPropagation()}
				>
					<p className="text-xs tracking-[0.2em]">COMMAND</p>
					<p className="mt-2 text-xs text-white/70">
						Arm a building, click a mason, then click the ground. WASD pans. Q and R turn. Esc steps
						out.
					</p>
					<div className="mt-3 flex flex-col gap-2">
						<button
							type="button"
							onClick={() => useBattle.getState().armBuild("tower")}
							className={`border px-2 py-1 text-left text-sm ${arm === "tower" ? "border-[#d6ff6a] bg-[#d6ff6a]/15" : "border-[#d6ff6a]/40"}`}
						>
							Defence tower · {BUILD_COST.tower}
						</button>
						<button
							type="button"
							onClick={() => useBattle.getState().armBuild("supply")}
							className={`border px-2 py-1 text-left text-sm ${arm === "supply" ? "border-[#d6ff6a] bg-[#d6ff6a]/15" : "border-[#d6ff6a]/40"}`}
						>
							Supply pad · {BUILD_COST.supply}
						</button>
						{useBattle.getState().rigs.map((rig, index) =>
							rig.role === "builder" ? (
								<button
									key={rig.id}
									type="button"
									onClick={() => useBattle.getState().selectBuilder(index)}
									className={`border px-2 py-1 text-left text-sm ${selected === index ? "border-[#ffb15a] text-[#ffb15a]" : "border-white/30 text-white/80"}`}
								>
									Mason {rig.id === 3 ? "A" : "B"}
									{rig.alive ? "" : " · lost"}
								</button>
							) : null,
						)}
					</div>
				</div>
			) : null}
			{mapOpen ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
					<div className="flex max-h-full w-full flex-col items-center justify-center gap-3 px-4">
						<div className="relative aspect-square w-[min(88vw,calc(100vh-320px),560px)] border border-[#d6ff6a]/60 bg-[#3a2418]">
							<canvas ref={mapTerrainRef} className="h-full w-full" />
							<canvas
								ref={mapIconRef}
								className="absolute inset-0 h-full w-full cursor-crosshair"
								onPointerDown={placeNav}
							/>
						</div>
						<p className="text-center text-sm text-[#d6ff6a]">
							Click the chart to drop a nav beacon. M or Esc returns to the tank.
						</p>
					</div>
				</div>
			) : null}
			<div ref={liveRef} className="sr-only" aria-live="polite" />
		</div>
	);
}
