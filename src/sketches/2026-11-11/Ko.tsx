import { useEffect, useRef, useState } from "react";
import {
	barsToSeconds,
	delay,
	emptyPattern,
	emptySlots,
	formatClock,
	formatHz,
	formatSemitone,
	Ko as KoEngine,
	loadYouTube,
	PADS,
	PAD_KEYS,
	SLOTS,
	padFromCode,
	paintSample,
	pitchToRate,
	SampleError,
	STEPS,
	toneToHz,
	youtubeId,
	youtubeStart,
	type ListenMode,
	type PlayMode,
	type YouTubePlayer,
} from "./ko";
import {
	clearSession,
	decodeSong,
	encodeSong,
	loadSession,
	saveSession,
	type SongRecord,
} from "./session";

const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function nearestRate(rate: number): number {
	return YT_RATES.reduce((best, item) =>
		Math.abs(item - rate) < Math.abs(best - rate) ? item : best,
	);
}

async function waitUntilNear(player: YouTubePlayer, target: number) {
	const began = performance.now();
	while (performance.now() - began < 1200) {
		try {
			if (Math.abs(player.getCurrentTime() - target) < 0.4) return;
		} catch {
			return;
		}
		await delay(40);
	}
}

async function ensurePlaying(player: YouTubePlayer): Promise<boolean> {
	try {
		player.playVideo();
	} catch {
		return false;
	}
	const began = performance.now();
	while (performance.now() - began < 4000) {
		try {
			if (player.getPlayerState() === 1) return true;
		} catch {
			return false;
		}
		await delay(50);
	}
	try {
		return player.getPlayerState() === 1;
	} catch {
		return false;
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function quantize(value: number, step: number): number {
	const next = Math.round(value / step) * step;
	const places = step < 1 ? 2 : 0;
	return Number(next.toFixed(places));
}

function Knob({
	label,
	value,
	min,
	max,
	step,
	rest,
	display,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	rest: number;
	display: string;
	onChange: (value: number) => void;
}) {
	const drag = useRef<{ y: number; value: number } | null>(null);
	const angle = -135 + ((value - min) / (max - min)) * 270;

	function commit(next: number) {
		onChange(clamp(quantize(next, step), min, max));
	}

	return (
		<div className="flex flex-col items-center gap-1">
			<div
				role="slider"
				tabIndex={0}
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={value}
				aria-valuetext={display}
				aria-label={label}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					drag.current = { y: event.clientY, value };
				}}
				onPointerMove={(event) => {
					const start = drag.current;
					if (!start) return;
					const dy = start.y - event.clientY;
					commit(start.value + (dy / 140) * (max - min));
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				onPointerCancel={() => {
					drag.current = null;
				}}
				onDoubleClick={() => onChange(rest)}
				onKeyDown={(event) => {
					const dir =
						event.key === "ArrowUp" || event.key === "ArrowRight"
							? 1
							: event.key === "ArrowDown" || event.key === "ArrowLeft"
								? -1
								: 0;
					if (!dir) return;
					event.preventDefault();
					commit(value + dir * step * (event.shiftKey ? 5 : 1));
				}}
				className="relative size-14 cursor-ns-resize touch-none rounded-full bg-[radial-gradient(circle_at_35%_30%,#4a4a4a,#1b1b1b_62%,#0a0a0a)] shadow-[0_2px_0_#000,inset_0_1px_0_rgba(255,255,255,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-[#ffb25e]"
			>
				<span className="absolute inset-1" style={{ transform: `rotate(${angle}deg)` }}>
					<span className="absolute top-0.5 left-1/2 h-3 w-0.5 -translate-x-1/2 rounded-full bg-[#ffb25e]" />
				</span>
			</div>
			<span className="text-[10px] tracking-wider text-white/45 uppercase">{label}</span>
			<span className="font-mono text-[10px] text-[#ffb25e] tabular-nums">{display}</span>
		</div>
	);
}

function Choice<T extends string | number>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-[10px] tracking-wider text-white/40 uppercase">{label}</span>
			<div className="flex rounded-full bg-black/40 p-0.5">
				{options.map((option) => (
					<button
						key={String(option.value)}
						type="button"
						aria-pressed={option.value === value}
						onClick={() => onChange(option.value)}
						className={`flex-1 rounded-full px-2 py-1 text-[10px] tracking-wide uppercase ${
							option.value === value
								? "bg-[#ffb25e] text-[#1a120c]"
								: "text-white/55 hover:text-white/80"
						}`}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

export default function Ko() {
	const engineRef = useRef<KoEngine | null>(null);
	const playerRef = useRef<YouTubePlayer | null>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const aliveRef = useRef(true);
	const recordingRef = useRef(false);
	const cueingRef = useRef(false);
	const playheadRef = useRef(-1);
	const skipClick = useRef(false);
	const hotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const onPadRef = useRef<(pad: number) => void>(() => {});
	const togglePlayRef = useRef<() => void>(() => {});
	const onCueRef = useRef<(pad: number) => void>(() => {});
	const epoch = useRef(0);
	const dirty = useRef(false);
	const skipSave = useRef(true);

	const [url, setUrl] = useState("");
	const [videoId, setVideoId] = useState<string | null>(null);
	const [ready, setReady] = useState(false);
	const [duration, setDuration] = useState(0);
	const [scrub, setScrub] = useState(0);
	const [previewing, setPreviewing] = useState(false);
	const [seen, setSeen] = useState(false);
	const [listen, setListen] = useState<ListenMode>("tab");
	const [bars, setBars] = useState(1);
	const [mode, setMode] = useState<PlayMode>("chop");
	const [bpm, setBpm] = useState(120);
	const [swing, setSwing] = useState(0);
	const [tone, setTone] = useState(1);
	const [pitch, setPitch] = useState(0.5);
	const [transpose, setTranspose] = useState(0);
	const [pattern, setPattern] = useState(emptyPattern);
	const [selected, setSelected] = useState(0);
	const [slot, setSlot] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [write, setWrite] = useState(false);
	const [recording, setRecording] = useState(false);
	const [recordUntil, setRecordUntil] = useState<number | null>(null);
	const [takeLength, setTakeLength] = useState(0);
	const [tick, setTick] = useState(0);
	const [playhead, setPlayhead] = useState(-1);
	const [hot, setHot] = useState<number[]>([]);
	const [hasSample, setHasSample] = useState(false);
	const [hasCues, setHasCues] = useState(false);
	const [sampleVersion, setSampleVersion] = useState(0);
	const [status, setStatus] = useState("Paste a YouTube link.");
	const [booted, setBooted] = useState(false);

	playheadRef.current = playhead;

	const engine = engineRef.current;
	if (engine) {
		engine.bpm = bpm;
		engine.swing = swing;
		engine.setCutoff(toneToHz(tone));
		engine.sync(slot, { pattern, mode, pitch, transpose });
	}

	const draft = useRef({
		url,
		scrub,
		bars,
		listen,
		bpm,
		swing,
		tone,
		slot,
		selected,
		pattern,
		mode,
		pitch,
		transpose,
	});
	draft.current = {
		url,
		scrub,
		bars,
		listen,
		bpm,
		swing,
		tone,
		slot,
		selected,
		pattern,
		mode,
		pitch,
		transpose,
	};

	const occupied = engine?.occupied() ?? Array.from({ length: SLOTS }, () => false);

	const sampleSeconds = barsToSeconds(bars, bpm);
	const recordLeft =
		recording && recordUntil != null ? Math.max(0, (recordUntil - tick) / 1000) : 0;

	useEffect(() => {
		const ko = new KoEngine();
		engineRef.current = ko;
		aliveRef.current = true;

		void (async () => {
			let shared: SongRecord | null = null;
			let song: SongRecord | null = null;
			try {
				shared = decodeSong(location.hash);
				song = shared ?? (await loadSession());
			} catch {
				song = null;
			}
			if (!aliveRef.current) return;
			if (song) {
				ko.install(song.slots, song.slot);
				setUrl(song.url);
				setVideoId(youtubeId(song.url));
				setScrub(song.scrub);
				setBars(song.bars);
				setListen(song.listen);
				setBpm(song.bpm);
				setSwing(song.swing);
				setTone(song.tone);
				setSlot(song.slot);
				setSelected(song.selected);
				const tape = song.slots[song.slot];
				if (tape) {
					setPattern(tape.pattern.map((row) => row.slice()));
					setMode(tape.mode);
					setPitch(tape.pitch);
					setTranspose(tape.transpose);
					setHasSample(tape.audio != null);
					setHasCues(tape.audio == null && tape.window != null);
				}
				setSampleVersion((version) => version + 1);
				setStatus(
					shared
						? "Shared song. Play runs the lit slot from the video."
						: "Back where you left it.",
				);
			}
			skipSave.current = true;
			setBooted(true);
		})();

		let frame = 0;
		const loop = () => {
			const now = ko.now();
			if (now != null) {
				const hit = ko.consume(now);
				if (hit) {
					setPlayhead((prev) => (prev === hit.step ? prev : hit.step));
					if (hit.pads.length > 0) {
						setHot(hit.pads);
						if (hotTimer.current != null) clearTimeout(hotTimer.current);
						hotTimer.current = setTimeout(() => setHot([]), 100);
						if (!ko.hasBuffer()) {
							const pad = hit.pads[hit.pads.length - 1];
							if (pad != null) onCueRef.current(pad);
						}
					}
				}
			}
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);

		return () => {
			aliveRef.current = false;
			cancelAnimationFrame(frame);
			if (hotTimer.current != null) clearTimeout(hotTimer.current);
			if (cueTimer.current != null) clearTimeout(cueTimer.current);
			ko.close();
			engineRef.current = null;
		};
	}, []);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount || !videoId) return;
		let player: YouTubePlayer | null = null;
		let cancelled = false;
		mount.replaceChildren();
		setReady(false);

		void (async () => {
			try {
				await Promise.race([
					loadYouTube(),
					delay(12000).then(() => {
						if (!window.YT?.Player) throw new Error("youtube-timeout");
					}),
				]);
			} catch {
				if (!cancelled) setStatus("YouTube didn’t load. Check the connection.");
				return;
			}
			if (cancelled || !mount.isConnected || !window.YT) return;
			const slot = document.createElement("div");
			mount.appendChild(slot);
			player = new window.YT.Player(slot, {
				videoId,
				width: "100%",
				height: "100%",
				playerVars: {
					autoplay: 0,
					controls: 0,
					disablekb: 1,
					fs: 0,
					modestbranding: 1,
					rel: 0,
					playsinline: 1,
					iv_load_policy: 3,
					origin: window.location.origin,
				},
				events: {
					onReady: (event) => {
						if (cancelled) return;
						playerRef.current = event.target;
						const length = event.target.getDuration();
						if (length > 0) setDuration(length);
						setReady(true);
						setStatus((current) =>
							current === "Loading the video." || current === "Paste a YouTube link."
								? "Find a moment, then sample."
								: current,
						);
					},
					onStateChange: (event) => {
						if (cancelled) return;
						const length = event.target.getDuration();
						if (length > 0) setDuration(length);
						if (recordingRef.current || cueingRef.current) return;
						setPreviewing(event.data === 1);
					},
					onError: (event) => {
						if (cancelled) return;
						const blocked = event.data === 101 || event.data === 150;
						setReady(false);
						setStatus(
							blocked ? "This video can’t be embedded. Try another." : "That video didn’t load.",
						);
					},
				},
			});
		})();

		return () => {
			cancelled = true;
			playerRef.current = null;
			try {
				player?.destroy();
			} catch {
				/* player already gone */
			}
			mount.replaceChildren();
		};
	}, [videoId]);

	useEffect(() => {
		if (!previewing || recording) return;
		const id = window.setInterval(() => {
			try {
				const time = playerRef.current?.getCurrentTime();
				if (time != null) setScrub(time);
			} catch {
				/* player gone */
			}
		}, 200);
		return () => window.clearInterval(id);
	}, [previewing, recording]);

	useEffect(() => {
		if (!recording) return;
		const id = window.setInterval(() => setTick(performance.now()), 100);
		return () => window.clearInterval(id);
	}, [recording]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !hasSample) return;
		const paint = () => {
			paintSample(canvas, engineRef.current?.audioBuffer() ?? null, selected, mode);
		};
		paint();
		const observer = new ResizeObserver(paint);
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [hasSample, sampleVersion, selected, mode, slot]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target;
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
			if (event.code === "Space" && !event.repeat) {
				event.preventDefault();
				togglePlayRef.current();
				return;
			}
			if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
			const pad = padFromCode(event.code);
			if (pad == null) return;
			event.preventDefault();
			onPadRef.current(pad);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		if (!booted) return;
		if (skipSave.current) {
			skipSave.current = false;
			return;
		}
		if (previewing || recording) return;
		dirty.current = true;
		const ticket = epoch.current;
		const timer = window.setTimeout(() => {
			if (ticket !== epoch.current || !dirty.current) return;
			const ko = engineRef.current;
			if (!ko) return;
			const snap = draft.current;
			ko.sync(snap.slot, {
				pattern: snap.pattern,
				mode: snap.mode,
				pitch: snap.pitch,
				transpose: snap.transpose,
			});
			void saveSession({
				url: snap.url,
				scrub: snap.scrub,
				bars: snap.bars,
				listen: snap.listen,
				bpm: snap.bpm,
				swing: snap.swing,
				tone: snap.tone,
				slot: snap.slot,
				selected: snap.selected,
				slots: ko.capture(),
			}).catch(() => undefined);
			if (location.hash.startsWith("#song=")) {
				history.replaceState(null, "", `${location.pathname}${location.search}`);
			}
		}, 400);
		return () => window.clearTimeout(timer);
	}, [
		booted,
		previewing,
		recording,
		url,
		scrub,
		bars,
		listen,
		bpm,
		swing,
		tone,
		slot,
		selected,
		pattern,
		mode,
		pitch,
		transpose,
		sampleVersion,
	]);

	useEffect(() => {
		if (!booted) return;
		const flush = () => {
			if (!dirty.current) return;
			const ko = engineRef.current;
			if (!ko) return;
			const snap = draft.current;
			ko.sync(snap.slot, {
				pattern: snap.pattern,
				mode: snap.mode,
				pitch: snap.pitch,
				transpose: snap.transpose,
			});
			void saveSession({
				url: snap.url,
				scrub: snap.scrub,
				bars: snap.bars,
				listen: snap.listen,
				bpm: snap.bpm,
				swing: snap.swing,
				tone: snap.tone,
				slot: snap.slot,
				selected: snap.selected,
				slots: ko.capture(),
			}).catch(() => undefined);
		};
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	}, [booted]);

	function flash(pads: number[]) {
		setHot(pads);
		if (hotTimer.current != null) clearTimeout(hotTimer.current);
		hotTimer.current = setTimeout(() => setHot([]), 110);
	}

	function silenceVideo() {
		cueingRef.current = false;
		if (cueTimer.current != null) clearTimeout(cueTimer.current);
		cueTimer.current = null;
		try {
			playerRef.current?.pauseVideo();
		} catch {
			/* player gone */
		}
		if (aliveRef.current) setPreviewing(false);
	}

	function playCue(pad: number) {
		const player = playerRef.current;
		const ko = engineRef.current;
		if (!player || !ko) return;
		const cue = ko.cueFor(pad);
		if (!cue) return;
		const rate = nearestRate(ko.rateFor(pad));
		cueingRef.current = true;
		try {
			player.unMute();
			player.setVolume(100);
			player.setPlaybackRate(rate);
			player.seekTo(cue.start, true);
			player.playVideo();
		} catch {
			cueingRef.current = false;
			return;
		}
		if (cueTimer.current != null) clearTimeout(cueTimer.current);
		cueTimer.current = setTimeout(
			() => {
				cueingRef.current = false;
				try {
					player.pauseVideo();
				} catch {
					/* player gone */
				}
			},
			(cue.duration / rate) * 1000,
		);
	}

	function onPad(pad: number) {
		setSelected(pad);
		const ko = engineRef.current;
		if (!ko) return;
		const step = playheadRef.current;
		if (write && playing && step >= 0) {
			setPattern((prev) => {
				if (prev[pad]?.[step] == null) return prev;
				const next = prev.map((row) => row.slice());
				const row = next[pad];
				if (row) row[step] = !row[step];
				return next;
			});
		}
		if (ko.hasBuffer()) {
			ko.trigger(pad);
			flash([pad]);
			return;
		}
		if (ko.hasCues()) {
			playCue(pad);
			flash([pad]);
			return;
		}
		setStatus(`Sample slot ${slot + 1} first.`);
	}

	function togglePlay() {
		const ko = engineRef.current;
		if (!ko || recordingRef.current) return;
		silenceVideo();
		if (ko.playing) {
			ko.stop();
			setPlaying(false);
			setPlayhead(-1);
			return;
		}
		ko.bpm = bpm;
		ko.swing = swing;
		ko.sync(slot, { pattern, mode, pitch, transpose });
		ko.start();
		setPlaying(true);
	}

	function togglePreview() {
		const player = playerRef.current;
		if (!player || recordingRef.current) return;
		try {
			if (player.getPlayerState() === 1) {
				player.pauseVideo();
				setPreviewing(false);
				return;
			}
			engineRef.current?.stop();
			setPlaying(false);
			setPlayhead(-1);
			setSeen(true);
			player.unMute();
			player.setVolume(100);
			player.seekTo(scrub, true);
			player.playVideo();
			setPreviewing(true);
		} catch {
			setStatus("The video isn’t ready yet.");
		}
	}

	async function sample() {
		if (recordingRef.current) return;
		const ko = engineRef.current;
		const player = playerRef.current;
		if (!ko || !player || !ready) return;

		const total = barsToSeconds(bars, bpm);
		let startAt = scrub;
		try {
			if (previewing) startAt = player.getCurrentTime();
		} catch {
			startAt = scrub;
		}
		startAt = Math.max(0, startAt);
		if (duration > 0 && duration - startAt < 0.4) {
			setStatus("Move earlier. That spot is the end of the video.");
			return;
		}
		const seconds = duration > 0 ? Math.min(total, duration - startAt) : total;
		const slotAtTake = slot;

		recordingRef.current = true;
		setRecording(true);
		setTick(performance.now());
		setTakeLength(seconds + 0.75);
		setRecordUntil(performance.now() + (seconds + 0.75) * 1000);
		if (ko.playing) {
			ko.stop();
			setPlaying(false);
			setPlayhead(-1);
		}
		ko.ensure();
		ko.setOutput(false);
		setSeen(true);
		setScrub(startAt);

		try {
			player.unMute();
			player.setVolume(100);
			player.seekTo(startAt, true);
			player.playVideo();
		} catch {
			/* play again after the share dialog */
		}

		let stream: MediaStream | null = null;
		try {
			setStatus(
				listen === "tab"
					? "Share this tab and include its audio."
					: "Allow the microphone. The video plays out loud.",
			);
			stream = await ko.openInput(listen);
			if (!aliveRef.current) return;

			try {
				player.seekTo(startAt, true);
			} catch {
				/* player gone */
			}
			await waitUntilNear(player, startAt);
			const started = await ensurePlaying(player);
			if (!aliveRef.current) return;
			if (!started) {
				ko.setCues(startAt, seconds, slotAtTake);
				setHasCues(ko.hasCues());
				setStatus("The video didn’t start. Press hear, then sample again.");
				return;
			}

			const buffer = await ko.record(stream, seconds);
			if (!aliveRef.current) return;
			ko.loadRecording(buffer, slotAtTake, { start: startAt, duration: seconds });
			setHasSample(ko.hasBuffer());
			setHasCues(ko.hasCues());
			setSampleVersion((version) => version + 1);
			setStatus(
				mode === "chop"
					? `Slot ${slotAtTake + 1}. Sixteen slices.`
					: `Slot ${slotAtTake + 1}. One shot, tuned across the pads.`,
			);
		} catch (error) {
			if (!aliveRef.current) return;
			const code = error instanceof SampleError ? error.code : "decode";
			if (code === "silent") {
				setStatus(
					listen === "mic"
						? "That take was quiet. Turn the video up and sample again."
						: "That take was quiet. Include tab audio and sample again.",
				);
				return;
			}
			if (code === "no-audio") {
				setStatus("No audio in that share. Turn tab audio on, or use the mic.");
				return;
			}
			ko.setCues(startAt, seconds, slotAtTake);
			setHasCues(ko.hasCues());
			setStatus(
				code === "denied"
					? listen === "tab"
						? "Share closed. Pads play the video from here."
						: "The mic stayed closed. Pads play the video from here."
					: "That take didn’t come through. Pads play the video from here.",
			);
		} finally {
			if (listen === "mic") stream?.getTracks().forEach((track) => track.stop());
			recordingRef.current = false;
			ko.setOutput(true);
			silenceVideo();
			if (!aliveRef.current) return;
			setRecording(false);
			setRecordUntil(null);
		}
	}

	function chooseListen(next: ListenMode) {
		setListen(next);
		if (!hasSample) {
			setStatus(
				next === "mic"
					? "Mic hears the room, so turn the video up."
					: "Tab shares the sound of this page.",
			);
		}
	}

	function chooseSlot(index: number) {
		if (index === slot || recordingRef.current) return;
		const tape = engineRef.current?.read(index);
		if (!tape) return;
		setSlot(index);
		setPattern(tape.pattern);
		setMode(tape.mode);
		setPitch(tape.pitch);
		setTranspose(tape.transpose);
		setHasSample(tape.buffer != null);
		setHasCues(tape.cues != null && tape.buffer == null);
		if (tape.window) setScrub(tape.window.start);
		setSampleVersion((version) => version + 1);
		setStatus(tape.buffer || tape.cues ? `Slot ${index + 1}.` : `Slot ${index + 1} is empty.`);
	}

	function chooseMode(next: PlayMode) {
		setMode(next);
		if (hasSample) {
			setStatus(
				next === "chop" ? "Sixteen slices. Play the pads." : "One shot, tuned across the pads.",
			);
		}
	}

	function toggleStep(step: number) {
		setPattern((prev) => {
			if (prev[selected]?.[step] == null) return prev;
			const next = prev.map((row) => row.slice());
			const row = next[selected];
			if (row) row[step] = !row[step];
			return next;
		});
	}

	function shareSong() {
		const ko = engineRef.current;
		if (!ko) return;
		ko.sync(slot, { pattern, mode, pitch, transpose });
		const slots = ko.capture();
		const song: SongRecord = {
			url,
			scrub,
			bars,
			listen,
			bpm,
			swing,
			tone,
			slot,
			selected,
			slots: slots.map((item) => ({ ...item, audio: null })),
		};
		const hasSong =
			youtubeId(url) != null ||
			slots.some((item) => item.window != null || item.pattern.some((row) => row.some(Boolean)));
		if (!hasSong) {
			setStatus("Add a video or a pattern first.");
			return;
		}
		const link = `${location.origin}${location.pathname}${location.search}#${encodeSong(song)}`;
		dirty.current = true;
		void saveSession({ ...song, slots }).catch(() => undefined);
		void navigator.clipboard.writeText(link).then(
			() => setStatus("Link copied."),
			() => {
				location.hash = encodeSong(song);
				setStatus("The link is in the address bar.");
			},
		);
	}

	function clearSong() {
		epoch.current += 1;
		dirty.current = false;
		skipSave.current = true;
		const ko = engineRef.current;
		ko?.stop();
		ko?.install(emptySlots(), 0);
		setPlaying(false);
		setPlayhead(-1);
		setUrl("");
		setVideoId(null);
		setReady(false);
		setDuration(0);
		setScrub(0);
		setPreviewing(false);
		setSeen(false);
		setListen("tab");
		setBars(1);
		setMode("chop");
		setBpm(120);
		setSwing(0);
		setTone(1);
		setPitch(0.5);
		setTranspose(0);
		setPattern(emptyPattern());
		setSelected(0);
		setSlot(0);
		setWrite(false);
		setHasSample(false);
		setHasCues(false);
		setHot([]);
		setSampleVersion((version) => version + 1);
		setStatus("Cleared.");
		if (location.hash.startsWith("#song=")) {
			history.replaceState(null, "", `${location.pathname}${location.search}`);
		}
		void clearSession().catch(() => undefined);
	}

	onPadRef.current = onPad;
	togglePlayRef.current = togglePlay;
	onCueRef.current = playCue;

	const windowWidth =
		duration > 0 ? (Math.min(sampleSeconds, Math.max(0, duration - scrub)) / duration) * 100 : 0;

	return (
		<div className="mx-auto max-w-4xl px-6 pb-20">
			<div className="mx-auto w-full max-w-md">
				<div
					data-ko
					data-booted={booted ? "true" : "false"}
					data-playing={playing ? "true" : "false"}
					data-recording={recording ? "true" : "false"}
					data-ready={ready ? "true" : "false"}
					data-sample={hasSample ? "true" : "false"}
					data-slot={slot}
					data-playhead={playhead}
					className="relative rounded-[2rem] bg-[#161616] p-4 text-[#f4f1ea] shadow-[0_20px_50px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-5"
				>
					{["top-3 left-3", "top-3 right-3", "bottom-3 left-3", "right-3 bottom-3"].map((spot) => (
						<span
							key={spot}
							className={`absolute size-2 rounded-full bg-[#2a2a2a] shadow-[inset_0_1px_1px_rgba(0,0,0,0.85),0_1px_0_rgba(255,255,255,0.14)] ${spot}`}
						/>
					))}

					<div className="flex items-start justify-between px-1">
						<div>
							<p className="font-space-grotesk text-xl tracking-wide">PO-33</p>
							<p className="text-[10px] tracking-[0.22em] text-white/35 uppercase">Sketch</p>
						</div>
						<div className="flex items-center gap-2">
							<span
								className={`size-2 rounded-full ${
									recording
										? "animate-pulse bg-[#ff4d3a]"
										: playing
											? "bg-[#ffb25e]"
											: "bg-white/20"
								}`}
							/>
							<span className="rounded-sm border border-[#ff7a18] px-1.5 py-0.5 text-[10px] tracking-widest text-[#ff7a18]">
								K.O!
							</span>
						</div>
					</div>

					<label className="mt-4 block px-1">
						<span className="text-[10px] tracking-[0.18em] text-white/40 uppercase">Line in</span>
						<input
							value={url}
							onChange={(event) => {
								const next = event.target.value;
								setUrl(next);
								const id = youtubeId(next);
								if (!id || id === videoId) return;
								setVideoId(id);
								setReady(false);
								setDuration(0);
								setScrub(youtubeStart(next));
								setPreviewing(false);
								setSeen(false);
								setStatus("Loading the video.");
							}}
							placeholder="Paste a YouTube link"
							aria-label="YouTube link"
							spellCheck={false}
							className="mt-1 w-full rounded-full bg-black/50 px-3 py-2 text-sm text-[#f4efe8] ring-1 ring-white/10 outline-none placeholder:text-white/30 focus:ring-[#ffb25e]"
						/>
					</label>

					<div className="mt-3 rounded-xl bg-[#e8873a] p-2 text-[#4a1608] shadow-[inset_0_0_0_1px_rgba(74,22,8,0.18)]">
						<div className="relative h-32 overflow-hidden rounded-md bg-[#c94e12] sm:h-36">
							{videoId ? (
								<div
									ref={mountRef}
									className="absolute inset-0 [&_iframe]:pointer-events-none [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0 [&_iframe]:[filter:grayscale(1)_sepia(1)_saturate(4.5)_hue-rotate(350deg)_brightness(0.82)_contrast(1.05)]"
								/>
							) : null}
							{videoId && !seen ? (
								<img
									src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
									alt=""
									className="pointer-events-none absolute inset-0 h-full w-full object-cover [filter:grayscale(1)_sepia(1)_saturate(4.5)_hue-rotate(350deg)_brightness(0.82)_contrast(1.05)]"
								/>
							) : null}
							{videoId ? null : (
								<div className="absolute inset-0 flex items-center justify-center px-6 text-center font-mono text-[11px] tracking-[0.18em] text-[#5c240c] uppercase">
									Paste a link
								</div>
							)}
							<button
								type="button"
								onClick={togglePreview}
								disabled={!ready || recording}
								className="absolute right-2 bottom-2 z-10 rounded-full bg-[#3a1408]/80 px-2.5 py-1 font-mono text-[10px] tracking-wider text-[#ffd7a8] uppercase disabled:opacity-40"
							>
								{previewing ? "Pause" : "Hear"}
							</button>
						</div>

						<div className="relative mt-2 h-4 rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#3a1408]">
							<div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-[#5c240c]/25" />
							{duration > 0 && windowWidth > 0 ? (
								<div
									className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#5c240c]"
									style={{ left: `${(scrub / duration) * 100}%`, width: `${windowWidth}%` }}
								/>
							) : null}
							<div
								className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3a1408]"
								style={{
									left: `${duration > 0 ? (Math.min(scrub, duration) / duration) * 100 : 0}%`,
								}}
							/>
							<input
								type="range"
								min={0}
								max={Math.max(duration, 1)}
								step={0.01}
								value={Math.min(scrub, Math.max(duration, 1))}
								disabled={!ready || recording}
								aria-label="Start of the sample"
								onChange={(event) => {
									const next = Number(event.target.value);
									setScrub(next);
									try {
										playerRef.current?.seekTo(next, true);
									} catch {
										/* player not ready */
									}
								}}
								className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-default"
							/>
						</div>
						<div className="mt-1 flex justify-between font-mono text-[10px] uppercase">
							<span>{formatClock(scrub)}</span>
							<span>
								{bars} {bars === 1 ? "bar" : "bars"} · {sampleSeconds.toFixed(1)}s
							</span>
						</div>

						{hasSample ? (
							<canvas ref={canvasRef} className="mt-1 block h-10 w-full" aria-hidden="true" />
						) : null}

						<div className="mt-2 font-mono text-[11px] uppercase">
							<div className="flex justify-between gap-3">
								<span>Bpm {Math.round(bpm)}</span>
								<span>Pad {selected + 1}</span>
								<span>
									{mode === "keys"
										? `${formatSemitone(selected + transpose)} st`
										: `×${pitchToRate(pitch).toFixed(2)}`}
								</span>
							</div>
							<p aria-live="polite" data-status={status} className="mt-1 min-h-8 leading-4">
								{recording ? `Sampling ${recordLeft.toFixed(1)}s` : status}
							</p>
							{recording ? (
								<span className="block h-1 overflow-hidden rounded-full bg-[#5c240c]/25">
									<span
										className="block h-full bg-[#5c240c]"
										style={{
											width: `${Math.min(100, Math.max(0, (1 - recordLeft / Math.max(takeLength, 0.1)) * 100))}%`,
										}}
									/>
								</span>
							) : null}
						</div>
					</div>

					<div className="mt-3 grid grid-cols-3 gap-2 px-1">
						<Choice
							label="From"
							value={listen}
							options={[
								{ value: "tab", label: "Tab" },
								{ value: "mic", label: "Mic" },
							]}
							onChange={chooseListen}
						/>
						<Choice
							label="Bars"
							value={bars}
							options={[
								{ value: 1, label: "1" },
								{ value: 2, label: "2" },
								{ value: 4, label: "4" },
							]}
							onChange={setBars}
						/>
						<Choice
							label="Pads"
							value={mode}
							options={[
								{ value: "chop", label: "Chop" },
								{ value: "keys", label: "Keys" },
							]}
							onChange={chooseMode}
						/>
					</div>

					<div className="mt-4 flex items-start justify-around">
						<Knob
							label="Tempo"
							min={70}
							max={180}
							step={1}
							rest={120}
							value={bpm}
							display={`${Math.round(bpm)}`}
							onChange={setBpm}
						/>
						<Knob
							label="Tone"
							min={0}
							max={1}
							step={0.01}
							rest={1}
							value={tone}
							display={formatHz(toneToHz(tone))}
							onChange={setTone}
						/>
						{mode === "keys" ? (
							<Knob
								label="Tune"
								min={-12}
								max={12}
								step={1}
								rest={0}
								value={transpose}
								display={formatSemitone(transpose)}
								onChange={setTranspose}
							/>
						) : (
							<Knob
								label="Pitch"
								min={0}
								max={1}
								step={0.01}
								rest={0.5}
								value={pitch}
								display={`×${pitchToRate(pitch).toFixed(2)}`}
								onChange={setPitch}
							/>
						)}
					</div>

					<div className="mt-4 flex items-stretch gap-2">
						<div className="grid min-w-0 flex-1 grid-cols-4 gap-2">
							{Array.from({ length: PADS }, (_, pad) => {
								const lit = hot.includes(pad);
								const armed = pattern[pad]?.some(Boolean) ?? false;
								return (
									<button
										key={pad}
										type="button"
										data-pad={pad}
										aria-label={`Pad ${pad + 1}`}
										aria-pressed={selected === pad}
										aria-keyshortcuts={PAD_KEYS[pad]}
										onPointerDown={(event) => {
											if (event.button !== 0) return;
											skipClick.current = true;
											onPad(pad);
										}}
										onClick={() => {
											if (skipClick.current) {
												skipClick.current = false;
												return;
											}
											onPad(pad);
										}}
										className={`font-space-grotesk relative flex h-14 flex-col items-center justify-center rounded-xl text-lg shadow-[inset_0_-2px_0_rgba(0,0,0,0.18),0_1px_0_rgba(255,255,255,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-[#ffb25e] ${
											lit
												? "bg-[#ff7a18] text-[#1a120c]"
												: selected === pad
													? "bg-[#ffe0bf] text-[#1a120c] ring-2 ring-[#ff7a18]"
													: hasSample || hasCues
														? "bg-[#f4f1ea] text-[#1a1a1a] hover:bg-white"
														: "bg-[#d4d0c8] text-[#1a1a1a]/45"
										}`}
									>
										{armed ? (
											<span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#e25c16]" />
										) : null}
										{pad + 1}
										{mode === "keys" ? (
											<span className="font-mono text-[9px] tracking-normal opacity-60">
												{formatSemitone(pad + transpose)}
											</span>
										) : null}
									</button>
								);
							})}
						</div>
						<div className="flex w-9 shrink-0 flex-col gap-1" role="group" aria-label="Slots">
							{Array.from({ length: SLOTS }, (_, index) => (
								<button
									key={index}
									type="button"
									data-slot={index}
									aria-label={`Slot ${index + 1}`}
									aria-pressed={slot === index}
									onClick={() => chooseSlot(index)}
									className={`relative min-h-0 flex-1 rounded-md text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#ffb25e] ${
										slot === index
											? "bg-[#ffb25e] text-[#1a120c]"
											: occupied[index]
												? "bg-[#f4f1ea] text-[#1a1a1a]"
												: "bg-white/10 text-white/45 hover:bg-white/20"
									}`}
								>
									{index + 1}
								</button>
							))}
						</div>
					</div>

					<div className="mt-4 grid grid-cols-3 gap-3 px-2">
						<button type="button" onClick={togglePlay} aria-pressed={playing}>
							<span
								className={`mx-auto flex size-14 items-center justify-center rounded-full ${
									playing ? "bg-[#ffb25e] text-[#1a120c]" : "bg-[#f3f0ea] text-[#1a1a1a]"
								}`}
							>
								{playing ? (
									<span className="flex gap-1" aria-hidden="true">
										<span className="h-3 w-1 bg-current" />
										<span className="h-3 w-1 bg-current" />
									</span>
								) : (
									<span
										aria-hidden="true"
										className="ml-0.5 border-y-[6px] border-l-[9px] border-y-transparent border-l-current"
									/>
								)}
							</span>
							<span className="mt-1 block text-center text-[10px] tracking-wider text-white/45 uppercase">
								Play
							</span>
						</button>
						<button
							type="button"
							onClick={() => void sample()}
							disabled={!ready || recording}
							aria-pressed={recording}
							className="disabled:opacity-40"
						>
							<span
								className={`mx-auto flex size-14 items-center justify-center rounded-full bg-[#e23d2b] text-[#1a120c] ${
									recording ? "animate-pulse" : ""
								}`}
							>
								<span className="size-4 rounded-full bg-current" />
							</span>
							<span className="mt-1 block text-center text-[10px] tracking-wider text-white/45 uppercase">
								Sample
							</span>
						</button>
						<button type="button" onClick={() => setWrite((value) => !value)} aria-pressed={write}>
							<span
								className={`mx-auto flex size-14 items-center justify-center rounded-full text-xs tracking-wider uppercase ${
									write ? "bg-[#ffb25e] text-[#1a120c]" : "bg-[#2a2a2a] text-white/70"
								}`}
							>
								W
							</span>
							<span className="mt-1 block text-center text-[10px] tracking-wider text-white/45 uppercase">
								Write
							</span>
						</button>
					</div>

					<label className="mt-4 flex items-center gap-2 px-1 text-[10px] tracking-wider text-white/45 uppercase">
						Swing
						<input
							type="range"
							min={0}
							max={0.4}
							step={0.01}
							value={swing}
							aria-label="Swing"
							onChange={(event) => setSwing(Number(event.target.value))}
							className="min-w-0 flex-1 accent-[#ffb25e]"
						/>
						<span className="w-7 font-mono text-[#ffb25e] tabular-nums">
							{Math.round(swing * 100)}
						</span>
					</label>

					<div className="-mx-1 overflow-x-auto px-1">
						<div
							className="mt-2 flex min-w-[20rem] gap-1"
							role="group"
							aria-label={`Steps for pad ${selected + 1}`}
						>
							{Array.from({ length: STEPS }, (_, step) => {
								const on = pattern[selected]?.[step] ?? false;
								const current = playhead === step;
								return (
									<button
										key={step}
										type="button"
										data-step={step}
										aria-pressed={on}
										aria-label={`Pad ${selected + 1}, step ${step + 1}`}
										onClick={() => toggleStep(step)}
										className={`h-8 min-w-0 flex-1 rounded-sm ${step % 4 === 0 && step !== 0 ? "ml-1" : ""} ${
											on && current
												? "bg-[#fff1df]"
												: on
													? "bg-[#ff7a18]"
													: current
														? "bg-white/40"
														: step % 4 === 0
															? "bg-white/25"
															: "bg-white/10"
										}`}
									/>
								);
							})}
						</div>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
					<p className="max-w-sm leading-5">
						All eight slots play together. The lit one is the track you are editing. Write punches a
						pad onto the lit step. Keys 1–4, q–r, a–f, and z–v play the pads. Space starts and
						stops. Share copies a link to the video, the chops, and the patterns. Refresh keeps the
						recordings in this browser. Clear wipes the song.
					</p>
					<div className="flex gap-3">
						<button type="button" onClick={shareSong} className="underline hover:text-slate-700">
							Share
						</button>
						<button
							type="button"
							onClick={() => setPattern(emptyPattern())}
							className="underline hover:text-slate-700"
						>
							Clear pattern
						</button>
						<button type="button" onClick={clearSong} className="underline hover:text-slate-700">
							Clear
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
