import { Hammer } from "lucide-react";

export default function ComingSoonPage({ title, phase }: { title: string; phase?: number }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-leo-100 text-leo-700">
        <Hammer className="h-7 w-7" />
      </span>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="max-w-sm text-gray-600">
        This page is not built yet{phase ? `. It comes in Phase ${phase}.` : "."}
      </p>
    </div>
  );
}
