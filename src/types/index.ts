export interface ScenarioContext {
  scenario_type: string
  constraints: string[]
  participants: string[]
  duration_hours: number
  budget: string | null
}

export interface PlanStep {
  step_id: string
  type: string
  title: string
  description: string
  time_range: string
  duration_minutes: number
  location: string | null
  booking_status: string
  booking_info: Record<string, any> | null
}

export interface WeekendPlan {
  plan_id: string
  summary: string
  scenario: ScenarioContext
  steps: PlanStep[]
  total_duration_hours: number
  total_estimate: string | null
  suggestions: string[]
  send_to: string | null
}

export interface PlanResponse {
  success: boolean
  message: string
  data: WeekendPlan
}

export interface PlanRequest {
  query: string
  city: string
  user_location?: string
}