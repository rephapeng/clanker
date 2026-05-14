import { useEffect, useState } from "react";
import {
  ApiResult,
  ApplyResult,
  SGRule,
  applyPlan,
  getApiToken,
  getApiUrl,
  getHealth,
  getRegions,
  getResources,
  getSGRules,
  getVersion,
  setApiToken,
  setApiUrl,
} from "./api";

type View = "resources" | "sg-audit" | "maker" | "settings";

const RESOURCE_TYPES = [
  "cvm",
  "vpc",
  "sg",
  "mysql",
  "postgres",
  "cos",
  "tke",
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
          <NavBtn label="SG audit" active={view === "sg-audit"} onClick={() => setView("sg-audit")} />
          <NavBtn label="Maker" active={view === "maker"} onClick={() => setView("maker")} />
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
        {view === "sg-audit" && <SGAuditView key={"sg-" + refreshKey} />}
        {view === "maker" && <MakerView key={"maker-" + refreshKey} />}
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

function ResourcesView() {
  const [type, setType] = useState("cvm");
  const [region, setRegion] = useState("ap-singapore");
  const [regions, setRegions] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await getRegions();
      if (r.ok) setRegions(r.data);
    })();
  }, []);

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
          <select
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {regions.length === 0 && <option value={region}>{region}</option>}
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <button
          onClick={() => void fetchRows()}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded text-sm font-medium"
          disabled={loading}
        >
          {loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      {err && <Error message={err} />}
      {rows && rows.length === 0 && <Empty message="No resources of this type in the selected region." />}
      {rows && rows.length > 0 && <DynamicTable rows={rows} />}
    </section>
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

      {err && <Error message={err} />}
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
        question: "delete clanker-maker-test SG (paste your own plan here)",
        summary: "(replace this with a plan generated by `clanker ask --tencent --maker \"...\"`)",
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
        Paste a plan generated by{" "}
        <code className="bg-slate-800 px-1.5 py-0.5 rounded">clanker ask --tencent --maker "..."</code> and
        apply it from the browser. Destructive operations require the destroyer toggle.
      </p>

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

      <div className="mt-4 flex items-center gap-4">
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

      {err && <div className="mt-4"><Error message={err} /></div>}

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
          {result.error && <Error message={result.error} />}
          <pre className="bg-slate-900 border border-slate-800 rounded p-3 mt-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
            {result.output || "(no output)"}
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
          placeholder="http://127.0.0.1:8080"
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

function Error({ message }: { message: string }) {
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
export type { ApiResult, SGRule };
