import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import {
	THUMB_PALETTE,
	composeScene,
	sceneToParallaxSvgs,
	seedFromId,
} from "../src/sketches/2026-11-20b/compose.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sketchesDir = path.join(root, "src/content/sketches");
const outDir = path.join(root, "public/thumbnails");

const DEFAULTS = {
	depth: 0.55,
	trees: 0.85,
	mist: 0.72,
	paletteIndex: THUMB_PALETTE,
	layerCount: 3,
};

async function sketchIds(): Promise<string[]> {
	const files = await readdir(sketchesDir);
	return files
		.filter((name) => name.endsWith(".md") || name.endsWith(".mdx"))
		.map((name) => name.replace(/\.(md|mdx)$/, ""))
		.sort();
}

function renderPng(svg: string): Buffer {
	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: 1200 },
		background: "transparent",
	});
	return Buffer.from(resvg.render().asPng());
}

async function main() {
	const ids = await sketchIds();
	await mkdir(outDir, { recursive: true });
	console.log(`Generating ${ids.length} × 3 parallax thumbnails…`);

	for (const id of ids) {
		const scene = composeScene(seedFromId(id), DEFAULTS);
		const layers = sceneToParallaxSvgs(scene);
		for (let index = 0; index < layers.length; index++) {
			const png = renderPng(layers[index]!);
			const out = path.join(outDir, `${id}-${index}.png`);
			await writeFile(out, png);
			console.log(`  ${id}-${index}.png (${png.byteLength} bytes)`);
		}
	}

	console.log(`Done → ${path.relative(root, outDir)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
