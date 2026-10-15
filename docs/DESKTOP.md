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

## Dados

| Sistema | Pasta |
|---|---|
| Windows | `%APPDATA%\Lume\` (`learning-center.db`, `settings.json`) |
| macOS | `~/Library/Application Support/Lume/` |

São separados do modo navegador (`data/learning-center.db`). Para levar os dados de um para o outro, use **Backup → Baixar** num e **Backup → Restaurar** no outro.

## Limites conhecidos

- O login **"Entrar com o Google"** costuma ser bloqueado em janelas embutidas: use e-mail e senha na Udemy.
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
