import { afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadConfig, PROJECT_ROOT, type Config } from '../src/config';
import { initializeChecks, openDatabase, type Services } from '../src/db';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	for (const fn of cleanup.splice(0).reverse()) await fn();
});
export function onCleanup(fn: () => void | Promise<void>) {
	cleanup.push(fn);
}

export function temporaryDirectory() {
	const base = resolve(PROJECT_ROOT, '.cache/tests');
	mkdirSync(base, { recursive: true });
	const directory = mkdtempSync(join(base, 'case-'));
	onCleanup(() => {
		if (dirname(resolve(directory)) !== base) throw new Error('Unsafe cleanup path');
		rmSync(directory, { recursive: true, force: true });
	});
	return directory;
}

export function fixture(overrides: Partial<Config> = {}): Services {
	const config = {
		...loadConfig({
			ADMIN_USERNAME: 'operator',
			ADMIN_PASSWORD: 'test-password',
			SESSION_SECRET: 'test-session-secret',
			OPENAI_API_KEY: 'test-api-key',
		}),
		...overrides,
	};
	const services = { config, db: openDatabase(overrides.databasePath ?? ':memory:') };
	initializeChecks(services);
	onCleanup(() => services.db.close());
	return services;
}
