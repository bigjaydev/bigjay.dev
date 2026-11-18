import { useEffect, useMemo, useState } from "react";
import type { Side } from "./duel";

export type Pose = "idle" | "talk" | "lunge" | "flinch";

const PALETTE: Record<string, string> = {
	k: "#1c1d21",
	s: "#f3c7a6",
	d: "#e0a888",
	h: "#3a2a22",
	a: "#f25c1d",
	A: "#c4552a",
	w: "#fffdf8",
	v: "#1f6f5b",
	V: "#164e40",
	b: "#e7a090",
	m: "#7a3040",
	g: "#d4a24a",
	f: "#e7eef3",
	F: "#9aabba",
	q: "#2a2420",
	c: "#243044",
	C: "#3d5168",
	t: "#241c18",
	T: "#d4a24a",
	y: "#fecef5",
	Y: "#e7a8d4",
	z: "#f25c1d",
	o: "#c9b89a",
};

const YOU_W = 34;
const BRINE_W = 42;
const H = 24;

const youBand = ["....aaaaaaaa....", "...aaAAAAAAaa...", "..hhaaaaaaaaahh.", ".hkssssssssssskh"];
const youEyes = [".kskksssskksssk.", ".ksswksssswkssk.", ".kssssssssssssk.", ".ksssbdddbssssk."];
const youEyesShut = [
	".kskksssskksssk.",
	".ksskkkkkkkkssk.",
	".kssssssssssssk.",
	".ksssbdddbssssk.",
];
const youMouth = [".ksssssmmsssssk.", ".kssssssssssssk.", "..kssssssssssk..", "...kwwwwwwwwk..."];
const youMouthOpen = [
	".kssssmmmmssssk.",
	".ksssmmmmmmsssk.",
	"..kssssssssssk..",
	"...kwwwwwwwwk...",
];
const youBody = [
	"..kVvvvvvvvvVk..",
	".kvwwwwwwwwwwwk.",
	".kvwwwwgwwwwwwk.",
	".kvwwwwwwwwsssk.",
	"..kVvvvvvvvvVk..",
	"...kqqqqqqqqk...",
	"...kqkkkkkkqk...",
	"....kkkkkkkk....",
];
const youSword = [".............k", "kkkkkkkkkkkkkF", "ssggFFFFFFFFFF"];
const youSwordLong = [".................k", "kkkkkkkkkkkkkkkkkF", "ssggFFFFFFFFFFFFFF"];
const youSwordShort = [".......k", "kkkkkkkF", "ssggFFFF"];

const brineHat = ["...ttttttttt....", "..ttttttttttt...", ".tttttTTTTtttt..", "ttttttttttttttt."];
const brineEyes = ["kssksssssskksssk", "ksskwwssssskkssk", "kssssssssssssssk", "kssssddddssssssk"];
const brineEyesShut = [
	"kssksssssskksssk",
	"ksskkkkkkkkkkssk",
	"kssssssssssssssk",
	"kssssddddssssssk",
];
const brineMouth = ["kssshhhhhhhhsssk", "kssssssmmssssssk", "kssssssssssssssk", ".kssssssssssssk."];
const brineMouthOpen = [
	"kssshhhhhhhhsssk",
	"kssssmmmmmmssssk",
	"ksssmmmmmmmmsssk",
	".kssssssssssssk.",
];
const brineBody = [
	"..kCccccccccCk..",
	".kCwwwwwwwwwwwCk",
	".kcwwwwgwwwwwwck",
	".kssscccccccccck",
	"..kCccccccccCk..",
	"...kqqqqqqqqk...",
	"...kqkkkkkkqk...",
	"....kkkkkkkk....",
];
const brineSword = ["k.............", "Fkkkkkkkkkkkkk", "FFFFFFFFFFggss"];
const brineSwordLong = ["k.................", "Fkkkkkkkkkkkkkkkkk", "FFFFFFFFFFFFFFggss"];
const brineSwordShort = ["k.......", "Fkkkkkkk", "FFFFggss"];
const parrotDown = ["..yyy..", ".yYYYy.", "zykkYy.", ".yYYYy.", "..yyyy."];
const parrotUp = ["yy...yy", ".yYYYy.", "zykkYy.", ".yYYYy.", "..yyy.."];
const feather = ["y.", "Yy", ".y"];

function empty(width: number): string[][] {
	return Array.from({ length: H }, () => Array.from({ length: width }, () => "."));
}

function plot(grid: string[][], art: string[], x0: number, y0: number) {
	const height = grid.length;
	const width = grid[0]?.length ?? 0;
	art.forEach((row, y) => {
		[...row].forEach((ch, x) => {
			if (ch === ".") return;
			const yy = y0 + y;
			const xx = x0 + x;
			const line = grid[yy];
			if (!line || yy < 0 || xx < 0 || yy >= height || xx >= width) return;
			line[xx] = ch;
		});
	});
}

function flatten(grid: string[][]): string[] {
	return grid.map((row) => row.join(""));
}

function youFrame(pose: Pose, mouthOpen: boolean, blink: boolean): string[] {
	const grid = empty(YOU_W);
	const shut = pose === "flinch" || blink;
	plot(grid, youBand, 1, 2);
	plot(grid, shut ? youEyesShut : youEyes, 1, 6);
	plot(grid, mouthOpen ? youMouthOpen : youMouth, 1, 10);
	plot(grid, youBody, 1, 14);
	if (pose === "lunge") plot(grid, youSwordLong, 16, 15);
	else if (pose === "flinch") plot(grid, youSwordShort, 18, 15);
	else plot(grid, youSword, 14, 15);
	plot(grid, ["oooooooooo"], 4, 23);
	if (pose === "flinch") plot(grid, ["w", "k"], 0, 5);
	return flatten(grid);
}

function brineFrame(pose: Pose, mouthOpen: boolean, blink: boolean, wingUp: boolean): string[] {
	const grid = empty(BRINE_W);
	const shut = pose === "flinch" || blink;
	const hx = 12;
	plot(grid, brineHat, hx, 2);
	plot(grid, shut ? brineEyesShut : brineEyes, hx, 6);
	plot(grid, mouthOpen ? brineMouthOpen : brineMouth, hx, 10);
	plot(grid, brineBody, hx, 14);
	plot(grid, feather, hx + 14, 1);
	plot(grid, wingUp ? parrotUp : parrotDown, hx + 14, 11);
	if (pose === "lunge") plot(grid, brineSwordLong, 0, 15);
	else if (pose === "flinch") plot(grid, brineSwordShort, 8, 15);
	else plot(grid, brineSword, 4, 15);
	plot(grid, ["oooooooooo"], hx + 3, 23);
	if (pose === "flinch") plot(grid, ["w", "k"], 32, 4);
	return flatten(grid);
}

function useTick(active: boolean, ms: number): boolean {
	const [on, setOn] = useState(true);
	useEffect(() => {
		if (!active) return;
		setOn(true);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const id = window.setInterval(() => setOn((value) => !value), ms);
		return () => window.clearInterval(id);
	}, [active, ms]);
	return active && on;
}

function useBlink(active: boolean): boolean {
	const [blink, setBlink] = useState(false);
	useEffect(() => {
		if (!active) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let timer = 0;
		let cancel = false;
		const loop = () => {
			timer = window.setTimeout(
				() => {
					if (cancel) return;
					setBlink(true);
					timer = window.setTimeout(() => {
						if (cancel) return;
						setBlink(false);
						loop();
					}, 130);
				},
				2400 + Math.random() * 2200,
			);
		};
		loop();
		return () => {
			cancel = true;
			window.clearTimeout(timer);
			setBlink(false);
		};
	}, [active]);
	return active && blink;
}

function Pixel({ rows }: { rows: string[] }) {
	const height = rows.length;
	const width = rows[0]?.length ?? 0;
	const rects: { x: number; y: number; w: number; fill: string }[] = [];
	rows.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			const ch = row[x] ?? ".";
			const fill = PALETTE[ch];
			if (!fill) {
				x += 1;
				continue;
			}
			let end = x + 1;
			while (end < row.length && row[end] === ch) end += 1;
			rects.push({ x, y, w: end - x, fill });
			x = end;
		}
	});
	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			shapeRendering="crispEdges"
			className="block h-auto w-full"
			aria-hidden
		>
			{rects.map((rect) => (
				<rect
					key={`${rect.x}-${rect.y}`}
					x={rect.x}
					y={rect.y}
					width={rect.w}
					height={1}
					fill={rect.fill}
				/>
			))}
		</svg>
	);
}

function motionFor(side: Side, pose: Pose): string {
	if (pose === "lunge") {
		return side === "you"
			? "origin-[48%_66%] motion-safe:animate-[duel-lunge-you_0.78s_cubic-bezier(0.2,0.7,0.2,1)_both]"
			: "origin-[40%_66%] motion-safe:animate-[duel-lunge-brine_0.78s_cubic-bezier(0.2,0.7,0.2,1)_both]";
	}
	if (pose === "flinch") {
		return side === "you"
			? "origin-bottom motion-safe:animate-[duel-flinch-you_0.78s_ease-out_both]"
			: "origin-bottom motion-safe:animate-[duel-flinch-brine_0.78s_ease-out_both]";
	}
	if (pose === "talk")
		return "origin-bottom motion-safe:animate-[duel-bob_0.42s_ease-in-out_infinite]";
	return side === "you"
		? "origin-bottom motion-safe:animate-[duel-bob_2.8s_ease-in-out_infinite]"
		: "origin-bottom motion-safe:animate-[duel-bob_2.8s_ease-in-out_0.4s_infinite]";
}

function Sailor({ side, pose, swing }: { side: Side; pose: Pose; swing: number }) {
	const talking = pose === "talk";
	const tick = useTick(talking, 170);
	const blink = useBlink(pose === "idle");
	const wingUp = side === "brine" && (tick || pose === "flinch");
	const rows = useMemo(
		() => (side === "you" ? youFrame(pose, tick, blink) : brineFrame(pose, tick, blink, wingUp)),
		[side, pose, tick, blink, wingUp],
	);
	const hold = pose === "lunge" || pose === "flinch";
	return (
		<div
			key={hold ? `${pose}-${swing}` : pose}
			className={motionFor(side, pose)}
			style={{ width: side === "you" ? "44.7%" : "55.3%" }}
		>
			<Pixel rows={rows} />
		</div>
	);
}

function Slash({ side, swing }: { side: Side; swing: number }) {
	return (
		<div className={side === "brine" ? "-scale-x-100" : undefined}>
			<svg
				key={swing}
				viewBox="0 0 22 12"
				shapeRendering="crispEdges"
				className="h-9 w-16 motion-safe:animate-[duel-slash_0.78s_ease-out_both]"
				aria-hidden
			>
				<rect x="1" y="1" width="5" height="2" fill="#fffdf8" />
				<rect x="5" y="3" width="7" height="2" fill="#e7eef3" />
				<rect x="11" y="5" width="6" height="2" fill="#9aabba" />
				<rect x="16" y="7" width="4" height="2" fill="#f25c1d" />
				<rect x="1" y="3" width="5" height="1" fill="#1c1d21" />
				<rect x="7" y="5" width="6" height="1" fill="#1c1d21" />
			</svg>
		</div>
	);
}

function Burst() {
	return (
		<svg
			viewBox="0 0 16 16"
			shapeRendering="crispEdges"
			className="size-8 motion-safe:animate-[duel-burst_0.78s_ease-out_both] sm:size-10"
			aria-hidden
		>
			<rect x="7" y="1" width="2" height="14" fill="#f25c1d" />
			<rect x="1" y="7" width="14" height="2" fill="#f25c1d" />
			<rect x="4" y="4" width="2" height="2" fill="#fffdf8" />
			<rect x="10" y="4" width="2" height="2" fill="#fffdf8" />
			<rect x="4" y="10" width="2" height="2" fill="#1c1d21" />
			<rect x="10" y="10" width="2" height="2" fill="#1c1d21" />
			<rect x="6" y="6" width="4" height="4" fill="#fecef5" />
		</svg>
	);
}

export function DuelStage({
	you,
	brine,
	clash,
	swing,
}: {
	you: Pose;
	brine: Pose;
	clash: boolean;
	swing: number;
}) {
	return (
		<div className="relative mt-6 overflow-hidden rounded-[22px] bg-[#e4eef1]" aria-hidden>
			<style>{`
				@keyframes duel-bob {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(-3px); }
				}
				@keyframes duel-lunge-you {
					0% { transform: translateX(0) rotate(0deg); }
					22% { transform: translateX(-12px) rotate(-18deg); }
					50% { transform: translateX(22px) rotate(14deg); }
					68% { transform: translateX(12px) rotate(3deg); }
					100% { transform: translateX(6px) rotate(0deg); }
				}
				@keyframes duel-lunge-brine {
					0% { transform: translateX(0) rotate(0deg); }
					22% { transform: translateX(12px) rotate(18deg); }
					50% { transform: translateX(-22px) rotate(-14deg); }
					68% { transform: translateX(-12px) rotate(-3deg); }
					100% { transform: translateX(-6px) rotate(0deg); }
				}
				@keyframes duel-flinch-you {
					0%, 42% { transform: translateX(0) rotate(0deg); }
					58% { transform: translateX(-16px) rotate(-9deg); }
					100% { transform: translateX(-6px) rotate(-2deg); }
				}
				@keyframes duel-flinch-brine {
					0%, 42% { transform: translateX(0) rotate(0deg); }
					58% { transform: translateX(16px) rotate(9deg); }
					100% { transform: translateX(6px) rotate(2deg); }
				}
				@keyframes duel-slash {
					0% { transform: translate(-20px, -18px) rotate(-55deg); opacity: 0; }
					24% { transform: translate(-14px, -14px) rotate(-36deg); opacity: 0; }
					36% { transform: translate(-6px, -6px) rotate(-12deg); opacity: 1; }
					54% { transform: translate(12px, 6px) rotate(18deg); opacity: 1; }
					100% { transform: translate(18px, 10px) rotate(26deg); opacity: 0; }
				}
				@keyframes duel-burst {
					0%, 40% { transform: scale(0.25); opacity: 0; }
					52% { transform: scale(0.85); opacity: 1; }
					100% { transform: scale(1.5); opacity: 0; }
				}
			`}</style>
			<svg
				className="absolute inset-x-0 top-[62%] h-4 w-full"
				viewBox="0 0 80 4"
				preserveAspectRatio="none"
				shapeRendering="crispEdges"
			>
				<rect width="80" height="4" fill="#d5ebe4" />
				<rect y="1" width="12" height="1" fill="#b7d4cb" />
				<rect x="20" y="2" width="16" height="1" fill="#b7d4cb" />
				<rect x="44" y="1" width="8" height="1" fill="#c5ddd4" />
				<rect x="58" y="2" width="14" height="1" fill="#b7d4cb" />
			</svg>
			<div className="absolute inset-x-0 bottom-0 h-3 bg-[#c4a574]" />
			<div className="absolute inset-x-0 bottom-0 h-1 bg-[#8d6844]" />
			<div className="relative z-10 mx-auto flex w-full max-w-lg items-end justify-center px-3 pt-3 pb-2">
				<Sailor side="you" pose={you} swing={swing} />
				<Sailor side="brine" pose={brine} swing={swing} />
			</div>
			{clash && (
				<div className="pointer-events-none absolute bottom-[28%] left-1/2 z-20 flex -translate-x-1/2 items-center justify-center">
					<Slash side={you === "lunge" ? "you" : "brine"} swing={swing} />
					<div className="absolute">
						<Burst key={swing} />
					</div>
				</div>
			)}
		</div>
	);
}
