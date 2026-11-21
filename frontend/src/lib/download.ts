/**
 * Downloads a file from the API.
 *
 * A plain `<a download>` saves whatever the server answers, so a refusal or a
 * missing file arrives as a JSON file named "download". Fetching first lets an
 * error be shown as an error, and the file is saved only when it exists.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `The download failed (${response.status}). Please try again.`);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const named = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const filename = named ? decodeURIComponent(named[1] ?? named[2]) : fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
