import type { PosCategory } from "../../types/pos";

interface Props {
  categories: PosCategory[];
  selected: string; // "" means all
  onSelect: (id: string) => void;
}

export default function CategoryTabs({ categories, selected, onSelect }: Props) {
  const tabs = [{ id: "", name: "All" }, ...categories];

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Categories">
      {tabs.map((tab) => (
        <button
          key={tab.id || "all"}
          type="button"
          role="tab"
          aria-selected={selected === tab.id}
          onClick={() => onSelect(tab.id)}
          className={[
            "h-11 shrink-0 rounded-full px-5 text-sm font-medium transition-colors",
            selected === tab.id
              ? "bg-leo-600 text-white"
              : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
          ].join(" ")}
        >
          {tab.name}
        </button>
      ))}
    </div>
  );
}
