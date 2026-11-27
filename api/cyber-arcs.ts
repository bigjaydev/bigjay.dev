/**
 * Vercel Edge Function — pulls Mirage honeypot attack map (source → target)
 * and serves a slim JSON payload. CDN-cached ~24h; cron can warm it daily.
 */
import { buildCyberArcsPayload } from "./_lib";

export const config = {
	runtime: "edge",
};

export default async function handler(request: Request) {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}

	const { status, sMaxAge, body } = await buildCyberArcsPayload();
	return json(body, status, sMaxAge);
}

function json(body: unknown, status: number, sMaxAge: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}`,
			"CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}`,
			"Vercel-CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}`,
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
