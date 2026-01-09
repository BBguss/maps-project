import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { UserLocation } from '../types';

// Custom Red Pulsing Icon Definition
const RedPulseIcon = L.divIcon({
  className: 'red-pulsing-marker',
  html: `
    <div class="pulse-ring"></div>
    <div class="pulse-ring"></div>
    <div class="dot-core"></div>
  `,
  iconSize: [20, 20], // Matches the CSS size logic roughly
  iconAnchor: [10, 10], // Exact center (half of size)
  popupAnchor: [0, -20]
});

interface MapViewProps {
  location: UserLocation | null;
  shouldRecenter: boolean;
  onRecenterComplete: () => void;
}

const RecenterMap: React.FC<{ location: UserLocation; shouldRecenter: boolean; onComplete: () => void }> = ({ 
  location, 
  shouldRecenter,
  onComplete
}) => {
  const map = useMap();

  useEffect(() => {
    // Safety check for invalid coords
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number' || isNaN(location.lat) || isNaN(location.lng)) {
        return;
    }

    if (shouldRecenter) {
      // Fix for mobile: invalidate size to ensure map knows its container size before centering
      map.invalidateSize();

      // Changed zoom to 22 (maximum supported by config) for extreme close-up
      const targetZoom = location.source === 'ip' ? 15 : 22;
      
      try {
        map.flyTo([location.lat, location.lng], targetZoom, {
          animate: true,
          duration: 2.0, // Slightly faster for snappier tracking feel
          easeLinearity: 0.25
        });
        onComplete();
      } catch (e) {
        console.error("Leaflet FlyTo Error:", e);
      }
    }
  }, [location, shouldRecenter, map, onComplete]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ location, shouldRecenter, onRecenterComplete }) => {
  const defaultCenter: [number, number] = [-6.2088, 106.8456];
  const [ready, setReady] = useState(false);

  // Trigger fade in after mount
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const isValidLocation = location && 
                          typeof location.lat === 'number' && 
                          typeof location.lng === 'number' && 
                          !isNaN(location.lat) && 
                          !isNaN(location.lng);

  return (
    <div className={`w-full h-full relative z-0 transition-opacity duration-1000 ease-in-out ${ready ? 'opacity-100' : 'opacity-0'}`}>
      <MapContainer 
        center={defaultCenter} 
        zoom={11} 
        scrollWheelZoom={true} 
        className="w-full h-full"
        style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
        maxZoom={22} 
        zoomControl={false} // Cleaner look
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite Mode">
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
              attribution='&copy; Google Maps'
              maxNativeZoom={20}
              maxZoom={22}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Dark Mode">
             <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; CARTO'
                maxNativeZoom={19}
                maxZoom={22}
             />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        {isValidLocation && location && (
          <>
            <RecenterMap 
              location={location} 
              shouldRecenter={shouldRecenter} 
              onComplete={onRecenterComplete}
            />
            
            {/* Show accuracy circle mainly for IP source or low accuracy GPS, 
                but keep it subtle for GPS so the red dot is the focus */}
            <Circle 
              center={[location.lat, location.lng]}
              radius={location.accuracy || (location.source === 'ip' ? 1000 : 5)}
              pathOptions={{ 
                fillColor: location.source === 'ip' ? '#F59E0B' : '#ff0000', 
                fillOpacity: 0.05, 
                color: location.source === 'ip' ? '#D97706' : '#ff0000', 
                weight: 1,
                opacity: 0.3,
                dashArray: '5, 10' 
              }}
            />
            
            <Marker position={[location.lat, location.lng]} icon={RedPulseIcon}>
              <Popup className="custom-popup">
                <div className="font-mono text-xs">
                  <p className="font-bold uppercase mb-1 text-red-500">Target Locked</p>
                  <p>Lat: {location.lat.toFixed(6)}</p>
                  <p>Lng: {location.lng.toFixed(6)}</p>
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