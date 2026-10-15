# Google Agenda

O app lê a sua agenda (próximos 7 dias, no início) e escreve **só num calendário próprio**, chamado **Learning Center · Estudos**: seus outros eventos nunca são alterados nem apagados.

## O jeito mais fácil: Calendário da Apple (Mac e iPhone)

Sem conta, sem chave, sem senha: o Calendário da Apple **assina** um endereço do app e se atualiza sozinho. Na tela **Agenda**, clique em **Abrir no Calendário** (no Mac abre o Calendário e pergunta se quer assinar) e escolha atualização **a cada 15 minutos**. Manualmente: *Arquivo → Nova assinatura de calendário…* e cole `http://localhost:3000/api/v1/calendar/feed.ics`.

O endereço entrega o **plano de estudo** (4 semanas, com lembrete de 10 min) e as **sessões de foco** concluídas. Limites: só atualiza com o Learning Center aberto no mesmo computador; **o Google Agenda não consegue assinar esse endereço** (ele busca pela internet e não alcança o seu computador); e não mostra seus compromissos no início do app (isso só a conexão com o Google faz).

Prefere algo ainda mais simples que o Google? Veja também [`NOTION.md`](NOTION.md) (um código só).

## O que sincroniza com o Google

| Direção | O quê |
|---|---|
| Google → app | Os próximos 7 dias, da agenda principal e da de estudos, no início. Atualiza a cada 2 minutos (ou ao clicar em "Sincronizar agora"). |
| App → Google | **Plano de estudo semanal**: cada bloco vira um evento "📚 Estudar: <curso>" nas próximas 4 semanas, com lembrete de 10 min e a próxima aula na descrição. |
| App → Google | **Sessões de foco concluídas** (as dos últimos 14 dias, de pelo menos 1 minuto, sem os registros manuais) viram "✅ Estudei: <curso> (45 min)". Dá para desligar. |

A sincronização automática roda a cada 30 minutos enquanto o app está aberto (servidor ou app de desktop), e também ao clicar em "Sincronizar agora" ou ao mexer no plano. É **idempotente**: sincronizar de novo não duplica nada. Mudou o horário ou o curso do bloco, o evento é atualizado; apagou o bloco, o evento some. Só os eventos que o app criou (marcados com `lcKind` nas propriedades privadas) são tocados.

## Como conectar (uma vez, uns 5 minutos)

Cada pessoa cria a própria "chave" gratuita no Google Cloud. A tela **Agenda** do app tem o passo a passo; em resumo:

1. Criar um projeto em console.cloud.google.com.
2. Ativar a **Google Calendar API**.
3. Tela de permissão OAuth: tipo **Externo**, seu nome e e-mail, e **seu e-mail em "Usuários de teste"**.
4. Credenciais, ID do cliente OAuth, tipo **App para computador**. Copiar o ID e a chave secreta.
5. Colar na tela Agenda, **Salvar** e **Conectar ao Google**.

> Enquanto o projeto está em "Teste", o Google **desconecta a cada 7 dias**. Para evitar, publique o app (Tela de permissão OAuth, *Publicar app*). Ao conectar vai aparecer um aviso de "app não verificado"; pode seguir, porque o app é seu (limite do Google sem verificação: 100 pessoas).

O tipo "App para computador" aceita o endereço de retorno em `localhost` ou `127.0.0.1`, em qualquer porta, então serve tanto para o modo navegador (`http://localhost:3000`) quanto para o app de desktop. Se a pessoa abre o app por outro endereço (por exemplo, o IP do servidor na rede), o Google **não** aceita o retorno nesse tipo de chave: conecte por `localhost` ou pelo app de desktop.

## Permissões pedidas ao Google

- `calendar.events`: ler e escrever eventos.
- `calendar.app.created`: criar e gerenciar **só** o calendário criado pelo app.

Não pede e-mail, contatos nem acesso à lista de agendas inteira. A conexão usa OAuth 2.0 com **PKCE** e um `state` de uso único (vale 10 minutos).

## Onde ficam as credenciais

Na tabela `lc_google` do banco local (ID, chave secreta e tokens). Elas **não entram no backup** (nem no arquivo `.json`, nem na restauração: restaurar não desconecta). Quem copia o arquivo do banco leva as credenciais junto, então trate `data/learning-center.db` como dado sensível. A API nunca devolve a chave secreta nem os tokens.

Desconectar revoga o acesso no Google e apaga os tokens (o ID e a chave ficam para reconectar). Dá também para remover o app em myaccount.google.com/permissions.

## Se der erro

| Mensagem | O que fazer |
|---|---|
| "Erro 400: redirect_uri_mismatch" (tela do Google) | A chave foi criada como **Aplicativo da Web**, que exige o endereço de retorno cadastrado. Crie outra do tipo **App para computador** ou, na que você tem, adicione em *URIs de redirecionamento autorizados* o endereço mostrado na tela Agenda (`http://localhost:3000/api/v1/calendar/callback`) e espere uns minutos. |
| "Calendar API has not been used…" | Ativar a Google Calendar API no projeto (passo 2). |
| "O Google não enviou a permissão de uso contínuo" | Remover o acesso do app em myaccount.google.com/permissions e conectar de novo. |
| "O acesso expirou ou foi removido. Conecte de novo." | Projeto em "Teste" (7 dias) ou acesso removido: conectar de novo. |
| "Pedido de conexão inválido" ao voltar do Google | O pedido vale 10 minutos e uma vez só: clique em Conectar de novo. |

## Testes

Tudo foi testado contra um **simulador do Google** (`apps/api/test/fake-google.js`): login com PKCE, renovação do acesso, páginas de resultados, criação, atualização e remoção de eventos, calendário apagado, acesso revogado. **Nunca foi testado contra o Google de verdade.** A primeira conexão real é o teste final.
