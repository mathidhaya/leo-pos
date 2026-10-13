import Button from "../ui/Button";

interface Props {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  saveLabel?: string;
}

// The Save and Discard buttons under every settings form. Save only works when something changed.
export default function FormActions({ dirty, saving, onDiscard, saveLabel = "Save changes" }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
      {dirty && !saving && <span className="text-sm text-amber-700 sm:mr-auto">You have unsaved changes.</span>}
      <Button type="button" variant="secondary" onClick={onDiscard} disabled={!dirty || saving}>
        Discard
      </Button>
      <Button type="submit" loading={saving} disabled={!dirty}>
        {saving ? "Saving..." : saveLabel}
      </Button>
    </div>
  );
}
