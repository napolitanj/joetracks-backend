import { defineConfig } from 'vitest/config';

// The suite covers pure forecast-parsing logic, so it runs in plain Node
// rather than the Workers pool. No wrangler config or bindings required,
// which means `npm test` works from a clean checkout.
export default defineConfig({
	test: {
		include: ['test/**/*.spec.ts'],
	},
});
