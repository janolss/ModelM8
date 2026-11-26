/**
 * Pure satellite packing helpers (shared by apply + set_activity_*).
 * Primary role centered under activity; apps/extra nest to the RIGHT.
 */

export type SatelliteBox = {
  title: string;
  width: number;
  height: number;
  /** Label-aware width used only when measuring pack — nest gap uses icon width. */
  packWidth: number;
};

/**
 * Bottom layout: primary role centered under activity; side satellites nest
 * tightly against the primary icon (not label width) with a slight diagonal
 * stagger — close to center, not under neighbouring FLOW I/O objects.
 */
export function layoutBottomSatellites(args: {
  activity: { x: number; y: number; width: number; height: number };
  roles: SatelliteBox[];
  others: SatelliteBox[];
  gap: number;
}): Map<string, { x: number; y: number }> {
  const { activity, roles, others, gap } = args;
  const y = activity.y + activity.height + gap;
  const nestGap = 16;
  const staggerY = 14;
  const result = new Map<string, { x: number; y: number }>();
  const actCx = activity.x + Math.floor(activity.width / 2);

  const placeSideCluster = (
    center: { title: string; width: number; height: number },
    sideItems: Array<{ title: string; width: number; height: number }>,
    /** Applications/docs always nest to the RIGHT of the primary role. */
    preferRight = true,
  ): void => {
    const centerX = actCx - Math.floor(center.width / 2);
    result.set(center.title, { x: centerX, y });
    let leftEdge = centerX;
    let rightEdge = centerX + center.width;
    let placeRight = preferRight;
    let ring = 0;
    for (const item of sideItems) {
      const itemY = y + staggerY + ring * Math.floor(staggerY / 2);
      if (placeRight || preferRight) {
        const x = rightEdge + nestGap;
        result.set(item.title, { x, y: itemY });
        rightEdge = x + item.width;
        if (!preferRight) placeRight = false;
      } else {
        const x = leftEdge - nestGap - item.width;
        result.set(item.title, { x, y: itemY });
        leftEdge = x;
        placeRight = true;
      }
      if (!preferRight) {
        placeRight = !placeRight;
      }
      ring += 1;
    }
  };

  const primary = roles[0];
  if (primary) {
    const extraRoles = roles.slice(1);
    placeSideCluster(primary, [...extraRoles, ...others], true);
    return result;
  }

  if (others.length === 0) {
    return result;
  }
  const first = others[0]!;
  placeSideCluster(first, others.slice(1));
  return result;
}
