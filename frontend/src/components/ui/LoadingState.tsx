/**
 * LoadingState — skeleton loaders for async content.
 *
 * Used as placeholders while movie data loads from the API.
 * Prevents layout shift — the skeleton has the same dimensions
 * as the actual content that replaces it.
 */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[#1C1A23] ${className}`}
      aria-hidden="true"
    />
  );
}

export function MovieCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 w-44 flex-shrink-0" aria-hidden="true">
      <Skeleton className="w-full aspect-[2/3] rounded-xl" />
      <div className="space-y-2 px-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div
      className="w-full h-[75vh] min-h-[500px] bg-[#17161D] animate-pulse flex items-end pb-16 px-8 sm:px-16"
      aria-hidden="true"
    >
      <div className="space-y-4 max-w-xl">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-20 w-full" />
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-12 w-36 rounded-xl" />
          <Skeleton className="h-12 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
