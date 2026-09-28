import { useEffect } from 'react'

// ========================================================
// Exposição antecipada dos handlers globais (antes do boot/snapshot)
// ========================================================
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>

  if (typeof w.openImportFlow !== 'function') {
    w.openImportFlow = function (ctx?: unknown) {
      if (
        typeof (w as { __realOpenImportFlow?: (c?: unknown) => void }).__realOpenImportFlow ===
        'function'
      ) {
        ;(w as { __realOpenImportFlow: (c?: unknown) => void }).__realOpenImportFlow(ctx)
      } else {
        w.__pendingImportFlowCtx = ctx
      }
    }
  }

  if (typeof w.openCsvImport !== 'function') {
    w.openCsvImport = function (ctx?: unknown) {
      if (typeof w.openImportFlow === 'function') {
        ;(w.openImportFlow as (c?: unknown) => void)(ctx)
      } else if (typeof w.openCsvImportModal === 'function') {
        ;(w.openCsvImportModal as (c?: unknown) => void)(ctx)
      } else {
        w.__pendingCsvImportCtx = ctx
      }
    }
  }

  if (typeof w.openCreateChoice !== 'function') {
    w.openCreateChoice = function (ctx?: unknown) {
      if (
        typeof (w as { __realOpenCreateChoice?: (c?: unknown) => void }).__realOpenCreateChoice ===
        'function'
      ) {
        ;(w as { __realOpenCreateChoice: (c?: unknown) => void }).__realOpenCreateChoice(ctx)
      } else {
        w.__pendingCreateChoiceCtx = ctx
      }
    }
  }

  if (typeof w.openCsvImportModal !== 'function') {
    w.openCsvImportModal = function (ctx?: unknown) {
      if (
        typeof (w as { __realOpenCsvImportModal?: (c?: unknown) => void })
          .__realOpenCsvImportModal === 'function'
      ) {
        ;(w as { __realOpenCsvImportModal: (c?: unknown) => void }).__realOpenCsvImportModal(ctx)
      } else {
        w.__pendingCsvImportCtx = ctx
      }
    }
  }

  if (typeof w.currentFolderContext !== 'function') {
    w.currentFolderContext = function () {
      const active = (w as { __activeFolderContext?: string }).__activeFolderContext
      if (active) return active
      const studyState = (w as { studyState?: { deckId?: string } }).studyState
      if (studyState && studyState.deckId) return studyState.deckId
      const currentRoute = (w as { currentRoute?: string }).currentRoute
      if (currentRoute && currentRoute !== 'home' && currentRoute !== 'study') return currentRoute
      return null
    }
  }

  if (typeof w.openGlobalStatsModal !== 'function') {
    w.openGlobalStatsModal = function () {
      if (
        typeof (w as { __realOpenGlobalStatsModal?: () => void }).__realOpenGlobalStatsModal ===
        'function'
      ) {
        ;(w as { __realOpenGlobalStatsModal: () => void }).__realOpenGlobalStatsModal()
      } else {
        w.__pendingOpenGlobalStats = true
      }
    }
  }

  if (typeof w.closeGlobalStatsModal !== 'function') {
    w.closeGlobalStatsModal = function () {
      const modal = document.getElementById('global-stats-modal')
      if (modal) modal.style.display = 'none'
    }
  }
}

// MedReview — loader FSRS-5
const SNAPSHOT_URL =
  'https://skip-artifacts-snapshots.application.production.adapta.tools/user_3HTICEnYMM5WBBANnC92pS98buX/yisoxzvbrn3bl5lzd6jer67vtu/revisions/8307c45a-9eba-47b5-9ecf-ffa97e8a04a9/index.html'

type Edit = unknown[]

interface EditData {
  colors: string[][]
  edits: Edit[]
}

async function loadData(): Promise<EditData> {
  const rs = await Promise.all([
    fetch('/mr-p1.json', { cache: 'no-store' }),
    fetch('/mr-p2.json', { cache: 'no-store' }),
    fetch('/mr-p3.json', { cache: 'no-store' }),
  ])
  if (rs.some((r) => !r.ok)) throw new Error('falha ao carregar transformações')
  const parts = (await Promise.all(rs.map((r) => r.json()))) as EditData[]
  return {
    colors: parts[0].colors,
    edits: parts.flatMap((p) => p.edits),
  }
}

function transform(html: string, data: EditData): string {
  let out = html
  for (const pair of data.colors) {
    const a = pair[0]
    const b = pair[1]
    out = out.split(a).join(b)
    out = out.split(a.toUpperCase()).join(b.toUpperCase())
  }
  for (const e of data.edits) {
    const kind = e[0] as string
    if (kind === 'b') {
      const i = out.indexOf(e[1] as string)
      if (i === -1) {
        console.warn('[transform] Marker 1 not found:', e[1])
        continue
      }
      const j = out.indexOf(e[2] as string, i)
      if (j === -1) {
        console.warn('[transform] Marker 2 not found:', e[2])
        continue
      }
      out = out.slice(0, i) + (e[3] as string) + out.slice(j)
    } else {
      const search = e[1] as string
      const replace = e[2] as string
      if (e[3] === true) {
        out = out.split(search).join(replace)
      } else {
        out = out.replace(search, replace)
      }
    }
  }
  return out
}

// Helper to extract code slices from the loaded HTML
// Injeção do sistema completo e robusto de hierarquia de pastas e subpastas no MedReview
function injectHierarchySupport(html: string): string {
  const hierarchyScript = `
<script>
// ========================================================
// MedReview — Motor de Hierarquia de Pastas & Subpastas (FSRS-5)
// ========================================================
(function() {
  // PASSO 3: Função síncrona padronizadora de qualquer elemento de cartão de pasta recém-renderizado
  function decorateCardElementImmediately(card) {
    if (!card || !(card instanceof HTMLElement)) return;
    if (card.classList.contains('mr-subfolder-card')) return;

    // Se já estiver completamente decorado e nada tiver mudado, pula
    if (card.getAttribute('data-mr-folder-card-header') === '1' &&
        card.getAttribute('data-mr-folder-card-footer') === '1' &&
        card.getAttribute('data-mr-folder-top-delete') === '1' &&
        card.classList.contains('mr-tutoria-card')) {
      return;
    }

    const rawTitleEl = card.querySelector('h2, h3, h4, .deck-title, .folder-title, .title, strong');
    const titleText = (rawTitleEl?.textContent || card.getAttribute('data-folder-name') || '').trim();

    const onclickAttr = card.getAttribute('onclick') || '';
    const navMatch = onclickAttr.match(/navigateTo(['"]([^'"]+)['"])/)?.[1] ||
                     onclickAttr.match(/studyDeck(['"]([^'"]+)['"])/)?.[1] ||
                     onclickAttr.match(/tutoria_d+/i)?.[0];
    const titleTutoriaMatch = titleText.match(/tutorias*(d+)/i);
    const titleTutoriaId = titleTutoriaMatch ? ('tutoria_' + titleTutoriaMatch[1]) : null;

    const effectiveFolderId = card.getAttribute('data-folder-id') ||
                              card.getAttribute('data-deck-id') ||
                              navMatch ||
                              titleTutoriaId ||
                              null;

    const lowerTitle = titleText.toLowerCase();
    const lowerId = (effectiveFolderId || '').toLowerCase();

    const isCustomRoot = !!(typeof state !== 'undefined' && state && state.custom_root_folders && effectiveFolderId && state.custom_root_folders[effectiveFolderId]);
    const isCustomProva = !!(typeof state !== 'undefined' && state && state.custom_prova_folders && effectiveFolderId && state.custom_prova_folders[effectiveFolderId]);
    const isCustomTutoria = !!(typeof state !== 'undefined' && state && state.custom_tutoria_folders && effectiveFolderId && state.custom_tutoria_folders[effectiveFolderId]);

    const isTutoriaCard = lowerTitle.includes('tutoria') || lowerId.includes('tutoria');
    const isProvaCard = !isTutoriaCard && (
      isCustomProva ||
      lowerTitle.includes('prova') ||
      lowerId.includes('prova') ||
      lowerTitle.includes('cardio') ||
      lowerTitle.includes('módulo') ||
      lowerTitle.includes('modulo') ||
      card.classList.contains('deck-card')
    );
    const isCustomFolder = !isTutoriaCard && !isProvaCard && (isCustomRoot || isCustomTutoria);

    // Todo cartão novo de pasta ou módulo recebe a classe .mr-tutoria-card
    const shouldUseStandardCard = isTutoriaCard || isProvaCard || isCustomFolder || true;

    let categoryBadge = '📁 Pasta';
    let icon = '📁';
    if (isTutoriaCard) {
      categoryBadge = 'PBL/Tutoria';
    } else if (isProvaCard) {
      categoryBadge = '📝 Provas';
      icon = '📝';
    } else if (isCustomFolder || isCustomRoot || isCustomTutoria) {
      categoryBadge = '📁 Pasta';
      icon = '📁';
    }

    const iconMatch = titleText.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])/u);
    let cleanTitle = titleText;
    if (iconMatch) {
      icon = iconMatch[0];
      cleanTitle = cleanTitle.replace(icon, '').trim();
    }

    // Aplica classes imediatamente sem esperar timers
    card.classList.add('mr-folder-card');
    card.setAttribute('data-mr-folder-card', '1');
    if (shouldUseStandardCard) {
      card.classList.add('mr-tutoria-card');
    }

    // Garante position relative para o botão 🗑
    const currentPos = window.getComputedStyle(card).position;
    if (!currentPos || currentPos === 'static') {
      card.style.position = 'relative';
    }

    // Injeta botão 🗑 no canto superior direito
    if (card.getAttribute('data-mr-folder-top-delete') !== '1' && !card.querySelector('.mr-folder-card-top-delete')) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'mr-folder-card-top-delete';
      delBtn.title = 'Excluir pasta';
      delBtn.setAttribute('data-mr-folder-delete', '1');
      if (effectiveFolderId) delBtn.setAttribute('data-folder-id', effectiveFolderId);
      if (cleanTitle) delBtn.setAttribute('data-folder-title', cleanTitle);
      delBtn.style.cssText = 'position:absolute; top:12px; right:12px; width:34px; height:34px; min-width:34px; min-height:34px; box-sizing:border-box; z-index:10; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0; font-size:15px; cursor:pointer; line-height:1; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(220,38,38,0.12);';
      delBtn.innerHTML = '🗑';
      delBtn.onclick = function(e) {
        e.stopPropagation();
        const effId = effectiveFolderId || card.getAttribute('data-folder-id') || card.getAttribute('data-deck-id');
        const effTitle = cleanTitle || titleText || '';
        if (typeof window.openFolderDeleteModal === 'function') {
          window.openFolderDeleteModal(effId, effTitle);
        }
      };
      card.appendChild(delBtn);
      card.setAttribute('data-mr-folder-top-delete', '1');
    }

    // Cabeçalho padronizado
    if (card.getAttribute('data-mr-folder-card-header') !== '1') {
      let headerEl = card.querySelector('.mr-folder-card-header');
      if (!headerEl) {
        headerEl = document.createElement('div');
        headerEl.className = 'mr-folder-card-header mr-tutoria-header';
        headerEl.innerHTML =
          '<span class="mr-folder-card-badge" style="align-self:flex-start; margin-bottom:0.15rem;">' + escapeHtml(categoryBadge) + '</span>' +
          '<div class="mr-folder-card-title-wrap" style="display:flex; align-items:center; gap:0.5rem; min-width:0; width:100%;">' +
            '<span class="mr-folder-card-icon" style="font-size:1.35rem; line-height:1; flex-shrink:0;">' + icon + '</span>' +
            '<span class="mr-folder-card-title" style="white-space:normal; overflow:visible; text-overflow:clip; font-size:1.15rem; font-weight:800; color:#14532d; line-height:1.3;">' +
              (escapeHtml(cleanTitle) || 'Pasta') +
            '</span>' +
          '</div>';

        if (rawTitleEl && rawTitleEl.parentNode) {
          rawTitleEl.remove();
        }
        card.insertBefore(headerEl, card.firstChild);
      }
      card.setAttribute('data-mr-folder-card-header', '1');
    }

    // Limpeza de ícones e textos duplicados
    card.querySelectorAll('.deck-icon, .folder-icon, img, svg, i').forEach(el => {
      if (!el.closest('.mr-folder-card-header') && !el.closest('.mr-folder-card-footer')) {
        el.remove();
      }
    });
    card.querySelectorAll('p, div, span, small').forEach(el => {
      if (!el.closest('.mr-folder-card-header') && !el.closest('.mr-folder-card-footer')) {
        const txt = (el.textContent || '').trim();
        if (txt.match(/^\\d+\\s*cartas?$/i) || txt === '📁' || txt === '📝' || txt.includes('dominado') || txt.toLowerCase() === 'cartas' || txt.toLowerCase() === 'carta') {
          el.remove();
        }
      }
    });

    // Rodapé padronizado
    if (card.getAttribute('data-mr-folder-card-footer') !== '1') {
      const allFolderCards = effectiveFolderId && typeof getFolderAllCards === 'function' ? getFolderAllCards(effectiveFolderId) : [];
      const totalCards = allFolderCards ? allFolderCards.length : 0;
      let masteredCards = 0;
      allFolderCards.forEach(c => {
        const ivl = typeof c.interval === 'number' ? c.interval : (typeof c.fsrsS === 'number' ? c.fsrsS : 0);
        if (ivl >= 21) masteredCards++;
      });
      const pct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;

      const oldFooters = card.querySelectorAll('.mr-folder-card-footer, .deck-footer, .folder-footer');
      oldFooters.forEach(f => f.remove());

      const footerEl = document.createElement('div');
      footerEl.className = 'mr-folder-card-footer';
      footerEl.innerHTML =
        '<div class="mr-folder-card-footer-left">' +
          '<span class="mr-folder-card-count-chip">' + totalCards + ' ' + (totalCards === 1 ? 'carta' : 'cartas') + '</span>' +
        '</div>' +
        '<div class="mr-folder-card-actions">' +
          '<button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-reset" title="Resetar progresso das cartas">🔄 Resetar</button>' +
          '<button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-add" title="Adicionar carta nesta pasta">+ Carta</button>' +
          '<button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-subfolder" title="Acessar subpasta desta pasta">📁 Subpasta</button>' +
          '<button type="button" class="mr-folder-card-btn-delete" title="Excluir pasta" data-mr-folder-delete="1" data-folder-id="' + (effectiveFolderId || '') + '" data-folder-title="' + (cleanTitle ? cleanTitle.replace(/"/g, '&quot;') : '') + '" style="flex: 0 0 34px; width: 34px; height: 34px; min-width: 34px; min-height: 34px; border-radius: 8px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; font-size: 15px;">🗑</button>' +
        '</div>';
      const resetBtn = footerEl.querySelector('.mr-folder-card-btn-reset');
      if (resetBtn) {
        resetBtn.onclick = function(e) {
          e.stopPropagation();
          if (totalCards === 0) {
            if (typeof showToast === 'function') showToast('Esta pasta não possui cartas para resetar.');
            return;
          }
          if (!window.confirm('Deseja resetar o progresso FSRS-5 de ' + totalCards + ' carta(s) desta pasta?')) return;
          if (effectiveFolderId && typeof resetFolderCardsFsrs === 'function') {
            resetFolderCardsFsrs(effectiveFolderId);
          }
        };
      }

      const addBtn = footerEl.querySelector('.mr-folder-card-btn-add');
      if (addBtn) {
        addBtn.onclick = function(e) {
          e.stopPropagation();
          const targetId = effectiveFolderId || 'tutoria';
          if (typeof openCreateChoice === 'function') {
            openCreateChoice(targetId);
          } else if (typeof openNewCardModal === 'function') {
            openNewCardModal(targetId);
          }
        };
      }

      const sfBtn = footerEl.querySelector('.mr-folder-card-btn-subfolder');
      if (sfBtn) {
        sfBtn.onclick = function(e) {
          e.stopPropagation();
          const targetId = effectiveFolderId || 'tutoria';
          const subs = typeof getSubfoldersOf === 'function' ? getSubfoldersOf(targetId) : [];
          if (subs.length === 1) {
            navigateTo(subs[0].id);
          } else if (subs.length > 1) {
            if (typeof renderSubfoldersPicker === 'function') {
              renderSubfoldersPicker(targetId);
            } else {
              navigateTo(targetId);
            }
          } else {
            if (typeof openSubfolderCreateModal === 'function') {
              openSubfolderCreateModal(targetId);
            } else {
              navigateTo(targetId);
            }
          }
        };
      }

      const delBtnFooter = footerEl.querySelector('.mr-folder-card-btn-delete');
      if (delBtnFooter) {
        delBtnFooter.onclick = function(e) {
          e.stopPropagation();
          const effId = effectiveFolderId || card.getAttribute('data-folder-id') || card.getAttribute('data-deck-id');
          const effTitle = cleanTitle || titleText || '';
          if (typeof window.openFolderDeleteModal === 'function') {
            window.openFolderDeleteModal(effId, effTitle);
          }
        };
      }

      card.appendChild(footerEl);
      card.setAttribute('data-mr-folder-card-footer', '1');
    }
  }
  window.__decorateCardElementImmediately = decorateCardElementImmediately;

  // 1. Estilos visuais adicionais
  const styleEl = document.createElement('style');
  styleEl.textContent = \`
    /* Regras globais para ocultar painéis de estatísticas fora do modal global */    body > *:not(#global-stats-modal) .deck-stats,
    body > *:not(#global-stats-modal) .stats-overview,
    body > *:not(#global-stats-modal) .folder-stats,
    body > *:not(#global-stats-modal) .deck-performance,
    body > *:not(#global-stats-modal) .deck-performance-panel,
    body > *:not(#global-stats-modal) .deck-stats-panel,
    body > *:not(#global-stats-modal) .folder-performance-panel,
    .folder-view .deck-stats,
    .folder-view .stats-overview,
    .folder-view .folder-stats,
    .deck-view .deck-stats,
    .deck-view .stats-overview,
    .deck-view .folder-stats,
    #mr-subfolder-wrapper .deck-stats,
    #mr-subfolder-wrapper .stats-overview,
    #mr-subfolder-wrapper .folder-stats,
    .folder-view .mr-folder-stats-panel,
    .folder-view .folder-stats-panel,
    .folder-view .deck-stats-panel,
    .folder-view .folder-performance-panel,
    .deck-view .mr-folder-stats-panel,
    .deck-view .folder-stats-panel,
    .deck-view .deck-performance,
    .deck-view > .deck-stats,
    .folder-view > .folder-stats,
    .folder-view > .stats-grid,
    #mr-subfolder-wrapper .mr-folder-stats-panel,
    #mr-subfolder-wrapper .folder-stats-panel,
    .folder-view button[onclick*="Stats"],
    .deck-view button[onclick*="Stats"],
    #mr-subfolder-wrapper button[onclick*="Stats"],
    #mr-subfolder-wrapper {
      margin-top: 0 !important;
      padding-top: 0 !important;
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
      display: block;
      width: 100%;
      background: transparent !important;
      min-height: auto !important;
      box-shadow: none !important;
      border: none !important;
    }
    #mr-subfolder-wrapper .mr-subfolder-content-container {
      padding-top: 1.25rem !important;
      padding-bottom: 2rem !important;
      padding-left: 1.25rem !important;
      padding-right: 1.25rem !important;
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      background: transparent !important;
      min-height: auto !important;
    }
    #mr-subfolder-wrapper .mr-breadcrumb-bar {
      margin-top: 0 !important;
      margin-bottom: 1.25rem !important;
      padding: 0.55rem 0.95rem !important;
    }
    #mr-subfolder-wrapper .mr-subfolder-hero-card {
      margin-top: 0 !important;
      margin-bottom: 1.35rem !important;
    }
    #mr-subfolder-wrapper .mr-subfolder-section-block {
      margin-top: 0 !important;
      margin-bottom: 1.25rem !important;
    }
    /* Neutralização de faixas brancas ou spacers herdados */
    #mr-subfolder-wrapper > *:empty,
    #mr-subfolder-wrapper .spacer,
    #mr-subfolder-wrapper [class*="spacer"],
    #mr-subfolder-wrapper [class*="whitespace"] {
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .folder-header-actions button[onclick*="Stats"],
    .deck-header-actions button[onclick*="Stats"],
    .header-actions button[onclick*="Stats"],
    .med-deck-actions button[onclick*="Stats"],
    div[id*="detailed-stats"]:not(#global-stats-modal),
    div[class*="detailed-stats"]:not(#global-stats-modal) {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .mr-folder-card {
      position: relative;
      background: #ffffff;
      border-radius: 16px;
      border: 1.5px solid #d1fae5;
      box-shadow: 0 3px 12px rgba(15, 23, 42, 0.04);
      transition: all 0.2s ease;
      cursor: pointer;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .mr-folder-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 5px;
      background: linear-gradient(90deg, #16a34a, #22c55e, #4ade80);
      border-top-left-radius: 15px;
      border-top-right-radius: 15px;
    }
    .mr-folder-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(22, 163, 74, 0.12);
    }
    .mr-folder-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .mr-tutoria-card .mr-folder-card-header,
    .mr-folder-card-header.mr-tutoria-header {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .mr-folder-card-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.35;
    }
    .mr-folder-card-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
      font-size: 0.75rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .mr-folder-card-footer {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      gap: 0.6rem;
      margin-top: auto;
      padding-top: 0.75rem;
      border-top: 1px dashed #e2e8f0;
      font-size: 0.8rem;
      color: #64748b;
      width: 100%;
      box-sizing: border-box;
    }
    .mr-folder-card-footer-left { display:flex; align-items:center; justify-content:flex-start; width:100%; min-width:0; }
    .mr-folder-card-count-chip { display:inline-flex; align-items:center; justify-content:center; gap:0.35rem; min-height:28px; height:28px; padding:0 0.75rem; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:9999px; font-size:0.76rem; font-weight:700; box-sizing:border-box; }
    .mr-folder-card-progress-box { display:flex; flex-direction:column; gap:0.2rem; min-width:85px; }
    .mr-folder-card-progress-label { font-size:0.72rem; font-weight:700; color:#166534; }
    .mr-folder-card-progress-track { width:100%; height:4px; background:#e2e8f0; border-radius:9999px; overflow:hidden; }
    .mr-folder-card-progress-bar { height:100%; background:#16a34a; border-radius:9999px; transition:width 0.3s ease; }
    .mr-folder-card-actions { display:flex; align-items:center; justify-content:flex-start; gap:0.5rem; width:100%; flex-wrap:wrap; box-sizing:border-box; }
    .mr-folder-card-btn-action { border:none; background:transparent; height:34px; min-height:34px; padding:0 0.75rem; border-radius:8px; font-size:0.78rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:0.35rem; flex:1 1 auto; box-sizing:border-box; line-height:1; transition:background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
    .mr-folder-card-btn-reset { color:#15803d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; } .mr-folder-card-btn-reset:hover { background:#fee2e2; color:#b91c1c; border-color:#fca5a5; }
    .mr-folder-card-btn-add { color:#ffffff; background:#16a34a; border:1px solid #16a34a; border-radius:8px; font-weight:800; box-shadow:0 1px 3px rgba(22,163,74,0.2); } .mr-folder-card-btn-add:hover { background:#15803d; border-color:#15803d; }
    .mr-folder-card-btn-subfolder { color:#166534; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; font-weight:700; box-shadow:0 1px 2px rgba(22,163,74,0.06); } .mr-folder-card-btn-subfolder:hover { background:#dcfce7; border-color:#22c55e; color:#14532d; }

    /* Toast Flutuante MedReview */
    .mr-toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: 420px;
      width: calc(100% - 32px);
    }
    .mr-toast {
      pointer-events: auto;
      background: #ffffff;
      border: 1.5px solid #86efac;
      border-left: 5px solid #16a34a;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
      border-radius: 12px;
      padding: 0.9rem 1.1rem;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      animation: mr-toast-in 0.25s ease-out;
      transition: opacity 0.25s ease, transform 0.25s ease;
      font-family: inherit;
    }
    .mr-toast.mr-toast-hiding {
      opacity: 0;
      transform: translateY(10px) scale(0.96);
    }
    .mr-toast-icon {
      font-size: 1.35rem;
      line-height: 1;
      flex-shrink: 0;
    }
    .mr-toast-body {
      flex: 1;
      min-width: 0;
    }
    .mr-toast-title {
      font-size: 0.92rem;
      font-weight: 800;
      color: #14532d;
      margin-bottom: 0.2rem;
      line-height: 1.3;
    }
    .mr-toast-path {
      font-size: 0.8rem;
      color: #475569;
      line-height: 1.35;
      word-break: break-word;
    }
    .mr-toast-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
      color: #94a3b8;
      line-height: 1;
      padding: 0 0.15rem;
      margin-left: 0.35rem;
      transition: color 0.15s ease;
    }
    .mr-toast-close:hover {
      color: #14532d;
    }
    @keyframes mr-toast-in {
      from {
        opacity: 0;
        transform: translateY(16px) scale(0.94);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .mr-subfolder-card { align-items: stretch !important; display: flex !important; flex-direction: column !important; width: 100% !important; box-sizing: border-box !important; }
    .mr-subfolder-card .mr-folder-card-header { width: 100% !important; display: flex !important; flex-direction: column !important; align-items: flex-start !important; gap: 0.55rem !important; margin-bottom: 0.85rem !important; }
    .mr-subfolder-card .mr-folder-card-footer { width: 100% !important; box-sizing: border-box !important; display: flex !important; flex-direction: column !important; align-items: stretch !important; justify-content: flex-start !important; gap: 0.6rem !important; margin-top: auto !important; padding-top: 0.75rem !important; border-top: 1px dashed #e2e8f0 !important; }
    .mr-subfolder-card .mr-folder-card-footer-left { display: flex !important; align-items: center !important; justify-content: flex-start !important; width: 100% !important; min-width: 0 !important; }
    .mr-subfolder-card .mr-folder-card-actions { display: flex !important; align-items: center !important; justify-content: flex-start !important; gap: 0.5rem !important; width: 100% !important; flex-wrap: wrap !important; margin-left: 0 !important; box-sizing: border-box !important; }
    .mr-subfolder-card:hover {
      border-color: #16a34a;
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(22, 163, 74, 0.14);
      background: #f0fdf4;
    }
    .mr-breadcrumb-bar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-bottom: 1.2rem;
      font-size: 0.88rem;
      background: #ffffff;
      padding: 0.55rem 0.9rem;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .mr-breadcrumb-item {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: #15803d;
      font-weight: 700;
      cursor: pointer;
      padding: 0.2rem 0.45rem;
      border-radius: 6px;
      transition: background 0.15s ease, color 0.15s ease;
      text-decoration: none;
    }
    .mr-breadcrumb-item:hover {
      background: #dcfce7;
      color: #14532d;
    }
    .mr-breadcrumb-sep {
      color: #94a3b8;
      font-size: 0.8rem;
      user-select: none;
    }
    .mr-breadcrumb-active {
      color: #0f172a;
      font-weight: 800;
      cursor: default;
      padding: 0.2rem 0.45rem;
    }
    .mr-btn-choice {
      display: flex;
      align-items: center;
      gap: 0.95rem;
      padding: 1rem 1.15rem;
      border-radius: 14px;
      cursor: pointer;
      text-align: left;
      transition: all 0.16s ease;
      width: 100%;
    }

    /* PASSO 4: GRID UNIFORME, HOVER CONSISTENTE E TIPOGRAFIA */
    .mr-tutoria-card > p,
    .mr-tutoria-card > span:not(.mr-folder-card-badge),
    .mr-tutoria-card > div:not(.mr-folder-card-header):not(.mr-folder-card-footer) {
      display: none !important;
    }
    .decks, .folders, .deck-grid, .folder-grid, .decks-container, .folders-container, .folder-cards-list, .deck-cards-list, .cards-grid, div:has(> .mr-folder-card), div:has(> .mr-tutoria-card), div:has(> .deck-card), div:has(> .folder-card) { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 1.15rem !important; align-items: stretch !important; }
    @media (max-width: 900px) {
      .decks, .folders, .deck-grid, .folder-grid, .decks-container, .folders-container, .folder-cards-list, .deck-cards-list, .cards-grid, div:has(> .mr-folder-card), div:has(> .mr-tutoria-card), div:has(> .deck-card), div:has(> .folder-card) { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)) !important; }
    }
    .mr-folder-card, .mr-tutoria-card, .deck-card, .folder-card, .mr-subfolder-card { position: relative !important; background: #ffffff !important; border-radius: 16px !important; border: 1.5px solid #d1fae5 !important; box-shadow: 0 3px 12px rgba(15,23,42,0.04) !important; cursor: pointer !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; height: 100% !important; box-sizing: border-box !important; padding: 1.15rem 0.95rem !important; transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease !important; }
    .mr-folder-card::before, .mr-tutoria-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #16a34a, #22c55e, #4ade80); border-top-left-radius: 15px; border-top-right-radius: 15px; }
    .mr-folder-card:hover, .mr-tutoria-card:hover, .deck-card:hover, .folder-card:hover, .mr-subfolder-card:hover { transform: translateY(-3px) !important; box-shadow: 0 8px 24px rgba(22,163,74,0.14) !important; border-color: #86efac !important; }
    .mr-folder-card-header { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 0.6rem !important; margin-bottom: 0.85rem !important; min-width: 0 !important; }
    .mr-tutoria-card .mr-folder-card-header, .mr-folder-card-header.mr-tutoria-header { display: flex !important; flex-direction: column !important; align-items: flex-start !important; justify-content: flex-start !important; gap: 0.55rem !important; margin-bottom: 0.85rem !important; width: 100% !important; min-width: 0 !important; padding-right: 44px !important; box-sizing: border-box !important; }
    .mr-tutoria-card .mr-folder-card-badge, .mr-folder-card-header.mr-tutoria-header .mr-folder-card-badge { align-self: flex-start !important; margin-bottom: 0.15rem !important; }
    .mr-tutoria-card .mr-folder-card-title-wrap, .mr-folder-card-header.mr-tutoria-header .mr-folder-card-title-wrap { width: 100% !important; }
    .mr-folder-card-title { font-size: 1.15rem !important; font-weight: 800 !important; color: #14532d !important; line-height: 1.3 !important; letter-spacing: -0.01em !important; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
    .mr-folder-card-badge { display: inline-flex !important; align-items: center !important; gap: 0.35rem !important; padding: 0.25rem 0.65rem !important; border-radius: 9999px !important; background: #f0fdf4 !important; color: #15803d !important; border: 1px solid #bbf7d0 !important; font-size: 0.75rem !important; font-weight: 700 !important; white-space: nowrap !important; flex-shrink: 0 !important; }
    .mr-folder-card-footer { display: flex !important; flex-direction: column !important; align-items: stretch !important; justify-content: flex-start !important; gap: 0.6rem !important; margin-top: auto !important; padding-top: 0.75rem !important; border-top: 1px dashed #e2e8f0 !important; font-size: 0.8rem !important; color: #64748b !important; width: 100% !important; box-sizing: border-box !important; }

    /* Slot do botão 🗑 no canto superior direito de qualquer cartão de pasta */
    .mr-tutoria-card .mr-folder-card-top-delete,
    .mr-folder-card .mr-folder-card-top-delete {
      position: absolute !important;
      top: 12px !important;
      right: 12px !important;
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
      min-height: 34px !important;
      box-sizing: border-box !important;
      z-index: 10 !important;
      color: #dc2626 !important;
      background: #fef2f2 !important;
      border: 1px solid #fecaca !important;
      border-radius: 8px !important;
      padding: 0 !important;
      font-size: 15px !important;
      cursor: pointer !important;
      line-height: 1 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 1px 3px rgba(220,38,38,0.12) !important;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease !important;
    }
    .mr-tutoria-card .mr-folder-card-top-delete:hover,
    .mr-folder-card .mr-folder-card-top-delete:hover {
      background: #fee2e2 !important;
      border-color: #f87171 !important;
    }

    /* Rodapé padronizado em 2 linhas equilibradas para cartões de pasta */
    .mr-tutoria-card .mr-folder-card-footer,
    .mr-folder-card .mr-folder-card-footer,
    .mr-subfolder-card .mr-folder-card-footer {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      justify-content: flex-start !important;
      gap: 0.6rem !important;
      margin-top: auto !important;
      padding-top: 0.75rem !important;
      border-top: 1px dashed #e2e8f0 !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .mr-tutoria-card .mr-folder-card-footer-left,
    .mr-folder-card .mr-folder-card-footer-left,
    .mr-subfolder-card .mr-folder-card-footer-left {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      min-width: 0 !important;
    }
    .mr-tutoria-card .mr-folder-card-count-chip,
    .mr-folder-card .mr-folder-card-count-chip,
    .mr-subfolder-card .mr-folder-card-count-chip {
      white-space: nowrap !important;
      flex-shrink: 0 !important;
      font-size: 0.76rem !important;
      min-height: 28px !important;
      height: 28px !important;
      padding: 0 0.75rem !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 9999px !important;
      font-weight: 700 !important;
      box-sizing: border-box !important;
    }
    .mr-tutoria-card .mr-folder-card-actions,
    .mr-folder-card .mr-folder-card-actions,
    .mr-subfolder-card .mr-folder-card-actions {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 0.5rem !important;
      width: 100% !important;
      flex-wrap: wrap !important;
      margin-left: 0 !important;
      box-sizing: border-box !important;
    }
    .mr-tutoria-card .mr-folder-card-actions .mr-folder-card-btn-action,
    .mr-folder-card .mr-folder-card-actions .mr-folder-card-btn-action,
    .mr-subfolder-card .mr-folder-card-actions .mr-folder-card-btn-action {
      white-space: nowrap !important;
      font-size: 0.78rem !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.35rem !important;
      height: 34px !important;
      min-height: 34px !important;
      padding: 0 0.75rem !important;
      border-radius: 8px !important;
      flex: 1 1 auto !important;
      box-sizing: border-box !important;
      line-height: 1 !important;
    }
    .mr-tutoria-card .mr-folder-card-actions .mr-folder-card-btn-delete,
    .mr-folder-card .mr-folder-card-actions .mr-folder-card-btn-delete,
    .mr-subfolder-card .mr-folder-card-actions .mr-folder-card-btn-delete,
    .mr-folder-card-btn-delete {
      flex: 0 0 34px !important;
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
      min-height: 34px !important;
      border-radius: 8px !important;
      padding: 0 !important;
      background: #fef2f2 !important;
      color: #dc2626 !important;
      border: 1px solid #fecaca !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      font-size: 15px !important;
      line-height: 1 !important;
      box-sizing: border-box !important;
    }
    .mr-tutoria-card .mr-folder-card-actions .mr-folder-card-btn-delete:hover,
    .mr-folder-card .mr-folder-card-actions .mr-folder-card-btn-delete:hover,
    .mr-subfolder-card .mr-folder-card-actions .mr-folder-card-btn-delete:hover,
    .mr-folder-card-btn-delete:hover {
      background: #fee2e2 !important;
      border-color: #f87171 !important;
      color: #b91c1c !important;
    }
  \`;
  document.head.appendChild(styleEl);

  // 2. Injeta Modal de Escolha no DOM: "Nova Subpasta" vs "Nova Carta"
  const modalChoiceHtml = \`
  <div id="create-choice-modal" style="display:none; position:fixed; inset:0; z-index:180; background:rgba(15, 23, 42, 0.55); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeCreateChoiceModal()">
    <div style="background:#ffffff; border-radius:18px; max-width:460px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.24); border:1.5px solid #bbf7d0; overflow:hidden; animation:mr-fade-up 0.2s ease-out;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.15rem 1.35rem; border-bottom:1px solid #d1fae5; background:#f0fdf4;">
        <h3 id="create-choice-title" style="margin:0; font-size:1.1rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.5rem;">
          <span>➕</span> O que você deseja criar?
        </h3>
        <button type="button" onclick="closeCreateChoiceModal()" style="background:none; border:none; font-size:1.45rem; cursor:pointer; color:#047857; line-height:1;" title="Fechar">&times;</button>
      </div>
      <div style="padding:1.35rem; display:flex; flex-direction:column; gap:0.9rem;">
        <p id="create-choice-desc" style="margin:0 0 0.4rem 0; font-size:0.88rem; color:#475569; line-height:1.45;">
          Escolha se deseja organizar seu conteúdo em uma nova pasta ou adicionar uma carta de revisão médica com FSRS-5:
        </p>

        <button type="button" class="mr-btn-choice" onclick="handleChoiceCreateFolder()" style="background:#f0fdf4; border:1.5px solid #86efac;" onmouseover="this.style.background='#dcfce7'; this.style.borderColor='#22c55e'" onmouseout="this.style.background='#f0fdf4'; this.style.borderColor='#86efac'">
          <span style="font-size:2rem; line-height:1;">📁</span>
          <div style="flex:1;">
            <div style="font-weight:800; font-size:0.98rem; color:#14532d;">Nova Subpasta</div>
            <div style="font-size:0.79rem; color:#15803d; margin-top:0.15rem;">Crie uma pasta aninhada para subdividir temas ou tópicos</div>
          </div>
          <span style="font-size:1.15rem; color:#15803d; font-weight:800;">➜</span>
        </button>

        <button type="button" class="mr-btn-choice" onclick="handleChoiceCreateCard()" style="background:#ffffff; border:1.5px solid #cbd5e1;" onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#16a34a'" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1'">
          <span style="font-size:2rem; line-height:1;">🗂️</span>
          <div style="flex:1;">
            <div style="font-weight:800; font-size:0.98rem; color:#0f172a;">Nova Carta de Revisão</div>
            <div style="font-size:0.79rem; color:#64748b; margin-top:0.15rem;">Flashcard com enunciado clínico, gabarito e FSRS-5</div>
          </div>
          <span style="font-size:1.15rem; color:#64748b; font-weight:800;">➜</span>
        </button>

        <button type="button" class="mr-btn-choice" onclick="handleChoiceImportCsv()" style="background:#f0fdf4; border:1.5px solid #86efac;" onmouseover="this.style.background='#dcfce7'; this.style.borderColor='#16a34a'" onmouseout="this.style.background='#f0fdf4'; this.style.borderColor='#86efac'">
          <span style="font-size:2rem; line-height:1;">📥</span>
          <div style="flex:1;">
            <div style="font-weight:800; font-size:0.98rem; color:#14532d;">Importar Flashcards via CSV</div>
            <div style="font-size:0.79rem; color:#15803d; margin-top:0.15rem;">Upload ou colar CSV do Adapta com suporte FSRS-5</div>
          </div>
          <span style="font-size:1.15rem; color:#15803d; font-weight:800;">➜</span>
        </button>
      </div>
    </div>
  </div>\`;
  document.body.insertAdjacentHTML('beforeend', modalChoiceHtml);

  // Injeta Modal de Seleção de Pasta/Destino para Importação
  const modalImportTargetSelectHtml = \`
  <div id="import-target-modal" style="display:none; position:fixed; inset:0; z-index:194; background:rgba(15, 23, 42, 0.6); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeImportTargetModal()">
    <div style="background:#ffffff; border-radius:18px; max-width:620px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.28); border:1.5px solid #86efac; overflow:hidden; animation:mr-fade-up 0.2s ease-out; max-height:90vh; display:flex; flex-direction:column;">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.15rem 1.4rem; border-bottom:1px solid #d1fae5; background:#f0fdf4;">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <span style="font-size:1.45rem;">📥</span>
          <div>
            <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:#14532d;">Importar Flashcards — Escolha a Pasta de Destino</h3>
            <div style="font-size:0.8rem; color:#15803d; margin-top:0.15rem;">Passo 1 de 2: Para qual pasta ou subpasta as cartas serão enviadas?</div>
          </div>
        </div>
        <button type="button" onclick="closeImportTargetModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#047857; line-height:1;" title="Fechar">&times;</button>
      </div>

      <!-- Info e Busca rápida -->
      <div style="padding:1rem 1.4rem 0.5rem 1.4rem; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; flex-direction:column; gap:0.6rem;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
          <span style="font-size:0.82rem; color:#475569; font-weight:600;">Selecione qualquer nível da árvore abaixo ou crie uma nova pasta:</span>
          <button type="button" onclick="openCreateFolderFromImportPicker()" style="background:#f0fdf4; color:#15803d; border:1px solid #86efac; padding:0.35rem 0.75rem; border-radius:7px; font-size:0.8rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:0.3rem;">
            ➕ Nova Pasta / Subpasta
          </button>
        </div>
        <input type="text" id="import-target-search" placeholder="🔍 Filtrar pastas por nome..." oninput="filterImportTree(this.value)" style="width:100%; box-sizing:border-box; padding:0.55rem 0.85rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.88rem; outline:none;" onfocus="this.style.borderColor='#16a34a'" onblur="this.style.borderColor='#cbd5e1'">
      </div>

      <!-- Lista / Árvore Hierárquica -->
      <div id="import-target-tree-container" style="padding:1.1rem 1.4rem; overflow-y:auto; flex:1; max-height:420px; display:flex; flex-direction:column; gap:0.4rem;">
        <!-- Preenchido dinamicamente via renderImportFolderTree() -->
      </div>

      <!-- Seleção Atual e Botão Continuar -->
      <div style="padding:1.1rem 1.4rem; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap;">
        <div style="font-size:0.86rem; color:#1e293b; display:flex; align-items:center; gap:0.4rem;">
          <span style="color:#64748b;">Pasta selecionada:</span>
          <span id="import-target-selected-name" style="font-weight:800; color:#15803d; background:#dcfce7; padding:0.25rem 0.65rem; border-radius:6px; border:1px solid #86efac;">Tutoria</span>
        </div>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <button type="button" onclick="closeImportTargetModal()" style="background:#e2e8f0; color:#334155; border:none; padding:0.55rem 1.1rem; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer;">
            Cancelar
          </button>
          <button type="button" id="import-target-proceed-btn" onclick="proceedFromTargetToCsvModal()" style="background:#16a34a; color:#ffffff; border:none; padding:0.55rem 1.35rem; border-radius:8px; font-weight:800; font-size:0.9rem; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 2px 8px rgba(22,163,74,0.25);">
            Continuar para o CSV ➜
          </button>
        </div>
      </div>
    </div>
  </div>\`;
  document.body.insertAdjacentHTML('beforeend', modalImportTargetSelectHtml);

  // Injeta Modal de Importação de Flashcards via CSV
  const modalCsvImportHtml = \`
  <div id="csv-import-modal" style="display:none; position:fixed; inset:0; z-index:195; background:rgba(15, 23, 42, 0.6); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeCsvImportModal()">    <div style="background:#ffffff; border-radius:18px; max-width:620px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.28); border:1.5px solid #86efac; overflow:hidden; animation:mr-fade-up 0.2s ease-out; max-height:90vh; display:flex; flex-direction:column;">
      <!-- Header do Modal -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.15rem 1.4rem; border-bottom:1px solid #d1fae5; background:#f0fdf4;">
        <div style="display:flex; align-items:center; gap:0.55rem;">
          <span style="font-size:1.4rem;">📥</span>
          <div>
            <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:#14532d;">Importar Flashcards via CSV</h3>
            <div id="csv-import-target-label" style="font-size:0.8rem; color:#15803d; margin-top:0.15rem; font-weight:600;">Destino: Pasta Atual</div>
          </div>
        </div>
        <button type="button" onclick="closeCsvImportModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#047857; line-height:1;" title="Fechar">&times;</button>
      </div>

      <!-- Abas de Entrada (Upload vs Colar) -->
      <div style="display:flex; border-bottom:1px solid #e2e8f0; background:#f8fafc; padding:0 1.4rem;">
        <button type="button" id="csv-tab-file" onclick="setCsvImportTab('file')" style="padding:0.75rem 1.1rem; border:none; background:transparent; font-weight:800; font-size:0.88rem; cursor:pointer; border-bottom:2.5px solid #16a34a; color:#15803d; display:inline-flex; align-items:center; gap:0.4rem;">
          📁 Arquivo .csv
        </button>
        <button type="button" id="csv-tab-text" onclick="setCsvImportTab('text')" style="padding:0.75rem 1.1rem; border:none; background:transparent; font-weight:700; font-size:0.88rem; cursor:pointer; border-bottom:2.5px solid transparent; color:#64748b; display:inline-flex; align-items:center; gap:0.4rem;">
          📝 Colar Texto CSV
        </button>
      </div>

      <!-- Conteúdo do Modal rolável -->
      <div style="padding:1.35rem 1.4rem; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:1rem;">
        <!-- Painel Tab Arquivo -->
        <div id="csv-panel-file">
          <label style="display:block; font-size:0.84rem; font-weight:700; color:#1e293b; margin-bottom:0.45rem;">
            Selecione o arquivo CSV do seu computador:
          </label>
          <div style="border:2px dashed #86efac; border-radius:12px; padding:1.3rem; text-align:center; background:#f0fdf4; cursor:pointer; transition:all 0.15s ease;" onclick="document.getElementById('csv-file-input').click()" ondragover="event.preventDefault(); this.style.borderColor='#16a34a'; this.style.background='#dcfce7';" ondragleave="this.style.borderColor='#86efac'; this.style.background='#f0fdf4';" ondrop="handleCsvDrop(event)">
            <input type="file" id="csv-file-input" accept=".csv,text/csv,text/plain" style="display:none;" onchange="handleCsvFileSelected(event)">
            <div style="font-size:2rem; margin-bottom:0.35rem;">📄</div>
            <div id="csv-file-name-display" style="font-weight:700; font-size:0.92rem; color:#14532d;">Clique para selecionar ou arraste o arquivo CSV</div>
            <div style="font-size:0.77rem; color:#15803d; margin-top:0.25rem;">Padrão UTF-8 com colunas: pasta, grupo, frente, verso, referencia</div>
          </div>
        </div>

        <!-- Painel Tab Texto -->
        <div id="csv-panel-text" style="display:none;">
          <label style="display:block; font-size:0.84rem; font-weight:700; color:#1e293b; margin-bottom:0.45rem;">
            Cole aqui o texto CSV completo (com cabeçalho):
          </label>
          <textarea id="csv-text-input" rows="7" placeholder="pasta,grupo,frente,verso,referencia&#10;&quot;Tutoria 10&quot;,&quot;Objetivo 1&quot;,&quot;Pergunta clínica?&quot;,&quot;Gabarito detalhado...&quot;,&quot;Moore; Netter&quot;" style="width:100%; box-sizing:border-box; font-family:monospace; font-size:0.82rem; padding:0.75rem; border:1.5px solid #cbd5e1; border-radius:10px; outline:none; resize:vertical;" oninput="handleCsvTextInput()"></textarea>
        </div>

        <!-- Informação sobre fidelidade & formato -->
        <div style="background:#f1f5f9; border-radius:10px; padding:0.75rem 0.9rem; font-size:0.8rem; color:#475569; line-height:1.45; border-left:3.5px solid #16a34a;">
          <div style="font-weight:700; color:#14532d; margin-bottom:0.15rem;">🔒 Fidelidade Total Garantida</div>
          <div>O enunciado e o gabarito serão preservados exatamente como constam no arquivo. Todas as cartas entram automaticamente no algoritmo <strong>FSRS-5</strong> (estado inicial "Novo").</div>
        </div>

        <!-- Área de Preview e Validação -->
        <div id="csv-preview-container" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.9rem 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span id="csv-preview-badge-valid" style="background:#dcfce7; color:#15803d; font-size:0.78rem; font-weight:800; padding:0.25rem 0.6rem; border-radius:6px; border:1px solid #86efac;">
                0 cartas válidas
              </span>
              <span id="csv-preview-badge-skipped" style="background:#fef3c7; color:#92400e; font-size:0.78rem; font-weight:700; padding:0.25rem 0.6rem; border-radius:6px; border:1px solid #fde68a;">
                0 vazias ignoradas
              </span>
              <span id="csv-preview-delim-info" style="font-size:0.75rem; color:#64748b; font-family:monospace;">
                Delimitador: ,
              </span>
            </div>
            <span id="csv-preview-sample-count" style="font-size:0.75rem; color:#64748b;">
              Amostra das primeiras cartas:
            </span>
          </div>

          <!-- Lista de cards de amostra -->
          <div id="csv-preview-cards-list" style="display:flex; flex-direction:column; gap:0.5rem; max-height:180px; overflow-y:auto; padding-right:0.2rem;"></div>
        </div>

        <!-- Mensagem de Erro -->
        <div id="csv-import-error" style="display:none; background:#fef2f2; border:1.5px solid #fca5a5; border-radius:10px; padding:0.8rem 1rem; color:#991b1b; font-size:0.84rem; line-height:1.45;">
          <strong>⚠️ Não foi possível processar o CSV:</strong>
          <div id="csv-import-error-msg" style="margin-top:0.25rem;"></div>
        </div>
      </div>

      <!-- Footer do Modal -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.1rem 1.4rem; border-top:1px solid #e2e8f0; background:#f8fafc; gap:0.6rem;">
        <button type="button" onclick="closeCsvImportModal()" style="background:#e2e8f0; color:#334155; border:none; padding:0.55rem 1.1rem; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer;">
          Cancelar
        </button>
        <button type="button" id="csv-import-submit-btn" onclick="executeCsvImport()" disabled style="background:#94a3b8; color:#ffffff; border:none; padding:0.55rem 1.4rem; border-radius:8px; font-weight:800; font-size:0.9rem; cursor:not-allowed; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <span>📥</span> Importar tudo
        </button>
      </div>
    </div>
  </div>\`;
  document.body.insertAdjacentHTML('beforeend', modalCsvImportHtml);

  // Injeta Modal de Criação de Subpasta
  const modalSubfolderHtml = \`
  <div id="subfolder-create-modal" style="display:none; position:fixed; inset:0; z-index:190; background:rgba(15, 23, 42, 0.55); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeSubfolderCreateModal()">
    <div style="background:#ffffff; border-radius:18px; max-width:480px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.24); border:1.5px solid #bbf7d0; overflow:hidden; animation:mr-fade-up 0.2s ease-out;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.15rem 1.35rem; border-bottom:1px solid #d1fae5; background:#f0fdf4;">
        <h3 id="subfolder-modal-title" style="margin:0; font-size:1.1rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.45rem;">
          <span>📁</span> Nova Subpasta
        </h3>
        <button type="button" onclick="closeSubfolderCreateModal()" style="background:none; border:none; font-size:1.45rem; cursor:pointer; color:#047857; line-height:1;" title="Fechar">&times;</button>
      </div>
      <form onsubmit="handleSubfolderSubmit(event)" style="padding:1.35rem; margin:0;">
        <div style="margin-bottom:1rem;">
          <label style="display:block; font-size:0.85rem; font-weight:700; color:#14532d; margin-bottom:0.4rem;">
            Nome da Subpasta *
          </label>
          <input type="text" id="subfolder-name-input" required placeholder="Ex.: Aterosclerose, Casos Clínicos, Farmacologia..." style="width:100%; box-sizing:border-box; padding:0.65rem 0.85rem; border:1.5px solid #bbf7d0; border-radius:9px; font-size:0.92rem; outline:none; transition:border-color 0.15s ease;" onfocus="this.style.borderColor='#16a34a'" onblur="this.style.borderColor='#bbf7d0'">
        </div>
        <div style="margin-bottom:1.3rem;">
          <label style="display:block; font-size:0.85rem; font-weight:700; color:#14532d; margin-bottom:0.4rem;">
            Descrição Breve (opcional)
          </label>
          <input type="text" id="subfolder-desc-input" placeholder="Ex.: Diretrizes e fluxogramas da tutoria" style="width:100%; box-sizing:border-box; padding:0.65rem 0.85rem; border:1.5px solid #bbf7d0; border-radius:9px; font-size:0.92rem; outline:none; transition:border-color 0.15s ease;" onfocus="this.style.borderColor='#16a34a'" onblur="this.style.borderColor='#bbf7d0'">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.6rem;">
          <button type="button" onclick="closeSubfolderCreateModal()" style="background:#f1f5f9; color:#475569; border:none; padding:0.55rem 1.1rem; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer;">Cancelar</button>
          <button type="submit" style="background:#16a34a; color:#ffffff; border:none; padding:0.55rem 1.3rem; border-radius:8px; font-weight:800; font-size:0.88rem; cursor:pointer;">Criar Subpasta</button>
        </div>
      </form>
    </div>
  </div>\`;
  document.body.insertAdjacentHTML('beforeend', modalSubfolderHtml);

  // Injeta Modal de Confirmação de Exclusão de Pasta
  const modalFolderDeleteHtml = \`
  <div id="mr-folder-delete-modal" style="display:none; position:fixed; inset:0; z-index:210; background:rgba(15, 23, 42, 0.55); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeFolderDeleteModal()">
    <div style="background:#ffffff; border-radius:18px; max-width:480px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.28); border:1.5px solid #fecaca; overflow:hidden; animation:mr-fade-up 0.2s ease-out;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.15rem 1.35rem; border-bottom:1px solid #fee2e2; background:#fef2f2;">
        <h3 id="mr-folder-delete-title" style="margin:0; font-size:1.15rem; font-weight:800; color:#991b1b; display:flex; align-items:center; gap:0.45rem;">
          <span>🗑</span> Excluir Pasta
        </h3>
        <button type="button" onclick="closeFolderDeleteModal()" style="background:none; border:none; font-size:1.45rem; cursor:pointer; color:#991b1b; line-height:1;" title="Fechar">&times;</button>
      </div>
      <div style="padding:1.35rem; margin:0;">
        <p style="margin:0 0 1.35rem 0; color:#334155; font-size:0.92rem; line-height:1.5; font-weight:500;">
          Excluir pasta? As subpastas serão removidas e os cartões serão preservados, migrando para o nível superior — o progresso FSRS-5 de cada carta é mantido.
        </p>
        <div style="display:flex; justify-content:flex-end; gap:0.6rem;">
          <button type="button" data-mr-folder-delete-cancel="1" onclick="closeFolderDeleteModal()" style="background:#f1f5f9; color:#475569; border:none; padding:0.55rem 1.15rem; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer;">Cancelar</button>
          <button type="button" id="mr-folder-delete-confirm-btn" data-mr-folder-delete-confirm="1" onclick="executeFolderDelete()" style="background:#dc2626; color:#ffffff; border:none; padding:0.55rem 1.35rem; border-radius:8px; font-weight:800; font-size:0.88rem; cursor:pointer; box-shadow:0 2px 6px rgba(220,38,38,0.25);">Confirmar</button>
        </div>
      </div>
    </div>
  </div>\`;
  document.body.insertAdjacentHTML('beforeend', modalFolderDeleteHtml);

  // Esc fecha modal de exclusão
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const delModal = document.getElementById('mr-folder-delete-modal');
      if (delModal && delModal.style.display !== 'none' && delModal.style.display !== '') {
        closeFolderDeleteModal();
      }
    }
  });

  // Funções de controle do modal de exclusão de pasta
  window.__pendingDeleteFolderId = null;

  window.openFolderDeleteModal = function(folderId, isExplicitSubfolder) {
    if (!folderId) return;
    const sfStore = getSubfolderStore();
    const isSub = isExplicitSubfolder || !!(sfStore && sfStore[folderId]);
    if (isSub) {
      if (typeof window.openSubfolderDeleteModal === 'function') {
        window.openSubfolderDeleteModal(folderId);
      }
      return;
    }
    window.__pendingDeleteFolderId = folderId;
    const modal = document.getElementById('mr-folder-delete-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeFolderDeleteModal = function() {
    window.__pendingDeleteFolderId = null;
    const modal = document.getElementById('mr-folder-delete-modal');
    if (modal) modal.style.display = 'none';
  };

  // Injeta Modal de Confirmação de Exclusão de SUBPASTA (Exclusão em cascata restrita)
  const modalSubfolderDeleteHtml = \`
  <div id="mr-subfolder-delete-modal" style="display:none; position:fixed; inset:0; z-index:210; background:rgba(15, 23, 42, 0.55); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeSubfolderDeleteModal()">
    <div style="background:#ffffff; border-radius:18px; max-width:480px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.28); border:1.5px solid #fecaca; overflow:hidden; animation:mr-fade-up 0.2s ease-out;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.15rem 1.35rem; border-bottom:1px solid #fee2e2; background:#fef2f2;">
        <h3 id="mr-subfolder-delete-title" style="margin:0; font-size:1.15rem; font-weight:800; color:#991b1b; display:flex; align-items:center; gap:0.45rem;">
          <span>🗑</span> Excluir Subpasta
        </h3>
        <button type="button" onclick="closeSubfolderDeleteModal()" style="background:none; border:none; font-size:1.45rem; cursor:pointer; color:#991b1b; line-height:1;" title="Fechar">&times;</button>
      </div>
      <div style="padding:1.35rem; margin:0;">
        <p style="margin:0 0 1.35rem 0; color:#334155; font-size:0.92rem; line-height:1.5; font-weight:500;">
          Excluir subpasta? TODAS as cartas desta subpasta (incluindo as de suas subpastas) serão excluídas permanentemente, junto com seu progresso FSRS-5. As cartas das outras pastas e subpastas NÃO são afetadas.
        </p>
        <div style="display:flex; justify-content:flex-end; gap:0.6rem;">
          <button type="button" data-mr-sub-delete-cancel="1" onclick="closeSubfolderDeleteModal()" style="background:#f1f5f9; color:#475569; border:none; padding:0.55rem 1.15rem; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer;">Cancelar</button>
          <button type="button" id="mr-subfolder-delete-confirm-btn" data-mr-sub-delete-confirm="1" onclick="executeSubfolderDelete()" style="background:#dc2626; color:#ffffff; border:none; padding:0.55rem 1.35rem; border-radius:8px; font-weight:800; font-size:0.88rem; cursor:pointer; box-shadow:0 2px 6px rgba(220,38,38,0.25);">Confirmar</button>
        </div>
      </div>
    </div>
  </div>\`;
  document.body.insertAdjacentHTML('beforeend', modalSubfolderDeleteHtml);

  // Esc fecha modal de exclusão de subpasta também
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const subDelModal = document.getElementById('mr-subfolder-delete-modal');
      if (subDelModal && subDelModal.style.display !== 'none' && subDelModal.style.display !== '') {
        closeSubfolderDeleteModal();
      }
    }
  });

  // Listener permanente em document com capture:true para delegação robusta dos modais de exclusão
  document.addEventListener('click', function(e) {
    const target = e.target;
    if (!target || !(target instanceof Element)) return;

    const folderDeleteTrigger = target.closest('[data-mr-folder-delete], .mr-folder-card-top-delete');
    if (folderDeleteTrigger) {
      const card = folderDeleteTrigger.closest('.mr-tutoria-card, .mr-folder-card, [data-folder-id], [data-deck-id]');
      // Se for subpasta explicitada, não intercepta aqui pois tem handler próprio
      if (!card || !card.classList.contains('mr-subfolder-card')) {
        e.preventDefault();
        e.stopPropagation();
        const fId = folderDeleteTrigger.getAttribute('data-folder-id') ||
                    (card ? (card.getAttribute('data-folder-id') || card.getAttribute('data-deck-id')) : null);
        const fTitle = folderDeleteTrigger.getAttribute('data-folder-title') ||
                       (card ? (card.querySelector('.mr-folder-card-title, .title, strong')?.textContent || '') : '');
        if (fId && typeof window.openFolderDeleteModal === 'function') {
          window.openFolderDeleteModal(fId, fTitle);
          return;
        }
      }
    }

    const subConfirm = target.closest('[data-mr-sub-delete-confirm]');
    if (subConfirm) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.executeSubfolderDelete === 'function') {
        window.executeSubfolderDelete();
      }
      return;
    }

    const subCancel = target.closest('[data-mr-sub-delete-cancel]');
    if (subCancel) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.closeSubfolderDeleteModal === 'function') {
        window.closeSubfolderDeleteModal();
      }
      return;
    }

    const folderConfirm = target.closest('[data-mr-folder-delete-confirm]');
    if (folderConfirm) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.executeFolderDelete === 'function') {
        window.executeFolderDelete();
      }
      return;
    }

    const folderCancel = target.closest('[data-mr-folder-delete-cancel]');
    if (folderCancel) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.closeFolderDeleteModal === 'function') {
        window.closeFolderDeleteModal();
      }
      return;
    }
  }, true);

  window.__pendingDeleteSubfolderId = null;

  window.openSubfolderDeleteModal = function(subfolderId) {
    if (!subfolderId) return;
    window.__pendingDeleteSubfolderId = subfolderId;
    const modal = document.getElementById('mr-subfolder-delete-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeSubfolderDeleteModal = function() {
    window.__pendingDeleteSubfolderId = null;
    const modal = document.getElementById('mr-subfolder-delete-modal');
    if (modal) modal.style.display = 'none';
  };

  window.executeSubfolderDelete = function() {
    const subfolderId = window.__pendingDeleteSubfolderId;
    if (!subfolderId) {
      closeSubfolderDeleteModal();
      return;
    }

    // 1. Resolve parentFolderId ANTES de mutar
    const sfStore = getSubfolderStore();
    const targetSf = sfStore ? sfStore[subfolderId] : null;
    const parentFolderId = (targetSf && (targetSf.parentId || targetSf.parent)) || window.__mrActivePickerParentId || null;

    // 2. Coletar esta subpasta e todas as descendentes recursivamente
    const subsToRemove = new Set();
    function collectDescendants(pId) {
      Object.values(sfStore || {}).forEach(s => {
        if (s && (s.parentId === pId || s.parent === pId)) {
          if (!subsToRemove.has(s.id)) {
            subsToRemove.add(s.id);
            collectDescendants(s.id);
          }
        }
      });
    }
    subsToRemove.add(subfolderId);
    collectDescendants(subfolderId);

    // 3. Coleta cartas em cascata (subpasta + descendentes recursivos)
    const cardsToDelete = [];
    const seenCardIds = new Set();

    subsToRemove.forEach(sid => {
      const sCards = typeof getFolderAllCards === 'function' ? getFolderAllCards(sid) : [];
      sCards.forEach(c => {
        if (c && c.id && !seenCardIds.has(c.id)) {
          seenCardIds.add(c.id);
          cardsToDelete.push(c);
        }
      });
      if (sfStore && sfStore[sid] && Array.isArray(sfStore[sid].cards)) {
        sfStore[sid].cards.forEach(c => {
          if (c && c.id && !seenCardIds.has(c.id)) {
            seenCardIds.add(c.id);
            cardsToDelete.push(c);
          }
        });
      }
    });

    const deletedCount = cardsToDelete.length;
    const cardIdsToDelete = seenCardIds;

    // 4. Remover permanentemente as subpastas e suas cartas de localStorage via persistSubfolders()
    subsToRemove.forEach(sid => {
      if (sfStore && sfStore[sid]) {
        if (Array.isArray(sfStore[sid].cards)) {
          sfStore[sid].cards = [];
        }
        delete sfStore[sid];
      }
      if (state && state.subfolders && state.subfolders[sid]) {
        delete state.subfolders[sid];
      }
    });

    // Garante que nenhuma subpasta remanescente retenha cartas apagadas
    if (sfStore) {
      Object.values(sfStore).forEach(s => {
        if (s && Array.isArray(s.cards)) {
          s.cards = s.cards.filter(c => c && !cardIdsToDelete.has(c.id));
        }
      });
    }

    try {
      localStorage.setItem('medreview_subfolders', JSON.stringify(sfStore || {}));
    } catch { /* intentionally ignored */ }

    persistSubfolders();

    // 5. Limpa histórico de avaliações do FSRS-5 das cartas excluídas
    if (cardIdsToDelete.size > 0) {
      try {
        const rawHistory = localStorage.getItem('medreview_eval_history');
        if (rawHistory) {
          const parsed = JSON.parse(rawHistory);
          if (Array.isArray(parsed)) {
            const updated = parsed.filter(h => h && !cardIdsToDelete.has(h.cardId));
            localStorage.setItem('medreview_eval_history', JSON.stringify(updated));
          }
        }
      } catch { /* intentionally ignored */ }
    }

    if (typeof saveState === 'function') {
      saveState();
    }

    // 6. Fechar modal
    closeSubfolderDeleteModal();

    // 7. Toast: "Subpasta excluída. N cartas removidas permanentemente."
    const toastMsg = 'Subpasta excluída. ' + deletedCount + ' cartas removidas permanentemente.';
    if (typeof showMedReviewToast === 'function') {
      showMedReviewToast(toastMsg, '', '🗑');
    } else if (typeof showToast === 'function') {
      showToast(toastMsg);
    } else {
      alert(toastMsg);
    }

    // 8. Chamar renderSubfoldersPicker(parentFolderId) IMEDIATAMENTE (síncrono, sem depender de timer)
    const currentSubWrapper = document.getElementById('mr-subfolder-wrapper');
    const targetParent = parentFolderId || window.__mrActivePickerParentId || (currentSubWrapper ? currentSubWrapper.getAttribute('data-active-picker-parent') : null);

    if (targetParent) {
      if (typeof renderSubfoldersPicker === 'function') {
        renderSubfoldersPicker(targetParent);
      } else if (typeof window.renderSubfoldersPicker === 'function') {
        window.renderSubfoldersPicker(targetParent);
      } else if (typeof window.navigateTo === 'function') {
        window.navigateTo(targetParent);
      } else if (typeof navigateTo === 'function') {
        navigateTo(targetParent);
      }
    } else if (typeof renderRoute === 'function') {
      renderRoute();
    }

    // Rede de segurança com rAF + 120ms + 300ms de enhanceViews
    requestAnimationFrame(() => {
      enhanceViews();
      setTimeout(enhanceViews, 120);
      setTimeout(enhanceViews, 300);
    });
  };

  window.executeFolderDelete = function() {
    const folderId = window.__pendingDeleteFolderId;
    if (!folderId) {
      closeFolderDeleteModal();
      return;
    }

    const info = resolveFolderInfo(folderId);

    // 1. Coletar todas as cartas da pasta e de suas subpastas
    const cardsToMigrate = typeof getFolderAllCards === 'function' ? getFolderAllCards(folderId) : [];

    // Fallback se getFolderAllCards retornou vazio mas info.cards tem itens
    if (cardsToMigrate.length === 0 && info && Array.isArray(info.cards) && info.cards.length > 0) {
      info.cards.forEach(c => { if (c && c.id) cardsToMigrate.push(c); });
    }

    // 2. Determinar destino: nível superior (parent) ou container raiz correspondente
    let targetParentId = info ? info.parent : null;
    let targetCardsArray = null;
    let targetDisplayName = 'Nível Superior';

    if (targetParentId) {
      const pInfo = resolveFolderInfo(targetParentId);
      if (pInfo) {
        targetDisplayName = pInfo.name || targetParentId;
      }
    }

    // Localiza array de cartas de destino
    if (targetParentId === 'tutoria') {
      if (!state.tutoria_highlight) state.tutoria_highlight = { cards: [] };
      if (!Array.isArray(state.tutoria_highlight.cards)) state.tutoria_highlight.cards = [];
      targetCardsArray = state.tutoria_highlight.cards;
      targetDisplayName = 'Tutoria';
    } else if (targetParentId === 'provas') {
      if (!state.provas) state.provas = {};
      const provaKeys = Object.keys(state.provas);
      if (provaKeys.length > 0) {
        const firstKey = provaKeys[0];
        if (!Array.isArray(state.provas[firstKey].cards)) state.provas[firstKey].cards = [];
        targetCardsArray = state.provas[firstKey].cards;
        targetDisplayName = state.provas[firstKey].name || state.provas[firstKey].title || 'Provas';
      } else {
        if (!state.custom_prova_folders) state.custom_prova_folders = {};
        if (!state.custom_prova_folders['provas_geral']) {
          state.custom_prova_folders['provas_geral'] = { name: 'Provas Geral', cards: [], parent: 'provas' };
        }
        targetCardsArray = state.custom_prova_folders['provas_geral'].cards;
        targetDisplayName = 'Provas Geral';
      }
    } else if (targetParentId && state.tutorias_numbered && state.tutorias_numbered[targetParentId]) {
      if (!Array.isArray(state.tutorias_numbered[targetParentId].cards)) state.tutorias_numbered[targetParentId].cards = [];
      targetCardsArray = state.tutorias_numbered[targetParentId].cards;
    } else if (targetParentId && state.custom_tutoria_folders && state.custom_tutoria_folders[targetParentId]) {
      if (!Array.isArray(state.custom_tutoria_folders[targetParentId].cards)) state.custom_tutoria_folders[targetParentId].cards = [];
      targetCardsArray = state.custom_tutoria_folders[targetParentId].cards;
    } else if (targetParentId && state.custom_prova_folders && state.custom_prova_folders[targetParentId]) {
      if (!Array.isArray(state.custom_prova_folders[targetParentId].cards)) state.custom_prova_folders[targetParentId].cards = [];
      targetCardsArray = state.custom_prova_folders[targetParentId].cards;
    } else if (targetParentId && state.custom_root_folders && state.custom_root_folders[targetParentId]) {
      if (!Array.isArray(state.custom_root_folders[targetParentId].cards)) state.custom_root_folders[targetParentId].cards = [];
      targetCardsArray = state.custom_root_folders[targetParentId].cards;
    } else if (targetParentId && state.provas && state.provas[targetParentId]) {
      if (!Array.isArray(state.provas[targetParentId].cards)) state.provas[targetParentId].cards = [];
      targetCardsArray = state.provas[targetParentId].cards;
    } else {
      const sfStore = getSubfolderStore();
      if (targetParentId && sfStore[targetParentId]) {
        if (!Array.isArray(sfStore[targetParentId].cards)) sfStore[targetParentId].cards = [];
        targetCardsArray = sfStore[targetParentId].cards;
      }
    }

    // Se ainda não encontrou destino (ou não tinha parent), envia para o container raiz correspondente ao tipo
    if (!targetCardsArray) {
      const isProva = (folderId.toLowerCase().includes('prova') || (info && (info.type === 'prova_item' || info.parent === 'provas')));
      if (isProva) {
        if (state.provas && Object.keys(state.provas).length > 0) {
          const firstKey = Object.keys(state.provas)[0];
          if (!Array.isArray(state.provas[firstKey].cards)) state.provas[firstKey].cards = [];
          targetCardsArray = state.provas[firstKey].cards;
          targetDisplayName = state.provas[firstKey].name || state.provas[firstKey].title || 'Provas';
          targetParentId = firstKey;
        } else {
          if (!state.custom_prova_folders) state.custom_prova_folders = {};
          if (!state.custom_prova_folders['provas_geral']) {
            state.custom_prova_folders['provas_geral'] = { name: 'Provas Geral', cards: [], parent: 'provas' };
          }
          targetCardsArray = state.custom_prova_folders['provas_geral'].cards;
          targetDisplayName = 'Provas Geral';
          targetParentId = 'provas_geral';
        }
      } else {
        if (!state.tutoria_highlight) state.tutoria_highlight = { cards: [] };
        if (!Array.isArray(state.tutoria_highlight.cards)) state.tutoria_highlight.cards = [];
        targetCardsArray = state.tutoria_highlight.cards;
        targetDisplayName = 'Tutoria';
        targetParentId = 'tutoria';
      }
    }

    // 3. Migrar cada carta para o nível superior com PRESERVAÇÃO TOTAL de FSRS-5
    const existingTargetCardIds = new Set(targetCardsArray.map(c => c && c.id).filter(Boolean));
    let migratedCount = 0;

    cardsToMigrate.forEach(c => {
      if (!c || !c.id) return;
      c.containerId = targetParentId;
      c.folderTitle = targetDisplayName;
      if (!existingTargetCardIds.has(c.id)) {
        targetCardsArray.push(c);
        existingTargetCardIds.add(c.id);
        migratedCount++;
      } else {
        migratedCount++;
      }
    });

    // 4. Remover do store de subpastas as subpastas da pasta e seus descendentes
    const sfStore = getSubfolderStore();
    const subsToRemove = new Set();

    function collectDescendantSubfolders(parentId) {
      Object.values(sfStore).forEach(s => {
        if (s && (s.parentId === parentId || s.parent === parentId)) {
          if (!subsToRemove.has(s.id)) {
            subsToRemove.add(s.id);
            collectDescendantSubfolders(s.id);
          }
        }
      });
    }

    collectDescendantSubfolders(folderId);
    subsToRemove.add(folderId);

    subsToRemove.forEach(sid => {
      if (sfStore[sid]) {
        delete sfStore[sid];
      }
      if (state && state.subfolders && state.subfolders[sid]) {
        delete state.subfolders[sid];
      }
    });
    persistSubfolders();

    // 5. Remover pasta do registro correspondente no state
    if (state.custom_tutoria_folders && state.custom_tutoria_folders[folderId]) {
      delete state.custom_tutoria_folders[folderId];
    }
    if (state.custom_prova_folders && state.custom_prova_folders[folderId]) {
      delete state.custom_prova_folders[folderId];
    }
    if (state.custom_root_folders && state.custom_root_folders[folderId]) {
      delete state.custom_root_folders[folderId];
    }
    if (state.tutorias_numbered && state.tutorias_numbered[folderId]) {
      delete state.tutorias_numbered[folderId];
    }
    if (state.provas && state.provas[folderId]) {
      delete state.provas[folderId];
    }

    // 6. Salvar estado
    if (typeof saveState === 'function') {
      saveState();
    }

    // Fechar modal
    closeFolderDeleteModal();

    // 7. Toast no padrão do app: "Pasta excluída. N cartas migradas para [Destino]."
    const toastMsg = 'Pasta excluída. ' + migratedCount + ' cartas migradas para ' + targetDisplayName + '.';
    if (typeof showMedReviewToast === 'function') {
      showMedReviewToast(toastMsg, '', '🗑');
    } else if (typeof showToast === 'function') {
      showToast(toastMsg);
    } else {
      alert(toastMsg);
    }

    // 8. Re-render seguro: requestAnimationFrame + setTimeout(enhanceViews,120) + setTimeout(enhanceViews,300)
    const currentSubWrapper = document.getElementById('mr-subfolder-wrapper');
    if (currentSubWrapper && currentSubWrapper.style.display !== 'none') {
      if (typeof window.navigateTo === 'function') {
        window.navigateTo(targetParentId || 'home');
      } else if (typeof navigateTo === 'function') {
        navigateTo(targetParentId || 'home');
      }
    } else if (typeof renderRoute === 'function') {
      renderRoute();
    }

    requestAnimationFrame(() => {
      enhanceViews();
      setTimeout(enhanceViews, 120);
      setTimeout(enhanceViews, 300);
    });
  };

  // Injeta Modal de Estatísticas Gerais Globais
  const modalGlobalStatsHtml = \`
  <div id="global-stats-modal" style="display:none; position:fixed; inset:0; z-index:196; background:rgba(15, 23, 42, 0.6); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeGlobalStatsModal()">
    <div style="background:#ffffff; border-radius:18px; max-width:760px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.28); border:1.5px solid #86efac; overflow:hidden; animation:mr-fade-up 0.2s ease-out; max-height:90vh; display:flex; flex-direction:column;">
      <!-- Header do Modal -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding:1.15rem 1.4rem; border-bottom:1px solid #d1fae5; background:#f0fdf4;">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <span style="font-size:1.45rem;">📊</span>
          <div>
            <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:#14532d;">📊 Estatísticas Gerais do MedReview</h3>
            <div style="font-size:0.79rem; color:#15803d; margin-top:0.15rem;">Visão consolidada de todas as cartas e pastas com algoritmo FSRS-5</div>
          </div>
        </div>
        <button type="button" onclick="closeGlobalStatsModal()" style="background:none; border:none; font-size:1.55rem; cursor:pointer; color:#047857; line-height:1;" title="Fechar">&times;</button>
      </div>

      <!-- Conteúdo das Estatísticas Globais -->
      <div id="global-stats-content" style="padding:1.35rem 1.4rem; overflow-y:auto; flex:1;"></div>

      <!-- Footer do Modal -->
      <div style="display:flex; align-items:center; justify-content:flex-end; padding:0.9rem 1.4rem; border-top:1px solid #e2e8f0; background:#f8fafc;">
        <button type="button" onclick="closeGlobalStatsModal()" style="background:#16a34a; color:#ffffff; border:none; padding:0.5rem 1.3rem; border-radius:8px; font-weight:800; font-size:0.88rem; cursor:pointer;">
          Fechar
        </button>
      </div>
    </div>
  </div>\`;
  document.body.insertAdjacentHTML('beforeend', modalGlobalStatsHtml);

  // 3. Estrutura de dados para subpastas no state
  function getSubfolderStore() {
    let localData = null;
    try {
      const raw = localStorage.getItem('medreview_subfolders');
      if (raw) localData = JSON.parse(raw);
    } catch { /* intentionally ignored */ }

    if (!state.subfolders) {
      state.subfolders = (localData && typeof localData === 'object' && !Array.isArray(localData)) ? localData : {};
    }
    return state.subfolders;
  }

  function persistSubfolders() {
    try {
      const sf = (state && state.subfolders) ? state.subfolders : getSubfolderStore();
      localStorage.setItem('medreview_subfolders', JSON.stringify(sf));
    } catch { /* intentionally ignored */ }
  }

  // 4. Resolvedor centralizado de informações de pasta
  window.resolveFolderInfo = function(targetId) {
    if (!targetId) return null;

    // Tutoria raiz
    if (targetId === 'tutoria') {
      return {
        id: 'tutoria',
        name: 'Tutoria',
        parent: null,
        cards: (state.tutoria_highlight && state.tutoria_highlight.cards) || [],
        isRoot: true,
        type: 'tutoria'
      };
    }
    // Provas raiz
    if (targetId === 'provas') {
      return {
        id: 'provas',
        name: 'Prova de Módulo',
        parent: null,
        cards: [],
        isRoot: true,
        type: 'provas'
      };
    }
    // Tutorias numeradas
    if (state.tutorias_numbered && state.tutorias_numbered[targetId]) {
      const obj = state.tutorias_numbered[targetId];
      return {
        id: targetId,
        name: obj.title || obj.name || targetId.replace('_', ' ').toUpperCase(),
        parent: 'tutoria',
        cards: obj.cards || [],
        raw: obj,
        type: 'tutoria_item'
      };
    }
    // Provas de módulo (ex: cardiorrespiratorio, urogenital, etc.)
    if (state.provas && state.provas[targetId]) {
      const obj = state.provas[targetId];
      return {
        id: targetId,
        name: obj.title || obj.name || targetId,
        parent: 'provas',
        cards: obj.cards || [],
        raw: obj,
        type: 'prova_item'
      };
    }
    // custom_tutoria_folders
    if (state.custom_tutoria_folders && state.custom_tutoria_folders[targetId]) {
      const obj = state.custom_tutoria_folders[targetId];
      return {
        id: targetId,
        name: obj.name || obj.title || 'Pasta',
        parent: obj.parent || 'tutoria',
        cards: obj.cards || [],
        raw: obj,
        type: 'custom'
      };
    }
    // custom_prova_folders
    if (state.custom_prova_folders && state.custom_prova_folders[targetId]) {
      const obj = state.custom_prova_folders[targetId];
      return {
        id: targetId,
        name: obj.name || obj.title || 'Pasta',
        parent: obj.parent || 'provas',
        cards: obj.cards || [],
        raw: obj,
        type: 'custom'
      };
    }
    // custom_root_folders
    if (state.custom_root_folders && state.custom_root_folders[targetId]) {
      const obj = state.custom_root_folders[targetId];
      return {
        id: targetId,
        name: obj.name || obj.title || 'Pasta',
        parent: null,
        cards: obj.cards || [],
        raw: obj,
        type: 'custom'
      };
    }
    // Subpastas hierárquicas criadas
    const sfStore = getSubfolderStore();
    if (sfStore[targetId]) {
      const obj = sfStore[targetId];
      return {
        id: targetId,
        name: obj.name || obj.title || 'Subpasta',
        parent: obj.parentId || obj.parent || null,
        cards: obj.cards || [],
        raw: obj,
        type: 'subfolder'
      };
    }

    return null;
  };

  // 5. Retorna todas as subpastas cujo pai seja parentId
  window.getSubfoldersOf = function(parentId) {
    const res = [];
    const sfStore = getSubfolderStore();
    Object.values(sfStore).forEach(f => {
      if (f && (f.parentId === parentId || f.parent === parentId)) {
        res.push(f);
      }
    });
    return res;
  };

  // 6. Cadeia de breadcrumbs até a raiz
  window.getBreadcrumbChain = function(targetId) {
    const chain = [];
    let cur = targetId;
    let safety = 0;
    while (cur && safety < 15) {
      safety++;
      const info = resolveFolderInfo(cur);
      if (!info) break;
      chain.unshift({ id: info.id, name: info.name });
      cur = info.parent;
    }
    return chain;
  };

  // Contexto ativo
  window.__activeFolderContext = null;

  // 7. Modal de Escolha (Criar Pasta vs Criar Carta)
  const realOpenCreateChoice = function(folderId) {
    window.__activeFolderContext = folderId || (typeof currentFolderContext === 'function' ? currentFolderContext() : null);
    const info = resolveFolderInfo(window.__activeFolderContext);
    const folderName = info ? info.name : 'Pasta Atual';

    const tEl = document.getElementById('create-choice-title');
    if (tEl) tEl.innerHTML = '<span>➕</span> Criar em <strong>' + escapeHtml(folderName) + '</strong>';

    const dEl = document.getElementById('create-choice-desc');
    if (dEl) dEl.textContent = 'Você está em "' + folderName + '". Escolha o que deseja adicionar:';

    const modal = document.getElementById('create-choice-modal');
    if (modal) modal.style.display = 'flex';
  };
  window.__realOpenCreateChoice = realOpenCreateChoice;
  window.openCreateChoice = realOpenCreateChoice;
  if (typeof window.__pendingCreateChoiceCtx !== 'undefined') {
    const pendingCtx = window.__pendingCreateChoiceCtx;
    delete window.__pendingCreateChoiceCtx;
    setTimeout(() => realOpenCreateChoice(pendingCtx), 0);
  }

  window.closeCreateChoiceModal = function() {
    const modal = document.getElementById('create-choice-modal');
    if (modal) modal.style.display = 'none';
  };

  window.handleChoiceCreateFolder = function() {
    closeCreateChoiceModal();
    openSubfolderCreateModal(window.__activeFolderContext);
  };

  window.handleChoiceCreateCard = function() {
    closeCreateChoiceModal();
    const ctx = window.__activeFolderContext;
    if (typeof openNewCardModal === 'function') {
      openNewCardModal(ctx);
    }
  };

  window.handleChoiceImportCsv = function() {
    closeCreateChoiceModal();
    openCsvImportModal(window.__activeFolderContext);
  };

  // ========================================================
  // Lógica do Modal e Parser de Importação CSV
  // ========================================================
  window.__activeCsvCards = [];
  window.__activeCsvTab = 'file';

  window.decodeHtmlEntities = function(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\\d+);/g, function(_, dec) {
        try { return String.fromCharCode(parseInt(dec, 10)); } catch(e) { return _; }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, function(_, hex) {
        try { return String.fromCharCode(parseInt(hex, 16)); } catch(e) { return _; }
      });
  };

  window.detectCsvDelimiter = function(text) {
    let inQuotes = false;
    let commas = 0;
    let semicolons = 0;
    const max = Math.min(text.length, 4096);
    for (let i = 0; i < max; i++) {
      const c = text[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (c === ',') commas++;
        else if (c === ';') semicolons++;
        else if (c === '\\n' && (commas > 0 || semicolons > 0)) break;
      }
    }
    return semicolons > commas ? ';' : ',';
  };

  window.parseCsvRows = function(text, delim) {
    const rows = [];
    let currentRow = [];
    let cell = '';
    let inQuotes = false;
    const len = text.length;

    for (let i = 0; i < len; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cell += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === delim) {
          currentRow.push(cell);
          cell = '';
        } else if (c === '\\r') {
          if (i + 1 < len && text[i + 1] === '\\n') i++;
          currentRow.push(cell);
          rows.push(currentRow);
          currentRow = [];
          cell = '';
        } else if (c === '\\n') {
          currentRow.push(cell);
          rows.push(currentRow);
          currentRow = [];
          cell = '';
        } else {
          cell += c;
        }
      }
    }
    if (cell.length > 0 || currentRow.length > 0) {
      currentRow.push(cell);
      rows.push(currentRow);
    }
    return rows;
  };

  window.parseCsvInputText = function(text) {
    if (!text || !text.trim()) {
      return { cards: [], validCount: 0, skippedCount: 0, error: 'O conteúdo CSV está vazio.' };
    }
    const delim = detectCsvDelimiter(text);
    const rows = parseCsvRows(text, delim);

    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(c => c && c.trim().length > 0)) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      return { cards: [], validCount: 0, skippedCount: 0, error: 'Nenhum cabeçalho encontrado.' };
    }

    const rawHeaders = rows[headerIdx];
    const normHeaders = rawHeaders.map(h => (h || '').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]/g, ''));

    let frenteIdx = -1;
    let versoIdx = -1;
    let grupoIdx = -1;
    let refIdx = -1;
    let pastaIdx = -1;

    normHeaders.forEach((nh, idx) => {
      if (nh === 'frente' || nh === 'pergunta' || nh === 'question' || nh === 'front') frenteIdx = idx;
      else if (nh === 'verso' || nh === 'resposta' || nh === 'answer' || nh === 'back' || nh === 'gabarito') versoIdx = idx;
      else if (nh === 'grupo' || nh === 'group' || nh === 'objetivo' || nh === 'topico') grupoIdx = idx;
      else if (nh === 'referencia' || nh === 'ref' || nh === 'referencias' || nh === 'fontes') refIdx = idx;
      else if (nh === 'pasta' || nh === 'folder' || nh === 'modulo' || nh === 'deck') pastaIdx = idx;
    });

    if (frenteIdx === -1 || versoIdx === -1) {
      return {
        cards: [],
        validCount: 0,
        skippedCount: 0,
        delimiter: delim,
        error: 'O CSV precisa ter as colunas: pasta, grupo, frente, verso, referencia'
      };
    }

    const validCards = [];
    let skippedCount = 0;
    const dataRows = rows.slice(headerIdx + 1);

    dataRows.forEach(row => {
      if (row.length === 0 || row.every(c => !c || c.trim().length === 0)) return;

      const rawF = frenteIdx < row.length ? row[frenteIdx] : '';
      const rawV = versoIdx < row.length ? row[versoIdx] : '';
      const rawG = grupoIdx >= 0 && grupoIdx < row.length ? row[grupoIdx] : '';
      const rawR = refIdx >= 0 && refIdx < row.length ? row[refIdx] : '';

      const f = decodeHtmlEntities(rawF).trim();
      const v = decodeHtmlEntities(rawV).trim();

      if (!f || !v) {
        skippedCount++;
        return;
      }

      validCards.push({
        q: f,
        a: v,
        group: decodeHtmlEntities(rawG).trim(),
        ref: decodeHtmlEntities(rawR).trim() || 'Referência Médica'
      });
    });

    return {
      cards: validCards,
      validCount: validCards.length,
      skippedCount: skippedCount,
      delimiter: delim
    };
  };

  // ========================================================
  // Árvore Hierárquica e Fluxo de Importação com Escolha de Destino
  // ========================================================
  window.__importSelectedTargetFolderId = 'tutoria';
  window.__importTreeFilterTerm = '';

  // Constrói lista hierárquica unificada de todas as pastas e subpastas
  window.getAllFoldersHierarchy = function() {
    const rootNodes = [];
    const sfStore = getSubfolderStore();

    // 1. PBL / Tutoria (Raiz de Tutoria)
    const tutoriaNode = {
      id: 'tutoria',
      name: 'PBL / Tutoria',
      icon: '🩺',
      type: 'tutoria_root',
      badge: 'Pasta Principal',
      cardCount: (state.tutoria_highlight && Array.isArray(state.tutoria_highlight.cards)) ? state.tutoria_highlight.cards.length : 0,
      children: []
    };

    // Tutorias numeradas padrão
    if (state.tutorias_numbered) {
      Object.entries(state.tutorias_numbered).forEach(([id, obj]) => {
        if (!obj) return;
        tutoriaNode.children.push({
          id: id,
          name: obj.title || obj.name || id.replace('_', ' ').toUpperCase(),
          icon: '📁',
          type: 'tutoria_numbered',
          badge: 'Tutoria',
          cardCount: Array.isArray(obj.cards) ? obj.cards.length : 0,
          children: []
        });
      });
    }

    // Pastas customizadas em tutoria
    if (state.custom_tutoria_folders) {
      Object.entries(state.custom_tutoria_folders).forEach(([id, obj]) => {
        if (!obj) return;
        tutoriaNode.children.push({
          id: id,
          name: obj.name || obj.title || 'Pasta',
          icon: '📂',
          type: 'custom_tutoria',
          badge: 'Personalizada',
          cardCount: Array.isArray(obj.cards) ? obj.cards.length : 0,
          children: []
        });
      });
    }
    rootNodes.push(tutoriaNode);

    // 2. Módulos / Provas (Raiz de Provas)
    const provasNode = {
      id: 'provas',
      name: 'Módulos / Prova de Módulo',
      icon: '📝',
      type: 'provas_root',
      badge: 'Pasta Principal',
      cardCount: 0,
      children: []
    };

    if (state.provas) {
      Object.entries(state.provas).forEach(([id, obj]) => {
        if (!obj) return;
        provasNode.children.push({
          id: id,
          name: obj.title || obj.name || id,
          icon: '📁',
          type: 'prova_item',
          badge: 'Módulo',
          cardCount: Array.isArray(obj.cards) ? obj.cards.length : 0,
          children: []
        });
      });
    }

    if (state.custom_prova_folders) {
      Object.entries(state.custom_prova_folders).forEach(([id, obj]) => {
        if (!obj) return;
        provasNode.children.push({
          id: id,
          name: obj.name || obj.title || 'Pasta',
          icon: '📂',
          type: 'custom_prova',
          badge: 'Personalizada',
          cardCount: Array.isArray(obj.cards) ? obj.cards.length : 0,
          children: []
        });
      });
    }
    rootNodes.push(provasNode);

    // 3. Outras pastas raiz personalizadas (se houver)
    if (state.custom_root_folders) {
      Object.entries(state.custom_root_folders).forEach(([id, obj]) => {
        if (!obj) return;
        rootNodes.push({
          id: id,
          name: obj.name || obj.title || 'Pasta Raiz',
          icon: '🗂️',
          type: 'custom_root',
          badge: 'Personalizada',
          cardCount: Array.isArray(obj.cards) ? obj.cards.length : 0,
          children: []
        });
      });
    }

    // 4. Anexa recursivamente todas as subpastas criadas em getSubfolderStore()
    const allKnownMap = new Map();
    function registerMap(node) {
      allKnownMap.set(node.id, node);
      if (node.children) {
        node.children.forEach(registerMap);
      }
    }
    rootNodes.forEach(registerMap);

    // Adiciona cada subpasta ao seu pai correspondente
    const pendingSubfolders = Object.values(sfStore);
    let passes = 0;
    while (pendingSubfolders.length > 0 && passes < 10) {
      passes++;
      for (let i = pendingSubfolders.length - 1; i >= 0; i--) {
        const sf = pendingSubfolders[i];
        if (!sf || !sf.id) {
          pendingSubfolders.splice(i, 1);
          continue;
        }
        const parentId = sf.parentId || sf.parent || 'tutoria';
        const parentNode = allKnownMap.get(parentId);
        if (parentNode) {
          const sfNode = {
            id: sf.id,
            name: sf.name || sf.title || 'Subpasta',
            icon: '📁',
            type: 'subfolder',
            badge: 'Subpasta',
            cardCount: Array.isArray(sf.cards) ? sf.cards.length : 0,
            children: []
          };
          parentNode.children.push(sfNode);
          allKnownMap.set(sf.id, sfNode);
          pendingSubfolders.splice(i, 1);
        }
      }
    }

    // Se sobrou alguma subpasta órfã, anexa em tutoria
    if (pendingSubfolders.length > 0) {
      pendingSubfolders.forEach(sf => {
        const orphanNode = {
          id: sf.id,
          name: sf.name || sf.title || 'Subpasta',
          icon: '📁',
          type: 'subfolder',
          badge: 'Subpasta',
          cardCount: Array.isArray(sf.cards) ? sf.cards.length : 0,
          children: []
        };
        tutoriaNode.children.push(orphanNode);
      });
    }

    return rootNodes;
  };

  // Renderiza a árvore de pastas no modal
  window.renderImportFolderTree = function() {
    const container = document.getElementById('import-target-tree-container');
    if (!container) return;

    const roots = getAllFoldersHierarchy();
    const filter = (window.__importTreeFilterTerm || '').toLowerCase().trim();
    const selectedId = window.__importSelectedTargetFolderId || 'tutoria';

    function matchesFilter(node) {
      if (!filter) return true;
      if ((node.name || '').toLowerCase().includes(filter)) return true;
      if (node.children && node.children.some(matchesFilter)) return true;
      return false;
    }

    function renderNode(node, depth = 0) {
      if (!matchesFilter(node)) return '';
      const isSelected = node.id === selectedId;
      const indent = depth * 22;

      let html = \`
        <div class="mr-tree-row \${isSelected ? 'mr-tree-row-selected' : ''}" onclick="selectImportTargetFolder('\${node.id}')" style="display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.85rem; padding-left:\${indent + 14}px; border-radius:10px; cursor:pointer; transition:all 0.15s ease; border:1.5px solid \${isSelected ? '#16a34a' : 'transparent'}; background:\${isSelected ? '#dcfce7' : '#ffffff'}; margin-bottom:0.25rem;">
          <div style="display:flex; align-items:center; gap:0.6rem; min-width:0; flex:1;">
            <input type="radio" name="import_target_radio" \${isSelected ? 'checked' : ''} style="accent-color:#16a34a; cursor:pointer; width:1.05rem; height:1.05rem;" onclick="event.stopPropagation(); selectImportTargetFolder('\${node.id}')">
            <span style="font-size:1.15rem; line-height:1;">\${node.icon || '📁'}</span>
            <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              <span style="font-size:0.9rem; font-weight:\${isSelected ? '800' : '600'}; color:\${isSelected ? '#14532d' : '#0f172a'};">\${escapeHtml(node.name)}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:0.45rem; flex-shrink:0;">
            <span style="font-size:0.72rem; font-weight:700; background:\${isSelected ? '#bbf7d0' : '#f1f5f9'}; color:\${isSelected ? '#14532d' : '#64748b'}; padding:0.18rem 0.5rem; border-radius:5px;">
              \${node.cardCount} carta\${node.cardCount !== 1 ? 's' : ''}
            </span>
            <span style="font-size:0.7rem; font-weight:700; background:\${node.type === 'subfolder' ? '#fef3c7' : '#ecfdf5'}; color:\${node.type === 'subfolder' ? '#92400e' : '#15803d'}; padding:0.18rem 0.45rem; border-radius:5px; border:1px solid \${node.type === 'subfolder' ? '#fde68a' : '#bbf7d0'};">
              \${node.badge || 'Pasta'}
            </span>
          </div>
        </div>
      \`;

      if (node.children && node.children.length > 0) {
        node.children.forEach(ch => {
          html += renderNode(ch, depth + 1);
        });
      }
      return html;
    }

    let fullHtml = '';
    roots.forEach(r => {
      fullHtml += renderNode(r, 0);
    });

    if (!fullHtml.trim()) {
      fullHtml = '<div style="text-align:center; padding:2rem 1rem; color:#64748b; font-size:0.88rem;">Nenhuma pasta encontrada com esse filtro.</div>';
    }

    container.innerHTML = fullHtml;

    // Atualiza label da pasta selecionada
    const selInfo = resolveFolderInfo(selectedId);
    const selNameEl = document.getElementById('import-target-selected-name');
    if (selNameEl) {
      selNameEl.textContent = selInfo ? selInfo.name : 'Tutoria';
    }
  };

  window.selectImportTargetFolder = function(folderId) {
    window.__importSelectedTargetFolderId = folderId;
    window.__activeFolderContext = folderId;
    renderImportFolderTree();
  };

  window.filterImportTree = function(val) {
    window.__importTreeFilterTerm = val || '';
    renderImportFolderTree();
  };

  // Abre criação de subpasta de dentro do seletor e volta para o seletor com a nova selecionada
  window.openCreateFolderFromImportPicker = function() {
    window.__creatingFromImportPicker = true;
    const parentId = window.__importSelectedTargetFolderId || 'tutoria';
    closeImportTargetModal();
    openSubfolderCreateModal(parentId);
  };

  // Continua do Seletor de Destino (Passo 1) para o Modal CSV (Passo 2)
  window.proceedFromTargetToCsvModal = function() {
    const chosenFolderId = window.__importSelectedTargetFolderId || 'tutoria';
    closeImportTargetModal();
    realOpenCsvImportModal(chosenFolderId);
  };

  // Fluxo principal acionado ao clicar em "📥 Importar" no Header ou no menu
  window.openImportFlow = function(initialFolderId) {
    // 1. Determina pré-seleção: se houver pasta ativa ou passada por parâmetro usa ela, senão tutoria
    let preselected = initialFolderId;
    if (!preselected && typeof currentFolderContext === 'function') {
      preselected = currentFolderContext();
    }
    if (!preselected && window.__activeFolderContext) {
      preselected = window.__activeFolderContext;
    }
    if (!preselected && typeof studyState !== 'undefined' && studyState && studyState.deckId) {
      preselected = studyState.deckId;
    }
    if (!preselected || preselected === 'home' || preselected === 'all' || preselected === 'study') {
      preselected = 'tutoria';
    }

    window.__importSelectedTargetFolderId = preselected;
    window.__activeFolderContext = preselected;
    window.__importTreeFilterTerm = '';

    const searchInput = document.getElementById('import-target-search');
    if (searchInput) searchInput.value = '';

    renderImportFolderTree();

    const targetModal = document.getElementById('import-target-modal');
    if (targetModal) {
      targetModal.style.display = 'flex';
    } else {
      // Fallback de segurança se o modal ainda não estiver no DOM
      realOpenCsvImportModal(preselected);
    }
  };
  window.__realOpenImportFlow = window.openImportFlow;

  window.closeImportTargetModal = function() {
    const modal = document.getElementById('import-target-modal');
    if (modal) modal.style.display = 'none';
  };

  // Processa contexto pendente caso tenha sido chamado antes do script rodar
  if (typeof window.__pendingImportFlowCtx !== 'undefined') {
    const pendingImportFlow = window.__pendingImportFlowCtx;
    delete window.__pendingImportFlowCtx;
    setTimeout(() => window.openImportFlow(pendingImportFlow), 0);
  }

  const realOpenCsvImportModal = function(targetFolderId) {
    const targetCtx = targetFolderId || window.__activeFolderContext || (typeof currentFolderContext === 'function' ? currentFolderContext() : 'tutoria');
    window.__activeFolderContext = targetCtx;
    window.__importSelectedTargetFolderId = targetCtx;

    const info = resolveFolderInfo(targetCtx);
    const folderName = info ? info.name : 'Pasta Atual';

    const lbl = document.getElementById('csv-import-target-label');
    if (lbl) {
      lbl.innerHTML = 'Destino das cartas: <strong>' + escapeHtml(folderName) + '</strong> <button type="button" onclick="closeCsvImportModal(); openImportFlow(\\'' + targetCtx + '\\')" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; border-radius:6px; font-size:0.75rem; font-weight:800; padding:0.15rem 0.5rem; margin-left:0.4rem; cursor:pointer;">(Alterar pasta)</button>';
    }

    // Reset estado interno do modal
    window.__activeCsvCards = [];
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) fileInput.value = '';
    const txtArea = document.getElementById('csv-text-input');
    if (txtArea) txtArea.value = '';
    const nameDisp = document.getElementById('csv-file-name-display');
    if (nameDisp) nameDisp.textContent = 'Clique para selecionar ou arraste o arquivo CSV';

    hideCsvError();
    hideCsvPreview();
    updateCsvSubmitBtn(0);

    setCsvImportTab('file');

    const modal = document.getElementById('csv-import-modal');
    if (modal) modal.style.display = 'flex';
  };
  window.__realOpenCsvImportModal = realOpenCsvImportModal;
  window.openCsvImportModal = realOpenCsvImportModal;
  window.openCsvImport = function(ctx) {
    if (typeof window.openImportFlow === 'function') {
      window.openImportFlow(ctx);
    } else {
      realOpenCsvImportModal(ctx);
    }
  };
  if (typeof window.__pendingCsvImportCtx !== 'undefined') {
    const pendingCsv = window.__pendingCsvImportCtx;
    delete window.__pendingCsvImportCtx;
    setTimeout(() => window.openImportFlow(pendingCsv), 0);
  }

  window.closeCsvImportModal = function() {
    const modal = document.getElementById('csv-import-modal');
    if (modal) modal.style.display = 'none';
  };

  window.setCsvImportTab = function(tab) {
    window.__activeCsvTab = tab;
    const tabFile = document.getElementById('csv-tab-file');
    const tabText = document.getElementById('csv-tab-text');
    const panelFile = document.getElementById('csv-panel-file');
    const panelText = document.getElementById('csv-panel-text');

    if (tab === 'file') {
      if (tabFile) {
        tabFile.style.borderBottom = '2.5px solid #16a34a';
        tabFile.style.color = '#15803d';
        tabFile.style.fontWeight = '800';
      }
      if (tabText) {
        tabText.style.borderBottom = '2.5px solid transparent';
        tabText.style.color = '#64748b';
        tabText.style.fontWeight = '700';
      }
      if (panelFile) panelFile.style.display = 'block';
      if (panelText) panelText.style.display = 'none';
    } else {
      if (tabFile) {
        tabFile.style.borderBottom = '2.5px solid transparent';
        tabFile.style.color = '#64748b';
        tabFile.style.fontWeight = '700';
      }
      if (tabText) {
        tabText.style.borderBottom = '2.5px solid #16a34a';
        tabText.style.color = '#15803d';
        tabText.style.fontWeight = '800';
      }
      if (panelFile) panelFile.style.display = 'none';
      if (panelText) panelText.style.display = 'block';
      setTimeout(() => {
        const ta = document.getElementById('csv-text-input');
        if (ta) ta.focus();
      }, 50);
    }
  };

  function showCsvError(msg) {
    const errBox = document.getElementById('csv-import-error');
    const errMsg = document.getElementById('csv-import-error-msg');
    if (errBox && errMsg) {
      errMsg.textContent = msg;
      errBox.style.display = 'block';
    }
    hideCsvPreview();
    updateCsvSubmitBtn(0);
  }

  function hideCsvError() {
    const errBox = document.getElementById('csv-import-error');
    if (errBox) errBox.style.display = 'none';
  }

  function hideCsvPreview() {
    const prev = document.getElementById('csv-preview-container');
    if (prev) prev.style.display = 'none';
  }

  function updateCsvSubmitBtn(count) {
    const btn = document.getElementById('csv-import-submit-btn');
    if (!btn) return;
    if (count > 0) {
      btn.disabled = false;
      btn.style.background = '#16a34a';
      btn.style.cursor = 'pointer';
      btn.innerHTML = '<span>📥</span> Importar ' + count + ' carta' + (count !== 1 ? 's' : '');
    } else {
      btn.disabled = true;
      btn.style.background = '#94a3b8';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = '<span>📥</span> Importar tudo';
    }
  }

  function displayCsvResult(parsed) {
    if (parsed.error) {
      showCsvError(parsed.error);
      window.__activeCsvCards = [];
      return;
    }
    hideCsvError();

    window.__activeCsvCards = parsed.cards || [];
    const validCount = parsed.validCount || 0;
    const skippedCount = parsed.skippedCount || 0;

    const prev = document.getElementById('csv-preview-container');
    const badgeValid = document.getElementById('csv-preview-badge-valid');
    const badgeSkipped = document.getElementById('csv-preview-badge-skipped');
    const delimInfo = document.getElementById('csv-preview-delim-info');
    const listEl = document.getElementById('csv-preview-cards-list');

    if (badgeValid) badgeValid.textContent = validCount + ' carta' + (validCount !== 1 ? 's' : '') + ' detectada' + (validCount !== 1 ? 's' : '');
    if (badgeSkipped) badgeSkipped.textContent = skippedCount + ' linha' + (skippedCount !== 1 ? 's' : '') + ' vazia' + (skippedCount !== 1 ? 's' : '') + ' ignorada' + (skippedCount !== 1 ? 's' : '');
    if (delimInfo) delimInfo.textContent = 'Delimitador: "' + (parsed.delimiter === ';' ? ';' : ',') + '"';

    if (listEl) {
      let cardsHtml = '';
      const sample = window.__activeCsvCards.slice(0, 3);
      sample.forEach((c, idx) => {
        cardsHtml += \`
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:0.6rem 0.8rem; font-size:0.8rem;">
            <div style="font-weight:700; color:#14532d; margin-bottom:0.2rem;">#\${idx + 1} \${c.group ? '<span style="font-size:0.72rem; background:#f0fdf4; color:#166534; padding:0.1rem 0.35rem; border-radius:4px; margin-right:0.3rem;">' + escapeHtml(c.group) + '</span>' : ''}\${escapeHtml(c.q)}</div>
            <div style="color:#475569; font-size:0.77rem; white-space:pre-wrap;">\${escapeHtml(c.a.length > 120 ? c.a.slice(0, 120) + '...' : c.a)}</div>
          </div>
        \`;
      });
      if (window.__activeCsvCards.length > 3) {
        cardsHtml += \`<div style="text-align:center; font-size:0.75rem; color:#64748b; padding-top:0.2rem;">... e mais \${window.__activeCsvCards.length - 3} carta\${window.__activeCsvCards.length - 3 !== 1 ? 's' : ''}</div>\`;
      }
      listEl.innerHTML = cardsHtml;
    }

    if (prev) prev.style.display = 'block';
    updateCsvSubmitBtn(validCount);
  }

  window.handleCsvFileSelected = function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const nameDisp = document.getElementById('csv-file-name-display');
    if (nameDisp) nameDisp.textContent = '📄 ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)';

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const text = evt.target.result;
        const result = parseCsvInputText(text);
        displayCsvResult(result);
      } catch (err) {
        showCsvError('Erro ao ler arquivo: ' + err.message);
      }
    };
    reader.onerror = function() {
      showCsvError('Falha na leitura do arquivo CSV.');
    };
    reader.readAsText(file, 'UTF-8');
  };

  window.handleCsvDrop = function(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = '#86efac';
    e.currentTarget.style.background = '#f0fdf4';
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const fileInput = document.getElementById('csv-file-input');
      if (fileInput) {
        fileInput.files = e.dataTransfer.files;
      }
      handleCsvFileSelected({ target: { files: [file] } });
    }
  };

  window.handleCsvTextInput = function() {
    const ta = document.getElementById('csv-text-input');
    const val = ta ? ta.value : '';
    if (!val.trim()) {
      hideCsvError();
      hideCsvPreview();
      updateCsvSubmitBtn(0);
      window.__activeCsvCards = [];
      return;
    }
    const result = parseCsvInputText(val);
    displayCsvResult(result);
  };

  // 12B. Executa importação e salva no state FSRS
  window.executeCsvImport = function() {
    if (!window.__activeCsvCards || window.__activeCsvCards.length === 0) {
      alert('Nenhuma carta válida detectada para importação.');
      return;
    }

    const targetCtx = window.__activeFolderContext || (typeof currentFolderContext === 'function' ? currentFolderContext() : 'tutoria');
    const info = resolveFolderInfo(targetCtx);

    if (!info) {
      alert('Não foi possível identificar a pasta de destino selecionada.');
      return;
    }

    const folderTitle = info.name || 'Pasta de Estudo';
    let targetCardsArray = null;

    // Localiza array de cartas correspondente na estrutura de state do MedReview
    if (targetCtx === 'tutoria') {
      if (!state.tutoria_highlight) state.tutoria_highlight = { cards: [] };
      if (!Array.isArray(state.tutoria_highlight.cards)) state.tutoria_highlight.cards = [];
      targetCardsArray = state.tutoria_highlight.cards;
    } else if (state.tutorias_numbered && state.tutorias_numbered[targetCtx]) {
      if (!Array.isArray(state.tutorias_numbered[targetCtx].cards)) state.tutorias_numbered[targetCtx].cards = [];
      targetCardsArray = state.tutorias_numbered[targetCtx].cards;
    } else if (state.custom_tutoria_folders && state.custom_tutoria_folders[targetCtx]) {
      if (!Array.isArray(state.custom_tutoria_folders[targetCtx].cards)) state.custom_tutoria_folders[targetCtx].cards = [];
      targetCardsArray = state.custom_tutoria_folders[targetCtx].cards;
    } else if (state.custom_prova_folders && state.custom_prova_folders[targetCtx]) {
      if (!Array.isArray(state.custom_prova_folders[targetCtx].cards)) state.custom_prova_folders[targetCtx].cards = [];
      targetCardsArray = state.custom_prova_folders[targetCtx].cards;
    } else if (state.custom_root_folders && state.custom_root_folders[targetCtx]) {
      if (!Array.isArray(state.custom_root_folders[targetCtx].cards)) state.custom_root_folders[targetCtx].cards = [];
      targetCardsArray = state.custom_root_folders[targetCtx].cards;
    } else if (state.provas && state.provas[targetCtx]) {
      if (!Array.isArray(state.provas[targetCtx].cards)) state.provas[targetCtx].cards = [];
      targetCardsArray = state.provas[targetCtx].cards;
    } else {
      const sfStore = getSubfolderStore();
      if (sfStore[targetCtx]) {
        if (!Array.isArray(sfStore[targetCtx].cards)) sfStore[targetCtx].cards = [];
        targetCardsArray = sfStore[targetCtx].cards;
      }
    }

    if (!targetCardsArray) {
      alert('Não foi possível adicionar cartas a esta pasta (formato não suportado).');
      return;
    }

    const importedCount = window.__activeCsvCards.length;

    // Cria as cartas no formato estrito FSRS-5
    window.__activeCsvCards.forEach(c => {
      const newCard = {
        id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_' + Math.random().toString(36).substring(2, 5),
        q: c.q,
        a: c.a,
        ref: c.ref || 'Referência Médica',
        group: c.group || '',
        clinical: false,
        repetitions: 0,
        interval: 0,
        easeFactor: 2.5,
        dueDate: Date.now(),
        fsrsS: null,
        fsrsD: null,
        fsrsState: 'new',
        lapses: 0,
        containerId: targetCtx,
        folderTitle: folderTitle
      };
      targetCardsArray.push(newCard);
    });

    saveState();
    closeCsvImportModal();

    if (typeof showToast === 'function') {
      showToast(importedCount + ' cartas importadas com sucesso!');
    } else {
      alert(importedCount + ' cartas importadas com sucesso!');
    }

    // Re-render imediato da visualização
    const sfStore = getSubfolderStore();
    if (sfStore[targetCtx]) {
      renderSubfolderView(targetCtx);
    } else {
      renderRoute();
    }
  };

  // 8. Modal de criação de Subpasta
  window.openSubfolderCreateModal = function(parentId) {
    window.__activeFolderContext = parentId || (typeof currentFolderContext === 'function' ? currentFolderContext() : null) || 'tutoria';
    const info = resolveFolderInfo(window.__activeFolderContext);
    const parentName = info ? info.name : 'Pasta';

    const titleEl = document.getElementById('subfolder-modal-title');
    if (titleEl) titleEl.innerHTML = '<span>📁</span> Nova Subpasta em <em>' + escapeHtml(parentName) + '</em>';

    const nameInput = document.getElementById('subfolder-name-input');
    if (nameInput) {
      nameInput.value = '';
    }
    const descInput = document.getElementById('subfolder-desc-input');
    if (descInput) {
      descInput.value = '';
    }

    const modal = document.getElementById('subfolder-create-modal');
    if (modal) modal.style.display = 'flex';
    setTimeout(() => nameInput && nameInput.focus(), 50);
  };

  window.closeSubfolderCreateModal = function() {
    const modal = document.getElementById('subfolder-create-modal');
    if (modal) modal.style.display = 'none';
  };

  // Notificação Toast Visual Robusta e Autônoma do MedReview
  function showMedReviewToast(title, subtitle, icon) {
    try {
      let container = document.getElementById('mr-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'mr-toast-container';
        container.className = 'mr-toast-container';
        document.body.appendChild(container);
      }

      const toastEl = document.createElement('div');
      toastEl.className = 'mr-toast';
      toastEl.innerHTML =
        '<span class="mr-toast-icon">' + (icon || '✅') + '</span>' +
        '<div class="mr-toast-body">' +
          '<div class="mr-toast-title">' + escapeHtml(title) + '</div>' +
          (subtitle ? ('<div class="mr-toast-path">' + escapeHtml(subtitle) + '</div>') : '') +
        '</div>' +
        '<button type="button" class="mr-toast-close" title="Fechar">&times;</button>';

      const closeBtn = toastEl.querySelector('.mr-toast-close');
      const dismiss = () => {
        if (toastEl.classList.contains('mr-toast-hiding')) return;
        toastEl.classList.add('mr-toast-hiding');
        setTimeout(() => {
          if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
        }, 260);
      };
      if (closeBtn) closeBtn.onclick = dismiss;

      container.appendChild(toastEl);
      setTimeout(dismiss, 5000);
    } catch (err) {
      console.warn('Erro ao exibir toast MedReview:', err);
    }
  }
  window.showMedReviewToast = showMedReviewToast;
  if (typeof window.showToast !== 'function') {
    window.showToast = function(msg) {
      showMedReviewToast(msg);
    };
  }

  window.handleSubfolderSubmit = function(e) {
    e.preventDefault();
    const nameInput = document.getElementById('subfolder-name-input');
    const descInput = document.getElementById('subfolder-desc-input');
    const name = nameInput ? nameInput.value.trim() : '';
    const desc = descInput ? descInput.value.trim() : '';
    if (!name) return;

    // Resolução rigorosa da pasta pai: prioriza o contexto ativo registrado ao abrir o modal
    let parentId = window.__activeFolderContext;
    if (!parentId && typeof currentFolderContext === 'function') {
      parentId = currentFolderContext();
    }
    if (!parentId) {
      parentId = 'tutoria';
    }

    const parentInfo = resolveFolderInfo(parentId);
    const parentName = parentInfo ? parentInfo.name : 'Pasta Principal';

    const subfolderId = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const store = getSubfolderStore();
    store[subfolderId] = {
      id: subfolderId,
      name: name,
      title: name,
      parentId: parentId,
      parent: parentId,
      description: desc,
      cards: [],
      created: Date.now()
    };
    persistSubfolders();
    if (typeof saveState === 'function') {
      saveState();
    }
    closeSubfolderCreateModal();
    window.__activeFolderContext = null;

    // Monta o caminho completo hierárquico (breadcrumbs) para feedback visual detalhado
    const chain = getBreadcrumbChain(subfolderId);
    let fullPathStr = '';
    if (chain && chain.length > 0) {
      fullPathStr = chain.map(it => it.name).join(' > ');
    } else {
      fullPathStr = parentName + ' > ' + name;
    }

    // Toast completo e explícito para o usuário saber exatamente onde a subpasta foi criada
    showMedReviewToast('Subpasta criada com sucesso!', 'Localização: ' + fullPathStr, '📁');
    if (typeof showToast === 'function' && showToast !== showMedReviewToast) {
      try { showToast('Subpasta "' + name + '" criada em ' + fullPathStr); } catch { /* ignore */ }
    }

    // Se o modal de destino de importação tiver disparado a criação, reabre-o com a nova subpasta selecionada
    const impModal = document.getElementById('import-target-modal');
    if (window.__creatingFromImportPicker) {
      window.__creatingFromImportPicker = false;
      window.__importSelectedTargetFolderId = subfolderId;
      window.__activeFolderContext = subfolderId;
      if (impModal) {
        impModal.style.display = 'flex';
        renderImportFolderTree();
      }
      return;
    } else if (window.__importSelectedTargetFolderId && impModal && impModal.style.display !== 'none' && impModal.style.display !== '') {
      window.__importSelectedTargetFolderId = subfolderId;
      window.__activeFolderContext = subfolderId;
      renderImportFolderTree();
      return;
    }

    // Limpa contexto ativo após uso
    window.__activeFolderContext = null;

    // 1. Navega automaticamente para a subpasta recém-criada (requisito 1)
    // 2. Garante que se o usuário voltar à pasta pai ela estará devidamente listada (requisito 2)
    navigateTo(subfolderId);
    requestAnimationFrame(() => {
      enhanceViews();
      setTimeout(enhanceViews, 120);
      setTimeout(enhanceViews, 300);
    });
  };

  // 9. Adaptador para navegar até subpastas
  if (window.navigateTo && window.navigateTo.__mrWrapped) return;
  const origNavigateTo = window.navigateTo;
  const wrappedNavigateTo = function(target) {
    // Antes de navegar, restaura a visibilidade do #mr-subfolder-wrapper e dos elementos nativos ocultados
    const subWrapper = document.getElementById('mr-subfolder-wrapper');
    if (subWrapper) {
      subWrapper.style.display = 'none';
      window.__mrActivePickerParentId = null;
      window.__mrActiveSubfolderId = null;
      if (typeof window.__mrRestoreHiddenElements === 'function') {
        window.__mrRestoreHiddenElements();
      } else {
        const hiddenList = Array.isArray(window.__mrHiddenMainEls) ? window.__mrHiddenMainEls : (window.__mrHiddenMainEl ? [window.__mrHiddenMainEl] : []);
        hiddenList.forEach(el => {
          if (el && (!el.matches || (!el.matches('.modal, [id*="modal"], [class*="modal"], dialog') && !el.closest('.modal, [id*="modal"], [class*="modal"], dialog')))) {
            el.style.display = '';
          }
        });
        window.__mrHiddenMainEls = null;
        window.__mrHiddenMainEl = null;
      }
      document.querySelectorAll('[data-mr-subfolder-hidden-banner="1"]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-mr-subfolder-hidden-banner');
      });
    }

    const sfStore = getSubfolderStore();
    if (sfStore[target]) {
      // É uma subpasta customizada: renderiza visão de pasta dedicada
      renderSubfolderView(target);
      return;
    }
    if (typeof origNavigateTo === 'function') {
      origNavigateTo(target);
      requestAnimationFrame(() => {
        enhanceViews();
        setTimeout(enhanceViews, 120);
        setTimeout(enhanceViews, 300);
      });
    }
  };
  wrappedNavigateTo.__mrWrapped = true;
  window.navigateTo = wrappedNavigateTo;

  // 9B. Helpers de Estatísticas Unificadas para Pastas e Subpastas
  function getAllAppCards() {
    const cards = [];
    const seenIds = new Set();

    function addCard(c) {
      if (!c) return;
      const id = c.id || (c.q ? ('gen_' + String(c.q).slice(0, 40)) : null);
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      cards.push(c);
    }

    function addList(arr) {
      if (Array.isArray(arr)) {
        arr.forEach(addCard);
      }
    }

    if (typeof state !== 'undefined' && state) {
      // 1. tutoria_highlight.cards
      if (state.tutoria_highlight && Array.isArray(state.tutoria_highlight.cards)) {
        addList(state.tutoria_highlight.cards);
      }

      // 2. tutorias_numbered
      if (state.tutorias_numbered && typeof state.tutorias_numbered === 'object') {
        Object.values(state.tutorias_numbered).forEach(obj => {
          if (obj && Array.isArray(obj.cards)) addList(obj.cards);
        });
      }

      // 3. custom_tutoria_folders
      if (state.custom_tutoria_folders && typeof state.custom_tutoria_folders === 'object') {
        Object.values(state.custom_tutoria_folders).forEach(obj => {
          if (obj && Array.isArray(obj.cards)) addList(obj.cards);
        });
      }

      // 4. provas
      if (state.provas && typeof state.provas === 'object') {
        Object.values(state.provas).forEach(obj => {
          if (obj && Array.isArray(obj.cards)) addList(obj.cards);
        });
      }

      // 5. custom_prova_folders
      if (state.custom_prova_folders && typeof state.custom_prova_folders === 'object') {
        Object.values(state.custom_prova_folders).forEach(obj => {
          if (obj && Array.isArray(obj.cards)) addList(obj.cards);
        });
      }

      // 6. custom_root_folders
      if (state.custom_root_folders && typeof state.custom_root_folders === 'object') {
        Object.values(state.custom_root_folders).forEach(obj => {
          if (obj && Array.isArray(obj.cards)) addList(obj.cards);
        });
      }

      // 7. todas as subpastas do store de subpastas
      const sfStore = getSubfolderStore();
      if (sfStore && typeof sfStore === 'object') {
        Object.values(sfStore).forEach(obj => {
          if (obj && Array.isArray(obj.cards)) addList(obj.cards);
        });
      }
    }

    return cards;
  }
  window.getAllAppCards = getAllAppCards;

  function getFolderAllCards(folderId) {
    const cards = [];
    const visited = new Set();

    function collect(fId) {
      if (!fId || visited.has(fId)) return;
      visited.add(fId);

      const info = resolveFolderInfo(fId);
      if (info && Array.isArray(info.cards)) {
        info.cards.forEach(c => {
          if (c && c.id) cards.push(c);
        });
      }

      const subs = getSubfoldersOf(fId);
      subs.forEach(s => {
        if (s && s.id) collect(s.id);
      });
    }

    collect(folderId);
    return cards;
  }

  function getStoredFolderEvalHistory() {
    try {
      const raw = localStorage.getItem('medreview_eval_history');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* intentionally ignored */ }
    try {
      if (typeof getStoredEvalHistory === 'function') {
        const res = getStoredEvalHistory();
        if (Array.isArray(res)) return res;
      }
    } catch { /* intentionally ignored */ }
    return [];
  }

  function renderFolderStatsPanelHtml(folderId, folderName) {
    const isGlobal = folderId === null || typeof folderId === 'undefined';
    const allCards = isGlobal ? getAllAppCards() : getFolderAllCards(folderId);
    const displayName = folderName || (isGlobal ? 'Visão Geral' : 'Pasta');

    if (!allCards || allCards.length === 0) {
      if (isGlobal) {
        return '<div style="background:#ffffff; border:1.5px solid #d1fae5; border-radius:16px; padding:1.5rem; text-align:center; color:#64748b; font-size:0.92rem;">Nenhuma carta encontrada no MedReview ainda.</div>';
      }
      return '';
    }

    const cardIdSet = new Set(allCards.map(c => c.id));
    const now = Date.now();

    // 1. Métricas: Pendentes Hoje & Distribuição do Domínio
    let pendingCount = 0;
    let newCardsCount = 0;
    let learningCardsCount = 0;
    let masteredCardsCount = 0;

    allCards.forEach(c => {
      const isNew = (!c.repetitions || c.repetitions === 0) && (!c.fsrsS || c.fsrsS === 0);
      const isDue = (c.dueDate || 0) <= now;

      if (isNew) {
        newCardsCount++;
        pendingCount++;
      } else {
        if (isDue) pendingCount++;
        const ivl = typeof c.interval === 'number' ? c.interval : (typeof c.fsrsS === 'number' ? c.fsrsS : 0);
        if (ivl >= 21) {
          masteredCardsCount++;
        } else {
          learningCardsCount++;
        }
      }
    });

    // 2. Histórico local para Taxa de Acerto e Pontos a Melhorar
    const history = getStoredFolderEvalHistory();
    const relevantHistory = isGlobal
      ? history.filter(h => h && h.cardId)
      : history.filter(h => h && h.cardId && cardIdSet.has(h.cardId));

    let successReviews = 0;
    let totalReviews = relevantHistory.length;

    relevantHistory.forEach(h => {
      const q = String(h.quality || '').toLowerCase();
      const r = typeof h.rating === 'number' ? h.rating : 0;
      if (q === 'good' || q === 'easy' || r === 3 || r === 4) {
        successReviews++;
      }
    });

    const accuracyRate = totalReviews > 0 ? Math.round((successReviews / totalReviews) * 100) : 100;

    // Tempo de estudo estimado ou derivado do histórico (15s por revisão de média caso não haja global)
    let studyTimeDisplay = '0 min';
    try {
      let timeMs = 0;
      const rawTime = localStorage.getItem('medreview_study_time_ms');
      if (rawTime) {
        timeMs = parseInt(rawTime, 10) || 0;
      } else if (typeof getStoredStudyTimeMs === 'function') {
        timeMs = getStoredStudyTimeMs() || 0;
      }
      if (timeMs > 0 && (isGlobal || totalReviews > 0)) {
        const mins = Math.max(1, Math.round(timeMs / 60000));
        studyTimeDisplay = mins >= 60 ? (Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm') : (mins + ' min');
      } else if (totalReviews > 0) {
        const estimatedMins = Math.max(1, Math.round((totalReviews * 18) / 60));
        studyTimeDisplay = estimatedMins + ' min';
      }
    } catch (e) {
      studyTimeDisplay = '0 min';
    }

    // Sequência (streak) derivada das datas de revisão no histórico
    let streakDays = 0;
    if (relevantHistory.length > 0) {
      const days = new Set();
      relevantHistory.forEach(h => {
        if (h.date) {
          days.add(h.date);
        } else if (h.timestamp) {
          days.add(new Date(h.timestamp).toISOString().split('T')[0]);
        }
      });
      streakDays = Math.max(1, days.size);
    } else {
      streakDays = 0;
    }

    // Distribuição percentual
    const totalCount = allCards.length;
    const newPct = totalCount > 0 ? Math.round((newCardsCount / totalCount) * 100) : 0;
    const learningPct = totalCount > 0 ? Math.round((learningCardsCount / totalCount) * 100) : 0;
    const masteredPct = Math.max(0, 100 - newPct - learningPct);

    // Top 5 cartas com mais erros / lapses (Pontos a melhorar)
    const cardErrorMap = new Map();
    allCards.forEach(c => {
      let lapses = c.lapses || c.errorCount || 0;
      cardErrorMap.set(c.id, { card: c, errors: lapses });
    });

    relevantHistory.forEach(h => {
      const q = String(h.quality || '').toLowerCase();
      const r = typeof h.rating === 'number' ? h.rating : 0;
      if (q === 'again' || r === 1) {
        const item = cardErrorMap.get(h.cardId);
        if (item) {
          item.errors += 1;
        }
      }
    });

    const difficultCards = Array.from(cardErrorMap.values())
      .filter(it => it.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 5);

    let difficultHtml = '';
    if (difficultCards.length > 0) {
      difficultHtml = '<div style="margin-top:1.2rem; padding-top:1.1rem; border-top:1px dashed #cbd5e1;">' +
        '<div style="font-size:0.88rem; font-weight:800; color:#b91c1c; margin-bottom:0.65rem; display:flex; align-items:center; gap:0.4rem;">' +
        '<span>🎯</span> Pontos a melhorar (Top 5 cartas com mais erros)' +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:0.45rem;">';
      difficultCards.forEach((item, idx) => {
        const qText = item.card.q || 'Pergunta';
        const truncatedQ = qText.length > 90 ? qText.slice(0, 90) + '...' : qText;
        difficultHtml += '<div style="background:#fff; border:1px solid #fecaca; border-radius:8px; padding:0.55rem 0.8rem; display:flex; align-items:center; justify-content:space-between; gap:0.8rem; font-size:0.82rem;">' +
          '<div style="display:flex; align-items:center; gap:0.45rem; min-width:0; flex:1;">' +
          '<span style="background:#fee2e2; color:#991b1b; font-weight:800; font-size:0.73rem; padding:0.15rem 0.45rem; border-radius:5px; flex-shrink:0;">#' + (idx + 1) + '</span>' +
          '<span style="color:#1e293b; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(truncatedQ) + '</span>' +
          '</div>' +
          '<span style="background:#fef2f2; color:#dc2626; border:1px solid #fca5a5; font-size:0.75rem; font-weight:800; padding:0.18rem 0.5rem; border-radius:6px; flex-shrink:0;">' +
          item.errors + ' erro' + (item.errors !== 1 ? 's' : '') +
          '</span>' +
          '</div>';
      });
      difficultHtml += '</div></div>';
    }

    return '<div class="mr-folder-stats-panel" style="background:#ffffff; border:1.5px solid #d1fae5; border-radius:16px; padding:1.25rem 1.4rem; margin-bottom:1.6rem; box-shadow:0 4px 14px rgba(22,163,74,0.06);">' +
      '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.1rem; flex-wrap:wrap; gap:0.5rem; padding-bottom:0.75rem; border-bottom:1px solid #f0fdf4;">' +
      '<div style="display:flex; align-items:center; gap:0.6rem;">' +
      '<span style="font-size:1.4rem;">📊</span>' +
      '<div>' +
      '<div style="font-size:0.95rem; font-weight:800; color:#14532d;">Desempenho & Estatísticas</div>' +
      '<div style="font-size:0.76rem; color:#64748b;">Métricas em tempo real com algoritmo FSRS-5</div>' +
      '</div></div>' +
      '<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:0.78rem; font-weight:800; padding:0.25rem 0.75rem; border-radius:9999px; display:inline-flex; align-items:center; gap:0.35rem;">' +
      '<span>' + (isGlobal ? '🌐' : '📁') + '</span> ' + escapeHtml(displayName) +
      '</span></div>' +
      '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.75rem; margin-bottom:1.2rem;">' +
      '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.75rem 0.85rem; text-align:center;">' +
      '<div style="font-size:0.75rem; font-weight:700; color:#64748b; margin-bottom:0.2rem;">🎯 Taxa de Acerto</div>' +
      '<div style="font-size:1.35rem; font-weight:800; color:#15803d;">' + accuracyRate + '%</div>' +
      '<div style="font-size:0.7rem; color:#94a3b8;">' + totalReviews + ' revisõe' + (totalReviews !== 1 ? 's' : '') + '</div></div>' +
      '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.75rem 0.85rem; text-align:center;">' +
      '<div style="font-size:0.75rem; font-weight:700; color:#64748b; margin-bottom:0.2rem;">⚡ Pendentes Hoje</div>' +
      '<div style="font-size:1.35rem; font-weight:800; color:#0284c7;">' + pendingCount + '</div>' +
      '<div style="font-size:0.7rem; color:#94a3b8;">de ' + totalCount + ' cartas</div></div>' +
      '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.75rem 0.85rem; text-align:center;">' +
      '<div style="font-size:0.75rem; font-weight:700; color:#64748b; margin-bottom:0.2rem;">⏱️ Tempo de Estudo</div>' +
      '<div style="font-size:1.35rem; font-weight:800; color:#7c3aed;">' + studyTimeDisplay + '</div>' +
      '<div style="font-size:0.7rem; color:#94a3b8;">' + (isGlobal ? 'tempo acumulado' : 'nesta pasta') + '</div></div>' +
      '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.75rem 0.85rem; text-align:center;">' +
      '<div style="font-size:0.75rem; font-weight:700; color:#64748b; margin-bottom:0.2rem;">🔥 Sequência</div>' +
      '<div style="font-size:1.35rem; font-weight:800; color:#ea580c;">' + streakDays + ' dia' + (streakDays !== 1 ? 's' : '') + '</div>' +
      '<div style="font-size:0.7rem; color:#94a3b8;">foco ativo</div></div></div>' +
      '<div style="margin-bottom:0.4rem;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.45rem; font-size:0.78rem; font-weight:700; color:#475569;">' +
      '<span>Distribuição do Domínio do Acervo</span>' +
      '<span>' + totalCount + ' cartas totais</span></div>' +
      '<div style="height:12px; border-radius:9999px; overflow:hidden; background:#e2e8f0; display:flex;">' +
      '<div style="width:' + newPct + '%; background:#94a3b8; transition:width 0.3s ease;" title="Novas: ' + newCardsCount + ' (' + newPct + '%)"></div>' +
      '<div style="width:' + learningPct + '%; background:#f59e0b; transition:width 0.3s ease;" title="Aprendendo: ' + learningCardsCount + ' (' + learningPct + '%)"></div>' +
      '<div style="width:' + masteredPct + '%; background:#16a34a; transition:width 0.3s ease;" title="Dominadas: ' + masteredCardsCount + ' (' + masteredPct + '%)"></div>' +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; gap:0.5rem; margin-top:0.45rem; font-size:0.74rem; flex-wrap:wrap;">' +
      '<div style="display:inline-flex; align-items:center; gap:0.35rem;">' +
      '<span style="width:9px; height:9px; border-radius:50%; background:#94a3b8; display:inline-block;"></span>' +
      '<span style="color:#475569; font-weight:600;">Novas: <strong>' + newCardsCount + '</strong> (' + newPct + '%)</span>' +
      '</div>' +
      '<div style="display:inline-flex; align-items:center; gap:0.35rem;">' +
      '<span style="width:9px; height:9px; border-radius:50%; background:#f59e0b; display:inline-block;"></span>' +
      '<span style="color:#475569; font-weight:600;">Aprendendo: <strong>' + learningCardsCount + '</strong> (' + learningPct + '%)</span>' +
      '</div>' +
      '<div style="display:inline-flex; align-items:center; gap:0.35rem;">' +
      '<span style="width:9px; height:9px; border-radius:50%; background:#16a34a; display:inline-block;"></span>' +
      '<span style="color:#475569; font-weight:600;">Dominadas (≥21d): <strong>' + masteredCardsCount + '</strong> (' + masteredPct + '%)</span>' +
      '</div>' +
      '</div></div>' +
      difficultHtml +
      '</div>';
  }

  // Helpers para ocultar/restaurar TODOS os elementos nativos residuais da view pai
  function isModalElement(el) {
    if (!el || !el.matches) return false;
    try {
      if (el.matches('.modal, [id*="modal"], [class*="modal"], dialog')) return true;
      if (el.closest && el.closest('.modal, [id*="modal"], [class*="modal"], dialog')) return true;
    } catch { /* ignore */ }
    return false;
  }

  function hideNativeContentForSubfolder(subWrapper) {
    // Restaura lista anterior se houver antes de recalcular
    if (typeof window.__mrRestoreHiddenElements === 'function') {
      window.__mrRestoreHiddenElements();
    }

    const hiddenList = [];
    const pushHidden = (el) => {
      if (!el || hiddenList.includes(el)) return;
      if (el === subWrapper || subWrapper.contains(el) || el.contains(subWrapper)) return;
      if (isModalElement(el)) return;
      // Não oculta topbar / header nem html/body
      if (el === document.body || el === document.documentElement) return;
      if (el.matches && el.matches('.med-topbar, header, [class*="topbar"], [id*="topbar"]')) return;
      if (el.closest && el.closest('.med-topbar, header')) return;

      const prevDisp = el.style.display;
      el.setAttribute('data-mr-prev-display', prevDisp || '');
      el.style.display = 'none';
      hiddenList.push(el);
    };

    // 1. Containers principais conhecidos da aplicação / snapshot
    const mainTargets = document.querySelectorAll('.main-content-area, main, #app-container, .container, #main-container, [role="main"], .folder-view, .deck-view, #app');
    mainTargets.forEach(el => pushHidden(el));

    // 2. Irmãos de subWrapper dentro do mesmo parent (exceto topbar e modais)
    if (subWrapper && subWrapper.parentNode) {
      Array.from(subWrapper.parentNode.children).forEach(sibling => {
        if (sibling !== subWrapper) {
          pushHidden(sibling);
        }
      });
    }

    // 3. Barras de breadcrumb nativas residuais do snapshot e seus wrappers
    const nativeBreadcrumbs = document.querySelectorAll('.breadcrumb, .breadcrumbs, [class*="breadcrumb"], [id*="breadcrumb"], nav[aria-label*="breadcrumb"], [class*="trail"]');
    nativeBreadcrumbs.forEach(bc => {
      if (!subWrapper.contains(bc)) {
        pushHidden(bc);
        if (bc.parentElement && bc.parentElement !== document.body && !subWrapper.contains(bc.parentElement)) {
          // Oculta também o container que envolve o breadcrumb nativo
          pushHidden(bc.parentElement);
        }
      }
    });

    // 4. Qualquer elemento com texto de breadcrumb nativo residual fora do subWrapper (ex.: "📁 Início" ou "Início /")
    document.querySelectorAll('div, nav, section, p, header').forEach(el => {
      if (!subWrapper.contains(el) && !el.closest('.med-topbar') && !el.closest('header')) {
        const txt = (el.textContent || '').trim();
        if ((txt.startsWith('📁 Início') || txt.startsWith('Início /') || txt.includes('📁 Início /')) && !isModalElement(el)) {
          pushHidden(el);
        }
      }
    });

    window.__mrHiddenMainEls = hiddenList;
    window.__mrHiddenMainEl = hiddenList[0] || null;
  }

  function restoreHiddenNativeElements() {
    const list = Array.isArray(window.__mrHiddenMainEls) ? window.__mrHiddenMainEls : (window.__mrHiddenMainEl ? [window.__mrHiddenMainEl] : []);
    list.forEach(el => {
      if (el && !isModalElement(el)) {
        const prev = el.getAttribute('data-mr-prev-display');
        el.style.display = prev !== null ? prev : '';
        el.removeAttribute('data-mr-prev-display');
      }
    });
    window.__mrHiddenMainEls = null;
    window.__mrHiddenMainEl = null;
  }
  window.__mrRestoreHiddenElements = restoreHiddenNativeElements;

  // 10A. Renderização dedicada para picker de subpastas de uma pasta (quando tem 2+ subpastas)
  function renderSubfoldersPicker(parentId) {
    const parentInfo = resolveFolderInfo(parentId) || { name: 'Pasta' };
    const subfolders = getSubfoldersOf(parentId);
    window.__mrActivePickerParentId = parentId;

    const chain = getBreadcrumbChain(parentId);

    let bpHtml = '<div class="mr-breadcrumb-bar">';
    bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(&quot;home&quot;)">🏠 Início</a>';
    chain.forEach((item, idx) => {
      bpHtml += '<span class="mr-breadcrumb-sep">/</span>';
      if (idx === chain.length - 1) {
        bpHtml += '<span class="mr-breadcrumb-active">' + escapeHtml(item.name) + '</span>';
      } else {
        bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(&quot;' + item.id + '&quot;)">' + escapeHtml(item.name) + '</a>';
      }
    });
    bpHtml += '</div>';

    let contentHtml = \`
      <div class="mr-subfolder-content-container" style="max-width:1280px; margin:0 auto; padding:0.25rem 1rem 1.25rem 1rem;">
        \${bpHtml}

        <div class="mr-subfolder-hero-card" style="background:#ffffff; border:1.5px solid #d1fae5; border-radius:14px; padding:1rem 1.25rem; margin-top:0; margin-bottom:1.25rem; box-shadow:0 3px 12px rgba(0,0,0,0.03);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
            <div>
              <div style="display:flex; align-items:center; gap:0.45rem; margin-bottom:0.15rem;">
                <span style="font-size:1.35rem;">📁</span>
                <h2 style="margin:0; font-size:1.25rem; font-weight:800; color:#14532d; line-height:1.25;">Subpastas de \${escapeHtml(parentInfo.name)}</h2>
              </div>
              <p style="margin:0; color:#64748b; font-size:0.85rem; line-height:1.35;">Selecione uma subpasta para revisar ou gerenciar seus cartões.</p>
            </div>
            <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-sm" onclick="openSubfolderCreateModal('\${parentId}')" style="background:#16a34a; color:#fff; font-weight:800; padding:0.45rem 1rem; border-radius:9px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 2px 8px rgba(22, 163, 74, 0.25);">
                <span>➕</span> Nova Subpasta
              </button>
            </div>          </div>
        </div>

        <!-- Seção de Cartões de Subpastas -->
        <div class="mr-subfolder-section-block" style="margin-top:0; margin-bottom:1.25rem;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; padding-bottom:0.35rem; border-bottom:1.5px solid #d1fae5;">
            <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.45rem;">
              <span>📁</span> Subpastas disponíveis (\${subfolders.length})
            </h3>
          </div>\`;

    if (subfolders.length === 0) {
      contentHtml += \`
        <div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.2rem; text-align:center; font-size:0.88rem; color:#64748b;">
          Nenhuma subpasta encontrada aqui.
          <a href="javascript:void(0)" onclick="openSubfolderCreateModal('\${parentId}')" style="color:#16a34a; font-weight:800; text-decoration:none; margin-left:0.35rem;">Criar subpasta ➜</a>
        </div>
      \`;
    } else {
      contentHtml += \`<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:1.15rem; align-items:stretch;">\`;
      subfolders.forEach(s => {
        const subCards = typeof getFolderAllCards === 'function' ? getFolderAllCards(s.id) : (Array.isArray(s.cards) ? s.cards : []);
        const cCount = subCards.length || (Array.isArray(s.cards) ? s.cards.length : 0);
        contentHtml += \`
          <div class="mr-folder-card mr-tutoria-card mr-subfolder-card" onclick="navigateTo('\${s.id}')" data-subfolder-id="\${s.id}" data-mr-folder-card="1" data-mr-folder-card-header="1" data-mr-folder-card-footer="1" data-mr-folder-top-delete="1" style="position:relative;">
            <button type="button" class="mr-folder-card-top-delete" title="Excluir subpasta" onclick="event.stopPropagation(); if (typeof window.openSubfolderDeleteModal === 'function') { window.openSubfolderDeleteModal('\${s.id}'); } else if (typeof window.openFolderDeleteModal === 'function') { window.openFolderDeleteModal('\${s.id}', true); }" style="position:absolute; top:0.85rem; right:0.85rem; z-index:10; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0.25rem 0.5rem; font-size:0.95rem; cursor:pointer; line-height:1; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(220,38,38,0.12);">🗑</button>
            <div class="mr-folder-card-header mr-tutoria-header">
              <span class="mr-folder-card-badge" style="align-self:flex-start; margin-bottom:0.15rem;">Subpasta</span>
              <div class="mr-folder-card-title-wrap" style="display:flex; align-items:center; gap:0.5rem; min-width:0; width:100%;">
                <span class="mr-folder-card-icon" style="font-size:1.35rem; line-height:1; flex-shrink:0;">📁</span>
                <span class="mr-folder-card-title" style="white-space:normal; overflow:visible; text-overflow:clip; font-size:1.15rem; font-weight:800; color:#14532d; line-height:1.3;">\${escapeHtml(s.name)}</span>
              </div>
            </div>
            <div class="mr-folder-card-footer">
              <div class="mr-folder-card-footer-left">
                <span class="mr-folder-card-count-chip">\${cCount} \${cCount === 1 ? 'carta' : 'cartas'}</span>
              </div>
              <div class="mr-folder-card-actions">
                <button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-subfolder" onclick="event.stopPropagation(); navigateTo('\${s.id}')">Abrir ➜</button>
              </div>
            </div>
          </div>
        \`;
      });
      contentHtml += \`</div>\`;
    }
    contentHtml += \`</div></div>\`;    // Renderiza na tela usando a mecânica aprimorada de ocultamento total e restauração
    const topbar = document.querySelector('.med-topbar') || document.querySelector('header');
    if (topbar && topbar.parentNode) {
      let subWrapper = document.getElementById('mr-subfolder-wrapper');
      if (!subWrapper) {
        subWrapper = document.createElement('div');
        subWrapper.id = 'mr-subfolder-wrapper';
        // Insere logo após a topbar para garantir ordem visual direta
        if (topbar.nextSibling) {
          topbar.parentNode.insertBefore(subWrapper, topbar.nextSibling);
        } else {
          topbar.parentNode.appendChild(subWrapper);
        }
      } else {
        if (topbar.nextSibling && subWrapper !== topbar.nextSibling) {
          topbar.parentNode.insertBefore(subWrapper, topbar.nextSibling);
        }
      }

      document.querySelectorAll('p, div').forEach(el => {
        if (el.textContent && el.textContent.includes('Motor de repetição espaçada: FSRS-5') && !el.closest('#mr-subfolder-wrapper') && !el.querySelector('#mr-subfolder-wrapper')) {
          el.setAttribute('data-mr-subfolder-hidden-banner', '1');
          el.style.display = 'none';
        }
      });

      // Oculta TODOS os containers nativos e breadcrumbs residuais do snapshot
      hideNativeContentForSubfolder(subWrapper);

      subWrapper.style.display = 'block';
      subWrapper.removeAttribute('data-active-subfolder');
      subWrapper.setAttribute('data-active-picker-parent', parentId);
      window.__mrActiveSubfolderId = null;
      window.__mrActivePickerParentId = parentId;
      subWrapper.innerHTML = contentHtml;
    } else {
      const viewContainer = document.querySelector('.main-content-area') || document.querySelector('.container') || document.querySelector('main') || document.body;
      viewContainer.innerHTML = contentHtml;
    }
    requestAnimationFrame(() => {
      // Re-aplica ocultamento caso mutações do snapshot tenham criado novos nós
      const sw = document.getElementById('mr-subfolder-wrapper');
      if (sw && sw.style.display !== 'none') {
        hideNativeContentForSubfolder(sw);
      }
      enhanceViews();
      setTimeout(() => {
        if (sw && sw.style.display !== 'none') hideNativeContentForSubfolder(sw);
        enhanceViews();
      }, 120);
      setTimeout(() => {
        if (sw && sw.style.display !== 'none') hideNativeContentForSubfolder(sw);
        enhanceViews();
      }, 300);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.renderSubfoldersPicker = renderSubfoldersPicker;

  // 10. Renderização dedicada para visualização de subpastas
  function renderSubfolderView(subfolderId) {
    const sf = getSubfolderStore()[subfolderId];
    if (!sf) return;

    // Sincroniza rota com React / router
    if (typeof window.__mrNavigateTo === 'function') {
      try { window.__mrNavigateTo(subfolderId); } catch { /* intentionally ignored */ }
    }

    // Atualiza rota global se existir
    if (typeof currentRoute !== 'undefined') {
      window.currentRoute = subfolderId;
    }
    if (typeof studyState !== 'undefined') {
      studyState.deckId = subfolderId;
      studyState.deckTitle = sf.name;
    }

    const chain = getBreadcrumbChain(subfolderId);
    const subfolders = getSubfoldersOf(subfolderId);
    const cards = sf.cards || [];

    // Prepara container principal
    const mainEl = document.querySelector('main') || document.getElementById('app-container') || document.body;

    let bpHtml = '<div class="mr-breadcrumb-bar">';
    bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(&quot;home&quot;)">🏠 Início</a>';
    chain.forEach((item, idx) => {
      bpHtml += '<span class="mr-breadcrumb-sep">/</span>';
      if (idx === chain.length - 1) {
        bpHtml += '<span class="mr-breadcrumb-active">' + escapeHtml(item.name) + '</span>';
      } else {
        bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(&quot;' + item.id + '&quot;)">' + escapeHtml(item.name) + '</a>';
      }
    });
    bpHtml += '</div>';

    let contentHtml = \`
      <div class="mr-subfolder-content-container" style="max-width:1280px; margin:0 auto; padding:0.25rem 1rem 1.25rem 1rem;">
        \${bpHtml}

        <div class="mr-subfolder-hero-card" style="background:#ffffff; border:1.5px solid #d1fae5; border-radius:14px; padding:1rem 1.25rem; margin-top:0; margin-bottom:1.25rem; box-shadow:0 3px 12px rgba(0,0,0,0.03);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
            <div>
              <div style="display:flex; align-items:center; gap:0.45rem; margin-bottom:0.15rem;">
                <span style="font-size:1.35rem;">📁</span>
                <h2 style="margin:0; font-size:1.25rem; font-weight:800; color:#14532d; line-height:1.25;">\${escapeHtml(sf.name)}</h2>
              </div>
              <p style="margin:0; color:#64748b; font-size:0.85rem; line-height:1.35;">\${escapeHtml(sf.description || 'Subpasta de estudo médica')}</p>
            </div>
            <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-sm mr-import-csv-btn" onclick="openCsvImportModal('\${subfolderId}')" style="background:#f0fdf4; color:#15803d; font-weight:800; padding:0.45rem 0.95rem; border-radius:9px; border:1.5px solid #86efac; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <span>📥</span> Importar CSV
              </button>
              <button type="button" class="btn btn-sm" onclick="openCreateChoice('\${subfolderId}')" style="background:#16a34a; color:#fff; font-weight:800; padding:0.45rem 1rem; border-radius:9px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 2px 8px rgba(22, 163, 74, 0.25);">
                <span>➕</span> Criar (Pasta ou Carta)
              </button>
              <button type="button" class="btn btn-sm" onclick="startSubfolderStudy('\${subfolderId}')" style="background:#059669; color:#fff; font-weight:800; padding:0.45rem 1rem; border-radius:9px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem;">
                <span>⚡</span> Revisar (\${cards.length})
              </button>
              <button type="button" class="btn btn-sm" title="Excluir subpasta" onclick="if (typeof window.openSubfolderDeleteModal === 'function') { window.openSubfolderDeleteModal('\${subfolderId}'); } else if (typeof window.openFolderDeleteModal === 'function') { window.openFolderDeleteModal('\${subfolderId}', true); }" style="background:#fef2f2; color:#dc2626; border:1.5px solid #fecaca; font-weight:800; padding:0.45rem 0.95rem; border-radius:9px; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 1px 4px rgba(220,38,38,0.08);">
                <span>🗑</span> Excluir
              </button>
            </div>
          </div>
        </div>

        <!-- Seção de Subpastas Aninhadas -->
        <div class="mr-subfolder-section-block" style="margin-top:0; margin-bottom:1.25rem;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; padding-bottom:0.35rem; border-bottom:1.5px solid #d1fae5;">
            <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.45rem;">
              <span>📁</span> Subpastas (\${subfolders.length})
            </h3>
            <button type="button" onclick="openSubfolderCreateModal('\${subfolderId}')" style="background:#f0fdf4; color:#166534; border:1px solid #86efac; border-radius:8px; padding:0.35rem 0.8rem; font-size:0.83rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.3rem;">
              ➕ Nova Subpasta
            </button>
          </div>    \`;

    if (subfolders.length === 0) {
      contentHtml += \`
        <div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.2rem; text-align:center; font-size:0.88rem; color:#64748b;">
          Nenhuma subpasta criada aqui ainda.
          <a href="javascript:void(0)" onclick="openSubfolderCreateModal('\${subfolderId}')" style="color:#16a34a; font-weight:800; text-decoration:none; margin-left:0.35rem;">Criar subpasta ➜</a>
        </div>
      \`;
    } else {
      contentHtml += \`<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:1.15rem; align-items:stretch;">\`;
      subfolders.forEach(s => {
        const subCards = typeof getFolderAllCards === 'function' ? getFolderAllCards(s.id) : (Array.isArray(s.cards) ? s.cards : []);
        const cCount = subCards.length || (Array.isArray(s.cards) ? s.cards.length : 0);
        contentHtml += \`
          <div class="mr-folder-card mr-tutoria-card mr-subfolder-card" onclick="navigateTo('\${s.id}')" data-subfolder-id="\${s.id}" data-mr-folder-card="1" data-mr-folder-card-header="1" data-mr-folder-card-footer="1" data-mr-folder-top-delete="1" style="position:relative;">
            <button type="button" class="mr-folder-card-top-delete" title="Excluir subpasta" onclick="event.stopPropagation(); if (typeof window.openSubfolderDeleteModal === 'function') { window.openSubfolderDeleteModal('\${s.id}'); } else if (typeof window.openFolderDeleteModal === 'function') { window.openFolderDeleteModal('\${s.id}', true); }" style="position:absolute; top:0.85rem; right:0.85rem; z-index:10; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0.25rem 0.5rem; font-size:0.95rem; cursor:pointer; line-height:1; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(220,38,38,0.12);">🗑</button>
            <div class="mr-folder-card-header mr-tutoria-header">
              <span class="mr-folder-card-badge" style="align-self:flex-start; margin-bottom:0.15rem;">Subpasta</span>
              <div class="mr-folder-card-title-wrap" style="display:flex; align-items:center; gap:0.5rem; min-width:0; width:100%;">
                <span class="mr-folder-card-icon" style="font-size:1.35rem; line-height:1; flex-shrink:0;">📁</span>
                <span class="mr-folder-card-title" style="white-space:normal; overflow:visible; text-overflow:clip; font-size:1.15rem; font-weight:800; color:#14532d; line-height:1.3;">\${escapeHtml(s.name)}</span>
              </div>
            </div>
            <div class="mr-folder-card-footer">
              <div class="mr-folder-card-footer-left">
                <span class="mr-folder-card-count-chip">\${cCount} \${cCount === 1 ? 'carta' : 'cartas'}</span>
              </div>
              <div class="mr-folder-card-actions">
                <button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-subfolder" onclick="event.stopPropagation(); navigateTo('\${s.id}')">Abrir ➜</button>
              </div>
            </div>
          </div>
        \`;
      });
      contentHtml += \`</div>\`;
    }
    contentHtml += \`</div>\`;    // Seção de Cartas desta Subpasta
    contentHtml += \`
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.9rem; padding-bottom:0.4rem; border-bottom:1.5px solid #d1fae5;">
          <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.45rem;">
            <span>🗂️</span> Cartas de Revisão (\${cards.length})
          </h3>
          <div style="display:flex; gap:0.45rem; align-items:center;">
            <button type="button" onclick="openCsvImportModal('\${subfolderId}')" style="background:#f0fdf4; color:#15803d; border:1px solid #86efac; border-radius:8px; padding:0.35rem 0.75rem; font-size:0.82rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.25rem;">
              📥 Importar CSV
            </button>
            <button type="button" onclick="openNewCardModal('\${subfolderId}')" style="background:#16a34a; color:#fff; border:none; border-radius:8px; padding:0.35rem 0.85rem; font-size:0.83rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:0.3rem;">
              ➕ Nova Carta
            </button>
          </div>
        </div>
    \`;

    if (cards.length === 0) {
      contentHtml += \`
        <div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.4rem; text-align:center; font-size:0.88rem; color:#64748b; display:flex; flex-direction:column; align-items:center; gap:0.75rem;">
          <div>Nenhuma carta nesta pasta ainda. Comece criando manualmente ou importando seu arquivo CSV:</div>
          <div style="display:inline-flex; align-items:center; gap:0.6rem; flex-wrap:wrap; justify-content:center;">
            <button class="med-nav-btn" onclick="openCsvImport(typeof currentFolderContext === 'function' ? currentFolderContext() : (typeof studyState !== 'undefined' ? studyState.deckId : null))">📥 Importar CSV</button>
            <a href="javascript:void(0)" onclick="openNewCardModal('\${subfolderId}')" style="background:#16a34a; color:#fff; font-weight:800; text-decoration:none; padding:0.45rem 1rem; border-radius:8px; display:inline-flex; align-items:center; gap:0.35rem;">➕ Criar primeira carta</a>
          </div>
        </div>
      \`;
    } else {
      contentHtml += \`<div style="display:flex; flex-direction:column; gap:0.75rem;">\`;
      cards.forEach((c, idx) => {
        contentHtml += \`
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:1rem 1.2rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
            <div style="flex:1;">
              <div style="font-weight:700; font-size:0.92rem; color:#0f172a; margin-bottom:0.25rem;">\${escapeHtml(c.q || 'Sem pergunta')}</div>
              <div style="font-size:0.8rem; color:#475569;">\${escapeHtml((c.a || '').slice(0, 80))}\${(c.a || '').length > 80 ? '...' : ''}</div>
            </div>
            <button type="button" onclick="studySingleCard('\${c.id}')" style="background:#f0fdf4; color:#15803d; border:1px solid #86efac; border-radius:8px; padding:0.35rem 0.75rem; font-weight:700; font-size:0.82rem; cursor:pointer;">
              Revisar
            </button>
          </div>
        \`;
      });
      contentHtml += \`</div>\`;
    }

    contentHtml += \`</div></div>\`;
    // Renderiza na tela usando a mecânica aprimorada de ocultamento total e restauração
    const topbar = document.querySelector('.med-topbar') || document.querySelector('header');
    if (topbar && topbar.parentNode) {
      let subWrapper = document.getElementById('mr-subfolder-wrapper');
      if (!subWrapper) {
        subWrapper = document.createElement('div');
        subWrapper.id = 'mr-subfolder-wrapper';
        if (topbar.nextSibling) {
          topbar.parentNode.insertBefore(subWrapper, topbar.nextSibling);
        } else {
          topbar.parentNode.appendChild(subWrapper);
        }
      } else {
        if (topbar.nextSibling && subWrapper !== topbar.nextSibling) {
          topbar.parentNode.insertBefore(subWrapper, topbar.nextSibling);
        }
      }

      document.querySelectorAll('p, div').forEach(el => {
        if (el.textContent && el.textContent.includes('Motor de repetição espaçada: FSRS-5') && !el.closest('#mr-subfolder-wrapper') && !el.querySelector('#mr-subfolder-wrapper')) {
          el.setAttribute('data-mr-subfolder-hidden-banner', '1');
          el.style.display = 'none';
        }
      });

      // Oculta TODOS os containers nativos e breadcrumbs residuais do snapshot
      hideNativeContentForSubfolder(subWrapper);

      subWrapper.style.display = 'block';
      subWrapper.setAttribute('data-active-subfolder', subfolderId);
      subWrapper.removeAttribute('data-active-picker-parent');
      window.__mrActiveSubfolderId = subfolderId;
      window.__mrActivePickerParentId = null;
      subWrapper.innerHTML = contentHtml;
    } else {
      const viewContainer = document.querySelector('.main-content-area') || document.querySelector('.container') || document.querySelector('main') || document.body;
      viewContainer.innerHTML = contentHtml;
    }
    requestAnimationFrame(() => {
      const sw = document.getElementById('mr-subfolder-wrapper');
      if (sw && sw.style.display !== 'none') {
        hideNativeContentForSubfolder(sw);
      }
      enhanceViews();
      setTimeout(() => {
        if (sw && sw.style.display !== 'none') hideNativeContentForSubfolder(sw);
        enhanceViews();
      }, 120);
      setTimeout(() => {
        if (sw && sw.style.display !== 'none') hideNativeContentForSubfolder(sw);
        enhanceViews();
      }, 300);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 11. Inicia estudo de uma subpasta
  window.startSubfolderStudy = function(subfolderId) {
    const sf = getSubfolderStore()[subfolderId];
    if (!sf || !sf.cards || sf.cards.length === 0) {
      alert('Esta pasta não tem cartas para revisar. Adicione uma carta primeiro!');
      return;
    }
    if (typeof startStudySession === 'function') {
      startStudySession(subfolderId, sf.cards);
    } else if (typeof studyDeck === 'function') {
      studyDeck(subfolderId);
    }
  };

  // 12. Salvar carta na subpasta caso o modal nativo salve
  const origSaveNewCard = window.saveNewCard;
  window.saveNewCard = function(ctx) {
    const targetCtx = ctx || window.__activeFolderContext;
    const sfStore = getSubfolderStore();
    if (targetCtx && sfStore[targetCtx]) {
      // Captura inputs do modal de carta
      const qInput = document.getElementById('input-card-q') || document.getElementById('card-q');
      const aInput = document.getElementById('input-card-a') || document.getElementById('card-a');
      const refInput = document.getElementById('input-card-ref') || document.getElementById('card-ref');
      const clinCheck = document.getElementById('check-card-clinical') || document.getElementById('card-clinical');

      const q = qInput ? qInput.value.trim() : '';
      const a = aInput ? aInput.value.trim() : '';
      const ref = refInput ? refInput.value.trim() : '';
      const clinical = clinCheck ? clinCheck.checked : false;

      if (!q || !a) {
        alert('Por favor preencha pergunta e resposta.');
        return;
      }

      const newCard = {
        id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        q,
        a,
        ref: ref || 'Anotações Pessoais / Referência Médica',
        clinical,
        repetitions: 0,
        interval: 0,
        easeFactor: 2.5,
        dueDate: Date.now(),
        fsrsS: null,
        fsrsD: null,
        fsrsState: 'new',
        lapses: 0,
        containerId: targetCtx,
        folderTitle: sfStore[targetCtx].name
      };

      sfStore[targetCtx].cards.push(newCard);
      persistSubfolders();
      if (typeof saveState === 'function') {
        saveState();
      }

      if (typeof closeNewCardModal === 'function') closeNewCardModal();
      if (typeof showToast === 'function') showToast('Carta adicionada com sucesso!');

      renderSubfolderView(targetCtx);
      return;
    }

    if (typeof origSaveNewCard === 'function') {
      origSaveNewCard(ctx);
    }
  };

  function suppressNativeStatsModal() {
    try {
      const candidates = document.querySelectorAll(
        '[style*="position: fixed"], [style*="position:fixed"], .modal, [class*="modal"]'
      );
      candidates.forEach(el => {
        if (el.id === 'global-stats-modal' || el.closest('#global-stats-modal') || el.closest('.med-topbar')) return;
        const h = el.querySelector('h2, h3, h4, .modal-title');
        const t = ((h && h.textContent) || el.textContent || '').trim();
        if (t.includes('Estatísticas Detalhadas de Desempenho')) {
          if (el !== document.body && el.id !== 'global-stats-modal') {
            try { el.remove(); } catch { /* intentionally ignored */ }
          }
        }
      });
    } catch { /* intentionally ignored */ }
  }
  window.suppressNativeStatsModal = suppressNativeStatsModal;

  // 13. Decorador de telas padrão (Tutoria, Provas, Módulos, etc.)
  function enhanceViews() {
    suppressNativeStatsModal();
    // Garante que cartões de subpasta (.mr-subfolder-card) tenham clique funcional e desimpedido para abrir a subpasta
    try {
      const subfolderCards = document.querySelectorAll('.mr-subfolder-card');
      subfolderCards.forEach(sCard => {
        const onclickAttr = sCard.getAttribute('onclick') || '';
        const match = onclickAttr.match(/navigateTo(['"]([^'"]+)['"])/) || onclickAttr.match(/renderSubfolderView(['"]([^'"]+)['"])/);
        const subId = match ? match[1] : sCard.getAttribute('data-subfolder-id');
        if (subId) {
          sCard.style.cursor = 'pointer';
          sCard.onclick = function(e) {
            e.stopPropagation();
            if (typeof renderSubfolderView === 'function' && getSubfolderStore()[subId]) {
              renderSubfolderView(subId);
            } else if (typeof window.navigateTo === 'function') {
              window.navigateTo(subId);
            } else if (typeof navigateTo === 'function') {
              navigateTo(subId);
            }
          };

          // Injeção do botão 🗑 no canto superior direito do cartão de subpasta
          if (sCard.getAttribute('data-mr-folder-top-delete') !== '1' && !sCard.querySelector('.mr-folder-card-top-delete')) {
            const currentPos = window.getComputedStyle(sCard).position;
            if (!currentPos || currentPos === 'static') {
              sCard.style.position = 'relative';
            }
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'mr-folder-card-top-delete';
            delBtn.title = 'Excluir pasta';
            delBtn.style.cssText = 'position:absolute; top:0.85rem; right:0.85rem; z-index:10; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0.25rem 0.5rem; font-size:0.95rem; cursor:pointer; line-height:1; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(220,38,38,0.12);';
            delBtn.innerHTML = '🗑';
            delBtn.title = 'Excluir subpasta';
            delBtn.onclick = function(e) {
              e.stopPropagation();
              if (typeof window.openSubfolderDeleteModal === 'function') {
                window.openSubfolderDeleteModal(subId);
              } else if (typeof window.openFolderDeleteModal === 'function') {
                window.openFolderDeleteModal(subId, true);
              }
            };
            sCard.appendChild(delBtn);
            sCard.setAttribute('data-mr-folder-top-delete', '1');
          }
        }
      });
    } catch (e) {
      console.warn('Erro ao assegurar cliques de subpastas:', e);
    }

    // Padronização visual dos cartões de pasta (.mr-folder-card)
    try {
      const folderCards = document.querySelectorAll('.mr-subfolder-card, .deck-card, .folder-card, .mr-tutoria-card, [data-folder-id], [data-deck-id], div[onclick*="tutoria_"]');
      folderCards.forEach(card => {
        // EXCLUIR .mr-subfolder-card da injeção de rodapé/decoração para preservar o clique nativo de abrir a subpasta
        if (card.classList.contains('mr-subfolder-card')) return;

        // Injeção do botão 🗑 no canto superior direito de todo .mr-folder-card (com guard de duplicidade)
        if (card.getAttribute('data-mr-folder-top-delete') !== '1' && !card.querySelector('.mr-folder-card-top-delete')) {
          // Garante position:relative inline no cartão
          const currentPos = window.getComputedStyle(card).position;
          if (!currentPos || currentPos === 'static') {
            card.style.position = 'relative';
          }

          // Determina id da pasta para exclusão
          const rawOnclick = card.getAttribute('onclick') || '';
          const idMatch = rawOnclick.match(/navigateTo(['"]([^'"]+)['"])/) ||
                          rawOnclick.match(/studyDeck(['"]([^'"]+)['"])/) ||
                          rawOnclick.match(/tutoria_d+/i);
          const rawTitleCard = card.querySelector('h2, h3, h4, .deck-title, .folder-title, .title, strong');
          const titleCardTxt = (rawTitleCard?.textContent || card.getAttribute('data-folder-name') || '').trim();
          const cardTutoriaMatch = titleCardTxt.match(/tutorias*(d+)/i);
          const cardTutoriaId = cardTutoriaMatch ? ('tutoria_' + cardTutoriaMatch[1]) : null;

          const cardFolderId = card.getAttribute('data-folder-id') ||
                               card.getAttribute('data-deck-id') ||
                               card.getAttribute('data-subfolder-id') ||
                               (idMatch ? idMatch[1] || idMatch[0] : null) ||
                               cardTutoriaId;

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'mr-folder-card-top-delete';
          delBtn.title = 'Excluir pasta';
          delBtn.setAttribute('data-mr-folder-delete', '1');
          if (cardFolderId) delBtn.setAttribute('data-folder-id', cardFolderId);
          if (titleCardTxt) delBtn.setAttribute('data-folder-title', titleCardTxt);
          delBtn.style.cssText = 'position:absolute; top:12px; right:12px; width:34px; height:34px; min-width:34px; min-height:34px; box-sizing:border-box; z-index:10; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0; font-size:15px; cursor:pointer; line-height:1; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(220,38,38,0.12);';
          delBtn.innerHTML = '🗑';
          delBtn.onclick = function(e) {
            e.stopPropagation();
            const effId = cardFolderId || card.getAttribute('data-folder-id') || card.getAttribute('data-deck-id');
            const effTitle = titleCardTxt || card.getAttribute('data-folder-name') || '';
            if (typeof window.openFolderDeleteModal === 'function') {
              window.openFolderDeleteModal(effId, effTitle);
            }
          };
          card.appendChild(delBtn);
          card.setAttribute('data-mr-folder-top-delete', '1');
        }
        // Guarda para não duplicar cabeçalho
        const alreadyHasHeader = card.getAttribute('data-mr-folder-card-header') === '1';

        card.classList.add('mr-folder-card');
        card.setAttribute('data-mr-folder-card', '1');
        const rawTitleEl = card.querySelector('h2, h3, h4, .deck-title, .folder-title, .title, strong');
        const titleText = (rawTitleEl?.textContent || card.getAttribute('data-folder-name') || '').trim();

        // 2. DETECÇÃO DE ID em cadeia de prioridades:
        // (a) card.getAttribute('data-folder-id')
        // (b) card.getAttribute('data-deck-id')
        // (c) card.getAttribute('onclick')?.match(/navigateTo(['"]([^'"]+)['"])/)?.[1] (também tente studyDeck()
        // (d) regex sobre o texto do título do cartão: titleText.match(/tutoria\\s*(\\d+)/i) -> tutoria + num
        const onclickAttr = card.getAttribute('onclick') || '';
        const navMatch = onclickAttr.match(/navigateTo(['"]([^'"]+)['"])/)?.[1] ||
                         onclickAttr.match(/studyDeck(['"]([^'"]+)['"])/)?.[1] ||
                         onclickAttr.match(/tutoria_\\d+/i)?.[0];
        const titleTutoriaMatch = titleText.match(/tutoria\\s*(\\d+)/i);
        const titleTutoriaId = titleTutoriaMatch ? ('tutoria_' + titleTutoriaMatch[1]) : null;

        const effectiveFolderId = card.getAttribute('data-folder-id') ||
                                  card.getAttribute('data-deck-id') ||
                                  navMatch ||
                                  titleTutoriaId ||
                                  null;

        const lowerTitle = titleText.toLowerCase();
        const lowerId = (effectiveFolderId || '').toLowerCase();

        // 1. Flags de identificação conforme plano
        const isCustomRoot = !!(state.custom_root_folders && effectiveFolderId && state.custom_root_folders[effectiveFolderId]);
        const isCustomProva = !!(state.custom_prova_folders && effectiveFolderId && state.custom_prova_folders[effectiveFolderId]);
        const isCustomTutoria = !!(state.custom_tutoria_folders && effectiveFolderId && state.custom_tutoria_folders[effectiveFolderId]);

        // 2. isTutoriaCard existente
        const isTutoriaCard = lowerTitle.includes('tutoria') || lowerId.includes('tutoria');

        // 3. isProvaCard
        const isProvaCard = !isTutoriaCard && (
          isCustomProva ||
          lowerTitle.includes('prova') ||
          lowerId.includes('prova') ||
          lowerTitle.includes('cardio') ||
          lowerTitle.includes('módulo') ||
          lowerTitle.includes('modulo') ||
          card.classList.contains('deck-card')
        );

        // 4. isCustomFolder
        const isCustomFolder = !isTutoriaCard && !isProvaCard && (isCustomRoot || isCustomTutoria);

        // 5. Badge e ícone por tipo
        let categoryBadge = 'Pasta';
        let icon = '📁';
        if (isTutoriaCard) {
          categoryBadge = 'PBL/Tutoria';
        } else if (isProvaCard) {
          categoryBadge = '📝 Provas';
          icon = '📝';
        } else if (isCustomFolder) {
          categoryBadge = '📁 Pasta';
          icon = '📁';
        } else if (card.classList.contains('mr-subfolder-card')) {
          categoryBadge = 'Subpasta';
          icon = '📁';
        }

        const iconMatch = titleText.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])/u);
        let cleanTitle = titleText;
        if (iconMatch) {
          // Se o título original já trazia um emoji próprio, preservamos o ícone do título
          icon = iconMatch[0];
          cleanTitle = cleanTitle.replace(icon, '').trim();
        }

        // 3. LIMPEZA DO TOPO NATIVO: captura handlers antigos de reset e lixeira
        let nativeDeleteHandler = null;
        let nativeDeleteOnclick = '';
        const nativeDeleteBtn = card.querySelector('button[title*="Excluir"], button[title*="excluir"], button[title*="Apagar"], button[title*="apagar"], button[onclick*="delete"], button[onclick*="remove"], .btn-delete, .deck-delete-btn, .delete-btn');
        if (nativeDeleteBtn) {
          nativeDeleteOnclick = nativeDeleteBtn.getAttribute('onclick') || '';
          if (typeof nativeDeleteBtn.onclick === 'function') {
            nativeDeleteHandler = nativeDeleteBtn.onclick;
          }
          nativeDeleteBtn.remove();
        } else {
          // Também busca botões com ícone de lixeira 🗑 no topo do cartão
          card.querySelectorAll('button, a, span.btn, .action-btn').forEach(btn => {
            const txt = (btn.textContent || '').trim();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const clk = btn.getAttribute('onclick') || '';
            if (txt === '🗑' || txt === '🗑️' || title.includes('excluir') || title.includes('apagar') || clk.includes('delete') || clk.includes('excluir')) {
              nativeDeleteOnclick = clk;
              if (typeof btn.onclick === 'function') nativeDeleteHandler = btn.onclick;
              btn.remove();
            }
          });
        }

        // Remove botões de reset nativos soltos do canto superior direito
        card.querySelectorAll('button, a, span.btn, .action-btn').forEach(btn => {
          if (btn.closest('.mr-folder-card-footer')) return;
          const txt = (btn.textContent || '').trim();
          const title = (btn.getAttribute('title') || '').toLowerCase();
          const clk = btn.getAttribute('onclick') || '';
          if (txt === '🔄' || txt === '🔁' || title.includes('reset') || clk.includes('reset')) {
            btn.remove();
          }
        });

        // 6. Aplicação da classe .mr-tutoria-card para Tutoria, Provas e Custom Folders
        const shouldUseStandardCard = isTutoriaCard || isProvaCard || isCustomFolder;
        if (shouldUseStandardCard) {
          card.classList.add('mr-tutoria-card');
        }

        // 4. CABEÇALHO PADRONIZADO (.mr-tutoria-header, chip no topo esquerdo, título com ícone)
        if (!alreadyHasHeader) {
          let headerEl = card.querySelector('.mr-folder-card-header');
          if (!headerEl) {
            headerEl = document.createElement('div');
            if (shouldUseStandardCard) {
              headerEl.className = 'mr-folder-card-header mr-tutoria-header';
              headerEl.innerHTML =
                '<span class="mr-folder-card-badge" style="align-self:flex-start; margin-bottom:0.15rem;">' + escapeHtml(categoryBadge) + '</span>' +
                '<div class="mr-folder-card-title-wrap" style="display:flex; align-items:center; gap:0.5rem; min-width:0; width:100%;">' +
                  '<span class="mr-folder-card-icon" style="font-size:1.35rem; line-height:1; flex-shrink:0;">' + icon + '</span>' +
                  '<span class="mr-folder-card-title" style="white-space:normal; overflow:visible; text-overflow:clip; font-size:1.15rem; font-weight:800; color:#14532d; line-height:1.3;">' +
                    (escapeHtml(cleanTitle) || 'Pasta') +
                  '</span>' +
                '</div>';
            } else {
              headerEl.className = 'mr-folder-card-header';
              headerEl.innerHTML =
                '<div class="mr-folder-card-title-wrap" style="display:flex; align-items:center; gap:0.5rem; min-width:0; flex:1;">' +
                  '<span class="mr-folder-card-icon" style="font-size:1.35rem; line-height:1; flex-shrink:0;">' + icon + '</span>' +
                  '<span class="mr-folder-card-title" style="white-space:normal; overflow:visible; text-overflow:clip; font-size:1.15rem; font-weight:800; color:#14532d; line-height:1.3;">' +
                    (escapeHtml(cleanTitle) || 'Pasta') +
                  '</span>' +
                '</div>' +
                '<span class="mr-folder-card-badge">' + escapeHtml(categoryBadge) + '</span>';
            }

            if (rawTitleEl && rawTitleEl.parentNode) {
              rawTitleEl.remove();
            }

            card.insertBefore(headerEl, card.firstChild);
          }

          card.setAttribute('data-mr-folder-card-header', '1');
        }

        // Captura da contagem nativa de cartas do cartão de tutoria ANTES da limpeza
        let nativeCardCount = null;
        if (isTutoriaCard) {
          // Busca em nós de texto e elementos filhos fora do header já criado
          const findCardCountInText = (str) => {
            const m = (str || '').match(/(\\d+)\\s*cartas?/i);
            return m ? parseInt(m[1], 10) : null;
          };

          // 1. Nós diretos de texto
          for (let i = 0; i < card.childNodes.length; i++) {
            const n = card.childNodes[i];
            if (n.nodeType === Node.TEXT_NODE) {
              const parsed = findCardCountInText(n.nodeValue);
              if (parsed !== null && parsed > 0) {
                nativeCardCount = parsed;
                break;
              }
            }
          }

          // 2. Elementos filhos (fora do header)
          if (nativeCardCount === null) {
            const candidateEls = card.querySelectorAll('p, div, span, small, b, strong, em');
            for (let i = 0; i < candidateEls.length; i++) {
              const el = candidateEls[i];
              if (!el.closest('.mr-folder-card-header')) {
                const parsed = findCardCountInText(el.textContent);
                if (parsed !== null && parsed > 0) {
                  nativeCardCount = parsed;
                  break;
                }
              }
            }
          }

          // 3. Fallback: textContent geral excluindo header
          if (nativeCardCount === null) {
            const headerEl = card.querySelector('.mr-folder-card-header');
            const headerTxt = headerEl ? headerEl.textContent || '' : '';
            const wholeTxt = card.textContent || '';
            const strippedTxt = wholeTxt.replace(headerTxt, '');
            const parsed = findCardCountInText(strippedTxt);
            if (parsed !== null && parsed > 0) {
              nativeCardCount = parsed;
            }
          }
        }

        // Limpeza de ícones e contagens nativas duplicadas no corpo do cartão
        if (shouldUseStandardCard) {
          // Remove ícone de pasta e ícones residuais no corpo do cartão (.deck-icon, .folder-icon, img, svg, i) fora do header e footer
          card.querySelectorAll('.deck-icon, .folder-icon, img, svg, i').forEach(el => {
            if (!el.closest('.mr-folder-card-header') && !el.closest('.mr-folder-card-footer')) {
              el.remove();
            }
          });
          // Remove nós de texto ou elementos com "34 cartas", "cartas", contagem nativa solta no corpo
          card.querySelectorAll('p, div, span, small').forEach(el => {
            if (!el.closest('.mr-folder-card-header') && !el.closest('.mr-folder-card-footer')) {
              const txt = (el.textContent || '').trim();
              if (txt.match(/^\\d+\\s*cartas?$/i) || txt === '📁' || txt === '📝' || txt.includes('dominado') || txt.toLowerCase() === 'cartas' || txt.toLowerCase() === 'carta') {
                el.remove();
              }
            }
          });
          // Limpa nós de texto soltos filhos diretos do cartão com contagem de cartas
          Array.from(card.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              const val = (node.nodeValue || '').trim();
              if (val.match(/^\\d+\\s*cartas?$/i) || val === '📁' || val === '📝' || val.toLowerCase() === 'cartas' || val.toLowerCase() === 'carta') {
                node.remove();
              }
            }
          });
        }

        // Injeção do RODAPÉ padronizado (.mr-folder-card-footer)
        if (card.getAttribute('data-mr-folder-card-footer') !== '1') {
          const allFolderCards = effectiveFolderId ? getFolderAllCards(effectiveFolderId) : [];
          let totalCards = 0;
          if (typeof nativeCardCount === 'number' && nativeCardCount > 0) {
            totalCards = nativeCardCount;
          } else if (allFolderCards && allFolderCards.length > 0) {
            totalCards = allFolderCards.length;
          }

          let masteredCards = 0;
          allFolderCards.forEach(c => {
            const ivl = typeof c.interval === 'number' ? c.interval : (typeof c.fsrsS === 'number' ? c.fsrsS : 0);
            if (ivl >= 21) {
              masteredCards++;
            }
          });

          const pct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;

          // Remove rodapés anteriores não padronizados dentro do cartão
          const oldFooters = card.querySelectorAll('.mr-folder-card-footer, .deck-footer, .folder-footer');
          oldFooters.forEach(f => f.remove());

          const footerEl = document.createElement('div');
          footerEl.className = 'mr-folder-card-footer';
          const leftContent = '<span class="mr-folder-card-count-chip">' + totalCards + ' ' + (totalCards === 1 ? 'carta' : 'cartas') + '</span>';

          footerEl.innerHTML =
            '<div class="mr-folder-card-footer-left">' +
              leftContent +
            '</div>' +
            '<div class="mr-folder-card-actions">' +
              '<button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-reset" title="Resetar progresso das cartas">🔄 Resetar</button>' +
              '<button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-add" title="Adicionar carta nesta pasta">+ Carta</button>' +
              '<button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-subfolder" title="Acessar subpasta desta pasta">📁 Subpasta</button>' +
              '<button type="button" class="mr-folder-card-btn-delete" title="Excluir pasta" data-mr-folder-delete="1" data-folder-id="' + (effectiveFolderId || '') + '" data-folder-title="' + (cleanTitle ? cleanTitle.replace(/"/g, '&quot;') : '') + '" style="flex: 0 0 34px; width: 34px; height: 34px; min-width: 34px; min-height: 34px; border-radius: 8px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; font-size: 15px;">🗑</button>' +
            '</div>';
          const resetBtn = footerEl.querySelector('.mr-folder-card-btn-reset');
          if (resetBtn) {
            resetBtn.onclick = function(e) {
              e.stopPropagation();
              if (totalCards === 0) {
                if (typeof showToast === 'function') showToast('Esta pasta não possui cartas para resetar.');
                return;
              }
              const confirmReset = window.confirm('Deseja resetar o progresso FSRS-5 de ' + totalCards + ' carta(s) desta pasta?');
              if (!confirmReset) return;

              const nowMs = Date.now();
              allFolderCards.forEach(c => {
                c.repetitions = 0;
                c.interval = 0;
                c.easeFactor = 2.5;
                c.dueDate = nowMs;
                c.fsrsS = null;
                c.fsrsD = null;
                c.fsrsState = 'new';
                c.lapses = 0;
                c.lastReviewMs = null;
              });

              if (typeof saveState === 'function') saveState();
              if (typeof showToast === 'function') {
                showToast('Progresso FSRS-5 resetado com sucesso (' + totalCards + ' cartas)!');
              }
              if (typeof renderRoute === 'function') renderRoute();
            };
          }

          const addBtn = footerEl.querySelector('.mr-folder-card-btn-add');
          if (addBtn) {
            addBtn.onclick = function(e) {
              e.stopPropagation();
              const targetId = effectiveFolderId || (typeof currentFolderContext === 'function' ? currentFolderContext() : null);
              if (typeof openCreateChoice === 'function') {
                openCreateChoice(targetId);
              } else if (typeof openNewCardModal === 'function') {
                openNewCardModal(targetId);
              }
            };
          }

          const subfolderBtn = footerEl.querySelector('.mr-folder-card-btn-subfolder');
          if (subfolderBtn) {
            subfolderBtn.onclick = function(e) {
              e.stopPropagation();
              const targetId = effectiveFolderId || (typeof currentFolderContext === 'function' ? currentFolderContext() : null) || 'tutoria';
              const subs = typeof getSubfoldersOf === 'function' ? getSubfoldersOf(targetId) : [];

              if (subs.length === 1 && subs[0] && subs[0].id) {
                // Se tem exatamente UMA subpasta: navega direto para dentro dela
                if (typeof window.navigateTo === 'function') {
                  window.navigateTo(subs[0].id);
                } else if (typeof navigateTo === 'function') {
                  navigateTo(subs[0].id);
                } else if (typeof renderSubfolderView === 'function') {
                  renderSubfolderView(subs[0].id);
                }
              } else if (subs.length > 1) {
                // Se tem VÁRIAS subpastas: renderiza seletor de subpastas diretamente sem depender de navegação nativa
                if (typeof renderSubfoldersPicker === 'function') {
                  renderSubfoldersPicker(targetId);
                } else if (typeof window.renderSubfoldersPicker === 'function') {
                  window.renderSubfoldersPicker(targetId);
                }
              } else {
                // Se NÃO tem subpastas: toast discreto avisando e não navega
                const msg = 'Esta pasta não possui subpastas.';
                if (typeof showMedReviewToast === 'function') {
                  showMedReviewToast(msg, '', '📁');
                } else if (typeof showToast === 'function') {
                  showToast(msg);
                } else {
                  alert(msg);
                }
              }
            };
          }

          const deleteBtn = footerEl.querySelector('.mr-folder-card-btn-delete');
          if (deleteBtn) {
            deleteBtn.onclick = function(e) {
              e.stopPropagation();
              const effId = effectiveFolderId || card.getAttribute('data-folder-id') || card.getAttribute('data-deck-id');
              const effTitle = cleanTitle || titleText || '';
              if (typeof window.openFolderDeleteModal === 'function') {
                window.openFolderDeleteModal(effId, effTitle);
              } else if (nativeDeleteHandler) {
                nativeDeleteHandler.call(deleteBtn, e);
              } else if (nativeDeleteOnclick) {
                try {
                  const fn = new Function('event', nativeDeleteOnclick);
                  fn.call(deleteBtn, e);
                } catch (err) {
                  console.warn('Erro ao disparar exclusão nativa da pasta:', err);
                }
              } else if (typeof window.deleteDeck === 'function' && effId) {
                window.deleteDeck(effId);
              } else if (typeof window.deleteFolder === 'function' && effId) {
                window.deleteFolder(effId);
              } else {
                const conf = window.confirm('Deseja realmente excluir esta pasta e suas cartas?');
                if (!conf) return;
                const sfStore = getSubfolderStore();
                if (effId && sfStore[effId]) {
                  delete sfStore[effId];
                  persistSubfolders();
                  if (typeof saveSubfolderStore === 'function') saveSubfolderStore(sfStore);
                  if (typeof saveState === 'function') saveState();
                  if (typeof showToast === 'function') showToast('Pasta excluída com sucesso!');
                  if (typeof renderRoute === 'function') renderRoute();
                } else if (effId && state.custom_tutoria_folders && state.custom_tutoria_folders[effId]) {
                  delete state.custom_tutoria_folders[effId];
                  if (typeof saveState === 'function') saveState();
                  if (typeof showToast === 'function') showToast('Pasta excluída com sucesso!');
                  if (typeof renderRoute === 'function') renderRoute();
                } else {
                  if (typeof showToast === 'function') showToast('Ação de exclusão concluída.');
                }
              }
            };
          }

          card.appendChild(footerEl);
          card.setAttribute('data-mr-folder-card-footer', '1');
        }
      });
    } catch (e) {
      console.warn('Erro ao padronizar cabeçalhos e rodapés de cartões de pasta:', e);
    }

    // Remoção do botão redundante "📁 Pastas" da topbar em todas as situações
    const topbar = document.querySelector('.med-topbar') || document.querySelector('header');
    if (topbar) {
      const topbarButtons = topbar.querySelectorAll('button, a, .med-nav-btn');
      topbarButtons.forEach(btn => {
        // Não remove botões que NÃO sejam o de Pastas
        if (btn.classList.contains('mr-global-stats-btn') || btn.classList.contains('med-settings-btn')) return;
        const text = (btn.textContent || '').trim().replace(/s+/g, ' ');
        // Identifica estritamente o botão "📁 Pastas" ou "Pastas" da topbar
        if (text === '📁 Pastas' || text === 'Pastas' || (text.includes('Pastas') && !text.includes('Nova') && !text.includes('Estudo') && !text.includes('Subpastas'))) {
          btn.remove();
        }
      });
    }

    // Remoção incondicional de painéis de estatísticas em todas as rotas (incluindo '/', home, etc.)
    const panels = document.querySelectorAll('.deck-stats, .stats-overview, .folder-stats, .deck-performance, .deck-performance-panel, .deck-stats-panel, [data-stats-panel]');
    panels.forEach(p => {
      if (!p.closest('#global-stats-modal') && !p.closest('.med-topbar')) p.remove();
    });
    document.querySelectorAll('button, a, div').forEach(el => {
      if (el.closest('#global-stats-modal') || el.closest('.med-topbar') || el.classList.contains('mr-global-stats-btn')) return;
      if (el.tagName === 'BUTTON' && (el.textContent || '').includes('Ver estatísticas detalhadas')) {
        const cardContainer = el.closest('.deck-stats-panel') || el.closest('.deck-performance') || el.parentElement?.parentElement;
        if (cardContainer && !cardContainer.closest('#global-stats-modal')) { cardContainer.remove(); } else { el.remove(); }
      }
      if (el.tagName === 'DIV' && (el.textContent || '').includes('Pontos a melhorar (Top 5 cartas') && !el.closest('#global-stats-modal')) {
        const parent = el.closest('.deck-stats') || el.closest('.stats-overview') || el.closest('.deck-performance-panel') || el;
        parent.remove();
      }
    });

    let currentId = null;
    if (typeof currentRoute !== 'undefined') {
      currentId = currentRoute;
    } else if (typeof studyState !== 'undefined' && studyState.deckId) {
      currentId = studyState.deckId;
    }

    if (!currentId || currentId === 'home' || currentId === 'study' || currentId === 'all') {
      return;
    }

    // Se estiver em uma subpasta customizada, o renderSubfolderView já cuida
    if (getSubfolderStore()[currentId]) {
      return;
    }

    const info = resolveFolderInfo(currentId);
    if (!info) return;

    // A. Breadcrumb
    const chain = getBreadcrumbChain(currentId);
    if (chain.length > 1 && !document.getElementById('mr-breadcrumb-injected')) {
      const parentContainer = document.querySelector('.folder-view') || document.querySelector('.container') || document.querySelector('main');
      if (parentContainer) {
        const bc = document.createElement('div');
        bc.id = 'mr-breadcrumb-injected';
        bc.className = 'mr-breadcrumb-bar';
        let bpHtml = '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(\\'home\\')">🏠 Início</a>';
        chain.forEach((item, idx) => {
          bpHtml += '<span class="mr-breadcrumb-sep">/</span>';
          if (idx === chain.length - 1) {
            bpHtml += '<span class="mr-breadcrumb-active">' + escapeHtml(item.name) + '</span>';
          } else {
            bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(\\'' + item.id + '\\')">' + escapeHtml(item.name) + '</a>';
          }
        });
        bc.innerHTML = bpHtml;
        parentContainer.insertBefore(bc, parentContainer.firstChild);
      }
    }

    // B. Botão de Criar inteligente e Importar CSV no header da pasta
    const actionHeaders = document.querySelectorAll('.folder-header-actions, .header-actions, .deck-header-actions, .med-deck-actions');
    actionHeaders.forEach(header => {
      if (!header.querySelector('.mr-import-csv-btn')) {
        const csvBtn = document.createElement('button');
        csvBtn.className = 'mr-import-csv-btn btn btn-sm';
        csvBtn.type = 'button';
        csvBtn.style.cssText = 'background:#f0fdf4; color:#15803d; font-weight:800; border-radius:9px; padding:0.5rem 0.95rem; border:1.5px solid #86efac; cursor:pointer; display:inline-flex; align-items:center; gap:0.35rem; box-shadow:0 1px 3px rgba(0,0,0,0.04);';
        csvBtn.innerHTML = '<span>📥</span> Importar CSV';
        csvBtn.onclick = () => openCsvImportModal(currentId);
        header.prepend(csvBtn);
      }
      if (!header.querySelector('.mr-smart-create-btn')) {
        const btn = document.createElement('button');
        btn.className = 'mr-smart-create-btn btn btn-sm';
        btn.type = 'button';
        btn.style.cssText = 'background:#16a34a; color:#fff; font-weight:800; border-radius:9px; padding:0.5rem 1rem; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 2px 6px rgba(22,163,74,0.2);';
        btn.innerHTML = '<span>➕</span> Criar (Pasta ou Carta)';
        btn.onclick = () => openCreateChoice(currentId);
        header.prepend(btn);
      }
    });

    // C. Remove qualquer painel de estatísticas e botões nativos de stats de dentro da pasta
    const statsSelector = [
      '.folder-view .deck-stats',
      '.folder-view .stats-overview',
      '.folder-view .folder-stats',
      '.folder-view .mr-folder-stats-panel',
      '.folder-view .folder-stats-panel',
      '.folder-view .deck-stats-panel',
      '.folder-view .folder-performance-panel',
      '.folder-view > .stats-grid',
      '.deck-view .deck-stats',
      '.deck-view .stats-overview',
      '.deck-view .folder-stats',
      '.deck-view .mr-folder-stats-panel',
      '.deck-view .folder-stats-panel',
      '.deck-view .deck-performance',
      '#mr-subfolder-wrapper .deck-stats',
      '#mr-subfolder-wrapper .stats-overview',
      '#mr-subfolder-wrapper .folder-stats',
      '#mr-subfolder-wrapper .mr-folder-stats-panel',
      '#mr-subfolder-wrapper .folder-stats-panel',
      '.mr-folder-stats-panel',
      '.folder-stats-panel',
      '.deck-stats-panel',
      '.stats-overview',
      '.folder-performance-panel',
      '.deck-performance',
      '[data-stats-panel]'
    ].join(', ');

    const existingStatsInFolder = document.querySelectorAll(statsSelector);
    existingStatsInFolder.forEach(panel => {
      // Nunca remove de dentro do modal de estatísticas globais nem a topbar
      if (!panel.closest('#global-stats-modal') && !panel.closest('.med-topbar') && !panel.classList.contains('mr-global-stats-btn')) {
        panel.remove();
      }
    });

    // Remove botões de ação de header com onclick contendo "Stats" dentro das views de pasta/deck
    const statsButtons = document.querySelectorAll(
      '.folder-view button, .deck-view button, #mr-subfolder-wrapper button, .folder-header-actions button, .deck-header-actions button, .header-actions button, .med-deck-actions button'
    );
    statsButtons.forEach(btn => {
      if (btn.closest('#global-stats-modal') || btn.closest('.med-topbar') || btn.classList.contains('mr-global-stats-btn')) {
        return;
      }
      const onclickAttr = btn.getAttribute('onclick') || '';
      const text = (btn.textContent || '').trim();
      if (onclickAttr.includes('Stats') || (onclickAttr.includes('stats') && !onclickAttr.includes('global')) || (text.includes('Estatística') && !btn.classList.contains('mr-global-stats-btn'))) {
        btn.remove();
      }
    });

    // D. Renderização da seção de Subpastas (remove blocos órfãos e re-renderiza se contagem mudou)
    document.querySelectorAll('[id^="mr-subfolders-block-"]').forEach(el => {
      if (el.id !== 'mr-subfolders-block-' + currentId) {
        el.remove();
      }
    });

    const subfolders = getSubfoldersOf(currentId);
    const existingBlock = document.getElementById('mr-subfolders-block-' + currentId);
    if (existingBlock && existingBlock.getAttribute('data-subfolders-count') !== String(subfolders.length)) {
      existingBlock.remove();
    }

    const cardSection = document.querySelector('.cards-list-section') || document.querySelector('.folder-cards-list') || document.querySelector('.deck-cards-list') || document.querySelector('.cards-list');
    
    if (cardSection && !document.getElementById('mr-subfolders-block-' + currentId)) {
      const block = document.createElement('div');
      block.id = 'mr-subfolders-block-' + currentId;
      block.setAttribute('data-subfolders-count', String(subfolders.length));
      block.style.cssText = 'margin-bottom:2rem; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:1.2rem;';

      let sfHtml = \`
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.9rem; padding-bottom:0.4rem; border-bottom:1px solid #d1fae5;">
          <h4 style="margin:0; font-size:1.1rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.45rem;">
            <span>📁</span> Subpastas de \${escapeHtml(info.name)} (\${subfolders.length})
          </h4>
          <button type="button" onclick="openSubfolderCreateModal('\${currentId}')" style="background:#f0fdf4; color:#166534; border:1px solid #86efac; border-radius:8px; padding:0.35rem 0.75rem; font-size:0.83rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.3rem;">
            ➕ Nova Subpasta
          </button>
        </div>
      \`;

      if (subfolders.length === 0) {
        sfHtml += \`
          <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; padding:1.1rem; text-align:center; font-size:0.86rem; color:#64748b;">
            Nenhuma subpasta nesta pasta ainda.
            <a href="javascript:void(0)" onclick="openSubfolderCreateModal('\${currentId}')" style="color:#16a34a; font-weight:800; text-decoration:none; margin-left:0.35rem;">Criar primeira subpasta ➜</a>
          </div>
        \`;
      } else {
        sfHtml += \`<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:1.15rem; align-items:stretch;">\`;
        subfolders.forEach(sf => {
          const subCards = typeof getFolderAllCards === 'function' ? getFolderAllCards(sf.id) : (Array.isArray(sf.cards) ? sf.cards : []);
          const cCount = subCards.length || (Array.isArray(sf.cards) ? sf.cards.length : 0);
          sfHtml += \`
            <div class="mr-folder-card mr-tutoria-card mr-subfolder-card" onclick="navigateTo('\${sf.id}')" data-subfolder-id="\${sf.id}" data-mr-folder-card="1" data-mr-folder-card-header="1" data-mr-folder-card-footer="1" data-mr-folder-top-delete="1" style="position:relative;">
              <button type="button" class="mr-folder-card-top-delete" title="Excluir subpasta" onclick="event.stopPropagation(); if (typeof window.openSubfolderDeleteModal === 'function') { window.openSubfolderDeleteModal('\${sf.id}'); } else if (typeof window.openFolderDeleteModal === 'function') { window.openFolderDeleteModal('\${sf.id}', true); }" style="position:absolute; top:0.85rem; right:0.85rem; z-index:10; color:#dc2626; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0.25rem 0.5rem; font-size:0.95rem; cursor:pointer; line-height:1; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(220,38,38,0.12);">🗑</button>
              <div class="mr-folder-card-header mr-tutoria-header">
                <span class="mr-folder-card-badge" style="align-self:flex-start; margin-bottom:0.15rem;">Subpasta</span>
                <div class="mr-folder-card-title-wrap" style="display:flex; align-items:center; gap:0.5rem; min-width:0; width:100%;">
                  <span class="mr-folder-card-icon" style="font-size:1.35rem; line-height:1; flex-shrink:0;">📁</span>
                  <span class="mr-folder-card-title" style="white-space:normal; overflow:visible; text-overflow:clip; font-size:1.15rem; font-weight:800; color:#14532d; line-height:1.3;">\${escapeHtml(sf.name)}</span>
                </div>
              </div>
              <div class="mr-folder-card-footer">
                <div class="mr-folder-card-footer-left">
                  <span class="mr-folder-card-count-chip">\${cCount} \${cCount === 1 ? 'carta' : 'cartas'}</span>
                </div>
                <div class="mr-folder-card-actions">
                  <button type="button" class="mr-folder-card-btn-action mr-folder-card-btn-subfolder" onclick="event.stopPropagation(); navigateTo('\${sf.id}')">Abrir ➜</button>
                </div>
              </div>
            </div>
          \`;
        });
        sfHtml += \`</div>\`;
      }
      block.innerHTML = sfHtml;
      cardSection.parentNode.insertBefore(block, cardSection);
    }

    ensureGlobalStatsButton();
    removePastasNavButton();
  }

  // Remove o botão redundante "📁 Pastas" da topbar verde
  function removePastasNavButton() {
    const topbars = document.querySelectorAll('.med-topbar, header, nav');
    topbars.forEach(tb => {
      const candidates = tb.querySelectorAll('button, a, .med-nav-btn');
      candidates.forEach(btn => {
        if (btn.classList.contains('mr-global-stats-btn') || btn.classList.contains('med-settings-btn')) return;
        const text = (btn.textContent || '').trim().replace(/s+/g, ' ');
        if (text === '📁 Pastas' || text === 'Pastas' || (text.includes('Pastas') && !text.includes('Nova') && !text.includes('Estudo') && !text.includes('Subpastas'))) {
          btn.remove();
        }
      });
    });
  }
  window.removePastasNavButton = removePastasNavButton;
  removePastasNavButton();
  // Hook no renderRoute
  const origRoute = window.renderRoute;
  window.renderRoute = function() {
    // Restaura exibição padrão se estava em subfolder wrapper
    const subWrapper = document.getElementById('mr-subfolder-wrapper');
    if (subWrapper) {
      subWrapper.style.display = 'none';
      window.__mrActivePickerParentId = null;
      window.__mrActiveSubfolderId = null;
      if (typeof window.__mrRestoreHiddenElements === 'function') {
        window.__mrRestoreHiddenElements();
      } else {
        const hiddenList = Array.isArray(window.__mrHiddenMainEls) ? window.__mrHiddenMainEls : (window.__mrHiddenMainEl ? [window.__mrHiddenMainEl] : []);
        hiddenList.forEach(el => {
          if (el && (!el.matches || (!el.matches('.modal, [id*="modal"], [class*="modal"], dialog') && !el.closest('.modal, [id*="modal"], [class*="modal"], dialog')))) {
            el.style.display = '';
          }
        });
        window.__mrHiddenMainEls = null;
        window.__mrHiddenMainEl = null;
      }
      document.querySelectorAll('[data-mr-subfolder-hidden-banner="1"]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-mr-subfolder-hidden-banner');
      });
    }

    if (typeof origRoute === 'function') {
      origRoute();
    }
    setTimeout(enhanceViews, 20);
  };

  // Observador de mutações para garantir injeção contínua ao trocar de tela
  const observer = new MutationObserver((mutations) => {
    suppressNativeStatsModal();
    // Higienização incondicional de nós adicionados pelo snapshot externo
    try {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            // Remove painéis e estatísticas antigas soltas injetadas pelo snapshot
            if (el.matches && el.matches('.deck-stats, .stats-overview, .folder-stats, .deck-performance, .deck-performance-panel, .deck-stats-panel, [data-stats-panel]')) {
              if (!el.closest('#global-stats-modal') && !el.closest('.med-topbar')) el.remove();
            } else if (el.querySelectorAll) {
              el.querySelectorAll('.deck-stats, .stats-overview, .folder-stats, .deck-performance, .deck-performance-panel, .deck-stats-panel, [data-stats-panel]').forEach(p => {
                if (!p.closest('#global-stats-modal') && !p.closest('.med-topbar')) p.remove();
              });
            }

            // Se o nó adicionado for ou contiver cartões que foram reciclados/re-renderizados pelo snapshot, limpa as flags para forçar re-higienização (exceto .mr-subfolder-card)
            const recycledCards = [];
            if (el.matches && (el.matches('.deck-card, .folder-card, .mr-tutoria-card, [data-folder-id], [data-deck-id], div[onclick*="tutoria_"]'))) {
              if (!el.classList.contains('mr-subfolder-card')) recycledCards.push(el);
            }
            if (el.querySelectorAll) {
              el.querySelectorAll('.deck-card, .folder-card, .mr-tutoria-card, [data-folder-id], [data-deck-id], div[onclick*="tutoria_"]').forEach(c => {
                if (!c.classList.contains('mr-subfolder-card')) recycledCards.push(c);
              });
            }
            recycledCards.forEach(card => {
              // Limpa flags para re-executar sanitização completa e reaplicar .mr-tutoria-card / .mr-folder-card
              card.removeAttribute('data-mr-folder-card-header');
              card.removeAttribute('data-mr-folder-card-footer');
              card.removeAttribute('data-mr-folder-top-delete');
            });
          }
        });
      });
    } catch (e) {
      console.warn('Erro ao higienizar mutações:', e);
    }

    enhanceViews();
    removePastasNavButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  (function removeLegacyFloatingCsvButton(){
    var BTN_ID='mr-global-floating-csv-btn';
    var el = document.getElementById(BTN_ID);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  })();

  // Helpers para lista plana de pastas e tabela detalhada de desempenho
  function getFlattenedFoldersList() {
    const list = [];
    try {
      const hierarchy = typeof getAllFoldersHierarchy === 'function' ? getAllFoldersHierarchy() : [];
      function traverse(nodes, depth, pathPrefix) {
        if (!Array.isArray(nodes)) return;
        nodes.forEach(node => {
          if (!node) return;
          const currentPath = pathPrefix ? (pathPrefix + ' > ' + node.name) : node.name;
          list.push({
            id: node.id,
            name: node.name,
            path: currentPath,
            depth: depth,
            icon: node.icon || '📁'
          });
          if (Array.isArray(node.children) && node.children.length > 0) {
            traverse(node.children, depth + 1, currentPath);
          }
        });
      }
      traverse(hierarchy, 0, '');
    } catch (e) {
      console.warn('Erro ao montar lista de pastas para estatísticas:', e);
    }
    return list;
  }

  function renderDetailedFoldersPerformanceTable() {
    const folders = getFlattenedFoldersList();
    if (folders.length === 0) return '';

    const history = getStoredFolderEvalHistory();
    const historyMap = new Map();
    history.forEach(h => {
      if (!h || !h.cardId) return;
      if (!historyMap.has(h.cardId)) historyMap.set(h.cardId, []);
      historyMap.get(h.cardId).push(h);
    });

    const rows = [];
    const now = Date.now();

    folders.forEach(f => {
      const cards = getFolderAllCards(f.id);
      if (!cards || cards.length === 0) return;

      let pending = 0;
      let newCount = 0;
      let learningCount = 0;
      let masteredCount = 0;

      cards.forEach(c => {
        const isNew = (!c.repetitions || c.repetitions === 0) && (!c.fsrsS || c.fsrsS === 0);
        const isDue = (c.dueDate || 0) <= now;
        if (isNew) {
          newCount++;
          pending++;
        } else {
          if (isDue) pending++;
          const ivl = typeof c.interval === 'number' ? c.interval : (typeof c.fsrsS === 'number' ? c.fsrsS : 0);
          if (ivl >= 21) masteredCount++;
          else learningCount++;
        }
      });

      let fSuccess = 0;
      let fTotalReviews = 0;
      cards.forEach(c => {
        const cReviews = historyMap.get(c.id);
        if (cReviews && cReviews.length > 0) {
          cReviews.forEach(h => {
            fTotalReviews++;
            const q = String(h.quality || '').toLowerCase();
            const r = typeof h.rating === 'number' ? h.rating : 0;
            if (q === 'good' || q === 'easy' || r === 3 || r === 4) {
              fSuccess++;
            }
          });
        }
      });

      const accRate = fTotalReviews > 0 ? Math.round((fSuccess / fTotalReviews) * 100) : 100;
      const domRate = cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0;

      rows.push({
        id: f.id,
        name: f.name,
        path: f.path,
        depth: f.depth,
        total: cards.length,
        pending: pending,
        mastered: masteredCount,
        accuracy: accRate,
        domRate: domRate,
        reviews: fTotalReviews
      });
    });

    if (rows.length === 0) return '';

    let tableHtml = '<div style="margin-top:1.5rem; padding-top:1.2rem; border-top:1.5px solid #d1fae5;">' +
      '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.4rem;">' +
      '<div style="font-size:0.95rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.4rem;">' +
      '<span>📋</span> Desempenho Detalhado por Pasta' +
      '</div>' +
      '<span style="font-size:0.75rem; color:#64748b;">' + rows.length + ' pasta' + (rows.length !== 1 ? 's' : '') + ' com cartas</span>' +
      '</div>' +
      '<div style="overflow-x:auto; border:1px solid #e2e8f0; border-radius:12px; background:#ffffff; box-shadow:0 1px 4px rgba(0,0,0,0.02);">' +
      '<table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.82rem;">' +
      '<thead>' +
      '<tr style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; color:#475569; font-weight:700;">' +
      '<th style="padding:0.65rem 0.85rem;">Pasta / Caminho</th>' +
      '<th style="padding:0.65rem 0.6rem; text-align:center;">Total</th>' +
      '<th style="padding:0.65rem 0.6rem; text-align:center;">Pendentes</th>' +
      '<th style="padding:0.65rem 0.6rem; text-align:center;">Taxa de Acerto</th>' +
      '<th style="padding:0.65rem 0.6rem; text-align:center;">Dominadas</th>' +
      '<th style="padding:0.65rem 0.75rem; text-align:center;">Ação</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>';

    rows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#fcfdfd';
      const indent = r.depth > 0 ? (r.depth * 14) : 0;
      tableHtml += '<tr style="background:' + bg + '; border-bottom:1px solid #f1f5f9; transition:background 0.12s ease;" onmouseover="this.style.background=\\'#f0fdf4\\'" onmouseout="this.style.background=\\'' + bg + '\\'">' +
        '<td style="padding:0.6rem 0.85rem; font-weight:600; color:#1e293b;">' +
        '<div style="padding-left:' + indent + 'px; display:flex; align-items:center; gap:0.35rem;" title="' + escapeHtml(r.path) + '">' +
        '<span>📁</span>' +
        '<span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px;">' + escapeHtml(r.name) + '</span>' +
        (r.depth > 0 ? '<span style="font-size:0.7rem; color:#94a3b8; font-weight:400; margin-left:0.25rem;">(' + escapeHtml(r.path) + ')</span>' : '') +
        '</div>' +
        '</td>' +
        '<td style="padding:0.6rem 0.6rem; text-align:center; font-weight:700; color:#334155;">' + r.total + '</td>' +
        '<td style="padding:0.6rem 0.6rem; text-align:center;">' +
        '<span style="background:' + (r.pending > 0 ? '#e0f2fe' : '#f1f5f9') + '; color:' + (r.pending > 0 ? '#0369a1' : '#64748b') + '; font-weight:800; font-size:0.74rem; padding:0.18rem 0.5rem; border-radius:9999px;">' +
        r.pending +
        '</span>' +
        '</td>' +
        '<td style="padding:0.6rem 0.6rem; text-align:center; font-weight:800; color:' + (r.accuracy >= 80 ? '#15803d' : (r.accuracy >= 60 ? '#d97706' : '#dc2626')) + ';">' +
        r.accuracy + '%' +
        '</td>' +
        '<td style="padding:0.6rem 0.6rem; text-align:center;">' +
        '<span style="font-weight:700; color:#15803d;">' + r.mastered + '</span> ' +
        '<span style="font-size:0.7rem; color:#94a3b8;">(' + r.domRate + '%)</span>' +
        '</td>' +
        '<td style="padding:0.6rem 0.75rem; text-align:center;">' +
        '<button type="button" onclick="selectStatsFolder(\\'' + r.id + '\\')" style="background:#f0fdf4; color:#15803d; border:1px solid #86efac; border-radius:6px; padding:0.22rem 0.55rem; font-size:0.75rem; font-weight:700; cursor:pointer;" title="Filtrar métricas por esta pasta">' +
        'Filtrar 📊' +
        '</button>' +
        '</td>' +
        '</tr>';
    });

    tableHtml += '</tbody></table></div></div>';
    return tableHtml;
  }

  // 13. Meta Semanal (janela deslizante de 7 dias)
  function renderWeeklyGoalHtml(folderId) {
    const isGlobal = folderId === null || typeof folderId === 'undefined' || folderId === 'all';
    const allCards = isGlobal ? getAllAppCards() : getFolderAllCards(folderId);
    const cardIdSet = new Set((allCards || []).map(c => c && c.id).filter(Boolean));

    const TARGET_CARDS = 100;
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const windowStartMs = now - sevenDaysMs;

    const history = getStoredFolderEvalHistory();
    const reviewedCardIdsThisWeek = new Set();

    if (Array.isArray(history)) {
      history.forEach(h => {
        if (!h || !h.cardId) return;
        if (!isGlobal && !cardIdSet.has(h.cardId)) return;

        let reviewTime = null;
        if (typeof h.timestamp === 'number' && !isNaN(h.timestamp) && h.timestamp > 0) {
          reviewTime = h.timestamp;
        } else if (typeof h.date === 'string' && h.date.trim()) {
          const parsed = new Date(h.date).getTime();
          if (!isNaN(parsed) && parsed > 0) {
            // Se tiver apenas string de data como 'YYYY-MM-DD', computa o fim daquele dia para não descartar revisões do mesmo dia
            reviewTime = h.date.length === 10 ? (parsed + 86400000 - 1) : parsed;
          }
        } else if (typeof h.reviewedAt === 'number' && !isNaN(h.reviewedAt)) {
          reviewTime = h.reviewedAt;
        } else if (typeof h.reviewedAt === 'string') {
          const parsed = new Date(h.reviewedAt).getTime();
          if (!isNaN(parsed) && parsed > 0) reviewTime = parsed;
        }

        // Se o histórico não tiver data de revisão utilizável, ignore
        if (reviewTime === null) return;

        // Verifica se a revisão ocorreu dentro da janela deslizante dos últimos 7 dias (e até agora)
        if (reviewTime >= windowStartMs && reviewTime <= now + 60000) {
          reviewedCardIdsThisWeek.add(h.cardId);
        }
      });
    }

    const currentCount = reviewedCardIdsThisWeek.size;
    const rawPct = Math.round((currentCount / TARGET_CARDS) * 100);
    const progressPct = Math.min(100, Math.max(0, rawPct));
    const isCompleted = currentCount >= TARGET_CARDS;

    const barColor = isCompleted ? '#16a34a' : '#10b981';
    const cardBorderColor = isCompleted ? '#86efac' : '#d1fae5';
    const cardBgColor = isCompleted ? '#f0fdf4' : '#ffffff';

    return '<div class="mr-weekly-goal-block" style="background:' + cardBgColor + '; border:1.5px solid ' + cardBorderColor + '; border-radius:16px; padding:1.15rem 1.35rem; margin-bottom:1.4rem; box-shadow:0 3px 12px rgba(22,163,74,0.05); transition:all 0.2s ease;">' +
      '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">' +
      '<div style="display:flex; align-items:center; gap:0.55rem;">' +
      '<span style="font-size:1.35rem;">🎯</span>' +
      '<div>' +
      '<div style="font-size:0.95rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.45rem;">' +
      '<span>Meta Semanal</span>' +
      (isCompleted ? '<span style="background:#15803d; color:#ffffff; font-size:0.72rem; font-weight:800; padding:0.18rem 0.55rem; border-radius:9999px; display:inline-flex; align-items:center; gap:0.25rem; box-shadow:0 1px 4px rgba(21,128,61,0.25);">Meta batida! 🎉</span>' : '') +
      '</div>' +
      '<div style="font-size:0.74rem; color:#64748b;">Janela deslizante dos últimos 7 dias (meta fixa: 100 cartas)</div>' +
      '</div></div>' +
      '<div style="display:flex; align-items:baseline; gap:0.4rem;">' +
      '<span style="font-size:1.15rem; font-weight:800; color:' + (isCompleted ? '#15803d' : '#0f172a') + ';">' + currentCount + ' / ' + TARGET_CARDS + '</span>' +
      '<span style="font-size:0.8rem; font-weight:700; color:#64748b;">cartas esta semana</span>' +
      '<span style="background:' + (isCompleted ? '#dcfce7' : '#f1f5f9') + '; color:' + (isCompleted ? '#15803d' : '#475569') + '; font-weight:800; font-size:0.75rem; padding:0.15rem 0.5rem; border-radius:6px; margin-left:0.25rem;">' + rawPct + '%</span>' +
      '</div></div>' +
      '<div>' +
      '<div style="height:12px; border-radius:9999px; overflow:hidden; background:#e2e8f0; width:100%; position:relative;">' +
      '<div style="height:100%; width:' + progressPct + '%; background:' + barColor + '; border-radius:9999px; transition:width 0.3s ease; box-shadow:' + (isCompleted ? '0 0 10px rgba(22,163,74,0.4)' : 'none') + ';"></div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  // Helper para iniciar o estudo de uma carta única a partir do modal de estatísticas
  window.studyCardFromStats = function(cardId) {
    if (!cardId) return;
    if (typeof window.closeGlobalStatsModal === 'function') {
      window.closeGlobalStatsModal();
    }
    if (typeof window.closeDetailedStatsModal === 'function') {
      try { window.closeDetailedStatsModal(); } catch { /* intentionally ignored */ }
    }

    if (typeof window.studySingleCard === 'function') {
      try {
        window.studySingleCard(cardId);
        return;
      } catch (e) {
        console.warn('Falha em studySingleCard:', e);
      }
    }

    // Busca o objeto da carta no acervo global
    let targetCard = null;
    if (typeof window.findCardInState === 'function') {
      try { targetCard = window.findCardInState(cardId); } catch { /* intentionally ignored */ }
    }
    if (!targetCard) {
      const allCards = getAllAppCards();
      targetCard = allCards.find(c => c && c.id === cardId);
    }

    if (!targetCard) {
      alert('Carta não encontrada no acervo.');
      return;
    }

    if (typeof window.startStudySession === 'function') {
      try {
        window.startStudySession(targetCard.containerId || 'custom', [targetCard]);
        return;
      } catch (e) {
        console.warn('Falha em startStudySession:', e);
      }
    }

    if (typeof window.studyState !== 'undefined') {
      try {
        window.studyState.deckId = targetCard.containerId || 'single_card';
        window.studyState.deckTitle = 'Revisão Pontual';
        window.studyState.cards = [targetCard];
        window.studyState.sessionCards = [targetCard];
        window.studyState.currentIndex = 0;
        window.studyState.isFlipped = false;
        window.studyState.userTypedAnswer = '';
        if (typeof window.renderStudyInterface === 'function') {
          window.renderStudyInterface();
          return;
        }
      } catch (e) {
        console.warn('Falha ao configurar studyState:', e);
      }
    }

    if (typeof window.studyDeck === 'function' && targetCard.containerId) {
      window.studyDeck(targetCard.containerId);
    }
  };

  // Helper compartilhado para extrair timestamp do histórico (mesma tolerância da meta semanal)
  function getHistoryReviewTime(h) {
    if (!h) return null;
    if (typeof h.timestamp === 'number' && !isNaN(h.timestamp) && h.timestamp > 0) {
      return h.timestamp;
    }
    if (typeof h.date === 'string' && h.date.trim()) {
      const parsed = new Date(h.date).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        return h.date.length === 10 ? (parsed + 86400000 - 1) : parsed;
      }
    }
    if (typeof h.reviewedAt === 'number' && !isNaN(h.reviewedAt) && h.reviewedAt > 0) {
      return h.reviewedAt;
    }
    if (typeof h.reviewedAt === 'string' && h.reviewedAt.trim()) {
      const parsed = new Date(h.reviewedAt).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  // 1. Top 10 Cartas com Maior Taxa de Erro no Acervo
  function renderTop10ErrorsHtml(folderId) {
    const isGlobal = folderId === null || typeof folderId === 'undefined' || folderId === 'all';
    const allCards = isGlobal ? getAllAppCards() : getFolderAllCards(folderId);
    const cardIdSet = new Set((allCards || []).map(c => c && c.id).filter(Boolean));
    const history = getStoredFolderEvalHistory() || [];

    const relevantHistory = isGlobal
      ? history.filter(h => h && h.cardId)
      : history.filter(h => h && h.cardId && cardIdSet.has(h.cardId));

    const cardErrorMap = new Map();
    (allCards || []).forEach(c => {
      if (!c || !c.id) return;
      const lapses = (typeof c.lapses === 'number' ? c.lapses : 0) || (typeof c.errorCount === 'number' ? c.errorCount : 0);
      cardErrorMap.set(c.id, { card: c, errors: lapses });
    });

    relevantHistory.forEach(h => {
      if (!h || !h.cardId) return;
      const q = String(h.quality || '').toLowerCase();
      const r = typeof h.rating === 'number' ? h.rating : 0;
      if (q === 'again' || r === 1) {
        const item = cardErrorMap.get(h.cardId);
        if (item) {
          item.errors += 1;
        }
      }
    });

    const top10Errors = Array.from(cardErrorMap.values())
      .filter(it => it.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 10);

    let bodyHtml = '';
    if (top10Errors.length === 0) {
      bodyHtml = '<div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.25rem 1rem; text-align:center; font-size:0.85rem; color:#64748b; line-height:1.5;">' +
        'Nenhum ponto crítico detectado ainda! Conforme você avalia cartas nas sessões de estudo, o ranking das 10 cartas mais erradas será calculado automaticamente.' +
        '</div>';
    } else {
      bodyHtml = '<div style="display:flex; flex-direction:column; gap:0.5rem;">';
      top10Errors.forEach((it, idx) => {
        const c = it.card;
        const qText = c.q || 'Pergunta sem texto';
        const snippet = qText.length > 80 ? qText.slice(0, 80) + '...' : qText;
        const origin = c.folderTitle || c.containerType || (isGlobal ? 'Acervo' : 'Esta pasta');

        bodyHtml += '<div onclick="studyCardFromStats(\\'' + escapeHtml(c.id) + '\\')" style="background:#ffffff; border:1px solid #fecaca; border-radius:10px; padding:0.65rem 0.9rem; display:flex; align-items:center; justify-content:space-between; gap:0.8rem; cursor:pointer; transition:all 0.15s ease; box-shadow:0 1px 3px rgba(0,0,0,0.03);" onmouseover="this.style.background=\\'#fef2f2\\'; this.style.borderColor=\\'#f87171\\'" onmouseout="this.style.background=\\'#ffffff\\'; this.style.borderColor=\\'#fecaca\\'" title="Clique para estudar imediatamente">' +
          '<div style="display:flex; align-items:center; gap:0.55rem; min-width:0; flex:1;">' +
          '<span style="background:#fee2e2; color:#991b1b; font-weight:800; font-size:0.74rem; padding:0.18rem 0.48rem; border-radius:6px; flex-shrink:0;">#' + (idx + 1) + '</span>' +
          '<span style="font-size:0.73rem; font-weight:700; color:#047857; background:#dcfce7; padding:0.12rem 0.45rem; border-radius:4px; flex-shrink:0; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(origin) + '</span>' +
          '<span style="font-weight:700; font-size:0.83rem; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(snippet) + '</span>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">' +
          '<span style="background:#fef2f2; color:#b91c1c; border:1px solid #fca5a5; font-size:0.75rem; font-weight:800; padding:0.2rem 0.55rem; border-radius:6px;">' +
          it.errors + ' erro' + (it.errors !== 1 ? 's' : '') +
          '</span>' +
          '<span style="font-size:0.72rem; color:#15803d; font-weight:700; display:inline-flex; align-items:center; gap:0.2rem;">Estudar ➜</span>' +
          '</div>' +
          '</div>';
      });
      bodyHtml += '</div>';
    }

    return '<div class="mr-stats-top10-block" style="margin-bottom:1.8rem;">' +
      '<h4 style="margin:0 0 0.3rem 0; font-size:1.02rem; font-weight:800; color:#b91c1c; display:flex; align-items:center; gap:0.45rem;">' +
      '<span>⚠️</span> Top 10 Cartas com Maior Taxa de Erro no Acervo' +
      '</h4>' +
      '<p style="margin:0 0 0.75rem 0; font-size:0.8rem; color:#64748b; line-height:1.45;">' +
      'Cartas com maior histórico de erros ou regressões de intervalo. Clique em qualquer item para estudar imediatamente.' +
      '</p>' +
      bodyHtml +
      '</div>';
  }

  // 2. Evolução da Taxa de Acerto por Dia de Estudo
  function renderAccuracyEvolutionHtml(folderId) {
    const isGlobal = folderId === null || typeof folderId === 'undefined' || folderId === 'all';
    const allCards = isGlobal ? getAllAppCards() : getFolderAllCards(folderId);
    const cardIdSet = new Set((allCards || []).map(c => c && c.id).filter(Boolean));
    const history = getStoredFolderEvalHistory() || [];

    const relevantHistory = isGlobal
      ? history.filter(h => h && h.cardId)
      : history.filter(h => h && h.cardId && cardIdSet.has(h.cardId));

    const dayStats = {};
    relevantHistory.forEach(h => {
      if (!h) return;
      let d = null;
      if (typeof h.date === 'string' && h.date.length >= 10) {
        d = h.date.slice(0, 10);
      } else {
        const t = getHistoryReviewTime(h);
        if (t) d = new Date(t).toISOString().split('T')[0];
      }
      if (!d) return;

      if (!dayStats[d]) dayStats[d] = { total: 0, good: 0 };
      dayStats[d].total += 1;
      const q = String(h.quality || '').toLowerCase();
      const r = typeof h.rating === 'number' ? h.rating : 0;
      if (q === 'good' || q === 'easy' || r === 3 || r === 4) {
        dayStats[d].good += 1;
      }
    });

    const sortedDays = Object.keys(dayStats).sort();
    let bodyHtml = '';
    if (sortedDays.length === 0) {
      bodyHtml = '<div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.25rem 1rem; text-align:center; font-size:0.85rem; color:#64748b; line-height:1.5;">' +
        'Ainda não há histórico diário de avaliações. Complete sessões de estudo para acompanhar a evolução da sua taxa de acerto por dia.' +
        '</div>';
    } else {
      const displayDays = sortedDays.slice(-14);
      bodyHtml = '<div style="background:#ffffff; border:1px solid #d1fae5; border-radius:12px; padding:1rem 1.1rem; display:flex; flex-direction:column; gap:0.75rem;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:#64748b; font-weight:700; margin-bottom:0.25rem;">' +
        '<span>Dia de Estudo</span>' +
        '<span>Taxa de Acerto (Boas / Fáceis)</span>' +
        '</div>';

      displayDays.forEach(d => {
        const st = dayStats[d];
        const pct = st.total > 0 ? Math.round((st.good / st.total) * 100) : 0;
        const color = pct >= 85 ? '#16a34a' : pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#dc2626';
        const parts = d.split('-');
        const dateFormatted = parts.length === 3 ? (parts[2] + '/' + parts[1]) : d;

        bodyHtml += '<div style="display:flex; align-items:center; gap:0.75rem;">' +
          '<span style="font-size:0.76rem; font-weight:700; color:#334155; min-width:44px;">' + dateFormatted + '</span>' +
          '<div style="flex:1; height:10px; background:#e2e8f0; border-radius:9999px; overflow:hidden;">' +
          '<div style="height:100%; width:' + pct + '%; background:' + color + '; border-radius:9999px; transition:width 0.3s ease;"></div>' +
          '</div>' +
          '<span style="font-size:0.78rem; font-weight:800; color:' + color + '; min-width:42px; text-align:right;">' + pct + '%</span>' +
          '<span style="font-size:0.7rem; color:#94a3b8; min-width:60px; text-align:right;">(' + st.good + '/' + st.total + ')</span>' +
          '</div>';
      });

      bodyHtml += '</div>';
    }

    return '<div class="mr-stats-accuracy-evolution-block" style="margin-bottom:1.8rem;">' +
      '<h4 style="margin:0 0 0.3rem 0; font-size:1.02rem; font-weight:800; color:#065f46; display:flex; align-items:center; gap:0.45rem;">' +
      '<span>📈</span> Evolução da Taxa de Acerto por Dia de Estudo' +
      '</h4>' +
      '<p style="margin:0 0 0.75rem 0; font-size:0.8rem; color:#64748b; line-height:1.45;">' +
      'Acompanhamento do percentual de respostas Boas/Fáceis nos últimos dias com estudo ativo.' +
      '</p>' +
      bodyHtml +
      '</div>';
  }

  // 3. Leeches (cartas que você esquece repetidamente)
  function renderLeechesHtml(folderId) {
    const isGlobal = folderId === null || typeof folderId === 'undefined' || folderId === 'all';
    const allCards = isGlobal ? getAllAppCards() : getFolderAllCards(folderId);

    const leechThreshold = 8;
    const leeches = (allCards || [])
      .filter(c => {
        if (!c || !c.id) return false;
        const lapses = (typeof c.lapses === 'number' ? c.lapses : 0);
        return lapses >= leechThreshold;
      })
      .sort((a, b) => (b.lapses || 0) - (a.lapses || 0));

    let bodyHtml = '';
    if (leeches.length === 0) {
      bodyHtml = '<div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.25rem 1rem; text-align:center; font-size:0.88rem; color:#64748b;">' +
        'Nenhuma leech até agora. 👍' +
        '</div>';
    } else {
      bodyHtml = '<div style="display:flex; flex-direction:column; gap:0.5rem;">';
      leeches.slice(0, 10).forEach(c => {
        const qText = c.q || 'Sem texto';
        const snippet = qText.length > 75 ? qText.slice(0, 75) + '...' : qText;
        const origin = c.folderTitle || c.containerType || (isGlobal ? 'Acervo' : 'Esta pasta');

        bodyHtml += '<div onclick="studyCardFromStats(\\'' + escapeHtml(c.id) + '\\')" style="background:#ffffff; border:1px solid #fecaca; border-radius:10px; padding:0.65rem 0.9rem; display:flex; align-items:center; justify-content:space-between; gap:0.8rem; cursor:pointer; transition:all 0.15s ease; box-shadow:0 1px 3px rgba(0,0,0,0.03);" onmouseover="this.style.background=\\'#fef2f2\\'; this.style.borderColor=\\'#f87171\\'" onmouseout="this.style.background=\\'#ffffff\\'; this.style.borderColor=\\'#fecaca\\'" title="Clique para estudar imediatamente">' +
          '<div style="display:flex; align-items:center; gap:0.55rem; min-width:0; flex:1;">' +
          '<span style="font-size:0.82rem; font-weight:800; color:#b91c1c; min-width:24px;">' + (c.lapses || 0) + '×</span>' +
          '<span style="font-size:0.73rem; font-weight:700; color:#047857; background:#dcfce7; padding:0.12rem 0.45rem; border-radius:4px; flex-shrink:0; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(origin) + '</span>' +
          '<span style="font-weight:700; font-size:0.83rem; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(snippet) + '</span>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">' +
          '<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-size:0.74rem; font-weight:800; padding:0.18rem 0.55rem; border-radius:6px;">🩸 leech</span>' +
          '<span style="font-size:0.72rem; color:#15803d; font-weight:700;">Revisar ➜</span>' +
          '</div>' +
          '</div>';
      });
      bodyHtml += '</div>';
    }

    return '<div class="mr-stats-leeches-block" style="margin-bottom:1.8rem;">' +
      '<h4 style="margin:0 0 0.3rem 0; font-size:1.02rem; font-weight:800; color:#b91c1c; display:flex; align-items:center; gap:0.45rem;">' +
      '<span>🩸</span> Leeches (cartas que você esquece repetidamente)' +
      '</h4>' +
      '<p style="margin:0 0 0.75rem 0; font-size:0.8rem; color:#64748b; line-height:1.45;">' +
      'Cartas com 8+ lapsos acumulados. Sugestão: reformule a carta (mais atômica), crie um mnemônico ou revise o conceito na fonte.' +
      '</p>' +
      bodyHtml +
      '</div>';
  }

  // 4. Consistência de Estudo (últimas 17 semanas) - Heatmap estilo GitHub (colunas = semanas, 7 linhas = dias)
  function renderStudyConsistencyHtml(folderId) {
    const isGlobal = folderId === null || typeof folderId === 'undefined' || folderId === 'all';
    const allCards = isGlobal ? getAllAppCards() : getFolderAllCards(folderId);
    const cardIdSet = new Set((allCards || []).map(c => c && c.id).filter(Boolean));
    const history = getStoredFolderEvalHistory() || [];

    const relevantHistory = isGlobal
      ? history.filter(h => h && h.cardId)
      : history.filter(h => h && h.cardId && cardIdSet.has(h.cardId));

    const byDayMap = {};
    relevantHistory.forEach(e => {
      if (!e) return;
      let d = null;
      if (typeof e.date === 'string' && e.date.length >= 10) {
        d = e.date.slice(0, 10);
      } else {
        const t = getHistoryReviewTime(e);
        if (t) d = new Date(t).toISOString().split('T')[0];
      }
      if (d) {
        byDayMap[d] = (byDayMap[d] || 0) + 1;
      }
    });

    // 17 semanas completas: 17 colunas x 7 linhas = 119 células
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // 0 = Domingo, 6 = Sábado
    // A última célula (linha 6 da coluna 16) é o final da semana atual (ou hoje)
    // Para um grid perfeito colunas=semanas, linhas=dias:
    // Começamos em (119 - 1 - todayDayOfWeek) dias atrás para terminar no sábado atual
    const endOffset = 6 - todayDayOfWeek;
    const endDate = new Date(today.getTime() + endOffset * 86400000);

    const lvl = (n) => n === 0 ? 0 : n <= 5 ? 1 : n <= 15 ? 2 : n <= 30 ? 3 : 4;
    const colors = ['#e5e7eb', '#bbf7d0', '#86efac', '#4ade80', '#16a34a'];

    // Geramos 119 dias em ordem cronológica (17 semanas x 7 dias)
    const cells = [];
    for (let i = 118; i >= 0; i--) {
      const dt = new Date(endDate.getTime() - i * 86400000);
      const ds = dt.toISOString().split('T')[0];
      const isFuture = dt.getTime() > (today.getTime() + 86400000);
      const count = isFuture ? 0 : (byDayMap[ds] || 0);
      cells.push({ ds, n: count, isFuture });
    }

    let heatmapCellsHtml = '';
    cells.forEach(c => {
      const parts = c.ds.split('-');
      const dsFormatted = parts.length === 3 ? (parts[2] + '/' + parts[1] + '/' + parts[0]) : c.ds;
      const title = c.isFuture ? (dsFormatted + ' (futuro)') : (dsFormatted + ': ' + c.n + ' carta' + (c.n !== 1 ? 's' : '') + ' avaliada' + (c.n !== 1 ? 's' : ''));
      const bg = c.isFuture ? '#f1f5f9' : colors[lvl(c.n)];
      heatmapCellsHtml += '<div title="' + title + '" style="aspect-ratio:1; border-radius:3px; background:' + bg + '; transition:transform 0.1s ease; cursor:default;" onmouseover="this.style.transform=\\'scale(1.25)\\'" onmouseout="this.style.transform=\\'scale(1)\\'"></div>';
    });

    const heatmapHtml = '<div style="background:#ffffff; border:1px solid #d1fae5; border-radius:14px; padding:1.15rem 1.25rem; box-shadow:0 1px 4px rgba(0,0,0,0.02);">' +
      '<div style="display:grid; grid-template-columns:repeat(17, 1fr); grid-template-rows:repeat(7, 1fr); grid-auto-flow:column; gap:4px;">' +
      heatmapCellsHtml +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.75rem; font-size:0.73rem; color:#64748b; justify-content:flex-end;">' +
      'Menos ' +
      '<span style="width:10px; height:10px; border-radius:2px; background:#e5e7eb; display:inline-block;" title="0 cartas"></span>' +
      '<span style="width:10px; height:10px; border-radius:2px; background:#bbf7d0; display:inline-block;" title="1-5 cartas"></span>' +
      '<span style="width:10px; height:10px; border-radius:2px; background:#86efac; display:inline-block;" title="6-15 cartas"></span>' +
      '<span style="width:10px; height:10px; border-radius:2px; background:#4ade80; display:inline-block;" title="16-30 cartas"></span>' +
      '<span style="width:10px; height:10px; border-radius:2px; background:#16a34a; display:inline-block;" title="30+ cartas"></span>' +
      ' Mais' +
      '</div>' +
      '</div>';

    return '<div class="mr-stats-consistency-block" style="margin-bottom:1.2rem;">' +
      '<h4 style="margin:0 0 0.3rem 0; font-size:1.02rem; font-weight:800; color:#065f46; display:flex; align-items:center; gap:0.45rem;">' +
      '<span>🔥</span> Consistência de Estudo (últimas 17 semanas)' +
      '</h4>' +
      '<p style="margin:0 0 0.75rem 0; font-size:0.8rem; color:#64748b; line-height:1.45;">' +
      'Número de cartas avaliadas por dia — como o heatmap de contribuições do GitHub.' +
      '</p>' +
      heatmapHtml +
      '</div>';
  }

  // Estado da pasta atualmente selecionada no modal
  window.__selectedStatsFolderId = null;

  window.selectStatsFolder = function(targetFolderId) {
    window.__selectedStatsFolderId = (targetFolderId && targetFolderId !== 'all') ? targetFolderId : null;
    renderGlobalStatsModalContent();
  };

  function renderGlobalStatsModalContent() {
    const content = document.getElementById('global-stats-content');
    if (!content) return;

    const currentFolderId = window.__selectedStatsFolderId;
    const folders = getFlattenedFoldersList();

    let currentName = 'Visão Geral';
    if (currentFolderId) {
      const match = folders.find(f => f.id === currentFolderId);
      if (match) currentName = match.name;
      else {
        const info = resolveFolderInfo(currentFolderId);
        if (info) currentName = info.name;
      }
    }

    // Seletor de Pastas no topo
    let selectorHtml = '<div style="background:#f8fafc; border:1.5px solid #d1fae5; border-radius:14px; padding:0.85rem 1.1rem; margin-bottom:1.3rem; display:flex; align-items:center; justify-content:space-between; gap:0.9rem; flex-wrap:wrap;">' +
      '<div style="display:flex; align-items:center; gap:0.5rem;">' +
      '<span style="font-size:1.25rem;">🔍</span>' +
      '<div>' +
      '<div style="font-size:0.82rem; font-weight:800; color:#14532d;">Escopo das Estatísticas:</div>' +
      '<div style="font-size:0.74rem; color:#64748b;">Selecione todo o app ou uma pasta/subpasta específica</div>' +
      '</div></div>' +
      '<div style="min-width:240px; flex:1; max-width:380px;">' +
      '<select id="stats-folder-scope-select" onchange="selectStatsFolder(this.value)" style="width:100%; box-sizing:border-box; padding:0.55rem 0.85rem; border:1.5px solid #86efac; border-radius:8px; font-size:0.86rem; font-weight:700; color:#14532d; background:#ffffff; outline:none; cursor:pointer;" onfocus="this.style.borderColor=\\'#16a34a\\'" onblur="this.style.borderColor=\\'#86efac\\'">' +
      '<option value="all"' + (!currentFolderId ? ' selected' : '') + '>🌐 Visão Geral (Todo o App)</option>';

    folders.forEach(f => {
      const isSel = currentFolderId === f.id ? ' selected' : '';
      const indentStr = '&nbsp;&nbsp;'.repeat(f.depth);
      const prefix = f.depth > 0 ? '↳ ' : '📁 ';
      selectorHtml += '<option value="' + escapeHtml(f.id) + '"' + isSel + '>' +
        indentStr + prefix + escapeHtml(f.name) + (f.depth > 0 ? (' (' + escapeHtml(f.path) + ')') : '') +
        '</option>';
    });

    selectorHtml += '</select></div></div>';

    // Bloco da Meta Semanal (janela deslizante de 7 dias)
    const weeklyGoalHtml = renderWeeklyGoalHtml(currentFolderId);

    // Painel isolado com as métricas da pasta escolhida ou visão geral
    const statsPanelHtml = renderFolderStatsPanelHtml(currentFolderId, currentName);

    // Tabela completa de Desempenho Detalhado por Pasta
    const detailedTableHtml = renderDetailedFoldersPerformanceTable();

    // 4 Novas Seções de Estatísticas Aprofundadas (recalculadas respeitando o escopo)
    const top10Html = renderTop10ErrorsHtml(currentFolderId);
    const evolutionHtml = renderAccuracyEvolutionHtml(currentFolderId);
    const leechesHtml = renderLeechesHtml(currentFolderId);
    const consistencyHtml = renderStudyConsistencyHtml(currentFolderId);

    const advancedSectionsHtml = '<div class="mr-advanced-deep-stats" style="margin-top:2rem; padding-top:1.5rem; border-top:2px dashed #bbf7d0;">' +
      top10Html +
      evolutionHtml +
      leechesHtml +
      consistencyHtml +
      '</div>';

    content.innerHTML = selectorHtml + weeklyGoalHtml + statsPanelHtml + detailedTableHtml + advancedSectionsHtml;
  }

  // Handlers para Modal de Estatísticas Globais
  window.openGlobalStatsModal = function() {
    const modal = document.getElementById('global-stats-modal');
    renderGlobalStatsModalContent();
    if (modal) {
      modal.style.display = 'flex';
    }
  };
  window.__realOpenGlobalStatsModal = window.openGlobalStatsModal;

  window.closeGlobalStatsModal = function() {
    const modal = document.getElementById('global-stats-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  if (window.__pendingOpenGlobalStats) {
    delete window.__pendingOpenGlobalStats;
    setTimeout(() => window.openGlobalStatsModal(), 0);
  }

  // Garante a existência do botão na topbar verde
  function ensureGlobalStatsButton() {
    if (document.querySelector('.mr-global-stats-btn')) return;
    const topbar = document.querySelector('.med-topbar') || document.querySelector('header');
    if (!topbar) return;
    const importBtn = topbar.querySelector('.med-nav-btn-accent') || 
                      Array.from(topbar.querySelectorAll('.med-nav-btn')).find(b => (b.textContent || '').includes('Importar')) ||
                      topbar.querySelector('.med-settings-btn');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'med-nav-btn mr-global-stats-btn';
    btn.onclick = () => window.openGlobalStatsModal && window.openGlobalStatsModal();
    btn.title = 'Estatísticas Gerais do MedReview';
    btn.innerHTML = '📊 Estatística';
    if (importBtn && importBtn.parentNode) {
      importBtn.parentNode.insertBefore(btn, importBtn);
    } else {
      topbar.appendChild(btn);
    }
  }
  window.ensureGlobalStatsButton = ensureGlobalStatsButton;
  ensureGlobalStatsButton();
  setTimeout(ensureGlobalStatsButton, 50);
  removePastasNavButton();
  setTimeout(removePastasNavButton, 50);

  // Vigia/captura global de cliques ou renderizações para garantir que o botão Pastas não reapareça
  document.addEventListener('DOMContentLoaded', removePastasNavButton);
  window.addEventListener('load', removePastasNavButton);

})();
</script>
  `

  // Injeção do botão de estatísticas diretamente no HTML da topbar verde
  const importBtnMarker = `<button class="med-nav-btn med-nav-btn-accent" onclick="openImportFlow(typeof currentFolderContext === 'function' ? currentFolderContext() : null)" title="Importar flashcards via CSV para qualquer pasta">`
  const statsBtnHtml = `<button type="button" class="med-nav-btn mr-global-stats-btn" onclick="openGlobalStatsModal()" title="Estatísticas Gerais do MedReview">📊 Estatística</button>\n        `
  if (html.includes(importBtnMarker)) {
    html = html.replace(importBtnMarker, statsBtnHtml + importBtnMarker)
  }

  // Remoção do botão Pastas estaticamente no HTML caso ele esteja presente na renderização inicial
  // Remove botões de navegação da topbar contendo "Pastas" (com ou sem emoji, atributos ou espaços)
  html = html.replace(
    /<button[^>]*class="[^"]*med-nav-btn[^"]*"[^>]*>[\s\S]*?(?:📁\s*)?Pastas[\s\S]*?<\/button>/gi,
    function (match) {
      if (match.includes('Nova') || match.includes('Estudo') || match.includes('Subpastas')) {
        return match
      }
      return ''
    },
  )

  return html.replace('</body>', hierarchyScript + '\n</body>')
}

export default function Index() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>
      w.__mrNavigateTo = function (subfolderId: string) {
        try {
          if (typeof window.history?.pushState === 'function') {
            const url = new URL(window.location.href)
            url.searchParams.set('subfolder', String(subfolderId))
            window.history.replaceState({}, '', url.pathname + url.search)
          }
        } catch {
          /* intentionally ignored */
        }
      }
    }
    let cancelled = false
    void Promise.all([
      fetch(SNAPSHOT_URL, { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error('snapshot HTTP ' + r.status)
        return r.text()
      }),
      loadData(),
    ])
      .then(([raw, data]) => {
        if (cancelled) return
        let html = transform(raw, data)

        html = injectHierarchySupport(html)

        document.open()
        document.write(html)
        document.close()
      })
      .catch((err) => {
        if (cancelled) return
        document.body.innerHTML =
          '<div style="font-family:system-ui;padding:2.5rem;text-align:center;">' +
          '<h1 style="color:#16a34a;">MedReview 🩺</h1>' +
          '<p>Não foi possível carregar o app: ' +
          String(err && err.message ? err.message : err) +
          '</p></div>'
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: '3rem 1rem', textAlign: 'center' }}>
      <h1 style={{ color: '#16a34a' }}>MedReview 🩺</h1>
      <p>Carregando app FSRS-5…</p>
    </div>
  )
}
