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
