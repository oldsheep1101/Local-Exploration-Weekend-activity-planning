import { useState, FormEvent, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Spin, Card, Timeline, Tag, Descriptions, Button } from 'antd';
import { EnvironmentOutlined, ClockCircleOutlined } from '@ant-design/icons';
import AMapLoader from '@amap/amap-jsapi-loader';
import type { WeekendPlan } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Users, Calendar, ArrowRight, MessageSquare, Plus } from 'lucide-react';
import exhibitionCardImg from "./image22.png";
import { generatePlan } from './services/api';
import ResultView from './views/ResultView';
import ConfirmCard from './components/ConfirmCard';

// --- Components ---

const Navbar = () => (
  <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 h-16 flex items-center justify-between px-6 md:px-12">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-brand-yellow rounded-full flex items-center justify-center">
        <span className="font-display font-bold text-black italic">M</span>
      </div>
      <span className="font-display font-bold text-xl tracking-tight">周末闲时规划</span>
    </div>
    <div className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-wider text-gray-500">
      <a href="#" className="hover:text-brand-blue transition-colors">推荐</a>
      <a href="#" className="hover:text-brand-blue transition-colors">规划</a>
      <a href="#" className="hover:text-brand-blue transition-colors">我的</a>
      <a href="#" className="hover:text-brand-blue transition-colors">赛事详情</a>
    </div>
    <div className="flex items-center gap-4">
      <Search className="w-5 h-5 text-gray-400 cursor-pointer" />
      <Users className="w-5 h-5 text-gray-400 cursor-pointer" />
    </div>
  </nav>
);

interface ActivityCardProps {
  title: string;
  subtitle: string;
  tags: string[];
  prompt: string;
  image: string;
  color: string;
  delay: number;
  skew: string;
  onSelect: (prompt: string, title: string) => void;
}

const ActivityCard = ({ title, subtitle, tags, prompt, image, color, delay, skew, onSelect }: ActivityCardProps) => {
  const isExpandable = title === "热门院线 & 演出" || title === "同城看展指南" || title === '1小时"微度假"' || title === "人气餐厅速递";
  const layoutKey = title === "热门院线 & 演出" ? "movies" : title === "同城看展指南" ? "exhibitions" : title === '1小时"微度假"' ? "vacation" : "restaurants";

  return (
    <motion.div
      layoutId={isExpandable ? `card-${layoutKey}` : undefined}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      onClick={() => onSelect(prompt, title)}
      className={`relative group cursor-pointer ${skew} h-full`}
    >
      <motion.div
        layoutId={isExpandable ? `bg-shared-${layoutKey}` : undefined}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`absolute inset-0 ${color} rounded-2xl transform transition-transform group-hover:scale-105 group-hover:rotate-1`}
      ></motion.div>
      <div className="relative overflow-hidden rounded-2xl aspect-[3/4] shadow-2xl flex flex-col">
        <img
          src={image}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70 group-hover:opacity-90"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-6">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((tag, i) => (
              <span key={i} className="text-[9px] font-bold px-2 py-0.5 bg-brand-yellow text-black rounded-sm uppercase tracking-wider">
                {tag}
              </span>
            ))}
          </div>

          <h3 className="text-white font-display text-2xl font-bold leading-tight drop-shadow-md">
            {title}
          </h3>
          <p className="text-white/70 text-xs mt-1 font-medium">
            {subtitle}
          </p>

          <div className="mt-4 flex items-center gap-2 text-brand-yellow text-xs font-bold uppercase tracking-widest transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
            <span>点击自动生成方案</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const MicroVacationView = ({ onBack }: { onBack: () => void, key?: string }) => {
  const locations = [
    { id: 1, title: "滨江步道 · 晚风段", type: "户外漫步", description: "拥有城市最美夕阳的步行道，适合全家散步。", image: "https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&q=80&w=600", tags: ["江景", "遛娃", "滑板"] },
    { id: 2, title: "后山公园 · 森林氧吧", type: "自然野趣", description: "市区内的隐秘森林，逃离喧嚣的最佳场所。", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=600", tags: ["爬山", "吸氧", "赏花"] },
    { id: 3, title: "静谧湿地公园", type: "生态观察", description: "观察候鸟和湿地植物，感受人与自然和谐。", image: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&q=80&w=600", tags: ["摄影", "观鸟", "草坪"] }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
    >
      <motion.div
        layoutId="bg-shared-vacation"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute inset-0 bg-brand-green"
      />

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <header className="p-6 md:p-12 flex justify-between items-center text-white shrink-0">
          <button onClick={onBack} className="flex items-center gap-2 font-display font-bold text-lg hover:text-brand-orange transition-colors cursor-pointer border-none bg-transparent outline-none">
            <ArrowRight className="w-5 h-5 rotate-180" />
            <span>返回规划</span>
          </button>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-80">Weekend Escapes</span>
            <span className="font-bold border-b-2 border-brand-orange">1 HOUR MICRO VACATION</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-12 pb-12 min-h-0">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-white text-5xl md:text-7xl font-display font-extrabold tracking-tighter mb-12">
              一小时 <span className="text-brand-yellow">微度假.</span>
            </h2>
          </motion.div>

          <div className="flex flex-col gap-8 max-w-4xl">
            {locations.map((loc, index) => (
              <motion.div
                key={loc.id}
                initial={{ x: -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="group relative bg-white/10 backdrop-blur-md rounded-3xl overflow-hidden flex flex-col md:flex-row hover:bg-white/20 transition-all cursor-pointer border border-white/10"
              >
                <div className="w-full md:w-64 h-48 md:h-auto overflow-hidden">
                  <img src={loc.image} alt={loc.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                </div>
                <div className="flex-1 p-8">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-brand-orange text-white text-[9px] font-black uppercase rounded-sm">{loc.type}</span>
                  </div>
                  <h3 className="text-white text-2xl font-bold mb-3">{loc.title}</h3>
                  <p className="text-white/60 text-sm mb-6 leading-relaxed">{loc.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {loc.tags.map(tag => (
                      <span key={tag} className="text-[10px] text-white/40 border border-white/20 px-2 py-1 rounded-md font-medium">#{tag}</span>
                    ))}
                  </div>
                  <button className="absolute right-8 bottom-8 w-12 h-12 bg-brand-orange rounded-full flex items-center justify-center transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <ArrowRight className="w-6 h-6 text-white" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </main>
      </div>
    </motion.div>
  );
};

const ExhibitionView = ({ onBack }: { onBack: () => void, key?: string }) => {
  const exhibitions = [
    { id: 1, title: "文明的余辉", location: "市博物馆", type: "馆藏精品", image: "https://images.unsplash.com/photo-1549490349-8643362247b5?q=80&w=600", price: "免费" },
    { id: 2, title: "印象派：光与影", location: "当代艺术馆", type: "当代艺术", image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=600", price: "¥80起" },
    { id: 3, title: "数字之森 · 艺术特展", location: "天工艺术中心", type: "沉浸式数字艺术", image: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=600", price: "¥120" }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
    >
      <motion.div
        layoutId="bg-shared-exhibitions"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute inset-0 bg-brand-yellow"
      />

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <header className="p-6 md:p-12 flex justify-between items-center text-black shrink-0">
          <button onClick={onBack} className="flex items-center gap-2 font-display font-bold text-lg hover:text-brand-blue transition-colors cursor-pointer border-none bg-transparent outline-none">
            <ArrowRight className="w-5 h-5 rotate-180" />
            <span>返回规划</span>
          </button>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-60 text-black">Current City</span>
            <span className="font-bold text-black border-b-2 border-black">SHANGHAI · 上海</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-12 pb-12 min-h-0">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-black text-5xl md:text-7xl font-display font-extrabold tracking-tighter mb-12">
              同城看展 <span className="text-brand-blue">EXHIBITS.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
            {exhibitions.map((ex, index) => (
              <motion.div
                key={ex.id}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="bg-white rounded-3xl p-4 shadow-xl hover:scale-[1.02] transition-transform cursor-pointer group"
              >
                <div className="relative aspect-[3/2] rounded-2xl overflow-hidden mb-6">
                  <img src={ex.image} alt={ex.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur text-white font-black px-3 py-1 rounded-sm text-[10px] uppercase tracking-widest">
                    {ex.type}
                  </div>
                </div>
                <div className="px-2">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-black text-2xl font-bold leading-tight flex-1 pr-4">{ex.title}</h3>
                    <div className="text-brand-blue font-black text-lg">{ex.price}</div>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                    <MapPin className="w-4 h-4" />
                    <span>{ex.location}</span>
                  </div>
                  <button className="mt-8 w-full border-2 border-black text-black font-black py-4 rounded-2xl group-hover:bg-black group-hover:text-white transition-all flex items-center justify-center gap-2">
                    <span>生成看展行程</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </main>
      </div>
    </motion.div>
  );
};

const RestaurantView = ({ onBack }: { onBack: () => void, key?: string }) => {
  const restaurants = [
    {
      id: 1,
      title: "首尔798韩国料理 (望京店)",
      rating: "4.7",
      perCapita: "76",
      distance: "1.2km",
      deals: "双人餐109起，3-4人餐258起，6人全家福699",
      tags: ["望京韩餐第四", "回头客超级多"],
      images: [
        "https://images.unsplash.com/photo-1590604166248-26179373977a?q=80&w=600",
        "https://images.unsplash.com/photo-1623293836109-7756f7e8a939?q=80&w=400",
        "https://images.unsplash.com/photo-1541544741938-0af808871cc0?q=80&w=400"
      ]
    },
    {
      id: 2,
      title: "静雅和食 · 私房料理",
      rating: "4.9",
      perCapita: "158",
      distance: "0.8km",
      deals: "单人午市定食88起，晚市怀石料理399起",
      tags: ["约会首选", "正宗和风"],
      images: [
        "https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?q=80&w=600",
        "https://images.unsplash.com/photo-1579584425555-c3ce17fd4151?q=80&w=400",
        "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=400"
      ]
    },
    {
      id: 3,
      title: "火地岛 · 智利烧烤屋",
      rating: "4.6",
      perCapita: "120",
      distance: "2.4km",
      deals: "周三女士之夜5折，家庭套餐299",
      tags: ["肉食爱好者", "异域风情"],
      images: [
        "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=600",
        "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=400",
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=400"
      ]
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
    >
      <motion.div
        layoutId="bg-shared-restaurants"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute inset-0 bg-brand-orange"
      />

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <header className="p-6 md:p-12 flex justify-between items-center text-white shrink-0">
          <button onClick={onBack} className="flex items-center gap-2 font-display font-bold text-lg hover:text-brand-green transition-colors cursor-pointer border-none bg-transparent outline-none">
            <ArrowRight className="w-5 h-5 rotate-180" />
            <span>返回规划</span>
          </button>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-60 text-white">Dining Guide</span>
            <span className="font-bold text-white border-b-2 border-white">POPULAR RESTAURANTS</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-12 pb-12 min-h-0">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-white text-5xl md:text-7xl font-display font-extrabold tracking-tighter mb-12">
              特色美食 <span className="text-brand-yellow">EATERY.</span>
            </h2>
          </motion.div>

          <div className="flex flex-col gap-12 max-w-4xl">
            {restaurants.map((res, index) => (
              <motion.div
                key={res.id}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="bg-white rounded-[2.5rem] p-8 shadow-2xl hover:scale-[1.01] transition-transform cursor-pointer group overflow-hidden"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-black text-3xl font-bold mb-2">{res.title}</h3>
                    <div className="flex items-center gap-4 text-sm font-medium">
                      <span className="text-brand-yellow font-bold">{res.rating}分</span>
                      <span className="text-white/50">|</span>
                      <span className="text-white/70">人均 ¥ {res.perCapita}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center mb-2">
                       <Plus className="w-4 h-4 text-gray-300" />
                    </div>
                    <span className="text-gray-400 text-xs">{res.distance}</span>
                  </div>
                </div>

                <div className="flex flex-start gap-2 mb-4">
                  <span className="bg-white text-brand-orange text-[10px] font-black px-1.5 py-0.5 rounded-sm shrink-0 mt-0.5">套餐</span>
                  <p className="text-white/80 text-sm font-medium">{res.deals}</p>
                </div>

                <div className="flex flex-wrap gap-2 mb-8">
                  {res.tags.map(tag => (
                    <span key={tag} className="bg-white/10 border border-white/20 text-white text-[11px] px-3 py-1.5 rounded-xl font-bold">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-12 gap-3 h-56 md:h-72">
                  <div className="col-span-8 rounded-2xl md:rounded-3xl overflow-hidden relative">
                    <img src={res.images[0]} alt="food" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  </div>
                  <div className="col-span-4 flex flex-col gap-3">
                    <div className="flex-1 rounded-xl md:rounded-2xl overflow-hidden relative">
                      <img src={res.images[1]} alt="food" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    </div>
                    <div className="flex-1 rounded-xl md:rounded-2xl overflow-hidden relative">
                      <img src={res.images[2]} alt="food" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </main>
      </div>
    </motion.div>
  );
};

const MovieBookingView = ({ onBack }: { onBack: () => void, key?: string }) => {
  const movies = [
    { id: 1, title: "沙丘 2", rating: "9.2", genre: "科幻 / 动作", image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=600", times: ["14:00", "16:20", "19:10", "21:30"] },
    { id: 2, title: "周处除三害", rating: "8.1", genre: "动作 / 犯罪", image: "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=600", times: ["13:45", "15:50", "18:00", "20:30"] },
    { id: 3, title: "你想活出怎样的人生", rating: "8.5", genre: "动画 / 奇幻", image: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=600", times: ["14:30", "17:00", "19:40"] }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col"
    >
      <motion.div
        layoutId="bg-shared-movies"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute inset-0 bg-brand-blue"
      />

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <header className="p-6 md:p-12 flex justify-between items-center text-white shrink-0">
          <button onClick={onBack} className="flex items-center gap-2 font-display font-bold text-lg hover:text-brand-yellow transition-colors cursor-pointer border-none bg-transparent outline-none">
            <ArrowRight className="w-5 h-5 rotate-180" />
            <span>返回规划</span>
          </button>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-60 text-white">Location</span>
            <span className="font-bold text-white">上海 · 万达影城 (五角场店)</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-12 pb-12 min-h-0">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-white text-5xl md:text-7xl font-display font-extrabold tracking-tighter mb-12">
              最近热映 <span className="text-brand-yellow">MOVIES.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {movies.map((movie, index) => (
              <motion.div
                key={movie.id}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="group"
              >
                <div className="relative aspect-[16/9] rounded-3xl overflow-hidden shadow-2xl mb-6">
                  <img src={movie.image} alt={movie.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute top-4 right-4 bg-brand-yellow text-black font-black px-3 py-1 rounded-full text-sm">
                    {movie.rating}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-end">
                    <h3 className="text-white text-3xl font-bold">{movie.title}</h3>
                    <span className="text-white/40 text-xs font-medium">{movie.genre}</span>
                  </div>
                  <div className="mt-6">
                    <span className="text-[10px] text-white/50 font-black uppercase tracking-widest mb-3 block">场次选择</span>
                    <div className="flex flex-wrap gap-3">
                      {movie.times.map(time => (
                        <button key={time} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white hover:text-black text-white text-sm font-bold transition-all border border-white/10 cursor-pointer">
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="mt-8 bg-brand-yellow text-black font-black py-4 rounded-2xl hover:scale-105 transition-transform flex items-center justify-center gap-2 cursor-pointer w-full border-none">
                    <span>立即选座购票</span>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </main>
      </div>
    </motion.div>
  );
};

const BackgroundElements = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
    <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[80%] bg-brand-yellow/30 -rotate-12 translate-x-1/4"></div>
    <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[70%] bg-brand-blue/20 rotate-6 -translate-x-1/4"></div>
    <div className="absolute top-[20%] left-[5%] w-32 h-32 border-8 border-brand-yellow opacity-20 rounded-full"></div>
    <div className="absolute top-[60%] right-[10%] w-48 h-48 border-4 border-brand-blue opacity-10 rounded-full"></div>
  </div>
);

export default function App() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingQuery, setPendingQuery] = useState('');
  const [currentView, setCurrentView] = useState<'home' | 'movies' | 'exhibitions' | 'vacation' | 'restaurants' | 'result'>('home');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setPendingQuery(query);
    setShowConfirm(true);
  };

  const handleConfirm = async (params: any) => {
    setShowConfirm(false);
    setIsPlanning(true);
    try {
      const fullQuery = `${params.query}。日期：${params.date}，时间：${params.time}，人数：${params.people}人，场景：${params.scenario}，预算：${params.budget}，天气：${params.weather?.text}${params.weather?.temp}度`;
      const response = await generatePlan({ query: fullQuery, city: params.city || '上海' });
      if (response.success && response.data) {
        sessionStorage.setItem('weekendPlan', JSON.stringify(response.data));
        setCurrentView('result');
      }
    } catch (error: any) {
      message.error(error.message || '规划失败');
      setIsPlanning(false);
    }
  };

  const handleConfirmCancel = () => {
    setShowConfirm(false);
    setPendingQuery('');
  };

  const handleCardSelect = (prompt: string, title: string) => {
    if (title === "热门院线 & 演出") {
      setCurrentView('movies');
    } else if (title === "同城看展指南") {
      setCurrentView('exhibitions');
    } else if (title === '1小时"微度假"') {
      setCurrentView('vacation');
    } else if (title === "人气餐厅速递") {
      setCurrentView('restaurants');
    } else {
      setQuery(prompt);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-16 selection:bg-brand-yellow/30 selection:text-brand-dark">
      <Navbar />
      <BackgroundElements />

      <AnimatePresence mode="wait">
        {currentView === 'home' ? (
          <motion.main
            key="home"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 container mx-auto px-6 md:px-12 py-20 relative z-10 flex flex-col"
          >

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
            <div className="shrink-0">
              <motion.h1
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="text-6xl md:text-8xl font-display font-extrabold leading-[0.85] tracking-tighter"
              >
                周末 <br />
                <span className="text-brand-blue">新去处.</span>
              </motion.h1>
            </div>

            <motion.div
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.3 }}
               className="relative z-20 flex-1 max-w-3xl w-full"
            >
              <form
                onSubmit={handleSubmit}
                className="bg-white text-black rounded-3xl p-2 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] flex flex-col md:flex-row items-center gap-2 border border-black/5"
              >
                <div className="flex-1 w-full bg-gray-50 rounded-2xl flex items-center px-5 py-4 focus-within:bg-brand-yellow/10 transition-colors">
                  <MessageSquare className="w-5 h-5 text-brand-blue mr-4 shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="今天下午是空的，想跟家人出去玩..."
                    className="bg-transparent border-none outline-none w-full text-base placeholder:text-gray-400 font-medium text-black"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full md:w-auto bg-brand-yellow hover:bg-black hover:text-white text-black font-extrabold h-14 md:h-16 px-8 rounded-2xl transition-all flex items-center justify-center gap-3 shrink-0 active:scale-95 disabled:opacity-50 shadow-sm"
                  disabled={isPlanning}
                >
                  {isPlanning ? (
                    <div className="flex items-center gap-2">
                      <Spin size="small" />
                      <span>规划中</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-lg">AI 规划方案</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">试试这几句:</span>
                {["带5岁孩子出门，老婆在减肥", "4个朋友聚会，2男2女", "市区Citywalk路线"].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setQuery(sample)}
                    className="text-[10px] font-bold bg-white border border-gray-100 px-3 py-1.5 rounded-full hover:bg-brand-yellow hover:border-brand-yellow transition-all cursor-pointer shadow-sm"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 max-w-6xl w-full mx-auto">
            <ActivityCard
              title="热门院线 & 演出"
              subtitle="沉浸式度过2小时"
              tags={["最新大片", "脱口秀", "开心麻花"]}
              prompt="我想去看最近评分最高的电影，或者是脱口秀/开心麻花演出，帮我查查今天下午的排片和位置。"
              image="https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=600"
              color="bg-brand-blue"
              delay={0.1}
              skew="-rotate-1 translate-y-2"
              onSelect={handleCardSelect}
            />
            <ActivityCard
              title="同城看展指南"
              subtitle="安静的高质量时光"
              tags={["艺术展", "博物馆", "沉浸式"]}
              prompt="帮我安排一个安静的午后看展行程，最好是博物馆活艺术展，包含附近的咖啡厅推荐。"
              image={exhibitionCardImg}
              color="bg-brand-yellow"
              delay={0.2}
              skew="rotate-2 -translate-y-2"
              onSelect={handleCardSelect}
            />
            <ActivityCard
              title='1小时"微度假"'
              subtitle="去班味！去吸氧！"
              tags={["周边游", "滨江步道", "公园"]}
              prompt="离家不远的地方，带孩子去转转。想去滨江步道或公园吸氧，帮我们安排个几小时的微度假线路。"
              image="https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&q=80&w=600"
              color="bg-brand-green"
              delay={0.3}
              skew="-rotate-2"
              onSelect={handleCardSelect}
            />
            <ActivityCard
              title="人气餐厅速递"
              subtitle="不用等位的神仙馆子"
              tags={["减脂餐", "亲子", "朋友微醺"]}
              prompt="下午玩累了，推荐几个附近的人气餐厅。希望能直接预订，要有适合孩子的（或者减脂需求的）。"
              image="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=600"
              color="bg-brand-orange"
              delay={0.4}
              skew="rotate-1 translate-y-2"
              onSelect={handleCardSelect}
            />
          </div>
        </motion.main>
        ) : currentView === 'movies' ? (
          <MovieBookingView key="movies" onBack={() => { setCurrentView('home'); }} />
        ) : currentView === 'exhibitions' ? (
          <ExhibitionView key="exhibitions" onBack={() => { setCurrentView('home'); }} />
        ) : currentView === 'vacation' ? (
          <MicroVacationView key="vacation" onBack={() => { setCurrentView('home'); }} />
        ) : currentView === 'restaurants' ? (
          <RestaurantView key="restaurants" onBack={() => { setCurrentView('home'); }} />
        ) : currentView === 'result' ? (
          <ResultView key="result" onBack={() => { setCurrentView('home'); setIsPlanning(false); }} />
        ) : null}
      </AnimatePresence>

      <footer className="py-12 border-t border-gray-100 relative z-10 bg-white mt-auto">
        <div className="container mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col gap-2">
            <span className="font-display font-bold text-lg italic uppercase tracking-tighter">Weekend New Way.</span>
            <p className="text-[10px] text-gray-400">© 2026 Weekend Planner Project. 本地场景规划 Agent 演示版</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            <a href="#" className="hover:text-brand-blue transition-colors">卡片分类</a>
            <a href="#" className="hover:text-brand-blue transition-colors">寻路均衡</a>
            <a href="#" className="hover:text-brand-blue transition-colors">好友聚会</a>
            <a href="#" className="hover:text-brand-blue transition-colors">亲子时光</a>
            <a href="#" className="hover:text-brand-blue transition-colors">美食探索</a>
          </div>
        </div>
      </footer>

      {showConfirm && (
        <ConfirmCard
          query={pendingQuery}
          onConfirm={handleConfirm}
          onCancel={handleConfirmCancel}
        />
      )}
    </div>
  );
}