import { LoaderCircle } from "lucide-react";

export default function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-leo-50" role="status" aria-label="Loading">
      <LoaderCircle className="h-10 w-10 animate-spin text-leo-600" />
    </div>
  );
}
