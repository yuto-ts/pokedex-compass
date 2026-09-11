export const pageHref = (path: string) =>
  path.startsWith('/') ? '#' + path : path;
