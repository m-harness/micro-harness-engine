import fs from 'node:fs'
import path from 'node:path'

function isBinaryBuffer(buffer) {
	const checkLength = Math.min(buffer.length, 512)
	for (let i = 0; i < checkLength; i++) {
		if (buffer[i] === 0) return true
	}
	return false
}

function walkFiles(dirPath, includeRegex, maxFiles) {
	const results = []

	function recurse(currentPath) {
		if (results.length >= maxFiles) return

		let entries
		try {
			entries = fs.readdirSync(currentPath, { withFileTypes: true })
		} catch {
			return
		}

		for (const entry of entries) {
			if (results.length >= maxFiles) return

			if (entry.name === 'node_modules' || entry.name === '.git') continue

			const fullPath = path.join(currentPath, entry.name)

			if (entry.isDirectory()) {
				recurse(fullPath)
			} else {
				const relativePath = path.relative(dirPath, fullPath).replace(/\\/g, '/')
				if (includeRegex && !includeRegex.test(relativePath)) continue
				results.push({ fullPath, relativePath })
			}
		}
	}

	recurse(dirPath)
	return results
}

function buildIncludeRegex(include) {
	if (!include) return null
	const escaped = include
		.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
		.replace(/\\?\*/g, '.*')
	return new RegExp(escaped + '$', 'i')
}

const MAX_MATCH_LINES = 200
const MAX_FILES = 50

export const grepTool = {
	name: 'grep',
	description: 'Search file contents for a pattern (text or regex) under the project root.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			pattern: {
				type: 'string',
				description: 'Text string or regular expression to search for.'
			},
			path: {
				type: 'string',
				description: 'Directory to search in (relative to project root).',
				default: '.'
			},
			include: {
				type: 'string',
				description: 'File name filter, e.g. "*.js", "*.ts".'
			}
		},
		required: ['pattern']
	},
	async execute(input = {}, context = {}) {
		const { resolveProjectPath } = context.helpers
		const target = resolveProjectPath(input.path || '.', { ...context, action: 'read' })

		let searchRegex
		try {
			searchRegex = new RegExp(input.pattern, 'gi')
		} catch {
			searchRegex = new RegExp(input.pattern.replace(/[|\\{}()[\]^$+?.*/]/g, '\\$&'), 'gi')
		}

		const includeRegex = buildIncludeRegex(input.include)
		const files = walkFiles(target.absolutePath, includeRegex, 5000)

		const matches = []
		let fileCount = 0
		let truncated = false

		for (const file of files) {
			if (fileCount >= MAX_FILES || matches.length >= MAX_MATCH_LINES) {
				truncated = true
				break
			}

			// Protection check via resolveProjectPath read action
			try {
				resolveProjectPath(
					path.join(input.path || '.', file.relativePath),
					{ ...context, action: 'read' }
				)
			} catch {
				continue
			}

			let buffer
			try {
				buffer = fs.readFileSync(file.fullPath)
			} catch {
				continue
			}

			if (isBinaryBuffer(buffer)) continue

			const content = buffer.toString('utf8')
			const lines = content.split('\n')
			let fileHasMatch = false

			for (let i = 0; i < lines.length; i++) {
				if (matches.length >= MAX_MATCH_LINES) {
					truncated = true
					break
				}

				searchRegex.lastIndex = 0
				if (searchRegex.test(lines[i])) {
					if (!fileHasMatch) {
						fileHasMatch = true
						fileCount++
					}
					matches.push({
						file: file.relativePath,
						lineNumber: i + 1,
						line: lines[i].length > 500 ? lines[i].slice(0, 500) + '...' : lines[i]
					})
				}
			}
		}

		return {
			ok: true,
			pattern: input.pattern,
			basePath: target.displayPath,
			matches,
			fileCount,
			matchCount: matches.length,
			truncated
		}
	}
}
