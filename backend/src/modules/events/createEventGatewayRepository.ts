import type { EventGatewayRepository } from "./eventGateway.repository.types.js";
import { postgresEventGatewayRepository } from "./postgresEventGateway.repository.js";

export const createEventGatewayRepository = (): EventGatewayRepository =>
  postgresEventGatewayRepository;
