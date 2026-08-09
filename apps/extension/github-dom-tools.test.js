const test = require("node:test");
const assert = require("node:assert/strict");

const { createGithubDomTools } = require("./github-dom-tools.js");

test("clicks a DOM action exactly once", () => {
  let clicks = 0;
  let focused = 0;
  const element = {
    focus: () => { focused += 1; },
    click: () => { clicks += 1; },
  };
  const tools = createGithubDomTools();

  assert.equal(tools.click(element), true);
  assert.equal(tools.click(element), false);
  assert.equal(clicks, 1);
  assert.equal(focused, 1);
});

test("scrolls directly to the target once and waits for it to settle", async () => {
  let inViewport = false;
  let scrolls = 0;
  let settled = 0;
  const element = {
    scrollIntoView: (options) => {
      scrolls += 1;
      assert.deepEqual(options, {
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
      inViewport = true;
    },
  };
  const tools = createGithubDomTools({
    isInViewport: () => inViewport,
    waitForScroll: async () => { settled += 1; },
  });

  assert.equal(await tools.scrollTo(element, "change visibility"), true);
  assert.equal(await tools.scrollTo(element, "change visibility"), true);
  assert.equal(scrolls, 1);
  assert.equal(settled, 1);
});
