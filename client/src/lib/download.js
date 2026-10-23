// v1.3 one-click export: fetch the endpoint, pull the server-set filename out
// of Content-Disposition, and hand the blob to the browser's download flow.
export default async function downloadExport(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = match?.[1] ?? "export";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
