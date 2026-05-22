import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export async function getTransitTime(
  origin: string, // "lon,lat"
  destination: string,
  city: string = '上海市'
): Promise<{ duration: number; distance: number }> {
  try {
    const res = await axios.post(`${API_BASE}/api/transit-time`, {
      origin,
      destination,
      city
    }, { timeout: 35000 })
    if (res.data.success) {
      return {
        duration: res.data.duration / 60, // 转成分钟
        distance: res.data.distance
      }
    }
  } catch (e) {
    console.warn('[transit] fetch failed:', e)
  }
  return { duration: 15, distance: 0 } // fallback
}