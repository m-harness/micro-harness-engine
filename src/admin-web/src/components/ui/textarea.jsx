import { forwardRef } from 'react'
import { cn } from '../../lib/utils.js'

const Textarea = forwardRef(({ className, ...props }, ref) => (
	<textarea
		ref={ref}
		className={cn(
			'flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...props}
	/>
))
Textarea.displayName = 'Textarea'

export { Textarea }
