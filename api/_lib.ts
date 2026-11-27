/**
 * Shared Mirage → cyber-arcs payload builder.
 * Underscore prefix keeps this file out of Vercel’s /api function list.
 */

const MIRAGE_URL = "https://mirage.offseq.com/api/intel/map?days=1&limit=400";

export type CyberArc = {
	id: string;
	fromCountry: string;
	toCountry: string;
	fromLat: number;
	fromLon: number;
	toLat: number;
	toLon: number;
	count: number;
	severity: string;
	cveId?: string;
	kev: boolean;
};

type MiragePoint = {
	lat?: number;
	lon?: number;
	country?: string;
	severity?: string;
	cve_id?: string | null;
	kev?: boolean;
	ts?: number;
	target_country?: string;
	target_lat?: number;
	target_lon?: number;
};

export async function buildCyberArcsPayload(): Promise<{
	status: number;
	sMaxAge: number;
	body: Record<string, unknown>;
}> {
	try {
		const upstream = await fetch(MIRAGE_URL, {
			headers: {
				Accept: "application/json",
				"User-Agent": "bigjay.dev/cyber-arcs",
			},
		});

		if (!upstream.ok) {
			return {
				status: 502,
				sMaxAge: 60,
				body: {
					error: `upstream ${upstream.status}`,
					updated: new Date().toISOString(),
					arcs: [],
				},
			};
		}

		const data = (await upstream.json()) as { results?: MiragePoint[] };
		const arcs = aggregateArcs(data.results ?? []);

		return {
			status: 200,
			sMaxAge: 86_400,
			body: {
				updated: new Date().toISOString(),
				source: "mirage.offseq.com",
				note: "Observed honeypot probe/scan traffic (source → target), not confirmed nation-state attribution.",
				count: arcs.length,
				arcs,
			},
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : "fetch failed";
		return {
			status: 500,
			sMaxAge: 60,
			body: { error: message, updated: new Date().toISOString(), arcs: [] },
		};
	}
}

function aggregateArcs(points: MiragePoint[]): CyberArc[] {
	const map = new Map<string, CyberArc>();

	for (const p of points) {
		const fromCountry = (p.country ?? "").toUpperCase();
		const toCountry = (p.target_country ?? "").toUpperCase();
		if (!fromCountry || !toCountry || fromCountry === toCountry) continue;
		if (
			typeof p.lat !== "number" ||
			typeof p.lon !== "number" ||
			typeof p.target_lat !== "number" ||
			typeof p.target_lon !== "number"
		) {
			continue;
		}

		const key = `${fromCountry}->${toCountry}`;
		const existing = map.get(key);
		const severity = p.severity ?? "info";
		if (existing) {
			existing.count += 1;
			if (rank(severity) > rank(existing.severity)) existing.severity = severity;
			if (p.cve_id) existing.cveId = p.cve_id;
			if (p.kev) existing.kev = true;
			continue;
		}

		map.set(key, {
			id: key,
			fromCountry,
			toCountry,
			fromLat: p.lat,
			fromLon: p.lon,
			toLat: p.target_lat,
			toLon: p.target_lon,
			count: 1,
			severity,
			cveId: p.cve_id ?? undefined,
			kev: Boolean(p.kev),
		});
	}

	return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 80);
}

function rank(severity: string) {
	switch (severity) {
		case "critical":
			return 4;
		case "high":
			return 3;
		case "medium":
			return 2;
		case "low":
			return 1;
		default:
			return 0;
	}
}
