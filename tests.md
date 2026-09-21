# Testes em React Native — Guia de Estudo

> Organizado por **conceito**, no mesmo espírito de [arquitetura-frontend.md](arquitetura-frontend.md) e [auth-forms.md](auth-forms.md): problema → mecanismo por trás → trade-off → como replicar. Preenchido com código real conforme as aulas avançam — nada especulativo. Um mapa aula → seção fica no fim.

## Índice

1. [Fundamentos: a pirâmide de testes em mobile](#1-fundamentos-a-pirâmide-de-testes-em-mobile)
2. [Jest: setup resiliente, com ou sem projeto legado](#2-jest-setup-resiliente-com-ou-sem-projeto-legado)
3. [React Native Testing Library: testar como o usuário usa](#3-react-native-testing-library-testar-como-o-usuário-usa)
4. [Interação: `fireEvent` vs. `userEvent`, e fake timers](#4-interação-fireevent-vs-userevent-e-fake-timers)
5. [Render customizado: injetando os mesmos Providers da produção](#5-render-customizado-injetando-os-mesmos-providers-da-produção)
6. [Testando hooks e mocks com Jest](#6-testando-hooks-e-mocks-com-jest)
7. [Cobertura de código: o que o número não diz](#7-cobertura-de-código-o-que-o-número-não-diz)
8. [Teste de componente real: formulário, estilo e erro](#8-teste-de-componente-real-formulário-estilo-e-erro)
9. [Testes de integração: telas inteiras via Expo Router](#9-testes-de-integração-telas-inteiras-via-expo-router)
10. [Mockando o Repository: erro, loading e dados](#10-mockando-o-repository-erro-loading-e-dados)
11. [Mocks globais](#11-mocks-globais)
12. [Snapshot testing](#12-snapshot-testing)
13. [Mapa aula → conceito](#13-mapa-aula--conceito)
14. [Glossário](#glossário)

---

## 1. Fundamentos: a pirâmide de testes em mobile

**Três camadas, granularidades diferentes, cada uma paga um tipo de confiança diferente:**

| Camada | O que exercita | Velocidade | Ferramenta típica em RN |
|---|---|---|---|
| Unitário | Uma função/hook/componente isolado | Muito rápido (ms) | Jest |
| Integração | Vários componentes/hooks juntos, simulando uma tela inteira | Rápido (ainda em Node, sem device) | Jest + React Native Testing Library (RNTL) |
| E2E | O app de verdade, rodando num simulador/device | Lento (segundos a minutos) | Detox, Maestro — **fora do escopo deste módulo** |

O módulo cobre unitário e integração — as duas camadas de baixo da pirâmide, que rodam em Node (sem simulador, sem device) e por isso são o que se roda em CI a cada commit. E2E é outra ferramenta, outro processo, geralmente reservado pra poucos fluxos críticos, e não aparece nas aulas listadas.

### O princípio que guia RNTL, e que vale entender antes de ver a primeira query

> "Quanto mais seu teste se parece com a forma como o software é usado, mais confiança ele te dá." — princípio da família Testing Library (Kent C. Dodds), o mesmo em React (web), React Native e Vue.

Na prática: testar **o que aparece na tela e o que o usuário consegue fazer** (texto visível, campo preenchível, botão pressionável) — nunca o estado interno de um componente (`wrapper.state()`, `instance()`), porque estado interno muda com refatoração mesmo quando o comportamento não muda, e o teste quebra por um motivo errado. Esse princípio único explica quase todas as decisões de API do RNTL que as próximas aulas vão mostrar (queries por texto/role/label, não por classe interna).

### Por que este projeto especificamente está pronto pra ser testado

As duas aulas anteriores não foram só sobre arquitetura — foram, na prática, uma preparação pra este módulo. O motivo:

```ts
// useCityFindAll não importa Supabase nem AsyncStorage — importa uma abstração
export function useCityFindAll(filters: CityFindAllFilters) {
  const { city } = useRepository(); // injetado via Context
  return useAppQuery(() => city.findAll(filters));
}
```

Porque `useCityFindAll`, `useAuthSignIn` e companhia dependem de `useRepository()` (uma interface injetada via Context), um teste pode envolver o componente no **mesmo** `RepositoryProvider` usado em produção, só que com um repositório fake em vez do `SupabaseCityRepository` real — sem rede, sem banco, determinístico, rápido. Essa é exatamente a promessa feita lá no módulo de arquitetura ("Repository facilita teste, mas por causa do DIP, não por mágica") — agora é a hora de cobrar essa dívida. Vale reler a seção 3 do `arquitetura-frontend.md` com essa lente: cada porta (`Repositories`, `IFeedbackService`, `IStorage`, `IAuthRepository`) construída nos dois módulos anteriores é um ponto onde este módulo vai plugar uma implementação fake.

**Consequência prática pra guardar:** um componente/hook que importa uma implementação concreta direto (sem passar por uma interface injetada) é mais difícil de testar sem rede/mock manual de módulo (`jest.mock` no arquivo inteiro). Um componente que só depende de uma abstração injetada é testável trocando o `value` do Provider — o mesmo mecanismo do Composition Root, agora usado a favor do teste em vez da produção.

## 2. Jest: setup resiliente, com ou sem projeto legado

Fonte: [docs.expo.dev — Unit testing](https://docs.expo.dev/develop/unit-testing/). Em Expo o setup é deliberadamente pequeno — a maior parte do trabalho já vem embutida no preset. O que muda de verdade, com base real do projeto:

```json
// package.json
"scripts": { "test": "jest --watchAll --verbose" },
"jest": { "preset": "jest-expo" }
```
```json
// tsconfig.json
"compilerOptions": { "types": ["jest"] }
```

**Por que cada peça existe, não só o que copiar:**
- `jest-expo` é um preset que **mocka a parte nativa do SDK da Expo** — sem ele, qualquer teste que toque um módulo nativo (câmera, storage, fontes) quebraria tentando rodar código nativo dentro do Node, onde não existe device nenhum. É o que torna possível rodar teste sem simulador.
- `types: ["jest"]` no `tsconfig.json` existe porque `test`/`expect`/`describe` são globais que o Jest injeta em runtime — sem declarar o tipo, o TypeScript (e o editor) não sabe que essas globais existem e acusa erro de "não definido", mesmo o teste rodando normalmente. É papelada de tipo, não de execução.

### Greenfield vs. projeto existente: o checklist muda

Instalar (via `npx expo install`, não `yarn add`/`npm i` direto — ver por quê abaixo):
```
npx expo install jest-expo jest @types/jest --dev
npx expo install @testing-library/react-native --dev
```
Isso é o suficiente pra um projeto **nascendo com testes**. Um projeto que já existe há tempo, com dependências acumuladas, tem três pontos de atenção que só aparecem quando o teste toca código de verdade — não no `example.test.ts` inicial:

1. **Versão do `jest-expo` presa à versão do Expo SDK, não à última do npm.** Este projeto está em `expo: ~53.0.27` e instalou `jest-expo: ~53.0.14` — o número `53` não é coincidência, é obrigatório: o preset mocka o SDK de uma versão específica, e uma versão de `jest-expo` fora de linha com o SDK instalado mocka a coisa errada. **Use sempre `npx expo install`** em vez de instalar a lib direto — é o mesmo motivo de qualquer outra dependência Expo (já registrado no `CLAUDE.md` deste projeto): o `expo install` resolve pela versão compatível com o SDK pinado, não pela última tag do pacote.

2. **`react-test-renderer` pode já não ser necessário — e pode até conflitar.** A própria doc do Expo, hoje, diz que `@testing-library/react-native` "substitui o `react-test-renderer` porque `react-test-renderer` não suporta React 19+". Achado real neste projeto: o `package.json` instalou os dois — `@testing-library/react-native@^13.2.0` **e** `react-test-renderer@19.0.0` —, mesmo o projeto já estando em `react: 19.0.0`. Não é necessariamente quebrado (pode sobreviver como peer dependency de outra coisa na cadeia), mas é exatamente o tipo de dependência que vale revisitar e potencialmente remover num projeto existente: **numa base em React 19+, parta do princípio de que só o RNTL é necessário, e só adicione `react-test-renderer` se algo pedir explicitamente por ele.**

3. **`transformIgnorePatterns` é o gotcha que só aparece com dependências de verdade.** Por padrão, Jest não transpila nada dentro de `node_modules` — o preset `jest-expo` já libera as libs do próprio ecossistema Expo/RN, mas uma lib de terceiros publicada sem transpilar (ESM puro, JSX cru) vai estourar `SyntaxError: Cannot use import statement outside a module` no meio de um stack trace que parece bug seu. Isso não aparece com o `example.test.ts` (zero import de RN) — aparece na primeira vez que um teste importa um componente que puxa algo como `react-native-maps`/`react-native-webview` por trás. Neste projeto ainda não foi necessário configurar (nenhum teste real ainda importa esses módulos), mas é o primeiro lugar a olhar quando um teste novo falhar com esse erro específico — a correção é estender `transformIgnorePatterns`, não reescrever o teste.

### Descoberta de arquivo: convenção implícita, vale saber que existe

`src/__tests__/example.test.ts` foi reconhecido pelo Jest sem nenhuma configuração adicional — `testMatch` do Jest já cobre por padrão qualquer pasta `__tests__/` e qualquer arquivo `*.test.ts(x)`/`*.spec.ts(x)`, em qualquer lugar da árvore. É mágica implícita que vale conhecer antes de precisar depurar "por que meu teste não roda" — geralmente é nome de arquivo ou de pasta fora da convenção, não configuração quebrada.

## 3. React Native Testing Library: testar como o usuário usa

```tsx
describe('Component', () => {
  test("should display the label when is not loading", () => {
    render(<Component label="hello world" loading={false} />);
    expect(screen.getByText('hello world')).toBeOnTheScreen();
  });

  it("should display the loading message when is loading", () => {
    render(<Component label="hello world" loading={true} />);
    expect(screen.getByText(/Is loading..../i)).toBeOnTheScreen();
  });
});
```

**`describe`/`test`/`it`:** `describe` só agrupa testes relacionados (aparecem juntos no relatório, podem compartilhar `beforeEach`/`afterEach`). `test` e `it` são **o mesmo método, dois nomes** — `it` existe pra ler como frase ("it should display the label..."), sem nenhuma diferença de comportamento. Este arquivo usa os dois no mesmo `describe` (`test` no primeiro, `it` no segundo) — funciona, mas o ideal é escolher um estilo por projeto e manter consistente; misturar é ruído, não um erro.

**`screen`, o seletor novo desta aula:** antes dele, toda query vinha do retorno de `render()` — `const { getByText } = render(<Component />)`. `screen` (o mesmo conceito do Testing Library na web) é um objeto global que já aponta pra árvore renderizada **mais recente** no teste — `render()` a registra por baixo dos panos, e daí em diante qualquer `screen.getByText(...)` consulta ela, sem precisar carregar o retorno de `render` pra cada assert. Menos boilerplate quando há várias verificações no mesmo teste.

### `getByText` com string exata vs. regex — o ponto central da aula

`screen.getByText('hello world')` exige **match exato**, char a char, sensível a maiúsculas. `screen.getByText(/Is loading..../i)` troca isso por um padrão: o `i` no fim ignora maiúsculas/minúsculas, e o `RegExp` no lugar da string é uma forma de matcher que o Testing Library aceita nativamente (`string | RegExp | function`, mesma API na versão web).

**Por que regex faz sentido aqui, e não é só estilo:** o texto real é um estado ("está carregando"), não um valor de negócio que precisa bater exato. Se amanhã o texto virar `"Carregando..."` ou ganhar um espaço a mais, um `getByText('Is loading....')` exato quebra por um motivo que não tem nada a ver com o comportamento testado (o app continua carregando corretamente). Testar com um padrão mais solto — idealmente algo como `/is loading/i`, sem tentar casar a pontuação exata — deixa o teste preso à **substância** (existe uma indicação de loading) e não à redação exata da copy.

> **Pegadinha real neste regex, vale saber pra não repetir:** `/Is loading..../i` tem quatro pontos **sem escapar** — em regex, `.` (sem `\`) significa "qualquer caractere", não "ponto literal". Isso faz o padrão combinar com `"Is loading" + 4 caracteres quaisquer`, não especificamente `"Is loading...."`. Funciona aqui por coincidência (o texto real termina com pontos, que também satisfazem "qualquer caractere"), mas o mesmo regex casaria igual com `"Is loadingXXXX"`. Regra prática: se a intenção é bater um texto que contém `.` de verdade, escape (`\.`); se a intenção é só "contém a palavra loading, não importa a pontuação", um regex mais curto (`/loading/i`) é mais honesto sobre o que está sendo testado.

**Detalhes menores:**
- `toBeOnTheScreen()` não é um matcher nativo do Jest — vem do `@testing-library/react-native` (via `expect.extend`), e é mais específico que `toBeTruthy()`: confirma que o elemento existe **e** faz parte da árvore atualmente montada.
- O diff desta aula deixou duas linhas comentadas (`// const element = ...`) logo acima da versão final — sobra de iteração que valeria remover antes de commitar.
- `fireEvent`/`userEvent` já foram importados neste arquivo mas ainda não usados em nenhum teste — preparação visível pras aulas 4 e 5.

## 4. Interação: `fireEvent` vs. `userEvent`, e fake timers

*(a preencher — diferença entre disparar um evento sintético (`fireEvent`) e simular a sequência real de eventos de um usuário (`userEvent`); por que `debounce`/temporizadores exigem fake timers em teste.)*

## 5. Render customizado: injetando os mesmos Providers da produção

*(a preencher — um `render` de teste que já embrulha `RepositoryProvider`/`FeedbackProvider`/`AuthProvider`/`StorageProvider`, pra não repetir isso em todo arquivo de teste.)*

## 6. Testando hooks e mocks com Jest

*(a preencher — `renderHook`, `jest.fn()`/`jest.mock()`, quando mockar um módulo inteiro vs. trocar só o adapter via Provider.)*

## 7. Cobertura de código: o que o número não diz

*(a preencher — coverage mede linhas executadas, não corretude; 100% de cobertura com asserts fracos ainda esconde bug.)*

## 8. Teste de componente real: formulário, estilo e erro

*(a preencher — `SignUpForm` sob teste: preencher campos, disparar validação do Zod, checar mensagem de erro renderizada.)*

## 9. Testes de integração: telas inteiras via Expo Router

*(a preencher — testar navegação de verdade entre `sign-in`/Home/`city-details`, não só um componente isolado.)*

## 10. Mockando o Repository: erro, loading e dados

*(a preencher — repositório fake que retorna erro/demora de propósito, pra testar os estados que a UI trata mas que são difíceis de forçar num backend real.)*

## 11. Mocks globais

*(a preencher — mocks que valem pro projeto inteiro, configurados uma vez (ex.: `jest.setup.js`), em vez de repetidos por arquivo de teste.)*

## 12. Snapshot testing

*(a preencher — quando um snapshot ajuda (evitar regressão visual não intencional) e quando vira ruído (snapshot gigante que ninguém revisa de verdade antes de aceitar).)*

---

## 13. Mapa aula → conceito

| Aula | Conceito principal | Seção |
|---|---|---|
| 1 | Pirâmide de testes, filosofia RNTL, por que a arquitetura anterior importa | §1 |
| 2 | Setup do Jest com Expo, resiliência de versão | §2 |
| 3 | `describe`/`test`/`it`, `screen`, `getByText` (string vs. regex) | §3 |
| 4 | `fireEvent`, mais queries | §4 |
| 5 | `userEvent`, fake timers | §4 |
| 6 | Render customizado | §5 |
| 7 | Teste de hook, Jest mocks | §6 |
| 8 | Code coverage | §7 |
| 9-10 | `SignUpForm`, estilo, cenários de erro | §8 |
| 11 | Integração com Expo Router | §9 |
| 12-14 | Integração: sign-in/out, Home, City Details | §9 |
| 15 | Erro, loading, mock de Repository | §10 |
| 16 | Mocks globais | §11 |
| 17 | Snapshot | §12 |

## Glossário

- **Pirâmide de testes:** muitos testes unitários (rápidos, isolados), menos testes de integração, poucos E2E (lentos, mais realistas) — a proporção inversa do custo de execução.
- **"Testar como o usuário usa":** princípio da Testing Library — consultar a UI pelo que é visível/interagível (texto, role, label), nunca pelo estado interno de implementação.
- **Repository fake em teste:** a mesma peça de Ports & Adapters usada em produção (in-memory) reaproveitada como test double — não é uma ferramenta de teste especial, é o mesmo adapter.
- **`jest-expo` preso à versão do SDK:** o preset mocka a parte nativa de uma versão específica do Expo SDK — instalar via `expo install`, nunca via `npm`/`yarn` direto, garante a versão compatível.
- **`transformIgnorePatterns`:** lista de exceções ao "Jest não transpila `node_modules`" — necessário quando uma lib de terceiros publica código não transpilado (ESM/JSX cru) e não está coberta pelo preset.
- **`screen`:** objeto global do Testing Library que aponta pra árvore renderizada mais recente no teste — evita destruturar o retorno de `render()` em cada assert.
- **Matcher por regex vs. string exata:** string em `getByText` exige match exato; regex permite casar por substância (case-insensitive, parcial) — mais resiliente a mudanças de copy que não afetam o comportamento testado. Cuidado com `.` não escapado (casa qualquer caractere, não um ponto literal).
