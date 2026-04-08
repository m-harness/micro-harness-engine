import { appConfig } from '../config.js'

async function discordApi(pathname, body) {
	if (!appConfig.discordBotToken) {
		return
	}

	await fetch(`https://discord.com/api/v10/${pathname}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			Authorization: `Bot ${appConfig.discordBotToken}`
		},
		body: JSON.stringify(body)
	})
}

function buildIdentityKey(payload) {
	return `discord:${payload.user.id}:${payload.channel_id}`
}

function getConversationRef(payload, requestedSession = null) {
	if (requestedSession) {
		return `session:${requestedSession}`
	}

	return `channel:${payload.channel_id}`
}

export function createDiscordAdapter(app) {
	return {
		type: 'discord',
		async sendAssistantMessage({
			channelIdentity,
			text
		}) {
			const metadata = channelIdentity.metadata || {}
			if (!metadata.channelId) {
				return
			}

			await discordApi(`channels/${metadata.channelId}/messages`, {
				content: text
			})
		},
		async sendApprovalRequest({
			channelIdentity,
			approval
		}) {
			const metadata = channelIdentity.metadata || {}
			if (!metadata.channelId) {
				return
			}

			await discordApi(`channels/${metadata.channelId}/messages`, {
				content: `Approval required for ${approval.toolName}\n${approval.reason}`,
				components: [
					{
						type: 1,
						components: [
							{
								type: 2,
								style: 3,
								label: 'Approve',
								custom_id: `approval:approve:${approval.id}`
							},
							{
								type: 2,
								style: 4,
								label: 'Deny',
								custom_id: `approval:deny:${approval.id}`
							}
						]
					}
				]
			})
		},
		async handleInteraction(payload) {
			if (payload.type === 1) {
				return {
					type: 1
				}
			}

			if (payload.type === 2) {
				const commandName = payload.data?.name
				if (commandName === 'chat') {
					const message = payload.data.options?.find(option => option.name === 'message')?.value
					const session = payload.data.options?.find(option => option.name === 'session')?.value || null
					app.receiveExternalMessage({
						type: 'discord',
						identityKey: buildIdentityKey(payload),
						displayLabel: `Discord ${payload.member?.user?.username || payload.user?.username || payload.member?.user?.id || payload.user.id}`,
						externalRef: getConversationRef(payload, session),
						text: String(message || ''),
						metadata: {
							channelId: payload.channel_id,
							userId: payload.user?.id || payload.member?.user?.id
						}
					})

					return {
						type: 4,
						data: {
							content: 'Message received. microHarnessEngine is working on it.',
							flags: 64
						}
					}
				}

				if (commandName === 'new-session') {
					const sessionName = payload.data.options?.find(option => option.name === 'session')?.value || `session-${Date.now()}`
					return {
						type: 4,
						data: {
							content: `Use /chat session:${sessionName} message:<text> to continue this conversation.`,
							flags: 64
						}
					}
				}
			}

			if (payload.type === 3 && payload.data?.custom_id?.startsWith('approval:')) {
				const [, decision, approvalId] = payload.data.custom_id.split(':')
				const resolved = app.resolveExternalActor({
					type: 'discord',
					identityKey: buildIdentityKey(payload),
					displayLabel: `Discord ${payload.member?.user?.username || payload.user?.username || payload.member?.user?.id || payload.user.id}`,
					metadata: {
						channelId: payload.channel_id,
						userId: payload.user?.id || payload.member?.user?.id
					}
				})
				app.decideApproval({
					approvalId,
					actor: {
						user: resolved.user
					},
					decision
				})

				return {
					type: 4,
					data: {
						content: `Approval ${decision}d.`,
						flags: 64
					}
				}
			}

			return {
				type: 4,
				data: {
					content: 'Unsupported interaction.',
					flags: 64
				}
			}
		}
	}
}
