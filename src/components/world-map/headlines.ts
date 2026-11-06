export type Headline = {
	title: string;
	source: string;
	url: string;
	published: string;
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

function headlineFromItem(item: Element): Headline | null {
	const rawTitle = item.querySelector("title")?.textContent?.trim() ?? "";
	const source = item.querySelector("source")?.textContent?.trim() ?? "";
	const url = item.querySelector("link")?.textContent?.trim() ?? "";
	if (!rawTitle || !url) return null;
	const suffix = source ? ` - ${source}` : "";
	const title = suffix && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle;
	return {
		title,
		source,
		url,
		published: item.querySelector("pubDate")?.textContent?.trim() ?? "",
	};
}

export async function fetchHeadlines(country: string, signal: AbortSignal): Promise<Headline[]> {
	const cached = cache.get(country);
	if (cached) return cached;

	const query = `${searchName(country)} when:1d`;
	const response = await fetch(
		`/google-news/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
		{ signal },
	);
	if (!response.ok) throw new Error(`Headlines request failed (${response.status})`);

	const xml = await response.text();
	const document = new DOMParser().parseFromString(xml, "text/xml");
	if (document.querySelector("parsererror")) throw new Error("Headlines feed could not be read");

	const headlines = [...document.querySelectorAll("item")]
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
