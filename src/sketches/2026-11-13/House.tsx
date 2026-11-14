import { useEffect, useRef, useState } from "react";
import {
	DREAD_MAX,
	OPENING,
	ROOM_LABEL,
	acceptNarration,
	act,
	actions,
	carrying,
	exits,
	facts,
	initialGame,
	itemsHere,
	type Game,
	type RoomId,
} from "./house";
import Scene from "./scene";
import {
	browserVoice,
	voiceError,
	wakeDungeonMaster,
	type Availability,
	type DungeonMaster,
} from "./voice";

const PLAN: (RoomId | null)[][] = [
	["bedroom", "hall", "study"],
	[null, "foyer", null],
	["parlor", "dining", "kitchen"],
	[null, null, "cellar"],
];

const PLACE: Record<RoomId, string> = {
	foyer: "the foyer",
	parlor: "the parlor",
	dining: "the dining room",
	kitchen: "the kitchen",
	cellar: "the cellar",
	hall: "the hall",
	bedroom: "the bedroom",
	study: "the study",
};

type Line = { id: number; who: "you" | "house"; text: string };

type VoiceState =
	| { phase: "checking" }
	| { phase: "unavailable" }
	| { phase: "idle"; availability: Availability }
	| { phase: "loading"; progress: number }
	| { phase: "ready" }
	| { phase: "error"; message: string };

export default function House() {
	const [game, setGame] = useState<Game>(initialGame);
	const [log, setLog] = useState<Line[]>([{ id: 0, who: "house", text: OPENING }]);
	const [command, setCommand] = useState("");
	const [busy, setBusy] = useState(false);
	const [voice, setVoice] = useState<VoiceState>({ phase: "checking" });
	const gameRef = useRef(game);
	const sessionRef = useRef<DungeonMaster | null>(null);
	const logRef = useRef<HTMLDivElement>(null);
	const lineId = useRef(0);
	const epoch = useRef(0);
	const busyRef = useRef(false);
	const waking = useRef(false);
	gameRef.current = game;

	useEffect(() => {
		let cancel = false;
		browserVoice().then((result) => {
			if (cancel) return;
			if (!result || result === "unavailable") setVoice({ phase: "unavailable" });
			else setVoice({ phase: "idle", availability: result });
		});
		return () => {
			cancel = true;
			sessionRef.current?.destroy();
			sessionRef.current = null;
		};
	}, []);

	useEffect(() => {
		const node = logRef.current;
		if (!node) return;
		node.scrollTop = node.scrollHeight;
	}, [log]);

	async function wake() {
		if (waking.current) return;
		waking.current = true;
		setVoice({ phase: "loading", progress: 0 });
		try {
			const dm = await wakeDungeonMaster((loaded) => {
				setVoice({ phase: "loading", progress: asPercent(loaded) });
			});
			sessionRef.current = dm;
			setVoice({ phase: "ready" });
		} catch (error) {
			sessionRef.current = null;
			setVoice({ phase: "error", message: voiceError(error) });
		} finally {
			waking.current = false;
		}
	}

	function silence() {
		sessionRef.current?.destroy();
		sessionRef.current = null;
		setVoice({ phase: "idle", availability: "available" });
	}

	function restart() {
		epoch.current += 1;
		busyRef.current = false;
		setBusy(false);
		const next = initialGame();
		gameRef.current = next;
		setGame(next);
		setLog([{ id: ++lineId.current, who: "house", text: OPENING }]);
		setCommand("");
	}

	async function run(input: string, display = input) {
		const current = gameRef.current;
		if (current.ending || busyRef.current) return;
		const life = epoch.current;
		const turn = act(current, input);
		const youId = ++lineId.current;
		const houseId = ++lineId.current;
		const session = sessionRef.current;

		if (!turn.understood && session) {
			busyRef.current = true;
			setBusy(true);
			setLog((prev) => [
				...prev,
				{ id: youId, who: "you", text: display },
				{ id: houseId, who: "house", text: "…" },
			]);
			const prose = await session.flavor(facts(current), input);
			if (epoch.current !== life) return;
			const text = prose && acceptNarration(prose, input) ? prose : turn.text;
			setLog((prev) => prev.map((line) => (line.id === houseId ? { ...line, text } : line)));
			busyRef.current = false;
			setBusy(false);
			return;
		}

		gameRef.current = turn.game;
		setGame(turn.game);
		setLog((prev) => [
			...prev,
			{ id: youId, who: "you", text: display },
			{ id: houseId, who: "house", text: turn.text },
		]);
		if (!turn.voice || !session) return;
		const prose = await session.narrate(facts(turn.game), turn.text);
		if (epoch.current !== life || !prose || !acceptNarration(prose, turn.text)) return;
		setLog((prev) => prev.map((line) => (line.id === houseId ? { ...line, text: prose } : line)));
	}

	const near = new Set(exits(game.room));
	const ended = game.ending !== null;

	return (
		<div className="mx-auto max-w-4xl px-6 pb-20" data-house data-room={game.room} data-ending={game.ending ?? "playing"} data-dread={game.dread} data-voice={voice.phase}>
			<div
				className="overflow-hidden rounded-md bg-[#14110e] text-[#e7ded2]"
				style={game.lit && !ended ? { boxShadow: "inset 0 2px 0 #fecef5" } : undefined}
			>
				<Scene
					room={game.room}
					lit={game.lit}
					ending={game.ending}
					hasKey={game.inventory.includes("key")}
					nameKnown={game.nameKnown}
					saltPoured={game.saltPoured}
					items={itemsHere(game)}
				/>
				<div className="flex items-center justify-between gap-4 px-4 pt-3 text-xs tracking-[0.16em] text-[#8a7d6e] uppercase">
					<p>{ended ? (game.ending === "out" ? "Outside" : "Kept") : ROOM_LABEL[game.room]}</p>
					<Dread value={game.dread} />
				</div>
				<div className="grid grid-cols-3 gap-2 px-4 py-3 text-center text-sm">
					{PLAN.flat().map((id, index) => {
						if (!id) return <span key={`empty-${index}`} />;
						const current = id === game.room && !ended;
						const open = near.has(id) && !ended;
						if (current) {
							return (
								<span
									key={id}
									aria-current="location"
									className="justify-self-center rounded-full bg-[#fecef5] px-3 py-1 text-[#1a120f]"
								>
									{ROOM_LABEL[id]}
								</span>
							);
						}
						if (open) {
							return (
								<button
									key={id}
									type="button"
									disabled={busy}
									onClick={() => void run(`go ${id}`, `Go to ${PLACE[id]}`)}
									className="justify-self-center rounded-full border border-[#fecef5]/50 px-3 py-1 text-[#fecef5] hover:bg-[#fecef5]/10 disabled:opacity-40"
								>
									{ROOM_LABEL[id]}
								</button>
							);
						}
						return (
							<span key={id} className="justify-self-center px-2 py-1 text-white/30">
								{ROOM_LABEL[id]}
							</span>
						);
					})}
				</div>
				<p className="px-4 text-xs text-[#6e6256]">Outlined rooms are the ones you can reach.</p>
				<div ref={logRef} role="log" aria-live="polite" className="mt-3 max-h-72 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
					{log.map((line) =>
						line.who === "you" ? (
							<p key={line.id} className="text-sm text-[#9a8d7c]">
								You. {line.text}
							</p>
						) : (
							<p
								key={line.id}
								className={`text-[17px] leading-relaxed text-[#f3eadf] ${line.text === "…" ? "motion-safe:animate-pulse" : ""}`}
								style={{ fontFamily: 'Georgia, "Iowan Old Style", Palatino, serif' }}
							>
								{line.text}
							</p>
						),
					)}
				</div>
				<p className="px-4 text-sm text-[#9a8d7c]">{carrying(game)}</p>
				<div className="flex flex-wrap gap-2 px-4 pt-3">
					{ended ? (
						<button
							type="button"
							onClick={restart}
							className="rounded-full border border-[#fecef5]/70 px-3 py-1 text-sm text-[#fecef5] hover:bg-[#fecef5]/10"
						>
							Begin again
						</button>
					) : (
						actions(game).map((action) => (
							<button
								key={action.label}
								type="button"
								disabled={busy}
								onClick={() => void run(action.command, action.label)}
								className={`rounded-full border px-3 py-1 text-sm disabled:opacity-40 ${
									action.emphasis
										? "border-[#fecef5]/70 text-[#fecef5] hover:bg-[#fecef5]/10"
										: "border-white/15 text-[#e6dccf] hover:border-[#fecef5] hover:text-[#fecef5]"
								}`}
							>
								{action.label}
							</button>
						))
					)}
				</div>
				{ended ? null : (
					<form
						className="flex gap-3 px-4 pt-3"
						onSubmit={(event) => {
							event.preventDefault();
							const value = command.trim();
							if (!value || busy) return;
							setCommand("");
							void run(value);
						}}
					>
						<input
							value={command}
							onChange={(event) => setCommand(event.target.value)}
							placeholder={placeholder(game)}
							aria-label="What you do"
							maxLength={200}
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							disabled={busy}
							className="min-w-0 flex-1 border-b border-white/20 bg-transparent py-2 text-[#f3eadf] outline-none placeholder:text-[#6e6256] focus:border-[#fecef5] disabled:opacity-40"
						/>
						<button
							type="submit"
							disabled={busy || command.trim() === ""}
							className="text-sm text-[#fecef5] disabled:opacity-40"
						>
							Do
						</button>
					</form>
				)}
				<Voice voice={voice} onWake={() => void wake()} onSilence={silence} />
			</div>
			<p className="mt-4 max-w-xl text-sm text-slate-500">
				Leave the house. The plan and the buttons will walk you through it, and the line at the bottom is for
				anything else you want to try. If this browser has a built-in model, it can take over the narration. The
				rules stay on the page either way.
			</p>
		</div>
	);
}

function Dread({ value }: { value: number }) {
	return (
		<p className="inline-flex items-center gap-1" aria-label={`Dread ${value} of ${DREAD_MAX}`}>
			<span>Dread</span>
			{Array.from({ length: DREAD_MAX }, (_, index) => (
				<span
					key={index}
					className={index < value ? "h-3 w-1.5 bg-[#fecef5]" : "h-3 w-1.5 border border-white/30"}
				/>
			))}
		</p>
	);
}

function Voice({ voice, onWake, onSilence }: { voice: VoiceState; onWake: () => void; onSilence: () => void }) {
	return (
		<div className="mt-3 border-t border-white/10 px-4 py-3 text-xs text-[#8a7d6e]">
			{voice.phase === "checking" && <p>Looking for a dungeon master in this browser.</p>}
			{voice.phase === "unavailable" && <p>This browser has no built-in model. The house is speaking for itself.</p>}
			{voice.phase === "idle" && (
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={onWake}
						className="rounded-full border border-[#fecef5]/50 px-3 py-1 text-[#fecef5] hover:bg-[#fecef5]/10"
					>
						{wakeLabel(voice.availability)}
					</button>
					<p>{wakeNote(voice.availability)}</p>
				</div>
			)}
			{voice.phase === "loading" && (
				<p>{voice.progress > 0 ? `Downloading the model… ${voice.progress}%` : "Starting the dungeon master…"}</p>
			)}
			{voice.phase === "ready" && (
				<div className="flex flex-wrap items-center gap-3">
					<p>Dungeon master: this browser, on this device.</p>
					<button type="button" onClick={onSilence} className="underline decoration-white/30 underline-offset-2 hover:text-[#fecef5]">
						Use the house&apos;s own words
					</button>
				</div>
			)}
			{voice.phase === "error" && <p>{voice.message}</p>}
		</div>
	);
}

function placeholder(game: Game): string {
	if (game.room === "foyer" && game.inventory.includes("key") && game.nameKnown) {
		return "Open the door, or say the name";
	}
	if (game.room === "foyer" && game.nameKnown) return "Speak to the door";
	return "Say what you do";
}

function wakeLabel(availability: Availability): string {
	if (availability === "downloadable") return "Download an on-device dungeon master";
	if (availability === "downloading") return "Wake the dungeon master";
	return "Let this browser narrate";
}

function wakeNote(availability: Availability): string {
	if (availability === "downloadable") return "The model stays on this machine. It is a large download.";
	if (availability === "downloading") return "Chrome is already fetching the model.";
	return "Chrome can run the narration on this device.";
}

function asPercent(loaded: number): number {
	const value = loaded <= 1 ? loaded * 100 : loaded;
	return Math.max(0, Math.min(100, Math.round(value)));
}
