import type { TransactionDatabase } from "../../db/context.js";
import { postgresReferenceDataRepository } from "./postgresReferenceData.repository.js";
import type { ReferenceCityQuery, ReferenceListQuery, ReferenceStateQuery } from "./referenceData.types.js";

export const postgresReferenceDataService = {
  listCountries: (database: TransactionDatabase, query: ReferenceListQuery) =>
    postgresReferenceDataRepository.listCountries(database, query),
  listStates: (database: TransactionDatabase, query: ReferenceStateQuery) =>
    postgresReferenceDataRepository.listStates(database, query),
  listCities: (database: TransactionDatabase, query: ReferenceCityQuery) =>
    postgresReferenceDataRepository.listCities(database, query),
  listZones: (database: TransactionDatabase, query: ReferenceListQuery) =>
    postgresReferenceDataRepository.listZones(database, query),
};
