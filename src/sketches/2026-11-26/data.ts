export type Severity = "critical" | "high" | "medium" | "low" | "none";

export type Cve = {
	id: string;
	cvss: number;
	severity: Severity;
	product: string;
	vendor: string;
	vector: string;
	summary: string;
	details: string;
	affected: string;
	published: string;
	updated: string;
	url: string;
	cwe: string;
	references: string[];
};

export type NewsArticle = {
	id: string;
	title: string;
	source: string;
	summary: string;
	published: string;
	url: string;
	country: string;
	/** Present when geolocated (GDELT source country). */
	lat?: number;
	lon?: number;
	language: string;
	image?: string;
	feed: "gdelt" | "hn";
};

export type ConflictParty = {
	id: string;
	name: string;
	iso2?: string;
	kind: string;
	role: string;
};

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

export type ConflictZone = {
	id: string;
	name: string;
	shortName: string;
	region: string;
	status: string;
	classification: string;
	startDate: string;
	lat: number;
	lon: number;
	/** Approximate zone radius in globe units from bbox span. */
	radius: number;
	summary: string;
	parties: ConflictParty[];
	/** Human label like "Russia vs Ukraine". */
	versus: string;
	killedLow?: number;
	killedHigh?: number;
	latestDate?: string;
	latestText?: string;
	latestUrl?: string;
	source: string;
	url: string;
};

/** ISO2 → approximate centroids for interstate conflict arcs. */
export const ISO2_COORDS: Record<string, { lat: number; lon: number }> = {
	AF: { lat: 33.9, lon: 67.7 },
	AM: { lat: 40.1, lon: 45.0 },
	AZ: { lat: 40.1, lon: 47.6 },
	BF: { lat: 12.2, lon: -1.6 },
	CD: { lat: -4.0, lon: 21.8 },
	CN: { lat: 35.9, lon: 104.2 },
	ET: { lat: 9.1, lon: 40.5 },
	HT: { lat: 18.9, lon: -72.3 },
	IL: { lat: 31.0, lon: 34.9 },
	IQ: { lat: 33.2, lon: 43.7 },
	IR: { lat: 32.4, lon: 53.7 },
	LB: { lat: 33.9, lon: 35.9 },
	LY: { lat: 26.3, lon: 17.2 },
	ML: { lat: 17.6, lon: -4.0 },
	MM: { lat: 21.9, lon: 95.9 },
	NE: { lat: 17.6, lon: 8.1 },
	NG: { lat: 9.1, lon: 8.7 },
	PK: { lat: 30.4, lon: 69.3 },
	PS: { lat: 31.9, lon: 35.2 },
	RU: { lat: 61.5, lon: 105.3 },
	RW: { lat: -1.9, lon: 29.9 },
	SA: { lat: 23.9, lon: 45.1 },
	SD: { lat: 12.9, lon: 30.2 },
	SO: { lat: 5.2, lon: 46.2 },
	SY: { lat: 34.8, lon: 39.0 },
	TD: { lat: 15.5, lon: 18.7 },
	UA: { lat: 48.4, lon: 31.2 },
	US: { lat: 37.1, lon: -95.7 },
	YE: { lat: 15.6, lon: 48.5 },
};

/** Approximate country centroids for GDELT `sourcecountry` labels (not article content). */
export const COUNTRY_COORDS: Record<string, { lat: number; lon: number }> = {
	afghanistan: { lat: 33.9, lon: 67.7 },
	albania: { lat: 41.2, lon: 20.2 },
	algeria: { lat: 28.0, lon: 1.7 },
	argentina: { lat: -38.4, lon: -63.6 },
	armenia: { lat: 40.1, lon: 45.0 },
	australia: { lat: -25.3, lon: 133.8 },
	austria: { lat: 47.5, lon: 14.6 },
	azerbaijan: { lat: 40.1, lon: 47.6 },
	bahrain: { lat: 26.0, lon: 50.6 },
	bangladesh: { lat: 23.7, lon: 90.4 },
	belarus: { lat: 53.7, lon: 27.9 },
	belgium: { lat: 50.5, lon: 4.5 },
	bolivia: { lat: -16.3, lon: -63.6 },
	"bosnia and herzegovina": { lat: 43.9, lon: 17.7 },
	brazil: { lat: -14.2, lon: -51.9 },
	bulgaria: { lat: 42.7, lon: 25.5 },
	cambodia: { lat: 12.6, lon: 105.0 },
	cameroon: { lat: 7.4, lon: 12.4 },
	canada: { lat: 56.1, lon: -106.3 },
	chile: { lat: -35.7, lon: -71.5 },
	china: { lat: 35.9, lon: 104.2 },
	colombia: { lat: 4.6, lon: -74.3 },
	croatia: { lat: 45.1, lon: 15.2 },
	cuba: { lat: 21.5, lon: -78.0 },
	cyprus: { lat: 35.1, lon: 33.4 },
	"czech republic": { lat: 49.8, lon: 15.5 },
	czechia: { lat: 49.8, lon: 15.5 },
	denmark: { lat: 56.3, lon: 9.5 },
	ecuador: { lat: -1.8, lon: -78.2 },
	egypt: { lat: 26.8, lon: 30.8 },
	estonia: { lat: 58.6, lon: 25.0 },
	ethiopia: { lat: 9.1, lon: 40.5 },
	finland: { lat: 61.9, lon: 25.7 },
	france: { lat: 46.2, lon: 2.2 },
	georgia: { lat: 42.3, lon: 43.4 },
	germany: { lat: 51.2, lon: 10.5 },
	ghana: { lat: 7.9, lon: -1.0 },
	greece: { lat: 39.1, lon: 21.8 },
	"hong kong": { lat: 22.3, lon: 114.2 },
	hungary: { lat: 47.2, lon: 19.5 },
	iceland: { lat: 64.9, lon: -19.0 },
	india: { lat: 20.6, lon: 79.0 },
	indonesia: { lat: -0.8, lon: 113.9 },
	iran: { lat: 32.4, lon: 53.7 },
	iraq: { lat: 33.2, lon: 43.7 },
	ireland: { lat: 53.1, lon: -8.2 },
	israel: { lat: 31.0, lon: 34.9 },
	italy: { lat: 41.9, lon: 12.6 },
	japan: { lat: 36.2, lon: 138.3 },
	jordan: { lat: 30.6, lon: 36.2 },
	kazakhstan: { lat: 48.0, lon: 67.0 },
	kenya: { lat: -0.0, lon: 37.9 },
	kuwait: { lat: 29.3, lon: 47.5 },
	latvia: { lat: 56.9, lon: 24.6 },
	lebanon: { lat: 33.9, lon: 35.9 },
	lithuania: { lat: 55.2, lon: 23.9 },
	luxembourg: { lat: 49.8, lon: 6.1 },
	malaysia: { lat: 4.2, lon: 101.9 },
	mexico: { lat: 23.6, lon: -102.6 },
	moldova: { lat: 47.4, lon: 28.4 },
	morocco: { lat: 31.8, lon: -7.1 },
	myanmar: { lat: 21.9, lon: 95.9 },
	nepal: { lat: 28.4, lon: 84.1 },
	netherlands: { lat: 52.1, lon: 5.3 },
	"new zealand": { lat: -40.9, lon: 174.9 },
	nigeria: { lat: 9.1, lon: 8.7 },
	"north korea": { lat: 40.3, lon: 127.5 },
	"northern ireland": { lat: 54.8, lon: -6.5 },
	norway: { lat: 60.5, lon: 8.5 },
	oman: { lat: 21.5, lon: 55.9 },
	pakistan: { lat: 30.4, lon: 69.3 },
	palestine: { lat: 31.9, lon: 35.2 },
	panama: { lat: 8.5, lon: -80.8 },
	peru: { lat: -9.2, lon: -75.0 },
	philippines: { lat: 12.9, lon: 121.8 },
	poland: { lat: 51.9, lon: 19.1 },
	portugal: { lat: 39.4, lon: -8.2 },
	qatar: { lat: 25.4, lon: 51.2 },
	romania: { lat: 45.9, lon: 24.9 },
	russia: { lat: 61.5, lon: 105.3 },
	"saudi arabia": { lat: 23.9, lon: 45.1 },
	scotland: { lat: 56.5, lon: -4.2 },
	serbia: { lat: 44.0, lon: 21.0 },
	singapore: { lat: 1.4, lon: 103.8 },
	slovakia: { lat: 48.7, lon: 19.7 },
	slovenia: { lat: 46.2, lon: 14.8 },
	"south africa": { lat: -30.6, lon: 22.9 },
	"south korea": { lat: 35.9, lon: 127.8 },
	spain: { lat: 40.5, lon: -3.7 },
	"sri lanka": { lat: 7.9, lon: 80.8 },
	sudan: { lat: 12.9, lon: 30.2 },
	sweden: { lat: 60.1, lon: 18.6 },
	switzerland: { lat: 46.8, lon: 8.2 },
	syria: { lat: 34.8, lon: 39.0 },
	taiwan: { lat: 23.7, lon: 121.0 },
	thailand: { lat: 15.9, lon: 100.9 },
	turkey: { lat: 38.9, lon: 35.2 },
	ukraine: { lat: 48.4, lon: 31.2 },
	"united arab emirates": { lat: 23.4, lon: 53.8 },
	uae: { lat: 23.4, lon: 53.8 },
	"united kingdom": { lat: 55.4, lon: -3.4 },
	uk: { lat: 55.4, lon: -3.4 },
	"united states": { lat: 37.1, lon: -95.7 },
	usa: { lat: 37.1, lon: -95.7 },
	"united states of america": { lat: 37.1, lon: -95.7 },
	uruguay: { lat: -32.5, lon: -55.8 },
	venezuela: { lat: 6.4, lon: -66.6 },
	vietnam: { lat: 14.1, lon: 108.3 },
	wales: { lat: 52.1, lon: -3.8 },
	yemen: { lat: 15.6, lon: 48.5 },
	zambia: { lat: -13.1, lon: 27.8 },
	zimbabwe: { lat: -19.0, lon: 29.2 },
};

export function resolveCountry(name: string | undefined | null): {
	country: string;
	lat: number;
	lon: number;
} | null {
	if (!name) return null;
	const key = name.trim().toLowerCase();
	const hit = COUNTRY_COORDS[key];
	if (!hit) return null;
	return { country: name.trim(), lat: hit.lat, lon: hit.lon };
}

export function scoreToSeverity(score: number): Severity {
	if (score >= 9) return "critical";
	if (score >= 7) return "high";
	if (score >= 4) return "medium";
	if (score > 0) return "low";
	return "none";
}

export function latLonToVec3(lat: number, lon: number, radius: number) {
	const phi = (90 - lat) * (Math.PI / 180);
	const theta = (lon + 180) * (Math.PI / 180);
	return {
		x: -(radius * Math.sin(phi) * Math.cos(theta)),
		y: radius * Math.cos(phi),
		z: radius * Math.sin(phi) * Math.sin(theta),
	};
}
