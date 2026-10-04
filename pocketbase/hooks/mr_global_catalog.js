// Leitura do catálogo autenticado e gestão exclusiva da conta administradora.
routerAdd(
  'POST',
  '/backend/v1/mr/global-catalog',
  (e) => {
    if (!e.auth || !e.auth.id) return e.unauthorizedError('Faça login.')
    const userId = e.auth.id
    const email = String(e.auth.getString('email') || '').toLowerCase()
    const isAdmin = email === 'gabrielfreitasferrari70@gmail.com'
    const body = e.requestInfo().body || {}
    const action = String(body.action || '')
    const clean = (x, n) =>
      String(x == null ? '' : x)
        .trim()
        .slice(0, n)
    const adminOwns = (rec) => rec.getString('created_by') === userId && !rec.getBool('deleted')
    try {
      if (action === 'list_catalog') {
        const deckRows = $app.findRecordsByFilter('mr_global_decks', '', 'order', 500, 0)
        const cardRows = $app.findRecordsByFilter('mr_global_cards', '', '-created', 5000, 0)
        const decks = deckRows
          .filter((d) => !d.getBool('deleted'))
          .map((d) => ({ id: d.id, title: d.getString('title'), kind: d.getString('kind') }))
        const liveDeck = {}
        for (const d of decks) liveDeck[d.id] = true
        const cards = cardRows
          .filter((c) => !c.getBool('deleted') && liveDeck[c.getString('deck')])
          .map((c) => ({
            id: c.id,
            deck: c.getString('deck'),
            q: c.getString('q'),
            a: c.getString('a'),
            group: c.getString('group'),
            ref: c.getString('ref'),
            suspended: c.getBool('suspended'),
            diagram_svg: c.getString('diagram_svg'),
            diagram_title: c.getString('diagram_title'),
            choices: c.get('choices'),
            reverse: c.getBool('reverse'),
            clinical: c.getBool('clinical'),
            is_global: true,
          }))
        return e.json(200, { decks, cards })
      }
      if (action === 'get_consent') {
        const u = $app.findRecordById('users', userId)
        return e.json(200, { consent: u.getBool('admin_catalog_review_consent') })
      }
      if (action === 'set_consent') {
        const u = $app.findRecordById('users', userId)
        u.set('admin_catalog_review_consent', body.consent === true)
        $app.save(u)
        return e.json(200, { consent: u.getBool('admin_catalog_review_consent') })
      }
      if (action === 'admin_list_reviews') {
        if (!isAdmin)
          return e.forbiddenError('Somente a conta administradora pode consultar esses dados.')
        const cardRows = $app.findRecordsByFilter('mr_global_cards', '', '-created', 5000, 0)
        const cardIds = {},
          questions = {}
        for (const c of cardRows) {
          if (!c.getBool('deleted')) {
            cardIds[c.id] = true
            questions[c.id] = c.getString('q').slice(0, 180)
          }
        }
        const userRows = $app.findRecordsByFilter(
          'users',
          'admin_catalog_review_consent = true',
          '-created',
          1000,
          0,
        )
        const consented = {}
        for (const u of userRows) consented[u.id] = true
        const rows = $app.findRecordsByFilter('mr_global_reviews', '', '-reviewed_at', 10000, 0)
        const result = []
        for (const r of rows) {
          const uid = r.getString('user_id'),
            cardId = r.getString('global_card_ref')
          if (!consented[uid] || !cardIds[cardId]) continue
          result.push({
            id: r.id,
            card_ref: cardId,
            question: questions[cardId] || '',
            rating: r.getString('rating'),
            stability: r.get('stability'),
            difficulty: r.get('difficulty'),
            state: r.getString('state'),
            due: r.getString('due'),
            reviewed_at: r.getString('reviewed_at'),
          })
        }
        return e.json(200, { reviews: result })
      }
      if (!isAdmin)
        return e.forbiddenError(
          'Somente gabrielfreitasferrari70@gmail.com pode editar o Catálogo Geral.',
        )
      if (action === 'create_deck') {
        const title = clean(body.title, 200)
        if (!title) return e.badRequestError('Informe o nome da pasta.')
        const rows = $app.findRecordsByFilter('mr_global_decks', '', 'order', 500, 0)
        const d = new Record($app.findCollectionByNameOrId('mr_global_decks'))
        d.set('title', title)
        d.set('kind', ['tutoria', 'prova', 'custom'].includes(body.kind) ? body.kind : 'custom')
        d.set('created_by', userId)
        d.set('order', rows.length + 1)
        d.set('deleted', false)
        $app.save(d)
        return e.json(201, { id: d.id })
      }
      if (action === 'create_card') {
        const deck = $app.findRecordById('mr_global_decks', String(body.deck_id || ''))
        if (deck.getString('created_by') !== userId || deck.getBool('deleted'))
          return e.notFoundError('Pasta não encontrada.')
        const v = body.card || {},
          q = clean(v.q, 5000),
          a = clean(v.a, 20000)
        if (!q || !a) return e.badRequestError('Preencha frente e verso.')
        const c = new Record($app.findCollectionByNameOrId('mr_global_cards'))
        c.set('deck', deck.id)
        c.set('q', q)
        c.set('a', a)
        c.set('group', clean(v.group, 200))
        c.set('ref', clean(v.ref, 500))
        c.set('created_by', userId)
        c.set('clinical', !!v.clinical)
        c.set('suspended', false)
        c.set('deleted', false)
        c.set('reverse', !!v.reverse)
        if (v.imageUrl && /^https?:\/\//i.test(String(v.imageUrl))) {
          c.set('diagram_svg', String(v.imageUrl).slice(0, 2000))
          c.set('diagram_title', 'Imagem')
        }
        if (Array.isArray(v.choices))
          c.set(
            'choices',
            v.choices
              .map((x) => clean(x, 300))
              .filter(Boolean)
              .slice(0, 6),
          )
        $app.save(c)
        return e.json(201, { id: c.id })
      }
      if (action === 'update_card') {
        const c = $app.findRecordById('mr_global_cards', String(body.card_id || ''))
        if (!adminOwns(c)) return e.forbiddenError('Card não pertence à conta administradora.')
        const q = clean(body.q, 5000),
          a = clean(body.a, 20000)
        if (!q || !a) return e.badRequestError('Preencha frente e verso.')
        c.set('q', q)
        c.set('a', a)
        c.set('group', clean(body.group, 200))
        c.set('ref', clean(body.ref, 500))
        c.set('clinical', !!body.clinical)
        c.set('reverse', !!body.reverse)
        if (body.imageUrl !== undefined) {
          c.set(
            'diagram_svg',
            /^https?:\/\//i.test(String(body.imageUrl)) ? String(body.imageUrl).slice(0, 2000) : '',
          )
          c.set('diagram_title', body.imageUrl ? 'Imagem' : '')
        }
        if (Array.isArray(body.choices))
          c.set(
            'choices',
            body.choices
              .map((x) => clean(x, 300))
              .filter(Boolean)
              .slice(0, 6),
          )
        $app.save(c)
        return e.json(200, { id: c.id })
      }
      if (action === 'delete_card') {
        const c = $app.findRecordById('mr_global_cards', String(body.card_id || ''))
        if (!adminOwns(c)) return e.forbiddenError('Card não pertence à conta administradora.')
        c.set('deleted', true)
        $app.save(c)
        return e.json(200, { id: c.id, deleted: true })
      }
      return e.badRequestError('Ação do Catálogo Geral desconhecida.')
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err)
      $app
        .logger()
        .error('MedReview global catalog failure', 'action', action, 'error', message.slice(0, 160))
      return e.internalServerError('Não foi possível concluir a operação do Catálogo Geral.')
    }
  },
  $apis.requireAuth(),
)
