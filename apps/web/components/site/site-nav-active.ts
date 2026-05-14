/** Whether `pathname` should treat `href` as the active site-nav target (non-docs chrome). */
export function isSiteNavHrefActive(href: string, pathname: string): boolean {
  const path = pathname || "/";
  if (href === "/") {
    return path === "/" || path === "";
  }
  if (href === "/why-nci") {
    return path === "/why-nci" || path.startsWith("/why-nci/");
  }
  if (href === "/docs") {
    if (!path.startsWith("/docs")) {
      return false;
    }
    return !path.startsWith("/docs/quickstart");
  }
  if (href === "/docs/quickstart") {
    return path.startsWith("/docs/quickstart");
  }
  return path === href || path.startsWith(`${href}/`);
}
