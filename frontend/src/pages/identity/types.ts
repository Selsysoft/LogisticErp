export interface Role {
  id: string;
  code: string;
  name: string;
  locked: boolean;
  priority: number;
  landingPath: string;
  permissions: string[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
  twoFactorEnabled: boolean;
  roles: Role[];
  /** Bu adrese giden son e-posta teslim edilemediyse dolu; sonraki başarılı teslimde kalkar. */
  mailIssue: MailIssue | null;
}

export interface MailIssue {
  type: "BOUNCED" | "COMPLAINED" | "FAILED";
  detail: string | null;
  occurredAt: string;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface PermissionInfo {
  code: string;
  module: string;
}

export interface AuditEntry {
  id: string;
  eventType: string;
  actorEmail: string | null;
  target: string | null;
  details: string | null;
  ipAddress: string | null;
  traceId: string | null;
  createdAt: string;
}
