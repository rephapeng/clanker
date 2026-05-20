import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiResult,
  ApplyResult,
  ExposedCVM,
  SGRule,
  Topology,
  ApplyRecord,
  applyPlan,
  generatePlan,
  getMakerHistory,
  getApiToken,
  getApiUrl,
  getHealth,
  getPublicExposure,
  getCAMHygiene,
  getDBExposure,
  getAntiDDoSCoverage,
  getCVMMetrics,
  getLighthouseMetrics,
  getCostResources,
  getCostByProduct,
  ResourceCost,
  ProductCost,
  CostSummary,
  getAuditCoverage,
  CVMMetricItem,
  AuditCoverageResult,
  getWAFCoverage,
  AntiDDoSCoverageResult,
  WAFCoverageResult,
  DBExposureFinding,
  getCertExpiry,
  getUnencryptedCBS,
  getIdleEIPs,
  getCLBExposure,
  CAMHygieneItem,
  ExpiringCert,
  UnencryptedCBSItem,
  IdleEIPItem,
  CLBExposureItem,
  getRegions,
  getResources,
  getSGRules,
  getTopology,
  getVersion,
  setApiToken,
  setApiUrl,
} from "./api";

// ───────────────────────────────────────────────────────────────────────────
// Types & nav
// ───────────────────────────────────────────────────────────────────────────

type View =
  | "resources"
  | "topology"
  | "security-scan"
  | "sg-audit"
  | "maker"
  | "monitoring"
  | "cost"
  | "activity"
  | "settings";

const RESOURCE_TYPES = [
  "cvm", "lighthouse", "vpc", "sg", "mysql", "postgres", "cos", "tke", "clb",
  "eip", "cbs", "ssl", "cam", "redis", "mongodb", "cynosdb", "cdn",
  "edgeone", "waf", "antiddos", "nat", "vpn", "ccn", "dc",
  "monitor", "cls", "cloudaudit",
];

type NavItem = { id: View; label: string; icon: (cls: string) => JSX.Element };
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    group: "Inventory",
    items: [
      { id: "resources", label: "Resources", icon: IconBox },
      { id: "topology",  label: "Topology",  icon: IconNetwork },
    ],
  },
  {
    group: "Security",
    items: [
      { id: "security-scan", label: "Security scan", icon: IconShield },
      { id: "sg-audit",      label: "SG audit",      icon: IconLock },
    ],
  },
  {
    group: "Observability",
    items: [
      { id: "monitoring", label: "Monitoring", icon: IconActivity },
      { id: "activity",   label: "Activity",   icon: IconList },
    ],
  },
  {
    group: "Spend",
    items: [
      { id: "cost", label: "Cost Explorer", icon: IconCoin },
    ],
  },
  {
    group: "Automation",
    items: [
      { id: "maker", label: "Maker", icon: IconWand },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Region context — shared across views via the top-bar picker
// ───────────────────────────────────────────────────────────────────────────

const RegionCtx = createContext<{
  region: string;
  setRegion: (r: string) => void;
  regions: string[];
}>({
  region: "ap-singapore",
  setRegion: () => {},
  regions: [],
});

function useRegion() {
  return useContext(RegionCtx);
}

// ───────────────────────────────────────────────────────────────────────────
// App shell
// ───────────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("resources");
  const [serverInfo, setServerInfo] = useState<{ ok: boolean; text: string }>({
    ok: false,
    text: "checking…",
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [region, setRegion] = useState<string>(
    localStorage.getItem("clanker.region") || "ap-singapore",
  );
  const [regions, setRegions] = useState<string[]>([]);

  useEffect(() => {
    void refreshServerInfo();
  }, []);

  useEffect(() => {
    void (async () => {
      const r = await getRegions();
      if (r.ok) setRegions(r.data);
    })();
  }, [refreshKey]);

  function changeRegion(r: string) {
    setRegion(r);
    localStorage.setItem("clanker.region", r);
  }

  async function refreshServerInfo() {
    const h = await getHealth();
    if (!h.ok) {
      setServerInfo({ ok: false, text: `unreachable · ${h.message}` });
      return;
    }
    const v = await getVersion();
    setServerInfo({
      ok: true,
      text: v.ok
        ? `clanker ${v.data.version} · up ${h.data.uptime}`
        : `up ${h.data.uptime}`,
    });
  }

  const activeItem = NAV.flatMap((g) => g.items).find((i) => i.id === view);
  const activeGroup = NAV.find((g) => g.items.some((i) => i.id === view))?.group;

  return (
    <RegionCtx.Provider value={{ region, setRegion: changeRegion, regions }}>
      <div className="min-h-screen flex bg-canvas text-ink">
        <Sidebar view={view} onSelect={setView} />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            crumbs={[activeGroup, activeItem?.label].filter(Boolean) as string[]}
            serverInfo={serverInfo}
            onRefresh={() => void refreshServerInfo()}
          />

          <main className="flex-1 p-8 overflow-auto">
            <div className="max-w-7xl mx-auto">
              {view === "resources"     && <ResourcesView key={"resources-" + refreshKey} />}
              {view === "topology"      && <TopologyView key={"topology-" + refreshKey} />}
              {view === "security-scan" && <SecurityScanView key={"scan-" + refreshKey} />}
              {view === "sg-audit"      && <SGAuditView key={"sg-" + refreshKey} />}
              {view === "maker"         && <MakerView key={"maker-" + refreshKey} />}
              {view === "monitoring"    && <MonitoringView key={"monitoring-" + refreshKey} />}
              {view === "cost"          && <CostExplorerView key={"cost-" + refreshKey} />}
              {view === "activity"      && <ActivityView key={"activity-" + refreshKey} />}
              {view === "settings"      && (
                <SettingsView
                  onSaved={() => {
                    void refreshServerInfo();
                    setRefreshKey((k) => k + 1);
                  }}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </RegionCtx.Provider>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sidebar
// ───────────────────────────────────────────────────────────────────────────

function Sidebar({
  view,
  onSelect,
}: {
  view: View;
  onSelect: (v: View) => void;
}) {
  return (
    <aside className="w-60 shrink-0 bg-surface border-r border-line flex flex-col">
      <div className="px-5 py-4 border-b border-line flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-brand-500 grid place-items-center text-white">
          <IconCloud className="w-4 h-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Clanker</div>
          <div className="text-[11px] text-ink-subtle">Tencent Console</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV.map((group) => (
          <div key={group.group} className="px-3 mb-4">
            <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-wider text-ink-subtle uppercase">
              {group.group}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((it) => (
                <NavBtn
                  key={it.id}
                  label={it.label}
                  icon={it.icon}
                  active={view === it.id}
                  onClick={() => onSelect(it.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <NavBtn
          label="Settings"
          icon={IconGear}
          active={view === "settings"}
          onClick={() => onSelect("settings")}
        />
      </div>
    </aside>
  );
}

function NavBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: (cls: string) => JSX.Element;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        "relative w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded text-sm transition " +
        (active
          ? "bg-brand-50 text-brand-700 font-medium"
          : "text-ink-muted hover:bg-surface-3 hover:text-ink")
      }
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand-500" />
      )}
      {icon(active ? "w-4 h-4 text-brand-500" : "w-4 h-4 text-ink-subtle")}
      <span>{label}</span>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Top bar
// ───────────────────────────────────────────────────────────────────────────

function TopBar({
  crumbs,
  serverInfo,
  onRefresh,
}: {
  crumbs: string[];
  serverInfo: { ok: boolean; text: string };
  onRefresh: () => void;
}) {
  const { region, setRegion, regions } = useRegion();
  return (
    <header className="h-14 shrink-0 bg-surface border-b border-line px-6 flex items-center gap-4">
      <nav className="flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span className="text-ink-faint">/</span>}
            <span className={i === crumbs.length - 1 ? "text-ink font-medium truncate" : "text-ink-muted truncate"}>
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={onRefresh}
          title="Refresh server health"
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink px-2 py-1 rounded hover:bg-surface-3"
        >
          <span className={"w-1.5 h-1.5 rounded-full " + (serverInfo.ok ? "bg-ok" : "bg-bad")} />
          <span className="font-mono">{serverInfo.text}</span>
        </button>

        <div className="h-6 w-px bg-line" />

        <label className="flex items-center gap-2 text-sm">
          <IconGlobe className="w-4 h-4 text-ink-subtle" />
          <select
            className="bg-transparent text-ink font-medium pr-1 cursor-pointer hover:text-brand-600 focus:outline-none"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {regions.length === 0 && <option value={region}>{region}</option>}
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// UI primitives
// ───────────────────────────────────────────────────────────────────────────

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={
        "bg-surface border border-line rounded-md shadow-card " +
        (padded ? "p-5 " : "") +
        className
      }
    >
      {children}
    </div>
  );
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mb-5" padded={false}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 py-3">
        {children}
      </div>
    </Card>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  type,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded transition disabled:opacity-50 disabled:cursor-not-allowed";
  const sizing = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  const variants: Record<ButtonVariant, string> = {
    primary:   "bg-brand-500 hover:bg-brand-600 text-white shadow-card",
    secondary: "bg-surface hover:bg-surface-3 text-ink border border-line",
    danger:    "bg-bad hover:opacity-90 text-white shadow-card",
    ghost:     "bg-transparent hover:bg-surface-3 text-ink-muted hover:text-ink",
  };
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizing} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={"flex flex-col gap-1 " + className}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      className={
        "bg-surface border border-line rounded px-2.5 py-1.5 text-sm text-ink hover:border-line-strong focus:border-brand-500 transition " +
        className
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        "bg-surface border border-line rounded px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-brand-500 transition " +
        className
      }
    />
  );
}

function RegionSelectInline() {
  const { region, setRegion, regions } = useRegion();
  return (
    <Select value={region} onChange={setRegion}>
      {regions.length === 0 && <option value={region}>{region}</option>}
      {regions.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </Select>
  );
}

function StatusDot({ intent }: { intent: "ok" | "warn" | "bad" | "info" | "neutral" }) {
  const c: Record<typeof intent, string> = {
    ok:      "bg-ok",
    warn:    "bg-warn",
    bad:     "bg-bad",
    info:    "bg-brand-500",
    neutral: "bg-ink-faint",
  };
  return <span className={"inline-block w-1.5 h-1.5 rounded-full " + c[intent]} />;
}

function StatusBadge({
  intent,
  children,
}: {
  intent: "ok" | "warn" | "bad" | "info" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <StatusDot intent={intent} />
      <span className="text-ink">{children}</span>
    </span>
  );
}

function Tag({
  children,
  intent = "neutral",
}: {
  children: React.ReactNode;
  intent?: "neutral" | "info" | "ok" | "warn" | "bad";
}) {
  const c: Record<typeof intent, string> = {
    neutral: "bg-surface-3 text-ink-muted border-line",
    info:    "bg-brand-50 text-brand-700 border-brand-100",
    ok:      "bg-ok/10 text-ok border-ok/20",
    warn:    "bg-warn/10 text-warn border-warn/20",
    bad:     "bg-bad/10 text-bad border-bad/20",
  };
  return (
    <span className={"inline-flex items-center text-[11px] px-1.5 py-0.5 rounded border " + c[intent]}>
      {children}
    </span>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12px] text-ink">{children}</span>;
}

function MutedCode({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12px] text-ink-muted">{children}</span>;
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="text-xs">
      <span className="text-ink-subtle">{label}:</span>{" "}
      <span className="text-ink">{children}</span>
    </span>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-bad/5 border border-bad/30 rounded-md px-3 py-2 text-sm text-bad flex items-start gap-2">
      <IconAlert className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="break-words">{message}</span>
    </div>
  );
}

function Empty({
  message,
  intent = "neutral",
}: {
  message: string;
  intent?: "neutral" | "ok";
}) {
  return (
    <div className="bg-surface border border-dashed border-line rounded-md px-5 py-8 text-center">
      {intent === "ok" ? (
        <div className="mx-auto w-8 h-8 rounded-full bg-ok/10 grid place-items-center text-ok mb-2">
          <IconCheck className="w-4 h-4" />
        </div>
      ) : (
        <div className="mx-auto w-8 h-8 rounded-full bg-surface-3 grid place-items-center text-ink-subtle mb-2">
          <IconInbox className="w-4 h-4" />
        </div>
      )}
      <div className="text-sm text-ink-muted">{message}</div>
    </div>
  );
}

function CountPill({
  count,
  intent = "neutral",
  label,
}: {
  count: number;
  intent?: "ok" | "warn" | "bad" | "neutral";
  label: string;
}) {
  const c: Record<typeof intent, string> = {
    ok:      "text-ok",
    warn:    "text-warn",
    bad:     "text-bad",
    neutral: "text-ink",
  };
  return (
    <span className="text-sm">
      <span className={"font-semibold " + c[intent]}>{count}</span>{" "}
      <span className="text-ink-muted">{label}</span>
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-2">
      {children}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={"py-2.5 px-3 font-medium text-[11px] uppercase tracking-wider text-ink-subtle " + className}>
      {children}
    </th>
  );
}

function Td({
  children,
  mono = false,
  className = "",
}: {
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={
        "py-2 px-3 align-top text-sm " +
        (mono ? "font-mono text-[12.5px] text-ink " : "text-ink ") +
        className
      }
    >
      {children}
    </td>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-md shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
}

function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-surface-2 border-b border-line text-left">
      {children}
    </thead>
  );
}

function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

function Tr({
  children,
  risk = false,
}: {
  children: React.ReactNode;
  risk?: boolean;
}) {
  return (
    <tr
      className={
        "hover:bg-surface-2 transition " +
        (risk ? "bg-bad/[0.03]" : "")
      }
    >
      {children}
    </tr>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Resources view
// ───────────────────────────────────────────────────────────────────────────

function ResourcesView() {
  const { region } = useRegion();
  const [type, setType] = useState("cvm");
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [groupByTag, setGroupByTag] = useState<string>(""); // "" = no grouping

  async function fetchRows() {
    setLoading(true);
    setErr("");
    setRows(null);
    setGroupByTag(""); // reset grouping when fetching new type
    const r = await getResources(type, region);
    setLoading(false);
    if (!r.ok) {
      setErr(`${r.code}: ${r.message}`);
      return;
    }
    setRows(r.data ?? []);
  }

  // Collect distinct tag keys present on at least one row — used to populate
  // the Group-by-tag dropdown. Resources without a `tags` field contribute
  // nothing.
  const tagKeys = useMemo(() => {
    if (!rows) return [];
    const keys = new Set<string>();
    for (const r of rows) {
      const tags = r.tags;
      if (tags && typeof tags === "object" && !Array.isArray(tags)) {
        for (const k of Object.keys(tags as Record<string, unknown>)) {
          keys.add(k);
        }
      }
    }
    return Array.from(keys).sort();
  }, [rows]);

  return (
    <section>
      <PageHeader
        title="Resources"
        subtitle="Browse raw Tencent Cloud resources by type and region. Output is the SDK response, formatted as a table."
      />

      <Toolbar>
        <Field label="Resource type">
          <Select value={type} onChange={setType}>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Region">
          <RegionSelectInline />
        </Field>
        {tagKeys.length > 0 && (
          <Field label="Group by tag">
            <Select value={groupByTag} onChange={setGroupByTag}>
              <option value="">(no grouping)</option>
              {tagKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className="ml-auto">
          <Button onClick={() => void fetchRows()} disabled={loading}>
            {loading ? "Fetching…" : "Fetch"}
          </Button>
        </div>
      </Toolbar>

      {err && <ErrorBox message={err} />}
      {rows && rows.length === 0 && (
        <Empty message={`No ${type} resources in ${region}.`} />
      )}
      {rows && rows.length > 0 && (
        <>
          <div className="mb-3">
            <CountPill count={rows.length} label={`${type} record${rows.length === 1 ? "" : "s"}`} />
          </div>
          {groupByTag ? (
            <GroupedDynamicTables rows={rows} groupKey={groupByTag} />
          ) : (
            <DynamicTable rows={rows} />
          )}
        </>
      )}
    </section>
  );
}

// GroupedDynamicTables renders one DynamicTable per distinct value of the
// chosen tag key, plus an "(untagged)" bucket for rows missing it. Each
// group has a header showing the value + row count.
function GroupedDynamicTables({
  rows,
  groupKey,
}: {
  rows: Record<string, unknown>[];
  groupKey: string;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const tags = r.tags as Record<string, unknown> | undefined;
      const v =
        tags && typeof tags === "object" && !Array.isArray(tags)
          ? (tags[groupKey] as string | undefined) ?? ""
          : "";
      const bucket = v && String(v).trim() !== "" ? String(v) : "(untagged)";
      const arr = m.get(bucket) ?? [];
      arr.push(r);
      m.set(bucket, arr);
    }
    // sort: untagged last, otherwise alphabetical
    return Array.from(m.entries()).sort(([a], [b]) => {
      if (a === "(untagged)") return 1;
      if (b === "(untagged)") return -1;
      return a.localeCompare(b);
    });
  }, [rows, groupKey]);

  return (
    <div className="space-y-5">
      {groups.map(([value, groupRows]) => (
        <div key={value}>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-sm font-semibold text-ink">
              {groupKey}=<span className="text-brand-700">{value}</span>
            </span>
            <span className="text-xs text-ink-muted">
              ({groupRows.length} record{groupRows.length === 1 ? "" : "s"})
            </span>
          </div>
          <DynamicTable rows={groupRows} />
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Topology view
// ───────────────────────────────────────────────────────────────────────────

function TopologyView() {
  const { region } = useRegion();
  const [data, setData] = useState<Topology | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function fetchTopo() {
    setLoading(true);
    setErr("");
    setData(null);
    const r = await getTopology(region);
    setLoading(false);
    if (!r.ok) {
      setErr(`${r.code}: ${r.message}`);
      return;
    }
    setData(r.data);
  }

  const groups = useMemo(() => (data ? groupTopology(data) : null), [data]);

  return (
    <section>
      <PageHeader
        title="Topology"
        subtitle="VPC → subnet → instance/DB tree for a single region. Security groups are region-global, so they appear once at the bottom."
        actions={
          <Button onClick={() => void fetchTopo()} disabled={loading}>
            {loading ? "Loading…" : "Load topology"}
          </Button>
        }
      />

      <Toolbar>
        <Field label="Region">
          <RegionSelectInline />
        </Field>
      </Toolbar>

      {err && <ErrorBox message={err} />}
      {data && groups && (
        <div className="space-y-5">
          {data.warnings && data.warnings.length > 0 && (
            <div className="bg-warn/5 border border-warn/30 rounded-md px-4 py-2.5 text-sm text-ink flex items-start gap-2">
              <IconAlert className="w-4 h-4 mt-0.5 text-warn shrink-0" />
              <span>
                <span className="font-medium">{data.warnings.length} warning(s):</span>{" "}
                <span className="text-ink-muted">{data.warnings.slice(0, 3).join(" · ")}</span>
              </span>
            </div>
          )}

          {data.vpcs.map((vpc) => (
            <Card key={vpc.id}>
              <div className="flex items-baseline gap-2 mb-4 flex-wrap">
                <span className="font-semibold text-ink">{vpc.name || vpc.id}</span>
                <MutedCode>{vpc.id}</MutedCode>
                <Tag>{vpc.cidr}</Tag>
                {vpc.is_default && <Tag intent="info">default</Tag>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groups.vpcSubnets.get(vpc.id)?.map((subnet) => (
                  <div key={subnet.id} className="border border-line rounded p-3 bg-surface-2">
                    <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">
                        {subnet.name || subnet.id}
                      </span>
                      <MutedCode>{subnet.cidr}</MutedCode>
                      <Tag>{subnet.zone}</Tag>
                    </div>
                    <Chips items={groups.subnetCVMs.get(subnet.id) ?? []} kind="cvm" />
                  </div>
                )) ?? <div className="text-sm text-ink-subtle">no subnets</div>}
              </div>

              <DBRow
                vpcID={vpc.id}
                mysql={groups.vpcMySQL.get(vpc.id) ?? []}
                postgres={groups.vpcPostgres.get(vpc.id) ?? []}
              />
              <ClusterRow clusters={groups.vpcClusters.get(vpc.id) ?? []} />
            </Card>
          ))}

          {(groups.orphanCVMs.length > 0 ||
            groups.orphanMySQL.length > 0 ||
            groups.orphanPostgres.length > 0 ||
            groups.orphanClusters.length > 0) && (
            <Card className="border-warn/40 bg-warn/5">
              <div className="font-semibold mb-3 text-warn flex items-center gap-2">
                <IconAlert className="w-4 h-4" /> Orphaned (no VPC reference)
              </div>
              {groups.orphanCVMs.length > 0 && (
                <div className="mb-3">
                  <SectionLabel>CVMs</SectionLabel>
                  <Chips items={groups.orphanCVMs} kind="cvm" />
                </div>
              )}
              {groups.orphanMySQL.length > 0 && (
                <div className="mb-3">
                  <SectionLabel>MySQL</SectionLabel>
                  <Chips items={groups.orphanMySQL.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
                </div>
              )}
              {groups.orphanPostgres.length > 0 && (
                <div className="mb-3">
                  <SectionLabel>Postgres</SectionLabel>
                  <Chips items={groups.orphanPostgres.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
                </div>
              )}
              {groups.orphanClusters.length > 0 && (
                <div>
                  <SectionLabel>TKE clusters</SectionLabel>
                  <Chips items={groups.orphanClusters.map((c) => ({ id: c.id, name: c.name, state: c.status }))} kind="tke" />
                </div>
              )}
            </Card>
          )}

          {data.security_groups.length > 0 && (
            <Card>
              <div className="font-semibold mb-3 flex items-baseline gap-2">
                Security groups
                <span className="text-ink-subtle text-sm font-normal">
                  region-global · {data.security_groups.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.security_groups.map((sg) => (
                  <span
                    key={sg.id}
                    className="bg-surface-2 border border-line rounded px-2 py-1 text-xs flex items-center gap-2"
                  >
                    <MutedCode>{sg.id}</MutedCode>
                    <span className="text-ink">{sg.name}</span>
                    {sg.is_default && <Tag intent="info">default</Tag>}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}

function Chips({
  items,
  kind,
}: {
  items: { id: string; name?: string; state?: string }[];
  kind: "cvm" | "db" | "tke";
}) {
  if (items.length === 0) return <div className="text-xs text-ink-subtle">empty</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span
          key={it.id}
          className={
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border " +
            chipColor(kind, it.state)
          }
          title={`${it.id} (${it.state ?? ""})`}
        >
          {kind === "cvm" && (
            <StatusDot
              intent={
                it.state && /running|RUNNING/i.test(it.state)
                  ? "ok"
                  : it.state
                    ? "neutral"
                    : "neutral"
              }
            />
          )}
          <span className="font-mono">{it.name || it.id}</span>
        </span>
      ))}
    </div>
  );
}

function chipColor(kind: "cvm" | "db" | "tke", state?: string) {
  if (kind === "cvm") {
    const running = state && /running|RUNNING/i.test(state);
    return running
      ? "border-ok/30 bg-ok/5 text-ink"
      : "border-line bg-surface-2 text-ink-muted";
  }
  if (kind === "db") return "border-brand-100 bg-brand-50 text-brand-700";
  return "border-line bg-surface-2 text-ink";
}

function DBRow({
  vpcID: _,
  mysql,
  postgres,
}: {
  vpcID: string;
  mysql: Topology["mysql"];
  postgres: Topology["postgres"];
}) {
  if (mysql.length === 0 && postgres.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-4">
      {mysql.length > 0 && (
        <div>
          <SectionLabel>MySQL</SectionLabel>
          <Chips items={mysql.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
        </div>
      )}
      {postgres.length > 0 && (
        <div>
          <SectionLabel>Postgres</SectionLabel>
          <Chips items={postgres.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
        </div>
      )}
    </div>
  );
}

function ClusterRow({ clusters }: { clusters: Topology["clusters"] }) {
  if (clusters.length === 0) return null;
  return (
    <div className="mt-4">
      <SectionLabel>TKE clusters</SectionLabel>
      <Chips items={clusters.map((c) => ({ id: c.id, name: c.name, state: c.status }))} kind="tke" />
    </div>
  );
}

function groupTopology(data: Topology) {
  const vpcSubnets = new Map<string, Topology["subnets"]>();
  const subnetCVMs = new Map<string, { id: string; name: string; state: string }[]>();
  const vpcMySQL = new Map<string, Topology["mysql"]>();
  const vpcPostgres = new Map<string, Topology["postgres"]>();
  const vpcClusters = new Map<string, Topology["clusters"]>();

  for (const s of data.subnets) {
    if (!s.vpc_id) continue;
    const arr = vpcSubnets.get(s.vpc_id) ?? [];
    arr.push(s);
    vpcSubnets.set(s.vpc_id, arr);
  }
  const cvmsWithSubnet = new Set<string>();
  for (const c of data.cvms) {
    if (c.subnet_id) {
      const arr = subnetCVMs.get(c.subnet_id) ?? [];
      arr.push({ id: c.id, name: c.name, state: c.state });
      subnetCVMs.set(c.subnet_id, arr);
      cvmsWithSubnet.add(c.id);
    }
  }
  for (const m of data.mysql) {
    if (m.vpc_id) {
      const arr = vpcMySQL.get(m.vpc_id) ?? [];
      arr.push(m);
      vpcMySQL.set(m.vpc_id, arr);
    }
  }
  for (const m of data.postgres) {
    if (m.vpc_id) {
      const arr = vpcPostgres.get(m.vpc_id) ?? [];
      arr.push(m);
      vpcPostgres.set(m.vpc_id, arr);
    }
  }
  for (const c of data.clusters) {
    if (c.vpc_id) {
      const arr = vpcClusters.get(c.vpc_id) ?? [];
      arr.push(c);
      vpcClusters.set(c.vpc_id, arr);
    }
  }
  return {
    vpcSubnets,
    subnetCVMs,
    vpcMySQL,
    vpcPostgres,
    vpcClusters,
    orphanCVMs: data.cvms
      .filter((c) => !cvmsWithSubnet.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, state: c.state })),
    orphanMySQL: data.mysql.filter((m) => !m.vpc_id),
    orphanPostgres: data.postgres.filter((m) => !m.vpc_id),
    orphanClusters: data.clusters.filter((c) => !c.vpc_id),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Security scan view
// ───────────────────────────────────────────────────────────────────────────

type ScanTab =
  | "public-exposure" | "clb" | "eip" | "cbs" | "ssl"
  | "cam" | "db" | "waf" | "ddos" | "audit";

const SCAN_TABS: { id: ScanTab; label: string; regional: boolean; hint: string }[] = [
  { id: "public-exposure", label: "Public CVM exposure", regional: true,  hint: "CVMs with sensitive ports open to 0.0.0.0/0." },
  { id: "clb",             label: "CLB exposure",        regional: true,  hint: "Public-facing CLB listeners with risky protocols/ports." },
  { id: "eip",             label: "Idle EIPs",           regional: true,  hint: "Unbound elastic IPs that are still billed." },
  { id: "cbs",             label: "Unencrypted CBS",     regional: true,  hint: "Cloud Block Storage volumes without encryption." },
  { id: "ssl",             label: "Cert expiry",         regional: false, hint: "SSL certificates expiring within N days. Account-global." },
  { id: "cam",             label: "CAM hygiene",         regional: false, hint: "IAM users missing phone or email. Account-global." },
  { id: "db",              label: "DB exposure",         regional: true,  hint: "Managed databases reachable from the public internet." },
  { id: "waf",             label: "WAF coverage",        regional: false, hint: "CDN/EdgeOne hosts not covered by WAF. Account-global." },
  { id: "ddos",            label: "Anti-DDoS",           regional: true,  hint: "Account Anti-DDoS posture + public targets in this region." },
  { id: "audit",           label: "Audit log",           regional: false, hint: "Cloud Audit tracks. Account-global." },
];

function SecurityScanView() {
  const [tab, setTab] = useState<ScanTab>("public-exposure");
  const active = SCAN_TABS.find((t) => t.id === tab)!;
  const { region } = useRegion();

  return (
    <section>
      <PageHeader
        title="Security scan"
        subtitle="Ten built-in audits — pick one, run it, fix the findings. SSL, CAM, WAF and Audit are account-global; the rest use the active region."
      />

      <div className="bg-surface border border-line rounded-md shadow-card mb-5">
        <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-line">
          {SCAN_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "px-3 py-1.5 rounded text-sm transition " +
                (tab === t.id
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-ink-muted hover:bg-surface-3 hover:text-ink")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 text-xs text-ink-muted flex items-center gap-2">
          <IconInfo className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
          {active.hint}
          {active.regional && (
            <>
              <span className="text-ink-faint">·</span>
              <span>
                region <span className="font-mono text-ink">{region}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {tab === "public-exposure" && <PublicCVMExposureSection />}
      {tab === "clb"             && <CLBExposureSection />}
      {tab === "eip"             && <IdleEIPSection />}
      {tab === "cbs"             && <UnencryptedCBSSection />}
      {tab === "ssl"             && <CertExpirySection />}
      {tab === "cam"             && <CAMHygieneSection />}
      {tab === "db"              && <DBExposureSection />}
      {tab === "waf"             && <WAFCoverageSection />}
      {tab === "ddos"            && <AntiDDoSCoverageSection />}
      {tab === "audit"           && <AuditCoverageSection />}
    </section>
  );
}

function ScanRunButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="mb-4">
      <Button onClick={onClick} disabled={loading}>
        {loading ? "Running…" : "Run scan"}
      </Button>
    </div>
  );
}

function PublicCVMExposureSection() {
  const { region } = useRegion();
  const [items, setItems] = useState<ExposedCVM[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setItems(null);
    const r = await getPublicExposure(region);
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setItems(r.data.items ?? []);
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && <Empty intent="ok" message="No publicly-exposed sensitive ports in this region." />}
      {items && items.length > 0 && (
        <div className="space-y-4">
          <CountPill count={items.length} intent="bad" label="CVM(s) with public exposure on sensitive ports" />
          {items.map((cvm) => (
            <Card key={cvm.instance_id} className="border-l-4 border-l-bad">
              <div className="flex items-baseline flex-wrap gap-3 mb-3">
                <span className="font-semibold">{cvm.name || cvm.instance_id}</span>
                <MutedCode>{cvm.instance_id}</MutedCode>
                <KV label="public"><Code>{cvm.public_ip}</Code></KV>
                <span className="text-xs">
                  <span className="text-ink-subtle">state:</span>{" "}
                  <StatusBadge intent={cvm.state === "RUNNING" ? "ok" : "neutral"}>{cvm.state}</StatusBadge>
                </span>
              </div>
              <TableWrap>
                <Thead>
                  <tr><Th>SG</Th><Th>Proto</Th><Th>Port</Th><Th>Source</Th><Th>Risk</Th><Th>Description</Th></tr>
                </Thead>
                <Tbody>
                  {cvm.risky_rules.map((r, i) => (
                    <Tr key={i} risk>
                      <Td mono>{r.sg_id}</Td>
                      <Td mono>{r.protocol ?? "-"}</Td>
                      <Td mono>{r.port ?? "-"}</Td>
                      <Td mono>{r.source ?? "-"}</Td>
                      <Td><Tag intent="bad">{r.risk}</Tag></Td>
                      <Td>{r.description ?? "-"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </TableWrap>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function CLBExposureSection() {
  const { region } = useRegion();
  const [items, setItems] = useState<CLBExposureItem[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setItems(null);
    const r = await getCLBExposure(region);
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setItems(r.data.items ?? []);
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && <Empty intent="ok" message="No public-facing CLBs in this region." />}
      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((lb) => (
            <Card key={lb.lb_id} className={lb.risky_count > 0 ? "border-l-4 border-l-bad" : ""}>
              <div className="flex items-baseline flex-wrap gap-3 mb-3">
                <span className="font-semibold">{lb.name || lb.lb_id}</span>
                <MutedCode>{lb.lb_id}</MutedCode>
                <KV label="type">{lb.type}</KV>
                <KV label="VIPs"><Code>{(lb.vips ?? []).join(", ") || "-"}</Code></KV>
                {lb.risky_count > 0 && (
                  <Tag intent="bad">{lb.risky_count} risky listener{lb.risky_count === 1 ? "" : "s"}</Tag>
                )}
              </div>
              {lb.listeners && lb.listeners.length > 0 && (
                <TableWrap>
                  <Thead>
                    <tr><Th>Listener</Th><Th>Proto</Th><Th>Port</Th><Th>Risk</Th></tr>
                  </Thead>
                  <Tbody>
                    {lb.listeners.map((l) => (
                      <Tr key={l.listener_id} risk={!!l.risk}>
                        <Td>{l.name || l.listener_id}</Td>
                        <Td mono>{l.protocol}</Td>
                        <Td mono>{l.port}</Td>
                        <Td>{l.risk ? <Tag intent="bad">{l.risk}</Tag> : <span className="text-ink-faint">—</span>}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </TableWrap>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function IdleEIPSection() {
  const { region } = useRegion();
  const [items, setItems] = useState<IdleEIPItem[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setItems(null);
    const r = await getIdleEIPs(region);
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setItems(r.data.items ?? []);
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && <Empty intent="ok" message="No idle (UNBIND) EIPs in this region." />}
      {items && items.length > 0 && (
        <div>
          <div className="mb-3">
            <CountPill count={items.length} intent="warn" label="EIP(s) unbound — paying without serving traffic" />
          </div>
          <TableWrap>
            <Thead>
              <tr><Th>EIP ID</Th><Th>Name</Th><Th>IP</Th><Th>Status</Th><Th>Type</Th><Th>Created</Th></tr>
            </Thead>
            <Tbody>
              {items.map((e) => (
                <Tr key={e.id}>
                  <Td mono>{e.id}</Td>
                  <Td>{e.name ?? "-"}</Td>
                  <Td mono>{e.ip}</Td>
                  <Td><StatusBadge intent="warn">{e.status}</StatusBadge></Td>
                  <Td>{e.type ?? "-"}</Td>
                  <Td className="text-ink-muted">{e.created_at ?? "-"}</Td>
                </Tr>
              ))}
            </Tbody>
          </TableWrap>
        </div>
      )}
    </>
  );
}

function UnencryptedCBSSection() {
  const { region } = useRegion();
  const [items, setItems] = useState<UnencryptedCBSItem[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setItems(null);
    const r = await getUnencryptedCBS(region);
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setItems(r.data.items ?? []);
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && <Empty intent="ok" message="All CBS volumes in this region are encrypted." />}
      {items && items.length > 0 && (
        <div>
          <div className="mb-3">
            <CountPill count={items.length} intent="bad" label="unencrypted CBS volume(s)" />
          </div>
          <TableWrap>
            <Thead>
              <tr><Th>Disk ID</Th><Th>Name</Th><Th>Type</Th><Th>Size GB</Th><Th>State</Th><Th>Instance</Th><Th>Zone</Th></tr>
            </Thead>
            <Tbody>
              {items.map((d) => (
                <Tr key={d.id} risk={!d.unattached}>
                  <Td mono>{d.id}</Td>
                  <Td>{d.name ?? "-"}</Td>
                  <Td>{d.type}</Td>
                  <Td mono>{d.size_gb}</Td>
                  <Td>
                    <StatusBadge intent={d.unattached ? "warn" : "bad"}>{d.state}</StatusBadge>
                    {d.unattached && <Tag intent="warn">unattached</Tag>}
                  </Td>
                  <Td mono>{d.instance_id ?? "-"}</Td>
                  <Td>{d.zone ?? "-"}</Td>
                </Tr>
              ))}
            </Tbody>
          </TableWrap>
        </div>
      )}
    </>
  );
}

function CertExpirySection() {
  const [days, setDays] = useState(30);
  const [items, setItems] = useState<ExpiringCert[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setItems(null);
    const r = await getCertExpiry(days);
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setItems(r.data.items ?? []);
  }
  return (
    <>
      <Toolbar>
        <Field label="Days threshold">
          <TextInput
            type="number"
            value={String(days)}
            onChange={(v) => setDays(parseInt(v) || 30)}
            className="w-28"
          />
        </Field>
        <div className="ml-auto">
          <Button onClick={run} disabled={loading}>
            {loading ? "Running…" : "Run scan"}
          </Button>
        </div>
      </Toolbar>
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && <Empty intent="ok" message={`No SSL certificates expire within ${days} days.`} />}
      {items && items.length > 0 && (
        <div>
          <div className="mb-3">
            <CountPill count={items.length} intent="bad" label="certificate(s) need attention" />
          </div>
          <TableWrap>
            <Thead>
              <tr><Th>Cert ID</Th><Th>Alias</Th><Th>Domain</Th><Th>Status</Th><Th>Expires</Th><Th>Days left</Th></tr>
            </Thead>
            <Tbody>
              {items.map((c) => {
                const intent = c.days_left < 0 ? "bad" : c.days_left < 14 ? "bad" : "warn";
                return (
                  <Tr key={c.id} risk={c.days_left < 14}>
                    <Td mono>{c.id}</Td>
                    <Td>{c.alias ?? "-"}</Td>
                    <Td mono>{c.domain ?? "-"}</Td>
                    <Td>{c.status}</Td>
                    <Td className="text-ink-muted">{c.cert_end ?? "-"}</Td>
                    <Td>
                      <Tag intent={intent}>
                        {c.days_left < 0 ? `EXPIRED ${-c.days_left}d` : `${c.days_left}d`}
                      </Tag>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </TableWrap>
        </div>
      )}
    </>
  );
}

function CAMHygieneSection() {
  const [data, setData] = useState<{ total_users: number; items: CAMHygieneItem[] } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setData(null);
    const r = await getCAMHygiene();
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setData(r.data);
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {data && data.items.length === 0 && (
        <Empty intent="ok" message={`All ${data.total_users} CAM user(s) have phone + email registered.`} />
      )}
      {data && data.items.length > 0 && (
        <div>
          <div className="mb-3">
            <CountPill
              count={data.items.length}
              intent="bad"
              label={`of ${data.total_users} CAM user(s) have hygiene findings`}
            />
          </div>
          <TableWrap>
            <Thead>
              <tr><Th>UID</Th><Th>Name</Th><Th>Email</Th><Th>Console</Th><Th>Phone set</Th><Th>Findings</Th></tr>
            </Thead>
            <Tbody>
              {data.items.map((u) => (
                <Tr key={u.uid} risk>
                  <Td mono>{u.uid}</Td>
                  <Td>{u.name}</Td>
                  <Td className="text-ink-muted">{u.email || "-"}</Td>
                  <Td>
                    <StatusBadge intent={u.console_login ? "bad" : "ok"}>
                      {u.console_login ? "yes" : "no"}
                    </StatusBadge>
                  </Td>
                  <Td>
                    <StatusBadge intent={u.phone_registered ? "ok" : "bad"}>
                      {u.phone_registered ? "yes" : "no"}
                    </StatusBadge>
                  </Td>
                  <Td><span className="text-xs">{u.findings.join(", ")}</span></Td>
                </Tr>
              ))}
            </Tbody>
          </TableWrap>
        </div>
      )}
    </>
  );
}

function DBExposureSection() {
  const { region } = useRegion();
  const [items, setItems] = useState<DBExposureFinding[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setItems(null);
    const r = await getDBExposure(region);
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setItems(r.data.items ?? []);
  }
  function engineTag(e: string) {
    return <Tag intent={
      e === "redis" ? "bad" :
      e === "mysql" ? "warn" :
      e === "postgres" ? "info" :
      e === "mongo" || e === "mongodb" ? "ok" : "neutral"
    }>{e}</Tag>;
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && (
        <Empty intent="ok" message="No managed databases reachable from the public internet in this region." />
      )}
      {items && items.length > 0 && (
        <div>
          <div className="mb-3">
            <CountPill count={items.length} intent="bad" label="database(s) reachable from the public internet" />
          </div>
          <TableWrap>
            <Thead>
              <tr><Th>Engine</Th><Th>ID</Th><Th>Name</Th><Th>Status</Th><Th>Public addr</Th><Th>Reason</Th></tr>
            </Thead>
            <Tbody>
              {items.map((d) => (
                <Tr key={d.engine + ":" + d.id} risk>
                  <Td>{engineTag(d.engine)}</Td>
                  <Td mono>{d.id}</Td>
                  <Td>{d.name ?? "-"}</Td>
                  <Td>{d.status}</Td>
                  <Td><Code>{d.public_addr}</Code></Td>
                  <Td className="text-ink-muted">{d.reason}</Td>
                </Tr>
              ))}
            </Tbody>
          </TableWrap>
        </div>
      )}
    </>
  );
}

function WAFCoverageSection() {
  const [data, setData] = useState<WAFCoverageResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setData(null);
    const r = await getWAFCoverage();
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setData(r.data);
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {data && data.items.length === 0 && data.waf_protected.length === 0 && (
        <Empty message="No CDN/EdgeOne domains found AND no WAF hosts configured — nothing to audit." />
      )}
      {data && data.items.length === 0 && data.waf_protected.length > 0 && (
        <Empty intent="ok" message={`All CDN/EdgeOne domains are covered by WAF (${data.waf_protected.length} protected hosts).`} />
      )}
      {data && data.items.length > 0 && (
        <div>
          <div className="mb-3">
            <CountPill count={data.items.length} intent="bad" label="domain(s) lack WAF coverage" />
          </div>
          <TableWrap>
            <Thead>
              <tr><Th>Domain</Th><Th>Source</Th></tr>
            </Thead>
            <Tbody>
              {data.items.map((it, i) => (
                <Tr key={i} risk>
                  <Td mono>{it.domain}</Td>
                  <Td className="text-ink-muted">{it.source}</Td>
                </Tr>
              ))}
            </Tbody>
          </TableWrap>
          <div className="mt-3 text-xs text-ink-subtle">
            WAF-protected hosts: <span className="font-mono text-ink-muted">{data.waf_protected.join(", ") || "(none)"}</span>
          </div>
        </div>
      )}
    </>
  );
}

function AntiDDoSCoverageSection() {
  const { region } = useRegion();
  const [data, setData] = useState<AntiDDoSCoverageResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setData(null);
    const r = await getAntiDDoSCoverage(region);
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setData(r.data);
  }
  function postureIntent(p: string): "ok" | "warn" | "bad" {
    if (p === "BASIC_ONLY") return "bad";
    if (p.startsWith("ADVANCED")) return "ok";
    return "warn";
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {data && (
        <div className="space-y-4">
          <Card>
            <SectionLabel>Account posture</SectionLabel>
            <div className="flex items-center gap-2 mb-2">
              <StatusDot intent={postureIntent(data.posture)} />
              <span className="text-lg font-semibold">{data.posture}</span>
            </div>
            <p className="text-sm text-ink-muted">
              {data.posture === "BASIC_ONLY" && "All public IPs rely on the free Anti-DDoS Basic tier (~2Gbps protection per IP). For higher-risk workloads, consider Anti-DDoS Advanced or Anti-DDoS Pro subscriptions."}
              {data.posture === "MIXED" && `Account has ${data.advanced_instances?.length ?? 0} Anti-DDoS Advanced instance(s). Verify each high-risk public target below is bound to an Advanced instance.`}
              {data.posture === "ADVANCED_SUBSCRIBED_NO_PUBLIC" && "Account has Advanced Anti-DDoS subscriptions but no public-facing resources in this region."}
            </p>
            {data.advanced_instances && data.advanced_instances.length > 0 && (
              <div className="mt-3 text-xs">
                <span className="text-ink-subtle">Advanced instances: </span>
                <Code>{data.advanced_instances.join(", ")}</Code>
              </div>
            )}
          </Card>
          {data.public_targets.length > 0 && (
            <div>
              <div className="text-sm text-ink-muted mb-2">
                <span className="font-medium text-ink">{data.public_targets.length}</span> public-facing target(s) in {data.region}
              </div>
              <TableWrap>
                <Thead>
                  <tr><Th>Kind</Th><Th>ID</Th><Th>Name</Th><Th>Public IP</Th></tr>
                </Thead>
                <Tbody>
                  {data.public_targets.map((t) => (
                    <Tr key={t.kind + ":" + t.id} risk={!data.has_advanced}>
                      <Td><Tag>{t.kind}</Tag></Td>
                      <Td mono>{t.id}</Td>
                      <Td>{t.name ?? "-"}</Td>
                      <Td><Code>{t.public_ip}</Code></Td>
                    </Tr>
                  ))}
                </Tbody>
              </TableWrap>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function AuditCoverageSection() {
  const [data, setData] = useState<AuditCoverageResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setErr(""); setData(null);
    const r = await getAuditCoverage();
    setLoading(false);
    if (!r.ok) { setErr(`${r.code}: ${r.message}`); return; }
    setData(r.data);
  }
  function postureIntent(p: string): "ok" | "warn" | "bad" {
    if (p === "NO_TRACKS" || p === "ALL_DISABLED") return "bad";
    if (p === "PARTIAL") return "warn";
    return "ok";
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {data && (
        <div className="space-y-4">
          <Card>
            <SectionLabel>Audit posture</SectionLabel>
            <div className="flex items-center gap-2 mb-2">
              <StatusDot intent={postureIntent(data.posture)} />
              <span className="text-lg font-semibold">{data.posture}</span>
            </div>
            <p className="text-sm text-ink-muted">
              {data.posture === "NO_TRACKS" && "No Cloud Audit tracks configured. API calls against this account are NOT logged. Configure a track with a COS bucket destination to enable forensics."}
              {data.posture === "ALL_DISABLED" && `${data.disabled_count} track(s) exist but all are disabled. Enable at least one to capture API calls.`}
              {data.posture === "PARTIAL" && `${data.enabled_count} of ${data.enabled_count + data.disabled_count} tracks are enabled.`}
              {data.posture === "FULL" && `All ${data.enabled_count} track(s) are enabled.`}
            </p>
          </Card>
          {data.tracks.length > 0 && (
            <TableWrap>
              <Thead>
                <tr><Th>Name</Th><Th>Enabled</Th><Th>COS bucket</Th><Th>Prefix</Th></tr>
              </Thead>
              <Tbody>
                {data.tracks.map((t, i) => (
                  <Tr key={i} risk={!t.enabled}>
                    <Td>{t.name}</Td>
                    <Td>
                      <StatusBadge intent={t.enabled ? "ok" : "bad"}>{t.enabled ? "yes" : "no"}</StatusBadge>
                    </Td>
                    <Td mono>{t.cos_bucket ?? "-"}</Td>
                    <Td className="text-ink-muted">{t.log_prefix ?? "-"}</Td>
                  </Tr>
                ))}
              </Tbody>
            </TableWrap>
          )}
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Monitoring view
// ───────────────────────────────────────────────────────────────────────────

type MonitorProduct = "cvm" | "lighthouse";

const PRODUCT_METRICS: Record<MonitorProduct, { value: string; label: string }[]> = {
  cvm: [
    { value: "CPUUsage",      label: "CPU usage (%)" },
    { value: "MemUsage",      label: "Memory usage (%)" },
    { value: "LanOuttraffic", label: "LAN out traffic" },
    { value: "LanIntraffic",  label: "LAN in traffic" },
    { value: "WanOuttraffic", label: "WAN out traffic" },
    { value: "WanIntraffic",  label: "WAN in traffic" },
  ],
  lighthouse: [
    { value: "CpuUsage",             label: "CPU usage (%)" },
    { value: "MemUsage",             label: "Memory usage (%)" },
    { value: "DiskUsage",            label: "Disk usage (%)" },
    { value: "CpuLoad1",             label: "CPU load (1m avg)" },
    { value: "CpuLoad5",             label: "CPU load (5m avg)" },
    { value: "LighthouseIntraffic",  label: "Public in traffic" },
    { value: "LighthouseOuttraffic", label: "Public out traffic" },
    { value: "LighthouseInpkg",      label: "Public in packets" },
    { value: "LighthouseOutpkg",     label: "Public out packets" },
  ],
};

function MonitoringView() {
  const { region } = useRegion();
  const [product, setProduct] = useState<MonitorProduct>("cvm");
  const [metric, setMetric] = useState<string>("CPUUsage");
  const [items, setItems] = useState<CVMMetricItem[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Keep the metric in sync when switching product — Lighthouse rejects
  // CVM's metric names (and vice versa) so the dropdown must rebase.
  function switchProduct(next: MonitorProduct) {
    setProduct(next);
    setMetric(PRODUCT_METRICS[next][0].value);
    setItems(null);
    setErr("");
  }

  async function run() {
    setLoading(true); setErr("");
    const r =
      product === "cvm"
        ? await getCVMMetrics(region, metric, 60)
        : await getLighthouseMetrics(region, metric, 60);
    setLoading(false);
    if (!r.ok) {
      setErr(`${r.code}: ${r.message}`);
      return;
    }
    setItems(r.data.items ?? []);
  }

  useEffect(() => { void run(); /* eslint-disable-next-line */ }, [region, metric, product]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void run(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [autoRefresh, region, metric, product]);

  function utilIntent(v?: number): "ok" | "warn" | "bad" | "neutral" {
    if (v == null) return "neutral";
    if (v > 80) return "bad";
    if (v > 50) return "warn";
    return "ok";
  }

  const isUtilMetric = /Usage|Load/i.test(metric);
  const camMissingHint = err.toLowerCase().includes("unauthorized operation");

  return (
    <section>
      <PageHeader
        title="Monitoring"
        subtitle="Live Cloud Monitor metrics for CVM and Lighthouse instances. Window: last 60 minutes, one sample per minute. Toggle auto-refresh for a 30-second poll."
        actions={
          <Button onClick={() => void run()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        }
      />

      {/* Product picker */}
      <div className="bg-surface border border-line rounded-md shadow-card mb-5">
        <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-line">
          {([
            ["cvm",        "CVM"],
            ["lighthouse", "Lighthouse"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => switchProduct(id)}
              className={
                "px-3 py-1.5 rounded text-sm transition " +
                (product === id
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-ink-muted hover:bg-surface-3 hover:text-ink")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 text-xs text-ink-muted flex items-center gap-2">
          <IconInfo className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
          {product === "cvm"
            ? "Standard CVM instances. Namespace QCE/CVM, dimension InstanceId."
            : "Tencent Lighthouse (lightweight cloud server). Namespace QCE/LIGHTHOUSE, dimension instanceid. Some metrics need the in-guest monitor agent."}
        </div>
      </div>

      <Toolbar>
        <Field label="Region"><RegionSelectInline /></Field>
        <Field label="Metric">
          <Select value={metric} onChange={setMetric}>
            {PRODUCT_METRICS[product].map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-brand-500"
          />
          <span>auto-refresh (30s)</span>
        </label>
      </Toolbar>

      {err && (
        <div className="space-y-2 mb-4">
          <ErrorBox message={err} />
          {camMissingHint && (
            <div className="bg-warn/5 border border-warn/30 rounded px-3 py-2 text-xs text-ink flex items-start gap-2">
              <IconAlert className="w-3.5 h-3.5 mt-0.5 text-warn shrink-0" />
              <span>
                Tencent's "unauthorized operation" on Cloud Monitor usually means the
                CAM policy attached to this SecretId lacks{" "}
                <Code>monitor:GetMonitorData</Code> for the{" "}
                <Code>QCE/{product === "cvm" ? "CVM" : "LIGHTHOUSE"}</Code> namespace.
                Grant <Code>QcloudMonitorReadOnlyAccess</Code> (or a finer-grained
                equivalent) and try again — no code change needed.
              </span>
            </div>
          )}
        </div>
      )}

      {items && items.length === 0 && !err && (
        <Empty
          message={`No ${product === "cvm" ? "CVMs" : "Lighthouse instances"} in this region (or no data points returned).`}
        />
      )}

      {items && items.length > 0 && (
        <TableWrap>
          <Thead>
            <tr>
              <Th>Instance</Th><Th>Name</Th>
              <Th className="text-right">Latest</Th>
              <Th className="text-right">Min</Th>
              <Th className="text-right">Avg</Th>
              <Th className="text-right">Max</Th>
              <Th className="text-right">Samples</Th>
            </tr>
          </Thead>
          <Tbody>
            {items.map((it) => (
              <Tr key={it.instance_id}>
                <Td mono>{it.instance_id}</Td>
                <Td>{it.name ?? "-"}</Td>
                <Td mono className="text-right">
                  {isUtilMetric ? (
                    <StatusBadge intent={utilIntent(it.latest)}>
                      {it.latest != null ? it.latest.toFixed(2) : "-"}
                    </StatusBadge>
                  ) : (
                    <>{it.latest != null ? it.latest.toFixed(2) : "-"}</>
                  )}
                </Td>
                <Td mono className="text-right">{it.min != null ? it.min.toFixed(2) : "-"}</Td>
                <Td mono className="text-right">{it.avg != null ? it.avg.toFixed(2) : "-"}</Td>
                <Td mono className="text-right">{it.max != null ? it.max.toFixed(2) : "-"}</Td>
                <Td mono className="text-right text-ink-muted">{it.samples}</Td>
              </Tr>
            ))}
          </Tbody>
        </TableWrap>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Cost Explorer view
// ───────────────────────────────────────────────────────────────────────────

function CostExplorerView() {
  const now = new Date();
  const defaultMonth =
    now.getUTCFullYear() + "-" + String(now.getUTCMonth() + 1).padStart(2, "0");
  const [month, setMonth] = useState(defaultMonth);
  const [products, setProducts] = useState<{ total: number; summary?: CostSummary; items: ProductCost[] } | null>(null);
  const [resources, setResources] = useState<ResourceCost[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true); setErr("");
    setProducts(null); setResources(null);
    const [p, rsr] = await Promise.all([
      getCostByProduct(month),
      getCostResources(month, 50),
    ]);
    setLoading(false);
    if (!p.ok) { setErr(`${p.code}: ${p.message}`); return; }
    setProducts({ total: p.data.total, summary: p.data.summary, items: p.data.items ?? [] });
    if (rsr.ok) setResources(rsr.data.items ?? []);
  }

  useEffect(() => { void run(); /* eslint-disable-next-line */ }, []);

  const maxProduct = products && products.items.length > 0
    ? Math.max(...products.items.map((p) => p.real_cost))
    : 0;

  return (
    <section>
      <PageHeader
        title="Cost Explorer"
        subtitle="Tencent Cloud billing summary by service and top resources by spend. All amounts are RealCost (post-discount) in your account currency."
        actions={
          <Button onClick={() => void run()} disabled={loading}>
            {loading ? "Loading…" : "Fetch"}
          </Button>
        }
      />

      <Toolbar>
        <Field label="Month">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-surface border border-line rounded px-2.5 py-1.5 text-sm text-ink hover:border-line-strong focus:border-brand-500 transition"
          />
        </Field>
        {products && (
          <div className="ml-auto flex items-baseline gap-2">
            <span className="text-xs text-ink-subtle uppercase tracking-wider">
              {products.summary ? "Cash paid (incl. tax)" : "Total"}
            </span>
            <span className="font-mono text-2xl font-semibold text-brand-600">
              {(products.summary?.cash_incl_tax ?? products.total).toFixed(2)}
            </span>
          </div>
        )}
      </Toolbar>

      {err && <ErrorBox message={err} />}

      {products?.summary &&
        (products.summary.consumption > 0 || products.summary.cash_incl_tax > 0) && (
        <Card className="mb-6 max-w-md">
          <SectionLabel>Billing waterfall — {month}</SectionLabel>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Consumption (RealCost)</span>
              <span className="font-mono tabular-nums">{products.summary.consumption.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ink-subtle">
              <span>&minus; Voucher</span>
              <span className="font-mono tabular-nums">{products.summary.voucher.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-1">
              <span className="text-ink-muted">= Cash before tax</span>
              <span className="font-mono tabular-nums">{products.summary.cash_before_tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ink-subtle">
              <span>+ Tax</span>
              <span className="font-mono tabular-nums">{products.summary.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold">
              <span>= Cash paid (incl. tax)</span>
              <span className="font-mono tabular-nums text-brand-600">{products.summary.cash_incl_tax.toFixed(2)}</span>
            </div>
          </div>
          {products.summary.note && (
            <div className="mt-2 text-xs text-warn">{products.summary.note}</div>
          )}
          <div className="mt-2 text-[11px] text-ink-subtle">
            Consumption is total spend (vouchers + cash). Cash paid is what
            actually left your account — matches the Tencent console headline.
          </div>
        </Card>
      )}

      {products && products.items.length === 0 && (
        <Empty message={`No billing data for ${month}. Check that the month has closed or pick an earlier month.`} />
      )}

      {products && products.items.length > 0 && (
        <Card className="mb-6">
          <SectionLabel>By service</SectionLabel>
          <div className="space-y-2">
            {products.items
              .slice()
              .sort((a, b) => b.real_cost - a.real_cost)
              .map((p) => (
                <div key={p.code || p.name} className="flex items-center gap-3 text-sm">
                  <div className="w-44 shrink-0 truncate text-ink" title={p.name}>{p.name}</div>
                  <div className="flex-1 bg-surface-3 rounded h-5 overflow-hidden relative">
                    <div
                      className="h-full bg-brand-500/80 rounded"
                      style={{ width: maxProduct ? `${(p.real_cost / maxProduct) * 100}%` : "0%" }}
                    />
                  </div>
                  <div className="w-32 text-right tabular-nums font-mono text-[12.5px] text-ink">
                    {p.real_cost.toFixed(2)}
                    {p.ratio && <span className="ml-1.5 text-ink-subtle">({p.ratio}%)</span>}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {resources && resources.length > 0 && (
        <div>
          <SectionLabel>Top resources by spend</SectionLabel>
          <TableWrap>
            <Thead>
              <tr><Th>Product</Th><Th>Resource ID</Th><Th>Name</Th><Th>Region</Th><Th>Pay mode</Th><Th className="text-right">Cost</Th></tr>
            </Thead>
            <Tbody>
              {resources
                .slice()
                .sort((a, b) => b.cost - a.cost)
                .map((r, i) => (
                  <Tr key={i}>
                    <Td>{r.product}</Td>
                    <Td mono>{r.resource_id}</Td>
                    <Td>{r.name || "-"}</Td>
                    <Td>{r.region || "-"}</Td>
                    <Td>{r.pay_mode || "-"}</Td>
                    <Td mono className="text-right">{r.cost.toFixed(4)}</Td>
                  </Tr>
                ))}
            </Tbody>
          </TableWrap>
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// SG audit view
// ───────────────────────────────────────────────────────────────────────────

function SGAuditView() {
  const { region } = useRegion();
  const [sgID, setSGID] = useState("");
  const [data, setData] = useState<{ rules: SGRule[]; risky_count: number } | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function audit() {
    if (!sgID.trim()) {
      setErr("SG ID is required");
      return;
    }
    setLoading(true);
    setErr("");
    setData(null);
    const r = await getSGRules(sgID.trim(), region);
    setLoading(false);
    if (!r.ok) {
      setErr(`${r.code}: ${r.message}`);
      return;
    }
    setData({ rules: r.data.rules ?? [], risky_count: r.data.risky_count });
  }

  return (
    <section>
      <PageHeader
        title="Security group audit"
        subtitle="Inspect every rule on a single SG. Risky rules (e.g. 0.0.0.0/0 on sensitive ports) are flagged."
      />

      <Toolbar>
        <Field label="SG ID">
          <TextInput
            placeholder="sg-xxxxxxxx"
            value={sgID}
            onChange={setSGID}
            className="w-56"
          />
        </Field>
        <Field label="Region"><RegionSelectInline /></Field>
        <div className="ml-auto">
          <Button onClick={() => void audit()} disabled={loading}>
            {loading ? "Auditing…" : "Audit"}
          </Button>
        </div>
      </Toolbar>

      {err && <ErrorBox message={err} />}
      {data && (
        <>
          <div className="mb-3 flex items-center gap-5 text-sm">
            <CountPill count={data.rules.length} label="rule(s)" />
            <CountPill
              count={data.risky_count}
              intent={data.risky_count > 0 ? "bad" : "ok"}
              label="risky"
            />
          </div>
          <TableWrap>
            <Thead>
              <tr>
                <Th>Dir</Th><Th>Idx</Th><Th>Proto</Th><Th>Port</Th>
                <Th>Source</Th><Th>Action</Th><Th>Description</Th><Th>Risk</Th>
              </tr>
            </Thead>
            <Tbody>
              {data.rules.map((r, i) => (
                <Tr key={i} risk={!!r.risk}>
                  <Td>{r.direction}</Td>
                  <Td mono>{r.index}</Td>
                  <Td mono>{r.protocol ?? "-"}</Td>
                  <Td mono>{r.port ?? "-"}</Td>
                  <Td mono>{r.source ?? "-"}</Td>
                  <Td>{r.action}</Td>
                  <Td className="text-ink-muted">{r.description ?? "-"}</Td>
                  <Td>{r.risk ? <Tag intent="bad">{r.risk}</Tag> : <span className="text-ink-faint">—</span>}</Td>
                </Tr>
              ))}
            </Tbody>
          </TableWrap>
        </>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Maker view
// ───────────────────────────────────────────────────────────────────────────

function MakerView() {
  const [planText, setPlanText] = useState<string>(
    JSON.stringify(
      {
        version: 1,
        provider: "tencent",
        question: "(use Generate above or paste a plan here)",
        summary: "",
        commands: [],
      },
      null,
      2,
    ),
  );
  const [destroyer, setDestroyer] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<{
    cmds: number;
    destructive: number;
    provider: string;
    paramErrors: ParamError[];
    placeholderIssues: PlaceholderIssue[];
    planError?: string;
  } | null>(null);

  const [prompt, setPrompt] = useState<string>(
    "Create a tiny test security group in ap-singapore called clanker-dash-test, with one ingress rule allowing TCP/9443 from 10.99.0.0/16. No CVMs, no VPCs, just the SG.",
  );
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState<string>("");
  const [genMeta, setGenMeta] = useState<{ model?: string; ai_profile?: string; duration: string } | null>(null);

  function reparse(text: string) {
    setPlanText(text);
    let p: unknown;
    try {
      p = JSON.parse(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "parse error";
      setParsed({
        cmds: 0, destructive: 0, provider: "?",
        paramErrors: [], placeholderIssues: [],
        planError: msg,
      });
      return;
    }
    const plan = p as { provider?: unknown; commands?: unknown };
    const cmds: Array<{ args?: unknown[]; produces?: unknown }> = Array.isArray(plan?.commands)
      ? (plan.commands as Array<{ args?: unknown[]; produces?: unknown }>)
      : [];
    let destructive = 0;
    const paramErrors: ParamError[] = [];
    const placeholderIssues: PlaceholderIssue[] = [];
    const produced = new Set<string>(); // accumulates produces keys across commands

    // Server regex (Go): /<([A-Z0-9_]+)>/ — placeholders must be UPPERCASE.
    const okPlaceholderRe = /<([A-Z0-9_]+)>/g;
    const jsonEscPlaceholderRe = /\\u003[cC]([A-Z0-9_]+)\\u003[eE]/g;
    // Common LLM misformats that won't get substituted on the server.
    const wrongSyntaxRe = /\{\{[A-Za-z_][\w.]*\}\}|\$\{[A-Za-z_][\w.]*\}|<[a-z][\w]*>/g;

    cmds.forEach((c, i) => {
      const args = Array.isArray(c?.args) ? c.args : [];
      const kind = String(args[0] ?? "");
      const service = String(args[1] ?? "");
      const action = String(args[2] ?? "");
      if (/^(Terminate|Delete|Destroy|Reset|Release|Discontinue)/.test(action)) {
        destructive++;
      }
      // Validate params JSON (args[4]) for tencent-api commands.
      if (kind === "tencent-api" && typeof args[4] === "string" && args[4].trim() !== "") {
        try {
          JSON.parse(args[4]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "parse error";
          const m = msg.match(/position (\d+)/);
          paramErrors.push({
            index: i + 1, service, action, message: msg,
            position: m ? parseInt(m[1], 10) : undefined,
            snippet: m ? snippetAround(args[4] as string, parseInt(m[1], 10)) : undefined,
          });
        }
      }

      // Concat all string args for placeholder scanning.
      const argsAsString = args
        .filter((a): a is string => typeof a === "string")
        .join(" ");

      // Find well-formed placeholders this command references.
      const refs = new Set<string>();
      okPlaceholderRe.lastIndex = 0;
      for (let m; (m = okPlaceholderRe.exec(argsAsString)); ) refs.add(m[1]);
      jsonEscPlaceholderRe.lastIndex = 0;
      for (let m; (m = jsonEscPlaceholderRe.exec(argsAsString)); ) refs.add(m[1]);
      for (const name of refs) {
        if (!produced.has(name)) {
          placeholderIssues.push({
            index: i + 1, service, action,
            kind: "undefined",
            detail: `<${name}>`,
            hint: `No earlier command declares it. Add to an earlier command's "produces": { "${name}": "$.Response.<FieldName>" }`,
          });
        }
      }

      // Find misformatted placeholders (won't substitute, will fail later).
      wrongSyntaxRe.lastIndex = 0;
      const seenWrong = new Set<string>();
      for (let m; (m = wrongSyntaxRe.exec(argsAsString)); ) {
        if (seenWrong.has(m[0])) continue;
        seenWrong.add(m[0]);
        placeholderIssues.push({
          index: i + 1, service, action,
          kind: "wrong_syntax",
          detail: m[0],
          hint: "Server only substitutes <UPPERCASE_NAME>. Rewrite this placeholder and declare it via produces on an earlier command.",
        });
      }

      // Detect literal "PLACEHOLDER_*" / "TODO_*" / "FILL_*" strings — common
      // Qwen3 mistake where the model writes a stand-in instead of using the
      // <NAME> binding syntax. They look like data but they're junk values
      // that will be sent verbatim to Tencent.
      const literalStubRe = /\b(PLACEHOLDER_[A-Z0-9_]+|TODO_FILL_IN|FILL_ME_IN|REPLACE_ME)\b/g;
      const seenStubs = new Set<string>();
      for (let m; (m = literalStubRe.exec(argsAsString)); ) {
        if (seenStubs.has(m[0])) continue;
        seenStubs.add(m[0]);
        placeholderIssues.push({
          index: i + 1, service, action,
          kind: "wrong_syntax",
          detail: m[0],
          hint: "Literal stand-in string — Tencent will receive it as-is and reject the call. Replace with a real value or with a <UPPERCASE> placeholder backed by produces on an earlier command.",
        });
      }

      // Known LLM-invented action names. Mirrored from server-side
      // knownHallucinatedActions in internal/tencent/raw.go — keeping the two
      // in sync gives the user a friendly warning in the Review pane plus a
      // hard fail at execute time.
      const HALLUCINATED: Record<string, string> = {
        "monitor.GetProductMetricData":   "Use GetMonitorData. No such Monitor action.",
        "monitor.DescribeMonitorData":    "Use GetMonitorData.",
        "monitor.GetProductMetrics":      "Use GetMonitorData or DescribeBaseMetrics.",
        "monitor.DescribeMetricData":     "Use GetMonitorData.",
        "monitor.DescribeAlarmPolicies":  "Use DescribeAlarmPolicy (singular).",
        "billing.DescribeBillSummary":    "Use DescribeBillSummaryByProduct / ByPayMode / ByRegion.",
        "billing.DescribeResourceBills":  "Use DescribeBillResourceSummary or DescribeBillDetail.",
        "cvm.DescribeInstanceState":      "Use DescribeInstancesStatus.",
        "cvm.ListInstances":              "Use DescribeInstances (Tencent uses Describe*, never List*).",
        "vpc.ListVpcs":                   "Use DescribeVpcs.",
      };
      const key = `${service}.${action}`;
      if (HALLUCINATED[key]) {
        placeholderIssues.push({
          index: i + 1, service, action,
          kind: "wrong_syntax",
          detail: key,
          hint: HALLUCINATED[key],
        });
      }

      // Soft shape checks on the params JSON (when it parses): catch wrong
      // time formats and the mis-shaped Dimensions object the LLM often
      // emits for Cloud Monitor calls.
      if (
        kind === "tencent-api" &&
        typeof args[4] === "string" &&
        args[4].trim() !== ""
      ) {
        try {
          const parsedParams = JSON.parse(args[4]);
          if (parsedParams && typeof parsedParams === "object") {
            for (const field of ["StartTime", "EndTime"] as const) {
              const v = (parsedParams as Record<string, unknown>)[field];
              if (typeof v === "number") {
                placeholderIssues.push({
                  index: i + 1, service, action,
                  kind: "wrong_syntax",
                  detail: `${field}=${v}`,
                  hint: `${field} must be an RFC3339 UTC string like "2026-05-16T13:00:00Z". Tencent's Monitor API rejects numeric / relative-offset values.`,
                });
              }
            }
            // dimensions (lowercase) is the wrong shape — should be
            // Dimensions: [{Name: ..., Value: ...}, ...].
            const inst = (parsedParams as { Instances?: unknown }).Instances;
            if (Array.isArray(inst)) {
              for (const entry of inst) {
                if (
                  entry &&
                  typeof entry === "object" &&
                  "dimensions" in (entry as object) &&
                  !("Dimensions" in (entry as object))
                ) {
                  placeholderIssues.push({
                    index: i + 1, service, action,
                    kind: "wrong_syntax",
                    detail: 'Instances[].dimensions',
                    hint: 'Wrong shape. Tencent expects: "Dimensions": [{"Name":"InstanceId","Value":"ins-xxx"}] (PascalCase, array of {Name,Value}).',
                  });
                  break;
                }
              }
            }
          }
        } catch {
          // params JSON parse already reported in paramErrors; skip.
        }
      }

      // After scanning refs, register this command's produces keys for use by later commands.
      const produces = (c as { produces?: Record<string, unknown> })?.produces;
      if (produces && typeof produces === "object" && !Array.isArray(produces)) {
        for (const key of Object.keys(produces)) {
          if (!/^[A-Z0-9_]+$/.test(key)) {
            placeholderIssues.push({
              index: i + 1, service, action,
              kind: "bad_produces_key",
              detail: `produces.${key}`,
              hint: `Rename to ${key.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}. Placeholder lookups only match [A-Z0-9_].`,
            });
          } else {
            produced.add(key);
          }
        }
      }
    });

    setParsed({
      cmds: cmds.length,
      destructive,
      provider: String(plan?.provider ?? "?"),
      paramErrors,
      placeholderIssues,
    });
  }

  useEffect(() => {
    reparse(planText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runGenerate() {
    if (!prompt.trim()) {
      setGenErr("Question is required");
      return;
    }
    setGenLoading(true);
    setGenErr("");
    setGenMeta(null);
    const r = await generatePlan(prompt.trim(), destroyer);
    setGenLoading(false);
    if (!r.ok) {
      setGenErr(`${r.code}: ${r.message}`);
      return;
    }
    const planJSON = JSON.stringify(r.data.plan, null, 2);
    reparse(planJSON);
    setGenMeta({ model: r.data.model, ai_profile: r.data.ai_profile, duration: r.data.duration });
  }

  async function runApply() {
    let plan: unknown;
    try {
      plan = JSON.parse(planText);
    } catch (e: unknown) {
      setErr("Plan is not valid JSON: " + (e instanceof Error ? e.message : "parse error"));
      return;
    }
    if (parsed && parsed.paramErrors.length > 0) {
      setErr(
        `${parsed.paramErrors.length} command(s) have malformed params JSON. ` +
          "Fix them in the Review pane above before applying.",
      );
      return;
    }
    if (parsed && parsed.placeholderIssues.length > 0) {
      setErr(
        `${parsed.placeholderIssues.length} placeholder issue(s). ` +
          "Fix them in the Review pane above before applying.",
      );
      return;
    }
    setLoading(true);
    setErr("");
    setResult(null);
    const r = await applyPlan(plan, destroyer);
    setLoading(false);
    if (!r.ok) {
      setErr(`${r.code}: ${r.message}`);
      return;
    }
    setResult(r.data);
  }

  return (
    <section className="max-w-4xl">
      <PageHeader
        title="Maker"
        subtitle="Generate a plan from natural language, review the JSON below, then Apply. Destructive operations require the destroyer toggle."
      />

      {/* Step 1: Generate */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>1 · Generate</SectionLabel>
          {genMeta && (
            <span className="text-xs text-ink-muted flex items-center gap-2">
              <StatusDot intent="ok" />
              model <Code>{genMeta.model ?? "?"}</Code>
              <span className="text-ink-faint">·</span>
              profile <Code>{genMeta.ai_profile ?? "?"}</Code>
              <span className="text-ink-faint">·</span>
              <span className="font-mono">{genMeta.duration}</span>
            </span>
          )}
        </div>
        <textarea
          className="w-full h-24 bg-surface-2 border border-line rounded p-2.5 text-sm text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-brand-500 transition resize-y"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the infra change in natural language…"
          spellCheck={true}
        />
        <div className="mt-3 flex items-center justify-between">
          <Button onClick={() => void runGenerate()} disabled={genLoading}>
            {genLoading ? "Generating…" : "Generate plan"}
          </Button>
        </div>
        {genErr && <div className="mt-3"><ErrorBox message={genErr} /></div>}
      </Card>

      {/* Step 2: Review */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>2 · Review</SectionLabel>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-ink-muted">commands <Code>{parsed?.cmds ?? "?"}</Code></span>
            <span className="text-ink-muted">
              destructive{" "}
              <span className={"font-mono " + ((parsed?.destructive ?? 0) > 0 ? "text-bad" : "text-ok")}>
                {parsed?.destructive ?? "?"}
              </span>
            </span>
            <span className="text-ink-muted">
              invalid params{" "}
              <span className={"font-mono " + ((parsed?.paramErrors.length ?? 0) > 0 ? "text-bad" : "text-ok")}>
                {parsed?.paramErrors.length ?? 0}
              </span>
            </span>
            <span className="text-ink-muted">
              placeholder issues{" "}
              <span className={"font-mono " + ((parsed?.placeholderIssues.length ?? 0) > 0 ? "text-bad" : "text-ok")}>
                {parsed?.placeholderIssues.length ?? 0}
              </span>
            </span>
            <span className="text-ink-muted">provider <Code>{parsed?.provider ?? "?"}</Code></span>
          </div>
        </div>
        <textarea
          className={
            "w-full h-72 bg-surface-3 border rounded p-3 font-mono text-xs text-ink resize-y focus:border-brand-500 " +
            (parsed?.planError ||
            (parsed?.paramErrors.length ?? 0) > 0 ||
            (parsed?.placeholderIssues.length ?? 0) > 0
              ? "border-bad/50"
              : "border-line")
          }
          value={planText}
          onChange={(e) => reparse(e.target.value)}
          spellCheck={false}
        />

        {parsed?.planError && (
          <div className="mt-3">
            <ErrorBox message={`Plan JSON is invalid: ${parsed.planError}`} />
          </div>
        )}

        {parsed && parsed.paramErrors.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-ink-muted">
              <span className="text-bad font-medium">{parsed.paramErrors.length}</span> command(s)
              have malformed params JSON. Fix them above before applying:
            </div>
            {parsed.paramErrors.map((pe, i) => (
              <div
                key={i}
                className="bg-bad/5 border border-bad/30 border-l-4 border-l-bad rounded px-3 py-2 text-xs"
              >
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <Tag intent="bad">#{pe.index}</Tag>
                  <Code>{pe.service}.{pe.action}</Code>
                  {pe.position != null && (
                    <span className="text-ink-subtle">at char {pe.position}</span>
                  )}
                </div>
                <div className="text-ink">{pe.message}</div>
                {pe.snippet && (
                  <div className="mt-1.5 font-mono text-[11.5px] text-ink-muted bg-surface-3 border border-line rounded px-2 py-1 break-all">
                    {pe.snippet}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {parsed && parsed.placeholderIssues.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs text-ink-muted">
              <span className="text-bad font-medium">{parsed.placeholderIssues.length}</span> placeholder
              issue(s). Server only substitutes <Code>&lt;UPPERCASE_NAME&gt;</Code> when an earlier
              command declares it via <Code>produces</Code>.
            </div>
            {parsed.placeholderIssues.map((pi, i) => {
              const label =
                pi.kind === "undefined"        ? "undefined placeholder" :
                pi.kind === "wrong_syntax"     ? "wrong placeholder syntax" :
                                                  "bad produces key";
              return (
                <div
                  key={i}
                  className="bg-bad/5 border border-bad/30 border-l-4 border-l-bad rounded px-3 py-2 text-xs"
                >
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <Tag intent="bad">#{pi.index}</Tag>
                    <Code>{pi.service}.{pi.action}</Code>
                    <span className="text-ink-subtle">{label}</span>
                    <Code>{pi.detail}</Code>
                  </div>
                  <div className="text-ink-muted">{pi.hint}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Step 3: Apply */}
      <Card>
        <SectionLabel>3 · Apply</SectionLabel>
        <div className="flex items-start justify-between gap-4">
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={destroyer}
              onChange={(e) => setDestroyer(e.target.checked)}
              className="mt-0.5 accent-bad"
            />
            <span>
              <span className="font-medium text-ink">Destroyer mode</span>
              <span className="block text-xs text-ink-muted mt-0.5">
                Required for <Code>Terminate*</Code> / <Code>Delete*</Code> / <Code>Reset*</Code> operations.
              </span>
            </span>
          </label>
          <Button
            variant={destroyer ? "danger" : "primary"}
            onClick={() => void runApply()}
            disabled={
              loading ||
              !!parsed?.planError ||
              (parsed?.paramErrors.length ?? 0) > 0 ||
              (parsed?.placeholderIssues.length ?? 0) > 0
            }
          >
            {loading ? "Applying…" : destroyer ? "Apply (destroyer)" : "Apply"}
          </Button>
        </div>
        {err && <div className="mt-4"><ErrorBox message={err} /></div>}
        {result && (
          <div className="mt-5">
            <div className="text-sm mb-2 flex items-center gap-4">
              <StatusBadge intent={result.status === "ok" ? "ok" : "bad"}>{result.status}</StatusBadge>
              <span className="text-ink-muted text-xs">duration <Code>{result.duration}</Code></span>
            </div>
            {result.error && <ErrorBox message={result.error} />}
            <pre className="bg-surface-3 border border-line rounded p-3 mt-3 text-xs text-ink overflow-x-auto whitespace-pre-wrap break-all">
              {result.output ? formatApplyOutput(result.output) : "(no output)"}
            </pre>
          </div>
        )}
      </Card>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Activity view
// ───────────────────────────────────────────────────────────────────────────

function ActivityView() {
  const [items, setItems] = useState<ApplyRecord[] | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  async function fetchHistory() {
    setLoading(true);
    setErr("");
    const r = await getMakerHistory(50);
    setLoading(false);
    if (!r.ok) {
      setErr(`${r.code}: ${r.message}`);
      return;
    }
    setItems(r.data);
  }

  useEffect(() => {
    void fetchHistory();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void fetchHistory(), 5000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section>
      <PageHeader
        title="Activity"
        subtitle="In-memory record of recent applies made through this server (newest first, capped at 50). Clears when the server restarts."
        actions={
          <Button onClick={() => void fetchHistory()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <Toolbar>
        <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-brand-500"
          />
          <span>auto-refresh (5s)</span>
        </label>
        {items && (
          <span className="ml-auto text-xs text-ink-subtle">
            {items.length} record{items.length === 1 ? "" : "s"}
          </span>
        )}
      </Toolbar>

      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && (
        <Empty message="No applies recorded yet. Generate + apply a plan in Maker to see it here." />
      )}
      {items && items.length > 0 && (
        <div className="space-y-2">
          {items.map((r) => (
            <div
              key={r.id}
              className={
                "bg-surface border rounded-md overflow-hidden shadow-card " +
                (r.status === "error" ? "border-bad/40 border-l-4 border-l-bad" : "border-line")
              }
            >
              <button
                onClick={() => toggle(r.id)}
                className="w-full text-left px-4 py-3 hover:bg-surface-2 transition"
              >
                <div className="flex items-baseline gap-3 flex-wrap">
                  <MutedCode>#{r.id}</MutedCode>
                  <span className="text-xs text-ink-muted">{formatTimestamp(r.started_at)}</span>
                  <StatusBadge intent={r.status === "ok" ? "ok" : "bad"}>
                    {r.status === "ok" ? "ok" : "error"}
                  </StatusBadge>
                  {r.destroyer && <Tag intent="bad">destroyer</Tag>}
                  <span className="text-xs text-ink-muted">
                    {r.command_count} cmd{r.command_count === 1 ? "" : "s"}
                  </span>
                  {r.destructive_count > 0 && (
                    <span className="text-xs text-bad font-medium">{r.destructive_count} destructive</span>
                  )}
                  <span className="text-xs text-ink-muted font-mono">{r.duration}</span>
                  <span className="text-xs text-ink truncate ml-auto max-w-md">
                    {r.summary || r.question || "(no summary)"}
                  </span>
                </div>
                {r.error && (
                  <div className="mt-1 text-xs text-bad break-all">{r.error}</div>
                )}
              </button>
              {expanded.has(r.id) && (
                <div className="px-4 pb-4 border-t border-line bg-surface-2">
                  {r.question && (
                    <div className="mt-3 text-xs">
                      <span className="text-ink-subtle">question:</span>{" "}
                      <span className="text-ink">{r.question}</span>
                    </div>
                  )}
                  <div className="mt-3 text-xs text-ink-subtle">output:</div>
                  <pre className="bg-surface-3 border border-line rounded p-3 mt-1 text-xs text-ink overflow-x-auto whitespace-pre-wrap">
                    {r.output ? formatApplyOutput(r.output) : "(no output)"}
                  </pre>
                  {r.output_truncated && (
                    <div className="text-xs text-warn mt-1">
                      output truncated server-side at 16 KiB
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Settings view
// ───────────────────────────────────────────────────────────────────────────

function SettingsView({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState(getApiUrl());
  const [token, setToken] = useState(getApiToken());
  const [savedAt, setSavedAt] = useState<string>("");

  function save() {
    setApiUrl(url.trim());
    setApiToken(token.trim());
    setSavedAt(new Date().toLocaleTimeString());
    onSaved();
  }

  return (
    <section className="max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="These values are stored in your browser only (localStorage) and never sent anywhere except the API server below."
      />

      <Card>
        <div className="space-y-5">
          <Field label="API base URL">
            <TextInput
              value={url}
              onChange={setUrl}
              placeholder="http://127.0.0.1:47180"
            />
          </Field>
          <Field label="Bearer token (matches clanker server --token)">
            <input
              className="bg-surface border border-line rounded px-2.5 py-1.5 text-sm text-ink font-mono placeholder:text-ink-faint hover:border-line-strong focus:border-brand-500 transition"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token here"
              type="password"
            />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={save}>Save</Button>
            {savedAt && (
              <span className="text-sm text-ok flex items-center gap-1.5">
                <IconCheck className="w-3.5 h-3.5" /> Saved at {savedAt}
              </span>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Dynamic table (Resources view)
// ───────────────────────────────────────────────────────────────────────────

const MONO_HINT_KEYS = /(_id|^id$|^arn$|ip$|cidr|domain|hash|sha|hex|uuid)/i;

function DynamicTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Array.from(
    rows.reduce((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>()),
  );
  return (
    <TableWrap>
      <Thead>
        <tr>
          {cols.map((c) => (
            <Th key={c}>{c}</Th>
          ))}
        </tr>
      </Thead>
      <Tbody>
        {rows.map((row, i) => (
          <Tr key={i}>
            {cols.map((c) => (
              <Td key={c} mono={c !== "tags" && MONO_HINT_KEYS.test(c)}>
                {renderCell(c, row[c])}
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </TableWrap>
  );
}

// renderCell decides between rich rendering (tags → chips, lists → joined,
// objects → JSON pretty-string) and plain text. Tags get a dedicated chip
// view so users can scan them visually instead of parsing JSON.
function renderCell(col: string, v: unknown): React.ReactNode {
  if (v == null) return "-";
  if (col === "tags" && v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-ink-faint">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {entries.map(([k, val]) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-brand-100 bg-brand-50 text-brand-700"
            title={`${k}=${String(val)}`}
          >
            <span className="font-medium">{k}</span>
            <span className="text-brand-700/70">=</span>
            <span className="font-mono">{String(val)}</span>
          </span>
        ))}
      </div>
    );
  }
  return formatCell(v);
}

function formatCell(v: unknown): string {
  if (v == null) return "-";
  if (Array.isArray(v)) return v.join(", ") || "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ───────────────────────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

type ParamError = {
  index: number;     // 1-based command position
  service: string;
  action: string;
  message: string;
  position?: number; // char offset into the params JSON string
  snippet?: string;  // ~30-char window around the error site
};

type PlaceholderIssue = {
  index: number;     // 1-based command position
  service: string;
  action: string;
  kind: "undefined" | "wrong_syntax" | "bad_produces_key";
  detail: string;    // e.g. "<VPC_ID>", "{{vpc_id}}", "produces.vpc_id"
  hint: string;
};

function snippetAround(s: string, pos: number, radius = 18): string {
  const start = Math.max(0, pos - radius);
  const end = Math.min(s.length, pos + radius);
  const head = start > 0 ? "…" : "";
  const tail = end < s.length ? "…" : "";
  return head + s.slice(start, end).replace(/\n/g, "\\n") + tail;
}

function formatApplyOutput(out: string): string {
  return out
    .split(/\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("{") || t.startsWith("[")) {
        try {
          return JSON.stringify(JSON.parse(t), null, 2);
        } catch {
          return line;
        }
      }
      return line;
    })
    .join("\n");
}

// ───────────────────────────────────────────────────────────────────────────
// Inline SVG icons (tiny, stroke-only, no extra dep)
// ───────────────────────────────────────────────────────────────────────────

const sv = (d: string, cls = "") => (
  <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

function IconBox(cls = "")      { return sv("M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8", cls); }
function IconNetwork(cls = "")  { return sv("M9 6h6M6 12h12M9 18h6M9 6V4M15 6V4M6 12v-2M18 12v-2M9 18v2M15 18v2", cls); }
function IconShield(cls = "")   { return sv("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", cls); }
function IconLock(cls = "")     { return sv("M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4", cls); }
function IconActivity(cls = "") { return sv("M22 12h-4l-3 9L9 3l-3 9H2", cls); }
function IconList(cls = "")     { return sv("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", cls); }
function IconCoin(cls = "")     { return sv("M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", cls); }
function IconWand(cls = "")     { return sv("M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5", cls); }
function IconGear(cls = "")     { return sv("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z", cls); }
function IconGlobe({ className = "" }: { className?: string }) { return sv("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20", className); }
function IconCloud({ className = "" }: { className?: string }) { return sv("M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 1 0-.001-10Z", className); }
function IconAlert({ className = "" }: { className?: string })  { return sv("M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z", className); }
function IconInfo({ className = "" }: { className?: string })   { return sv("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01", className); }
function IconCheck({ className = "" }: { className?: string })  { return sv("M20 6 9 17l-5-5", className); }
function IconInbox({ className = "" }: { className?: string })  { return sv("M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z", className); }

// ───────────────────────────────────────────────────────────────────────────
// Re-exports so api.ts types stay in scope
// ───────────────────────────────────────────────────────────────────────────

export type { ApiResult, SGRule };
