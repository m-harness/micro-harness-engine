import { execGit, assertCommand } from './helpers.js'

const ALLOWED_COMMANDS = new Set([
	'status', 'log', 'diff', 'show', 'blame', 'branch_list', 'remote', 'stash_list'
])

export const gitInfoTool = {
	name: 'git_info',
	description: 'Read-only git information commands: status, log, diff, show, blame, branch_list, remote, stash_list.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				enum: [...ALLOWED_COMMANDS],
				description: 'Git info command to run.'
			},
			args: {
				type: 'object',
				description: 'Command-specific arguments.',
				properties: {
					max_count: {
						type: 'integer',
						description: 'Maximum number of entries (log). Default: 20.'
					},
					oneline: {
						type: 'boolean',
						description: 'Use --oneline format (log).'
					},
					cached: {
						type: 'boolean',
						description: 'Show staged changes only (diff).'
					},
					ref: {
						type: 'string',
						description: 'Ref/commit for diff, show, or blame.'
					},
					file: {
						type: 'string',
						description: 'File path for blame.'
					},
					object: {
						type: 'string',
						description: 'Object to show (show command).'
					}
				}
			}
		},
		required: ['command']
	},
	async execute(input = {}, context = {}) {
		const command = String(input.command)
		assertCommand(command, ALLOWED_COMMANDS)

		const args = input.args || {}

		switch (command) {
			case 'status': {
				const output = execGit(['status', '--short'])
				return { ok: true, command, output }
			}

			case 'log': {
				const gitArgs = ['log']
				const maxCount = Math.min(Number(args.max_count) || 20, 100)
				gitArgs.push(`--max-count=${maxCount}`)
				if (args.oneline) gitArgs.push('--oneline')
				if (args.ref) gitArgs.push(String(args.ref))
				const output = execGit(gitArgs)
				return { ok: true, command, output }
			}

			case 'diff': {
				const gitArgs = ['diff']
				if (args.cached) gitArgs.push('--cached')
				if (args.ref) gitArgs.push(String(args.ref))
				const output = execGit(gitArgs, { maxBuffer: 256 * 1024 })
				return { ok: true, command, output }
			}

			case 'show': {
				const gitArgs = ['show']
				if (args.object) gitArgs.push(String(args.object))
				const output = execGit(gitArgs, { maxBuffer: 256 * 1024 })
				return { ok: true, command, output }
			}

			case 'blame': {
				if (!args.file) {
					return { ok: false, error: 'blame requires args.file.' }
				}
				const { resolveProjectPath } = context.helpers
				resolveProjectPath(args.file, { ...context, action: 'read' })
				const gitArgs = ['blame']
				if (args.ref) gitArgs.push(String(args.ref))
				gitArgs.push('--', String(args.file))
				const output = execGit(gitArgs, { maxBuffer: 256 * 1024 })
				return { ok: true, command, output }
			}

			case 'branch_list': {
				const output = execGit(['branch', '-a'])
				return { ok: true, command, output }
			}

			case 'remote': {
				const output = execGit(['remote', '-v'])
				return { ok: true, command, output }
			}

			case 'stash_list': {
				const output = execGit(['stash', 'list'])
				return { ok: true, command, output }
			}

			default:
				return { ok: false, error: `Unknown command: ${command}` }
		}
	}
}
