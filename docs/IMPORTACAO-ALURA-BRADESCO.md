# Importar da Alura e da Fundação Bradesco

O Lume traz cursos da **Alura** e da **Escola Virtual da Fundação Bradesco** (`ev.org.br`) de duas formas, além da Udemy (veja [`IMPORTACAO-UDEMY.md`](IMPORTACAO-UDEMY.md)):

1. **Colar o link de um curso** (sem login): funciona e foi testado com páginas reais.
2. **Ler "Meus cursos" já logado** (cursos + progresso): **ainda não foi verificado com conta real.** Veja o aviso abaixo.

Em **Cursos → Importar por link** (ou nas abas *Alura*, *Fundação Bradesco*, *Colar link de um curso* da tela de importação) ficam as duas formas.

---

## 1. Colar o link de um curso (sem login)

1. Abra o curso no navegador e copie o endereço da página.
2. No Lume, abra **Importar por link**, cole o endereço e clique em **Ver prévia**.
3. Confira o curso, escolha a **categoria** (padrão *Geral*) e clique em **Importar curso**.

Links aceitos:

| Plataforma | Exemplos |
| --- | --- |
| Alura | `https://www.alura.com.br/curso-online-…` · `https://cursos.alura.com.br/course/…` |
| Fundação Bradesco | `https://www.ev.org.br/cursos/…` |

### O que entra no Lume

| | Alura | Fundação Bradesco |
| --- | --- | --- |
| Título, descrição | sim | sim |
| Instrutor(a) | sim (vai na descrição) | não se aplica (fixo: Fundação Bradesco) |
| Carga horária total | sim (vai na descrição) | sim (vai na descrição) |
| Capa | sim | **não** (a página usa a mesma imagem em todos os cursos) |
| Módulos / aulas | **sim**: capítulos viram módulos e as seções viram aulas | **só os nomes dos módulos** (um módulo "Conteúdo do curso" com uma aula por módulo da Escola Virtual) |
| Duração de cada aula | **não** (o site só mostra o total) | **não** |

As aulas entram com duração 0: a carga horária total fica na descrição do curso. Se a página não trouxer a lista de aulas, o curso é criado sem aulas e o Lume avisa *“Não encontrei as aulas nessa página”*; use então **Colar lista de aulas** (em *Importar de outra plataforma*).

### Importar de novo não duplica

O Lume guarda uma chave por curso (`alura:<slug>` ou `bradesco:<slug>`, coluna `source_key`, migração `010`) e também reconhece cursos cadastrados antes pelo mesmo endereço. Importar de novo só **acrescenta** o que faltou; nunca renomeia, apaga nem desmarca aulas concluídas. Capa e descrição só são preenchidas se estiverem vazias.

### Mensagens de erro

| Mensagem | O que aconteceu |
| --- | --- |
| *Esse link não parece ser de um curso da Alura ou da Fundação Bradesco.* | O endereço é de outro site, de uma página que não é de curso (ex.: a página inicial) ou não começa com `https://`. |
| *A página não abriu…* | Sem internet, site fora do ar ou demorou mais de 15 segundos. |
| *Essa página não existe ou saiu do ar.* | O site respondeu "não encontrado". |
| *Não encontrei os dados de um curso nessa página.* | O site abriu, mas não era uma página de curso (a Alura manda cursos que não existem para a página inicial). |
| *Esse link leva para fora da Alura ou da Fundação Bradesco…* | O site tentou redirecionar para outro domínio; o Lume não abre. |

### Segurança

- Só `https`, e só os domínios `alura.com.br` e `ev.org.br` (o próprio ou um subdomínio; nunca "contém"). Sem usuário/senha, sem porta e sem IP (nada de `127.0.0.1`, `169.254…`, `localhost`).
- Redirecionamentos são seguidos um a um e **cada destino é conferido de novo**; nunca sai da mesma plataforma. No máximo 4.
- Espera até 15 segundos e recusa páginas maiores que 6 MB.
- O texto do site é sempre tratado como **texto**: nenhum HTML dele aparece na tela. A capa só vale se for https do domínio da própria plataforma.

### O que foi verificado com o site real e o que não foi

Verificado em **15/10/2026**, buscando as páginas públicas de verdade (as páginas reduzidas usadas nos testes estão em `apps/api/test/fixtures/`):

- Alura: `www.alura.com.br/curso-online-algoritmos-javascript-i-algoritmos-ordenacao` e `…-agno-agente-ia`. Título, descrição, instrutora, capa e carga horária vêm do JSON-LD da página; a lista de capítulos e seções vem do estado embutido do Next.js (`"chapters"`). O endereço antigo `cursos.alura.com.br/course/<slug>` redireciona para o novo, e o Lume segue esse redirecionamento.
- Escola Virtual: `ev.org.br/cursos/atendimento-ao-publico`, `…/analise-de-dados-no-power-bi`, `…/AI900Azure`, `…/comunicacao_IA`, `…/Analise-de-Balan%C3%A7os`. A página é HTML do servidor (título, duração, descrição e lista de módulos).
- Um link de curso que não existe na Alura (cai na página inicial) vira o erro *“Não encontrei os dados de um curso…”*.

**Não verificado:** qualquer página que exija login (ver abaixo). Os sites mudam: se um dia o importador parar de achar as aulas, o Lume cria o curso sem elas e avisa; nada é gravado de forma errada.

---

## 2. Ler "Meus cursos" já logado (cursos + progresso)

> **Leitura logada ainda não verificada com conta real.** O Lume não entra em conta nenhuma, não pede e não guarda senha. Os leitores foram escritos com base nas páginas públicas e de forma tolerante (reconhecem os links de curso pelo padrão do endereço, não por nomes de classe). Pode ser que no primeiro uso real seja preciso um ajuste fino: é para isso que existe o **diagnóstico**.

### Como usar (app Lume, desktop)

1. Menu **Plataformas → Abrir a Alura** (ou *Abrir a Fundação Bradesco*), ou o botão na tela de importação.
2. Entre na sua conta **dentro da janela** (e-mail e senha; o login pelo Google/Facebook/LinkedIn abre numa janelinha do próprio app).
3. Abra a lista dos seus cursos (Alura: *Meus cursos*; Escola Virtual: a área do aluno) e role até o fim.
4. Clique no botão roxo **Importar meus cursos da Alura / da Fundação Bradesco**, no canto da página.
5. O Lume abre a tela de importação com a **prévia**. Confira e salve.

Cada plataforma tem a sua janela e a sua sessão (o login de uma não vale para a outra), guardada neste computador.

### Como usar (extensão do navegador)

1. Gere a extensão (`npm run build:extension`) e carregue a pasta `apps/extension/dist` (Brave: `brave://extensions` → Modo do desenvolvedor → *Carregar sem compactação*). A extensão agora tem scripts só para `udemy.com`, `alura.com.br` e `ev.org.br`.
2. Entre na plataforma, abra a lista dos seus cursos e clique no botão roxo.
3. A tela de importação do Lume abre com a prévia.

### O que é lido

Por curso: título, link, slug, progresso (%) quando visível (barra de progresso ou texto "NN%"), capa e, se a página mostrar, aulas concluídas ("10 de 40 atividades"). Importar de novo **não duplica** e só sobe o progresso (nunca desce), com a mesma regra da Udemy: o progresso por porcentagem só se aplica a cursos **sem aulas**; cursos importados por link têm aulas, então o progresso deles vem das aulas que você marcar.

Limites conhecidos:
- na Escola Virtual, se você abrir o catálogo público (`/cursos`) em vez da sua lista, o botão lê **todos** os cursos da página; a prévia mostra tudo antes de salvar, então basta cancelar;
- a sincronização automática (a caixinha da Udemy) **não existe** para a Alura nem para a Escola Virtual: o botão é manual;
- o endereço exato da área do aluno da Escola Virtual não pôde ser confirmado sem conta: a janela abre a página inicial.

### Diagnóstico: o que fazer se não achar seus cursos

Se o botão disser *“Não achei cursos nesta página”*, ele já **copia um diagnóstico** para a área de transferência. Você também pode clicar em **Copiar diagnóstico** a qualquer momento. Cole o texto no chat para o ajuste fino.

O diagnóstico é um JSON curto com:

- plataforma, **host** e o caminho **resumido** da página (ex.: `/course/*`; nunca parâmetros do endereço);
- quantos links a página tem e os padrões de link mais comuns;
- a contagem de elementos candidatos (`[role=progressbar]`, `progress`, `img`, títulos…) e quais seletores **funcionaram** ou **falharam**;
- quantos cursos foram lidos, quantos com progresso e com capa;
- até 3 trechos curtos (máx. 40 letras) de **títulos de curso**, com a cadeia de elementos.

O diagnóstico **não** inclui cookies, tokens, e-mails, CPF, telefone, nomes de usuário, parâmetros de endereço (`?token=…`) nem textos de menu/cabeçalho (saudações como "Olá, Fulano" são descartadas). Isso tem teste automático. Ainda assim, **leia antes de colar**.

### Segurança do app desktop

- As janelas das plataformas **só entregam o que leram** e pedem sincronização; nunca recebem dados do app.
- A plataforma de quem envia vem do **endereço da janela**, não da mensagem: a janela da Alura só consegue importar como Alura.
- Só o quadro principal de cada janela é aceito; se a janela navegar para outro site, deixa de ser aceita.
- Links para fora da plataforma abrem no navegador do sistema.
- Alura e Escola Virtual não conseguem enviar conteúdo de aulas nem sincronizar como Udemy.

---

## Para quem mantém o código

- Registro das plataformas: `apps/api/src/core/platforms.js` (API), `apps/desktop/src/platforms.js` (janelas; um teste confere que os domínios são os mesmos), `apps/web/src/lib/platforms.js` (textos).
- Parsers: `apps/api/src/core/course-pages.js` (Alura: JSON-LD + estado do Next.js; Bradesco: HTML do servidor).
- Leitura logada: `apps/web/src/lib/platform-courses.js`, usada por `apps/extension/src/content-platform.js` (gera `content-alura.js` e `content-bradesco.js`; no desktop, `preload-alura.cjs` e `preload-bradesco.cjs`).
- Rotas: veja [`API.md`](API.md): `POST /courses/import-link[/preview]` e o campo `platform` de `POST /courses/import[/preview]`.
