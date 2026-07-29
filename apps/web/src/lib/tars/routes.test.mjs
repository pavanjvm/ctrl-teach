import assert from "node:assert/strict";
import test from "node:test";

import { isEmbeddedTarsRoute } from "./routes.ts";

test("suspends page Tars anywhere an embedded companion owns the session", () => {
  for (const route of [
    "/board",
    "/learn",
    "/role-playing",
    "/learn/generated-course/classroom",
    "/learn/platform-course/classroom",
  ]) {
    assert.equal(isEmbeddedTarsRoute(route), true, route);
  }
});

test("keeps page Tars active on course and lesson pages", () => {
  for (const route of [
    "/dashboard",
    "/learn/generated-course",
    "/learn/generated-course/lesson-1",
  ]) {
    assert.equal(isEmbeddedTarsRoute(route), false, route);
  }
});
