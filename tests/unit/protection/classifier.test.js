import { describe, it, expect } from 'vitest'
import {
	redactSensitiveText,
	redactSensitiveValue,
	hasSensitiveContent
} from '../../../src/protection/classifier.js'

describe('redactSensitiveText', () => {
	it('detects anthropic_key', () => {
		const text = 'key is sk-ant-abcdef1234567890'
		expect(redactSensitiveText(text)).toContain('[REDACTED:anthropic_key]')
		expect(redactSensitiveText(text)).not.toContain('sk-ant-abcdef1234567890')
	})

	it('detects openai_key', () => {
		const text = 'key is sk-proj-abcdef1234567890'
		expect(redactSensitiveText(text)).toContain('[REDACTED:openai_key]')
	})

	it('detects github_token', () => {
		const text = 'token: ghp_xxxxxxxxxxxxxxxxxxxx'
		expect(redactSensitiveText(text)).toContain('[REDACTED:github_token]')
	})

	it('detects bearer_token', () => {
		const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
		expect(redactSensitiveText(text)).toContain('[REDACTED:bearer_token]')
	})

	it('detects pem_private_key', () => {
		const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK\n-----END RSA PRIVATE KEY-----'
		expect(redactSensitiveText(text)).toContain('[REDACTED:pem_private_key]')
	})

	it('detects assignment_secret', () => {
		const text = 'api_key=mysecretvalue123'
		expect(redactSensitiveText(text)).toContain('[REDACTED:assignment_secret]')
	})

	it('returns safe text unchanged', () => {
		const text = 'This is a normal log message with no secrets.'
		expect(redactSensitiveText(text)).toBe(text)
	})

	it('redacts multiple patterns in one string', () => {
		const text = 'keys: sk-ant-abcdef1234567890 and ghp_xxxxxxxxxxxxxxxxxxxx'
		const result = redactSensitiveText(text)
		expect(result).toContain('[REDACTED:anthropic_key]')
		expect(result).toContain('[REDACTED:github_token]')
	})

	it('returns non-string values unchanged', () => {
		expect(redactSensitiveText(42)).toBe(42)
		expect(redactSensitiveText(null)).toBe(null)
		expect(redactSensitiveText(undefined)).toBe(undefined)
	})
})

describe('redactSensitiveValue', () => {
	it('redacts strings', () => {
		const result = redactSensitiveValue('key is sk-ant-abcdef1234567890')
		expect(result).toContain('[REDACTED:anthropic_key]')
	})

	it('redacts nested objects recursively', () => {
		const obj = {
			config: {
				apiKey: 'sk-ant-abcdef1234567890'
			}
		}
		const result = redactSensitiveValue(obj)
		expect(result.config.apiKey).toContain('[REDACTED:anthropic_key]')
	})

	it('redacts array elements', () => {
		const arr = ['safe text', 'key is ghp_xxxxxxxxxxxxxxxxxxxx']
		const result = redactSensitiveValue(arr)
		expect(result[0]).toBe('safe text')
		expect(result[1]).toContain('[REDACTED:github_token]')
	})

	it('returns null/numbers unchanged', () => {
		expect(redactSensitiveValue(null)).toBe(null)
		expect(redactSensitiveValue(42)).toBe(42)
		expect(redactSensitiveValue(true)).toBe(true)
	})
})

describe('hasSensitiveContent', () => {
	it('returns true for text with secrets', () => {
		expect(hasSensitiveContent('key: sk-ant-abcdef1234567890')).toBe(true)
	})

	it('returns false for safe text', () => {
		expect(hasSensitiveContent('hello world')).toBe(false)
	})

	it('returns false for non-string input', () => {
		expect(hasSensitiveContent(42)).toBe(false)
		expect(hasSensitiveContent(null)).toBe(false)
	})
})
