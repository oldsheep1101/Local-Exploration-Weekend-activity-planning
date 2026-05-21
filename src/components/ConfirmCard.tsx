import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Users, Wallet, Sun, Cloud, Calendar, ArrowRight, Pencil, Check, Loader2 } from 'lucide-react';
import { Button } from 'antd';
import dayjs from 'dayjs';
import { parseQuery } from '../services/api';

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

// 模拟7天天气预报
const weatherForecast: Record<string, { text: string; temp: number; icon: string }> = {
  '0': { text: '晴', temp: 26, icon: '☀️' },
  '1': { text: '多云', temp: 24, icon: '⛅' },
  '2': { text: '阴', temp: 22, icon: '☁️' },
  '3': { text: '小雨', temp: 18, icon: '🌧️' },
  '4': { text: '晴', temp: 28, icon: '☀️' },
  '5': { text: '雷阵雨', temp: 25, icon: '⛈️' },
  '6': { text: '晴', temp: 30, icon: '☀️' },
};

export default function ConfirmCard({ query, onConfirm, onCancel }: ConfirmCardProps) {
  const today = dayjs();
  const [date, setDate] = useState(today.add(1, 'day').format('YYYY-MM-DD'));
  const [time, setTime] = useState('14:00');
  const [people, setPeople] = useState(3);
  const [budget, setBudget] = useState<string>('不限');
  const [scenario, setScenario] = useState('family');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // 用 LLM 解析 query 中的场景和人数
  useEffect(() => {
    if (!query) return;

    setIsParsing(true);
    parseQuery(query, '上海')
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data;
          // 处理场景类型（新字段: scenario, 旧字段: scenario_type）
          const scenarioVal = data.scenario || data.scenario_type;
          if (scenarioVal) setScenario(scenarioVal);
          // 处理人数（新字段: party_size, 旧字段: people）
          const peopleVal = data.party_size || data.people;
          if (peopleVal) {
            const num = parseInt(peopleVal);
            if (num > 0 && num <= 10) setPeople(num);
          }
          // 处理预算（新字段: budget_per_person, 旧字段: budget）
          const budgetVal = data.budget_per_person || data.budget;
          if (budgetVal && budgetVal !== '不限') setBudget(`¥${budgetVal}`);
          // 处理日期
          if (data.date) setDate(data.date);
          // 处理出发时间
          if (data.departure_time) setTime(data.departure_time);
        }
      })
      .catch(console.error)
      .finally(() => setIsParsing(false));
  }, [query]);

  // 获取目标日期的天气
  const getWeatherForDate = () => {
    const daysDiff = dayjs(date).diff(today, 'day');
    return weatherForecast[daysDiff.toString()] || weatherForecast['0'];
  };

  const weather = getWeatherForDate();

  // 判断天气适合室内还是室外
  const getWeatherAdvice = () => {
    if (weather.text.includes('雨')) return '建议选择室内方案';
    if (weather.temp > 30 || weather.temp < 10) return '气温极端，建议室内活动';
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
      weather
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
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 小票头部 */}
          <div className="bg-brand-yellow px-6 py-4">
            <div className="text-center">
              <div className="text-xs font-bold tracking-widest text-black/60 uppercase">Travel Plan</div>
              <div className="font-display font-bold text-2xl text-black italic">行程确认单</div>
            </div>
          </div>

          {/* 小票内容 */}
          <div className="p-6 space-y-4">
            {/* 原始需求 */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">你的需求</div>
              <div className="text-gray-700 font-medium">{query}</div>
            </div>

            {/* 分隔线 */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200"></div>
              <div className="text-xs text-gray-400 font-bold">✂ ✂ ✂</div>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            {/* 可编辑字段 */}
            <div className="space-y-3">
              {/* 日期 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出行日期</div>
                    <div className="font-semibold text-gray-700">
                      {dayjs(date).format('MM月DD日')} {dateOptions.find(d => d.value === date)?.label}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'date' ? null : 'date')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </div>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-yellow/20 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-brand-yellow" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出发时间</div>
                    <div className="font-semibold text-gray-700">{time}</div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'time' ? null : 'time')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {isEditing === 'time' && (
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl">
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
                </div>
              )}

              {/* 人数 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-blue/20 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出行人数</div>
                    <div className="font-semibold text-gray-700">{people}人</div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'people' ? null : 'people')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {isEditing === 'people' && (
                <div className="flex gap-2 p-3 bg-gray-50 rounded-xl">
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
                </div>
              )}

              {/* 预算 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">人均预算</div>
                    <div className="font-semibold text-gray-700">{budget}</div>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(isEditing === 'budget' ? null : 'budget')}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Pencil className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              {isEditing === 'budget' && (
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl">
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
                </div>
              )}

              {/* 场景 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-bold uppercase">出行场景</div>
                    <div className="font-semibold text-gray-700 flex items-center gap-2">
                      {scenarioOptions.find(s => s.value === scenario)?.label}
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
              </div>
              {isEditing === 'scenario' && (
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl">
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
                </div>
              )}

              {/* 天气预报 */}
              <div className="flex items-center gap-3 p-3 bg-brand-yellow/10 rounded-xl">
                <div className="text-2xl">{weather.icon}</div>
                <div>
                  <div className="text-xs text-gray-400 font-bold uppercase">
                    {dayjs(date).format('MM月DD日')} 天气
                  </div>
                  <div className="font-semibold text-gray-700">{weather.text} {weather.temp}°C</div>
                </div>
                <div className="ml-auto text-xs text-gray-500">{getWeatherAdvice()}</div>
              </div>
            </div>

            {/* 分隔线 */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200"></div>
              <div className="text-xs text-gray-400 font-bold">✂ ✂ ✂</div>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            {/* 底部按钮 */}
            <div className="flex gap-3">
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
            </div>
          </div>

          {/* 小票底部装饰 */}
          <div className="h-2 bg-gradient-to-r from-brand-yellow via-brand-blue to-brand-green"></div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}