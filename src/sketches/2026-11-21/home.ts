export type RoomId = "living" | "kitchen" | "bedroom" | "bathroom" | "hallway";

export type Room = {
	id: RoomId;
	label: string;
	aliases: string[];
	/** Floor-plan box as percentages of the plan */
	box: { x: number; y: number; w: number; h: number };
};

export type VacuumJob =
	| { mode: "idle" }
	| { mode: "room"; room: RoomId; startedAt: number; endsAt: number }
	| { mode: "all"; queue: number; startedAt: number; endsAt: number };

export type HomeState = {
	lights: Record<RoomId, boolean>;
	tvOn: boolean;
	ovenTemp: number | null;
	vacuum: VacuumJob;
	fridgeOpen: boolean;
	lastHeard: string;
	lastReply: string;
	log: string[];
};

export const ROOMS: Room[] = [
	{
		id: "living",
		label: "Living room",
		aliases: ["living", "living room", "lounge", "sitting room"],
		box: { x: 4, y: 6, w: 46, h: 48 },
	},
	{
		id: "kitchen",
		label: "Kitchen",
		aliases: ["kitchen", "cook"],
		box: { x: 54, y: 6, w: 42, h: 38 },
	},
	{
		id: "hallway",
		label: "Hallway",
		aliases: ["hallway", "hall", "corridor"],
		box: { x: 40, y: 56, w: 20, h: 38 },
	},
	{
		id: "bedroom",
		label: "Bedroom",
		aliases: ["bedroom", "bed room", "master bedroom"],
		box: { x: 4, y: 58, w: 34, h: 36 },
	},
	{
		id: "bathroom",
		label: "Bathroom",
		aliases: ["bathroom", "bath", "washroom", "loo", "toilet"],
		box: { x: 62, y: 48, w: 34, h: 46 },
	},
];

export const ROOM_IDS = ROOMS.map((room) => room.id);

/** Stocked fridge — checked by voice, no network. */
export const FRIDGE: { name: string; aliases: string[]; qty: string }[] = [
	{ name: "eggs", aliases: ["egg", "eggs"], qty: "6" },
	{ name: "milk", aliases: ["milk"], qty: "1 carton" },
	{ name: "butter", aliases: ["butter"], qty: "1 pack" },
	{ name: "cheddar", aliases: ["cheddar", "cheese"], qty: "200 g" },
	{ name: "tomatoes", aliases: ["tomato", "tomatoes"], qty: "4" },
	{ name: "spinach", aliases: ["spinach", "greens"], qty: "1 bag" },
	{ name: "leftover pasta", aliases: ["pasta", "leftover pasta", "leftovers"], qty: "1 box" },
	{ name: "orange juice", aliases: ["juice", "orange juice"], qty: "½ jug" },
	{ name: "yoghurt", aliases: ["yoghurt", "yogurt"], qty: "2 pots" },
];

const ROOM_CLEAN_MS = 4200;
const ALL_CLEAN_MS = 2800;

export function initialHome(): HomeState {
	return {
		lights: { living: false, kitchen: false, bedroom: false, bathroom: false, hallway: false },
		tvOn: false,
		ovenTemp: null,
		vacuum: { mode: "idle" },
		fridgeOpen: false,
		lastHeard: "",
		lastReply: "Say a command, or tap the mic.",
		log: [],
	};
}

export function roomById(id: RoomId): Room {
	return ROOMS.find((room) => room.id === id)!;
}

export function findRoom(text: string): RoomId | null {
	const normalized = normalize(text);
	const ranked = ROOMS.map((room) => {
		const hit = room.aliases.find((alias) => normalized.includes(alias));
		return hit ? { id: room.id, len: hit.length } : null;
	}).filter(Boolean) as { id: RoomId; len: number }[];
	ranked.sort((a, b) => b.len - a.len);
	return ranked[0]?.id ?? null;
}

export function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/[’']/g, "'")
		.replace(/[^a-z0-9'\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function wantsOn(text: string): boolean | null {
	if (/\b(turn|switch|put)\s+(them\s+|it\s+)?off\b|\boff\b|\bkill\b|\bextinguish\b/.test(text)) {
		if (/\b(turn|switch|put)\s+(them\s+|it\s+)?on\b|\bon\b/.test(text) && !/\boff\b/.test(text)) {
			return true;
		}
		if (/\boff\b/.test(text)) return false;
	}
	if (/\b(turn|switch|put)\s+(them\s+|it\s+)?on\b|\bswitch on\b|\blights?\s+on\b|\bpower on\b/.test(text)) {
		return true;
	}
	if (/\b(turn|switch|put)\s+(them\s+|it\s+)?off\b|\bswitch off\b|\blights?\s+off\b|\bpower off\b/.test(text)) {
		return false;
	}
	if (/\bon\b/.test(text) && !/\boff\b/.test(text)) return true;
	if (/\boff\b/.test(text)) return false;
	return null;
}

function parseOvenTemp(text: string): number | null {
	const celsius = text.match(/\b(\d{2,3})\s*(?:degrees?\s*)?(?:c|celsius)?\b/);
	if (celsius) {
		const value = Number(celsius[1]);
		if (value >= 50 && value <= 280) return value;
	}
	if (/\bpreheat\b|\bheat(?:ing)?\s+(?:the\s+)?oven\b|\boven\s+on\b/.test(text)) return 180;
	return null;
}

function matchIngredient(text: string) {
	const normalized = normalize(text);
	return FRIDGE.find((item) => item.aliases.some((alias) => normalized.includes(alias))) ?? null;
}

export type CommandResult = {
	state: HomeState;
	reply: string;
	speak: boolean;
};

function pushLog(state: HomeState, line: string): string[] {
	return [line, ...state.log].slice(0, 8);
}

function withReply(state: HomeState, heard: string, reply: string): CommandResult {
	return {
		state: {
			...state,
			lastHeard: heard,
			lastReply: reply,
			log: pushLog(state, reply),
		},
		reply,
		speak: true,
	};
}

export function tickVacuum(state: HomeState, now = Date.now()): HomeState {
	const job = state.vacuum;
	if (job.mode === "idle") return state;

	if (job.mode === "room") {
		if (now < job.endsAt) return state;
		return {
			...state,
			vacuum: { mode: "idle" },
			lastReply: `${roomById(job.room).label} is clean.`,
			log: pushLog(state, `${roomById(job.room).label} is clean.`),
		};
	}

	if (now < job.endsAt) return state;
	const next = job.queue + 1;
	if (next >= ROOM_IDS.length) {
		return {
			...state,
			vacuum: { mode: "idle" },
			lastReply: "All rooms are clean.",
			log: pushLog(state, "All rooms are clean."),
		};
	}
	return {
		...state,
		vacuum: {
			mode: "all",
			queue: next,
			startedAt: now,
			endsAt: now + ALL_CLEAN_MS,
		},
	};
}

export function vacuumProgress(state: HomeState, now = Date.now()): number {
	const job = state.vacuum;
	if (job.mode === "idle") return 0;
	const span = job.endsAt - job.startedAt;
	if (span <= 0) return 1;
	return Math.min(1, Math.max(0, (now - job.startedAt) / span));
}

export function vacuumActiveRoom(state: HomeState): RoomId | null {
	const job = state.vacuum;
	if (job.mode === "room") return job.room;
	if (job.mode === "all") return ROOM_IDS[job.queue] ?? null;
	return null;
}

export function applyCommand(state: HomeState, raw: string, now = Date.now()): CommandResult {
	const heard = raw.trim();
	const text = normalize(heard);
	if (!text) {
		return withReply(state, heard, "I didn't catch that.");
	}

	// Fridge / ingredients
	if (
		/\bfridge\b|\brefrigerator\b|\bingredients?\b|\bwhat(?:'s| is) in the fridge\b|\bdo we have\b|\bgot any\b|\bcheck (?:the )?fridge\b/.test(
			text,
		)
	) {
		const item = matchIngredient(text);
		if (item) {
			return withReply(
				{ ...state, fridgeOpen: true },
				heard,
				`Yes — ${item.qty} of ${item.name} in the fridge.`,
			);
		}
		if (/\blist\b|\bwhat(?:'s| is) in\b|\bcheck\b|\bingredients?\b|\binventory\b/.test(text)) {
			const list = FRIDGE.map((entry) => entry.name).join(", ");
			return withReply(
				{ ...state, fridgeOpen: true },
				heard,
				`Fridge has ${list}.`,
			);
		}
		return withReply(
			{ ...state, fridgeOpen: true },
			heard,
			"I opened the fridge. Ask about an ingredient, or say list the fridge.",
		);
	}

	if (/\bclose (?:the )?fridge\b/.test(text)) {
		return withReply({ ...state, fridgeOpen: false }, heard, "Fridge closed.");
	}

	// Vacuum
	if (/\bvaccum\b|\bvacuum\b|\broomb[ao]\b|\brobot\b|\bclean(?:er|ing)?\b|\bsweep\b/.test(text)) {
		const all =
			/\ball(?:\s+rooms?)?\b|\bevery(?:\s+room)?\b|\bwhole (?:house|home|flat|apartment)\b|\bentire/.test(
				text,
			);
		const room = findRoom(text);
		if (all || (!room && /\bclean\b/.test(text) && !findRoom(text))) {
			if (all || /\bclean (?:the )?(?:house|home|flat|apartment|everything)\b/.test(text)) {
				return withReply(
					{
						...state,
						vacuum: {
							mode: "all",
							queue: 0,
							startedAt: now,
							endsAt: now + ALL_CLEAN_MS,
						},
					},
					heard,
					"Vacuum is cleaning every room.",
				);
			}
		}
		if (room) {
			return withReply(
				{
					...state,
					vacuum: {
						mode: "room",
						room,
						startedAt: now,
						endsAt: now + ROOM_CLEAN_MS,
					},
				},
				heard,
				`Vacuum is cleaning the ${roomById(room).label.toLowerCase()}.`,
			);
		}
		if (/\bstop\b|\bcancel\b|\bpause\b|\bdock\b/.test(text)) {
			return withReply({ ...state, vacuum: { mode: "idle" } }, heard, "Vacuum heading back to the dock.");
		}
		return withReply(
			{
				...state,
				vacuum: {
					mode: "all",
					queue: 0,
					startedAt: now,
					endsAt: now + ALL_CLEAN_MS,
				},
			},
			heard,
			"Vacuum is cleaning every room. Name a room next time to focus it.",
		);
	}

	// TV
	if (/\btv\b|\btelevision\b|\btele\b/.test(text)) {
		const on = wantsOn(text);
		if (on === false) {
			return withReply({ ...state, tvOn: false }, heard, "TV is off.");
		}
		return withReply({ ...state, tvOn: true, lights: { ...state.lights, living: true } }, heard, "TV is on.");
	}

	// Oven
	if (/\boven\b|\bpreheat\b|\bbake\b/.test(text)) {
		if (/\boff\b|\bcancel\b|\bstop\b|\bcool\b/.test(text)) {
			return withReply({ ...state, ovenTemp: null }, heard, "Oven is off.");
		}
		const temp = parseOvenTemp(text) ?? 180;
		return withReply(
			{ ...state, ovenTemp: temp, lights: { ...state.lights, kitchen: true } },
			heard,
			`Oven preheating to ${temp}°C.`,
		);
	}

	// Lights — all rooms
	if (/\blights?\b|\blamps?\b|\bbulbs?\b/.test(text) || wantsOn(text) !== null) {
		const on = wantsOn(text);
		const room = findRoom(text);
		const all = /\ball\b|\bevery\b|\bwhole (?:house|home)\b/.test(text);

		if (on === null && !room && !/\blights?\b/.test(text)) {
			return withReply(state, heard, "Try: turn on the kitchen lights, or clean the bedroom.");
		}

		if (all || (!room && /\blights?\b/.test(text) && on !== null)) {
			const next = on !== false;
			const lights = Object.fromEntries(ROOM_IDS.map((id) => [id, next])) as Record<RoomId, boolean>;
			return withReply(
				{ ...state, lights },
				heard,
				next ? "All lights are on." : "All lights are off.",
			);
		}

		if (room && on !== null) {
			return withReply(
				{ ...state, lights: { ...state.lights, [room]: on } },
				heard,
				`${roomById(room).label} lights ${on ? "on" : "off"}.`,
			);
		}

		if (room && /\blights?\b|\blamps?\b/.test(text)) {
			const next = !state.lights[room];
			return withReply(
				{ ...state, lights: { ...state.lights, [room]: next } },
				heard,
				`${roomById(room).label} lights ${next ? "on" : "off"}.`,
			);
		}
	}

	if (roomOnlyHelp(text)) {
		return withReply(state, heard, "Say what to do there — lights, vacuum, TV, oven, or fridge.");
	}

	return withReply(
		state,
		heard,
		"I can control lights, the vacuum, TV, oven, and fridge. Try “turn on the bedroom lights”.",
	);
}

function roomOnlyHelp(text: string): boolean {
	return findRoom(text) !== null && text.split(" ").length <= 3;
}

export function toggleLight(state: HomeState, room: RoomId): HomeState {
	const on = !state.lights[room];
	const reply = `${roomById(room).label} lights ${on ? "on" : "off"}.`;
	return {
		...state,
		lights: { ...state.lights, [room]: on },
		lastReply: reply,
		log: pushLog(state, reply),
	};
}
