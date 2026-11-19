# KG Code no iPhone: web e futuro IPA

A configuração usa Capacitor 8.0.0 e app ID com.kgcode.mobile. Ela embala o editor web em WKWebView. Não transforma o iPhone em macOS e não acrescenta Node, npm, terminal do sistema ou extensões de VS Code.

## Usar hoje sem IPA

Ative GitHub Pages conforme o README, abra no Safari e use Compartilhar → Adicionar à Tela de Início. Para uma versão com dependências locais, publique o conteúdo do artefato KG-Code-Web gerado pelos testes.

## Preparar projeto nativo no macOS

Requer Node 22+, Xcode compatível com Capacitor 8 (documentação: Xcode 26+) e ferramentas de desenvolvimento da Apple.

~~~sh
npm install --ignore-scripts
npm run ios:add
npm run ios:open
~~~

Após alterações web:

~~~sh
npm run ios:sync
~~~

No Xcode:

1. Abra o projeto App e selecione o target App.
2. Em Signing & Capabilities, escolha sua equipe Apple e um bundle ID disponível.
3. Compile primeiro para um iPhone/simulador compatível.
4. Valide edição com teclado, importar/exportar, IndexedDB, preview com ES modules, teclado virtual e retomada do app.
5. Use Product → Archive e o método de distribuição compatível com sua conta/certificado.

Capacitor/WKWebView não dispõe de todos os recursos de PWA. O build usa vendor local, independentemente de Service Worker.

## Compilar na nuvem pelo GitHub

O workflow **Compilar iOS sem assinatura** é manual:

1. Abra Actions.
2. Selecione o workflow.
3. Toque em Run workflow → main.
4. Se a compilação concluir, baixe o artefato KG-Code-iOS-SEM-ASSINATURA.

Ele gera um pacote KG-Code-unsigned.ipa, sem assinatura. **Esse pacote não instala diretamente no iPhone.** Será necessário assinar por um método compatível com seu certificado e provisionamento. Não envie P12, senhas, tokens ou mobileprovision para arquivos públicos do repositório.

O workflow usa runner macos-26, depende da disponibilidade desse ambiente e não foi executado como parte do upload inicial. Não há promessa de aprovação na App Store.

## Trabalho nativo ainda pendente

- Validar compilação de Capacitor no runner macOS.
- Assinar e testar em iPhone físico.
- Integrar Filesystem/Share nativos para downloads e documentos grandes se o comportamento padrão do WKWebView não for suficiente.
- Criar catálogo de ícones PNG e tela de abertura nativa.
- Testar importação/compartilhamento com provedores de arquivos no iOS.
- Para shell, npm e builds reais, integrar um servidor de desenvolvimento autenticado separado.

Não há permissão especial de iOS que dê ao editor acesso irrestrito a outros apps. O objetivo desta base é permitir continuar o desenvolvimento nativo de forma explícita e testável.
