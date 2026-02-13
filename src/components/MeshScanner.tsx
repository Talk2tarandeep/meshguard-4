import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Flashlight, RotateCcw, X, Keyboard } from 'lucide-react';
import { p2pMesh } from '../network/P2pMesh';
import { offlineStorage } from '../services/OfflineStorage';

interface MeshScannerProps {
  onScanSuccess?: () => void;
  onClose?: () => void;
}

type HandshakeState = 'IDLE' | 'SCANNING' | 'PROCESSING_SCAN' | 'CONNECTING' | 'SHOWING_ANSWER';

const MeshScanner: React.FC<MeshScannerProps> = ({ onScanSuccess, onClose }) => {
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'searching' | 'found'>('idle');
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [state, setState] = useState<HandshakeState>('IDLE');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stateRef = useRef<HandshakeState>('IDLE');
  const scanFrameRef = useRef<HTMLDivElement>(null);
  const lastScanTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Load saved camera preference
  useEffect(() => {
    const loadCameraPreference = async () => {
      try {
        const savedCameraId = await offlineStorage.getPreference<string>('lastCameraId');
        if (savedCameraId) {
          setSelectedCameraId(savedCameraId);
        }
      } catch (err) {
        console.error('[MeshScanner] Failed to load camera preference:', err);
      }
    };
    loadCameraPreference();
  }, []);

  // Discover cameras
  useEffect(() => {
    const discoverCameras = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          const cameraList = devices.map(d => ({ id: d.id, label: d.label }));
          setCameras(cameraList);
          
          // Use saved preference or default to back camera
          const savedId = await offlineStorage.getPreference<string>('lastCameraId');
          if (savedId && cameraList.find(c => c.id === savedId)) {
            setSelectedCameraId(savedId);
          } else {
            const backCamera = cameraList.find(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('environment')
            );
            setSelectedCameraId(backCamera ? backCamera.id : cameraList[0].id);
          }
        }
      } catch (err) {
        console.error('[MeshScanner] Camera discovery failed:', err);
        setPermissionDenied(true);
      }
    };
    discoverCameras();
  }, []);

  // Process scanned signal
  const processSignal = useCallback((compressedText: string) => {
    try {
      const signal = p2pMesh.expandSignal(compressedText);
      if (!signal) {
        setScanStatus('idle');
        return;
      }

      const currentState = stateRef.current;
      
      if (signal.type === 'offer') {
        if (currentState === 'IDLE' || currentState === 'PROCESSING_SCAN' || currentState === 'SHOWING_ANSWER') {
          setState('PROCESSING_SCAN');
          stopScanning();
          setTimeout(() => {
            p2pMesh.receiveConnection(signal);
            setState('CONNECTING');
            setScanStatus('found');
            onScanSuccess?.();
          }, 100);
        }
      } else if (signal.type === 'answer') {
        // Answer requires a pending initiator from parent component
        try {
          p2pMesh.completeHandshake(signal);
          setState('CONNECTING');
          setScanStatus('found');
          stopScanning();
          onScanSuccess?.();
        } catch (err) {
          console.error('[MeshScanner] Answer handshake failed - no pending initiator');
          setScanStatus('idle');
        }
      }
    } catch (err) {
      console.error('[MeshScanner] Signal processing error:', err);
      setScanStatus('idle');
    }
  }, [onScanSuccess]);

  // Throttled scan handler
  const handleScanResult = useCallback((decodedText: string) => {
    const now = Date.now();
    // Throttle to max 1 scan per 500ms
    if (now - lastScanTimeRef.current < 500) {
      return;
    }
    lastScanTimeRef.current = now;

    if (stateRef.current === 'CONNECTING' || stateRef.current === 'SHOWING_ANSWER') {
      return;
    }

    setScanStatus('found');
    processSignal(decodedText);
  }, [processSignal]);

  // Start scanning
  const startScanning = useCallback(async () => {
    if (!selectedCameraId || scannerRef.current) return;

    try {
      const html5QrCode = new Html5Qrcode('mesh-scanner');
      scannerRef.current = html5QrCode;
      setScanner(html5QrCode);
      setState('SCANNING');
      setIsScanning(true);
      setScanStatus('searching');
      setPermissionDenied(false);

      const qrboxSize = Math.min(window.innerWidth * 0.7, 300);
      
      await html5QrCode.start(
        selectedCameraId,
        {
          fps: 10, // Reduced FPS for performance
          qrbox: { width: qrboxSize, height: qrboxSize },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: selectedCameraId.includes('back') ? 'environment' : 'user',
          },
        },
        handleScanResult,
        () => {} // Error callback - handled by try/catch
      );
    } catch (err: any) {
      console.error('[MeshScanner] Start scanning error:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
      }
      setIsScanning(false);
      setScanStatus('idle');
      scannerRef.current = null;
      setScanner(null);
    }
  }, [selectedCameraId, handleScanResult]);

  // Stop scanning
  const stopScanning = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error('[MeshScanner] Stop scanning error:', err);
      }
      scannerRef.current = null;
      setScanner(null);
      setIsScanning(false);
      setScanStatus('idle');
    }
  }, []);

  // Toggle flashlight
  const toggleFlashlight = useCallback(async () => {
    if (!scannerRef.current || !isScanning) return;

    try {
      const videoElement = document.querySelector('#mesh-scanner video') as HTMLVideoElement;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        
        if (track && track.getCapabilities) {
          const capabilities = track.getCapabilities();
          if (capabilities.torch) {
            await track.applyConstraints({
              advanced: [{ torch: !flashlightOn } as any],
            });
            setFlashlightOn(!flashlightOn);
          }
        }
      }
    } catch (err) {
      console.error('[MeshScanner] Flashlight toggle error:', err);
    }
  }, [flashlightOn, isScanning]);

  // Switch camera
  const switchCamera = useCallback(async () => {
    if (cameras.length < 2) return;

    await stopScanning();
    
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCameraId = cameras[nextIndex].id;
    
    setSelectedCameraId(nextCameraId);
    
    // Save preference
    try {
      await offlineStorage.savePreference('lastCameraId', nextCameraId);
    } catch (err) {
      console.error('[MeshScanner] Failed to save camera preference:', err);
    }

    // Restart scanning with new camera
    setTimeout(() => {
      startScanning();
    }, 300);
  }, [cameras, selectedCameraId, stopScanning, startScanning]);

  // Start scanning when camera is selected
  useEffect(() => {
    if (selectedCameraId && !isScanning && !scannerRef.current) {
      startScanning();
    }
  }, [selectedCameraId, isScanning, startScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [stopScanning]);

  // Handle manual input
  const handleManualSubmit = useCallback(() => {
    if (!manualInput.trim()) return;
    processSignal(manualInput.trim());
    setManualInput('');
    setShowManualInput(false);
  }, [manualInput, processSignal]);

  // Save camera preference when it changes
  useEffect(() => {
    if (selectedCameraId) {
      offlineStorage.savePreference('lastCameraId', selectedCameraId).catch(err => {
        console.error('[MeshScanner] Failed to save camera preference:', err);
      });
    }
  }, [selectedCameraId]);

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
      {/* Aria-live region for screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {scanStatus === 'searching' && 'Searching for QR code'}
        {scanStatus === 'found' && 'Code scanned successfully'}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
        <h2 className="text-lg font-bold text-white">Scan QR Code</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scanner Container */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {permissionDenied ? (
          <div className="text-center p-6 space-y-4">
            <Camera className="w-16 h-16 text-slate-500 mx-auto" />
            <h3 className="text-xl font-bold text-white">Camera Access Denied</h3>
            <p className="text-slate-400 text-sm">
              Please enable camera permissions in your browser settings to scan QR codes.
            </p>
            <div className="space-y-2 text-left max-w-md mx-auto">
              <p className="text-slate-300 text-xs font-medium">To enable:</p>
              <ul className="text-slate-400 text-xs space-y-1 list-disc list-inside">
                <li>Click the lock icon in your browser's address bar</li>
                <li>Find "Camera" in the permissions list</li>
                <li>Select "Allow" and refresh the page</li>
              </ul>
            </div>
            <button
              onClick={() => {
                setPermissionDenied(false);
                window.location.reload();
              }}
              className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        ) : (
          <>
            <div id="mesh-scanner" className="w-full h-full" />
            
            {/* High-contrast scan frame overlay */}
            <div
              ref={scanFrameRef}
              className="absolute inset-0 pointer-events-none flex items-center justify-center"
              aria-hidden="true"
            >
              <div className="relative">
                {/* Outer frame with high contrast */}
                <div className="w-72 h-72 border-4 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] rounded-lg" />
                {/* Corner indicators */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
              </div>
            </div>

            {/* Status indicator */}
            {scanStatus === 'searching' && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-600/90 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                Searching for QR code...
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800">
        <div className="flex items-center justify-center gap-4">
          {/* Switch Camera Button */}
          <button
            onClick={switchCamera}
            disabled={cameras.length < 2 || !isScanning}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            aria-label="Switch camera"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          {/* Flashlight Toggle */}
          <button
            onClick={toggleFlashlight}
            disabled={!isScanning}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${
              flashlightOn
                ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={flashlightOn ? 'Turn off flashlight' : 'Turn on flashlight'}
          >
            <Flashlight className="w-5 h-5" />
          </button>

          {/* Manual Input Button */}
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            aria-label="Manual input"
          >
            <Keyboard className="w-5 h-5" />
          </button>
        </div>

        {/* Manual Input Field */}
        {showManualInput && (
          <div className="mt-4 space-y-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Paste compressed signal data..."
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Manual signal input"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
            >
              Submit Signal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeshScanner;
