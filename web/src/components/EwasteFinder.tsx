import { useState, useRef } from 'react'
import { INK, ON_INK, PANEL, TEAL, RUST, inkAlpha } from '../theme'
import { fetchEwaste } from '../api'
import EwasteMap from './EwasteMap'

// ── Item categories the user can dispose, mapped to OpenStreetMap recycling tags ──
interface Category {
  id: string
  label: string
  // OSM `recycling:*=yes` sub-tags that indicate a site accepts this item.
  osmTags: string[]
  // Short, practical prep guidance shown once the item is selected.
  tip: string
}

const CATEGORIES: Category[] = [
  {
    id: 'large_appliances',
    label: 'Large appliances',
    osmTags: ['electrical_appliances', 'large_electrical_appliances', 'white_goods', 'electronic_devices', 'electrical_items'],
    tip: 'Fridges, washers & ACs may need refrigerant recovery — most councils offer free bulky-waste pickup for these.',
  },
  {
    id: 'small_appliances',
    label: 'Small appliances',
    osmTags: ['small_electrical_appliances', 'electrical_appliances', 'small_appliances', 'electronic_devices', 'electrical_items'],
    tip: 'Kettles, toasters, microwaves. Remove any batteries first and drop the appliance in the e-waste bin.',
  },
  {
    id: 'computers',
    label: 'Computers & laptops',
    osmTags: ['computers', 'electrical_appliances', 'electronic_devices', 'electrical_items'],
    tip: 'Back up, then wipe your drive (factory reset or secure erase) before recycling to protect your data.',
  },
  {
    id: 'phones',
    label: 'Phones & tablets',
    osmTags: ['mobile_phones', 'computers', 'electronic_devices', 'electrical_items'],
    tip: 'Sign out of all accounts, remove SIM/SD cards, and factory-reset before handing it over.',
  },
  {
    id: 'batteries',
    label: 'Batteries',
    osmTags: ['batteries', 'car_batteries', 'rechargeable_batteries'],
    tip: 'Tape over the terminals of lithium & button cells to prevent fires — never bin loose batteries.',
  },
  {
    id: 'cables',
    label: 'Cables & chargers',
    osmTags: ['cables', 'scrap_metal', 'electrical_items'],
    tip: 'Bundle cables together; they contain recoverable copper and count as e-waste.',
  },
  {
    id: 'lamps',
    label: 'Bulbs & lamps',
    osmTags: ['light_bulbs', 'fluorescent_tubes', 'lamps', 'light_tubes'],
    tip: 'Fluorescent tubes & CFLs contain mercury — keep them intact and use a dedicated bulb bin.',
  },
]

// Documented national retailer take-back programs. These stores accept e-waste
// even though OpenStreetMap rarely tags them with `recycling:*`, so we match them
// by brand and attribute the accepted item categories from each public program.
interface TakeBack {
  program: string      // shown to the user as the drop-off scheme
  accepts: string[]    // Category ids the program takes back
}

const TAKEBACK_BRANDS: Record<string, TakeBack> = {
  Officeworks: {
    program: 'Officeworks ‘Bring IT Back’',
    accepts: ['computers', 'phones', 'cables', 'batteries'],
  },
  'Bunnings Warehouse': {
    program: 'Bunnings drop-off',
    accepts: ['batteries', 'phones', 'lamps'],
  },
}

interface Site {
  id: number
  name: string
  lat: number
  lon: number
  distanceKm: number
  accepts: string[]     // human-readable list of matched item types
  operator?: string
  openingHours?: string
  program?: string      // retailer take-back scheme, when applicable
}

type Coords = { lat: number; lon: number }

// Slider bounds (km) and the most results we ever render at once.
const MAX_RADIUS_KM = 60
const DISPLAY_LIMIT = 20

// Haversine great-circle distance in kilometres.
function haversineKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Query the public Overpass (OpenStreetMap) API for drop-off options near a
// coordinate: council/community recycling points, waste facilities, and known
// retailer take-back stores that accept at least one of the selected item types.
async function fetchSites(origin: Coords, picked: Set<string>, radiusM: number): Promise<Site[]> {
  const chosen = CATEGORIES.filter((c) => picked.has(c.id))
  // Map each OSM `recycling:<tag>` to the category it satisfies (first wins).
  const tagToCategory = new Map<string, Category>()
  for (const c of chosen) for (const t of c.osmTags) if (!tagToCategory.has(t)) tagToCategory.set(t, c)

  // Run the OpenStreetMap Overpass query through our backend (the browser can't
  // call Overpass directly — it doesn't send CORS headers).
  const data = await fetchEwaste(origin.lat, origin.lon, radiusM, Object.keys(TAKEBACK_BRANDS))

  const sites: Site[] = []
  const seen = new Set<string>()
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {}
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null) continue

    const accepts = new Set<string>()
    let program: string | undefined

    const takeBack = tags.brand ? TAKEBACK_BRANDS[tags.brand] : undefined
    if (takeBack) {
      // A retailer take-back store: accept the program items the user selected.
      program = takeBack.program
      for (const catId of takeBack.accepts) {
        if (picked.has(catId)) accepts.add(CATEGORIES.find((c) => c.id === catId)!.label)
      }
    } else {
      // A recycling / waste facility: match its `recycling:<tag>=yes` flags.
      for (const [t, cat] of tagToCategory) {
        if (tags[`recycling:${t}`] === 'yes') accepts.add(cat.label)
      }
    }
    if (accepts.size === 0) continue

    // De-duplicate stacked points (e.g. a node + its building) by rounded coords.
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)

    sites.push({
      id: el.id,
      name: tags.name || tags.brand || tags.operator || 'Recycling point',
      lat,
      lon,
      distanceKm: haversineKm(origin, { lat, lon }),
      accepts: Array.from(accepts),
      operator: tags.operator,
      openingHours: tags.opening_hours,
      program,
    })
  }
  sites.sort((a, b) => a.distanceKm - b.distanceKm)
  return sites
}

function directionsUrl(s: Site): string {
  return `https://www.openstreetmap.org/directions?to=${s.lat},${s.lon}`
}

export default function EwasteFinder() {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [coords, setCoords] = useState<Coords | null>(null)
  const [sites, setSites] = useState<Site[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [radiusKm, setRadiusKm] = useState(15)
  const [activeId, setActiveId] = useState<number | null>(null)

  // ── Search cache ──────────────────────────────────────────────────────────
  // We over-fetch a buffer beyond the requested radius and remember every point
  // returned, keyed by location + item selection. Shrinking the radius (or a
  // small expansion still inside the buffer) is then answered instantly from
  // memory with zero network calls; only a bigger radius or a changed
  // location/selection triggers a fresh Overpass request.
  const cacheRef = useRef<{ key: string; fetchedKm: number; all: Site[] } | null>(null)
  const reqId = useRef(0)

  const keyFor = (o: Coords, sel: Set<string>) =>
    `${o.lat.toFixed(3)},${o.lon.toFixed(3)}|${Array.from(sel).sort().join(',')}`

  const render = (all: Site[], km: number) =>
    setSites(all.filter((s) => s.distanceKm <= km).slice(0, DISPLAY_LIMIT))

  // Serve the given radius from cache when possible; otherwise fetch (with a
  // buffer) and cache the result. Returns nothing — it drives state directly.
  const applyRadius = async (origin: Coords, km: number, sel: Set<string>) => {
    if (sel.size === 0) {
      setSites(null)
      cacheRef.current = null
      return
    }
    const key = keyFor(origin, sel)
    const cache = cacheRef.current
    if (cache && cache.key === key && cache.fetchedKm >= km) {
      render(cache.all, km) // instant — no network
      return
    }
    // Over-fetch 50% (min +5km) beyond the request so nearby tweaks stay local.
    const fetchKm = Math.min(MAX_RADIUS_KM, Math.max(km + 5, Math.ceil(km * 1.5)))
    const id = ++reqId.current
    setLoading(true)
    setError('')
    try {
      const all = await fetchSites(origin, sel, fetchKm * 1000)
      if (id !== reqId.current) return // a newer request superseded this one
      cacheRef.current = { key, fetchedKm: fetchKm, all }
      render(all, km)
    } catch (e: any) {
      if (id === reqId.current) setError(e.message || 'Search failed.')
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  const toggle = (id: string) => {
    const next = new Set(picked)
    next.has(id) ? next.delete(id) : next.add(id)
    setPicked(next)
    cacheRef.current = null // selection changed → previous results no longer valid
    if (coords) applyRadius(coords, radiusKm, next)
    else setSites(null)
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('Your browser does not support location services.')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        setCoords(c)
        setLocating(false)
        applyRadius(c, radiusKm, picked)
      },
      (err) => {
        setLocating(false)
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow access, or search a different way.'
            : 'Could not determine your location. Please try again.',
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  // While dragging: update the label and, if the cache already covers the new
  // radius, re-filter instantly with no network call.
  const onRadiusInput = (km: number) => {
    setRadiusKm(km)
    if (!coords) return
    const c = cacheRef.current
    if (c && c.key === keyFor(coords, picked) && c.fetchedKm >= km) render(c.all, km)
  }

  // On release: fetch only if the cache can't already satisfy this radius.
  const commitRadius = () => {
    if (coords) applyRadius(coords, radiusKm, picked)
  }

  const hasSelection = picked.size > 0
  const selectedTips = CATEGORIES.filter((c) => picked.has(c.id))

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-[30px] font-bold text-[#1c1f21]">Dispose e-waste</h1>
        <p className="text-[15px] leading-relaxed" style={{ color: inkAlpha(0.72) }}>
          A dead appliance doesn't belong in landfill. Tell us what you're retiring, share your
          location, and we'll find the nearest certified drop-off points — plus how to prep each item
          safely.
        </p>
      </div>

      {/* Step 1 — what to dispose */}
      <section className="space-y-3">
        <StepHeading n={1} title="What are you disposing?" />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = picked.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] px-3 py-1.5 border transition-colors"
                style={
                  on
                    ? { background: INK, color: ON_INK, borderColor: INK }
                    : { background: 'transparent', color: inkAlpha(0.55), borderColor: inkAlpha(0.28) }
                }
              >
                {c.label}
              </button>
            )
          })}
        </div>

        {selectedTips.length > 0 && (
          <ul className="space-y-2 pt-1">
            {selectedTips.map((c) => (
              <li
                key={c.id}
                className="text-[13.5px] leading-snug pl-3 border-l-2"
                style={{ color: inkAlpha(0.7), borderColor: TEAL }}
              >
                <strong className="text-[#1c1f21]">{c.label}:</strong> {c.tip}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Step 2 — location */}
      <section className="space-y-3">
        <StepHeading n={2} title="Where are you?" />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={useMyLocation}
            disabled={!hasSelection || locating || loading}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] px-4 py-2 border transition-colors disabled:opacity-40"
            style={{ background: INK, color: ON_INK, borderColor: INK }}
          >
            {locating ? 'Locating…' : coords ? 'Update location' : 'Use my location'}
          </button>

          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: inkAlpha(0.55) }}>
            <span>Radius</span>
            <input
              type="range"
              min={2}
              max={MAX_RADIUS_KM}
              step={1}
              value={radiusKm}
              onChange={(e) => onRadiusInput(Number(e.target.value))}
              onMouseUp={commitRadius}
              onTouchEnd={commitRadius}
              onKeyUp={commitRadius}
              className="w-40 cursor-pointer"
              style={{ accentColor: INK }}
            />
            <span className="w-12 text-[#1c1f21]">{radiusKm} km</span>
          </div>

          {coords && (
            <span className="font-mono text-[11px]" style={{ color: inkAlpha(0.42) }}>
              {coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}
            </span>
          )}
        </div>

        {!hasSelection && (
          <p className="text-[12.5px]" style={{ color: inkAlpha(0.45) }}>
            Pick at least one item type above to search.
          </p>
        )}
      </section>

      {/* Errors */}
      {error && (
        <div
          className="text-[13px] px-4 py-3 border"
          style={{ color: RUST, borderColor: RUST, background: `${RUST}0d` }}
        >
          {error}
        </div>
      )}

      {/* Step 3 — map + results. Once we have a location the map stays mounted
          for the rest of the session (only a full reload closes it). */}
      {coords && (
        <section className="space-y-4">
          <StepHeading n={3} title="Nearest drop-off points" />

          <EwasteMap origin={coords} sites={sites ?? []} activeId={activeId} />

          {loading && (
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: inkAlpha(0.5) }}>
              Searching within {radiusKm} km…
            </p>
          )}

          {sites && sites.length === 0 && !loading && (
            <p className="text-[14px]" style={{ color: inkAlpha(0.6) }}>
              No matching e-waste points found within {radiusKm} km. Try widening the radius, or contact
              your local council — many run periodic e-waste collection days.
            </p>
          )}

          {sites && sites.length > 0 && (
            <ul className="space-y-3">
              {sites.map((s, i) => (
                <li
                  key={s.id}
                  onMouseEnter={() => setActiveId(s.id)}
                  onMouseLeave={() => setActiveId(null)}
                  className="p-4 border flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 transition-colors"
                  style={{ background: PANEL, borderColor: s.id === activeId ? TEAL : inkAlpha(0.18) }}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-mono text-[11px] font-semibold w-5 h-5 flex items-center justify-center shrink-0"
                        style={{ background: TEAL, color: ON_INK }}
                      >
                        {i + 1}
                      </span>
                      <span className="font-serif text-[17px] font-semibold text-[#1c1f21]">{s.name}</span>
                      {s.operator && s.operator !== s.name && (
                        <span className="text-[12px]" style={{ color: inkAlpha(0.45) }}>
                          · {s.operator}
                        </span>
                      )}
                    </div>
                    {s.program && (
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: inkAlpha(0.5) }}>
                        via {s.program}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {s.accepts.map((a) => (
                        <span
                          key={a}
                          className="font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 border"
                          style={{ color: TEAL, borderColor: `${TEAL}66` }}
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                    {s.openingHours && (
                      <p className="text-[12.5px]" style={{ color: inkAlpha(0.55) }}>
                        Hours: {s.openingHours}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                    <span className="font-mono text-[15px] font-semibold text-[#1c1f21]">
                      {s.distanceKm < 1
                        ? `${Math.round(s.distanceKm * 1000)} m`
                        : `${s.distanceKm.toFixed(1)} km`}
                    </span>
                    <a
                      href={directionsUrl(s)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] px-3 py-1.5 border transition-colors"
                      style={{ color: inkAlpha(0.6), borderColor: inkAlpha(0.28) }}
                    >
                      Directions
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-[11.5px] pt-2" style={{ color: inkAlpha(0.4) }}>
        Drop-off points from OpenStreetMap contributors, plus documented national retailer take-back
        programs (Officeworks, Bunnings). Coverage varies by region — always confirm accepted items and
        hours before travelling.
      </p>
    </div>
  )
}

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="font-mono text-[11px] font-semibold w-6 h-6 flex items-center justify-center border"
        style={{ color: inkAlpha(0.55), borderColor: inkAlpha(0.28) }}
      >
        {n}
      </span>
      <h2 className="font-serif text-xl font-semibold text-[#1c1f21]">{title}</h2>
    </div>
  )
}
