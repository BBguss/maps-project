import React, { useState, useMemo } from 'react';
import { LogEntry } from '../types';
import { isSupabaseConfigured } from '../supabaseClient';

interface AdminPanelProps {
  logs: LogEntry[];
}

// Helper: Calculate distance between two coords in km (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

const AdminPanel: React.FC<AdminPanelProps> = ({ logs }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Advanced Filtering Logic
  const processedLogs = useMemo(() => {
    // 1. Sort by Newest first
    const sorted = [...logs].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const result: LogEntry[] = [];
    const ipTracker = new Map<string, { lat: number, lng: number }>();

    // 2. Iterate and deduplicate based on IP and Location
    for (const log of sorted) {
      const ip = log.ip_address || 'Unknown';
      
      // If we haven't seen this IP yet, add it
      if (!ipTracker.has(ip)) {
        result.push(log);
        ipTracker.set(ip, { lat: log.latitude, lng: log.longitude });
      } else {
        // We have seen this IP. Check if the location is significantly different.
        const lastLoc = ipTracker.get(ip)!;
        const distKm = calculateDistance(log.latitude, log.longitude, lastLoc.lat, lastLoc.lng);
        
        // Threshold: 0.05 km = 50 meters. 
        // If moved more than 50m OR if it has an image (always show captures), keep it.
        if (distKm > 0.05 || log.image_data) {
          result.push(log);
          // Update the tracker to this new location reference point
          // (We don't update if it's just an image capture at the same spot to keep the movement path clear, 
          // but for this logic let's update it to track from the latest point shown)
          ipTracker.set(ip, { lat: log.latitude, lng: log.longitude });
        }
        // If distance is small (<50m) and no image, we consider it a duplicate heartbeat and skip it.
      }
    }

    return result;
  }, [logs]);

  return (
    // Added h-screen and overflow-y-auto to fix the scrolling issue
    <div className="h-screen w-full overflow-y-auto bg-gray-50 font-sans text-gray-800">
      
      {/* Navbar */}
      <div className="bg-white shadow-md border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 text-white p-2.5 rounded-lg shadow-indigo-200 shadow-lg">
            <i className="fa-solid fa-shield-halved text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Admin Monitor</h1>
            <p className="text-xs text-gray-500 font-medium">Filtered Intelligence Dashboard</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
           <span className={`text-xs px-3 py-1.5 rounded-full font-bold border ${
             isSupabaseConfigured 
               ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
               : 'bg-amber-50 text-amber-700 border-amber-200'
           }`}>
             <i className={`fa-solid fa-circle text-[8px] mr-2 ${isSupabaseConfigured ? 'text-emerald-500' : 'text-amber-500'}`}></i>
             {isSupabaseConfigured ? 'DB CONNECTED' : 'LOCAL MODE'}
           </span>
           <button 
             onClick={() => window.location.href = '/'}
             className="text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
           >
             <i className="fa-solid fa-arrow-left mr-2"></i> Map View
           </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-7xl mx-auto pb-20">
        
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200/60">
            <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Events</p>
                <i className="fa-solid fa-layer-group text-gray-300"></i>
            </div>
            <p className="text-3xl font-bold text-gray-800">{logs.length}</p>
            <p className="text-xs text-gray-400 mt-1">Raw incoming signals</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200/60">
             <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Significant</p>
                <i className="fa-solid fa-filter text-indigo-300"></i>
            </div>
            <p className="text-3xl font-bold text-indigo-600">{processedLogs.length}</p>
            <p className="text-xs text-gray-400 mt-1">After duplication filter</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200/60">
             <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Captures</p>
                <i className="fa-solid fa-camera text-rose-300"></i>
            </div>
            <p className="text-3xl font-bold text-rose-600">{logs.filter(l => l.image_data).length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200/60">
             <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Unique IPs</p>
                <i className="fa-solid fa-globe text-blue-300"></i>
            </div>
            <p className="text-3xl font-bold text-blue-600">{new Set(logs.map(l => l.ip_address).filter(ip => ip !== 'Unknown')).size}</p>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div>
                <h2 className="font-bold text-gray-800 text-lg">Activity Feed</h2>
                <p className="text-xs text-gray-500 mt-0.5">Showing unique locations per IP (Moving &gt; 50m)</p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              title="Refresh Data"
            >
              <i className="fa-solid fa-rotate-right text-lg"></i>
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-gray-500 font-semibold uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">Time / IP</th>
                  <th className="px-6 py-4">Device Fingerprint</th>
                  <th className="px-6 py-4">Coordinates</th>
                  <th className="px-6 py-4 text-center">Visual</th>
                  <th className="px-6 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {processedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <i className="fa-solid fa-satellite-dish text-4xl mb-3 opacity-30"></i>
                        <p className="font-medium">No tracking data available yet.</p>
                        <p className="text-xs mt-1">Activate the tracker on the main page to start receiving telemetry.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  processedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors group">
                      
                      {/* Time & IP */}
                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-col">
                            <span className="font-bold text-gray-900 text-base">
                                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-xs text-gray-400 mb-2">
                                {new Date(log.created_at).toLocaleDateString()}
                            </span>
                            
                            <div className="flex items-center mt-1">
                                {log.ip_address !== 'Unknown' ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                        {log.ip_address}
                                    </span>
                                ) : (
                                    <span className="text-gray-400 text-xs italic">Hidden IP</span>
                                )}
                            </div>
                        </div>
                      </td>

                      {/* Device Info */}
                      <td className="px-6 py-4 align-top">
                        <div className="mb-1">
                             <span className="font-mono text-xs text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded">
                                {log.device_id.split('_')[1] || log.device_id}
                             </span>
                        </div>
                        {log.device_info ? (
                          <div className="text-[11px] leading-relaxed text-gray-500">
                             <div className="flex items-center gap-2">
                                <i className={`fa-brands ${log.device_info.platform.toLowerCase().includes('win') ? 'fa-windows' : log.device_info.platform.toLowerCase().includes('android') ? 'fa-android' : 'fa-apple'}`}></i>
                                <span className="font-medium text-gray-700 truncate max-w-[150px]">{log.device_info.platform}</span>
                             </div>
                             <div>Res: {log.device_info.screenResolution}</div>
                             <div className="truncate w-40 text-gray-400" title={log.device_info.userAgent}>
                                {log.device_info.userAgent.substring(0, 20)}...
                             </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">- No telemetry -</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-col space-y-2">
                            <a 
                            href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center group-hover:translate-x-1 transition-transform duration-200"
                            >
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3 text-blue-600 shrink-0">
                                <i className="fa-solid fa-location-crosshairs"></i>
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 text-sm">
                                    {log.latitude.toFixed(5)}, {log.longitude.toFixed(5)}
                                </p>
                                <p className="text-xs text-blue-500 hover:underline">View on Google Maps</p>
                            </div>
                            </a>
                        </div>
                      </td>

                      {/* Image */}
                      <td className="px-6 py-4 align-middle text-center">
                        {log.image_data ? (
                          <button 
                            onClick={() => setSelectedImage(log.image_data!)}
                            className="relative inline-block w-24 h-16 rounded-lg overflow-hidden border-2 border-white shadow-md hover:shadow-lg hover:scale-105 transition-all cursor-zoom-in"
                          >
                            <img src={log.image_data} alt="Capture" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                            <div className="absolute bottom-1 right-2 text-white text-[10px] font-bold">
                                <i className="fa-solid fa-camera mr-1"></i> CAM
                            </div>
                          </button>
                        ) : (
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-300">
                             <i className="fa-solid fa-image-slash"></i>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 align-top text-right">
                         <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                           log.status === 'synced' 
                             ? 'bg-green-100 text-green-700 border border-green-200' 
                             : 'bg-gray-100 text-gray-600 border border-gray-200'
                         }`}>
                           {log.status === 'synced' ? 'SYNCED' : 'LOCAL'}
                         </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
              <span>Auto-grouping enabled: Hiding duplicates within 50m radius.</span>
              <span>System V1.0</span>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full flex flex-col items-center">
            <div className="w-full flex justify-end mb-2">
                 <button 
                  className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"
                  onClick={() => setSelectedImage(null)}
                >
                  <i className="fa-solid fa-xmark text-xl w-6 h-6 flex items-center justify-center"></i>
                </button>
            </div>
           
            <img 
              src={selectedImage} 
              alt="Full capture" 
              className="w-auto h-auto max-h-[80vh] rounded shadow-2xl border border-gray-800" 
            />
            <p className="text-gray-400 mt-4 font-mono text-sm">
                <i className="fa-solid fa-info-circle mr-2"></i>
                Original Resolution Capture
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;