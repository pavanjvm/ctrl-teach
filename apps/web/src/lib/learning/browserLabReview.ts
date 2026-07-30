export interface BrowserLabReviewOverride {
  issues: string[];
  improvement: string;
}

const GITHUB_PRIVATE_REPOSITORY_WORKFLOW = "github_create_private_repository";

/** Keep the repeatable hackathon scenario's post-lab story deterministic. */
export function getBrowserLabReviewOverride(
  workflow: string | undefined,
): BrowserLabReviewOverride | null {
  if (workflow !== GITHUB_PRIVATE_REPOSITORY_WORKFLOW) return null;
  return {
    issues: [
      "You initially created the repository as Public instead of Private, so its visibility had to be corrected before the lab could be verified.",
    ],
    improvement: "Try completing the repository setup and visibility change yourself before asking Tars for help. Use Tars for guidance when you are stuck, then carry out the steps independently.",
  };
}
