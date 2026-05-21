import axios from 'axios'

const QWEATHER_KEY = import.meta.env.VITE_QWEATHER_KEY || ''
const QWEATHER_BASE = 'https://p44gkkfknv.re.qweatherapi.com'

export interface WeatherForecast {
  date: string
  textDay: string
  textNight: string
  tempMax: number
  tempMin: number
  precip: number
  humidity: number
  windDir: string
  windScale: string
  uvIndex: string
}

export interface MinutelyPrecip {
  summary: string
  min60: Array<{ time: string; precip: number }>
}

export interface AirQuality {
  aqi: string
  level: string
  category: string
  pm2p5: string
  pm10: string
  o3: string
  no2: string
  so2: string
  co: string
}

export interface WeatherAlert {
  alertName: string
  severity: string
  content: string
  publishTime: string
}

export interface WeatherResult {
  forecasts: WeatherForecast[]
  minutely?: MinutelyPrecip
  air?: AirQuality
  alerts?: WeatherAlert[]
  source: string
}

// 获取上海嘉定的 locationId (101020600)
const DEFAULT_LOCATION = '101020600' // 上海-嘉定

export async function getWeatherForecast(locationId: string = DEFAULT_LOCATION): Promise<WeatherForecast[]> {
  if (!QWEATHER_KEY) {
    console.warn('QWeather key 未配置')
    return []
  }

  try {
    const response = await axios.get(`${QWEATHER_BASE}/v7/weather/7d`, {
      params: {
        key: QWEATHER_KEY,
        location: locationId
      },
      timeout: 10000
    })

    if (response.data.code === '200') {
      return response.data.daily.map((d: any) => ({
        date: d.fxDate,
        textDay: d.textDay,
        textNight: d.textNight,
        tempMax: parseInt(d.tempMax),
        tempMin: parseInt(d.tempMin),
        precip: parseFloat(d.precip),
        humidity: parseInt(d.humidity),
        windDir: d.windDirDay,
        windScale: d.windScaleDay,
        uvIndex: d.uvIndex
      }))
    }
    return []
  } catch (error) {
    console.error('获取天气预报失败:', error)
    return []
  }
}

export async function getMinutelyPrecip(locationId: string = DEFAULT_LOCATION): Promise<MinutelyPrecip | null> {
  if (!QWEATHER_KEY) return null

  try {
    const response = await axios.get(`${QWEATHER_BASE}/v7/minutely/5m`, {
      params: {
        key: QWEATHER_KEY,
        location: locationId
      },
      timeout: 10000
    })

    if (response.data.code === '200') {
      return {
        summary: response.data.summary,
        min60: response.data.minutely.map((m: any) => ({
          time: m.time,
          precip: parseFloat(m.precip)
        }))
      }
    }
    return null
  } catch (error) {
    console.error('获取分钟降水失败:', error)
    return null
  }
}

export async function getAirQuality(locationId: string = DEFAULT_LOCATION): Promise<AirQuality | null> {
  if (!QWEATHER_KEY) return null

  try {
    const response = await axios.get(`${QWEATHER_BASE}/v7/air/now`, {
      params: {
        key: QWEATHER_KEY,
        location: locationId
      },
      timeout: 10000
    })

    if (response.data.code === '200') {
      const a = response.data.now
      return {
        aqi: a.aqi,
        level: a.level,
        category: a.category,
        pm2p5: a.pm2p5,
        pm10: a.pm10,
        o3: a.o3,
        no2: a.no2,
        so2: a.so2,
        co: a.co
      }
    }
    return null
  } catch (error) {
    console.error('获取空气质量失败:', error)
    return null
  }
}

export async function getWeatherAlerts(locationId: string = DEFAULT_LOCATION): Promise<WeatherAlert[]> {
  if (!QWEATHER_KEY) return []

  try {
    const response = await axios.get(`${QWEATHER_BASE}/v7/warning/now`, {
      params: {
        key: QWEATHER_KEY,
        location: locationId
      },
      timeout: 10000
    })

    if (response.data.code === '200') {
      return response.data.warning.map((w: any) => ({
        alertName: w.name,
        severity: w.severity,
        content: w.text,
        publishTime: w.publishTime
      }))
    }
    return []
  } catch (error) {
    console.error('获取天气预警失败:', error)
    return []
  }
}

export async function getWeather(locationId: string = DEFAULT_LOCATION): Promise<WeatherResult> {
  const [forecasts, minutely, air, alerts] = await Promise.all([
    getWeatherForecast(locationId),
    getMinutelyPrecip(locationId),
    getAirQuality(locationId),
    getWeatherAlerts(locationId)
  ])

  return {
    forecasts,
    minutely: minutely || undefined,
    air: air || undefined,
    alerts: alerts.length > 0 ? alerts : undefined,
    source: 'QWeather'
  }
}

export async function getLocationByCity(city: string): Promise<string | null> {
  if (!QWEATHER_KEY) return null

  try {
    const response = await axios.get('https://geoapi.qweather.com/v2/city/lookup', {
      params: {
        key: QWEATHER_KEY,
        location: city,
        adm: city
      },
      timeout: 10000
    })

    if (response.data.code === '200' && response.data.location?.length > 0) {
      return response.data.location[0].id
    }
    return null
  } catch (error) {
    console.error('获取城市 locationId 失败:', error)
    return null
  }
}