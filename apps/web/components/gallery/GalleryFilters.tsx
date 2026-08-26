interface GalleryFiltersProps {
  searchParams: Record<string, string | undefined>;
}

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

export function GalleryFilters({ searchParams }: GalleryFiltersProps) {
  return (
    <form
      method="get"
      action="/gallery"
      className="mt-10 flex flex-wrap items-end gap-4 border-y border-foreground/10 py-6"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="sort"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Sort
        </label>
        <select
          id="sort"
          name="sort"
          defaultValue={searchParams.sort ?? 'featured'}
          className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="minPrice"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Min price
        </label>
        <input
          id="minPrice"
          name="minPrice"
          type="number"
          min={0}
          defaultValue={searchParams.minPrice ?? ''}
          className="w-28 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="maxPrice"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
        >
          Max price
        </label>
        <input
          id="maxPrice"
          name="maxPrice"
          type="number"
          min={0}
          defaultValue={searchParams.maxPrice ?? ''}
          className="w-28 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2"
        />
      </div>

      <button
        type="submit"
        className="rounded-full border border-foreground/25 px-6 py-2.5 text-[13px] font-medium uppercase tracking-[0.12em] text-foreground transition-colors duration-200 hover:border-accent hover:text-accent"
      >
        Apply
      </button>

      {/*
        Category / Medium / Style / Theme filters are deliberately not
        here yet. They need their own backend endpoints (GET /categories,
        /mediums, /styles, /themes) to source real option lists from —
        those don't exist yet. Hardcoding a guessed category list here
        would be exactly the "fake/hardcoded business-critical data"
        the spec explicitly rules out. Add those endpoints, then this
        form gains three more <select>s using the same pattern above.
      */}
    </form>
  );
}
