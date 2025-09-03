// src/App.tsx
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import liff from '@line/liff'

type Venue = {
  id: string
  name: string
  veg_type?: string
  price_bin?: string
  reco_count: number
  lat: number
  lng: number
}

export default function App() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)

  // --- LIFF 初始化（只在瀏覽器端）---
  useEffect(() => {
    // 確保有設定 LIFF ID
    const liffId = import.meta.env.VITE_LIFF_ID as string | undefined
    if (!liffId) {
      console.warn('⚠️ 未設定 VITE_LIFF_ID，將使用暫時的 dev user_hash。')
      return
    }

    // 避免 SSR 或測試環境沒有 window
    if (typeof window === 'undefined') return

    liff
      .init({ liffId })
      .then(() => {
        if (!liff.isLoggedIn()) {
          // 直接導回當前頁
          liff.login({ redirectUri: window.location.href })
        } else {
          console.log('✅ LIFF 已登入')
        }
      })
      .catch((err) => {
        console.error('❌ LIFF init 失敗', err)
      })
  }, [])

  // --- 讀取清單 ---
  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('venues')
      .select('id,name,veg_type,price_bin,reco_count,lat,lng')
      .eq('status', 'published')
      .order('reco_count', { ascending: false })
      .limit(20)

    if (error) alert(error.message)
    setVenues(data || [])
    setLoading(false)
  }

  // --- +1 投票（優先用 LIFF 身分，否則退回 dev hash）---
  async function upvote(id: string) {
    let user_hash = 'dev-' + btoa(navigator.userAgent).slice(0, 16)

    try {
      if (liff.isLoggedIn()) {
        // 方式一：用 ID Token 當 hash（不需 profile scope）
        const idToken = liff.getIDToken()
        if (idToken) user_hash = 'liff-' + idToken.slice(0, 24)
        // 方式二（可選）：有 profile scope 時，用 userId
        // const profile = await liff.getProfile()
        // user_hash = 'liff-' + profile.userId
      }
    } catch (e) {
      console.warn('使用 LIFF 身分失敗，改用 dev hash。', e)
    }

    const { data, error } = await supabase.rpc('fn_upvote', {
      p_user_hash: user_hash,
      p_venue_id: id,
    })

    if (error) {
      alert(error.message)
      return
    }

    const newCount = data as number
    setVenues((prev) =>
      prev.map((x) => (x.id === id ? { ...x, reco_count: newCount } : x))
    )
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <div style={{ padding: 24 }}>載入中…</div>

  return (
    <div style={{ padding: 16, maxWidth: 520, margin: '0 auto' }}>
      <h1>附近蔬食（MVP）</h1>

      {venues.map((v) => (
        <div
          key={v.id}
          style={{
            padding: 12,
            margin: '12px 0',
            border: '1px solid #ddd',
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>{v.name}</div>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            {(v.veg_type || '蔬食')} · {(v.price_bin || '$')} · 👍 {v.reco_count}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={() => upvote(v.id)}>+1 推薦</button>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}&travelmode=walking`}
              target="_blank"
            >
              導航
            </a>
          </div>
        </div>
      ))}

      <button onClick={load}>重新整理</button>
    </div>
  )
}

useEffect(() => {
  liff
    .init({
      liffId: import.meta.env.VITE_LIFF_ID,
      // 建議把 redirectUri 指到「現在頁面」，避免外部瀏覽器登入後回不來
      withLoginOnExternalBrowser: true,
    })
    .then(() => {
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href })
        return
      }
      console.log('✅ LIFF ready')
    })
    .catch((err) => {
      console.error('LIFF init 失敗', err)
    })
}, [])

