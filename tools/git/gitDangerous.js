import { execGit, assertCommand } from './helpers.js'

const ALLOWED_COMMANDS = new Set([
	'reset_hard', 'clean', 'rebase', 'push_force',
	'push_delete', 'commit_amend', 'checkout_discard', 'branch_force_delete'
])

export const gitDangerousTool = {
	name: 'git_dangerous',
	description: 'Destructive or hard-to-reverse git operations. Always requires human approval.',
	riskLevel: 'dangerous',
	input_schema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				enum: [...ALLOWED_COMMANDS],
				description: 'Dangerous git command to run.'
			},
			args: {
				type: 'object',
				description: 'Command-specific arguments.',
				properties: {
					ref: {
						type: 'string',
						description: 'Ref for reset_hard or rebase.'
					},
					branch: {
						type: 'string',
						description: 'Branch name for push_delete or branch_force_delete.'
					},
					remote: {
						type: 'string',
						description: 'Remote name (default: origin).',
						default: 'origin'
					},
					message: {
						type: 'string',
						description: 'New message for commit_amend.'
					},
					force_with_lease: {
						type: 'boolean',
						description: 'Use --force-with-lease instead of --force for push_force (recommended).',
						default: true
					}
				}
			}
		},
		required: ['command']
	},
	async execute(input = {}, context = {}) {
		const command = String(input.command)
		assertCommand(command, ALLOWED_COMMANDS)

		const { createApprovalResponse } = context.helpers

		if (!context.approvalGranted) {
			return createApprovalResponse(
				'git_dangerous',
				input,
				`Dangerous operation "${command}" requires human approval.`
			)
		}

		const args = input.args || {}

		switch (command) {
			case 'reset_hard': {
				const ref = String(args.ref || 'HEAD').trim()
				const output = execGit(['reset', '--hard', ref])
				return { ok: true, command, output }
			}

			case 'clean': {
				const output = execGit(['clean', '-fd'])
				return { ok: true, command, output }
			}

			case 'rebase': {
				if (!args.ref) {
					return { ok: false, error: 'rebase requires args.ref.' }
				}
				const output = execGit(['rebase', String(args.ref)])
				return { ok: true, command, output }
			}

			case 'push_force': {
				const remote = String(args.remote || 'origin').trim()
				const branch = args.branch ? String(args.branch).trim() : ''
				const forceFlag = args.force_with_lease !== false ? '--force-with-lease' : '--force'
				const gitArgs = ['push', forceFlag, remote]
				if (branch) gitArgs.push(branch)
				const output = execGit(gitArgs, { timeout: 60_000 })
				return { ok: true, command, output }
			}

			case 'push_delete': {
				if (!args.branch) {
					return { ok: false, error: 'push_delete requires args.branch.' }
				}
				const remote = String(args.remote || 'origin').trim()
				const output = execGit(['push', remote, '--delete', String(args.branch).trim()], { timeout: 60_000 })
				return { ok: true, command, output }
			}

			case 'commit_amend': {
				const gitArgs = ['commit', '--amend']
				if (args.message) {
					gitArgs.push('-m', String(args.message))
				} else {
					gitArgs.push('--no-edit')
				}
				const output = execGit(gitArgs)
				return { ok: true, command, output }
			}

			case 'checkout_discard': {
				const output = execGit(['checkout', '--', '.'])
				return { ok: true, command, output }
			}

			case 'branch_force_delete': {
				if (!args.branch) {
					return { ok: false, error: 'branch_force_delete requires args.branch.' }
				}
				const output = execGit(['branch', '-D', String(args.branch).trim()])
				return { ok: true, command, output }
			}

			default:
				return { ok: false, error: `Unknown command: ${command}` }
		}
	}
}
