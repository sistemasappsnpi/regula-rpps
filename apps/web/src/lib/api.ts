const TOKEN_KEY = "regula-rpps.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error ?? "Erro inesperado ao comunicar com o servidor.");
  }

  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; tenant: Tenant; user: { id: string; name: string; email: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<Tenant>("/tenants/me"),

  listCrpCriteria: () => request<{ criteria: CrpCriterion[] }>("/crp"),

  crpSummary: () =>
    request<{ total: number; regular: number; irregular: number; pendente: number; nextDueAt: string | null }>(
      "/crp/summary",
    ),

  updateCrpCriterion: (criterionId: string, patch: Partial<Pick<TenantCrpStatus, "status" | "notes">>) =>
    request<TenantCrpStatus>(`/crp/${criterionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  federatedEntity: string;
  plan: "ESSENCIAL" | "GESTAO" | "PERFORMANCE";
  seguradosCount: number;
}

export interface TenantCrpStatus {
  id: string;
  tenantId: string;
  criterionId: string;
  status: "REGULAR" | "IRREGULAR" | "PENDENTE";
  lastSentAt: string | null;
  nextDueAt: string | null;
  notes: string | null;
}

export interface CrpCriterion {
  id: string;
  code: string;
  category: string;
  title: string;
  description: string;
  legalBasis: string;
  periodicity: string;
  tenantStatuses: TenantCrpStatus[];
}
