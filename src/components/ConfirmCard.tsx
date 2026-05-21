import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Users, Wallet, Calendar, ArrowRight, Pencil, Check, Loader2, CloudRain } from 'lucide-react';
import { Button } from 'antd';
import dayjs from 'dayjs';
import { parseQuery, getWeather } from '../services/api';
import type { WeatherResult } from '../services/weather';

interface ConfirmCardProps {
  query: string;
  onConfirm: (params: PlanParams) => void;
  onCancel: () => void;
}

interface PlanParams {
  query: string;
  city: string;
  date: string;
  time: string;
  people: number;
  budget: string;
  scenario: string;
  weather?: {
    text: string;
    temp: number;
    icon: string;
    tempMax: number;
    tempMin: number;
    precip: number;
  };
}

const scenarioOptions = [
  { value: 'family', label: '👨‍👩‍👧 家庭' },
  { value: 'friends', label: '👫 朋友' },
  { value: 'couple', label: '💑 情侣' },
  { value: 'solo', label: '👤 独自' },
];

const timeSlots = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
];

// 星期标签
const weekDayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function ConfirmCard({ query, onConfirm, onCancel }: ConfirmCardProps) {
  const today = dayjs();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [people, setPeople] = useState<number | null>(null);
  const [budget, setBudget] = useState<string>('');
  const [scenario, setScenario] = useState('');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [hasParsed, setHasParsed] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherResult | null>(null);

  // 用 LLM 解析 query 中的场景和人数
  useEffect(() => {
    if (!query) return;

    setIsParsing(true);
    setHasParsed(false);
    // 重置为空
    setDate('');
    setTime('');
    setPeople(null);
    setBudget('');
    setScenario('');

    parseQuery(query, '上海')
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data;
          // 等所有字段都解析完再一起更新
          setScenario(data.scenario || data.scenario_type || 'family');
          setPeople(data.party_size || data.people ? parseInt(data.party_size || data.people) : 3);
          // 预算：没有的话显示"不限"
          const budgetVal = data.budget_per_person || data.budget;
          setBudget(budgetVal && budgetVal !== '不限' && budgetVal !== 'null' ? `¥${budgetVal}` : '不限');
          setDate(data.date || today.add(1, 'day').format('YYYY-MM-DD'));
          setTime(data.departure_time || '14:00');
          setHasParsed(true);
        }
      })
      .catch(console.error)
      .finally(() => setIsParsing(false));
  }, [query]);

  // 加载真实天气数据
  useEffect(() => {
    getWeather()
      .then(setWeatherData)
      .catch(console.error);
  }, []);

  // 获取目标日期的真实天气
  const getWeatherForDate = useCallback(() => {
    if (!weatherData?.forecasts || !date) return null;
    const targetDate = dayjs(date).format('YYYY-MM-DD');
    return weatherData.forecasts.find(f => f.date === targetDate) || null;
  }, [weatherData, date]);

  const targetWeather = getWeatherForDate();

  // 获取天气图标
  const getWeatherIcon = (text: string): string => {
    if (text.includes('雨')) return '🌧️';
    if (text.includes('雷')) return '⛈️';
    if (text.includes('雪')) return '❄️';
    if (text.includes('阴')) return '☁️';
    if (text.includes('多云')) return '⛅';
    return '☀️';
  };

  // 判断天气适合室内还是室外
  const getWeatherAdvice = () => {
    if (!targetWeather) return '等待获取天气数据...';
    if (targetWeather.textDay.includes('雨')) return '今日有雨，建议室内方案';
    if (targetWeather.tempMax > 33 || targetWeather.tempMin < 8) return '气温极端，建议室内活动';
    if (targetWeather.precip > 50) return '降水概率较高，注意备伞';
    return '天气良好，适合户外活动';
  };

  const handleConfirm = () => {
    onConfirm({
      query,
      city: '上海',
      date,
      time,
      people,
      budget,
      scenario,
      weather: targetWeather ? {
        text: targetWeather.textDay,
        temp: Math.round((targetWeather.tempMax + targetWeather.tempMin) / 2),
        icon: getWeatherIcon(targetWeather.textDay),
        tempMax: targetWeather.tempMax,
        tempMin: targetWeather.tempMin,
        precip: targetWeather.precip
      } : undefined
    });
  };

  // 生成未来7天的日期选项
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = today.add(i, 'day');
    return {
      value: d.format('YYYY-MM-DD'),
      label: i === 0 ? '今天' : i === 1 ? '明天' : `周${d.format('dd')}`,
      full: d.format('MM/DD')
    };
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onCancel}
      >
        <motion.div
          initial={{ y: -500, opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
          animate={{ y: 0, opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
          exit={{ y: -500, opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 小票头部 */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-brand-yellow px-6 py-4"
          >
            <div className="text-center">
              <div className="text-xs font-bold tracking-widest text-black/60 uppercase">Travel Plan</div>
              <div className="font-display font-bold text-2xl text-black italic">行程确认单</div>
            </div>
          </motion.div>

          {/* 小票内容 */}
          <div className="p-6 space-y-4">
            {/* 原始需求 */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gray-50 rounded-2xl p-4"
            >
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">你的需求</div>
              <div className="text-gray-700 font-medium">{query}</div>
            </motion.div>

            {/* 分隔线 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="flex items-center gap-2"
            >
              <div className="flex-1 h-px bg-gray-200"></div>
              <div className="text-xs text-gray-400 font-bold">✂ ✂ ✂</div>
              <div className="flex-1 h-px bg-gray-200"></div>
            </motion.div>

            {/* 可编辑字段 */}
            <div className="space-y-3">
              {/* 日期 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出行日期</div>
                    <div className="font-semibold text-gray-700">
                      {date ? (
                        <>
                          {dayjs(date).format('MM月DD日')} {dateOptions.find(d => d.value === date)?.label}
                        </>
                      ) : (
                        <span className="text-gray-300">等待解析...</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'date' ? null : 'date')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </motion.div>
              {isEditing === 'date' && (
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl">
                  {dateOptions.map(d => (
                    <button
                      key={d.value}
                      onClick={() => { setDate(d.value); setIsEditing(null); }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                        date === d.value ? 'bg-indigo-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <div className="text-center">
                        <div>{d.label}</div>
                        <div className="text-xs opacity-70">{d.full}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* 时间 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-yellow/20 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-brand-yellow" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出发时间</div>
                    <div className="font-semibold text-gray-700">{time || <span className="text-gray-300">等待解析...</span>}</div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'time' ? null : 'time')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </motion.div>
              {isEditing === 'time' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl"
                >
                  {timeSlots.map(t => (
                    <button
                      key={t}
                      onClick={() => { setTime(t); setIsEditing(null); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        time === t ? 'bg-brand-yellow text-black' : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* 人数 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-blue/20 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出行人数</div>
                    <div className="font-semibold text-gray-700">
                      {people !== null ? `${people}人` : <span className="text-gray-300">等待解析...</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'people' ? null : 'people')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </motion.div>
              {isEditing === 'people' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex gap-2 p-3 bg-gray-50 rounded-xl"
                >
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => { setPeople(n); setIsEditing(null); }}
                      className={`w-10 h-10 rounded-xl text-sm font-bold transition-colors ${
                        people === n ? 'bg-brand-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* 预算 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">人均预算</div>
                    <div className="font-semibold text-gray-700">
                      {budget || <span className="text-gray-300">等待解析...</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'budget' ? null : 'budget')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </motion.div>
              {isEditing === 'budget' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl"
                >
                  {['不限', '100', '150', '200', '300', '500'].map(b => (
                    <button
                      key={b}
                      onClick={() => { setBudget(b === '不限' ? '不限' : `¥${b}`); setIsEditing(null); }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                        budget === b || budget === `¥${b}` ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {b === '不限' ? '不限' : `¥${b}`}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* 场景 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出行场景</div>
                    <div className="font-semibold text-gray-700 flex items-center gap-2">
                      {scenario ? scenarioOptions.find(s => s.value === scenario)?.label : <span className="text-gray-300">等待解析...</span>}
                      {isParsing && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'scenario' ? null : 'scenario')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </motion.div>
              {isEditing === 'scenario' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl"
                >
                  {scenarioOptions.map(s => (
                    <button
                      key={s.value}
                      onClick={() => { setScenario(s.value); setIsEditing(null); }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                        scenario === s.value ? 'bg-purple-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* 天气预报 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="flex items-center gap-3 p-3 bg-brand-yellow/10 rounded-xl"
              >
                <div className="text-2xl">
                  {targetWeather ? getWeatherIcon(targetWeather.textDay) : targetWeather ? getWeatherIcon(targetWeather.textDay) : '🌤️'}
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-bold uppercase">
                    {date ? dayjs(date).format('MM月DD日') : '待定'} 天气
                  </div>
                  {targetWeather ? (
                    <div className="font-semibold text-gray-700">
                      {targetWeather.textDay} {targetWeather.tempMin}~{targetWeather.tempMax}°C
                    </div>
                  ) : (
                    <div className="font-semibold text-gray-700 text-xs">加载中...</div>
                  )}
                </div>
                <div className="ml-auto text-xs text-gray-500 text-right leading-tight">
                  <div>{getWeatherAdvice()}</div>
                  {targetWeather && targetWeather.precip > 0 && (
                    <div className="text-blue-500 flex items-center gap-1 mt-1">
                      <CloudRain className="w-3 h-3" />
                      降水{targetWeather.precip}%
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* 分隔线 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-2"
            >
              <div className="flex-1 h-px bg-gray-200"></div>
              <div className="text-xs text-gray-400 font-bold">✂ ✂ ✂</div>
              <div className="flex-1 h-px bg-gray-200"></div>
            </motion.div>

            {/* 底部按钮 */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              className="flex gap-3"
            >
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
              >
                返回修改
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 rounded-xl bg-brand-yellow text-black font-bold hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <span>确认出发</span>
                <Check className="w-5 h-5" />
              </button>
            </motion.div>

            {/* 小票底部装饰 */}
            <div className="h-2 bg-gradient-to-r from-brand-yellow via-brand-blue to-brand-green"></div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}