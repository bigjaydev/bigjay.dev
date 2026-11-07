export type Headline = {
	title: string;
	source: string;
	url: string;
	published: string;
};

type RssItem = {
	title?: string;
	link?: string;
	pubDate?: string;
};

const SEARCH_NAMES: Record<string, string> = {
	"United States of America": "United States",
	"W. Sahara": "Western Sahara",
	"Dem. Rep. Congo": "Democratic Republic of the Congo",
	"Dominican Rep.": "Dominican Republic",
	"Falkland Is.": "Falkland Islands",
	"Fr. S. Antarctic Lands": "French Southern Territories",
	"Central African Rep.": "Central African Republic",
	"Eq. Guinea": "Equatorial Guinea",
	"Solomon Is.": "Solomon Islands",
	"N. Cyprus": "Northern Cyprus",
	"S. Sudan": "South Sudan",
	"Bosnia and Herz.": "Bosnia and Herzegovina",
};

const cache = new Map<string, Headline[]>();

function searchName(country: string) {
	return SEARCH_NAMES[country] ?? country;
}

function headlineFromItem(item: RssItem): Headline | null {
	const rawTitle = item.title?.trim() ?? "";
	const url = item.link?.trim() ?? "";
	if (!rawTitle || !url) return null;

	const separator = rawTitle.lastIndexOf(" - ");
	const title = separator > 0 ? rawTitle.slice(0, separator) : rawTitle;
	const source = separator > 0 ? rawTitle.slice(separator + 3) : "";

	return {
		title,
		source,
		url,
		published: item.pubDate?.trim() ?? "",
	};
}

export async function fetchHeadlines(country: string, signal: AbortSignal): Promise<Headline[]> {
	const cached = cache.get(country);
	if (cached) return cached;

	const googleRss = new URL("https://news.google.com/rss/search");
	googleRss.searchParams.set("q", `${searchName(country)} when:1d`);
	googleRss.searchParams.set("hl", "en-US");
	googleRss.searchParams.set("gl", "US");
	googleRss.searchParams.set("ceid", "US:en");

	const response = await fetch(
		`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(googleRss.toString())}`,
		{ signal },
	);
	if (!response.ok) throw new Error(`Headlines request failed (${response.status})`);

	const data = (await response.json()) as { status?: string; items?: RssItem[] };
	if (data.status !== "ok") throw new Error("Headlines feed could not be read");

	const headlines = (data.items ?? [])
		.slice(0, 8)
		.map(headlineFromItem)
		.filter((headline): headline is Headline => headline !== null);

	cache.set(country, headlines);
	return headlines;
}

export function formatPublished(published: string) {
	const date = new Date(published);
	if (Number.isNaN(date.valueOf())) return "";
	return date.toLocaleString("en-AU", {
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
	});
}
