import { execGit, assertCommand } from './helpers.js'

const ALLOWED_COMMANDS = new Set([
	'add', 'commit', 'branch_create', 'branch_switch', 'branch_delete',
	'stash', 'stash_pop', 'merge', 'pull', 'restore_staged'
])

export const gitCommitTool = {
	name: 'git_commit',
	description: 'Safe git write operations: add, commit, branch management, stash, merge, pull.',
	riskLevel: 'safe',
	input_schema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				enum: [...ALLOWED_COMMANDS],
				description: 'Git command to run.'
			},
			args: {
				type: 'object',
				description: 'Command-specific arguments.',
				properties: {
					files: {
						type: 'array',
						items: { type: 'string' },
						description: 'File paths for add/restore_staged.'
					},
					message: {
						type: 'string',
						description: 'Commit message.'
					},
					branch: {
						type: 'string',
						description: 'Branch name for branch_create/switch/delete/merge.'
					},
					all: {
						type: 'boolean',
						description: 'Use -A (add) or -a (commit) flag.'
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
			case 'add': {
				if (args.all) {
					const output = execGit(['add', '-A'])
					return { ok: true, command, output }
				}
				const files = args.files
				if (!Array.isArray(files) || files.length === 0) {
					return { ok: false, error: 'add requires args.files array or args.all=true.' }
				}
				const { resolveProjectPath } = context.helpers
				for (const file of files) {
					resolveProjectPath(file, { ...context, action: 'write' })
				}
				const output = execGit(['add', '--', ...files.map(String)])
				return { ok: true, command, output }
			}

			case 'commit': {
				const message = String(args.message || '').trim()
				if (!message) {
					return { ok: false, error: 'commit requires args.message.' }
				}
				const gitArgs = ['commit']
				if (args.all) gitArgs.push('-a')
				gitArgs.push('-m', message)
				const output = execGit(gitArgs)
				return { ok: true, command, output }
			}

			case 'branch_create': {
				const branch = String(args.branch || '').trim()
				if (!branch) {
					return { ok: false, error: 'branch_create requires args.branch.' }
				}
				const output = execGit(['branch', branch])
				return { ok: true, command, output }
			}

			case 'branch_switch': {
				const branch = String(args.branch || '').trim()
				if (!branch) {
					return { ok: false, error: 'branch_switch requires args.branch.' }
				}
				const output = execGit(['checkout', branch])
				return { ok: true, command, output }
			}

			case 'branch_delete': {
				const branch = String(args.branch || '').trim()
				if (!branch) {
					return { ok: false, error: 'branch_delete requires args.branch.' }
				}
				const output = execGit(['branch', '-d', branch])
				return { ok: true, command, output }
			}

			case 'stash': {
				const output = execGit(['stash'])
				return { ok: true, command, output }
			}

			case 'stash_pop': {
				const output = execGit(['stash', 'pop'])
				return { ok: true, command, output }
			}

			case 'merge': {
				const branch = String(args.branch || '').trim()
				if (!branch) {
					return { ok: false, error: 'merge requires args.branch.' }
				}
				const output = execGit(['merge', '--no-edit', branch])
				return { ok: true, command, output }
			}

			case 'pull': {
				const output = execGit(['pull', '--no-edit'])
				return { ok: true, command, output }
			}

			case 'restore_staged': {
				const files = args.files
				if (!Array.isArray(files) || files.length === 0) {
					return { ok: false, error: 'restore_staged requires args.files array.' }
				}
				const output = execGit(['restore', '--staged', '--', ...files.map(String)])
				return { ok: true, command, output }
			}

			default:
				return { ok: false, error: `Unknown command: ${command}` }
		}
	}
}
