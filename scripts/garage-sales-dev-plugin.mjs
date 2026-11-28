/**
 * Vite middleware so `astro dev` serves /api/garage-sales JSON
 * instead of the raw Vercel Edge function module.
 */
import { buildGarageSalesPayload } from "../api/_garage-sales-lib.ts";

function attach(server) {
	server.middlewares.use(async (req, res, next) => {
		const rawUrl = req.url ?? "";
		const path = rawUrl.split("?")[0];
		if (path !== "/api/garage-sales") {
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
			const url = new URL(rawUrl, "http://localhost");
			const result = await buildGarageSalesPayload({
				from: url.searchParams.get("from"),
				to: url.searchParams.get("to"),
			});

			res.statusCode = result.status;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.setHeader(
				"Cache-Control",
				`public, s-maxage=${result.sMaxAge}, stale-while-revalidate=${Math.max(result.sMaxAge, 60)}`,
			);
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.end(JSON.stringify(result.body));
		} catch (err) {
			res.statusCode = 500;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.end(
				JSON.stringify({
					error: err instanceof Error ? err.message : "garage-sales failed",
					sales: [],
				}),
			);
		}
	});
}

export function garageSalesDevPlugin() {
	return {
		name: "garage-sales-dev",
		configureServer(server) {
			attach(server);
		},
		configurePreviewServer(server) {
			attach(server);
		},
	};
}
