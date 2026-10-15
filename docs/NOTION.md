# Notion e Notion Calendar

O jeito de colocar seus horários de estudo no calendário **sem criar nada no Google Cloud**: você cria uma "integração" no Notion (1 minuto), cola o código no app e pronto. O app cria no seu Notion uma tabela chamada **Learning Center · Estudos** e a mantém atualizada. O **Notion Calendar** mostra essa tabela junto com seu Google Agenda e o iCloud.

## O que vai para o Notion
- **Blocos do plano de estudo** (tela Agenda → Plano de estudo): uma linha por ocorrência, nas próximas 4 semanas — `📚 Estudar: <curso>`, tipo **Estudo**, com o horário em **Quando** e a próxima aula em **Detalhes**.
- **Sessões de foco concluídas** (últimas 2 semanas, opcional): `✅ Estudei: <curso> (<min> min)`, tipo **Sessão feita**.
- Nada é lido do Notion além das linhas dessa tabela. Linhas que você criar à mão na tabela (sem a coluna **Chave** preenchida) nunca são tocadas.

## Como conectar (uma vez, uns 2 minutos)
1. Abra <https://www.notion.so/profile/integrations> → **Nova integração** → nome *Learning Center* → escolha o seu espaço → salvar. Em **Segredo da integração**, clique em **Mostrar** e **copie** o código (começa com `ntn_` ou `secret_`).
2. No Notion, abra ou crie uma página (ex.: *Estudos*) → **"…"** no canto de cima → **Conexões** → adicione *Learning Center*. É isso que dá à integração permissão para criar a tabela ali.
3. No app: **Agenda → Notion** → cole o código → **Salvar código** → escolha a página → **Criar tabela de estudos**.
4. No **Notion Calendar**: *Configurações* → sua conta do Notion → adicione a tabela **Learning Center · Estudos** (a data usada é a coluna **Quando**). Os nomes dos menus podem mudar com o tempo.

## Como funciona a sincronização
- **Sincronizar agora** ou, a cada 30 minutos com o app aberto, automaticamente (desligável).
- Cada linha tem uma **Chave** estável (`plan-<id>-<data>` / `session-<id>`): mudou horário, duração ou curso → a mesma linha é atualizada; apagou o bloco → as linhas futuras são arquivadas; sincronizar duas vezes não duplica.
- Blocos de hoje que já passaram viram histórico e não são mexidos.
- Se você apagar uma linha futura à mão, ela volta na próxima sincronização (o app é a fonte do plano).
- O Notion aceita ~3 pedidos por segundo: o app espaça as chamadas e, se o Notion pedir calma (429), espera e tenta de novo. A primeira sincronização de um plano grande pode levar alguns segundos.

## Segurança
- O código fica só no banco local (`lc_notion`) e **não vai para o backup** nem é devolvido pela API. A integração só enxerga as páginas que você compartilhar com ela.
- Para revogar: apague a integração em notion.so/profile/integrations ou remova a conexão da página.

## Se der erro
| Mensagem | O que fazer |
| --- | --- |
| "O Notion não aceitou esse código" | Copie o segredo inteiro de novo (sem espaços) em *Integrações*. |
| "O Notion não encontrou essa página" | Faça o passo 2: *…* → *Conexões* → adicionar a integração e clique em *Atualizar lista*. |
| "O Notion não encontrou mais a tabela…" | A tabela foi apagada ou perdeu o acesso. Escolha a página e crie a tabela de novo. |
| "O Notion recusou o código" | O código foi revogado. Cole um novo (*Trocar o código*). |

## Limites
- Uma conta/espaço do Notion por instalação.
- Depois de **restaurar um backup**, reconecte o Notion (o código não vai no backup).
- O app usa a versão `2022-06-28` da API do Notion, fixada de propósito.
- Os testes usam um simulador do Notion (`apps/api/test/fake-notion.js`); a conexão real com o seu espaço depende de você colar o código.
