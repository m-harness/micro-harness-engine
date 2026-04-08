export function EmptyState({ title, description, action }) {
	return (
		<div className="flex min-h-[16rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-center">
			<h3 className="text-lg font-semibold">{title}</h3>
			<p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
			{action ? <div className="mt-5">{action}</div> : null}
		</div>
	)
}
