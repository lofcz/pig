// EnableDebug: Adds a .EnableDebug() method to all function components in dev, globally
declare global {
  interface Function {
    /**
     * Enables React debugging for a given component
     */
    EnableDebug: () => void;
  }
}

if (import.meta.env.DEV) {
  // Add EnableDebug to all functions (always defined in dev)
  Object.defineProperty(Function.prototype, 'EnableDebug', {
    value: function () {
      // @ts-ignore
      this.whyDidYouRender = true;
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  const whyDidYouRender = (await import('@welldone-software/why-did-you-render')).default;
  const React = (await import('react')).default;
  whyDidYouRender(React, {
    trackHooks: true,
  });
} else {
  // In prod, define a no-op EnableDebug so code doesn't break
  Object.defineProperty(Function.prototype, 'EnableDebug', {
    value: function () { return this; },
    enumerable: false,
    configurable: true,
    writable: true,
  });
}
