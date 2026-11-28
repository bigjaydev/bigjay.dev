/**
 * Vercel Edge Function — proxies Park Stay WA (DBCA) campground map + availability.
 * Same handler shape as `/api/cyber-arcs` (proven on this deploy).
 *
 *   GET /api/parkstay?op=map
 *   GET /api/parkstay?op=status&arrival=YYYY-MM-DD&departure=YYYY-MM-DD
 *   GET /api/parkstay?op=detail&id=73&arrival=YYYY-MM-DD&departure=YYYY-MM-DD
 */
import {
	buildDetailPayload,
	buildMapPayload,
	buildStatusPayload,
} from "./_parkstay-lib";

export const config = {
	runtime: "edge",
	// Queue join can take a while; Edge allows up to plan limit.
	maxDuration: 60,
};

export default async function handler(request: Request) {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}

	try {
		const url = new URL(request.url);
		const op = url.searchParams.get("op") ?? "map";

		if (op === "map") {
			const { status, sMaxAge, body } = await buildMapPayload();
			return json(body, status, sMaxAge);
		}

		if (op === "status") {
			const arrival = url.searchParams.get("arrival") ?? "";
			const departure = url.searchParams.get("departure") ?? "";
			const { status, sMaxAge, body } = await buildStatusPayload(
				arrival,
				departure,
			);
			return json(body, status, sMaxAge);
		}

		if (op === "detail") {
			const id = Number(url.searchParams.get("id"));
			const arrival = url.searchParams.get("arrival") ?? "";
			const departure = url.searchParams.get("departure") ?? "";
			const { status, sMaxAge, body } = await buildDetailPayload(
				id,
				arrival,
				departure,
			);
			return json(body, status, sMaxAge);
		}

		return json({ error: "unknown op" }, 400, 0);
	} catch (err) {
		const message = err instanceof Error ? err.message : "parkstay failed";
		return json({ error: message }, 500, 0);
	}
}

function json(body: unknown, status: number, sMaxAge: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(sMaxAge, 60)}`,
			"CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(sMaxAge, 60)}`,
			"Vercel-CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${Math.max(sMaxAge, 60)}`,
			...corsHeaders(),
		},
	});
}

function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
}
