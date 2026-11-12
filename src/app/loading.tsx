import { Skeleton } from "@/components/ui/primitives";
export default function Loading() {
  return (
    <main className="loading-page" aria-label="Loading workspace">
      <Skeleton className="h-10 w-64" />
      <div className="stats-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </main>
  );
}
