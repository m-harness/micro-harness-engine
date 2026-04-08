import { describe, it, expect } from 'vitest'
import { getTextPreview, createApprovalResponse } from '../../../src/core/tools/helpers.js'

describe('getTextPreview', () => {
	it('returns short text as-is', () => {
		const text = 'Hello world'
		expect(getTextPreview(text)).toBe(text)
	})

	it('truncates long text with ellipsis', () => {
		const text = 'x'.repeat(500)
		const result = getTextPreview(text)
		expect(result).toHaveLength(403) // 400 + '...'
		expect(result.endsWith('...')).toBe(true)
	})

	it('respects custom maxLength', () => {
		const text = 'abcdefghij'
		expect(getTextPreview(text, 5)).toBe('abcde...')
	})

	it('handles null/undefined', () => {
		expect(getTextPreview(null)).toBe('')
		expect(getTextPreview(undefined)).toBe('')
	})

	it('returns exactly maxLength text without truncation', () => {
		const text = 'x'.repeat(400)
		expect(getTextPreview(text)).toBe(text)
	})
})

describe('createApprovalResponse', () => {
	it('returns correct structure', () => {
		const result = createApprovalResponse('write_file', { path: 'test.js' }, 'Needs review')
		expect(result).toEqual({
			ok: false,
			approvalRequired: true,
			toolName: 'write_file',
			input: { path: 'test.js' },
			reason: 'Needs review'
		})
	})
})
