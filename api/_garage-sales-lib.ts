/**
 * Garage Sale Finder Australia (garagesalefinder.net.au) listings proxy.
 * Scrapes public state browse pages (structured data-* attributes).
 * Underscore prefix keeps this file out of Vercel’s /api function list.
 */

const ORIGIN = "https://www.garagesalefinder.net.au";
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"] as const;

export type GarageSale = {
	id: number;
	title: string;
	link: string;
	street: string;
	suburb: string;
	state: string;
	postcode: string;
	start: string;
	end: string;
	startTime: string;
	endTime: string;
	lat: number;
	lon: number;
	premium: boolean;
	note: string;
};

const MONTHS: Record<string, number> = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12,
};

function todayIsoInAustralia(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Australia/Sydney",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function addDaysIso(iso: string, days: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + days);
	return dt.toISOString().slice(0, 10);
}

function isIsoDate(v: unknown): v is string {
	return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function decodeEntities(s: string) {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function attr(block: string, name: string): string {
	const re = new RegExp(`data-${name}="([^"]*)"`, "i");
	const m = block.match(re);
	return m ? decodeEntities(m[1]) : "";
}

function innerClass(block: string, className: string): string {
	const re = new RegExp(
		`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`,
		"i",
	);
	const m = block.match(re);
	return m ? decodeEntities(m[1].replace(/<[^>]+>/g, " ")) : "";
}

/** Parse "Sat, 28 Nov 2026" → YYYY-MM-DD */
function parseAuDate(label: string): string | null {
	const m = label.match(
		/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b/i,
	);
	if (!m) return null;
	const day = Number(m[1]);
	const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
	const year = Number(m[3]);
	if (!month || !day || !year) return null;
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTimeRange(raw: string): { startTime: string; endTime: string } {
	const text = raw.trim();
	const range = text.match(
		/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
	);
	if (range) {
		return {
			startTime: to24(range[1], range[2], range[3]),
			endTime: to24(range[4], range[5], range[6]),
		};
	}
	const single = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
	if (single) {
		return { startTime: to24(single[1], single[2], single[3]), endTime: "" };
	}
	return { startTime: "", endTime: "" };
}

function to24(hStr: string, mStr: string | undefined, ampm: string) {
	let h = Number(hStr);
	const m = mStr ?? "00";
	const ap = ampm.toLowerCase();
	if (ap === "pm" && h < 12) h += 12;
	if (ap === "am" && h === 12) h = 0;
	return `${String(h).padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function parseSuburbState(raw: string): { suburb: string; state: string } {
	const cleaned = raw.replace(/\s+/g, " ").trim();
	const m = cleaned.match(/^(.*?),\s*([A-Z]{2,3})$/i);
	if (m) return { suburb: m[1].trim(), state: m[2].toUpperCase() };
	return { suburb: cleaned, state: "" };
}

function extractStreet(note: string, suburb: string): string {
	const line = note.split(/\n|·/).map((s) => s.trim()).find(Boolean) ?? note;
	const m = line.match(
		/\b(\d+[A-Za-z]?\s+[A-Za-z][A-Za-z0-9'’.\-\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Terrace|Tce|Lane|Ln|Way|Parade|Pde|Crescent|Cres|Boulevard|Blvd))\b/i,
	);
	if (!m) return "";
	const street = m[1].trim();
	if (suburb && street.toLowerCase().includes(suburb.toLowerCase())) return street;
	return street;
}

function parseCard(block: string): GarageSale | null {
	const id = Number(attr(block, "gs-id"));
	const lat = Number(attr(block, "lat"));
	const lon = Number(attr(block, "lng"));
	if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	if (lat === 0 && lon === 0) return null;

	const title = innerClass(block, "gs-title") || "Garage sale";
	const suburbRaw = innerClass(block, "gs-suburb");
	const { suburb, state } = parseSuburbState(suburbRaw);
	const note = innerClass(block, "gs-description-short");
	const path = attr(block, "url") || `/view/${id}/`;
	const link = path.startsWith("http") ? path : `${ORIGIN}${path}`;
	const premium = attr(block, "featured") === "1";

	const dateLabels = [...block.matchAll(/<b>([^<]+)<\/b>/gi)].map((m) => m[1]);
	const dates = dateLabels
		.map(parseAuDate)
		.filter((d): d is string => Boolean(d))
		.sort();
	if (!dates.length) return null;

	const start = dates[0];
	const end = dates[dates.length - 1];
	const { startTime, endTime } = parseTimeRange(attr(block, "time-string"));

	return {
		id,
		title,
		link,
		street: extractStreet(note, suburb),
		suburb,
		state,
		postcode: "",
		start,
		end,
		startTime,
		endTime,
		lat,
		lon,
		premium,
		note,
	};
}

function parseStateHtml(html: string): GarageSale[] {
	const blocks = html.match(/<div id="gs_\d+"[\s\S]*?<\/a>\s*<\/div>/g) ?? [];
	const sales: GarageSale[] = [];
	for (const block of blocks) {
		const sale = parseCard(block);
		if (sale) sales.push(sale);
	}
	return sales;
}

async function fetchState(state: string): Promise<GarageSale[]> {
	const url = `${ORIGIN}/browse/state/${state}`;
	const res = await fetch(url, {
		headers: {
			Accept: "text/html",
			"User-Agent": "bigjay.dev/garage-sales",
		},
	});
	if (!res.ok) throw new Error(`${state} upstream ${res.status}`);
	const html = await res.text();
	return parseStateHtml(html);
}

function overlapsWindow(sale: GarageSale, from: string, to: string) {
	return sale.start <= to && sale.end >= from;
}

export async function buildGarageSalesPayload(opts?: {
	from?: string | null;
	to?: string | null;
}): Promise<{
	status: number;
	sMaxAge: number;
	body: Record<string, unknown>;
}> {
	const today = todayIsoInAustralia();
	const from = isIsoDate(opts?.from) ? opts!.from! : today;
	const to = isIsoDate(opts?.to) ? opts!.to! : addDaysIso(today, 21);
	if (to < from) {
		return {
			status: 400,
			sMaxAge: 0,
			body: { error: "to must be on or after from", sales: [] },
		};
	}

	try {
		const settled = await Promise.allSettled(STATES.map((s) => fetchState(s)));
		const byId = new Map<number, GarageSale>();
		const errors: string[] = [];

		for (let i = 0; i < settled.length; i++) {
			const result = settled[i];
			const state = STATES[i];
			if (result.status === "rejected") {
				errors.push(
					`${state}: ${result.reason instanceof Error ? result.reason.message : "failed"}`,
				);
				continue;
			}
			for (const sale of result.value) {
				if (!overlapsWindow(sale, from, to)) continue;
				const prev = byId.get(sale.id);
				if (!prev || (sale.premium && !prev.premium)) byId.set(sale.id, sale);
			}
		}

		const sales = [...byId.values()].sort((a, b) => {
			if (a.start !== b.start) return a.start.localeCompare(b.start);
			return a.title.localeCompare(b.title);
		});

		if (!sales.length && errors.length === STATES.length) {
			return {
				status: 502,
				sMaxAge: 60,
				body: {
					error: errors.slice(0, 3).join("; "),
					updated: new Date().toISOString(),
					from,
					to,
					today,
					sales: [],
				},
			};
		}

		return {
			status: 200,
			sMaxAge: 900,
			body: {
				updated: new Date().toISOString(),
				source: "garagesalefinder.net.au",
				from,
				to,
				today,
				count: sales.length,
				sales,
				...(errors.length ? { warnings: errors } : {}),
			},
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : "fetch failed";
		return {
			status: 500,
			sMaxAge: 60,
			body: {
				error: message,
				updated: new Date().toISOString(),
				from,
				to,
				today,
				sales: [],
			},
		};
	}
}
