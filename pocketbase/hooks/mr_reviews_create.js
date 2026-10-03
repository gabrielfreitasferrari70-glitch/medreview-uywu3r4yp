// Revisão autenticada: valida o proprietário da carta antes de gravar FSRS.
routerAdd(
  'POST',
  '/backend/v1/mr/reviews',
  (e) => {
    const body = e.requestInfo().body || {}
    if (!e.auth || !e.auth.id) return e.unauthorizedError('Faça login para salvar a revisão.')
    if (!body.card_ref || !body.rating)
      return e.badRequestError('Carta e avaliação são obrigatórias.')
    if (!['again', 'hard', 'good', 'easy'].includes(body.rating))
      return e.badRequestError('Avaliação inválida.')
    let card
    try {
      card = $app.findRecordById('mr_cards', String(body.card_ref))
    } catch (_) {
      return e.notFoundError('Carta não encontrada.')
    }
    if (card.getString('user_id') !== e.auth.id || card.getBool('deleted')) {
      return e.forbiddenError('Esta carta não pertence à sua conta.')
    }
    const col = $app.findCollectionByNameOrId('mr_reviews')
    const review = new Record(col)
    review.set('user_id', e.auth.id)
    // Legado: `card` aponta para deck; `card_ref` é o vínculo correto com a carta.
    review.set('card', card.getString('deck'))
    review.set('card_ref', card.id)
    review.set('rating', body.rating)
    review.set('stability', Number(body.stability) || 0)
    review.set('difficulty', Number(body.difficulty) || 0)
    if (body.retrievability !== null && body.retrievability !== undefined)
      review.set('retrievability', Number(body.retrievability))
    review.set('elapsed_days', Number(body.elapsed_days) || 0)
    review.set('scheduled_days', Number(body.scheduled_days) || 0)
    review.set('state', body.state || 'review')
    review.set('due', body.due)
    review.set('reviewed_at', body.reviewed_at)
    $app.save(review)
    return e.json(201, { id: review.id, card_ref: card.id, rating: review.getString('rating') })
  },
  $apis.requireAuth(),
)
