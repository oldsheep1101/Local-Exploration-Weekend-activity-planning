import axios from 'axios'
import type { PlanRequest, PlanResponse } from '@/types'
export * from './weather'

const API_BASE_URL = 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' }
})

export async function generatePlan(formData: PlanRequest): Promise<PlanResponse> {
  try {
    const response = await apiClient.post<PlanResponse>('/api/plan', formData)
    return response.data
  } catch (error: any) {
    throw new Error(error.response?.data?.detail || error.message || '生成规划失败')
  }
}

export async function parseQuery(query: string, city: string = '上海') {
  try {
    const response = await apiClient.post('/api/parse', { query, city })
    return response.data
  } catch (error: any) {
    console.error('解析失败:', error)
    return { success: true, data: { scenario_type: 'family', people: '3', budget: '不限', constraints: [] } }
  }
}

export default apiClient