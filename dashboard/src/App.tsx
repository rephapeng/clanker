import { useEffect, useState } from "react";
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

type View =
  | "resources"
  | "topology"
  | "security-scan"
  | "sg-audit"
  | "maker"
  | "activity"
  | "settings";

const RESOURCE_TYPES = [
  "cvm",
  "vpc",
  "sg",
  "mysql",
  "postgres",
  "cos",
  "tke",
  "clb",
  "eip",
  "cbs",
  "ssl",
  "cam",
  "redis",
  "mongodb",
  "cynosdb",
];

export default function App() {
  const [view, setView] = useState<View>("resources");
  const [serverInfo, setServerInfo] = useState<string>("checking...");
  // refreshKey is bumped by Settings save so views remount and re-run
  // their useEffect-driven fetches (regions list, etc).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void refreshServerInfo();
  }, []);

  async function refreshServerInfo() {
    const h = await getHealth();
    if (!h.ok) {
      setServerInfo(`unreachable (${h.message})`);
      return;
    }
    const v = await getVersion();
    setServerInfo(
      v.ok
        ? `up · uptime ${h.data.uptime} · clanker ${v.data.version}`
        : `up · uptime ${h.data.uptime} · version: ${v.message}`,
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
        <div className="text-lg font-semibold mb-1">Clanker</div>
        <div className="text-xs text-slate-400 mb-6">Tencent dashboard</div>
        <nav className="flex flex-col gap-1">
          <NavBtn label="Resources" active={view === "resources"} onClick={() => setView("resources")} />
          <NavBtn label="Topology" active={view === "topology"} onClick={() => setView("topology")} />
          <NavBtn label="Security scan" active={view === "security-scan"} onClick={() => setView("security-scan")} />
          <NavBtn label="SG audit" active={view === "sg-audit"} onClick={() => setView("sg-audit")} />
          <NavBtn label="Maker" active={view === "maker"} onClick={() => setView("maker")} />
          <NavBtn label="Activity" active={view === "activity"} onClick={() => setView("activity")} />
          <NavBtn label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
        </nav>
        <div className="mt-auto text-xs text-slate-500 pt-6 leading-relaxed">
          <div className="font-medium text-slate-400 mb-1">server</div>
          <div className="break-all">{serverInfo}</div>
          <button
            onClick={() => void refreshServerInfo()}
            className="mt-2 text-slate-300 hover:text-white underline"
          >
            refresh
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-x-auto">
        {view === "resources" && <ResourcesView key={"resources-" + refreshKey} />}
        {view === "topology" && <TopologyView key={"topology-" + refreshKey} />}
        {view === "security-scan" && <SecurityScanView key={"scan-" + refreshKey} />}
        {view === "sg-audit" && <SGAuditView key={"sg-" + refreshKey} />}
        {view === "maker" && <MakerView key={"maker-" + refreshKey} />}
        {view === "activity" && <ActivityView key={"activity-" + refreshKey} />}
        {view === "settings" && (
          <SettingsView
            onSaved={() => {
              void refreshServerInfo();
              setRefreshKey((k) => k + 1);
            }}
          />
        )}
      </main>
    </div>
  );
}

function NavBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "text-left px-3 py-2 rounded text-sm transition " +
        (active
          ? "bg-slate-700 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white")
      }
    >
      {label}
    </button>
  );
}

function useRegions() {
  const [regions, setRegions] = useState<string[]>([]);
  useEffect(() => {
    void (async () => {
      const r = await getRegions();
      if (r.ok) setRegions(r.data);
    })();
  }, []);
  return regions;
}

function RegionSelect({
  value,
  onChange,
  regions,
}: {
  value: string;
  onChange: (v: string) => void;
  regions: string[];
}) {
  return (
    <select
      className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {regions.length === 0 && <option value={value}>{value}</option>}
      {regions.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

function ResourcesView() {
  const [type, setType] = useState("cvm");
  const [region, setRegion] = useState("ap-singapore");
  const regions = useRegions();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function fetchRows() {
    setLoading(true);
    setErr("");
    setRows(null);
    const r = await getResources(type, region);
    setLoading(false);
    if (!r.ok) {
      setErr(`${r.code}: ${r.message}`);
      return;
    }
    setRows(r.data ?? []);
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold mb-4">Resources</h1>
      <div className="flex gap-3 items-end mb-6">
        <Field label="Type">
          <select
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
        </Field>
        <button
          onClick={() => void fetchRows()}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded text-sm font-medium"
          disabled={loading}
        >
          {loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      {err && <ErrorBox message={err} />}
      {rows && rows.length === 0 && <Empty message="No resources of this type in the selected region." />}
      {rows && rows.length > 0 && <DynamicTable rows={rows} />}
    </section>
  );
}

function TopologyView() {
  const [region, setRegion] = useState("ap-singapore");
  const regions = useRegions();
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

  // Group leaf resources by subnet/vpc for nested rendering.
  const groups = data ? groupTopology(data) : null;

  return (
    <section>
      <h1 className="text-2xl font-semibold mb-1">Topology</h1>
      <p className="text-slate-400 text-sm mb-6">
        VPC → subnet → instance/DB tree for a single region. SGs are region-global so they appear once at the bottom.
      </p>
      <div className="flex gap-3 items-end mb-6">
        <Field label="Region">
          <RegionSelect value={region} onChange={setRegion} regions={regions} />
        </Field>
        <button
          onClick={() => void fetchTopo()}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded text-sm font-medium"
          disabled={loading}
        >
          {loading ? "Loading..." : "Load topology"}
        </button>
      </div>

      {err && <ErrorBox message={err} />}
      {data && groups && (
        <div className="space-y-4">
          {data.warnings && data.warnings.length > 0 && (
            <div className="bg-amber-900/30 border border-amber-700 rounded px-3 py-2 text-xs text-amber-200">
              {data.warnings.length} warning(s): {data.warnings.slice(0, 3).join(" · ")}
            </div>
          )}

          {data.vpcs.map((vpc) => (
            <div key={vpc.id} className="border border-slate-700 rounded-lg p-4 bg-slate-900/40">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-semibold">{vpc.name || vpc.id}</span>
                <span className="font-mono text-xs text-slate-400">{vpc.id}</span>
                <span className="font-mono text-xs text-slate-500">{vpc.cidr}</span>
                {vpc.is_default && (
                  <span className="text-[10px] uppercase bg-slate-700 px-1.5 py-0.5 rounded">default</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groups.vpcSubnets.get(vpc.id)?.map((subnet) => (
                  <div key={subnet.id} className="border border-slate-800 rounded p-3 bg-slate-950/60">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-sm font-medium">{subnet.name || subnet.id}</span>
                      <span className="font-mono text-[10px] text-slate-500">{subnet.cidr}</span>
                      <span className="font-mono text-[10px] text-slate-500">{subnet.zone}</span>
                    </div>
                    <Chips items={groups.subnetCVMs.get(subnet.id) ?? []} kind="cvm" />
                  </div>
                )) ?? <div className="text-xs text-slate-500">no subnets</div>}
              </div>

              <DBRow vpcID={vpc.id} mysql={groups.vpcMySQL.get(vpc.id) ?? []} postgres={groups.vpcPostgres.get(vpc.id) ?? []} />
              <ClusterRow clusters={groups.vpcClusters.get(vpc.id) ?? []} />
            </div>
          ))}

          {(groups.orphanCVMs.length > 0 ||
            groups.orphanMySQL.length > 0 ||
            groups.orphanPostgres.length > 0 ||
            groups.orphanClusters.length > 0) && (
            <div className="border border-amber-800 rounded-lg p-4 bg-amber-950/20">
              <div className="font-semibold mb-2 text-amber-300">Orphaned (no VPC reference)</div>
              {groups.orphanCVMs.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs uppercase text-slate-400 mb-1">CVMs</div>
                  <Chips items={groups.orphanCVMs} kind="cvm" />
                </div>
              )}
              {groups.orphanMySQL.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs uppercase text-slate-400 mb-1">MySQL</div>
                  <Chips items={groups.orphanMySQL.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
                </div>
              )}
              {groups.orphanPostgres.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs uppercase text-slate-400 mb-1">Postgres</div>
                  <Chips items={groups.orphanPostgres.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
                </div>
              )}
              {groups.orphanClusters.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-slate-400 mb-1">TKE clusters</div>
                  <Chips items={groups.orphanClusters.map((c) => ({ id: c.id, name: c.name, state: c.status }))} kind="tke" />
                </div>
              )}
            </div>
          )}

          {data.security_groups.length > 0 && (
            <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/40">
              <div className="font-semibold mb-2">Security groups <span className="text-slate-400 font-normal text-sm">(region-global · {data.security_groups.length})</span></div>
              <div className="flex flex-wrap gap-2">
                {data.security_groups.map((sg) => (
                  <span key={sg.id} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs">
                    <span className="font-mono text-slate-400 mr-2">{sg.id}</span>
                    <span>{sg.name}</span>
                    {sg.is_default && <span className="text-[10px] uppercase bg-slate-700 px-1 py-0.5 rounded ml-2">default</span>}
                  </span>
                ))}
              </div>
            </div>
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
  if (items.length === 0) return <div className="text-xs text-slate-500">empty</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span
          key={it.id}
          className={
            "px-2 py-0.5 rounded text-[11px] font-mono border " +
            chipColor(kind, it.state)
          }
          title={`${it.id} (${it.state ?? ""})`}
        >
          {it.name || it.id}
        </span>
      ))}
    </div>
  );
}

function chipColor(kind: "cvm" | "db" | "tke", state?: string) {
  const running = state && /running|RUNNING/i.test(state);
  if (kind === "cvm")
    return running ? "border-emerald-700 bg-emerald-950/40 text-emerald-200" : "border-slate-700 bg-slate-800 text-slate-300";
  if (kind === "db") return "border-sky-700 bg-sky-950/40 text-sky-200";
  return "border-indigo-700 bg-indigo-950/40 text-indigo-200";
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
    <div className="mt-3 flex flex-wrap gap-3">
      {mysql.length > 0 && (
        <div>
          <div className="text-xs uppercase text-slate-400 mb-1">MySQL</div>
          <Chips items={mysql.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
        </div>
      )}
      {postgres.length > 0 && (
        <div>
          <div className="text-xs uppercase text-slate-400 mb-1">Postgres</div>
          <Chips items={postgres.map((m) => ({ id: m.id, name: m.name, state: m.status }))} kind="db" />
        </div>
      )}
    </div>
  );
}

function ClusterRow({ clusters }: { clusters: Topology["clusters"] }) {
  if (clusters.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs uppercase text-slate-400 mb-1">TKE clusters</div>
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

function SecurityScanView() {
  const [region, setRegion] = useState("ap-singapore");
  const regions = useRegions();
  const [tab, setTab] = useState<"public-exposure" | "clb" | "eip" | "cbs" | "ssl" | "cam" | "db">("public-exposure");

  return (
    <section>
      <h1 className="text-2xl font-semibold mb-1">Security scan</h1>
      <p className="text-slate-400 text-sm mb-6">
        Six built-in audits. Pick a tab, choose a region (if applicable), and Run.
        SSL + CAM audits are account-global and ignore the region selector.
      </p>

      <div className="flex gap-1 mb-6 flex-wrap">
        {([
          ["public-exposure", "Public CVM exposure"],
          ["clb", "CLB exposure"],
          ["eip", "Idle EIPs"],
          ["cbs", "Unencrypted CBS"],
          ["ssl", "Cert expiry"],
          ["cam", "CAM hygiene"],
          ["db", "DB exposure"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={
              "px-3 py-1.5 rounded text-sm transition " +
              (tab === id
                ? "bg-slate-700 text-white"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === "public-exposure" || tab === "clb" || tab === "eip" || tab === "cbs" || tab === "db") && (
        <div className="flex gap-3 items-end mb-6">
          <Field label="Region">
            <RegionSelect value={region} onChange={setRegion} regions={regions} />
          </Field>
        </div>
      )}

      {tab === "public-exposure" && <PublicCVMExposureSection region={region} />}
      {tab === "clb" && <CLBExposureSection region={region} />}
      {tab === "eip" && <IdleEIPSection region={region} />}
      {tab === "cbs" && <UnencryptedCBSSection region={region} />}
      {tab === "ssl" && <CertExpirySection />}
      {tab === "cam" && <CAMHygieneSection />}
      {tab === "db" && <DBExposureSection region={region} />}
    </section>
  );
}

function PublicCVMExposureSection({ region }: { region: string }) {
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
      {items && items.length === 0 && <Empty message="No publicly-exposed sensitive ports found in this region. ✓" />}
      {items && items.length > 0 && (
        <div className="space-y-4 mt-4">
          <div className="text-sm"><span className="text-rose-400 font-medium">{items.length}</span> CVM(s) have public exposure on sensitive ports.</div>
          {items.map((cvm) => (
            <div key={cvm.instance_id} className="border border-rose-800 rounded-lg p-4 bg-rose-950/20">
              <div className="flex items-baseline flex-wrap gap-3 mb-3">
                <span className="font-semibold">{cvm.name || cvm.instance_id}</span>
                <span className="font-mono text-xs text-slate-400">{cvm.instance_id}</span>
                <span className="text-xs"><span className="text-slate-400">public:</span> <span className="font-mono">{cvm.public_ip}</span></span>
                <span className="text-xs"><span className="text-slate-400">state:</span> <span className={cvm.state === "RUNNING" ? "text-emerald-400" : "text-slate-300"}>{cvm.state}</span></span>
              </div>
              <table className="w-full text-xs">
                <thead className="text-left text-slate-400 border-b border-slate-800">
                  <tr><Th>SG</Th><Th>Proto</Th><Th>Port</Th><Th>Source</Th><Th>Risk</Th><Th>Description</Th></tr>
                </thead>
                <tbody>
                  {cvm.risky_rules.map((r, i) => (
                    <tr key={i} className="border-b border-slate-900">
                      <Td>{r.sg_id}</Td><Td>{r.protocol ?? "-"}</Td><Td>{r.port ?? "-"}</Td><Td>{r.source ?? "-"}</Td>
                      <Td><span className="text-rose-400 font-medium">{r.risk}</span></Td><Td>{r.description ?? "-"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CLBExposureSection({ region }: { region: string }) {
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
      {items && items.length === 0 && <Empty message="No public-facing CLBs found in this region." />}
      {items && items.length > 0 && (
        <div className="space-y-3 mt-4">
          {items.map((lb) => (
            <div key={lb.lb_id} className={"border rounded-lg p-4 " + (lb.risky_count > 0 ? "border-rose-800 bg-rose-950/20" : "border-slate-800 bg-slate-900/40")}>
              <div className="flex items-baseline flex-wrap gap-3 mb-3">
                <span className="font-semibold">{lb.name || lb.lb_id}</span>
                <span className="font-mono text-xs text-slate-400">{lb.lb_id}</span>
                <span className="text-xs"><span className="text-slate-400">type:</span> {lb.type}</span>
                <span className="text-xs"><span className="text-slate-400">VIPs:</span> <span className="font-mono">{(lb.vips ?? []).join(", ") || "-"}</span></span>
                {lb.risky_count > 0 && <span className="text-xs text-rose-400">{lb.risky_count} risky listener(s)</span>}
              </div>
              {lb.listeners && lb.listeners.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-400 border-b border-slate-800">
                    <tr><Th>Listener</Th><Th>Proto</Th><Th>Port</Th><Th>Risk</Th></tr>
                  </thead>
                  <tbody>
                    {lb.listeners.map((l) => (
                      <tr key={l.listener_id} className={"border-b border-slate-900 " + (l.risk ? "bg-rose-950/40" : "")}>
                        <Td>{l.name || l.listener_id}</Td><Td>{l.protocol}</Td><Td>{l.port}</Td>
                        <Td>{l.risk ? <span className="text-rose-400 font-medium">{l.risk}</span> : <span className="text-slate-600">-</span>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function IdleEIPSection({ region }: { region: string }) {
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
      {items && items.length === 0 && <Empty message="No idle (UNBIND) EIPs in this region. ✓" />}
      {items && items.length > 0 && (
        <div className="mt-4">
          <div className="text-sm mb-3"><span className="text-amber-400 font-medium">{items.length}</span> EIP(s) are unbound (paying without serving traffic).</div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-800"><tr><Th>EIP_ID</Th><Th>Name</Th><Th>IP</Th><Th>Status</Th><Th>Type</Th><Th>Created</Th></tr></thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b border-slate-900 bg-amber-950/10">
                  <Td>{e.id}</Td><Td>{e.name ?? "-"}</Td><Td>{e.ip}</Td><Td>{e.status}</Td><Td>{e.type ?? "-"}</Td><Td>{e.created_at ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function UnencryptedCBSSection({ region }: { region: string }) {
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
      {items && items.length === 0 && <Empty message="All CBS volumes in this region are encrypted. ✓" />}
      {items && items.length > 0 && (
        <div className="mt-4">
          <div className="text-sm mb-3"><span className="text-rose-400 font-medium">{items.length}</span> unencrypted CBS volume(s).</div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-800"><tr><Th>Disk ID</Th><Th>Name</Th><Th>Type</Th><Th>Size GB</Th><Th>State</Th><Th>Instance</Th><Th>Zone</Th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className={"border-b border-slate-900 " + (d.unattached ? "bg-amber-950/20" : "bg-rose-950/10")}>
                  <Td>{d.id}</Td><Td>{d.name ?? "-"}</Td><Td>{d.type}</Td><Td>{d.size_gb}</Td>
                  <Td>{d.state}{d.unattached && <span className="ml-2 text-amber-400 text-[10px] uppercase">unattached</span>}</Td>
                  <Td>{d.instance_id ?? "-"}</Td><Td>{d.zone ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
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
      <div className="flex gap-3 items-end mb-6">
        <Field label="Days threshold">
          <input type="number" value={days} onChange={(e) => setDays(parseInt(e.target.value) || 30)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-24" />
        </Field>
        <ScanRunButton onClick={run} loading={loading} />
      </div>
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && <Empty message={`No SSL certificates expire within ${days} days. ✓`} />}
      {items && items.length > 0 && (
        <div className="mt-4">
          <div className="text-sm mb-3"><span className="text-rose-400 font-medium">{items.length}</span> certificate(s) need attention.</div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-800"><tr><Th>Cert ID</Th><Th>Alias</Th><Th>Domain</Th><Th>Status</Th><Th>Expires</Th><Th>Days left</Th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className={"border-b border-slate-900 " + (c.days_left < 0 ? "bg-rose-950/40" : c.days_left < 14 ? "bg-rose-950/20" : "bg-amber-950/10")}>
                  <Td>{c.id}</Td><Td>{c.alias ?? "-"}</Td><Td>{c.domain ?? "-"}</Td><Td>{c.status}</Td>
                  <Td>{c.cert_end ?? "-"}</Td>
                  <Td><span className={c.days_left < 0 ? "text-rose-400 font-medium" : c.days_left < 14 ? "text-rose-300" : "text-amber-300"}>{c.days_left < 0 ? `EXPIRED ${-c.days_left}d` : `${c.days_left}d`}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
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
      {data && data.items.length === 0 && <Empty message={`All ${data.total_users} CAM user(s) have phone + email registered. ✓`} />}
      {data && data.items.length > 0 && (
        <div className="mt-4">
          <div className="text-sm mb-3"><span className="text-rose-400 font-medium">{data.items.length}</span> of {data.total_users} CAM user(s) have hygiene findings.</div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-800"><tr><Th>UID</Th><Th>Name</Th><Th>Email</Th><Th>Console</Th><Th>Phone set</Th><Th>Findings</Th></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.uid} className="border-b border-slate-900 bg-rose-950/10">
                  <Td>{u.uid}</Td><Td>{u.name}</Td><Td>{u.email || "-"}</Td>
                  <Td>{u.console_login ? <span className="text-rose-400">yes</span> : <span className="text-emerald-400">no</span>}</Td>
                  <Td>{u.phone_registered ? <span className="text-emerald-400">yes</span> : <span className="text-rose-400">no</span>}</Td>
                  <Td><span className="text-xs">{u.findings.join(", ")}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}


function DBExposureSection({ region }: { region: string }) {
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
  function engineColor(e: string) {
    switch (e) {
      case "mysql":    return "border-amber-700 bg-amber-950/30 text-amber-200";
      case "postgres": return "border-sky-700 bg-sky-950/30 text-sky-200";
      case "redis":    return "border-rose-700 bg-rose-950/30 text-rose-200";
      case "mongo":
      case "mongodb":  return "border-emerald-700 bg-emerald-950/30 text-emerald-200";
      default:         return "border-slate-700 bg-slate-900 text-slate-300";
    }
  }
  return (
    <>
      <ScanRunButton onClick={run} loading={loading} />
      {err && <ErrorBox message={err} />}
      {items && items.length === 0 && <Empty message="No managed databases reachable from the public internet in this region. ✓" />}
      {items && items.length > 0 && (
        <div className="mt-4">
          <div className="text-sm mb-3"><span className="text-rose-400 font-medium">{items.length}</span> database(s) reachable from the public internet.</div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-800"><tr><Th>Engine</Th><Th>ID</Th><Th>Name</Th><Th>Status</Th><Th>Public addr</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.engine + ":" + d.id} className="border-b border-slate-900">
                  <Td><span className={"px-2 py-0.5 rounded text-[11px] font-mono border " + engineColor(d.engine)}>{d.engine}</span></Td>
                  <Td>{d.id}</Td><Td>{d.name ?? "-"}</Td><Td>{d.status}</Td><Td><span className="font-mono">{d.public_addr}</span></Td><Td>{d.reason}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ScanRunButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded text-sm font-medium">
      {loading ? "Running..." : "Run scan"}
    </button>
  );
}


function SGAuditView() {
  const [sgID, setSGID] = useState("");
  const [region, setRegion] = useState("ap-singapore");
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
      <h1 className="text-2xl font-semibold mb-4">Security group audit</h1>
      <div className="flex gap-3 items-end mb-6">
        <Field label="SG ID">
          <input
            placeholder="sg-xxxxxxxx"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-48"
            value={sgID}
            onChange={(e) => setSGID(e.target.value)}
          />
        </Field>
        <Field label="Region">
          <input
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-40"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </Field>
        <button
          onClick={() => void audit()}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded text-sm font-medium"
          disabled={loading}
        >
          {loading ? "Auditing..." : "Audit"}
        </button>
      </div>

      {err && <ErrorBox message={err} />}
      {data && (
        <>
          <div className="mb-3 text-sm">
            <span className="text-slate-400">Rules: </span>
            <span>{data.rules.length}</span>
            <span className="text-slate-400 ml-4">Risky: </span>
            <span className={data.risky_count > 0 ? "text-rose-400 font-medium" : "text-emerald-400"}>
              {data.risky_count}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-400 border-b border-slate-800">
                <tr>
                  <Th>Dir</Th>
                  <Th>Idx</Th>
                  <Th>Proto</Th>
                  <Th>Port</Th>
                  <Th>Source</Th>
                  <Th>Action</Th>
                  <Th>Description</Th>
                  <Th>Risk</Th>
                </tr>
              </thead>
              <tbody>
                {data.rules.map((r, i) => (
                  <tr
                    key={i}
                    className={
                      "border-b border-slate-900 " +
                      (r.risk ? "bg-rose-950/40" : "")
                    }
                  >
                    <Td>{r.direction}</Td>
                    <Td>{r.index}</Td>
                    <Td>{r.protocol ?? "-"}</Td>
                    <Td>{r.port ?? "-"}</Td>
                    <Td>{r.source ?? "-"}</Td>
                    <Td>{r.action}</Td>
                    <Td>{r.description ?? "-"}</Td>
                    <Td>
                      {r.risk ? (
                        <span className="text-rose-400 font-medium">{r.risk}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

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
  const [parsed, setParsed] = useState<{ cmds: number; destructive: number; provider: string } | null>(null);

  const [prompt, setPrompt] = useState<string>(
    "Create a tiny test security group in ap-singapore called clanker-dash-test, with one ingress rule allowing TCP/9443 from 10.99.0.0/16. No CVMs, no VPCs, just the SG.",
  );
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState<string>("");
  const [genMeta, setGenMeta] = useState<{ model?: string; ai_profile?: string; duration: string } | null>(null);

  function reparse(text: string) {
    setPlanText(text);
    try {
      const p = JSON.parse(text);
      const cmds: Array<{ args?: string[] }> = Array.isArray(p?.commands) ? p.commands : [];
      const destructive = cmds.filter((c) => {
        const action = c.args?.[2] ?? "";
        return /^(Terminate|Delete|Destroy|Reset|Release|Discontinue)/.test(action);
      }).length;
      setParsed({ cmds: cmds.length, destructive, provider: String(p?.provider ?? "?") });
    } catch {
      setParsed(null);
    }
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
      <h1 className="text-2xl font-semibold mb-1">Maker</h1>
      <p className="text-slate-400 text-sm mb-6">
        Generate a plan from a natural-language question, review the JSON below, then Apply. Destructive
        operations require the destroyer toggle.
      </p>

      <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/40 mb-6">
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">1. Generate</div>
        <textarea
          className="w-full h-24 bg-slate-900 border border-slate-700 rounded p-2 text-sm"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the infra change in natural language..."
          spellCheck={true}
        />
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={() => void runGenerate()}
            className="bg-sky-600 hover:bg-sky-500 px-4 py-1.5 rounded text-sm font-medium"
            disabled={genLoading}
          >
            {genLoading ? "Generating..." : "Generate plan"}
          </button>
          {genMeta && (
            <span className="text-xs text-slate-400">
              <span className="text-emerald-400 mr-2">✓</span>
              model=<span className="font-mono text-slate-300">{genMeta.model ?? "?"}</span>{" "}
              · profile=<span className="font-mono text-slate-300">{genMeta.ai_profile ?? "?"}</span>{" "}
              · {genMeta.duration}
            </span>
          )}
        </div>
        {genErr && <div className="mt-3"><ErrorBox message={genErr} /></div>}
      </div>

      <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">2. Review</div>
      <div className="mb-3 flex items-center gap-4 text-xs">
        <span>
          <span className="text-slate-400">commands:</span>{" "}
          <span className="font-mono">{parsed?.cmds ?? "?"}</span>
        </span>
        <span>
          <span className="text-slate-400">destructive:</span>{" "}
          <span className={"font-mono " + ((parsed?.destructive ?? 0) > 0 ? "text-rose-400" : "text-emerald-400")}>
            {parsed?.destructive ?? "?"}
          </span>
        </span>
        <span>
          <span className="text-slate-400">provider:</span>{" "}
          <span className="font-mono">{parsed?.provider ?? "?"}</span>
        </span>
      </div>

      <textarea
        className="w-full h-72 bg-slate-900 border border-slate-700 rounded p-3 font-mono text-xs"
        value={planText}
        onChange={(e) => reparse(e.target.value)}
        spellCheck={false}
      />

      <div className="text-xs uppercase tracking-wide text-slate-400 mt-6 mb-2">3. Apply</div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={destroyer}
            onChange={(e) => setDestroyer(e.target.checked)}
            className="accent-rose-500"
          />
          <span>
            destroyer mode (required for <code>Terminate*</code> / <code>Delete*</code> / <code>Reset*</code>)
          </span>
        </label>
        <button
          onClick={() => void runApply()}
          className={
            "px-4 py-1.5 rounded text-sm font-medium ml-auto " +
            (destroyer
              ? "bg-rose-600 hover:bg-rose-500"
              : "bg-emerald-600 hover:bg-emerald-500")
          }
          disabled={loading}
        >
          {loading ? "Applying..." : destroyer ? "Apply (destroyer)" : "Apply"}
        </button>
      </div>

      {err && <div className="mt-4"><ErrorBox message={err} /></div>}

      {result && (
        <div className="mt-6">
          <div className="text-sm mb-2 flex items-center gap-4">
            <span>
              <span className="text-slate-400">status:</span>{" "}
              <span className={result.status === "ok" ? "text-emerald-400" : "text-rose-400"}>{result.status}</span>
            </span>
            <span>
              <span className="text-slate-400">duration:</span>{" "}
              <span className="font-mono">{result.duration}</span>
            </span>
          </div>
          {result.error && <ErrorBox message={result.error} />}
          <pre className="bg-slate-900 border border-slate-800 rounded p-3 mt-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
            {result.output ? formatApplyOutput(result.output) : "(no output)"}
          </pre>
        </div>
      )}
    </section>
  );
}
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
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <p className="text-slate-400 text-sm mb-6">
        These values are stored in your browser only (localStorage). They are
        not sent anywhere except the API server below.
      </p>
      <Field label="API base URL">
        <input
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-full"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:47180"
        />
      </Field>
      <div className="h-4" />
      <Field label="Bearer token (matches clanker server --token)">
        <input
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 w-full font-mono"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="paste token here"
          type="password"
        />
      </Field>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded text-sm font-medium"
        >
          Save
        </button>
        {savedAt && <span className="text-emerald-400 text-sm">Saved at {savedAt}</span>}
      </div>
    </section>
  );
}

function DynamicTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Array.from(
    rows.reduce((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>()),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400 border-b border-slate-800">
          <tr>
            {cols.map((c) => (
              <Th key={c}>{c}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-900">
              {cols.map((c) => (
                <Td key={c}>{formatCell(row[c])}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "-";
  if (Array.isArray(v)) return v.join(", ") || "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pr-4 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-1.5 pr-4 align-top font-mono text-xs">{children}</td>;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-rose-900/30 border border-rose-700 rounded px-3 py-2 text-sm text-rose-200">
      {message}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="text-slate-400 text-sm">{message}</div>;
}

// Re-export so api.ts types stay in scope.
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
      <h1 className="text-2xl font-semibold mb-1">Activity</h1>
      <p className="text-slate-400 text-sm mb-6">
        In-memory record of recent applies made through this server (newest first, capped at 50).
        Clears when the server restarts.
      </p>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => void fetchHistory()}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded text-sm font-medium"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-emerald-500"
          />
          <span>auto-refresh (5s)</span>
        </label>
        {items && (
          <span className="text-xs text-slate-400 ml-auto">
            {items.length} record{items.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

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
                "border rounded-lg overflow-hidden " +
                (r.status === "error" ? "border-rose-800 bg-rose-950/20" : "border-slate-800 bg-slate-900/40")
              }
            >
              <button
                onClick={() => toggle(r.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-800/40 transition"
              >
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-xs text-slate-500">#{r.id}</span>
                  <span className="text-xs text-slate-400">{formatTimestamp(r.started_at)}</span>
                  <span
                    className={
                      "text-xs font-medium " +
                      (r.status === "ok" ? "text-emerald-400" : "text-rose-400")
                    }
                  >
                    {r.status === "ok" ? "✓ ok" : "✗ error"}
                  </span>
                  {r.destroyer && (
                    <span className="text-[10px] uppercase bg-rose-900/60 border border-rose-700 text-rose-200 px-1.5 py-0.5 rounded">
                      destroyer
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {r.command_count} cmd{r.command_count === 1 ? "" : "s"}
                  </span>
                  {r.destructive_count > 0 && (
                    <span className="text-xs text-rose-400">
                      {r.destructive_count} destructive
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{r.duration}</span>
                  <span className="text-xs text-slate-300 truncate">
                    {r.summary || r.question || "(no summary)"}
                  </span>
                </div>
                {r.error && (
                  <div className="mt-1 text-xs text-rose-300 break-all">{r.error}</div>
                )}
              </button>
              {expanded.has(r.id) && (
                <div className="px-4 pb-4 border-t border-slate-800/60">
                  {r.question && (
                    <div className="mt-3 text-xs">
                      <span className="text-slate-400">question:</span>{" "}
                      <span className="text-slate-200">{r.question}</span>
                    </div>
                  )}
                  <div className="mt-3 text-xs text-slate-400">output:</div>
                  <pre className="bg-slate-950/80 border border-slate-800 rounded p-3 mt-1 text-xs overflow-x-auto whitespace-pre-wrap">
                    {r.output ? formatApplyOutput(r.output) : "(no output)"}
                  </pre>
                  {r.output_truncated && (
                    <div className="text-xs text-amber-400 mt-1">
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

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function formatApplyOutput(out: string): string {
  // Lines emitted by ExecuteTencentPlan are either "[maker] ..." or a raw
  // JSON response from the Tencent SDK. Pretty-print the JSON ones so the
  // dashboard's <pre> isn't a single horizontal river of text.
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

export type { ApiResult, SGRule };
