// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
	integrations: [mdx(), react()],
	vite: {
		plugins: [tailwindcss({})],
		server: {
			proxy: {
				"/google-news": {
					target: "https://news.google.com",
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/google-news/, ""),
				},
			},
		},
	},
	fonts: [],
});
