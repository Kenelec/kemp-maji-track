import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Navigation, Clock } from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

interface DriverLocation {
  id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number | null;
  created_at: string;
  users: {
    name: string;
    phone: string | null;
  } | null;
}

export function DriverTrackingMap() {
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDriverLocations();
    
    // Set up real-time updates
    const channel = supabase
      .channel('driver-locations-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
        },
        (payload) => {
          fetchDriverLocations(); // Refresh when new location comes in
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDriverLocations = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('driver_locations')
        .select(`
          *,
          users!inner (name, phone)
        `)
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Last 30 minutes
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get unique drivers with latest location
      const uniqueDrivers = new Map();
      data?.forEach(location => {
        if (!uniqueDrivers.has(location.driver_id) ||
            new Date(location.created_at) > new Date(uniqueDrivers.get(location.driver_id).created_at)) {
          uniqueDrivers.set(location.driver_id, location);
        }
      });

      setDriverLocations(Array.from(uniqueDrivers.values()));
    } catch (err) {
      console.error('Error fetching driver locations:', err);
      setError('Failed to fetch driver locations');
    } finally {
      setLoading(false);
    }
  };

  // Function to initialize Google Maps
  useEffect(() => {
    if (driverLocations.length > 0) {
      initMap();
    }
  }, [driverLocations]);

  const initMap = () => {
    if (!driverLocations.length) return;

    // Check if Google Maps API is loaded
    if (typeof window === 'undefined' || !window.google || !window.google.maps) {
      console.error('Google Maps API not loaded');
      return;
    }

    const mapContainer = document.getElementById('driver-map');
    if (!mapContainer) return;

    // Calculate center based on first location
    const center = {
      lat: driverLocations[0].latitude,
      lng: driverLocations[0].longitude
    };

    const map = new window.google.maps.Map(mapContainer, {
      zoom: 12,
      center: center,
    });

    // Add markers for each driver
    driverLocations.forEach(location => {
      const marker = new window.google.maps.Marker({
        position: { lat: location.latitude, lng: location.longitude },
        map: map,
        title: location.users?.name || 'Driver',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#FF0000",
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 2,
        },
      });

      // Create info window for marker
      const infowindow = new window.google.maps.InfoWindow({
        content: `
          <div>
            <h3 class="font-bold">${location.users?.name || 'Unknown Driver'}</h3>
            <p>Lat: ${location.latitude.toFixed(6)}, Lng: ${location.longitude.toFixed(6)}</p>
            <p>Accuracy: ${location.accuracy ? location.accuracy.toFixed(2) + 'm' : 'Unknown'}</p>
            <p>Last seen: ${new Date(location.created_at).toLocaleString()}</p>
          </div>
        `,
      });

      marker.addListener('click', () => {
        infowindow.open(map, marker);
      });
    });
  };

  // Function to load Google Maps script dynamically
  const loadGoogleMapsScript = () => {
    if (typeof window !== 'undefined' && window.google) return;

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    (window as any).initMap = initMap;
  };

  // Load Google Maps script when component mounts
  useEffect(() => {
    loadGoogleMapsScript();
  }, []);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="w-5 h-5" />
          Driver Locations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading driver locations...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-destructive">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div 
              id="driver-map" 
              className="h-96 rounded-lg border bg-gray-100"
            >
              {!window.google && (
                <div className="h-full flex items-center justify-center">
                  <p>Loading map...</p>
                </div>
              )}
            </div>
            
            <div className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Active Drivers ({driverLocations.length})
              </h3>
              
              {driverLocations.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No active drivers</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {driverLocations.map(location => (
                    <div key={location.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">
                          {location.users?.name || 'Unknown Driver'}
                        </h4>
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(location.created_at).toLocaleTimeString()}
                        </Badge>
                      </div>
                      
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                          <span>Lat: {location.latitude.toFixed(6)}</span>
                        </p>
                        <p className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                          <span>Lng: {location.longitude.toFixed(6)}</span>
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Accuracy: {location.accuracy ? location.accuracy.toFixed(2) + 'm' : 'Unknown'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
