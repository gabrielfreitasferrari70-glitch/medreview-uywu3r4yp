// MedReview v2 — rota pública que serve o seed original (186 cartas) a partir do
// snapshot medreview_state do usuário de referência. O frontend consome esta rota
// no primeiro login de cada conta e popula mr_decks/mr_cards via API normal.
routerAdd('GET', '/backend/mr-seed', (e) => {
  try {
    const refUser = $app.findAuthRecordByEmail('users', 'mr-4l7na8wd9ivmurr22pr@medreview.local')
    const refStates = $app.findRecordsByFilter(
      'medreview_state',
      'user_id = {:uid}',
      '-updated',
      50,
      0,
      { uid: refUser.id },
    )
    if (!refStates || refStates.length === 0) {
      return e.json(404, { error: 'seed indisponivel' })
    }
    // Escolhe o snapshot com mais cartas (o mais completo)
    let best = null
    let bestCount = -1
    refStates.forEach((rec) => {
      try {
        const raw = rec.get('data')
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        const s = parsed.state || parsed
        const tuts = s.tutorias_numbered || {}
        let n = 0
        Object.keys(tuts).forEach((k) => {
          if (tuts[k] && Array.isArray(tuts[k].cards)) n += tuts[k].cards.length
        })
        if (n > bestCount) {
          bestCount = n
          best = s
        }
      } catch (_) {}
    })
    if (!best || bestCount <= 0) {
      return e.json(404, { error: 'seed vazio' })
    }
    const src = best

    const tuts = src.tutorias_numbered || {}
    const provas = src.provas || {}
    const decks = []

    const tutKeys = Object.keys(tuts).sort((a, b) => {
      const na = parseInt((String((tuts[a] && tuts[a].title) || '').match(/\d+/) || ['999'])[0], 10)
      const nb = parseInt((String((tuts[b] && tuts[b].title) || '').match(/\d+/) || ['999'])[0], 10)
      return na - nb
    })
    tutKeys.forEach((k) => {
      const t = tuts[k]
      if (!t || !Array.isArray(t.cards)) return
      decks.push({
        title: t.title || k,
        kind: 'tutoria',
        cards: t.cards.map((c) => ({ q: c.q, a: c.a, group: c.group || '', ref: c.ref || '' })),
      })
    })
    Object.keys(provas).forEach((k) => {
      const p = provas[k]
      if (!p || !Array.isArray(p.cards)) return
      decks.push({
        title: p.title || k,
        kind: 'prova',
        cards: p.cards.map((c) => ({ q: c.q, a: c.a, group: c.group || '', ref: c.ref || '' })),
      })
    })
    return e.json(200, { decks })
  } catch (err) {
    return e.json(500, { error: err && err.message ? err.message : String(err) })
  }
})
