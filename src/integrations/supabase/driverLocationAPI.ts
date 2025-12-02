// File: src/integrations/supabase/driverLocationAPI.ts

import { supabase } from './client';

interface LocationData {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
  driver_id: string;
}

export async function saveDriverLocation(locationData: LocationData) {
  try {
    const locationRecord = {
      driver_id: locationData.driver_id,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      timestamp: locationData.timestamp,
      accuracy: locationData.accuracy || null,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('driver_locations')
      .insert([locationRecord]);

    if (error) {
      console.error('Error saving location:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in saveDriverLocation:', error);
    return { success: false, error: (error as Error).message };
  }
}

