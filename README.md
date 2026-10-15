# Lume

Plataforma pessoal de estudos: cursos, sessões de foco, metas semanais e progresso.
Este repositório é o **MVP** (Fase 1) do design aprovado. Os módulos avançados
(certificações, tutor IA) aparecem
como “em breve” na navegação e entram nas próximas fases (veja `docs/ARQUITETURA.md`).

## O que já funciona

- **Trilhas**: o roteiro dos seus cursos na ordem em que você quer fazer. Crie marcando os cursos numa lista, ou com um clique a partir de sugestões por categoria. A trilha avança sozinha, mostra a próxima etapa e aceita etapas avulsas (prova, projeto…).
- **Anotações**: Markdown (títulos, listas, tabelas, tarefas) com prévia, busca sem acento, tags e vínculo opcional com curso e aula; salva sozinha.
- **Plataforma e categoria à escolha**: ao cadastrar um curso (e ao importar da Udemy), escolha entre as que já existem ou crie a sua. Em *Cursos → Categorias e plataformas* dá para renomear e excluir (os cursos vão para "Geral" ou "Outro").
- **Início com atalhos**: foco rápido de 15/25/45 min, aviso de bloco perdido com "remarcar para hoje" e anotação rápida. Veja [`docs/INICIO.md`](docs/INICIO.md).
- **Google Agenda**: veja os próximos 7 dias no início e monte um plano de estudo semanal que aparece sozinho no seu Google Agenda (num calendário próprio), junto com as sessões de foco concluídas. Veja [`docs/GOOGLE-AGENDA.md`](docs/GOOGLE-AGENDA.md).
- **Notion**: com um código só (sem Google Cloud), o app cria no seu Notion a tabela "Learning Center · Estudos" com seus horários de estudo e sessões de foco; o Notion Calendar mostra essa tabela junto com Google e iCloud. Veja [`docs/NOTION.md`](docs/NOTION.md).
- **Backup**: baixa todos os dados num arquivo e restaura de um arquivo (tela **Backup**), com prévia, confirmação e uma cópia de segurança automática antes de substituir.
- **Analytics**: tempo por dia/semana, por curso, quando você estuda (mapa de calor), foco, sequência e histórico da meta, com filtro de período.
- **Dashboard**: próxima ação em destaque, horas da semana, meta semanal ajustável,
  sequência de dias, gráfico por dia e histórico recente.
- **Cursos**: cadastro manual, busca, filtros por status/plataforma/categoria, tags,
  progresso por aulas concluídas ou por porcentagem manual.
- **Detalhe do curso**: módulos e aulas, marcar aula concluída, continuar, pausar,
  concluir, editar e excluir.
- **Sessões de foco**: Pomodoro ou cronômetro, pausa/retomada, finalização com nota e
  nível de foco, registro manual de tempo. A sessão sobrevive a recarregar a página.
- **Tema claro/escuro** e layout responsivo (barra inferior no celular).

- **Importar da Udemy**: extensão de navegador que lê a página "Meu aprendizado" (você já
  logado) e cadastra os cursos novos, com prévia antes de salvar; também importa módulos e aulas de cada curso (um clique por curso). Veja
  [`docs/IMPORTACAO-UDEMY.md`](docs/IMPORTACAO-UDEMY.md).

- **Importar da Alura e da Fundação Bradesco**: cole o link de um curso (sem login) e o Lume traz título, descrição, carga horária, capa e a lista de aulas; também lê a lista dos seus cursos e o progresso pela janela logada do app ou pela extensão (leitura logada ainda não verificada com conta real). Veja [`docs/IMPORTACAO-ALURA-BRADESCO.md`](docs/IMPORTACAO-ALURA-BRADESCO.md).
- **Importar de outra plataforma**: cole o link de uma playlist pública do YouTube ou uma lista de aulas e o Lume monta o curso (módulos, aulas e tempos). Veja [`docs/IMPORTACAO-OUTRAS.md`](docs/IMPORTACAO-OUTRAS.md).

Nada depende de API externa (a API de Afiliado da Udemy foi descartada): o acompanhamento é
manual, e a importação da Udemy só traz o que a própria página mostra (cursos, progresso, módulos e aulas).

## Requisitos

- Node.js **22.13+** (usa `node:sqlite`, que ainda emite um aviso “experimental”).
- Docker (opcional, para produção).

## Rodando em desenvolvimento

```bash
npm install
npm run dev:api        # API em http://localhost:3000
npm run dev:web        # front em http://localhost:5173 (proxy para /api)
npm run seed:demo      # opcional: dados DEMO claramente rotulados
```

O banco fica em `data/learning-center.db` (ignorado pelo git).

## App de desktop (Electron)

`iniciar-desktop.bat` (ou `npm run desktop`) abre o Learning Center como programa com janela própria e a janela da Udemy embutida, sem extensão. Veja [`docs/DESKTOP.md`](docs/DESKTOP.md).

## Atalho de um clique (Windows)

`iniciar-learning-center.bat` instala o que faltar na primeira vez, sobe o app e abre o navegador em
http://localhost:3000 (se já estiver rodando, só abre o navegador). Deixe a janela aberta enquanto usa;
feche para parar. Para criar um atalho na área de trabalho, clique com o botão direito no arquivo →
*Enviar para* → *Área de trabalho (criar atalho)*.

## Produção local (sem Docker)

```bash
npm run build          # gera apps/web/dist
npm start              # API + front em http://localhost:3000
```

## Docker

```bash
docker compose up -d --build     # http://localhost:3000
```

- Dados persistem no volume `learning-center-data` (`/data/learning-center.db`).
- Fuso padrão `America/Sao_Paulo` (define o início da semana e a sequência de dias).
- Variáveis em `.env.example`.
- **Observação:** o `Dockerfile` e o `docker-compose.yml` foram escritos, mas a imagem
  **não pôde ser construída** no ambiente de desenvolvimento (sem daemon Docker). O
  que foi validado: o mesmo `npm ci --omit=dev` + `node apps/api/src/server.js` numa
  cópia limpa. Rode `docker compose up --build` uma vez e reporte qualquer ajuste.

## Testes

```bash
npm test               # API (vitest, SQLite em memória) + utilitários do front
```

## Estrutura

```
apps/
  api/
    migrations/        SQL versionado (prefixo lc_ nas tabelas)
    src/
      index.js         ponto de entrada portátil: registerLearningCenter(app, opts)
      app.js, server.js  app standalone (API + estáticos)
      core/            db, migrate, errors, time
      modules/         courses · sessions · goals · dashboard (service + routes)
    test/              testes de API e de regras de negócio
    scripts/seed-demo.js
  web/
    src/
      pages/           Dashboard, Courses, CourseDetail, Focus
      components/      Layout, ui (ProgressBar, Modal, …), CourseCard, CourseForm, Icon
      lib/             api, format, hooks
      styles.css       tokens (claro/escuro) e componentes
docs/                  API, banco de dados, arquitetura e integração com o Meu Hub
```

## Documentação

- [`docs/API.md`](docs/API.md): rotas.
- [`docs/BANCO-DE-DADOS.md`](docs/BANCO-DE-DADOS.md): tabelas e regras.
- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): módulos, componentes, acessibilidade, integração futura com o Meu Hub e roadmap.
