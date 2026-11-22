
(function () {
const D = window.DATA;
const $ = (s) => document.querySelector(s);
const MODES = D.modes;
const SLOT = { "TransJakarta": "--s-tj", "KRL": "--s-krl", "MRT": "--s-mrt", "Mikrotrans": "--s-mkt", "Bus Sekolah": "--s-bus", "Airport Rail": "--s-air", "LRT": "--s-lrt", "Kapal": "--s-kap", "TJ + Mikrotrans": "--s-tj" };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const col = (m) => css(SLOT[m] || "--ink-3");
const fmt = (v, d = 0) => v == null || Number.isNaN(v) ? "–" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v, d = 1) => v == null || Number.isNaN(v) ? "–" : (v > 0 ? "+" : "") + Number(v).toFixed(d) + "%";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byMode = (arr, key = "mode") => Object.fromEntries(arr.map((r) => [r[key], r]));

// ---------------- state
const DEFAULT = { modes: ["TransJakarta", "KRL", "MRT", "Bus Sekolah", "LRT", "Airport Rail", "Kapal", "Mikrotrans"], period: "all", harm: true, flag: false, tab: "overview" };
let S = JSON.parse(JSON.stringify(DEFAULT));
try { const s = JSON.parse(localStorage.getItem("jtre-state") || "null"); if (s) S = Object.assign(S, s); } catch (e) {}
const save = () => { try { localStorage.setItem("jtre-state", JSON.stringify(S)); } catch (e) {} };
const hashTab = location.hash.replace("#", ""); if (["overview", "trends", "raw", "cycles", "patterns", "model", "tests", "projection", "external", "quality", "figures"].includes(hashTab)) S.tab = hashTab;

// ---------------- helpers
function periodRange() {
  return { all: ["2023-01-01", "2026-06-30"], "2023": ["2023-01-01", "2023-12-31"], "2024": ["2024-01-01", "2024-12-31"], "2025": ["2025-01-01", "2025-12-31"], "2026": ["2026-01-01", "2026-06-30"], "2024p": ["2024-01-01", "2026-06-30"] }[S.period];
}
function seriesFor(m) {
  // returns {x,y} for mode m honoring flags + harmonisation
  if (S.harm && m === "TransJakarta") {
    const base = S.flag ? D.daily_raw["TransJakarta"] : D.daily["TransJakarta"];
    const t = Object.fromEntries(D.tjm.x.map((x, i) => [x, D.tjm.y[i]]));
    const y = base.x.map((x, i) => (x >= "2026-01-01" && t[x] != null) ? t[x] : base.y[i]);
    return { x: base.x, y };
  }
  return S.flag ? D.daily_raw[m] : D.daily[m];
}
function activeModes() { return MODES.filter((m) => S.modes.includes(m) && !(S.harm && m === "Mikrotrans")); }
function inRange(s) { const [a, b] = periodRange(); const x = [], y = []; s.x.forEach((d, i) => { if (d >= a && d <= b) { x.push(d); y.push(s.y[i]); } }); return { x, y }; }
function resample(s, g) {
  if (g === "D") return s;
  const acc = new Map();
  s.x.forEach((d, i) => {
    let k;
    if (g === "M") k = d.slice(0, 7) + "-15";
    else { const dt = new Date(d + "T00:00:00Z"); const wd = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - wd + 3); k = dt.toISOString().slice(0, 10); }
    const a = acc.get(k) || [0, 0]; if (s.y[i] > 0) { a[0] += s.y[i]; a[1]++; } acc.set(k, a);
  });
  const x = [], y = []; [...acc.entries()].sort().forEach(([k, [t, n]]) => { if (n) { x.push(k); y.push(t / n); } });
  return { x, y };
}
const name = (m) => (S.harm && m === "TransJakarta") ? "TJ + Mikrotrans" : m;
function baseLayout(extra = {}) {
  const ink = css("--ink-2"), grid = css("--line");
  return Object.assign({
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Source Sans 3, Segoe UI, system-ui, sans-serif", size: 12.5, color: ink },
    margin: { l: 56, r: 12, t: 8, b: 40 },
    xaxis: { gridcolor: grid, linecolor: grid, zeroline: false, tickfont: { color: ink } },
    yaxis: { gridcolor: grid, linecolor: grid, zeroline: false, tickfont: { color: ink } },
    hoverlabel: { bgcolor: css("--surface"), bordercolor: css("--line"), font: { color: css("--ink"), family: "Source Sans 3, Segoe UI, sans-serif" } },
    legend: { orientation: "h", y: -0.18, font: { size: 11, color: ink } },
    showlegend: true,
  }, extra);
}
const CFG = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d", "autoScale2d", "toggleSpikelines"] };
function plot(id, data, layout) { if (!window.Plotly) { $(id).innerHTML = '<p class="muted small">Charts need the Plotly library, which could not load.</p>'; return; } Plotly.react($(id), data, layout, CFG); }
function table(id, cols, rows) {
  const h = "<thead><tr>" + cols.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.h)}</th>`).join("") + "</tr></thead>";
  const b = "<tbody>" + rows.map((r) => "<tr>" + cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.f ? c.f(r) : esc(r[c.k] ?? "")}</td>`).join("") + "</tr>").join("") + "</tbody>";
  $(id).innerHTML = h + b;
}
const sw = (m) => `<span class="sw" style="background:${col(m)}"></span>${esc(m)}`;

// ---------------- filter UI
function buildChips() {
  const box = $("#mode-chips");
  MODES.forEach((m) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.mode = m; b.id = "chip-" + m.replace(/\s/g, "");
    b.innerHTML = `<span class="dot"></span>${esc(m)}`;
    b.addEventListener("click", () => { S.modes = S.modes.includes(m) ? S.modes.filter((x) => x !== m) : [...S.modes, m]; if (!S.modes.length) S.modes = [m]; save(); render(); });
    box.appendChild(b);
  });
}
function syncFilters() {
  document.querySelectorAll(".chip").forEach((b) => { b.style.setProperty("--c", col(b.dataset.mode)); b.setAttribute("aria-pressed", S.modes.includes(b.dataset.mode)); b.hidden = S.harm && b.dataset.mode === "Mikrotrans"; });
  $("#period").value = S.period; $("#harm").checked = S.harm; $("#showflag").checked = S.flag;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === S.tab));
  document.querySelectorAll("section.tab").forEach((s) => (s.hidden = s.id !== S.tab));
  $("#filters").hidden = ["model", "quality", "external", "projection", "raw", "tests", "figures"].includes(S.tab);
}

// ---------------- FINDINGS tab
function renderOverview() {
  const L = D.log, share = D.share, jj = byMode(D.janjun), stl = byMode(D.stl, "index"), fc = byMode(D.fc_eval), wk = byMode(D.wk), cl = byMode(D.clusters, "cluster_name");
  const passed = D.validation.filter((v) => v.result === "PASS").length;
  const top2 = share["TransJakarta"] + share["KRL"];
  const net26 = ["TJ + Mikrotrans", "KRL", "MRT", "Bus Sekolah", "LRT", "Airport Rail", "Kapal"].reduce((a, m) => a + (jj[m]["2026"] || 0), 0);
  const net25 = ["TJ + Mikrotrans", "KRL", "MRT", "Bus Sekolah", "LRT", "Airport Rail", "Kapal"].reduce((a, m) => a + (jj[m]["2025"] || 0), 0);
  $("#kpis").innerHTML = [
    [fmt(net26 / 1e6, 2) + "M", "passengers per day across all modes, Jan to Jun 2026"],
    [pct((net26 / net25 - 1) * 100), "network growth vs Jan to Jun 2025"],
    [top2.toFixed(1) + "%", "of passengers on TransJakarta and KRL (2024 to 2025)"],
    [`${passed}/${D.validation.length}`, "validation checks passed on the cleaned data"],
  ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  const F = [
    `<b>Two modes carry the city.</b> TransJakarta (${share["TransJakarta"].toFixed(1)}%) and KRL (${share["KRL"].toFixed(1)}%) moved ${top2.toFixed(1)}% of recorded passengers in 2024 to 2025. MRT adds ${share["MRT"].toFixed(1)}%; the other four modes are under 2% combined.`,
    `<b>Every major mode is growing.</b> The underlying trend rose from January 2024 to June 2026: MRT ${pct(stl["MRT"]["trend_change_%"], 0)}, LRT ${pct(stl["LRT"]["trend_change_%"], 0)}, TransJakarta with Mikrotrans ${pct(stl["TJ + Mikrotrans"]["trend_change_%"], 0)}, KRL ${pct(stl["KRL"]["trend_change_%"], 0)}. Kapal is the only mode that declined.`,
    `<b>Weekends split the modes by purpose.</b> MRT keeps ${Math.round(wk["MRT"].weekend_weekday_ratio * 100)}% of weekday demand at weekends and TransJakarta ${Math.round(wk["TransJakarta"].weekend_weekday_ratio * 100)}%, Bus Sekolah nearly stops, and Kapal carries ${wk["Kapal"].weekend_weekday_ratio.toFixed(1)}× its weekday load. LRT is almost flat.`,
    `<b>The year dips around Ramadan and peaks in October.</b> March and April are the lowest months for commuter modes, July to November the highest. Bus Sekolah follows the school calendar.`,
    `<b>Clustering finds three kinds of day.</b> Regular weekdays (${cl["Regular weekday"].days}), non-working days (${cl["Non-working day"].days}, which absorbed 38 of 39 weekday holidays) and school-holiday weekdays (${cl["School-holiday weekday"].days}), when commuting is normal but Bus Sekolah is empty.`,
    `<b>Holidays are the main forecasting problem.</b> Holt-Winters reaches ${fc["KRL"].HW_MAPE_nonholiday.toFixed(1)}% (KRL) and ${fc["TJ + Mikrotrans"].HW_MAPE_nonholiday.toFixed(1)}% (TransJakarta) error on normal days, but more than doubles once holidays are included. Day of week and the holiday flag are the two most important features.`,
    `<b>The raw files need correcting before any model.</b> ${L.flagged_rows} records reflect reporting changes, and Mikrotrans was split out of TransJakarta in January 2026. Used naively, the data shows a false 36% TransJakarta collapse in 2026.`,
  ];
  $("#findings").innerHTML = F.map((f) => `<li><div>${f}</div></li>`).join("");
  const s = Object.entries(share).sort((a, b) => a[1] - b[1]);
  plot("#ch-share", [{ type: "bar", orientation: "h", y: s.map((d) => d[0]), x: s.map((d) => d[1]), marker: { color: s.map((d) => col(d[0])) }, text: s.map((d) => d[1].toFixed(d[1] < 1 ? 2 : 1) + "%"), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") }, hovertemplate: "%{y}: %{x:.2f}%<extra></extra>" }],
    baseLayout({ showlegend: false, margin: { l: 90, r: 40, t: 4, b: 30 }, xaxis: Object.assign(baseLayout().xaxis, { range: [0, 62], ticksuffix: "%" }), bargap: .35 }));
  const h1 = D.h1, h3min = Math.min(...D.h3.map((r) => r.epsilon_sq)), h3max = Math.max(...D.h3.map((r) => r.epsilon_sq));
  table("#tb-hyp", [{ h: "Hypothesis", k: "h" }, { h: "Test", k: "t" }, { h: "Result", f: (r) => `<span class="pill good">Supported</span>` }], [
    { h: "H1 Ridership differs between modes", t: `Kruskal-Wallis H = ${fmt(h1.H)}, p < 0.001, ε² = ${h1.epsilon_sq.toFixed(2)}` },
    { h: "H2 Weekdays differ from weekends", t: "Mann-Whitney, p < 0.001 for all 8 modes" },
    { h: "H3 Ridership varies by month", t: `Kruskal-Wallis per mode, all p < 0.01, ε² ${h3min.toFixed(2)} to ${h3max.toFixed(2)}` },
  ]);
}

// ---------------- TRENDS tab
function renderTrends() {
  const g = $("#gran").value, sc = $("#scale").value;
  const traces = activeModes().map((m) => {
    let s = resample(inRange(seriesFor(m)), g);
    if (!s.x.length) return null;
    let y = s.y.map((v) => v > 0 ? v : null);
    if (sc === "index") { const b = y.find((v) => v); y = y.map((v) => v ? v / b * 100 : null); }
    return { type: "scatter", mode: "lines", name: name(m), x: s.x, y, line: { color: col(m), width: g === "D" ? 1 : 2 }, connectgaps: false,
      hovertemplate: `<b>${name(m)}</b><br>%{x|%d %b %Y}<br>%{y:,.0f}${sc === "index" ? "" : " passengers"}<extra></extra>` };
  }).filter(Boolean);
  const shapes = [];
  if ($("#holmark").checked) { const [a, b] = periodRange(); Object.keys(D.holidays).filter((d) => d >= a && d <= b).forEach((d) => shapes.push({ type: "line", x0: d, x1: d, yref: "paper", y0: 0, y1: 1, line: { color: css("--ink-3"), width: .6, dash: "dot" } })); }
  const L = baseLayout({ hovermode: "x unified", shapes });
  L.yaxis = Object.assign(L.yaxis, { type: sc === "log" ? "log" : "linear", title: { text: sc === "index" ? "Index" : "Passengers per day", font: { size: 11 } } });
  plot("#ch-trend", traces, L);
  $("#trend-title").textContent = { D: "Daily passengers", W: "Weekly mean of daily passengers", M: "Monthly mean of daily passengers" }[g];
  const jj = byMode(D.janjun), yy = byMode(D.yoy);
  const rows = ["TJ + Mikrotrans", "KRL", "MRT", "Bus Sekolah", "LRT", "Airport Rail", "Kapal"].map((m) => ({ m, a: jj[m]["2024"], b: jj[m]["2025"], c: jj[m]["2026"], g1: yy[m]["2025"], g2: yy[m]["2026"] }));
  const gp = (v) => `<span class="pill ${v >= 0 ? "good" : "bad"}">${pct(v)}</span>`;
  table("#tb-growth", [{ h: "Mode", f: (r) => sw(r.m) }, { h: "2024", num: 1, f: (r) => fmt(r.a) }, { h: "2025", num: 1, f: (r) => fmt(r.b) }, { h: "2026", num: 1, f: (r) => fmt(r.c) }, { h: "24→25", num: 1, f: (r) => gp(r.g1) }, { h: "25→26", num: 1, f: (r) => gp(r.g2) }], rows);
  table("#tb-desc", [{ h: "Mode", f: (r) => sw(r.mode) }, { h: "Mean", num: 1, f: (r) => fmt(r.mean) }, { h: "Median", num: 1, f: (r) => fmt(r.median) }, { h: "CV", num: 1, f: (r) => r["cv_%"].toFixed(0) + "%" }], D.desc);
}

// ---------------- CYCLES tab
function renderCycles() {
  const modes = activeModes().filter((m) => m !== "TransJakarta" || true);
  const dow = byMode(D.dow), days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hm = modes.filter((m) => dow[m]);
  const ink = css("--ink");
  plot("#ch-dow", [{ type: "heatmap", x: days, y: hm, z: hm.map((m) => days.map((d) => dow[m][d])), zmin: 0, zmax: 2.1, zmid: 1,
    colorscale: [[0, css("--s-krl")], [.476, css("--surface-2")], [1, css("--s-tj")]], xgap: 2, ygap: 2,
    text: hm.map((m) => days.map((d) => dow[m][d].toFixed(2))), texttemplate: "%{text}", textfont: { color: ink, size: 11 },
    hovertemplate: "%{y} · %{x}<br>Index %{z:.2f}<extra></extra>", colorbar: { thickness: 10, tickfont: { color: css("--ink-2") } } }],
    baseLayout({ showlegend: false, margin: { l: 90, r: 10, t: 4, b: 30 }, yaxis: { autorange: "reversed", tickfont: { color: css("--ink-2") } } }));
  const moy = byMode(D.moy), mn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  plot("#ch-moy", modes.filter((m) => moy[m]).map((m) => ({ type: "scatter", mode: "lines+markers", name: m, x: mn, y: mn.map((_, i) => moy[m][String(i + 1)]), line: { color: col(m), width: 2 }, marker: { size: 8, line: { color: css("--surface"), width: 2 } }, hovertemplate: `<b>${m}</b> %{x}: %{y:.2f}<extra></extra>` })),
    baseLayout({ hovermode: "closest", shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 1, y1: 1, line: { color: css("--ink-3"), width: 1, dash: "dot" } }] }));
  const wk = byMode(D.wk), dt = byMode(D.daytype);
  const rows = MODES.filter((m) => S.modes.includes(m)).map((m) => Object.assign({ m }, wk[m], dt[m]));
  const ratio = (v) => `<span class="pill ${v > 1.1 ? "info" : v < .8 ? "warn" : "good"}">${v.toFixed(2)}×</span>`;
  table("#tb-wk", [{ h: "Mode", f: (r) => sw(r.m) }, { h: "Weekday mean", num: 1, f: (r) => fmt(r.weekday_mean) }, { h: "Weekend mean", num: 1, f: (r) => fmt(r.weekend_mean) }, { h: "Holiday mean", num: 1, f: (r) => fmt(r.Holiday) },
    { h: "Weekend / weekday", num: 1, f: (r) => ratio(r.weekend_weekday_ratio) }, { h: "Holiday / weekday", num: 1, f: (r) => ratio(r.holiday_vs_weekday) },
    { h: "p", num: 1, f: (r) => r.p < .001 ? "< 0.001" : r.p.toFixed(3) }, { h: "Effect r", num: 1, f: (r) => `${r.effect_r.toFixed(2)} ${r.effect_r >= .5 ? "large" : r.effect_r >= .3 ? "medium" : "small"}` }], rows);
}

// ---------------- PATTERNS tab
const CL = ["Regular weekday", "School-holiday weekday", "Non-working day"];
const clc = (n) => css({ "Regular weekday": "--c-reg", "School-holiday weekday": "--c-sch", "Non-working day": "--c-non" }[n]);
function renderPatterns() {
  $("#cl-legend").innerHTML = CL.map((c) => `<span><span class="sw" style="background:${clc(c)}"></span>${c}</span>`).join("");
  // calendar: x = week start, y = weekday
  const xs = [], ys = [], cs = [], tx = [], days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  Object.entries(D.cluster_labels).forEach(([d, n]) => {
    const dt = new Date(d + "T00:00:00Z"); const wd = (dt.getUTCDay() + 6) % 7; const ws = new Date(dt); ws.setUTCDate(ws.getUTCDate() - wd);
    xs.push(ws.toISOString().slice(0, 10)); ys.push(days[wd]); cs.push(CL.indexOf(n)); tx.push(`${d} · ${n}${D.holidays[d] ? "<br>" + D.holidays[d] : ""}`);
  });
  const c0 = clc(CL[0]), c1 = clc(CL[1]), c2 = clc(CL[2]);
  plot("#ch-cal", [{ type: "heatmap", x: xs, y: ys, z: cs, text: tx, hovertemplate: "%{text}<extra></extra>", zmin: 0, zmax: 2, showscale: false, xgap: 1, ygap: 1,
    colorscale: [[0, c0], [.333, c0], [.334, c1], [.666, c1], [.667, c2], [1, c2]] }],
    baseLayout({ showlegend: false, margin: { l: 40, r: 10, t: 4, b: 30 }, yaxis: { autorange: "reversed", categoryorder: "array", categoryarray: days, tickfont: { color: css("--ink-2") } } }));
  const clt = byMode(D.clusters, "cluster_name");
  const cell = (v) => `<span class="pill ${v > 1.02 ? "good" : v < .5 ? "bad" : v < .9 ? "warn" : "info"}">${v.toFixed(2)}</span>`;
  table("#tb-cl", [{ h: "Day type", f: (r) => `<span class="sw" style="background:${clc(r.n)}"></span>${r.n}` }, { h: "Days", num: 1, f: (r) => r.days }, { h: "Weekend", num: 1, f: (r) => Math.round(r.weekend_share * 100) + "%" },
    { h: "TJ", num: 1, f: (r) => cell(r.TransJakarta) }, { h: "KRL", num: 1, f: (r) => cell(r.KRL) }, { h: "MRT", num: 1, f: (r) => cell(r.MRT) }, { h: "Bus Sekolah", num: 1, f: (r) => cell(r["Bus Sekolah"]) }, { h: "Airport Rail", num: 1, f: (r) => cell(r["Airport Rail"]) }],
    CL.map((n) => Object.assign({ n }, clt[n])));
  $("#cl-note").textContent = `k = 3 chosen: silhouette ${D.sil["3"].toFixed(2)} (k = 2 scores ${D.sil["2"].toFixed(2)} but only splits work from non-work days; k = 4 splits off 3 outlier days).`;
  const c = D.corr;
  plot("#ch-corr", [{ type: "heatmap", x: c.labels, y: c.labels, z: c.z, zmin: -1, zmax: 1, colorscale: [[0, css("--s-krl")], [.5, css("--surface-2")], [1, css("--s-tj")]], xgap: 2, ygap: 2,
    text: c.z.map((r) => r.map((v) => v.toFixed(2))), texttemplate: "%{text}", textfont: { size: 10, color: css("--ink") }, hovertemplate: "%{y} vs %{x}: ρ = %{z:.2f}<extra></extra>", colorbar: { thickness: 10, tickfont: { color: css("--ink-2") } } }],
    baseLayout({ showlegend: false, margin: { l: 80, r: 10, t: 4, b: 80 }, yaxis: { autorange: "reversed", tickfont: { color: css("--ink-2") } }, xaxis: { tickangle: -40, tickfont: { color: css("--ink-2") } } }));
  const f = $("#an-filter").value;
  const [a, b] = periodRange();
  let A = D.anomalies.filter((r) => r.date >= a && r.date <= b);
  A = A.filter((r) => f === "all" || (f === "hol" && r.holiday) || (f === "nonhol" && !r.holiday) || (f === "pos" && r.rel_resid > 0));
  const am = ["TJ + Mikrotrans", "KRL", "MRT", "LRT"];
  plot("#ch-anom", am.map((m) => { const r = A.filter((x) => x.mode === m); return { type: "scatter", mode: "markers", name: m, x: r.map((x) => x.date), y: r.map((x) => x.rel_resid * 100), marker: { size: 8, color: col(m), line: { color: css("--surface"), width: 2 } }, text: r.map((x) => x.holiday || "No holiday"), hovertemplate: `<b>${m}</b> %{x|%d %b %Y}<br>%{y:+.0f}% vs expected<br>%{text}<extra></extra>` }; }),
    baseLayout({ yaxis: Object.assign(baseLayout().yaxis, { ticksuffix: "%", title: { text: "vs expected", font: { size: 11 } } }) }));
  table("#tb-anom", [{ h: "Date", k: "date" }, { h: "Day", k: "weekday" }, { h: "Series", f: (r) => sw(r.mode) }, { h: "Passengers", num: 1, f: (r) => fmt(r.passengers) },
    { h: "vs expected", num: 1, f: (r) => `<span class="pill ${r.rel_resid < 0 ? "bad" : "info"}">${pct(r.rel_resid * 100, 0)}</span>` }, { h: "Holiday", f: (r) => esc(r.holiday || "") }], A);
}

// ---------------- MODEL tab
function renderModel() {
  const sel = $("#fc-mode"); if (!sel.options.length) Object.keys(D.forecast).forEach((m) => sel.add(new Option(m, m)));
  const m = sel.value || "TJ + Mikrotrans", F = D.forecast[m];
  const hol = Object.keys(D.holidays).filter((d) => d >= "2025-09-01" && d <= "2026-06-30");
  plot("#ch-fc", [
    { type: "scatter", mode: "lines", name: "Actual", x: F.actual.x, y: F.actual.y, line: { color: col(m), width: 1.4 }, hovertemplate: "%{x|%d %b %Y}<br>Actual %{y:,.0f}<extra></extra>" },
    { type: "scatter", mode: "lines", name: "Holt-Winters forecast", x: F.pred.x, y: F.pred.y, line: { color: css("--ink-2"), width: 1.4, dash: "dot" }, hovertemplate: "%{x|%d %b %Y}<br>Forecast %{y:,.0f}<extra></extra>" },
  ], baseLayout({ hovermode: "x unified", shapes: [{ type: "rect", x0: "2025-12-01", x1: "2025-12-31", yref: "paper", y0: 0, y1: 1, fillcolor: css("--surface-2"), line: { width: 0 }, layer: "below" },
    ...hol.map((d) => ({ type: "line", x0: d, x1: d, yref: "paper", y0: 0, y1: 1, line: { color: css("--ink-3"), width: .5, dash: "dot" } }))],
    annotations: [{ x: "2025-12-16", yref: "paper", y: 1, text: "gap", showarrow: false, font: { size: 10, color: css("--ink-3") } }] }));
  const imp = Object.entries(D.importance).filter((d) => d[1] > 0.0005).sort((a, b) => a[1] - b[1]);
  plot("#ch-imp", [{ type: "bar", orientation: "h", y: imp.map((d) => d[0]), x: imp.map((d) => d[1]), marker: { color: css("--accent") }, hovertemplate: "%{y}: %{x:.3f}<extra></extra>" }],
    baseLayout({ showlegend: false, margin: { l: 130, r: 10, t: 4, b: 30 }, bargap: .4 }));
  const B = D.baselines;
  const keys = [["Seasonal naive MAPE all", "Seasonal naive", "6 months"], ["Holt-Winters MAPE all", "Holt-Winters", "6 months"], ["GBM calendar-only MAPE all", "Gradient boosting, calendar only", "6 months"], ["GBM calendar+lags (7-day ahead) MAPE all", "Gradient boosting, calendar + lags", "7 days"]];
  const keysNH = { "Holt-Winters MAPE all": "Holt-Winters MAPE non-holiday", "GBM calendar-only MAPE all": "GBM calendar-only MAPE non-holiday", "GBM calendar+lags (7-day ahead) MAPE all": "GBM calendar+lags (7-day ahead) MAPE non-holiday" };
  const best = Object.fromEntries(B.map((r) => [r.mode, Math.min(...keys.map((k) => r[k[0]]))]));
  table("#tb-base", [{ h: "Model", f: (r) => `${r.lab}` }, { h: "Horizon", f: (r) => r.hz },
    ...B.map((b) => ({ h: b.mode, num: 1, f: (r) => { const v = b[r.k]; const nh = keysNH[r.k] ? b[keysNH[r.k]] : null; return `${v === best[b.mode] ? '<span class="pill good">' + v.toFixed(1) + "</span>" : v.toFixed(1)}${nh != null ? `<div class="small muted">${nh.toFixed(1)} excl. holidays</div>` : ""}`; } }))],
    keys.map(([k, lab, hz]) => ({ k, lab, hz })));
  const adf = byMode(D.adf);
  table("#tb-acf", [{ h: "Series", f: (r) => sw(r.mode) }, { h: "Lag 1", num: 1, f: (r) => r.lag_1.toFixed(2) }, { h: "Lag 7", num: 1, f: (r) => `<b>${r.lag_7.toFixed(2)}</b>` }, { h: "Lag 28", num: 1, f: (r) => r.lag_28.toFixed(2) }, { h: "Lag 364", num: 1, f: (r) => r.lag_364.toFixed(2) },
    { h: "ADF p", num: 1, f: (r) => { const p = adf[r.mode].ADF_p_level; return `<span class="pill ${p < .05 ? "good" : "warn"}">${p < .001 ? "< 0.001" : p.toFixed(3)}</span>`; } }], D.acf);
  $("#recs").innerHTML = [
    "Train on <b>model_features.csv</b>: one row per date and mode, with calendar, holiday and lag features that are leakage-safe up to 7 days ahead. Drop rows where <b>flag = 1</b>.",
    "Use <b>TJ + Mikrotrans</b> as the TransJakarta target, or add the <b>mikrotrans_split</b> indicator. Training across January 2026 without it teaches the model a false collapse.",
    "Start from <b>January 2024</b>. 2023 has gaps and reporting breaks, and a year of history is needed for the lag-364 feature.",
    "Combine a level model with holiday handling. Holt-Winters tracks the level best on normal days; gradient boosting handles holidays but cannot extrapolate a trend, so predict a ratio to a recent level or detrend first.",
    "Add a <b>moving Ramadan / Idul Fitri</b> feature (days_to_idul_fitri is included). It shifts about 11 days earlier each year, which a month-of-year feature cannot capture.",
    "Lag 7 is the strongest autocorrelation for commuter modes, and the series are stationary in levels (ADF p < 0.05 except LRT), so weekly-differenced or lag-7 models are a sound starting point.",
    "Evaluate on <b>non-holiday and holiday days separately</b>, and always against the seasonal naive baseline.",
  ].map((t) => `<li>${t}</li>`).join("");
}

// ---------------- QUALITY tab
function renderQuality() {
  const V = D.validation, pass = V.filter((v) => v.result === "PASS").length;
  $("#val-sum").innerHTML = `<span class="pill ${pass === V.length ? "good" : "bad"}">${pass} of ${V.length} pass</span>`;
  table("#tb-val", [{ h: "Check", k: "check" }, { h: "Result", f: (r) => `<span class="pill ${r.result === "PASS" ? "good" : "bad"}">${r.result === "PASS" ? "✓ Pass" : "✕ Fail"}</span>` }, { h: "Detail", f: (r) => `<span class="small mono">${esc(r.detail)}</span>` }], V);
  const L = D.log;
  table("#tb-log", [{ h: "Step", k: "a" }, { h: "Count", num: 1, k: "b" }], [
    { a: "Raw rows (both files)", b: fmt(L.raw_rows) }, { a: "Blank rows removed", b: L.blank_rows_removed }, { a: "Dates with spaces normalized", b: L.dates_space_separated },
    { a: "Counts with comma separators", b: L.counts_with_comma }, { a: "Counts with dot separators", b: L.counts_with_dot }, { a: "Missing counts dropped", b: L.counts_missing },
    { a: "Raw labels → clean modes", b: `${L.distinct_raw_labels} → ${L.distinct_clean_labels}` }, { a: "Zero counts (kept, excluded from means)", b: Object.values(L.zero_counts_by_mode).reduce((a, b) => a + b, 0) },
    { a: "Clean records", b: fmt(L.clean_rows) }, { a: "Records flagged as reporting breaks", b: L.flagged_rows }, { a: "Model feature rows", b: fmt(L.model_feature_rows) },
  ]);
  const fs = $("#flag-mode"); if (!fs.options.length) ["TransJakarta", "KRL", "Kapal", "Airport Rail"].forEach((m) => fs.add(new Option(m, m)));
  const m = fs.value || "TransJakarta", R = D.daily_raw[m];
  const fl = D.flags.filter((f) => f[0] === m);
  const isF = (d) => fl.some((f) => d >= f[1] && d <= f[2]);
  const ok = { x: [], y: [] }, bad = { x: [], y: [] };
  R.x.forEach((d, i) => { (isF(d) ? bad : ok).x.push(d); (isF(d) ? bad : ok).y.push(R.y[i]); });
  const traces = [{ type: "scatter", mode: "markers", name: "Kept", x: ok.x, y: ok.y, marker: { size: 3, color: col(m) }, hovertemplate: "%{x|%d %b %Y}: %{y:,.0f}<extra></extra>" },
    { type: "scatter", mode: "markers", name: "Flagged", x: bad.x, y: bad.y, marker: { size: 4, color: css("--bad"), symbol: "x" }, hovertemplate: "Flagged %{x|%d %b %Y}: %{y:,.0f}<extra></extra>" }];
  if (m === "TransJakarta") traces.push({ type: "scatter", mode: "markers", name: "TJ + Mikrotrans (2026)", x: D.tjm.x.filter((d) => d >= "2026"), y: D.tjm.y.filter((_, i) => D.tjm.x[i] >= "2026"), marker: { size: 3, color: css("--ink-3") }, hovertemplate: "TJ + Mikrotrans %{x|%d %b %Y}: %{y:,.0f}<extra></extra>" });
  plot("#ch-flag", traces, baseLayout({ yaxis: Object.assign(baseLayout().yaxis, { type: m === "Kapal" ? "log" : "linear", title: { text: "Passengers per day", font: { size: 11 } } }) }));
  table("#tb-flags", [{ h: "Mode", f: (r) => sw(r[0]) }, { h: "From", f: (r) => r[1] }, { h: "To", f: (r) => r[2] }, { h: "Why it was flagged", f: (r) => esc(r[3]) }], D.flags);
  if (D.imputation) {
    const I = D.imputation, best = I.best;
    $("#imp-note").innerHTML = `The main analysis deletes empty values. This comparison hides values that are known, fills them with each method, and measures the error. The winner, <b>${esc(I.summary[0].label)}</b>, fills the real gaps in <span class="mono">clean_dataset_imputed.csv</span>. Bus Sekolah zeros are real (no service) and are not filled.`;
    table("#tb-imp", [{ h: "Method", f: (r) => r.method === best ? `<b>${esc(r.label)}</b> <span class="pill good">best</span>` : esc(r.label) },
      { h: "Single days", num: 1, f: (r) => r["single days (5%)"].toFixed(1) }, { h: "10-day gaps", num: 1, f: (r) => r["10-day blocks"].toFixed(1) },
      { h: "31-day gap", num: 1, f: (r) => r["31-day block"].toFixed(1) }, { h: "Average MAPE", num: 1, f: (r) => `<b>${r.MAPE.toFixed(1)}</b>` }], I.summary);
    table("#tb-imp-counts", [{ h: "Mode", f: (r) => sw(r.mode) }, { h: "Missing rows filled", num: 1, f: (r) => r.missing_row || 0 }, { h: "Zero counts filled", num: 1, f: (r) => r.zero_recorded || 0 }], I.counts);
    table("#tb-imp-impact", [{ h: "2023", f: (r) => sw(r.mode) }, { h: "Days: delete → fill", num: 1, f: (r) => `${r.days_deletion} → ${r.days_imputed}` },
      { h: "Total: delete", num: 1, f: (r) => fmt(r.total_deletion) }, { h: "Total: fill", num: 1, f: (r) => fmt(r.total_imputed) }], I.impact);
  }
  const yrs = ["2023", "2024", "2025", "2026"], full = { "2023": 365, "2024": 366, "2025": 365, "2026": 181 };
  table("#tb-cov", [{ h: "Mode", f: (r) => sw(r.m) }, ...yrs.map((y) => ({ h: y === "2026" ? "2026 (to Jun)" : y, num: 1, f: (r) => { const v = r[y] || 0; const p = v / full[y]; if (r.m === "Mikrotrans" && y !== "2026") return `<span class="small muted">inside TransJakarta</span>`; return `<span class="pill ${p >= .999 ? "good" : p > 0 ? "warn" : "bad"}">${v} / ${full[y]}</span>`; } }))],
    MODES.map((m) => Object.assign({ m }, D.coverage[m])));
}

// ---------------- EXTERNAL tab
function renderExternal() {
  const E = D.external;
  if (!E) { $("#external .intro p").textContent = "Run external_factors.py to add this tab's data."; return; }
  const EM = ["TJ + Mikrotrans", "KRL", "MRT", "LRT", "Airport Rail", "Kapal"];
  const eff = (m, f) => E.effects.find((r) => r.mode === m && r.factor === f);
  const fit = Object.fromEntries(E.fit.map((r) => [r.mode, r]));
  const fc = (m, f) => E.forecast.find((r) => r.mode === m && r.features === f);
  const tjFc0 = fc("TJ + Mikrotrans", "Calendar + lags (v1)"), tjFc2 = fc("TJ + Mikrotrans", "+ calendars + observed weather");
  const S5 = E.summary;
  $("#ext-kpis").innerHTML = [
    [`${S5.weather.rain_days_pct.toFixed(0)}%`, "of days had rain (≥0.5 mm)"],
    [`${pct(eff("TJ + Mikrotrans", "Aug 2025 riots").effect_pct, 0)}`, "TJ + Mikrotrans on riot days"],
    [`${pct(eff("Kapal", "Ramadan").effect_pct, 0)}`, "Kapal during Ramadan"],
    [`${fit["Kapal"].r2_calendar_only.toFixed(2)} → ${fit["Kapal"].r2_with_external.toFixed(2)}`, "Kapal R² with outside data"],
    [`${tjFc0.MAPE_all.toFixed(1)}% → ${tjFc2.MAPE_all.toFixed(1)}%`, "TJ forecast error with weather"],
    [`${S5.anomaly_v1_unexplained_days} → ${S5.anomaly_v2_unexplained_days}`, "unexplained anomaly days"],
  ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  const cats = ["Light rain", "Moderate rain", "Heavy rain"];
  plot("#ch-rain", EM.map((m) => { const r = cats.map((c) => eff(m, c)); return { type: "bar", name: m, x: ["Light (0.5–20 mm)", "Moderate (20–50)", "Heavy (≥50)"], y: r.map((x) => x.effect_pct), marker: { color: col(m) },
    error_y: { type: "data", symmetric: false, array: r.map((x) => x.ci_high_pct - x.effect_pct), arrayminus: r.map((x) => x.effect_pct - x.ci_low_pct), color: css("--ink-3"), thickness: 1, width: 2 },
    customdata: r.map((x) => x.p_value), hovertemplate: `<b>${m}</b> %{x}<br>%{y:+.1f}% (p = %{customdata:.3f})<extra></extra>` }; }),
    baseLayout({ barmode: "group", yaxis: Object.assign(baseLayout().yaxis, { ticksuffix: "%", zeroline: true, zerolinecolor: css("--ink-3") }) }));
  const RM = E.rain_monthly;
  plot("#ch-rainm", [{ type: "bar", name: "Rainfall", x: RM.dates, y: RM.rain, marker: { color: css("--accent") }, hovertemplate: "%{x}<br>%{y:.0f} mm<extra></extra>" }],
    baseLayout({ showlegend: false, yaxis: Object.assign(baseLayout().yaxis, { ticksuffix: " mm" }) }));
  const ev = E.event;
  plot("#ch-event", ["TJ + Mikrotrans", "MRT", "KRL", "LRT"].map((m) => { const r = ev.filter((x) => x.mode === m); return { type: "scatter", mode: "lines+markers", name: m, x: r.map((x) => x.date), y: r.map((x) => x.ratio), line: { color: col(m), width: 1.6 }, marker: { size: 4 }, hovertemplate: `<b>${m}</b> %{x|%a %d %b}<br>%{y:.2f} × baseline<extra></extra>` }; }),
    baseLayout({ hovermode: "x unified", shapes: [
      { type: "rect", x0: "2025-08-29", x1: "2025-09-01", yref: "paper", y0: 0, y1: 1, fillcolor: css("--bad"), opacity: .12, line: { width: 0 }, layer: "below" },
      { type: "rect", x0: "2025-09-01", x1: "2025-09-08", yref: "paper", y0: 0, y1: 1, fillcolor: css("--good"), opacity: .10, line: { width: 0 }, layer: "below" },
      { type: "line", x0: "2025-08-18", x1: "2025-09-21", y0: 1, y1: 1, line: { color: css("--ink-3"), width: 1, dash: "dot" } }],
      annotations: [{ x: "2025-08-30", yref: "paper", y: 1.02, text: "Riots", showarrow: false, font: { size: 10, color: css("--ink-2") } },
        { x: "2025-09-04", yref: "paper", y: 1.02, text: "Rp1 fare (TJ, MRT)", showarrow: false, font: { size: 10, color: css("--ink-2") } },
        { x: "2025-09-05", y: 0.45, text: "Maulid Nabi holiday", showarrow: true, arrowhead: 0, ax: 40, ay: 20, font: { size: 10, color: css("--ink-3") } }] }));
  const facs = ["Light rain", "Moderate rain", "Heavy rain", "Max temperature (+1 C)", "Wind (+1 m/s)", "Ramadan", "Lebaran travel window", "School holiday", "Public holiday", "Aug 2025 riots", "Free / Rp1 fare week", "Promotional fare day"];
  table("#tb-eff", [{ h: "Factor", k: "f" }, ...EM.map((m) => ({ h: m, num: 1, f: (r) => { const x = eff(m, r.f); if (!x) return ""; const t = pct(x.effect_pct, 1); return x.p_value < .05 ? `<b>${t}</b>` : `<span class="muted">${t}</span>`; } }))],
    [...facs.map((f) => ({ f })), ]);
  $("#tb-eff").insertAdjacentHTML("beforeend", "<tbody><tr><td><i>R² calendar only → with outside data</i></td>" + EM.map((m) => `<td class="num">${fit[m].r2_calendar_only.toFixed(2)} → <b>${fit[m].r2_with_external.toFixed(2)}</b></td>`).join("") + "</tr></tbody>");
  const sets = ["Calendar + lags (v1)", "+ Ramadan, Lebaran, school calendar", "+ calendars + observed weather", "+ calendars + promo fare days"].filter((x) => fc("KRL", x));
  const FM = ["TJ + Mikrotrans", "KRL", "MRT", "LRT", "Kapal"];
  const bestF = Object.fromEntries(FM.map((m) => [m, Math.min(...sets.map((s) => fc(m, s).MAPE_all))]));
  table("#tb-extfc", [{ h: "Features", f: (r) => esc(r.s) }, ...FM.map((m) => ({ h: m, num: 1, f: (r) => { const v = fc(m, r.s).MAPE_all; return v === bestF[m] ? `<span class="pill good">${v.toFixed(1)}</span>` : v.toFixed(1); } }))], sets.map((s) => ({ s })));
  table("#tb-extan", [{ h: "Explanation", k: "explanation" }, { h: "Days", num: 1, k: "days" }, { h: "Share", num: 1, f: (r) => r.share_pct.toFixed(0) + "%" }], E.anomaly);
  table("#tb-traffic", [{ h: "Year", k: "year" }, { h: "Congestion", num: 1, f: (r) => r.congestion_level_pct.toFixed(1) + "%" }, { h: "10 km trip", num: 1, f: (r) => r.travel_time_10km_min.toFixed(1) + " min" }, { h: "Rush-hour speed", num: 1, f: (r) => r.rush_hour_speed_kmh.toFixed(1) + " km/h" }], E.traffic);
  table("#tb-src", [{ h: "Dataset", k: "dataset" }, { h: "Period", k: "period" }, { h: "Used for", k: "use" }], E.sources);
  renderPromo(E);
}


// ---------------- PROJECTION tab (simulation.py)
const MISS_LAB = { fill: "Filled", drop: "Removed" };
const MISS_COL = { fill: "--s-krl", drop: "--s-tj" };
function hexA(c, a) {
  if (c.startsWith("#") && c.length === 7) { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  return c;
}
function renderProjection() {
  renderSimFit();
  const P = D.sim;
  if (!P) { $("#pj-intro").innerHTML = "No simulation results yet. Run <b>python simulation.py</b> in the thesis folder; it rebuilds this dashboard when it finishes."; return; }
  const ms = $("#pj-mode"), ss = $("#pj-scen");
  if (!ms.options.length) { P.modes.forEach((m) => ms.add(new Option(m, m))); Object.entries(P.scenarios).forEach(([k, l]) => ss.add(new Option(k.replace("_", " "), k))); }
  const m = ms.value, sc = ss.value, miss = $("#pj-miss").value, g = $("#pj-gran").value;
  const vers = miss === "both" ? ["drop", "fill"] : [miss];
  const totalEmpty = Object.values(P.empty_days).reduce((a, b) => a + b, 0);
  $("#pj-intro").innerHTML = `${fmt(P.n_sims)} simulated futures per mode from ${P.data_end} to <b>${P.until}</b>. Each path = fitted trend, weekday, month, holiday, Ramadan and Lebaran effects (with their uncertainty) + real day-to-day noise resampled in 7-day blocks (this carries the weather) + random riot-sized disruptions. Scenario: <i>${esc(P.scenarios[sc])}</i>.`;
  const Y = (v, s_ = sc) => P.yearly.filter((r) => r.missing === v && r.scenario === s_ && r.mode === m);
  const y0 = Y(vers[vers.length - 1]);
  const last = y0[y0.length - 1];
  $("#pj-kpis").innerHTML = [
    [fmt(last.mean_daily_p50), `mean daily passengers in ${last.year} (median)`],
    [`${pct(last.change_vs_prev_year_pct_p50)}`, `${last.year} vs ${last.year - 1} (95 %: ${pct(last.change_vs_prev_year_pct_p2_5)} to ${pct(last.change_vs_prev_year_pct_p97_5)})`],
    [`${last.prob_growth_pct == null ? "–" : last.prob_growth_pct.toFixed(0) + "%"}`, `chance that ${last.year} beats ${last.year - 1}`],
    [`${P.empty_days[m]}`, `empty days for ${m} since ${P.start.slice(0, 4)} (filled with ${P.fill_method.toUpperCase()})`],
  ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`).join("");

  const H = P.history[m][g], tr = [];
  const histFrom = g === "D" ? "2025-07-01" : "2024-01-01";
  const hi = H.x.findIndex((d) => d >= histFrom);
  tr.push({ type: "scatter", mode: "lines", name: "Actual", x: H.x.slice(hi), y: H.y.slice(hi), line: { color: css("--ink"), width: 1.1 }, hovertemplate: "%{x|%d %b %Y}<br>Actual %{y:,.0f}<extra></extra>" });
  vers.forEach((v) => {
    const R = P.runs[`${v}|${sc}`][m][g];
    const c = miss === "both" ? css(MISS_COL[v]) : col(m), lab = miss === "both" ? ` (${MISS_LAB[v]})` : "";
    tr.push({ type: "scatter", mode: "lines", x: R.x, y: R.p97_5, line: { width: 0 }, hoverinfo: "skip", showlegend: false });
    tr.push({ type: "scatter", mode: "lines", x: R.x, y: R.p2_5, fill: "tonexty", fillcolor: hexA(c, .15), line: { width: 0 }, name: "95 % of paths" + lab, hoverinfo: "skip" });
    tr.push({ type: "scatter", mode: "lines", x: R.x, y: R.p90, line: { width: 0 }, hoverinfo: "skip", showlegend: false });
    tr.push({ type: "scatter", mode: "lines", x: R.x, y: R.p10, fill: "tonexty", fillcolor: hexA(c, .3), line: { width: 0 }, name: "80 % of paths" + lab, hoverinfo: "skip" });
    tr.push({ type: "scatter", mode: "lines", x: R.x, y: R.p50, line: { color: c, width: 1.6, dash: v === "drop" && miss === "both" ? "dot" : "solid" }, name: "Median path" + lab,
      customdata: R.x.map((_, i) => [R.p2_5[i], R.p97_5[i]]), hovertemplate: `%{x|%d %b %Y}<br>Median %{y:,.0f}${lab}<br>95 %: %{customdata[0]:,.0f} to %{customdata[1]:,.0f}<extra></extra>` });
  });
  plot("#ch-pj-fan", tr, baseLayout({ hovermode: "x unified", yaxis: { gridcolor: css("--line"), zeroline: false, rangemode: "tozero", tickformat: "~s" },
    shapes: [{ type: "line", x0: P.data_end, x1: P.data_end, yref: "paper", y0: 0, y1: 1, line: { color: css("--ink-3"), width: 1, dash: "dot" } }],
    annotations: [{ x: P.data_end, yref: "paper", y: 1.02, text: "last data day", showarrow: false, xanchor: "left", font: { size: 10, color: css("--ink-3") } }] }));
  $("#pj-fan-title").textContent = `${m}: actual and simulated passengers (${{ D: "daily", W: "weekly mean of daily", M: "monthly mean of daily" }[g]})`;

  const yt = [];
  vers.forEach((v) => {
    const r = Y(v), c = miss === "both" ? css(MISS_COL[v]) : col(m);
    yt.push({ type: "scatter", mode: "lines+markers", name: miss === "both" ? MISS_LAB[v] : m, x: r.map((d) => String(d.year)), y: r.map((d) => d.mean_daily_p50),
      error_y: { type: "data", symmetric: false, array: r.map((d) => d.mean_daily_p97_5 - d.mean_daily_p50), arrayminus: r.map((d) => d.mean_daily_p50 - d.mean_daily_p2_5), color: c, thickness: 1.2, width: 4 },
      marker: { color: r.map((d) => d.source === "actual" ? css("--ink") : c), size: 8 }, line: { color: c, width: 1.2, dash: v === "drop" && miss === "both" ? "dot" : "solid" },
      customdata: r.map((d) => d.source), hovertemplate: "%{x}: %{y:,.0f} per day<br>%{customdata}<extra></extra>" });
  });
  plot("#ch-pj-year", yt, baseLayout({ xaxis: { type: "category", gridcolor: css("--line") }, yaxis: { gridcolor: css("--line"), tickformat: "~s" } }));

  const rowsY = vers.flatMap((v) => Y(v).map((r) => Object.assign({ v }, r)));
  table("#tb-pj-year", [
    ...(miss === "both" ? [{ h: "Empty days", f: (r) => MISS_LAB[r.v] }] : []),
    { h: "Year", f: (r) => `<b>${r.year}</b>` }, { h: "Source", f: (r) => `<span class="pill ${r.source === "actual" ? "good" : r.source === "simulated" ? "info" : "warn"}">${r.source}</span>` },
    { h: "Mean daily", num: 1, f: (r) => fmt(r.mean_daily_p50) + (r.source === "actual" ? "" : `<div class="small muted">${fmt(r.mean_daily_p2_5)} to ${fmt(r.mean_daily_p97_5)}</div>`) },
    { h: "Annual total", num: 1, f: (r) => fmt(r.annual_total_M_p50, 1) + " M" },
    { h: "vs previous year", num: 1, f: (r) => r.change_vs_prev_year_pct_p50 == null ? "–" : pct(r.change_vs_prev_year_pct_p50) + (r.source === "actual" ? "" : `<div class="small muted">${pct(r.change_vs_prev_year_pct_p2_5)} to ${pct(r.change_vs_prev_year_pct_p97_5)}</div>`) },
  ], rowsY);
  $("#pj-year-note").textContent = "Ranges are the 95 % interval of simulated paths";

  const Hd = P.history[m].D, F = P.filled[m];
  plot("#ch-pj-filled", [
    { type: "scatter", mode: "lines", name: "Observed (empty days left out)", x: Hd.x, y: Hd.y, line: { color: css("--ink-3"), width: .8 }, connectgaps: false, hovertemplate: "%{x|%d %b %Y}<br>%{y:,.0f}<extra></extra>" },
    { type: "scatter", mode: "markers", name: `Filled (${P.fill_method.toUpperCase()})`, x: F.x, y: F.y, marker: { color: css("--bad"), size: 6 }, hovertemplate: "%{x|%d %b %Y}<br>Filled %{y:,.0f}<extra></extra>" },
  ], baseLayout({ yaxis: { gridcolor: css("--line"), tickformat: "~s" } }));
  $("#pj-miss-note").innerHTML = `Empty days are flagged reporting breaks and impossible zero counts. <b>Removed</b> leaves them out of the model; <b>Filled</b> replaces them with K-nearest-neighbour estimates (the best method in the Data quality tab). Empty days since ${P.start.slice(0, 4)}: ${Object.entries(P.empty_days).map(([k, v]) => `${esc(k)} ${v}`).join(", ")}. ${totalEmpty < 50 ? "With this few empty days the two give almost the same projection; run <b>python simulation.py --start 2023-01-01</b> to include 2023 and its larger gaps." : ""}`;
  const years = Object.keys(P.comparison[0]).filter((k) => /^change_\d{4}_vs_prev_pct$/.test(k)).map((k) => k.slice(7, 11));
  const C = P.comparison;
  table("#tb-pj-cmp", [{ h: "Mode", f: (r) => sw(r.mode) }, { h: "Empty days", f: (r) => `<span class="pill ${r.missing === "fill" ? "info" : "warn"}">${MISS_LAB[r.missing]}</span>` },
    { h: "Days filled", num: 1, f: (r) => r.days_filled }, { h: "Days used", num: 1, f: (r) => r.days_used_for_fit },
    { h: "Growth / year", num: 1, f: (r) => pct(r.annual_trend_pct) },
    ...years.map((y) => ({ h: `${y} vs ${y - 1}`, num: 1, f: (r) => pct(r[`change_${y}_vs_prev_pct`]) })),
    ...(C[0].backtest_MAPE != null ? [{ h: "Backtest MAPE", num: 1, f: (r) => r.backtest_MAPE.toFixed(1) + "%" }, { h: "95 % band hit", num: 1, f: (r) => r.backtest_cover95.toFixed(0) + "%" }] : []),
  ], [...C].sort((a, b) => P.modes.indexOf(a.mode) - P.modes.indexOf(b.mode) || (a.missing === "drop" ? -1 : 1)));

  const BT = P.backtest[miss === "drop" ? "drop" : "fill"] || [];
  table("#tb-pj-bt", [{ h: "Mode", f: (r) => sw(r.mode) }, { h: "Simulation MAPE", num: 1, f: (r) => r.MAPE_median_path.toFixed(1) + "%" }, { h: "Holt-Winters MAPE", num: 1, f: (r) => r.HW_MAPE_ch4 == null ? "–" : r.HW_MAPE_ch4.toFixed(1) + "%" },
    { h: "Actual inside 80 % band", num: 1, f: (r) => r.coverage_80pct.toFixed(0) + "%" }, { h: "Actual inside 95 % band", num: 1, f: (r) => `<span class="pill ${r.coverage_95pct >= 90 ? "good" : "warn"}">${r.coverage_95pct.toFixed(0)}%</span>` },
    { h: "Actual total", num: 1, f: (r) => fmt(r.actual_total_M, 1) + " M" }, { h: "Simulated total (95 %)", num: 1, f: (r) => `${fmt(r.sim_total_p50_M, 1)} M<div class="small muted">${fmt(r.sim_total_p2_5_M, 1)} to ${fmt(r.sim_total_p97_5_M, 1)}</div>` }], BT);
}

// ---------------- RAW DATA BY YEAR tab
const RW_MODES = ["TJ + Mikrotrans", "TransJakarta", "KRL", "MRT", "Bus Sekolah", "LRT", "Airport Rail", "Kapal", "Mikrotrans"];
const YEAR_ALPHA = [0.35, 0.55, 0.8, 1];
function rawSeries(m, src) {
  if (m === "TJ + Mikrotrans") {
    if (src === "clean") return D.tjm;
    const tj = D.daily_raw["TransJakarta"], mk = D.daily_raw["Mikrotrans"];
    const t = Object.fromEntries(mk.x.map((x, i) => [x, mk.y[i]]));
    return { x: tj.x, y: tj.y.map((v, i) => v + (t[tj.x[i]] || 0)) };
  }
  return (src === "clean" ? D.daily : D.daily_raw)[m];
}
function smooth(s, g) {
  if (g === "D") return s;
  if (g === "M") {
    const acc = new Map();
    s.x.forEach((d, i) => { const k = d.slice(0, 7) + "-15"; const a = acc.get(k) || [0, 0]; if (s.y[i] != null) { a[0] += s.y[i]; a[1]++; } acc.set(k, a); });
    const x = [], y = []; [...acc.entries()].sort().forEach(([k, [t, n]]) => { if (n) { x.push(k); y.push(t / n); } });
    return { x, y };
  }
  // trailing 7-day average over calendar days (needs at least 4 recorded days in the window)
  const m = new Map(s.x.map((d, i) => [d, s.y[i]]));
  const y = s.x.map((d) => { const dt = new Date(d + "T00:00:00Z"); let t = 0, n = 0; for (let k = 0; k < 7; k++) { const v = m.get(new Date(dt - k * 864e5).toISOString().slice(0, 10)); if (v != null) { t += v; n++; } } return n >= 4 ? t / n : null; });
  return { x: s.x, y };
}
function byYear(s) {
  const out = {};
  s.x.forEach((d, i) => { const yr = d.slice(0, 4); (out[yr] = out[yr] || { x: [], y: [], d: [] }); out[yr].x.push("2000" + d.slice(4)); out[yr].y.push(s.y[i]); out[yr].d.push(d); });
  return out;
}
function renderRaw() {
  const ms = $("#rw-mode");
  if (!ms.options.length) RW_MODES.forEach((m) => ms.add(new Option(m, m)));
  const m = ms.value, src = $("#rw-src").value, g = $("#rw-gran").value, view = $("#rw-view").value;
  const base = rawSeries(m, src), s = smooth(base, g), c = col(m === "TJ + Mikrotrans" ? "TransJakarta" : m);
  const years = byYear(s), yrs = Object.keys(years).sort();
  const unit = { D: "Daily passengers", R7: "7-day average of daily passengers", M: "Monthly mean of daily passengers" }[g];
  $("#rw-title").textContent = `${m}: ${unit.toLowerCase()}`;
  $("#rw-eyebrow").textContent = src === "raw" ? "As published by data.go.id" : "Cleaned analysis set";
  let traces, L;
  if (view === "overlay") {
    traces = yrs.map((yr, i) => ({ type: "scatter", mode: g === "M" ? "lines+markers" : "lines", name: yr, x: years[yr].x, y: years[yr].y, customdata: years[yr].d,
      line: { color: hexA(c, YEAR_ALPHA[Math.max(0, YEAR_ALPHA.length - yrs.length + i)] ?? 1), width: i === yrs.length - 1 ? 2.4 : 1.4 }, marker: { size: 5 }, connectgaps: false,
      hovertemplate: `<b>${yr}</b> %{customdata|%a %d %b}<br>%{y:,.0f} passengers<extra></extra>` }));
    L = baseLayout({ hovermode: "closest" });
    L.xaxis = Object.assign(L.xaxis, { type: "date", tickformat: "%b", dtick: "M1", range: ["2000-01-01", "2000-12-31"] });
  } else {
    traces = yrs.map((yr, i) => ({ type: "scatter", mode: g === "M" ? "lines+markers" : "lines", name: yr, x: years[yr].d, y: years[yr].y,
      line: { color: hexA(c, YEAR_ALPHA[Math.max(0, YEAR_ALPHA.length - yrs.length + i)] ?? 1), width: g === "D" ? 1.2 : 2 }, marker: { size: 5 }, connectgaps: false,
      hovertemplate: `%{x|%a %d %b %Y}<br>%{y:,.0f} passengers<extra></extra>` }));
    L = baseLayout({ hovermode: "closest" });
  }
  L.yaxis = Object.assign(L.yaxis, { title: { text: "Passengers per day", font: { size: 11 } }, rangemode: "tozero" });
  plot("#ch-raw", traces, L);
  const notes = [];
  if (src === "raw" && ["TransJakarta", "TJ + Mikrotrans"].includes(m)) notes.push("TransJakarta reported only part of its passengers from March to August 2023 (flagged reporting break).");
  if (src === "raw" && m === "TransJakarta") notes.push("From January 2026 Mikrotrans is reported separately, so TransJakarta alone drops by about 40%; choose TJ + Mikrotrans to compare across years.");
  if (src === "raw" && ["KRL", "Airport Rail"].includes(m)) notes.push("KRL and Airport Rail counts are doubled from 13 to 31 December 2025 (flagged reporting break); March 2023 is missing.");
  if (m === "Mikrotrans") notes.push("Mikrotrans is reported on its own only from January 2026.");
  if (m === "Bus Sekolah") notes.push("Zero days are school holidays, when the school bus does not run.");
  notes.push("2026 covers January to June only.");
  $("#rw-note").textContent = notes.join(" ");
  // year summary from the daily data (not smoothed)
  const by = byYear(base); let prev = null;
  const rows = Object.keys(by).sort().map((yr) => {
    const v = by[yr].y.filter((x) => x != null), pos = v.filter((x) => x > 0);
    const mean = pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : null;
    const jj = by[yr].y.filter((x, i) => x > 0 && by[yr].d[i].slice(5, 7) <= "06"), jm = jj.length ? jj.reduce((a, b) => a + b, 0) / jj.length : null;
    const r = { yr, days: v.length, zero: v.length - pos.length, mean, jm, min: pos.length ? Math.min(...pos) : null, max: pos.length ? Math.max(...pos) : null, total: v.reduce((a, b) => a + b, 0), g: prev && jm ? (jm / prev - 1) * 100 : null };
    prev = jm; return r;
  });
  table("#tb-raw", [{ h: "Year", k: "yr" }, { h: "Days recorded", num: 1, f: (r) => fmt(r.days) }, { h: "Zero days", num: 1, f: (r) => fmt(r.zero) },
    { h: "Mean per operating day", num: 1, f: (r) => fmt(r.mean) }, { h: "Lowest day", num: 1, f: (r) => fmt(r.min) }, { h: "Highest day", num: 1, f: (r) => fmt(r.max) },
    { h: "Total recorded", num: 1, f: (r) => fmt(r.total) }, { h: "Mean Jan to Jun", num: 1, f: (r) => fmt(r.jm) },
    { h: "Jan to Jun vs previous year", num: 1, f: (r) => r.g == null ? "–" : `<span class="pill ${r.g >= 0 ? "good" : "bad"}">${pct(r.g)}</span>` }], rows);
  $("#rw-tb-note").textContent = "Totals are over recorded days only; growth compares January to June";
  // small multiples
  const box = $("#rw-small");
  if (!box.children.length) RW_MODES.filter((x) => x !== "TransJakarta").forEach((x) => { const id = "ch-rws-" + x.replace(/[^A-Za-z]/g, ""); box.insertAdjacentHTML("beforeend", `<div class="panel c4"><div class="head"><h3 style="font-size:1rem">${esc(x)}</h3></div><div class="chart" style="min-height:200px" id="${id}"></div></div>`); });
  RW_MODES.filter((x) => x !== "TransJakarta").forEach((x) => {
    const id = "#ch-rws-" + x.replace(/[^A-Za-z]/g, ""), cc = col(x === "TJ + Mikrotrans" ? "TransJakarta" : x);
    const yy = byYear(smooth(rawSeries(x, src), "M")), ks = Object.keys(yy).sort();
    const tr = ks.map((yr, i) => ({ type: "scatter", mode: "lines", name: yr, x: yy[yr].x, y: yy[yr].y, line: { color: hexA(cc, YEAR_ALPHA[Math.max(0, YEAR_ALPHA.length - ks.length + i)] ?? 1), width: i === ks.length - 1 ? 2.2 : 1.3 }, hovertemplate: `<b>${yr}</b> %{x|%b}<br>%{y:,.0f}<extra></extra>` }));
    const LL = baseLayout({ margin: { l: 48, r: 8, t: 4, b: 28 }, legend: { orientation: "h", y: -0.25, font: { size: 10 } } });
    LL.xaxis = Object.assign(LL.xaxis, { type: "date", tickformat: "%b", dtick: "M2", range: ["2000-01-01", "2000-12-31"] });
    LL.yaxis = Object.assign(LL.yaxis, { rangemode: "tozero", tickfont: { size: 10 } });
    plot(id, tr, LL);
  });
}

// ---------------- STATISTICAL TESTS tab
const P3 = (p) => p == null ? "–" : p < 0.001 ? "<0.001" : p.toFixed(3);
const sig = (p, txt) => p != null && p < 0.05 ? `<b>${txt}</b>` : txt;
function renderTests() {
  renderDunn();
  const T = D.tests;
  if (!T) { $("#ts-intro").innerHTML += " <b>No test results in this build yet.</b>"; return; }
  // KPIs
  const dmCore = T.dm.filter((r) => r.loss === "|% error|" && r.model_1 === "Holt-Winters" && r.model_2 === "Seasonal naive");
  const best = {}; T.cv_summary.forEach((r) => { if (!best[r.mode] || r.mean < best[r.mode].mean) best[r.mode] = r; });
  const lbOk = T.lb.filter((r) => r.white_noise_at_5pct).length;
  const brk = T.chow.filter((r) => r.series === "published (raw)" && r.break_detected).length, brkN = T.chow.filter((r) => r.series === "published (raw)").length;
  $("#ts-kpis").innerHTML = [
    [`${dmCore.filter((r) => r.p < 0.05 && r.DM < 0).length}/${dmCore.length}`, "modes where Holt-Winters beats the seasonal naive significantly"],
    [`${Object.values(best).filter((r) => r.model !== "Holt-Winters").length}/${Object.keys(best).length}`, "modes where another model beats Holt-Winters on 28-day forecasts"],
    [`${brk}/${brkN}`, "known reporting breaks confirmed by a break test"],
    [`${lbOk}/${T.lb.length}`, "residual series with no pattern left (Ljung-Box)"],
  ].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`).join("");
  // rolling CV
  const cm = $("#ts-cv-mode");
  if (!cm.options.length) [...new Set(T.cv.map((r) => r.mode))].forEach((m) => cm.add(new Option(m, m)));
  const m = cm.value, MC = { "Seasonal naive": "--ink-3", "Holt-Winters": "--s-tj", "Log-linear regression": "--s-mrt", "GBM calendar-only": "--s-krl" };
  const models = Object.keys(MC);
  plot("#ch-ts-cv", models.map((k) => { const r = T.cv.filter((x) => x.mode === m && x.model === k); return { type: "scatter", mode: "lines+markers", name: k, x: r.map((x) => x.origin), y: r.map((x) => x.MAPE), line: { color: css(MC[k]), width: 2 }, marker: { size: 6 }, hovertemplate: `<b>${k}</b><br>origin %{x|%b %Y}<br>MAPE %{y:.1f}%<extra></extra>` }; }),
    Object.assign(baseLayout({ hovermode: "closest" }), { yaxis: Object.assign(baseLayout().yaxis, { title: { text: "MAPE next 28 days (%)", font: { size: 11 } }, rangemode: "tozero" }) }));
  table("#tb-ts-cv", [{ h: "Model", k: "model" }, { h: "Origins", num: 1, k: "origins" }, { h: "Mean MAPE", num: 1, f: (r) => r.mean.toFixed(1) + "%" }, { h: "SD", num: 1, f: (r) => r.sd.toFixed(1) }, { h: "Median", num: 1, f: (r) => r.median.toFixed(1) + "%" }, { h: "Worst", num: 1, f: (r) => r.worst.toFixed(1) + "%" }, { h: "Best on origins", num: 1, k: "best_on_origins" },
    { h: "DM vs Holt-Winters", num: 1, f: (r) => r.DM_vs_HoltWinters == null ? "reference" : sig(r.p, `${r.DM_vs_HoltWinters.toFixed(2)} (p ${P3(r.p)})`) }],
    T.cv_summary.filter((r) => r.mode === m).sort((a, b) => a.mean - b.mean));
  // DM single split
  table("#tb-ts-dm", [{ h: "Mode", f: (r) => sw(r.mode) }, { h: "Model 1", k: "model_1" }, { h: "Model 2", k: "model_2" }, { h: "MAPE 1", num: 1, f: (r) => r.MAPE_1.toFixed(1) + "%" }, { h: "MAPE 2", num: 1, f: (r) => r.MAPE_2.toFixed(1) + "%" }, { h: "DM", num: 1, f: (r) => r.DM.toFixed(2) }, { h: "p", num: 1, f: (r) => sig(r.p, P3(r.p)) },
    { h: "Verdict", f: (r) => `<span class="pill ${r.verdict === "no significant difference" ? "info" : r.verdict === "model 1 better" ? "good" : "warn"}">${esc(r.verdict)}</span>` }],
    T.dm.filter((r) => r.loss === "|% error|"));
  // Bai-Perron
  const bs = $("#ts-bp-series");
  if (!bs.options.length) Object.keys(T.bp_series).forEach((k) => bs.add(new Option(k, k)));
  const B = T.bp_series[bs.value];
  plot("#ch-ts-bp", [{ type: "scatter", mode: "lines", name: "Weekly median, Tue to Thu", x: B.x, y: B.y, line: { color: css("--ink-3"), width: 1.2 } },
    { type: "scatter", mode: "lines", name: "Fitted segments", x: B.x, y: B.fit, line: { color: css("--bad"), width: 2.4 } }],
    baseLayout({ hovermode: "x unified", shapes: B.breaks.map((d) => ({ type: "line", x0: d, x1: d, yref: "paper", y0: 0, y1: 1, line: { color: css("--bad"), width: 1, dash: "dot" } })) }));
  table("#tb-ts-bp", [{ h: "Series", k: "series" }, { h: "Break (week ending)", k: "break_week_ending" }, { h: "Fitted jump", num: 1, f: (r) => r.fitted_jump_pct == null ? "–" : pct(r.fitted_jump_pct) }, { h: "Known events within 5 weeks", k: "known_events_within_5_weeks" }], T.bp);
  table("#tb-ts-chow", [{ h: "Date tested", f: (r) => `${esc(r.break)}<div class="small muted">${esc(r.date)}</div>` }, { h: "Series", f: (r) => `${esc(r.mode)}<div class="small muted">${esc(r.series)}</div>` }, { h: "Level shift", num: 1, f: (r) => pct(r.level_shift_pct) }, { h: "p (level, HAC)", num: 1, f: (r) => sig(r.p_level_HAC, P3(r.p_level_HAC)) },
    { h: "Chow F p", num: 1, f: (r) => P3(r.p_F) }, { h: "Chow HAC p", num: 1, f: (r) => P3(r.p_HAC) }, { h: "Break?", f: (r) => `<span class="pill ${r.break_detected ? "warn" : "good"}">${r.break_detected ? "yes" : "no"}</span>` }, { h: "What it tests", f: (r) => `<span class="small">${esc(r.note)}</span>` }], T.chow);
  const kp = (p) => p <= 0.01 ? "≤0.01" : p >= 0.1 ? "≥0.10" : p.toFixed(3);
  table("#tb-ts-st", [{ h: "Mode", k: "mode" }, { h: "Series", k: "series" }, { h: "ADF p", num: 1, f: (r) => P3(r.ADF_p) }, { h: "KPSS p", num: 1, f: (r) => kp(r.KPSS_level_p) }, { h: "Verdict", f: (r) => `<span class="small">${esc(r.verdict)}</span>` }], T.stationarity);
  table("#tb-ts-lb", [{ h: "Model", f: (r) => `<span class="small">${esc(r.model)}</span>` }, { h: "Mode", k: "mode" }, { h: "ACF lag 1", num: 1, f: (r) => r.acf_lag1.toFixed(2) }, { h: "Q(28)", num: 1, f: (r) => r.LB_Q28.toFixed(0) }, { h: "p", num: 1, f: (r) => P3(r.LB_p28) }, { h: "", f: (r) => `<span class="pill ${r.white_noise_at_5pct ? "good" : "warn"}">${r.white_noise_at_5pct ? "white noise" : "pattern left"}</span>` }], T.lb);
  table("#tb-ts-kw", [{ h: "Test", k: "test" }, { h: "Mode", k: "mode" }, { h: "Groups", num: 1, k: "groups" }, { h: "H", num: 1, f: (r) => fmt(r.H, 1) }, { h: "p", num: 1, f: (r) => sig(r.p, P3(r.p)) }, { h: "ε²", num: 1, f: (r) => r.epsilon_sq.toFixed(3) }, { h: "Dunn: significant pairs", num: 1, f: (r) => `${r.dunn_significant} of ${r.dunn_pairs}` }, { h: "Pairs not different", f: (r) => `<span class="small">${esc(r.not_different_pairs || "none")}</span>` }], T.kw);
  // bootstrap
  const qs = $("#ts-boot-q");
  if (!qs.options.length) [...new Set(T.boot.map((r) => r.quantity))].forEach((q) => qs.add(new Option(q, q)));
  const rows = T.boot.filter((r) => r.quantity === qs.value).slice().reverse();
  plot("#ch-ts-boot", [{ type: "scatter", mode: "markers", x: rows.map((r) => r.estimate), y: rows.map((r) => r.mode), marker: { size: 9, color: rows.map((r) => col(r.mode === "TJ + Mikrotrans" ? "TransJakarta" : r.mode)) },
    error_x: { type: "data", symmetric: false, array: rows.map((r) => r.ci_high - r.estimate), arrayminus: rows.map((r) => r.estimate - r.ci_low), thickness: 3, width: 0, color: css("--ink-3") },
    customdata: rows.map((r) => [r.ci_low, r.ci_high]), hovertemplate: "<b>%{y}</b><br>%{x:.2f} (95%: %{customdata[0]:.2f} to %{customdata[1]:.2f})<extra></extra>" }],
    baseLayout({ showlegend: false, margin: { l: 120, r: 16, t: 8, b: 40 }, shapes: qs.value.startsWith("Mode share") ? [] : [{ type: "line", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1, line: { color: css("--ink-2"), width: 1 } }] }));
}

// ---------------- PYTHON FIGURES (static PNGs from figures/, embedded by build_dashboard.py)
const FIGS = D.figs || [];
const figLabel = (f) => f.num ? `Fig. ${f.num}` : "Figure";
function figCard(f) {
  return `<button type="button" class="fig" data-file="${esc(f.file)}"><div class="im"><img loading="lazy" src="${f.src}" alt="${esc(f.caption)}"></div>` +
    `<div class="cap"><span class="n">${figLabel(f)}</span>${esc(f.caption)}<span class="src">${esc(f.script)} · ${esc(f.file)}</span></div></button>`;
}
function wireFigs(box) {
  box.querySelectorAll(".fig").forEach((b) => b.addEventListener("click", () => {
    const f = FIGS.find((x) => x.file === b.dataset.file); if (!f) return;
    $("#lb-img").src = f.src; $("#lb-img").alt = f.caption;
    $("#lb-cap").innerHTML = `<b>${figLabel(f)}</b> ${esc(f.caption)} <span style="opacity:.6">(${esc(f.script)})</span>`;
    const dlg = $("#lightbox"); if (dlg.showModal) dlg.showModal(); else window.open(f.src);
  }));
}
const stripDone = {};
function fillFigStrips(tab) {
  if (stripDone[tab]) return; stripDone[tab] = true;
  document.querySelectorAll(`[data-figs="${tab}"]`).forEach((box) => {
    const fs = FIGS.filter((f) => f.tab === tab);
    if (!fs.length) { box.closest(".panel").hidden = true; return; }
    box.innerHTML = fs.map(figCard).join(""); wireFigs(box);
  });
}
function renderFigures() {
  const sel = $("#fg-group"), groups = [...new Set(FIGS.map((f) => f.group))];
  if (sel.options.length === 1) groups.forEach((g) => sel.add(new Option(g, g)));
  const g = sel.value, show = groups.filter((x) => g === "all" || x === g);
  if (!FIGS.length) { $("#fg-all").innerHTML = '<p class="muted">No figures found. Run the analysis scripts, then build_dashboard.py.</p>'; return; }
  const n = FIGS.filter((f) => g === "all" || f.group === g).length;
  $("#fg-count").textContent = `${n} figure${n === 1 ? "" : "s"}`;
  $("#fg-all").innerHTML = show.map((x) => `<div class="figgroup"><h3>${esc(x)}</h3><div class="figs wide">${FIGS.filter((f) => f.group === x).map(figCard).join("")}</div></div>`).join("");
  wireFigs($("#fg-all"));
}

// ---------------- extra interactive results
function renderDunn() {
  const T = D.tests; if (!T || !T.dunn || !T.dunn.length) { $("#ch-ts-dunn").closest(".panel").hidden = true; return; }
  const ts = $("#ts-dunn-test"), ms = $("#ts-dunn-mode");
  if (!ts.options.length) [...new Set(T.dunn.map((r) => r.test))].forEach((t) => ts.add(new Option(t, t)));
  if (!ms.options.length) [...new Set(T.dunn.filter((r) => r.test === ts.value).map((r) => r.mode))].forEach((m) => ms.add(new Option(m, m)));
  const rows = T.dunn.filter((r) => r.test === ts.value && r.mode === ms.value);
  const G = []; rows.forEach((r) => { if (!G.includes(r.a)) G.push(r.a); if (!G.includes(r.b)) G.push(r.b); });
  const P = {}; rows.forEach((r) => { P[r.a + "|" + r.b] = r; P[r.b + "|" + r.a] = r; });
  const z = G.map((y) => G.map((x) => { const r = P[x + "|" + y]; return x === y || !r ? null : Math.min(6, -Math.log10(Math.max(r.p_adj, 1e-12))); }));
  const txt = G.map((y) => G.map((x) => { const r = P[x + "|" + y]; return x === y || !r ? "" : (r.significant ? (r.p_adj < .001 ? "<.001" : r.p_adj.toFixed(3)) : "ns"); }));
  plot("#ch-ts-dunn", [{ type: "heatmap", x: G, y: G, z, text: txt, texttemplate: "%{text}", textfont: { size: 10, color: css("--ink") }, zmin: 0, zmax: 6, xgap: 2, ygap: 2, hoverongaps: false,
    colorscale: [[0, css("--surface-2")], [0.22, css("--surface-2")], [0.23, css("--accent-soft")], [1, css("--accent")]],
    colorbar: { title: { text: "−log10 p", font: { size: 11 } }, thickness: 10, outlinewidth: 0, tickfont: { size: 10, color: css("--ink-2") } },
    hovertemplate: "%{y} vs %{x}<br>adjusted p: %{text}<extra></extra>" }],
    baseLayout({ showlegend: false, margin: { l: 110, r: 10, t: 8, b: 90 }, yaxis: Object.assign(baseLayout().yaxis, { autorange: "reversed", gridcolor: "rgba(0,0,0,0)" }), xaxis: Object.assign(baseLayout().xaxis, { gridcolor: "rgba(0,0,0,0)", tickangle: -35 }) }));
  const sig = rows.filter((r) => r.significant).length;
  $("#ts-dunn-note").textContent = `${sig} of ${rows.length} pairs differ significantly at 5% after Holm adjustment. "ns" = not significantly different.`;
}
function renderSimFit() {
  const P = D.sim; if (!P || !P.fit) return;
  const rows = P.fit[$("#pj-miss").value === "drop" ? "drop" : "fill"] || [];
  table("#tb-pj-fit", [{ h: "Mode", f: (r) => `<span class="sw" style="background:${col(r.mode === "TJ + Mikrotrans" ? "TransJakarta" : r.mode)}"></span>${esc(r.mode)}` }, { h: "Annual trend", num: 1, f: (r) => pct(r.trend) },
    { h: "95% interval", num: 1, f: (r) => `${pct(r.lo)} to ${pct(r.hi)}` }, { h: "R²", num: 1, f: (r) => r.r2.toFixed(2) }, { h: "Days", num: 1, f: (r) => fmt(r.n) }], rows);
}
function renderPromo(E) {
  if (E.promo_days && E.promo_days.length) {
    const PM = [...new Set(E.promo_days.map((r) => r.mode))];
    plot("#ch-promo", PM.map((m) => { const r = E.promo_days.filter((x) => x.mode === m); const c = col(m === "TJ + Mikrotrans" ? "TransJakarta" : m);
      return { type: "scatter", mode: "markers", name: m, x: r.map((x) => x.date), y: r.map((x) => x.ratio), marker: { size: 8, color: c, line: { width: 1, color: css("--surface") } },
        customdata: r.map((x) => [x.event, x.weekday]), hovertemplate: `<b>${m}</b> %{x}<br>%{customdata[0]}<br>%{y:.2f}× usual %{customdata[1]}<extra></extra>` }; }),
      baseLayout({ yaxis: Object.assign(baseLayout().yaxis, { ticksuffix: "×" }), shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 1, y1: 1, line: { color: css("--ink-3"), width: 1, dash: "dot" } }] }));
  } else $("#ch-promo").closest(".panel").hidden = true;
  if (E.promo_summary) table("#tb-promo", [{ h: "Mode", k: "mode" }, { h: "Days", num: 1, k: "days" }, { h: "Median ratio", num: 1, f: (r) => r.median_ratio.toFixed(2) + "×" },
    { h: "Range", num: 1, f: (r) => `${r.min_ratio.toFixed(2)} to ${r.max_ratio.toFixed(2)}` }, { h: "p", num: 1, f: (r) => r.wilcoxon_p == null ? "–" : (r.wilcoxon_p < .001 ? "<0.001" : r.wilcoxon_p.toFixed(3)) }], E.promo_summary);
  if (E.fit) table("#tb-extfit", [{ h: "Mode", k: "mode" }, { h: "R² calendar only", num: 1, f: (r) => r.r2_calendar_only.toFixed(3) }, { h: "R² with outside data", num: 1, f: (r) => r.r2_with_external.toFixed(3) },
    { h: "Adj. R² gain", num: 1, f: (r) => "+" + (r.adj_r2_with_external - r.adj_r2_calendar_only).toFixed(3) }, { h: "F", num: 1, f: (r) => r.F.toFixed(1) },
    { h: "p", num: 1, f: (r) => r.p_value < .001 ? '<span class="pill good">&lt;0.001</span>' : r.p_value.toFixed(3) }, { h: "Days", num: 1, f: (r) => fmt(r.n_days) }], E.fit);
}

// ---------------- render
const R = { overview: renderOverview, trends: renderTrends, raw: renderRaw, tests: renderTests, cycles: renderCycles, patterns: renderPatterns, model: renderModel, projection: renderProjection, external: renderExternal, quality: renderQuality, figures: renderFigures };
function render() { syncFilters(); R[S.tab](); fillFigStrips(S.tab); }
function rerenderAll() { render(); }

buildChips();
$("#span-note").textContent = `${fmt(D.log.clean_rows)} daily records · 8 modes · 1 Jan 2023 to 30 Jun 2026`;
document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; save(); render(); window.dispatchEvent(new Event("resize")); }));
$("#period").addEventListener("change", (e) => { S.period = e.target.value; save(); render(); });
$("#harm").addEventListener("change", (e) => { S.harm = e.target.checked; save(); render(); });
$("#showflag").addEventListener("change", (e) => { S.flag = e.target.checked; save(); render(); });
$("#reset").addEventListener("click", () => { const t = S.tab; S = JSON.parse(JSON.stringify(DEFAULT)); S.tab = t; save(); render(); });
["#gran", "#scale", "#holmark"].forEach((s) => $(s).addEventListener("change", renderTrends));
$("#an-filter").addEventListener("change", renderPatterns);
$("#fc-mode").addEventListener("change", renderModel);
["#pj-mode", "#pj-scen", "#pj-miss", "#pj-gran"].forEach((s) => $(s).addEventListener("change", renderProjection));
["#rw-mode", "#rw-src", "#rw-gran", "#rw-view"].forEach((s) => $(s).addEventListener("change", renderRaw));
["#ts-cv-mode", "#ts-bp-series", "#ts-boot-q", "#ts-dunn-mode"].forEach((s) => $(s).addEventListener("change", renderTests));
$("#flag-mode").addEventListener("change", renderQuality);
$("#ts-dunn-test").addEventListener("change", () => { $("#ts-dunn-mode").innerHTML = ""; renderTests(); });
$("#fg-group").addEventListener("change", renderFigures);
$("#lb-close").addEventListener("click", () => $("#lightbox").close());
$("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("#lightbox").close(); });
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerenderAll); } catch (e) {}
new MutationObserver(rerenderAll).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
render();
})();
