(function initCtrlTeachGithubDomTools(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CtrlTeachGithubDomTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGithubDomToolsApi() {
  "use strict";

  function createGithubDomTools({
    isUsable = (element) => Boolean(element),
    isInViewport = () => true,
    reducedMotion = () => false,
    waitForScroll = async () => {},
    onScroll = () => {},
  } = {}) {
    const clickedElements = new WeakSet();

    async function scrollTo(element, label = "target", block = "center") {
      if (!isUsable(element)) return false;
      if (isInViewport(element)) return true;
      element.scrollIntoView({
        block,
        inline: "nearest",
        behavior: reducedMotion() ? "auto" : "smooth",
      });
      onScroll(label);
      await waitForScroll();
      return isUsable(element) && isInViewport(element);
    }

    function click(element) {
      if (!isUsable(element) || clickedElements.has(element)) return false;
      clickedElements.add(element);
      try {
        element.focus?.({ preventScroll: true });
        element.click();
        return true;
      } catch {
        return false;
      }
    }

    return { click, scrollTo };
  }

  return { createGithubDomTools };
});
