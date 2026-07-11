import { useState } from 'react'
import { INK, ON_INK, PANEL, TEAL, RUST, inkAlpha } from '../theme'
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
    osmTags: ['electrical_appliances', 'large_electrical_appliances', 'white_goods'],
    tip: 'Fridges, washers & ACs may need refrigerant recovery — most councils offer free bulky-waste pickup for these.',
  },
  {
    id: 'small_appliances',
    label: 'Small appliances',
    osmTags: ['small_electrical_appliances', 'electrical_appliances', 'small_appliances'],
    tip: 'Kettles, toasters, microwaves. Remove any batteries first and drop the appliance in the e-waste bin.',
  },
  {
    id: 'computers',
    label: 'Computers & laptops',
    osmTags: ['computers', 'electrical_appliances'],
    tip: 'Back up, then wipe your drive (factory reset or secure erase) before recycling to protect your data.',
  },
  {
    id: 'phones',
    label: 'Phones & tablets',
    osmTags: ['mobile_phones', 'electrical_appliances', 'computers'],
    tip: 'Sign out of all accounts, remove SIM/SD cards, and factory-reset before handing it over.',
  },
  {
    id: 'batteries',
    label: 'Batteries',
    osmTags: ['batteries', 'car_batteries'],
    tip: 'Tape over the terminals of lithium & button cells to prevent fires — never bin loose batteries.',
  },
  {
    id: 'cables',
    label: 'Cables & chargers',
    osmTags: ['cables', 'electrical_appliances', 'scrap_metal'],
    tip: 'Bundle cables together; they contain recoverable copper and count as e-waste.',
  },
  {
    id: 'lamps',
    label: 'Bulbs & lamps',
    osmTags: ['light_bulbs', 'fluorescent_tubes', 'electrical_appliances'],
    tip: 'Fluorescent tubes & CFLs contain mercury — keep them intact and use a dedicated bulb bin.',
  },
]

interface Site {
  id: number
  name: string
  lat: number
  lon: number
  distanceKm: number
  accepts: string[]     // human-readable list of matched item types
  operator?: string
  openingHours?: string
}

type Coords = { lat: number; lon: number }

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

function tagToLabel(tag: string): string {
  return tag.replace(/_/g, ' ')
}

// Query the public Overpass (OpenStreetMap) API for recycling points near a
// coordinate that accept at least one of the selected item types.
async function findSites(origin: Coords, wantedTags: Set<string>, radiusM: number): Promise<Site[]> {
  const q = `
    [out:json][timeout:25];
    (
      node["amenity"="recycling"](around:${radiusM},${origin.lat},${origin.lon});
      way["amenity"="recycling"](around:${radiusM},${origin.lat},${origin.lon});
    );
    out center tags;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  })
  if (!res.ok) throw new Error(`Location service error (${res.status}). Please try again.`)
  const data = await res.json()

  const sites: Site[] = []
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {}
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat == null || lon == null) continue

    // Which of the user's wanted item types does this site accept?
    const accepts: string[] = []
    for (const t of wantedTags) {
      if (tags[`recycling:${t}`] === 'yes') accepts.push(tagToLabel(t))
    }
    // Skip generic sites that don't accept any electronic item the user chose.
    if (accepts.length === 0) continue

    sites.push({
      id: el.id,
      name: tags.name || tags.operator || 'Recycling point',
      lat,
      lon,
      distanceKm: haversineKm(origin, { lat, lon }),
      accepts: Array.from(new Set(accepts)),
      operator: tags.operator,
      openingHours: tags.opening_hours,
    })
  }
  sites.sort((a, b) => a.distanceKm - b.distanceKm)
  return sites.slice(0, 12)
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

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setSites(null)
  }

  const wantedTags = (): Set<string> => {
    const tags = new Set<string>()
    for (const c of CATEGORIES) if (picked.has(c.id)) c.osmTags.forEach((t) => tags.add(t))
    return tags
  }

  const search = async (origin: Coords) => {
    setLoading(true)
    setError('')
    setSites(null)
    try {
      const found = await findSites(origin, wantedTags(), radiusKm * 1000)
      setSites(found)
    } catch (e: any) {
      setError(e.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
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
        search(c)
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
            {locating ? 'Locating…' : 'Use my location'}
          </button>

          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: inkAlpha(0.55) }}>
            Radius
            <select
              value={radiusKm}
              onChange={(e) => {
                setRadiusKm(Number(e.target.value))
                setSites(null)
              }}
              className="border px-2 py-1 bg-transparent text-[#1c1f21]"
              style={{ borderColor: inkAlpha(0.28) }}
            >
              {[5, 15, 30, 50].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>

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

      {/* Step 3 — results */}
      {(loading || sites) && (
        <section className="space-y-4">
          <StepHeading n={3} title="Nearest drop-off points" />

          {loading && (
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: inkAlpha(0.5) }}>
              Searching within {radiusKm} km…
            </p>
          )}

          {sites && sites.length === 0 && (
            <p className="text-[14px]" style={{ color: inkAlpha(0.6) }}>
              No matching e-waste points found within {radiusKm} km. Try widening the radius, or contact
              your local council — many run periodic e-waste collection days.
            </p>
          )}

          {sites && sites.length > 0 && coords && (
            <EwasteMap origin={coords} sites={sites} activeId={activeId} />
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
        Drop-off data from OpenStreetMap contributors. Coverage varies by region — always confirm
        accepted items and hours before travelling.
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
