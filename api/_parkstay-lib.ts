/**
 * Park Stay WA (DBCA / ex-DPAW) proxy helpers.
 * Upstream is behind DBCA's virtual queue — we join via
 * queue-endpoint.dbca.wa.gov.au then send sitequeuesession cookies.
 */

const PARKSTAY = "https://parkstay.dbca.wa.gov.au";
const QUEUE_API =
	"https://queue-endpoint.dbca.wa.gov.au/api/check-create-session/";
const QUEUE_GROUP = "parkstayv2";
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REFERER = `${PARKSTAY}/search-availability/information/`;

export type Campground = {
	id: number;
	name: string;
	lat: number;
	lon: number;
	park: string;
	region: string;
	/** 0 = online bookable, 1 = no online, 2 = third-party */
	type: number;
	features: string[];
	bookUrl: string;
};

export type NightStatus = "full" | "partial" | "none" | "info";

export type CampStatus = {
	id: number;
	status: NightStatus;
	sites: number;
	/** ISO dates (YYYY-MM-DD) with at least one free site that night */
	nights: string[];
};

type UpstreamFeature = {
	id?: number;
	geometry?: { type?: string; coordinates?: number[] };
	properties?: {
		name?: string;
		campground_type?: number;
		features?: Array<{ name?: string }>;
		park?: {
			name?: string;
			district?: { region?: { name?: string } };
		};
	};
};

type AvailPayload = {
	campground_available?: Record<
		string,
		{ sites?: number[]; total_available?: number; total_bookable?: number }
	>;
};

type QueueSession = {
	sessionKey: string;
	activatedId: string;
	expiresAt: number;
};

function sessionCookie(session: QueueSession) {
	return `sitequeuesession=${session.sessionKey}; activatedsessionid=${session.activatedId}`;
}

/** Warm-instance cache so we don't re-queue on every request. */
let cachedSession: QueueSession | null = null;
let sessionPromise: Promise<QueueSession> | null = null;

export async function buildMapPayload(): Promise<{
	status: number;
	sMaxAge: number;
	body: Record<string, unknown>;
}> {
	try {
		// Map GeoJSON is often CDN-cached — try without queue first for a fast paint.
		const raw = await upstreamJson(`${PARKSTAY}/api/campground_map/`, {
			allowAnonymous: true,
		});
		const features = (raw as { features?: UpstreamFeature[] }).features ?? [];
		const campgrounds = features
			.map(slimFeature)
			.filter((c): c is Campground => Boolean(c));
		return {
			status: 200,
			sMaxAge: 3_600,
			body: {
				updated: new Date().toISOString(),
				source: "parkstay.dbca.wa.gov.au",
				count: campgrounds.length,
				campgrounds,
			},
		};
	} catch (err) {
		return errorBody(err, 60);
	}
}

export async function buildStatusPayload(
	arrivalIso: string,
	departureIso: string,
): Promise<{
	status: number;
	sMaxAge: number;
	body: Record<string, unknown>;
}> {
	try {
		const arrival = parseIso(arrivalIso);
		const departure = parseIso(departureIso);
		if (!arrival || !departure) {
			return {
				status: 400,
				sMaxAge: 0,
				body: { error: "arrival and departure must be YYYY-MM-DD" },
			};
		}
		if (departure <= arrival) {
			return {
				status: 400,
				sMaxAge: 0,
				body: { error: "departure must be after arrival" },
			};
		}

		const nights = eachNight(arrival, departure);
		if (nights.length > 14) {
			return {
				status: 400,
				sMaxAge: 0,
				body: { error: "date range capped at 14 nights" },
			};
		}

		const fullKey = `${fmtPark(arrival)}|${fmtPark(departure)}`;
		const nightKeys = nights.map((d) => {
			const next = addDays(d, 1);
			return { iso: toIso(d), arrival: fmtPark(d), departure: fmtPark(next) };
		});

		// Ensure one queue pass, then reuse cookie for all availability calls.
		await ensureQueueSession();

		const fullRaw = await upstreamJson(
			`${PARKSTAY}/api/campground_availabilty_view/?arrival=${fmtPark(arrival)}&departure=${fmtPark(departure)}`,
		);
		const nightRaws: unknown[] = [];
		for (const n of nightKeys) {
			nightRaws.push(
				await upstreamJson(
					`${PARKSTAY}/api/campground_availabilty_view/?arrival=${n.arrival}&departure=${n.departure}`,
				),
			);
		}

		const fullSites = availableIds(fullRaw as AvailPayload);
		const perNight = nightKeys.map((n, i) => ({
			iso: n.iso,
			ids: availableIds(nightRaws[i] as AvailPayload),
		}));

		const allIds = new Set<number>();
		for (const id of fullSites) allIds.add(id);
		for (const n of perNight) for (const id of n.ids) allIds.add(id);

		const statuses: CampStatus[] = [...allIds].map((id) => {
			const nightsFree = perNight.filter((n) => n.ids.has(id)).map((n) => n.iso);
			let status: NightStatus;
			if (fullSites.has(id)) status = "full";
			else if (nightsFree.length === 0) status = "none";
			else status = "partial";

			const sites =
				(fullRaw as AvailPayload).campground_available?.[String(id)]?.total_available ??
				0;

			return { id, status, sites, nights: nightsFree };
		});

		return {
			status: 200,
			sMaxAge: 120,
			body: {
				updated: new Date().toISOString(),
				source: "parkstay.dbca.wa.gov.au",
				arrival: toIso(arrival),
				departure: toIso(departure),
				nights: nights.map(toIso),
				fullKey,
				count: statuses.length,
				statuses,
			},
		};
	} catch (err) {
		return errorBody(err, 30);
	}
}

export async function buildDetailPayload(
	id: number,
	arrivalIso: string,
	departureIso: string,
): Promise<{
	status: number;
	sMaxAge: number;
	body: Record<string, unknown>;
}> {
	try {
		const arrival = parseIso(arrivalIso);
		const departure = parseIso(departureIso);
		if (!arrival || !departure || !Number.isFinite(id)) {
			return {
				status: 400,
				sMaxAge: 0,
				body: { error: "id, arrival, departure required" },
			};
		}

		await ensureQueueSession();

		const raw = await upstreamJson(
			`${PARKSTAY}/api/campsite_availablity_view/${id}/?arrival=${fmtPark(arrival)}&departure=${fmtPark(departure)}`,
		);
		const data = raw as {
			id?: number;
			name?: string;
			days?: number;
			arrival?: string;
			sites?: Array<{
				id: number;
				name: string;
				price?: string;
				availability?: Array<[boolean, string, number | string, ...unknown[]]>;
				gearType?: Record<string, boolean>;
				warning?: string;
			}>;
		};

		const sites = (data.sites ?? []).map((s) => {
			const nights = (s.availability ?? []).map((row, i) => {
				const date =
					typeof row[5] === "string"
						? String(row[5]).slice(0, 10)
						: toIso(addDays(arrival, i));
				return {
					date,
					available: Boolean(row[0]),
					price: typeof row[1] === "string" ? row[1] : undefined,
				};
			});
			const free = nights.filter((n) => n.available).length;
			return {
				id: s.id,
				name: s.name,
				price: s.price,
				warning: s.warning,
				gear: s.gearType ?? {},
				nights,
				free,
				total: nights.length,
			};
		});

		return {
			status: 200,
			sMaxAge: 60,
			body: {
				updated: new Date().toISOString(),
				id: data.id ?? id,
				name: data.name ?? `Campground ${id}`,
				arrival: toIso(arrival),
				departure: toIso(departure),
				bookUrl: `${PARKSTAY}/search-availability/campground/?campground=${id}&arrival=${fmtPark(arrival)}&departure=${fmtPark(departure)}`,
				sites,
			},
		};
	} catch (err) {
		return errorBody(err, 30);
	}
}

async function ensureQueueSession(): Promise<QueueSession> {
	const now = Date.now();
	if (cachedSession && cachedSession.expiresAt > now + 15_000) {
		return cachedSession;
	}
	if (sessionPromise) return sessionPromise;
	sessionPromise = joinQueue()
		.then((s) => {
			cachedSession = s;
			return s;
		})
		.finally(() => {
			sessionPromise = null;
		});
	return sessionPromise;
}

async function joinQueue(): Promise<QueueSession> {
	let sessionKey = "";
	const deadline = Date.now() + 55_000;

	while (Date.now() < deadline) {
		// Keep new_session_count at 0 once we have a key — bumping it can churn sessions.
		const data = await checkCreateSession(sessionKey, 0);
		if (data.session_key) sessionKey = data.session_key;

		if (data.status === "Active" && data.activated_session_id && sessionKey) {
			const ttlSec = Math.max(60, Number(data.expiry_seconds) || 1_200);
			return {
				sessionKey,
				activatedId: String(data.activated_session_id),
				expiresAt: Date.now() + Math.min(ttlSec, 1_500) * 1000,
			};
		}

		if (data.queue_full) {
			throw new Error("ParkStay queue is full — try again in a few minutes");
		}

		await sleep(1_200);
	}

	throw new Error(
		"ParkStay virtual queue is busy — waited without a pass. Hit Retry in a moment.",
	);
}

type QueueResponse = {
	status?: string;
	session_key?: string;
	activated_session_id?: string | null;
	queue_full?: boolean;
	queue_position?: number | null;
	expiry_seconds?: number;
	waiting_queue_enabled?: boolean;
};

async function checkCreateSession(
	sessionKey: string,
	newSessionCount: number,
): Promise<QueueResponse> {
	const url =
		`${QUEUE_API}?session_key=${encodeURIComponent(sessionKey)}` +
		`&queue_group=${encodeURIComponent(QUEUE_GROUP)}` +
		`&new_session_count=${newSessionCount}`;
	const res = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": UA,
		},
	});
	if (!res.ok) throw new Error(`Queue HTTP ${res.status}`);
	return (await res.json()) as QueueResponse;
}

function slimFeature(f: UpstreamFeature): Campground | null {
	const id = f.id;
	const coords = f.geometry?.coordinates;
	const name = f.properties?.name;
	if (typeof id !== "number" || !coords || coords.length < 2 || !name) return null;
	const lon = coords[0]!;
	const lat = coords[1]!;
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	const park = f.properties?.park?.name ?? "Park";
	const region = f.properties?.park?.district?.region?.name ?? "";
	const type = f.properties?.campground_type ?? 0;
	const features = (f.properties?.features ?? [])
		.map((x) => x.name)
		.filter((x): x is string => Boolean(x));
	return {
		id,
		name,
		lat,
		lon,
		park,
		region,
		type,
		features,
		bookUrl: `${PARKSTAY}/search-availability/campground/?campground_id=${id}`,
	};
}

function availableIds(payload: AvailPayload): Set<number> {
	const out = new Set<number>();
	const map = payload.campground_available ?? {};
	for (const [id, row] of Object.entries(map)) {
		if ((row.sites?.length ?? 0) > 0) out.add(Number(id));
	}
	return out;
}

async function upstreamJson(
	url: string,
	opts: { allowAnonymous?: boolean } = {},
): Promise<unknown> {
	let lastErr: Error | null = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const headers: Record<string, string> = {
				Accept: "application/json",
				"User-Agent": UA,
				Referer: REFERER,
				"Accept-Language": "en-AU,en;q=0.9",
			};

			const tryAnonymous = Boolean(opts.allowAnonymous) && attempt === 0 && !cachedSession;
			if (!tryAnonymous) {
				const session = await ensureQueueSession();
				headers.Cookie = sessionCookie(session);
			}

			const res = await fetch(url, {
				headers,
				redirect: "manual",
			});

			// Queue middleware sometimes 302/200-scripts us back to waiting room.
			if (res.status >= 300 && res.status < 400) {
				if (tryAnonymous) {
					// Fall through to queued attempt on next loop.
					throw new Error("ParkStay redirected to queue — joining");
				}
				cachedSession = null;
				throw new Error("ParkStay redirected to queue — retrying");
			}

			const text = await res.text();
			if (!res.ok) throw new Error(`ParkStay HTTP ${res.status}`);
			const trimmed = text.trimStart();
			if (
				trimmed.startsWith("<") ||
				trimmed.includes("waiting-room") ||
				trimmed.includes("Please Wait")
			) {
				if (tryAnonymous) {
					throw new Error("ParkStay virtual queue gate — joining");
				}
				cachedSession = null;
				throw new Error("ParkStay virtual queue gate — rejoining");
			}
			try {
				return JSON.parse(text);
			} catch {
				throw new Error("ParkStay returned non-JSON");
			}
		} catch (err) {
			lastErr = err instanceof Error ? err : new Error(String(err));
			if (attempt < 2) await sleep(400 + attempt * 500);
		}
	}
	throw lastErr ?? new Error("ParkStay fetch failed");
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

function errorBody(err: unknown, sMaxAge: number) {
	const message = err instanceof Error ? err.message : "fetch failed";
	const queueBusy =
		/queue/i.test(message) || /waiting/i.test(message) || /rejoin/i.test(message);
	return {
		status: 502,
		sMaxAge,
		body: {
			error: message,
			queue: queueBusy,
			updated: new Date().toISOString(),
		},
	};
}

function parseIso(s: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
	if (!m) return null;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	if (Number.isNaN(d.getTime())) return null;
	return d;
}

function fmtPark(d: Date) {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}/${m}/${day}`;
}

function toIso(d: Date) {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number) {
	const x = new Date(d.getTime());
	x.setUTCDate(x.getUTCDate() + n);
	return x;
}

function eachNight(arrival: Date, departure: Date): Date[] {
	const out: Date[] = [];
	for (let d = new Date(arrival.getTime()); d < departure; d = addDays(d, 1)) {
		out.push(new Date(d.getTime()));
	}
	return out;
}
