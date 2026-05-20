// Thin client for the clanker HTTP API. Reads its base URL and bearer token
// from localStorage so the Settings view can change them at runtime without
// rebuilding. Falls back to VITE_API_URL when set at build time.

const URL_KEY = "clanker.apiUrl";
const TOKEN_KEY = "clanker.apiToken";

export function getApiUrl(): string {
  const stored = localStorage.getItem(URL_KEY);
  if (stored) return stored;
  const buildTime = import.meta.env.VITE_API_URL as string | undefined;
  return buildTime ?? "http://127.0.0.1:47180";
}

export function getApiToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setApiUrl(value: string) {
  localStorage.setItem(URL_KEY, value);
}

export function setApiToken(value: string) {
  localStorage.setItem(TOKEN_KEY, value);
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const url = getApiUrl().replace(/\/$/, "") + path;
  const headers = new Headers(init?.headers);
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  let resp: Response;
  try {
    resp = await fetch(url, { ...init, headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    return { ok: false, status: 0, code: "network", message: msg };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    return {
      ok: false,
      status: resp.status,
      code: err?.code ?? "http_error",
      message: err?.message ?? resp.statusText,
    };
  }
  const data = (body as { data: T })?.data;
  return { ok: true, data };
}

export function getHealth() {
  return call<{ ok: boolean; uptime: string }>("/api/v1/health");
}

export function getVersion() {
  return call<{ version: string }>("/api/v1/version");
}

export function getRegions() {
  return call<string[]>("/api/v1/tencent/regions");
}

export function getResources(type: string, region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<Record<string, unknown>[]>(
    `/api/v1/tencent/resources/${encodeURIComponent(type)}${q}`,
  );
}

export type SGRule = {
  direction: string;
  index: number;
  protocol?: string;
  port?: string;
  source?: string;
  action: string;
  description?: string;
  risk?: string;
};

export function getSGRules(sgId: string, region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<{ sg_id: string; region: string; rules: SGRule[]; risky_count: number }>(
    `/api/v1/tencent/sg-rules/${encodeURIComponent(sgId)}${q}`,
  );
}

export type ApplyResult = {
  provider: string;
  status: "ok" | "error";
  output: string;
  error?: string;
  duration: string;
};

export function applyPlan(plan: unknown, destroyer: boolean) {
  return call<ApplyResult>("/api/v1/maker/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "tencent", plan, destroyer }),
  });
}

export type Topology = {
  region: string;
  vpcs: { id: string; name: string; cidr: string; is_default: boolean }[];
  subnets: { id: string; name: string; cidr: string; zone: string; vpc_id: string }[];
  cvms: {
    id: string;
    name: string;
    state: string;
    type: string;
    zone?: string;
    private_ip?: string;
    public_ip?: string;
    vpc_id?: string;
    subnet_id?: string;
    sg_ids?: string[];
  }[];
  security_groups: { id: string; name: string; description?: string; is_default: boolean }[];
  mysql: { id: string; name: string; status?: string; engine?: string; vpc_id?: string; zone?: string }[];
  postgres: { id: string; name: string; status?: string; engine?: string; vpc_id?: string; zone?: string }[];
  clusters: { id: string; name: string; status?: string; k8s_version?: string; node_num?: number; vpc_id?: string }[];
  warnings?: string[];
};

export function getTopology(region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<Topology>(`/api/v1/tencent/topology${q}`);
}

export type ExposedCVM = {
  instance_id: string;
  name: string;
  state: string;
  public_ip: string;
  private_ip?: string;
  sg_ids: string[];
  risky_rules: {
    sg_id: string;
    sg_name?: string;
    protocol?: string;
    port?: string;
    source?: string;
    risk: string;
    description?: string;
  }[];
};

export function getPublicExposure(region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<{ region: string; items: ExposedCVM[] }>(`/api/v1/tencent/scan/public-exposure${q}`);
}

export type GeneratedPlan = {
  provider: string;
  plan: unknown;
  model?: string;
  ai_profile?: string;
  duration: string;
};

export function generatePlan(question: string, destroyer: boolean) {
  return call<GeneratedPlan>("/api/v1/maker/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "tencent", question, destroyer }),
  });
}

export type ApplyRecord = {
  id: number;
  started_at: string;
  provider: string;
  status: "ok" | "error";
  duration: string;
  destroyer: boolean;
  command_count: number;
  destructive_count: number;
  summary?: string;
  question?: string;
  error?: string;
  output?: string;
  output_truncated?: boolean;
};

export function getMakerHistory(limit?: number) {
  const q = limit ? `?limit=${limit}` : "";
  return call<ApplyRecord[]>(`/api/v1/maker/history${q}`);
}

export type CLBExposureItem = {
  lb_id: string;
  name?: string;
  type: string;
  vips?: string[];
  listeners: { listener_id: string; name?: string; protocol: string; port: number; risk?: string }[];
  risky_count: number;
};

export function getCLBExposure(region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<{ region: string; items: CLBExposureItem[] }>(`/api/v1/tencent/scan/clb-exposure${q}`);
}

export type IdleEIPItem = {
  id: string;
  name?: string;
  ip: string;
  status: string;
  type?: string;
  created_at?: string;
};

export function getIdleEIPs(region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<{ region: string; items: IdleEIPItem[] }>(`/api/v1/tencent/scan/idle-eips${q}`);
}

export type UnencryptedCBSItem = {
  id: string;
  name?: string;
  type: string;
  size_gb: number;
  state: string;
  instance_id?: string;
  zone?: string;
  unattached: boolean;
};

export function getUnencryptedCBS(region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<{ region: string; items: UnencryptedCBSItem[] }>(`/api/v1/tencent/scan/unencrypted-cbs${q}`);
}

export type ExpiringCert = {
  id: string;
  alias?: string;
  domain?: string;
  status: string;
  cert_end?: string;
  days_left: number;
};

export function getCertExpiry(days = 30) {
  return call<{ threshold_days: number; items: ExpiringCert[] }>(`/api/v1/tencent/scan/cert-expiry?days=${days}`);
}

export type CAMHygieneItem = {
  uid: number;
  name: string;
  email?: string;
  console_login: boolean;
  phone_registered: boolean;
  findings: string[];
};

export function getCAMHygiene() {
  return call<{ total_users: number; items: CAMHygieneItem[] }>(`/api/v1/tencent/scan/cam-hygiene`);
}

export type DBExposureFinding = {
  engine: string;
  id: string;
  name?: string;
  status: string;
  public_addr: string;
  reason: string;
};

export function getDBExposure(region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<{ region: string; items: DBExposureFinding[]; warnings?: string[] }>(
    `/api/v1/tencent/scan/db-exposure${q}`,
  );
}

export type WAFCoverageResult = {
  waf_protected: string[];
  items: { domain: string; source: string }[];
};

export function getWAFCoverage() {
  return call<WAFCoverageResult>(`/api/v1/tencent/scan/waf-coverage`);
}

export type AntiDDoSCoverageResult = {
  region: string;
  posture: string;
  has_advanced: boolean;
  advanced_instances?: string[];
  public_targets: { kind: string; id: string; name?: string; public_ip: string }[];
};

export function getAntiDDoSCoverage(region: string) {
  const q = region ? `?region=${encodeURIComponent(region)}` : "";
  return call<AntiDDoSCoverageResult>(`/api/v1/tencent/scan/antiddos-coverage${q}`);
}

export type AuditCoverageResult = {
  posture: string;
  enabled_count: number;
  disabled_count: number;
  tracks: { name: string; enabled: boolean; cos_bucket?: string; log_prefix?: string }[];
};

export function getAuditCoverage() {
  return call<AuditCoverageResult>(`/api/v1/tencent/scan/audit-coverage`);
}

export type CVMMetricItem = {
  instance_id: string;
  name?: string;
  latest?: number;
  min?: number;
  max?: number;
  avg?: number;
  samples: number;
};

export function getCVMMetrics(region: string, metric = "CPUUsage", minutes = 60) {
  const q = `?region=${encodeURIComponent(region)}&metric=${encodeURIComponent(metric)}&minutes=${minutes}`;
  return call<{ region: string; metric: string; window_minutes: number; items: CVMMetricItem[] }>(
    `/api/v1/tencent/metrics/cvm${q}`,
  );
}

// Lighthouse shares the same wire shape as CVM metrics (instance_id, name,
// latest, min/avg/max, samples) — only the metric-name vocabulary differs.
// QCE/LIGHTHOUSE valid metrics: CpuUsage, MemUsage, DiskUsage, CpuLoad1/5/15,
// LighthouseInpkg / LighthouseOutpkg / LighthouseIntraffic / LighthouseOuttraffic.
export function getLighthouseMetrics(region: string, metric = "CpuUsage", minutes = 60) {
  const q = `?region=${encodeURIComponent(region)}&metric=${encodeURIComponent(metric)}&minutes=${minutes}`;
  return call<{ region: string; metric: string; window_minutes: number; items: CVMMetricItem[] }>(
    `/api/v1/tencent/metrics/lighthouse${q}`,
  );
}

export type ProductCost = {
  code: string;
  name: string;
  real_cost: number;
  cash_pay: number;
  incentive_pay: number;
  voucher_pay: number;
  ratio?: string;
};

export type CostSummary = {
  consumption: number;      // total RealCost (voucher + cash + tax)
  voucher: number;          // amount covered by vouchers
  cash_before_tax: number;  // cash portion, pre-tax
  tax: number;              // tax amount
  cash_incl_tax: number;    // cash_before_tax + tax — the console headline
  note?: string;            // set when the fee breakdown call failed
};

export function getCostByProduct(month: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return call<{ month: string; total: number; summary?: CostSummary; items: ProductCost[] }>(
    `/api/v1/tencent/cost/by-product${q}`,
  );
}

export type ResourceCost = {
  product: string;
  resource_id: string;
  name?: string;
  region?: string;
  pay_mode?: string;
  action?: string;
  cost: number;
};

export function getCostResources(month: string, top = 50) {
  const q = month
    ? `?month=${encodeURIComponent(month)}&top=${top}`
    : `?top=${top}`;
  return call<{ month: string; top: number; items: ResourceCost[] }>(
    `/api/v1/tencent/cost/resources${q}`,
  );
}
