import { useEffect, useRef, useState, type FormEvent } from "react";
import {
	FRIDGE,
	ROOM_IDS,
	ROOMS,
	applyCommand,
	initialHome,
	roomById,
	tickVacuum,
	toggleLight,
	vacuumActiveRoom,
	vacuumProgress,
	type HomeState,
} from "./home";
import HousePlan from "./HousePlan";
import { listenOnce, speak, speechSupported } from "./speech";

const SUGGESTIONS = [
	"Turn on the kitchen lights",
	"Vacuum the living room",
	"Clean all rooms",
	"Turn on the TV",
	"Preheat the oven to 200",
	"What's in the fridge?",
	"Do we have eggs?",
];

export default function Home() {
	const [home, setHome] = useState<HomeState>(() => initialHome());
	const [listening, setListening] = useState(false);
	const [interimHint, setInterimHint] = useState("");
	const [typed, setTyped] = useState("");
	const [now, setNow] = useState(() => Date.now());
	const [voiceOk] = useState(() => speechSupported());
	const homeRef = useRef(home);
	homeRef.current = home;

	useEffect(() => {
		if (home.vacuum.mode === "idle") return;
		const id = window.setInterval(() => {
			const stamped = Date.now();
			setNow(stamped);
			setHome((prev) => tickVacuum(prev, stamped));
		}, 120);
		return () => window.clearInterval(id);
	}, [home.vacuum.mode]);

	function runCommand(raw: string, say = true) {
		const result = applyCommand(homeRef.current, raw);
		setHome(result.state);
		setInterimHint("");
		if (say && result.speak) speak(result.reply);
	}

	async function onMic() {
		if (listening) return;
		setListening(true);
		setInterimHint("Listening…");
		try {
			const transcript = await listenOnce();
			setInterimHint(transcript);
			runCommand(transcript, true);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Listen failed.";
			setHome((prev) => ({
				...prev,
				lastReply: message,
				log: [message, ...prev.log].slice(0, 8),
			}));
			setInterimHint("");
		} finally {
			setListening(false);
		}
	}

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		const value = typed.trim();
		if (!value) return;
		runCommand(value, true);
		setTyped("");
	}

	const activeVacuum = vacuumActiveRoom(home);
	const progress = vacuumProgress(home, now);

	const vacuumLabel =
		home.vacuum.mode === "idle"
			? "docked"
			: home.vacuum.mode === "room"
				? `cleaning ${roomById(home.vacuum.room).label}`
				: `cleaning ${roomById(ROOM_IDS[home.vacuum.queue]!).label} (${home.vacuum.queue + 1}/5)`;

	const lightsLabel =
		ROOMS.filter((room) => home.lights[room.id])
			.map((room) => room.label)
			.join(", ") || "all off";

	return (
		<div style={{ padding: "0 1.5rem 1.25rem" }}>
			<style>{`
				@keyframes home-pulse {
					0%, 100% { opacity: 0.55; transform: scale(1); }
					50% { opacity: 1; transform: scale(1.08); }
				}
				.homespeak-layout {
					display: grid;
					grid-template-columns: minmax(0, 1fr) minmax(28rem, 38rem);
					gap: 1.25rem;
					align-items: stretch;
					height: calc(100dvh - 20rem);
					min-height: 22rem;
				}
				.homespeak-house {
					min-width: 0;
					min-height: 0;
					height: 100%;
					overflow: hidden;
					border: 1px solid rgba(28, 36, 38, 0.15);
					border-radius: 2px;
					background: #c5d4b8;
					box-shadow: 0 12px 30px rgba(28, 36, 38, 0.08);
				}
				.homespeak-controls {
					display: flex;
					flex-direction: column;
					gap: 0.75rem;
					min-height: 0;
					overflow-y: auto;
				}
				@media (max-width: 800px) {
					.homespeak-layout {
						grid-template-columns: 1fr;
						height: auto;
						min-height: 0;
					}
					.homespeak-house {
						height: min(50vh, 22rem);
					}
				}
			`}</style>

			<div className="homespeak-layout">
				<div className="homespeak-house">
					<HousePlan
						home={home}
						activeVacuum={activeVacuum}
						progress={progress}
						onToggleLight={(room) => setHome((prev) => toggleLight(prev, room))}
					/>
				</div>

				<aside className="homespeak-controls">
					<div className="rounded-sm border border-[#1c2426]/15 bg-[#f3eee4] p-4">
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={onMic}
								disabled={listening || !voiceOk}
								className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#1c2426]/25 bg-[#1c2426] text-[#f3eee4] transition enabled:hover:bg-[#2a3336] disabled:cursor-not-allowed disabled:opacity-50"
								aria-label={listening ? "Listening" : "Start voice command"}
							>
								{listening ? (
									<span
										aria-hidden
										className="absolute inset-0 rounded-full border border-[#8fd3c2]/70"
										style={{ animation: "home-pulse 1.1s ease-in-out infinite" }}
									/>
								) : null}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
									<path
										d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
										fill="currentColor"
									/>
									<path
										d="M7 11a5 5 0 0 0 10 0M12 16v4M9 20h6"
										stroke="currentColor"
										strokeWidth="1.7"
										strokeLinecap="round"
									/>
								</svg>
							</button>
							<div className="min-w-0">
								<p className="font-meta text-[10px] tracking-[0.16em] text-[#1c2426]/55 uppercase">
									Assistant
								</p>
								<p className="line-clamp-3 text-[15px] leading-snug text-[#1c2426]">
									{interimHint || home.lastReply}
								</p>
								{!voiceOk ? (
									<p className="mt-1 text-xs text-[#8a4b2e]">Type commands — mic needs Chrome/Edge.</p>
								) : null}
							</div>
						</div>

						<form onSubmit={onSubmit} className="mt-3 flex gap-2">
							<input
								value={typed}
								onChange={(event) => setTyped(event.target.value)}
								placeholder="Or type a command…"
								className="min-w-0 flex-1 border border-[#1c2426]/20 bg-white/70 px-3 py-2 text-sm text-[#1c2426] outline-none placeholder:text-[#1c2426]/35 focus:border-[#1c2426]/45"
							/>
							<button
								type="submit"
								className="border border-[#1c2426]/25 bg-[#1c2426] px-3 py-2 text-xs tracking-wide text-[#f3eee4] uppercase hover:bg-[#2a3336]"
							>
								Send
							</button>
						</form>
					</div>

					<div className="rounded-sm border border-[#1c2426]/15 bg-[#f7f3eb] p-4">
						<p className="font-meta text-[10px] tracking-[0.16em] text-[#1c2426]/55 uppercase">
							Try saying
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{SUGGESTIONS.map((line) => (
								<button
									key={line}
									type="button"
									onClick={() => runCommand(line, true)}
									className="border border-[#1c2426]/15 bg-white/60 px-2.5 py-1.5 text-left text-xs text-[#1c2426]/80 hover:border-[#1c2426]/35"
								>
									{line}
								</button>
							))}
						</div>
					</div>

					<div className="rounded-sm border border-[#1c2426]/15 bg-[#f7f3eb] px-4 py-3 text-sm leading-relaxed text-[#1c2426]/85">
						<p>
							<span className="text-[#1c2426]/45">Lights</span> {lightsLabel}
						</p>
						<p>
							<span className="text-[#1c2426]/45">TV</span> {home.tvOn ? "on" : "off"}
							<span className="text-[#1c2426]/25"> · </span>
							<span className="text-[#1c2426]/45">Oven</span>{" "}
							{home.ovenTemp ? `${home.ovenTemp}°C` : "off"}
						</p>
						<p>
							<span className="text-[#1c2426]/45">Vacuum</span> {vacuumLabel}
							<span className="text-[#1c2426]/25"> · </span>
							<span className="text-[#1c2426]/45">Fridge</span> {home.fridgeOpen ? "open" : "closed"}
						</p>
					</div>

					{home.fridgeOpen ? (
						<div className="rounded-sm border border-[#1c2426]/15 bg-[#e7eef0] p-3">
							<div className="flex items-center justify-between gap-3">
								<p className="font-meta text-[10px] tracking-[0.16em] text-[#1c2426]/55 uppercase">
									Fridge
								</p>
								<button
									type="button"
									onClick={() => runCommand("close the fridge", false)}
									className="text-[11px] text-[#1c2426]/60 underline-offset-2 hover:underline"
								>
									Close
								</button>
							</div>
							<ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[#1c2426]/85">
								{FRIDGE.map((item) => (
									<li key={item.name}>
										<span className="text-[#1c2426]">{item.name}</span>
										<span className="text-[#1c2426]/50"> · {item.qty}</span>
									</li>
								))}
							</ul>
						</div>
					) : null}
				</aside>
			</div>
		</div>
	);
}
