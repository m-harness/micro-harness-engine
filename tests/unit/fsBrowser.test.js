import { describe, it, expect } from 'vitest'
import path from 'node:path'

import { probeFileSystemPath, browseFileSystem } from '../../src/fsBrowserService.js'

describe('probeFileSystemPath (C-3: sensitive path blocking)', () => {
	it('returns restricted for .ssh path', () => {
		const sshPath = path.resolve(path.join('/', 'home', 'user', '.ssh'))
		const result = probeFileSystemPath(sshPath)
		expect(result.restricted).toBe(true)
		expect(result.exists).toBe(false)
		expect(result.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining('restricted')])
		)
	})

	it('returns restricted for .gnupg path', () => {
		const result = probeFileSystemPath(path.resolve(path.join('/', 'home', 'user', '.gnupg')))
		expect(result.restricted).toBe(true)
	})

	it('returns restricted for path containing proc segment', () => {
		const result = probeFileSystemPath(path.resolve('/proc'))
		expect(result.restricted).toBe(true)
	})

	it('returns restricted for path containing sys segment', () => {
		const result = probeFileSystemPath(path.resolve('/sys'))
		expect(result.restricted).toBe(true)
	})

	it('returns restricted for path containing dev segment', () => {
		const result = probeFileSystemPath(path.resolve('/dev'))
		expect(result.restricted).toBe(true)
	})

	it('does not restrict normal paths', () => {
		const result = probeFileSystemPath(process.cwd())
		expect(result.restricted).toBeUndefined()
	})
})

describe('browseFileSystem (C-3: sensitive path blocking)', () => {
	it('blocks browsing sensitive directories', () => {
		const sshPath = path.resolve(path.join('/', 'home', 'user', '.ssh'))
		const result = browseFileSystem(sshPath)
		expect(result.nodes).toHaveLength(0)
		expect(result.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining('restricted')])
		)
	})

	it('filters out sensitive child entries from normal directories', () => {
		const result = browseFileSystem(process.cwd())
		for (const node of result.nodes) {
			expect(node.name).not.toBe('.ssh')
			expect(node.name).not.toBe('.gnupg')
		}
	})
})
