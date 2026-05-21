import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Timeline, Tag, Empty, Spin, Descriptions, Tag as AntTag, Button, message } from 'antd'
import { ArrowLeftOutlined, EnvironmentOutlined, ClockCircleOutlined } from '@ant-design/icons'
import AMapLoader from '@amap/amap-jsapi-loader'
import type { WeekendPlan } from '@/types'

interface PlanResultProps {
  plan: WeekendPlan | null
  loading?: boolean
}

const PlanResult = ({ plan, loading }: PlanResultProps) => {
  const navigate = useNavigate()
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    if (plan && mapContainer.current && !mapInstance.current) {
      initMap()
    }
    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy()
        mapInstance.current = null
      }
    }
  }, [plan])

  const initMap = async () => {
    if (!mapContainer.current || !plan) return
    try {
      const AMap = await AMapLoader.load({
        key: import.meta.env.VITE_AMAP_WEB_JS_KEY,
        version: '2.0',
        plugins: ['AMap.Marker', 'AMap.Polyline', 'AMap.InfoWindow']
      })

      mapInstance.current = new AMap.Map(mapContainer.current, {
        zoom: 12,
        center: [121.4737, 31.2304]
      })

      // 为每个步骤添加标记
      const markers: any[] = []
      plan.steps.forEach((step, index) => {
        if (step.location) {
          // 使用经纬度偏移模拟位置（实际应通过地理编码获取）
          const marker = new AMap.Marker({
            position: [121.47 + index * 0.02, 31.23 + index * 0.01],
            title: step.title,
            label: {
              content: `<div style="background:#667eea;color:white;padding:4px 8px;border-radius:4px;font-size:12px;white-space:nowrap;">${step.title}</div>`,
              offset: new AMap.Pixel(0, -30)
            }
          })
          markers.push(marker)
        }
      })

      if (markers.length > 0) {
        mapInstance.current.add(markers)
        mapInstance.current.setFitView(markers)
      }

      message.success('地图加载成功')
    } catch (error) {
      console.error('地图加载失败:', error)
      message.error('地图加载失败，请刷新重试')
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'activity': return 'blue'
      case 'food': return 'orange'
      case 'transport': return 'green'
      default: return 'gray'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'activity': return '🎯'
      case 'food': return '🍽️'
      case 'transport': return '🚗'
      default: return '📍'
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Spin size="large" tip="AI 规划中，请稍候..." />
      </div>
    )
  }

  if (!plan) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <Empty description="暂无规划数据" />
      </div>
    )
  }

  return (
    <div className="plan-result-container">
      {/* 头部 */}
      <div className="page-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          返回首页
        </Button>
        <h1>🎯 周末活动规划</h1>
      </div>

      <div className="content-wrapper">
        {/* 概览卡片 */}
        <Card className="overview-card">
          <Descriptions title="📋 方案概览" column={4}>
            <Descriptions.Item label="场景">{plan.scenario.scenario_type === 'family' ? '👨‍👩‍👧 家庭' : plan.scenario.scenario_type === 'friends' ? '👫 朋友' : '其他'}</Descriptions.Item>
            <Descriptions.Item label="总时长">{plan.total_duration_hours} 小时</Descriptions.Item>
            <Descriptions.Item label="约束">{plan.scenario.constraints.slice(0, 2).join('、') || '无'}</Descriptions.Item>
            <Descriptions.Item label="方案ID">#{plan.plan_id}</Descriptions.Item>
          </Descriptions>
          <div className="summary-text">{plan.summary}</div>
        </Card>

        <div className="main-content">
          {/* 左侧：时间线 */}
          <div className="left-section">
            <Card title="📅 活动时间线" className="timeline-card">
              <Timeline
                items={plan.steps.map((step) => ({
                  color: getEventColor(step.type),
                  children: (
                    <div className="timeline-item">
                      <div className="timeline-header">
                        <span className="timeline-icon">{getTypeIcon(step.type)}</span>
                        <span className="timeline-title">{step.title}</span>
                        <Tag color={getEventColor(step.type)}>{step.time_range}</Tag>
                      </div>
                      <div className="timeline-desc">{step.description}</div>
                      {step.location && (
                        <div className="timeline-location">
                          <EnvironmentOutlined /> {step.location}
                        </div>
                      )}
                      <div className="timeline-duration">
                        <ClockCircleOutlined /> {step.duration_minutes} 分钟
                      </div>
                    </div>
                  )
                }))}
              />
            </Card>

            {/* 建议卡片 */}
            <Card title="💡 温馨提示" className="suggestions-card">
              {plan.suggestions.map((s, i) => (
                <div key={i} className="suggestion-item">• {s}</div>
              ))}
            </Card>
          </div>

          {/* 右侧：路线和地图 */}
          <div className="right-section">
            <Card title="🛣️ 路线概览" className="route-card">
              <div className="route-list">
                <div className="route-item start">
                  <div className="route-marker">起</div>
                  <div className="route-info">
                    <div className="route-name">起点</div>
                    <div className="route-time">出发点</div>
                  </div>
                </div>
                {plan.steps.map((step, index) => (
                  <div key={index}>
                    <div className="route-line"></div>
                    <div className="route-item">
                      <div className="route-marker step">{index + 1}</div>
                      <div className="route-info">
                        <div className="route-name">{step.title}</div>
                        <div className="route-time">{step.time_range}</div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="route-line"></div>
                <div className="route-item end">
                  <div className="route-marker">终</div>
                  <div className="route-info">
                    <div className="route-name">结束</div>
                    <div className="route-time">返回</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="📍 地图" className="map-card">
              <div id="plan-amap-container" ref={mapContainer} style={{ width: '100%', height: '300px' }} />
            </Card>

            <Card title="🏷️ 标签" className="tags-card">
              <div className="tags-container">
                {plan.scenario.constraints.map((c, i) => (
                  <AntTag key={i} color="blue">{c}</AntTag>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlanResult