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
import type { Campground, MapCamera, NightStatus } from "./api";
import { bboxFromLngLatBounds, inBBox, WA_BOUNDS, type BBox } from "./geo";

/** Vite rewrites import.meta.url; GeoJSON circles need an explicit worker. */
setWorkerUrl(maplibreWorkerUrl);

type CampFeatureCollection = {
	type: "FeatureCollection";
	features: Array<{
		type: "Feature";
		id: number;
		properties: {
			id: number;
			name: string;
			status: PinStatus;
			selected: number;
			hovered: number;
		};
		geometry: { type: "Point"; coordinates: [number, number] };
	}>;
};

export type PinStatus = NightStatus | "pending";

type Props = {
	camps: Campground[];
	statusOf: (c: Campground) => PinStatus;
	selectedId: number | null;
	hoveredId: number | null;
	onSelect: (id: number) => void;
	onHover: (id: number | null) => void;
	onVisibleChange: (ids: number[], bbox: BBox) => void;
	onCameraChange?: (camera: MapCamera) => void;
	initialCamera?: MapCamera | null;
	filter: (c: Campground) => boolean;
	focusId?: number | null;
};

const STATUS_COLOR: Record<PinStatus, string> = {
	full: "#3ecf8e",
	partial: "#e0a84a",
	none: "#c45b5b",
	info: "#6a8f9e",
	pending: "#6a7a74",
};

const SOURCE = "pitch-camps";
const LAYER = "pitch-camps-circle";
const LAYER_SELECTED = "pitch-camps-selected";
const LAYER_HOVERED = "pitch-camps-hovered";

/**
 * Free raster basemap with town names — no API key, no MapLibre worker.
 * OSM tiles + attribution (required).
 */
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
	camps,
	statusOf,
	selectedId,
	hoveredId,
	onSelect,
	onHover,
	onVisibleChange,
	onCameraChange,
	initialCamera = null,
	filter,
	focusId = null,
}: Props) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibreMap | null>(null);
	const popupRef = useRef<Popup | null>(null);
	const readyRef = useRef(false);
	const initialCameraRef = useRef(initialCamera);
	const [mapError, setMapError] = useState<string | null>(null);
	const propsRef = useRef({
		camps,
		statusOf,
		filter,
		onSelect,
		onHover,
		onVisibleChange,
		onCameraChange,
		selectedId,
		hoveredId,
	});
	propsRef.current = {
		camps,
		statusOf,
		filter,
		onSelect,
		onHover,
		onVisibleChange,
		onCameraChange,
		selectedId,
		hoveredId,
	};

	const geojson = useMemo((): CampFeatureCollection => {
		return {
			type: "FeatureCollection",
			features: camps.filter(filter).map((c) => {
				const status = statusOf(c);
				return {
					type: "Feature" as const,
					id: c.id,
					properties: {
						id: c.id,
						name: c.name,
						status,
						selected: c.id === selectedId ? 1 : 0,
						hovered: c.id === hoveredId ? 1 : 0,
					},
					geometry: {
						type: "Point" as const,
						coordinates: [c.lon, c.lat] as [number, number],
					},
				};
			}),
		};
	}, [camps, filter, statusOf, selectedId, hoveredId]);
	const geojsonRef = useRef(geojson);
	geojsonRef.current = geojson;

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
							[WA_BOUNDS.west, WA_BOUNDS.south],
							[WA_BOUNDS.east, WA_BOUNDS.north],
						] as [[number, number], [number, number]],
						fitBoundsOptions: { padding: 28 },
					}),
			attributionControl: { compact: true },
			cooperativeGestures: false,
		});
		mapRef.current = map;

		const popup = new Popup({
			closeButton: false,
			closeOnClick: false,
			offset: 12,
			className: "pitch-map-popup",
		});
		popupRef.current = popup;

		map.addControl(
			new NavigationControl({
				visualizePitch: false,
				showCompass: false,
			}),
			"top-right",
		);

		const reportVisible = () => {
			const m = mapRef.current;
			if (!m || !readyRef.current) return;
			const { camps: list, filter: f, onVisibleChange: emit } = propsRef.current;
			const box = bboxFromLngLatBounds(m.getBounds());
			const ids = list.filter((c) => f(c) && inBBox(c.lon, c.lat, box)).map((c) => c.id);
			emit(ids, box);
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

		const addCampLayers = () => {
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
							4,
							4.5,
							7,
							7,
							11,
							10,
							14,
							13,
						],
						"circle-color": [
							"match",
							["get", "status"],
							"full",
							STATUS_COLOR.full,
							"partial",
							STATUS_COLOR.partial,
							"none",
							STATUS_COLOR.none,
							"info",
							STATUS_COLOR.info,
							STATUS_COLOR.pending,
						],
						"circle-stroke-width": 1.75,
						"circle-stroke-color": "#f4f7f4",
						"circle-opacity": 1,
					},
				});

				map.addLayer({
					id: LAYER_HOVERED,
					type: "circle",
					source: SOURCE,
					filter: ["==", ["get", "hovered"], 1],
					paint: {
						"circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 10, 10, 14, 14, 18],
						"circle-color": "transparent",
						"circle-stroke-width": 2.25,
						"circle-stroke-color": "#e8f0ec",
						"circle-opacity": 1,
					},
				});

				map.addLayer({
					id: LAYER_SELECTED,
					type: "circle",
					source: SOURCE,
					filter: ["==", ["get", "selected"], 1],
					paint: {
						"circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 11, 10, 15, 14, 19],
						"circle-color": "transparent",
						"circle-stroke-width": 2.5,
						"circle-stroke-color": [
							"match",
							["get", "status"],
							"full",
							STATUS_COLOR.full,
							"partial",
							STATUS_COLOR.partial,
							"none",
							STATUS_COLOR.none,
							"info",
							STATUS_COLOR.info,
							STATUS_COLOR.pending,
						],
					},
				});
			} else {
				(map.getSource(SOURCE) as GeoJSONSource).setData(geojsonRef.current);
			}

			readyRef.current = true;
			setMapError(null);
			requestAnimationFrame(() => {
				map.resize();
				reportVisible();
			});
		};

		map.on("load", addCampLayers);
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
			e: MapMouseEvent & { features?: Array<{ properties?: { id?: number | string; name?: string } }> },
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

		map.on(
			"click",
			LAYER,
			(e: MapMouseEvent & { features?: Array<{ properties?: { id?: number | string } }> }) => {
				const id = featureId(e);
				if (id != null) propsRef.current.onSelect(id);
			},
		);

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
		const ids = camps.filter((c) => filter(c) && inBBox(c.lon, c.lat, box)).map((c) => c.id);
		onVisibleChange(ids, box);
	}, [geojson, camps, filter, onVisibleChange]);

	useEffect(() => {
		const map = mapRef.current;
		const popup = popupRef.current;
		if (!map || !popup || !readyRef.current) return;
		if (hoveredId == null) {
			popup.remove();
			return;
		}
		const camp = camps.find((c) => c.id === hoveredId);
		if (!camp) {
			popup.remove();
			return;
		}
		popup
			.setLngLat([camp.lon, camp.lat])
			.setHTML(`<strong>${escapeHtml(camp.name)}</strong>`)
			.addTo(map);
	}, [hoveredId, camps]);

	useEffect(() => {
		if (focusId == null) return;
		const map = mapRef.current;
		const camp = camps.find((c) => c.id === focusId);
		if (!map || !camp || !readyRef.current) return;
		const box = bboxFromLngLatBounds(map.getBounds());
		if (inBBox(camp.lon, camp.lat, box)) return;
		map.flyTo({
			center: [camp.lon, camp.lat],
			zoom: Math.max(map.getZoom(), 8.5),
			essential: true,
		});
	}, [focusId, camps]);

	const resetView = () => {
		mapRef.current?.fitBounds(
			[
				[WA_BOUNDS.west, WA_BOUNDS.south],
				[WA_BOUNDS.east, WA_BOUNDS.north],
			],
			{ padding: 28, duration: 600 },
		);
	};

	return (
		<div className="pitch-map-wrap">
			<div ref={wrapRef} className="pitch-map-canvas" />
			<div className="pitch-map-ui">
				<button type="button" className="pitch-reset" aria-label="Reset to Western Australia" onClick={resetView}>
					↺ Reset WA
				</button>
			</div>
			{mapError && <div className="pitch-map-err">{mapError}</div>}
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
