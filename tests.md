# Testes em React Native — Guia do Especialista

> **Para quem é:** o dev que quer sair de "sei escrever um teste" para "sei decidir *o que* testar, *como* isolar e *quando desconfiar de um teste verde*".
> **Escopo:** testes de **unidade e integração** com Jest + React Native Testing Library (RNTL) num app Expo (SDK 57, React 19.2, RNTL 13.3, Jest 29.7, jest-expo 57). **Snapshot** (aula 17) ainda não foi estudado — seção reservada no fim. **E2E** (Maestro/Detox) está fora do escopo.
> **Como estudar:** leia as Partes 1–6 em ordem (cada uma termina em **Fixe**, as regras de bolso). Depois consolide com a Parte 7 (bugs reais que os testes acharam) e a Parte 8 (playbook, checklist, perguntas, exercícios). *Medido/verificado* = executado neste projeto; *raciocínio* = inferência, sempre sinalizada.
> Complementa [arquitetura-frontend.md](arquitetura-frontend.md) (por que o app é testável) e [auth-forms.md](auth-forms.md) (os fluxos que aqui são testados).

## Índice

0. [As 5 ideias que sustentam tudo](#0-as-5-ideias-que-sustentam-tudo)
1. [Base: por que o app é testável, setup e anatomia](#parte-1--base-por-que-o-app-é-testável-setup-e-anatomia)
2. [Queries: como achar elementos](#parte-2--queries-como-achar-elementos)
3. [Interação, assíncrono e tempo](#parte-3--interação-assíncrono-e-tempo)
4. [Testes de unidade: fronteira, hooks, formulários e mocks](#parte-4--testes-de-unidade-fronteira-hooks-formulários-e-mocks)
5. [Testes de integração: o app inteiro com infra fake](#parte-5--testes-de-integração-o-app-inteiro-com-infra-fake)
6. [Qualidade do conjunto: cobertura, depuração e o verde que engana](#parte-6--qualidade-do-conjunto-cobertura-depuração-e-o-verde-que-engana)
7. [Casos reais: os bugs que os testes acharam](#parte-7--casos-reais-os-bugs-que-os-testes-acharam)
8. [Fixação: playbook, checklist, perguntas e exercícios](#parte-8--fixação)
9. [Snapshot (a estudar)](#snapshot-a-estudar) · [Glossário](#glossário) · [Mapa aula → seção](#mapa-aula--seção)

---

## 0. As 5 ideias que sustentam tudo

1. **Teste como o usuário usa.** Afirme o que aparece na tela e o que o usuário consegue fazer — nunca estado interno. Estado interno muda em refatoração sem o comportamento mudar; o teste quebra por motivo errado.
2. **Isole o que sai do processo, por injeção.** Rede, storage nativo, ícones, fontes: troque a *implementação* por um fake pela **mesma porta** (Provider) que o app já usa. O código sob teste não muda.
3. **Teste na fronteira da unidade.** Unitário afirma só o que cruza o contrato do componente/hook (props, callbacks, retorno). O que depende de um colaborador (mutation, toast, navegação) é integração.
4. **Um teste que nunca falhou não é confiável.** Quebre-o de propósito ao menos uma vez; desconfie de asserção vazia.
5. **Verde ≠ correto.** Cobertura, `jest.mock`, fakes mais permissivos que o real e o fato de o Jest não checar tipos produzem verde falso. Saiba onde cada um engana (Parte 6).

| Camada | Prova | **Não** prova | Ferramenta | Custo |
|---|---|---|---|---|
| Unitário | O contrato de uma peça isolada | Que as peças funcionam juntas | Jest + RNTL | ms |
| Integração | Um fluxo com peças reais e infra fake | O comportamento da infra real (rede, nativo) | Jest + RNTL + `renderRouter` | centenas de ms |
| E2E *(fora do escopo)* | O app real num device | — | Maestro, Detox | segundos–minutos |

Unitário e integração rodam em **Node, sem simulador** — por isso rodam a cada commit, no CI.

---

# Parte 1 — Base: por que o app é testável, setup e anatomia

## 1.1 Testabilidade vem da arquitetura, não do framework de teste

```ts
// não importa Supabase nem AsyncStorage — importa uma abstração injetada
export function useCityFindAll(filters: CityFindAllFilters) {
  const { city } = useRepository();           // vem do Context (porta)
  return useAppQuery(() => city.findAll(filters), [filters.name, filters.categoryId]);
}
```

Como o hook depende de uma **interface injetada**, o teste monta o **mesmo Provider** da produção com um fake. Sem DI, a alternativa é `jest.mock` do módulo concreto — mais frágil (preso ao caminho, perde o resto do módulo).

| Porta do app | O que entra no lugar em teste |
|---|---|
| `Repositories` (city, category, auth) | `InMemoryRepository` — ou um override por teste (5.4) |
| `IStorage` | `InMemoryStorage` |
| `IFeedbackService` | `ToastFeedback` + `<Toast />` (o usuário vê o texto) |
| `AuthContext` | `AuthProvider` real + sessão semeada, ou `MockedAuthProvider` (5.3) |
| Ícones, mapas, worklets (nativos) | mocks globais (4.5) |

## 1.2 Setup do Jest em Expo (e em projeto que já existe)

```jsonc
// package.json
"scripts": { "test": "jest --watchAll --verbose", "test:coverage": "jest --verbose --coverage" },
"jest": {
  "preset": "jest-expo",
  "setupFilesAfterEnv": ["<rootDir>/jest.setup.tsx"],
  "collectCoverageFrom": ["{src,app}/**/*.{ts,tsx}"]
}
// tsconfig.json → "compilerOptions": { "types": ["jest"] }
```

| Item | Por quê existe | Se ignorar |
|---|---|---|
| `npx expo install jest-expo jest @types/jest @testing-library/react-native --dev` | `expo install` escolhe a versão **compatível com o SDK**; `jest-expo` deve ser da mesma linha do `expo` (aqui `~57` ↔ `^57`) | `jest-expo` de outra linha mocka o SDK errado |
| `preset: "jest-expo"` | Mocka a parte nativa do SDK → testes rodam sem simulador | Módulo nativo quebra dentro do Node |
| `types: ["jest"]` | Só tipos: `test`/`expect` são globais injetadas em runtime | Editor/`tsc` acusam "não definido" com o teste rodando |
| React 19: não instale `react-test-renderer` por reflexo | A doc do Expo diz que o RNTL o substitui e que ele não suporta React 19+ | Dependência morta/conflitante *(neste projeto os dois estão instalados — revisar)* |
| `transformIgnorePatterns` | Jest não transpila `node_modules`; lib de terceiro em ESM/JSX cru dá `SyntaxError: Cannot use import statement` | Só aparece quando um teste importa algo real, parecendo bug seu |
| `collectCoverageFrom` | Inclui no relatório o que nenhum teste carregou (6.1) | Cobertura inflada por omissão |
| `setupFilesAfterEnv` | Onde vivem mocks globais, hooks e matchers (4.5) | Esquecer de registrar = o arquivo **nunca roda**, sem erro |

**Descoberta de arquivos:** o `testMatch` padrão tem duas regras independentes — pasta `__tests__/` (plural) **ou** qualquer `*.test.ts(x)` / `*.spec.ts(x)`. Uma pasta `__test__/` (singular) só é achada pela segunda regra: funciona, mas um arquivo sem o sufixo `.test.` ali dentro **não roda**, em silêncio. Padronize.

## 1.3 Anatomia de um bom teste

```tsx
describe("should NOT submit form", () => {                       // uma regra
  it("when the email is invalid", async () => {                  // uma condição → lê como frase
    // Arrange: tudo válido, exceto o campo sob teste
    // Act:     o gesto do usuário
    // Assert:  o resultado — de preferência antes E depois da ação
  });
});
```

- **`test` e `it` são o mesmo método** (alias). Escolha um por projeto; nomes lidos como frase.
- **AAA com assert dos dois lados:** checar `Pressed:0` **antes** e `Pressed:1` **depois** prova que o clique *causou* a mudança — não que o valor já nasceu certo.
- **Falhe de propósito** (a regra de ouro): mude o valor esperado, comente a lógica ou troque a mensagem; rode; confirme que falha com uma mensagem útil. Um teste que passa com a lógica errada é falso positivo — pior que não ter teste.
- **Nome enganoso** não é falso positivo, mas faz quem lê a falha procurar o bug no lugar errado (ex.: `"…press the reset text 2"` que na verdade pressiona o label 4 vezes).
- **Isolamento entre testes:** um `jest.fn()` criado no escopo do arquivo **acumula chamadas** entre testes. `beforeEach(() => jest.clearAllMocks())` zera o histórico.

| | Zera histórico | Zera implementação (`mockResolvedValue…`) | Devolve o original |
|---|---|---|---|
| `clearAllMocks` | ✅ | ❌ | ❌ |
| `resetAllMocks` | ✅ | ✅ | ❌ |
| `restoreAllMocks` | — | — | ✅ (só para `jest.spyOn`) |

**Fixe — Parte 1**
- Testável = depende de abstração injetada; isolar é trocar o `value` do Provider.
- `expo install`, nunca instale `jest-expo` "na última".
- Setup registrado errado falha alto; **não** registrado falha calado.
- Todo teste novo deve ser visto **falhando** uma vez.

---

# Parte 2 — Queries: como achar elementos

## 2.1 Escolha a query pela prioridade do usuário

`getByRole` → `getByLabelText` → `getByPlaceholderText` → `getByText` → `getByDisplayValue` → **`getByTestId` por último**. Quanto mais a consulta se parece com o que o usuário **percebe**, mais ela te protege de refatorações.

> **Acessibilidade ≈ testabilidade.** Neste projeto `getByLabelText` é impossível: o `TextInput` renderiza o `label` como `<Text>` irmão, sem `accessibilityLabel`; o `IconButton` não tem nome acessível. O que o teste não alcança por label, o leitor de tela também não anuncia. Corrigir um corrige o outro. Enquanto isso, `getByPlaceholderText` achou os campos sem nenhum `testID`.

## 2.2 `getBy`, `queryBy`, `findBy`

| Variante | Espera? | Se não achar | Use para |
|---|---|---|---|
| `getBy*` | não | **lança** | o que já deve estar na tela |
| `queryBy*` | não | `null` | afirmar **ausência** (`expect(...).toBeNull()`) |
| `findBy*` | **sim** (async) | rejeita no timeout | o que aparece depois de trabalho assíncrono |

`*AllBy*` devolvem lista. `waitForElementToBeRemoved(() => getBy…)` espera algo **sumir** — e **exige que o elemento exista na chamada** (senão lança `…are already removed`).

**Regra:** o **primeiro** elemento depois de um gatilho assíncrono → `findBy`; os **irmãos do mesmo render** → `getBy` (se `"Rio de Janeiro"` apareceu, `"Bangkok"` já está lá).

## 2.3 Casar texto sem se enganar

`getByText("texto")` é **exato e sensível a maiúsculas**. Casos reais:

| Abordagem | Ganho | Custo |
|---|---|---|
| String exata | Estrita; pega mudança de redação | Quebra por caixa/pontuação — `"Pontos turísticos"` ≠ `"Pontos Turísticos"` (uma letra) |
| Regex com `i` — `/pontos turísticos/i` | Tolera caixa | Frouxa: `/entrar/i` passa a casar qualquer texto com "entrar" e `getByText` lança *múltiplos elementos* |
| Texto de fonte única (constante/i18n) usada pelo app **e** pelo teste | Não podem divergir | Exige essa camada no app |

Armadilhas de regex: `.` **sem escapar** casa qualquer caractere (`/Is loading..../` casa `"Is loadingXXXX"`; se quer o ponto, `\.`; se quer só a palavra, `/loading/i`). Para mensagens compostas (`erro ao carregar cidades.server is down!`), afirme **fragmentos independentes** em vez da string inteira — não acopla ao separador.

## 2.4 O que as queries enxergam

- **Elementos ocultos são ignorados por padrão** (RNTL 13: `defaultIncludeHiddenElements: false`). Uma tela coberta por outra numa pilha fica `aria-hidden`. Medido com o detalhe da cidade sobre a Home:

  | Texto | Query padrão | Incluindo ocultos |
  |---|---|---|
  | `Dubai` | **0** | 1 |
  | `Rio de Janeiro` | 1 (o nome nos detalhes) | 2 (+ card da Home) |

- **Marcador de tela:** para provar "voltei à Home", afirme algo que existe **só** nela e está **ausente** no estado de origem (`Dubai`, não `Rio de Janeiro`). Senão a asserção passa mesmo se o "voltar" falhar. Prove também por rota: `expect(screen).toHavePathname("/")`.
- **`FlatList` virtualiza também em teste:** só os primeiros `initialNumToRender` (10) entram na árvore — das 15 cidades, as 5 últimas **não** são achadas. `Dubai` é a 10ª: marcador no limite, frágil (uma cidade inserida antes o empurra para fora).

## 2.5 `testID`: último recurso, com três regras

1. **Ids derivados precisam tratar ausência.** ``testID={`${testID}-container`}`` com `testID` indefinido vira a string `"undefined-container"` — medi dois `TextInput` sem id com **dois** elementos iguais, em produção.
2. **Ids repetidos quebram `getByTestId`** (lança *múltiplos elementos*). `testID={iconName}` identifica "um ícone", não "qual botão".
3. **Mocks entram no mesmo espaço de nomes.** Um mock que injeta `testID` pode colidir com o do produto (4.5) — dê ao mock um **prefixo próprio**.

**Fixe — Parte 2**
- Priorize role/label/placeholder/texto; `testID` é o último recurso, derivado com cuidado.
- `getBy` presente · `queryBy` ausente · `findBy` assíncrono.
- Texto exato é case-sensitive; regex frouxa colide; `.` sem `\` casa tudo.
- O que está oculto não existe para a query — e é por isso que "voltei à Home" é provável.

---

# Parte 3 — Interação, assíncrono e tempo

## 3.1 `fireEvent` vs `userEvent`

| | `fireEvent` | `userEvent` |
|---|---|---|
| O que faz | Chama a prop (`onPress`) **direto** | Simula a **sequência real** de eventos de um toque |
| Execução | Síncrona | Assíncrona (`await user.press(...)`) |
| Precisa de fake timers? | Não | Sim (os delays internos precisam de relógio controlável) |
| Use quando | Basta provar a transição de estado | A fidelidade do gesto importa (`onPressIn`/`onPressOut`, debounce de toques) |

Coexistem — trocar tudo por `userEvent` não é upgrade automático, é mais setup. `userEvent` opera sobre o **elemento host** no fundo da árvore; qualquer componente próprio que acabe num primitivo interativo funciona. `fireEvent.changeText` define o **valor final de uma vez** (não tecla por tecla).

## 3.2 Assíncrono: `act`, `waitFor`, `findBy`

- **Por que o `expect` não pode vir logo depois do gesto:** `handleSubmit` do React Hook Form faz `await _runSchema()` (o resolver do Zod) **antes** de chamar seu `onSubmit`. Quando o `press` retorna, o callback ainda não rodou — um `expect` síncrono falharia com o código correto.
- **`waitFor` repete o callback** até passar ou estourar o timeout (~1s). Regras: **só asserções dentro** (ações repetiriam); um `waitFor` que falha só avisa **depois do timeout inteiro**; para "esperar um elemento aparecer", `findBy*` é o atalho.
- **`An update to X … was not wrapped in act(...)`:** uma atualização de estado chegou **depois** que o teste terminou. Resolver: aguardar algo (`findBy*`) ou envolver em `act`; se o culpado é um filho com efeito assíncrono, **bisseção por remoção** (comente o filho até o aviso sumir) e depois mocke (4.5). "Não vejo o aviso" não é "não há o problema" — testes longos com muitas esperas escondem o que um curto expõe.

## 3.3 Fake timers: os três fatos

1. **Você pode ligá-los:** `beforeAll(() => jest.useFakeTimers())` / `afterAll(() => jest.useRealTimers())`. O escopo é o **`describe` inteiro** (diferente de `beforeEach`, que roda por teste).
2. **`renderRouter` os liga sozinho, em toda chamada** (está no fonte do `expo-router/testing-library`: `jest.useFakeTimers()`). Medi após `renderApp()`: `setTimeout.clock` existe e há timers pendentes. Logo, **todo teste de integração roda sob fake timers**:
   - `await new Promise(r => setTimeout(r, 400))` **trava para sempre** — o relógio fake não avança sozinho;
   - `findBy*`/`waitFor` **avançam o relógio** a cada volta do polling — por isso um debounce de busca "simplesmente funciona".
3. **Para fazer o tempo passar de propósito:** `await act(async () => { jest.advanceTimersByTime(500); })`.

## 3.4 Estado transitório (loading): promise controlada

Um fake que resolve na hora só deixa o loading visível por uma **coincidência de ordem de execução** *(raciocínio)*. Determinístico:

```tsx
let resolve!: (v: any[]) => void;
const pending = new Promise<any[]>((r) => (resolve = r));
renderApp({ isAuthenticated: true, repositories: { city: { findAll: () => pending } } });

expect(await screen.findByText(/carregando cidades/i)).toBeOnTheScreen();   // fica carregando…
await act(async () => { resolve([]); });                                    // …até VOCÊ resolver
expect(await screen.findByText(/não há cidades no momento/i)).toBeOnTheScreen();
expect(screen.queryByText(/carregando cidades/i)).toBeNull();               // e o loading SOME
```

Verificado: passa, e ainda prova algo que o teste simples não prova — o loading **desaparece**. (Um `setTimeout` de 2s serve para ver o estado **na mão** no app, não em teste.)

**Fixe — Parte 3**
- `fireEvent` = handler direto; `userEvent` = gesto real (async + fake timers).
- Efeito assíncrono ⇒ `await findBy`/`waitFor` (só asserções) ou `act`.
- Em integração os timers **já são fake**: nunca `setTimeout` cru; `advanceTimersByTime` dentro de `act`.
- Loading determinístico = promise que você resolve.

---

# Parte 4 — Testes de unidade: fronteira, hooks, formulários e mocks

## 4.1 A fronteira do componente

| Dentro (unitário) | Fora (integração) |
|---|---|
| `onSubmit` chamado com os dados certos | A mutation realmente cadastra |
| Campos preenchidos chegam no payload | O toast de sucesso aparece |
| — | A tela volta ao login |

**Critério portátil:** não é "quantos arquivos o teste toca", é "a asserção atravessa a fronteira e passa a depender de um colaborador?". `expect(onSubmitMock).toHaveBeenCalled…` não atravessa (o mock **é** o colaborador); `expect(screen.getByText('cadastro feito'))` atravessa — é integração. Um bom desenho de fronteira vira, de graça, um bom limite de teste.

## 4.2 Render customizado: os mesmos Providers da produção

```tsx
const AllTheProviders = ({ children }: React.PropsWithChildren) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);
export const renderComponent = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: AllTheProviders, ...options });
```

Todo `render` aceita um `wrapper`; o custom apenas o **fixa** com os contextos que a árvore real usa. Cresce **conforme o teste exige** (hoje só tema). `Omit<RenderOptions, "wrapper">` reaproveita o tipo da lib e **trava** só o campo que você decidiu — ninguém sobrescreve os Providers por acidente. Evolução opcional: reexportar a lib de teste do mesmo módulo, para ninguém importar o `render` cru por engano.

## 4.3 Hooks e `jest.mock` de módulo

```ts
jest.mock("@/src/infra/repositories/RepositoryProvider", () => ({
  useRepository: () => ({ auth: { signIn: mockSignIn } }),
}));
const { result } = renderHook(() => useAuthSignIn());
await act(async () => { await result.current.mutate({ email, password }); });
expect(mockSignIn).toHaveBeenCalledWith(email, password);
```

- `renderHook` monta o hook sem componente; o retorno fica em `result.current`; mudanças de estado em `act`.
- `jest.mock(caminho, fábrica)` **substitui o módulo inteiro**, não uma função. É **içado** (*hoisted*) para antes dos `import`.
- **O caminho precisa resolver como um import real.** `@/src/...` funciona porque o `babel-preset-expo` lê os `paths` do `tsconfig` e **troca o prefixo `@/` literalmente** antes do Jest ver; `@src/...` (sem a barra) não casa com o prefixo, cai no resolvedor do Node e é tratado como um **pacote npm** → `Cannot find module`.
- **Vários `jest.mock` com caminhos errados se escondem:** são avaliados em ordem e o primeiro que falha interrompe o arquivo. Corrigiu um? **Rode de novo** — não assuma que resolveu o arquivo.
- **`jest.fn()` é um espião:** afirma que algo **foi chamado**, não que apareceu na tela. Prova **fiação** (a prop chegou ao componente nativo), não **regra de negócio**: o teste do botão `disabled` passa porque o `TouchableOpacity` do RN trata `disabled` — o componente próprio não tem lógica nenhuma. Duas confianças legítimas, não a mesma.

## 4.4 Formulários e cenários de erro

**Caminho feliz + `waitFor`**, sempre com os dois lados da fronteira em mente (4.1). Depois, os **testes negativos** — onde a validação é de fato fixada. Quatro regras:

1. **Isole uma variável (e às vezes é obrigatório).** Com `fullname`/`email` **nunca tocados** (`undefined`), enviar senhas diferentes mostra só `campo obrigatório ×2` — **sem** "senhas devem ser iguais": o `.refine()` do objeto no Zod **não roda** quando o parse interno aborta (`undefined` é erro fatal; `min()`/`email()` não são). Com strings inválidas (`"a"`, `"x"`) os três erros aparecem; com tudo válido exceto o `confirmPassword`, só o do refine.
2. **A ordem do `not.toHaveBeenCalled()` é o que o torna válido.** Logo depois do `press`, ele **passa mesmo com dados válidos** (medido) — a chamada é assíncrona. Asserte "não aconteceu" **depois** de aguardar algo que prove que o fluxo terminou (a mensagem de erro) e **pareie** com ela: sozinho, "não foi chamado" tem muitas causas.
3. **Todo `expect` precisa de matcher.** `expect(await screen.findByText(...))` sem `.toBeOnTheScreen()` funciona **só porque `findBy` lança** quando não acha — parece asserção e não é.
4. **Afirme o contrato, não o encanamento.** O `onSubmit` do RHF recebe `(dados, evento)`; asserir `undefined` como 2º argumento amarra o teste ao fato de `fireEvent.press` não passar evento — com `userEvent` ou num device real ele quebra **sem mudança de comportamento**. Prefira `mock.calls[0][0]` com `toMatchObject`. E `expect.objectContaining` com 3 de 4 campos é frouxo: se o 4º deixar de ser enviado, nada acusa.

**`toHaveStyle`** — só afirmar o **texto** do erro não diz **onde** ele aparece (trocar o `path` do `refine` para o campo errado deixa o teste de texto verde; só a asserção de estilo no container certo quebra). Mecanismo: lê o estilo achatado do elemento; com Restyle compara o **valor resolvido** (`#D32F2F`), não o token (`fbErrorSurface`) — detecta **fiação** (o token de erro no elemento certo), não um valor errado do token. **Use com parcimônia:** estilo muda o tempo todo; cubra primeiro comportamento (não submeter dado inválido). Alternativa menos frágil: afirmar **estrutura** com `within(elemento)`.

## 4.5 Mocks de componentes e mocks globais

**Por que mockar:** o `Icon` (vector-icons) faz `await Font.loadAsync(...)` e depois `setState` — atualização assíncrona que chega depois do teste (medido: **1** aviso de `act` sem o mock, **0** com ele).

```tsx
jest.mock("@expo/vector-icons/createIconSetFromIcoMoon", () => {
  const { View } = require("react-native");                    // import DENTRO da fábrica
  function FakeIcon(props: any) { return <View testID={`icon-${props.name}`} />; }
  return () => FakeIcon;                                        // módulo → função → componente
});
```

- **O mock reproduz o formato do módulo:** aqui o módulo é uma função que devolve um componente. Retornar `null` não funciona (não há componente a renderizar).
- **A fábrica não pode referenciar variáveis de fora** (`out-of-scope variables`): como o `jest.mock` é içado, nada de fora existe ainda — `require` dentro.
- **Fake observável:** receber as mesmas props e expor algo (`testID`) deixa o teste afirmar **qual** ícone foi renderizado. Custo: ignora `size`/`color`.
- **Prefixe o id do mock.** O `IconButton` já tem `testID={iconName}`; com o fake fazendo `testID={props.name}`, `getByTestId("Chevron-left")` achou **2** elementos (o `Pressable` e o ícone). Com `icon-<nome>`, resolvido.
- **Mudar um mock global é mudar um contrato:** ao prefixar o id, o teste do `CityCard` que consultava `Favorite-outline` quebrou — procure os consumidores (`grep`) antes de mudar.

| | `setupFiles` | `setupFilesAfterEnv` |
|---|---|---|
| Roda | **antes** do framework de teste | **depois**, antes de cada arquivo de teste |
| `expect`/`beforeEach` | `undefined` | disponíveis |
| `jest` (`jest.mock`) | disponível | disponível |

Para só registrar `jest.mock`, ambos servem; para hooks/`expect.extend`, só o segundo — é o padrão. `<rootDir>` é o token da raiz do projeto. JSX na fábrica exige `.tsx` (ou use `React.createElement`, como o mock do `react-native-maps` no mesmo arquivo).

| | Mock local (no arquivo) | Mock global (`jest.setup`) |
|---|---|---|
| Use para | Comportamento específico; mocks que **afirmam chamadas** | Dependências nativas/assíncronas/irrelevantes que **todo** teste ignoraria |
| Risco | Repetição | **Esconde o comportamento real de toda a suíte**; pode colidir com o que os testes usam |
| Escape | — | `jest.unmock` / `jest.requireActual` *(API padrão; não exercitada aqui)* |

> **Erro alto vs. calado:** apontar `setupFiles` para um arquivo que não existe dá `Validation Error: Module … was not found` e **a suíte inteira deixa de rodar**. Renomear a *referência* não cria o *arquivo*.

## 4.6 Exemplo aplicado: testar as variants de um `Button`

Cenário real (projeto próprio): `Button` com `variant` (`primary|secondary|ghost|outline`), `size`, `disabled`, `isLoading` e `style` do consumidor, estilizado por uma função `createVariants`. O texto abaixo vale para qualquer componente "variantizado" (Restyle, `cva`, StyleSheet + mapa, NativeWind).

### 1. Antes de escrever: o que vale a pena testar?

Variant é **configuração declarativa**. Se o teste só repete o literal do mapa (`'#2E7D32'`), você testa a tabela contra ela mesma — qualquer mudança de design quebra dois lugares e nenhum bug é encontrado. Teste o que pode **realmente quebrar**:

| O que | Por quê pode quebrar | Vale? |
|---|---|---|
| Cada `variant` chega ao estilo certo (fiação) | Chave trocada, mapa incompleto, prop não repassada | **Sim** — é o seu `// testar cor e variáveis` |
| **Default** (sem `variant`) | Alguém muda o `defaultVariants` sem perceber | **Sim** |
| Estado derivado: `disabled` → `opacity`, `isLoading` ⇒ desabilitado | Regra de negócio **do componente** (`disabled \|\| isLoading`) | **Sim, o mais valioso** |
| `style` do consumidor **vence** a variant | Ordem do array | Sim, 1 teste |
| Valor exato de cada cor/raio | Só muda por decisão de design | Só se comparar com o **token** (abaixo) |
| **Como as variants se combinam** (default, override, quem vence) | Mora no `createVariants`, compartilhado por todos os componentes | **Sim, uma vez, na função pura** (2b) |
| Cada combinação `variant × size × disabled` | Explosão combinatória (4×3×2) | **Não** — teste cada eixo isolado |

**Compare com o token do tema, não com o hex.** `theme.colors.primaryBase` no teste: trocar a cor da marca não quebra nada; trocar `primary` para apontar para `secondaryBase` quebra. O teste detecta **fiação**, não "a cor é bonita" (mesma limitação de 4.4).

### 2. O teste (tabela com `it.each`)

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { theme } from "@ui/styles/theme";
import { Button } from "../Button/Button";

const button = () => screen.getByTestId("button-component");

describe("<Button /> variants", () => {
  it.each([
    ["primary",   { backgroundColor: theme.colors.primaryBase,   borderRadius: 16 }],
    ["secondary", { backgroundColor: theme.colors.secondaryBase, borderRadius: 16 }],
    ["ghost",     { backgroundColor: "transparent" }],
    ["outline",   { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.colors.border }],
  ] as const)("renders variant %s", (variant, expected) => {
    render(<Button variant={variant}>Label</Button>);
    expect(button()).toHaveStyle(expected);
  });

  it("uses primary by default", () => {
    render(<Button>Label</Button>);
    expect(button()).toHaveStyle({ backgroundColor: theme.colors.primaryBase });
  });

  it("variants are actually different (guards against a vacuous test)", () => {
    render(<Button variant="secondary">Label</Button>);
    expect(button()).not.toHaveStyle({ backgroundColor: theme.colors.primaryBase });
  });

  it("ghost has no border", () => {
    render(<Button variant="ghost">Label</Button>);
    expect(StyleSheet.flatten(button().props.style).borderWidth).toBeUndefined();
  });
});

describe("<Button /> derived state", () => {
  it("dims when disabled", () => {
    const { rerender } = render(<Button>Label</Button>);
    expect(button()).toHaveStyle({ opacity: 1 });
    rerender(<Button disabled>Label</Button>);
    expect(button()).toHaveStyle({ opacity: 0.5 });
  });

  it("isLoading: shows spinner, hides label, dims and ignores presses", () => {
    const onPress = jest.fn();
    render(<Button isLoading onPress={onPress}>Save</Button>);

    expect(screen.getByTestId("button-loading")).toBeOnTheScreen();
    expect(screen.queryByText("Save")).toBeNull();
    expect(button()).toHaveStyle({ opacity: 0.5 });
    expect(button()).toBeDisabled();

    fireEvent.press(button());
    expect(onPress).not.toHaveBeenCalled();
  });

  it("consumer style wins over the variant (object and function forms)", () => {
    const { rerender } = render(<Button style={{ marginTop: 8 }}>Label</Button>);
    expect(button()).toHaveStyle({ marginTop: 8, backgroundColor: theme.colors.primaryBase });

    rerender(<Button style={() => ({ marginTop: 4 })}>Label</Button>);
    expect(button()).toHaveStyle({ marginTop: 4 });
  });
});
```

> **Verificado com o código real do bolsin** (`Button` + `styles` + `createVariants` enviados; só `theme` e `Typography` foram substituídos por stubs; Jest 29 + RNTL 13.3 + jest-expo 57): os 10 testes acima passam. O estilo resolvido é um **objeto único** (o `createVariants` devolve o merge, não um array); `StyleSheet.flatten(el.props.style)` é a forma de ver o que `toHaveStyle` compara. Por isso o teste é caixa-preta: só olha o estilo resolvido no elemento, não como foi montado.

### 2b. O melhor teste do conjunto: a função pura `createVariants`

O `Button` só **usa** o `createVariants`; a regra de "como variants se combinam" mora nele. É uma **função pura** (entra config + seleção, sai objeto de estilo): o teste mais barato, rápido e sem render. Teste a regra **uma vez** aqui com uma config pequena e inventada — e os componentes só provam a fiação.

```ts
const make = () => createVariants({
  base: { alignItems: "center" },
  variants: {
    tone: { a: { backgroundColor: "red", opacity: 1 }, b: { backgroundColor: "blue" } },
    size: { s: { opacity: 0.5, width: 10 }, l: { width: 100 } },
  },
  defaultVariants: { tone: "a", size: "s" },
});

it("uses defaults when nothing is selected", () => {
  expect(make()()).toEqual({ alignItems: "center", backgroundColor: "red", opacity: 0.5, width: 10 });
});
it("selected value overrides default only for that axis", () => {
  expect(make()({ tone: "b" })).toEqual({ alignItems: "center", backgroundColor: "blue", opacity: 0.5, width: 10 });
});
it("undefined falls back to default (Button passes size={undefined})", () => {
  expect(make()({ size: undefined })).toEqual(make()());
});
it("later axes win on conflicting keys", () => {          // size.opacity (0.5) vence tone.opacity (1)
  expect(make()({ tone: "a", size: "s" }).opacity).toBe(0.5);
  expect(make()({ tone: "a", size: "l" }).opacity).toBe(1);
});
it("does not mutate base across calls", () => {
  const f = make(); f({ tone: "b" });
  expect(f()).toEqual({ alignItems: "center", backgroundColor: "red", opacity: 0.5, width: 10 });
});
```

> **Verificado (8 casos, todos passam contra o `createVariants` real).** Comportamentos que o código tem e que o teste **fixa** — saiba que existem:
> - **A ordem dos eixos em `variants` é semântica:** o loop mescla em ordem, e o **último vence** em chave repetida. No `Button`, `disabled` vem por último, então o `opacity` dele sempre ganha de qualquer `opacity` de `variant`/`size`. Reordenar o objeto muda o resultado sem erro de tipo.
> - **`undefined` (e `null`) cai no default** (`??`) — por isso o `Button` pode repassar `size={undefined}`.
> - **Nome de variant inexistente é ignorado em silêncio** (`{ tone: "zzz" }` não lança nem aplica nada). O TypeScript impede isso em código tipado; vindo de dado dinâmico (API, JSON), vira estilo faltando sem aviso. Trade-off: robustez × falha silenciosa — decida se um `throw` em dev vale.
> - **Não muta o `base`** entre chamadas (o `{ ...base }` copia) — o teste protege contra uma "otimização" que o quebre.

**Consequência para o `Button`:** com a regra de combinação provada aqui, os testes do componente (seção 2) ficam **curtos e de fiação**: 1 por variant, o default, o estado derivado. Sem essa base, você acaba reprovando a mesma regra em cada componente que usa `createVariants`.

> **Jest não checa tipos (de novo):** rodando `tsc --noEmit` com este projeto, o `createVariants` colado deu `TS2322` na linha do `styles = { ...styles, ...selectedVariantStyles }` (união de `ViewStyle | TextStyle | ImageStyle` com o spread). Os testes passaram mesmo assim. É relativo às versões de TS/RN **deste** projeto — confira no `tsc` do bolsin.

### 3. Por que cada decisão

- **`it.each` com tabela:** uma linha nova por variant; o nome da falha traz o `%s`. Custo: se a tabela cresce muito, vira um segundo mapa a manter — mantenha só o que **distingue** a variant.
- **Afirme só as propriedades que a variant define.** `ghost` não define `borderRadius`; afirmar um valor ali amarraria o teste a um acidente. Para "não tem borda", leia o estilo achatado e espere `undefined`.
- **O teste `not.toHaveStyle` é o "falhar de propósito" embutido:** prova que a asserção **discrimina**. Sem ele, um `toHaveStyle({})` ou uma variant que ignora a prop passaria igual.
- **Teste os eixos separados, não o produto cartesiano.** `variant`, `size` e `disabled` são independentes no `createVariants`; 1 teste por eixo + 1 do estado derivado cobre o risco. Combinar tudo só faria sentido se houvesse regra que **cruza** eixos (ex.: `ghost` + `disabled` ocultar a borda).
- **`isLoading` mistura 4 efeitos numa só regra** (`disabled || isLoading`): spinner, label some, estilo, press bloqueado. Esse é o teste de **regra de negócio** do componente (4.3) — o que mais merece asserção. O teste de `disabled` que você já tem prova só fiação para o `Pressable` do RN.
- **Pressione o próprio botão** (`button()`), não o texto: com `isLoading` o texto nem existe.

### 4. Estado `pressed` (ripple/`opacity: 0.7` no iOS): custo alto, valor baixo

O `style` como função recebe `{ pressed }`. Medi o que funciona:

| Tentativa | Resultado |
|---|---|
| `fireEvent(el, "pressIn")` | **não** muda o estilo — o RNTL procura a prop `onPressIn` do consumidor, não a transição interna do `Pressable` |
| `fireEvent(el, "responderGrant", evento)` | **funciona**: `opacity` vai a `0.7` (exige montar um evento sintético) |
| `userEvent.longPress` observado no meio | não consegui ver o estado pressionado (vi `[1, 1]`) — **não confiável** |
| soltar com `responderRelease` | o `opacity` **continuou** `0.7` no meu evento sintético; a saída do estado pressionado depende de temporização interna — não consegui verificar |

Conclusão: o feedback visual de toque é **comportamento do React Native**, e o teste acopla a internals do `Pressability`. **Recomendo não testar** (e `android_ripple` não é verificável em Jest). Se for requisito de produto, deixe para teste em device/E2E.

### 5. Observações sobre o arquivo de teste original

| Ponto | Observação |
|---|---|
| `await render(...)` | Em RNTL 13 `render` é **síncrono**; o `await` é inofensivo, mas induz a achar que há assíncrono. *(Raciocínio: versões mais novas do RNTL podem torná-lo assíncrono — confira a sua.)* |
| `{...props}` **depois** de `testID` no componente | O consumidor pode **sobrescrever** `testID="button-component"` e quebrar testes que dependem dele. Trade-off: flexibilidade × contrato estável do teste. |
| `it('…variant PRIMARY')` vazio | Um teste sem `expect` **passa sempre** — exatamente o falso positivo da seção 1.3. Complete ou apague. |
| Loading só checa o spinner | Falta provar que o rótulo some, o estilo muda e o clique é bloqueado (acima). |
| Sem teste de `size` | Um por valor que importa (ex.: `icon` → 32×32), pelo mesmo mecanismo. |

### 6. Alternativas e quando escolhê-las

| Abordagem | Quando | Custo |
|---|---|---|
| **`toHaveStyle` por variant** (acima) | Poucos componentes-base, regra de estado derivado | Teste que acompanha o design |
| **Snapshot** *(a estudar — aula 17)* | Muitas variants, detectar mudança **visual não intencional** | Ruído se ninguém revisa o diff |
| **Teste visual real** (Storybook + screenshot, device) | Cor, sombra, ripple — o que o Jest não renderiza | Infra e tempo |
| **Não testar** o mapa de estilos | Componente sem regra, só config | Risco: chave trocada passa batido |

**Regra de bolso:** teste a **regra** (default, estado derivado, precedência do `style`) com `toHaveStyle`; para cor/aparência, só a **fiação** por token; para "ficou bonito", use outra ferramenta.

**Fixe — Parte 4**
- Unitário afirma só o que cruza a fronteira; colaborador ⇒ integração.
- `@/` é prefixo substituído; `@src` vira pacote npm. Erros de `jest.mock` se escondem.
- Negativo: isole a variável, asserte "não aconteceu" **depois** de esperar, sempre com matcher, contrato em vez de encanamento.
- Mock de componente = formato do módulo + `require` na fábrica + prefixo no `testID`.
- Global esconde comportamento: mocke só o nativo/assíncrono/irrelevante.
- Variants: teste a **regra de combinação uma vez na função pura** (`createVariants`) e, nos componentes, só a **regra** (default, estado derivado, precedência do `style`) e a fiação por **token**; cada eixo isolado; `pressed` não vale o custo (4.6).

---

# Parte 5 — Testes de integração: o app inteiro com infra fake

## 5.1 O que é e quando

| | Unitário | Integração |
|---|---|---|
| Escopo | Um hook/componente/função | Um **fluxo**, passando por várias telas |
| Dependências | Mocks | Hooks e providers **reais**; só a infra externa é trocada |
| Custo | Rápido; a falha aponta o lugar | Mais lento; a falha exige investigar |

Escolha integração para **jornadas do usuário** (login, navegar, buscar); unitário para regras isoláveis. O fluxo de auth reúne quase tudo: formulário, caso de uso real, navegação, sessão.

## 5.2 A infraestrutura (quatro peças)

1. **`AppStack` fora de `app/`** — o layout raiz mantém só o que é do app (fontes, splash, providers de produção); o teste reutiliza o mesmo componente.
2. **`renderApp` com `renderRouter`** — sem sistema de arquivos no teste, ele recebe um **mapa rota → componente** que espelha `app/` (chaves exatas, grupos e `[id]` inclusos): `"(protected)/(tabs)/index"`, `"(protected)/city-details/[id]"`, `"sign-in"`… Rota nova no app **não entra sozinha** no mapa. (Faltar `+not-found` no mapa gera um warning inofensivo a cada render.)
3. **Wrapper de providers** na mesma ordem de dependência da produção: `StorageProvider` → `AuthProvider` → `FeedbackProvider` → `RepositoryProvider` → `ThemeProvider` (+ `<Toast />`). A ordem **não é livre**: `AuthProvider` usa `useStorage()` por dentro.
4. **`InMemoryStorage`** — `Map` exportado como **singleton** (para poder `clear()`).

> **Fidelidade do fake:** o adapter real faz `JSON.stringify/parse`; o `InMemoryStorage` guarda **o objeto como está**. Medi: `getItem` devolve a **mesma referência** (mutação vaza) e um `Date` sobrevive como `Date` em memória mas vira `string` no round-trip por JSON. Um bug de serialização passaria despercebido.

`expo-router/testing-library` registra matchers de rota — `toHavePathname`, `toHavePathnameWithParams`, `toHaveSegments`, `toHaveSearchParams`, `toHaveRouterState` — que afirmam o **destino**, não um texto qualquer. Funcionam em runtime, mas **sem tipos** (`tsc` dá `TS2339`): é preciso uma declaração própria.

## 5.3 Começar autenticado: três técnicas

Todo teste de integração abre o app "recém-instalado", sem sessão. A maioria dos testes **não é sobre auth** — repetir o login é custo e acoplamento.

| Técnica | Como | Passa pelo `AuthProvider` real? | Custo / risco |
|---|---|---|---|
| Login pela UI | O fluxo de sign-in | sim | O mais lento; acopla todo teste ao formulário |
| **Semear o storage** | `inMemoryStorage.setItem("AUTH_KEY", user)` antes do `renderApp()` | **sim** (hidratação real) | Acopla à chave/serialização; singleton exige `clear()` |
| **Provider mockado** | `renderApp({ isAuthenticated: true })` → `AuthContext.Provider` com valor pronto | **não** | O mais rápido, sem estado no storage; mas `saveAuthUser`/`removeAuthUser` viram **no-op** |

**O custo do atalho (verificado):** com o provider mockado, "Sair" **não desloga** (fica em `/profile`); com o provider real + sessão semeada, volta ao login. Regra: o mock serve a testes **de outra feature**; o teste de auth usa o real — e é ele que cobre hidratação, splash e `saveAuthUser`.

**Singleton em memória vaza — mas só dentro do mesmo arquivo** (medi): um teste que semeou a sessão fez o seguinte abrir **já logado**; outro arquivo viu `null` (cada arquivo tem seu próprio registro de módulos). Um teste que se limpa sozinho (o "Sair") deixa a sessão se falhar no meio. `beforeEach(() => inMemoryStorage.clear())` resolve. Semear pela persistência é a mesma hidratação do app **usada de propósito** — e é o que permite dividir um teste de jornada longa em testes menores.

## 5.4 Injetar cenários: `renderApp({ repositories })`

```tsx
const finalRepository = merge(clonedeep(InMemoryRepository), options?.repositories ?? {});

renderApp({ isAuthenticated: true, repositories: {
  city: { findAll: async () => Promise.reject(new Error("server is down!")) },   // só o findAll
}});
```

| Como forçar um cenário | Escopo | Quando | Custo |
|---|---|---|---|
| Editar o repository em memória | Global, permanente | **Só** para ver o estado na mão no app (nunca commitar) | Afeta tudo |
| `jest.mock` do módulo | O arquivo inteiro | Projeto **sem** DI | Preso ao caminho; perde o resto |
| **Override por teste via DI** | Um teste | O padrão aqui | Infra de teste a manter |

**Por que `cloneDeep` + `merge` (verificado):** o clone é outro objeto e **preserva o prototype** (o `findById` segue existindo); o `merge` troca só `findAll` na **cópia**; sem o clone, o `merge` **muta o singleton** e a falha vaza para os testes seguintes. Pegadinhas do `merge`: arrays se mesclam **por índice** (`[1,2,3]` + `[9]` → `[9,2,3]`) e `undefined` **não** sobrescreve — por isso troque **funções**, e para dados passe uma função que devolve o array.

**`DeepPartial` que parece proteger e não protege.** Para membros que são funções, `T[P] extends object` é verdadeiro e o tipo mapeado colapsa num `{}` que aceita qualquer coisa:

| Override | `DeepPartial` ingênuo | Preservando funções (`T[P] extends (...a) => any ? T[P] : …`) |
|---|---|---|
| `findAll: async () => 123` (retorno errado) | **compila** | erro `TS2322` |
| `findAll: "oops"` | **compila** | erro `TS2322` |
| `naoExiste: …` | erro `TS2353` | erro `TS2353` |
| `findAll: async () => []` | ok | ok |

Um tipo usado para construir fakes tem de checar o fake **contra o contrato real**. E um utilitário de tipo copiado merece um "teste de tipo" de dois minutos: escreva usos certos e errados e veja o que o `tsc` rejeita.

## 5.5 Escrever o fluxo

**A jornada do usuário é o roteiro.** Escreva os passos como comentários antes do código e traduza cada um:

```tsx
renderApp();
expect(await screen.findByText("Bem-vindo")).toBeOnTheScreen();                 // login renderizou
fireEvent.changeText(screen.getByPlaceholderText("seu email"), "lucas@coffstack.com");
fireEvent.changeText(screen.getByPlaceholderText("digite sua senha"), "12345678");
fireEvent.press(screen.getByText(/entrar/i));
expect(await screen.findByText("signed in: lucas@coffstack.com")).toBeOnTheScreen();  // toast que o usuário VÊ
expect(await screen.findByText("Rio de Janeiro")).toBeOnTheScreen();                  // Home
fireEvent.press(screen.getByText("Perfil"));  fireEvent.press(screen.getByText("Sair"));
expect(await screen.findByText("Bem-vindo")).toBeOnTheScreen();                       // voltou ao login
```

- **Toast na tela ≠ função chamada.** No unitário, `expect(mockSend).toHaveBeenCalled…` prova que a função foi chamada; aqui afirma-se o **texto visível**. Fica independente da implementação do serviço, mas preso ao **canal de UI** injetado (`ToastFeedback` + `<Toast/>`): trocar por um `Alert.alert` nativo tiraria o texto da árvore. Os dois testes **não são redundantes** — contrato do hook × fiação ponta a ponta.
- **Tab × tela:** `getByText("Perfil")` acha o rótulo da aba, que existe desde o início; `getByText("Sair")` logo após o `press` funciona porque o `fireEvent` roda em `act` e a tela renderiza de estado local. Se buscasse dados: `findBy`.
- **Home → detalhes → voltar → buscar:** o card faz `Link push`; a Home fica montada, oculta, por baixo (2.4). `waitForElementToBeRemoved` espera o `Dubai` sumir após a busca (debounce avançado pelo `waitFor`, 3.3).
- **Estados de erro/loading/vazio:** a `FlatList` não sabe **por que** está vazia — a tela escolhe pela prioridade `isLoading` → `error` → vazio, com o que o hook devolve. Escrever o teste do estado **revela se o produto o trata**.
- **O que o teste não prova:** roda sobre fakes. O `signIn` em memória **ignora a senha** — nunca pegaria "senha errada deve ser rejeitada"; o filtro em memória usa `includes`, o Supabase usa `ilike` (`%`/`_` digitados são curingas) *(raciocínio sobre o Postgres)*. **Fake que valida menos que o real = teste verde, app quebrado.**

**Fixe — Parte 5**
- Integração = peças reais + infra fake pelas mesmas portas; ordem dos providers segue o grafo de dependência.
- Começar autenticado: UI (fiel) · seed (real e barato) · provider mockado (rápido, mas auth vira no-op).
- Override por teste = `cloneDeep` + `merge` com `DeepPartial` que preserva funções.
- A jornada é o roteiro; afirme o que o usuário vê; marcador de tela único e ausente na origem.
- Singleton vaza só no mesmo arquivo — limpe no `beforeEach`.

---

# Parte 6 — Qualidade do conjunto: cobertura, depuração e o verde que engana

## 6.1 Cobertura: um mapa, não um veredito

- **`collectCoverageFrom: ["{src,app}/**/*.{ts,tsx}"]` é um glob.** Sem ele só aparece o que algum teste **carregou**. Medido: **64 → 86 arquivos** (+22 nunca carregados: `SupabaseAuthRepository.ts`, `AsyncStorage.ts`, `AlertFeedback.tsx`, `reset-password.tsx`…), e **42,39% → 31,08%**. Sem o glob, o relatório ainda contava **16 imagens** (15 JPGs + a logo) como "100% cobertas" — cada `require` de imagem vira um stub de 1 statement. O glob torna o número **menor e honesto**.
- **Os dois zeros são coisas diferentes:** *sem teste algum* (leitura: falta teste) × *mockado por um teste que testa outra coisa* (o `FeedbackProvider` fica em 0% porque o teste do hook o substitui; leitura certa: falta um teste **dedicado** aos adapters, não "o feedback está sem teste").
- **O inverso — cobertura "falsa":** `useAuthSignIn` mostra 100% por causa do teste **unitário** totalmente mockado, sem nunca ter sido testado **ligado** a nada.
- **Olhe os *branches*, não as linhas.** Na Home: só o teste feliz = statements **94,44%**, branches **75%**; os três testes (feliz, erro, vazio) = **100%/100%**. O ramo de loading aparece coberto em *todo* teste (todo render começa carregando) mas só um teste o **afirma**: **coberto ≠ afirmado**.
- **Técnica de trabalho:** rode `jest --coverage` e abra `coverage/lcov-report/index.html` como **medidor de progresso** do fluxo — renderizar o login cobre a tela, mas o `handleSignIn` segue vermelho até o `press`; `removeAuthUser` só acende após o "Sair". Um teste de integração cobre arquivos sem teste próprio — o que justifica o setup caro. **Nem tudo precisa de 100%.**

## 6.2 Depuração: qual ferramenta para qual dúvida

| Dúvida | Ferramenta |
|---|---|
| O que **está renderizado**? | `screen.debug()` — e a árvore que o RNTL já imprime quando um `getBy`/`findBy` falha |
| Em que **ordem/quando** as etapas rodam, e onde o teste para? | marcadores `console.log("STEP +Nms …")` |
| Algo é chamado **vezes demais** (loop)? | espião `jest.fn()` contando chamadas |
| Qual o **valor** de uma variável, e **quem** chamou? | debugger com breakpoint + **call stack** |

- **Debugger:** funciona em qualquer arquivo que o teste alcance (o `renderItem`, o hook, o `findAll` do repository), porque o teste roda o **código real** em Node. O call stack mostra a cadeia de chamadas (`findAll` ← fetch do `useAppQuery` ← `useCityFindAll` ← tela); a maior parte dos frames é de `node_modules` — salte entre os **seus**. Em linha de comando: `node --inspect-brk node_modules/.bin/jest --runInBand <arquivo>` (`--runInBand`: depuração exige um só processo).
- **O timeout do Jest (5s) segue contando com o teste pausado.** Eleve só na sessão de debug (3º argumento de `it(nome, fn, ms)`, `jest.setTimeout` ou `--testTimeout`) e **volte ao padrão**: um timeout longo permanente **mascara travamentos**.

**Como ler a falha de um teste de integração — 4 passos:**
1. **O que foi procurado?** A 1ª linha da mensagem.
2. **Cheguei na tela certa?** `toHavePathname` ou um texto que você sabe que está lá.
3. **O texto existe, escrito de outro jeito?** Procure um **fragmento** (sem caixa, sem acento) na árvore impressa **ou no código** (`grep -rn "Pontos tur" app src`).
4. **Corrijo o teste ou o app?**

**Travou, sem mensagem — nem o `findBy` falha?** Suspeite de **loop de render/efeito** que sufoca o event loop. Prove contando chamadas: `useEffect(fn, [arrayNovoACadaRender])` reexecuta a cada render, o efeito muda estado, e o ciclo não termina — medi **258.933 chamadas ao fetch em 300ms** contra **1** com referência estável. Para **provar a causa antes de mexer no código**, troque o módulo suspeito por uma versão corrigida num teste descartável (`jest.mock` só dele).

## 6.3 O verde que engana: onde cada coisa mente

| Fonte de verde falso | Por quê | Defesa |
|---|---|---|
| Cobertura alta | Conta execução, não verificação (coberto ≠ afirmado) | Olhar branches; ler as asserções |
| `jest.mock` de módulo | O real nunca roda (0% / comportamento simulado) | Teste dedicado do real; integração |
| Fake mais permissivo que o real | `signIn` sem senha; `includes` × `ilike`; storage sem JSON | Comparar fake × real; teste de contrato |
| Jest não checa tipos | O Babel remove os tipos antes de rodar | `tsc --noEmit` separado no CI |
| Asserção vazia | `expect(x)` sem matcher; `not.toHaveBeenCalled` cedo demais; marcador não-único | Quebrar de propósito |
| Estado compartilhado | Singletons, mocks sem `clear`, timers | `beforeEach` de reset |

**Fixe — Parte 6**
- Cobertura é mapa: branches, glob que inclui o não carregado, coberto ≠ afirmado.
- Falha: 4 passos; travou sem mensagem = loop (conte chamadas); debug = `debug()` / `STEP` / `jest.fn` / debugger.
- Timeout longo de debug não fica no código.
- Jest verde + `tsc` vermelho é possível.

---

# Parte 7 — Casos reais: os bugs que os testes acharam

Cada linha é um erro que aconteceu neste projeto — leia o **princípio**, não só a correção.

| # | Sintoma | Causa | Correção | Princípio | Estado |
|---|---|---|---|---|---|
| 1 | `Cannot find module '@src/…'` num `jest.mock` | Typo no alias; `babel-preset-expo` troca só o prefixo `@/`; **+2 caminhos errados** no mesmo arquivo escondidos pelo 1º | `@/src/…`, pasta e profundidade relativa certas | Alias é substituição de prefixo; erros de `jest.mock` se escondem | corrigido |
| 2 | `Unable to find … signed in: gabriel…`, tela com toast de erro `user not found` | Usuário **fora da fixture** do fake; e-mail digitado ≠ esperado | Usar usuário da fixture, mesmo e-mail nos dois lugares | Integração roda sobre fakes; leia a árvore impressa | corrigido |
| 3 | Teste **trava** depois do login (timeout, sem mensagem) | `useAppQuery` com `[dependencies]` (identidade) → refetch infinito (258.933 chamadas/300ms) sufoca o event loop | `}, dependencies)` **+ `[id]`** nos casos de uso que dependiam do acidente | Travou = loop; conte chamadas; corrigir um bug de dependência exige achar quem dependia dele | corrigido |
| 4 | `Unable to find … Pontos turísticos` | Match exato é case-sensitive; real: `Pontos Turísticos` | Corrigir a caixa (ou regex `/i`, ou fonte única) | Leia a falha em 4 passos | corrigido |
| 5 | Dois elementos com `testID="undefined-container"` | ``${testID}-container`` com `testID` indefinido | `testID ? \`${testID}-container\` : undefined` | Atributo derivado de prop opcional deve tratar ausência | **aberto** |
| 6 | `Found multiple elements with testID: Chevron-left` | Mock global do ícone injeta o mesmo `testID` do `IconButton` | Prefixo `icon-<nome>` no mock | Mocks dividem o namespace do produto | corrigido |
| 7 | `Unable to find … testID: Favorite-outline` (CityCard) | O mock passou a `icon-…`; o teste não acompanhou | Consultar `icon-Favorite-outline` | Mudar mock global = mudar contrato; `grep` os consumidores | corrigido |
| 8 | `Validation Error: Module … setupFiles … not found` | Entrada de config para arquivo inexistente (e renomeada, ainda inexistente) | Remover a entrada | Caminho errado é erro alto; registro esquecido é silêncio | corrigido |
| 9 | Erro velho após refetch vazio; lista velha sem erro após refetch que falha | `useAppQuery` não zera `error` ao iniciar fetch nem descarta `data` na falha; estados só no `ListEmptyComponent` | *(sugerido)* zerar `error` no início; mostrar erro fora do vazio | Teste de **estados isolados** não pega falhas de **transição** | **aberto** |
| 10 | Jest verde, `tsc` vermelho: `error.message` em `{}` (`TS2339`) | `if (error)` estreita `unknown` para `{}` | `error instanceof Error ? error.message : String(error)` | Jest não checa tipos | **aberto** |
| 11 | `An update to Icon … not wrapped in act(...)` | `vector-icons`: `await Font.loadAsync` + `setState` | Mock global do ícone | Bisseção por remoção + ler o culpado | corrigido |
| 12 | "Sair" não desloga num teste | `MockedAuthProvider.removeAuthUser` é no-op | Provider real (+ seed) nos testes de auth | O atalho tem custo | por desenho |
| 13 | `await new Promise(r => setTimeout(r, 400))` trava | `renderRouter` liga fake timers | `act` + `advanceTimersByTime`, ou `findBy` | Saiba em que relógio você está | por desenho |
| 14 | `expect(await findByText("Bem-vindo"));` sem matcher (2 linhas) | Funciona só porque `findBy` lança | Acrescentar `.toBeOnTheScreen()` | Toda asserção diz o que afirma | **aberto** (estilo) |

---

# Parte 8 — Fixação

## 8.1 Playbook de sintomas

| Sintoma | Causa mais provável | Primeira ação |
|---|---|---|
| `Unable to find an element with text` | Caixa/acento diferente · tela errada · ainda carregando | `toHavePathname`; procurar **fragmento** no código/árvore; `findBy` se for assíncrono |
| `Found multiple elements` | `testID`/texto duplicado (mock, regex frouxa, tela coberta incluída) | `getAllBy…` para inspecionar; prefixar ids de mock; `includeHiddenElements` só se for de propósito |
| Trava / timeout sem mensagem | Loop de render/efeito · `setTimeout` cru sob fake timers | Contar chamadas com `jest.fn()`; checar se `renderRouter` ligou fake timers |
| `not wrapped in act(...)` | Update assíncrono depois do teste; filho com efeito assíncrono | `await findBy`; bisseção por remoção; mock global |
| `Cannot find module` num `jest.mock` | Alias/caminho relativo errado | Corrigir **e rodar de novo** (erros se escondem) |
| Teste passa "e parece não testar nada" | Sem matcher · `not.toHaveBeenCalled` cedo · marcador não único | Quebrar de propósito |
| Passa isolado, falha na suíte (ou vice-versa) | Estado compartilhado: singleton, mock sem clear, timers | `beforeEach` de reset; checar escopo do arquivo |
| `Validation Error` ao iniciar o Jest | Caminho de setup inexistente | Conferir `setupFiles*` |
| Jest verde, app quebrado | Fake infiel · tipos não checados | Comparar fake × real; `tsc --noEmit` |

## 8.2 Checklist de revisão de um teste

- [ ] Afirma **o que o usuário vê/consegue fazer**, não estado interno?
- [ ] Já foi visto **falhando** ao menos uma vez?
- [ ] Todo `expect` tem matcher? "Não aconteceu" vem **depois** de esperar algo?
- [ ] Query pela prioridade (role/label/placeholder/texto) — `testID` só se preciso, sem colisão?
- [ ] Espera correta: `findBy`/`waitFor` (só asserções) ou `act` — nunca `setTimeout` cru?
- [ ] No unitário, afirma só o que cruza a **fronteira**? No de integração, usa fakes **pelas portas**?
- [ ] O fake valida **tanto quanto** o real? (senha, serialização, busca)
- [ ] Marcador de tela único e **ausente** no estado de origem?
- [ ] Estado compartilhado é limpo no `beforeEach`? Timeouts customizados foram revertidos?
- [ ] O nome é uma frase que descreve **o que o corpo verifica**?

## 8.3 O que fazer quando… (decisão rápida)

| Preciso… | Faça |
|---|---|
| Testar uma regra isolada de hook | `renderHook` + `jest.mock` do que ele importa |
| Testar um componente com Provider | `renderComponent` (wrapper de teste) |
| Provar que algo foi chamado | `jest.fn()` — e `clearAllMocks` no `beforeEach` |
| Testar um fluxo entre telas | `renderApp` + `renderRouter`, infra fake pelas portas |
| Pular o login em testes de outra feature | Semear o storage (real) ou provider mockado (rápido, auth vira no-op) |
| Forçar erro/vazio/loading | `renderApp({ repositories })` (+ promise controlada para loading) |
| Isolar um componente nativo/assíncrono | Mock global, com `testID` prefixado |
| Testar variants/estilos de um componente | `it.each` + `toHaveStyle` com **tokens** do tema, um eixo por vez (4.6) |
| Achar o que a suíte não cobre | Cobertura de **branches** + `collectCoverageFrom` |
| Diagnosticar travamento | `jest.fn()` contando chamadas; trocar o módulo suspeito num teste descartável |

## 8.4 Teste-se

Responda **sem olhar**; confira no gabarito.

1. Por que `getByText("pontos turísticos")` não acha `Pontos Turísticos`, e quais são as 3 saídas?
2. Quando usar `getBy`, `queryBy` e `findBy`?
3. Por que `expect(onSubmit).not.toHaveBeenCalled()` logo após o `press` pode passar mesmo com dados válidos?
4. O que é um "marcador de tela" e qual a regra para escolhê-lo?
5. Por que a Home "some" das queries quando os detalhes estão por cima?
6. `fireEvent` × `userEvent`: o que cada um faz e qual exige fake timers?
7. Num teste de integração, por que `await new Promise(r => setTimeout(r, 400))` trava?
8. Teste trava sem mensagem e nem o `findBy` falha: qual a hipótese e como prová-la?
9. O que o `cloneDeep` evita no override de repository?
10. Por que o `DeepPartial` ingênuo aceita `findAll: "oops"`?
11. Três formas de começar autenticado — e o custo do provider mockado?
12. O singleton `inMemoryStorage` vaza entre testes: onde, e como evitar?
13. `setupFiles` × `setupFilesAfterEnv`: o que existe em cada fase?
14. Por que um mock com `testID` pode quebrar `getByTestId`?
15. Como testar o estado de loading de forma determinística?
16. 100% de cobertura garante que a funcionalidade está testada? Dê dois motivos contra.
17. Qual número de cobertura expõe cenários nunca exercitados?
18. Por que `collectCoverageFrom` *reduz* o percentual?
19. Por que um teste Jest verde convive com `tsc` vermelho?
20. O que é uma asserção acoplada ao "encanamento"? Dê o exemplo do RHF.
21. Por que o teste negativo de "senhas diferentes" precisa preencher os outros campos?
22. Diferença entre teste de **fiação** e de **regra de negócio**?
23. Por que corrigir um `jest.mock` com caminho errado não garante que o arquivo está sem outros erros iguais?
24. O fluxo de sign-in falha com "signed in: x" não encontrado e a tela mostra um toast de erro. Qual a primeira hipótese?
25. Quando **não** usar um mock global?

### Gabarito

1. `getByText` com string é exato e sensível a caixa. Saídas: corrigir a caixa; regex com `i` (mais frouxa, pode colidir); texto de fonte única compartilhado entre app e teste.
2. `getBy` para o que já está na tela (lança se não achar); `queryBy` para afirmar ausência (`null`); `findBy` para o que aparece após trabalho assíncrono (espera).
3. A chamada é assíncrona; naquele instante ela ainda não aconteceu. Só vale depois de aguardar algo que prove que o fluxo terminou, pareado com a mensagem de erro.
4. Elemento que prova em qual tela o usuário está. Deve existir **só** na tela esperada e estar **ausente** no estado de origem; complementar com `toHavePathname`.
5. A tela coberta fica `aria-hidden` e o RNTL ignora elementos ocultos por padrão (`defaultIncludeHiddenElements: false`).
6. `fireEvent` chama o handler direto (síncrono); `userEvent` simula a sequência real de eventos (async). O `userEvent` exige fake timers por causa dos delays internos.
7. `renderRouter` liga fake timers; o relógio fake não avança sozinho. Use `findBy`/`waitFor` (que avançam) ou `act(() => jest.advanceTimersByTime(ms))`.
8. Loop de render/efeito sufocando o event loop (ex.: deps por identidade). Prova: espião `jest.fn()` contando chamadas (258.933 vs 1) e/ou um mock descartável do módulo com a correção.
9. Evita o `merge` mutar o singleton `InMemoryRepository`, vazando a falha injetada para os testes seguintes do arquivo; o clone preserva o prototype.
10. Para membros função, `T[P] extends object` é verdadeiro e o tipo colapsa num `{}` que aceita qualquer coisa; a correção preserva funções antes de recursar.
11. Login pela UI (fiel, lento); semear o storage (hidratação real, acopla à chave); provider mockado (rápido, sem storage, mas `saveAuthUser`/`removeAuthUser` viram no-op — "Sair" não desloga).
12. Só dentro do mesmo arquivo (cada arquivo tem seu registro de módulos). `beforeEach(() => inMemoryStorage.clear())`.
13. `setupFiles`: antes do framework — `expect`/`beforeEach` são `undefined`, `jest` existe. `setupFilesAfterEnv`: depois — tudo disponível; é o padrão para hooks/matchers.
14. O mock entra no mesmo namespace de `testID` do produto; se o produto já usa o mesmo id, `getByTestId` lança "múltiplos elementos". Prefixar o id do mock.
15. Fazer o fake devolver uma promise cujo `resolve` o teste controla: assertar o loading, resolver dentro de `act`, assertar o estado final e que o loading sumiu.
16. Não. (a) Conta execução, não verificação — coberto ≠ afirmado; (b) mock zera a cobertura do real; unitário todo mockado dá 100% sem provar integração.
17. A cobertura de **branches**.
18. Porque inclui os arquivos que nenhum teste carregou (a 0%) e remove stubs (como as imagens contadas como cobertas): o número fica menor e honesto.
19. O Babel remove os tipos antes de rodar; o Jest não checa tipos. É preciso rodar `tsc --noEmit` à parte.
20. Afirmar um detalhe incidental do framework em vez do contrato: `toHaveBeenCalledWith(dados, undefined)` amarra o teste ao fato de `fireEvent.press` não passar evento (o 2º argumento do `onValid` do RHF é o evento). Prefira `mock.calls[0][0]` com `toMatchObject`.
21. O `.refine()` do objeto no Zod só roda se o parse interno não abortar; campo `undefined` aborta, então o erro de senha nunca apareceria. Além disso, isola uma única causa possível de falha.
22. Fiação prova que a prop/callback chega ao componente certo (ex.: `disabled` repassado ao `TouchableOpacity`); regra de negócio prova lógica própria do componente.
23. Os `jest.mock` são avaliados em ordem e o primeiro erro interrompe o arquivo; os demais não chegam a ser avaliados. Rode de novo após cada correção.
24. O usuário não existe na fixture do repository em memória (`user not found`) — ou o e-mail digitado difere do esperado. Leia a árvore impressa na falha.
25. Quando algum teste precisa ver o comportamento real daquilo, ou quando o mock esconde algo que a suíte deveria verificar — mock global só para o nativo/assíncrono/irrelevante.

## 8.5 Exercícios práticos (num projeto novo, sem copiar este)

1. **Setup do zero.** App Expo novo: `expo install` das libs, `preset`, `types: ["jest"]`, `collectCoverageFrom`; um teste de função e um de componente. *Pronto quando* `jest --coverage` lista arquivos que nenhum teste importa.
2. **Falhe de propósito.** Pegue 3 testes e quebre cada um de um jeito (valor esperado, lógica comentada, mensagem errada). *Pronto quando* cada falha tem uma mensagem útil — e você anotou algum teste que **não** falhou (falso positivo).
3. **Formulário com validação.** Form com React Hook Form + Zod; 1 teste feliz e 3 negativos, **cada um isolando um campo**, com `findBy` e a ordem correta do `not.toHaveBeenCalled`.
4. **Mock de componente nativo.** Ache um componente que gera aviso de `act`; faça a bisseção por remoção; crie um mock global com `testID` prefixado; escreva um teste que afirma **qual** componente foi renderizado.
5. **Fluxo de integração.** Monte `renderApp` com 3 rotas; teste login → home → logout com o provider real. Depois faça o mesmo começando autenticado por **seed** e por **provider mockado**, e compare tempo, acoplamento e o que cada um deixa de cobrir.
6. **Injeção de falha.** Implemente `renderApp({ repositories })` com `cloneDeep` + `merge` e um `DeepPartial` que preserva funções (prove com 4 casos de tipo). Teste erro, vazio e loading (promise controlada) **e uma transição** erro → sucesso.
7. **Caça ao bug.** Introduza de propósito um loop de efeito (deps por identidade) num hook e diagnostique **só com `jest.fn()`**. *Pronto quando* você conta as chamadas e corrige.
8. **Auditoria de cobertura.** Rode `--coverage`; para 3 arquivos em 0%, classifique "sem teste" × "mockado" e escreva o teste que falta. Olhe os *branches* de um arquivo e escreva um cenário para cada um não exercitado.
9. **Variants do seu componente.** Pegue um componente-base com variants (Button, Badge, Card); escreva a tabela `it.each`, o default, **um** estado derivado e a precedência do `style`; prove que a asserção discrimina com um `not.toHaveStyle`. *Pronto quando* trocar o token de uma variant quebra o teste certo — e trocar o hex do token não quebra nada.

---

## Snapshot (a estudar)

*(Aula 17 — ainda não estudada. Reservado para: quando um snapshot evita regressão visual não intencional e quando vira ruído — snapshot grande que ninguém revisa de verdade antes de aceitar —, e como ele se relaciona com os testes de estilo da seção 4.4.)*

## Glossário

- **Pirâmide de testes:** muitos testes rápidos e isolados na base, poucos E2E lentos no topo.
- **Testar como o usuário usa:** consultar a UI pelo que é percebido (role, label, texto), nunca por estado interno.
- **Fronteira do componente:** contrato de entrada/saída (props, callbacks, renderização); o unitário afirma só o que a cruza.
- **Porta / adapter / Composition Root:** interface que o app conhece, implementação trocável, e o único ponto que as escolhe — aqui, também o ponto onde o teste injeta fakes.
- **Teste de fiação × de regra de negócio:** o primeiro prova que algo chega ao lugar certo; o segundo, lógica própria.
- **`getBy`/`queryBy`/`findBy`:** presente (lança) · ausente (`null`) · assíncrono (espera).
- **Elementos ocultos:** ignorados por padrão pelas queries do RNTL 13; `includeHiddenElements: true` desfaz por consulta.
- **Marcador de tela:** elemento que prova em qual tela o usuário está — único na tela esperada e ausente na de origem.
- **`testID` derivado / namespace:** ids gerados a partir de props (tratar ausência) e prefixos para que mocks não colidam com o produto.
- **`fireEvent` × `userEvent`:** handler direto (síncrono) × sequência real de eventos (async, fake timers).
- **`act` / warning de `act`:** processa atualizações de estado; o aviso indica update que chegou depois do teste.
- **`waitFor`:** repete uma asserção até passar ou estourar o timeout; só asserções dentro.
- **Fake timers (`renderRouter`):** relógio controlado pelo Jest; `setTimeout` cru não dispara, `findBy`/`waitFor` o avançam, `advanceTimersByTime` o move à mão.
- **Promise controlada (deferred):** o fake devolve uma promise cujo `resolve` o teste guarda — torna estados transitórios determinísticos.
- **`jest.mock` (hoisted):** substitui o módulo inteiro; içado antes dos imports; a fábrica não referencia variáveis de fora; o caminho segue as mesmas regras de alias de um import.
- **`setupFiles` × `setupFilesAfterEnv`:** antes × depois do framework de teste (sem × com `expect`/`beforeEach`).
- **Mock global:** registrado no setup para toda a suíte; esconde o comportamento real e divide namespace com o produto.
- **`cloneDeep` + `merge` (override por teste):** copia o repository e troca só os métodos desejados, sem mutar o singleton.
- **`DeepPartial` que preserva funções:** checa o fake contra o contrato real; a versão ingênua colapsa funções em `{}`.
- **Provider mockado:** `Context.Provider` com valor pronto — rápido, mas o código real do provider não executa e suas ações viram no-op.
- **Semear estado:** gravar na storage de onde o app hidrata, em vez de percorrer a UI até lá.
- **Teste de transição:** vai de um estado a outro (erro → sucesso); pega defeitos de máquina de estados que testes de estado isolado não pegam.
- **Coberto ≠ afirmado:** um ramo pode estar coberto porque todo teste passa por ele sem que nenhum o verifique.
- **`collectCoverageFrom`:** glob que inclui no relatório os arquivos nunca carregados (0%) e exclui assets.
- **Loop de efeito por identidade:** `useEffect(fn, [arrayNovoACadaRender])` reexecuta a cada render; com dados instantâneos o sintoma é um travamento, não uma asserção vermelha.
- **Bisseção por remoção:** comentar/substituir filhos até o sintoma sumir, para localizar a causa.
- **Jest não checa tipos:** Babel remove os tipos; verde convive com `tsc` vermelho.

## Mapa aula → seção

| Aula | Tema | Seções |
|---|---|---|
| 1 | Pirâmide, filosofia RNTL, testabilidade via DI | 0, 1.1 |
| 2 | Setup do Jest com Expo | 1.2 |
| 3–4 | RNTL: `describe`/`it`, `screen`, `getBy`, regex, `fireEvent`, AAA, falhar de propósito, `testID` | 1.3, 2.1–2.5 |
| 5 | `userEvent`, fake timers | 3.1, 3.3 |
| 6 | Render customizado, `jest.fn()` | 4.2, 4.3 |
| 7 | `renderHook`, `jest.mock`, aliases | 4.3 |
| 8 | Cobertura, `clearAllMocks` | 1.3, 6.1 |
| 9–10 | `SignUpForm`: fronteira, `waitFor`, negativos, estilo (+ exemplo de variants de `Button`) | 3.2, 4.1, 4.4, 4.6 |
| 11 | Integração com Expo Router | 5.1, 5.2 |
| 12 | Fluxo sign-in/sign-out, cobertura, loop achado | 5.5, 6.1, 6.2 |
| 13 | Home autenticada, fake timers, debugger | 3.3, 5.3, 6.2 |
| 14 | Home → detalhes: ler uma falha, ocultos, marcador | 2.3, 2.4, 6.2 |
| 15 | Erro/loading/vazio, override de repository | 3.4, 5.4, 5.5, 6.1 |
| 16 | Mocks globais | 4.5 |
| 17 | Snapshot | *a estudar* |
