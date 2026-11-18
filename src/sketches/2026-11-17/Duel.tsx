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
	judgePrompt,
	liveSpeech,
	localVerdict,
	scriptedReaction,
	settle,
	tooClose,
	winnerLine,
	type Call,
	type Side,
	type Source,
} from "./duel";
import { openBrine, type BrineSession, type BrineTurn } from "./brine";
import { DOWNLOAD_LABEL, loadFailure, MODEL_FILE, MODEL_NAME } from "./protocol";

type Origin = "model" | "deck";
type Busy = "judge" | "insult" | null;

type Exchange = {
	id: number;
	insult: string;
	reply: string;
	reaction: string;
	verdict: "hit" | "miss";
	source: Source;
};

type Engine =
	| { phase: "idle" }
	| { phase: "loading"; pct: number; file: string }
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
	const [engine, setEngine] = useState<Engine>({ phase: "idle" });

	useEffect(() => {
		return () => {
			life.current += 1;
			readyRef.current = false;
			void sessionRef.current?.exit();
			sessionRef.current = null;
		};
	}, []);

	useEffect(() => {
		const node = logRef.current;
		if (!node) return;
		node.scrollTop = node.scrollHeight;
	}, [log]);

	function showInsult(line: string, origin: Origin) {
		insultRef.current = line;
		setInsult(line);
		setFrom(origin);
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
		void sessionRef.current?.exit();
		sessionRef.current = null;
		readyRef.current = false;
		setEngine({ phase: "loading", pct: 0, file: MODEL_FILE });
		try {
			const session = await openBrine((pct) => {
				setEngine((prev) => (prev.phase === "loading" ? { ...prev, pct } : prev));
			});
			sessionRef.current = session;
			readyRef.current = true;
			setEngine({ phase: "ready" });
			setBanner("The model has the deck.");
			if (!busyRef.current && !winnerRef.current && draftRef.current.trim() === "") {
				void takeDeck(life.current, false);
			}
		} catch (error) {
			console.error(error);
			readyRef.current = false;
			sessionRef.current = null;
			const message = error instanceof Error ? error.message : "The model did not start.";
			setEngine({ phase: "error", message: loadFailure(message) });
		} finally {
			loadingRef.current = false;
		}
	}

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
		const token = life.current;
		const current = insultRef.current;
		busyRef.current = true;
		draftRef.current = "";
		setDraft("");
		setBanner(null);
		setLiveReply(text);
		setLiveCall("");
		const usingModel = readyRef.current && sessionRef.current != null;
		if (usingModel) setBusy("judge");

		let modelRaw: string | null = null;
		if (usingModel) {
			try {
				modelRaw = await ask(
					[
						{ role: "system", content: JUDGE_PERSONA },
						{ role: "user", content: judgePrompt(current, text) },
					],
					{ temperature: 0, maxNewTokens: 6 },
					(chunk) => {
						if (life.current === token) setLiveCall(liveSpeech(chunk, "call"));
					},
				);
			} catch (error) {
				console.error(error);
				modelRaw = null;
			}
		}
		if (life.current !== token) return;

		const result = settle(current, text, modelRaw, Math.random);
		const verdict = result.verdict;
		if (verdict === "foul") {
			busyRef.current = false;
			setBusy(null);
			setLiveReply(null);
			setBanner(result.reaction);
			return;
		}
		const reaction = result.reaction || scriptedReaction(verdict, Math.random);
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
			},
		]);
		lineId.current += 1;

		if (next.winner) {
			busyRef.current = false;
			setBusy(null);
			return;
		}
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
	const attacker: Side | null =
		call?.verdict === "hit" ? "you" : call?.verdict === "miss" ? "brine" : null;

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
				@keyframes duel-lunge-you { 40% { transform: translateX(12px); } }
				@keyframes duel-lunge-brine { 40% { transform: translateX(-12px); } }
				@keyframes duel-flinch-you { 35% { transform: translateX(-8px) rotate(-7deg); } }
				@keyframes duel-flinch-brine { 35% { transform: translateX(8px) rotate(7deg); } }
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

				<div className="mt-6 flex items-end justify-between gap-2">
					<Fighter
						side="you"
						name="You"
						marks={you}
						swing={swing}
						lunge={attacker === "you"}
						flinch={attacker === "brine"}
					/>
					<svg viewBox="0 0 32 32" className="mb-8 size-7 shrink-0 text-[#c9c3b8]" aria-hidden>
						<path d="M7 6l18 20M25 6L7 26" fill="none" stroke="currentColor" strokeWidth="1.6" />
					</svg>
					<Fighter
						side="brine"
						name="Brine"
						marks={brine}
						swing={swing}
						lunge={attacker === "brine"}
						flinch={attacker === "you"}
					/>
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
						</div>
					) : (
						<p className="text-sm leading-6 text-[#5c6370]">
							Answer him in a full sentence. Throw his words, or the word you, back at him.
						</p>
					)}
					{banner && (
						<p className="mt-2 text-sm text-[#5c6370]" role="status">
							{banner}
						</p>
					)}
				</div>

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
							</li>
						))}
					</ol>
				)}

				<EngineBar engine={engine} onLoad={() => void startLoad()} />
			</div>
			<p className="mx-auto mt-4 max-w-3xl px-1 text-[11px] leading-5 text-[#9aa1ab]">
				He insults, you answer. A thin reply costs you a point, and one that turns it around costs
				him a point. Three down ends it. {MODEL_NAME} runs in this tab, about {DOWNLOAD_LABEL},
				through llama.cpp. If it cannot start, the understudy keeps the deck.
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

function Fighter({
	side,
	name,
	marks,
	swing,
	lunge,
	flinch,
}: {
	side: Side;
	name: string;
	marks: number;
	swing: number;
	lunge: boolean;
	flinch: boolean;
}) {
	const anim = lunge
		? side === "you"
			? "motion-safe:animate-[duel-lunge-you_0.5s_ease]"
			: "motion-safe:animate-[duel-lunge-brine_0.5s_ease]"
		: flinch
			? side === "you"
				? "motion-safe:animate-[duel-flinch-you_0.5s_ease]"
				: "motion-safe:animate-[duel-flinch-brine_0.5s_ease]"
			: "";
	return (
		<div
			className={cn(
				"flex w-[42%] flex-col",
				side === "brine" ? "items-end text-right" : "items-start",
			)}
		>
			<svg
				key={`${side}-${swing}`}
				viewBox="0 0 100 120"
				className={cn("h-24 w-20 sm:h-28 sm:w-24", anim)}
				aria-hidden
			>
				{side === "you" ? <YouArt /> : <BrineArt />}
			</svg>
			<p className="font-space-grotesk mt-2 text-lg leading-none">{name}</p>
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

function YouArt() {
	return (
		<g fill="#1c1d21">
			<path d="M22 40 46 18l30 18-5 6-22-12-20 12z" />
			<path d="M30 36h34" stroke="#fecef5" strokeWidth="5" />
			<circle cx="48" cy="48" r="12" />
			<path d="M28 62h40l8 48H22z" />
			<path d="M68 74h26" stroke="#1c1d21" strokeWidth="3" fill="none" />
			<path d="M90 68l8 6-8 6" fill="none" stroke="#1c1d21" strokeWidth="3" />
		</g>
	);
}

function BrineArt() {
	return (
		<g fill="#1c1d21">
			<path d="M78 42 54 8 30 38l6 6 16-18 18 14z" />
			<path d="M50 14c10-12 18-8 14 4" fill="#fecef5" />
			<circle cx="52" cy="50" r="12" />
			<path d="M32 64h40l6 46H26z" />
			<path d="M32 76H8" stroke="#1c1d21" strokeWidth="3" fill="none" />
			<path d="M12 70 4 76l8 6" fill="none" stroke="#1c1d21" strokeWidth="3" />
			<circle cx="80" cy="74" r="7" fill="#fecef5" />
			<path d="M86 74h7" stroke="#1c1d21" strokeWidth="2" />
		</g>
	);
}

function EngineBar({ engine, onLoad }: { engine: Engine; onLoad: () => void }) {
	return (
		<div className="mt-5 border-t border-[#e6e9ee] pt-4 text-sm leading-6 text-[#5c6370]">
			{engine.phase === "idle" && (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="max-w-md">
						The understudy has the deck. The lines are practised, and the page keeps the score.
					</p>
					<button
						type="button"
						onClick={onLoad}
						className="shrink-0 rounded-full bg-[#1c1d21] px-4 py-2 text-sm text-white"
					>
						Load the model · about {DOWNLOAD_LABEL}
					</button>
				</div>
			)}
			{engine.phase === "idle" && (
				<p className="mt-2 text-xs text-[#9aa1ab]">
					About {DOWNLOAD_LABEL}, then it runs in this tab. No WebGPU and no key.
				</p>
			)}
			{engine.phase === "loading" && (
				<div>
					<p>{engine.pct >= 100 ? "Starting the model…" : `Fetching the model… ${engine.pct}%`}</p>
					<div
						className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6e9ee]"
						role="progressbar"
						aria-valuenow={engine.pct}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label="Model download"
					>
						<div className="h-full bg-[#1f6f5b]" style={{ width: `${engine.pct}%` }} />
					</div>
					<p className="mt-1 truncate text-xs text-[#9aa1ab]">{engine.file}</p>
					<p className="mt-1 text-xs text-[#9aa1ab]">
						You can keep duelling the understudy while it loads.
					</p>
				</div>
			)}
			{engine.phase === "ready" && (
				<p>
					{MODEL_NAME} is in this tab. Insults and the calls are his. Nothing leaves the browser.
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
						Try the model again
					</button>
				</div>
			)}
		</div>
	);
}
