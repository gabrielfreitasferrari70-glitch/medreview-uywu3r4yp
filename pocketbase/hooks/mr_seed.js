// MedReview v2 — seed de decks + cartas: replica o conteúdo original (186 cartas)
// para cada usuário novo, copiando do snapshot medreview_state do usuário de referência
// (mr-4l7na8wd9ivmurr22pr@medreview.local — dados já validados no banco).
onRecordAfterCreateSuccess((e) => {
  const user = e.record
  if (user.collection().name !== 'users') return e.next()
  try {
    const existing = $app.findRecordsByFilter('mr_decks', 'user_id = {:uid}', '', 1, 0, {
      uid: user.id,
    })
    if (existing && existing.length > 0) return e.next()

    // Usuário de referência com o estado completo (186 cartas) no medreview_state
    const refUser = $app.findAuthRecordByEmail('users', 'mr-4l7na8wd9ivmurr22pr@medreview.local')
    const refStates = $app.findRecordsByFilter(
      'medreview_state',
      'user_id = {:uid}',
      '-updated',
      1,
      1,
      { uid: refUser.id },
    )
    if (!refStates || refStates.length === 0) {
      $app.logger().warn('seed MedReview: usuário de referência sem medreview_state')
      return e.next()
    }
    const snapshot = refStates[0].get('data')
    const state = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot
    const src = state.state || state

    const decksCol = $app.findCollectionByNameOrId('mr_decks')
    const cardsCol = $app.findCollectionByNameOrId('mr_cards')

    const makeDeck = (title, kind, order) => {
      const rec = new Record(decksCol)
      rec.set('user_id', user.id)
      rec.set('title', title)
      rec.set('kind', kind)
      rec.set('order', order)
      $app.save(rec)
      return rec
    }
    const makeCard = (deckRec, q, a, group, ref) => {
      const rec = new Record(cardsCol)
      rec.set('user_id', user.id)
      rec.set('deck', deckRec.id)
      rec.set('q', q)
      rec.set('a', a)
      rec.set('group', group || '')
      rec.set('ref', ref || 'Referência Médica')
      $app.save(rec)
    }

    let order = 1
    const tuts = src.tutorias_numbered || {}
    // Ordena tutorias pelo número no título
    const tutKeys = Object.keys(tuts).sort((a, b) => {
      const na = parseInt((String((tuts[a] && tuts[a].title) || '').match(/\d+/) || ['999'])[0], 10)
      const nb = parseInt((String((tuts[b] && tuts[b].title) || '').match(/\d+/) || ['999'])[0], 10)
      return na - nb
    })
    tutKeys.forEach((k) => {
      const t = tuts[k]
      if (!t || !Array.isArray(t.cards)) return
      const deck = makeDeck(t.title || k, 'tutoria', order++)
      t.cards.forEach((c) => makeCard(deck, c.q, c.a, c.group, c.ref))
    })
    const provas = src.provas || {}
    Object.keys(provas).forEach((k) => {
      const p = provas[k]
      if (!p || !Array.isArray(p.cards)) return
      const deck = makeDeck(p.title || k, 'prova', order++)
      p.cards.forEach((c) => makeCard(deck, c.q, c.a, c.group, c.ref))
    })
  } catch (err) {
    $app
      .logger()
      .error('seed MedReview falhou', 'error', err && err.message ? err.message : String(err))
  }
  return e.next()
}, 'users')
