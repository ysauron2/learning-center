# Detecção automática do curso

Quando você abre um curso no site de uma plataforma, o Lume pode marcá-lo sozinho como **em andamento**.
Funciona no **app do Lume (janelas da Alura e da Fundação Bradesco)** e na **extensão do navegador** (Alura, Fundação Bradesco, Microsoft Learn, freeCodeCamp, Coursera e Rocketseat). A Udemy continua com a sincronização que já existia.

## Como funciona
1. Você abre uma página de curso ou de aula. O Lume reconhece pelo endereço (as regras ficam no registro `apps/api/src/core/platforms.js`, as mesmas da importação por link):
   - Alura: `/curso-online-<nome>` e `cursos.alura.com.br/course/<nome>[/task/<n>]`
   - Fundação Bradesco: `/cursos/<nome>`
   - Microsoft Learn: `/training/paths/<nome>/`, `/training/modules/<nome>/` (inclui páginas de unidade) e certificações
   - freeCodeCamp: `/learn/<bloco>/…`
   - Coursera: `/learn/<curso>/…`
   - Rocketseat: `/formacao/<nome>`
   - Home, busca, perfil e carrinho são ignorados.
2. O Lume decide o que fazer:
   - curso novo → importa pelo mesmo caminho da importação por link e cria **em andamento** (no modo “Perguntar”, antes pergunta);
   - curso existente planejado/pausado → passa para **em andamento** (sem perguntar, com **Desfazer**);
   - curso concluído → não muda;
   - se a página mostra a porcentagem de progresso e ela é maior que a atual, atualiza (o progresso nunca desce; 100% não conclui o curso sozinho).
3. Visita repetida ao mesmo curso em menos de 1 hora só atualiza a “última visita” (e o progresso, se subiu). Se o Lume não conseguir ler a página (sem internet, por exemplo), nada quebra: ele tenta de novo na próxima visita.

## Ligar e desligar
Em **Importar → Colar link** (e nas telas de cada plataforma), cartão **“Marcar cursos automaticamente”**:
- **Perguntar** (padrão): aparece um aviso na página — “Lume: adicionar ‘NOME’ aos seus cursos?” com **Adicionar**, **Sempre automático** e **Agora não** (não pergunta de novo sobre esse curso por 7 dias).
- **Automático**: adiciona sozinho e mostra um aviso curto com **Desfazer** (remove o curso criado agora — só se ainda não tiver estudo nem anotações — ou volta ao status anterior; vale por 10 minutos).
- **Nunca**: não faz nada.

## O que é enviado (e o que não é)
Enviado ao Lume do **seu computador** (`127.0.0.1`/`localhost`; nada vai para servidor externo): o **título da página**, a **porcentagem de progresso** (só se a própria página mostra uma barra de progresso identificada como tal; nunca inventada) e a sua resposta ao aviso. A plataforma e o endereço (sem parâmetros de busca nem trecho depois do `#`) vêm da aba/janela que enviou, nunca da mensagem.

**Não** é enviado: conteúdo da página, cookies, e-mail, nome de usuário, senha ou qualquer dado pessoal. A única ida à internet é a leitura da página **pública** do curso, que o Lume já fazia na importação por link.

Abas em segundo plano e páginas dentro de iframes são ignoradas. Os textos do site são tratados sempre como texto (nunca como HTML).

## Para instalar
- App do Lume: feche e abra de novo.
- Extensão (versão 0.3.0): em `brave://extensions` (ou `chrome://extensions`) clique em **Recarregar** na extensão `apps/extension/dist`. Ela passa a rodar também em Microsoft Learn, freeCodeCamp, Coursera e Rocketseat; o navegador pode pedir permissão para os novos sites.

## O que foi verificado de verdade e o que não
- **Verificado com a rede (15/10/2026):** os padrões de endereço da Alura (`/curso-online-…` e `cursos.alura.com.br/course/…`, que redireciona para o endereço novo), Fundação Bradesco, Microsoft Learn (trilha, módulo e unidade), freeCodeCamp e Coursera abrem páginas públicas reais; busca, home e listas são recusadas pelo registro.
- **Testes automáticos:** API (rota `visit`, modos, 1 hora, progresso, “agora não”, desfazer, host fora da lista/SSRF, migração 011 numa cópia do banco real e backup/restauração), content script (só envia o permitido, sem dados pessoais, ignora iframe/aba oculta/página que não é de curso, aviso em português), ponte do app (origem e lista de mensagens), extensão (manifesto e `background`) e a tela do interruptor.
- **Não verificado:** o aviso aparecendo dentro das páginas reais das plataformas (precisa do app/extensão abertos nelas); a leitura da porcentagem de progresso nas plataformas (depende de login e do HTML de cada site; se não achar uma barra identificada, simplesmente não envia progresso); o app não tem janela para Microsoft Learn etc. (lá só a extensão atua).
