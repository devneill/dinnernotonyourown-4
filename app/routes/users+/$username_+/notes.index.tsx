Route.

	const displayName = notesMatch?.data?.owner.name ?? params.username
	const noteCount = notesMatch?.data?.owner.notes.length ?? 0
	const notesText = noteCount === 1 ? 'note' : 'notes'
	return [
		{ title: `${displayName}'s Notes | DinnerNotOnYourOwn` },
		{
			name: 'description',
			content: `Checkout ${displayName}'s ${noteCount} ${notesText} on DinnerNotOnYourOwn`,
		},
	]
}
