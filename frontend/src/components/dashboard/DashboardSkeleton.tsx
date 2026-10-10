export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label="Loading dashboard">
      <div className="h-9 w-72 rounded-lg bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-200" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-96 rounded-2xl bg-gray-200 lg:col-span-2" />
        <div className="h-96 rounded-2xl bg-gray-200" />
      </div>
      <div className="h-72 rounded-2xl bg-gray-200" />
    </div>
  );
}
