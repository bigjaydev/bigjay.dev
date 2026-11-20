import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { VIEW_H, drawGame } from "./draw";
import { createGame, stepGame, type Game, type Input, type Mode } from "./game";

const DRIVE_KEYS = new Set([
	"KeyW",
	"KeyA",
	"KeyS",
	"KeyD",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
]);

type Panel = { mode: Mode; kills: number; time: number };

function formatClock(time: number): string {
	const total = Math.max(0, Math.floor(time));
	return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

function readInput(
	keys: Set<string>,
	pointer: { down: boolean; x: number; y: number },
	game: Game,
	cam: { x: number; y: number },
	rect: DOMRect,
): Input {
	let throttle = 0;
	let steer = 0;
	if (keys.has("KeyW") || keys.has("ArrowUp")) throttle += 1;
	if (keys.has("KeyS") || keys.has("ArrowDown")) throttle -= 1;
	if (keys.has("KeyA") || keys.has("ArrowLeft")) steer -= 1;
	if (keys.has("KeyD") || keys.has("ArrowRight")) steer += 1;
	const keyboard = throttle !== 0 || steer !== 0;
	if (!keyboard && pointer.down && rect.width > 1 && rect.height > 1) {
		const viewW = VIEW_H * (rect.width / rect.height);
		const worldX = cam.x + (pointer.x - rect.left - rect.width / 2) * (viewW / rect.width);
		const worldY = cam.y + (pointer.y - rect.top - rect.height / 2) * (VIEW_H / rect.height);
		const desired = Math.atan2(worldY - game.car.y, worldX - game.car.x);
		const diff = Math.atan2(Math.sin(desired - game.car.angle), Math.cos(desired - game.car.angle));
		steer = Math.max(-1, Math.min(1, diff / 0.55));
		throttle = Math.abs(diff) > 1.35 ? 0.3 : 1;
	}
	return { throttle, steer };
}

export default function Rally() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const liveRef = useRef<HTMLDivElement>(null);
	const gameRef = useRef<Game | null>(null);
	if (gameRef.current === null) gameRef.current = createGame();
	const camRef = useRef({ x: gameRef.current.car.x, y: gameRef.current.car.y });
	const keysRef = useRef(new Set<string>());
	const pointerRef = useRef({ down: false, x: 0, y: 0 });
	const modeWatch = useRef<Mode>("ready");
	const [panel, setPanel] = useState<Panel>({ mode: "ready", kills: 0, time: 0 });

	function begin() {
		let game = gameRef.current;
		if (!game) return;
		if (game.mode === "wrecked") {
			game = createGame();
			gameRef.current = game;
			camRef.current = { x: game.car.x, y: game.car.y };
		}
		if (game.mode === "ready") game.mode = "drive";
		modeWatch.current = game.mode;
		setPanel({ mode: game.mode, kills: game.kills, time: game.time });
		wrapRef.current?.focus();
	}

	useLayoutEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const fit = () => {
			const top = el.getBoundingClientRect().top;
			const view = window.visualViewport?.height ?? window.innerHeight;
			const height = Math.max(200, Math.floor(view - top));
			el.style.height = `${height}px`;
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

			if (game.mode === "drive") {
				const input = readInput(keysRef.current, pointerRef.current, game, camRef.current, rect);
				stepGame(game, input, dt);
			} else {
				stepGame(game, { throttle: 0, steer: 0 }, dt);
			}

			const lookX = game.car.x + game.car.vx * 0.16;
			const lookY = game.car.y + game.car.vy * 0.16;
			const follow = 1 - Math.exp(-dt * 4.2);
			camRef.current.x += (lookX - camRef.current.x) * follow;
			camRef.current.y += (lookY - camRef.current.y) * follow;

			const scale = rect.height / VIEW_H;
			const mag = game.shake * scale * 0.7;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			drawGame(ctx, game, {
				cssW: rect.width,
				cssH: rect.height,
				scale,
				x: camRef.current.x,
				y: camRef.current.y,
				shakeX: Math.sin(game.age * 78) * mag,
				shakeY: Math.cos(game.age * 61) * mag,
			});

			wrap.dataset.hull = String(Math.ceil(game.car.hp));
			wrap.dataset.kills = String(game.kills);
			wrap.dataset.mode = game.mode;
			if (game.mode !== modeWatch.current) {
				modeWatch.current = game.mode;
				setPanel({ mode: game.mode, kills: game.kills, time: game.time });
			}
			if (game.mode === "drive" && now - spoke > 1000 && liveRef.current) {
				spoke = now;
				const clock = formatClock(game.time);
				liveRef.current.textContent = `Hull ${Math.ceil(game.car.hp)}. ${game.kills} zombies. ${clock}.`;
			}
		};

		frameId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frameId);
	}, []);

	return (
		<div
			ref={wrapRef}
			tabIndex={0}
			role="application"
			aria-label="Death rally. WASD or arrows to drive. Hold click to steer toward the pointer."
			data-rally
			data-mode={panel.mode}
			onKeyDown={(event) => {
				if (DRIVE_KEYS.has(event.code) || event.code === "Space") event.preventDefault();
				const game = gameRef.current;
				if (!game) return;
				const starting = game.mode !== "drive";
				if (
					starting &&
					(DRIVE_KEYS.has(event.code) || event.code === "Space" || event.code === "Enter")
				) {
					begin();
				}
				if (DRIVE_KEYS.has(event.code)) keysRef.current.add(event.code);
			}}
			onKeyUp={(event) => {
				keysRef.current.delete(event.code);
			}}
			onBlur={() => {
				keysRef.current.clear();
				pointerRef.current.down = false;
			}}
			onPointerDown={(event) => {
				if (modeWatch.current !== "drive") return;
				event.currentTarget.setPointerCapture(event.pointerId);
				pointerRef.current = { down: true, x: event.clientX, y: event.clientY };
				wrapRef.current?.focus();
			}}
			onPointerMove={(event) => {
				if (!pointerRef.current.down) return;
				pointerRef.current.x = event.clientX;
				pointerRef.current.y = event.clientY;
			}}
			onPointerUp={(event) => {
				pointerRef.current.down = false;
				if (event.currentTarget.hasPointerCapture(event.pointerId)) {
					event.currentTarget.releasePointerCapture(event.pointerId);
				}
			}}
			className={`relative w-full touch-none outline-none select-none focus-within:ring-2 focus-within:ring-[#e4e0d6] ${panel.mode === "drive" ? "cursor-crosshair" : ""}`}
		>
			<canvas ref={canvasRef} className="block h-full w-full bg-[#100e0c]" />
			{panel.mode !== "drive" ? (
				<button
					type="button"
					onClick={begin}
					className={`absolute inset-0 flex cursor-pointer flex-col border-0 text-white ${
						panel.mode === "wrecked"
							? "items-center justify-center bg-black/55"
							: "items-center justify-end bg-gradient-to-t from-black/75 via-black/15 to-transparent pb-8"
					}`}
				>
					<span className="font-space-grotesk text-4xl">
						{panel.mode === "wrecked" ? "Hull breach" : "Take the wheel"}
					</span>
					<span className="mt-3 text-sm text-white/80">
						{panel.mode === "wrecked"
							? `${formatClock(panel.time)} · ${panel.kills} ${panel.kills === 1 ? "zombie" : "zombies"}`
							: "WASD or arrows. Hold a click to steer toward it."}
					</span>
					<span className="mt-5 rounded-full border border-white/40 px-4 py-1.5 text-sm">
						{panel.mode === "wrecked" ? "Drive again" : "Drive"}
					</span>
				</button>
			) : null}
			<div ref={liveRef} className="sr-only" aria-live="polite" />
		</div>
	);
}
