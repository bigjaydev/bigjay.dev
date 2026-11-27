/**
 * Vite middleware so `astro dev` serves /api/parkstay JSON
 * instead of the raw Vercel Edge function module.
 */
import {
	buildDetailPayload,
	buildMapPayload,
	buildStatusPayload,
} from "../api/parkstay-lib.ts";

function attach(server) {
	server.middlewares.use(async (req, res, next) => {
		const rawUrl = req.url ?? "";
		const path = rawUrl.split("?")[0];
		if (path !== "/api/parkstay") {
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
			const op = url.searchParams.get("op") ?? "map";
			let result;
			if (op === "map") {
				result = await buildMapPayload();
			} else if (op === "status") {
				result = await buildStatusPayload(
					url.searchParams.get("arrival") ?? "",
					url.searchParams.get("departure") ?? "",
				);
			} else if (op === "detail") {
				result = await buildDetailPayload(
					Number(url.searchParams.get("id")),
					url.searchParams.get("arrival") ?? "",
					url.searchParams.get("departure") ?? "",
				);
			} else {
				result = { status: 400, sMaxAge: 0, body: { error: "unknown op" } };
			}

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
					error: err instanceof Error ? err.message : "parkstay failed",
				}),
			);
		}
	});
}

export function parkstayDevPlugin() {
	return {
		name: "parkstay-dev",
		configureServer(server) {
			attach(server);
		},
		configurePreviewServer(server) {
			attach(server);
		},
	};
}
