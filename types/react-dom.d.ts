// Minimal typing for the one react-dom API used in the app (no extra package needed).
declare module 'react-dom' {
  import type {ReactNode, ReactPortal} from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
