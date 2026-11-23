import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
	MODEL_LABEL,
	chat,
	isBrainReady,
	loadBrain,
	offlineReply,
	type BrainStatus,
	type ChatTurn,
	type LoadPhase,
} from "./brain";
import { gameLabel, playTurn, startGame, type GameKind, type GameState } from "./games";
import {
	inferToolFromUtterance,
	loadNotes,
	runTool,
	type Note,
	type ToolCall,
} from "./tools";
import { listenOnce, preferredVoiceName, speak, speechSupported, stopSpeaking } from "./voice";

type Line = {
	id: string;
	role: "you" | "shotgun" | "system";
	text: string;
};

const SUGGESTIONS = [
	"Play trivia",
	"Where am I?",
	"Look up the Pacific Ocean",
	"Note: pick up milk",
	"Word chain",
	"Tell me a road-trip joke",
];

export default function Shotgun() {
	const [status, setStatus] = useState<BrainStatus>("loading");
	const [progress, setProgress] = useState(0);
	const [phase, setPhase] = useState<LoadPhase>("download");
	const [lines, setLines] = useState<Line[]>([
		{
			id: "welcome",
			role: "shotgun",
			text: "Passenger seat's free. Loading the on-device brain — tap the wheel anytime for chat, games, notes, lookups, GPS.",
		},
	]);
	const [typed, setTyped] = useState("");
	const [listening, setListening] = useState(false);
	const [interim, setInterim] = useState("");
	const [busy, setBusy] = useState(false);
	const [notes, setNotes] = useState<Note[]>(() => (typeof window !== "undefined" ? loadNotes() : []));
	const [game, setGame] = useState<GameState>({ kind: "idle" });
	const [voiceOk] = useState(() => speechSupported());
	const [voiceName, setVoiceName] = useState<string | null>(null);
	const [error, setError] = useState("");
	const historyRef = useRef<ChatTurn[]>([]);
	const logRef = useRef<HTMLDivElement>(null);
	const gameRef = useRef(game);
	gameRef.current = game;

	useEffect(() => {
		logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
	}, [lines, interim]);

	useEffect(() => {
		void preferredVoiceName().then((name) => setVoiceName(name));
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			setStatus("loading");
			setError("");
			try {
				const { fromCache } = await loadBrain((pct, nextPhase) => {
					if (cancelled) return;
					setProgress(pct);
					setPhase(nextPhase);
				});
				if (cancelled) return;
				setStatus("ready");
				setLines((prev) => [
					...prev.slice(-40),
					{
						id: `${Date.now()}-ready`,
						role: "system",
						text: fromCache
							? `Chat model ready (cached) · ${MODEL_LABEL}`
							: `Chat model installed · ${MODEL_LABEL}`,
					},
				]);
			} catch (err) {
				if (cancelled) return;
				setStatus("error");
				setError(err instanceof Error ? err.message : "Could not load model.");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	function push(role: Line["role"], text: string) {
		setLines((prev) => [...prev.slice(-40), { id: `${Date.now()}-${Math.random()}`, role, text }]);
	}

	async function handleUtterance(raw: string, speakOut = true) {
		const text = raw.trim();
		if (!text || busy) return;
		setBusy(true);
		stopSpeaking();
		push("you", text);
		setInterim("");

		try {
			const active = gameRef.current;
			if (active.kind !== "idle") {
				const turn = playTurn(active, text);
				setGame(turn.state);
				if (turn.handled) {
					push("shotgun", turn.reply);
					if (speakOut) await speak(turn.reply);
					appendHistory(text, turn.reply);
					return;
				}
			}

			const routed = inferToolFromUtterance(text);
			let toolBlurb = "";
			let startedGame: GameKind | null = null;

			if (routed) {
				if (routed.name === "start_game") {
					startedGame = (routed.args.kind as GameKind) || "trivia";
				} else {
					toolBlurb = await runTool(routed);
					if (routed.name === "save_note" || routed.name === "list_notes") {
						setNotes(loadNotes());
					}
				}
			}

			if (startedGame) {
				const begun = startGame(startedGame);
				setGame(begun.state);
				push("shotgun", begun.prompt);
				if (speakOut) await speak(begun.prompt);
				appendHistory(text, begun.prompt);
				return;
			}

			if (!isBrainReady()) {
				const reply = offlineReply(text, toolBlurb || undefined);
				push("shotgun", reply);
				if (speakOut) await speak(reply);
				return;
			}

			setStatus("thinking");
			const result = await chat(historyRef.current, text, toolBlurb || undefined);
			let reply = result.text;
			let calls = result.toolCalls;

			if (!calls.length && routed) {
				/* already applied */
			} else if (calls.length) {
				const follow: string[] = [];
				for (const call of calls) {
					if (call.name === "start_game") {
						const kind = (call.args.kind as GameKind) || "trivia";
						const begun = startGame(kind);
						setGame(begun.state);
						follow.push(begun.prompt);
					} else {
						const out = await executeTool(call);
						follow.push(out);
					}
				}
				const woven = await chat(
					[
						...historyRef.current,
						{ role: "user", content: text },
						{ role: "assistant", content: reply || "(calling tools)" },
					],
					"Reply to the driver using these tool results. Keep it short.",
					follow.join("\n"),
				);
				reply = woven.text || follow.join(" ");
				calls = [];
			} else if (toolBlurb && !reply) {
				reply = toolBlurb;
			}

			if (!reply) reply = toolBlurb || "I'm with you — say that another way?";

			push("shotgun", reply);
			appendHistory(text, reply);
			if (speakOut) await speak(reply);
			setStatus("ready");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Something glitched.";
			push("system", message);
			setStatus(isBrainReady() ? "ready" : status === "loading" ? "loading" : "error");
		} finally {
			setBusy(false);
		}
	}

	function appendHistory(userText: string, assistantText: string) {
		const next: ChatTurn[] = [
			...historyRef.current,
			{ role: "user", content: userText },
			{ role: "assistant", content: assistantText },
		];
		historyRef.current = next.slice(-12);
	}

	async function executeTool(call: ToolCall): Promise<string> {
		const out = await runTool(call);
		if (call.name === "save_note" || call.name === "list_notes") setNotes(loadNotes());
		return out;
	}

	async function onMic() {
		if (listening || busy) return;
		setListening(true);
		setInterim("Listening…");
		try {
			const transcript = await listenOnce((partial) => setInterim(partial || "Listening…"));
			setListening(false);
			await handleUtterance(transcript, true);
		} catch (err) {
			setListening(false);
			setInterim("");
			push("system", err instanceof Error ? err.message : "Mic failed.");
		}
	}

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		const value = typed.trim();
		if (!value) return;
		setTyped("");
		void handleUtterance(value, true);
	}

	const statusLabel =
		listening ? "listening"
		: busy || status === "thinking" ? "thinking"
		: status === "loading" ? `loading ${progress}%`
		: status === "ready" ? "local · ready"
		: status === "error" ? "model error"
		: "model asleep";

	return (
		<div style={wrap}>
			<div style={cabin} aria-hidden="true">
				<div style={road} />
				<div style={dashGlow} />
			</div>

			<div style={panel}>
				<header style={header}>
					<div>
						<p style={eyebrow}>Local co-pilot</p>
						<h2 style={brand}>Shotgun</h2>
						<p style={tagline}>Models ship with the app · runtime stays local except lookups & GPS</p>
					</div>
					<div style={gaugeBlock}>
						<div style={gauge}>
							<div
								style={{
									...needle,
									transform: `rotate(${statusAngle(status, listening, busy, progress)}deg)`,
								}}
							/>
							<span style={gaugeLabel}>{statusLabel}</span>
						</div>
					</div>
				</header>

				<div style={actions}>
					{status === "loading" ? (
						<p style={readyChip}>
							Installing {MODEL_LABEL}… {progress}%
							{phase === "cache" ? " (cache)" : ""}
						</p>
					) : status === "ready" || status === "thinking" ? (
						<p style={readyChip}>
							On-device · {voiceName ? `voice: ${voiceName}` : "browser speech"}
						</p>
					) : status === "error" ? (
						<button
							type="button"
							style={primaryBtn}
							onClick={() => {
								setStatus("loading");
								setError("");
								void loadBrain((pct, nextPhase) => {
									setProgress(pct);
									setPhase(nextPhase);
								})
									.then(({ fromCache }) => {
										setStatus("ready");
										push(
											"system",
											fromCache
												? `Loaded from cache · ${MODEL_LABEL}`
												: `Downloaded & cached · ${MODEL_LABEL}`,
										);
									})
									.catch((err) => {
										setStatus("error");
										setError(err instanceof Error ? err.message : "Could not load model.");
									});
							}}
						>
							Retry model download
						</button>
					) : (
						<p style={readyChip}>Starting local model…</p>
					)}
					{error ? <p style={errorText}>{error}</p> : null}
				</div>

				<div style={bodyGrid}>
					<section style={chatPane}>
						<div ref={logRef} style={log}>
							{lines.map((line) => (
								<div
									key={line.id}
									style={{
										...bubble,
										...(line.role === "you" ? bubbleYou
										: line.role === "system" ? bubbleSystem
										: bubbleAi),
									}}
								>
									<span style={who}>
										{line.role === "you" ? "You" : line.role === "system" ? "Dash" : "Shotgun"}
									</span>
									{line.text}
								</div>
							))}
							{interim ? (
								<div style={{ ...bubble, ...bubbleYou, opacity: 0.65 }}>
									<span style={who}>You</span>
									{interim}
								</div>
							) : null}
						</div>

						<div style={pttWrap}>
							<button
								type="button"
								style={{
									...ptt,
									...(listening ? pttHot : null),
									...(busy && !listening ? { opacity: 0.55 } : null),
								}}
								onClick={() => void onMic()}
								disabled={!voiceOk || busy}
								aria-label="Hold conversation — tap to talk"
							>
								<span style={pttRing} />
								<span style={pttCore}>{listening ? "Listening" : "Tap to talk"}</span>
							</button>
							{!voiceOk ? <p style={hint}>Voice APIs unavailable — type below instead.</p> : null}
						</div>

						<form onSubmit={onSubmit} style={form}>
							<input
								style={input}
								value={typed}
								onChange={(e) => setTyped(e.target.value)}
								placeholder="Or type while parked…"
								disabled={busy}
							/>
							<button type="submit" style={sendBtn} disabled={busy || !typed.trim()}>
								Send
							</button>
						</form>

						<div style={chips}>
							{SUGGESTIONS.map((s) => (
								<button
									key={s}
									type="button"
									style={chip}
									disabled={busy}
									onClick={() => void handleUtterance(s, true)}
								>
									{s}
								</button>
							))}
						</div>
					</section>

					<aside style={side}>
						<div style={sideCard}>
							<p style={sideTitle}>Glovebox notes</p>
							{notes.length === 0 ? (
								<p style={sideEmpty}>Say “note: …” and I’ll keep it here.</p>
							) : (
								<ul style={noteList}>
									{notes.slice(0, 6).map((n) => (
										<li key={n.id} style={noteItem}>
											{n.text}
										</li>
									))}
								</ul>
							)}
						</div>
						<div style={sideCard}>
							<p style={sideTitle}>Game</p>
							<p style={sideEmpty}>{gameLabel(game)}</p>
							<div style={gameRow}>
								{(["trivia", "word_chain", "twenty_questions", "rhyme"] as GameKind[]).map((kind) => (
									<button
										key={kind}
										type="button"
										style={chip}
										disabled={busy}
										onClick={() => void handleUtterance(gameStartPhrase(kind), true)}
									>
										{kind.replace("_", " ")}
									</button>
								))}
							</div>
						</div>
						<div style={sideCard}>
							<p style={sideTitle}>Data diet</p>
							<p style={sideEmpty}>
								Chat, mic, and voice run on-device after install. Mobile data only for optional Wikipedia lookups and GPS reverse-geocode — not for conversation.
							</p>
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}

function gameStartPhrase(kind: GameKind): string {
	if (kind === "trivia") return "Play trivia";
	if (kind === "word_chain") return "Word chain";
	if (kind === "twenty_questions") return "Twenty questions";
	return "Play a rhyme game";
}

function statusAngle(status: BrainStatus, listening: boolean, busy: boolean, progress: number): number {
	if (listening) return 48;
	if (busy || status === "thinking") return 28;
	if (status === "loading") return -50 + progress * 0.9;
	if (status === "ready") return 12;
	if (status === "error") return -56;
	return -40;
}

const wrap: CSSProperties = {
	position: "relative",
	overflow: "hidden",
	borderTop: "1px solid #1c2a32",
	background: "#0c1418",
	color: "#e7eef2",
	fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
	minHeight: "70vh",
};

const cabin: CSSProperties = {
	position: "absolute",
	inset: 0,
	pointerEvents: "none",
	background:
		"radial-gradient(120% 80% at 50% -10%, #243846 0%, transparent 55%), linear-gradient(180deg, #101a20 0%, #0a1014 55%, #070b0e 100%)",
};

const road: CSSProperties = {
	position: "absolute",
	left: "50%",
	bottom: "-8%",
	width: "140%",
	height: "42%",
	transform: "translateX(-50%) perspective(420px) rotateX(58deg)",
	background:
		"repeating-linear-gradient(90deg, transparent 0 46px, rgba(232,165,75,0.18) 46px 48px), linear-gradient(180deg, #152029, #0d1318)",
	opacity: 0.55,
	animation: "shotgun-road 1.8s linear infinite",
};

const dashGlow: CSSProperties = {
	position: "absolute",
	inset: "auto 10% 18% 10%",
	height: "28%",
	background: "radial-gradient(ellipse at center, rgba(232,165,75,0.16), transparent 70%)",
	filter: "blur(8px)",
};

const panel: CSSProperties = {
	position: "relative",
	zIndex: 1,
	padding: "1.25rem 1.5rem 1.75rem",
	maxWidth: 1080,
	margin: "0 auto",
};

const header: CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	gap: "1.5rem",
	alignItems: "end",
	flexWrap: "wrap",
};

const eyebrow: CSSProperties = {
	margin: 0,
	fontSize: 11,
	letterSpacing: "0.18em",
	textTransform: "uppercase",
	color: "#e8a54b",
};

const brand: CSSProperties = {
	margin: "0.35rem 0 0",
	fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif',
	fontWeight: 700,
	fontSize: "clamp(2.8rem, 8vw, 4.5rem)",
	lineHeight: 0.85,
	letterSpacing: "0.02em",
	color: "#f4f7f8",
};

const tagline: CSSProperties = {
	margin: "0.75rem 0 0",
	maxWidth: 360,
	fontSize: 13,
	lineHeight: 1.45,
	color: "#8fa3ad",
	fontFamily: '"Libre Baskerville", Georgia, serif',
};

const gaugeBlock: CSSProperties = { flex: "0 0 auto" };

const gauge: CSSProperties = {
	position: "relative",
	width: 118,
	height: 118,
	borderRadius: "50%",
	border: "2px solid #314652",
	background:
		"conic-gradient(from 220deg, #e8a54b 0deg, #e8a54b 100deg, #1a2730 100deg, #1a2730 280deg, #e8a54b 280deg)",
	boxShadow: "inset 0 0 0 10px #0e161b, 0 0 24px rgba(232,165,75,0.15)",
	display: "grid",
	placeItems: "center",
};

const needle: CSSProperties = {
	position: "absolute",
	width: 3,
	height: 42,
	background: "#f3c57a",
	bottom: "50%",
	left: "calc(50% - 1.5px)",
	transformOrigin: "bottom center",
	borderRadius: 2,
	transition: "transform 0.45s cubic-bezier(.2,.8,.2,1)",
	boxShadow: "0 0 8px rgba(232,165,75,0.55)",
};

const gaugeLabel: CSSProperties = {
	position: "relative",
	zIndex: 1,
	marginTop: 28,
	fontSize: 10,
	letterSpacing: "0.06em",
	textTransform: "uppercase",
	color: "#d7e2e8",
	textAlign: "center",
	maxWidth: 78,
	lineHeight: 1.2,
};

const actions: CSSProperties = { marginTop: "1.25rem" };

const primaryBtn: CSSProperties = {
	appearance: "none",
	border: "1px solid #e8a54b",
	background: "linear-gradient(180deg, #2a2114, #1a160f)",
	color: "#f6d7a2",
	padding: "0.7rem 1rem",
	fontFamily: "inherit",
	fontSize: 12,
	letterSpacing: "0.04em",
	cursor: "pointer",
};

const readyChip: CSSProperties = {
	margin: 0,
	fontSize: 12,
	color: "#9ec4a8",
};

const errorText: CSSProperties = {
	margin: "0.5rem 0 0",
	color: "#f0a0a0",
	fontSize: 12,
};

const bodyGrid: CSSProperties = {
	marginTop: "1.25rem",
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
	gap: "1rem",
	alignItems: "start",
};

const chatPane: CSSProperties = {
	minWidth: 0,
	display: "flex",
	flexDirection: "column",
	gap: "0.85rem",
};

const log: CSSProperties = {
	height: 320,
	overflowY: "auto",
	padding: "0.85rem",
	background: "rgba(8,12,15,0.72)",
	border: "1px solid #24333c",
	display: "flex",
	flexDirection: "column",
	gap: "0.65rem",
};

const bubble: CSSProperties = {
	padding: "0.65rem 0.75rem",
	fontSize: 13,
	lineHeight: 1.45,
	maxWidth: "92%",
};

const bubbleYou: CSSProperties = {
	alignSelf: "flex-end",
	background: "#1a2a33",
	borderLeft: "2px solid #6f8b99",
};

const bubbleAi: CSSProperties = {
	alignSelf: "flex-start",
	background: "#1b1912",
	borderLeft: "2px solid #e8a54b",
};

const bubbleSystem: CSSProperties = {
	alignSelf: "center",
	background: "transparent",
	border: "1px dashed #314652",
	color: "#8fa3ad",
	fontSize: 12,
};

const who: CSSProperties = {
	display: "block",
	fontSize: 10,
	letterSpacing: "0.14em",
	textTransform: "uppercase",
	marginBottom: 4,
	color: "#e8a54b",
};

const pttWrap: CSSProperties = {
	display: "grid",
	justifyItems: "center",
	gap: "0.4rem",
};

const ptt: CSSProperties = {
	position: "relative",
	width: 148,
	height: 148,
	borderRadius: "50%",
	border: "1px solid #e8a54b",
	background: "radial-gradient(circle at 35% 30%, #3a2c16, #15110c 70%)",
	color: "#f6d7a2",
	cursor: "pointer",
	fontFamily: '"Barlow Condensed", sans-serif',
	fontSize: 22,
	letterSpacing: "0.08em",
	textTransform: "uppercase",
	boxShadow: "0 0 0 6px rgba(232,165,75,0.08), 0 12px 30px rgba(0,0,0,0.35)",
};

const pttHot: CSSProperties = {
	boxShadow: "0 0 0 10px rgba(232,165,75,0.18), 0 0 36px rgba(232,165,75,0.35)",
	animation: "shotgun-pulse 1.1s ease-in-out infinite",
};

const pttRing: CSSProperties = {
	position: "absolute",
	inset: 10,
	borderRadius: "50%",
	border: "1px dashed rgba(232,165,75,0.35)",
};

const pttCore: CSSProperties = { position: "relative", zIndex: 1 };

const hint: CSSProperties = { margin: 0, fontSize: 11, color: "#8fa3ad" };

const form: CSSProperties = { display: "flex", gap: "0.5rem" };

const input: CSSProperties = {
	flex: 1,
	minWidth: 0,
	background: "#0e1519",
	border: "1px solid #314652",
	color: "#e7eef2",
	padding: "0.7rem 0.8rem",
	fontFamily: "inherit",
	fontSize: 13,
};

const sendBtn: CSSProperties = {
	appearance: "none",
	border: "1px solid #314652",
	background: "#172229",
	color: "#d7e2e8",
	padding: "0 1rem",
	fontFamily: "inherit",
	fontSize: 12,
	cursor: "pointer",
};

const chips: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "0.4rem",
};

const chip: CSSProperties = {
	appearance: "none",
	border: "1px solid #314652",
	background: "transparent",
	color: "#b7c6ce",
	padding: "0.35rem 0.55rem",
	fontFamily: "inherit",
	fontSize: 11,
	cursor: "pointer",
};

const side: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "0.75rem",
};

const sideCard: CSSProperties = {
	border: "1px solid #24333c",
	background: "rgba(10,14,17,0.8)",
	padding: "0.85rem",
};

const sideTitle: CSSProperties = {
	margin: 0,
	fontSize: 11,
	letterSpacing: "0.16em",
	textTransform: "uppercase",
	color: "#e8a54b",
};

const sideEmpty: CSSProperties = {
	margin: "0.55rem 0 0",
	fontSize: 12,
	lineHeight: 1.45,
	color: "#8fa3ad",
};

const noteList: CSSProperties = {
	listStyle: "none",
	margin: "0.55rem 0 0",
	padding: 0,
	display: "flex",
	flexDirection: "column",
	gap: "0.4rem",
};

const noteItem: CSSProperties = {
	fontSize: 12,
	lineHeight: 1.4,
	padding: "0.4rem 0.5rem",
	background: "#141c21",
	borderLeft: "2px solid #60828e",
};

const gameRow: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "0.35rem",
	marginTop: "0.55rem",
};

if (typeof document !== "undefined") {
	const id = "shotgun-keyframes";
	if (!document.getElementById(id)) {
		const style = document.createElement("style");
		style.id = id;
		style.textContent = `
@keyframes shotgun-road {
  from { background-position: 0 0, 0 0; }
  to { background-position: 48px 0, 0 0; }
}
@keyframes shotgun-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.18); }
}
@media (max-width: 820px) {
  /* grid stacks via normal flow if columns collapse — handled below in resize observer free form */
}
`;
		document.head.appendChild(style);
	}
}
