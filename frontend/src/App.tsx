import { useQuery } from "@tanstack/react-query";
import { Coffee } from "lucide-react";
import { api } from "./api/client";

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.get("/health")).data.data,
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-leo-100">
          <Coffee className="h-7 w-7 text-leo-700" />
        </div>
        <h1 className="text-2xl font-bold text-leo-700">Leo Cafe</h1>
        <p className="mt-1 text-sm text-gray-500">Billing &amp; POS Management System</p>

        <div className="mt-6 rounded-lg bg-leo-50 p-3 text-sm">
          {isLoading && <span>Checking backend...</span>}
          {isError && <span className="text-red-600">Backend not reachable. Is it running?</span>}
          {data && <span className="text-leo-700">Backend connected ({data.status})</span>}
        </div>
      </div>
    </div>
  );
}
