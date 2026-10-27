import { env } from "../../config/env.js";

/**
 * Google Maps Platform Service for Sensible AI CRM
 *
 * Capabilities:
 * 1. Places API (New) & Geocoding: Auto-complete Indian addresses, pin exact lat/long.
 * 2. Routes API & Distance Matrix: Field sales travel time and optimized daily client visits.
 * 3. Proximity Verification: Check if sales executive is within geofence threshold of client site.
 */

export interface GeocodedAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  pincode?: string;
  placeId: string;
}

export interface RouteEstimate {
  distanceMeters: number;
  distanceKm: string;
  durationSeconds: number;
  durationFormatted: string;
}

export class GoogleMapsService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = env.googleAi.apiKey || process.env.GOOGLE_MAPS_API_KEY || "";
  }

  /**
   * Geocode a natural language address string to precise coordinates
   */
  async geocodeAddress(addressText: string): Promise<GeocodedAddress | null> {
    if (!this.apiKey) {
      console.warn("[Google Maps] API key not configured, returning mock geocode");
      return {
        formattedAddress: addressText,
        latitude: 19.076, // Default Mumbai
        longitude: 72.8777,
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
        placeId: "mock-place-id",
      };
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        addressText,
      )}&region=in&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;

      if (data.status !== "OK" || !data.results?.[0]) {
        return null;
      }

      const result = data.results[0];
      const location = result.geometry.location;

      let city = "";
      let state = "";
      let pincode = "";

      for (const comp of result.address_components ?? []) {
        if (comp.types.includes("locality")) city = comp.long_name;
        if (comp.types.includes("administrative_area_level_1")) state = comp.long_name;
        if (comp.types.includes("postal_code")) pincode = comp.long_name;
      }

      return {
        formattedAddress: result.formatted_address,
        latitude: location.lat,
        longitude: location.lng,
        city,
        state,
        pincode,
        placeId: result.place_id,
      };
    } catch (err) {
      console.error("[Google Maps Geocode Error]", err);
      return null;
    }
  }

  /**
   * Compute Distance and ETA between two locations using Routes API
   */
  async calculateRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): Promise<RouteEstimate> {
    if (!this.apiKey) {
      return {
        distanceMeters: 5200,
        distanceKm: "5.2 km",
        durationSeconds: 900,
        durationFormatted: "15 mins",
      };
    }

    try {
      const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
      const body = {
        origin: {
          location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
        },
        destination: {
          location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as any;
      const route = data.routes?.[0];

      const distanceMeters = route?.distanceMeters ?? 0;
      const durationSeconds = parseInt(route?.duration?.replace("s", "") ?? "0", 10);

      return {
        distanceMeters,
        distanceKm: `${(distanceMeters / 1000).toFixed(1)} km`,
        durationSeconds,
        durationFormatted: `${Math.round(durationSeconds / 60)} mins`,
      };
    } catch (err) {
      console.error("[Google Maps Routes Error]", err);
      return {
        distanceMeters: 0,
        distanceKm: "0 km",
        durationSeconds: 0,
        durationFormatted: "0 mins",
      };
    }
  }

  /**
   * Verify whether an employee's ping coordinates are within geofence threshold of client site
   */
  isWithinProximity(
    empCoords: { lat: number; lng: number },
    clientCoords: { lat: number; lng: number },
    thresholdMeters = 150,
  ): boolean {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = (empCoords.lat * Math.PI) / 180;
    const phi2 = (clientCoords.lat * Math.PI) / 180;
    const deltaPhi = ((clientCoords.lat - empCoords.lat) * Math.PI) / 180;
    const deltaLambda = ((clientCoords.lng - empCoords.lng) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;
    return distance <= thresholdMeters;
  }
}

export const googleMapsService = new GoogleMapsService();
