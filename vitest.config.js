import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['tests/**/*.test.js'],
		exclude: [
			'tests/mcp-server.test.js',
			'tests/mcp-server-dotted.test.js'
		],
		testTimeout: 15000,
		hookTimeout: 15000,
		sequence: {
			concurrent: false
		},
		fileParallelism: false
	}
})
