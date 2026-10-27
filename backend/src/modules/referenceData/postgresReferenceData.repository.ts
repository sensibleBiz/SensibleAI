import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type {
  ReferenceCity,
  ReferenceCityQuery,
  ReferenceCountry,
  ReferenceListQuery,
  ReferenceState,
  ReferenceStateQuery,
  ReferenceZone,
} from "./referenceData.types.js";

interface CountryRow extends QueryResultRow {
  id: string; code: string; name: string; official_name: string; flag: string; active: boolean;
}
interface ZoneRow extends QueryResultRow {
  id: string; code: string; name: string; active: boolean;
}
interface StateRow extends QueryResultRow {
  id: string; country_id: string; country_code: string; zone_id: string | null;
  zone_code: string | null; code: string; name: string; active: boolean;
}
interface CityRow extends QueryResultRow {
  id: string; state_id: string; state_code: string; code: string; name: string; active: boolean;
}

const country = (row: CountryRow): ReferenceCountry => ({
  id: row.id, code: row.code, name: row.name, officialName: row.official_name,
  flag: row.flag, active: row.active,
});
const zone = (row: ZoneRow): ReferenceZone => ({
  id: row.id, code: row.code, name: row.name, active: row.active,
});
const state = (row: StateRow): ReferenceState => ({
  id: row.id, countryId: row.country_id, countryCode: row.country_code,
  zoneId: row.zone_id, zoneCode: row.zone_code, code: row.code, name: row.name, active: row.active,
});
const city = (row: CityRow): ReferenceCity => ({
  id: row.id, stateId: row.state_id, stateCode: row.state_code,
  code: row.code, name: row.name, active: row.active,
});

export class PostgresReferenceDataRepository {
  async listCountries(database: TransactionDatabase, query: ReferenceListQuery) {
    const result = await database.client.query<CountryRow>(`
      SELECT id, code, name, official_name, flag, active
      FROM reference_data.countries
      WHERE (NOT $1::boolean OR active)
        AND ($2::text = '' OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
      ORDER BY sort_order, name, code
      LIMIT $3
    `, [query.activeOnly, query.q, query.limit]);
    return result.rows.map(country);
  }

  async listZones(database: TransactionDatabase, query: ReferenceListQuery) {
    const result = await database.client.query<ZoneRow>(`
      SELECT id, code, name, active
      FROM reference_data.zones
      WHERE (NOT $1::boolean OR active)
        AND ($2::text = '' OR name ILIKE '%' || $2 || '%' OR code ILIKE '%' || $2 || '%')
      ORDER BY sort_order, name, code
      LIMIT $3
    `, [query.activeOnly, query.q, query.limit]);
    return result.rows.map(zone);
  }

  async listStates(database: TransactionDatabase, query: ReferenceStateQuery) {
    const result = await database.client.query<StateRow>(`
      SELECT state.id, state.country_id, country.code AS country_code, state.zone_id,
        zone.code AS zone_code, state.code, state.name, state.active
      FROM reference_data.states state
      JOIN reference_data.countries country ON country.id = state.country_id
      LEFT JOIN reference_data.zones zone ON zone.id = state.zone_id
      WHERE country.code = $1
        AND (NOT $2::boolean OR state.active)
        AND ($3::text = '' OR state.name ILIKE '%' || $3 || '%' OR state.code ILIKE '%' || $3 || '%')
      ORDER BY state.sort_order, state.name, state.code
      LIMIT $4
    `, [query.countryCode, query.activeOnly, query.q, query.limit]);
    return result.rows.map(state);
  }

  async listCities(database: TransactionDatabase, query: ReferenceCityQuery) {
    const result = await database.client.query<CityRow>(`
      SELECT city.id, city.state_id, state.code AS state_code, city.code, city.name, city.active
      FROM reference_data.cities city
      JOIN reference_data.states state ON state.id = city.state_id
      WHERE ($1::text IS NULL OR state.code = $1)
        AND (NOT $2::boolean OR city.active)
        AND ($3::text = '' OR city.name ILIKE '%' || $3 || '%' OR city.code ILIKE '%' || $3 || '%')
      ORDER BY city.sort_order, city.name, city.code
      LIMIT $4
    `, [query.stateCode ?? null, query.activeOnly, query.q, query.limit]);
    return result.rows.map(city);
  }
}

export const postgresReferenceDataRepository = new PostgresReferenceDataRepository();
