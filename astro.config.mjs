// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { cyberArcsDevPlugin } from "./scripts/cyber-arcs-dev-plugin.mjs";
import { garageSalesDevPlugin } from "./scripts/garage-sales-dev-plugin.mjs";
import { parkstayDevPlugin } from "./scripts/parkstay-dev-plugin.mjs";

// https://astro.build/config
export default defineConfig({
	integrations: [mdx(), react()],
	vite: {
		plugins: [
			tailwindcss({}),
			cyberArcsDevPlugin(),
			parkstayDevPlugin(),
			garageSalesDevPlugin(),
		],
		optimizeDeps: {
			// MapLibre v6 worker can break under Vite pre-bundling.
			exclude: ["maplibre-gl"],
		},
	},
	fonts: [],
});
