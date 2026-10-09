import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-leo-50 px-4 text-center">
      <p className="text-5xl font-bold text-leo-700">404</p>
      <p className="text-gray-600">This page does not exist.</p>
      <Link to="/dashboard" className="font-semibold text-leo-700 hover:underline">
        Go to dashboard
      </Link>
    </div>
  );
}
