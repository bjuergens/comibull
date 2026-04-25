import { useEffect } from 'react';
import { useLayoutContext } from '../components/AppLayout';

export function useComicBreadcrumbs(
  id: string | undefined,
  comicTitle: string | undefined,
  secondLabel: string,
) {
  const { setBreadcrumbs } = useLayoutContext();
  useEffect(() => {
    if (!comicTitle || !id) return;
    setBreadcrumbs([
      { label: comicTitle, href: `/comics/${id}` },
      { label: secondLabel },
    ]);
    return () => setBreadcrumbs([]);
  }, [comicTitle, id, secondLabel, setBreadcrumbs]);
}
