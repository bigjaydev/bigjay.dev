export type Ring = [number, number][];

export type Country = {
	name: string;
	polygons: Ring[][];
};

type Topology = {
	transform: { scale: number[]; translate: number[] };
	arcs: number[][][];
	objects: {
		countries: {
			geometries: {
				type: string;
				arcs: number[][] | number[][][];
				properties: { name: string };
			}[];
		};
	};
};

function decodeArc(topology: Topology, index: number): Ring {
	const reverse = index < 0;
	const arc = topology.arcs[reverse ? ~index : index];
	const scaleX = topology.transform.scale[0];
	const scaleY = topology.transform.scale[1];
	const translateX = topology.transform.translate[0];
	const translateY = topology.transform.translate[1];
	let x = 0;
	let y = 0;
	const points: Ring = [];

	for (const pair of arc) {
		x += pair[0];
		y += pair[1];
		points.push([x * scaleX + translateX, y * scaleY + translateY]);
	}

	if (reverse) points.reverse();
	return points;
}

function stitch(topology: Topology, indexes: number[]): Ring {
	const points: Ring = [];
	indexes.forEach((index, position) => {
		const arc = decodeArc(topology, index);
		points.push(...(position === 0 ? arc : arc.slice(1)));
	});
	return points;
}

function ringsFromPolygon(topology: Topology, rings: number[][]): Ring[] {
	return rings
		.map((indexes) => stitch(topology, indexes))
		.filter((ring) => ring.length >= 3);
}

function ringArea(ring: Ring): number {
	let area = 0;
	for (let index = 0; index < ring.length; index++) {
		const [x1, y1] = ring[index];
		const [x2, y2] = ring[(index + 1) % ring.length];
		area += x1 * y2 - x2 * y1;
	}
	return Math.abs(area / 2);
}

export function decodeCountries(topology: Topology): Country[] {
	const countries = topology.objects.countries.geometries.map((geometry) => {
		const polygons =
			geometry.type === "Polygon"
				? [ringsFromPolygon(topology, geometry.arcs as number[][])]
				: (geometry.arcs as number[][][]).map((polygon) => ringsFromPolygon(topology, polygon));

		return {
			name: geometry.properties.name,
			polygons: polygons.filter((rings) => rings.length > 0),
		};
	});

	return countries
		.filter((country) => country.polygons.length > 0)
		.sort((a, b) => {
			const area = (country: Country) =>
				country.polygons.reduce((sum, rings) => sum + ringArea(rings[0]), 0);
			return area(b) - area(a);
		});
}
