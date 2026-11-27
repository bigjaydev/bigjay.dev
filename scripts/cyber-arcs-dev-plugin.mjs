/**
 * Vite middleware so `astro dev` serves real JSON at /api/cyber-arcs
 * instead of the raw Vercel Edge function module.
 */
import { buildCyberArcsPayload } from "../api/_lib.ts";

function attach(server) {
	server.middlewares.use(async (req, res, next) => {
		const path = req.url?.split("?")[0];
		if (path !== "/api/cyber-arcs") {
			next();
			return;
		}

		if (req.method === "OPTIONS") {
			res.statusCode = 204;
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
			res.end();
			return;
		}

		try {
			const { status, sMaxAge, body } = await buildCyberArcsPayload();
			res.statusCode = status;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.setHeader(
				"Cache-Control",
				`public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}`,
			);
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.end(JSON.stringify(body));
		} catch (err) {
			res.statusCode = 500;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					error: err instanceof Error ? err.message : "cyber-arcs failed",
					arcs: [],
				}),
			);
		}
	});
}

export function cyberArcsDevPlugin() {
	return {
		name: "cyber-arcs-dev",
		configureServer(server) {
			attach(server);
		},
		configurePreviewServer(server) {
			attach(server);
		},
	};
}
