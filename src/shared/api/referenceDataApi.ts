import { apiRequest } from "./apiClient";

export interface ReferenceCountry {
  id: string;
  code: string;
  name: string;
  officialName: string;
  flag: string;
  active: boolean;
}

export interface ReferenceZone {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface ReferenceState {
  id: string;
  countryId: string;
  countryCode: string;
  zoneId: string | null;
  zoneCode: string | null;
  code: string;
  name: string;
  active: boolean;
}

export interface ReferenceCity {
  id: string;
  stateId: string;
  stateCode: string;
  code: string;
  name: string;
  active: boolean;
}

const get = <T>(path: string, signal?: AbortSignal) =>
  apiRequest<T>(path, { authMode: "postgres", signal });

export const referenceDataApi = {
  countries: (signal?: AbortSignal) => get<ReferenceCountry[]>("/api/v1/reference-data/countries", signal),
  states: (countryCode = "IN", signal?: AbortSignal) =>
    get<ReferenceState[]>(`/api/v1/reference-data/states?countryCode=${encodeURIComponent(countryCode)}`, signal),
  cities: (stateCode?: string, signal?: AbortSignal) => {
    const query = stateCode ? `?stateCode=${encodeURIComponent(stateCode)}` : "";
    return get<ReferenceCity[]>(`/api/v1/reference-data/cities${query}`, signal);
  },
  zones: (signal?: AbortSignal) => get<ReferenceZone[]>("/api/v1/reference-data/zones", signal),
};
