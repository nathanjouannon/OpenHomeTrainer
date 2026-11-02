import { useEffect, useState } from 'react';

export interface Location {
  /** First path segment: '' (home), 'devices', 'routes', 'ride', 'rides', 'settings'… */
  page: string;
  /** Remaining path segments. */
  params: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Location {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', search = ''] = raw.split('?');
  const [page = '', ...params] = path.split('/').filter(Boolean);
  return { page, params: params.map(decodeURIComponent), query: new URLSearchParams(search) };
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setLoc(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return loc;
}

export const navigate = (to: string) => {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
};
