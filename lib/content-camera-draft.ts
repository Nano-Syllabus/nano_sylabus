import type { ContentCameraPhoto } from "@/lib/content-camera-types";

type Draft = { id: string; expiresAt: string; name: string; pages: ContentCameraPhoto[] };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("nano-content-scans", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
export async function loadCameraDraft(id: string) {
  const database = await db();
  return new Promise<Draft | null>((resolve, reject) => {
    const transaction = database.transaction("drafts", "readwrite");
    const store = transaction.objectStore("drafts");
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (entry) {
        if (Date.parse(entry.value.expiresAt) <= Date.now()) entry.delete();
        entry.continue();
      }
    };
    const request = store.get(id);
    request.onsuccess = () =>
      resolve(
        request.result && Date.parse(request.result.expiresAt) > Date.now() ? request.result : null,
      );
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function saveCameraDraft(draft: Draft) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(draft);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function deleteCameraDraft(id: string) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
