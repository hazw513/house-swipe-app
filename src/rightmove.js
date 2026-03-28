/**
 * Rightmove property search service.
 *
 * Fetches the search results HTML page via the Vite dev proxy,
 * extracts the embedded __NEXT_DATA__ JSON, and maps properties
 * to the shape the app expects.
 */

const RM_TYPE_MAP = {
  Detached: "detached",
  "Semi-detached": "semi-detached",
  Terraced: "terraced",
  Flat: "flat",
  Bungalow: "bungalow",
  Cottage: "detached", // no dedicated Rightmove type
  Maisonette: "flat",
  "New build": "",
};

const RM_SUBTYPE_REVERSE = {
  Detached: "Detached",
  "Semi-Detached": "Semi-detached",
  "Semi-detached": "Semi-detached",
  Terraced: "Terraced",
  "End of Terrace": "Terraced",
  Flat: "Flat",
  Apartment: "Flat",
  Maisonette: "Maisonette",
  Bungalow: "Bungalow",
  "Detached Bungalow": "Bungalow",
  "Semi-Detached Bungalow": "Bungalow",
  Cottage: "Cottage",
  House: "Detached",
  Penthouse: "Flat",
  Park: "Detached",
  Land: "Detached",
};

/**
 * Parse "1,160 sq. ft." → 1160, or return null.
 */
function parseSqFt(raw) {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/([\d.]+)\s*sq/i);
  return m ? Math.round(Number(m[1])) : null;
}

/**
 * Try to extract a UK outcode (e.g. "E17", "LS10", "SW1A") from an address string.
 */
function extractPostcode(address) {
  // Full postcode like "SW1A 1AA"
  const full = address.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  if (full) return full[1].replace(/\s+/g, " ").toUpperCase().split(" ")[0];
  // Outcode only like "E17" at end
  const out = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/gi);
  if (out) return out[out.length - 1].toUpperCase();
  return "";
}

/**
 * Build the Rightmove search URL for the given filters.
 * Uses the "pretty URL" format which auto-resolves location names.
 */
function buildSearchUrl(filters) {
  const location = (filters.location || "London").trim().replace(/\s+/g, "-");
  const params = new URLSearchParams();

  params.set("sortType", "6"); // newest first
  params.set("numberOfPropertiesPerPage", "24");
  params.set("areaSizeUnit", "sqft");
  params.set("currencyCode", "GBP");
  params.set("channel", "BUY");
  params.set("includeSSTC", "false");

  if (filters.radius != null) params.set("radius", String(filters.radius));
  if (filters.minBeds) params.set("minBedrooms", String(filters.minBeds));
  if (filters.minPrice) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));

  if (filters.selectedTypes?.length) {
    const rmTypes = filters.selectedTypes
      .map((t) => RM_TYPE_MAP[t])
      .filter(Boolean);
    if (rmTypes.length) params.set("propertyTypes", rmTypes.join(","));
  }

  if (filters.newBuildOnly) params.set("mustHave", "newHome");
  if (filters.keyword) params.set("keywords", filters.keyword);

  return `/rm-api/property-for-sale/${encodeURIComponent(location)}.html?${params}`;
}

/**
 * Map a Rightmove property object to the shape the app uses.
 */
function mapProperty(rm) {
  const postcode = extractPostcode(rm.displayAddress || "");
  const sqft = parseSqFt(rm.displaySize);
  const subType = rm.propertySubType || "";
  const mappedType = RM_SUBTYPE_REVERSE[subType] || subType || "Detached";

  const keywords = (rm.keyFeatures || [])
    .map((kf) => kf.description)
    .filter((d) => d && !d.startsWith("£"))
    .slice(0, 5);

  return {
    id: rm.id,
    source: "Rightmove",
    title: rm.displayAddress || "Property",
    location: rm.displayAddress || "",
    postcode,
    price: rm.price?.amount || 0,
    bedrooms: rm.bedrooms || 0,
    bathrooms: rm.bathrooms || 0,
    areaSqFt: sqft,
    propertyType: mappedType,
    newBuild: rm.listingUpdate?.listingUpdateReason === "new_home" ||
      rm.heading?.toLowerCase().includes("new") ||
      false,
    keywords,
    image: rm.propertyImages?.mainImageSrc || rm.images?.[0]?.srcUrl || "",
    url: rm.propertyUrl
      ? `https://www.rightmove.co.uk${rm.propertyUrl}`
      : "https://www.rightmove.co.uk",
    summary: rm.summary || rm.propertyTypeFullDescription || "",
    coordinates: rm.location
      ? { lat: rm.location.latitude, lng: rm.location.longitude }
      : null,
    displayPrice: rm.price?.displayPrices?.[0]?.displayPrice || "",
    priceQualifier: rm.price?.displayPrices?.[0]?.displayPriceQualifier || "",
    agent: rm.customer?.branchDisplayName || "",
    addedOrReduced: rm.addedOrReduced || "",
    tenure: rm.tenure?.tenureType || "",
    floorPlanInsights: null, // not available from search results
  };
}

/**
 * Search Rightmove for properties matching the given filters.
 * Returns { properties: MappedProperty[], totalResults: number, error: string|null }.
 */
export async function searchRightmove(filters) {
  const url = buildSearchUrl(filters);

  try {
    const res = await fetch(url, {
      headers: { Accept: "text/html" },
    });

    if (!res.ok) {
      return { properties: [], totalResults: 0, error: `HTTP ${res.status}` };
    }

    const html = await res.text();

    // Extract __NEXT_DATA__ JSON from the page
    const marker = "__NEXT_DATA__";
    const idx = html.indexOf(marker);
    if (idx === -1) {
      return { properties: [], totalResults: 0, error: "Could not parse results" };
    }

    const scriptStart = html.indexOf(">", idx) + 1;
    const scriptEnd = html.indexOf("</script>", scriptStart);
    const jsonStr = html.substring(scriptStart, scriptEnd).trim();

    const data = JSON.parse(jsonStr);
    const searchResults = data?.props?.pageProps?.searchResults;

    if (!searchResults?.properties?.length) {
      return { properties: [], totalResults: 0, error: null };
    }

    const properties = searchResults.properties.map(mapProperty);
    const totalResults = searchResults.resultCount
      ? parseInt(searchResults.resultCount.replace(/,/g, ""), 10)
      : properties.length;

    return { properties, totalResults, error: null };
  } catch (err) {
    return { properties: [], totalResults: 0, error: err.message };
  }
}
