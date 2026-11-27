export type LonLat = { lon: number; lat: number };
export type BBox = { west: number; south: number; east: number; north: number };

/** Initial view: Western Australia. */
export const WA_BOUNDS: BBox = {
	west: 112.5,
	south: -35.6,
	east: 129.5,
	north: -13.5,
};

export function inBBox(lon: number, lat: number, box: BBox) {
	return lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north;
}

export function bboxFromLngLatBounds(b: {
	getWest(): number;
	getSouth(): number;
	getEast(): number;
	getNorth(): number;
}): BBox {
	return {
		west: b.getWest(),
		south: b.getSouth(),
		east: b.getEast(),
		north: b.getNorth(),
	};
}
