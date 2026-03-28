const SQFT_PER_SQM = 10.7639;
const CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build a bounding box ~0.5 mi around a lat/lng.
 */
function bbox(lat, lng, radiusMiles = 0.5) {
  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180));
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
}

/**
 * Fetch sold-price pins from HouseMetric for the area around a coordinate.
 * Returns { avgPsf, sampleCount, areaLabel, sales } or null on failure.
 */
export async function fetchAreaBenchmark(lat, lng, postcode) {
  const cacheKey = `${postcode}|${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    const box = bbox(lat, lng, 0.5);
    const url = `/hm-api/pins?bbox=${box.join(",")}&zoom=16`;
    const res = await fetch(url);

    if (!res.ok) return null;

    const geojson = await res.json();
    if (!geojson?.features?.length) return null;

    // Filter to recent sales (last 5 years) that have floor-area data
    const now = Date.now();
    const fiveYearsMs = 5 * 365.25 * 24 * 60 * 60 * 1000;
    const recent = geojson.features.filter((f) => {
      const p = f.properties;
      if (!p.sqm || !p.price) return false;
      if (p.dated) {
        const saleDate = new Date(p.dated).getTime();
        if (now - saleDate > fiveYearsMs) return false;
      }
      return true;
    });

    if (recent.length < 3) return null;

    // Calculate average £/sqft
    let sumPsf = 0;
    for (const f of recent) {
      const p = f.properties;
      sumPsf += p.price / (p.sqm * SQFT_PER_SQM);
    }
    const avgPsf = Math.round(sumPsf / recent.length);

    const result = {
      avgPsf,
      sampleCount: recent.length,
      areaLabel: `${postcode} area (${recent.length} sales)`,
      totalSales: geojson.features.length,
    };

    CACHE.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}
