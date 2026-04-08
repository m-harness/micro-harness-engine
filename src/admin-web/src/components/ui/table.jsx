import { forwardRef } from 'react'
import { cn } from '../../lib/utils.js'

const Table = forwardRef(({ className, ...props }, ref) => (
	<div className="relative w-full overflow-auto">
		<table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
	</div>
))
Table.displayName = 'Table'

const THead = forwardRef(({ className, ...props }, ref) => (
	<thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
))
THead.displayName = 'THead'

const TBody = forwardRef(({ className, ...props }, ref) => (
	<tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TBody.displayName = 'TBody'

const TR = forwardRef(({ className, ...props }, ref) => (
	<tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
))
TR.displayName = 'TR'

const TH = forwardRef(({ className, ...props }, ref) => (
	<th ref={ref} className={cn('h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0', className)} {...props} />
))
TH.displayName = 'TH'

const TD = forwardRef(({ className, ...props }, ref) => (
	<td ref={ref} className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)} {...props} />
))
TD.displayName = 'TD'

export { Table, THead, TBody, TR, TH, TD }
