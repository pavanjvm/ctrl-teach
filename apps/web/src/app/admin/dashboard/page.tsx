"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleDollarSign,
  Download,
  LogOut,
  Search,
  ShoppingBag,
  UserCheck,
  Users,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  ADMIN_ACTIONS,
  ADMIN_BOOTCAMPS,
  ADMIN_DOMAIN_INTERESTS,
  ADMIN_PERIODS,
  ADMIN_PLAN_METRICS,
  ADMIN_USERS,
  type AdminPeriodKey,
  type AdminUserRow,
} from "@/lib/admin/mockData";
import "../admin.css";

type UserFilter = "all" | "converted" | "bootcamp" | "high-intent";

function formatCurrency(value: number, compact = false): string {
  if (compact && value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function userMatchesFilter(user: AdminUserRow, filter: UserFilter): boolean {
  if (filter === "converted") return user.stage === "Paid subscriber" || user.stage === "Bootcamp buyer";
  if (filter === "bootcamp") return user.stage === "Bootcamp buyer";
  if (filter === "high-intent") return user.intent >= 85;
  return true;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [periodKey, setPeriodKey] = useState<AdminPeriodKey>("90d");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("All domains");

  useEffect(() => {
    if (!loading && !user?.isAdmin) router.replace("/admin/login");
  }, [loading, router, user]);

  const period = ADMIN_PERIODS[periodKey];
  const funnel = [
    { label: "Visited", value: period.visitors, rate: "100%" },
    { label: "Created account", value: period.signups, rate: percent(period.signups, period.visitors) },
    { label: "Completed onboarding", value: period.onboarded, rate: percent(period.onboarded, period.signups) },
    { label: "Activated trial", value: period.trials, rate: percent(period.trials, period.onboarded) },
    { label: "Purchased plan", value: period.paid, rate: percent(period.paid, period.trials) },
    { label: "Purchased bootcamp", value: period.bootcampBuyers, rate: percent(period.bootcampBuyers, period.paid) },
  ];
  const maxTrend = Math.max(...period.trend.flatMap((item) => [item.subscriptions, item.bootcamps]));

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ADMIN_USERS.filter((row) => (
      userMatchesFilter(row, userFilter)
      && (domain === "All domains" || row.domain === domain)
      && (!normalized || [row.name, row.email, row.plan, row.domain, row.bootcamp]
        .some((value) => value?.toLowerCase().includes(normalized)))
    ));
  }, [domain, query, userFilter]);

  async function signOut() {
    await logout();
    router.replace("/admin/login");
  }

  function exportUsers() {
    const headers = ["Name", "Email", "Plan", "Stage", "Domain", "Intent", "Source", "Joined", "Last active", "Progress", "Bootcamp", "Spend"];
    const rows = filteredUsers.map((row) => [
      row.name,
      row.email,
      row.plan,
      row.stage,
      row.domain,
      row.intent,
      row.source,
      row.joined,
      row.lastActive,
      row.progress,
      row.bootcamp || "",
      row.spend,
    ]);
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ctrlteach-admin-users.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !user?.isAdmin) {
    return <div className="admin-loading">Opening business dashboard…</div>;
  }

  return (
    <div className="admin-dashboard-shell">
      <header className="admin-studio-header admin-dashboard-header">
        <Link href="/admin/dashboard" className="admin-wordmark" aria-label="Admin dashboard">Ctrl<span>+</span>Teach</Link>
        <div className="admin-studio-title">
          <span>Admin</span>
          <nav className="admin-section-nav" aria-label="Admin sections">
            <Link href="/admin/dashboard" className="active">Dashboard</Link>
            <Link href="/admin/courses">Manage courses</Link>
            <Link href="/admin/tars">Tars analytics</Link>
          </nav>
        </div>
        <div className="admin-header-actions">
          <span className="admin-header-user">{user.displayName || user.username}</span>
          <button type="button" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </header>

      <main className="admin-dashboard-page">
        <header className="admin-dashboard-intro">
          <div>
            <h1>Business overview</h1>
            <p>See who converts, what they buy, and where learner demand is forming.</p>
          </div>
          <div className="admin-period-control" aria-label="Dashboard reporting period">
            {(Object.keys(ADMIN_PERIODS) as AdminPeriodKey[]).map((key) => (
              <button type="button" key={key} className={periodKey === key ? "active" : ""} onClick={() => setPeriodKey(key)}>
                {key === "30d" ? "30 days" : key === "90d" ? "90 days" : "12 months"}
              </button>
            ))}
          </div>
        </header>

        <section className="admin-kpi-grid" aria-label={`Key metrics for ${period.label}`}>
          <article>
            <span><Users size={16} /> New accounts</span>
            <strong>{period.signups.toLocaleString("en-IN")}</strong>
            <small>{percent(period.signups, period.visitors)} of visitors</small>
          </article>
          <article>
            <span><UserCheck size={16} /> Paid conversions</span>
            <strong>{period.paid.toLocaleString("en-IN")}</strong>
            <small>{percent(period.paid, period.trials)} trial-to-paid</small>
          </article>
          <article>
            <span><CircleDollarSign size={16} /> Subscription revenue</span>
            <strong>{formatCurrency(period.subscriptionRevenue, true)}</strong>
            <small>Across all paid plans</small>
          </article>
          <article>
            <span><ShoppingBag size={16} /> Bootcamp purchases</span>
            <strong>{period.bootcampBuyers.toLocaleString("en-IN")}</strong>
            <small>{formatCurrency(period.bootcampRevenue, true)} revenue</small>
          </article>
        </section>

        <section className="admin-dashboard-split">
          <article className="admin-analytics-panel admin-funnel-panel">
            <div className="admin-panel-head">
              <div><h2>Conversion funnel</h2><p>{period.label}. Each rate is relative to the previous stage.</p></div>
              <strong>{percent(period.paid, period.signups)} signup-to-paid</strong>
            </div>
            <div className="admin-funnel" key={`funnel-${periodKey}`}>
              {funnel.map((stage, index) => (
                <div key={stage.label} style={{ width: `${100 - index * 8}%` }}>
                  <span>{stage.label}</span>
                  <strong>{stage.value.toLocaleString("en-IN")}</strong>
                  <small>{stage.rate}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-analytics-panel admin-revenue-panel">
            <div className="admin-panel-head">
              <div><h2>Revenue movement</h2><p>Subscriptions compared with one-time bootcamp purchases.</p></div>
              <div className="admin-chart-legend"><span>Subscriptions</span><span>Bootcamps</span></div>
            </div>
            <div className="admin-revenue-chart" key={`revenue-${periodKey}`} aria-label="Revenue chart">
              {period.trend.map((item) => (
                <div className="admin-chart-column" key={item.label} title={`${item.label}: ${formatCurrency(item.subscriptions)} subscriptions, ${formatCurrency(item.bootcamps)} bootcamps`}>
                  <div>
                    <i className="subscriptions" style={{ height: `${Math.max(5, item.subscriptions / maxTrend * 100)}%` }} />
                    <i className="bootcamps" style={{ height: `${Math.max(5, item.bootcamps / maxTrend * 100)}%` }} />
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="admin-revenue-total">
              <span>Total tracked revenue</span>
              <strong>{formatCurrency(period.subscriptionRevenue + period.bootcampRevenue)}</strong>
            </div>
          </article>
        </section>

        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-head">
            <div><h2>Subscription mix</h2><p>Current users by plan, revenue contribution, and conversion quality.</p></div>
          </div>
          <div className="admin-plan-grid">
            {ADMIN_PLAN_METRICS.map((plan) => (
              <article key={plan.plan}>
                <header><span>{plan.plan}</span><small>{plan.price}</small></header>
                <strong>{plan.subscribers.toLocaleString("en-IN")}</strong>
                <p>subscribers</p>
                <dl>
                  <div><dt>Catalog share</dt><dd>{plan.share}%</dd></div>
                  <div><dt>Conversion</dt><dd>{plan.conversion}%</dd></div>
                  <div><dt>MRR</dt><dd>{plan.mrr ? formatCurrency(plan.mrr, true) : "Free"}</dd></div>
                  <div><dt>Growth</dt><dd className="positive">+{plan.change}%</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-dashboard-split admin-demand-split">
          <article className="admin-analytics-panel">
            <div className="admin-panel-head">
              <div><h2>Domain demand</h2><p>Interest, high-intent behavior, paid conversion, and bootcamp demand.</p></div>
            </div>
            <div className="admin-domain-table" role="table" aria-label="Domain interest metrics">
              <div className="admin-domain-row heading" role="row">
                <span>Domain</span><span>Interested</span><span>High intent</span><span>Paid</span><span>Insight</span>
              </div>
              {ADMIN_DOMAIN_INTERESTS.map((item) => (
                <div className="admin-domain-row" role="row" key={item.domain}>
                  <span><strong>{item.domain}</strong><small>{item.conversion}% converted</small></span>
                  <span>{item.interested.toLocaleString("en-IN")}</span>
                  <span>{item.highIntent}</span>
                  <span>{item.paid}</span>
                  <span>{item.signal}</span>
                </div>
              ))}
            </div>
          </article>

          <aside className="admin-actions-panel">
            <div className="admin-panel-head"><div><h2>Recommended actions</h2><p>Opportunities derived from current learner behavior.</p></div></div>
            <div className="admin-action-list">
              {ADMIN_ACTIONS.map((action) => (
                <article key={action.title}>
                  <span className={action.priority.toLowerCase()}>{action.priority}</span>
                  <h3>{action.title}</h3>
                  <p>{action.detail}</p>
                  <strong>{action.impact}</strong>
                  <ArrowRight size={15} />
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="admin-dashboard-section">
          <div className="admin-dashboard-section-head">
            <div><h2>Bootcamp performance</h2><p>Purchases, revenue, conversion, and cohort health.</p></div>
          </div>
          <div className="admin-bootcamp-grid">
            {ADMIN_BOOTCAMPS.map((bootcamp) => (
              <article key={bootcamp.name}>
                <span>{bootcamp.domain}</span>
                <h3>{bootcamp.name}</h3>
                <strong>{formatCurrency(bootcamp.revenue)}</strong>
                <small>{bootcamp.buyers} buyers</small>
                <dl>
                  <div><dt>Interest to purchase</dt><dd>{bootcamp.conversion}%</dd></div>
                  <div><dt>Completion</dt><dd>{bootcamp.completion}%</dd></div>
                  <div><dt>Next cohort</dt><dd>{bootcamp.nextCohort}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-dashboard-section admin-user-section">
          <div className="admin-dashboard-section-head admin-users-head">
            <div><h2>User conversion explorer</h2><p>Inspect plan, buying stage, primary domain, intent, activity, and spend.</p></div>
            <button type="button" className="admin-export-button" onClick={exportUsers}><Download size={14} /> Export CSV</button>
          </div>

          <div className="admin-user-controls">
            <div className="admin-filter-tabs" aria-label="User segments">
              {(["all", "converted", "bootcamp", "high-intent"] as UserFilter[]).map((filter) => (
                <button type="button" key={filter} className={userFilter === filter ? "active" : ""} onClick={() => setUserFilter(filter)}>
                  {filter === "all" ? "All users" : filter === "high-intent" ? "High intent" : filter === "bootcamp" ? "Bootcamp buyers" : "Converted"}
                </button>
              ))}
            </div>
            <label className="admin-user-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" aria-label="Search users" /></label>
            <select value={domain} onChange={(event) => setDomain(event.target.value)} aria-label="Filter users by domain">
              <option>All domains</option>
              {ADMIN_DOMAIN_INTERESTS.map((item) => <option key={item.domain}>{item.domain}</option>)}
            </select>
          </div>

          <div className="admin-user-table-wrap">
            <table className="admin-user-table">
              <thead><tr><th>User</th><th>Plan and stage</th><th>Interest</th><th>Engagement</th><th>Bootcamp</th><th>Spend</th></tr></thead>
              <tbody>
                {filteredUsers.map((row) => (
                  <tr key={row.id}>
                    <td><div className="admin-user-cell"><span>{row.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{row.name}</strong><small>{row.email}<br />Joined {row.joined} via {row.source}</small></div></div></td>
                    <td><strong>{row.plan}</strong><span className={`admin-user-stage ${row.stage.toLowerCase().replace(/\s+/g, "-")}`}>{row.stage}</span></td>
                    <td><strong>{row.domain}</strong><small>Intent score {row.intent}/100</small></td>
                    <td><strong>{row.progress}</strong><small>Active {row.lastActive}</small></td>
                    <td>{row.bootcamp ? <><strong>{row.bootcamp}</strong><small>Purchased</small></> : <span className="admin-table-muted">No purchase</span>}</td>
                    <td><strong>{row.spend ? formatCurrency(row.spend) : "₹0"}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredUsers.length && <div className="admin-user-empty">No users match these filters.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
