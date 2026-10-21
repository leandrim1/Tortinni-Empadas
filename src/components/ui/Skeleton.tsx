export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden p-3">
      <div className="skeleton mb-3 aspect-square w-full rounded-xl" />
      <div className="skeleton mb-2 h-4 w-4/5" />
      <div className="skeleton mb-3 h-3 w-full" />
      <div className="flex items-center justify-between">
        <div className="skeleton h-5 w-16" />
        <div className="skeleton h-9 w-9 rounded-full" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Carregando produtos"
    >
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}
