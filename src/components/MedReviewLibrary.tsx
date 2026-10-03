import { useEffect, useMemo, useState } from 'react'
import { parseCardsFromCsv, type ParsedCsvCard } from '@/lib/csvImport'
import {
  createCard,
  createDeck,
  deleteCard,
  deleteDeck,
  importCards,
  renameDeck,
  setCardSuspended,
  updateCard,
} from '@/services/medreview'

type Deck = { id: string; title: string; kind: string; order: number; parent?: string }
type Card = {
  id: string
  deck: string
  q: string
  a: string
  group: string
  ref: string
  suspended?: boolean
}
type Props = {
  decks: Deck[]
  cards: Card[]
  onBack: () => void
  onRefresh: () => Promise<void>
  onStudy: (deckId: string) => void
}
const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.65rem 0.8rem',
  borderRadius: 9,
  border: '1px solid #cbd5e1',
  font: 'inherit',
  marginBottom: '0.55rem',
  background: '#fff',
}
const actionStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: '0.55rem 0.8rem',
  cursor: 'pointer',
  fontWeight: 700,
  background: '#16a34a',
  color: '#fff',
}
const secondaryStyle: React.CSSProperties = {
  ...actionStyle,
  background: '#f1f5f9',
  color: '#334155',
  border: '1px solid #cbd5e1',
}

function normalizeJsonCards(input: unknown): ParsedCsvCard[] {
  let rows: any = input
  if (rows && !Array.isArray(rows))
    rows = rows.flashcards || rows.cards || rows.cartoes || rows.cartas
  if (!Array.isArray(rows))
    throw new Error('JSON deve conter uma lista em flashcards, cards ou cartoes.')
  return rows
    .map((row: any) => ({
      q: String(row.q ?? row.question ?? row.pergunta ?? row.front ?? row.frente ?? '').trim(),
      a: String(row.a ?? row.answer ?? row.resposta ?? row.back ?? row.verso ?? '').trim(),
      group: String(row.group ?? row.grupo ?? row.category ?? row.categoria ?? '').trim(),
      ref: String(row.ref ?? row.referencia ?? row.source ?? row.fonte ?? '').trim(),
    }))
    .filter((row: ParsedCsvCard) => row.q && row.a)
}

export default function MedReviewLibrary({ decks, cards, onBack, onRefresh, onStudy }: Props) {
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [deckTitle, setDeckTitle] = useState('')
  const [deckKind, setDeckKind] = useState<'tutoria' | 'prova' | 'custom'>('custom')
  const [deckParentId, setDeckParentId] = useState('')
  const [editingDeckTitle, setEditingDeckTitle] = useState('')
  const [cardQ, setCardQ] = useState('')
  const [cardA, setCardA] = useState('')
  const [cardGroup, setCardGroup] = useState('')
  const [cardRef, setCardRef] = useState('')
  const [editingCardId, setEditingCardId] = useState('')
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!selectedDeckId && decks.length) setSelectedDeckId(decks[0].id)
    if (selectedDeckId && !decks.some((deck) => deck.id === selectedDeckId)) {
      setSelectedDeckId(decks[0]?.id || '')
    }
  }, [decks, selectedDeckId])

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId)
  const deckCards = useMemo(
    () => cards.filter((card) => card.deck === selectedDeckId),
    [cards, selectedDeckId],
  )
  const deckLabel = (deck: Deck) => `${deck.parent ? '↳ ' : ''}${deck.title}`
  const resetCardForm = () => {
    setEditingCardId('')
    setCardQ('')
    setCardA('')
    setCardGroup('')
    setCardRef('')
  }
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await task()
      await onRefresh()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Não foi possível salvar as alterações.')
    } finally {
      setBusy(false)
    }
  }

  const submitDeck = async () => {
    if (!deckTitle.trim()) return setError('Informe o nome da pasta.')
    await run(async () => {
      const result: any = await createDeck(deckTitle, deckKind, deckParentId || undefined)
      setDeckTitle('')
      setDeckParentId('')
      setSelectedDeckId(result.id)
      setMessage('Pasta criada.')
    })
  }
  const submitRename = async () => {
    if (!selectedDeck || !editingDeckTitle.trim()) return setError('Informe o novo nome da pasta.')
    await run(async () => {
      await renameDeck(selectedDeck.id, editingDeckTitle)
      setMessage('Pasta renomeada.')
    })
  }
  const removeDeck = async () => {
    if (
      !selectedDeck ||
      !window.confirm(
        `Arquivar “${selectedDeck.title}” e suas subpastas? Os cartões e revisões ficam preservados.`,
      )
    )
      return
    await run(async () => {
      await deleteDeck(selectedDeck.id)
      setSelectedDeckId('')
      setMessage('Pasta arquivada.')
    })
  }
  const editCard = (card: Card) => {
    setEditingCardId(card.id)
    setCardQ(card.q)
    setCardA(card.a)
    setCardGroup(card.group || '')
    setCardRef(card.ref || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const submitCard = async () => {
    if (!selectedDeckId) return setError('Crie ou escolha uma pasta primeiro.')
    if (!cardQ.trim() || !cardA.trim()) return setError('Preencha frente e verso.')
    await run(async () => {
      if (editingCardId)
        await updateCard({ id: editingCardId, q: cardQ, a: cardA, group: cardGroup, ref: cardRef })
      else await createCard(selectedDeckId, { q: cardQ, a: cardA, group: cardGroup, ref: cardRef })
      resetCardForm()
      setMessage(editingCardId ? 'Cartão atualizado.' : 'Cartão criado.')
    })
  }
  const toggleSuspended = (card: Card) =>
    run(async () => {
      await setCardSuspended(card.id, !card.suspended)
      setMessage(card.suspended ? 'Cartão reativado.' : 'Cartão suspenso.')
    })
  const removeCard = (card: Card) => {
    if (!window.confirm('Arquivar este cartão? O histórico de revisões será preservado.')) return
    run(async () => {
      await deleteCard(card.id)
      setMessage('Cartão arquivado.')
    })
  }
  const importData = async () => {
    if (!selectedDeckId) return setError('Escolha a pasta de destino.')
    let parsed: ParsedCsvCard[]
    const trimmed = importText.trim()
    try {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        parsed = normalizeJsonCards(JSON.parse(trimmed))
      } else {
        const result = parseCardsFromCsv(trimmed)
        if (result.error) return setError(result.error)
        parsed = result.cards
      }
    } catch (e: any) {
      return setError(e?.message || 'O arquivo JSON/CSV não pôde ser interpretado.')
    }
    if (!parsed.length) return setError('Nenhum cartão válido encontrado.')
    await run(async () => {
      for (let i = 0; i < parsed.length; i += 250)
        await importCards(selectedDeckId, parsed.slice(i, i + 250))
      setImportText('')
      setMessage(`${parsed.length} cartões importados.`)
    })
  }
  const readFile = async (file?: File) => {
    if (!file) return
    try {
      setImportText(await file.text())
      setError('')
      setMessage(`Arquivo carregado: ${file.name}`)
    } catch {
      setError('Não foi possível ler o arquivo.')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <style>
        {libCss}
        {`@media (max-width: 720px) { .mr-library-grid { grid-template-columns: minmax(0, 1fr) !important; } .mr-library-grid > * { min-width: 0; } .mr-library-grid input, .mr-library-grid select, .mr-library-grid textarea { min-width: 0; max-width: 100%; } .mr-library-cards-panel, .mr-library-cards-panel article { min-width: 0; max-width: 100%; width: 100%; } .mr-library-grid article > div:first-child, .mr-library-cards-panel article > div:first-child { min-width: 0 !important; } }`}
      </style>
      <div className="mr-lib-header">
        <button className="mr-lib-back" onClick={onBack}>
          ← Início
        </button>
        <strong className="mr-lib-title">📚 Biblioteca</strong>
        <span className="mr-lib-spacer" />
        <span className="mr-lib-count">{cards.length} cartões</span>
      </div>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '1.2rem 1rem 3rem' }}>
        {error && <div style={{ ...notice, background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
        {message && (
          <div style={{ ...notice, background: '#f0fdf4', color: '#166534' }}>{message}</div>
        )}
        <div className="mr-library-grid" style={libraryGrid}>
          <section style={panel}>
            <h2 style={sectionTitle}>Pastas e subpastas</h2>
            <label style={fieldLabel}>Pasta selecionada</label>
            <select
              style={fieldStyle}
              value={selectedDeckId}
              onChange={(e) => {
                setSelectedDeckId(e.target.value)
                resetCardForm()
              }}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deckLabel(deck)}
                </option>
              ))}
            </select>
            {selectedDeck && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={fieldStyle}
                    aria-label="Renomear pasta"
                    value={editingDeckTitle || selectedDeck.title}
                    onChange={(e) => setEditingDeckTitle(e.target.value)}
                  />
                  <button style={secondaryStyle} disabled={busy} onClick={submitRename}>
                    Renomear
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={secondaryStyle} onClick={() => onStudy(selectedDeck.id)}>
                    ▶ Estudar
                  </button>
                  <button style={secondaryStyle} onClick={removeDeck}>
                    Arquivar pasta
                  </button>
                </div>
              </>
            )}
            <hr style={divider} />
            <h3 style={subTitle}>Criar pasta ou subpasta</h3>
            <input
              style={fieldStyle}
              placeholder="Nome da pasta"
              value={deckTitle}
              onChange={(e) => setDeckTitle(e.target.value)}
            />
            <select
              style={fieldStyle}
              value={deckKind}
              onChange={(e) => setDeckKind(e.target.value as any)}
            >
              <option value="custom">Pasta personalizada</option>
              <option value="tutoria">Tutoria</option>
              <option value="prova">Prova</option>
            </select>
            <select
              style={fieldStyle}
              value={deckParentId}
              onChange={(e) => setDeckParentId(e.target.value)}
            >
              <option value="">Sem pasta superior</option>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  Dentro de: {deckLabel(deck)}
                </option>
              ))}
            </select>
            <button style={actionStyle} disabled={busy} onClick={submitDeck}>
              ＋ Criar pasta
            </button>
          </section>

          <section style={panel}>
            <h2 style={sectionTitle}>{editingCardId ? 'Editar cartão' : 'Criar cartão'}</h2>
            <input
              style={fieldStyle}
              placeholder="Frente / pergunta"
              value={cardQ}
              onChange={(e) => setCardQ(e.target.value)}
            />
            <textarea
              style={{ ...fieldStyle, minHeight: 110, resize: 'vertical' }}
              placeholder="Verso / resposta"
              value={cardA}
              onChange={(e) => setCardA(e.target.value)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                style={fieldStyle}
                placeholder="Grupo (opcional)"
                value={cardGroup}
                onChange={(e) => setCardGroup(e.target.value)}
              />
              <input
                style={fieldStyle}
                placeholder="Referência (opcional)"
                value={cardRef}
                onChange={(e) => setCardRef(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={actionStyle} disabled={busy || !selectedDeckId} onClick={submitCard}>
                {editingCardId ? 'Salvar edição' : '＋ Salvar cartão'}
              </button>
              {editingCardId && (
                <button style={secondaryStyle} onClick={resetCardForm}>
                  Cancelar
                </button>
              )}
            </div>
            <hr style={divider} />
            <h3 style={subTitle}>Importar CSV ou JSON</h3>
            <p style={helper}>
              CSV: colunas frente/verso (ou pergunta/resposta), grupo e referência opcionais. JSON:
              lista em flashcards, cards ou cartoes.
            </p>
            <input
              style={fieldStyle}
              type="file"
              accept=".csv,.txt,.json,text/csv,application/json"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            <textarea
              style={{ ...fieldStyle, minHeight: 105, resize: 'vertical' }}
              placeholder={'Cole aqui CSV ou JSON…\nfrente;verso;grupo;referencia'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button
              style={secondaryStyle}
              disabled={busy || !selectedDeckId || !importText.trim()}
              onClick={importData}
            >
              Importar para a pasta selecionada
            </button>
          </section>
        </div>

        <section className="mr-library-cards-panel" style={{ ...panel, marginTop: 16 }}>
          <h2 style={sectionTitle}>
            Cartões em {selectedDeck?.title || '—'} <span style={countTag}>{deckCards.length}</span>
          </h2>
          {deckCards.length === 0 && <p style={helper}>Ainda não há cartões nesta pasta.</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {deckCards.map((card) => (
              <article key={card.id} style={cardRow}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <strong style={{ color: '#14532d' }}>{card.q}</strong>
                  <div
                    style={{
                      color: '#475569',
                      fontSize: '0.88rem',
                      marginTop: 4,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {card.a}
                  </div>
                  <small style={{ color: '#64748b' }}>
                    {card.group || 'Sem grupo'}
                    {card.ref ? ` · ${card.ref}` : ''}
                    {card.suspended ? ' · Suspenso' : ''}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={tinyButton} onClick={() => editCard(card)}>
                    Editar
                  </button>
                  <button style={tinyButton} onClick={() => toggleSuspended(card)}>
                    {card.suspended ? 'Reativar' : 'Suspender'}
                  </button>
                  <button
                    style={{ ...tinyButton, color: '#b91c1c' }}
                    onClick={() => removeCard(card)}
                  >
                    Arquivar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

const libCss = `
.mr-lib-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-bottom:1px solid #d1fae5;box-shadow:0 4px 18px rgba(20,83,45,.06);display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 20px;font-family:Inter,system-ui,sans-serif}
.mr-lib-back{border:1px solid #bbf7d0;border-radius:11px;padding:9px 14px;color:#15803d;background:#f0fdf4;font:700 .84rem Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:all .18s ease}
.mr-lib-back:hover{background:#dcfce7;border-color:#86efac}
.mr-lib-title{color:#14532d;font-size:1rem;font-weight:900}
.mr-lib-spacer{flex:1}
.mr-lib-count{color:#64748b;font-size:.85rem;font-weight:700}
@media(max-width:600px){.mr-lib-header{padding:9px 12px;gap:8px}.mr-lib-back{padding:8px 10px;font-size:.72rem}.mr-lib-title{font-size:.9rem}.mr-lib-count{font-size:.72rem}}
`
const topbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.8rem',
  padding: '0.8rem 1.2rem',
  background: 'linear-gradient(90deg,#15803d,#16a34a)',
  boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
}
const ghostBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  border: 0,
  borderRadius: 8,
  padding: '0.45rem 0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
}
const panel: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  padding: '1rem',
  boxShadow: '0 1px 5px rgba(15,23,42,0.08)',
}
const libraryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(260px,0.85fr) minmax(320px,1.4fr)',
  gap: 14,
  alignItems: 'start',
}
const sectionTitle: React.CSSProperties = {
  color: '#14532d',
  fontSize: '1.12rem',
  margin: '0 0 0.8rem',
}
const subTitle: React.CSSProperties = {
  color: '#166534',
  fontSize: '0.98rem',
  margin: '0 0 0.6rem',
}
const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  color: '#475569',
  marginBottom: 4,
}
const helper: React.CSSProperties = { fontSize: '0.83rem', color: '#64748b', lineHeight: 1.45 }
const divider: React.CSSProperties = { border: 0, borderTop: '1px solid #e2e8f0', margin: '1rem 0' }
const notice: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  borderRadius: 9,
  marginBottom: 10,
  fontSize: '0.9rem',
}
const cardRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0.8rem',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  background: '#fff',
}
const tinyButton: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 7,
  padding: '0.4rem 0.55rem',
  background: '#fff',
  color: '#334155',
  cursor: 'pointer',
  fontWeight: 650,
  fontSize: '0.8rem',
}
const countTag: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 5,
  background: '#dcfce7',
  color: '#166534',
  borderRadius: 999,
  padding: '0.12rem 0.5rem',
  fontSize: '0.75rem',
}
