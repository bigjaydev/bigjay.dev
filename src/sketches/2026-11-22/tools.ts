const NOTES_KEY = "shotgun-notes-v1";

export type Note = {
	id: string;
	text: string;
	at: number;
};

export type ToolName = "web_lookup" | "save_note" | "list_notes" | "get_location" | "start_game";

export type ToolCall = {
	name: ToolName;
	args: Record<string, string>;
};

export type LocationFix = {
	lat: number;
	lon: number;
	accuracy: number;
	label: string;
};

export const TOOL_DEFS = [
	{
		type: "function" as const,
		function: {
			name: "web_lookup",
			description: "Look up a short factual summary from Wikipedia. Use sparingly — burns a little data.",
			parameters: {
				type: "object",
				properties: {
					query: { type: "string", description: "Person, place, thing, or question keywords" },
				},
				required: ["query"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "save_note",
			description: "Save a short note the driver wants remembered later.",
			parameters: {
				type: "object",
				properties: {
					text: { type: "string", description: "Note contents" },
				},
				required: ["text"],
			},
		},
	},
	{
		type: "function" as const,
		function: {
			name: "list_notes",
			description: "List saved notes from this browser.",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		type: "function" as const,
		function: {
			name: "get_location",
			description: "Read the driver's approximate GPS position from the device.",
			parameters: { type: "object", properties: {} },
		},
	},
	{
		type: "function" as const,
		function: {
			name: "start_game",
			description: "Start a car-friendly word or trivia game.",
			parameters: {
				type: "object",
				properties: {
					kind: {
						type: "string",
						enum: ["trivia", "word_chain", "twenty_questions", "rhyme"],
						description: "Which game to start",
					},
				},
				required: ["kind"],
			},
		},
	},
];

export function loadNotes(): Note[] {
	try {
		const raw = localStorage.getItem(NOTES_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as Note[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function saveNote(text: string): Note {
	const note: Note = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		text: text.trim(),
		at: Date.now(),
	};
	const next = [note, ...loadNotes()].slice(0, 40);
	localStorage.setItem(NOTES_KEY, JSON.stringify(next));
	return note;
}

export async function webLookup(query: string): Promise<string> {
	const q = query.trim();
	if (!q) return "Need a search query.";

	const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json&origin=*`;
	const search = (await fetch(searchUrl).then((r) => r.json())) as [string, string[], string[], string[]];
	const title = search[1]?.[0];
	if (!title) return `Nothing solid turned up for “${q}”.`;

	const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
	const summary = (await fetch(summaryUrl).then((r) => r.json())) as {
		extract?: string;
		description?: string;
		title?: string;
	};
	const extract = summary.extract?.trim();
	if (!extract) return `Found ${title}, but no short summary.`;
	return `${summary.title ?? title}: ${extract.slice(0, 520)}${extract.length > 520 ? "…" : ""}`;
}

export function getLocation(): Promise<LocationFix> {
	return new Promise((resolve, reject) => {
		if (!("geolocation" in navigator)) {
			reject(new Error("Geolocation is not available."));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				const lat = pos.coords.latitude;
				const lon = pos.coords.longitude;
				const accuracy = pos.coords.accuracy;
				const label = await reverseLabel(lat, lon).catch(() => `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
				resolve({ lat, lon, accuracy, label });
			},
			(err) => reject(new Error(err.message || "Could not read location.")),
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 },
		);
	});
}

async function reverseLabel(lat: number, lon: number): Promise<string> {
	const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12`;
	const data = (await fetch(url, {
		headers: { Accept: "application/json" },
	}).then((r) => r.json())) as {
		name?: string;
		display_name?: string;
		address?: { city?: string; town?: string; village?: string; suburb?: string; state?: string; country?: string };
	};
	const a = data.address;
	const place = a?.city || a?.town || a?.village || a?.suburb || data.name;
	const bits = [place, a?.state, a?.country].filter(Boolean);
	if (bits.length) return bits.join(", ");
	return data.display_name?.split(",").slice(0, 3).join(",").trim() || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

export async function runTool(call: ToolCall): Promise<string> {
	switch (call.name) {
		case "web_lookup":
			return webLookup(call.args.query ?? "");
		case "save_note": {
			const note = saveNote(call.args.text ?? "");
			return `Saved note: “${note.text}”.`;
		}
		case "list_notes": {
			const notes = loadNotes();
			if (!notes.length) return "No notes saved yet.";
			return notes
				.slice(0, 8)
				.map((n, i) => `${i + 1}. ${n.text}`)
				.join("\n");
		}
		case "get_location": {
			const fix = await getLocation();
			return `Roughly near ${fix.label} (±${Math.round(fix.accuracy)}m). Coords ${fix.lat.toFixed(4)}, ${fix.lon.toFixed(4)}.`;
		}
		case "start_game":
			return `Game requested: ${call.args.kind ?? "trivia"}. Host it briefly and keep turns short for driving.`;
		default:
			return "Unknown tool.";
	}
}

/** Keyword router so tiny models still hit tools reliably. */
export function inferToolFromUtterance(text: string): ToolCall | null {
	const t = text.trim();
	const lower = t.toLowerCase();

	const note =
		lower.match(/^(?:note|remember|save(?:\s+a)?\s+note)[:\s]+(.+)/i) ||
		lower.match(/^remind me (?:to |that )?(.+)/i);
	if (note?.[1]) return { name: "save_note", args: { text: note[1].trim() } };

	if (/\b(list|read|show|what(?:'s| are)?)\b.*\bnotes?\b/i.test(lower) || lower === "notes") {
		return { name: "list_notes", args: {} };
	}

	if (
		/\b(where am i|my location|current location|gps|where are we)\b/i.test(lower) ||
		lower === "location"
	) {
		return { name: "get_location", args: {} };
	}

	const lookup =
		t.match(/^(?:look\s*up|search|wiki|what is|who is|what's)\s+(.+)/i) ||
		t.match(/^google\s+(.+)/i);
	if (lookup?.[1]) return { name: "web_lookup", args: { query: lookup[1].replace(/\?+$/, "").trim() } };

	if (/\b(trivia|quiz)\b/i.test(lower) && /\b(play|start|let'?s|game)\b/i.test(lower)) {
		return { name: "start_game", args: { kind: "trivia" } };
	}
	if (/\b(word\s*chain|categories)\b/i.test(lower)) {
		return { name: "start_game", args: { kind: "word_chain" } };
	}
	if (/\b(twenty|20)\s*questions?\b/i.test(lower)) {
		return { name: "start_game", args: { kind: "twenty_questions" } };
	}
	if (/\brhyme\b/i.test(lower) && /\b(play|start|game|battle)\b/i.test(lower)) {
		return { name: "start_game", args: { kind: "rhyme" } };
	}
	if (/\b(play a game|let'?s play|word game|car game)\b/i.test(lower)) {
		return { name: "start_game", args: { kind: "trivia" } };
	}

	return null;
}
