# Arquitetura, componentes e roadmap

## Princípios

1. **Portável**: o back-end é um plugin Fastify (`registerLearningCenter`) que só precisa de
   uma conexão `node:sqlite` e de um prefixo de rota. Nenhum estado global.
2. **Modular**: cada domínio tem `service.js` (regras, SQL) e `routes.js` (HTTP + validação zod).
   Serviços são funções puras sobre `db` e um `clock` injetável (testes determinísticos).
3. **Sem suposições sobre o Meu Hub**: nada aqui assume autenticação, layout ou banco dele.
4. **Acessível e calmo (TDAH)**: uma próxima ação em destaque, pouco ruído, feedback discreto
   (toast curto), metas flexíveis e retomada rápida da sessão interrompida.

## Camadas

```
React (Vite) ── fetch /api/v1 ──► Fastify plugin ──► services ──► node:sqlite
apps/web                          routes (zod)       regras       lc_* tables
```

Em produção a própria API serve `apps/web/dist` (um único container, uma porta).

## Migrando para o Meu Hub (sem reescrita)

Back-end:

```js
import { registerLearningCenter, openDb } from '@learning-center/api';
await app.register(registerLearningCenter, { db: meuHubDb, prefix: '/api/learning' });
```

- As tabelas `lc_*` são criadas pelas migrações no banco informado.
- O prefixo muda sem alterar código; no front, defina `VITE_API_BASE`.
- Autenticação: registre o hook do Meu Hub antes do plugin (o plugin não impõe nenhuma).

Front-end: `apps/web/src/pages/*` são rotas React independentes. Dá para montá-las dentro do
shell do Meu Hub (trocando `Layout.jsx`) ou usar o front deste repositório como está.
Os tokens de estilo estão em variáveis CSS (`styles.css`), fáceis de mapear para o tema dele.

Pontos a confirmar quando você me passar a arquitetura do Meu Hub: framework do front, como a
navegação é composta, autenticação e se o banco compartilhado usa `node:sqlite` ou outro driver.

## Componentes do front-end

| Componente | Arquivo | Uso |
|---|---|---|
| `Layout` | `components/Layout.jsx` | Sidebar escura (desktop), barra inferior (mobile), tema |
| `ProgressBar` | `components/ui.jsx` | `role=progressbar`, tons `green`/`blue`, tamanho `lg` |
| `StatusBadge`, `EmptyState`, `ErrorState`, `Skeleton`, `Toast` | `components/ui.jsx` | Estados vazio/erro/carregando e feedback |
| `Modal` | `components/ui.jsx` | Foco preso, Esc fecha, devolve o foco |
| `CourseCard` | `components/CourseCard.jsx` | Card da biblioteca |
| `CourseForm` | `components/CourseForm.jsx` | Cadastro/edição manual |
| `Icon` | `components/Icon.jsx` | Ícones de traço consistentes, `aria-hidden` |

Hooks em `lib/hooks.js`: `useAsync`, `useDebounced`, `useTheme`, `useToast`.

## Acessibilidade

Landmarks (`nav`, `main`, `section` com `aria-label`), foco visível, alvos ≥ 44 px,
`role=progressbar`/`timer`/`checkbox` nos controles próprios, rótulos em todos os campos,
diálogo modal com foco preso, `prefers-reduced-motion` respeitado, contraste verificado nos
tons de texto sobre fundo e tema escuro com tokens equivalentes.
O timer não é anunciado a cada segundo (evita ruído para leitores de tela).

## Integrações futuras (não implementadas)

| Integração | Caminho previsto |
|---|---|
| Google Calendar | Módulo `integrations/calendar` criando eventos de blocos de estudo a partir de metas; OAuth guardado em `lc_settings` criptografado |
| Provedores de IA | Interface `AiProvider` no módulo do tutor; chaves por variável de ambiente; nada é enviado sem ação explícita |
| Plataformas com API oficial | Adaptador por plataforma que preenche `lc_courses/lc_lessons`; **não se presume** que a API pessoal da Udemy sincronize progresso. O cadastro manual continua sendo o caminho padrão |
| Meu Hub | Seção acima |

## Roadmap

- **Fase 1 (este MVP)**: cursos, dashboard, sessões de foco, metas, progresso.
- **Fase 2**: trilhas com pré-requisitos, certificações (cronograma e simulados), anotações em
  Markdown, flashcards com revisão espaçada, laboratórios com evidências, analytics.
- **Fase 3**: tutor IA, recomendações de revisão, integrações (Calendar, IA, plataformas).

Dívidas conhecidas do MVP: sem autenticação; sem exportação/importação de dados; sem
paginação nas listas; testes de interface (componentes) ainda não escritos, apenas utilitários
e API; a verificação em navegador foi feita por roteiro manual (Playwright) fora do repositório.
