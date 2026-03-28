import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchAreaBenchmark } from "./housemetric.js";
import { searchRightmove } from "./rightmove.js";
import {
  Bath,
  BedDouble,
  Building2,
  ExternalLink,
  Filter,
  Heart,
  Home,
  Landmark,
  MapPin,
  Minus,
  Moon,
  Navigation,
  PoundSterling,
  RotateCcw,
  Ruler,
  Search,
  TrendingDown,
  TrendingUp,
  Warehouse,
  X,
  BarChart3,
} from "lucide-react";

const PROPERTY_TYPES = [
  "Detached",
  "Semi-detached",
  "Terraced",
  "Flat",
  "Bungalow",
  "Cottage",
  "Maisonette",
  "New build",
];

const RADIUS_OPTIONS = [0, 0.25, 0.5, 1, 3, 5, 10, 15, 20, 30, 40];

// Static fallback benchmarks — only used when HouseMetric is unreachable
const FALLBACK_BENCHMARKS = {
  E17: { areaLabel: "Walthamstow / E17", avgPsf: 590, sampleCount: 142 },
  LS10: { areaLabel: "Leeds Dock / LS10", avgPsf: 360, sampleCount: 87 },
  SK9: { areaLabel: "Wilmslow / SK9", avgPsf: 470, sampleCount: 63 },
  CT5: { areaLabel: "Whitstable / CT5", avgPsf: 505, sampleCount: 54 },
  B1: { areaLabel: "Birmingham B1", avgPsf: 390, sampleCount: 198 },
  MK10: { areaLabel: "Milton Keynes MK10", avgPsf: 350, sampleCount: 121 },
  HX7: { areaLabel: "Hebden Bridge HX7", avgPsf: 325, sampleCount: 38 },
  EX2: { areaLabel: "Exeter EX2", avgPsf: 410, sampleCount: 76 },
};

function getHousemetricMapUrl(home) {
  if (!home?.coordinates) return "https://housemetric.co.uk/map/";
  const { lat, lng } = home.coordinates;
  return `https://housemetric.co.uk/map/?lat=${lat}&lng=${lng}&zoom=15`;
}

function getHousemetricSearchUrl(home) {
  return `https://housemetric.co.uk/?q=${encodeURIComponent(home.postcode)}`;
}

const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function formatPercent(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function TypeIcon({ type }) {
  if (type === "Flat" || type === "Maisonette") return <Building2 size={16} />;
  if (type === "Detached" || type === "Semi-detached" || type === "Terraced") return <Home size={16} />;
  if (type === "Bungalow") return <Warehouse size={16} />;
  return <Landmark size={16} />;
}

function getPriceChecker(home, liveBenchmark) {
  const benchmark = liveBenchmark || FALLBACK_BENCHMARKS[home.postcode];
  const listingPsf = home.areaSqFt ? home.price / home.areaSqFt : null;

  if (!benchmark || !listingPsf) {
    return {
      listingPsf: listingPsf,
      benchmarkPsf: null,
      deltaPct: null,
      sampleCount: null,
      label: "No benchmark",
      tone: "neutral",
      summary: "No area benchmark has been attached for this listing yet.",
      isLive: !!liveBenchmark,
    };
  }

  const deltaPct = ((listingPsf - benchmark.avgPsf) / benchmark.avgPsf) * 100;

  const base = {
    listingPsf,
    benchmarkPsf: benchmark.avgPsf,
    deltaPct,
    sampleCount: benchmark.sampleCount,
    areaLabel: benchmark.areaLabel,
    isLive: !!liveBenchmark,
  };

  if (deltaPct >= 10) {
    return {
      ...base,
      label: "Above area average",
      tone: "high",
      summary: `At ${pounds.format(listingPsf)}/sqft this listing is ${formatPercent(deltaPct)} above the area average of ${pounds.format(benchmark.avgPsf)}/sqft — it may carry a premium for condition, spec, or location within the postcode.`,
    };
  }

  if (deltaPct <= -10) {
    return {
      ...base,
      label: "Below area average",
      tone: "low",
      summary: `At ${pounds.format(listingPsf)}/sqft this listing is ${formatPercent(deltaPct)} below the area average of ${pounds.format(benchmark.avgPsf)}/sqft — it could represent good relative value.`,
    };
  }

  return {
    ...base,
    label: "Fair value",
    tone: "neutral",
    summary: `At ${pounds.format(listingPsf)}/sqft this listing is broadly in line with the area average of ${pounds.format(benchmark.avgPsf)}/sqft.`,
  };
}

function MiniMap({ home }) {
  if (!home?.coordinates) {
    return <div className="map-fallback">No map available</div>;
  }

  const { lat, lng } = home.coordinates;
  const mapSrc = `https://maps.google.com/maps?q=${lat},${lng}&z=14&output=embed`;

  return (
    <div className="map-frame">
      <iframe
        title={`Map for ${home.title}`}
        src={mapSrc}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

function useLiveBenchmark(home) {
  const [benchmark, setBenchmark] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastId = useRef(null);

  useEffect(() => {
    if (!home?.coordinates || !home?.postcode) {
      setBenchmark(null);
      return;
    }

    if (lastId.current === home.id) return;
    lastId.current = home.id;

    let cancelled = false;
    setLoading(true);

    fetchAreaBenchmark(home.coordinates.lat, home.coordinates.lng, home.postcode)
      .then((result) => {
        if (!cancelled) {
          setBenchmark(result);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [home?.id, home?.coordinates, home?.postcode]);

  return { benchmark, loading };
}

function PriceCheckerCard({ home }) {
  const { benchmark: liveBenchmark, loading } = useLiveBenchmark(home);
  const analysis = getPriceChecker(home, liveBenchmark);
  const mapUrl = getHousemetricMapUrl(home);
  const searchUrl = getHousemetricSearchUrl(home);

  const toneMeta = {
    high: {
      badgeClass: "badge-high",
      panelClass: "signal-high",
      icon: <TrendingUp size={16} />,
    },
    low: {
      badgeClass: "badge-low",
      panelClass: "signal-low",
      icon: <TrendingDown size={16} />,
    },
    neutral: {
      badgeClass: "badge-neutral",
      panelClass: "signal-neutral",
      icon: <Minus size={16} />,
    },
  }[analysis.tone || "neutral"];

  return (
    <section className="panel">
      <div className="section-header">
        <div className="section-title">
          <BarChart3 size={16} />
          <span>Price checker</span>
        </div>
        {loading ? (
          <span className="badge badge-neutral">Loading…</span>
        ) : (
          <span className={`badge ${toneMeta.badgeClass}`}>{analysis.label}</span>
        )}
      </div>

      {loading ? (
        <div className="price-checker-loading">
          <div className="loading-shimmer" />
          <div className="loading-shimmer short" />
          <div className="small-copy">Fetching live area data from HouseMetric…</div>
        </div>
      ) : analysis.listingPsf && analysis.benchmarkPsf ? (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Listing £/sqft</div>
              <div className="metric-value">{pounds.format(analysis.listingPsf)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Area avg £/sqft</div>
              <div className="metric-value">{pounds.format(analysis.benchmarkPsf)}</div>
            </div>
          </div>

          <div className={`signal-card ${toneMeta.panelClass}`}>
            <div className="signal-title">
              {toneMeta.icon}
              <span>Pricing signal: {formatPercent(analysis.deltaPct)} vs area average</span>
            </div>
            <div className="signal-copy">{analysis.summary}</div>
          </div>

          <div className="hm-source-block">
            <div className="hm-source-row">
              <div className="small-copy">
                <strong>Area:</strong> {analysis.areaLabel}
                <br />
                <strong>Based on:</strong> {analysis.sampleCount} recent sold prices with £/sqft from Land Registry &amp; EPC data
                {analysis.isLive ? (
                  <span className="badge badge-live">Live</span>
                ) : (
                  <span className="badge badge-fallback">Cached</span>
                )}
              </div>
            </div>
            <div className="hm-actions">
              <a className="btn btn-hm" href={mapUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                <span>View area on HouseMetric</span>
              </a>
              <a className="btn btn-hm-alt" href={searchUrl} target="_blank" rel="noreferrer">
                <Search size={14} />
                <span>Search {home.postcode}</span>
              </a>
            </div>
            <div className="hm-disclaimer">
              Data from <a href="https://housemetric.co.uk" target="_blank" rel="noreferrer">housemetric.co.uk</a> — Land Registry sold prices + EPC floor areas (Open Government Licence v3.0).
            </div>
          </div>
        </>
      ) : (
        <div className="hm-source-block">
          <div className="small-copy">
            {analysis.listingPsf
              ? `Listing is ${pounds.format(analysis.listingPsf)}/sqft but no area comparison data is available yet.`
              : "No area benchmark available for this postcode."}
          </div>
          <div className="hm-actions">
            <a className="btn btn-hm" href={mapUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              <span>Check on HouseMetric</span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

function FilterPanel(props) {
  const {
    provider,
    setProvider,
    locationQuery,
    setLocationQuery,
    radius,
    setRadius,
    minBeds,
    setMinBeds,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,
    selectedTypes,
    toggleType,
    keyword,
    setKeyword,
    newBuildOnly,
    setNewBuildOnly,
    resetDeck,
    onApply,
    onClose,
  } = props;

  return (
    <section className="filters-card">
      <div className="filters-header">
        <div>
          <div className="filters-title">Filters</div>
          <div className="filters-subtitle">Refine your property search</div>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="field-block">
        <div className="field-label">Portal</div>
        <div className="chip-row">
          {["Both", "Rightmove", "OnTheMarket"].map((item) => (
            <button
              key={item}
              className={`chip ${provider === item ? "chip-active" : ""}`}
              onClick={() => setProvider(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="field-block">
        <label className="field-label">Location</label>
        <div className="input-wrap">
          <Search size={16} className="input-icon" />
          <input
            className="input input-with-icon"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            placeholder="e.g. E17, Leeds, Wilmslow"
          />
        </div>
      </div>

      <div className="two-col">
        <div className="field-block">
          <label className="field-label">Radius</label>
          <select className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            {RADIUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} mi
              </option>
            ))}
          </select>
        </div>

        <div className="field-block">
          <label className="field-label">Bedrooms</label>
          <select className="input" value={minBeds} onChange={(e) => setMinBeds(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value === 0 ? "Any" : `${value}+`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="two-col">
        <div className="field-block">
          <label className="field-label">Min price</label>
          <input className="input" type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
        </div>

        <div className="field-block">
          <label className="field-label">Max price</label>
          <input className="input" type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </div>
      </div>

      <div className="field-block">
        <label className="field-label">Property types</label>
        <div className="chip-row">
          {PROPERTY_TYPES.map((type) => (
            <button
              key={type}
              className={`chip ${selectedTypes.includes(type) ? "chip-active" : ""}`}
              onClick={() => toggleType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="field-block">
        <label className="field-label">Keyword</label>
        <input
          className="input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="garden, garage, station..."
        />
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={newBuildOnly} onChange={(e) => setNewBuildOnly(e.target.checked)} />
        <span>New build only</span>
      </label>

      <div className="two-col">
        <button className="btn btn-secondary" onClick={resetDeck}>
          <RotateCcw size={16} />
          <span>Reset deck</span>
        </button>
        <button className="btn btn-primary" onClick={onApply}>
          Apply filters
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [provider, setProvider] = useState("Both");
  const [locationQuery, setLocationQuery] = useState("London");
  const [radius, setRadius] = useState(1);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minBeds, setMinBeds] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [newBuildOnly, setNewBuildOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [likes, setLikes] = useState([]);
  const [dislikes, setDislikes] = useState([]);

  // Live search state
  const [homes, setHomes] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const doSearch = useCallback(async () => {
    if (!locationQuery.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const result = await searchRightmove({
        location: locationQuery.trim(),
        radius,
        minBeds: minBeds || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        selectedTypes: selectedTypes.length ? selectedTypes : undefined,
        newBuildOnly,
        keyword: keyword || undefined,
      });
      if (result.error) {
        setSearchError(result.error);
        setHomes([]);
      } else {
        setHomes(result.properties);
        setTotalResults(result.totalResults);
      }
    } catch (err) {
      setSearchError(err.message);
      setHomes([]);
    } finally {
      setSearchLoading(false);
    }
  }, [locationQuery, radius, minBeds, minPrice, maxPrice, selectedTypes, newBuildOnly, keyword]);

  // Initial search on mount
  useEffect(() => { doSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unseenHomes = useMemo(() => {
    const seenIds = new Set([...likes.map((h) => h.id), ...dislikes.map((h) => h.id)]);
    return homes.filter((h) => !seenIds.has(h.id));
  }, [homes, likes, dislikes]);

  const currentHome = unseenHomes[0] || null;

  const handleChoice = (direction) => {
    if (!currentHome) return;
    if (direction === "like") setLikes((prev) => [currentHome, ...prev]);
    if (direction === "dislike") setDislikes((prev) => [currentHome, ...prev]);
  };

  const resetDeck = () => {
    setLikes([]);
    setDislikes([]);
  };

  const toggleType = (type) => {
    setSelectedTypes((prev) => (
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    ));
  };

  const closeFilters = useCallback(() => setShowFilters(false), []);
  const openFilters = useCallback(() => setShowFilters(true), []);

  const handleApplyFilters = useCallback(() => {
    setShowFilters(false);
    setLikes([]);
    setDislikes([]);
    doSearch();
  }, [doSearch]);

  return (
    <div className="page">
      <div className="page-inner">
        <header className="hero">
          <div className="hero-title">
            <span>HouseSwipe</span>
            <Moon size={22} />
          </div>
          <p className="hero-copy">
            Swipe through real Rightmove listings with embedded maps,
            area price checks powered by HouseMetric, and smart filters.
          </p>
        </header>

        <div className="layout">
          <main className="content">
            <div className="mobile-frame">
              <div className="phone-notch" />
              <div className="phone-content">
                <div className="mobile-topbar">
                  <div>
                    <div className="mobile-title">HouseSwipe</div>
                    <div className="mobile-subtitle">Swipe right to shortlist, left to pass</div>
                  </div>
                  <button className="icon-btn" onClick={openFilters}>
                    <Filter size={16} />
                  </button>
                </div>

                <div className="search-summary">
                  <div>
                    <div className="search-summary-title">Current search</div>
                    <div className="search-summary-copy">
                      Rightmove • {locationQuery || "Anywhere"} • within {radius} mi • {searchLoading ? "searching…" : `${totalResults} result${totalResults === 1 ? "" : "s"}`} • {unseenHomes.length} in deck
                    </div>
                  </div>
                  <span className="badge badge-sky">{likes.length} liked</span>
                </div>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      className="filter-modal-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      onClick={closeFilters}
                    >
                      <motion.div
                        className="filter-modal"
                        initial={{ y: "100%", scale: 0.95 }}
                        animate={{ y: 0, scale: 1 }}
                        exit={{ y: "100%", scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="filter-modal-handle" />
                        <FilterPanel
                          provider={provider}
                          setProvider={setProvider}
                          locationQuery={locationQuery}
                          setLocationQuery={setLocationQuery}
                          radius={radius}
                          setRadius={setRadius}
                          minBeds={minBeds}
                          setMinBeds={setMinBeds}
                          minPrice={minPrice}
                          setMinPrice={setMinPrice}
                          maxPrice={maxPrice}
                          setMaxPrice={setMaxPrice}
                          selectedTypes={selectedTypes}
                          toggleType={toggleType}
                          keyword={keyword}
                          setKeyword={setKeyword}
                          newBuildOnly={newBuildOnly}
                          setNewBuildOnly={setNewBuildOnly}
                          resetDeck={resetDeck}
                          onApply={handleApplyFilters}
                          onClose={closeFilters}
                        />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="deck-shell">
                  <AnimatePresence mode="wait">
                    {currentHome ? (
                      <motion.article
                        key={currentHome.id}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        onDragEnd={(_, info) => {
                          if (info.offset.x > 120) handleChoice("like");
                          else if (info.offset.x < -120) handleChoice("dislike");
                        }}
                        initial={{ scale: 0.96, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: -10 }}
                        transition={{ type: "spring", stiffness: 220, damping: 20 }}
                        className="listing-card"
                      >
                        <div className="listing-image-wrap">
                          <img src={currentHome.image} alt={currentHome.title} className="listing-image" />
                          <div className="listing-overlay" />
                          <div className="listing-image-badges">
                            <span className="badge badge-dark">{currentHome.source}</span>
                            {currentHome.newBuild ? <span className="badge badge-sky">New build</span> : null}
                          </div>
                          <div className="listing-image-copy">
                            <div className="listing-price">{pounds.format(currentHome.price)}</div>
                            <div className="listing-title">{currentHome.title}</div>
                            <div className="listing-location">
                              <MapPin size={14} />
                              <span>{currentHome.location}</span>
                            </div>
                          </div>
                        </div>

                        <div className="listing-body">
                          <div className="metrics-grid four">
                            <div className="metric-card compact">
                              <BedDouble size={16} />
                              <div className="metric-value-sm">{currentHome.bedrooms}</div>
                              <div className="metric-label-sm">Beds</div>
                            </div>
                            <div className="metric-card compact">
                              <Bath size={16} />
                              <div className="metric-value-sm">{currentHome.bathrooms}</div>
                              <div className="metric-label-sm">Baths</div>
                            </div>
                            <div className="metric-card compact">
                              <Ruler size={16} />
                              <div className="metric-value-sm">{currentHome.areaSqFt || "—"}</div>
                              <div className="metric-label-sm">Sq ft</div>
                            </div>
                            <div className="metric-card compact">
                              <TypeIcon type={currentHome.propertyType} />
                              <div className="metric-value-sm">{currentHome.propertyType}</div>
                              <div className="metric-label-sm">Type</div>
                            </div>
                          </div>

                          <p className="body-copy">{currentHome.summary}</p>

                          {currentHome.agent && (
                            <div className="small-copy" style={{ marginBottom: 8, opacity: 0.7 }}>
                              {currentHome.agent} • {currentHome.addedOrReduced}
                              {currentHome.tenure ? ` • ${currentHome.tenure.charAt(0) + currentHome.tenure.slice(1).toLowerCase()}` : ""}
                            </div>
                          )}

                          <div className="chip-row">
                            {currentHome.keywords.map((keywordItem) => (
                              <span key={keywordItem} className="chip chip-static">{keywordItem}</span>
                            ))}
                          </div>

                          <section className="panel">
                            <div className="section-title">
                              <Navigation size={16} />
                              <span>Location map</span>
                            </div>
                            <MiniMap home={currentHome} />
                          </section>

                          <PriceCheckerCard home={currentHome} />

                          <div className="actions">
                            <button className="circle-btn circle-btn-pass" onClick={() => handleChoice("dislike")}>
                              <X size={22} />
                            </button>
                            <a className="btn btn-secondary" href={currentHome.url} target="_blank" rel="noreferrer">
                              <ExternalLink size={16} />
                              <span>Listing</span>
                            </a>
                            <button className="circle-btn circle-btn-like" onClick={() => handleChoice("like")}>
                              <Heart size={22} />
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="empty-state"
                      >
                        <div className="empty-icon">
                          {searchLoading ? <Search size={28} /> : <Home size={28} />}
                        </div>
                        <div className="empty-title">
                          {searchLoading
                            ? "Searching Rightmove…"
                            : searchError
                              ? "Search failed"
                              : !hasSearched
                                ? "Enter a location to start"
                                : "No more homes in this deck"}
                        </div>
                        <p className="empty-copy">
                          {searchLoading
                            ? "Fetching live listings, just a moment."
                            : searchError
                              ? `Error: ${searchError}. Try a different location.`
                              : !hasSearched
                                ? "Open the filters and enter a location like E17, Leeds, or Brighton."
                                : "Broaden the radius, lower the bedroom requirement, widen the price range, or reset the deck."}
                        </p>
                        {!searchLoading && (
                          <div className="actions">
                            <button className="btn btn-secondary" onClick={resetDeck}>Reset deck</button>
                            <button className="btn btn-primary" onClick={openFilters}>Adjust filters</button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="bottom-grid">
              <section className="panel">
                <div className="section-title">
                  <Heart size={16} />
                  <span>Shortlisted homes</span>
                </div>
                <div className="list-stack">
                  {likes.length ? likes.map((home) => (
                    <div key={home.id} className="shortlist-item">
                      <img src={home.image} alt={home.title} className="shortlist-image" />
                      <div className="shortlist-content">
                        <div className="shortlist-title">{home.title}</div>
                        <div className="shortlist-location">{home.location}</div>
                        <div className="chip-row">
                          <span className="chip chip-static">{pounds.format(home.price)}</span>
                          <span className="chip chip-static">{home.source}</span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="small-copy">Swipe right on a property to add it here.</div>
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="section-title">
                  <PoundSterling size={16} />
                  <span>About</span>
                </div>
                <div className="notes-card">
                  <strong>Live Rightmove search</strong>
                  <div className="small-copy">
                    Properties are fetched live from Rightmove when you apply filters.
                    Enter any UK location — postcode, town, or city — and adjust radius,
                    price, beds, and property type to refine results.
                  </div>
                </div>
                <div className="notes-card">
                  <strong>Price checker — HouseMetric</strong>
                  <div className="small-copy">
                    Each listing's asking price per sqft is compared against the area average £/sqft
                    derived from Land Registry sold prices and EPC floor area data via{" "}
                    <a href="https://housemetric.co.uk" target="_blank" rel="noreferrer">housemetric.co.uk</a>.
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
