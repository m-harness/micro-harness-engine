import fs from 'node:fs'
import path from 'node:path'
import picomatch from 'picomatch'

function walkDir(dirPath, basePath, maxResults) {
	const results = []

	function recurse(currentPath) {
		if (results.length >= maxResults) return

		let entries
		try {
			entries = fs.readdirSync(currentPath, { withFileTypes: true })
		} catch {
			return
		}

		for (const entry of entries) {
			if (results.length >= maxResults) return

			if (entry.name === 'node_modules' || entry.name === '.git') continue

			const fullPath = path.join(currentPath, entry.name)
			const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/')

			if (entry.isDirectory()) {
				results.push({ relativePath, type: 'dir' })
				recurse(fullPath)
			} else {
				results.push({ relativePath, type: 'file' })
			}
		}
	}

	recurse(dirPath)
	return results
}

const MAX_MATCHES = 500

export const globTool = {
	name: 'glob',
	description: 'Find files matching a glob pattern under the project root.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			pattern: {
				type: 'string',
				description: 'Glob pattern to match, e.g. "**/*.js", "src/**/*.ts".'
			},
			path: {
				type: 'string',
				description: 'Base directory for the search (relative to project root).',
				default: '.'
			}
		},
		required: ['pattern']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath, filterDiscoverableEntries } = context.helpers
		const target = resolveProjectPath(input.path || '.', { ...context, action: 'discover' })

		const regex = picomatch.makeRe(String(input.pattern), { dot: true, nocase: true })
		const walked = walkDir(target.absolutePath, target.absolutePath, MAX_MATCHES * 2)

		const candidateEntries = walked
			.filter(entry => regex.test(entry.relativePath))
			.map(entry => ({ name: entry.relativePath, type: entry.type }))

		const { entries } = filterDiscoverableEntries(target.displayPath, candidateEntries)

		const truncated = entries.length > MAX_MATCHES
		const matches = truncated ? entries.slice(0, MAX_MATCHES) : entries

		return {
			ok: true,
			pattern: input.pattern,
			basePath: target.displayPath,
			matches: matches.map(e => e.name),
			totalMatched: entries.length,
			truncated
		}
	}
}
