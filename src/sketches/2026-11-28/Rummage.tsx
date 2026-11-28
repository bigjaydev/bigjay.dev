import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	addDaysIso,
	australiaToday,
	fetchSales,
	formatAddress,
	formatDayLabel,
	formatTimeRange,
	loadUiPrefs,
	peekSales,
	saleOnDay,
	saveUiPrefs,
	type GarageSale,
	type MapCamera,
} from "./api";
import { googleMapsRouteUrl, orderNearestNeighbor, type LngLat } from "./geo";
import MapView from "./MapView";

const FONT =
	"@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Figtree:wght@400;500;600;700&display=swap');";

function weekdayShort(iso: string) {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
		weekday: "short",
		timeZone: "UTC",
	});
}

export default function Rummage() {
	const prefs = useMemo(() => loadUiPrefs(), []);
	const today = useMemo(() => australiaToday(), []);
	const [day, setDay] = useState(prefs?.day && prefs.day >= today ? prefs.day : today);
	const [sales, setSales] = useState<GarageSale[]>(() => peekSales()?.data.sales ?? []);
	const [windowToday, setWindowToday] = useState(today);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [trailIds, setTrailIds] = useState<number[]>(() => prefs?.trailIds ?? []);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [hoveredId, setHoveredId] = useState<number | null>(null);
	const [focusId, setFocusId] = useState<number | null>(null);
	const [visibleIds, setVisibleIds] = useState<number[]>([]);
	const [query, setQuery] = useState("");
	const [useMyLocation, setUseMyLocation] = useState(prefs?.useMyLocation ?? false);
	const [origin, setOrigin] = useState<LngLat | null>(null);
	const [geoError, setGeoError] = useState<string | null>(null);
	const hoverFromMap = useRef(false);
	const listRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
	const savedCamera = prefs?.camera ?? null;

	useEffect(() => {
		let cancelled = false;
		const from = today;
		const to = addDaysIso(today, 21);
		setLoading(true);
		fetchSales(from, to)
			.then((res) => {
				if (cancelled) return;
				setSales(res.sales);
				setWindowToday(res.today || today);
				if (res.error) setError(res.error);
				else setError(null);
			})
			.catch((err) => {
				if (cancelled) return;
				const peek = peekSales();
				if (peek?.data.sales?.length) {
					setSales(peek.data.sales);
					setError(err instanceof Error ? err.message : "Using cached listings");
				} else {
					setError(err instanceof Error ? err.message : "Failed to load sales");
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [today]);

	useEffect(() => {
		saveUiPrefs({ day, trailIds, useMyLocation });
	}, [day, trailIds, useMyLocation]);

	useEffect(() => {
		if (!useMyLocation) {
			setOrigin(null);
			setGeoError(null);
			return;
		}
		if (!navigator.geolocation) {
			setGeoError("Geolocation not available");
			setUseMyLocation(false);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude });
				setGeoError(null);
			},
			() => {
				setGeoError("Couldn’t get your location");
				setUseMyLocation(false);
				setOrigin(null);
			},
			{ enableHighAccuracy: true, timeout: 12_000 },
		);
	}, [useMyLocation]);

	useEffect(() => {
		if (hoveredId == null || !hoverFromMap.current) return;
		listRefs.current.get(hoveredId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [hoveredId]);

	const dayCounts = useMemo(() => {
		const map = new Map<string, number>();
		for (const s of sales) {
			const cursor = new Date(s.start + "T00:00:00Z");
			const end = new Date(s.end + "T00:00:00Z");
			while (cursor <= end) {
				const key = cursor.toISOString().slice(0, 10);
				map.set(key, (map.get(key) ?? 0) + 1);
				cursor.setUTCDate(cursor.getUTCDate() + 1);
			}
		}
		return map;
	}, [sales]);

	const dayChips = useMemo(() => {
		const chips: string[] = [];
		for (let i = 0; i < 14; i++) chips.push(addDaysIso(windowToday, i));
		return chips;
	}, [windowToday]);

	const daySales = useMemo(() => {
		const q = query.trim().toLowerCase();
		return sales
			.filter((s) => saleOnDay(s, day))
			.filter((s) => {
				if (!q) return true;
				return (
					s.title.toLowerCase().includes(q) ||
					s.suburb.toLowerCase().includes(q) ||
					s.state.toLowerCase().includes(q) ||
					s.postcode.includes(q) ||
					s.street.toLowerCase().includes(q)
				);
			})
			.sort((a, b) => {
				const ta = a.startTime || "99:99";
				const tb = b.startTime || "99:99";
				if (ta !== tb) return ta.localeCompare(tb);
				return a.suburb.localeCompare(b.suburb);
			});
	}, [sales, day, query]);

	const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
	const listSales = useMemo(
		() => daySales.filter((s) => visibleSet.size === 0 || visibleSet.has(s.id)),
		[daySales, visibleSet],
	);

	const saleById = useMemo(() => {
		const map = new Map<number, GarageSale>();
		for (const s of sales) map.set(s.id, s);
		return map;
	}, [sales]);

	const trail = useMemo(
		() => trailIds.map((id) => saleById.get(id)).filter((s): s is GarageSale => Boolean(s)),
		[trailIds, saleById],
	);

	const plannedTrail = useMemo(
		() => orderNearestNeighbor(trail, origin),
		[trail, origin],
	);

	const routeLine = useMemo(() => {
		if (plannedTrail.length === 0) return [] as LngLat[];
		return origin ? [origin, ...plannedTrail] : plannedTrail;
	}, [plannedTrail, origin]);

	const mapsUrl = useMemo(
		() => googleMapsRouteUrl(plannedTrail, origin),
		[plannedTrail, origin],
	);

	const onVisibleChange = useCallback((ids: number[]) => {
		setVisibleIds((prev) => {
			if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
			return ids;
		});
	}, []);

	const onCameraChange = useCallback((camera: MapCamera) => {
		saveUiPrefs({ camera });
	}, []);

	const onMapHover = useCallback((id: number | null) => {
		hoverFromMap.current = id != null;
		setHoveredId(id);
	}, []);

	const onListHover = useCallback((id: number | null) => {
		hoverFromMap.current = false;
		setHoveredId(id);
	}, []);

	const selectSale = (id: number) => {
		setSelectedId((prev) => (prev === id ? null : id));
		setFocusId(id);
	};

	const toggleTrail = (id: number) => {
		setTrailIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	};

	const moveTrail = (id: number, dir: -1 | 1) => {
		setTrailIds((prev) => {
			const i = prev.indexOf(id);
			if (i < 0) return prev;
			const j = i + dir;
			if (j < 0 || j >= prev.length) return prev;
			const next = [...prev];
			[next[i], next[j]] = [next[j], next[i]];
			return next;
		});
	};

	const openRoute = () => {
		if (!mapsUrl) return;
		window.open(mapsUrl, "_blank", "noopener,noreferrer");
	};

	const selected = selectedId != null ? (saleById.get(selectedId) ?? null) : null;

	return (
		<div className="rummage-root">
			<style>{FONT}{CSS}</style>

			<header className="rummage-bar">
				<div className="rummage-brand">
					<span className="rummage-mark">Rummage</span>
					<span className="rummage-sub">
						Australia garage sales · plan a trail · open in Google Maps
					</span>
				</div>
				<div className="rummage-daypick">
					<label>
						Day
						<input
							type="date"
							value={day}
							min={windowToday}
							onChange={(e) => setDay(e.target.value)}
						/>
					</label>
					<div className="rummage-chips" role="listbox" aria-label="Quick day picks">
						{dayChips.map((d) => {
							const count = dayCounts.get(d) ?? 0;
							const isToday = d === windowToday;
							return (
								<button
									key={d}
									type="button"
									role="option"
									aria-selected={d === day}
									className={[d === day ? "on" : "", count ? "has" : ""]
										.filter(Boolean)
										.join(" ")}
									onClick={() => setDay(d)}
									title={`${formatDayLabel(d)} · ${count} sale${count === 1 ? "" : "s"}`}
								>
									{isToday ? "Today" : weekdayShort(d)}
									{count > 0 && <em>{count}</em>}
								</button>
							);
						})}
					</div>
				</div>
			</header>

			<div className="rummage-stage">
				<div className="rummage-map-slot">
					<MapView
						sales={daySales}
						trailIds={trailIds}
						selectedId={selectedId}
						hoveredId={hoveredId}
						routeLine={routeLine}
						onSelect={selectSale}
						onHover={onMapHover}
						onVisibleChange={onVisibleChange}
						onCameraChange={onCameraChange}
						initialCamera={savedCamera}
						focusId={focusId}
					/>
					{loading && (
						<div className="rummage-toast">
							{sales.length ? "Refreshing sales…" : "Loading garage sales…"}
						</div>
					)}
					{error && !loading && (
						<div className="rummage-toast rummage-toast-err">{error}</div>
					)}
					<div className="rummage-legend">
						<span>
							<span className="dot sale" /> On the map
						</span>
						<span>
							<span className="dot trail" /> On your trail
						</span>
						<span className="rummage-src">
							Data ·{" "}
							<a
								href="https://www.garagesalefinder.net.au/"
								target="_blank"
								rel="noreferrer"
							>
								Garage Sale Finder AU
							</a>
						</span>
					</div>
				</div>

				<aside className="rummage-side">
					<input
						className="rummage-search"
						placeholder="Search suburb, street, title…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<p className="rummage-list-meta">
						{listSales.length} sale{listSales.length === 1 ? "" : "s"} · {formatDayLabel(day)}
						{visibleSet.size > 0 && daySales.length !== listSales.length
							? " in map view"
							: ""}
					</p>

					<ul className="rummage-list" onMouseLeave={() => onListHover(null)}>
						{listSales.map((s) => {
							const inTrail = trailIds.includes(s.id);
							const time = formatTimeRange(s);
							return (
								<li
									key={s.id}
									className={[
										s.id === selectedId ? "is-active" : "",
										s.id === hoveredId ? "is-hover" : "",
										inTrail ? "in-trail" : "",
									]
										.filter(Boolean)
										.join(" ")}
									onMouseEnter={() => onListHover(s.id)}
									onMouseLeave={() => onListHover(null)}
								>
									<button
										type="button"
										ref={(el) => {
											if (el) listRefs.current.set(s.id, el);
											else listRefs.current.delete(s.id);
										}}
										className="rummage-row"
										onClick={() => selectSale(s.id)}
										onFocus={() => onListHover(s.id)}
										onBlur={() => onListHover(null)}
									>
										<span className={`dot ${inTrail ? "trail" : "sale"}`} />
										<span className="meta">
											<strong>{s.title}</strong>
											<em>
												{s.suburb}
												{s.state ? ` · ${s.state}` : ""}
												{time ? ` · ${time}` : ""}
											</em>
										</span>
									</button>
									<button
										type="button"
										className="add"
										onClick={() => toggleTrail(s.id)}
										aria-label={inTrail ? "Remove from trail" : "Add to trail"}
									>
										{inTrail ? "✓" : "+"}
									</button>
								</li>
							);
						})}
						{!loading && listSales.length === 0 && (
							<li className="rummage-empty">
								{daySales.length === 0
									? "No garage sales listed for this day yet — try another date."
									: "Pan or zoom the map to find sales in view."}
							</li>
						)}
					</ul>

					{selected && (
						<div className="rummage-detail">
							<div className="rummage-detail-head">
								<div>
									<strong>{selected.title}</strong>
									<em>{formatAddress(selected)}</em>
								</div>
								<button type="button" className="rummage-x" onClick={() => setSelectedId(null)}>
									×
								</button>
							</div>
							{(formatTimeRange(selected) || selected.note) && (
								<p className="rummage-note">
									{[formatTimeRange(selected), selected.note].filter(Boolean).join(" · ")}
								</p>
							)}
							<div className="rummage-detail-actions">
								<button
									type="button"
									className="rummage-secondary"
									onClick={() => toggleTrail(selected.id)}
								>
									{trailIds.includes(selected.id) ? "Remove from trail" : "Add to trail"}
								</button>
								{selected.link && (
									<a
										className="rummage-secondary"
										href={selected.link}
										target="_blank"
										rel="noreferrer"
									>
										Listing
									</a>
								)}
							</div>
						</div>
					)}

					<div className="rummage-trail">
						<div className="rummage-trail-head">
							<strong>Your trail</strong>
							<span>
								{trail.length} stop{trail.length === 1 ? "" : "s"}
							</span>
						</div>
						<label className="rummage-geo">
							<input
								type="checkbox"
								checked={useMyLocation}
								onChange={(e) => setUseMyLocation(e.target.checked)}
							/>
							Start from my location
						</label>
						{geoError && <p className="rummage-err">{geoError}</p>}
						{trail.length === 0 ? (
							<p className="rummage-muted">Add sales with + to build a driving order.</p>
						) : (
							<ol className="rummage-trail-list">
								{trail.map((s, idx) => (
									<li key={s.id}>
										<span className="num">{idx + 1}</span>
										<span className="meta">
											<strong>{s.suburb || s.title}</strong>
											<em>{s.street || s.title}</em>
										</span>
										<span className="trail-ops">
											<button
												type="button"
												aria-label="Move up"
												onClick={() => moveTrail(s.id, -1)}
												disabled={idx <= 0}
											>
												↑
											</button>
											<button
												type="button"
												aria-label="Move down"
												onClick={() => moveTrail(s.id, 1)}
												disabled={idx >= trail.length - 1}
											>
												↓
											</button>
											<button
												type="button"
												aria-label="Remove"
												onClick={() => toggleTrail(s.id)}
											>
												×
											</button>
										</span>
									</li>
								))}
							</ol>
						)}
						<p className="rummage-muted">
							Opens a nearest-neighbour drive order
							{origin ? " from your location" : ""}.
						</p>
						<button
							type="button"
							className="rummage-go"
							disabled={!mapsUrl || trail.length === 0}
							onClick={openRoute}
						>
							Open route in Google Maps
						</button>
					</div>
				</aside>
			</div>
		</div>
	);
}

const CSS = `
.rummage-root {
	--bg: #101820;
	--panel: #182430;
	--ink: #eef3f7;
	--muted: #8fa0ad;
	--line: #2a3c4c;
	--accent: #ffcc33;
	--pin: #ff5a36;
	--ok: #3ecf8e;
	height: calc(100dvh - 13.5rem);
	min-height: 28rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	color: var(--ink);
	font-family: "Figtree", system-ui, sans-serif;
	background:
		radial-gradient(90% 70% at 0% 0%, #2a3a18 0%, transparent 55%),
		radial-gradient(80% 60% at 100% 100%, #1e3048 0%, transparent 50%),
		linear-gradient(160deg, #101820 0%, #141e28 45%, #0e161e 100%);
	border-radius: 0.75rem;
	padding: 0.85rem 0.9rem 0.95rem;
	overflow: hidden;
}
.rummage-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: end;
	justify-content: space-between;
	gap: 0.85rem 1.25rem;
}
.rummage-brand { display: flex; flex-direction: column; gap: 0.15rem; }
.rummage-mark {
	font-family: "Archivo Black", Impact, sans-serif;
	font-size: clamp(1.85rem, 3.2vw, 2.55rem);
	letter-spacing: -0.02em;
	line-height: 1;
	color: var(--accent);
	text-transform: uppercase;
}
.rummage-sub { font-size: 0.78rem; color: var(--muted); }
.rummage-daypick {
	display: flex;
	flex-wrap: wrap;
	align-items: end;
	gap: 0.55rem 0.75rem;
	max-width: min(100%, 42rem);
}
.rummage-daypick label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: 0.7rem;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--muted);
}
.rummage-daypick input[type="date"] {
	background: var(--panel);
	border: 1px solid var(--line);
	color: var(--ink);
	border-radius: 0.4rem;
	padding: 0.4rem 0.55rem;
	font: inherit;
	font-size: 0.92rem;
	color-scheme: dark;
}
.rummage-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.3rem;
	max-width: 100%;
}
.rummage-chips button {
	border: 1px solid var(--line);
	background: rgba(24, 36, 48, 0.9);
	color: var(--ink);
	border-radius: 0.35rem;
	padding: 0.28rem 0.45rem;
	font: inherit;
	font-size: 0.72rem;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	gap: 0.28rem;
}
.rummage-chips button.has { border-color: #4a5e70; }
.rummage-chips button.on {
	border-color: var(--accent);
	color: var(--accent);
	background: rgba(255, 204, 51, 0.1);
}
.rummage-chips em {
	font-style: normal;
	font-size: 0.65rem;
	color: var(--muted);
	background: rgba(255,255,255,0.06);
	border-radius: 999px;
	padding: 0.05rem 0.35rem;
}
.rummage-stage {
	flex: 1;
	min-height: 0;
	display: grid;
	grid-template-columns: minmax(0, 1.45fr) minmax(16rem, 0.85fr);
	gap: 0.75rem;
}
.rummage-map-slot {
	position: relative;
	min-height: 0;
	border-radius: 0.65rem;
	overflow: hidden;
	border: 1px solid var(--line);
}
.rummage-map-wrap {
	position: absolute;
	inset: 0;
	background: #0b1218;
}
.rummage-map-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	background: #c5d0d8;
}
.rummage-map-canvas .maplibregl-canvas { outline: none; }
.rummage-map-canvas .maplibregl-ctrl-group {
	background: rgba(24, 36, 48, 0.94);
	border: 1px solid var(--line);
	border-radius: 0.45rem;
	box-shadow: none;
	overflow: hidden;
}
.rummage-map-canvas .maplibregl-ctrl-group button {
	width: 2rem;
	height: 2rem;
	background-color: transparent;
}
.rummage-map-canvas .maplibregl-ctrl-group button + button {
	border-top: 1px solid var(--line);
}
.rummage-map-canvas .maplibregl-ctrl-icon {
	filter: invert(0.92) brightness(1.05);
}
.rummage-map-canvas .maplibregl-ctrl-attrib {
	background: rgba(24, 36, 48, 0.75);
	color: rgba(238, 243, 247, 0.65);
	font-size: 0.62rem;
}
.rummage-map-canvas .maplibregl-ctrl-attrib a {
	color: rgba(238, 243, 247, 0.75);
}
.rummage-map-canvas .rummage-map-popup .maplibregl-popup-content {
	background: rgba(24, 36, 48, 0.96);
	color: #eef3f7;
	border: 1px solid #2a3c4c;
	border-radius: 0.4rem;
	padding: 0.35rem 0.55rem;
	font-family: "Figtree", system-ui, sans-serif;
	font-size: 0.78rem;
	box-shadow: none;
}
.rummage-map-canvas .rummage-map-popup .maplibregl-popup-tip {
	border-top-color: rgba(24, 36, 48, 0.96);
}
.rummage-map-ui {
	position: absolute;
	top: 0.65rem;
	left: 0.65rem;
	z-index: 2;
	pointer-events: none;
}
.rummage-reset {
	pointer-events: auto;
	border: 1px solid var(--line);
	background: rgba(24, 36, 48, 0.94);
	color: var(--ink);
	border-radius: 0.4rem;
	padding: 0.35rem 0.55rem;
	font: inherit;
	font-size: 0.78rem;
	font-weight: 600;
	cursor: pointer;
}
.rummage-reset:hover { border-color: var(--accent); color: var(--accent); }
.rummage-map-err {
	position: absolute;
	left: 0.75rem;
	bottom: 2.5rem;
	z-index: 3;
	max-width: min(22rem, calc(100% - 1.5rem));
	background: rgba(80, 30, 28, 0.92);
	border: 1px solid #6a3330;
	color: #ffb4a8;
	border-radius: 0.45rem;
	padding: 0.45rem 0.7rem;
	font-size: 0.78rem;
}
.rummage-toast {
	position: absolute;
	left: 0.75rem;
	top: 0.75rem;
	z-index: 3;
	background: rgba(24, 36, 48, 0.92);
	border: 1px solid var(--line);
	border-radius: 0.45rem;
	padding: 0.45rem 0.7rem;
	font-size: 0.82rem;
	backdrop-filter: blur(6px);
}
.rummage-toast-err {
	color: #ffb4a8;
	border-color: #6a3330;
	max-width: min(22rem, calc(100% - 1.5rem));
}
.rummage-legend {
	position: absolute;
	left: 0.65rem;
	right: 0.65rem;
	bottom: 1.85rem;
	display: flex;
	flex-wrap: wrap;
	gap: 0.55rem 0.85rem;
	align-items: center;
	z-index: 3;
	pointer-events: none;
	font-size: 0.72rem;
	color: var(--ink);
}
.rummage-legend > span {
	pointer-events: auto;
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	background: rgba(24, 36, 48, 0.9);
	border: 1px solid var(--line);
	border-radius: 999px;
	padding: 0.28rem 0.55rem;
}
.rummage-src a { color: var(--accent); text-decoration: none; }
.rummage-src a:hover { text-decoration: underline; }
.dot {
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 50%;
	background: var(--pin);
	flex: none;
}
.dot.trail { background: var(--accent); }
.dot.sale { background: var(--pin); }
.rummage-side {
	min-height: 0;
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
	background: rgba(24, 36, 48, 0.65);
	border: 1px solid var(--line);
	border-radius: 0.65rem;
	padding: 0.65rem;
}
.rummage-search {
	width: 100%;
	background: var(--bg);
	border: 1px solid var(--line);
	color: var(--ink);
	border-radius: 0.4rem;
	padding: 0.45rem 0.6rem;
	font: inherit;
	font-size: 0.9rem;
}
.rummage-list-meta {
	margin: 0;
	font-size: 0.72rem;
	color: var(--muted);
}
.rummage-list {
	list-style: none;
	margin: 0;
	padding: 0;
	overflow: auto;
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
}
.rummage-empty {
	padding: 0.75rem 0.4rem;
	font-size: 0.82rem;
	color: var(--muted);
}
.rummage-list > li {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.35rem;
	align-items: center;
	border-radius: 0.4rem;
	padding: 0.15rem 0.2rem;
}
.rummage-list > li:hover,
.rummage-list > li.is-hover,
.rummage-list > li.is-active { background: rgba(255, 204, 51, 0.1); }
.rummage-list > li.is-hover { outline: 1px solid rgba(238, 243, 247, 0.3); }
.rummage-list > li.in-trail { background: rgba(255, 204, 51, 0.08); }
.rummage-row {
	width: 100%;
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 0.5rem;
	align-items: center;
	text-align: left;
	border: 0;
	background: transparent;
	color: inherit;
	font: inherit;
	padding: 0.35rem 0.25rem;
	border-radius: 0.35rem;
	cursor: pointer;
	min-width: 0;
}
.rummage-list .meta { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.rummage-list strong {
	font-size: 0.88rem;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.rummage-list em {
	font-style: normal;
	font-size: 0.72rem;
	color: var(--muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.rummage-list .add {
	width: 1.7rem;
	height: 1.7rem;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border-radius: 0.35rem;
	border: 1px solid var(--line);
	background: var(--bg);
	font: inherit;
	font-weight: 700;
	color: var(--accent);
	cursor: pointer;
}
.rummage-list .add:hover { border-color: var(--accent); }
.rummage-detail {
	border-top: 1px solid var(--line);
	padding-top: 0.55rem;
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
}
.rummage-detail-head {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
}
.rummage-detail-head strong {
	font-family: "Archivo Black", Impact, sans-serif;
	font-size: 0.95rem;
	display: block;
	letter-spacing: 0.01em;
}
.rummage-detail-head em {
	font-style: normal;
	font-size: 0.75rem;
	color: var(--muted);
}
.rummage-x {
	border: 0;
	background: transparent;
	color: var(--muted);
	font-size: 1.35rem;
	line-height: 1;
	cursor: pointer;
}
.rummage-note { margin: 0; font-size: 0.78rem; color: var(--muted); }
.rummage-detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
}
.rummage-secondary {
	border: 1px solid var(--line);
	background: rgba(16, 24, 32, 0.7);
	color: var(--ink);
	border-radius: 0.35rem;
	padding: 0.35rem 0.55rem;
	font: inherit;
	font-size: 0.78rem;
	text-decoration: none;
	cursor: pointer;
}
.rummage-secondary:hover { border-color: var(--accent); color: var(--accent); }
.rummage-trail {
	border-top: 1px solid var(--line);
	padding-top: 0.55rem;
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	max-height: 42%;
	overflow: auto;
}
.rummage-trail-head {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	font-size: 0.85rem;
}
.rummage-trail-head span { color: var(--muted); font-size: 0.72rem; }
.rummage-geo {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 0.78rem;
	cursor: pointer;
	user-select: none;
}
.rummage-geo input { accent-color: var(--accent); margin: 0; }
.rummage-muted { margin: 0; font-size: 0.78rem; color: var(--muted); }
.rummage-err { margin: 0; font-size: 0.75rem; color: #ffb4a8; }
.rummage-trail-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}
.rummage-trail-list li {
	display: grid;
	grid-template-columns: auto 1fr auto;
	gap: 0.45rem;
	align-items: center;
	padding: 0.3rem 0.2rem;
}
.rummage-trail-list .num {
	width: 1.35rem;
	height: 1.35rem;
	border-radius: 999px;
	background: rgba(255, 204, 51, 0.18);
	color: var(--accent);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	font-size: 0.72rem;
	font-weight: 700;
}
.rummage-trail-list .meta { min-width: 0; display: flex; flex-direction: column; }
.rummage-trail-list strong {
	font-size: 0.82rem;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.rummage-trail-list em {
	font-style: normal;
	font-size: 0.7rem;
	color: var(--muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.trail-ops { display: inline-flex; gap: 0.15rem; }
.trail-ops button {
	border: 1px solid var(--line);
	background: transparent;
	color: var(--muted);
	border-radius: 0.3rem;
	width: 1.45rem;
	height: 1.45rem;
	cursor: pointer;
	font: inherit;
}
.trail-ops button:disabled { opacity: 0.35; cursor: default; }
.trail-ops button:not(:disabled):hover { color: var(--accent); border-color: var(--accent); }
.rummage-go {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	margin-top: 0.15rem;
	padding: 0.6rem 0.75rem;
	border: 0;
	border-radius: 0.45rem;
	background: var(--accent);
	color: #1a1408;
	font-weight: 700;
	font-size: 0.9rem;
	cursor: pointer;
}
.rummage-go:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.rummage-go:not(:disabled):hover { filter: brightness(1.05); }
@media (max-width: 860px) {
	.rummage-root { height: auto; min-height: calc(100dvh - 13.5rem); }
	.rummage-stage {
		grid-template-columns: 1fr;
		grid-template-rows: minmax(18rem, 48vh) minmax(18rem, 1fr);
	}
	.rummage-map-slot { min-height: 18rem; }
}
`;
