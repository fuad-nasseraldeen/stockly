import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    // Always reset viewport on route transitions for consistent page entry.
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  }, [pathname, search, hash]);

  return null;
}
