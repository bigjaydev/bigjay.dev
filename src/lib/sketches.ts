type SketchLike = {
	id: string;
	data: { pubDate: Date };
};

/** Newest first. Same-day lettered slugs (2026-11-20b) rank above the plain date. */
export function byNewest(a: SketchLike, b: SketchLike) {
	const byDate = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
	if (byDate !== 0) return byDate;
	return b.id.localeCompare(a.id);
}

/** Oldest first. Same-day lettered slugs come after the plain date. */
export function byOldest(a: SketchLike, b: SketchLike) {
	return -byNewest(a, b);
}

export function thumbnailPath(id: string): string {
	return `/thumbnails/${id}.png`;
}

/** Back / mid / front parallax layers for a sketch listing card. */
export function thumbnailLayers(id: string): [string, string, string] {
	return [`/thumbnails/${id}-0.png`, `/thumbnails/${id}-1.png`, `/thumbnails/${id}-2.png`];
}
