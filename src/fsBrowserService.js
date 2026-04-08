import fs from 'node:fs'
import path from 'node:path'
import { appConfig } from './core/config.js'

const PROJECT_ROOT_DIR = appConfig.projectRoot

const SENSITIVE_PATH_PATTERNS = [
	'/proc', '/sys', '/dev',
	'.ssh', '.gnupg', '.aws',
	'.config/gcloud', '.docker',
	'id_rsa', 'id_ed25519'
]

function isPathInsideRoot(rootPath, targetPath) {
	const relative = path.relative(rootPath, path.resolve(targetPath))
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function normalizePath(p) {
	return p.replace(/\\/g, '/').toLowerCase()
}

function isSensitivePath(absolutePath) {
	const normalized = normalizePath(absolutePath)
	const segments = normalized.split('/')

	for (const pattern of SENSITIVE_PATH_PATTERNS) {
		const normalizedPattern = normalizePath(pattern).replace(/^\//, '')
		// Match as a path segment anywhere in the path
		if (segments.includes(normalizedPattern)) {
			return true
		}
		// Also match multi-segment patterns
		if (normalizedPattern.includes('/') && normalized.includes(normalizedPattern)) {
			return true
		}
	}

	for (const denied of appConfig.fsBrowseDeniedPaths) {
		const normalizedDenied = normalizePath(path.resolve(denied))
		if (normalized === normalizedDenied || normalized.startsWith(`${normalizedDenied}/`)) {
			return true
		}
	}

	return false
}

function listSystemRoots() {
	if (process.platform === 'win32') {
		const roots = []
		for (let code = 67; code <= 90; code += 1) {
			const drive = String.fromCharCode(code)
			const absolutePath = `${drive}:\\`
			if (fs.existsSync(absolutePath)) {
				const isWorkspace = isPathInsideRoot(PROJECT_ROOT_DIR, absolutePath)
				roots.push({
					name: absolutePath,
					absolutePath,
					kind: 'dir',
					hasChildren: true,
					isWorkspace,
					workspaceRelativePath: isWorkspace ? path.relative(PROJECT_ROOT_DIR, absolutePath) || '.' : null
				})
			}
		}
		return roots
	}

	const isWorkspace = isPathInsideRoot(PROJECT_ROOT_DIR, '/')
	return [{
		name: '/',
		absolutePath: '/',
		kind: 'dir',
		hasChildren: true,
		isWorkspace,
		workspaceRelativePath: isWorkspace ? path.relative(PROJECT_ROOT_DIR, '/') || '.' : null
	}]
}

function buildEntry(absolutePath, directoryEntry = null) {
	const stats = directoryEntry
		? null
		: fs.statSync(absolutePath)
	const isDirectory = directoryEntry
		? directoryEntry.isDirectory()
		: stats.isDirectory()

	let hasChildren = false
	if (isDirectory) {
		try {
			hasChildren = fs.readdirSync(absolutePath).length > 0
		} catch {
			hasChildren = false
		}
	}

	const isWorkspace = isPathInsideRoot(PROJECT_ROOT_DIR, absolutePath)
	return {
		name: directoryEntry?.name || path.basename(absolutePath) || absolutePath,
		absolutePath,
		kind: isDirectory ? 'dir' : 'file',
		hasChildren,
		isWorkspace,
		workspaceRelativePath: isWorkspace ? path.relative(PROJECT_ROOT_DIR, absolutePath) || '.' : null
	}
}

function sortEntries(left, right) {
	if (left.kind !== right.kind) {
		return left.kind === 'dir' ? -1 : 1
	}

	return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
}

function safeAccess(absolutePath, mode) {
	try {
		fs.accessSync(absolutePath, mode)
		return true
	} catch {
		return false
	}
}

export function probeFileSystemPath(targetPath) {
	const rawPath = String(targetPath || '').trim()

	if (!rawPath) {
		throw new Error('path is required.')
	}

	const absolutePath = path.resolve(rawPath)

	if (isSensitivePath(absolutePath)) {
		return {
			inputPath: rawPath,
			absolutePath,
			exists: false,
			isAbsolute: path.isAbsolute(rawPath),
			kind: null,
			isWorkspace: false,
			readable: false,
			writable: false,
			restricted: true,
			visibleFromCurrentProcess: false,
			workspaceRoot: PROJECT_ROOT_DIR,
			warnings: ['This path is restricted for security reasons.']
		}
	}

	const exists = fs.existsSync(absolutePath)
	const isWorkspace = isPathInsideRoot(PROJECT_ROOT_DIR, absolutePath)
	const warnings = []

	if (!path.isAbsolute(rawPath)) {
		warnings.push('The provided path is not absolute. It was resolved relative to the current server process.')
	}

	if (!exists) {
		warnings.push('The path is not visible from the current server process.')
	}

	let kind = null
	let readable = false
	let writable = false

	if (exists) {
		const stats = fs.statSync(absolutePath)
		kind = stats.isDirectory() ? 'dir' : 'file'
		readable = safeAccess(absolutePath, fs.constants.R_OK)
		writable = safeAccess(absolutePath, fs.constants.W_OK)
	}

	if (isWorkspace) {
		warnings.push('This path is inside the workspace and does not need to be added to a file policy.')
	}

	return {
		inputPath: rawPath,
		absolutePath,
		exists,
		isAbsolute: path.isAbsolute(rawPath),
		kind,
		isWorkspace,
		readable,
		writable,
		visibleFromCurrentProcess: exists,
		workspaceRoot: PROJECT_ROOT_DIR,
		warnings
	}
}

export function browseFileSystem(targetPath = null) {
	const warnings = []

	if (!targetPath) {
		return {
			currentPath: null,
			workspaceRoot: PROJECT_ROOT_DIR,
			nodes: [
				buildEntry(PROJECT_ROOT_DIR),
				...listSystemRoots().filter(root => path.resolve(root.absolutePath) !== path.resolve(PROJECT_ROOT_DIR))
			],
			warnings
		}
	}

	const absolutePath = path.resolve(String(targetPath).trim())

	if (isSensitivePath(absolutePath)) {
		warnings.push(`Access to "${absolutePath}" is restricted for security reasons.`)
		return {
			currentPath: absolutePath,
			workspaceRoot: PROJECT_ROOT_DIR,
			nodes: [],
			warnings
		}
	}

	if (!fs.existsSync(absolutePath)) {
		throw new Error(`Path does not exist: ${absolutePath}`)
	}

	const stats = fs.statSync(absolutePath)
	const browseTarget = stats.isDirectory() ? absolutePath : path.dirname(absolutePath)
	const currentNode = buildEntry(browseTarget)

	const children = fs.readdirSync(browseTarget, { withFileTypes: true })
		.map(entry => buildEntry(path.join(browseTarget, entry.name), entry))
		.filter(entry => !isSensitivePath(entry.absolutePath))
		.sort(sortEntries)

	return {
		currentPath: browseTarget,
		workspaceRoot: PROJECT_ROOT_DIR,
		nodes: children,
		currentNode,
		warnings
	}
}
