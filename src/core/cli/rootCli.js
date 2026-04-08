import { AuthService } from '../authService.js'

function readOption(args, name, fallback = null) {
	const index = args.indexOf(name)
	if (index === -1) {
		return fallback
	}

	return args[index + 1] ?? fallback
}

function printUser(user) {
	console.log(`${user.id}\t${user.email}\t${user.displayName}\t${user.role}\t${user.status}`)
}

export function runRootCli(argv = process.argv.slice(2)) {
	const [command] = argv
	const authService = new AuthService()

	if (!command || command === 'help' || command === '--help') {
		console.log('Commands:')
		console.log('  create-user --username <loginName> --name <displayName> --password <password> [--role admin|user]')
		console.log('  list-users')
		console.log('  create-token --username <loginName> --name <tokenName>')
		return 0
	}

	if (command === 'create-user') {
		const user = authService.createLocalUser({
			loginName: readOption(argv, '--username', ''),
			displayName: readOption(argv, '--name', ''),
			password: readOption(argv, '--password', ''),
			role: readOption(argv, '--role', 'user')
		})
		console.log('Created user:')
		printUser(user)
		return 0
	}

	if (command === 'list-users') {
		const users = authService.listUsers()
		if (users.length === 0) {
			console.log('No users found.')
			return 0
		}

		users.forEach(printUser)
		return 0
	}

	if (command === 'create-token') {
		const loginName = String(readOption(argv, '--username', '') || '').trim().toLowerCase()
		const user = authService.listUsers().find(entry => entry.loginName === loginName)
		if (!user) {
			throw new Error(`User not found for username: ${loginName}`)
		}

		const token = authService.createPersonalAccessToken(
			user.id,
			readOption(argv, '--name', 'Root issued token')
		)
		console.log(`Token id: ${token.id}`)
		console.log(`Token: ${token.token}`)
		return 0
	}

	throw new Error(`Unknown command: ${command}`)
}
