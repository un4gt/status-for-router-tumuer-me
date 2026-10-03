import { createApp } from './app';
import { loadConfig } from './config';
import { initializeChecks, openDatabase } from './db';
import { createScheduler } from './scheduler';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const services = { db, config };
initializeChecks(services);
const scheduler = createScheduler(services);
const addresses = new WeakMap<Request, string>();
const app = createApp(services, scheduler, { clientIp: (request) => addresses.get(request) || 'unknown' });
const server = Bun.serve({
	hostname: config.host,
	port: config.port,
	maxRequestBodySize: 1024 * 1024,
	fetch(request, server) {
		addresses.set(request, server.requestIP(request)?.address || 'unknown');
		if (new URL(request.url).pathname === '/api/admin/run') server.timeout(request, 0);
		return app.fetch(request);
	},
});
scheduler.start();
console.log(`Router status listening on ${server.url}`);

let shuttingDown = false;
async function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	const stopped = server.stop(false);
	await scheduler.stop();
	await stopped;
	db.close();
	process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
