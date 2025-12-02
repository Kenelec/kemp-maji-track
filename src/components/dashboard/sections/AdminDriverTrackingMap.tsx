import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DriverLocation {
  id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number | null;
  created_at: string;
}

interface DriverHistory {
  id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number | null;
  created_at: string;
}

export function AdminDriverTrackingMap() {
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [driverHistory, setDriverHistory] = useState<DriverHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 7 days
    endDate: new Date().toISOString().split('T')[0],
    driverId: ''
  });

  useEffect(() => {
    fetchDriverLocations();
    fetchDriverHistory();
    
    // Set up real-time updates for locations
    const channel = supabase
      .channel('admin-driver-locations-changes')
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

      const { data: locationsData, error } = await supabase
        .from('driver_locations')
        .select('*')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Last 30 minutes
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get unique drivers with latest location
      const uniqueDrivers = new Map();
      locationsData?.forEach(location => {
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

  const fetchDriverHistory = async (startDate?: string, endDate?: string, driverId?: string) => {
    try {
      let query = supabase
        .from('driver_locations')
        .select('*')
        .order('created_at', { ascending: false });

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', new Date(new Date(endDate).setHours(23, 59, 59, 999)).toISOString());
      }
      if (driverId) {
        query = query.eq('driver_id', driverId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setDriverHistory(data || []);
    } catch (err) {
      console.error('Error fetching driver history:', err);
      setError('Failed to fetch driver history');
    }
  };

  const handleHistoryFilter = () => {
    fetchDriverHistory(historyFilter.startDate, historyFilter.endDate, historyFilter.driverId);
  };

  // Function to render a simple map visualization
  const renderMap = () => {
    if (driverLocations.length === 0) {
      return (
        <div className="h-96 rounded-lg border bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Navigation className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No active drivers to display</p>
          </div>
        </div>
      );
    }

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
                      Driver {location.driver_id.substring(0, 8)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(location.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Driver Tracking</h2>
        <p className="text-muted-foreground">Track driver locations and view historical data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Locations Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="w-5 h-5" />
              Current Driver Locations
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
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {driverLocations.map(location => (
                    <div key={location.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium truncate">
                          Driver {location.driver_id.substring(0, 8)}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(location.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm">
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Driver History Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Location History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={historyFilter.startDate}
                  onChange={(e) => setHistoryFilter({...historyFilter, startDate: e.target.value})}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={historyFilter.endDate}
                  onChange={(e) => setHistoryFilter({...historyFilter, endDate: e.target.value})}
                  className="w-full p-2 border rounded"
                />
              </div>
              <button
                onClick={handleHistoryFilter}
                className="w-full bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90"
              >
                Apply Filter
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {driverHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No location history found</p>
              ) : (
                driverHistory.slice(0, 10).map(location => (
                  <div key={location.id} className="border rounded p-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">
                          Driver {location.driver_id.substring(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          {new Date(location.created_at).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(location.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    {location.accuracy && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Accuracy: {location.accuracy.toFixed(2)}m
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
