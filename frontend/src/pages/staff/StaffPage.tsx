import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Search, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { deleteStaff, listStaff, resetStaffPassword, setStaffStatus } from "../../api/staff";
import StatCard from "../../components/dashboard/StatCard";
import PasswordRevealModal from "../../components/staff/PasswordRevealModal";
import StaffFormModal from "../../components/staff/StaffFormModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import SelectField from "../../components/ui/SelectField";
import Toggle from "../../components/ui/Toggle";
import { useAuth } from "../../hooks/useAuth";
import { useDebounce } from "../../hooks/useDebounce";
import type { Role } from "../../types/auth";
import type { StaffMember } from "../../types/staff";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatYmd } from "../../utils/format";
import { formatPhone } from "../../utils/phone";
import { ROLE_LABEL } from "../../utils/roles";

const ROLE_STYLE: Record<Role, string> = {
  OWNER: "bg-indigo-100 text-indigo-800",
  MANAGER: "bg-blue-100 text-blue-800",
  CASHIER: "bg-leo-100 text-leo-700",
};

const iconButton =
  "flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-leo-600";

function RoleBadge({ role }: { role: Role }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_STYLE[role]}`}>{ROLE_LABEL[role]}</span>;
}

function loginOf(member: StaffMember): string {
  return member.phone ? formatPhone(member.phone) : (member.email ?? "");
}

interface ActionsProps {
  member: StaffMember;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
}

function Actions({ member, onEdit, onReset, onDelete }: ActionsProps) {
  if (!member.canModify) return <span className="text-xs text-gray-500">Owner account</span>;

  return (
    <div className="flex justify-end gap-1">
      <button type="button" className={`${iconButton} text-gray-600`} aria-label={`Edit ${member.name}`} title="Edit" onClick={onEdit}>
        <Pencil className="h-5 w-5" />
      </button>
      <button type="button" className={`${iconButton} text-gray-600`} aria-label={`Reset password for ${member.name}`} title="Reset password" onClick={onReset}>
        <KeyRound className="h-5 w-5" />
      </button>
      {member.canDelete ? (
        <button type="button" className={`${iconButton} text-red-600 hover:bg-red-50`} aria-label={`Delete ${member.name}`} title="Delete" onClick={onDelete}>
          <Trash2 className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          disabled
          className={`${iconButton} cursor-not-allowed text-gray-300 hover:bg-transparent`}
          aria-label={`${member.name} cannot be deleted`}
          title="Has taken orders or payments, or changed stock. Disable the account instead."
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export default function StaffPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");

  const [editing, setEditing] = useState<StaffMember | "new" | null>(null);
  const [disabling, setDisabling] = useState<StaffMember | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const [reveal, setReveal] = useState<{ name: string; login: string; password: string; kind: "created" | "reset" } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const debouncedSearch = useDebounce(search.trim());
  const params = { q: debouncedSearch || undefined, role, status };

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["staff", params],
    queryFn: () => listStaff(params),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const hasFilters = Boolean(debouncedSearch) || role !== "all" || status !== "all";

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["staff"] });
  }

  function clearFilters() {
    setSearch("");
    setRole("all");
    setStatus("all");
  }

  async function enable(member: StaffMember) {
    setTogglingId(member.id);
    setMessage(null);
    try {
      await setStaffStatus(member.id, true);
      setMessage({ kind: "success", text: `${member.name} can log in again.` });
      refresh();
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setTogglingId(null);
    }
  }

  function handleToggle(member: StaffMember) {
    if (member.isActive) setDisabling(member);
    else void enable(member);
  }

  function renderActions(member: StaffMember) {
    return (
      <Actions
        member={member}
        onEdit={() => {
          setMessage(null);
          setEditing(member);
        }}
        onReset={() => setResetting(member)}
        onDelete={() => setDeleting(member)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Staff</h1>
          <p className="mt-1 text-sm text-gray-600">Manage who can log in, and what each person can do.</p>
        </div>
        <Button
          onClick={() => {
            setMessage(null);
            setEditing("new");
          }}
        >
          <Plus className="h-5 w-5" />
          Add staff member
        </Button>
      </div>

      {message && <Alert variant={message.kind}>{message.text}</Alert>}

      {data && (
        <section aria-label="Summary" className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Total people" value={String(data.summary.total)} icon={Users} tone="blue" hint="Including you" />
          <StatCard label="Active" value={String(data.summary.active)} icon={UserCheck} tone="green" hint="Can log in" />
          <StatCard label="Disabled" value={String(data.summary.disabled)} icon={UserX} tone="gray" hint="Cannot log in" />
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="staff-search" className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                id="staff-search"
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, phone number or email"
                className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
              />
            </div>
          </div>

          <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as "all" | Role)}>
            <option value="all">All roles</option>
            <option value="OWNER">Owner</option>
            <option value="MANAGER">Manager</option>
            <option value="CASHIER">Cashier</option>
          </SelectField>

          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </SelectField>
        </div>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="mt-3 text-sm font-medium text-leo-700 hover:underline">
            Clear filters
          </button>
        )}
      </section>

      {isPending && (
        <div className="space-y-3" role="status" aria-label="Loading staff">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      )}

      {!data && isError && (
        <div className="space-y-3">
          <Alert variant="error">{getErrorMessage(error)}</Alert>
          <Button onClick={() => void refetch()}>Try again</Button>
        </div>
      )}

      {data && isError && <Alert variant="error">{getErrorMessage(error)} Showing the last loaded list.</Alert>}

      {data && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-500" />
          <p className="mt-3 font-medium text-gray-900">{hasFilters ? "No one matches your filters" : "No staff yet"}</p>
          <p className="text-sm text-gray-500">
            {hasFilters ? "Try a different search, or clear the filters." : "Add your first manager or cashier."}
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? "opacity-60" : ""}>
          {/* Wide screens: table */}
          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 text-right font-medium">Orders taken</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((member) => (
                  <tr key={member.id} className={`border-b border-gray-100 last:border-0 ${member.isActive ? "" : "bg-gray-50/70"}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">
                        {member.name}
                        {member.id === user?.id && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">You</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{[member.phone ? formatPhone(member.phone) : null, member.email].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={member.role} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatYmd(member.joiningDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {member.lastLoginAt ? formatDateTime(member.lastLoginAt) : <span className="text-gray-500">Never</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{member.ordersTaken}</td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={member.isActive}
                        onChange={() => handleToggle(member)}
                        disabled={!member.canModify || togglingId === member.id}
                        label={`${member.name} active`}
                      />
                    </td>
                    <td className="px-4 py-3">{renderActions(member)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Small screens: cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((member) => (
              <li key={member.id} className={`rounded-2xl p-4 shadow-sm ${member.isActive ? "bg-white" : "bg-gray-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">
                      {member.name}
                      {member.id === user?.id && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">You</span>}
                    </p>
                    <p className="truncate text-sm text-gray-600">{loginOf(member)}</p>
                  </div>
                  <RoleBadge role={member.role} />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Joined {formatYmd(member.joiningDate)} · {member.lastLoginAt ? `last login ${formatDateTime(member.lastLoginAt)}` : "never logged in"} ·{" "}
                  {member.ordersTaken} order{member.ordersTaken === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <Toggle
                    checked={member.isActive}
                    onChange={() => handleToggle(member)}
                    disabled={!member.canModify || togglingId === member.id}
                    label={`${member.name} active`}
                  />
                  {renderActions(member)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <StaffFormModal
          staff={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            refresh();
            if (created) {
              setReveal({
                name: created.staff.name,
                login: loginOf(created.staff),
                password: created.temporaryPassword,
                kind: "created",
              });
            } else {
              setMessage({ kind: "success", text: "Changes saved." });
            }
          }}
        />
      )}

      {disabling && (
        <ConfirmDialog
          title="Disable account"
          confirmLabel="Disable account"
          message={
            <>
              <strong>{disabling.name}</strong> will be logged out right away, and cannot log in again until you enable the
              account. Their orders and history are kept.
            </>
          }
          onConfirm={async () => {
            await setStaffStatus(disabling.id, false);
            setMessage({ kind: "success", text: `${disabling.name} was disabled.` });
            setDisabling(null);
            refresh();
          }}
          onCancel={() => setDisabling(null)}
        />
      )}

      {resetting && (
        <ConfirmDialog
          title="Reset password"
          confirmLabel="Reset password"
          message={
            <>
              Make a new temporary password for <strong>{resetting.name}</strong>? Their old password stops working, and
              they are logged out of every device. You will see the new password once.
            </>
          }
          onConfirm={async () => {
            const result = await resetStaffPassword(resetting.id);
            setResetting(null);
            setReveal({
              name: result.staff.name,
              login: loginOf(result.staff),
              password: result.temporaryPassword,
              kind: "reset",
            });
            refresh();
          }}
          onCancel={() => setResetting(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete staff member"
          confirmLabel="Delete"
          message={
            <>
              Delete <strong>{deleting.name}</strong>? This account has never taken an order or payment, or changed stock, so
              nothing else is affected. This cannot be undone. To stop someone logging in but keep their history, disable
              them instead.
            </>
          }
          onConfirm={async () => {
            await deleteStaff(deleting.id);
            setMessage({ kind: "success", text: `${deleting.name} was deleted.` });
            setDeleting(null);
            refresh();
          }}
          onCancel={() => setDeleting(null)}
        />
      )}

      {reveal && (
        <PasswordRevealModal
          name={reveal.name}
          login={reveal.login}
          password={reveal.password}
          kind={reveal.kind}
          onClose={() => setReveal(null)}
        />
      )}
    </div>
  );
}
