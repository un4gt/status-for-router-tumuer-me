export function transitionGrid(width: number, height: number) {
	// Around 110 tiles on large screens; fewer, readable tiles on small screens.
	const targetSize = Math.max(72, Math.sqrt((width * height) / 110));
	const columns = Math.max(4, Math.round(width / targetSize));
	const size = width / columns;
	const rows = Math.ceil(height / size);
	return { columns, rows, size };
}
