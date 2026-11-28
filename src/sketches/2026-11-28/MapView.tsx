import { useEffect, useMemo, useRef, useState } from "react";
import {
	Map as MapLibreMap,
	NavigationControl,
	Popup,
	setWorkerUrl,
	type GeoJSONSource,
	type MapMouseEvent,
	type StyleSpecification,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GarageSale, MapCamera } from "./api";
import { AU_BOUNDS, bboxFromLngLatBounds, inBBox, type BBox, type LngLat } from "./geo";

setWorkerUrl(maplibreWorkerUrl);

type SaleFeatureCollection = {
	type: "FeatureCollection";
	features: Array<{
		type: "Feature";
		id: number;
		properties: {
			id: number;
			title: string;
			inTrail: number;
			selected: number;
			hovered: number;
		};
		geometry: { type: "Point"; coordinates: [number, number] };
	}>;
};

type Props = {
	sales: GarageSale[];
	trailIds: number[];
	selectedId: number | null;
	hoveredId: number | null;
	routeLine: LngLat[];
	onSelect: (id: number) => void;
	onHover: (id: number | null) => void;
	onVisibleChange: (ids: number[]) => void;
	onCameraChange?: (camera: MapCamera) => void;
	initialCamera?: MapCamera | null;
	focusId?: number | null;
};

const SOURCE = "rummage-sales";
const LAYER = "rummage-sales-circle";
const LAYER_TRAIL = "rummage-sales-trail";
const LAYER_SELECTED = "rummage-sales-selected";
const LAYER_HOVERED = "rummage-sales-hovered";
const ROUTE_SOURCE = "rummage-route";
const ROUTE_LAYER = "rummage-route-line";

const BASE_STYLE: StyleSpecification = {
	version: 8,
	sources: {
		osm: {
			type: "raster",
			tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
			tileSize: 256,
			attribution:
				'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			maxzoom: 19,
		},
	},
	layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function MapView({
	sales,
	trailIds,
	selectedId,
	hoveredId,
	routeLine,
	onSelect,
	onHover,
	onVisibleChange,
	onCameraChange,
	initialCamera = null,
	focusId = null,
}: Props) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibreMap | null>(null);
	const popupRef = useRef<Popup | null>(null);
	const readyRef = useRef(false);
	const initialCameraRef = useRef(initialCamera);
	const [mapError, setMapError] = useState<string | null>(null);
	const trailSet = useMemo(() => new Set(trailIds), [trailIds]);

	const propsRef = useRef({
		sales,
		trailSet,
		onSelect,
		onHover,
		onVisibleChange,
		onCameraChange,
		selectedId,
		hoveredId,
	});
	propsRef.current = {
		sales,
		trailSet,
		onSelect,
		onHover,
		onVisibleChange,
		onCameraChange,
		selectedId,
		hoveredId,
	};

	const geojson = useMemo((): SaleFeatureCollection => {
		return {
			type: "FeatureCollection",
			features: sales.map((s) => ({
				type: "Feature" as const,
				id: s.id,
				properties: {
					id: s.id,
					title: s.title,
					inTrail: trailSet.has(s.id) ? 1 : 0,
					selected: s.id === selectedId ? 1 : 0,
					hovered: s.id === hoveredId ? 1 : 0,
				},
				geometry: {
					type: "Point" as const,
					coordinates: [s.lon, s.lat] as [number, number],
				},
			})),
		};
	}, [sales, trailSet, selectedId, hoveredId]);
	const geojsonRef = useRef(geojson);
	geojsonRef.current = geojson;

	const routeGeo = useMemo(() => {
		if (routeLine.length < 2) {
			return {
				type: "FeatureCollection" as const,
				features: [] as Array<{
					type: "Feature";
					geometry: { type: "LineString"; coordinates: [number, number][] };
					properties: Record<string, never>;
				}>,
			};
		}
		return {
			type: "FeatureCollection" as const,
			features: [
				{
					type: "Feature" as const,
					properties: {},
					geometry: {
						type: "LineString" as const,
						coordinates: routeLine.map((p) => [p.lon, p.lat] as [number, number]),
					},
				},
			],
		};
	}, [routeLine]);
	const routeGeoRef = useRef(routeGeo);
	routeGeoRef.current = routeGeo;

	useEffect(() => {
		const el = wrapRef.current;
		if (!el || mapRef.current) return;

		const saved = initialCameraRef.current;
		const map = new MapLibreMap({
			container: el,
			style: BASE_STYLE,
			...(saved
				? { center: saved.center, zoom: saved.zoom }
				: {
						bounds: [
							[AU_BOUNDS.west, AU_BOUNDS.south],
							[AU_BOUNDS.east, AU_BOUNDS.north],
						] as [[number, number], [number, number]],
						fitBoundsOptions: { padding: 36 },
					}),
			attributionControl: { compact: true },
			cooperativeGestures: false,
		});
		mapRef.current = map;

		const popup = new Popup({
			closeButton: false,
			closeOnClick: false,
			offset: 12,
			className: "rummage-map-popup",
		});
		popupRef.current = popup;

		map.addControl(
			new NavigationControl({ visualizePitch: false, showCompass: false }),
			"top-right",
		);

		const reportVisible = () => {
			const m = mapRef.current;
			if (!m || !readyRef.current) return;
			const box = bboxFromLngLatBounds(m.getBounds());
			const ids = propsRef.current.sales
				.filter((s) => inBBox(s.lon, s.lat, box))
				.map((s) => s.id);
			propsRef.current.onVisibleChange(ids);
		};

		const reportCamera = () => {
			const m = mapRef.current;
			if (!m || !readyRef.current) return;
			const c = m.getCenter();
			propsRef.current.onCameraChange?.({
				center: [c.lng, c.lat],
				zoom: m.getZoom(),
			});
		};

		const addLayers = () => {
			if (!map.getSource(ROUTE_SOURCE)) {
				map.addSource(ROUTE_SOURCE, {
					type: "geojson",
					data: routeGeoRef.current,
				});
				map.addLayer({
					id: ROUTE_LAYER,
					type: "line",
					source: ROUTE_SOURCE,
					paint: {
						"line-color": "#ffcc33",
						"line-width": 3.5,
						"line-opacity": 0.85,
						"line-dasharray": [1.2, 1.4],
					},
				});
			}

			if (!map.getSource(SOURCE)) {
				map.addSource(SOURCE, {
					type: "geojson",
					data: geojsonRef.current,
					promoteId: "id",
				});

				map.addLayer({
					id: LAYER,
					type: "circle",
					source: SOURCE,
					paint: {
						"circle-radius": [
							"interpolate",
							["linear"],
							["zoom"],
							3,
							4,
							7,
							7,
							12,
							11,
						],
						"circle-color": [
							"case",
							["==", ["get", "inTrail"], 1],
							"#ffcc33",
							"#ff5a36",
						],
						"circle-stroke-width": 1.75,
						"circle-stroke-color": "#f7f4ec",
						"circle-opacity": 1,
					},
				});

				map.addLayer({
					id: LAYER_TRAIL,
					type: "circle",
					source: SOURCE,
					filter: ["==", ["get", "inTrail"], 1],
					paint: {
						"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 9, 10, 13, 14, 17],
						"circle-color": "transparent",
						"circle-stroke-width": 2.25,
						"circle-stroke-color": "#ffcc33",
					},
				});

				map.addLayer({
					id: LAYER_HOVERED,
					type: "circle",
					source: SOURCE,
					filter: ["==", ["get", "hovered"], 1],
					paint: {
						"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 10, 10, 14, 14, 18],
						"circle-color": "transparent",
						"circle-stroke-width": 2.25,
						"circle-stroke-color": "#eef3f7",
					},
				});

				map.addLayer({
					id: LAYER_SELECTED,
					type: "circle",
					source: SOURCE,
					filter: ["==", ["get", "selected"], 1],
					paint: {
						"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 11, 10, 15, 14, 19],
						"circle-color": "transparent",
						"circle-stroke-width": 2.5,
						"circle-stroke-color": "#ff5a36",
					},
				});
			} else {
				(map.getSource(SOURCE) as GeoJSONSource).setData(geojsonRef.current);
				(map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData(routeGeoRef.current);
			}

			readyRef.current = true;
			setMapError(null);
			requestAnimationFrame(() => {
				map.resize();
				reportVisible();
			});
		};

		map.on("load", addLayers);
		map.on("error", (e) => {
			const msg = e.error?.message;
			if (msg) setMapError(msg);
		});
		map.on("moveend", () => {
			reportVisible();
			reportCamera();
		});
		map.on("zoomend", () => {
			reportVisible();
			reportCamera();
		});

		const featureId = (
			e: MapMouseEvent & {
				features?: Array<{ properties?: { id?: number | string; title?: string } }>;
			},
		): number | null => {
			const id = e.features?.[0]?.properties?.id;
			if (typeof id === "number") return id;
			if (typeof id === "string") return Number(id);
			return null;
		};

		map.on("mouseenter", LAYER, (e) => {
			map.getCanvas().style.cursor = "pointer";
			const id = featureId(e);
			if (id != null) propsRef.current.onHover(id);
		});
		map.on("mousemove", LAYER, (e) => {
			const id = featureId(e);
			if (id != null && id !== propsRef.current.hoveredId) {
				propsRef.current.onHover(id);
			}
		});
		map.on("mouseleave", LAYER, () => {
			map.getCanvas().style.cursor = "";
			propsRef.current.onHover(null);
		});
		map.on("click", LAYER, (e) => {
			const id = featureId(e);
			if (id != null) propsRef.current.onSelect(id);
		});

		const ro = new ResizeObserver(() => map.resize());
		ro.observe(el);

		return () => {
			readyRef.current = false;
			ro.disconnect();
			popup.remove();
			popupRef.current = null;
			map.remove();
			mapRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !readyRef.current) return;
		const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
		if (!src) return;
		src.setData(geojson);
		const box = bboxFromLngLatBounds(map.getBounds());
		onVisibleChange(sales.filter((s) => inBBox(s.lon, s.lat, box)).map((s) => s.id));
	}, [geojson, sales, onVisibleChange]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !readyRef.current) return;
		const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
		src?.setData(routeGeo);
	}, [routeGeo]);

	useEffect(() => {
		const map = mapRef.current;
		const popup = popupRef.current;
		if (!map || !popup || !readyRef.current) return;
		if (hoveredId == null) {
			popup.remove();
			return;
		}
		const sale = sales.find((s) => s.id === hoveredId);
		if (!sale) {
			popup.remove();
			return;
		}
		popup
			.setLngLat([sale.lon, sale.lat])
			.setHTML(`<strong>${escapeHtml(sale.title)}</strong><br/><span>${escapeHtml(sale.suburb)}</span>`)
			.addTo(map);
	}, [hoveredId, sales]);

	useEffect(() => {
		if (focusId == null) return;
		const map = mapRef.current;
		const sale = sales.find((s) => s.id === focusId);
		if (!map || !sale || !readyRef.current) return;
		const box = bboxFromLngLatBounds(map.getBounds());
		if (inBBox(sale.lon, sale.lat, box as BBox) && map.getZoom() >= 8) return;
		map.flyTo({
			center: [sale.lon, sale.lat],
			zoom: Math.max(map.getZoom(), 10),
			essential: true,
		});
	}, [focusId, sales]);

	const resetView = () => {
		mapRef.current?.fitBounds(
			[
				[AU_BOUNDS.west, AU_BOUNDS.south],
				[AU_BOUNDS.east, AU_BOUNDS.north],
			],
			{ padding: 36, duration: 600 },
		);
	};

	return (
		<div className="rummage-map-wrap">
			<div ref={wrapRef} className="rummage-map-canvas" />
			<div className="rummage-map-ui">
				<button type="button" className="rummage-reset" aria-label="Reset to Australia" onClick={resetView}>
					↺ Australia
				</button>
			</div>
			{mapError && <div className="rummage-map-err">{mapError}</div>}
		</div>
	);
}

function escapeHtml(s: string) {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
