import { RotateCcw, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	FOUL,
	INSULT_PERSONA,
	JUDGE_PERSONA,
	MARKS,
	SUBJECTS,
	applyMarks,
	avoidWords,
	cleanInsult,
	createDeck,
	insultPrompt,
	isBlocked,
	judgeNote,
	judgePrompt,
	plainRemark,
	liveSpeech,
	localVerdict,
	scriptedReaction,
	settle,
	tooClose,
	winnerLine,
	type Call,
	type Path,
	type Side,
	type Source,
} from "./duel";
import { modelIsSaved, openBrine, type BrineSession, type BrineTurn } from "./brine";
import { DOWNLOAD_LABEL, loadFailure, MODEL_FILE, MODEL_NAME } from "./protocol";
import { DuelStage, type Pose } from "./sprites";

type Origin = "model" | "deck";
type Busy = "judge" | "insult" | null;
type Beat = "rest" | "brine" | "you" | "hit" | "miss";

type Exchange = {
	id: number;
	insult: string;
	reply: string;
	reaction: string;
	verdict: "hit" | "miss";
	source: Source;
	why: string;
	paths: Path[];
};

type Engine =
	| { phase: "idle" }
	| { phase: "loading"; pct: number; file: string; kept: boolean }
	| { phase: "ready" }
	| { phase: "error"; message: string };

const SPOKEN = 'Georgia, "Iowan Old Style", Palatino, serif';

function cn(...parts: (string | false | null | undefined)[]): string {
	return parts.filter(Boolean).join(" ");
}

export default function Duel() {
	const deckRef = useRef<string[]>([]);
	const cursorRef = useRef(0);
	const recentRef = useRef<string[]>([]);
	const insultRef = useRef("");
	const youRef = useRef(MARKS);
	const brineRef = useRef(MARKS);
	const winnerRef = useRef<Side | null>(null);
	const draftRef = useRef("");
	const life = useRef(0);
	const busyRef = useRef(false);
	const readyRef = useRef(false);
	const loadingRef = useRef(false);
	const sessionRef = useRef<BrineSession | null>(null);
	const lineId = useRef(0);
	const logRef = useRef<HTMLOListElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const [insult, setInsult] = useState(() => {
		const deck = createDeck(Math.random);
		deckRef.current = deck;
		cursorRef.current = 1;
		const line = deck[0] ?? "";
		insultRef.current = line;
		recentRef.current = line ? [line] : [];
		return line;
	});
	const [from, setFrom] = useState<Origin>("deck");
	const [you, setYou] = useState(MARKS);
	const [brine, setBrine] = useState(MARKS);
	const [draft, setDraft] = useState("");
	const [log, setLog] = useState<Exchange[]>([]);
	const [call, setCall] = useState<Call | null>(null);
	const [winner, setWinner] = useState<Side | null>(null);
	const [busy, setBusy] = useState<Busy>(null);
	const [liveReply, setLiveReply] = useState<string | null>(null);
	const [liveCall, setLiveCall] = useState("");
	const [liveInsult, setLiveInsult] = useState<string | null>(null);
	const [banner, setBanner] = useState<string | null>(null);
	const [swing, setSwing] = useState(0);
	const [hints, setHints] = useState(false);
	const [beat, setBeat] = useState<Beat>("brine");
	const [engine, setEngine] = useState<Engine>({
		phase: "loading",
		pct: 0,
		file: MODEL_FILE,
		kept: false,
	});
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		return () => {
			life.current += 1;
			readyRef.current = false;
			void sessionRef.current?.exit();
			sessionRef.current = null;
		};
	}, []);

	useEffect(() => {
		let live = true;
		void modelIsSaved().then((yes) => {
			if (live) setSaved(yes);
		});
		return () => {
			live = false;
		};
	}, []);

	useEffect(() => {
		const node = logRef.current;
		if (!node) return;
		node.scrollTop = node.scrollHeight;
	}, [log]);

	useEffect(() => {
		if (beat !== "brine") return;
		const timer = window.setTimeout(() => {
			setBeat((current) => (current === "brine" ? "rest" : current));
		}, 1500);
		return () => window.clearTimeout(timer);
	}, [beat, insult]);

	function showInsult(line: string, origin: Origin) {
		insultRef.current = line;
		setInsult(line);
		setFrom(origin);
		setBeat("brine");
	}

	function draw(): string {
		if (cursorRef.current >= deckRef.current.length) {
			deckRef.current = createDeck(Math.random);
			cursorRef.current = 0;
		}
		const line = deckRef.current[cursorRef.current] ?? deckRef.current[0] ?? "";
		cursorRef.current += 1;
		if (line && recentRef.current.includes(line) && cursorRef.current < deckRef.current.length)
			return draw();
		return line;
	}

	function remember(line: string) {
		recentRef.current = [...recentRef.current, line].slice(-6);
	}

	async function startLoad() {
		if (loadingRef.current) return;
		loadingRef.current = true;
		const token = life.current;
		void sessionRef.current?.exit();
		sessionRef.current = null;
		readyRef.current = false;
		setEngine({ phase: "loading", pct: 0, file: MODEL_FILE, kept: false });
		try {
			const session = await openBrine((pct, kept) => {
				if (life.current !== token) return;
				setEngine((prev) => (prev.phase === "loading" ? { ...prev, pct, kept } : prev));
				if (kept) setSaved(true);
			});
			if (life.current !== token) {
				await session.exit().catch(() => undefined);
				return;
			}
			sessionRef.current = session;
			readyRef.current = true;
			setEngine({ phase: "ready" });
			setBanner("The model has the deck.");
			if (!busyRef.current && !winnerRef.current && draftRef.current.trim() === "") {
				void takeDeck(token, false);
			}
		} catch (error) {
			console.error(error);
			if (life.current !== token) return;
			readyRef.current = false;
			sessionRef.current = null;
			const message = error instanceof Error ? error.message : "The model did not start.";
			setEngine({ phase: "error", message: loadFailure(message) });
		} finally {
			if (life.current === token) loadingRef.current = false;
		}
	}

	useEffect(() => {
		void startLoad();
	}, []);

	function ask(
		messages: BrineTurn[],
		options: { temperature: number; maxNewTokens: number },
		onDelta?: (text: string) => void,
	): Promise<string> {
		const session = sessionRef.current;
		if (!session) return Promise.reject(new Error("The model is not ready."));
		const timed = new Promise<string>((resolve, reject) => {
			const timer = window.setTimeout(() => reject(new Error("timeout")), 90000);
			session
				.generate({
					messages,
					maxTokens: options.maxNewTokens,
					temperature: options.temperature,
					onDelta,
				})
				.then((text) => {
					window.clearTimeout(timer);
					resolve(text);
				})
				.catch((error: unknown) => {
					window.clearTimeout(timer);
					reject(error instanceof Error ? error : new Error("The model stopped."));
				});
		});
		return timed;
	}

	async function composeInsult(token: number): Promise<string | null> {
		const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)] ?? "hat";
		const avoid = avoidWords(recentRef.current);
		for (let attempt = 0; attempt < 2; attempt += 1) {
			if (life.current !== token) return null;
			try {
				const raw = await ask(
					[
						{ role: "system", content: INSULT_PERSONA },
						{ role: "user", content: insultPrompt(subject, avoid) },
					],
					{ temperature: 0.7, maxNewTokens: 32 },
					(text) => {
						if (life.current === token) setLiveInsult(liveSpeech(text, "insult"));
					},
				);
				if (life.current !== token) return null;
				const line = cleanInsult(raw);
				if (line && !tooClose(line, recentRef.current) && !isBlocked(line)) return line;
			} catch (error) {
				if (!(error instanceof Error) || error.message !== "replaced") console.error(error);
				return null;
			}
		}
		return null;
	}

	async function takeDeck(token: number, required: boolean) {
		const holdsLock = busyRef.current;
		if (!holdsLock) busyRef.current = true;
		try {
			if (!sessionRef.current || !readyRef.current) {
				if (!required || life.current !== token) return;
				const line = draw();
				if (!line) return;
				showInsult(line, "deck");
				remember(line);
				return;
			}
			if (required) {
				insultRef.current = "";
				setInsult("");
			}
			setLiveInsult("");
			setBusy("insult");
			const line = await composeInsult(token);
			if (life.current !== token) return;
			if (line) {
				showInsult(line, "model");
				remember(line);
				return;
			}
			if (required) {
				const decked = draw();
				if (!decked) return;
				showInsult(decked, "deck");
				remember(decked);
			}
		} finally {
			if (!holdsLock && life.current === token) {
				busyRef.current = false;
				setBusy(null);
				setLiveInsult(null);
			}
		}
	}

	async function throwComeback(reply: string) {
		const text = reply.trim();
		if (!text || busyRef.current || winnerRef.current) return;
		if (isBlocked(text) || localVerdict(insultRef.current, text) === "foul") {
			draftRef.current = "";
			setDraft("");
			setBanner(FOUL);
			return;
		}
		setBeat("you");
		const token = life.current;
		const current = insultRef.current;
		busyRef.current = true;
		draftRef.current = "";
		setDraft("");
		setBanner(null);
		setLiveReply(text);
		setLiveCall("");
		setBusy("judge");
		const usingModel = readyRef.current && sessionRef.current != null;
		const shape = judgeNote(current, text);
		const lengthMet = shape.paths.find((path) => path.id === "length")?.met === true;
		const freshMet = shape.paths.find((path) => path.id === "fresh")?.met === true;
		const askModel =
			usingModel && !plainRemark(text) && shape.verdict !== "foul" && lengthMet && freshMet;

		let modelRaw: string | null = null;
		if (!usingModel) {
			await pause(420);
			if (life.current !== token) return;
			setBeat("rest");
			setLiveReply(null);
			setLiveCall("");
			setBanner("Load the model. He judges whether it comes back at what he said.");
			busyRef.current = false;
			setBusy(null);
			return;
		}
		if (askModel) {
			try {
				modelRaw = await ask(
					[
						{ role: "system", content: JUDGE_PERSONA },
						{ role: "user", content: judgePrompt(current, text) },
					],
					{ temperature: 0, maxNewTokens: 32 },
				);
			} catch (error) {
				console.error(error);
				modelRaw = null;
			}
		} else {
			await pause(420);
		}
		if (life.current !== token) return;

		const result = settle(current, text, modelRaw, Math.random, askModel);
		const verdict = result.verdict;
		if (verdict === "foul") {
			busyRef.current = false;
			setBusy(null);
			setLiveReply(null);
			setBeat("rest");
			setBanner(result.reaction);
			return;
		}
		const reaction = result.reaction || scriptedReaction(verdict, Math.random);
		setBeat(verdict === "hit" ? "hit" : "miss");
		const next = applyMarks(youRef.current, brineRef.current, verdict);
		youRef.current = next.you;
		brineRef.current = next.brine;
		winnerRef.current = next.winner;
		setYou(next.you);
		setBrine(next.brine);
		setWinner(next.winner);
		setCall({ ...result, reaction });
		setLiveReply(null);
		setLiveCall("");
		setSwing((value) => value + 1);
		setLog((prev) => [
			...prev,
			{
				id: lineId.current + 1,
				insult: current,
				reply: text,
				reaction,
				verdict,
				source: result.source,
				why: result.why,
				paths: result.paths,
			},
		]);
		lineId.current += 1;

		if (next.winner) {
			busyRef.current = false;
			setBusy(null);
			return;
		}
		await pause(1000);
		if (life.current !== token) return;
		setBeat("brine");
		if (readyRef.current && sessionRef.current) {
			await takeDeck(token, true);
		} else {
			const line = draw();
			if (line) {
				showInsult(line, "deck");
				remember(line);
			}
		}
		if (life.current !== token) return;
		busyRef.current = false;
		setBusy(null);
		setLiveInsult(null);
		requestAnimationFrame(() => inputRef.current?.focus());
	}

	function again() {
		life.current += 1;
		const token = life.current;
		busyRef.current = false;
		youRef.current = MARKS;
		brineRef.current = MARKS;
		winnerRef.current = null;
		deckRef.current = createDeck(Math.random);
		cursorRef.current = 0;
		recentRef.current = [];
		setYou(MARKS);
		setBrine(MARKS);
		setWinner(null);
		setLog([]);
		setCall(null);
		draftRef.current = "";
		setDraft("");
		setLiveReply(null);
		setLiveCall("");
		setLiveInsult(null);
		setSwing(0);
		setBeat("brine");
		setBanner(readyRef.current ? "The model has the deck." : null);
		if (readyRef.current && sessionRef.current) {
			busyRef.current = true;
			void takeDeck(token, true).finally(() => {
				if (life.current !== token) return;
				busyRef.current = false;
				setBusy(null);
				setLiveInsult(null);
			});
			return;
		}
		const line = draw();
		if (line) {
			showInsult(line, "deck");
			remember(line);
		}
		setBusy(null);
	}

	const spoken =
		busy === "insult"
			? liveInsult || "Choosing the next insult…"
			: insult || "Choosing the next insult…";
	const picture = pictureOf(beat, winner, busy);

	return (
		<div
			className="bg-[#efeae2] px-3 py-5 sm:px-6 sm:py-8"
			data-duel
			data-engine={engine.phase}
			data-you={you}
			data-brine={brine}
			data-winner={winner ?? "none"}
			data-busy={busy ?? "idle"}
			data-from={from}
		>
			<style>{`
				[data-duel] button:not(:disabled) { cursor: pointer; }
				[data-duel] button:focus-visible, [data-duel] input:focus-visible {
					outline: 2px solid #f25c1d;
					outline-offset: 2px;
				}
			`}</style>
			<div className="mx-auto max-w-3xl rounded-[28px] bg-white p-4 text-[#1c1d21] shadow-[0_24px_60px_rgba(28,29,33,0.06)] sm:p-6">
				<header className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex items-center gap-2.5">
						<Swords className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
						<div>
							<p className="font-space-grotesk text-lg leading-none">insults</p>
							<p className="mt-1 text-[10px] tracking-[0.18em] text-[#9aa1ab]">FIRST TO THREE</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							aria-pressed={hints}
							onClick={() => setHints((open) => !open)}
							className={cn(
								"rounded-full px-3 py-2 text-xs",
								hints ? "bg-[#1c1d21] text-white" : "bg-[#f3f5f7] text-[#5c6370]",
							)}
						>
							Hints
						</button>
						<Chip engine={engine} />
						<button
							type="button"
							aria-label="Start over"
							onClick={again}
							disabled={busy !== null}
							className="flex size-10 items-center justify-center rounded-full bg-[#f3f5f7] hover:bg-[#e8ecf1] disabled:opacity-40"
						>
							<RotateCcw className="size-4" strokeWidth={1.75} />
						</button>
					</div>
				</header>

				<DuelStage you={picture.you} brine={picture.brine} clash={picture.clash} swing={swing} />
				<div className="mx-auto mt-3 flex w-full max-w-lg items-start px-3">
					<div className="w-[44.7%]">
						<Score side="you" name="You" marks={you} />
					</div>
					<div className="flex w-[55.3%] justify-end">
						<Score side="brine" name="Brine" marks={brine} />
					</div>
				</div>

				<p className="mt-6 text-[10px] tracking-[0.16em] text-[#9aa1ab] uppercase">
					{from === "model" ? `${MODEL_NAME} · in this tab` : "Understudy · from the deck"}
				</p>
				<blockquote
					data-insult
					className="mt-2 text-2xl leading-snug text-[#1c1d21] sm:text-[2rem]"
					style={{ fontFamily: SPOKEN }}
				>
					{spoken}
				</blockquote>

				<div className="mt-4 min-h-16" aria-live="polite">
					{busy === "judge" && liveReply ? (
						<div>
							<p className="text-sm text-[#5c6370]">You. {liveReply}</p>
							<p
								className={cn(
									"mt-1 text-lg leading-snug",
									!liveCall && "motion-safe:animate-pulse",
								)}
								style={{ fontFamily: SPOKEN }}
							>
								{liveCall || "Brine is weighing that."}
							</p>
						</div>
					) : call && call.verdict !== "foul" ? (
						<div data-verdict={call.verdict} data-source={call.source}>
							<p
								className={cn(
									"text-[10px] tracking-[0.16em] uppercase",
									call.verdict === "hit" ? "text-[#1f6f5b]" : "text-[#c4552a]",
								)}
							>
								{call.verdict === "hit" ? "Touch" : "Miss"}
								{call.source === "referee" && engine.phase === "ready" ? " · referee" : ""}
							</p>
							<p className="mt-1 text-lg leading-snug" style={{ fontFamily: SPOKEN }}>
								{call.reaction}
							</p>
							{hints && <Grade paths={call.paths} />}
						</div>
					) : (
						<p className="text-sm leading-6 text-[#5c6370]">
							{hints
								? engine.phase === "ready"
									? "He reads the line. A touch has to come back at what he said, and insult him."
									: "Load the model. He judges whether it comes back at what he said."
								: "Answer him in a full sentence. Hints shows what scores a touch."}
						</p>
					)}
					{banner && (
						<p className="mt-2 text-sm text-[#5c6370]" role="status">
							{banner}
						</p>
					)}
				</div>

				{hints && <Rules judged={engine.phase === "ready"} />}

				{winner ? (
					<button
						type="button"
						onClick={again}
						className="mt-2 flex min-h-36 w-full flex-col items-start justify-between rounded-[28px] bg-[#f25c1d] p-5 text-left text-white"
					>
						<span className="text-sm font-medium text-white/80">Duel</span>
						<span className="font-space-grotesk text-5xl leading-none">Again</span>
						<span className="text-sm font-medium">{winnerLine(winner)}</span>
					</button>
				) : (
					<form
						className="mt-2 flex flex-col gap-2 sm:flex-row"
						onSubmit={(event) => {
							event.preventDefault();
							void throwComeback(draft);
						}}
					>
						<label className="sr-only" htmlFor="comeback">
							Your comeback
						</label>
						<input
							ref={inputRef}
							id="comeback"
							value={draft}
							maxLength={180}
							disabled={busy !== null}
							enterKeyHint="send"
							autoComplete="off"
							placeholder="Turn it back on him"
							onChange={(event) => {
								draftRef.current = event.target.value;
								setDraft(event.target.value);
							}}
							className="min-w-0 flex-1 rounded-full bg-[#f3f5f7] px-4 py-3 text-base outline-none placeholder:text-[#9aa1ab] disabled:opacity-50"
						/>
						<button
							type="submit"
							disabled={busy !== null || draft.trim() === ""}
							className="rounded-full bg-[#f25c1d] px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
						>
							{busy === "judge" ? "Weighing" : "Throw"}
						</button>
					</form>
				)}

				{log.length > 0 && (
					<ol
						ref={logRef}
						className="mt-5 max-h-48 space-y-0 overflow-y-auto overscroll-contain border-t border-[#e6e9ee] pt-1"
					>
						{log.map((item) => (
							<li key={item.id} className="border-b border-[#e6e9ee] py-3 last:border-b-0">
								<p className="text-sm leading-5 text-[#5c6370]">
									<span className="text-[#9aa1ab]">Brine. </span>
									{item.insult}
								</p>
								<p className="mt-1 text-sm leading-5">
									<span className="text-[#9aa1ab]">You. </span>
									{item.reply}
								</p>
								<p className="mt-1 text-sm leading-5">
									<span className={item.verdict === "hit" ? "text-[#1f6f5b]" : "text-[#c4552a]"}>
										{item.verdict === "hit" ? "Touch. " : "Miss. "}
									</span>
									{item.reaction}
								</p>
								{hints && <p className="mt-1 text-sm leading-5 text-[#5c6370]">{item.why}</p>}
							</li>
						))}
					</ol>
				)}

				<EngineBar engine={engine} saved={saved} onLoad={() => void startLoad()} />
			</div>
			<p className="mx-auto mt-4 max-w-3xl px-1 text-[11px] leading-5 text-[#9aa1ab]">
				A miss costs you a mark, a touch costs him one, and three down ends it. {MODEL_NAME} reads
				the line and scores it only when it comes back at what he said and insults him. It runs in
				this tab, about {DOWNLOAD_LABEL}, through llama.cpp. If it cannot start, the understudy
				keeps the deck and the score stays put.
			</p>
		</div>
	);
}

function Chip({ engine }: { engine: Engine }) {
	const label =
		engine.phase === "ready"
			? "Model"
			: engine.phase === "loading"
				? "Loading"
				: engine.phase === "error"
					? "No model"
					: "Understudy";
	return (
		<span className="rounded-full bg-[#f3f5f7] px-3 py-2 text-xs text-[#5c6370]">{label}</span>
	);
}

function pause(ms: number) {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function pictureOf(
	beat: Beat,
	winner: Side | null,
	busy: Busy,
): { you: Pose; brine: Pose; clash: boolean } {
	if (winner === "you" || beat === "hit") return { you: "lunge", brine: "flinch", clash: true };
	if (winner === "brine" || beat === "miss") return { you: "flinch", brine: "lunge", clash: true };
	if (beat === "you") return { you: "talk", brine: "idle", clash: false };
	if (beat === "brine" || busy === "insult") return { you: "idle", brine: "talk", clash: false };
	return { you: "idle", brine: "idle", clash: false };
}

function Rules({ judged }: { judged: boolean }) {
	return (
		<div className="mt-4 rounded-2xl bg-[#f3f5f7] px-4 py-3 text-sm leading-6 text-[#5c6370]">
			<p className="text-[10px] tracking-[0.16em] text-[#9aa1ab] uppercase">He reads the line</p>
			<ul className="mt-1 list-disc space-y-1 pl-4">
				<li>Four words or more.</li>
				<li>It is not a copy of his line.</li>
				<li>It comes back at what he just said, and it insults him. A description misses.</li>
			</ul>
			<p className="mt-2">
				{judged
					? "Saying what it is, or what it has, does not score. He still has to call it a comeback and an insult."
					: "Load the model. Until he can read, a line does not score."}
			</p>
		</div>
	);
}

function Grade({ paths }: { paths: Path[] }) {
	if (paths.length === 0) return null;
	return (
		<ul className="mt-3 space-y-1">
			{paths.map((path) => (
				<li key={path.id} className="text-sm leading-5">
					<span className={path.met ? "text-[#1f6f5b]" : "text-[#c4552a]"}>
						{path.met ? "Met. " : "Missing. "}
					</span>
					<span className="text-[#5c6370]">{path.detail}</span>
				</li>
			))}
		</ul>
	);
}

function Score({ side, name, marks }: { side: Side; name: string; marks: number }) {
	return (
		<div className={cn("flex flex-col", side === "brine" ? "items-end text-right" : "items-start")}>
			<p className="font-space-grotesk text-lg leading-none">{name}</p>
			<p className="mt-2 flex gap-1.5" aria-label={`${name}, ${marks} of ${MARKS} left`}>
				{Array.from({ length: MARKS }, (_, index) => (
					<span
						key={index}
						className={cn(
							"h-2 w-5 rounded-full sm:w-6",
							index < marks ? "bg-[#1c1d21]" : "bg-[#e6e9ee]",
						)}
					/>
				))}
			</p>
		</div>
	);
}

function EngineBar({
	engine,
	saved,
	onLoad,
}: {
	engine: Engine;
	saved: boolean;
	onLoad: () => void;
}) {
	return (
		<div className="mt-5 border-t border-[#e6e9ee] pt-4 text-sm leading-6 text-[#5c6370]">
			{engine.phase === "idle" && (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="max-w-md">
						{saved
							? "The model is already saved in this browser."
							: "The understudy has the deck. The lines are practised, and the page keeps the score."}
					</p>
					<button
						type="button"
						onClick={onLoad}
						className="shrink-0 rounded-full bg-[#1c1d21] px-4 py-2 text-sm text-white"
					>
						{saved ? "Load the saved model" : `Load the model · about ${DOWNLOAD_LABEL}`}
					</button>
				</div>
			)}
			{engine.phase === "idle" && (
				<p className="mt-2 text-xs text-[#9aa1ab]">
					{saved
						? "A refresh uses that copy. It runs in this tab, with no WebGPU and no key."
						: `About ${DOWNLOAD_LABEL} the first time, then it stays in this browser. No WebGPU and no key.`}
				</p>
			)}
			{engine.phase === "loading" && (
				<div>
					<p>
						{engine.kept
							? "Opening the saved model…"
							: engine.pct >= 100
								? "Starting the model…"
								: `Fetching the model… ${engine.pct}%`}
					</p>
					<div
						className="mt-2 h-2 overflow-hidden rounded-full bg-[#e6e9ee]"
						role="progressbar"
						aria-valuenow={engine.kept ? undefined : engine.pct}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label={engine.kept ? "Opening the saved model" : "Model download"}
					>
						<div
							className={cn(
								"h-full bg-[#1f6f5b]",
								engine.kept && "w-full animate-pulse",
								!engine.kept && "transition-[width] duration-150",
							)}
							style={engine.kept ? undefined : { width: `${engine.pct}%` }}
						/>
					</div>
					<p className="mt-1 truncate text-xs text-[#9aa1ab]">{engine.file}</p>
					<p className="mt-1 text-xs text-[#9aa1ab]">
						You can answer him while it loads. Scoring starts once he can read the line.
					</p>
				</div>
			)}
			{engine.phase === "ready" && (
				<p>
					{MODEL_NAME} is in this tab, and the file stays saved in this browser. The insults are
					his. He scores a line only when it comes back at what he said and insults him. Nothing
					leaves the browser.
				</p>
			)}
			{engine.phase === "error" && (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p>{engine.message} The understudy keeps the deck.</p>
					<button
						type="button"
						onClick={onLoad}
						className="shrink-0 rounded-full bg-[#1c1d21] px-4 py-2 text-sm text-white"
					>
						{saved ? "Load the saved model" : "Try the model again"}
					</button>
				</div>
			)}
		</div>
	);
}
