import { Provider as JotaiProvider } from 'jotai'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App.jsx'
import { ThemeProvider } from './components/layout/ThemeProvider.jsx'
import { I18nProvider } from './i18n/context.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
	<React.StrictMode>
		<JotaiProvider>
			<BrowserRouter>
				<I18nProvider>
					<ThemeProvider>
						<App />
						<Toaster richColors position="top-right" />
					</ThemeProvider>
				</I18nProvider>
			</BrowserRouter>
		</JotaiProvider>
	</React.StrictMode>
)
