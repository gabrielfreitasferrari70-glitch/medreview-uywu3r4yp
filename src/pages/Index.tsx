import { useEffect, useState, useMemo, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { applyInitialSeed, createReview } from '@/services/medreview'
import MedReviewLibrary from '@/components/MedReviewLibrary'
import {
  MedReviewLegacyHome,
  MedReviewLegacySessionComplete,
  MedReviewLegacyStyles,
} from '@/components/MedReviewLegacyLayout'

// ==================== Motor FSRS-5 (portado do MedReview original) ====================
const FSRS_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]
const FSRS_DECAY = -0.5
const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1
const FSRS_MAX_INTERVAL = 36500

function fsrsRetrievability(elapsedDays: number, stability: number): number {
  if (!stability || stability <= 0) return 0
  return Math.pow(1 + (FSRS_FACTOR * Math.max(0, elapsedDays)) / stability, FSRS_DECAY)
}
function fsrsIntervalFor(stability: number, r: number): number {
  const ivl = (stability / FSRS_FACTOR) * (Math.pow(r, 1 / FSRS_DECAY) - 1)
  return Math.max(0.1, Math.min(FSRS_MAX_INTERVAL, ivl))
}
function fsrsInitialDifficulty(g: number): number {
  return Math.min(10, Math.max(1, FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1))
}
function fsrsNextDifficulty(d: number, g: number): number {
  const linDamp = (10 - d) / 9
  const dPrime = d - FSRS_W[6] * (g - 3) * linDamp
  const d0g4 = fsrsInitialDifficulty(4)
  return Math.min(10, Math.max(1, FSRS_W[7] * d0g4 + (1 - FSRS_W[7]) * dPrime))
}
function fsrsInitialStability(g: number): number {
  return Math.max(0.1, FSRS_W[g - 1])
}
function fsrsStabilityAfterRecall(d: number, s: number, r: number, g: number): number {
  let inc =
    Math.exp(FSRS_W[8]) * (11 - d) * Math.pow(s, -FSRS_W[9]) * (Math.exp(FSRS_W[10] * (1 - r)) - 1)
  if (g === 2) inc *= FSRS_W[15]
  if (g === 4) inc *= FSRS_W[16]
  return Math.max(0.1, s * (1 + inc))
}
function fsrsStabilityAfterForget(d: number, s: number, r: number): number {
  return Math.max(
    0.1,
    FSRS_W[11] *
      Math.pow(d, -FSRS_W[12]) *
      (Math.pow(s + 1, FSRS_W[13]) - 1) *
      Math.exp(FSRS_W[14] * (1 - r)),
  )
}
function fsrsSameDayStability(s: number, g: number): number {
  return Math.max(0.1, s * Math.exp(FSRS_W[17] * (g - 3 + FSRS_W[18])))
}
function formatInterval(days: number): string {
  if (days < 1) return `${Math.round(days * 24 * 60)}min`
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${(days / 30).toFixed(1)}m`
  return `${(days / 365).toFixed(1)}a`
}

type Quality = 'again' | 'hard' | 'good' | 'easy'
interface CardState {
  s: number | null
  d: number | null
  state: string
  reps: number
  lapses: number
  lastReviewMs: number | null
  dueMs: number | null
}

function previewIntervals(
  cs: CardState,
  retention: number,
): Record<
  Quality,
  { label: string; value: number; newS?: number; newD?: number; g: number; state: string }
> {
  const mk = (
    g: number,
  ): { label: string; value: number; newS?: number; newD?: number; g: number; state: string } => {
    if (cs.s == null || cs.d == null) {
      const s0 = fsrsInitialStability(g)
      const ivl = fsrsIntervalFor(s0, retention)
      return {
        label: formatInterval(ivl),
        value: ivl,
        g,
        state: g === 1 || g === 2 ? 'learning' : 'review',
      }
    }
    const elapsed = cs.lastReviewMs ? Math.max(0, (Date.now() - cs.lastReviewMs) / 86400000) : 0
    const R = fsrsRetrievability(elapsed, cs.s)
    let newS: number, newState: string
    if (elapsed < 1) {
      newS = fsrsSameDayStability(cs.s, g)
      newState = g === 1 ? 'relearning' : cs.state === 'learning' ? 'review' : cs.state || 'review'
    } else if (g === 1) {
      newS = fsrsStabilityAfterForget(cs.d, cs.s, R)
      newState = 'relearning'
    } else {
      newS = fsrsStabilityAfterRecall(cs.d, cs.s, R, g)
      newState = 'review'
    }
    const ivl = fsrsIntervalFor(newS, retention)
    return {
      label: formatInterval(ivl),
      value: ivl,
      newS,
      newD: fsrsNextDifficulty(cs.d, g),
      g,
      state: newState,
    }
  }
  return { again: mk(1), hard: mk(2), good: mk(3), easy: mk(4) }
}

// ==================== Tipos e camada de dados ====================
interface Deck {
  id: string
  title: string
  kind: string
  order: number
  seed_key?: string
  parent?: string
  deleted?: boolean
}
interface Card {
  id: string
  deck: string
  q: string
  a: string
  group: string
  ref: string
  suspended: boolean
  seed_key?: string
  deleted?: boolean
  diagram_svg?: string
  diagram_title?: string
}
interface Review {
  id: string
  card: string
  card_ref?: string
  rating: string
  stability: number
  difficulty: number
  retrievability: number
  elapsed_days: number
  scheduled_days: number
  state: string
  due: string
  reviewed_at: string
}

function parsePbDate(value?: string): number | null {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const withZone = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`
  const ms = new Date(withZone).getTime()
  return Number.isFinite(ms) ? ms : null
}

// Estado FSRS derivado do histórico de revisões (fonte única: banco)
function cardStateFromReviews(reviews: Review[]): CardState {
  if (reviews.length === 0)
    return { s: null, d: null, state: 'new', reps: 0, lapses: 0, lastReviewMs: null, dueMs: null }
  const ordered = [...reviews].sort(
    (a, b) => (parsePbDate(a.reviewed_at) || 0) - (parsePbDate(b.reviewed_at) || 0),
  )
  const last = ordered[ordered.length - 1]
  const due = parsePbDate(last.due) || Date.now()
  return {
    s: last.stability ?? null,
    d: last.difficulty ?? null,
    state: last.state || 'review',
    reps: ordered.filter((r) => r.rating !== 'again').length,
    lapses: ordered.filter((r) => r.rating === 'again').length,
    lastReviewMs: parsePbDate(last.reviewed_at),
    dueMs: due,
  }
}

const RETENTION_KEY = 'mr_retention'
function getRetention(): number {
  try {
    const v = parseFloat(localStorage.getItem(RETENTION_KEY) || '')
    if (!isNaN(v) && v >= 0.8 && v <= 0.97) return v
  } catch (e) {
    // valor inválido no localStorage — usa o default
  }
  return 0.9
}

// ==================== App ====================
export default function Index() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'in'>('loading')
  const [user, setUser] = useState<any>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [route, setRoute] = useState<{
    view: 'home' | 'study' | 'library'
    deckId?: string
    folderKind?: 'tutoria' | 'prova'
    sessionTitle?: string
  }>({ view: 'home' })
  const [flipped, setFlipped] = useState(false)
  const [queue, setQueue] = useState<Card[]>([])
  const [qIdx, setQIdx] = useState(0)
  const [studySession, setStudySession] = useState({
    startMs: Date.now(),
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  })
  const [msg, setMsg] = useState('')
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [authErr, setAuthErr] = useState('')
  const [busy, setBusy] = useState(false)

  const retention = useMemo(() => getRetention(), [route])

  const ensureSeed = async () => {
    if (!pb.authStore.isValid) return
    const result = await applyInitialSeed()
    if (!result?.ok || result.totalCards < 186)
      throw new Error('A inicialização não foi concluída.')
  }

  const loadData = useCallback(async () => {
    if (!pb.authStore.isValid) return
    try {
      const [d, c, r] = await Promise.all([
        pb.collection('mr_decks').getFullList({ sort: 'order' }),
        pb.collection('mr_cards').getFullList({ sort: '-created' }),
        pb.collection('mr_reviews').getFullList({ sort: 'reviewed_at' }),
      ])
      setDecks((d as any[]).filter((row) => !row.deleted))
      setCards((c as any[]).filter((row) => !row.deleted))
      setReviews(r as any)
    } catch (e: any) {
      setMsg('Erro ao carregar dados: ' + (e?.message || e))
    }
  }, [])

  // Boot: restaura sessão e inicializa biblioteca vazia; seed é idempotente por seed_key.
  useEffect(() => {
    let active = true
    const boot = async () => {
      if (!pb.authStore.isValid) {
        if (active) setAuth('out')
        return
      }
      try {
        await pb.collection('users').authRefresh()
        if (!pb.authStore.isValid) throw new Error('Sessão expirada. Entre novamente.')
        await ensureSeed()
        await loadData()
        if (active) {
          setUser(pb.authStore.record)
          setAuth('in')
        }
      } catch (e: any) {
        if (!active) return
        if (!pb.authStore.isValid) {
          pb.authStore.clear()
          setAuth('out')
        } else {
          setUser(pb.authStore.record)
          await loadData()
          setAuth('in')
          setMsg(
            e?.response?.data?.message ||
              e?.message ||
              'Não foi possível inicializar os cartões. Sua biblioteca existente foi carregada.',
          )
        }
      }
    }
    boot()
    return () => {
      active = false
    }
  }, [loadData])

  // Login / signup
  const doAuth = async () => {
    setAuthErr('')
    setBusy(true)
    try {
      if (loginMode === 'signup') {
        await pb
          .collection('users')
          .create({ email, password: pass, passwordConfirm: pass, name: name || 'Estudante' })
      }
      await pb.collection('users').authWithPassword(email, pass)
      await ensureSeed()
      await loadData()
      setUser(pb.authStore.record)
      setAuth('in')
    } catch (e: any) {
      if (pb.authStore.isValid) {
        setUser(pb.authStore.record)
        setAuth('in')
        await loadData()
        setMsg(
          e?.response?.data?.message || e?.message || 'Não foi possível iniciar sua biblioteca.',
        )
      } else {
        setAuthErr(e?.message || 'Falha na autenticação')
      }
    } finally {
      setBusy(false)
    }
  }
  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setAuth('out')
    setDecks([])
    setCards([])
    setReviews([])
    setRoute({ view: 'home' })
  }

  // Fila FSRS: vencidas → novas → futuras.
  const startStudy = (candidateCards: Card[], deckId?: string, sessionTitle?: string) => {
    const studyCards = candidateCards.filter((c) => !c.suspended && !c.deleted)
    const states = new Map(
      studyCards.map((c) => [
        c.id,
        cardStateFromReviews(reviews.filter((r) => (r.card_ref || r.card) === c.id)),
      ]),
    )
    const currentTime = Date.now()
    const rank = (cs: CardState) =>
      cs.state === 'new' ? 2 : (cs.dueMs || 0) <= currentTime ? 0 : 1
    const sorted = [...studyCards].sort((a, b) => {
      const ra = rank(states.get(a.id)!),
        rb = rank(states.get(b.id)!)
      if (ra !== rb) return ra - rb
      if (ra === 0) return (states.get(a.id)!.dueMs || 0) - (states.get(b.id)!.dueMs || 0)
      return 0
    })
    setQueue(sorted)
    setQIdx(0)
    setFlipped(false)
    setStudySession({ startMs: Date.now(), again: 0, hard: 0, good: 0, easy: 0 })
    setRoute({ view: 'study', deckId, sessionTitle })
  }

  const openDeck = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId)
    startStudy(
      cards.filter((c) => c.deck === deckId),
      deckId,
      deck?.title,
    )
  }
  const openFolderGroup = (folderKind: 'tutoria' | 'prova') =>
    setRoute({ view: 'home', folderKind })
  const startStudyNow = () => {
    const dueOrNew = cards.filter((c) => {
      if (c.suspended || c.deleted) return false
      const cs = cardStateFromReviews(reviews.filter((r) => (r.card_ref || r.card) === c.id))
      return cs.state === 'new' || (cs.dueMs || 0) <= Date.now()
    })
    startStudy(
      dueOrNew.length ? dueOrNew : cards.filter((c) => !c.suspended && !c.deleted),
      undefined,
      'Todas as cartas',
    )
  }
  const startClinicalMode = () => {
    const clinicalCards = cards.filter((c) => /caso clínico|caso clinico/i.test(c.q))
    if (!clinicalCards.length) {
      setMsg('Ainda não há cartões de caso clínico nesta biblioteca.')
      window.setTimeout(() => setMsg(''), 3500)
      return
    }
    startStudy(clinicalCards, undefined, 'Modo Caso Clínico')
  }
  const openNewFolder = () => setRoute({ view: 'library' })

  // Avalia carta: grava review no banco e avança
  const rate = async (quality: Quality) => {
    const card = queue[qIdx]
    if (!card) return
    const cardReviews = reviews.filter((r) => (r.card_ref || r.card) === card.id)
    const cs = cardStateFromReviews(cardReviews)
    const pv = previewIntervals(cs, retention)
    const chosen = pv[quality]
    const now = new Date()
    const dueDate = new Date(now.getTime() + chosen.value * 86400000)
    const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19)
    try {
      const created = await createReview({
        card_ref: card.id,
        rating: quality,
        stability: chosen.newS ?? fsrsInitialStability(chosen.g),
        difficulty: chosen.newD ?? fsrsInitialDifficulty(chosen.g),
        retrievability: cs.s
          ? fsrsRetrievability(
              cs.lastReviewMs ? (now.getTime() - cs.lastReviewMs) / 86400000 : 0,
              cs.s,
            )
          : null,
        elapsed_days: cs.lastReviewMs ? (now.getTime() - cs.lastReviewMs) / 86400000 : 0,
        scheduled_days: chosen.value,
        state: chosen.state,
        due: fmt(dueDate),
        reviewed_at: fmt(now),
      })
      setReviews((rs) => [...rs, { ...(created as any), card_ref: card.id }])
      setStudySession((session) => ({ ...session, [quality]: session[quality] + 1 }))
      setMsg(`Carta agendada para daqui ${chosen.label}`)
      setTimeout(() => setMsg(''), 2500)
      setFlipped(false)
      setQIdx((i) => i + 1)
    } catch (e: any) {
      setMsg('Erro ao salvar revisão: ' + (e?.message || e))
    }
  }

  // ===== Tela: loading =====
  if (auth === 'loading') return <div style={center}>Carregando…</div>

  // ===== Tela: login =====
  if (auth === 'out') {
    return (
      <div style={{ ...center, background: 'linear-gradient(135deg,#f0fdf4,#ffffff)' }}>
        <div style={loginBox}>
          <h1 style={{ color: '#14532d', fontSize: '1.8rem', margin: 0 }}>🩺 MedReview</h1>
          <p style={{ color: '#15803d', margin: '0.3rem 0 1.2rem' }}>
            Revisão interativa de medicina — FSRS-5
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button style={tabBtn(loginMode === 'login')} onClick={() => setLoginMode('login')}>
              Entrar
            </button>
            <button style={tabBtn(loginMode === 'signup')} onClick={() => setLoginMode('signup')}>
              Criar conta
            </button>
          </div>
          {loginMode === 'signup' && (
            <input
              style={input}
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            style={input}
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={input}
            type="password"
            placeholder="Senha (mín. 8 caracteres)"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          {authErr && <div style={errBox}>{authErr}</div>}
          <button style={primaryBtn} disabled={busy} onClick={doAuth}>
            {busy ? 'Aguarde…' : loginMode === 'signup' ? 'Criar conta e começar' : 'Entrar'}
          </button>
          <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '1rem' }}>
            Suas cartas e progresso ficam salvos na nuvem — acesse de qualquer dispositivo.
          </p>
        </div>
      </div>
    )
  }

  const totalCards = cards.length
  const cardStates = new Map(
    cards.map((c) => [
      c.id,
      cardStateFromReviews(reviews.filter((r) => (r.card_ref || r.card) === c.id)),
    ]),
  )
  const dueCount = cards.filter((c) => {
    const cs = cardStates.get(c.id)!
    return cs.state !== 'new' && (cs.dueMs || 0) <= Date.now()
  }).length
  const newCount = cards.filter((c) => cardStates.get(c.id)!.state === 'new').length
  const reviewTodayCount = dueCount + newCount
  const masteredCount = cards.filter((c) => (cardStates.get(c.id)!.s || 0) >= 21).length
  const masteredPercent = totalCards ? Math.round((masteredCount * 100) / totalCards) : 0
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  const reviewDays = new Set(
    reviews
      .map((r) => {
        const date = new Date(
          r.reviewed_at.includes('T') ? r.reviewed_at : r.reviewed_at.replace(' ', 'T'),
        )
        return Number.isNaN(date.getTime()) ? '' : dayKey(date)
      })
      .filter(Boolean),
  )
  const streakCursor = new Date()
  if (!reviewDays.has(dayKey(streakCursor))) streakCursor.setDate(streakCursor.getDate() - 1)
  let streakDays = 0
  while (reviewDays.has(dayKey(streakCursor)) && streakDays < 366) {
    streakDays += 1
    streakCursor.setDate(streakCursor.getDate() - 1)
  }

  // ===== Tela: estudo =====
  if (route.view === 'study') {
    const deck = decks.find((d) => d.id === route.deckId)
    const card = queue[qIdx]
    const sessionTitle = route.sessionTitle || deck?.title || 'Biblioteca'
    const categoryTitle =
      route.sessionTitle === 'Modo Caso Clínico'
        ? 'Casos Clínicos'
        : deck?.kind === 'prova'
          ? 'Prova de Módulo'
          : deck
            ? 'Tutoria'
            : 'Biblioteca'
    const returnToFolders = () =>
      setRoute({
        view: 'home',
        folderKind: deck?.kind === 'prova' ? 'prova' : deck ? 'tutoria' : undefined,
      })
    if (!card)
      return (
        <MedReviewLegacySessionComplete
          title={sessionTitle}
          tally={studySession}
          retention={retention}
          onRestart={() => {
            setStudySession({ startMs: Date.now(), again: 0, hard: 0, good: 0, easy: 0 })
            setQIdx(0)
            setFlipped(false)
          }}
          onExit={returnToFolders}
        />
      )
    const cs = cardStateFromReviews(reviews.filter((r) => (r.card_ref || r.card) === card.id))
    const pv = previewIntervals(cs, retention)
    return (
      <div className="mr-legacy-study-page">
        <MedReviewLegacyStyles />
        <header className="mr-legacy-header">
          <div className="mr-legacy-study-top">
            <nav className="mr-legacy-breadcrumb">
              <button onClick={() => setRoute({ view: 'home' })}>Início</button>
              <span>/</span>
              <button onClick={returnToFolders}>{categoryTitle}</button>
              <span>/</span>
              <strong>{sessionTitle}</strong>
            </nav>
            <div className="mr-legacy-study-controls">
              <span className="mr-legacy-control">
                {qIdx + 1} / {queue.length}
              </span>
              <button className="mr-legacy-control" onClick={() => setQIdx(queue.length)}>
                ✓ Concluído
              </button>
              <button className="mr-legacy-control exit" onClick={returnToFolders}>
                ✕ Sair da sessão
              </button>
            </div>
          </div>
        </header>
        <main className="mr-legacy-study-main">
          <div className="mr-legacy-progress">
            <span>
              {cs.state === 'new'
                ? '🆕 Nova'
                : (cs.dueMs || 0) <= Date.now()
                  ? '⏰ Vencida'
                  : '📅 Futura'}{' '}
              · {card.group || 'Revisão médica'}
            </span>
            <span>Retenção alvo: {Math.round(retention * 100)}%</span>
          </div>
          <article className="mr-legacy-study-card" onClick={() => setFlipped((f) => !f)}>
            <span className="mr-legacy-badge">🩺 Cartão de revisão</span>
            <h1 className="mr-legacy-question">{card.q}</h1>
            {!flipped && <p className="mr-legacy-hint">Toque no cartão para revelar a resposta</p>}
            {flipped && (
              <div className="mr-legacy-answer">
                <strong
                  style={{
                    display: 'block',
                    color: '#15803d',
                    fontSize: '.76rem',
                    letterSpacing: '.1em',
                    marginBottom: 8,
                  }}
                >
                  GABARITO
                </strong>
                {card.a}
                {card.diagram_svg && (
                  <figure style={{ margin: '18px 0 0' }}>
                    {card.diagram_title && (
                      <figcaption style={{ color: '#64748b', fontSize: '.8rem', marginBottom: 5 }}>
                        {card.diagram_title}
                      </figcaption>
                    )}
                    <img
                      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.diagram_svg)}`}
                      alt={card.diagram_title || 'Diagrama do cartão'}
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 320,
                        margin: '0 auto',
                        objectFit: 'contain',
                      }}
                    />
                  </figure>
                )}
                {card.ref && (
                  <div style={{ color: '#64748b', fontSize: '.78rem', marginTop: 12 }}>
                    📚 {card.ref}
                  </div>
                )}
              </div>
            )}
          </article>
          {flipped && (
            <div className="mr-legacy-rating-row">
              {(['again', 'hard', 'good', 'easy'] as Quality[]).map((q) => (
                <button key={q} style={qualityBtn(q)} onClick={() => rate(q)}>
                  <div style={{ fontWeight: 800 }}>
                    {q === 'again'
                      ? 'Errei'
                      : q === 'hard'
                        ? 'Difícil'
                        : q === 'good'
                          ? 'Bom'
                          : 'Fácil'}
                  </div>
                  <div style={{ fontSize: '.72rem', opacity: 0.9 }}>{pv[q].label}</div>
                </button>
              ))}
            </div>
          )}
          {msg && <div style={toast}>{msg}</div>}
        </main>
      </div>
    )
  }

  // ===== Tela: home =====
  if (route.view === 'library') {
    return (
      <MedReviewLibrary
        decks={decks}
        cards={cards}
        onBack={() => setRoute({ view: 'home' })}
        onRefresh={loadData}
        onStudy={openDeck}
      />
    )
  }

  const tutorias = decks.filter((d) => d.kind === 'tutoria')
  const provas = decks.filter((d) => d.kind === 'prova')
  const categories = [
    {
      icon: '🩺',
      tag: 'PBL / Tutoria',
      title: 'Tutoria',
      description:
        'Caso Atual em andamento, tutorias e casos clínicos integrados com repetição espaçada FSRS-5.',
      count: cards.filter((c) => tutorias.some((d) => d.id === c.deck)).length,
      onClick: () => openFolderGroup('tutoria'),
    },
    {
      icon: '📝',
      tag: 'Módulos',
      title: 'Prova de Módulo',
      description: 'Bancos de revisão focados para os módulos e avaliações do curso.',
      count: cards.filter((c) => provas.some((d) => d.id === c.deck)).length,
      onClick: () => openFolderGroup('prova'),
    },
    {
      icon: '📚',
      tag: 'Biblioteca',
      title: 'Todos os Cards',
      description: 'Acesso completo a todas as cartas médicas, pastas e subpastas.',
      count: totalCards,
      onClick: () => setRoute({ view: 'library' }),
    },
  ]
  return (
    <MedReviewLegacyHome
      userEmail={user?.email}
      totalCards={totalCards}
      reviewTodayCount={reviewTodayCount}
      masteredPercent={masteredPercent}
      streakDays={streakDays}
      categories={categories}
      decks={decks}
      cards={cards}
      folderKind={route.folderKind}
      onOpenGroup={openFolderGroup}
      onHome={() => setRoute({ view: 'home' })}
      onOpenDeck={openDeck}
      onClinical={startClinicalMode}
      onStudyNow={startStudyNow}
      onNewFolder={openNewFolder}
      onLibrary={() => setRoute({ view: 'library' })}
      onLogout={logout}
    />
  )
}

const center: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Inter, system-ui, sans-serif',
}
const loginBox: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '2rem',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  width: 340,
  textAlign: 'center',
}
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.7rem 0.9rem',
  borderRadius: 10,
  border: '1.5px solid #cbd5e1',
  fontSize: '0.95rem',
  marginBottom: '0.7rem',
  outline: 'none',
}
const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '0.8rem',
  borderRadius: 10,
  border: 'none',
  background: '#16a34a',
  color: '#fff',
  fontWeight: 800,
  fontSize: '0.95rem',
  cursor: 'pointer',
  marginTop: '0.4rem',
}
const errBox: React.CSSProperties = {
  background: '#fef2f2',
  color: '#b91c1c',
  border: '1px solid #fecaca',
  borderRadius: 8,
  padding: '0.6rem',
  fontSize: '0.82rem',
  marginBottom: '0.6rem',
}
const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '0.55rem',
  borderRadius: 8,
  border: active ? '2px solid #16a34a' : '1.5px solid #cbd5e1',
  background: active ? '#f0fdf4' : '#fff',
  color: active ? '#14532d' : '#64748b',
  fontWeight: 700,
  cursor: 'pointer',
})
const qualityBtn = (q: Quality): React.CSSProperties => ({
  flex: 1,
  minWidth: 100,
  padding: '0.7rem 0.5rem',
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  background:
    q === 'again' ? '#dc2626' : q === 'hard' ? '#d97706' : q === 'good' ? '#16a34a' : '#2563eb',
})
const toast: React.CSSProperties = {
  position: 'fixed',
  bottom: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#14532d',
  color: '#fff',
  padding: '0.6rem 1.2rem',
  borderRadius: 999,
  fontSize: '0.85rem',
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
}
