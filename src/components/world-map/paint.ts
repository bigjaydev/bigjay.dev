import type { Country, Ring } from "./countries";

export const MAP_WIDTH = 2048;
export const MAP_HEIGHT = 1024;

const OCEAN = "#1a2624";
const BORDER = "rgba(83, 78, 80, 0.72)";
const HIGHLIGHT = "#fecef5";

export type WorldMapCanvas = {
	countries: Country[];
	base: HTMLCanvasElement;
	display: HTMLCanvasElement;
	pixels: Uint8ClampedArray;
	byName: Map<string, Country>;
};

function landColor(name: string): string {
	let hash = 0;
	for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
	const hue = 22 + (hash % 16);
	const saturation = 16 + (hash % 14);
	const lightness = 74 + (hash % 8);
	return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function unwrap(ring: Ring): Ring {
	const [firstLon, firstLat] = ring[0];
	const points: Ring = [[firstLon, firstLat]];
	let previous = firstLon;

	for (let index = 1; index < ring.length; index++) {
		let lon = ring[index][0];
		const lat = ring[index][1];
		while (lon - previous > 180) lon -= 360;
		while (previous - lon > 180) lon += 360;
		points.push([lon, lat]);
		previous = lon;
	}

	return points;
}

function project(lon: number, lat: number): [number, number] {
	return [((lon + 180) / 360) * MAP_WIDTH, ((90 - lat) / 180) * MAP_HEIGHT];
}

function tracePolygon(ctx: CanvasRenderingContext2D, rings: Ring[], shift: number) {
	ctx.beginPath();
	for (const ring of rings) {
		ring.forEach(([lon, lat], index) => {
			const [x, y] = project(lon + shift, lat);
			if (index === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.closePath();
	}
}

function drawPolygon(
	ctx: CanvasRenderingContext2D,
	rings: Ring[],
	options: { fill: boolean; stroke: boolean },
) {
	const unwrapped = rings.map(unwrap);
	const longitudes = unwrapped[0].map(([lon]) => lon);
	const min = Math.min(...longitudes);
	const max = Math.max(...longitudes);
	const shifts = [0];
	if (max > 180) shifts.push(-360);
	if (min < -180) shifts.push(360);

	for (const shift of shifts) {
		tracePolygon(ctx, unwrapped, shift);
		if (options.fill) ctx.fill("evenodd");
		if (options.stroke) ctx.stroke();
	}
}

function drawGraticule(ctx: CanvasRenderingContext2D) {
	ctx.save();
	ctx.strokeStyle = "rgba(254, 206, 245, 0.16)";
	ctx.lineWidth = 1;
	for (let lon = -150; lon < 180; lon += 30) {
		const [x] = project(lon, 0);
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, MAP_HEIGHT);
		ctx.stroke();
	}
	for (let lat = -60; lat <= 60; lat += 30) {
		const [, y] = project(0, lat);
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(MAP_WIDTH, y);
		ctx.stroke();
	}
	ctx.restore();
}

function paintCountries(
	ctx: CanvasRenderingContext2D,
	countries: Country[],
	colorFor: (country: Country, index: number) => string,
	stroke: "border" | "fill" | "none",
) {
	ctx.lineJoin = "round";
	ctx.lineWidth = stroke === "fill" ? 2.4 : 1.4;
	countries.forEach((country, index) => {
		const color = colorFor(country, index);
		ctx.fillStyle = color;
		ctx.strokeStyle = stroke === "fill" ? color : BORDER;
		for (const rings of country.polygons) {
			drawPolygon(ctx, rings, { fill: true, stroke: stroke !== "none" });
		}
	});
}

export function createWorldMap(countries: Country[]): WorldMapCanvas {
	const base = document.createElement("canvas");
	base.width = MAP_WIDTH;
	base.height = MAP_HEIGHT;
	const baseCtx = base.getContext("2d");
	if (!baseCtx) throw new Error("Could not create the world map canvas");

	baseCtx.fillStyle = OCEAN;
	baseCtx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
	drawGraticule(baseCtx);
	paintCountries(baseCtx, countries, (country) => landColor(country.name), "border");

	const display = document.createElement("canvas");
	display.width = MAP_WIDTH;
	display.height = MAP_HEIGHT;
	display.getContext("2d")?.drawImage(base, 0, 0);

	const pick = document.createElement("canvas");
	pick.width = MAP_WIDTH;
	pick.height = MAP_HEIGHT;
	const pickCtx = pick.getContext("2d", { willReadFrequently: true });
	if (!pickCtx) throw new Error("Could not create the world map pick canvas");
	pickCtx.fillStyle = "#000";
	pickCtx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
	paintCountries(pickCtx, countries, (_country, index) => `rgb(${index + 1}, 0, 0)`, "fill");

	return {
		countries,
		base,
		display,
		pixels: pickCtx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT).data,
		byName: new Map(countries.map((country) => [country.name, country])),
	};
}

export function paintHighlight(map: WorldMapCanvas, name: string | null) {
	const ctx = map.display.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
	ctx.drawImage(map.base, 0, 0);
	const country = name ? map.byName.get(name) : undefined;
	if (!country) return;

	ctx.fillStyle = HIGHLIGHT;
	ctx.strokeStyle = "#534e50";
	ctx.lineWidth = 1.8;
	ctx.lineJoin = "round";
	for (const rings of country.polygons) {
		drawPolygon(ctx, rings, { fill: true, stroke: true });
	}
}

export function countryAt(map: WorldMapCanvas, lon: number, lat: number): string | null {
	const x = Math.min(MAP_WIDTH - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MAP_WIDTH)));
	const y = Math.min(MAP_HEIGHT - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MAP_HEIGHT)));
	const id = map.pixels[(y * MAP_WIDTH + x) * 4];
	if (!id) return null;
	return map.countries[id - 1]?.name ?? null;
}
