import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { UserLocation } from '../types';

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

const RecenterMap: React.FC<{ location: UserLocation; shouldRecenter: boolean; onComplete: () => void }> = ({ 
  location, 
  shouldRecenter,
  onComplete
}) => {
  const map = useMap();

  useEffect(() => {
    if (location && shouldRecenter) {
      // Changed zoom to 22 (maximum supported by config) for extreme close-up
      const targetZoom = location.source === 'ip' ? 15 : 22;
      
      map.flyTo([location.lat, location.lng], targetZoom, {
        animate: true,
        duration: 3, // Slower duration for better visual effect of zooming in
        easeLinearity: 0.25
      });
      onComplete();
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
        
        {location && (
          <>
            <RecenterMap 
              location={location} 
              shouldRecenter={shouldRecenter} 
              onComplete={onRecenterComplete}
            />
            
            <Circle 
              center={[location.lat, location.lng]}
              radius={location.accuracy || (location.source === 'ip' ? 1000 : 5)}
              pathOptions={{ 
                fillColor: location.source === 'ip' ? '#F59E0B' : '#ef4444', 
                fillOpacity: 0.1, 
                color: location.source === 'ip' ? '#D97706' : '#dc2626', 
                weight: 1,
                dashArray: '5, 10' 
              }}
            />
            
            <Marker position={[location.lat, location.lng]}>
              <Popup className="custom-popup">
                <div className="font-mono text-xs">
                  <p className="font-bold uppercase mb-1">Target Located</p>
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