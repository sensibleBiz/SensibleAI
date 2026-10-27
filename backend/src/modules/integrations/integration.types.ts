export interface IntegrationInput {
  outletId: string;
  integrationKey: string;
  type: string;
  description: string;
  accessToken?: string;
  isActive?: boolean;
  autoassignenabled?: boolean;
  autoAssignUserId?: string;
  autoAssignEmployeeName?: string;
}
