import { forwardRef } from 'react'
import { cn } from '../../lib/utils.js'

const Card = forwardRef(({ className, ...props }, ref) => (
	<div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-panel', className)} {...props} />
))
Card.displayName = 'Card'

const CardHeader = forwardRef(({ className, ...props }, ref) => (
	<div ref={ref} className={cn('space-y-1 border-b border-border/50 px-6 py-5', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef(({ className, ...props }, ref) => (
	<h2 ref={ref} className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = forwardRef(({ className, ...props }, ref) => (
	<p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

const CardContent = forwardRef(({ className, ...props }, ref) => (
	<div ref={ref} className={cn('px-6 py-5', className)} {...props} />
))
CardContent.displayName = 'CardContent'

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
