// Offline tests for the Mindbody sync. Run with: node --test lambda/mindbody-sync/sync.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  scoreMember, summarizeVisits, pickPlan, mapClientToMember, chooseVisitRefresh,
  summarizeRun, createMindbodyClient, syncTenant, stableMemberId,
  toStoredMember, fromStoredItem,
} from "./index.mjs";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

test("scoring matches the CSV import's scoreMember exactly", async () => {
  const src = await readFile(new URL("../../src/importMembers.js", import.meta.url), "utf8");
  const front = await import("data:text/javascript," + encodeURIComponent(src));
  for (const daysSince of [null, 0, 3, 9, 30])
    for (const missedPayments of [0, 1, 5])
      for (const classesBooked of [0, 2, 8])
        for (const joinedMonths of [1, 12]) {
          const args = { daysSince, missedPayments, classesBooked, joinedMonths };
          assert.deepEqual(scoreMember(args), front.scoreMember(args), JSON.stringify(args));
        }
});

test("summarizeVisits counts only attended past visits and future bookings", () => {
  const s = summarizeVisits([
    { StartDateTime: daysAgo(20), SignedIn: true },
    { StartDateTime: daysAgo(6), SignedIn: true },
    { StartDateTime: daysAgo(2), SignedIn: false },           // no-show: ignored
    { StartDateTime: daysAgo(-3), SignedIn: false },          // booked ahead
    { StartDateTime: daysAgo(-5), LateCancelled: true },      // cancelled: ignored
    { StartDateTime: "not a date" },
  ], NOW);
  assert.equal(s.daysSince, 6);
  assert.equal(s.classesBooked, 1);
});

test("pickPlan prefers the current membership that expires last", () => {
  assert.equal(pickPlan([
    { Name: "Intro Month", ExpirationDate: "2026-12-01" },
    { Name: "Unlimited", ExpirationDate: null },
    { Name: "Old", Current: false },
  ]), "Unlimited");
  assert.equal(pickPlan([]), null);
});

test("mapClientToMember builds a stable, scored member and keeps owner-set fields", () => {
  const m = mapClientToMember({
    siteId: "-99", nowMs: NOW,
    client: { Id: "100015", FirstName: "Maria", LastName: "Gonzalez", Email: "m@x.com", MobilePhone: "7045550142", CreationDate: daysAgo(400), AccountBalance: -40, HomeLocation: { Name: "Downtown" } },
    visits: [{ StartDateTime: daysAgo(12), SignedIn: true }],
    memberships: [{ Name: "Unlimited Monthly" }],
    existing: { usualVisits: "Mon/Wed", value: 99, risk: "low" },
    planPrices: { "Unlimited Monthly": 159 },
  });
  assert.equal(m.id, "mb--99-100015");
  assert.equal(m.plan, "Unlimited Monthly");
  assert.equal(m.value, 159);                 // plan price wins over old value
  assert.equal(m.usualVisits, "Mon/Wed");     // kept from existing
  assert.equal(m.missedPayments, 1);
  assert.equal(m.lastVisit, "12 days ago");
  assert.deepEqual({ score: m.score, risk: m.risk }, scoreMember({ daysSince: 12, missedPayments: 1, classesBooked: 0, joinedMonths: 13 }));
  assert.equal(m.previousRisk, "low");
});

test("skipped visit refresh keeps the last known visit instead of 'never visited'", () => {
  const m = mapClientToMember({
    siteId: "1", nowMs: NOW, client: { Id: 7, FirstName: "A" },
    existing: { lastVisitAt: daysAgo(4), classesBooked: 2, visitsSyncedAt: daysAgo(1) },
  });
  assert.equal(m.lastVisit, "4 days ago");
  assert.equal(m.classesBooked, 2);
  assert.equal(m.visitsSyncedAt, daysAgo(1));
});

test("chooseVisitRefresh takes never-synced then stalest active clients, capped", () => {
  const clients = [{ Id: 1 }, { Id: 2 }, { Id: 3, Active: false }, { Id: 4 }];
  const existing = {
    [stableMemberId("s", 1)]: { visitsSyncedAt: daysAgo(1) },
    [stableMemberId("s", 2)]: { visitsSyncedAt: daysAgo(5) },
  };
  assert.deepEqual(chooseVisitRefresh(clients, existing, "s", 2), ["4", "2"]);
});

test("summarizeRun counts members who newly became high risk", () => {
  assert.deepEqual(summarizeRun([
    { risk: "high", previousRisk: "medium" }, { risk: "high", previousRisk: "high" },
    { risk: "high", previousRisk: null }, { risk: "low" },
  ]), { total: 4, high: 3, medium: 0, low: 1, newlyHigh: 1 });
});

test("Mindbody client authenticates, paginates and sends the right headers", async () => {
  const seen = [];
  const fakeFetch = async (url, opts) => {
    seen.push({ url, opts });
    const u = new URL(url);
    let body = {};
    if (u.pathname.endsWith("/usertoken/issue")) body = { AccessToken: "tok" };
    if (u.pathname.endsWith("/client/clients")) {
      const off = Number(u.searchParams.get("Offset"));
      const n = off === 0 ? 200 : 5;
      body = { PaginationResponse: { TotalResults: 205 }, Clients: Array.from({ length: n }, (_, i) => ({ Id: off + i })) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const mb = createMindbodyClient({ apiKey: "k", siteId: "-99", username: "u", password: "p", fetchImpl: fakeFetch });
  await mb.authenticate();
  const clients = await mb.listClients();
  assert.equal(clients.length, 205);
  assert.equal(mb.callCount, 3);
  assert.equal(seen[1].opts.headers["Api-Key"], "k");
  assert.equal(seen[1].opts.headers.SiteId, "-99");
  assert.equal(seen[1].opts.headers.Authorization, "tok");
  assert.equal(seen[0].opts.headers.Authorization, undefined);
});

test("syncTenant end to end with fakes", async () => {
  const saved = {};
  const store = {
    loadMembers: async () => ({ [stableMemberId("-99", "2")]: { risk: "low", value: 120, visitsSyncedAt: daysAgo(1), lastVisitAt: daysAgo(3) } }),
    upsertMembers: async (t, members) => { saved.members = members; },
    saveSyncState: async (t, s) => { saved.state = s; },
  };
  let calls = 0;
  const mb = {
    get callCount() { return calls; },
    authenticate: async () => { calls++; },
    listClients: async () => { calls++; return [{ Id: "1", FirstName: "New" }, { Id: "2", FirstName: "Kept" }]; },
    activeMemberships: async () => { calls++; return { "1": [{ Name: "8-Class Pack" }] }; },
    clientVisits: async (id) => { calls++; return id === "1" ? [{ StartDateTime: daysAgo(15), SignedIn: true }] : [{ StartDateTime: daysAgo(30), SignedIn: true }]; },
  };
  const summary = await syncTenant({ tenantId: "t1", config: { siteId: "-99", planPrices: { "8-Class Pack": 120 } }, mb, store, nowMs: NOW });
  assert.equal(saved.members.length, 2);
  const [a, b] = saved.members;
  assert.equal(a.id, "mb--99-1");
  assert.equal(a.value, 120);
  assert.equal(a.risk, "high");               // 15 days → 70
  assert.equal(b.risk, "high");
  assert.equal(b.previousRisk, "low");
  assert.equal(summary.newlyHigh, 1);
  assert.equal(summary.visitCalls, 2);
  assert.equal(saved.state.lastResult, "ok");
});

test("stored item round-trips: dashboard profile + sync bookkeeping", () => {
  const m = mapClientToMember({
    siteId: "-99", nowMs: NOW, client: { Id: "5", FirstName: "Jo", LastName: "Lee" },
    visits: [{ StartDateTime: daysAgo(3), SignedIn: true }],
  });
  const { profile, mbSync } = toStoredMember(m);
  assert.equal(profile.id, "mb--99-5");
  assert.equal(profile.source, "mindbody");
  assert.equal(profile.lastVisitDate, daysAgo(3).slice(0, 10));
  assert.equal(profile.previousRisk, undefined);      // not a dashboard field
  assert.equal(profile.visitsSyncedAt, undefined);    // lives in mbSync
  assert.equal(mbSync.visitsSyncedAt, new Date(NOW).toISOString());
  assert.match(profile.id, /^(m_|mb-)[A-Za-z0-9_-]{1,80}$/); // roster store's id rule
  const back = fromStoredItem({ profile, mbSync });
  assert.equal(back.lastVisitAt, m.lastVisitAt);
  assert.equal(back.risk, m.risk);
  // Item saved by a CSV import (no mbSync) still yields a usable last visit.
  assert.equal(fromStoredItem({ profile: { lastVisitDate: "2026-11-20" } }).lastVisitAt, "2026-11-20T00:00:00.000Z");
});
