const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGE_SIZE = 100;

export type AdminListQueryInput = {
  q?: string;
  page: number;
  pageSize: number;
};

export function parsePositiveInt(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function parseAdminListQuery(
  searchParams: URLSearchParams,
  options?: {
    defaultPage?: number;
    defaultPageSize?: number;
    maxPageSize?: number;
  },
): AdminListQueryInput {
  const defaultPage = options?.defaultPage ?? DEFAULT_PAGE;
  const defaultPageSize = options?.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options?.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;
  const q = searchParams.get("q")?.trim() ?? "";
  const page = parsePositiveInt(searchParams.get("page"), defaultPage);
  const requestedPageSize = parsePositiveInt(searchParams.get("pageSize"), defaultPageSize);
  const pageSize = Math.min(maxPageSize, requestedPageSize);

  return {
    q: q.length ? q : undefined,
    page,
    pageSize,
  };
}
