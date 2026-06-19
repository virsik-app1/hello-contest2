import { listLocations, filterByLocation, summarizeLocations, ALL_LOCATIONS } from "./locations";

const roster = [
  { id: 1, name: "A", location: "Downtown", risk: "high",   value: 100 },
  { id: 2, name: "B", location: "Downtown", risk: "low",    value: 50  },
  { id: 3, name: "C", location: "Uptown",   risk: "high",   value: 80  },
  { id: 4, name: "D", location: "",         risk: "medium", value: 40  },
];

test("listLocations returns distinct, sorted, non-empty names", () => {
  expect(listLocations(roster)).toEqual(["Downtown", "Uptown"]);
  expect(listLocations([])).toEqual([]);
  expect(listLocations(undefined)).toEqual([]);
});

test("filterByLocation scopes to one location; 'all' or empty returns everyone", () => {
  expect(filterByLocation(roster, "Downtown").map(m => m.id)).toEqual([1, 2]);
  expect(filterByLocation(roster, "Uptown").map(m => m.id)).toEqual([3]);
  expect(filterByLocation(roster, ALL_LOCATIONS)).toHaveLength(4);
  expect(filterByLocation(roster, "")).toHaveLength(4);
});

test("summarizeLocations rolls up count, high-risk, and revenue per location", () => {
  const s = summarizeLocations(roster);
  expect(s.find(x => x.location === "Downtown")).toEqual({ location: "Downtown", total: 2, high: 1, revenue: 150 });
  expect(s.find(x => x.location === "Unassigned")).toEqual({ location: "Unassigned", total: 1, high: 0, revenue: 40 });
  expect(s.map(x => x.location)).toEqual(["Downtown", "Unassigned", "Uptown"]); // sorted by name
});
