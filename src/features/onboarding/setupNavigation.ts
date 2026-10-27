export const workspaceDestination = (
  configuration: { isConfigured: boolean } | null,
  dashboard: string,
  returnTo?: string,
) => configuration && !configuration.isConfigured ? "/setup" : returnTo || dashboard;

export const shouldSkipSetup = (isConfigured: boolean, reconfigure: boolean) => isConfigured && !reconfigure;

// Navigation must never happen until the configuration has been persisted.
export const finishWorkspaceSetup = async <T>(save: () => Promise<T>, complete: (configuration: T) => void) => {
  const configuration = await save();
  complete(configuration);
};
