import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { postgresReferenceDataService } from "./postgresReferenceData.service.js";
import type { ReferenceCityQuery, ReferenceListQuery, ReferenceStateQuery } from "./referenceData.types.js";

const database = (request: Request) => {
  if (!request.database || !request.postgresAuth) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return request.database;
};

export const listPostgresCountries = async (request: Request, response: Response) => {
  const data = await postgresReferenceDataService.listCountries(
    database(request), request.validated?.query as ReferenceListQuery,
  );
  response.json({ success: true, data });
};

export const listPostgresStates = async (request: Request, response: Response) => {
  const data = await postgresReferenceDataService.listStates(
    database(request), request.validated?.query as ReferenceStateQuery,
  );
  response.json({ success: true, data });
};

export const listPostgresCities = async (request: Request, response: Response) => {
  const data = await postgresReferenceDataService.listCities(
    database(request), request.validated?.query as ReferenceCityQuery,
  );
  response.json({ success: true, data });
};

export const listPostgresZones = async (request: Request, response: Response) => {
  const data = await postgresReferenceDataService.listZones(
    database(request), request.validated?.query as ReferenceListQuery,
  );
  response.json({ success: true, data });
};
