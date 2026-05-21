import { useState, useRef, useEffect } from 'react';
import { Spin, Card, Timeline, Tag, Descriptions, Button } from 'antd';
import { EnvironmentOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { ArrowRight } from 'lucide-react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { motion } from 'motion/react';
import type { WeekendPlan } from './types';

interface ResultViewProps {
  onBack: () => void;
}

const ResultView = ({ onBack }: ResultViewProps) => {
  const [plan, setPlan] = useState<WeekendPlan | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    const data = sessionStorage.getItem('weekendPlan');
    if (data) {
      setPlan(JSON.parse(data));
    }
    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (plan && mapContainer.current && !mapInstance.current) {
      initMap();
    }
  }, [plan]);

  const initMap = async () => {
    if (!mapContainer.current || !plan) return;
    try {
      // 设置安全密钥（2021年12月后的 key 必须）
      window._AMapSecurityConfig = {
        securityJsCode: '5752376ae47f164382db363b556dccfb'
      };

      const AMap = await AMapLoader.load({
        key: import.meta.env.VITE_AMAP_WEB_JS_KEY,
        version: '2.0',
        plugins: ['AMap.Marker', 'AMap.Polyline', 'AMap.Geocoder']
      });

      mapInstance.current = new AMap.Map(mapContainer.current, {
        zoom: 12,
        center: [121.4737, 31.2304]
      });

      // 用地理编码器把地址转坐标
      const geocoder = new AMap.Geocoder();
      const markers: any[] = [];

      // 逐个解析地址（用 Promise 包装回调）
      const geocodeLocation = (address: string): Promise<[number, number]> => {
        return new Promise((resolve) => {
          geocoder.getLocation(address, (status: string, result: any) => {
            if (status === 'complete' && result.geocodes?.length) {
              const [lng, lat] = result.geocodes[0].location.toArray();
              resolve([lng, lat]);
            } else {
              resolve([121.4737, 31.2304]); // fallback 到上海中心
            }
          });
        });
      };

      const positions = await Promise.all(
        plan.steps.map((step, index) => geocodeLocation(step.location || step.title))
      );

      positions.forEach(([lng, lat], index) => {
        const marker = new AMap.Marker({
          position: [lng, lat],
          title: plan.steps[index].title,
          label: {
            content: `<div style="background:#667eea;color:white;padding:4px 8px;border-radius:4px;font-size:12px;white-space:nowrap;">${plan.steps[index].title}</div>`,
            offset: new AMap.Pixel(0, -30)
          }
        });
        mapInstance.current.add(marker);
        markers.push(marker);
      });

      // 画路线
      if (markers.length >= 2) {
        const path = markers.map((m) => m.getPosition());
        mapInstance.current.add(new AMap.Polyline({
          path,
          strokeColor: '#667eea',
          strokeWeight: 3,
          strokeOpacity: 0.7
        }));
        mapInstance.current.setFitView();
      }
    } catch (error) {
      console.error('地图加载失败:', error);
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'activity': return 'blue';
      case 'food': return 'orange';
      case 'transport': return 'green';
      default: return 'gray';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'activity': return '🎯';
      case 'food': return '🍽️';
      case 'transport': return '🚗';
      default: return '📍';
    }
  };

  if (!plan) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      >
        <Spin size="large" tip="加载规划中..." />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto"
      style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)' }}
    >
      <div className="flex items-center gap-4 p-6 md:px-12 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <Button icon={<ArrowRight className="rotate-180 w-4 h-4" />} onClick={onBack}>
          返回首页
        </Button>
        <h1 className="text-2xl font-bold">🎯 周末活动规划</h1>
      </div>

      <div className="flex-1 p-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          {/* 概览卡片 */}
          <Card className="mb-6" style={{ borderRadius: 16 }}>
            <Descriptions title="📋 方案概览" column={4}>
              <Descriptions.Item label="场景">{plan.scenario.scenario_type === 'family' ? '👨‍👩‍👧 家庭' : plan.scenario.scenario_type === 'friends' ? '👫 朋友' : '其他'}</Descriptions.Item>
              <Descriptions.Item label="总时长">{plan.total_duration_hours} 小时</Descriptions.Item>
              <Descriptions.Item label="约束">{plan.scenario.constraints.slice(0, 2).join('、') || '无'}</Descriptions.Item>
              <Descriptions.Item label="方案ID">#{plan.plan_id}</Descriptions.Item>
            </Descriptions>
            <div className="mt-4 text-gray-600">{plan.summary}</div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：时间线 */}
            <div className="lg:col-span-2">
              <Card title="📅 活动时间线" className="mb-6" style={{ borderRadius: 16 }}>
                <Timeline
                  items={plan.steps.map((step) => ({
                    color: getEventColor(step.type),
                    children: (
                      <div className="bg-gray-50 p-4 rounded-xl ml-2">
                        <div className="flex items-center gap-2 mb-2">
                          <span>{getTypeIcon(step.type)}</span>
                          <span className="font-semibold">{step.title}</span>
                          <Tag color={getEventColor(step.type)}>{step.time_range}</Tag>
                        </div>
                        <div className="text-gray-600 text-sm mb-2">{step.description}</div>
                        {step.location && (
                          <div className="text-gray-400 text-xs mb-1">
                            <EnvironmentOutlined /> {step.location}
                          </div>
                        )}
                        <div className="text-gray-300 text-xs">
                          <ClockCircleOutlined /> {step.duration_minutes} 分钟
                        </div>
                      </div>
                    )
                  }))}
                />
              </Card>

              <Card title="💡 温馨提示" style={{ borderRadius: 16, background: 'linear-gradient(135deg, #fff9e6 0%, #fff5d6 100%)' }}>
                {plan.suggestions.map((s, i) => (
                  <div key={i} className="py-2 border-b border-gray-200 text-gray-600 text-sm">• {s}</div>
                ))}
              </Card>
            </div>

            {/* 右侧：路线和地图 */}
            <div>
              <Card title="🛣️ 路线概览" className="mb-6" style={{ borderRadius: 16 }}>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm">起</div>
                    <div>
                      <div className="font-medium text-sm">起点</div>
                      <div className="text-gray-400 text-xs">出发点</div>
                    </div>
                  </div>
                  {plan.steps.map((step, index) => (
                    <div key={index}>
                      <div className="border-l-2 h-6 border-gray-300 ml-4 my-1"></div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm">{index + 1}</div>
                        <div>
                          <div className="font-medium text-sm">{step.title}</div>
                          <div className="text-gray-400 text-xs">{step.time_range}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="border-l-2 h-6 border-gray-300 ml-4 my-1"></div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">终</div>
                    <div>
                      <div className="font-medium text-sm">结束</div>
                      <div className="text-gray-400 text-xs">返回</div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="📍 地图" style={{ borderRadius: 16 }} bodyStyle={{ padding: 0 }}>
                <div id="plan-amap-container" ref={mapContainer} style={{ width: '100%', height: 300 }} />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ResultView;