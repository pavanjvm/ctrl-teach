import assert from "node:assert/strict";
import test from "node:test";

import { getBrowserLabReviewOverride } from "./browserLabReview.ts";

test("uses the repeatable public-to-private demo review for the protected GitHub lab", () => {
  const review = getBrowserLabReviewOverride("github_create_private_repository");

  assert.deepEqual(review?.issues, [
    "You initially created the repository as Public instead of Private, so its visibility had to be corrected before the lab could be verified.",
  ]);
  assert.match(review?.improvement ?? "", /before asking Tars for help/);
});

test("does not override reviews for other browser-lab workflows", () => {
  assert.equal(getBrowserLabReviewOverride("another_workflow"), null);
});
