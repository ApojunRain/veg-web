import { useEffect, useMemo, useState } from 'react'
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
  const [liffReady, setLiffReady] = useState(false)
  const [liffError, setLiffError] = useState<string | null>(null)
  const [uiMsg, setUiMsg] = useState<string | null>(null)

  const liffId = import.meta.env.VITE_LIFF_ID as string | undefined
  const inLineClient = useMemo(() => {
    // 在 LINE App 內會成立；一般桌面瀏覽器不是
    try {
      return typeof window !== 'undefined' && (liff as any)?.isInClient?.()
    } catch { return false }
  }, [])

  // 只要有設定 LIFF_ID 就初始化；在非 LINE 環境不強制 login，避免白畫面
  useEffect(() => {
    if (!liffId) {
      setUiMsg('⚠️ 未設定 VITE_LIFF_ID，LIFF 登入略過。')
      return
    }
    if (typeof window === 'undefined') return

    liff.init({ liffId })
      .then(() => {
        setLiffReady(true)
        if (inLineClient) {
          // 只有在 LINE 內才啟動登入流程
          if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href })
          }
        } else {
          setUiMsg('（非 LINE 環境，已略過 LIFF 登入以便本機/桌面測試）')
        }
      })
      .catch(err => {
        console.error('LIFF init 失敗', err)
        setLiffError(String(err))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liffId])

  // 讀資料
  async function load() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('venues')
        .select('id,name,veg_type,price_bin,reco_count,lat,lng')
        .eq('status', 'published')
        .order('reco_count', { ascending: false })
        .limit(20)

      if (error) throw error
      setVenues(data || [])
    } catch (e: any) {
      console.error('讀取 venues 失敗', e)
      setUiMsg(`讀取資料失敗：${e?.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }

  // 投票：在 LINE 內用 LIFF 身分，否則用 dev hash（方便本機測試）
  async function upvote(id: string) {
    let user_hash = 'dev-' + btoa(navigator.userAgent).slice(0, 16)

    try {
      if (liffReady && liff.isLoggedIn()) {
        const idToken = liff.getIDToken()
        if (idToken) {
          user_hash = 'liffToken-' + idToken.slice(0, 32)
        } else {
          try {
            const profile = await liff.getProfile()
            if (profile?.userId) user_hash = 'liffUid-' + profile.userId
          } catch { /* 如果拿不到 profile 就維持原本 user_hash */ }
        }
      }
    } catch (e) {
      console.warn('取得 LIFF 身分失敗，改用 dev hash。', e)
    }

    try {
      const { data, error } = await supabase.rpc('fn_upvote', {
        p_user_hash: user_hash,
        p_venue_id: id,
      })
      if (error) throw error

      const newCount = data as number
      setVenues(prev => prev.map(v => v.id === id ? { ...v, reco_count: newCount } : v))
    } catch (e: any) {
      alert(`投票失敗：${e?.message ?? e}`)
    }
  }

  // 首次載入
  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16, maxWidth: 520, margin: '0 auto' }}>
      <h1>附近蔬食（MVP）</h1>

      {/* 顯示一些狀態，方便除錯 */}
      {uiMsg && <div style={{ margin: '8px 0', opacity: 0.75 }}>{uiMsg}</div>}
      {liffError && (
        <div style={{ color: 'tomato', margin: '8px 0' }}>
          LIFF 錯誤：{liffError}
        </div>
      )}

      {loading && <div style={{ padding: 24 }}>載入中…</div>}

      {!loading && venues.length === 0 && (
        <div style={{ padding: 12, opacity: 0.8 }}>
          沒有資料（確認 Supabase 表 `venues` 是否有 `status='published'` 的列）
        </div>
      )}

      {venues.map(v => (
        <div key={v.id}
          style={{ padding: 12, margin: '12px 0', border: '1px solid #ddd', borderRadius: 12 }}>
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

      <button onClick={load} style={{ marginTop: 8 }}>重新整理</button>
    </div>
  )
}
