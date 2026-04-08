/**
 * テスト用ローカルMCPサーバー (stdio transport)
 * JSON-RPC 2.0 over stdin/stdout で動作する最小実装。
 *
 * 使い方: node test-mcp-server.js
 *
 * 提供ツール:
 *   - echo: 入力テキストをそのまま返す
 *   - add:  2つの数値を足す
 *   - now:  現在時刻を返す
 */

import { createInterface } from 'node:readline'

const TOOLS = [
	{
		name: 'echo',
		description: 'Echo back the input message.',
		inputSchema: {
			type: 'object',
			properties: {
				message: { type: 'string', description: 'The message to echo.' }
			},
			required: ['message']
		}
	},
	{
		name: 'add',
		description: 'Add two numbers together.',
		inputSchema: {
			type: 'object',
			properties: {
				a: { type: 'number', description: 'First number.' },
				b: { type: 'number', description: 'Second number.' }
			},
			required: ['a', 'b']
		}
	},
	{
		name: 'now',
		description: 'Return the current date and time.',
		inputSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}
]

function handleToolCall(name, args) {
	switch (name) {
		case 'echo':
			return { content: [{ type: 'text', text: String(args.message || '') }] }
		case 'add':
			return { content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }] }
		case 'now':
			return { content: [{ type: 'text', text: new Date().toISOString() }] }
		default:
			return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
	}
}

function handleRequest(msg) {
	switch (msg.method) {
		case 'initialize':
			return {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: 'test-mcp-server', version: '1.0.0' }
			}
		case 'tools/list':
			return { tools: TOOLS }
		case 'tools/call':
			return handleToolCall(msg.params?.name, msg.params?.arguments || {})
		default:
			return undefined
	}
}

function send(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n')
}

const rl = createInterface({ input: process.stdin })

rl.on('line', line => {
	if (!line.trim()) return

	let msg
	try {
		msg = JSON.parse(line)
	} catch {
		process.stderr.write(`[test-mcp-server] Bad JSON: ${line.slice(0, 100)}\n`)
		return
	}

	// Notification (no id) — ignore silently
	if (msg.id === undefined) return

	const result = handleRequest(msg)
	if (result !== undefined) {
		send({ jsonrpc: '2.0', id: msg.id, result })
	} else {
		send({
			jsonrpc: '2.0',
			id: msg.id,
			error: { code: -32601, message: `Method not found: ${msg.method}` }
		})
	}
})

process.stderr.write('[test-mcp-server] Started.\n')
