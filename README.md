# KG Code 2.0 — Workspace mobile

Editor para iPhone e desktop com pastas independentes, preview HTML/CSS/JavaScript, módulos ES, console e preparação para iOS. Não é uma distribuição oficial do Visual Studio Code.

## Começar no iPhone

1. No repositório, abra **Settings → Pages**.
2. Escolha **Deploy from a branch → main → /(root) → Save**.
3. Aguarde a publicação e abra o endereço informado pelo GitHub Pages no Safari.
4. Use **Compartilhar → Adicionar à Tela de Início** para abrir como aplicativo web.

O endereço esperado após ativar Pages é **https://riftsdev.github.io/VScodeMobile/**. O upload dos arquivos não ativa Pages sozinho.

A raiz do repositório funciona sem build quando servida por HTTP/HTTPS; dependências são baixadas de CDNs com versões fixas. Abrir o HTML pelo visualizador do app Arquivos não é equivalente a hospedar o site: módulos ES precisam de um servidor.

## Testar cada pasta separadamente

- **＋ Projeto** cria uma pasta com index.html, css/style.css, js/main.js, js/message.js e data.json.
- **＋ Pasta** cria uma pasta vazia. Adicione seu HTML e seus arquivos dentro.
- Toque em **▶ ao lado da pasta** para executá-la.
- Se houver vários HTMLs, escolha **Entrada** no painel de prévia.
- **Pasta** define a raiz de execução. Um caminho /assets/logo.png aponta para assets/logo.png dessa pasta.
- Somente CSS/JS referenciados pelo HTML são carregados. Arquivos de outras pastas não são injetados.
- Caminhos são sensíveis a maiúsculas/minúsculas. Ao renomear/mover arquivos, atualize seus imports e referências.

Já existem dois exemplos independentes: **Meu-site** (módulos e fetch local) e **Outro-projeto** (JavaScript clássico).

## Recursos

- Explorador com pastas/subpastas, criar, renomear, mover, duplicar e excluir.
- Abas de arquivos abertos; histórico de edição por documento enquanto a sessão estiver aberta.
- CodeMirror com cores, fechamento de tags/chaves, indentação e sugestões por Ctrl+Espaço.
- Tema claro/escuro, fonte ajustável, quebra de linha, modo foco e barra de símbolos touch.
- Paleta de comandos, abertura rápida e busca/substituição em arquivo, projeto ou workspace.
- Formatação real com Prettier para HTML, CSS, JS, JSON e Markdown.
- Preview responsivo, presets de largura, tela cheia e painel redimensionável.
- Logs, warnings, erros de JavaScript, promises rejeitadas e recursos ausentes.
- Python com Pyodide carregado sob demanda em Web Worker; botão Parar encerra o worker.
- IndexedDB com autosave após 500 ms, indicação de falha, migração da chave antiga kgcode_files na mesma origem.
- Importação de arquivos, pasta ou ZIP; arquivos binários são preservados.
- Exportação de arquivo, projeto ZIP, workspace ZIP e backup completo JSON.
- Uma cópia de recuperação anterior à última operação estrutural destrutiva.
- GitHub: importação recursiva, branch selecionável, binários e envio em um único commit.
- Visualização de imagens, áudio, vídeo e GLB (GLB precisa de CDN para o visualizador).
- Manifest e cache para uso como PWA; configuração Capacitor para iOS.

## Atalhos

| Atalho | Ação |
| --- | --- |
| Ctrl/⌘ S | Salvar |
| Ctrl/⌘ Enter | Executar |
| Ctrl/⌘ K | Comandos |
| Ctrl/⌘ P | Abrir arquivo |
| Ctrl/⌘ Shift F | Buscar no projeto |
| Ctrl/⌘ / | Comentar/descomentar |
| Ctrl Espaço | Sugestões |
| Esc | Sair do foco / prévia expandida |
| Ctrl/⌘ Z | Desfazer no editor |

## Importar no iPhone

No app Arquivos, compacte a pasta e importe o ZIP. O seletor de pasta depende do navegador. Importações têm limite de **10 MB por arquivo, 50 MB no workspace e 1.000 arquivos**. UTF-8 é a codificação de arquivos de texto. Importações inválidas não são aplicadas parcialmente. Arquivos de mesmo caminho exigem confirmação.

Exporte **JSON** para restaurar também configurações, abas, entrada por pasta e dados de localStorage das prévias. O ZIP contém apenas os arquivos do projeto. Autosave não é sincronização em nuvem. Faça backup antes de limpar dados do Safari.

## Preview: suporte e limites

| Recurso | Comportamento |
| --- | --- |
| HTML, CSS e JS clássico | Arquivos referenciados, mantendo ordem, defer/async |
| CSS relativo, @import e url() | Reescrita para recursos locais; CSS circular é recusado |
| ES modules | Imports relativos literais, export-from, ciclos e import("./arquivo.js") |
| Import maps | Imports nomeados e URLs externas; mapas locais complexos com scopes não são reescritos |
| fetch local | GET de arquivos relativos ao HTML; arquivos ausentes retornam 404 |
| Imagens, áudio, fontes, modelos | Referências estáticas; use KG.asset("assets/model.glb") para URLs criadas por código |
| import.meta.url | URL virtual do módulo; new URL("./asset", import.meta.url) resolve arquivos presentes |
| localStorage | API básica getItem/setItem/removeItem/clear/key/length por pasta, até 500 KB |
| Links entre HTMLs | Navegação interceptada para outro HTML da mesma pasta de execução |
| Python | Arquivos .py e imports locais; internet para Pyodide; sem shell do sistema |
| Node, npm, PHP, back-end, SQL server | Não executados no navegador |
| JSX, TypeScript e frameworks com build | Edite o código; para executar importe a saída web compilada |
| Workers de projetos, XHR local, IndexedDB da prévia | Não emulados; precisam de hospedagem/ambiente externo |
| imports com variáveis, packages npm não mapeados | Precisam de import map ou pré-compilação |

A prévia usa iframe sem allow-same-origin. Isso impede acesso ao DOM/IndexedDB/token do editor. Apenas mensagens da janela de preview atual e do identificador da execução são aceitas. Código importado ainda pode usar rede e consumir recursos; sandbox não impõe limite de CPU. API externa precisa permitir CORS para origem opaca. APIs de câmera, microfone e outras permissões não são concedidas automaticamente.

Referências dinâmicas arbitrárias de DOM não são reescritas: use KG.asset(). CSS com escapes incomuns e construções de URL muito complexas pode exigir pré-compilação. A prévia é um ambiente web de desenvolvimento, não um servidor HTTP completo nem o Chrome DevTools.

## GitHub no aplicativo

Token fine-grained com **Contents: Read and write** limitado ao repositório desejado. Para workflows, permissões adicionais podem ser necessárias. Nunca cole tokens nos arquivos do projeto.

- O token fica na memória da sessão e não vai para IndexedDB, localStorage, ZIP ou backup JSON.
- O token persistido pela versão antiga é removido na inicialização.
- Importar cria uma **nova pasta**, sem substituir projetos existentes.
- Enviar usa a pasta em execução como raiz do repositório remoto.
- O envio atualiza/cria arquivos num único commit, sem force push.
- Arquivos remotos ausentes localmente são preservados; exclusões locais não são sincronizadas.
- Se o remoto mudou desde uma importação para aquela pasta, o envio é bloqueado para evitar substituir trabalho novo.
- Inicialize repositórios vazios com README antes de usar o envio.

Não existe autenticação Google nesta versão. O antigo formulário que aceitava qualquer e-mail não era login real.

## Desenvolvimento e build offline

Requer Node 22+.

~~~sh
npm install --ignore-scripts
npm test
npm run build
npm run serve
~~~

Abra http://127.0.0.1:4173/VScodeMobile/ .

O build cria dist/ com CodeMirror, JSZip, parser de módulos e Prettier locais. Publique o **conteúdo de dist/** para uso offline completo do editor após a primeira carga. Python, visualizador 3D e dependências externas dos seus projetos continuam precisando de rede. A publicação direta de main usa CDN e não garante essas dependências offline.

~~~sh
npx playwright install --with-deps chromium webkit
npm run test:browser
~~~

O workflow **Testar e empacotar KG Code** roda testes de lógica e de navegador Chromium/WebKit com viewport de iPhone 13 e disponibiliza o artefato **KG-Code-Web**. Emulação WebKit não substitui teste em aparelho físico.

## iOS / IPA

Veja [docs/IOS.md](docs/IOS.md). Há configuração Capacitor e um workflow manual de compilação sem assinatura. **Nenhum IPA assinado está incluído.** O projeto nativo gerado e a compilação iOS ainda precisam ser validados no Xcode e no aparelho.

## Estrutura

- index.html / styles.css: interface.
- src/core.js: caminhos, arquivos e esquema do workspace.
- src/storage.js: IndexedDB e recuperação.
- src/preview.js: resolução de recursos e sandbox.
- src/app.js: editor, ações e integração GitHub.
- src/deps.js: dependências locais com fallback CDN.
- src/python-worker.js: Python fora da thread de interface.
- scripts/: build e servidor de desenvolvimento.
- tests/: regressões de lógica e navegador.

## Referências

- [CodeMirror 5](https://codemirror.net/5/doc/manual.html)
- [es-module-lexer](https://github.com/guybedford/es-module-lexer)
- [JSZip](https://stuk.github.io/jszip/)
- [Capacitor iOS](https://capacitorjs.com/docs/ios)
- [Publicar com GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
