export interface ReferenceListQuery {
  activeOnly: boolean;
  q: string;
  limit: number;
}

export interface ReferenceStateQuery extends ReferenceListQuery {
  countryCode: string;
}

export interface ReferenceCityQuery extends ReferenceListQuery {
  stateCode?: string;
}

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
