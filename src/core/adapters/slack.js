import { appConfig } from '../config.js'

function getThreadTs(conversation) {
	if (!conversation.externalRef) {
		return null
	}

	if (conversation.externalRef.startsWith('thread:')) {
		return conversation.externalRef.slice('thread:'.length)
	}

	return null
}

async function slackApi(pathname, body) {
	if (!appConfig.slackBotToken) {
		return
	}

	await fetch(`https://slack.com/api/${pathname}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			Authorization: `Bearer ${appConfig.slackBotToken}`
		},
		body: JSON.stringify(body)
	})
}

export function createSlackAdapter(app) {
	return {
		type: 'slack',
		async sendAssistantMessage({
			conversation,
			channelIdentity,
			text
		}) {
			const metadata = channelIdentity.metadata || {}
			if (!metadata.channelId) {
				return
			}

			await slackApi('chat.postMessage', {
				channel: metadata.channelId,
				thread_ts: getThreadTs(conversation) || undefined,
				text
			})
		},
		async sendApprovalRequest({
			conversation,
			channelIdentity,
			approval
		}) {
			const metadata = channelIdentity.metadata || {}
			if (!metadata.channelId) {
				return
			}

			await slackApi('chat.postMessage', {
				channel: metadata.channelId,
				thread_ts: getThreadTs(conversation) || undefined,
				text: `Approval required for ${approval.toolName}`,
				blocks: [
					{
						type: 'section',
						text: {
							type: 'mrkdwn',
							text: `*Approval required*\nTool: \`${approval.toolName}\`\nReason: ${approval.reason}`
						}
					},
					{
						type: 'actions',
						elements: [
							{
								type: 'button',
								text: {
									type: 'plain_text',
									text: 'Approve'
								},
								style: 'primary',
								value: approval.id,
								action_id: 'approval_approve'
							},
							{
								type: 'button',
								text: {
									type: 'plain_text',
									text: 'Deny'
								},
								style: 'danger',
								value: approval.id,
								action_id: 'approval_deny'
							}
						]
					}
				]
			})
		},
		async handleEvent(payload) {
			if (payload.type === 'url_verification') {
				return {
					type: 'url_verification',
					challenge: payload.challenge
				}
			}

			if (payload.type !== 'event_callback') {
				return {
					type: 'ack'
				}
			}

			const event = payload.event || {}
			if (
				event.type !== 'message' ||
				event.subtype ||
				event.bot_id ||
				event.channel_type !== 'im'
			) {
				return {
					type: 'ack'
				}
			}

			app.receiveExternalMessage({
				type: 'slack',
				identityKey: `slack:${payload.team_id}:${event.user}:${event.channel}`,
				displayLabel: `Slack ${event.user}`,
				externalRef: event.thread_ts ? `thread:${event.thread_ts}` : `channel:${event.channel}`,
				text: event.text,
				metadata: {
					teamId: payload.team_id,
					userId: event.user,
					channelId: event.channel
				}
			})

			return {
				type: 'ack'
			}
		},
		async handleInteraction(payload) {
			const action = payload.actions?.[0]
			if (!action?.value || !payload.user?.id) {
				return
			}

			const resolved = app.resolveExternalActor({
				type: 'slack',
				identityKey: `slack:${payload.team?.id || payload.user.team_id}:${payload.user.id}:${payload.channel.id}`,
				displayLabel: `Slack ${payload.user.id}`,
				metadata: {
					teamId: payload.team?.id || payload.user.team_id || null,
					userId: payload.user.id,
					channelId: payload.channel.id
				}
			})

			app.decideApproval({
				approvalId: action.value,
				actor: {
					user: resolved.user
				},
				decision: action.action_id === 'approval_approve' ? 'approve' : 'deny'
			})
		}
	}
}
