export type BBox = {
	west: number;
	south: number;
	east: number;
	north: number;
};

export type LngLat = { lat: number; lon: number };

/** Mainland + Tasmania framing for MapLibre fitBounds. */
export const AU_BOUNDS: BBox = {
	west: 112.5,
	south: -44.2,
	east: 154.2,
	north: -9.5,
};

export function bboxFromLngLatBounds(bounds: {
	getWest(): number;
	getSouth(): number;
	getEast(): number;
	getNorth(): number;
}): BBox {
	return {
		west: bounds.getWest(),
		south: bounds.getSouth(),
		east: bounds.getEast(),
		north: bounds.getNorth(),
	};
}

export function inBBox(lon: number, lat: number, box: BBox) {
	return lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north;
}

function haversineKm(a: LngLat, b: LngLat) {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest-neighbour order from an optional start (or the first stop). */
export function orderNearestNeighbor<T extends LngLat>(
	stops: T[],
	origin?: LngLat | null,
): T[] {
	if (stops.length <= 1) return [...stops];
	const remaining = [...stops];
	const ordered: T[] = [];
	let cursor: LngLat = origin ?? remaining[0];

	if (!origin) {
		ordered.push(remaining.shift()!);
		cursor = ordered[0];
	}

	while (remaining.length) {
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < remaining.length; i++) {
			const d = haversineKm(cursor, remaining[i]);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		const next = remaining.splice(best, 1)[0];
		ordered.push(next);
		cursor = next;
	}
	return ordered;
}

/**
 * Google Maps directions URL.
 * Origin → waypoints → destination. Caps intermediate waypoints at 8.
 */
export function googleMapsRouteUrl(
	stops: LngLat[],
	origin?: LngLat | null,
): string | null {
	const pts = origin ? [origin, ...stops] : stops;
	if (pts.length === 0) return null;
	if (pts.length === 1) {
		return `https://www.google.com/maps/search/?api=1&query=${pts[0].lat},${pts[0].lon}`;
	}

	const start = pts[0];
	const end = pts[pts.length - 1];
	const mid = pts.slice(1, -1).slice(0, 8);
	const params = new URLSearchParams({
		api: "1",
		travelmode: "driving",
		origin: `${start.lat},${start.lon}`,
		destination: `${end.lat},${end.lon}`,
	});
	if (mid.length) {
		params.set("waypoints", mid.map((p) => `${p.lat},${p.lon}`).join("|"));
	}
	return `https://www.google.com/maps/dir/?${params.toString()}`;
}
