import type { ReactNode } from "react";
import { Coffee, Package, Receipt, TrendingUp } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}

const FEATURES = [
  { Icon: Receipt, text: "Fast billing with automatic GST and discounts" },
  { Icon: Package, text: "Menu and stock management in one place" },
  { Icon: TrendingUp, text: "Daily sales and profit reports" },
];

export default function AuthLayout({ title, subtitle, footer, children }: Props) {
  return (
    <div className="flex min-h-screen bg-leo-50">
      <aside className="hidden w-[44%] max-w-xl flex-col justify-between bg-leo-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <Coffee className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold tracking-tight">Leo Cafe</span>
        </div>

        <div>
          <h2 className="text-3xl font-bold leading-tight">Billing and POS, made simple for your cafe.</h2>
          <ul className="mt-8 space-y-4 text-leo-100">
            {FEATURES.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-leo-100/80">&copy; {new Date().getFullYear()} Leo Cafe</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-leo-600 text-white">
              <Coffee className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold text-leo-700">Leo Cafe</span>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-gray-600">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
