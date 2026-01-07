import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { UserLocation, LogEntry, DeviceInfo } from '../types';

// Helper to get detailed device info
export const getDeviceInfo = (): DeviceInfo => {
  const nav = navigator as any; // Cast to any to access non-standard APIs like connection/deviceMemory
  
  // Try to get GPU info if possible via canvas (lightweight check)
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
    memory: nav.deviceMemory, // Available in Chrome/Edge
    connectionType: nav.connection ? nav.connection.effectiveType : 'unknown',
    touchSupport: nav.maxTouchPoints > 0,
    gpuRenderer: gpuRenderer
  };
};

export const getIpLocation = async (): Promise<UserLocation | null> => {
  // List of providers to try in sequence.
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
      
      if (typeof info.lat === 'number' && typeof info.lng === 'number') {
        console.log(`Location fetched via ${provider.name}`);
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

  // FAILSAFE
  return {
    lat: -6.2088,
    lng: 106.8456,
    accuracy: 10000,
    timestamp: Date.now(),
    source: 'ip',
    ip: '127.0.0.1' // Fallback IP
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

  // Only sync to backend if configured
  if (isSupabaseConfigured && supabase) {
    try {
      // Note: Ensure your Supabase table 'user_locations' has a JSONB column named 'device_info'
      const { error } = await supabase
        .from('user_locations')
        .insert([
          { 
            latitude: location.lat, 
            longitude: location.lng, 
            device_id: deviceId,
            ip_address: newEntry.ip_address,
            image_data: imageData,
            device_info: deviceInfo // Will be stored as JSON
          }
        ]);

      if (!error) {
        newEntry.status = 'synced';
      } else {
        console.error('Supabase error:', error);
      }
    } catch (err) {
      console.error('Sync failed:', err);
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
    timeout: 10000,
    maximumAge: 0
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