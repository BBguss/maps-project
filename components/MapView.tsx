import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { UserLocation } from '../types';

// Fix for default Leaflet marker icons in React/ESM environments
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: iconUrl,
    iconRetinaUrl: iconRetinaUrl,
    shadowUrl: shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  location: UserLocation | null;
  shouldRecenter: boolean;
  onRecenterComplete: () => void;
}

// Component to handle map movement programmatically
const RecenterMap: React.FC<{ location: UserLocation; shouldRecenter: boolean; onComplete: () => void }> = ({ 
  location, 
  shouldRecenter,
  onComplete
}) => {
  const map = useMap();

  useEffect(() => {
    if (location && shouldRecenter) {
      // Determine zoom level based on source
      // IP based is approximate, so we don't want to zoom in too close (which looks confusing)
      // GPS is precise, so we zoom in deep.
      const targetZoom = location.source === 'ip' ? 13 : 19;
      
      map.flyTo([location.lat, location.lng], targetZoom, {
        animate: true,
        duration: 1.5
      });
      onComplete();
    }
  }, [location, shouldRecenter, map, onComplete]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ location, shouldRecenter, onRecenterComplete }) => {
  const defaultCenter: [number, number] = [-6.2088, 106.8456]; // Jakarta default

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer 
        center={defaultCenter} 
        zoom={11} 
        scrollWheelZoom={true} 
        className="w-full h-full"
        style={{ height: '100%', width: '100%', background: '#202020' }}
        maxZoom={22} 
      >
        <LayersControl position="topright">
          {/* Google Hybrid - Best for High Zoom clarity */}
          <LayersControl.BaseLayer checked name="Google Hybrid (Jelas)">
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              attribution='&copy; Google Maps'
              maxNativeZoom={20}
              maxZoom={22}
            />
          </LayersControl.BaseLayer>

          {/* Esri Satellite - Backup */}
          <LayersControl.BaseLayer name="Esri Satelit">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles &copy; Esri'
              maxNativeZoom={18} 
              maxZoom={22}
            />
          </LayersControl.BaseLayer>

          {/* OpenStreetMap - Standard */}
          <LayersControl.BaseLayer name="Peta Jalan (OSM)">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
              maxNativeZoom={19}
              maxZoom={22}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        {location && (
          <>
            <RecenterMap 
              location={location} 
              shouldRecenter={shouldRecenter} 
              onComplete={onRecenterComplete}
            />
            
            {/* Accuracy Circle */}
            <Circle 
              center={[location.lat, location.lng]}
              radius={location.accuracy || (location.source === 'ip' ? 1000 : 20)}
              pathOptions={{ 
                fillColor: location.source === 'ip' ? '#F59E0B' : '#3b82f6', 
                fillOpacity: 0.15, 
                color: location.source === 'ip' ? '#D97706' : '#2563eb', 
                weight: location.source === 'ip' ? 1 : 2,
                dashArray: location.source === 'ip' ? '10, 10' : undefined 
              }}
            />
            
            {/* User Marker */}
            <Marker position={[location.lat, location.lng]}>
              <Popup>
                <div className="text-sm font-sans min-w-[150px]">
                  <p className={`font-bold ${location.source === 'ip' ? 'text-orange-600' : 'text-green-600'}`}>
                    {location.source === 'ip' ? 'Perkiraan Lokasi (IP)' : 'Lokasi Akurat (GPS)'}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    {location.source === 'ip' ? 'Berdasarkan jaringan internet' : 'Berdasarkan sensor satelit'}
                  </p>
                  <div className="mt-1 text-xs text-gray-600 bg-gray-100 p-2 rounded border border-gray-200">
                    <p>Lat: {location.lat.toFixed(6)}</p>
                    <p>Lng: {location.lng.toFixed(6)}</p>
                    <p>Acc: ±{Math.round(location.accuracy || 0)}m</p>
                  </div>
                </div>
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>
    </div>
  );
};

export default MapView;