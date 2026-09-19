// GIF picker ในแชท ใช้ GIPHY API (ฟรี ผ่าน "beta key" — จำกัด 100 requests/ชั่วโมง แต่ไม่มีค่าใช้จ่าย)
// เพราะ Tenor ปิดให้บริการถาวรไปแล้ว (30 มิ.ย. 2026) — GIPHY เป็นผู้ให้บริการ GIF search รายใหญ่
// ที่สุดที่ยังเปิดให้ใช้ฟรีอยู่ สมัคร API key ได้ที่ https://developers.giphy.com/dashboard/
// เงื่อนไขการใช้ฟรี: ต้องแสดงตราสัญลักษณ์ "Powered by GIPHY" ในหน้าค้นหา (ทำไว้ใน GifPicker.tsx แล้ว)
// การเรียก API นี้เป็น network เรียกตรงจากเบราว์เซอร์ไป GIPHY เท่านั้น ไม่ผ่าน/ไม่เกี่ยวกับ Firebase
// เลย จึงไม่มีผลต่อค่าใช้จ่าย Firestore read/write ที่กังวลไว้
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
const BASE_URL = "https://api.giphy.com/v1/gifs";

interface GiphyImageVariant {
  url: string;
  width: string;
  height: string;
}

interface GiphyItem {
  id: string;
  title: string;
  images: {
    original: GiphyImageVariant;
    downsized_medium?: GiphyImageVariant;
    fixed_height_small: GiphyImageVariant;
  };
}

interface GiphyResponse {
  data: GiphyItem[];
}

export interface GifResult {
  id: string;
  previewUrl: string; // ไฟล์เล็ก ใช้แสดงในกริดผลค้นหา โหลดเร็ว
  gifUrl: string; // ไฟล์คุณภาพเต็ม ใช้ส่งเป็นข้อความจริง
  description: string;
}

export const isGifPickerConfigured = () => Boolean(GIPHY_API_KEY);

const mapResults = (items: GiphyItem[]): GifResult[] =>
  items
    .map((item) => {
      const preview = item.images?.fixed_height_small;
      const full = item.images?.downsized_medium || item.images?.original;
      if (!preview?.url || !full?.url) return null;
      return { id: item.id, previewUrl: preview.url, gifUrl: full.url, description: item.title || "GIF" };
    })
    .filter((g): g is GifResult => g !== null);

const request = async (path: string, params: Record<string, string>): Promise<GifResult[]> => {
  if (!GIPHY_API_KEY) return [];
  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set("api_key", GIPHY_API_KEY);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GIPHY request failed: ${res.status}`);
  const data = (await res.json()) as GiphyResponse;
  return mapResults(data.data || []);
};

export const searchGifs = async (query: string): Promise<GifResult[]> => request("search", { q: query });

export const getTrendingGifs = async (): Promise<GifResult[]> => request("trending", {});
