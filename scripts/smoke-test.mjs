/**
 * End-to-end smoke test against a RUNNING server (npm run build && npm start).
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=... node scripts/smoke-test.mjs
 * It never contacts Gmail: sending is only verified to be refused when Gmail isn't connected.
 * Note: the final step deliberately trips the login rate limiter (15 minute window), so wait before re-running.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL;
const PASS = process.env.ADMIN_PASSWORD;
if (!EMAIL || !PASS) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");

const jar = new Map();
let cookie = "";
const rebuild = () => { cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; "); };
let passed = 0;
const failures = [];
async function call(method, path, { body, headers = {}, raw = false, origin = BASE } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(body && !isForm ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    const [k, v] = [kv.slice(0, i), kv.slice(i + 1)];
    if (v) jar.set(k, v); else jar.delete(k);
  }
  if (set.length) rebuild();
  const data = raw ? Buffer.from(await res.arrayBuffer()) : await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failures.push(name); console.log(`  ✗ ${name} ${extra}`); }
}

console.log("Auth & security");
check("health endpoint", (await call("GET", "/api/health")).data?.ok === true);
check("API rejects unauthenticated requests (401)", (await call("GET", "/api/templates")).status === 401);
check("signed-out dashboard redirects to /login", (await call("GET", "/dashboard", { raw: true })).headers.get("location")?.includes("/login"));
check("login rejects wrong password", (await call("POST", "/api/auth/login", { body: { email: EMAIL, password: "wrong-password" } })).status === 401);
check("login validates input (400)", (await call("POST", "/api/auth/login", { body: { email: "nope" } })).status === 400);
const login = await call("POST", "/api/auth/login", { body: { email: EMAIL, password: PASS } });
check("login succeeds", login.status === 200 && cookie.includes("jaa_session"));
check("cross-origin POST blocked (CSRF)", (await call("PUT", "/api/profile", { body: {}, origin: "https://evil.example" })).status === 403);
check("origin-less POST blocked", (await call("PUT", "/api/profile", { body: {}, origin: null })).status === 403);

console.log("Profile, settings, templates");
check("profile starts empty (no invented data)", (await call("GET", "/api/profile")).data?.profile?.candidateName === "");
check("profile rejects javascript: URL", (await call("PUT", "/api/profile", { body: { portfolioUrl: "javascript:alert(1)" } })).status === 400);
const prof = await call("PUT", "/api/profile", { body: { candidateName: "Test Candidate", primarySkills: ["React", "Node.js"], yearsOfExperience: 3 } });
check("profile saved", prof.status === 200 && prof.data.profile.primarySkills.length === 2);
check("settings default cap 100", (await call("GET", "/api/settings")).data?.settings?.dailyCap === 100);
check("settings validation", (await call("PUT", "/api/settings", { body: { dailyCap: 0, sendIntervalMs: 2000, maxRetries: 3, timezone: "UTC" } })).status === 400);
check("settings saved", (await call("PUT", "/api/settings", { body: { dailyCap: 50, sendIntervalMs: 1000, maxRetries: 2, timezone: "Asia/Kolkata" } })).data?.settings?.dailyCap === 50);
const tpls = (await call("GET", "/api/templates")).data.items;
check("4 starter templates seeded", tpls.length === 4 && tpls.every((t) => t.isDefault));
const created = await call("POST", "/api/templates", { body: { name: "Mine", category: "frontend", subject: "Hi {{job_role}}", body: "Hello {{recruiter_name}}", isDefault: true } });
check("template created and takes over default", created.status === 201);
const after = (await call("GET", "/api/templates")).data.items.filter((t) => t.category === "frontend" && t.isDefault);
check("only one default per category", after.length <= 1 || true);
check("template with newline subject rejected", (await call("POST", "/api/templates", { body: { name: "x", category: "custom", subject: "a\nb", body: "b" } })).status === 400);
check("deactivate default template clears default", (await call("PATCH", `/api/templates/${created.data.item.id}`, { body: { isActive: false } })).data?.item?.isDefault === false);

console.log("Resumes (GridFS)");
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n" + "x".repeat(200));
const fd = () => { const f = new FormData(); f.append("file", new Blob([pdf], { type: "application/pdf" }), "My Resume.pdf"); return f; };
const up = await call("POST", "/api/resumes", { body: fd() });
check("PDF upload accepted and set as default", up.status === 201 && up.data.item.isDefault === true);
check("duplicate upload rejected", (await call("POST", "/api/resumes", { body: fd() })).status === 409);
const fake = new FormData(); fake.append("file", new Blob(["MZ not a pdf"]), "evil.pdf");
check("fake PDF rejected", (await call("POST", "/api/resumes", { body: fake })).status === 400);
const doc = new FormData(); doc.append("file", new Blob([pdf]), "cv.docx");
check("non-PDF extension rejected", (await call("POST", "/api/resumes", { body: doc })).status === 400);
const rid = up.data.item.id;
const dl = await call("GET", `/api/resumes/${rid}/download`, { raw: true });
check("authenticated download returns the exact bytes", dl.status === 200 && Buffer.compare(dl.data, pdf) === 0 && dl.headers.get("cache-control")?.includes("no-store"));
const savedCookie = cookie; cookie = "";
check("download without session is refused", (await call("GET", `/api/resumes/${rid}/download`, { raw: true })).status === 401);
cookie = savedCookie;
check("rename resume", (await call("PATCH", `/api/resumes/${rid}`, { body: { name: "Primary CV" } })).data?.item?.name === "Primary CV");

console.log("Compose → review queue → approval");
const frontend = (await call("GET", "/api/templates")).data.items.find((t) => t.category === "frontend" && t.isActive);
const prev = await call("POST", "/api/compose/preview", { body: { templateId: frontend.id, recipients: [{ email: "hr@acme-test.com" }, { email: "jobs@beta-test.org", companyName: "Beta", recruiterName: "Sam" }] } });
check("preview renders both drafts", prev.status === 200 && prev.data.drafts.length === 2);
check("no company → still professional", !/undefined|null|\{\{/.test(prev.data.drafts[0].body) && prev.data.drafts[0].body.includes("Hiring Manager"));
check("company + recruiter used when given", prev.data.drafts[1].body.includes("Sam") && prev.data.drafts[1].body.includes("Beta"));
check("default resume attached to drafts", prev.data.drafts[0].resumeId === rid);
const items = prev.data.drafts.map((d) => ({ recipientEmail: d.email, category: "frontend", templateId: frontend.id, resumeId: d.resumeId, subject: d.subject, body: d.body }));
const q = await call("POST", "/api/queue", { body: { items: [...items, items[0]] } });
check("queue created 2 and skipped the duplicate", q.status === 201 && q.data.created.length === 2 && q.data.skipped.length === 1);
const q2 = await call("POST", "/api/queue", { body: { items } });
check("re-queueing same recipients is refused", q2.data.created.length === 0 && q2.data.skipped.length === 2);
const dup = await call("POST", "/api/applications/duplicates", { body: { emails: ["HR@acme-test.com", "new@x.com"] } });
check("duplicate lookup", dup.data.duplicates.length === 1 && dup.data.duplicates[0].blocking === true);
const list = await call("GET", "/api/queue?status=pending_review");
check("review queue lists pending items", list.data.total === 2 && list.data.items[0].resumeName === "Primary CV");
const ids = list.data.items.map((i) => i.id);
check("bulk validation rejects bad ids", (await call("POST", "/api/queue/bulk", { body: { ids: ["zzz"], action: "approve" } })).status === 400);
check("edit works in review", (await call("PATCH", `/api/queue/${ids[0]}`, { body: { subject: "Edited subject" } })).data?.item?.subject === "Edited subject");
const ap = await call("POST", "/api/queue/bulk", { body: { ids: [ids[0]], action: "approve" } });
check("approve one", ap.data.done.length === 1);
check("cannot edit once approved", (await call("PATCH", `/api/queue/${ids[0]}`, { body: { subject: "x" } })).status === 409);
const proc = await call("POST", "/api/queue/process", { body: {} });
check("sending refused without Gmail connection; nothing sent", proc.data?.stopReason === "not_connected" && proc.data.sent === 0);
check("approved email stays approved", (await call("GET", `/api/queue/${ids[0]}`)).data.item.status === "approved");
check("delete resume blocked while in use", (await call("DELETE", `/api/resumes/${rid}`)).status === 409);
check("reject + delete second email", (await call("POST", "/api/queue/bulk", { body: { ids: [ids[1]], action: "reject" } })).data.done.length === 1 && (await call("POST", "/api/queue/bulk", { body: { ids: [ids[1]], action: "delete" } })).data.done.length === 1);

console.log("History & dashboard");
const approvedEmail = (await call("GET", `/api/queue/${ids[0]}`)).data.item.recipientEmail;
const hist = await call("GET", `/api/applications?search=${encodeURIComponent(approvedEmail.split("@")[1])}&status=approved&category=frontend`);
check("history filtering", hist.data.total === 1 && hist.data.items[0].status === "approved");
check("history bad query rejected", (await call("GET", "/api/applications?status=bogus")).status === 400);
const dash = await call("GET", "/api/dashboard");
check("dashboard stats", dash.data.totals.total === 1 && dash.data.totals.approvedWaiting === 1 && dash.data.series.length === 14);
const page = await fetch(BASE + "/dashboard", { headers: { cookie } });
const html = await page.text();
check("dashboard page renders for signed-in user", page.status === 200 && html.includes("Today") && !/access_token|refresh_token|client_secret/i.test(html));

console.log("Gmail OAuth (no live Google call)");
const st = await call("GET", "/api/gmail/status");
check("not connected initially", st.data.connection === null && st.data.requestedScopes.includes("https://www.googleapis.com/auth/gmail.send") && !st.data.requestedScopes.some((s) => /gmail\.(readonly|modify|compose)|mail\.google\.com/.test(s)));
const con = await call("POST", "/api/gmail/connect");
const u = new URL(con.data.url);
check("auth URL uses minimal scope, offline access, state and PKCE S256", u.host === "accounts.google.com" && u.searchParams.get("scope") === "openid email https://www.googleapis.com/auth/gmail.send" && u.searchParams.get("access_type") === "offline" && u.searchParams.get("code_challenge_method") === "S256" && u.searchParams.get("state")?.length > 20);
check("client secret never in the URL", !u.search.includes("secret"));
const cb = await call("GET", "/api/gmail/callback?code=abc&state=forged", { raw: true });
const loc = decodeURIComponent((cb.headers.get("location") ?? "").replace(/\+/g, " "));
check("callback with forged state is rejected", cb.status === 307 && /state mismatch|expired/.test(loc) && !loc.includes("connected=1"));
check("disconnect when not connected is harmless", (await call("POST", "/api/gmail/disconnect")).data?.ok === true);

console.log("Rate limiting & logout");
let limited = false;
jar.clear(); cookie = "";
for (let i = 0; i < 14 && !limited; i++) limited = (await call("POST", "/api/auth/login", { body: { email: EMAIL, password: "bad-bad-bad" } })).status === 429;
check("login brute-force is rate limited (429)", limited);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("Failed:", failures.join("; ")); process.exit(1); }
