"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type BulkActionVariant = "filled" | "outline" | "ghost" | "danger";

export interface AdminEntityListItemView {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
}

export interface AdminEntityBulkAction {
  key: string;
  label: string;
  variant?: BulkActionVariant;
  onRun: (selectedIds: string[]) => void | Promise<void>;
  disabled?: boolean;
}

export interface AdminEntityListPanelProps<TItem> {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  emptyMessage: string;
  query: string;
  onQueryChange: (query: string) => void;
  listLoading: boolean;
  items: TItem[];
  getId: (item: TItem) => string;
  getItemView: (item: TItem, active: boolean) => AdminEntityListItemView;
  selectedId: string;
  onSelect: (id: string) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  disabled?: boolean;
  maxListHeightClassName?: string;
  secondaryControls?: ReactNode;
  bulkActions?: AdminEntityBulkAction[];
  headerAction?: ReactNode;
}

export function AdminEntityListPanel<TItem>({
  title,
  subtitle,
  searchPlaceholder,
  emptyMessage,
  query,
  onQueryChange,
  listLoading,
  items,
  getId,
  getItemView,
  selectedId,
  onSelect,
  selectedIds,
  onSelectedIdsChange,
  page,
  totalPages,
  total,
  pageSize,
  onPrevPage,
  onNextPage,
  disabled,
  maxListHeightClassName = "xl:max-h-[72vh]",
  secondaryControls,
  bulkActions,
  headerAction,
}: AdminEntityListPanelProps<TItem>) {
  const currentPageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const currentPageEnd = Math.min(total, page * pageSize);

  const canRunBulk = selectedIds.length > 0 && !disabled;

  return (
    <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>
        </div>
        {headerAction}
      </div>

      <div className="border-b border-border px-4 py-3">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          disabled={disabled}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectedIdsChange(items.map((item) => getId(item)))}
            disabled={!items.length || !!disabled}
          >
            Select page
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectedIdsChange([])}
            disabled={!selectedIds.length || !!disabled}
          >
            Clear
          </Button>
        </div>

        {secondaryControls ? <div className="mt-2">{secondaryControls}</div> : null}

        {bulkActions?.length ? (
          <div className="mt-2 grid gap-2">
            {bulkActions.map((action) => (
              <Button
                key={action.key}
                size="sm"
                variant={action.variant ?? "filled"}
                onClick={() => void action.onRun(selectedIds)}
                disabled={!canRunBulk || !!action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`${maxListHeightClassName} xl:overflow-y-auto`}>
        {items.length ? (
          items.map((item) => {
            const itemId = getId(item);
            const active = selectedId === itemId;
            const selected = selectedIds.includes(itemId);
            const view = getItemView(item, active);
            return (
              <button
                key={itemId}
                type="button"
                onClick={() => onSelect(itemId)}
                className={`w-full border-b border-border px-4 py-3 text-left transition last:border-b-0 ${
                  active ? "bg-[#f7f0b4] text-slate-950" : "bg-bg-primary hover:bg-bg-secondary"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      event.stopPropagation();
                      onSelectedIdsChange(
                        event.target.checked
                          ? [...new Set([...selectedIds, itemId])]
                          : selectedIds.filter((id) => id !== itemId),
                      );
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="mt-0.5 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{view.title}</p>
                      {view.badges}
                    </div>
                    {view.subtitle ? (
                      <p className={`mt-1 text-xs ${active ? "text-slate-700" : "text-text-secondary"}`}>
                        {view.subtitle}
                      </p>
                    ) : null}
                    {view.meta ? (
                      <p className={`mt-1 text-[11px] ${active ? "text-slate-600" : "text-text-muted"}`}>
                        {view.meta}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">{emptyMessage}</div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-text-secondary">
        <span>{listLoading ? "Loading..." : `Showing ${currentPageStart}-${currentPageEnd} of ${total}`}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onPrevPage} disabled={!!disabled || page <= 1}>
            Prev
          </Button>
          <span>
            {page}/{Math.max(1, totalPages)}
          </span>
          <Button size="sm" variant="outline" onClick={onNextPage} disabled={!!disabled || page >= totalPages}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
