/**
 * テスト用ローカルMCPサーバー (stdio transport) — ドット入りツール名
 * JSON-RPC 2.0 over stdin/stdout で動作する最小実装。
 *
 * 使い方: node tests/mcp-server-dotted.test.js
 *
 * 提供ツール:
 *   - articles.list    : 記事一覧を返す
 *   - articles.get     : 指定IDの記事を返す
 *   - articles.create  : 記事を作成する
 *   - articles.update  : 記事を更新する
 *   - articles.delete  : 記事を削除する
 *   - ns.deeply.nested.tool : 多段ドットのツール
 */

import { createInterface } from 'node:readline'

const TOOLS = [
	{
		name: 'articles.list',
		description: 'List all articles.',
		inputSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	},
	{
		name: 'articles.get',
		description: 'Get an article by ID.',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'number', description: 'Article ID.' }
			},
			required: ['id']
		}
	},
	{
		name: 'articles.create',
		description: 'Create a new article.',
		inputSchema: {
			type: 'object',
			properties: {
				title: { type: 'string', description: 'Article title.' },
				body: { type: 'string', description: 'Article body.' }
			},
			required: ['title']
		}
	},
	{
		name: 'articles.update',
		description: 'Update an existing article.',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'number', description: 'Article ID.' },
				title: { type: 'string', description: 'New title.' }
			},
			required: ['id']
		}
	},
	{
		name: 'articles.delete',
		description: 'Delete an article.',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'number', description: 'Article ID.' }
			},
			required: ['id']
		}
	},
	{
		name: 'ns.deeply.nested.tool',
		description: 'A deeply nested namespaced tool.',
		inputSchema: {
			type: 'object',
			properties: {
				value: { type: 'string', description: 'Input value.' }
			},
			required: []
		}
	}
]

function handleToolCall(name, args) {
	switch (name) {
		case 'articles.list':
			return { content: [{ type: 'text', text: JSON.stringify([{ id: 1, title: 'Hello' }]) }] }
		case 'articles.get':
			return { content: [{ type: 'text', text: JSON.stringify({ id: args.id, title: 'Hello' }) }] }
		case 'articles.create':
			return { content: [{ type: 'text', text: JSON.stringify({ id: 99, title: args.title }) }] }
		case 'articles.update':
			return { content: [{ type: 'text', text: JSON.stringify({ id: args.id, title: args.title || 'Updated' }) }] }
		case 'articles.delete':
			return { content: [{ type: 'text', text: JSON.stringify({ deleted: true, id: args.id }) }] }
		case 'ns.deeply.nested.tool':
			return { content: [{ type: 'text', text: `nested:${args.value || 'empty'}` }] }
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
				serverInfo: { name: 'dotted-mcp-server', version: '1.0.0' }
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
		process.stderr.write(`[dotted-mcp-server] Bad JSON: ${line.slice(0, 100)}\n`)
		return
	}

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

process.stderr.write('[dotted-mcp-server] Started.\n')
