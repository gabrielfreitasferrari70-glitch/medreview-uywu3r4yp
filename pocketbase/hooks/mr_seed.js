// MedReview v2 — rota pública que serve o seed original (186 cartas).
// Lê diretamente o snapshot de referência (registro conhecido no medreview_state).
routerAdd('GET', '/backend/mr-seed', (e) => {
  try {
    const rec = $app.findRecordById('medreview_state', 'alw0c9r44hr44yl')
    const raw = rec.get('data')
    let parsed = null
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (perr) {
      return e.json(500, { error: 'parse data falhou', dbg: String(perr), rawType: typeof raw })
    }
    const s = parsed && parsed.state ? parsed.state : parsed
    const tuts = (s && s.tutorias_numbered) || {}
    const provas = (s && s.provas) || {}
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
    const total = decks.reduce((acc, d) => acc + d.cards.length, 0)
    if (total <= 0) {
      return e.json(404, {
        error: 'seed vazio',
        dbg: {
          parsedType: typeof parsed,
          keys: parsed ? Object.keys(parsed) : [],
          sKeys: s ? Object.keys(s) : [],
        },
      })
    }
    return e.json(200, { decks })
  } catch (err) {
    return e.json(500, { error: err && err.message ? err.message : String(err) })
  }
})
