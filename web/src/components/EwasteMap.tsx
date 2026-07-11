import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { INK, ON_INK, TEAL, inkAlpha } from '../theme'

// A drop-off site, kept structurally in sync with EwasteFinder's Site type.
export interface MapSite {
  id: number
  name: string
  lat: number
  lon: number
  distanceKm: number
  accepts: string[]
}

interface Props {
  origin: { lat: number; lon: number }
  sites: MapSite[]
  activeId?: number | null
}

// Ink dot marking the user's own location.
const meIcon = L.divIcon({
  className: '',
  html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${INK};box-shadow:0 0 0 4px ${inkAlpha(0.18)};"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

// Numbered teal pin for each drop-off site.
function siteIcon(n: number, active: boolean) {
  const bg = active ? INK : TEAL
  return L.divIcon({
    className: '',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};color:${ON_INK};font:600 11px ui-monospace,monospace;box-shadow:0 1px 3px rgba(0,0,0,0.3);"><span style="transform:rotate(45deg)">${n}</span></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  })
}

// Fit the viewport to include the user and every site whenever they change.
function FitBounds({ origin, sites }: { origin: Props['origin']; sites: MapSite[] }) {
  const map = useMap()
  useEffect(() => {
    const pts: [number, number][] = [[origin.lat, origin.lon], ...sites.map((s) => [s.lat, s.lon] as [number, number])]
    if (pts.length === 1) {
      map.setView(pts[0], 13)
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 })
    }
  }, [map, origin, sites])
  return null
}

export default function EwasteMap({ origin, sites, activeId }: Props) {
  return (
    <div className="border" style={{ borderColor: inkAlpha(0.18) }}>
      <MapContainer
        center={[origin.lat, origin.lon]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: 340, width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds origin={origin} sites={sites} />

        <Marker position={[origin.lat, origin.lon]} icon={meIcon}>
          <Popup>You are here</Popup>
        </Marker>

        {sites.map((s, i) => (
          <Marker key={s.id} position={[s.lat, s.lon]} icon={siteIcon(i + 1, s.id === activeId)}>
            <Popup>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <br />
              {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`} away
              {s.accepts.length > 0 && (
                <>
                  <br />
                  <span style={{ color: TEAL }}>{s.accepts.join(', ')}</span>
                </>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
