import { useEffect, useMemo, useState } from "react";
import { fetchConflicts, fetchCyberArcs, fetchCyberNews, fetchRecentCves } from "./api";
import {
	type ConflictZone,
	type Cve,
	type CyberArc,
	type NewsArticle,
	type Severity,
} from "./data";
import { GlobeView } from "./Globe";

const SEVERITY_COLOR: Record<Severity, string> = {
	critical: "#ff3d5a",
	high: "#ff6b3d",
	medium: "#f0c040",
	low: "#3dffb5",
	none: "#6f9a86",
};

type Detail =
	| { kind: "cve"; item: Cve }
	| { kind: "news"; item: NewsArticle }
	| { kind: "conflict"; item: ConflictZone }
	| { kind: "arc"; item: CyberArc }
	| null;

type RightTab = "news" | "conflicts" | "attacks";

export default function Dashboard() {
	const [cves, setCves] = useState<Cve[]>([]);
	const [articles, setArticles] = useState<NewsArticle[]>([]);
	const [conflicts, setConflicts] = useState<ConflictZone[]>([]);
	const [cyberArcs, setCyberArcs] = useState<CyberArc[]>([]);
	const [arcNote, setArcNote] = useState<string | null>(null);
	const [cveStatus, setCveStatus] = useState<"loading" | "ok" | "error">("loading");
	const [newsStatus, setNewsStatus] = useState<"loading" | "ok" | "error">("loading");
	const [conflictStatus, setConflictStatus] = useState<"loading" | "ok" | "error">("loading");
	const [arcStatus, setArcStatus] = useState<"loading" | "ok" | "error">("loading");
	const [cveError, setCveError] = useState<string | null>(null);
	const [newsError, setNewsError] = useState<string | null>(null);
	const [conflictError, setConflictError] = useState<string | null>(null);
	const [arcError, setArcError] = useState<string | null>(null);
	const [beaconId, setBeaconId] = useState<string | null>(null);
	const [conflictId, setConflictId] = useState<string | null>(null);
	const [arcId, setArcId] = useState<string | null>(null);
	const [detail, setDetail] = useState<Detail>(null);
	const [rightTab, setRightTab] = useState<RightTab>("attacks");
	const [clock, setClock] = useState(() => new Date());
	const [filter, setFilter] = useState<Severity | "all">("all");
	const [tickLog, setTickLog] = useState<string[]>([]);
	const [reloadKey, setReloadKey] = useState(0);

	const filteredCves = useMemo(
		() => (filter === "all" ? cves : cves.filter((c) => c.severity === filter)),
		[cves, filter],
	);

	useEffect(() => {
		const id = window.setInterval(() => setClock(new Date()), 1000);
		return () => window.clearInterval(id);
	}, []);

	useEffect(() => {
		let cancelled = false;
		setCveStatus("loading");
		setNewsStatus("loading");
		setConflictStatus("loading");
		setArcStatus("loading");
		setCveError(null);
		setNewsError(null);
		setConflictError(null);
		setArcError(null);
		setTickLog([
			"fetch NVD CVEs…",
			"fetch GDELT news…",
			"fetch Blackwing conflicts…",
			"fetch /api/cyber-arcs…",
		]);

		void (async () => {
			try {
				const data = await fetchCyberArcs();
				if (cancelled) return;
				setCyberArcs(data.arcs);
				setArcNote(data.note ?? null);
				setArcStatus("ok");
				setArcId((prev) => prev ?? data.arcs[0]?.id ?? null);
				setTickLog((prev) => [...prev, `cyber-arcs ok · ${data.arcs.length}`].slice(-8));
			} catch (err) {
				if (cancelled) return;
				setCyberArcs([]);
				setArcNote(null);
				setArcStatus("error");
				setArcError(err instanceof Error ? err.message : "cyber-arcs failed");
				setTickLog((prev) => [...prev, "cyber-arcs failed"].slice(-8));
			}
		})();

		void (async () => {
			try {
				const data = await fetchRecentCves(40);
				if (cancelled) return;
				setCves(data);
				setCveStatus("ok");
				setTickLog((prev) => [...prev, `NVD ok · ${data.length} CVEs`].slice(-8));
			} catch (err) {
				if (cancelled) return;
				setCves([]);
				setCveStatus("error");
				setCveError(err instanceof Error ? err.message : "CVE fetch failed");
				setTickLog((prev) => [...prev, "NVD/CIRCL failed"].slice(-8));
			}
		})();

		void (async () => {
			try {
				const data = await fetchCyberNews(40);
				if (cancelled) return;
				setArticles(data);
				setNewsStatus("ok");
				const firstGeo = data.find((a) => typeof a.lat === "number") ?? data[0];
				setBeaconId((prev) => prev ?? firstGeo?.id ?? null);
				const feed = data[0]?.feed ?? "gdelt";
				const geoCount = data.filter((a) => typeof a.lat === "number").length;
				setTickLog((prev) => [...prev, `${feed} ok · ${data.length} docs · ${geoCount} geo`].slice(-8));
			} catch (err) {
				if (cancelled) return;
				setArticles([]);
				setNewsStatus("error");
				setNewsError(err instanceof Error ? err.message : "News fetch failed");
				setTickLog((prev) => [...prev, "news feeds failed"].slice(-8));
			}
		})();

		void (async () => {
			try {
				const data = await fetchConflicts();
				if (cancelled) return;
				setConflicts(data);
				setConflictStatus("ok");
				setConflictId((prev) => prev ?? data[0]?.id ?? null);
				setTickLog((prev) => [...prev, `Blackwing ok · ${data.length} zones`].slice(-8));
			} catch (err) {
				if (cancelled) return;
				setConflicts([]);
				setConflictStatus("error");
				setConflictError(err instanceof Error ? err.message : "Conflict fetch failed");
				setTickLog((prev) => [...prev, "Blackwing failed"].slice(-8));
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [reloadKey]);

	useEffect(() => {
		if (!detail) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setDetail(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [detail]);

	const openNews = (article: NewsArticle) => {
		setBeaconId(article.id);
		setConflictId(null);
		setArcId(null);
		setRightTab("news");
		setDetail({ kind: "news", item: article });
	};

	const openConflict = (zone: ConflictZone) => {
		setConflictId(zone.id);
		setBeaconId(null);
		setArcId(null);
		setRightTab("conflicts");
		setDetail({ kind: "conflict", item: zone });
	};

	const openArc = (arc: CyberArc) => {
		setArcId(arc.id);
		setBeaconId(null);
		setConflictId(null);
		setRightTab("attacks");
		setDetail({ kind: "arc", item: arc });
	};

	const openCve = (cve: Cve) => {
		setDetail({ kind: "cve", item: cve });
	};

	return (
		<div className="ops-root">
			<style>{CSS}</style>

			<header className="ops-top">
				<div className="ops-brand">
					<span className="ops-mark" aria-hidden />
					<div>
						<h1>SIGNAL GRID</h1>
						<p>live NVD · GDELT · Blackwing · Mirage arcs</p>
					</div>
				</div>
				<div className="ops-meta">
					<span className="ops-pill live">
						<span className="ops-dot" />
						LIVE
					</span>
					<span className="ops-pill">{cyberArcs.length} ARCS</span>
					<span className="ops-pill">{conflicts.length} ZONES</span>
					<span className="ops-pill">{articles.length} GEO HITS</span>
					<span className="ops-pill">{cves.length} CVES</span>
					<button type="button" className="ops-pill ops-reload" onClick={() => setReloadKey((k) => k + 1)}>
						reload feeds
					</button>
					<time dateTime={clock.toISOString()}>
						{clock.toISOString().replace("T", " ").slice(0, 19)} UTC
					</time>
				</div>
			</header>

			<div className="ops-grid">
				<aside className="ops-panel cve-panel">
					<div className="ops-panel-head">
						<h2>CVE FEED</h2>
						<div className="ops-filters" role="group" aria-label="Severity filter">
							{(["all", "critical", "high", "medium", "low"] as const).map((s) => (
								<button
									key={s}
									type="button"
									className={filter === s ? "on" : ""}
									onClick={() => setFilter(s)}
								>
									{s}
								</button>
							))}
						</div>
					</div>
					{cveStatus === "loading" && <p className="ops-empty">Pulling recent CVEs from NVD…</p>}
					{cveStatus === "error" && (
						<p className="ops-empty err">
							CVE feed error: {cveError}
							<button type="button" className="inline-retry" onClick={() => setReloadKey((k) => k + 1)}>
								retry
							</button>
						</p>
					)}
					{cveStatus === "ok" && filteredCves.length === 0 && (
						<p className="ops-empty">No CVEs matched this filter.</p>
					)}
					<ul className="cve-list">
						{filteredCves.map((cve) => (
							<li key={cve.id}>
								<button
									type="button"
									className={`cve-row${detail?.kind === "cve" && detail.item.id === cve.id ? " active" : ""}`}
									onClick={() => openCve(cve)}
								>
									<div className="cve-top">
										<code>{cve.id}</code>
										<span
											className="sev"
											style={{
												color: SEVERITY_COLOR[cve.severity],
												borderColor: SEVERITY_COLOR[cve.severity],
											}}
										>
											{cve.severity}
										</span>
										<span className="cvss" style={{ color: SEVERITY_COLOR[cve.severity] }}>
											{cve.cvss.toFixed(1)}
										</span>
									</div>
									<div className="cve-product">
										{cve.vendor !== "n/a" ? `${cve.vendor} · ` : ""}
										{cve.product}
									</div>
									<p>{cve.summary}</p>
									<time>{cve.published}</time>
								</button>
							</li>
						))}
					</ul>
				</aside>

				<section className="ops-panel globe-panel">
					<div className="ops-panel-head">
						<h2>WORLD THREAT MAP</h2>
						<span className="ops-hint">
							{rightTab === "attacks"
								? "probe arcs · drag globe"
								: rightTab === "conflicts"
									? "conflict zones · drag globe"
									: "news beacons · drag globe"}
						</span>
					</div>
					<div className="globe-stage">
						{((rightTab === "attacks" && arcStatus === "loading") ||
							(rightTab === "conflicts" && conflictStatus === "loading") ||
							(rightTab === "news" && newsStatus === "loading")) && (
							<p className="globe-status">
								{rightTab === "attacks"
									? "Syncing cyber arcs…"
									: rightTab === "conflicts"
										? "Syncing conflict zones…"
										: "Syncing cyber news…"}
							</p>
						)}
						{((rightTab === "attacks" && arcStatus === "ok") ||
							(rightTab === "conflicts" && conflictStatus === "ok") ||
							(rightTab === "news" && newsStatus === "ok")) && (
							<>
								<GlobeView
									articles={rightTab === "news" ? articles : []}
									conflicts={rightTab === "conflicts" ? conflicts : []}
									cyberArcs={rightTab === "attacks" ? cyberArcs : []}
									selectedId={rightTab === "news" ? beaconId : null}
									selectedConflictId={rightTab === "conflicts" ? conflictId : null}
									selectedArcId={rightTab === "attacks" ? arcId : null}
									onSelect={openNews}
									onSelectConflict={openConflict}
									onSelectArc={openArc}
								/>
								<div className="globe-legend">
									{rightTab === "attacks" && (
										<span>
											<i className="lg-arc" /> probe arc
										</span>
									)}
									{rightTab === "news" && (
										<span>
											<i className="lg-beacon" /> news
										</span>
									)}
									{rightTab === "conflicts" && (
										<span>
											<i className="lg-war" /> conflict
										</span>
									)}
									<span>
										<i className="lg-hot" /> selected
									</span>
								</div>
							</>
						)}
						{((rightTab === "attacks" && arcStatus === "error") ||
							(rightTab === "conflicts" && conflictStatus === "error") ||
							(rightTab === "news" && newsStatus === "error")) && (
							<p className="globe-status err">
								{rightTab === "attacks"
									? `Attack arcs offline: ${arcError}`
									: rightTab === "conflicts"
										? `Conflicts offline: ${conflictError}`
										: `News map offline: ${newsError}`}
							</p>
						)}
					</div>
				</section>

				<aside className="ops-panel news-panel">
					<div className="ops-panel-head">
						<div className="ops-tabs" role="tablist" aria-label="Right panel">
							<button
								type="button"
								role="tab"
								aria-selected={rightTab === "attacks"}
								className={rightTab === "attacks" ? "on" : ""}
								onClick={() => setRightTab("attacks")}
							>
								attacks
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={rightTab === "conflicts"}
								className={rightTab === "conflicts" ? "on" : ""}
								onClick={() => setRightTab("conflicts")}
							>
								conflicts
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={rightTab === "news"}
								className={rightTab === "news" ? "on" : ""}
								onClick={() => setRightTab("news")}
							>
								news
							</button>
						</div>
						<span className="ops-hint">
							{rightTab === "attacks"
								? "Mirage · cached 24h"
								: rightTab === "conflicts"
									? "Blackwing · who vs who"
									: "live GDELT"}
						</span>
					</div>
					{rightTab === "attacks" && (
						<>
							{arcStatus === "loading" && <p className="ops-empty">Pulling cached cyber arcs…</p>}
							{arcStatus === "error" && (
								<p className="ops-empty err">
									Attack arcs error: {arcError}
									<button
										type="button"
										className="inline-retry"
										onClick={() => setReloadKey((k) => k + 1)}
									>
										retry
									</button>
								</p>
							)}
							{arcStatus === "ok" && cyberArcs.length === 0 && (
								<p className="ops-empty">
									{arcNote ?? "No cross-border probe arcs in the last day."}
								</p>
							)}
							{arcNote && cyberArcs.length > 0 && (
								<p className="ops-empty ops-note">{arcNote}</p>
							)}
							<ul className="news-list">
								{cyberArcs.map((arc) => (
									<li key={arc.id}>
										<button
											type="button"
											className={`news-row${arcId === arc.id ? " active" : ""}`}
											onClick={() => openArc(arc)}
										>
											<span className="nb-city">
												{arc.fromCountry} → {arc.toCountry}
												{arc.kev ? " · KEV" : ""}
											</span>
											<span className="nb-title">
												{arc.count} probe{arc.count === 1 ? "" : "s"} · {arc.severity}
											</span>
											<span className="nb-meta">
												{arc.cveId ? arc.cveId : "honeypot scan traffic"}
											</span>
										</button>
									</li>
								))}
							</ul>
						</>
					)}
					{rightTab === "conflicts" && (
						<>
							{conflictStatus === "loading" && <p className="ops-empty">Pulling conflict registry…</p>}
							{conflictStatus === "error" && (
								<p className="ops-empty err">Conflict feed error: {conflictError}</p>
							)}
							{conflictStatus === "ok" && conflicts.length === 0 && (
								<p className="ops-empty">No conflict zones returned.</p>
							)}
							<ul className="news-list">
								{conflicts.map((z) => (
									<li key={z.id}>
										<button
											type="button"
											className={`news-row${conflictId === z.id ? " active" : ""}`}
											onClick={() => openConflict(z)}
										>
											<span className="nb-city">
												{z.status} · {z.region}
											</span>
											<span className="nb-title">{z.name}</span>
											<span className="nb-meta">{z.versus}</span>
										</button>
									</li>
								))}
							</ul>
						</>
					)}
					{rightTab === "news" && (
						<>
							{newsStatus === "loading" && <p className="ops-empty">Pulling cyber news…</p>}
							{newsStatus === "error" && (
								<p className="ops-empty err">News feed error: {newsError}</p>
							)}
							{newsStatus === "ok" && articles.length === 0 && (
								<p className="ops-empty">No geolocated cyber articles returned.</p>
							)}
							<ul className="news-list">
								{articles.map((a) => (
									<li key={a.id}>
										<button
											type="button"
											className={`news-row${beaconId === a.id ? " active" : ""}`}
											onClick={() => openNews(a)}
										>
											<span className="nb-city">
												{a.country}
												{a.feed === "hn" ? " · hn" : ""}
											</span>
											<span className="nb-title">{a.title}</span>
											<span className="nb-meta">
												{a.source} · {a.published}
											</span>
										</button>
									</li>
								))}
							</ul>
						</>
					)}
				</aside>
			</div>

			<footer className="ops-foot">
				<div className="ops-log">
					{tickLog.length === 0 ? <span>idle</span> : null}
					{tickLog.map((line, i) => (
						<span key={`${line}-${i}`}>{line}</span>
					))}
				</div>
				<span className="ops-foot-right">nvd · gdelt · blackwing · mirage</span>
			</footer>

			{detail && (
				<>
					<button
						type="button"
						className="ops-scrim"
						aria-label="Close detail panel"
						onClick={() => setDetail(null)}
					/>
					<aside className="ops-drawer" role="dialog" aria-modal="true" aria-label="Detail panel">
						<div className="drawer-head">
							<span className="drawer-kind">
								{detail.kind === "cve"
									? "CVE DOSSIER"
									: detail.kind === "conflict"
										? "CONFLICT DOSSIER"
										: detail.kind === "arc"
											? "ATTACK ARC"
											: "NEWS DOSSIER"}
							</span>
							<button type="button" className="drawer-close" onClick={() => setDetail(null)}>
								close ✕
							</button>
						</div>
						{detail.kind === "cve" ? (
							<CveDetail cve={detail.item} />
						) : detail.kind === "conflict" ? (
							<ConflictDetail zone={detail.item} />
						) : detail.kind === "arc" ? (
							<ArcDetail arc={detail.item} />
						) : (
							<NewsDetail article={detail.item} />
						)}
					</aside>
				</>
			)}
		</div>
	);
}

function CveDetail({ cve }: { cve: Cve }) {
	const color = SEVERITY_COLOR[cve.severity];
	return (
		<div className="drawer-body">
			<div className="drawer-title-row">
				<code>{cve.id}</code>
				<span className="sev" style={{ color, borderColor: color }}>
					{cve.severity}
				</span>
			</div>
			<h3>{cve.summary}</h3>
			<dl className="drawer-dl">
				<div>
					<dt>CVSS</dt>
					<dd style={{ color }}>{cve.cvss.toFixed(1)}</dd>
				</div>
				<div>
					<dt>CWE</dt>
					<dd>{cve.cwe}</dd>
				</div>
				<div>
					<dt>Vendor</dt>
					<dd>{cve.vendor}</dd>
				</div>
				<div>
					<dt>Product</dt>
					<dd>{cve.product}</dd>
				</div>
				<div className="full">
					<dt>Vector</dt>
					<dd className="mono">{cve.vector}</dd>
				</div>
				<div className="full">
					<dt>Affected</dt>
					<dd>{cve.affected}</dd>
				</div>
				<div className="full">
					<dt>Description</dt>
					<dd>{cve.details}</dd>
				</div>
				<div>
					<dt>Published</dt>
					<dd>{cve.published}</dd>
				</div>
				<div>
					<dt>Updated</dt>
					<dd>{cve.updated}</dd>
				</div>
				{cve.references.length > 0 && (
					<div className="full">
						<dt>References</dt>
						<dd>
							<ul className="ref-list">
								{cve.references.map((ref) => (
									<li key={ref}>
										<a href={ref} target="_blank" rel="noreferrer">
											{ref}
										</a>
									</li>
								))}
							</ul>
						</dd>
					</div>
				)}
			</dl>
			<a className="drawer-link" href={cve.url} target="_blank" rel="noreferrer">
				open NVD page →
			</a>
		</div>
	);
}

function ArcDetail({ arc }: { arc: CyberArc }) {
	return (
		<div className="drawer-body">
			<div className="news-loc">
				<span className="city">
					{arc.fromCountry} → {arc.toCountry}
				</span>
				<span className="coords">
					{arc.fromLat.toFixed(1)}°,{arc.fromLon.toFixed(1)}° → {arc.toLat.toFixed(1)}°,
					{arc.toLon.toFixed(1)}°
				</span>
			</div>
			<h3>
				{arc.count} observed probe{arc.count === 1 ? "" : "s"}
			</h3>
			<div className="news-byline">
				<span>{arc.severity}</span>
				<span>{arc.kev ? "KEV-linked" : "honeypot traffic"}</span>
			</div>
			<p className="drawer-lead">
				Aggregated source→target paths from Mirage honeypot intel (last ~24h), served via a Vercel Edge
				route cached with s-maxage=86400. Not nation-state attribution.
			</p>
			<dl className="drawer-dl">
				<div>
					<dt>Source</dt>
					<dd>{arc.fromCountry}</dd>
				</div>
				<div>
					<dt>Target</dt>
					<dd>{arc.toCountry}</dd>
				</div>
				<div>
					<dt>Severity</dt>
					<dd>{arc.severity}</dd>
				</div>
				<div>
					<dt>Count</dt>
					<dd>{arc.count}</dd>
				</div>
				{arc.cveId && (
					<div className="full">
						<dt>Related CVE</dt>
						<dd>
							<a href={`https://nvd.nist.gov/vuln/detail/${arc.cveId}`} target="_blank" rel="noreferrer">
								{arc.cveId}
							</a>
						</dd>
					</div>
				)}
				<div className="full">
					<dt>Feed</dt>
					<dd>mirage.offseq.com → /api/cyber-arcs (CDN cache + daily cron)</dd>
				</div>
			</dl>
			<a className="drawer-link" href="https://mirage.offseq.com/" target="_blank" rel="noreferrer">
				open Mirage intel →
			</a>
		</div>
	);
}

function ConflictDetail({ zone }: { zone: ConflictZone }) {
	return (
		<div className="drawer-body">
			<div className="news-loc">
				<span className="city">{zone.shortName}</span>
				<span className="coords">
					{zone.lat.toFixed(2)}°, {zone.lon.toFixed(2)}°
				</span>
			</div>
			<h3>{zone.name}</h3>
			<div className="news-byline">
				<span>
					{zone.status} · {zone.classification}
				</span>
				<span>since {zone.startDate}</span>
			</div>
			<p className="versus-line">{zone.versus}</p>
			<p className="drawer-lead">{zone.summary}</p>
			<dl className="drawer-dl">
				<div className="full">
					<dt>Parties</dt>
					<dd>
						<ul className="party-list">
							{zone.parties.map((p) => (
								<li key={p.id}>
									<strong>{p.name}</strong>
									<span className="party-kind">
										{p.kind}
										{p.iso2 ? ` · ${p.iso2}` : ""}
									</span>
									<span className="party-role">{p.role}</span>
								</li>
							))}
						</ul>
					</dd>
				</div>
				{(zone.killedLow != null || zone.killedHigh != null) && (
					<div className="full">
						<dt>Documented deaths (range)</dt>
						<dd>
							{zone.killedLow?.toLocaleString() ?? "?"} – {zone.killedHigh?.toLocaleString() ?? "?"}
						</dd>
					</div>
				)}
				{zone.latestText && (
					<div className="full">
						<dt>Latest development{zone.latestDate ? ` · ${zone.latestDate}` : ""}</dt>
						<dd>{zone.latestText}</dd>
					</div>
				)}
				<div className="full">
					<dt>Feed</dt>
					<dd>{zone.source}</dd>
				</div>
			</dl>
			<a className="drawer-link" href={zone.url} target="_blank" rel="noreferrer">
				open source →
			</a>
		</div>
	);
}

function NewsDetail({ article }: { article: NewsArticle }) {
	return (
		<div className="drawer-body">
			<div className="news-loc">
				<span className="city">{article.country}</span>
				{typeof article.lat === "number" && typeof article.lon === "number" ? (
					<span className="coords">
						{article.lat.toFixed(2)}°, {article.lon.toFixed(2)}°
					</span>
				) : null}
			</div>
			<h3>{article.title}</h3>
			<div className="news-byline">
				<span>{article.source}</span>
				<span>{article.published}</span>
			</div>
			{article.image ? (
				<img className="news-img" src={article.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
			) : null}
			<dl className="drawer-dl">
				<div className="full">
					<dt>Headline</dt>
					<dd>{article.summary}</dd>
				</div>
				<div>
					<dt>Language</dt>
					<dd>{article.language}</dd>
				</div>
				<div>
					<dt>Source country</dt>
					<dd>{article.country}</dd>
				</div>
				<div className="full">
					<dt>Feed</dt>
					<dd>
						{article.feed === "gdelt"
							? "GDELT DOC 2.0 · beacon uses publisher source country"
							: "Hacker News (Algolia) fallback · no geo until GDELT responds"}
					</dd>
				</div>
			</dl>
			<a className="drawer-link" href={article.url} target="_blank" rel="noreferrer">
				open source article →
			</a>
		</div>
	);
}

const CSS = `
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@600;700;800&display=swap");

.ops-root {
	--bg: #050807;
	--panel: #0a1210;
	--line: #1a332a;
	--text: #d7ffe9;
	--muted: #6f9a86;
	--accent: #3dffb5;
	--hot: #ff6b3d;
	font-family: "IBM Plex Mono", ui-monospace, monospace;
	color: var(--text);
	background:
		radial-gradient(120% 80% at 70% 0%, #0d281c 0%, transparent 55%),
		radial-gradient(90% 60% at 0% 100%, #1a1208 0%, transparent 50%),
		linear-gradient(160deg, #050807 0%, #08140f 50%, #070b0a 100%);
	height: calc(100dvh - 13.5rem);
	min-height: 26rem;
	border: 1px solid var(--line);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	position: relative;
}
.ops-root::before {
	content: "";
	pointer-events: none;
	position: absolute;
	inset: 0;
	background: repeating-linear-gradient(
		0deg,
		transparent,
		transparent 2px,
		rgba(0, 0, 0, 0.08) 2px,
		rgba(0, 0, 0, 0.08) 3px
	);
	opacity: 0.28;
	z-index: 5;
}
.ops-top, .ops-grid, .ops-foot { position: relative; z-index: 1; }

.ops-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.85rem 1.1rem;
	border-bottom: 1px solid var(--line);
	background: rgba(5, 12, 10, 0.72);
	flex-wrap: wrap;
}
.ops-brand { display: flex; align-items: center; gap: 0.75rem; }
.ops-mark {
	width: 2.1rem;
	height: 2.1rem;
	border: 1px solid var(--accent);
	background:
		linear-gradient(135deg, transparent 45%, var(--accent) 45%, var(--accent) 55%, transparent 55%),
		linear-gradient(45deg, transparent 45%, rgba(61,255,181,0.35) 45%, rgba(61,255,181,0.35) 55%, transparent 55%);
	box-shadow: inset 0 0 12px rgba(61, 255, 181, 0.25);
	animation: markPulse 3.2s ease-in-out infinite;
}
@keyframes markPulse {
	0%, 100% { opacity: 0.75; }
	50% { opacity: 1; }
}
.ops-brand h1 {
	font-family: Syne, sans-serif;
	font-weight: 800;
	font-size: 1.35rem;
	letter-spacing: 0.08em;
	margin: 0;
	line-height: 1.1;
}
.ops-brand p {
	margin: 0.15rem 0 0;
	color: var(--muted);
	font-size: 0.68rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
}
.ops-meta {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	flex-wrap: wrap;
	font-size: 0.7rem;
	color: var(--muted);
}
.ops-pill {
	border: 1px solid var(--line);
	padding: 0.2rem 0.55rem;
	letter-spacing: 0.06em;
	background: rgba(61, 255, 181, 0.04);
}
.ops-pill.live {
	color: var(--accent);
	border-color: rgba(61, 255, 181, 0.45);
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
}
.ops-reload {
	font: inherit;
	color: var(--accent);
	cursor: pointer;
}
.ops-reload:hover { border-color: var(--accent); }
.ops-dot {
	width: 0.4rem;
	height: 0.4rem;
	border-radius: 50%;
	background: var(--accent);
	box-shadow: 0 0 8px var(--accent);
	animation: blink 1.4s step-end infinite;
}
@keyframes blink { 50% { opacity: 0.25; } }

.ops-grid {
	flex: 1;
	display: grid;
	grid-template-columns: minmax(240px, 0.95fr) minmax(280px, 1.35fr) minmax(240px, 0.95fr);
	min-height: 0;
}
.ops-panel {
	display: flex;
	flex-direction: column;
	min-height: 0;
	background: rgba(8, 16, 13, 0.55);
}
.cve-panel { border-right: 1px solid var(--line); }
.news-panel { border-left: 1px solid var(--line); }
.ops-panel-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.5rem;
	padding: 0.7rem 0.9rem 0.55rem;
	border-bottom: 1px solid var(--line);
	flex-wrap: wrap;
}
.ops-panel-head h2 {
	margin: 0;
	font-family: Syne, sans-serif;
	font-size: 0.78rem;
	font-weight: 700;
	letter-spacing: 0.14em;
}
.ops-hint {
	color: var(--muted);
	font-size: 0.62rem;
	letter-spacing: 0.04em;
}
.ops-tabs {
	display: flex;
	gap: 0.25rem;
}
.ops-tabs button {
	font: inherit;
	font-size: 0.62rem;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: var(--muted);
	background: transparent;
	border: 1px solid transparent;
	padding: 0.15rem 0.4rem;
	cursor: pointer;
}
.ops-tabs button.on,
.ops-tabs button:hover {
	color: var(--accent);
	border-color: rgba(61, 255, 181, 0.35);
}
.ops-filters { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.ops-filters button {
	font: inherit;
	font-size: 0.58rem;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--muted);
	background: transparent;
	border: 1px solid transparent;
	padding: 0.15rem 0.35rem;
	cursor: pointer;
}
.ops-filters button.on,
.ops-filters button:hover {
	color: var(--accent);
	border-color: rgba(61, 255, 181, 0.35);
}

.cve-list, .news-list {
	list-style: none;
	margin: 0;
	padding: 0;
	overflow: auto;
	flex: 1;
}
.cve-list li, .news-list li {
	border-bottom: 1px solid rgba(26, 51, 42, 0.7);
}
.cve-row, .news-row {
	width: 100%;
	text-align: left;
	font: inherit;
	color: inherit;
	background: transparent;
	border: 0;
	padding: 0.7rem 0.9rem;
	cursor: pointer;
	transition: background 0.2s ease;
	display: block;
}
.cve-row:hover, .news-row:hover,
.cve-row.active, .news-row.active {
	background: rgba(61, 255, 181, 0.07);
}
.cve-top {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin-bottom: 0.25rem;
}
.cve-top code {
	font-size: 0.72rem;
	font-weight: 600;
	color: var(--accent);
}
.sev {
	font-size: 0.55rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	border: 1px solid;
	padding: 0.08rem 0.3rem;
	margin-left: auto;
}
.cvss {
	font-size: 0.72rem;
	font-weight: 600;
	min-width: 2rem;
	text-align: right;
}
.cve-product {
	font-size: 0.68rem;
	color: #9fd9bc;
	margin-bottom: 0.2rem;
}
.cve-row p {
	margin: 0;
	font-size: 0.68rem;
	line-height: 1.4;
	color: var(--muted);
}
.cve-row time {
	display: block;
	margin-top: 0.35rem;
	font-size: 0.58rem;
	color: #4d7362;
}

.globe-panel { min-height: 0; }
.globe-stage {
	flex: 1;
	position: relative;
	min-height: 0;
}
.globe-status {
	position: absolute;
	inset: 0;
	display: grid;
	place-content: center;
	margin: 0;
	padding: 1rem;
	text-align: center;
	color: var(--muted);
	font-size: 0.75rem;
	z-index: 2;
}
.globe-status.err, .ops-empty.err { color: #ff8f66; }
.inline-retry {
	display: inline-block;
	margin-left: 0.6rem;
	font: inherit;
	font-size: 0.65rem;
	color: var(--accent);
	background: transparent;
	border: 1px solid rgba(61, 255, 181, 0.35);
	padding: 0.15rem 0.4rem;
	cursor: pointer;
}
.globe-legend {
	position: absolute;
	left: 0.75rem;
	bottom: 0.65rem;
	display: flex;
	gap: 0.85rem;
	font-size: 0.58rem;
	color: var(--muted);
	letter-spacing: 0.05em;
	pointer-events: none;
}
.globe-legend i {
	display: inline-block;
	width: 0.45rem;
	height: 0.45rem;
	border-radius: 50%;
	margin-right: 0.3rem;
	vertical-align: middle;
}
.lg-beacon { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
.lg-arc { background: #46e0ff; box-shadow: 0 0 6px #46e0ff; }
.lg-war { background: #ff4d6d; box-shadow: 0 0 6px #ff4d6d; }
.lg-hot { background: var(--hot); box-shadow: 0 0 6px var(--hot); }
.ops-note {
	padding-bottom: 0.35rem !important;
	border-bottom: 1px solid rgba(26, 51, 42, 0.7);
	font-size: 0.62rem !important;
	line-height: 1.4;
}
.drawer-lead {
	margin: 0 0 0.85rem;
	font-size: 0.72rem;
	line-height: 1.45;
	color: var(--muted);
}
.drawer-dl a { color: #9fd9bc; }
.versus-line {
	margin: 0 0 0.75rem;
	font-family: Syne, sans-serif;
	font-size: 0.85rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: #ff4d6d;
}
.party-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.65rem;
}
.party-list li {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	padding-bottom: 0.55rem;
	border-bottom: 1px solid rgba(26, 51, 42, 0.7);
}
.party-list li:last-child { border-bottom: 0; padding-bottom: 0; }
.party-kind {
	font-size: 0.58rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #4d7362;
}
.party-role {
	font-size: 0.68rem;
	line-height: 1.4;
	color: var(--muted);
}

.news-row {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}
.nb-city {
	font-size: 0.62rem;
	color: var(--accent);
	letter-spacing: 0.06em;
}
.nb-title {
	font-size: 0.72rem;
	color: #c8f5dc;
	line-height: 1.35;
	font-family: Syne, sans-serif;
	font-weight: 600;
}
.nb-meta {
	font-size: 0.58rem;
	color: #4d7362;
}
.ops-empty {
	padding: 1rem;
	color: var(--muted);
	font-size: 0.75rem;
}
.news-img {
	width: 100%;
	max-height: 160px;
	object-fit: cover;
	margin-bottom: 0.85rem;
	border: 1px solid var(--line);
}
.ref-list {
	margin: 0;
	padding-left: 1rem;
	font-size: 0.62rem;
	line-height: 1.5;
	word-break: break-all;
}
.ref-list a { color: #9fd9bc; }

.ops-foot {
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	align-items: center;
	padding: 0.45rem 0.9rem;
	border-top: 1px solid var(--line);
	background: rgba(5, 12, 10, 0.85);
	font-size: 0.58rem;
	color: var(--muted);
	letter-spacing: 0.04em;
}
.ops-log { display: flex; flex-wrap: wrap; gap: 0.75rem; min-height: 1em; }
.ops-log span::before { content: "› "; color: var(--accent); }
.ops-foot-right { white-space: nowrap; opacity: 0.7; }

.ops-scrim {
	position: absolute;
	inset: 0;
	z-index: 20;
	border: 0;
	background: rgba(0, 0, 0, 0.55);
	cursor: pointer;
	animation: fadeIn 0.2s ease;
}
.ops-drawer {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 21;
	width: min(420px, 92%);
	background: linear-gradient(180deg, #0b1612 0%, #07110d 100%);
	border-left: 1px solid rgba(61, 255, 181, 0.35);
	box-shadow: -12px 0 40px rgba(0, 0, 0, 0.55);
	display: flex;
	flex-direction: column;
	animation: slideIn 0.28s ease;
	overflow: hidden;
}
@keyframes fadeIn {
	from { opacity: 0; }
	to { opacity: 1; }
}
@keyframes slideIn {
	from { transform: translateX(100%); }
	to { transform: none; }
}
.drawer-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.85rem 1rem;
	border-bottom: 1px solid var(--line);
}
.drawer-kind {
	font-family: Syne, sans-serif;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.14em;
	color: var(--accent);
}
.drawer-close {
	font: inherit;
	font-size: 0.65rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--muted);
	background: transparent;
	border: 1px solid var(--line);
	padding: 0.25rem 0.5rem;
	cursor: pointer;
}
.drawer-close:hover { color: var(--text); border-color: var(--accent); }
.drawer-body {
	padding: 1rem;
	overflow: auto;
	flex: 1;
}
.drawer-title-row {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	margin-bottom: 0.55rem;
}
.drawer-title-row code {
	font-size: 0.95rem;
	font-weight: 600;
	color: var(--accent);
}
.drawer-body h3 {
	margin: 0 0 0.75rem;
	font-family: Syne, sans-serif;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}
.drawer-dl {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.65rem 0.75rem;
	margin: 0 0 1rem;
}
.drawer-dl .full { grid-column: 1 / -1; }
.drawer-dl dt {
	font-size: 0.55rem;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: #4d7362;
	margin-bottom: 0.15rem;
}
.drawer-dl dd {
	margin: 0;
	font-size: 0.74rem;
	line-height: 1.45;
	color: #c8f5dc;
}
.drawer-dl dd.mono {
	font-size: 0.62rem;
	word-break: break-all;
	color: var(--muted);
}
.drawer-link {
	display: inline-block;
	color: var(--hot);
	font-size: 0.72rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	text-decoration: none;
	border-bottom: 1px solid rgba(255, 107, 61, 0.45);
	margin-top: 0.25rem;
}
.drawer-link:hover { color: #ff8f66; }
.news-loc {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0.4rem 0.65rem;
	margin-bottom: 0.55rem;
}
.news-loc .city {
	font-family: Syne, sans-serif;
	font-weight: 700;
	font-size: 1rem;
	letter-spacing: 0.04em;
	color: var(--accent);
}
.news-loc .coords {
	margin-left: auto;
	font-size: 0.58rem;
	color: #4d7362;
}
.news-byline {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
	font-size: 0.62rem;
	color: var(--muted);
	margin-bottom: 0.65rem;
	letter-spacing: 0.04em;
}

@media (max-width: 960px) {
	.ops-grid {
		grid-template-columns: 1fr;
		grid-template-rows: minmax(0, 0.9fr) minmax(0, 1.3fr) minmax(0, 0.9fr);
	}
	.cve-panel, .news-panel { border: 0; border-bottom: 1px solid var(--line); }
}
`;
