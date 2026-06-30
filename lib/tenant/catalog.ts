import type { TenantSourceTreeNode, TenantSubject } from "@/lib/tenant/client";

const SEMESTER_CODE_TO_VALUE: Record<string, string> = {
  "[I-I]": "1",
  "[I-II]": "2",
  "[II-I]": "3",
  "[II-II]": "4",
  "[III-I]": "5",
  "[III-II]": "6",
  "[IV-I]": "7",
  "[IV-II]": "8",
};

function toSemesterLabel(value: string) {
  switch (value) {
    case "1":
      return "1st Semester";
    case "2":
      return "2nd Semester";
    case "3":
      return "3rd Semester";
    default:
      return `${value}th Semester`;
  }
}

function sortNaturally(values: string[]) {
  return values.sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }),
  );
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferFaculty(institute: string) {
  const compact = institute.trim();
  if (!compact) return "IOE";
  if (/\bIOE\b/i.test(compact)) return "IOE";
  if (/engineering/i.test(compact)) return "IOE";
  return compact;
}

type TreeSubjectMeta = {
  namespace: string;
  institute: string;
  faculty: string;
  level: string;
  branch: string;
  semesterCode: string;
  semesterValue: string;
  semesterLabel: string;
  subjectName: string;
  namespaceSlug: string;
};

type TreeWalkState = {
  namespaces: Map<string, { label: string; value: string }>;
  facultySet: Set<string>;
  levelsByFaculty: Map<string, Set<string>>;
  branchesByPath: Map<string, Set<string>>;
  semestersByPath: Map<string, Map<string, { value: string; label: string; code: string }>>;
  subjectMetaByFolderPath: Map<string, TreeSubjectMeta>;
  indexedStatsByFolderPath: Map<string, { indexedFileCount: number; indexedChunkCount: number }>;
};

function walkTree(nodes: TenantSourceTreeNode[], state: TreeWalkState, path: string[] = []) {
  for (const node of nodes) {
    const next = [...path, node.name];
    const depth = next.length;

    if (depth >= 4) {
      const [namespace = "", institute = "", branch = "", semesterCode = ""] = next;
      const faculty = inferFaculty(institute);
      const semesterValue = SEMESTER_CODE_TO_VALUE[semesterCode] ?? "";
      const level = "Bachelor";

      if (namespace) {
        state.namespaces.set(slugify(namespace), {
          label: namespace,
          value: slugify(namespace),
        });
      }

      if (faculty) {
        state.facultySet.add(faculty);
        const levels = state.levelsByFaculty.get(faculty) ?? new Set<string>();
        levels.add(level);
        state.levelsByFaculty.set(faculty, levels);
      }

      if (faculty && branch) {
        const branchKey = `${faculty}::${level}`;
        const branches = state.branchesByPath.get(branchKey) ?? new Set<string>();
        branches.add(branch);
        state.branchesByPath.set(branchKey, branches);
      }

      if (faculty && branch && semesterValue) {
        const semesterKey = `${faculty}::${level}::${branch}`;
        const semesterMap =
          state.semestersByPath.get(semesterKey) ??
          new Map<string, { value: string; label: string; code: string }>();
        semesterMap.set(semesterValue, {
          value: semesterValue,
          label: toSemesterLabel(semesterValue),
          code: semesterCode,
        });
        state.semestersByPath.set(semesterKey, semesterMap);
      }
    }

    if (depth >= 5) {
      const [namespace = "", institute = "", branch = "", semesterCode = "", subjectName = ""] = next;
      const faculty = inferFaculty(institute);
      const semesterValue = SEMESTER_CODE_TO_VALUE[semesterCode] ?? "";
      if (faculty && branch && semesterValue && subjectName) {
        const folderPath = [namespace, institute, branch, semesterCode, subjectName].join("/");
        state.subjectMetaByFolderPath.set(folderPath, {
          namespace,
          institute,
          faculty,
          level: "Bachelor",
          branch,
          semesterCode,
          semesterValue,
          semesterLabel: toSemesterLabel(semesterValue),
          subjectName,
          namespaceSlug: slugify(namespace),
        });
      }
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      walkTree(node.children, state, next);
      continue;
    }

    if (depth >= 6) {
      const subjectFolderPath = next.slice(0, 5).join("/");
      const current = state.indexedStatsByFolderPath.get(subjectFolderPath) ?? {
        indexedFileCount: 0,
        indexedChunkCount: 0,
      };
      if (node.indexed) {
        current.indexedFileCount += 1;
        current.indexedChunkCount += typeof node.chunk_count === "number" ? node.chunk_count : 0;
      }
      state.indexedStatsByFolderPath.set(subjectFolderPath, current);
    }
  }
}

export type TenantCatalogSubject = {
  name: string;
  slug: string;
  namespace: string;
  namespaceSlug: string;
  fullPath: string;
  folderPath: string;
  branch: string;
  semesterValue: string;
  semesterLabel: string;
  semesterCode: string;
  indexedFileCount: number;
  indexedChunkCount: number;
};

export type TenantEngineeringCatalog = {
  namespaces: Array<{
    label: string;
    value: string;
  }>;
  faculties: string[];
  levelsByFaculty: Record<string, string[]>;
  branchesByPath: Record<string, string[]>;
  semestersByPath: Record<string, Array<{ value: string; label: string; code: string }>>;
  subjectsByPath: Record<string, TenantCatalogSubject[]>;
};

export function buildTenantEngineeringCatalog(
  tree: TenantSourceTreeNode[],
  subjects: TenantSubject[],
) {
  const state: TreeWalkState = {
    namespaces: new Map<string, { label: string; value: string }>(),
    facultySet: new Set<string>(),
    levelsByFaculty: new Map<string, Set<string>>(),
    branchesByPath: new Map<string, Set<string>>(),
    semestersByPath: new Map<string, Map<string, { value: string; label: string; code: string }>>(),
    subjectMetaByFolderPath: new Map<string, TreeSubjectMeta>(),
    indexedStatsByFolderPath: new Map<string, { indexedFileCount: number; indexedChunkCount: number }>(),
  };

  walkTree(tree, state);

  const subjectsByPath = new Map<string, Map<string, TenantCatalogSubject>>();

  for (const subject of subjects) {
    const meta = state.subjectMetaByFolderPath.get(subject.folder_path);
    if (!meta) continue;

    const subjectKey = `${meta.faculty}::${meta.level}::${meta.branch}::${meta.semesterValue}`;
    const subjectMap = subjectsByPath.get(subjectKey) ?? new Map<string, TenantCatalogSubject>();
    const stats = state.indexedStatsByFolderPath.get(subject.folder_path);
    const existing = subjectMap.get(subject.slug);

    subjectMap.set(subject.slug, {
      name: subject.name,
      slug: subject.slug,
      namespace: subject.namespace || meta.namespace,
      namespaceSlug: subject.namespace_slug || meta.namespaceSlug,
      fullPath: subject.full_path || `nano-syllabus/${subject.folder_path}`,
      folderPath: subject.folder_path,
      branch: meta.branch,
      semesterValue: meta.semesterValue,
      semesterLabel: meta.semesterLabel,
      semesterCode: meta.semesterCode,
      indexedFileCount: Math.max(existing?.indexedFileCount ?? 0, stats?.indexedFileCount ?? 0),
      indexedChunkCount: Math.max(
        existing?.indexedChunkCount ?? 0,
        Math.max(subject.chunk_count, stats?.indexedChunkCount ?? 0),
      ),
    });

    subjectsByPath.set(subjectKey, subjectMap);
  }

  return {
    namespaces: Array.from(state.namespaces.values()).sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true }),
    ),
    faculties: sortNaturally(Array.from(state.facultySet)),
    levelsByFaculty: Object.fromEntries(
      Array.from(state.levelsByFaculty.entries()).map(([faculty, levels]) => [
        faculty,
        sortNaturally(Array.from(levels)),
      ]),
    ),
    branchesByPath: Object.fromEntries(
      Array.from(state.branchesByPath.entries()).map(([key, branches]) => [
        key,
        sortNaturally(Array.from(branches)),
      ]),
    ),
    semestersByPath: Object.fromEntries(
      Array.from(state.semestersByPath.entries()).map(([key, semesterMap]) => [
        key,
        Array.from(semesterMap.values()).sort((left, right) => Number(left.value) - Number(right.value)),
      ]),
    ),
    subjectsByPath: Object.fromEntries(
      Array.from(subjectsByPath.entries()).map(([key, subjectMap]) => [
        key,
        Array.from(subjectMap.values()).sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true }),
        ),
      ]),
    ),
  } satisfies TenantEngineeringCatalog;
}
