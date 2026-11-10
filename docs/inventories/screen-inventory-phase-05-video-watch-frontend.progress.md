# phase-05-video-watch-frontend — Screen Inventory Progress

**Status:** completed
**Screens:** 1/1 completed

## Reconciled screen list

| # | Screen name                          | URL (fileKey:nodeId)            | Status    |
|---|--------------------------------------|---------------------------------|-----------|
| 1 | Página de visualização do vídeo      | Wa3MJdwiXSgQW2VqZ9q4Zu:152:2219 | completed |

## Screens removed as out-of-scope

- ~~Estado "vídeo indisponível / não encontrado"~~ — sem frame no Figma (arquivo importado de `FC Tube.fig`); tratado como `not-found` genérico, fora do inventory.

## Decisions log

- ✓ [DECISION: rota da tela de exibição] — resolved: `/watch/[publicId]` (recomendação de `phase-05-video-watch-frontend/TD-01`, ainda `pending` no decisions doc; usuário não objetou).
- ✓ [DECISION: tela 2 "vídeo indisponível"] — resolved: sem frame no Figma → fora do inventory.
- ✓ Figma source — arquivo do curso (`Doz7n3FsRhfvelYrPhTZAG`) inacessível pela conta do MCP; usuário importou `FC Tube.fig` → novo fileKey `Wa3MJdwiXSgQW2VqZ9q4Zu` (node ids preservados). Token drift check: sem drift vs `next-frontend/app/globals.css`.
- ✓ [DECISION 1: Next button do player (I152:2323;108:264)] — resolved: não implementar
- ✓ [DECISION 2: Chapter label "• Intro" (I152:2323;108:271)] — resolved: não implementar
- ✓ [DECISION 3: controles à direita do player (autoplay, CC, settings, miniplayer, teatro, tela cheia)] — resolved: não implementar nenhum
- ✓ [DECISION 4: nome do canal (152:2453)] — resolved: `<Link>` para página pública do canal (rota de destino → Open questions)
- ✓ [DECISION 5: download] — resolved: Button "Download" novo na action row, só ao dono; `more_vert` não implementado
- ✓ [DECISION 6: TabMenu de filtros na sidebar (156:3978)] — resolved: não implementar
- ✓ [DECISION 7: badge de duração (I158:3729;143:2533)] — resolved: exibir (`PublicVideoDto.duration_seconds` existe)
- ✓ [VALIDATION: volume] — resolved: mute/unmute + slider de volume no hover/foco
