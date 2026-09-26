import { useEffect, useRef } from "react";

/** Невидимая метка в конце списка: доскроллили — грузим следующую страницу */
export function InfiniteSentinel({
  query,
}: {
  query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query]);
  return (
    <div ref={ref} style={{ height: 1 }}>
      {query.isFetchingNextPage && <div className="skeleton" style={{ height: 120, borderRadius: 24, marginTop: 12 }} />}
    </div>
  );
}
