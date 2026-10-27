export interface SessionCredentials {
  username: string;
  password: string;
}

export interface UserProfileRecord {
  documentId: string;
  data: Record<string, unknown>;
}

export interface SessionResult {
  customToken: string;
  user: Record<string, unknown> & {
    id: string;
    uid: string;
  };
}
