import { execSync } from 'node:child_process'
import { appConfig } from '../../src/core/config.js'

function sanitizeArg(value) {
	return String(value || '').replace(/[;&|`$(){}[\]!#~<>]/g, '')
}

export function execGit(args, options = {}) {
	const sanitizedArgs = args.map(arg => sanitizeArg(arg))
	const command = ['git', ...sanitizedArgs].join(' ')

	const result = execSync(command, {
		cwd: options.cwd || appConfig.projectRoot,
		maxBuffer: options.maxBuffer || 64 * 1024,
		timeout: options.timeout || 30_000,
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe']
	})

	return truncateOutput(result)
}

export function assertCommand(command, allowedSet) {
	if (!allowedSet.has(command)) {
		throw new Error(`Unknown command: "${command}". Allowed: ${[...allowedSet].join(', ')}`)
	}
}

export function truncateOutput(text, maxLen = 32768) {
	const str = String(text || '')
	if (str.length <= maxLen) return str
	return str.slice(0, maxLen) + '\n... [output truncated]'
}
