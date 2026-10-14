# Meu Hub · Learning Center

Plataforma pessoal de estudos: cursos, sessões de foco, metas semanais e progresso.
Este repositório é o **MVP** (Fase 1) do design aprovado. Os módulos avançados
(trilhas, certificações, anotações, laboratórios, analytics, tutor IA) aparecem
como “em breve” na navegação e entram nas próximas fases (veja `docs/ARQUITETURA.md`).

## O que já funciona

- **Dashboard**: próxima ação em destaque, horas da semana, meta semanal ajustável,
  sequência de dias, gráfico por dia e histórico recente.
- **Cursos**: cadastro manual, busca, filtros por status/plataforma/categoria, tags,
  progresso por aulas concluídas ou por porcentagem manual.
- **Detalhe do curso**: módulos e aulas, marcar aula concluída, continuar, pausar,
  concluir, editar e excluir.
- **Sessões de foco**: Pomodoro ou cronômetro, pausa/retomada, finalização com nota e
  nível de foco, registro manual de tempo. A sessão sobrevive a recarregar a página.
- **Tema claro/escuro** e layout responsivo (barra inferior no celular).

Nada depende de API externa: o cadastro e o acompanhamento são manuais.
Não há sincronização com a Udemy nem com outras plataformas.

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
