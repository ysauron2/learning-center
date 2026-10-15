# Importar de outra plataforma

No Lume, em **Cursos → Importar de outra plataforma**, existem duas formas de montar um curso sem digitar tudo:

## 1. Playlist do YouTube

1. Abra a playlist no YouTube e copie o link da barra do navegador.
2. Cole na aba **Playlist do YouTube** e toque em **Ver prévia**.
3. Confira os vídeos (dá para desmarcar os que não quer), escolha plataforma e categoria e toque em **Importar**.

Não precisa entrar na conta do YouTube nem ter chave. A playlist precisa ser **pública** ou **não listada**.

Links aceitos: `youtube.com/playlist?list=…`, `youtube.com/watch?v=…&list=…`, `youtu.be/…?list=…` e `music.youtube.com`.

O que o Lume cria:
- um curso com o título da playlist, plataforma **YouTube** (você pode trocar), categoria **Geral** (você pode trocar) e descrição com o nome do canal;
- um módulo **Vídeos** (ou módulos de 20 em 20, se a playlist tiver mais de 60 vídeos);
- uma aula por vídeo, com o tempo em minutos (arredondado para cima, mínimo 1);
- a capa vem da miniatura do primeiro vídeo;
- o link do curso é o da playlist.

**Importar de novo não duplica.** O Lume reconhece a playlist pelo `list=` e só acrescenta os vídeos novos (compara pelo título; vídeos que você já concluiu continuam concluídos). Se sair um vídeo da playlist, ele **não** é apagado do seu curso.

Limites e cuidados:
- até **500 vídeos** por playlist (se for maior, o Lume avisa que trouxe só os primeiros);
- vídeos privados, removidos ou sem duração (ex.: estreias) são pulados e o Lume diz quantos;
- só fala com o `youtube.com`; não segue redirecionamento para outros sites; espera no máximo 15 segundos; ignora respostas gigantes;
- o YouTube muda o formato das páginas de tempos em tempos. Se parar de funcionar, a tela mostra *“Não consegui ler essa playlist. Ela é pública?”* — nada é gravado. Nesse caso use a outra aba (colar a lista) e avise para ajustarmos.
- A aula guarda título e tempo, **não o link do vídeo** (o banco de dados não tem esse campo e não foi alterado). O link do curso abre a playlist inteira.

## 2. Colar lista de aulas (qualquer plataforma)

1. Copie a lista de aulas (do site, de um PDF ou do caderno).
2. Cole na caixa, **uma aula por linha**, informe o título do curso e toque em **Ver prévia**.
3. Confira módulos, aulas e tempos e toque em **Importar**.

Formatos reconhecidos:

| Você cola | O Lume entende |
|---|---|
| `Introdução` | aula, 10 min (estimativa, marcada na prévia) |
| `1. Título`, `02) Título`, `03 - Título`, `- Título` | aula (o número é tirado) |
| `Título \| 12:30` | 13 min |
| `Título - 8 min` / `8 minutos` | 8 min |
| `Título (1h05)` | 65 min |
| `Título 00:12:30` | 13 min |
| `Módulo 2: Redes`, `Seção 3`, `Redes:`, `PARTE FINAL` | abre um módulo novo |

Regras: linhas vazias são ignoradas; no máximo **2000 linhas** e **200 letras** por título (títulos maiores são cortados, com aviso); linha com tempo nunca vira módulo; texto todo em maiúsculas só vira módulo se não for a lista inteira. Sem módulo, tudo vai para **Aulas**.

Se já existir um curso com o **mesmo título e plataforma**, a prévia avisa e você escolhe: **acrescentar** só as aulas que faltam ou **criar um curso novo** mesmo assim.

## O que foi testado de verdade

Testado em 15/10/2026, com o YouTube real (o cliente de leitura `apps/api/src/core/youtube.js`, sem simulador):
- *Node.js Videos* (Traversy Media): 43 vídeos, formato novo de página (`lockupViewModel`), título, canal, tempos e miniatura corretos;
- *the freeCodeCamp.org podcast*: 110 vídeos — passa de 100, então a **paginação por continuação funcionou de verdade**;
- *Back End Developer Learning Path* (17 vídeos): confirmou que o “token” de comentários da página precisa ser ignorado (foi um erro real, corrigido);
- o fluxo completo pelas rotas da API (prévia → criar → importar de novo) com a playlist do podcast, num banco de testes em memória: criou 110 aulas em 6 módulos, plataforma YouTube, capa da miniatura, e a segunda importação não duplicou nada;
- dois ids de playlist inexistentes foram reconhecidos como “não existe ou foi removida”.

**Só no simulador** (`apps/api/test/fake-youtube.js`), nunca com o YouTube real:
- playlist **privada**, com vídeos **privados/removidos** pulados, playlist vazia;
- limite de 500 vídeos, falha no meio da paginação;
- redirecionamento para outro domínio, resposta gigante, rede fora, HTML sem dados;
- a **tela** (testes de componente com a API simulada); a tela não foi aberta no navegador com o YouTube real.

A lista colada não depende de rede e tem testes completos (formatos, módulos, limites, entradas hostis, rotas, duplicata) e testes de tela.

Depois de atualizar o Lume é preciso **reiniciar o programa** para as novas rotas valerem.
