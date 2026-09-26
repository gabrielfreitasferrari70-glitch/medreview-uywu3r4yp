import { useEffect } from 'react'

// ========================================================
// Exposição antecipada dos handlers globais (antes do boot/snapshot)
// ========================================================
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>

  if (typeof w.openCsvImport !== 'function') {
    w.openCsvImport = function (ctx?: unknown) {
      if (typeof w.openCsvImportModal === 'function') {
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
  // 1. Estilos visuais adicionais
  const styleEl = document.createElement('style');
  styleEl.textContent = \`
    .mr-subfolder-card {
      background: #ffffff;
      border: 1.5px solid #bbf7d0;
      border-radius: 12px;
      padding: 0.95rem 1.15rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.16s ease;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
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

  // Injeta Modal de Importação de Flashcards via CSV
  const modalCsvImportHtml = \`
  <div id="csv-import-modal" style="display:none; position:fixed; inset:0; z-index:195; background:rgba(15, 23, 42, 0.6); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;" onclick="if(event.target===this) closeCsvImportModal()">
    <div style="background:#ffffff; border-radius:18px; max-width:620px; width:100%; box-shadow:0 24px 60px rgba(0,0,0,0.28); border:1.5px solid #86efac; overflow:hidden; animation:mr-fade-up 0.2s ease-out; max-height:90vh; display:flex; flex-direction:column;">
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

  // 3. Estrutura de dados para subpastas no state
  function getSubfolderStore() {
    if (!state.subfolders) {
      state.subfolders = {};
    }
    return state.subfolders;
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

  const realOpenCsvImportModal = function(targetFolderId) {
    const targetCtx = targetFolderId || window.__activeFolderContext || (typeof currentFolderContext === 'function' ? currentFolderContext() : 'tutoria');
    window.__activeFolderContext = targetCtx;

    const info = resolveFolderInfo(targetCtx);
    const folderName = info ? info.name : 'Pasta Atual';

    const lbl = document.getElementById('csv-import-target-label');
    if (lbl) {
      lbl.innerHTML = 'Destino das cartas: <strong>' + escapeHtml(folderName) + '</strong>';
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
  window.openCsvImport = function(ctx) { realOpenCsvImportModal(ctx); };
  if (typeof window.__pendingCsvImportCtx !== 'undefined') {
    const pendingCsv = window.__pendingCsvImportCtx;
    delete window.__pendingCsvImportCtx;
    setTimeout(() => realOpenCsvImportModal(pendingCsv), 0);
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
    window.__activeFolderContext = parentId;
    const info = resolveFolderInfo(parentId);
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

  window.handleSubfolderSubmit = function(e) {
    e.preventDefault();
    const nameInput = document.getElementById('subfolder-name-input');
    const descInput = document.getElementById('subfolder-desc-input');
    const name = nameInput ? nameInput.value.trim() : '';
    const desc = descInput ? descInput.value.trim() : '';
    if (!name) return;

    const parentId = window.__activeFolderContext || 'tutoria';
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
    saveState();
    closeSubfolderCreateModal();

    if (typeof showToast === 'function') {
      showToast('Subpasta "' + name + '" criada com sucesso!');
    }

    // Se estiver navegando na subpasta pai ou renderizar rota
    renderRoute();
  };

  // 9. Adaptador para navegar até subpastas
  const origNavigateTo = window.navigateTo;
  window.navigateTo = function(target) {
    const sfStore = getSubfolderStore();
    if (sfStore[target]) {
      // É uma subpasta customizada: renderiza visão de pasta dedicada
      renderSubfolderView(target);
      return;
    }
    if (typeof origNavigateTo === 'function') {
      origNavigateTo(target);
    }
  };

  // 10. Renderização dedicada para visualização de subpastas
  function renderSubfolderView(subfolderId) {
    const sf = getSubfolderStore()[subfolderId];
    if (!sf) return;

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
    bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(\\'home\\')">🏠 Início</a>';
    chain.forEach((item, idx) => {
      bpHtml += '<span class="mr-breadcrumb-sep">/</span>';
      if (idx === chain.length - 1) {
        bpHtml += '<span class="mr-breadcrumb-active">' + escapeHtml(item.name) + '</span>';
      } else {
        bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo(\\'' + item.id + '\\')">' + escapeHtml(item.name) + '</a>';
      }
    });
    bpHtml += '</div>';

    let contentHtml = \`
      <div style="max-width:1100px; margin:0 auto; padding:1.5rem 1rem;">
        \${bpHtml}

        <div style="background:#ffffff; border:1.5px solid #d1fae5; border-radius:16px; padding:1.5rem; margin-bottom:1.8rem; box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
            <div>
              <div style="display:flex; align-items:center; gap:0.55rem; margin-bottom:0.35rem;">
                <span style="font-size:1.8rem;">📁</span>
                <h2 style="margin:0; font-size:1.5rem; font-weight:800; color:#14532d;">\${escapeHtml(sf.name)}</h2>
              </div>
              <p style="margin:0; color:#64748b; font-size:0.92rem;">\${escapeHtml(sf.description || 'Subpasta de estudo médica')}</p>
            </div>
            <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-sm mr-import-csv-btn" onclick="openCsvImportModal('\${subfolderId}')" style="background:#f0fdf4; color:#15803d; font-weight:800; padding:0.55rem 1.1rem; border-radius:9px; border:1.5px solid #86efac; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <span>📥</span> Importar CSV
              </button>
              <button type="button" class="btn btn-sm" onclick="openCreateChoice('\${subfolderId}')" style="background:#16a34a; color:#fff; font-weight:800; padding:0.55rem 1.15rem; border-radius:9px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; box-shadow:0 2px 8px rgba(22, 163, 74, 0.25);">
                <span>➕</span> Criar (Pasta ou Carta)
              </button>
              <button type="button" class="btn btn-sm" onclick="startSubfolderStudy('\${subfolderId}')" style="background:#059669; color:#fff; font-weight:800; padding:0.55rem 1.15rem; border-radius:9px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem;">
                <span>⚡</span> Revisar (\${cards.length})
              </button>
            </div>
          </div>
        </div>

        <!-- Seção de Subpastas Aninhadas -->
        <div style="margin-bottom:2rem;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.9rem; padding-bottom:0.4rem; border-bottom:1.5px solid #d1fae5;">
            <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:#14532d; display:flex; align-items:center; gap:0.45rem;">
              <span>📁</span> Subpastas (\${subfolders.length})
            </h3>
            <button type="button" onclick="openSubfolderCreateModal('\${subfolderId}')" style="background:#f0fdf4; color:#166534; border:1px solid #86efac; border-radius:8px; padding:0.35rem 0.8rem; font-size:0.83rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.3rem;">
              ➕ Nova Subpasta
            </button>
          </div>
    \`;

    if (subfolders.length === 0) {
      contentHtml += \`
        <div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:12px; padding:1.2rem; text-align:center; font-size:0.88rem; color:#64748b;">
          Nenhuma subpasta criada aqui ainda.
          <a href="javascript:void(0)" onclick="openSubfolderCreateModal('\${subfolderId}')" style="color:#16a34a; font-weight:800; text-decoration:none; margin-left:0.35rem;">Criar subpasta ➜</a>
        </div>
      \`;
    } else {
      contentHtml += \`<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:0.9rem;">\`;
      subfolders.forEach(s => {
        const cCount = Array.isArray(s.cards) ? s.cards.length : 0;
        contentHtml += \`
          <div class="mr-subfolder-card" onclick="navigateTo('\${s.id}')">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <span style="font-size:1.6rem;">📁</span>
              <div>
                <div style="font-weight:800; font-size:0.95rem; color:#0f172a;">\${escapeHtml(s.name)}</div>
                <div style="font-size:0.78rem; color:#64748b;">\${cCount} carta\${cCount !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <span style="color:#16a34a; font-size:0.95rem; font-weight:800;">Abrir ➜</span>
          </div>
        \`;
      });
      contentHtml += \`</div>\`;
    }

    contentHtml += \`</div>\`;

    // Seção de Cartas desta Subpasta
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

    // Renderiza na tela
    const viewContainer = document.querySelector('.main-content-area') || document.querySelector('.container') || document.querySelector('main') || document.body;
    // Se existir topbar preserva e troca o resto
    const topbar = document.querySelector('.med-topbar') || document.querySelector('header');
    if (topbar && topbar.parentNode) {
      let subWrapper = document.getElementById('mr-subfolder-wrapper');
      if (!subWrapper) {
        subWrapper = document.createElement('div');
        subWrapper.id = 'mr-subfolder-wrapper';
        topbar.parentNode.appendChild(subWrapper);
      }
      // Oculta irmãos do wrapper
      Array.from(topbar.parentNode.children).forEach(ch => {
        if (ch !== topbar && ch !== subWrapper && ch.id !== 'create-choice-modal' && ch.id !== 'subfolder-create-modal' && ch.id !== 'settings-modal') {
          ch.style.display = 'none';
        }
      });
      subWrapper.style.display = 'block';
      subWrapper.innerHTML = contentHtml;
    } else {
      viewContainer.innerHTML = contentHtml;
    }
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
      saveState();

      if (typeof closeNewCardModal === 'function') closeNewCardModal();
      if (typeof showToast === 'function') showToast('Carta adicionada com sucesso!');

      renderSubfolderView(targetCtx);
      return;
    }

    if (typeof origSaveNewCard === 'function') {
      origSaveNewCard(ctx);
    }
  };

  // 13. Decorador de telas padrão (Tutoria, Provas, Módulos, etc.)
  function enhanceViews() {
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
        let bpHtml = '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo('home')">🏠 Início</a>';
        chain.forEach((item, idx) => {
          bpHtml += '<span class="mr-breadcrumb-sep">/</span>';
          if (idx === chain.length - 1) {
            bpHtml += '<span class="mr-breadcrumb-active">' + escapeHtml(item.name) + '</span>';
          } else {
            bpHtml += '<a class="mr-breadcrumb-item" href="javascript:void(0)" onclick="navigateTo('' + item.id + '')">' + escapeHtml(item.name) + '</a>';
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

    // C. Renderização da seção de Subpastas
    const subfolders = getSubfoldersOf(currentId);
    const cardSection = document.querySelector('.cards-list-section') || document.querySelector('.folder-cards-list') || document.querySelector('.deck-cards-list') || document.querySelector('.cards-list');
    
    if (cardSection && !document.getElementById('mr-subfolders-block-' + currentId)) {
      const block = document.createElement('div');
      block.id = 'mr-subfolders-block-' + currentId;
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
        sfHtml += \`<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:0.85rem;">\`;
        subfolders.forEach(sf => {
          const cCount = Array.isArray(sf.cards) ? sf.cards.length : 0;
          sfHtml += \`
            <div class="mr-subfolder-card" onclick="navigateTo('\${sf.id}')">
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <span style="font-size:1.5rem;">📁</span>
                <div>
                  <div style="font-weight:800; font-size:0.94rem; color:#0f172a;">\${escapeHtml(sf.name)}</div>
                  <div style="font-size:0.77rem; color:#64748b;">\${cCount} carta\${cCount !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <span style="color:#16a34a; font-size:0.95rem; font-weight:800;">Abrir ➜</span>
            </div>
          \`;
        });
        sfHtml += \`</div>\`;
      }

      block.innerHTML = sfHtml;
      cardSection.parentNode.insertBefore(block, cardSection);
    }
  }
  // Hook no renderRoute
  const origRoute = window.renderRoute;
  window.renderRoute = function() {
    // Restaura exibição padrão se estava em subfolder wrapper
    const subWrapper = document.getElementById('mr-subfolder-wrapper');
    if (subWrapper) {
      subWrapper.style.display = 'none';
      if (subWrapper.parentNode) {
        Array.from(subWrapper.parentNode.children).forEach(ch => {
          ch.style.display = '';
        });
      }
    }

    if (typeof origRoute === 'function') {
      origRoute();
    }
    setTimeout(enhanceViews, 20);
  };

  // Observador de mutações para garantir injeção contínua ao trocar de tela
  const observer = new MutationObserver(() => {
    enhanceViews();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  (function setupFloatingCsvButton(){
    var BTN_ID='mr-global-floating-csv-btn';
    function ensure(){
      if(!document.body||document.getElementById(BTN_ID))return;
      var b=document.createElement('button');
      b.id=BTN_ID;
      b.innerHTML='📥 Importar CSV';
      b.title='Importar flashcards via CSV para a pasta atual';
      b.setAttribute('style','position:fixed;bottom:24px;right:24px;z-index:999999;display:inline-flex;align-items:center;gap:.5rem;background:#16a34a;color:#fff;font-weight:800;font-size:.92rem;padding:.75rem 1.25rem;border-radius:9999px;border:2px solid #86efac;box-shadow:0 8px 24px rgba(22,163,74,.35);cursor:pointer;pointer-events:auto;user-select:none');
      b.onmouseenter=function(){b.style.background='#15803d';};
      b.onmouseleave=function(){b.style.background='#16a34a';};
      b.onclick=function(){
        var ctx=null;
        if(typeof window.currentFolderContext==='function')ctx=window.currentFolderContext();
        if(!ctx&&window.studyState&&window.studyState.deckId)ctx=window.studyState.deckId;
        if(typeof window.openCsvImportModal==='function')window.openCsvImportModal(ctx);
        else if(typeof window.openCsvImport==='function')window.openCsvImport(ctx);
      };
      document.body.appendChild(b);
    }
    ensure();
    new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(ensure,1000);
  })();

})();
</script>
  `

  return html.replace('</body>', hierarchyScript + '\n</body>')
}

export default function Index() {
  useEffect(() => {
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
