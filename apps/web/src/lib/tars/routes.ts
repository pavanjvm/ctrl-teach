export function isEmbeddedTarsRoute(pathname: string) {
  return pathname === "/board"
    || pathname === "/learn"
    || pathname === "/role-playing"
    || /^\/learn\/[^/]+\/classroom$/.test(pathname);
}
