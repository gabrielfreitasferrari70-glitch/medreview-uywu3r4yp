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
type ModalState =
  | { type: 'none' }
  | { type: 'folder'; parentId: string; defaultKind: 'tutoria' | 'prova' | 'custom' }
  | { type: 'rename'; deckId: string; title: string }
  | { type: 'card'; deckId: string; card?: Card }
  | { type: 'import'; deckId: string }

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
  border: '1px solid #16a34a',
  borderRadius: 9,
  padding: '0.55rem 0.9rem',
  cursor: 'pointer',
  fontWeight: 700,
  background: '#16a34a',
  color: '#fff',
  fontSize: '0.85rem',
}
const secondaryStyle: React.CSSProperties = {
  ...actionStyle,
  background: '#fff',
  color: '#334155',
  border: '1px solid #cbd5e1',
}
const dangerStyle: React.CSSProperties = {
  ...actionStyle,
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fecaca',
}
const libCss = `
.mr-lib-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-bottom:1px solid #d1fae5;box-shadow:0 4px 18px rgba(20,83,45,.06);display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 20px;font-family:Inter,system-ui,sans-serif}
.mr-lib-back{border:1px solid #bbf7d0;border-radius:11px;padding:9px 14px;color:#15803d;background:#f0fdf4;font:700 .84rem Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:all .18s ease}
.mr-lib-back:hover{background:#dcfce7;border-color:#86efac}
.mr-lib-title{color:#14532d;font-size:1rem;font-weight:900}
.mr-lib-spacer{flex:1}
.mr-lib-count{color:#64748b;font-size:.85rem;font-weight:700}
.mr-lib-main{max-width:1120px;margin:0 auto;padding:22px 20px 60px;font-family:Inter,system-ui,sans-serif}
.mr-lib-section{border:1.5px solid #d1fae5;border-radius:18px;background:#fff;box-shadow:0 5px 18px rgba(20,83,45,.05);margin-bottom:18px;overflow:hidden}
.mr-lib-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px;background:#f0fdf4;border-bottom:1px solid #d1fae5}
.mr-lib-section-head h2{margin:0;color:#14532d;font-size:1.02rem;font-weight:900}
.mr-lib-section-head p{margin:3px 0 0;color:#6b7280;font-size:.8rem}
.mr-lib-deck{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap}
.mr-lib-deck:last-child{border-bottom:0}
.mr-lib-deck.is-child{padding-left:44px;background:#fafcfa}
.mr-lib-deck-name{display:flex;align-items:center;gap:9px;flex:1;min-width:180px;cursor:pointer;border:0;background:none;padding:0;text-align:left;font:inherit}
.mr-lib-deck-name:hover .mr-lib-deck-title{color:#15803d}
.mr-lib-twist{width:20px;height:20px;display:grid;place-items:center;color:#15803d;font-size:.8rem;flex:0 0 20px}
.mr-lib-deck-icon{font-size:1.15rem}
.mr-lib-deck-title{color:#14532d;font-weight:800;font-size:.92rem}
.mr-lib-deck-tag{padding:3px 9px;border-radius:999px;background:#f0fdf4;color:#15803d;font-size:.7rem;font-weight:800;white-space:nowrap}
.mr-lib-deck-tag.warn{background:#fef3c7;color:#b45309}
.mr-lib-deck-actions{display:flex;gap:6px;flex-wrap:wrap}
.mr-lib-mini{border:1px solid #bbf7d0;border-radius:8px;padding:6px 10px;background:#fff;color:#15803d;font:700 .74rem Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:all .15s ease}
.mr-lib-mini:hover{background:#f0fdf4;border-color:#86efac}
.mr-lib-mini.danger{color:#b91c1c;border-color:#fecaca}
.mr-lib-mini.danger:hover{background:#fef2f2}
.mr-lib-empty{padding:26px 18px;color:#64748b;font-size:.88rem;text-align:center}
.mr-lib-panel{border:1.5px solid #d1fae5;border-radius:18px;background:#fff;box-shadow:0 5px 18px rgba(20,83,45,.05);padding:20px;margin-bottom:18px}
.mr-lib-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.mr-lib-panel-head h2{margin:0;color:#14532d;font-size:1.25rem;font-weight:900;letter-spacing:-.02em}
.mr-lib-panel-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}
.mr-lib-card-row{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:9px;background:#fff;flex-wrap:wrap}
.mr-lib-card-q{flex:1;min-width:200px;color:#1f2937;font-size:.9rem;font-weight:600;line-height:1.45}
.mr-lib-card-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}
.mr-lib-card-chip{padding:2px 8px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:.68rem;font-weight:700}
.mr-lib-card-chip.susp{background:#fef3c7;color:#b45309}
.mr-lib-card-actions{display:flex;gap:5px;flex-wrap:wrap}
.mr-lib-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:18px}
.mr-lib-modal{background:#fff;border-radius:18px;padding:22px;width:100%;max-width:460px;box-shadow:0 20px 50px rgba(15,23,42,.25);max-height:88vh;overflow:auto}
.mr-lib-modal h3{margin:0 0 4px;color:#14532d;font-size:1.1rem;font-weight:900}
.mr-lib-modal p{margin:0 0 14px;color:#64748b;font-size:.83rem}
.mr-lib-label{display:block;font-size:.8rem;font-weight:700;color:#475569;margin-bottom:4px}
.mr-lib-notice{padding:0.7rem 0.9rem;border-radius:9px;margin-bottom:10px;font-size:.88rem}
@media(max-width:720px){.mr-lib-main{padding:16px 12px 48px}.mr-lib-deck{padding:11px 12px}.mr-lib-deck.is-child{padding-left:34px}.mr-lib-deck-actions{width:100%;padding-left:30px}.mr-lib-panel{padding:16px 14px}.mr-lib-panel-head h2{font-size:1.08rem}}
`

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

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mr-lib-overlay" onClick={onClose}>
      <div className="mr-lib-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}

export default function MedReviewLibrary({ decks, cards, onBack, onRefresh, onStudy }: Props) {
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [folderTitle, setFolderTitle] = useState('')
  const [folderKind, setFolderKind] = useState<'tutoria' | 'prova' | 'custom'>('custom')
  const [folderParent, setFolderParent] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [cardQ, setCardQ] = useState('')
  const [cardA, setCardA] = useState('')
  const [cardGroup, setCardGroup] = useState('')
  const [cardRef, setCardRef] = useState('')
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (selectedDeckId && !decks.some((deck) => deck.id === selectedDeckId)) {
      setSelectedDeckId('')
    }
  }, [decks, selectedDeckId])

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId)
  const deckCards = useMemo(
    () => cards.filter((card) => card.deck === selectedDeckId),
    [cards, selectedDeckId],
  )
  const countOf = (deckId: string) => cards.filter((c) => c.deck === deckId).length
  const childrenOf = (deckId: string) =>
    decks.filter((d) => d.parent === deckId).sort((a, b) => a.order - b.order)
  const sections: {
    key: string
    icon: string
    title: string
    subtitle: string
    kind: 'tutoria' | 'prova' | 'custom'
  }[] = [
    {
      key: 'tutoria',
      icon: '🩺',
      title: 'Tutoria',
      subtitle: 'Decks do PBL e subpastas que você criar',
      kind: 'tutoria',
    },
    {
      key: 'prova',
      icon: '📝',
      title: 'Prova de Módulo',
      subtitle: 'Bancos de revisão dos módulos',
      kind: 'prova',
    },
    {
      key: 'custom',
      icon: '📁',
      title: 'Minhas Pastas',
      subtitle: 'Suas pastas livres, com subpastas ilimitadas',
      kind: 'custom',
    },
  ]
  const rootDecksOf = (kind: string) =>
    decks.filter((d) => d.kind === kind && !d.parent).sort((a, b) => a.order - b.order)

  const run = async (task: () => Promise<void>, okMsg?: string) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await task()
      await onRefresh()
      if (okMsg) setMessage(okMsg)
      return true
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Não foi possível salvar as alterações.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const openFolderModal = (
    parentId = '',
    defaultKind: 'tutoria' | 'prova' | 'custom' = 'custom',
  ) => {
    setFolderTitle('')
    setFolderKind(defaultKind)
    setFolderParent(parentId)
    setModal({ type: 'folder', parentId, defaultKind })
  }
  const submitFolder = async () => {
    if (!folderTitle.trim()) return setError('Informe o nome da pasta.')
    const done = await run(
      async () => {
        const result: any = await createDeck(folderTitle, folderKind, folderParent || undefined)
        if (folderParent) setExpanded((e) => ({ ...e, [folderParent]: true }))
        setSelectedDeckId(result.id)
      },
      folderParent ? 'Subpasta criada.' : 'Pasta criada.',
    )
    if (done) setModal({ type: 'none' })
  }
  const submitRename = async () => {
    if (!modal.type || modal.type !== 'rename' || !renameTitle.trim())
      return setError('Informe o novo nome.')
    const done = await run(async () => {
      await renameDeck(modal.deckId, renameTitle)
    }, 'Pasta renomeada.')
    if (done) setModal({ type: 'none' })
  }
  const removeDeck = async (deck: Deck) => {
    const kids = childrenOf(deck.id).length
    if (
      !window.confirm(
        `Excluir “${deck.title}”${kids ? ` e suas ${kids} subpasta(s)` : ''}? As cartas desta pasta também saem da sua biblioteca. Esta ação não pode ser desfeita aqui.`,
      )
    )
      return
    await run(async () => {
      await deleteDeck(deck.id)
      if (selectedDeckId === deck.id) setSelectedDeckId('')
    }, 'Pasta excluída.')
  }
  const openCardModal = (deckId: string, card?: Card) => {
    setCardQ(card?.q || '')
    setCardA(card?.a || '')
    setCardGroup(card?.group || '')
    setCardRef(card?.ref || '')
    setModal({ type: 'card', deckId, card })
  }
  const submitCard = async () => {
    if (modal.type !== 'card') return
    if (!cardQ.trim() || !cardA.trim()) return setError('Preencha frente e verso.')
    const done = await run(
      async () => {
        if (modal.card)
          await updateCard({
            id: modal.card.id,
            q: cardQ,
            a: cardA,
            group: cardGroup,
            ref: cardRef,
          })
        else await createCard(modal.deckId, { q: cardQ, a: cardA, group: cardGroup, ref: cardRef })
      },
      modal.card ? 'Cartão atualizado.' : 'Cartão criado.',
    )
    if (done) setModal({ type: 'none' })
  }
  const toggleSuspended = (card: Card) =>
    run(
      async () => {
        await setCardSuspended(card.id, !card.suspended)
      },
      card.suspended ? 'Cartão reativado.' : 'Cartão suspenso (sai das sessões de estudo).',
    )
  const removeCard = (card: Card) => {
    if (!window.confirm('Excluir este cartão? O histórico de revisões será preservado no banco.'))
      return
    run(async () => {
      await deleteCard(card.id)
    }, 'Cartão excluído.')
  }
  const submitImport = async () => {
    if (modal.type !== 'import') return
    if (!modal.deckId) return setError('Escolha a pasta de destino.')
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
    const done = await run(async () => {
      for (let i = 0; i < parsed.length; i += 250)
        await importCards(modal.deckId, parsed.slice(i, i + 250))
      setImportText('')
    }, `${parsed.length} cartões importados.`)
    if (done) setModal({ type: 'none' })
  }
  const readFile = async (file?: File) => {
    if (!file) return
    try {
      setImportText(await file.text())
      setError('')
      setMessage(`Arquivo carregado: ${file.name}. Confira e clique em Importar.`)
    } catch {
      setError('Não foi possível ler o arquivo.')
    }
  }

  const deckRow = (deck: Deck, isChild: boolean) => {
    const kids = childrenOf(deck.id)
    const count = countOf(deck.id)
    const isOpen = !!expanded[deck.id]
    const isSeed = !!deck.title.match(/Tutoria \d+/) && deck.kind === 'tutoria'
    return (
      <div key={deck.id} className={`mr-lib-deck${isChild ? ' is-child' : ''}`}>
        <button
          type="button"
          className="mr-lib-deck-name"
          onClick={() => {
            setSelectedDeckId(deck.id)
            if (kids.length) setExpanded((e) => ({ ...e, [deck.id]: !e[deck.id] }))
          }}
        >
          <span className="mr-lib-twist">{kids.length ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="mr-lib-deck-icon">{deck.kind === 'prova' ? '📝' : '🩺'}</span>
          <span className="mr-lib-deck-title">{deck.title}</span>
          <span className={`mr-lib-deck-tag${count === 0 ? ' warn' : ''}`}>{count} cartas</span>
          {kids.length > 0 && (
            <span className="mr-lib-deck-tag">
              {kids.length} subpasta{kids.length > 1 ? 's' : ''}
            </span>
          )}
          {isSeed && <span className="mr-lib-deck-tag">pronta</span>}
        </button>
        <div className="mr-lib-deck-actions">
          <button className="mr-lib-mini" onClick={() => onStudy(deck.id)}>
            ▶ Estudar
          </button>
          <button className="mr-lib-mini" onClick={() => openCardModal(deck.id)}>
            ＋ Carta
          </button>
          <button
            className="mr-lib-mini"
            onClick={() => openFolderModal(deck.id, deck.kind as any)}
          >
            ＋ Subpasta
          </button>
          <button
            className="mr-lib-mini"
            onClick={() => {
              setRenameTitle(deck.title)
              setModal({ type: 'rename', deckId: deck.id, title: deck.title })
            }}
          >
            ✏️ Renomear
          </button>
          <button className="mr-lib-mini danger" onClick={() => removeDeck(deck)}>
            🗑️ Excluir
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#f0fdf4 0%,#f8fafc 370px)',
      }}
    >
      <style>{libCss}</style>
      <div className="mr-lib-header">
        <button className="mr-lib-back" onClick={onBack}>
          ← Início
        </button>
        <strong className="mr-lib-title">📚 Biblioteca</strong>
        <span className="mr-lib-spacer" />
        <span className="mr-lib-count">
          {decks.length} pastas · {cards.length} cartões
        </span>
      </div>
      <main className="mr-lib-main">
        {error && (
          <div className="mr-lib-notice" style={{ background: '#fef2f2', color: '#991b1b' }}>
            {error}
          </div>
        )}
        {message && (
          <div className="mr-lib-notice" style={{ background: '#f0fdf4', color: '#166534' }}>
            {message}
          </div>
        )}

        {selectedDeck && (
          <section className="mr-lib-panel">
            <div className="mr-lib-panel-head">
              <div>
                <h2>
                  {selectedDeck.kind === 'prova' ? '📝' : '🩺'} {selectedDeck.title}
                </h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '.82rem' }}>
                  {deckCards.length} cartas
                  {selectedDeck.suspended !== undefined ? '' : ''} · gerencie as cartas desta pasta
                </p>
              </div>
              <button className="mr-lib-mini" onClick={() => setSelectedDeckId('')}>
                ✕ Fechar painel
              </button>
            </div>
            <div className="mr-lib-panel-actions">
              <button className="mr-lib-mini" onClick={() => onStudy(selectedDeck.id)}>
                ▶ Estudar esta pasta
              </button>
              <button className="mr-lib-mini" onClick={() => openCardModal(selectedDeck.id)}>
                ＋ Nova carta
              </button>
              <button
                className="mr-lib-mini"
                onClick={() => setModal({ type: 'import', deckId: selectedDeck.id })}
              >
                📥 Importar CSV/JSON
              </button>
              <button
                className="mr-lib-mini"
                onClick={() => openFolderModal(selectedDeck.id, selectedDeck.kind as any)}
              >
                ＋ Subpasta
              </button>
            </div>
            {deckCards.length === 0 ? (
              <div className="mr-lib-empty">
                Nenhuma carta nesta pasta ainda. Crie a primeira com “＋ Nova carta” ou importe um
                CSV/JSON.
              </div>
            ) : (
              deckCards.map((card) => (
                <article key={card.id} className="mr-lib-card-row">
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="mr-lib-card-q">{card.q}</div>
                    <div className="mr-lib-card-chips">
                      {card.group && <span className="mr-lib-card-chip">{card.group}</span>}
                      {card.ref && <span className="mr-lib-card-chip">📚 {card.ref}</span>}
                      {card.suspended && <span className="mr-lib-card-chip susp">⏸ suspensa</span>}
                    </div>
                  </div>
                  <div className="mr-lib-card-actions">
                    <button
                      className="mr-lib-mini"
                      onClick={() => openCardModal(selectedDeck.id, card)}
                    >
                      ✏️ Editar
                    </button>
                    <button className="mr-lib-mini" onClick={() => toggleSuspended(card)}>
                      {card.suspended ? '▶ Retomar' : '⏸ Suspender'}
                    </button>
                    <button className="mr-lib-mini danger" onClick={() => removeCard(card)}>
                      🗑️
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {sections.map((section) => {
          const roots = rootDecksOf(section.kind)
          return (
            <section key={section.key} className="mr-lib-section">
              <div className="mr-lib-section-head">
                <div>
                  <h2>
                    {section.icon} {section.title}
                  </h2>
                  <p>{section.subtitle}</p>
                </div>
                <button className="mr-lib-mini" onClick={() => openFolderModal('', section.kind)}>
                  ＋ Nova pasta
                </button>
              </div>
              {roots.length === 0 ? (
                <div className="mr-lib-empty">Nenhuma pasta aqui ainda — crie a primeira.</div>
              ) : (
                roots.flatMap((deck) => {
                  const kids = childrenOf(deck.id)
                  const isOpen = !!expanded[deck.id]
                  return [
                    deckRow(deck, false),
                    ...(isOpen ? kids.map((k) => deckRow(k, true)) : []),
                  ]
                })
              )}
            </section>
          )
        })}

        {modal.type === 'folder' && (
          <Modal
            title={folderParent ? 'Nova subpasta' : 'Nova pasta'}
            subtitle={
              folderParent
                ? `Dentro de: ${decks.find((d) => d.id === folderParent)?.title || ''}`
                : 'A pasta aparece na home, na seção correspondente ao tipo.'
            }
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Nome da pasta</label>
            <input
              style={fieldStyle}
              value={folderTitle}
              placeholder="Ex.: Cardio-respiratório"
              onChange={(e) => setFolderTitle(e.target.value)}
            />
            {!folderParent && (
              <>
                <label className="mr-lib-label">Tipo (seção da home)</label>
                <select
                  style={fieldStyle}
                  value={folderKind}
                  onChange={(e) => setFolderKind(e.target.value as any)}
                >
                  <option value="custom">📁 Minhas Pastas</option>
                  <option value="tutoria">🩺 Tutoria</option>
                  <option value="prova">📝 Prova de Módulo</option>
                </select>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitFolder}>
                {busy ? 'Salvando…' : 'Criar'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'rename' && (
          <Modal
            title="Renomear pasta"
            subtitle="O nome antigo sai de todas as telas."
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Novo nome</label>
            <input
              style={fieldStyle}
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitRename}>
                {busy ? 'Salvando…' : 'Renomear'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'card' && (
          <Modal
            title={modal.card ? 'Editar carta' : 'Nova carta'}
            subtitle={`Em: ${decks.find((d) => d.id === modal.deckId)?.title || ''}`}
            onClose={() => setModal({ type: 'none' })}
          >
            <label className="mr-lib-label">Frente (pergunta)</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 70 }}
              value={cardQ}
              onChange={(e) => setCardQ(e.target.value)}
            />
            <label className="mr-lib-label">Verso (resposta)</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 90 }}
              value={cardA}
              onChange={(e) => setCardA(e.target.value)}
            />
            <label className="mr-lib-label">Grupo / objetivo (opcional)</label>
            <input
              style={fieldStyle}
              value={cardGroup}
              onChange={(e) => setCardGroup(e.target.value)}
            />
            <label className="mr-lib-label">Referência (opcional)</label>
            <input
              style={fieldStyle}
              value={cardRef}
              onChange={(e) => setCardRef(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitCard}>
                {busy ? 'Salvando…' : modal.card ? 'Salvar' : 'Criar carta'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {modal.type === 'import' && (
          <Modal
            title="Importar cartões"
            subtitle={`Destino: ${decks.find((d) => d.id === modal.deckId)?.title || ''} — CSV (frente,verso) ou JSON (flashcards).`}
            onClose={() => setModal({ type: 'none' })}
          >
            <input
              type="file"
              accept=".csv,.json,.txt"
              style={{ ...fieldStyle, padding: '0.5rem' }}
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            <label className="mr-lib-label">Ou cole o conteúdo aqui</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 120, fontFamily: 'monospace', fontSize: '.8rem' }}
              value={importText}
              placeholder={`frente,verso,grupo\n"O que é X?","É Y","Objetivo 1"\n\nou {"flashcards":[{"pergunta":"...","resposta":"..."}]}`}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={actionStyle} disabled={busy} onClick={submitImport}>
                {busy ? 'Importando…' : 'Importar'}
              </button>
              <button style={secondaryStyle} onClick={() => setModal({ type: 'none' })}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}
      </main>
    </div>
  )
}
