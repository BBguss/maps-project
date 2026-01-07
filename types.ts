export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: number;
  source?: 'ip' | 'gps';
  ip?: string; // Capture IP address string
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  screenResolution: string;
  windowSize: string;
  language: string;
  cores?: number;
  memory?: number; // RAM in GB (approx)
  connectionType?: string;
  touchSupport: boolean;
  gpuRenderer?: string;
}

export interface LogEntry {
  id: string;
  latitude: number;
  longitude: number;
  device_id: string;
  ip_address?: string;
  image_data?: string; // Base64 string of the captured image
  device_info?: DeviceInfo; // Added comprehensive device info
  created_at: string;
  status: 'synced' | 'local_simulation';
}

export interface AppState {
  isTracking: boolean;
  permissionStatus: 'prompt' | 'granted' | 'denied';
  currentLocation: UserLocation | null;
  logs: LogEntry[];
  isAdminOpen: boolean;
}