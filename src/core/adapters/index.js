import { createDiscordAdapter } from './discord.js'
import { createSlackAdapter } from './slack.js'
import { webChannelAdapter } from './web.js'

export function registerDefaultChannelAdapters(app) {
	app.registerChannelAdapter('web', webChannelAdapter)
	app.registerChannelAdapter('slack', createSlackAdapter(app))
	app.registerChannelAdapter('discord', createDiscordAdapter(app))
}
