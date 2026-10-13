import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccount } from "../../api/account";
import { fetchSettings } from "../../api/settings";
import AccountTab from "../../components/settings/AccountTab";
import BillingTab from "../../components/settings/BillingTab";
import CafeTab from "../../components/settings/CafeTab";
import ReceiptTab from "../../components/settings/ReceiptTab";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { getErrorMessage } from "../../utils/errors";

type TabKey = "cafe" | "billing" | "receipt" | "account";

const OWNER_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "cafe", label: "Cafe" },
  { key: "billing", label: "Billing" },
  { key: "receipt", label: "Receipt" },
  { key: "account", label: "Account" },
];

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading settings">
      <div className="h-64 rounded-2xl bg-gray-200" />
      <div className="h-40 rounded-2xl bg-gray-200" />
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "OWNER";

  const [tab, setTab] = useState<TabKey>(isOwner ? "cafe" : "account");

  // Only the owner can read the cafe's settings. Everyone can read their own account.
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: fetchSettings, enabled: isOwner, staleTime: 30_000 });
  const accountQuery = useQuery({ queryKey: ["account"], queryFn: getAccount, staleTime: 30_000 });

  if (!user) return null;

  // Names, logo, defaults and receipts all come from these, so they are all refreshed after a save
  function refresh() {
    for (const key of ["settings", "app-settings", "account", "invoice"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  const settings = settingsQuery.data;
  const account = accountQuery.data;
  const tabs = isOwner ? OWNER_TABS : OWNER_TABS.filter((item) => item.key === "account");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{isOwner ? "Settings" : "My account"}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {isOwner ? "Your cafe, billing and receipts, and your own account." : "Your details and password."}
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Settings sections">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={[
                "h-11 rounded-full px-6 text-sm font-medium transition-colors",
                tab === item.key ? "bg-leo-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Every tab stays on the page (just hidden), so edits are not lost when you switch tabs */}
      {isOwner && settingsQuery.isPending && <Skeleton />}

      {isOwner && !settings && settingsQuery.isError && (
        <div className="space-y-3">
          <Alert variant="error">{getErrorMessage(settingsQuery.error)}</Alert>
          <Button onClick={() => void settingsQuery.refetch()}>Try again</Button>
        </div>
      )}

      {isOwner && settings && (
        <>
          <div hidden={tab !== "cafe"}>
            <CafeTab shop={settings.shop} onSaved={refresh} />
          </div>
          <div hidden={tab !== "billing"}>
            <BillingTab billing={settings.billing} onSaved={refresh} />
          </div>
          <div hidden={tab !== "receipt"}>
            <ReceiptTab shop={settings.shop} billing={settings.billing} receipt={settings.receipt} onSaved={refresh} />
          </div>
        </>
      )}

      <div hidden={tab !== "account"}>
        {accountQuery.isPending && <Skeleton />}
        {!account && accountQuery.isError && (
          <div className="space-y-3">
            <Alert variant="error">{getErrorMessage(accountQuery.error)}</Alert>
            <Button onClick={() => void accountQuery.refetch()}>Try again</Button>
          </div>
        )}
        {account && <AccountTab account={account} onSaved={refresh} />}
      </div>
    </div>
  );
}
