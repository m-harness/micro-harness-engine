import fs from 'node:fs'
import path from 'node:path'
import { HttpError } from './http.js'
import { appConfig } from './config.js'

export const skillsDir = path.resolve(appConfig.projectRoot, 'skills')

const SKILL_NAME_RE = /^[a-z0-9_]+$/
const SKILL_NAME_MAX = 64

function parseFrontmatter(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
	if (!match) {
		return null
	}
	const meta = {}
	for (const line of match[1].split(/\r?\n/)) {
		const idx = line.indexOf(':')
		if (idx === -1) continue
		const key = line.slice(0, idx).trim()
		const value = line.slice(idx + 1).trim()
		if (key) meta[key] = value
	}
	return { meta, body: match[2].trim() }
}

function buildContent(name, description, prompt) {
	return `---\nname: ${name}\ndescription: ${description}\n---\n${prompt}\n`
}

function validateSkillName(name) {
	if (!name || typeof name !== 'string') {
		throw new HttpError(400, 'Skill name is required.')
	}
	if (name.length > SKILL_NAME_MAX) {
		throw new HttpError(400, `Skill name must be at most ${SKILL_NAME_MAX} characters.`)
	}
	if (!SKILL_NAME_RE.test(name)) {
		throw new HttpError(400, 'Skill name must match [a-z0-9_].')
	}
}

function loadSkillsFromDisk() {
	const result = new Map()
	if (!fs.existsSync(skillsDir)) {
		return result
	}

	const entries = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'))
	for (const entry of entries) {
		try {
			const fullPath = path.join(skillsDir, entry)
			const raw = fs.readFileSync(fullPath, 'utf-8')
			const parsed = parseFrontmatter(raw)
			if (!parsed) continue
			const { meta } = parsed
			if (meta.name && meta.description) {
				result.set(meta.name, {
					name: meta.name,
					description: meta.description,
					filePath: fullPath
				})
			}
		} catch (err) {
			console.warn(`[skills] Failed to load ${entry}:`, err.message)
		}
	}
	return result
}

export function createSkillRegistry() {
	let skills = loadSkillsFromDisk()

	return {
		reload() {
			skills = loadSkillsFromDisk()
		},

		listSkills() {
			return [...skills.values()].map(s => ({
				name: s.name,
				description: s.description
			}))
		},

		listSkillsDetailed() {
			return [...skills.values()].map(s => {
				try {
					const raw = fs.readFileSync(s.filePath, 'utf-8')
					const parsed = parseFrontmatter(raw)
					return {
						name: s.name,
						description: s.description,
						prompt: parsed?.body || ''
					}
				} catch {
					return {
						name: s.name,
						description: s.description,
						prompt: ''
					}
				}
			})
		},

		getSkill(name) {
			const entry = skills.get(name)
			if (!entry) return null
			const raw = fs.readFileSync(entry.filePath, 'utf-8')
			const parsed = parseFrontmatter(raw)
			if (!parsed || !parsed.body) return null
			return {
				name: entry.name,
				description: entry.description,
				prompt: parsed.body
			}
		},

		getSkillDetail(name) {
			const entry = skills.get(name)
			if (!entry) return null
			try {
				const raw = fs.readFileSync(entry.filePath, 'utf-8')
				const parsed = parseFrontmatter(raw)
				return {
					name: entry.name,
					description: entry.description,
					prompt: parsed?.body || '',
					fileName: path.basename(entry.filePath)
				}
			} catch {
				return {
					name: entry.name,
					description: entry.description,
					prompt: '',
					fileName: path.basename(entry.filePath)
				}
			}
		},

		createSkill({ name, description, prompt }) {
			validateSkillName(name)
			if (!description || typeof description !== 'string' || !description.trim()) {
				throw new HttpError(400, 'Skill description is required.')
			}
			if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
				throw new HttpError(400, 'Skill prompt is required.')
			}
			if (skills.has(name)) {
				throw new HttpError(409, `Skill "${name}" already exists.`)
			}
			if (!fs.existsSync(skillsDir)) {
				fs.mkdirSync(skillsDir, { recursive: true })
			}
			fs.writeFileSync(
				path.join(skillsDir, `${name}.md`),
				buildContent(name, description.trim(), prompt.trim()),
				'utf-8'
			)
			skills = loadSkillsFromDisk()
			return this.getSkillDetail(name)
		},

		updateSkill(name, { description, prompt }) {
			const entry = skills.get(name)
			if (!entry) {
				throw new HttpError(404, `Skill "${name}" not found.`)
			}
			const raw = fs.readFileSync(entry.filePath, 'utf-8')
			const parsed = parseFrontmatter(raw)
			const nextDescription = (description && description.trim()) || entry.description
			const nextPrompt = (prompt && prompt.trim()) || parsed?.body || ''
			fs.writeFileSync(
				entry.filePath,
				buildContent(name, nextDescription, nextPrompt),
				'utf-8'
			)
			skills = loadSkillsFromDisk()
			return this.getSkillDetail(name)
		},

		deleteSkill(name) {
			const entry = skills.get(name)
			if (!entry) {
				throw new HttpError(404, `Skill "${name}" not found.`)
			}
			fs.unlinkSync(entry.filePath)
			skills = loadSkillsFromDisk()
		},

		getSkillNames() {
			return [...skills.keys()]
		},

		getUseSkillDefinition() {
			if (skills.size === 0) {
				return null
			}
			const names = [...skills.keys()]
			return {
				name: 'use_skill',
				description:
					'Activate a skill to load specialized instructions into the conversation. ' +
					`Available skills: ${names.join(', ')}`,
				input_schema: {
					type: 'object',
					properties: {
						skill_name: {
							type: 'string',
							description: `The name of the skill to activate. One of: ${names.join(', ')}`,
							enum: names
						}
					},
					required: ['skill_name']
				}
			}
		}
	}
}
