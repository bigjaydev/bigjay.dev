import {
	resolveCountry,
	scoreToSeverity,
	type ConflictParty,
	type ConflictZone,
	type Cve,
	type CyberArc,
	type NewsArticle,
	type Severity,
} from "./data";

const NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const CIRCL_URL = "https://cve.circl.lu/api/last";
const GDELT_DOC =
	"https://api.gdeltproject.org/api/v2/doc/doc";
const BLACKWING_CONFLICTS = "https://blackwing.im/api/conflicts?format=json";

export async function fetchRecentCves(limit = 40): Promise<Cve[]> {
	try {
		const fromNvd = await fetchNvdCves(limit);
		if (fromNvd.length) return fromNvd;
	} catch {
		/* fall through to CIRCL */
	}
	return fetchCirclCves(limit);
}

export async function fetchCyberNews(limit = 40): Promise<NewsArticle[]> {
	const queries = [
		'(cybersecurity OR ransomware OR "data breach" OR malware)',
		"ransomware",
		"cybersecurity",
	];
	let lastErr: unknown;
	for (let attempt = 0; attempt < queries.length; attempt++) {
		const query = queries[attempt]!;
		try {
			const articles = await fetchGdeltArticles(query, limit);
			if (articles.length) return articles;
		} catch (err) {
			lastErr = err;
			const msg = err instanceof Error ? err.message : "";
			// Back off harder on rate limits — GDELT is strict.
			await sleep(msg.includes("429") ? 2500 + attempt * 1500 : 900);
		}
	}
	// CORS-friendly fallback so the dossier list still has real headlines.
	try {
		const hn = await fetchHnCyber(limit);
		if (hn.length) return hn;
	} catch (err) {
		lastErr = err;
	}
	throw lastErr instanceof Error ? lastErr : new Error("Cyber news feeds unavailable");
}

export async function fetchCyberArcs(): Promise<{ arcs: CyberArc[]; updated?: string; note?: string }> {
	const res = await fetch("/api/cyber-arcs", {
		signal: AbortSignal.timeout(20_000),
	});
	const ct = res.headers.get("content-type") ?? "";
	if (!ct.includes("application/json")) {
		throw new Error(
			`cyber-arcs returned ${ct || "non-JSON"} (HTTP ${res.status}) — deploy /api or restart astro dev`,
		);
	}
	const json = (await res.json()) as {
		arcs?: CyberArc[];
		updated?: string;
		note?: string;
		error?: string;
	};
	if (!res.ok || (json.error && !json.arcs?.length)) {
		throw new Error(json.error || `cyber-arcs HTTP ${res.status}`);
	}
	return {
		arcs: json.arcs ?? [],
		updated: json.updated,
		note: json.note,
	};
}

export async function fetchConflicts(): Promise<ConflictZone[]> {
	const res = await fetch(BLACKWING_CONFLICTS);
	if (!res.ok) throw new Error(`Blackwing HTTP ${res.status}`);
	const json = (await res.json()) as BlackwingRegistry;
	const zones = (json.conflicts ?? [])
		.map((c) => mapConflict(c, json.lastVerified))
		.filter((c): c is ConflictZone => Boolean(c));
	// Active / ceasefire first, concluded last
	const rank = (s: string) => (s === "active" ? 0 : s === "ceasefire" ? 1 : 2);
	zones.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
	return zones;
}

function mapConflict(raw: BlackwingConflict, verified?: string): ConflictZone | null {
	if (!raw?.id || !raw.name || !raw.center || raw.center.length < 2) return null;
	const lon = raw.center[0]!;
	const lat = raw.center[1]!;
	const parties: ConflictParty[] = (raw.parties ?? []).map((p) => ({
		id: p.id,
		name: p.name,
		iso2: p.iso2,
		kind: p.kind,
		role: p.role,
	}));
	const bbox = raw.bbox;
	let radius = 0.22;
	if (bbox && bbox.length >= 4) {
		const dLon = Math.abs(bbox[2]! - bbox[0]!);
		const dLat = Math.abs(bbox[3]! - bbox[1]!);
		radius = Math.min(0.55, Math.max(0.14, ((dLon + dLat) / 2) * 0.018));
	}
	const latest = raw.developments?.[0];
	return {
		id: raw.id,
		name: raw.name,
		shortName: raw.shortName || raw.name,
		region: raw.region || "unknown",
		status: raw.status || "unknown",
		classification: raw.classification || "n/a",
		startDate: raw.startDate || "unknown",
		lat,
		lon,
		radius,
		summary: raw.summary || "",
		parties,
		versus: formatVersus(parties),
		killedLow: raw.fatalities?.low,
		killedHigh: raw.fatalities?.high,
		latestDate: latest?.date,
		latestText: latest?.text,
		latestUrl: latest?.source?.url,
		source: `Blackwing · verified ${verified ?? "n/a"}`,
		url: latest?.source?.url || "https://blackwing.im/",
	};
}

function formatVersus(parties: ConflictParty[]) {
	if (parties.length === 0) return "parties unknown";
	if (parties.length === 1) return parties[0]!.name;
	if (parties.length === 2) return `${parties[0]!.name} vs ${parties[1]!.name}`;
	// Prefer first two as principal sides when more are listed
	return `${parties[0]!.name} vs ${parties[1]!.name} (+${parties.length - 2})`;
}

async function fetchNvdCves(limit: number): Promise<Cve[]> {
	const end = new Date();
	const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
	const params = new URLSearchParams({
		resultsPerPage: String(Math.min(limit, 100)),
		pubStartDate: formatNvdDate(start),
		pubEndDate: formatNvdDate(end),
	});
	const res = await fetch(`${NVD_URL}?${params}`);
	if (!res.ok) throw new Error(`NVD HTTP ${res.status}`);
	const json = (await res.json()) as NvdResponse;
	const mapped = (json.vulnerabilities ?? [])
		.map((row) => mapNvd(row.cve))
		.filter((c): c is Cve => Boolean(c));
	mapped.sort((a, b) => (a.published < b.published ? 1 : -1));
	return mapped.slice(0, limit);
}

async function fetchCirclCves(limit: number): Promise<Cve[]> {
	const res = await fetch(`${CIRCL_URL}/${Math.min(limit, 40)}`);
	if (!res.ok) throw new Error(`CIRCL HTTP ${res.status}`);
	const rows = (await res.json()) as CirclRow[];
	return rows
		.map(mapCircl)
		.filter((c): c is Cve => Boolean(c))
		.slice(0, limit);
}

async function fetchGdeltArticles(query: string, limit: number): Promise<NewsArticle[]> {
	const params = new URLSearchParams({
		query,
		mode: "ArtList",
		format: "json",
		maxrecords: String(Math.min(limit, 75)),
		sort: "DateDesc",
	});
	const res = await fetch(`${GDELT_DOC}?${params}`);
	if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
	const json = (await res.json()) as GdeltDocResponse;
	const seen = new Set<string>();
	const out: NewsArticle[] = [];
	for (const row of json.articles ?? []) {
		if (!row.url || !row.title) continue;
		const geo = resolveCountry(row.sourcecountry);
		if (!geo) continue;
		const key = row.url;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			id: hashId(row.url),
			title: decodeHtml(row.title),
			source: row.domain || hostname(row.url),
			summary: decodeHtml(row.title),
			published: formatGdeltDate(row.seendate),
			url: row.url,
			country: geo.country,
			lat: geo.lat,
			lon: geo.lon,
			language: row.language || "unknown",
			image: row.socialimage || undefined,
			feed: "gdelt",
		});
	}
	return out;
}

async function fetchHnCyber(limit: number): Promise<NewsArticle[]> {
	const params = new URLSearchParams({
		query: "cybersecurity OR ransomware OR breach OR malware",
		tags: "story",
		hitsPerPage: String(Math.min(limit, 40)),
	});
	const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${params}`);
	if (!res.ok) throw new Error(`HN HTTP ${res.status}`);
	const json = (await res.json()) as {
		hits?: Array<{
			objectID: string;
			title?: string;
			url?: string;
			story_text?: string;
			created_at?: string;
			author?: string;
		}>;
	};
	return (json.hits ?? [])
		.filter((h) => h.title && (h.url || h.objectID))
		.map((h) => ({
			id: `hn-${h.objectID}`,
			title: h.title!,
			source: h.url ? hostname(h.url) : "news.ycombinator.com",
			summary: h.story_text?.trim() || h.title!,
			published: (h.created_at ?? "").replace("T", " ").slice(0, 16) + " UTC",
			url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
			country: "unlocated",
			language: "English",
			feed: "hn" as const,
		}));
}

function mapNvd(cve: NvdCve): Cve | null {
	if (!cve?.id) return null;
	const desc =
		cve.descriptions?.find((d) => d.lang === "en")?.value ??
		cve.descriptions?.[0]?.value ??
		"No description.";
	const metric =
		cve.metrics?.cvssMetricV31?.[0] ??
		cve.metrics?.cvssMetricV30?.[0] ??
		cve.metrics?.cvssMetricV40?.[0] ??
		cve.metrics?.cvssMetricV2?.[0];
	const cvssData = metric?.cvssData;
	const score = typeof cvssData?.baseScore === "number" ? cvssData.baseScore : 0;
	const severity =
		normalizeSeverity(cvssData?.baseSeverity) ?? scoreToSeverity(score);
	const vector = cvssData?.vectorString ?? "n/a";
	const cwe =
		cve.weaknesses?.[0]?.description?.find((d) => d.lang === "en")?.value ??
		cve.weaknesses?.[0]?.description?.[0]?.value ??
		"n/a";
	const affectedEntry = cve.affected?.[0]?.affectedData?.[0];
	const vendor = affectedEntry?.vendor && affectedEntry.vendor !== "n/a" ? affectedEntry.vendor : "n/a";
	const product =
		affectedEntry?.product && affectedEntry.product !== "n/a" ? affectedEntry.product : "n/a";
	const versions = affectedEntry?.versions?.map((v) => v.version).filter(Boolean).join(", ");
	const refs = [...new Set((cve.references ?? []).map((r) => r.url).filter(Boolean))];
	return {
		id: cve.id,
		cvss: score,
		severity,
		product,
		vendor,
		vector,
		summary: truncate(desc, 180),
		details: desc,
		affected: versions ? `${product} (${versions})` : product,
		published: (cve.published ?? "").slice(0, 10),
		updated: (cve.lastModified ?? "").slice(0, 10),
		url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
		cwe,
		references: refs.slice(0, 8),
	};
}

function mapCircl(row: CirclRow): Cve | null {
	const id =
		row.aliases?.find((a) => a.startsWith("CVE-")) ??
		(row.id?.startsWith("CVE-") ? row.id : null);
	if (!id) return null;
	const scoreStr = row.severity?.[0]?.score;
	const parsed = scoreStr ? parseCvssVector(scoreStr) : { score: 0, vector: "n/a" };
	const desc = row.details ?? "No description.";
	const pkg = row.affected?.[0]?.package;
	return {
		id,
		cvss: parsed.score,
		severity: scoreToSeverity(parsed.score),
		product: pkg?.name ?? "n/a",
		vendor: pkg?.ecosystem ?? "n/a",
		vector: parsed.vector,
		summary: truncate(desc, 180),
		details: desc,
		affected: pkg ? `${pkg.ecosystem}/${pkg.name}` : "n/a",
		published: (row.published ?? "").slice(0, 10),
		updated: (row.modified ?? "").slice(0, 10),
		url: `https://nvd.nist.gov/vuln/detail/${id}`,
		cwe: "n/a",
		references: (row.references ?? []).map((r) => r.url).filter(Boolean).slice(0, 8),
	};
}

function parseCvssVector(score: string): { score: number; vector: string } {
	// e.g. CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
	const vector = score.trim();
	const parts = Object.fromEntries(
		vector
			.split("/")
			.slice(1)
			.map((p) => {
				const [k, v] = p.split(":");
				return [k, v];
			}),
	) as Record<string, string | undefined>;
	// Approximate score from impact triad when only vector is present
	const impact = [parts.C, parts.I, parts.A].filter((v) => v === "H").length;
	const scoreApprox = impact === 3 ? 9.8 : impact === 2 ? 7.5 : impact === 1 ? 5.3 : 3.1;
	return { score: scoreApprox, vector };
}

function normalizeSeverity(raw?: string): Severity | null {
	if (!raw) return null;
	const s = raw.toLowerCase();
	if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
	if (s === "none") return "none";
	return null;
}

function formatNvdDate(d: Date) {
	const iso = d.toISOString();
	return `${iso.slice(0, 19)}.000`;
}

function formatGdeltDate(raw?: string) {
	if (!raw || raw.length < 8) return "unknown";
	const y = raw.slice(0, 4);
	const m = raw.slice(4, 6);
	const day = raw.slice(6, 8);
	const hh = raw.slice(8, 10) || "00";
	const mm = raw.slice(10, 12) || "00";
	return `${y}-${m}-${day} ${hh}:${mm} UTC`;
}

function hostname(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function decodeHtml(s: string) {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function truncate(s: string, n: number) {
	if (s.length <= n) return s;
	return `${s.slice(0, n - 1)}…`;
}

function hashId(s: string) {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return `n${Math.abs(h)}`;
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

type NvdResponse = { vulnerabilities?: Array<{ cve: NvdCve }> };
type NvdCve = {
	id: string;
	published?: string;
	lastModified?: string;
	descriptions?: Array<{ lang: string; value: string }>;
	metrics?: {
		cvssMetricV31?: Array<{ cvssData: CvssData }>;
		cvssMetricV30?: Array<{ cvssData: CvssData }>;
		cvssMetricV40?: Array<{ cvssData: CvssData }>;
		cvssMetricV2?: Array<{ cvssData: CvssData }>;
	};
	weaknesses?: Array<{ description?: Array<{ lang: string; value: string }> }>;
	affected?: Array<{
		affectedData?: Array<{
			vendor?: string;
			product?: string;
			versions?: Array<{ version?: string }>;
		}>;
	}>;
	references?: Array<{ url: string }>;
};
type CvssData = {
	baseScore?: number;
	baseSeverity?: string;
	vectorString?: string;
};

type CirclRow = {
	id?: string;
	aliases?: string[];
	details?: string;
	published?: string;
	modified?: string;
	severity?: Array<{ score?: string }>;
	affected?: Array<{ package?: { ecosystem?: string; name?: string } }>;
	references?: Array<{ url: string }>;
};

type GdeltDocResponse = {
	articles?: Array<{
		url?: string;
		title?: string;
		seendate?: string;
		domain?: string;
		language?: string;
		sourcecountry?: string;
		socialimage?: string;
	}>;
};

type BlackwingRegistry = {
	lastVerified?: string;
	conflicts?: BlackwingConflict[];
};

type BlackwingConflict = {
	id: string;
	name: string;
	shortName?: string;
	region?: string;
	status?: string;
	classification?: string;
	startDate?: string;
	center?: number[];
	bbox?: number[];
	summary?: string;
	parties?: Array<{
		id: string;
		name: string;
		iso2?: string;
		kind: string;
		role: string;
	}>;
	fatalities?: { low?: number; high?: number };
	developments?: Array<{
		date?: string;
		text?: string;
		source?: { name?: string; url?: string };
	}>;
};
