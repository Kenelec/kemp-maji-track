import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Navigation, Clock } from 'lucide-react';

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

  // Function to render a simple map visualization using OpenStreetMap
  const renderMap = () => {
    if (driverLocations.length === 0) {
      return (
        <div className="h-96 rounded-lg border bg-gray-50 flex items-center justify-center">
          <p className="text-muted-foreground">No active drivers to display</p>
        </div>
      );
    }

    // Show a visualization of locations on a map-like background
    return (
      <div className="h-96 rounded-lg border bg-gradient-to-br from-blue-50 to-green-50 relative overflow-hidden">
        <div className="absolute inset-0">
          {/* Water-themed background with subtle road patterns */}
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-8 grid-rows-6 h-full w-full">
              {Array.from({ length: 48 }).map((_, i) => (
                <div key={i} className="flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-blue-300"></div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Driver location markers */}
          {driverLocations.map((location, index) => {
            // Calculate position in grid based on index for visual distribution
            const top = 20 + (index % 4) * 20;
            const left = 20 + (index % 3) * 30;
            
            return (
              <div 
                key={location.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ top: `${top}%`, left: `${left}%` }}
              >
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                    <Navigation className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-white rounded-lg shadow-md p-2 mt-1 max-w-xs">
                    <div className="text-xs font-medium">
                      {location.users?.name || 'Unknown Driver'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
            {renderMap()}
            
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
