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
      timestamp: new Date(locationData.timestamp).toISOString(),
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

    // Check if this location is near any pending deliveries
    await checkForDeliveryCompletion(
      locationData.latitude, 
      locationData.longitude, 
      locationData.driver_id
    );

    return { success: true };
  } catch (error) {
    console.error('Error in saveDriverLocation:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function checkForDeliveryCompletion(driverLat: number, driverLng: number, driverId: string) {
  try {
    // Get pending deliveries for this driver
    const { data: pendingDeliveries, error } = await supabase
      .from('deliveries')
      .select(`
        id,
        customer_id,
        delivery_status,
        customers (id, customer_name, address, latitude, longitude)
      `)
      .eq('delivery_status', 'pending');

    if (error || !pendingDeliveries) return;

    // Check each pending delivery
    for (const delivery of pendingDeliveries) {
      const customer = delivery.customers;
      if (!customer?.latitude || !customer?.longitude) continue;

      // Calculate distance between driver and customer
      const distance = calculateDistance(
        driverLat, driverLng,
        parseFloat(customer.latitude),
        parseFloat(customer.longitude)
      );

      // If driver is within 50 meters of customer, mark as delivered
      if (distance < 50) {
        const { error } = await supabase
          .from('deliveries')
          .update({
            delivery_status: 'delivered',
            delivery_completion_time: new Date().toISOString()
          })
          .eq('id', delivery.id);

        if (!error) {
          console.log(`Delivery ${delivery.id} marked as completed by driver ${driverId}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking delivery completion:', error);
  }
}

// Function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}
