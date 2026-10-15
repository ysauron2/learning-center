# App de desktop (Electron)

O Lume, num programa com janela própria e **a janela da Udemy embutida**: a pessoa entra na conta dela ali dentro e o app sincroniza, sem extensão de navegador, sem loja e sem aprovação.

## Rodar (desenvolvimento, Windows)

```bash
npm install
npm run desktop        # ou dê dois cliques em iniciar-desktop.bat
```

`npm run desktop` gera o site, empacota o servidor (`apps/desktop/dist/server.mjs`) e abre o Electron.

## Como funciona

```
Janela do app ──(preload-app)──┐                          ┌── API local (127.0.0.1:38250, SQLite)
                               ├─ processo principal ─────┤
Janela da Udemy ─(preload-udemy)┘   (ponte: bridge.js)    └── dados em %APPDATA%\Learning Center
```

- O servidor (API + site) roda **dentro** do app, só em `127.0.0.1`. Porta preferida 38250; se estiver ocupada, usa outra livre.
- A janela da Udemy usa uma sessão própria e persistente (`persist:udemy`): o login fica salvo até a pessoa sair da conta.
- A leitura da Udemy é **a mesma da extensão** (`content-udemy.js`), injetada por um preload que troca o `chrome.*` por IPC. Tudo o que a extensão faz (botão roxo, "Sincronizar automaticamente", diagnóstico) funciona igual.
- **Quem pode falar com quem** (`apps/desktop/src/bridge.js`): a Udemy só entrega o que leu e pede sincronização; o app só busca o que ficou pendente e pede para abrir a Udemy. O processo principal confere a janela de origem, o quadro principal (iframes são recusados) e o endereço de quem enviou. A Udemy nunca recebe nada do app. A comunicação com a API acontece só no processo principal.
- Links para fora da Udemy abrem no navegador do sistema. O identificador de navegador da janela da Udemy não contém "Electron" nem o nome do app (muitos sites recusam esses); continua sendo o Chromium embutido.

## Alura e Fundação Bradesco

Além da Udemy, o menu **Plataformas** abre a **Alura** e a **Fundação Bradesco** (Escola Virtual), cada uma numa janela própria com sessão própria (`persist:alura`, `persist:bradesco`) e o seu preload (`preload-alura.cjs`, `preload-bradesco.cjs`). Elas só entregam a lista dos cursos lida e o progresso; a plataforma de quem envia vem do endereço da janela. O login pelo Google, Apple, Facebook e LinkedIn abre numa janelinha dentro do app, como na Udemy. **A leitura logada ainda não foi verificada com conta real.** Detalhes e diagnóstico: [`IMPORTACAO-ALURA-BRADESCO.md`](IMPORTACAO-ALURA-BRADESCO.md).

## Dados

| Sistema | Pasta |
|---|---|
| Windows | `%APPDATA%\Lume\` (`learning-center.db`, `settings.json`) |
| macOS | `~/Library/Application Support/Lume/` |

São separados do modo navegador (`data/learning-center.db`). Para levar os dados de um para o outro, use **Backup → Baixar** num e **Backup → Restaurar** no outro.

## Aviso de versão nova e atualização

O Lume (instalado) consulta sozinho, 15 segundos depois de abrir e a cada 6 horas, a última versão publicada em **Releases** do repositório (`ysauron2/learning-center`). Se houver uma mais nova, aparece uma janelinha: **"Nova versão do Lume"**, com as novidades e os botões **Atualizar agora** e **Depois**. "Depois" silencia aquela versão por 24 horas (uma versão ainda mais nova avisa de novo). Se a internet falhar ou o GitHub não responder, nada aparece: ele tenta de novo no próximo ciclo. Também dá para pedir na hora em **Lume → Verificar atualizações…** (esse sempre responde).

| | Windows | Mac |
|---|---|---|
| "Atualizar agora" | Baixa a versão nova dentro do app (barra de progresso no ícone da barra de tarefas), pergunta **"Reiniciar agora para instalar?"** e instala. Se der erro, mostra uma mensagem e oferece abrir a página de download. | Abre no navegador a página de download. Baixe o arquivo do seu Mac e arraste para *Aplicativos*. |
| Por quê | Usa o `electron-updater` com o `latest.yml` da Release. | O app não tem a assinatura paga da Apple, e o macOS não deixa instalar atualização sozinho. |

Segurança: só são abertos links de `https://github.com/ysauron2/learning-center/…`; nada baixado é executado fora do fluxo do `electron-updater`. Em desenvolvimento (`npm run desktop`) e nos testes automáticos (`LC_SMOKE`) a verificação fica desligada. O código está em `apps/desktop/src/updates.js`.

**Como publicar uma versão nova**

1. Suba a versão em `apps/desktop/package.json` (ex.: `0.1.2`) e faça o commit.
2. Crie a tag e envie: `git tag v0.1.2 && git push origin v0.1.2`.
3. O workflow monta os instaladores e publica na Release o `.exe`, os `.dmg`, o `latest.yml` (e `latest-mac.yml`, se gerado) e os `.blockmap`. Não apague esses arquivos da Release: o Windows precisa deles para atualizar.
4. Escreva as novidades no texto da Release (as primeiras linhas aparecem no aviso).

O repositório precisa estar **público** para o app conseguir consultar as versões. Só quem instalar uma versão que já tenha este recurso passa a receber os avisos; quem tem uma versão anterior precisa baixar a nova uma vez à mão.

## Limites conhecidos

- O login **"Continuar com o Google/Apple/Facebook"** abre numa janelinha dentro do app (a partir da 0.1.1; antes ficava em tela branca). Como o Google às vezes recusa navegadores embutidos, se não funcionar use e-mail e senha: quem criou a conta pelo Google pode definir uma senha em "Esqueci minha senha" na Udemy.
- A Udemy pode pedir verificação de segurança; a pessoa resolve na própria janela.
- Ler a Udemy de forma automatizada pode ser contra os termos de uso dela; é uso pessoal, por conta de quem usa.

## macOS sem licença da Apple

Sem a assinatura paga (Apple Developer, ~US$ 99/ano) o app **funciona**, mas o macOS bloqueia a primeira abertura de programas baixados:

1. Arraste **Lume** para *Aplicativos*.
2. Abra uma vez. O macOS recusa. Vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o aviso do app e clique em **Abrir Mesmo Assim**. (No macOS 14 e anteriores: clique com o botão direito no app → *Abrir*.)
3. Se aparecer "o app está danificado e não pode ser aberto", rode no Terminal: `xattr -dr com.apple.quarantine "/Applications/Lume.app"` e abra de novo.

Só na primeira vez. Gerar o instalador do Mac exige um Mac ou um servidor de build com macOS (por exemplo o GitHub Actions).

## Instaladores (Windows e Mac) pelo GitHub

O arquivo `.github/workflows/desktop.yml` monta os instaladores na nuvem do GitHub (de graça): **Windows** (`.exe`) e **Mac** (`.dmg`, Intel e Apple Silicon).

1. No repositório: aba **Actions** → **App de desktop** → **Run workflow**. No fim (uns 10 a 15 minutos), os arquivos ficam em **Artifacts**.
2. Para uma página de download permanente: crie uma tag (`git tag v0.1.0 && git push origin v0.1.0`) e os instaladores vão para **Releases**.

Localmente, no Windows: `npm run dist:desktop` gera `apps/desktop/release/` (o `.dmg` só dá para gerar num Mac, ou pelo GitHub).

**Primeira abertura no Mac** (o app não tem o certificado pago da Apple): abra o `.dmg`, arraste para *Aplicativos*, depois clique com o **botão direito** no app → **Abrir** → **Abrir**. Só na primeira vez. Se o Mac disser que o app está "danificado", rode no Terminal: `xattr -cr "/Applications/Lume.app"`.

**Windows**: o SmartScreen pode avisar "app não reconhecido": **Mais informações → Executar assim mesmo**.

O que foi testado: o pacote do Windows (`win-unpacked`) abre, sobe a API e carrega a tela. O `.dmg` não pôde ser testado aqui (precisa de um Mac); a assinatura "no escuro" (`apps/desktop/adhoc-sign.cjs`) roda só no GitHub.
