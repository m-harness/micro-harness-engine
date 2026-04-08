import { runRootCli } from './core/cli/rootCli.js'

try {
	const exitCode = runRootCli()
	process.exit(exitCode)
} catch (error) {
	console.error(error.message || error)
	process.exit(1)
}
