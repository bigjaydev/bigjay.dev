import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	fetchCampgrounds,
	fetchDetail,
	fetchStatuses,
	formatCacheAge,
	initialRange,
	loadUiPrefs,
	peekCampgrounds,
	peekStatuses,
	saveUiPrefs,
	type Campground,
	type CampStatus,
	type DetailPayload,
	type MapCamera,
	type NightStatus,
} from "./api";
import MapView, { type PinStatus } from "./MapView";

const FONT =
	"@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');";

type Filter = "all" | "full" | "partial" | "none" | "info";
type SortMode = "name" | "spots";

export default function Camp() {
	const initial = useMemo(() => initialRange(), []);
	const savedCamera = useMemo(() => loadUiPrefs()?.camera ?? null, []);
	const [arrival, setArrival] = useState(initial.arrival);
	const [departure, setDeparture] = useState(initial.departure);
	const [camps, setCamps] = useState<Campground[]>(() => peekCampgrounds()?.data ?? []);
	const [statuses, setStatuses] = useState<Map<number, CampStatus>>(() => {
		const peek = peekStatuses(initial.arrival, initial.departure);
		if (!peek) return new Map();
		const map = new Map<number, CampStatus>();
		for (const s of peek.data.statuses) map.set(s.id, s);
		return map;
	});
	const [nights, setNights] = useState<string[]>(() => {
		return peekStatuses(initial.arrival, initial.departure)?.data.nights ?? [];
	});
	const [mapError, setMapError] = useState<string | null>(null);
	const [statusError, setStatusError] = useState<string | null>(null);
	const [mapStale, setMapStale] = useState<{ updated?: string } | null>(() => {
		const peek = peekCampgrounds();
		return peek ? { updated: peek.updated } : null;
	});
	const [statusStale, setStatusStale] = useState<{ updated?: string } | null>(() => {
		const peek = peekStatuses(initial.arrival, initial.departure);
		return peek ? { updated: peek.updated } : null;
	});
	const [loadingMap, setLoadingMap] = useState(true);
	const [loadingStatus, setLoadingStatus] = useState(false);
	const [statusReady, setStatusReady] = useState(() => {
		return Boolean(peekStatuses(initial.arrival, initial.departure));
	});
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [hoveredId, setHoveredId] = useState<number | null>(null);
	const [focusId, setFocusId] = useState<number | null>(null);
	const [detail, setDetail] = useState<DetailPayload | null>(null);
	const [detailError, setDetailError] = useState<string | null>(null);
	const [detailStale, setDetailStale] = useState<{ updated?: string } | null>(null);
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [filter, setFilter] = useState<Filter>("all");
	const [sortMode, setSortMode] = useState<SortMode>("spots");
	const [query, setQuery] = useState("");
	const [visibleIds, setVisibleIds] = useState<number[]>([]);
	const abortRef = useRef<AbortController | null>(null);
	const listRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
	const hoverFromMap = useRef(false);

	useEffect(() => {
		let cancelled = false;
		setLoadingMap(true);
		fetchCampgrounds()
			.then((res) => {
				if (cancelled) return;
				setCamps(res.data);
				if (res.stale) {
					setMapStale({ updated: res.updated });
					setMapError(res.error ?? "Using cached campgrounds");
				} else {
					setMapStale(null);
					setMapError(null);
				}
			})
			.catch((err) => {
				if (!cancelled) setMapError(err instanceof Error ? err.message : "map failed");
			})
			.finally(() => {
				if (!cancelled) setLoadingMap(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const loadStatuses = useCallback((arr: string, dep: string) => {
		abortRef.current?.abort();
		const ac = new AbortController();
		abortRef.current = ac;
		setLoadingStatus(true);
		setStatusError(null);

		const peek = peekStatuses(arr, dep);
		if (peek) {
			const map = new Map<number, CampStatus>();
			for (const s of peek.data.statuses) map.set(s.id, s);
			setStatuses(map);
			setNights(peek.data.nights);
			setStatusReady(true);
			setStatusStale({ updated: peek.updated });
		} else {
			setStatusReady(false);
			setStatusStale(null);
		}

		fetchStatuses(arr, dep)
			.then((res) => {
				if (ac.signal.aborted) return;
				const map = new Map<number, CampStatus>();
				for (const s of res.data.statuses) map.set(s.id, s);
				setStatuses(map);
				setNights(res.data.nights);
				setStatusReady(true);
				if (res.stale) {
					setStatusStale({ updated: res.updated });
					setStatusError(res.error ?? "Using cached availability");
				} else {
					setStatusStale(null);
					setStatusError(null);
				}
			})
			.catch((err) => {
				if (ac.signal.aborted) return;
				setStatusError(err instanceof Error ? err.message : "availability failed");
				if (!peek) {
					setStatuses(new Map());
					setNights([]);
					setStatusReady(false);
				}
			})
			.finally(() => {
				if (!ac.signal.aborted) setLoadingStatus(false);
			});

		return () => ac.abort();
	}, []);

	useEffect(() => {
		if (!arrival || !departure || departure <= arrival) return;
		return loadStatuses(arrival, departure);
	}, [arrival, departure, loadStatuses]);

	useEffect(() => {
		if (selectedId == null || !arrival || !departure) {
			setDetail(null);
			setDetailStale(null);
			return;
		}
		let cancelled = false;
		setLoadingDetail(true);
		setDetailError(null);
		fetchDetail(selectedId, arrival, departure)
			.then((res) => {
				if (cancelled) return;
				setDetail(res.data);
				if (res.stale) {
					setDetailStale({ updated: res.updated });
					setDetailError(res.error ?? "Using cached site details");
				} else {
					setDetailStale(null);
					setDetailError(null);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setDetail(null);
					setDetailStale(null);
					setDetailError(err instanceof Error ? err.message : "detail failed");
				}
			})
			.finally(() => {
				if (!cancelled) setLoadingDetail(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedId, arrival, departure]);

	useEffect(() => {
		if (hoveredId == null || !hoverFromMap.current) return;
		const el = listRefs.current.get(hoveredId);
		el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [hoveredId]);

	const statusOf = useCallback(
		(c: Campground): PinStatus => {
			if (c.type !== 0) return "info";
			if (!statusReady) return "pending";
			return statuses.get(c.id)?.status ?? "none";
		},
		[statusReady, statuses],
	);

	const matchesFilter = useCallback(
		(c: Campground) => {
			const st = statusOf(c);
			if (filter !== "all" && st !== filter) return false;
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return (
				c.name.toLowerCase().includes(q) ||
				c.park.toLowerCase().includes(q) ||
				c.region.toLowerCase().includes(q)
			);
		},
		[filter, query, statusOf],
	);

	const onVisibleChange = useCallback((ids: number[]) => {
		setVisibleIds((prev) => {
			if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
			return ids;
		});
	}, []);

	const onMapHover = useCallback((id: number | null) => {
		hoverFromMap.current = id != null;
		setHoveredId(id);
	}, []);

	const onListHover = useCallback((id: number | null) => {
		hoverFromMap.current = false;
		setHoveredId(id);
	}, []);

	const onCameraChange = useCallback((camera: MapCamera) => {
		saveUiPrefs({ camera });
	}, []);

	useEffect(() => {
		if (!arrival || !departure || departure <= arrival) return;
		saveUiPrefs({ arrival, departure });
	}, [arrival, departure]);

	const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

	const listCamps = useMemo(() => {
		const list = camps.filter((c) => matchesFilter(c) && visibleSet.has(c.id));
		const byName = (a: Campground, b: Campground) => a.name.localeCompare(b.name);
		if (sortMode === "name") return list.sort(byName);

		return list.sort((a, b) => {
			const sa = spotScore(a, statuses, statusOf);
			const sb = spotScore(b, statuses, statusOf);
			if (sb !== sa) return sb - sa;
			return byName(a, b);
		});
	}, [camps, matchesFilter, visibleSet, sortMode, statuses, statusOf]);

	const counts = useMemo(() => {
		let full = 0;
		let partial = 0;
		let none = 0;
		let info = 0;
		for (const c of camps) {
			if (!visibleSet.has(c.id)) continue;
			const st = statusOf(c);
			if (st === "full") full++;
			else if (st === "partial") partial++;
			else if (st === "info") info++;
			else if (st === "none") none++;
		}
		return { full, partial, none, info };
	}, [camps, statuses, statusReady, visibleSet, statusOf]);

	const selected = camps.find((c) => c.id === selectedId) ?? null;

	const selectCamp = (id: number) => {
		if (selectedId === id) {
			setSelectedId(null);
			return;
		}
		setSelectedId(id);
		setFocusId(id);
	};

	const staleNote =
		mapStale || statusStale
			? `Cached ${formatCacheAge(statusStale?.updated ?? mapStale?.updated)} — live refresh failed`
			: null;

	return (
		<div className="pitch-root">
			<style>{FONT}{CSS}</style>

			<header className="pitch-bar">
				<div className="pitch-brand">
					<span className="pitch-mark">Pitch</span>
					<span className="pitch-sub">Park Stay WA · DBCA campgrounds</span>
				</div>
				<div className="pitch-dates">
					<label>
						Arrive
						<input
							type="date"
							value={arrival}
							onChange={(e) => {
								const v = e.target.value;
								setArrival(v);
								if (departure <= v) {
									const d = new Date(v + "T00:00:00Z");
									d.setUTCDate(d.getUTCDate() + 2);
									setDeparture(isoUtc(d));
								}
							}}
						/>
					</label>
					<label>
						Depart
						<input
							type="date"
							value={departure}
							min={arrival}
							onChange={(e) => setDeparture(e.target.value)}
						/>
					</label>
					<span className="pitch-nights">
						{nights.length || Math.max(0, dayDiff(arrival, departure))} night
						{(nights.length || Math.max(0, dayDiff(arrival, departure))) === 1 ? "" : "s"}
					</span>
				</div>
			</header>

			<div className="pitch-stage">
				<div className="pitch-map-slot">
					<MapView
						camps={camps}
						statusOf={statusOf}
						selectedId={selectedId}
						hoveredId={hoveredId}
						onSelect={selectCamp}
						onHover={onMapHover}
						onVisibleChange={onVisibleChange}
						onCameraChange={onCameraChange}
						initialCamera={savedCamera}
						filter={matchesFilter}
						focusId={focusId}
					/>

					{(loadingMap || loadingStatus) && (
						<div className="pitch-toast">
							{loadingMap
								? camps.length
									? "Refreshing campgrounds…"
									: "Loading campgrounds…"
								: statusStale
									? "Refreshing availability…"
									: "Joining ParkStay queue & checking availability…"}
						</div>
					)}
					{staleNote && !loadingMap && !loadingStatus && (
						<div className="pitch-toast pitch-toast-stale">
							<div>{staleNote}</div>
							{(mapError || statusError) && (
								<div className="pitch-toast-detail">{mapError || statusError}</div>
							)}
							{statusError && (
								<button
									type="button"
									className="pitch-retry"
									onClick={() => loadStatuses(arrival, departure)}
								>
									Retry
								</button>
							)}
						</div>
					)}
					{!staleNote && (mapError || statusError) && (
						<div className="pitch-toast pitch-toast-err">
							<div>{mapError || statusError}</div>
							{statusError && (
								<button
									type="button"
									className="pitch-retry"
									onClick={() => loadStatuses(arrival, departure)}
								>
									Retry
								</button>
							)}
						</div>
					)}

					<div className="pitch-legend">
						<button
							type="button"
							className={filter === "full" ? "on" : ""}
							onClick={() => setFilter(filter === "full" ? "all" : "full")}
						>
							<span className="dot full" /> Whole range ({counts.full})
						</button>
						<button
							type="button"
							className={filter === "partial" ? "on" : ""}
							onClick={() => setFilter(filter === "partial" ? "all" : "partial")}
						>
							<span className="dot partial" /> Some nights ({counts.partial})
						</button>
						<button
							type="button"
							className={filter === "none" ? "on" : ""}
							onClick={() => setFilter(filter === "none" ? "all" : "none")}
						>
							<span className="dot none" /> Unavailable ({counts.none})
						</button>
						<button
							type="button"
							className={filter === "info" ? "on" : ""}
							onClick={() => setFilter(filter === "info" ? "all" : "info")}
						>
							<span className="dot info" /> No online booking ({counts.info})
						</button>
					</div>
				</div>

				<aside className="pitch-side">
					<input
						className="pitch-search"
						placeholder="Search in view"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<div className="pitch-list-tools">
						<p className="pitch-list-meta">
							{listCamps.length} campground{listCamps.length === 1 ? "" : "s"} in map view
						</p>
						<label className="pitch-sort">
							Sort
							<select
								value={sortMode}
								onChange={(e) => setSortMode(e.target.value as SortMode)}
							>
								<option value="spots">Most free</option>
								<option value="name">Name</option>
							</select>
						</label>
					</div>
					<ul className="pitch-list" onMouseLeave={() => onListHover(null)}>
						{listCamps.map((c) => {
							const st = statusOf(c);
							const row = statuses.get(c.id);
							const isHover = c.id === hoveredId;
							return (
								<li key={c.id}>
									<button
										type="button"
										ref={(el) => {
											if (el) listRefs.current.set(c.id, el);
											else listRefs.current.delete(c.id);
										}}
										className={[
											c.id === selectedId ? "is-active" : "",
											isHover ? "is-hover" : "",
										]
											.filter(Boolean)
											.join(" ")}
										onClick={() => selectCamp(c.id)}
										onMouseEnter={() => onListHover(c.id)}
										onFocus={() => onListHover(c.id)}
										onBlur={() => onListHover(null)}
									>
										<span className={`dot ${st}`} />
										<span className="meta">
											<strong>{c.name}</strong>
											<em>
												{c.park}
												{c.region ? ` · ${c.region}` : ""}
											</em>
										</span>
										<span className="stat">
											{st === "full" && row
												? `${row.sites} free`
												: st === "partial" && row
													? `${row.nights.length}/${nights.length} nights`
													: labelStatus(st)}
										</span>
									</button>
								</li>
							);
						})}
						{listCamps.length === 0 && (
							<li className="pitch-empty">Pan or zoom to find campgrounds</li>
						)}
					</ul>

					{selected && (
						<div className="pitch-detail">
							<div className="pitch-detail-head">
								<div>
									<strong>{selected.name}</strong>
									<em>
										{selected.park}
										{selected.region ? ` · ${selected.region}` : ""}
									</em>
								</div>
								<button type="button" className="pitch-x" onClick={() => setSelectedId(null)}>
									×
								</button>
							</div>

							{nights.length > 0 && (
								<div className="pitch-daystrip" aria-label="Night availability">
									{nights.map((d) => {
										const free =
											statuses.get(selected.id)?.nights.includes(d) ?? false;
										const whole = statuses.get(selected.id)?.status === "full";
										return (
											<div
												key={d}
												className={`pitch-day ${whole || free ? "ok" : "no"}`}
												title={d}
											>
												<span>{fmtDay(d)}</span>
												<em>{whole || free ? "open" : "full"}</em>
											</div>
										);
									})}
								</div>
							)}

							{selected.features.length > 0 && (
								<p className="pitch-feats">{selected.features.slice(0, 6).join(" · ")}</p>
							)}

							{loadingDetail && <p className="pitch-muted">Loading sites…</p>}
							{detailStale && (
								<p className="pitch-stale">
									Cached site details · {formatCacheAge(detailStale.updated)}
								</p>
							)}
							{detailError && !detail && <p className="pitch-err">{detailError}</p>}
							{detail && (
								<ul className="pitch-sites">
									{detail.sites.slice(0, 12).map((s) => (
										<li key={s.id}>
											<strong>{s.name}</strong>
											<span>
												{s.free}/{s.total} nights
												{s.price ? ` · ${s.price}` : ""}
											</span>
											<div className="pitch-mini">
												{s.nights.map((n) => (
													<i
														key={n.date}
														className={n.available ? "ok" : "no"}
														title={`${n.date}${n.price ? ` ${n.price}` : ""}`}
													/>
												))}
											</div>
										</li>
									))}
								</ul>
							)}

							<a
								className="pitch-book"
								href={
									detail?.bookUrl ??
									`https://parkstay.dbca.wa.gov.au/search-availability/campground/?campground=${selected.id}`
								}
								target="_blank"
								rel="noreferrer"
							>
								Book on Park Stay WA
							</a>
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}

function spotScore(
	c: Campground,
	statuses: Map<number, CampStatus>,
	statusOf: (c: Campground) => PinStatus,
) {
	const st = statusOf(c);
	if (st === "info" || st === "pending") return -1;
	const row = statuses.get(c.id);
	if (!row) return 0;
	// Prefer site count; partial ranges fall back to free-night count.
	if (row.sites > 0) return row.sites;
	if (st === "partial") return row.nights.length * 0.01;
	return 0;
}

function labelStatus(st: NightStatus | "pending") {
	switch (st) {
		case "full":
			return "whole range";
		case "partial":
			return "some nights";
		case "info":
			return "no online booking";
		case "pending":
			return "checking…";
		default:
			return "unavailable";
	}
}

function dayDiff(a: string, b: string) {
	const da = Date.parse(a + "T00:00:00Z");
	const db = Date.parse(b + "T00:00:00Z");
	if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
	return Math.round((db - da) / 86_400_000);
}

function isoUtc(d: Date) {
	return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string) {
	const [y, m, d] = iso.split("-");
	const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
	return dt.toLocaleDateString("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}

const CSS = `
.pitch-root {
	--bg: #0c1614;
	--panel: #13221e;
	--ink: #e8f0ec;
	--muted: #8aa396;
	--line: #2a433c;
	--full: #3ecf8e;
	--partial: #e0a84a;
	--none: #c45b5b;
	--info: #6a8f9e;
	--accent: #d4a574;
	height: calc(100dvh - 13.5rem);
	min-height: 28rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	color: var(--ink);
	font-family: "IBM Plex Sans", system-ui, sans-serif;
	background:
		radial-gradient(120% 80% at 10% 0%, #1a3a32 0%, transparent 55%),
		radial-gradient(90% 70% at 90% 100%, #2a2418 0%, transparent 50%),
		linear-gradient(165deg, #0c1614 0%, #142420 45%, #101816 100%);
	border-radius: 0.75rem;
	padding: 0.85rem 0.9rem 0.95rem;
	overflow: hidden;
}
.pitch-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: end;
	justify-content: space-between;
	gap: 0.85rem 1.25rem;
}
.pitch-brand { display: flex; flex-direction: column; gap: 0.15rem; }
.pitch-mark {
	font-family: "Bricolage Grotesque", Georgia, serif;
	font-weight: 700;
	font-size: clamp(1.85rem, 3.2vw, 2.45rem);
	letter-spacing: -0.03em;
	line-height: 1;
	color: var(--accent);
}
.pitch-sub { font-size: 0.78rem; color: var(--muted); }
.pitch-dates {
	display: flex;
	flex-wrap: wrap;
	align-items: end;
	gap: 0.65rem 0.85rem;
}
.pitch-dates label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: 0.7rem;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--muted);
}
.pitch-dates input {
	background: var(--panel);
	border: 1px solid var(--line);
	color: var(--ink);
	border-radius: 0.4rem;
	padding: 0.4rem 0.55rem;
	font: inherit;
	font-size: 0.92rem;
	color-scheme: dark;
}
.pitch-nights {
	font-size: 0.85rem;
	color: var(--muted);
	padding-bottom: 0.45rem;
}
.pitch-stage {
	flex: 1;
	min-height: 0;
	display: grid;
	grid-template-columns: minmax(0, 1.4fr) minmax(15rem, 0.8fr);
	gap: 0.75rem;
}
.pitch-map-slot {
	position: relative;
	min-height: 0;
	border-radius: 0.65rem;
	overflow: hidden;
	border: 1px solid var(--line);
}
.pitch-map-wrap {
	position: absolute;
	inset: 0;
	background: #0b1210;
}
.pitch-map-canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	background: #d8e0d6;
}
.pitch-map-err {
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
.pitch-map-canvas .maplibregl-canvas {
	outline: none;
}
.pitch-map-canvas .maplibregl-ctrl-group {
	background: rgba(19, 34, 30, 0.94);
	border: 1px solid var(--line);
	border-radius: 0.45rem;
	box-shadow: none;
	overflow: hidden;
}
.pitch-map-canvas .maplibregl-ctrl-group button {
	width: 2rem;
	height: 2rem;
	background-color: transparent;
}
.pitch-map-canvas .maplibregl-ctrl-group button + button {
	border-top: 1px solid var(--line);
}
.pitch-map-canvas .maplibregl-ctrl-icon {
	filter: invert(0.92) brightness(1.05);
}
.pitch-map-canvas .maplibregl-ctrl-attrib {
	background: rgba(19, 34, 30, 0.75);
	color: rgba(232, 240, 236, 0.65);
	font-size: 0.62rem;
}
.pitch-map-canvas .maplibregl-ctrl-attrib a {
	color: rgba(232, 240, 236, 0.75);
}
.pitch-map-canvas .pitch-map-popup .maplibregl-popup-content {
	background: rgba(19, 34, 30, 0.96);
	color: #e8f0ec;
	border: 1px solid #2a433c;
	border-radius: 0.4rem;
	padding: 0.35rem 0.55rem;
	font-family: "IBM Plex Sans", system-ui, sans-serif;
	font-size: 0.78rem;
	box-shadow: none;
}
.pitch-map-canvas .pitch-map-popup .maplibregl-popup-tip {
	border-top-color: rgba(19, 34, 30, 0.96);
}
.pitch-map-ui {
	position: absolute;
	top: 0.65rem;
	left: 0.65rem;
	display: flex;
	flex-direction: column;
	align-items: start;
	gap: 0.4rem;
	z-index: 2;
	pointer-events: none;
}
.pitch-reset {
	pointer-events: auto;
	border: 1px solid var(--line);
	background: rgba(19, 34, 30, 0.94);
	color: var(--ink);
	border-radius: 0.4rem;
	padding: 0.35rem 0.55rem;
	font: inherit;
	font-size: 0.78rem;
	font-weight: 600;
	cursor: pointer;
}
.pitch-reset:hover { border-color: var(--accent); color: var(--accent); }
.pitch-toast {
	position: absolute;
	left: 0.75rem;
	top: 0.75rem;
	z-index: 3;
	background: rgba(19, 34, 30, 0.92);
	border: 1px solid var(--line);
	border-radius: 0.45rem;
	padding: 0.45rem 0.7rem;
	font-size: 0.82rem;
	backdrop-filter: blur(6px);
}
.pitch-toast-err {
	color: #ffb4a8;
	border-color: #6a3330;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.4rem;
	max-width: min(22rem, calc(100% - 1.5rem));
}
.pitch-toast-stale {
	color: #e0c48a;
	border-color: #6a5a30;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.35rem;
	max-width: min(22rem, calc(100% - 1.5rem));
}
.pitch-toast-detail {
	font-size: 0.72rem;
	color: #b8a878;
	opacity: 0.9;
}
.pitch-retry {
	border: 1px solid #8a4a45;
	background: rgba(80, 30, 28, 0.55);
	color: #ffd4ce;
	border-radius: 0.35rem;
	padding: 0.28rem 0.55rem;
	font: inherit;
	font-size: 0.78rem;
	cursor: pointer;
}
.pitch-retry:hover { border-color: #ffb4a8; }
.pitch-legend {
	position: absolute;
	left: 0.65rem;
	right: 0.65rem;
	bottom: 1.85rem;
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
	z-index: 3;
	pointer-events: none;
}
.pitch-legend button {
	pointer-events: auto;
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	border: 1px solid var(--line);
	background: rgba(19, 34, 30, 0.9);
	color: var(--ink);
	border-radius: 999px;
	padding: 0.28rem 0.55rem;
	font: inherit;
	font-size: 0.72rem;
	cursor: pointer;
}
.pitch-legend button.on { border-color: var(--accent); color: var(--accent); }
.dot {
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 50%;
	background: var(--none);
	flex: none;
}
.dot.full { background: var(--full); }
.dot.partial { background: var(--partial); }
.dot.info { background: var(--info); }
.dot.pending { background: #6a7a74; }
.pitch-side {
	min-height: 0;
	display: flex;
	flex-direction: column;
	gap: 0.45rem;
	background: rgba(19, 34, 30, 0.65);
	border: 1px solid var(--line);
	border-radius: 0.65rem;
	padding: 0.65rem;
}
.pitch-search {
	width: 100%;
	background: var(--bg);
	border: 1px solid var(--line);
	color: var(--ink);
	border-radius: 0.4rem;
	padding: 0.45rem 0.6rem;
	font: inherit;
	font-size: 0.9rem;
}
.pitch-list-tools {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}
.pitch-list-meta {
	margin: 0;
	font-size: 0.72rem;
	color: var(--muted);
}
.pitch-sort {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	font-size: 0.68rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--muted);
	flex: none;
}
.pitch-sort select {
	background: var(--bg);
	border: 1px solid var(--line);
	color: var(--ink);
	border-radius: 0.35rem;
	padding: 0.2rem 0.35rem;
	font: inherit;
	font-size: 0.75rem;
	text-transform: none;
	letter-spacing: 0;
	color-scheme: dark;
}
.pitch-list {
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
.pitch-empty {
	padding: 0.75rem 0.4rem;
	font-size: 0.82rem;
	color: var(--muted);
}
.pitch-list button {
	width: 100%;
	display: grid;
	grid-template-columns: auto 1fr auto;
	gap: 0.5rem;
	align-items: center;
	text-align: left;
	border: 0;
	background: transparent;
	color: inherit;
	font: inherit;
	padding: 0.45rem 0.4rem;
	border-radius: 0.4rem;
	cursor: pointer;
}
.pitch-list button:hover,
.pitch-list button.is-hover,
.pitch-list button.is-active { background: rgba(212, 165, 116, 0.12); }
.pitch-list button.is-hover { outline: 1px solid rgba(232, 240, 236, 0.35); }
.pitch-list .meta { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.pitch-list strong {
	font-size: 0.88rem;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.pitch-list em {
	font-style: normal;
	font-size: 0.72rem;
	color: var(--muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.pitch-list .stat { font-size: 0.72rem; color: var(--muted); white-space: nowrap; }
.pitch-detail {
	border-top: 1px solid var(--line);
	padding-top: 0.65rem;
	display: flex;
	flex-direction: column;
	gap: 0.55rem;
	max-height: 48%;
	overflow: auto;
}
.pitch-detail-head {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
}
.pitch-detail-head strong {
	font-family: "Bricolage Grotesque", Georgia, serif;
	font-size: 1.05rem;
	display: block;
}
.pitch-detail-head em {
	font-style: normal;
	font-size: 0.75rem;
	color: var(--muted);
}
.pitch-x {
	border: 0;
	background: transparent;
	color: var(--muted);
	font-size: 1.35rem;
	line-height: 1;
	cursor: pointer;
}
.pitch-daystrip {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(4.2rem, 1fr));
	gap: 0.3rem;
}
.pitch-day {
	border-radius: 0.35rem;
	padding: 0.3rem 0.35rem;
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
	font-size: 0.68rem;
	border: 1px solid var(--line);
}
.pitch-day.ok { background: rgba(62, 207, 142, 0.12); border-color: #2a6b4e; }
.pitch-day.no { background: rgba(196, 91, 91, 0.1); border-color: #6a3330; }
.pitch-day em { font-style: normal; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.pitch-feats { margin: 0; font-size: 0.75rem; color: var(--muted); }
.pitch-muted { margin: 0; font-size: 0.8rem; color: var(--muted); }
.pitch-stale { margin: 0; font-size: 0.75rem; color: #e0c48a; }
.pitch-err { margin: 0; font-size: 0.8rem; color: #ffb4a8; }
.pitch-sites {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
}
.pitch-sites li {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.15rem 0.5rem;
	font-size: 0.78rem;
}
.pitch-sites span { color: var(--muted); grid-column: 2; grid-row: 1; }
.pitch-mini {
	grid-column: 1 / -1;
	display: flex;
	gap: 0.18rem;
	flex-wrap: wrap;
}
.pitch-mini i {
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 0.12rem;
	background: var(--none);
}
.pitch-mini i.ok { background: var(--full); }
.pitch-book {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	margin-top: 0.15rem;
	padding: 0.55rem 0.75rem;
	border-radius: 0.45rem;
	background: var(--accent);
	color: #1a120c;
	font-weight: 600;
	font-size: 0.88rem;
	text-decoration: none;
}
.pitch-book:hover { filter: brightness(1.05); }
@media (max-width: 860px) {
	.pitch-root { height: auto; min-height: calc(100dvh - 13.5rem); }
	.pitch-stage { grid-template-columns: 1fr; grid-template-rows: minmax(18rem, 48vh) minmax(18rem, 1fr); }
	.pitch-map-slot { min-height: 18rem; }
}
`;
