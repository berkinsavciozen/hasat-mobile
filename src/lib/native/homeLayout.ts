export function getHomeResponsiveLayout(width: number, fontScale: number) {
  const reflow = width <= 340 || fontScale >= 1.15;
  return {
    stackHeader: reflow,
    stackTabs: reflow,
    stackSearch: reflow,
    compactAddAction: fontScale >= 1.35,
  };
}
