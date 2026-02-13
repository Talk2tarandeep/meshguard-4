import React, { useState } from 'react';
import { MapPin } from 'lucide-react';

interface EmergencyDashboardProps {
  status?: 'safe' | 'connected' | 'offline';
  onSOSClick?: () => void;
  onGenerateLink?: () => void;
  onScanPeer?: () => void;
  onMessageChange?: (message: string) => void;
}

const EmergencyDashboard: React.FC<EmergencyDashboardProps> = ({
  status = 'connected',
  onSOSClick,
  onGenerateLink,
  onScanPeer,
  onMessageChange,
}) => {
  const [message, setMessage] = useState('');

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    onMessageChange?.(value);
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'safe':
        return { label: 'Safe', color: 'bg-green-500', textColor: 'text-green-500' };
      case 'connected':
        return { label: 'Connected', color: 'bg-blue-500', textColor: 'text-blue-500' };
      case 'offline':
        return { label: 'Offline', color: 'bg-gray-500', textColor: 'text-gray-500' };
      default:
        return { label: 'Connected', color: 'bg-blue-500', textColor: 'text-blue-500' };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col pb-24">
      {/* Top Section */}
      <div className="px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">MeshGuard</h1>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/50 border border-slate-800">
            <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
            <span className={`text-xs font-medium ${statusConfig.textColor}`}>
              {statusConfig.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <MapPin className="w-4 h-4" />
          <span className="text-xs">Location Active</span>
        </div>
      </div>

      {/* Main Section - SOS Button */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <button
          onClick={onSOSClick}
          className="relative w-48 h-48 rounded-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-lg uppercase tracking-wider shadow-lg shadow-red-900/50 active:scale-95 transition-transform duration-150"
        >
          <span className="relative z-10">Emergency SOS</span>
          {/* Pulse Animation */}
          <span className="absolute inset-0 rounded-full bg-red-500 opacity-75 animate-ping" />
        </button>
      </div>

      {/* Message Section */}
      <div className="px-6 pb-6">
        <textarea
          value={message}
          onChange={handleMessageChange}
          placeholder="Enter emergency message..."
          className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-700 resize-none min-h-[100px]"
        />
      </div>

      {/* Bottom Section - Action Buttons */}
      <div className="px-6 pb-6 space-y-3">
        <button
          onClick={onGenerateLink}
          className="w-full py-3 px-4 border border-slate-700 rounded-xl text-sm font-medium text-white hover:bg-slate-900/50 active:scale-[0.98] transition-all"
        >
          Generate Link
        </button>
        <button
          onClick={onScanPeer}
          className="w-full py-3 px-4 border border-slate-700 rounded-xl text-sm font-medium text-white hover:bg-slate-900/50 active:scale-[0.98] transition-all"
        >
          Scan Peer
        </button>
      </div>
    </div>
  );
};

export default EmergencyDashboard;
