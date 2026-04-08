const prefersReducedMotion =
	typeof window !== 'undefined' &&
	window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const noMotion = { initial: {}, animate: {}, transition: {} }

export const fadeInUp = prefersReducedMotion
	? noMotion
	: {
		initial: { opacity: 0, y: 12 },
		animate: { opacity: 1, y: 0 },
		transition: { duration: 0.4, ease: 'easeOut' }
	}

export const fadeIn = prefersReducedMotion
	? noMotion
	: {
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		transition: { duration: 0.3, ease: 'easeOut' }
	}

export const scaleIn = prefersReducedMotion
	? noMotion
	: {
		initial: { opacity: 0, scale: 0.95 },
		animate: { opacity: 1, scale: 1 },
		transition: { duration: 0.3, ease: 'easeOut' }
	}

export function stagger(index, base = 0.06) {
	if (prefersReducedMotion) return noMotion
	return {
		initial: { opacity: 0, y: 12 },
		animate: { opacity: 1, y: 0 },
		transition: { delay: index * base, duration: 0.3, ease: 'easeOut' }
	}
}
