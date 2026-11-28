/**
 * Vercel Edge Function — proxies Garage Sale Finder Australia listings.
 *
 *   GET /api/garage-sales
 *   GET /api/garage-sales?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
import { buildGarageSalesPayload } from "./_garage-sales-lib";

export const config = {
	runtime: "edge",
};

export default async function handler(request: Request) {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}

	try {
		const url = new URL(request.url);
		const { status, sMaxAge, body } = await buildGarageSalesPayload({
			from: url.searchParams.get("from"),
			to: url.searchParams.get("to"),
		});
		return json(body, status, sMaxAge);
	} catch (err) {
		const message = err instanceof Error ? err.message : "garage-sales failed";
		return json({ error: message, sales: [] }, 500, 0);
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
