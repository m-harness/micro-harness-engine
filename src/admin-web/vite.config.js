import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:4310'

export default defineConfig({
	plugins: [react()],
	server: {
		port: 4173,
		proxy: {
			'/api': apiTarget
		}
	}
})
