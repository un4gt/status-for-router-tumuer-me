import type { Config, RegionDefinition } from './config';

// City centres, not individual probe machines' physical locations.
const COORDINATES: Record<string, { lat: number; lng: number }> = {
	shanghai: { lat: 31.2304, lng: 121.4737 },
	beijing: { lat: 39.9042, lng: 116.4074 },
	hongkong: { lat: 22.3193, lng: 114.1694 },
	tokyo: { lat: 35.6762, lng: 139.6503 },
	siliconvalley: { lat: 37.3382, lng: -121.8863 },
};

export function regionCoordinates(region: Pick<RegionDefinition, 'id' | 'lat' | 'lng'>) {
	if (region.lat !== undefined && region.lng !== undefined) return { lat: region.lat, lng: region.lng };
	return COORDINATES[region.id] ?? null;
}

export function getTopology(config: Config) {
	return {
		target: config.globeTarget,
		intervals: { network: config.globalping.intervalSeconds * 1000, model: config.cloudProbe.intervalSeconds * 1000 },
	};
}
