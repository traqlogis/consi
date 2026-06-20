import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Map, { Marker, Source, Layer, MapRef, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  LucideSearchCheck,
  LucideMapPin,
  LucideClock4,
  LucideUser,
  LucideBox,
  LucideTruck,
} from 'lucide-react';
import { pingServer } from "../components/pingServer";
import TestimonialCarousel from '../components/Testimony';

const SOCKET_URL = import.meta.env.VITE_WSS_URL;

const socket = io(SOCKET_URL, {
  path: '/socket.io/',
  transports: ['websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  withCredentials: true 
});

interface LatLng { lat: number; lng: number; }

interface PackageInfo {
  sender?: { name: string; address: string; phone?: string };
  receiver?: { name: string; address: string; phone?: string };
  deliveryType?: string;
  weight?: string;
  description?: string;
}

interface StatusLog {
  status: string;
  location: string;
  timestamp: string;
}

const TrackPage: React.FC = () => {
  const [code, setCode] = useState('');
  const [found, setFound] = useState(false);
  const [animatedCurrent, setAnimatedCurrent] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<LatLng[]>([]); // This holds our live trailing blue route
  const [fullRoute, setFullRoute] = useState<LatLng[]>([]);
  const [currentRouteIndex, setCurrentRouteIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isMoving, setIsMoving] = useState(true);
  const [mapKey, setMapKey] = useState(0);
  const [trackingCode, setTrackingCode] = useState('');
  const [hideStatusMessages, setHideStatusMessages] = useState(false);

  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [pauseReason, setPauseReason] = useState<string | null>(null);

  const mapRef = useRef<MapRef>(null);
  const hasFitBounds = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    pingServer();
  }, []);

  // Fit Bounds Hook when Route or Map changes
  useEffect(() => {
    if (!mapRef.current || fullRoute.length === 0) return;

    const lngs = fullRoute.map(p => p.lng);
    const lats = fullRoute.map(p => p.lat);
    const minLng = Math.min(...lngs);
    const minLat = Math.min(...lats);
    const maxLng = Math.max(...lngs);
    const maxLat = Math.max(...lats);

    mapRef.current.fitBounds(
      [minLng, minLat, maxLng, maxLat],
      { padding: 50, duration: 1500 }
    );
    hasFitBounds.current = true;
  }, [fullRoute, mapKey, found]);

  const handleTrack = async () => {
    const errorElement = document.getElementById('errmsg') as HTMLElement;
    errorElement.textContent = '';
    setHideStatusMessages(true);

    const adminAccess = import.meta.env.VITE_ADMIN_ACCESS;

    if (code.trim().toLowerCase() === adminAccess?.toLowerCase()) {
      const token = localStorage.getItem('admin_token');
      const expiry = localStorage.getItem('admin_token_expiry');
      if (token && expiry && Date.now() < Number(expiry)) {
        window.location.href = '/admindashboard/orders';
      } else {
        window.location.href = '/admindashboard/index';
      }
      return;
    }

    if (!code.trim()) {
      errorElement.textContent = 'Please enter a tracking code';
      return;
    }

    setLoading(true);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL;
      
      const res = await fetch(`${API_BASE_URL}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      if (data.redirect) {
        window.location.href = data.redirect;
      } else if (data.found) {
        setFound(true);
        setFullRoute([...data.route]);
        setHideStatusMessages(false);

        setPackageInfo(data.packageInfo || null);
        setStatusLogs(data.statusLogs || []);
        setPauseReason(data.pauseReason || null);

        const currentIndex = data.currentRouteIndex || 0;
        setCurrentRouteIndex(currentIndex);
        setIsMoving(data.isMoving === 'true' || data.isMoving === true);
        setIsTracking(true);
        setTrackingCode(code.trim());
        
        // Setup initial static placement layout before websocket takes over animation loops
        setAnimatedCurrent(data.current);
        setRoute(data.traveled || data.route.slice(0, currentIndex + 1));

        socket.emit('startTracking', code.trim());
        hasFitBounds.current = false;
        setMapKey(prev => prev + 1);
      } else {
        errorElement.textContent = 'Package tracking code not found';
        setFound(false);
        setAnimatedCurrent(null);
        setRoute([]);
        setFullRoute([]);
        setCurrentRouteIndex(0);
        setIsMoving(true);
        setTrackingCode('');
        setPackageInfo(null);
        setStatusLogs([]);
        setPauseReason(null);
      }
    } catch (error) {
      errorElement.textContent = 'Error connecting to package tracking service. Please try again.';
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleLocationUpdate = (trackingData: any) => {
      if (!trackingData) return;

      // Clean up previous running frame animation ticks
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      const startLat = trackingData.current.lat;
      const startLng = trackingData.current.lng;
      
      // Look ahead target defaults to current coordinates if delivery completes
      const endLat = trackingData.nextTarget?.lat || startLat;
      const endLng = trackingData.nextTarget?.lng || startLng;
      
      const startTime = performance.now();
      const animationDuration = 59000; // Complete movement loop just before next heartbeat arrives

      const stepAnimation = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);

        // Smoothly interpolate current frame coordinate location parameters
        const currentLat = startLat + (endLat - startLat) * progress;
        const currentLng = startLng + (endLng - startLng) * progress;
        const currentCoord = { lat: currentLat, lng: currentLng };

        // 1. Move Marker Position
        setAnimatedCurrent(currentCoord);

        // 2. Force blue line layer trail path to follow directly behind marker coordinate tail
        if (trackingData.traveledBase) {
          setRoute([...trackingData.traveledBase, currentCoord]);
        }

        if (progress < 1 && (trackingData.isMoving === 'true' || trackingData.isMoving === true)) {
          animationFrameRef.current = requestAnimationFrame(stepAnimation);
        }
      };

      if (trackingData.isMoving === 'true' || trackingData.isMoving === true) {
        animationFrameRef.current = requestAnimationFrame(stepAnimation);
      } else {
        // Fallback snap if package is static or delivered completely
        setAnimatedCurrent(trackingData.current);
        if (trackingData.traveled) setRoute(trackingData.traveled);
      }

      // Sync state panel data arrays
      if (trackingData.currentRouteIndex !== undefined) setCurrentRouteIndex(trackingData.currentRouteIndex);
      if (trackingData.statusLogs) setStatusLogs(trackingData.statusLogs);
      if (trackingData.pauseReason !== undefined) setPauseReason(trackingData.pauseReason);
      setIsMoving(trackingData.isMoving === 'true' || trackingData.isMoving === true);
    };

    const handleJourneyComplete = () => {
      setIsTracking(false);
      setIsMoving(false);
    };

    const handleTrackingError = (error: string) => {
      const errorElement = document.getElementById('errmsg') as HTMLElement;
      if (errorElement) errorElement.textContent = error;
      setIsTracking(false);
    };

    socket.on('positionUpdate', handleLocationUpdate);
    socket.on('journeyComplete', handleJourneyComplete);
    socket.on('trackingError', handleTrackingError);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      socket.off('positionUpdate', handleLocationUpdate);
      socket.off('journeyComplete', handleJourneyComplete);
      socket.off('trackingError', handleTrackingError);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (trackingCode) {
        socket.emit('stopTracking', trackingCode);
      }
    };
  }, [trackingCode]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleTrack();
    }
  };

  const isAtEnd = found && currentRouteIndex >= fullRoute.length - 1;
  const showPaused = found && !isMoving && !isAtEnd;
  const showLive = isTracking && isMoving && !isAtEnd;

  const fullRouteGeoJSON: any = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: fullRoute.map(p => [p.lng, p.lat])
    }
  };

  const traveledRouteGeoJSON: any = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: route.map(p => [p.lng, p.lat])
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 px-6 pt-32 pb-16">
          <h1 className="text-4xl font-bold text-indigo-100 mb-6">
            Track Your{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-300">
              Shipment{' '}
            </span>
          </h1>
        </div>

        <div className="bg-white/30 backdrop-blur-md p-6 rounded-2xl shadow-xl mt-10 max-w-3xl mx-auto">
          <p className="text-lg text-gray-700 mb-10">
            Stay updated on the status of your package in real-time.
            <br />
            Enter your tracking number below to get detailed delivery insights.
          </p>
          <input
            type="text"
            placeholder="Enter tracking number"
            className="w-full px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
          />
          <p className="text-lg text-red-700 mt-2" id="errmsg"></p>
          <button
            className={`mt-4 w-full py-3 ${loading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-lg transition duration-200`}
            onClick={handleTrack}
            disabled={loading}
          >
            {loading ? 'Tracking...' : 'Track Package'}
          </button>
          {!hideStatusMessages && showLive && (
            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg">
              <p className="text-green-700 font-medium">Live tracking - Package updates every 1 minute</p>
            </div>
          )}
          {!hideStatusMessages && showPaused && (
            <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
              <p className="text-yellow-700 font-medium">
                ⏸️ Tracking Paused {pauseReason ? `: ${pauseReason}` : '- Package is not moving'}
              </p>
            </div>
          )}
          {!hideStatusMessages && isAtEnd && (
            <div className="mt-4 p-3 bg-blue-100 border border-blue-300 rounded-lg">
              <p className="text-blue-700 font-medium">🏁 Package has reached final destination</p>
            </div>
          )}
        </div>
      </div>

      {found && animatedCurrent && (
        <div className="mt-10 max-w-6xl mx-auto px-4 relative z-0">
          <div className="shadow-xl mb-8" style={{ height: '450px', borderRadius: '1.5rem', overflow: 'hidden' }}>
            <Map
              key={mapKey}
              ref={mapRef}
              attributionControl={false}
              initialViewState={{
                longitude: animatedCurrent.lng,
                latitude: animatedCurrent.lat,
                zoom: 12
              }}
              mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
              onLoad={() => {
                if (mapRef.current && fullRoute.length > 0) {
                  const lngs = fullRoute.map(p => p.lng);
                  const lats = fullRoute.map(p => p.lat);
                  mapRef.current.fitBounds(
                    [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
                    { padding: 80, duration: 1000 }
                  );
                }
              }}
            >
              <NavigationControl position="top-right" showCompass={false} />

              {/* Backbone Dashed Complete Route Path Profile */}
              {fullRoute.length > 1 && (
                <Source id="fullRouteData" type="geojson" data={fullRouteGeoJSON}>
                  <Layer
                    id="fullRouteLayer"
                    type="line"
                    paint={{
                      'line-color': '#94a3b8',
                      'line-width': 3,
                      'line-dasharray': [2, 3]
                    }}
                  />
                </Source>
              )}

              {/* Traveled Active Route Line (Dynamically grows with marker position frame updates) */}
              {route.length > 1 && (
                <Source id="traveledRouteData" type="geojson" data={traveledRouteGeoJSON}>
                  <Layer
                    id="traveledRouteLayer"
                    type="line"
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    paint={{
                      'line-color': '#1d4ed8',
                      'line-width': 5
                    }}
                  />
                </Source>
              )}

              <Marker longitude={animatedCurrent.lng} latitude={animatedCurrent.lat} anchor="center">
                <div className="relative flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-7 w-7 rounded-full bg-blue-500 opacity-75"></span>
                  <div className="bg-blue-600 border-2 border-white p-2.5 rounded-full shadow-2xl text-white transform transition-transform hover:scale-110">
                    <LucideMapPin size={18} />
                  </div>
                </div>
              </Marker>
            </Map>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start mb-16">
            <div className="md:col-span-1 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 border-b pb-3 mb-4">
                <LucideBox className="text-indigo-600" size={20} />
                Shipment Information
              </h2>

              <div className="space-y-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block">Tracking Number</span>
                  <span className="text-gray-900 font-mono font-bold bg-gray-50 px-2 py-1 rounded border text-sm">{trackingCode}</span>
                </div>
                {packageInfo?.description && (
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block">Item Description</span>
                    <span className="text-gray-800 text-sm font-medium">{packageInfo.description}</span>
                  </div>
                )}
                {packageInfo?.deliveryType && (
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block">Service Level</span>
                    <span className="inline-block mt-1 text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200">
                      {packageInfo.deliveryType}
                    </span>
                  </div>
                )}
                {packageInfo?.weight && (
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block">Package Weight</span>
                    <span className="text-gray-800 text-sm font-medium">{packageInfo.weight}</span>
                  </div>
                )}

                <hr className="my-2 border-gray-100" />
                {packageInfo?.sender && (
                  <div className="flex gap-3 items-start">
                    <div className="bg-gray-100 p-2 rounded-lg text-gray-500 mt-1">
                      <LucideUser size={16} />
                    </div>
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block">Shipped From</span>
                      <p className="text-gray-900 text-sm font-bold">{packageInfo.sender.name}</p>
                      <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">{packageInfo.sender.address}</p>
                    </div>
                  </div>
                )}
                {packageInfo?.receiver && (
                  <div className="flex gap-3 items-start mt-4">
                    <div className="bg-green-50 p-2 rounded-lg text-green-600 mt-1">
                      <LucideTruck size={16} />
                    </div>
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block">Deliver To</span>
                      <p className="text-gray-900 text-sm font-bold">{packageInfo.receiver.name}</p>
                      <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">{packageInfo.receiver.address}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 border-b pb-3 mb-6">
                <LucideClock4 className="text-indigo-600" size={20} />
                Travel History & Checkpoints
              </h2>

              <div className="relative border-l-2 border-indigo-100 pl-6 ml-3 space-y-6">
                {statusLogs && statusLogs.length > 0 ? (
                  statusLogs.map((log, idx) => {
                    const isLatest = idx === statusLogs.length - 1; 
                    return (
                      <div key={idx} className="relative group">
                        <span className={`absolute -left-[31px] top-0.5 flex items-center justify-center rounded-full w-4 h-4 border-2 ${isLatest
                            ? 'bg-blue-600 border-white ring-4 ring-blue-100 animate-pulse'
                            : 'bg-white border-indigo-400'
                          }`} />

                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                          <div>
                            <p className={`font-semibold text-sm ${isLatest ? 'text-blue-600 text-base font-bold' : 'text-gray-800'}`}>
                              {log.status}
                            </p>
                            <p className="text-gray-600 text-xs mt-0.5 flex items-center gap-1">
                              <LucideMapPin size={12} className="text-gray-400" />
                              {log.location}
                            </p>
                          </div>

                          {log.timestamp && (
                            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded font-medium whitespace-nowrap self-start sm:self-auto">
                              {new Date(log.timestamp).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-500 text-sm">No status logs recorded yet for this order tracking sequence.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="mt-20 grid md:grid-cols-3 gap-8 max-w-6xl mx-auto pb-10 px-4">
        <div className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md text-center">
          <LucideSearchCheck size={36} className="mx-auto mb-4 text-indigo-600" />
          <h3 className="text-xl font-semibold mb-2">Accurate Tracking</h3>
          <p className="text-gray-700">Get up-to-the-minute updates on your shipment's location and status across every checkpoint.</p>
        </div>
        <div className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md text-center">
          <LucideMapPin size={36} className="mx-auto mb-4 text-indigo-600" />
          <h3 className="text-xl font-semibold mb-2">Real-time Location</h3>
          <p className="text-gray-700">View precise GPS tracking updates and visualize where your package is at any given time.</p>
        </div>
        <div className="bg-white/30 backdrop-blur-md rounded-2xl p-6 shadow-md text-center">
          <LucideClock4 size={36} className="mx-auto mb-4 text-indigo-600" />
          <h3 className="text-xl font-semibold mb-2">Predictive Delivery</h3>
          <p className="text-gray-700">Leverage intelligent ETA forecasting based on current traffic, weather, and route efficiency.</p>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-br from-gray-50 to-blue-50">
        <div>
          <TestimonialCarousel />
        </div>
      </section>
    </main>
  );
};

export default TrackPage;