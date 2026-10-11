import { getErrorMessage } from "../../utils/errors";
import Alert from "../ui/Alert";
import Button from "../ui/Button";

export function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading report">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-200" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-gray-200" />
      <div className="h-64 rounded-2xl bg-gray-200" />
    </div>
  );
}

export function ReportError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <Alert variant="error">{getErrorMessage(error)}</Alert>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
