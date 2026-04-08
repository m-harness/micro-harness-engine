import { forwardRef } from 'react'
import { cn } from '../../lib/utils.js'

const Input = forwardRef(({ className, type, ...props }, ref) => (
	<input
		ref={ref}
		type={type}
		className={cn(
			'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...props}
	/>
))
Input.displayName = 'Input'

export { Input }
