import { cn } from '../../lib/utils.js'

export function Skeleton({ className, ...props }) {
	return (
		<div
			className={cn(
				'rounded-lg bg-muted animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-muted via-muted-foreground/5 to-muted',
				className
			)}
			{...props}
		/>
	)
}
