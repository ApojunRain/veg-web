// src/App.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import liff from '@line/liff';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';

import { supabase } from './supabase';
import Chips from './components/Chips';
import { haversineKm, etaSec, formatEta } from './utils/geo';

/** ===== Types ===== */
type Venue = {
  id: string;
  name: string;
  veg_type?: string;
  price_bin?: string;
  reco_count: number;
  lat: number;
  lng: number;
};

type LatLng = { lat: number; lng: number };

/** ===== Custom origins (localStorage) ===== */
const CUSTOM_KEYS = ['customA', 'customB'] as const;
type CustomKey = (typeof CUSTOM_KEYS)[number];

function loadCustomPoint(key: CustomKey): LatLng | null {
  try {
    const raw = localStorage.getItem(`veg-origin:${key}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.lat === 'number' && typeof obj?.lng === 'number') return obj;
  } catch {}
  return null;
}

function saveCustomPoint(key: CustomKey, p: LatLng) {
  localStorage.setItem(`veg-origin:${key}`, JSON.stringify(p));
}

/** ===== Quick origins =====
 *  my = 目前定位（geolocation）
 *  其他 = 固定點（可含兩個使用者自訂）
 */
const QUICK_ORIGINS = [
  { key: 'my', label: '目前位置' as const }, // no lat/lng here
  { key: 'kuangfu', label: '成大光復門', lat: 22.9976, lng: 120.2191 },
  { key: 'chenggong', label: '成大成功門', lat: 22.9949, lng: 120.2199 },
  // 兩個自訂：先用 placeholder；渲染時會以 localStorage 的值覆寫
  { key: 'customA', label: '自訂 A', lat: 0, lng: 0 },
  { key: 'customB', label: '自訂 B', lat: 0, lng: 0 },
] as const;

type OriginKey = (typeof QUICK_ORIGINS)[number]['key'];
type FixedOrigin = Extract<(typeof QUICK_ORIGINS)[number], { lat: number; lng: number }>;
const isFixedOrigin = (o: any): o is FixedOrigin =>
  o && typeof o.lat === 'number' && typeof o.lng === 'number';

const TIME_OPTIONS = [
  { label: '10 分', value: 10 },
  { label: '15 分', value: 15 },
  { label: '15+ 分', value: 999 },
] as const;

export default function App() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  const [originKey, setOriginKey] = useState<OriginKey>('my');
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [minutes, setMinutes] = useState<number>(15);

  const swiperRef = useRef<any>(null);

  // user_hash：預設 dev，LIFF 之後覆寫
  const [userHash, setUserHash] = useState<string>(
    'dev-' + btoa(navigator.userAgent).slice(0, 16),
  );

  /** ===== LIFF 身份綁定 ===== */
  useEffect(() => {
    const liffId = import.meta.env.VITE_LIFF_ID as string | undefined;
    if (!liffId) return;

    liff
      .init({ liffId, withLoginOnExternalBrowser: true })
      .then(() => {
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const idToken = liff.getIDToken();
        if (idToken) {
          setUserHash('liffToken-' + idToken.slice(0, 32));
        } else {
          liff
            .getProfile()
            .then((p) => {
              if (p?.userId) setUserHash('liffUid-' + p.userId);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  /** ===== 讀資料 ===== */
  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('venues')
      .select('id,name,veg_type,price_bin,reco_count,lat,lng')
      .eq('status', 'published')
      .limit(100);
    if (error) alert(error.message);
    setVenues(data || []);
    setLoading(false);

    await logEvent('view');
  }

  useEffect(() => {
    load();
  }, []);

  /** ===== 起點：my -> geolocation；其他 -> 固定座標（含自訂） ===== */
  useEffect(() => {
    // 先把 customA/customB（如果有）覆寫到 QUICK_ORIGINS 這兩個項目
    const customA = loadCustomPoint('customA');
    const customB = loadCustomPoint('customB');
    if (customA) {
      (QUICK_ORIGINS as any)[3].lat = customA.lat;
      (QUICK_ORIGINS as any)[3].lng = customA.lng;
    }
    if (customB) {
      (QUICK_ORIGINS as any)[4].lat = customB.lat;
      (QUICK_ORIGINS as any)[4].lng = customB.lng;
    }

    if (originKey === 'my') {
      if (!navigator.geolocation) {
        setOrigin(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setOrigin(null),
        { enableHighAccuracy: true, timeout: 6000 },
      );
    } else {
      const target = QUICK_ORIGINS.find((x) => x.key === originKey);
      if (target && isFixedOrigin(target)) {
        setOrigin({ lat: target.lat, lng: target.lng });
      } else {
        setOrigin(null);
      }
    }
  }, [originKey]);

  /** ===== 篩選 & 排序（近似 ETA） ===== */
  const filtered = useMemo(() => {
    if (!origin) return venues;

    const rows = venues.map((v) => {
      const distKm = haversineKm(origin, { lat: v.lat, lng: v.lng });
      const sec = etaSec(distKm, 'walk');
      return { ...v, _distKm: distKm, _etaSec: sec };
    });

    const within = rows.filter((r) => r._etaSec <= minutes * 60 || minutes >= 999);
    within.sort((a, b) => a._etaSec - b._etaSec || b.reco_count - a.reco_count);
    return within;
  }, [venues, origin, minutes]);

  /** ===== 事件紀錄 ===== */
  async function logEvent(
    evt: 'view' | 'swipe' | 'upvote' | 'nav',
    venueId?: string,
    meta: any = {},
  ) {
    try {
      await supabase.from('app_events').insert({
        user_hash: userHash,
        venue_id: venueId ?? null,
        event: evt,
        meta,
      });
    } catch {}
  }

  /** ===== +1 推薦 ===== */
  async function upvote(id: string) {
    const { data, error } = await supabase.rpc('fn_upvote', {
      p_user_hash: userHash,
      p_venue_id: id,
    });
    if (error) return alert(error.message);
    const newCount = data as number;
    setVenues((prev) => prev.map((x) => (x.id === id ? { ...x, reco_count: newCount } : x)));
    logEvent('upvote', id);
  }

  /** ===== 設定自訂起點（A/B） ===== */
  function promptSetCustom(key: CustomKey) {
    const lat = Number(prompt('輸入緯度 (lat) 如 22.9976'));
    const lng = Number(prompt('輸入經度 (lng) 如 120.2191'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const p = { lat, lng };
      saveCustomPoint(key, p);
      // 若正在使用該自訂點，立刻套用
      if (originKey === key) setOrigin(p);
      alert(`已更新 ${key.toUpperCase()}：${lat}, ${lng}`);
    } else {
      alert('格式不正確，請重新輸入數字');
    }
  }

  if (loading) return <div style={{ padding: 24 }}>載入中…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>附近蔬食（MVP）</h1>

      {/* 出發點 chips */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>出發點</div>
        <Chips
          value={originKey}
          onChange={setOriginKey}
          options={QUICK_ORIGINS.map((o) => ({ label: o.label as string, value: o.key }))}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={() => promptSetCustom('customA')}>設定自訂 A</button>
          <button onClick={() => promptSetCustom('customB')}>設定自訂 B</button>
        </div>
      </div>

      {/* 時圈 chips */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>時圈</div>
        <Chips value={minutes} onChange={setMinutes} options={TIME_OPTIONS as any} />
      </div>

      {/* 卡片（swiper） */}
      <div style={{ marginTop: 12 }}>
        <Swiper
          onSwiper={(s) => (swiperRef.current = s)}
          onSlideChange={(s) => {
            const v = filtered[s.activeIndex];
            if (v) logEvent('swipe', v.id);
          }}
          spaceBetween={16}
          slidesPerView={1}
          centeredSlides
          style={{ paddingBottom: 24 }}
        >
          {filtered.map((v) => {
            const distKm = origin ? haversineKm(origin, { lat: v.lat, lng: v.lng }) : undefined;
            const sec = distKm ? etaSec(distKm, 'walk') : undefined;

            return (
              <SwiperSlide key={v.id}>
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    padding: 14,
                    background: 'white',
                    boxShadow: '0 4px 16px rgba(0,0,0,.06)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{v.name}</div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}>
                    {(v.veg_type || '蔬食')} · {(v.price_bin || '$')} · 👍 {v.reco_count}
                    {sec ? ` · ${formatEta(sec)}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => upvote(v.id)}>+1 推薦</button>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}&travelmode=walking`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        logEvent('nav', v.id, {
                          origin,
                          eta_sec: sec,
                        })
                      }
                    >
                      導航
                    </a>
                  </div>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>

        {filtered.length === 0 && (
          <div style={{ padding: 16, opacity: 0.7 }}>
            這個時圈沒有找到店家，換個出發點或拉長時間看看～
          </div>
        )}
      </div>
    </div>
  );
}
