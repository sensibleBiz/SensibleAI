export interface PostgresBiometricTransaction {
  txnId: string;
  punchId: string;
  mode: "IN" | "OUT";
  txnDateTime: string | number;
  dvcId?: string;
  dvcIP?: string;
  integrationKey?: string;
}
