// This module should contain type definitions for modules which do not have
// their own type definitions and are not available on DefinitelyTyped.

// declare module 'some-untyped-pkg' {
// 	export function foo(): void;
// }

// Import Google Maps types
import type { } from '@types/google.maps'

// Augment the Window interface to include google property
declare global {
  interface Window {
    google: typeof google
  }
}
