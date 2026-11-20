/* 現場の写真。この端末のブラウザ（IndexedDB）に、縮小して保存する。サンプルの写真は絵で描く（本物の写真ではない）。 */
const DB = "site-photos", STORE = "photos";
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!("indexedDB" in window)) return rej(new Error("このブラウザでは写真を保存できません"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error("写真の保存先を開けません"));
  });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), st = t.objectStore(STORE), q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };

/** 画像を最大1280pxの JPEG に縮めて保存し、id を返す。画像以外・大きすぎるものは断る。 */
export async function savePhoto(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("画像のファイルを選んでください");
  if (file.size > 25 * 1024 * 1024) throw new Error("ファイルが大きすぎます（25MBまで）");
  const bmp = await createImageBitmap(file), k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.72));
  const id = "p:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await tx("readwrite", st => st.put(blob, id)); return id;
}
export async function photoUrl(id) {
  if (String(id).startsWith("s:")) return sampleSvg(id);
  const blob = await tx("readonly", st => st.get(id)); return blob ? URL.createObjectURL(blob) : null;
}
export async function deletePhoto(id) { if (!String(id).startsWith("s:")) await tx("readwrite", st => st.delete(id)); }

/** サンプルの写真（絵）。番号ごとに色が変わる。 */
function sampleSvg(id) {
  const n = Number(String(id).slice(2)) || 1, h = (n * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,42%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},60%,22%)"/></linearGradient></defs><rect width="240" height="180" fill="url(#g)"/><path d="M0 130 L70 80 L120 115 L170 70 L240 120 V180 H0Z" fill="rgba(255,255,255,.14)"/><text x="120" y="92" text-anchor="middle" font-size="16" fill="#fff" font-family="sans-serif">サンプル写真 ${n}</text><text x="120" y="114" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.75)" font-family="sans-serif">（本物の写真ではありません）</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
/** ページの中の <img data-photo="id"> に、写真を入れる。 */
export async function hydratePhotos(root) {
  const imgs = [...root.querySelectorAll("img[data-photo]")];
  for (const im of imgs) { try { const u = await photoUrl(im.dataset.photo); if (u) im.src = u; else im.alt = "写真が見つかりません"; } catch { im.alt = "写真を読み込めません"; } }
}
