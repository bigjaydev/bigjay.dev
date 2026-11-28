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

export type SalesPayload = {
	sales: GarageSale[];
	from: string;
	to: string;
	today: string;
	updated?: string;
	source?: string;
	error?: string;
};

export type MapCamera = {
	center: [number, number];
	zoom: number;
};

const CACHE_PREFIX = "rummage-gs:v2:";
const UI_KEY = "ui";

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
		localStorage.setItem(
			CACHE_PREFIX + key,
			JSON.stringify({ updated: new Date().toISOString(), data } satisfies CacheEnvelope<T>),
		);
	} catch {
		/* quota / private mode */
	}
}

export function australiaToday(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Australia/Sydney",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

export function addDaysIso(iso: string, days: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + days);
	return dt.toISOString().slice(0, 10);
}

export function saleOnDay(sale: GarageSale, day: string) {
	return sale.start <= day && sale.end >= day;
}

export function formatAddress(sale: GarageSale) {
	return [sale.street, sale.suburb, sale.state, sale.postcode].filter(Boolean).join(", ");
}

export function formatTimeRange(sale: GarageSale) {
	const fmt = (t: string) => {
		if (!t) return "";
		const [hStr, mStr] = t.split(":");
		let h = Number(hStr);
		const m = mStr ?? "00";
		if (!Number.isFinite(h)) return t;
		const ampm = h >= 12 ? "pm" : "am";
		if (h === 0) h = 12;
		else if (h > 12) h -= 12;
		return m === "00" ? `${h}${ampm}` : `${h}:${m}${ampm}`;
	};
	if (!sale.startTime) return "";
	if (sale.endTime) return `${fmt(sale.startTime)} – ${fmt(sale.endTime)}`;
	return `from ${fmt(sale.startTime)}`;
}

export function formatDayLabel(iso: string) {
	const [y, m, d] = iso.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	return dt.toLocaleDateString("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}

export function peekSales(): { data: SalesPayload; updated: string } | null {
	const hit = cacheGet<SalesPayload>("window");
	if (!hit?.data?.sales) return null;
	return { data: hit.data, updated: hit.updated };
}

export async function fetchSales(from: string, to: string): Promise<SalesPayload> {
	const q = new URLSearchParams({ from, to });
	const res = await fetch(`/api/garage-sales?${q}`, {
		signal: AbortSignal.timeout(30_000),
	});
	const ct = res.headers.get("content-type") ?? "";
	if (!ct.includes("application/json")) {
		throw new Error(`unexpected non-JSON response (HTTP ${res.status})`);
	}
	const json = (await res.json()) as SalesPayload;
	if (!res.ok || json.error) {
		const hit = cacheGet<SalesPayload>("window");
		if (hit?.data?.sales?.length) {
			return { ...hit.data, error: json.error || `HTTP ${res.status}` };
		}
		throw new Error(json.error || `garage-sales HTTP ${res.status}`);
	}
	cacheSet("window", json);
	return json;
}

type UiPrefs = {
	day: string;
	trailIds: number[];
	camera?: MapCamera;
	useMyLocation: boolean;
};

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
	const { day, trailIds, camera, useMyLocation } = hit.data;
	if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
	return {
		day,
		trailIds: Array.isArray(trailIds)
			? trailIds.filter((n) => Number.isFinite(n)).map(Number)
			: [],
		camera: isCamera(camera) ? camera : undefined,
		useMyLocation: Boolean(useMyLocation),
	};
}

export function saveUiPrefs(patch: Partial<UiPrefs>) {
	const prev = loadUiPrefs();
	const next: UiPrefs = {
		day: patch.day ?? prev?.day ?? australiaToday(),
		trailIds: patch.trailIds ?? prev?.trailIds ?? [],
		camera:
			patch.camera === undefined
				? prev?.camera
				: isCamera(patch.camera)
					? patch.camera
					: undefined,
		useMyLocation:
			patch.useMyLocation === undefined
				? (prev?.useMyLocation ?? false)
				: patch.useMyLocation,
	};
	cacheSet(UI_KEY, next);
}
