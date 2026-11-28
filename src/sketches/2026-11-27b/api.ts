export type Campground = {
	id: number;
	name: string;
	lat: number;
	lon: number;
	park: string;
	region: string;
	type: number;
	features: string[];
	bookUrl: string;
};

export type NightStatus = "full" | "partial" | "none" | "info";

export type CampStatus = {
	id: number;
	status: NightStatus;
	sites: number;
	nights: string[];
};

export type SiteNight = {
	date: string;
	available: boolean;
	price?: string;
};

export type SiteDetail = {
	id: number;
	name: string;
	price?: string;
	warning?: string;
	gear: Record<string, boolean>;
	nights: SiteNight[];
	free: number;
	total: number;
};

export type DetailPayload = {
	id: number;
	name: string;
	arrival: string;
	departure: string;
	bookUrl: string;
	sites: SiteDetail[];
};

export type CachedResult<T> = {
	data: T;
	/** True when serving localStorage because live fetch failed or while refreshing */
	stale: boolean;
	updated?: string;
	error?: string;
};

const CACHE_PREFIX = "pitch-parkstay:v1:";

type CacheEnvelope<T> = { updated: string; data: T };

function cacheGet<T>(key: string): CacheEnvelope<T> | null {
	try {
		const raw = localStorage.getItem(CACHE_PREFIX + key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CacheEnvelope<T>;
		if (!parsed?.data || !parsed.updated) return null;
		return parsed;
	} catch {
		return null;
	}
}

function cacheSet<T>(key: string, data: T) {
	try {
		const envelope: CacheEnvelope<T> = {
			updated: new Date().toISOString(),
			data,
		};
		localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(envelope));
	} catch {
		/* quota / private mode */
	}
}

async function parkstay<T>(params: Record<string, string>): Promise<T> {
	const q = new URLSearchParams(params);
	const res = await fetch(`/api/parkstay?${q}`, {
		signal: AbortSignal.timeout(120_000),
	});
	const ct = res.headers.get("content-type") ?? "";
	if (!ct.includes("application/json")) {
		const hint =
			res.status >= 500
				? "ParkStay proxy failed"
				: "unexpected non-JSON response";
		throw new Error(`${hint} (HTTP ${res.status})`);
	}
	const json = (await res.json()) as T & { error?: string; queue?: boolean };
	if (!res.ok || json.error) {
		throw new Error(json.error || `parkstay HTTP ${res.status}`);
	}
	return json;
}

/** Immediate cache read for first paint (no network). */
export function peekCampgrounds(): CachedResult<Campground[]> | null {
	const hit = cacheGet<Campground[]>("map");
	if (!hit?.data?.length) return null;
	return { data: hit.data, stale: true, updated: hit.updated };
}

export function peekStatuses(
	arrival: string,
	departure: string,
): CachedResult<{ nights: string[]; statuses: CampStatus[] }> | null {
	const hit = cacheGet<{ nights: string[]; statuses: CampStatus[] }>(
		`status:${arrival}:${departure}`,
	);
	if (!hit?.data) return null;
	return { data: hit.data, stale: true, updated: hit.updated };
}

export async function fetchCampgrounds(): Promise<CachedResult<Campground[]>> {
	const key = "map";
	try {
		const json = await parkstay<{ campgrounds?: Campground[] }>({ op: "map" });
		const data = json.campgrounds ?? [];
		if (data.length) cacheSet(key, data);
		return { data, stale: false, updated: new Date().toISOString() };
	} catch (err) {
		const hit = cacheGet<Campground[]>(key);
		if (hit?.data?.length) {
			return {
				data: hit.data,
				stale: true,
				updated: hit.updated,
				error: err instanceof Error ? err.message : "map failed",
			};
		}
		throw err;
	}
}

export async function fetchStatuses(
	arrival: string,
	departure: string,
): Promise<CachedResult<{ nights: string[]; statuses: CampStatus[] }>> {
	const key = `status:${arrival}:${departure}`;
	try {
		const json = await parkstay<{
			nights?: string[];
			statuses?: CampStatus[];
		}>({
			op: "status",
			arrival,
			departure,
		});
		const data = {
			nights: json.nights ?? [],
			statuses: json.statuses ?? [],
		};
		cacheSet(key, data);
		return { data, stale: false, updated: new Date().toISOString() };
	} catch (err) {
		const hit = cacheGet<{ nights: string[]; statuses: CampStatus[] }>(key);
		if (hit?.data) {
			return {
				data: hit.data,
				stale: true,
				updated: hit.updated,
				error: err instanceof Error ? err.message : "availability failed",
			};
		}
		throw err;
	}
}

export async function fetchDetail(
	id: number,
	arrival: string,
	departure: string,
): Promise<CachedResult<DetailPayload>> {
	const key = `detail:${id}:${arrival}:${departure}`;
	try {
		const data = await parkstay<DetailPayload>({
			op: "detail",
			id: String(id),
			arrival,
			departure,
		});
		cacheSet(key, data);
		return { data, stale: false, updated: new Date().toISOString() };
	} catch (err) {
		const hit = cacheGet<DetailPayload>(key);
		if (hit?.data) {
			return {
				data: hit.data,
				stale: true,
				updated: hit.updated,
				error: err instanceof Error ? err.message : "detail failed",
			};
		}
		throw err;
	}
}

export type MapCamera = {
	center: [number, number];
	zoom: number;
};

export type UiPrefs = {
	arrival: string;
	departure: string;
	camera?: MapCamera;
};

const UI_KEY = "ui";

function isIsoDate(v: unknown): v is string {
	return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isCamera(v: unknown): v is MapCamera {
	if (!v || typeof v !== "object") return false;
	const c = v as MapCamera;
	return (
		Array.isArray(c.center) &&
		c.center.length === 2 &&
		Number.isFinite(c.center[0]) &&
		Number.isFinite(c.center[1]) &&
		Number.isFinite(c.zoom)
	);
}

export function loadUiPrefs(): UiPrefs | null {
	const hit = cacheGet<UiPrefs>(UI_KEY);
	if (!hit?.data) return null;
	const { arrival, departure, camera } = hit.data;
	if (!isIsoDate(arrival) || !isIsoDate(departure) || departure <= arrival) return null;
	return {
		arrival,
		departure,
		camera: isCamera(camera) ? camera : undefined,
	};
}

export function saveUiPrefs(patch: Partial<UiPrefs>) {
	const prev = loadUiPrefs();
	const fallback = defaultRange();
	const next: UiPrefs = {
		arrival: isIsoDate(patch.arrival)
			? patch.arrival
			: (prev?.arrival ?? fallback.arrival),
		departure: isIsoDate(patch.departure)
			? patch.departure
			: (prev?.departure ?? fallback.departure),
		camera:
			patch.camera === undefined
				? prev?.camera
				: isCamera(patch.camera)
					? patch.camera
					: undefined,
	};
	if (next.departure <= next.arrival) {
		next.arrival = fallback.arrival;
		next.departure = fallback.departure;
	}
	cacheSet(UI_KEY, next);
}

export function defaultRange(): { arrival: string; departure: string } {
	const start = new Date();
	start.setUTCDate(start.getUTCDate() + 14);
	const end = new Date(start.getTime());
	end.setUTCDate(end.getUTCDate() + 2);
	return { arrival: iso(start), departure: iso(end) };
}

/** Saved dates if present, otherwise the default +14/+16 window. */
export function initialRange(): { arrival: string; departure: string } {
	const prefs = loadUiPrefs();
	if (prefs) return { arrival: prefs.arrival, departure: prefs.departure };
	return defaultRange();
}

export function formatCacheAge(isoUpdated?: string) {
	if (!isoUpdated) return "earlier";
	const t = Date.parse(isoUpdated);
	if (!Number.isFinite(t)) return "earlier";
	const mins = Math.round((Date.now() - t) / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 48) return `${hrs}h ago`;
	return new Date(t).toLocaleString("en-AU", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function iso(d: Date) {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}
