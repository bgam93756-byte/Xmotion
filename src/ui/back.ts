import { useEffect, useRef } from 'react';

/** Open screens and panels, newest last: the Android back button closes the newest. */
const stack: { run: () => void }[] = [];

/** Registers what the Android back button does while `active` (the newest registration wins). */
export function useBackHandler(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const entry = { run: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Runs the newest back handler; false when there is none (leave the app). */
export function runBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}
