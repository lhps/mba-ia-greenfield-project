# phase-05-video-watch-frontend — Screen Inventory

> **Phase:** Fase 05 — Página de Visualização do Vídeo (frontend slice)
> **Status:** Validated
> **Date:** 2026-11-09
> **Screens in scope:** 1

---

## Screen: Página de visualização do vídeo

**Route:** `/watch/[publicId]`
**Figma:** https://www.figma.com/design/Wa3MJdwiXSgQW2VqZ9q4Zu/FC-Tube?node-id=152-2219 (node `Wa3MJdwiXSgQW2VqZ9q4Zu:152:2219`)
**Purpose (from project-plan.md):** "Layout da página: vídeo principal + informações + sidebar com sugestões".

### Component inventory

| Component (Figma node) | Type | In DS? | Reuse? | Notes |
|---|---|---|---|---|
| TopNav (152:2221) | Local-interactive | ✗ | `components/layout/top-nav.tsx (new)` | Shell/navegação global (1440×62). Fora do escopo deste slice (shell/navegação) — renderizado pelo layout, não pela página |
| Menu trigger (I152:2221;62:1860) | Local-interactive | ✗ | new | Abre/fecha SideNav. Fora do escopo deste slice (shell/navegação) |
| BrandLogo (3050:135, dentro de TopNav) | Presentational | ✓ | `components/auth/brand-logo.tsx` | Inclui `components/icons/streamtube-icon.tsx`. Fora do escopo deste slice (shell/navegação) |
| Search field (I152:2221;62:1878) | Server-connected | ✗ | new | Fora do escopo deste slice (Fase 07 — busca) |
| Voice search button (I152:2221;62:1883) | Local-interactive | ✗ | new | Nenhuma capability em qualquer fase cobre busca por voz. Fora do escopo deste slice (Fase 07 — busca) |
| IconButton "add" (I152:2221;70:31) | Local-interactive | ✓ | `components/ui/icon-button.tsx` | Atalho de criação/upload (navegação). Fora do escopo deste slice (shell/navegação) |
| Account avatar (I152:2221;62:1892) | Server-connected | ✗ | `components/ui/avatar.tsx (new)` | Depende de sessão. Fora do escopo deste slice (shell/navegação) |
| Main content (2732:2119) | Presentational | ✗ | new | Wrapper de layout duas colunas |
| Left column (2732:2117) | Presentational | ✗ | new | Coluna do vídeo principal + informações (+ comentários fora do escopo) |
| Right column (2732:2118) | Presentational | ✗ | new | Sidebar de sugestões |
| Video (152:2323) | Server-connected | ✗ | `components/video/video-player.tsx (new)` | Descrição Figma: "Video player mockup with play controls, scrubber bar, timestamp, and chrome overlays". Recebe URL de stream (presigned, expira) e registra visualização no início da reprodução. Implementação depende de TD-03/TD-04 (pendentes) |
| Poster/thumbnail (I152:2323;108:245) | Presentational | ✗ | new | Imagem de capa antes do play |
| Timeline / progress bar (I152:2323;108:249) | Local-interactive | ✗ | `components/ui/slider.tsx (new)` | Barra de progresso com camadas "loaded"/"played" + scrubber (108:258); opera sobre o `<video>` no cliente |
| Play button (I152:2323;108:262) | Local-interactive | ✗ | new | Play/pause do elemento de mídia |
| Next button (I152:2323;108:264) | Local-interactive | ✗ | new | **Não implementar** (decisão do usuário 2026-11-09) — fora das capabilities (play/pause, volume, progresso); sem fila/autoplay |
| Sound button (I152:2323;108:266) | Local-interactive | ✗ | new | Mute/unmute + slider de nível de volume revelado no hover/foco (decisão do usuário 2026-11-09; slider não desenhado no Figma — reusa `components/ui/slider.tsx (new)`) |
| Timestamp "0:20 / 4:56" (I152:2323;108:270) | Presentational | ✗ | new | Tempo atual / duração derivados do `<video>` |
| Chapter label "• Intro" + arrow (I152:2323;108:271, 108:272) | Presentational | ✗ | new | **Não implementar** (decisão do usuário 2026-11-09) — capítulos não suportados pelo backend nem por capability |
| Right-side player controls (I152:2323;108:275, I152:2323;108:289) | Local-interactive | ✗ | new | **Não implementar** (decisão do usuário 2026-11-09) — autoplay, legendas, configurações, miniplayer, modo teatro e tela cheia (frames 108:276, 108:281, 108:283, 108:290, 108:292, 108:294) fora das capabilities |
| video main column (152:2440) | Presentational | ✗ | new | Wrapper de informações + descrição |
| video title block (152:2441) | Server-connected | ✗ | `components/video/video-info.tsx (new)` | Bloco de informações: título, canal, ações. Dados do detalhe do vídeo (title, channel {nickname, name}) |
| Title text (152:2442) | Presentational | ✗ | new | `<h1>` puro-DOM; recebe título via props |
| Avatar do canal (2409:2276) | Presentational | ✗ | `components/ui/avatar.tsx (new)` | Figma Avatar (5 tamanhos sm/md/lg/xl/2xl); aqui md 40px. Contrato de detalhe não traz avatar do canal (ver Observations) |
| Channel name "Pixel Point" (152:2453) | Local-interactive | ✗ | new | Nome do canal como `<Link>` para a página pública do canal (decisão do usuário 2026-11-09); a rota de destino pertence ao slice frontend da Fase 04, ainda não implementado (ver Open questions) |
| Subscriber count "9.88K subscribers" (152:2454) | Presentational | ✗ | new | Fora do escopo deste slice (Fase 06 — interações sociais); contrato de detalhe não retorna contagem de inscritos |
| Button "Subscribe" (156:3972) | Server-connected | ✓ | `components/ui/button.tsx` | Fora do escopo deste slice (Fase 06 — interações sociais) |
| like counter (152:2462) | Server-connected | ✗ | new | thumb_up (165:2388) + "1.2K". Fora do escopo deste slice (Fase 06 — interações sociais) |
| dislike button (152:2470) | Server-connected | ✗ | new | thumb_down (165:2384). Fora do escopo deste slice (Fase 06 — interações sociais) |
| Button "Share" (158:2697) | Local-interactive | ✓ | `components/ui/button.tsx` | Rótulo "Share" + ícone. Nenhuma fase do project-plan cobre compartilhamento — fora do escopo deste slice |
| IconButton "more_vert" (158:2855) | Local-interactive | ✓ | `components/ui/icon-button.tsx` | **Não implementar** nesta fase (decisão do usuário 2026-11-09) — menu sem ações no slice; download vai para Button próprio |
| Button "Download" (sem nó — adicionado à action row 152:2460) | Server-connected | ✓ | `components/ui/button.tsx` | Não desenhado no Figma; adicionado por decisão do usuário 2026-11-09. Visível só ao dono (channel.nickname == channelSlug da sessão); mesmo estilo do Button "Share" (158:2697) |
| description card wrap (152:2487) | Server-connected | ✗ | `components/video/video-description.tsx (new)` | Exibe descrição vinda do detalhe do vídeo com estado local expandir/recolher |
| Card (158:4025) | Presentational | ✓ | `components/ui/card.tsx` | Container da descrição |
| video meta row (152:2489) | Server-connected | ✗ | new | "10K views" (152:2490) + "• 3 weeks ago" (152:2491) — view_count e data de publicação do detalhe do vídeo |
| Description text (152:2493) | Presentational | ✗ | new | Texto puro; Figma estiliza timestamps e URLs em azul (#1976d2 hex, fora de tokens) |
| "Show More" toggle (dentro do texto 152:2493) | Local-interactive | ✗ | new | Não é nó próprio — é a última linha do text node 152:2493; sem variante "Show less"/recolhido no Figma |
| Comments header (2732:2116) | Presentational | ✗ | new | "4,256 Comments" (158:3836). Fora do escopo deste slice (Fase 06 — interações sociais) |
| comments sort (158:3856) | Local-interactive | ✗ | new | "Sort by: Latest" + Filter list (158:3848). Fora do escopo deste slice (Fase 06 — interações sociais) |
| Comment input row (158:3857) | Server-connected | ✗ | new | avatar placeholder (158:3858) + Comment input (158:3860). Fora do escopo deste slice (Fase 06 — interações sociais) |
| comment (158:3862) | Server-connected | ✗ | new | Autor, data, texto, thumb up (158:3871), thumb down (158:3877), Reply (158:3882). Fora do escopo deste slice (Fase 06 — interações sociais) |
| TabMenu (156:3978) | Local-interactive | ✗ | new | **Não implementar** (decisão do usuário 2026-11-09) — chips "All / From WebDev Simplified / React / Node.js" sem suporte no contrato de sugestões |
| recommended videos list (158:3801) | Server-connected | ✗ | `components/video/suggested-videos.tsx (new)` | Sidebar de sugestões (até 12, mesma categoria); Figma mostra 5 |
| VideoCard (158:3729) | Local-interactive | ✗ | `components/video/video-card.tsx (new)` | Variante "list" (horizontal) do VideoCard Figma; navega para `/watch/[publicId]` via `<Link>`; dados recebidos da lista |
| VideoCard (158:3767) | Local-interactive | ✗ | `components/video/video-card.tsx (new)` | see screen: Página de visualização do vídeo — mesma variante de 158:3729 |
| VideoCard (158:3784) | Local-interactive | ✗ | `components/video/video-card.tsx (new)` | see screen: Página de visualização do vídeo — mesma variante de 158:3729 |
| VideoCard (158:3802) | Local-interactive | ✗ | `components/video/video-card.tsx (new)` | see screen: Página de visualização do vídeo — mesma variante de 158:3729 |
| VideoCard (158:3819) | Local-interactive | ✗ | `components/video/video-card.tsx (new)` | see screen: Página de visualização do vídeo — mesma variante de 158:3729 |
| Duration badge "12:31" (I158:3729;143:2533) | Presentational | ✗ | new | Sub-elemento do VideoCard; exibido (decisão do usuário 2026-11-09) — `PublicVideoDto` já expõe `duration_seconds` |
| Verified badge (I158:3729;143:2541) | Presentational | ✗ | new | Sub-elemento do VideoCard; nenhuma capability cobre verificação de canal |

### Verbs of intent

| Verb | Component | Capability (project-plan.md) |
|---|---|---|
| Reproduzir o vídeo com controles de play/pause, volume e barra de progresso | Video (152:2323) | "Player de vídeo com controles: play/pause, volume e barra de progresso" |
| Registrar uma visualização ao iniciar a reprodução | Video (152:2323) | "Player de vídeo com controles: play/pause, volume e barra de progresso" |
| Renovar a URL de stream quando ela expirar durante a reprodução | Video (152:2323) | "Player de vídeo com controles: play/pause, volume e barra de progresso" |
| Exibir título e canal do vídeo | video title block (152:2441) | "Layout da página: vídeo principal + informações + sidebar com sugestões" |
| Exibir contagem de visualizações e data de publicação | video meta row (152:2489) | "Layout da página: vídeo principal + informações + sidebar com sugestões" |
| Baixar o arquivo do vídeo (apenas para o dono do canal) | Button "Download" (action row 152:2460) | "Layout da página: vídeo principal + informações + sidebar com sugestões" |
| Exibir sugestões de vídeos da mesma categoria na sidebar | recommended videos list (158:3801) | "Layout da página: vídeo principal + informações + sidebar com sugestões" |
| Exibir descrição do vídeo com expansão/recolhimento | description card wrap (152:2487) | "Descrição do vídeo com expansão/recolhimento" |

### Observations

- Rota `/watch/[publicId]` depende de phase-05-video-watch-frontend/TD-01 (pendente). Renderização/carregamento (TD-02), implementação do player (TD-03) e aquisição/expiração da URL de stream (TD-04) também pendentes — afetam a classificação dos controles do `Video` e o verbo de renovação de URL.
- **Botão de download ausente no design:** nem Button 158:2697 ("Share") nem IconButton 158:2855 (`more_vert`) são download. Resolvido (usuário, 2026-11-09): Button "Download" novo na action row, mesmo estilo do "Share", visível só ao dono (channel.nickname == channelSlug da sessão); `more_vert` não é implementado.
- **TabMenu (156:3978):** chips de filtro de sugestões sem suporte no contrato de backend — resolvido (usuário, 2026-11-09): não implementar; sidebar mostra a lista direta.
- **Volume:** Figma mostra apenas o Sound button (I152:2323;108:266), sem slider de nível nem variantes de estado (mudo/som, play/pause). Resolvido (usuário, 2026-11-09): mute/unmute + slider de volume revelado no hover/foco, reusando o mesmo `components/ui/slider.tsx (new)` da barra de progresso. Estados play/pause e mudo/som derivados dos ícones padrão.
- **Controles do player fora das capabilities** (Next, rótulo de capítulo, autoplay, CC, configurações, miniplayer, teatro, tela cheia) — resolvido (usuário, 2026-11-09): não implementar; o player expõe só play/pause, volume, barra de progresso e timestamp.
- **Visível no screenshot, sem nome no get_design_context:** os controles à direita do player (toggle de autoplay, legendas/CC, configurações, miniplayer, modo teatro, tela cheia) aparecem como frames sem nome (I152:2323;108:276, 108:281, 108:283, 108:290, 108:292, 108:294) — identificados só pelo screenshot. O ícone de microfone na TopNav (I152:2221;62:1883) também vem como "Auto Layout Horizontal" sem nome no código.
- **"Show More"** não é componente: é a última linha do text node 152:2493; não existe estado recolhido nem rótulo "Show less" no Figma (card mostrado sempre expandido, 416px). Timestamps e URLs da descrição usam cor hex #1976d2 (fora de tokens); linkificação/saltos de capítulo não são cobertos por nenhuma capability.
- **Dados sem contrato no backend:** avatar do canal (2409:2276) e contagem de inscritos (152:2454) não estão no contrato de detalhe (channel {nickname, name}). Duração (12:31) e selo de verificado nos cards de sugestão também não confirmados no contrato.
- **Fora do escopo deste slice (inventariados, sem verbos):** like/dislike (152:2461), Subscribe (156:3972), contagem de inscritos (152:2454), cabeçalho/ordenação/input/item de comentários (2732:2116, 158:3856, 158:3857, 158:3862) — Fase 06; TopNav (152:2221) com busca/busca por voz (Fase 07) e menu/criar/avatar da conta (shell/navegação); Share (158:2697) — sem fase no project-plan.
- Sidebar mostra 5 VideoCards; backend retorna até 12. Cards usam variante "list" (horizontal) do VideoCard Figma — o mesmo VideoCard aparece em Home e Channel Show, por isso o alvo reutilizável `components/video/video-card.tsx (new)`.
- Acesso anônimo à visualização não é bullet deste slice, mas a tela não exige sessão para nenhum verbo do slice — só o download (owner-only) depende da sessão.

---

## Reconciliation summary

| Capability (project-plan.md) | Covered by | Screens |
|---|---|---|
| "Player de vídeo com controles: play/pause, volume e barra de progresso" | Video (VideoPlayer: Play button, Sound button + volume slider, Timeline/progress bar, Timestamp) | /watch/[publicId] |
| "Layout da página: vídeo principal + informações + sidebar com sugestões" | video title block, video meta row, Button "Download", recommended videos list (VideoCard) | /watch/[publicId] |
| "Descrição do vídeo com expansão/recolhimento" | description card wrap ("Show More" toggle) | /watch/[publicId] |

## Open questions

- Rota `/watch/[publicId]` assumida da recomendação de `phase-05-video-watch-frontend/TD-01`, ainda pendente. Se o TD-01 decidir outra opção, a rota deste inventory precisa ser atualizada.
- Link do nome do canal (152:2453): a página pública de canal no frontend pertence ao slice frontend da Fase 04, que ainda não foi implementado. Qual é o padrão de rota (ex.: `/channels/[nickname]` ou `/@[nickname]`)? E o link deve existir enquanto a página de destino não existe?
- Avatar do canal (2409:2276): o contrato de detalhe (`channel { nickname, name }`) não traz imagem. Usar um avatar fallback (iniciais do nome) ou omitir o avatar?
- Estado recolhido da descrição: o Figma só mostra o card expandido, com "Show More" no fim do texto. A altura recolhida (número de linhas) e o rótulo do estado expandido ("Show less") não estão desenhados.
- Data relativa ("3 weeks ago") e contagem compacta ("10K views"): o formato e o locale (pt-BR vs en) não estão definidos. O Figma está em inglês e as fases anteriores usam textos em inglês na UI.
