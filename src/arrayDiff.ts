/** Split an array into three arrays: one containing common elements and two containing the unique elements */
export const arrayDiff = (a: unknown[], b: unknown[]) => {
  const intersection = new Set<unknown>();
  const onlyInB = new Set<unknown>();
  const onlyInA = new Set<unknown>();
  for (const item of a) {
    if (b.includes(item)) {
      intersection.add(item);
    } else {
      onlyInA.add(item);
    }
  }

  for (const item of b) {
    if (a.includes(item)) {
      intersection.add(item);
    } else {
      onlyInB.add(item);
    }
  }

  return {
    inBoth: Array.from(intersection),
    onlyInA: Array.from(onlyInA),
    onlyInB: Array.from(onlyInB),
  };
};
