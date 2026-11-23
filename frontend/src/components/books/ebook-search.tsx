"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function EbookSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [query, setQuery] = useState(value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onChange(query.trim());
  };

  const handleClear = () => {
    setQuery("");
    onChange("");
  };

  return (
    <form onSubmit={handleSubmit} className="relative flex w-full max-w-md items-center">
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search ebooks by title..."
        aria-label="Search ebooks"
        className="h-10 pl-9.5 pr-10 text-sm shadow-none"
        maxLength={200}
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
