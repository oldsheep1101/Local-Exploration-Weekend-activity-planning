import { useState, useRef, useEffect } from 'react';
import { ArrowRight, MapPin, Clock, AlertTriangle, Lightbulb, Map as MapIcon, Coffee, Sun, CloudRain } from 'lucide-react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { motion } from 'motion/react';
import type { WeekendPlan, PlanStep } from '../types';
import { getTransitTime } from '../services/transit';

interface ResultViewProps {
  onBack: () => void;
  key?: string;
}

interface EnrichedStep extends PlanStep {
  coord?: [number, number];
  is_transit?: boolean;
}

export default function ResultView({ onBack }: ResultViewProps) {
  const [activeTab, setActiveTab] = useState<'indoor' | 'outdoor'>('outdoor');
  const [currentPlan, setCurrentPlan] = useState<WeekendPlan | null>(null);
  const [data, setData] = useState<any>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const mapInitializedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const raw = sessionStorage.getItem('weekendPlan');
    if (raw) {
      const parsed = JSON.parse(raw);
      setData(parsed);
      const defaultTab = parsed.outdoor ? 'outdoor' : 'indoor';
      setActiveTab(defaultTab);
      setCurrentPlan(defaultTab === 'outdoor' ? parsed.outdoor : parsed.indoor);
    }
    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, []);

  const handleTabChange = (tab: 'indoor' | 'outdoor') => {
    if (tab === activeTab || !data?.[tab]) return;
    setActiveTab(tab);
    setCurrentPlan(data[tab]);
  };

  // 初始化地图
  useEffect(() => {
    if (!currentPlan || !mapContainer.current) return;

    const planKey = `${activeTab}-${currentPlan.plan_id}`;
    if (mapInitializedRef.current.has(planKey)) return;
    mapInitializedRef.current.add(planKey);

    initMap().finally(() => {
      mapInitializedRef.current.delete(planKey);
    });
  }, [currentPlan?.plan_id, activeTab]);

  const initMap = async () => {
    if (!mapContainer.current || !currentPlan) return;
    try {
      (window as any)._AMapSecurityConfig = {
        securityJsCode: '5752376ae47f164382db363b556dccfb'
      };

      const AMap = await AMapLoader.load({
        key: import.meta.env.VITE_AMAP_WEB_JS_KEY,
        version: '2.0',
        plugins: ['AMap.Marker', 'AMap.Polyline', 'AMap.Geocoder', 'AMap.Driving', 'AMap.Transfer']
      });

      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }

      const map = new AMap.Map(mapContainer.current, {
        zoom: 12,
        center: [121.4737, 31.2304],
        mapStyle: 'amap://styles/light'
      });
      mapInstance.current = map;
      amapRef.current = AMap;
      const geocoder = new AMap.Geocoder();
      geocoderRef.current = geocoder;

      const geocodeAddress = (addr: string): Promise<[number, number]> => {
        const searchAddr = addr.includes('上海') ? addr : `上海市${addr}`;
        return new Promise((resolve) => {
          geocoder.getLocation(searchAddr, (status: string, result: any) => {
            if (status === 'complete' && result.geocodes?.length) {
              const loc = result.geocodes[0].location;
              resolve([loc.getLng(), loc.getLat()]);
            } else {
              resolve([121.4737, 31.2304]);
            }
          });
        });
      };

      // 并行解析所有活动地点的坐标
      const activitySteps = currentPlan.steps.filter((s: PlanStep) => s.type !== 'transport');
      const positions = await Promise.all(
        activitySteps.map((step: PlanStep) => geocodeAddress(step.location || step.title))
      );

      // 如果已有 transit 步骤（被计算过），直接用
      const allSteps = currentPlan.steps as EnrichedStep[];

      // 用坐标替换步骤中的位置（用于地图显示）
      let activityIdx = 0;
      allSteps.forEach((step: EnrichedStep) => {
        if (step.type !== 'transport' && positions[activityIdx]) {
          step.coord = positions[activityIdx];
          activityIdx++;
        }
      });

      // 画线和标记
      const hexColor = activeTab === 'indoor' ? '#3b82f6' : '#fcd34d';
      const activityPositions: [number, number][] = [];

      allSteps.forEach((step: EnrichedStep, index: number) => {
        if (!step.coord) return;
        if (step.type !== 'transport') {
          activityPositions.push(step.coord);
        }

        const isTransit = step.type === 'transport';
        const marker = new AMap.Marker({
          position: step.coord,
          title: step.title,
          content: `<div style="background:${
            isTransit ? '#6b7280' : hexColor
          };color:${activeTab === 'indoor' || isTransit ? 'white' : 'black'};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1);border:2px solid white;font-size:11px;">${
            isTransit ? '🚗' : index + 1
          }</div>`,
          offset: new AMap.Pixel(-14, -14)
        });
        map.add(marker);
      });

      if (activityPositions.length >= 2) {
        map.add(new AMap.Polyline({
          path: activityPositions,
          strokeColor: hexColor,
          strokeWeight: 4,
          strokeOpacity: 0.8,
          borderWeight: 2,
          outlineColor: 'white'
        }));
        map.setFitView(undefined, false, [40, 40, 40, 40]);
      }
    } catch (error) {
      console.error('Map loading failed:', error);
    }
  };

  // 计算通勤时间（只运行一次）
  // 注意：通勤计算已移至后端 /api/plan，这里不再需要前端计算
  useEffect(() => {
    if (!currentPlan) return;
    const planKey = `${activeTab}-${currentPlan.plan_id}`;
    console.log('[通勤useEffect] 跳过，前端通勤计算已禁用（后端计算）');
  }, [currentPlan?.plan_id, activeTab]);

  async function calculateAndInsertTransit(plan: WeekendPlan, planKey: string) {
    // 过滤出非交通步骤
    const activitySteps = plan.steps.filter((s: PlanStep) => s.type !== 'transport');
    console.log('[通勤计算] 开始, planKey:', planKey, '活动数量:', activitySteps.length);
    if (activitySteps.length < 2) {
      console.log('[通勤计算] 活动少于2个，跳过');
      transitCalculatedRef.current.add(planKey + '-done');
      return;
    }

    try {
      // 重新加载高德，获取一个全新的 geocoder 实例（避免复用已失效的）
      console.log('[通勤计算] 开始加载 AMap...');
      (window as any)._AMapSecurityConfig = {
        securityJsCode: '5752376ae47f164382db363b556dccfb'
      };
      const AMap = await AMapLoader.load({
        key: import.meta.env.VITE_AMAP_WEB_JS_KEY,
        version: '2.0',
        plugins: ['AMap.Geocoder']
      });
      console.log('[通勤计算] AMap 加载完成');
      const geocoder = new AMap.Geocoder();
      console.log('[通勤计算] geocoder 创建完成');

      // 解析每个活动地点的坐标
      const activityPositions: [number, number][] = await Promise.all(
        activitySteps.map((step: PlanStep, idx: number) => {
          const searchAddr = (step.location || step.title).includes('上海')
            ? step.location || step.title
            : `上海市${step.location || step.title}`;
          console.log('[通勤计算] 地理解析:', searchAddr);
          return new Promise<[number, number]>((resolve) => {
            // 5秒超时
            const timeoutId = setTimeout(() => {
              console.log(`[通勤计算] 地理解析超时(${idx})，使用默认坐标`);
              resolve([121.4737, 31.2304]);
            }, 5000);
            geocoder.getLocation(searchAddr, (status: string, result: any) => {
              clearTimeout(timeoutId);
              try {
                const resultStr = result ? JSON.stringify(result).slice(0, 100) : 'null';
                console.log('[通勤计算] geocoder 回调 status:', status, 'result:', resultStr);
              } catch {}
              if (status === 'complete' && result?.geocodes?.length) {
                const loc = result.geocodes[0].location;
                resolve([loc.getLng(), loc.getLat()]);
              } else {
                console.log('[通勤计算] 地理解析失败，使用默认坐标');
                resolve([121.4737, 31.2304]);
              }
            });
          });
        })
      );
      console.log('[通勤计算] 地理解析完成, 坐标:', activityPositions);

      // 根据场景决定出行方式：家庭开车，其他公共交通
      const isFamily = plan.scenario?.scenario_type === 'family';
      console.log('[通勤计算] 场景:', plan.scenario?.scenario_type, 'isFamily:', isFamily);

      // 调用后端 API 计算通勤时间
      const transitTimes: Array<{ duration: number; distance: string }> = [];
      for (let i = 0; i < activityPositions.length - 1; i++) {
        const from = `${activityPositions[i][0]},${activityPositions[i][1]}`;
        const to = `${activityPositions[i + 1][0]},${activityPositions[i + 1][1]}`;
        const t = await getTransitTime(from, to, '上海市');
        transitTimes.push({
          duration: t.duration,
          distance: String(t.distance)
        });
      }

      console.log('[通勤计算] 通勤时间:', transitTimes);

      // 构建新的步骤列表（活动+交通交替，按时间排序）
      const newSteps: EnrichedStep[] = [];
      let currentMinutes = timeToMinutes(activitySteps[0]?.time_range?.split('-')[0] || '09:00');
      console.log('[通勤计算] 起始分钟:', currentMinutes);

      activitySteps.forEach((step: PlanStep, idx: number) => {
        // 活动时间
        const activityStart = currentMinutes;
        const activityEnd = activityStart + (step.duration_minutes || 60);
        newSteps.push({
          ...step,
          time_range: `${minutesToTime(activityStart)}-${minutesToTime(activityEnd)}`,
          coord: activityPositions[idx],
          is_transit: false
        });
        currentMinutes = activityEnd;

        // 插入通行步骤
        if (idx < transitTimes.length) {
          const transit = transitTimes[idx];
          const transitStart = currentMinutes;
          const transitEnd = transitStart + transit.duration;
          newSteps.push({
            step_id: `transit-${idx}`,
            type: 'transport',
            title: isFamily ? '🚗 自驾前往' : '🚇 公共交通前往',
            description: `预计${transit.duration}分钟${transit.distance !== '未知' ? `，约${transit.distance}` : ''}`,
            time_range: `${minutesToTime(transitStart)}-${minutesToTime(transitEnd)}`,
            duration_minutes: transit.duration,
            location: null,
            booking_status: 'pending',
            booking_info: null,
            is_transit: true
          });
          currentMinutes = transitEnd;
        }
      });

      // 标记为已完成
      transitCalculatedRef.current.add(planKey + '-done');

      // 更新 plan
      const updatedPlan = {
        ...plan,
        steps: newSteps,
        total_duration_hours: Math.ceil(currentMinutes / 60)
      };

      // 更新 sessionStorage 缓存，同时更新 React state
      const raw = sessionStorage.getItem('weekendPlan');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (activeTab === 'indoor') {
          parsed.indoorWithTransit = updatedPlan;
        } else {
          parsed.outdoorWithTransit = updatedPlan;
        }
        sessionStorage.setItem('weekendPlan', JSON.stringify(parsed));
      }

      // 更新 data，这样 tab 切换时缓存仍可用
      setData((prev: any) => {
        if (!prev) return prev;
        const updated = { ...prev };
        if (activeTab === 'indoor') {
          updated.indoorWithTransit = updatedPlan;
        } else {
          updated.outdoorWithTransit = updatedPlan;
        }
        return updated;
      });

      console.log('[通勤计算] 新步骤数量:', newSteps.length, '活动+交通');
      console.log('[通勤计算] updatedPlan total_duration_hours:', updatedPlan.total_duration_hours);

      console.log('[通勤计算] setCurrentPlan 即将调用, newSteps:', newSteps.length);
      newSteps.forEach((s, i) => console.log(`  步骤${i}: type=${s.type} time_range=${s.time_range} duration=${s.duration_minutes} title=${s.title}`));
      setCurrentPlan(updatedPlan);
      console.log('[通勤计算] setCurrentPlan 已调用, updatedPlan.steps:', updatedPlan.steps.length);
    } catch (e) {
      console.error('Transit calculation failed:', e);
    }
  }

  function timeToMinutes(timeStr: string): number {
    if (!timeStr) return 540; // 默认 09:00
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'activity': return <MapIcon className="w-5 h-5" />;
      case 'food': return <Coffee className="w-5 h-5" />;
      case 'transport': return <ArrowRight className="w-5 h-5" />;
      default: return <MapPin className="w-5 h-5" />;
    }
  };

  if (!data || !currentPlan) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center">
        <div className="flex gap-1 mb-4">
          <span className="w-3 h-3 bg-brand-blue rounded-full animate-bounce [animation-delay:-0.3s]"></span>
          <span className="w-3 h-3 bg-brand-yellow rounded-full animate-bounce [animation-delay:-0.15s]"></span>
          <span className="w-3 h-3 bg-brand-orange rounded-full animate-bounce"></span>
        </div>
        <div className="font-display font-bold text-gray-500 uppercase tracking-widest text-xs">Generating Plan...</div>
      </div>
    );
  }

  const blueContentVariants = {
    indoor: { clipPath: "polygon(0% 0%, 200% 0%, 100% 100%, 0% 100%)" },
    outdoor: { clipPath: "polygon(0% 0%, 0% 0%, -100% 100%, 0% 100%)" }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
    >
      {/* Background Layers */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-brand-yellow"></div>
        <motion.div
          className="absolute inset-0 bg-brand-blue"
          variants={blueContentVariants}
          initial={false}
          animate={activeTab}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <header className="h-24 md:h-32 px-6 md:px-12 flex justify-between items-center shrink-0 relative">
          <motion.button
            onClick={onBack}
            animate={{ color: activeTab === 'indoor' ? '#ffffff' : '#121212' }}
            transition={{ duration: 0.8 }}
            className="flex items-center gap-2 font-display font-bold text-lg hover:opacity-60 transition-opacity cursor-pointer border-none bg-transparent"
          >
            <ArrowRight className="w-5 h-5 rotate-180" />
            <span>返回首页</span>
          </motion.button>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center bg-black/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 shadow-xl">
            <button
              onClick={() => handleTabChange('indoor')}
              disabled={!data.indoor}
              className={`flex items-center gap-2 px-6 py-3 font-bold text-sm rounded-xl transition-all duration-300 ${
                activeTab === 'indoor'
                  ? 'bg-white text-brand-blue shadow-md scale-105'
                  : 'text-white hover:bg-white/20'
              } ${!data.indoor ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              <CloudRain className="w-4 h-4" />
              <span>室内版</span>
            </button>
            <button
              onClick={() => handleTabChange('outdoor')}
              disabled={!data.outdoor}
              className={`flex items-center gap-2 px-6 py-3 font-bold text-sm rounded-xl transition-all duration-300 ${
                activeTab === 'outdoor'
                  ? 'bg-white text-brand-yellow shadow-md scale-105'
                  : 'text-brand-dark hover:bg-black/10'
              } ${!data.outdoor ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              <Sun className="w-4 h-4" />
              <span>室外版</span>
            </button>
          </div>

          <div className="w-24 hidden md:block"></div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-12 pb-12 w-full max-w-7xl mx-auto space-y-8 min-h-0">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
            <motion.h2
              animate={{ color: activeTab === 'indoor' ? '#ffffff' : '#121212' }}
              transition={{ duration: 0.6 }}
              className="text-5xl md:text-7xl font-display font-extrabold tracking-tighter mb-4"
            >
              你的专属 <motion.span animate={{ color: activeTab === 'indoor' ? '#FFDE00' : '#007BFF' }} transition={{ duration: 0.6 }}>
                行程.
              </motion.span>
            </motion.h2>
          </motion.div>

          {data.weather_alert && (
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-white/90 backdrop-blur-md rounded-2xl p-4 flex items-start gap-3 shadow-sm border border-white/20 max-w-3xl"
            >
              <AlertTriangle className="w-5 h-5 text-brand-orange shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-gray-900 text-sm">天气提示</h4>
                <p className="text-gray-600 text-sm mt-1">{data.weather_alert}</p>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl"
              >
                <div className="flex items-center gap-2 mb-8">
                  <Clock className="w-6 h-6 text-brand-blue" />
                  <h3 className="text-2xl font-bold text-gray-900">时间轴</h3>
                </div>

                <div className="relative pl-8 border-l-2 border-gray-100 space-y-10">
                  {currentPlan.steps.map((step, index) => (
                    <div key={index} className="relative">
                      <div
                        className={`absolute -left-[41px] w-10 h-10 rounded-full border-4 border-gray-50 flex items-center justify-center shadow-sm ${
                          step.type === 'transport'
                            ? 'bg-gray-200 text-gray-500'
                            : activeTab === 'indoor'
                            ? 'text-brand-blue'
                            : 'text-brand-yellow'
                        }`}
                      >
                        {getStepIcon(step.type)}
                      </div>

                      <div
                        className={`rounded-3xl p-6 transition-all duration-300 border ${
                          step.type === 'transport'
                            ? 'bg-gray-100/50 border-gray-200/30 border-dashed'
                            : 'bg-gray-50 hover:bg-white hover:shadow-lg border-gray-100/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                          <span
                            className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded-full ${
                              step.type === 'transport'
                                ? 'bg-gray-400 text-white'
                                : activeTab === 'indoor'
                                ? 'bg-brand-blue text-white'
                                : 'bg-brand-yellow text-black'
                            }`}
                          >
                            {step.time_range}
                          </span>
                          <span className="text-xs font-bold text-gray-400 bg-gray-200/50 px-2 py-1 rounded-md">
                            {step.duration_minutes} MINS
                          </span>
                        </div>
                        <h4 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h4>
                        <p className="text-gray-500 text-sm leading-relaxed mb-4">{step.description}</p>

                        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200/60">
                          {step.location && (
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-white px-3 py-1.5 rounded-xl border border-gray-100 shadow-sm">
                              <MapPin className="w-4 h-4 text-brand-orange" />
                              <span>{step.location}</span>
                            </div>
                          )}
                          {step.risk_note && (
                            <div className="flex items-center gap-2 text-sm font-medium text-brand-orange bg-brand-orange/10 px-3 py-1.5 rounded-xl">
                              <AlertTriangle className="w-4 h-4" />
                              <span>{step.risk_note}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl"
              >
                <div className="flex items-center gap-2 mb-6">
                  <Lightbulb className="w-6 h-6 text-brand-yellow" />
                  <h3 className="text-2xl font-bold text-gray-900">贴心建议</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentPlan.suggestions.map((suggestion, idx) => (
                    <div key={idx} className="flex items-start gap-3 bg-gray-50 p-4 rounded-2xl">
                      <div
                        className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          activeTab === 'indoor' ? 'bg-brand-blue/20 text-brand-blue' : 'bg-brand-yellow/30 text-brand-orange'
                        }`}
                      >
                        <span className="text-xs font-black">{idx + 1}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-700 leading-snug">{suggestion}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            <div className="lg:col-span-5 h-[400px] lg:h-auto min-h-[400px]">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-white p-2 rounded-[2.5rem] shadow-2xl border border-white/20 h-full w-full sticky top-8 flex flex-col"
              >
                <div className="flex-1 w-full relative rounded-[2rem] overflow-hidden bg-gray-100">
                  <div id="plan-amap-container" ref={mapContainer} className="absolute inset-0 w-full h-full" />
                </div>
                <div className="p-6 pb-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <MapIcon className="w-5 h-5 text-gray-400" />
                    路线概览
                  </h3>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {currentPlan.steps
                      .filter((s: PlanStep) => s.type !== 'transport')
                      .map((step, idx) => (
                        <div key={idx} className="flex items-center shrink-0 group">
                          <div className="flex flex-col items-center gap-1">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-transform group-hover:scale-110 ${
                                activeTab === 'indoor'
                                  ? 'bg-brand-blue border-blue-200 text-white'
                                  : 'bg-brand-yellow border-yellow-200 text-black'
                              }`}
                            >
                              {idx + 1}
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 max-w-[60px] truncate">
                              {step.title}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </main>
      </div>
    </motion.div>
  );
}