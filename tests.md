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

```tsx
it("should display the correct count number", () => {
  render(<Component label="hello world" loading={false} />);
  expect(screen.getByText(/Pressed:0/)).toBeOnTheScreen();      // Arrange + assert do estado inicial
  fireEvent.press(screen.getByTestId('label-button'));          // Act
  expect(screen.getByText(/Pressed:1/)).toBeOnTheScreen();      // Assert do estado final
});
```

**Arrange → Act → Assert, com assert dos dois lados da mudança:** checar o estado antes *e* depois da interação (não só depois) é o que garante que o teste está testando a transição, não só um valor final que poderia já estar ali por outro motivo. "Colocar mais de um `expect`" não é redundância — é o que prova que o clique *causou* a mudança de `Pressed:0` pra `Pressed:1`, e não que o componente já nasceu em `1`.

**O que `fireEvent` faz por baixo dos panos, e por que isso importa:** `fireEvent.press(el)` chama a prop `onPress` do elemento **diretamente** — não simula a sequência real de toque que um dedo produziria (`onPressIn` → delay → `onPressOut` → `onPress`). Pra testar contagem de clique isso é suficiente; pra qualquer lógica amarrada aos eventos intermediários (feedback visual de "pressionando", debounce de toques rápidos, gestos), `fireEvent` não é fiel o bastante — é exatamente a lacuna que `userEvent` (aula 5) fecha, simulando a sequência completa em vez de ir direto ao handler final.

### Fazer o teste falhar de propósito — o exercício mais importante desta aula

Antes de confiar num teste que passa, vale **quebrá-lo de propósito** uma vez: trocar `Pressed:1` por `Pressed:2` no assert, ou comentar o `setCount` no componente, rodar o teste, e confirmar que ele **falha** com uma mensagem que faz sentido. Se um teste "passa" mesmo com a lógica errada, ele é um falso positivo — pior que não ter teste nenhum, porque dá a sensação de cobertura sem entregar nenhuma. Isso não é uma etapa opcional de aprendizado, é uma disciplina pra manter no dia a dia: todo teste novo deveria, em algum momento antes de ser commitado, ser visto falhando pelo menos uma vez.

### `testID`: por que apareceu justo aqui, e por que é o último recurso

```tsx
<Pressable testID="label-button" onPress={() => setCount((p) => p + 1)}>
  <Text>{label}</Text>
</Pressable>
```

`getByTestId` só entrou em cena quando o teste precisou **disparar** uma interação, não só **ler** um texto. `fireEvent` dispara o handler do elemento exato que você passa a ele — e o `onPress` está no `Pressable`, não no `Text` que `getByText('hello world')` retorna. Sem `testID`, não haveria como pegar uma referência ao `Pressable` diretamente por texto ou role, porque ele não expõe nenhum dos dois (não tem `accessibilityRole`, o texto pertence ao filho).

Na ordem de prioridade do Testing Library (a mesma na versão web e na RNTL — por role, depois label, depois texto, ... `testID` por último), `testID` é o recurso de quando nenhuma consulta "como o usuário enxerga" resolve o elemento. Aqui resolveria diferente: dar `accessibilityRole="button"` ao `Pressable` e trocar por `getByRole('button', { name: 'hello world' })` — mais alinhado ao princípio da aula 1 ("testar como o usuário usa"), e sem precisar de nenhum atributo que só existe pro teste.

**Nota sobre o regex desta aula:** `/Pressed:0/` e `/Pressed:1/`, sem `i` e sem nenhum caractere especial pra escapar — diferente do regex da aula 3, aqui não tem pegadinha, é regex por hábito/consistência com o teste anterior, não por necessidade (uma string exata `'Pressed:0'` funcionaria igual, já que o texto renderizado é exatamente isso). Vale reconhecer a diferença: às vezes regex resolve um problema real (aula 3), às vezes é só estilo — e tudo bem, contanto que se saiba qual dos dois casos é.

### `userEvent`: a simulação de verdade, e por que ela precisa de fake timers

```tsx
describe('Component', () => {
  beforeAll(() => { jest.useFakeTimers(); });
  afterAll(() => { jest.useRealTimers(); });

  it("should display reset the count when press the reset text 2", async () => {
    render(<Component label="Hello World" loading={false} />);
    expect(screen.getByText(/Pressed:0/i)).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.press(screen.getByText("Hello World"));
    await user.press(screen.getByText("Hello World"));
    await user.press(screen.getByText("Hello World"));
    await user.press(screen.getByText("Hello World"));

    expect(screen.getByText(/Pressed:4/i)).toBeOnTheScreen();
  });
});
```

**Mecanismo:** `userEvent.press` (por isso o `await`) simula a sequência real de eventos nativos que um toque produz — não só chama `onPress`, como `fireEvent`. Essa simulação usa temporizadores internos (delays entre os eventos da sequência), e é exatamente por isso que fake timers aparecem **na mesma aula**: sem `jest.useFakeTimers()`, esses delays seriam tempo real (o teste ficaria mais lento, ou preso esperando timers que nunca disparam no ambiente de teste). Com o relógio fake, o Jest controla/avança esse tempo internamente, e a simulação roda determinística e rápida. `fireEvent` não precisa disso porque não tem delay nenhum — vai direto ao handler.

**`fireEvent` e `userEvent` não competem — coexistem, com propósitos diferentes.** `fireEvent` continua válido pra testar a transição de estado em si (mais simples, síncrono); `userEvent` vale quando a fidelidade da sequência de interação importa. Trocar `fireEvent` por `userEvent` em todo teste não é upgrade automático — é mais setup (`await`, timers) por uma fidelidade que nem todo teste precisa.

**Sobre "só funciona em componentes base" — precisão que vale ajustar:** não é uma lista fechada de nomes (`Pressable`, `Text`); é que `userEvent` opera sobre o **elemento host/nativo** no fundo da árvore renderizada — o nó real que o RN sabe como receber toque. Qualquer componente customizado (um `Button` de design system, por exemplo) funciona normalmente com `userEvent`, contanto que ele acabe renderizando, no fim das contas, um primitivo nativo interativo (`Pressable`/`View`/`TextInput`) — o que é o caso de praticamente todo componente de UI em RN. A API é nova (chegou bem depois do `fireEvent`, espelhando o `@testing-library/user-event` da versão web) e cada método dela é específico do primitivo que simula — `.press()` faz sentido num elemento pressionável, `.type()` só faz sentido num `TextInput`.

**Escopo de `beforeAll`/`afterAll`:** os fake timers aqui valem pro `describe` **inteiro**, não só pro teste que usa `userEvent` — os testes anteriores com `fireEvent` também rodam sob timer fake (inofensivo pra eles, já que não usam timer nenhum). Diferente de `beforeEach`/`afterEach` (que rodariam a cada teste), `beforeAll`/`afterAll` rodam uma vez só, no início/fim de todo o arquivo — se um teste *depois* deste precisasse de timers reais, precisaria de seu próprio `jest.useRealTimers()` explícito, porque o `afterAll` só desfaz no final.

> **Achado real, tipo "falso positivo" ao contrário — nome de teste que não corresponde ao que ele testa:** `it("should display reset the count when press the reset text 2", ...)` descreve um reset ao pressionar o texto "reset" — mas o corpo do teste pressiona o **label** ("Hello World") quatro vezes e verifica a contagem **subindo** até 4, nunca toca no texto de reset. O `" 2"` no final sugere um nome duplicado copiado às pressas. O teste em si está correto (verifica acúmulo real de cliques) — o problema é só a descrição, mas isso importa: quando esse teste falhar um dia, quem ler a mensagem vai procurar bug no reset, não na contagem — o mesmo tipo de dano da aula 4 (confiar em algo que não é verdade), só que na legibilidade do teste, não na lógica dele.

## 5. Render customizado: injetando os mesmos Providers da produção

**Padrão oficial da própria Testing Library (web e RN têm a mesma receita na doc), não invenção deste projeto:**

```tsx
// src/test-utils/renderComponent.tsx
const AllTheProviders = ({ children }: React.PropsWithChildren) => (
  <ThemeProvider theme={theme}>{children}</ThemeProvider>
);

export const renderComponent = (
  component: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(component, { wrapper: AllTheProviders, ...options });
```

**O mecanismo, agnóstico de qualquer projeto:** todo `render` de Testing Library (web ou RNTL) aceita uma opção `wrapper` — um componente que envolve a UI testada antes de montar. Um render customizado nada mais é do que uma função que **já fixa esse `wrapper`** com todos os Providers que a árvore real usa (tema, i18n, store, autenticação, o que for), pra cada arquivo de teste não precisar reescrever `<ThemeProvider><QueryClientProvider><AuthProvider>...` toda vez que testar um componente que depende de algum desses contextos.

**`AllTheProviders` cresce conforme os testes exigem, não antecipado.** Hoje só tem `ThemeProvider`, porque `Button`/`Text` só dependem de tema. Quando a suíte passar a testar algo que usa `useRepository()`/`useFeedbackService()`/`useAuth()`, os Providers correspondentes entram na mesma função — um único lugar centraliza "quais contextos qualquer componente pode precisar em teste", espelhando o Composition Root de produção (mesma ideia, papel diferente: lá monta o app real, aqui monta o app de teste).

**`Omit<RenderOptions, "wrapper">` — travar de propósito uma opção da lib de terceiro:** em vez de redeclarar as opções de `render` à mão, o tipo reaproveita `RenderOptions` da própria lib e remove só o campo que este projeto já decidiu (`wrapper`) — quem chama `renderComponent` pode passar qualquer outra opção do `render` original, mas não pode sobrescrever os Providers por acidente. É uma técnica de TS reaproveitável em qualquer wrapper de API de terceiro: pegar o tipo da lib, tirar só o que você está assumindo a responsabilidade de decidir.

### `jest.fn()` — testando se algo foi chamado, não o que apareceu na tela

```tsx
it("should NOT call the onPress function when it is disabled", () => {
  const onPressFn = jest.fn();
  renderComponent(<Button title="button title" onPress={onPressFn} disabled />);
  fireEvent.press(screen.getByText("button title"));
  expect(onPressFn).not.toHaveBeenCalled();
});
```

Diferente de todos os testes anteriores (que verificavam texto/estado renderizado), aqui a asserção é sobre **uma função ter sido chamada ou não** — `jest.fn()` cria uma função "espiã" que registra cada chamada, permitindo perguntar depois "isso rodou?", "quantas vezes?", "com quais argumentos?". É outro estilo de prova, complementar ao de tela: às vezes o que importa não é o que renderizou, é se um callback foi ou não disparado.

**O que esse teste específico prova, e o que ele não prova:** `disabled` chega em `Button` só porque `ButtonProps` estende as props nativas do `TouchableOpacity` por baixo — o componente não tem nenhuma lógica própria de "se desabilitado, não chama". Quem trata isso é o `TouchableOpacity` do React Native, de graça, assim que a prop é repassada adiante. O teste é válido (garante que ninguém quebre esse repasse numa refatoração futura), mas vale reconhecer a diferença: ele testa **fiação** (a prop chega até o componente nativo certo), não uma **regra de negócio própria** — não existe, por exemplo, nenhum feedback visual de "desabilitado" sendo testado aqui (nem implementado ainda). Duas confianças diferentes, ambas legítimas, mas não a mesma coisa.

### Achado real: nome de pasta inconsistente que só não quebra por sorte de regra

Os testes de `Button`/`Text` ficam em `src/ui/components/__test__/` — **singular**. Os testes anteriores ficam em `src/__tests__/` — **plural**. O `testMatch` padrão do Jest tem duas regras independentes: uma exige literalmente uma pasta `__tests__/` (plural); a outra aceita qualquer arquivo terminado em `.test.ts(x)`, em qualquer pasta. Os arquivos em `__test__/` (singular) só são encontrados pela **segunda** regra (o sufixo do nome do arquivo), não pela primeira — funcionam, mas por um caminho diferente do resto do projeto. Não é um bug (nada quebra agora), mas é o tipo de inconsistência que compensa padronizar antes que alguém, um dia, crie um arquivo sem o sufixo `.test.` dentro de `__test__/` esperando que a pasta sozinha baste — e ele simplesmente não vai rodar, silenciosamente.

**Evolução natural pra quem quiser ir além do que este projeto fez:** o padrão mais completo de "custom render" (documentado assim na própria Testing Library) não só define um `render` customizado — também **reexporta tudo** da lib de teste a partir do mesmo módulo (`export * from '@testing-library/react-native'`), pra nenhum arquivo de teste precisar importar de dois lugares (o `render` customizado de um lado, `screen`/`fireEvent` do outro) e correr o risco de alguém importar o `render` cru por engano. Este projeto optou pela versão mais simples (uma função a mais, chamada com outro nome) — funciona igual, só exige mais disciplina de quem escreve o teste pra lembrar de usar `renderComponent` em vez do `render` direto quando o componente precisa de Provider.

## 6. Testando hooks e mocks com Jest

```ts
jest.mock("@/src/infra/repositories/RepositoryProvider", () => ({
  useRepository: () => ({ auth: { signIn: mockSignIn } }),
}));

const { result } = renderHook(() => useAuthSignIn());
await act(async () => {
  await result.current.mutate({ email: "...", password: "..." });
});
expect(mockSignIn).toHaveBeenCalledWith("...", "...");
```

**`renderHook`:** testa um hook isolado, sem precisar de um componente visual em volta — monta o hook, expõe o retorno em `result.current`, e cada chamada que muda estado precisa ficar dentro de `act(...)` (é o que faz o React "processar" a atualização antes do próximo assert rodar).

**`jest.mock(caminho, fabrica)` troca o módulo inteiro que o hook importa**, não só uma função dele. Diferente do render customizado (seção 5), que injeta uma implementação via Provider igual à produção faria, aqui o teste intercepta a própria importação — útil quando o hook não recebe a dependência por parâmetro/Context de forma fácil de trocar em teste, ou quando o objetivo é isolar 100% de qualquer efeito colateral real (chamada de rede, storage) sem precisar montar Provider nenhum.

### Um bug real, e o porquê exato por trás dele

Erro reportado:
```
Cannot find module '@src/infra/repositories/RepositoryProvider' from '...useAuthSignIn.test.ts'
```

Causa: `@src/...` (sem barra depois do `@`) em vez de `@/src/...` — o alias configurado no projeto é `"@/*": ["./*"]` (`tsconfig.json`), e todo o resto do código usa exatamente esse prefixo com a barra.

**O porquê, não só o "troque a string":** este projeto não tem `moduleNameMapper` no config do Jest, e mesmo assim `@/src/...` resolve normalmente em outros arquivos de teste — porque `babel-preset-expo` lê os `paths` do `tsconfig.json` e faz a troca de prefixo **em tempo de transformação**, antes do resolvedor de módulos do Jest sequer ver o caminho. Essa substituição é literal: reconhece o prefixo `@/` exatamente como está escrito, e troca por `./`. `@src/...` não bate com esse prefixo — passa direto, sem ser tocado, e cai no resolvedor padrão do Node, que tenta achar um pacote chamado `@src` dentro de `node_modules`. Não existe, daí o "Cannot find module". Não é bug de configuração do Jest — é um typo que escapa da regra de substituição por um caractere.

**A parte que vale mais a lição:** corrigir esse `jest.mock` sozinho **não** era o bug inteiro. O mesmo arquivo tinha mais dois caminhos errados nos outros dois `jest.mock`:
- `@/src/infra/feedbackService/FeedbackProvider` → o arquivo real está em `@/src/infra/services/feedback/FeedbackProvider` (pasta errada).
- `../../AuthContext` → de dentro de `src/domain/Auth/__test__/`, `AuthContext.tsx` está só **uma** pasta acima, não duas (`../AuthContext`).

O motivo de só o primeiro erro aparecer: as três chamadas de `jest.mock` são processadas (hoisted) antes de qualquer teste rodar, em ordem — a primeira que falha interrompe o arquivo inteiro ali, e as outras duas nunca chegam a ser avaliadas. **Regra prática pra depurar `jest.mock` com vários caminhos:** corrigir um erro de módulo não garante que o arquivo está livre de outros iguais — rode de novo depois de cada correção, não assuma que "resolveu o erro" significa "resolveu o arquivo".

## 7. Cobertura de código: o que o número não diz

```
npx jest --coverage
```
```
File                                | % Stmts | % Branch | % Funcs | % Lines
useAuthSignIn.ts                    |     100 |      100 |     100 |     100
FeedbackProvider.tsx                |       0 |        0 |       0 |       0
IFeedbackService.ts                 |       0 |        0 |       0 |       0
adapters/Alert/AlertFeedback.tsx    |       0 |      100 |       0 |       0
adapters/Toast/ToastFeedback.ts     |       0 |      100 |       0 |       0
```

`useAuthSignIn.test.ts` passa, com dois cenários (sucesso e erro), e o hook que ele testa direto mostra 100%. Mas o `FeedbackProvider` e todos os adapters de `IFeedbackService` aparecem em **0%** — não porque ninguém pensou neles, mas porque o teste faz `jest.mock("@/src/infra/services/feedback/FeedbackProvider", ...)`: o módulo real nunca roda, só o mock roda. Coverage conta **linha executada**, não "funcionalidade coberta" — um módulo inteiramente substituído por mock nunca vai aparecer coberto, por mais que o comportamento dele esteja sendo simulado corretamente pelo mock.

### Dois motivos pra um arquivo aparecer em 0%, e são coisas diferentes

1. **Ninguém escreveu teste pra ele ainda** (`useAuthSignOut.ts`, `useAuthSignUp.ts`, `useAuthSendResetPasswordEmail.ts` — 0% real, sem mock envolvido). Leitura direta: falta teste.
2. **Foi mockado por um teste que testa outra coisa** (`FeedbackProvider`, `AlertFeedback`, `ToastFeedback` — 0% porque `useAuthSignIn.test.ts` os substitui de propósito). Leitura errada: "falta teste de feedback". Leitura certa: falta um teste **dedicado** aos adapters de feedback (ex.: confirmar que `AlertFeedback.send` chama `Alert.alert` com os argumentos certos) — coisa que o teste de `useAuthSignIn` nunca teve a intenção de cobrir, porque isolar a unidade é o objetivo dele.

**A lição central, agnóstica de qualquer stack:** o número de coverage é um mapa de "o que rodou durante os testes", não de "o que está correto" nem de "o que está integrado de ponta a ponta". Dá pra ter 100% de cobertura numa função com um `expect(true).toBe(true)` solto, e 0% numa peça que já está perfeitamente exercitada por outro conjunto de testes (integração, E2E) que o relatório de coverage daquele arquivo isolado não enxerga. Coverage serve pra **achar buracos óbvios** (arquivo sem teste nenhum) — não serve pra provar corretude, e um número alto não substitui ler quais asserções de fato existem.

### `beforeEach(() => jest.clearAllMocks())` — por que os mocks vazam entre testes sem isso

```ts
const mockSendFeedback = jest.fn(); // criado uma vez, no escopo do arquivo

beforeEach(() => {
  jest.clearAllMocks(); // zera o histórico de chamadas antes de CADA teste
});
```

`mockSignIn`/`mockSendFeedback`/`mockSaveAuthUser` são criados **uma vez**, fora de qualquer `it`/`test` — o mesmo `jest.fn()` é reaproveitado no arquivo inteiro. Sem limpar entre testes, o histórico de chamadas (`toHaveBeenCalledWith`, contagem de chamadas) do primeiro teste continua ali quando o segundo roda, e um `toHaveBeenCalledTimes(1)` no segundo teste veria 2 chamadas (uma de cada teste) — falha (ou, pior, passa por engano se a asserção não for específica o bastante). `beforeEach` (roda antes de **cada** teste, diferente do `beforeAll` da aula 5, que roda uma vez só) é o que garante isolamento: cada teste começa com um mock "zerado", sem carregar histórico do teste anterior.

**Três primos que fazem coisas parecidas, mas não iguais — vale saber qual usar:**
- `clearAllMocks()`: zera só o histórico de chamadas (`mock.calls`) — mantém qualquer `mockResolvedValueOnce`/`mockImplementation` já configurado **fora** do próprio teste. É o certo aqui, porque os retornos (`mockResolvedValueOnce`, `mockRejectedValueOnce`) são configurados dentro de cada `it`, não precisam sobreviver entre testes.
- `resetAllMocks()`: faz o que `clearAllMocks` faz e **também** zera a implementação de volta a um mock vazio — quebraria um fluxo que dependesse de uma implementação padrão configurada uma vez fora dos testes individuais.
- `restoreAllMocks()`: só importa pra mocks criados com `jest.spyOn` — devolve a implementação **original** (não mockada) da função espionada.

## 8. Teste de componente real: formulário, estilo e erro

```tsx
it('should submit the form when all fields are filled in correctly', async () => {
  const onSubmitMock = jest.fn();
  renderComponent(<SignUpForm onSubmit={onSubmitMock} />);

  fireEvent.changeText(screen.getByTestId('fullname-input'), "Gabriel Jesus");
  fireEvent.changeText(screen.getByTestId('email-input'), "gabriel.jesus@example.com");
  fireEvent.changeText(screen.getByTestId('password-input'), "password123");
  fireEvent.changeText(screen.getByTestId('confirm-password-input'), "password123");
  fireEvent.press(screen.getByTestId('submit-button'));

  await waitFor(() => {
    expect(onSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({ fullname: "Gabriel Jesus", email: "gabriel.jesus@example.com", password: "password123" }),
      undefined // ← o comentário original dizia "onInvalid callback"; está errado (ver abaixo)
    );
  });
});
```

### A fronteira do componente: o conceito central desta aula

A **fronteira** de um componente é o seu contrato de entrada e saída: o que ele recebe (props) e o que ele devolve pra fora (callbacks chamados, o que renderiza). `SignUpForm` recebe `onSubmit` e, quando o usuário preenche tudo certo e aperta o botão, chama `onSubmit` com os dados. **Só isso é o contrato dele.** O teste olha exatamente pra isso — e nada além.

| Dentro da fronteira (teste unitário, esta aula) | Fora da fronteira (teste de integração, aulas 11-14) |
|---|---|
| `onSubmit` é chamado com os dados certos | `useAuthSignUp` realmente cadastra o usuário |
| Campos preenchidos chegam no payload | O toast de sucesso aparece |
| — | A tela volta pro login (`router.back`) |

Esse recorte espelha a decisão de design da seção 10 do `auth-forms.md` ("formulário como caixa-preta, a tela só conhece `onSubmit`"): o componente foi **desenhado** com uma fronteira estreita, e o teste respeita essa mesma fronteira — não inspeciona o estado interno do React Hook Form nem espera efeitos que quem consome o `onSubmit` produz. Um bom design de fronteira vira, quase de graça, um bom limite de teste.

**O critério portável pra decidir "unitário ou integração":** não é "quantos arquivos o teste toca". É "a asserção atravessa a fronteira do componente e passa a depender da responsabilidade de um colaborador?". `expect(onSubmitMock).toHaveBeenCalled...` não atravessa — o mock é o próprio colaborador, substituído. `expect(screen.getByText('cadastro feito com sucesso'))` atravessaria — dependeria de `useAuthSignUp`, do `FeedbackService` e do `Toast` funcionando juntos, o que é integração por definição.

### `waitFor`: por que o `expect` não pode rodar logo depois do `press`

```tsx
await waitFor(() => { expect(onSubmitMock).toHaveBeenCalledWith(...) });
```

`handleSubmit` do React Hook Form é **assíncrono**: no código-fonte dele, antes de chamar o seu `onSubmit` ele faz `await _runSchema()` (roda o resolver do Zod) e só depois `await onValid(fieldValues, e)`. Ou seja, quando `fireEvent.press` retorna, `onSubmit` **ainda não foi chamado** — um `expect` síncrono logo em seguida rodaria cedo demais e falharia, mesmo com o código correto (falso negativo).

`waitFor` re-executa o callback repetidamente até ele parar de lançar erro ou estourar o timeout (por padrão, na ordem de ~1s de limite e ~50ms entre tentativas). **Trade-offs pra guardar:**
- Um `waitFor` que **falha** só avisa depois do timeout inteiro — uma suíte com muitos testes quebrados fica lenta pra falhar.
- O callback é executado **várias vezes** — deve conter só asserções, nunca ações com efeito colateral (`fireEvent`, `press`), que se repetiriam a cada tentativa.
- Quando o que se espera é um **elemento aparecendo**, `await screen.findByText(...)` é o atalho idiomático (um `waitFor` + `getByText` já combinados). `waitFor` com `expect` é a forma certa quando o alvo é um callback/mock, como aqui.

### Achado: o comentário `onInvalid callback` está errado — e a asserção ficou colada num detalhe incidental

O segundo argumento `undefined` não é o `onInvalid` do RHF. Conferido no código do RHF: `SubmitHandler<T> = (data: T, event?: BaseSyntheticEvent) => ...` e a chamada é `await onValid(fieldValues, e)` — o segundo argumento é o **evento do press**. É `undefined` porque `fireEvent.press` chama `onPress` sem objeto de evento. Consequências:

- Num dispositivo real, ou com `userEvent.press` (que gera um evento de verdade), esse argumento seria um objeto — e a asserção quebraria sem nenhuma mudança de comportamento.
- A asserção está acoplada a um **detalhe de plumbing do framework**, não ao contrato do componente (que é só "os dados").

Mais robusto — afirmar só o que cruza a fronteira, ignorando argumentos incidentais:
```tsx
expect(onSubmitMock).toHaveBeenCalledTimes(1);
expect(onSubmitMock.mock.calls[0][0]).toMatchObject({ fullname: "Gabriel Jesus", /* ... */ });
```

**`objectContaining` e o quarto campo:** o payload real tem quatro campos (inclui `confirmPassword`; quem reduz pra três é a tela, ver seção 13 do `auth-forms.md`), mas a asserção lista só três. Se alguém deixasse de enviar `confirmPassword`, o teste continuaria verde. É o trade-off clássico: matcher frouxo = menos frágil a mudanças, mas também menos capaz de pegar regressão. Numa fronteira que **é** o contrato, vale perguntar se o payload completo não deveria ser afirmado por inteiro.

### `testID` ×5 em código de produção — e a alternativa que também melhora acessibilidade

Foram adicionados cinco `testID` ao `SignUpForm` só pra o teste achar os elementos. Funciona, mas é o "último recurso" da aula 4, e aqui havia alternativas:
- `getByPlaceholderText('seu nome completo')` acharia cada input (o placeholder já é repassado ao `TextInput` nativo); `getByText('Criar conta')` acharia o botão.
- `getByLabelText('Nome completo')` — a opção mais alinhada ao "testar como o usuário usa" — **não funciona hoje**: o `TextInput` do projeto renderiza `label` como um `<Text>` irmão, sem ligá-lo ao input por `accessibilityLabel`.

Isso é uma lacuna de **acessibilidade**, não só de teste: um leitor de tela não anuncia "Nome completo" quando o campo recebe foco, porque nada associa o texto ao input. Passar `accessibilityLabel={label}` ao `RNTextInput` resolveria os dois problemas de uma vez. **Regra geral:** se um elemento não pode ser consultado pelo que o usuário percebe (label, texto, role), um usuário de tecnologia assistiva também não consegue percebê-lo — testabilidade e acessibilidade são, bem frequentemente, o mesmo problema.

### O que este teste não pega: caminho feliz apenas

Só existe o cenário "tudo válido → `onSubmit` chamado". Se o resolver do Zod fosse removido do formulário, esse teste continuaria passando — ele não consegue detectar um formulário permissivo demais. Pra ver este teste falhar (o exercício da aula 4) seria preciso quebrar o fluxo de dados, não a validação. É o teste do caminho **inválido** (senhas diferentes → `onSubmit` **não** chamado + mensagem de erro) que de fato fixa a validação — feito na aula 10, logo abaixo.

**Detalhe:** `fireEvent.changeText` define o valor final de uma vez, sem simular tecla por tecla (`userEvent.type` faria isso, com a mesma ressalva de `await` e fake timers da aula 5).

### Cenário de erro: o teste negativo e como ele precisa ser montado

```tsx
describe("should NOT submit form", () => {
  it("when the password and confirm password do not match", async () => {
    const onSubmitMock = jest.fn();
    renderComponent(<SignUpForm onSubmit={onSubmitMock} />);

    // tudo válido, EXCETO o campo sob teste
    fireEvent.changeText(screen.getByTestId("fullname-input"), "Lucas Garcez");
    fireEvent.changeText(screen.getByTestId("email-input"), "lucas@coffstack.com");
    fireEvent.changeText(screen.getByTestId("password-input"), "12345678");
    fireEvent.changeText(screen.getByTestId("confirm-password-input"), "another-password");
    fireEvent.press(screen.getByTestId("submit-button"));

    expect(await screen.findByText("senhas devem ser iguais"));
    expect(screen.getByTestId("confirm-password-input-container"))
      .toHaveStyle({ borderColor: theme.colors.fbErrorSurface });
    expect(onSubmitMock).not.toHaveBeenCalled();
  });
});
```

**Vermelho antes do verde (a aula 4 aplicada de verdade):** o roteiro da aula é escrever o teste, rodar, **vê-lo falhar**, e só então fazê-lo passar. A falha inicial vem de um motivo concreto e instrutivo: a primeira versão usava `getByText("senhas devem ser iguais")`, que falhou. Passar a mensagem errada de propósito, depois, confirma que o teste passa "pelo motivo certo".

**`getBy*` é síncrono; `findBy*` espera.** A mensagem de erro não existe logo após o `press` — ela só aparece depois que o resolver do Zod termina (a mesma causa do `waitFor` da aula 9: `handleSubmit` do RHF é assíncrono). `getByText` procura uma vez e lança se não achar; `findByText` re-tenta até aparecer ou estourar o timeout. Regra: `getBy` pro que já está na tela; `findBy` pro que aparece depois de trabalho assíncrono; `queryBy` (retorna `null` em vez de lançar) pra afirmar **ausência**.

**Isolar uma variável por teste negativo não é só arrumação — aqui é obrigatório (verificado).** Rodei o mesmo envio com três preenchimentos diferentes:

| Preenchimento | Mensagens exibidas |
|---|---|
| `fullname`/`email` **nunca tocados**, senhas diferentes | `campo obrigatório` ×2 — **sem** "senhas devem ser iguais" |
| `fullname`/`email` tocados porém inválidos (`"a"`, `"x"`) | `nome muito curto`, `email inválido` **e** `senhas devem ser iguais` |
| Tudo válido, só `confirmPassword` diferente | só `senhas devem ser iguais` |

O motivo está no Zod (conferi no fonte): o `.refine()` do objeto só roda se o parse interno não "abortou" — campo `undefined` gera erro de tipo (fatal, aborta o objeto), enquanto `min()`/`email()` são erros não fatais (o refine ainda roda). Moral pro teste: `undefined` e "string inválida" seguem caminhos diferentes no Zod, e um teste negativo que deixa campos intocados pode nunca chegar na regra que pretendia exercitar. Preencher todo o resto corretamente é o que garante que a falha tem **uma única causa possível**.

**A ordem do `not.toHaveBeenCalled()` é o que o torna significativo (verificado).** Ele aparece depois do `await findByText`. Se estivesse logo após o `press`, passaria **mesmo com dados válidos** — testei: com tudo válido, `expect(onSubmit).not.toHaveBeenCalled()` imediatamente após o `press` passa, e só depois o `waitFor` mostra que `onSubmit` foi chamado. Como a chamada é assíncrona, o "não foi chamado" daquele instante é vazio. **Regra:** uma asserção de "não aconteceu" em fluxo assíncrono só vale **depois** de aguardar algo que prove que o trabalho assíncrono terminou (aqui, a mensagem de erro aparecer). E vale parear com a mensagem específica — sozinho, "não foi chamado" tem muitas causas possíveis.

**`expect(await screen.findByText(...))` sem matcher funciona, mas por acidente de design.** Confirmei: com um texto inexistente a linha falha — porque `findByText` lança quando não acha, não porque o `expect` verifica algo. Um `expect(x)` sem `.toXxx()` não afirma nada; quem lê assume que afirma. `expect(await screen.findByText(...)).toBeOnTheScreen()` diz a intenção e é o que regras como `jest/valid-expect` exigem (o plugin não está instalado neste projeto — hoje nada acusa isso).

### Teste de estilo: `toHaveStyle`, o que ele pega e o que custa

Só afirmar o **texto** do erro não diz **onde** ele aparece. A aula demonstra: trocar o `path` do `.refine()` de `confirmPassword` para `password` faz a mensagem aparecer no campo errado, e o teste de texto continua verde — só a asserção de estilo no container do `confirmPassword` fica vermelha. Voltar o `path` faz passar.

```tsx
expect(screen.getByTestId("confirm-password-input-container"))
  .toHaveStyle({ borderColor: theme.colors.fbErrorSurface });
```

**O mecanismo:** `toHaveStyle` lê o `style` achatado do elemento e compara as propriedades pedidas. Com Restyle, `borderColor="fbErrorSurface"` (token) é resolvido pra um valor real no `View` por baixo — conferi: o estilo achatado tem `borderColor: "#D32F2F"`, e `not.toHaveStyle({ borderColor: "fbErrorSurface" })` passa (o nome do token não aparece). Usar `theme.colors.fbErrorSurface` na asserção amarra o teste ao **token** do design system. Isso detecta **fiação** (o token de erro está aplicado no elemento certo), mas não detecta um valor errado do próprio token — pra isso a asserção seria tautológica.

**A técnica de `testID` composto, e um bug que ela introduziu (verificado).** O `testID` vai pro `RNTextInput`, mas a borda vive no `Box` que o envolve. Em vez de criar uma prop nova por elemento, o `TextInput` deriva `testID={`${testID}-container`}` a partir da prop que já existia — um padrão pragmático e reaproveitável. Restrição: `getByTestId` lança se houver mais de um elemento com o mesmo id.

O problema: quando quem usa `TextInput` **não** passa `testID` (sign-in e reset-password não passam), o template vira a string literal `"undefined-container"` — renderizei dois `TextInput` sem `testID` e `getAllByTestId("undefined-container")` achou **dois** elementos com o mesmo id, em código de produção. Correção: `testID={testID ? `${testID}-container` : undefined}`. Lição geral: ao derivar um atributo de outro opcional, trate a ausência — interpolar um `undefined` não falha, vira texto.

**O trade-off, nas palavras da própria aula:** não abusar de teste de estilo — estilo muda o tempo todo e raramente é o que mais importa. O que vale cobrir primeiro é comportamento: o formulário **não** submete dado inválido; com erro, a chamada à API **não** é feita. Teste de estilo se justifica quando o estado visual **carrega significado** (indicar qual campo errou), e mesmo aí existe uma alternativa menos frágil que afirmar cor: afirmar **estrutura** com `within(elemento)` (a mensagem está dentro do bloco do campo certo). Aqui exigiria um `testID` no bloco externo, porque o texto de erro é irmão do container da borda, não filho dele.

### Organização: `describe` que viram frase

`describe("should NOT submit form")` + `it("when the email is invalid")` compõem a frase no relatório ("should NOT submit form when the email is invalid") — descrever **uma regra** e deixar cada `it` ser uma condição. Detalhe a ajustar neste arquivo: o segundo `describe` é irmão do `<SignUpForm />` (nível raiz), então no relatório os negativos perdem o nome do componente; aninhá-lo dentro de `<SignUpForm />` dá a hierarquia completa.

## 9. Testes de integração: telas inteiras via Expo Router

Integração = **várias partes reais trabalhando juntas; só o que sai do processo (rede, armazenamento nativo) é trocado.** O fluxo de auth foi escolhido por reunir quase tudo que vale integrar: formulário, caso de uso real (`useAuthSignIn`, sem mock) e navegação.

| | Unitário | Integração |
|---|---|---|
| Escopo | Um hook, componente ou função | Um fluxo, passando por várias telas |
| Dependências | Mocks (repository, feedback, auth) | Hooks e providers reais; só a infra externa é substituída |
| Custo | Rápido; a falha aponta o lugar exato | Mais lento; a falha exige investigar |

**O que torna isso viável é a injeção de dependência** (módulos anteriores): o app roda com `SupabaseRepositories` e `AsyncStorage`; o teste injeta `InMemoryRepository` e `InMemoryStorage` pelos **mesmos providers**. O código de domínio não muda, só a implementação plugada. E por que não usar o `AsyncStorage` real: ele tem dependência nativa e o Jest roda só JavaScript — em vez de mockar a biblioteca (seção 6), troca-se a implementação pela interface.

### A infraestrutura: quatro peças (código real do projeto)

**1. `AppStack` extraída do layout raiz** (`src/ui/navigation/AppStack.tsx`). O `app/_layout.tsx` ficou com o que é só do app (fontes, splash, providers de produção) e renderiza `<AppStack />`; o teste reutiliza o mesmo componente.

**2. `renderApp` com `renderRouter`.** Não há sistema de arquivos no teste, então `renderRouter` (de `expo-router/testing-library`) recebe um **mapa rota → componente** que espelha `app/`. As chaves precisam bater exatamente, inclusive grupos e segmentos dinâmicos:
```tsx
renderRouter({
  _layout: () => <AppStack />,
  "(protected)/_layout": () => <ProtectedLayout />,
  "(protected)/(tabs)/index": () => <HomeScreen />,
  "(protected)/city-details/[id]": () => <CityDetails />,
  "sign-in": () => <SignInScreen />,
  // ...
}, { wrapper: Wrapper, initialUrl: "/" });
```
`wrapper` envolve todas as rotas com os providers; `initialUrl: "/"` abre o app como na primeira execução.

**3. Wrapper com os providers de teste** — mesma árvore do layout raiz, sem fontes/`StatusBar`, com fakes: `StorageProvider` → `AuthProvider` → `FeedbackProvider` → `RepositoryProvider` → `ThemeProvider` (+ `<Toast />`). A ordem **não é livre**: `AuthProvider` usa `useStorage()` por dentro, então o storage tem que envolvê-lo (regra da seção 3 do `auth-forms.md`). Cuidado com auto-import: `ThemeProvider` é de `@shopify/restyle` (não de `@react-navigation/native`) e `Toast` é o componente do projeto, não o da biblioteca.

**4. `InMemoryStorage`**: implementa a mesma `IStorage` com um `Map`, exportado como **singleton** (`inMemoryStorage`) para persistir durante o teste e poder ser limpo com `clear()`.

> **Fidelidade do fake, verificada:** diferente do adapter real (que faz `JSON.stringify`/`parse`), `InMemoryStorage` guarda o objeto **como está**. Conferi: `getItem` devolve a **mesma referência** que foi salva (uma mutação no objeto devolvido altera o armazenado), e um `Date` sobrevive como `Date` em memória, mas vira `string` no round-trip por JSON. É um caso concreto do custo "o fake precisa acompanhar o real" (tabela abaixo): um bug de serialização passaria despercebido.

### O primeiro teste — e o que ele realmente afirma

```tsx
describe('Integration: Auth flow test', () => {
  test('the user can sign-in and sign-out', async () => {
    renderApp();
    expect(await screen.findByText("Bem-vindo"));
  });
});
```

> **Correção em relação ao resumo da aula:** este teste não prova que o app "chega à Home". `"Bem-vindo"` existe **só** em `app/sign-in.tsx` (título da tela de login). Sem usuário salvo, o `ProtectedLayout` redireciona pra `/sign-in` — então o que o teste confirma é que **o app inicializa e o guard de autenticação redireciona**. Verifiquei: `expect(screen).toHavePathname("/sign-in")` passa e `not.toHavePathname("/")` também. Isso é um teste válido (o guard funciona!) — só não é o que o texto dizia.

Melhorias pequenas, todas conferidas:
- **Afirmar o roteamento em vez do texto:** `expo-router/testing-library` registra matchers próprios — `toHavePathname`, `toHavePathnameWithParams`, `toHaveSegments`, `toHaveSearchParams`, `toHaveRouterState`. Pegadinha: funcionam em runtime, mas o `tsc` acusa `TS2339` — o pacote não entrega os tipos, então é preciso uma declaração própria (augmentation de `jest.Matchers`).
- **`expect(await findByText(...))` sem matcher** é o mesmo padrão da aula 10 (funciona porque `findBy` lança) — falta `.toBeOnTheScreen()`.
- **O nome `'the user can sign-in and sign-out'` descreve o cenário da próxima aula**, não este (mesmo problema de "nome enganoso" da aula 5).
- **`renderApp()` não dá `return` no resultado de `renderRouter`**, então `getPathname()`/`getSegments()` ficam inacessíveis. Os matchers acima (que operam sobre `screen`) e o `testRouter` funcionam mesmo assim, mas devolver o resultado é grátis.

### Problemas encontrados no setup

| Sintoma | O que a anotação diz | O que o repositório mostra |
|---|---|---|
| Erro ao importar `renderRouter` de `expo-router/testing-library` | `@types/jest ^30` com `jest ~29.7` → fixar `@types/jest` em `29.5.14` | `@types/jest` **continua `^30.0.0`** (30.0.0 instalado). O diff real foi `expo-router` `~5.0.6` → `5.1.11` (exato) **e** `query-string ^7` adicionado |
| Aviso "update … not wrapped in `act(...)`" | O teste terminava antes dos `useEffect` dos providers/router | Corrigido com `await screen.findByText(...)` — confere |

**Sobre o primeiro erro, a anotação e o repositório não batem** — vale confirmar qual mudança de fato resolveu. O que consegui verificar: no `expo-router` 5.1.11 instalado, `build/fork/getPathFromState*.js` faz `require("query-string")`, mas o pacote **não declara** `query-string` em `dependencies` nem `peerDependencies` — uma dependência "fantasma", que só resolve se algum outro pacote a deixar içada em `node_modules`. Declará-la no próprio app é o contorno padrão. Já `^7` mantém a linha CommonJS (a 7.1.3 instalada não declara `type: module`); antes de subir de major, conferir se virou ESM — reabriria a questão do `transformIgnorePatterns` da seção 2. Separadamente, alinhar `@types/jest` à major do Jest segue sendo boa higiene (hoje: tipos 30, runtime 29.7).

**Regra geral do segundo caso:** em integração, prefira `findBy*` (espera) a `getBy*` sempre que a tela dependa de carregamento, sessão ou navegação — aqui o redirect só acontece **depois** da hidratação da sessão (`isReady`, `auth-forms.md` §1).

### Trade-offs

| Decisão | Ganho | Custo |
|---|---|---|
| Renderizar o app inteiro, não telas isoladas | Testa navegação, providers e casos de uso juntos, como o usuário usa | Mais lento; a falha pode estar em qualquer camada |
| Fakes em memória via DI, em vez de `jest.mock` | Sem mocks presos a detalhes da biblioteca; testa contra a interface | O fake precisa acompanhar o real — ver abaixo |
| Mapa de rotas escrito à mão no `renderApp` | Controle explícito do que existe no teste | Duplica a estrutura de `app/`; rota nova não entra sozinha |
| `TestProviders` copiado do layout raiz | Liberdade pra trocar implementações | Duas árvores que podem divergir (provider novo esquecido no teste) |
| Storage como singleton | Simples de importar e inspecionar | **Estado vaza entre testes se não for limpo** |

**Duas instâncias concretas neste projeto:**
- *O fake que valida menos que o real:* `inMemoryAuthRepository.signIn` procura o usuário só pelo e-mail e **ignora a senha**. Um teste de integração com ele nunca pegaria "senha errada deve ser rejeitada" — se o Supabase valida e o fake não, o teste passa e o app quebra.
- *O vazamento que vem aí:* hoje há um único teste, então nada vaza. Mas na aula 12, um teste de sign-in grava `AUTH_KEY` no `inMemoryStorage` singleton — e o teste seguinte, ao montar o app, **hidrata esse usuário e cai direto na Home**. Sem limpeza entre testes, a ordem de execução passa a decidir o resultado *(refinado na aula 12: isso só acontece dentro do mesmo arquivo — ver abaixo)*. O projeto não tem nenhum arquivo de setup (a config do Jest é só `{ "preset": "jest-expo" }`); um arquivo de setup só roda se estiver registrado em `setupFilesAfterEnv` — esquecer isso é uma falha silenciosa.

### Evoluções propostas (nas anotações; **não implementadas** — só `AppStack` foi extraído)

- **Um único `AppProviders` parametrizado** (`repository`, `storage`), usado pelo layout raiz e pelo teste — elimina o risco de duas árvores divergirem.
- **`renderApp` com overrides** (`initialUrl`, `repository`, `storage`) pra começar em qualquer rota e com estado preparado, sem uma função por cenário. *(Aula 13: começou — `renderApp({ isAuthenticated })`; `initialUrl`/`repository`/`storage` seguem fixos.)*
- **Reset global** (`inMemoryStorage.clear()` num `beforeEach` de um arquivo registrado em `setupFilesAfterEnv`).
- **Um fake por porta** (Repository, Storage, HTTP, relógio): toda dependência que sai do processo ganha interface + implementação real + implementação em memória.
- **Navegação como componente fora de `app/`** (`ProtectedLayout`, `TabLayout` — hoje o `renderApp` ainda os importa direto dos arquivos de rota) e **`appRoutes` em arquivo próprio**, com um teste que compare as chaves com os arquivos de `app/`.
- **Scripts separados** pra rodar unidade no dia a dia e integração no CI (o arquivo já segue a convenção `*.integration.test.tsx`, o que permite filtrar por nome).

### Caminhos alternativos

| Alternativa | Quando escolher | Custo |
|---|---|---|
| Mock oficial da lib nativa (`jest.mock`) | Projeto sem DI, ou poucas dependências nativas | Teste acoplado à biblioteca; trocar de storage quebra os testes |
| MSW na camada HTTP (repository real, rede interceptada) | O risco está no mapeamento da API (payloads, erros, status) | Mais configuração; respostas precisam acompanhar o contrato real |
| Rotas parciais no `renderRouter` | Fluxos curtos, teste leve | Menos fiel: não pega guards/layouts que ficaram de fora |
| Tela isolada com navegação mockada | Teste de componente rápido | Testa a intenção (`router.push` chamado), não a navegação |
| E2E (Maestro/Detox) | Poucos fluxos críticos antes de release | Lento, exige simulador no CI, mais instável |

Divisão comum, fechando com a pirâmide da seção 1: muitos testes unitários, alguns de integração com fakes (como aqui) pros fluxos principais, poucos E2E pro que depende do nativo.

### Checklist pra replicar (com o estado deste projeto)

- [ ] Alinhar `@types/jest` à major do Jest *(hoje: tipos 30, Jest 29.7)*
- [x] Extrair `AppStack` pra fora de `app/` *(só ela; `ProtectedLayout`/`TabLayout` ainda vêm de `app/`)*
- [x] Interface + `InMemoryStorage` *(fake de Repository já existia)*
- [ ] `AppProviders` parametrizado, usado no layout raiz e no teste
- [x] `renderApp` espelhando `app/` *(`appRoutes` ainda não está em arquivo próprio)*
- [ ] Limpar os fakes entre testes (`beforeEach` + `setupFilesAfterEnv`)
- [x] Primeiro teste com `findBy*`

→ O fluxo de fato (sign-in → Home → sign-out) foi escrito na aula 12, logo abaixo.

### Aula 12 — o fluxo de sign-in e sign-out

**A técnica central: o fluxo do usuário é o roteiro do teste.** Antes de qualquer código, escreva os passos como comentários (o que o usuário faz, na ordem) e traduza cada um. O teste fica legível como uma história e a ordem das asserções deixa de ser decisão arbitrária:

```tsx
test('the user can sign-in and sign-out', async () => {
  renderApp();
  expect(await screen.findByText("Bem-vindo"));                       // tela renderizou

  fireEvent.changeText(screen.getByPlaceholderText('seu email'), "...");   // digita credenciais
  fireEvent.changeText(screen.getByPlaceholderText('digite sua senha'), "...");
  fireEvent.press(screen.getByText(/entrar/i));                       // aperta Entrar

  expect(await screen.findByText('signed in: ...')).toBeOnTheScreen();   // toast que o usuário vê
  expect(await screen.findByText("Rio de Janeiro")).toBeOnTheScreen();   // Home renderizou
  expect(screen.getByText("Bangkok")).toBeOnTheScreen();

  fireEvent.press(screen.getByText("Perfil"));                        // aba Perfil
  fireEvent.press(screen.getByText("Sair"));                          // sign-out
  expect(await screen.findByText("Bem-vindo")).toBeOnTheScreen();     // voltou ao login
});
```

**Quando usar `getBy`, `queryBy` ou `findBy` — a regra aplicada neste teste:**
- `findBy` pro **primeiro** elemento que depende de algo assíncrono (o toast, a Home); `getBy` pros elementos que aparecem **no mesmo render** (`"Bangkok"` logo depois de `"Rio de Janeiro"`).
- `getByText("Perfil")` acha o *rótulo da aba*, que existe desde o início; e `getByText("Sair")` logo após o `press` funciona porque o `fireEvent` roda dentro de `act` e a tela de perfil renderiza síncrona, de estado local. Se ela buscasse dados, seria `findBy`.
- `getByPlaceholderText` acha os campos **sem nenhum `testID`** — confirmando o que a aula 9 antecipou (os 5 `testID` do `SignUpForm` eram dispensáveis). `/entrar/i` é frouxo de propósito, mas tem custo: se surgir outro texto com "entrar" na tela, `getByText` passa a lançar "múltiplos elementos".

> **Atenção com a lista:** `FlatList` virtualiza também no teste. Medi: das 15 cidades da fixture só **10** estão na árvore (`Rio de Janeiro` … `Dubai`); `Cidade do México`, `Hong Kong`, `Košice`, `Melbourne` e `Singapura` **não** são encontradas por `getBy`. `"Bangkok"` (3ª) é segura; um item da 11ª posição em diante exigiria rolar a lista ou aumentar `initialNumToRender`.

### Toast na tela vs. função chamada

No teste unitário de `useAuthSignIn` (aula 7), `expect(mockSendFeedback).toHaveBeenCalledWith(...)` prova que a **função foi chamada** — não que o usuário viu algo. Aqui a asserção é o **texto do toast na tela**, o que o usuário de fato enxerga. A aula demonstra isso do jeito certo: comentar o envio do feedback faz o teste de integração falhar (vermelho antes do verde, aula 4).

Nuance: o teste fica **independente da implementação do `FeedbackService`**, mas continua preso ao **canal de UI** que o wrapper injeta (`ToastFeedback` + `<Toast />`). Refatorar o interior do serviço mantém o teste verde; trocar o canal por `AlertFeedback` (um `Alert.alert` nativo, que não entra na árvore do RNTL) o quebraria. Os dois testes **não são redundantes**: o unitário fixa o contrato do hook (payload exato, caminho de erro); o de integração fixa a fiação ponta a ponta.

### Cobertura como bússola enquanto se escreve o fluxo

```jsonc
// package.json
"jest": { "preset": "jest-expo", "collectCoverageFrom": ["{src,app}/**/*.{ts,tsx}"] }
```

Isso é um **glob**, não uma regex. **O mecanismo:** sem `collectCoverageFrom`, o Jest só reporta arquivos que algum teste chegou a **carregar** — o que nunca foi importado simplesmente não existe no relatório, e a porcentagem fica bonita por omissão. Com o glob, tudo que casa entra, mesmo a 0%. Medido neste projeto:

| | Sem o glob | Com o glob |
|---|---|---|
| Arquivos no relatório | 64 | **86** (+22 nunca carregados: `SupabaseAuthRepository.ts`, `AsyncStorage.ts`, `AlertFeedback.tsx`, `reset-password.tsx`, `useAuthSendResetPasswordEmail.ts`…) |
| Statements | 42,39% (145/342) | **31,08%** (129/415) |

E há um segundo efeito: sem o glob o relatório também contava **16 imagens** (15 JPGs de cidades + a logo) como "100% cobertas" — cada `require` de imagem vira um stub de 1 statement. Os 16 statements de diferença no numerador (145 vs 129) são exatamente eles. O glob torna o número **menor e honesto**: acrescenta o que faltava e tira o que inflava. *(Ambas as execuções incluíam o teste de integração ainda falhando — vale a comparação relativa, não os valores absolutos de um estado "pós-fluxo".)*

**A técnica da aula:** rode `jest --coverage` e abra `coverage/lcov-report/index.html` (a pasta já está no `.gitignore`) como **medidor de progresso**. Cada passo do fluxo acende mais linhas: renderizar o login cobre `SignInScreen`, mas `handleSignIn` segue vermelho; após o `press`, `saveAuthUser` fica verde; só após o "Sair" `removeAuthUser` e `useAuthSignOut` ficam verdes.

O que isso ensina (continuação da seção 7):
- **Renderizado ≠ exercitado:** um arquivo aparece coberto no nível do módulo enquanto seus handlers estão vermelhos.
- **Cobertura "falsa" por teste unitário:** `useAuthSignIn` mostra 100% por causa do teste unitário (tudo mockado) — mas nunca foi testado **ligado** a nada. É o espelho da seção 7: lá, módulo mockado dá 0%; aqui, módulo testado só com mocks dá 100% que não diz se ele funciona integrado.
- **Um teste de integração cobre arquivos sem teste próprio** (`useAuthSignOut`, `AuthContext`, `SignInScreen`, `Profile`) — o custo-benefício que justifica o setup caro da aula 11.
- **Nem tudo precisa de 100%:** o `if (error) throw` do repository fica de fora, e tudo bem.

### Decisões e trade-offs deste teste

| Decisão | Ganho | Custo |
|---|---|---|
| Um teste longo e sequencial pra jornada inteira | Lê como uma história; o estado carrega naturalmente | A 1ª falha esconde os passos seguintes; o nome não diz qual metade quebrou; dividir exige semear estado (abaixo) |
| Afirmar dados da fixture pelo nome (`"Rio de Janeiro"`, `"Bangkok"`) | Verifica o que o usuário vê; determinístico com o repository em memória | Acoplado aos dados de demonstração — renomear uma cidade quebra o teste |
| Queries por placeholder/texto, sem `testID` | Nenhuma mudança no código de produção | Placeholder some ao digitar; regex frouxo pode colidir; `getByLabelText` segue impossível (lacuna da aula 9) |
| Unitário + integração para o mesmo caso de uso | Contrato exato + fiação real | Alguma sobreposição de intenção |

### Achados no repositório (verificados rodando)

**1. O teste, como está, falha — e o motivo é de dados.** Ele faz login com `gabriel@gmail.com`, mas a fixture de `authUsers` só tem `lucas@coffstack.com` e `maria@coffstack.com`. `signIn` lança `"user not found"`, a tela mostra o toast de **erro** (`error ao fazer login` / `user not found`) e o de sucesso nunca aparece: `Unable to find an element with text: signed in: gabriel@gmail.com`. O teste de integração fez o trabalho dele — mostrou exatamente o que o usuário veria. As credenciais da transcrição (`Lucas@tec.com`/`12345678`) também não são as da fixture: a fixture do repositório é a fonte da verdade. Usar `lucas@coffstack.com` ou adicionar o usuário a `authUsers` resolve. **Resolvido:** o teste passou a digitar e esperar `lucas@coffstack.com` (mesmo e-mail nos dois lugares). E, como o fake **ignora a senha** (verifiquei: `"qualquer-coisa"` é aceita), o teste não consegue provar que senha errada seria rejeitada.

**2. Bug em `useAppQuery`: refetch infinito (o achado mais importante).** Ao corrigir as credenciais, o teste **trava** na Home — nem o `findBy` estoura o próprio timeout de 1s; só o timeout do Jest encerra. Isolei: com sessão semeada (sem sign-in) a Home também trava, então o problema é a Home, não o login.

```ts
useEffect(() => { _fetchData(); }, [dependencies]);   // ← a identidade do array, não o conteúdo
```

`dependencies` é um array **novo a cada render** — literal inline em `useCityFindAll` (`[filters.name, filters.categoryId]`) e o default `= []` nos outros três (`useCityFindById`, `useGetRelatedCities`, `useCategoryFindAll`). Cada render cria um array novo, o efeito reexecuta, `_fetchData` altera estado, causa render, e o ciclo recomeça. Medi com um `jest.fn()` espião: **258.933 chamadas ao fetch em 300ms**, contra **1** quando a referência é estável. Com o repository em memória a promessa resolve na hora, o ciclo roda em microtasks e **sufoca os timers** — por isso o `findBy` nunca tem chance de falhar nem de passar: o sintoma é um **travamento**, não uma asserção vermelha. *(Precisão da aula 13: em testes com `renderRouter` os timers são **fake**, e o que fica sufocado é o laço de polling do `waitFor`/`findBy`, que precisa ceder ao event loop a cada volta — o diagnóstico e a correção não mudam.)*

A correção é passar o próprio array como lista de dependências (`}, dependencies)`) — a semântica pretendida ("refaz o fetch quando as dependências mudam"). Provei a causa sem tocar no arquivo: um `jest.mock` descartável do hook com **só essa linha trocada** e o fluxo inteiro passou em ~180ms. **O mesmo defeito existe em produção** (cada render da Home dispara novos fetches); com latência de rede o ciclo é mais lento, mas não termina — isso é inferência a partir do mecanismo, vale confirmar no log de rede/Reactotron. O `// eslint-disable-next-line react-hooks/exhaustive-deps` na linha acima é o que impediu o linter de apontar.

Lições portáteis: (a) **um teste que renderiza o código real acha o que teste unitário não acha** — `useAppQuery` nunca tinha sido montado com chamadores reais até a Home ser renderizada; (b) **quando `findBy` não passa nem falha dentro do próprio timeout, suspeite de loop de render/efeito** e conte chamadas com um `jest.fn()`; (c) **provar a causa trocando um módulo inteiro num teste descartável** antes de mexer no código é uma forma barata de bissecção.

> **Resolvido.** Correção aplicada: `}, dependencies)` no `useAppQuery` e `[id]` passado em `useCityFindById` e `useGetRelatedCities`. Verificado no hook **real**: deps inline → **1** fetch; sem deps → **1** fetch; mudar o `id` → refaz (2 chamadas, com `["rio"]` e `["tokyo"]`), e só então. O teste de integração passa em ~275ms e a suíte inteira (7 suítes, 14 testes) fica verde.
>
> **A segunda metade da correção importa:** `useCityFindById(id)` e `useGetRelatedCities(id)` não passavam dependência nenhuma. Enquanto o hook refazia o fetch **a cada render**, isso passava despercebido — o loop acidental também "acompanhava" mudanças de `id`. Consertar só o hook faria os dois buscarem **uma vez** e ignorarem trocas de `id` (dado velho na tela). Regra geral: **ao corrigir um bug de dependência, procure os chamadores que dependiam do acidente** — o que antes funcionava por excesso de execução passa a exigir a dependência declarada.

**3. O vazamento do storage, refinado.** Na aula 11 anotei que o singleton `inMemoryStorage` vazaria entre testes. Verifiquei o escopo: vaza **só dentro do mesmo arquivo** — um teste que semeou a sessão deixou `AUTH_KEY` lá e o teste seguinte, sem semear nada, abriu **já logado**; já um **arquivo diferente** enxergou `null`, porque o Jest dá a cada arquivo de teste seu próprio registro de módulos. O teste atual se limpa sozinho (o "Sair" remove a chave), mas se falhar antes dele, a sessão sobra pros testes seguintes do arquivo. `beforeEach(() => inMemoryStorage.clear())` resolve.

**4. Semear a sessão pelo storage em vez de clicar pela UI** (verificado): `await inMemoryStorage.setItem("AUTH_KEY", user)` antes de `renderApp()` abre o app direto na Home (`toHavePathname('/')`), sem passar pelo formulário. É a mesma hidratação de sessão do `auth-forms.md` §1, usada de propósito: **prepare o estado pela mesma persistência de onde o app lê**. Isso permite dividir o teste longo — o de sign-out semeia a sessão; o de sign-in começa limpo. (`AUTH_KEY` é uma constante não exportada em `AuthContext.tsx`; o teste duplicaria a string — exportá-la evita divergência.)

**5. Observações menores.** O `expect(await screen.findByText("Bem-vindo"))` do início não tem matcher (padrão da aula 10), enquanto o do fim tem `.toBeOnTheScreen()`. A asserção final **não é vazia** — conferi que, depois do sign-in, `queryByText("Bem-vindo")` é `null` (o login sai da árvore, pois o sign-in faz `router.replace`), então sua reaparição prova o sign-out; mais explícito ainda seria `expect(screen).toHavePathname("/sign-in")`. Na transcrição a tela pós-sign-out às vezes é chamada de "Home" — provável erro de transcrição: neste app, `"Bem-vindo"` é a tela de **login**.

### Aula 13 — Home e City Details: começar autenticado, fake timers e depuração

*(Estado do teste nesta aula: só a primeira metade — a Home autenticada exibe a lista. Pressionar um card e chegar nos detalhes ainda não foi escrito.)*

**O problema:** todo teste de integração começa com o app "recém-aberto", sem sessão. A maioria dos testes (Home, detalhes, perfil) **não é sobre autenticação** — repetir o login em cada um é custo e acoplamento inúteis. Há três formas de começar autenticado, e a escolha é um trade-off:

| Técnica | Como | Passa pelo `AuthProvider` real? | Custo / risco |
|---|---|---|---|
| Login pela UI | o fluxo da aula 12 | sim | o mais lento; acopla todo teste ao formulário |
| Semear o storage | `inMemoryStorage.setItem("AUTH_KEY", user)` antes do `renderApp()` | **sim** (hidratação real) | acopla à chave e à serialização; singleton exige `clear()` |
| Provider mockado | `renderApp({ isAuthenticated: true })` | **não** | o mais rápido; sem estado no storage; mas `saveAuthUser`/`removeAuthUser` viram no-op |

```tsx
// src/test-utils/renderApp.tsx
function MockedAuthProvider({ children }: React.PropsWithChildren) {
  const authUser: AuthUser = { email: "lucas@coffstack.com", id: "1", fullname: "Lucas Garcez" };
  return (
    <AuthContext.Provider value={{ isReady: true, authUser, saveAuthUser: async () => {}, removeAuthUser: async () => {} }}>
      {children}
    </AuthContext.Provider>
  );
}

export function renderApp(options?: { isAuthenticated?: boolean }) {
  const FinalAuthProvider = options?.isAuthenticated ? MockedAuthProvider : AuthProvider;
  // ... mesma árvore de antes, com <FinalAuthProvider> no lugar de <AuthProvider>
}
```

**O mecanismo:** `AuthContext` é exportado, então o teste monta o **próprio `Provider` com um valor pronto**, em vez de substituir o componente consumidor. O `ProtectedLayout` só lê `useAuth()`: vê `isReady: true` e um usuário e não redireciona. Verifiquei: o app abre direto na Home (`toHavePathname("/")`) e o storage fica intocado (`AUTH_KEY` segue `null`) — por isso, nesta técnica, não há vazamento de estado entre testes.

**O que o atalho custa (verificado):**
- **Sign-out vira no-op.** Com `isAuthenticated: true`, apertar "Sair" **não desloga**: o usuário permanece em `/profile` e o botão continua na tela. Com o `AuthProvider` real e a sessão semeada, o mesmo "Sair" volta ao login. Regra: o provider mockado serve a testes **sobre outra feature**; o teste de autenticação (`AuthFlow`) continua com o provider real — e é ele que cobre a hidratação, a splash e o `saveAuthUser`, que o mock nunca executa.
- **Uma flag booleana que troca um provider inteiro é um interruptor binário.** Quando um teste precisar saber *quem* está logado (ex.: o perfil exibir o nome), `renderApp({ user })` com `user?: AuthUser | null` expressa "está logado?" e "quem?" no mesmo parâmetro. Hoje o usuário fixo (`Lucas Garcez`) é irrelevante — só o `(protected)/_layout` lê `authUser` —, mas vira dado vazando nas asserções assim que alguma tela o exibir.

### `renderRouter` liga os fake timers — e um `setTimeout` cru nunca dispara

No fonte do `expo-router/testing-library`, **cada chamada de `renderRouter` executa `jest.useFakeTimers()`** (e restaura o horário do sistema). Conferi depois de `renderApp()`: `setTimeout.clock` existe e há timers pendentes (`getTimerCount() → 3`). Ou seja: todo teste de integração deste projeto roda sob fake timers, sem nenhuma linha no arquivo de teste pedindo isso (diferente da aula 5, em que o `beforeAll` os ligava explicitamente).

Consequências práticas:
- `await new Promise(r => setTimeout(r, 400))` **trava para sempre** — o relógio fake não avança sozinho. (Foi exatamente o que fez uma investigação confundir esse travamento com um bug do app, até o fonte da lib ser lido — vale lembrar disso antes de culpar o código.)
- `findBy*` e `waitFor` funcionam porque o RNTL **avança os fake timers** a cada volta do polling — por isso toda a aula 12 passou sem ninguém notar.
- Para fazer o tempo passar de propósito: `await act(async () => { jest.advanceTimersByTime(500); })`.

### Ruído nos logs (inofensivo, mas aponta uma lacuna)

- `[Layout children]: No route named "+not-found" exists` a cada `renderApp`: o `AppStack` declara `<Stack.Screen name="+not-found" />`, mas o mapa de rotas do teste não tem essa entrada — uma instância concreta do custo "o mapa duplica `app/`" da aula 11. Registrar a rota no mapa silencia.
- `An update to … was not wrapped in act(...)`: aparece quando uma mutation termina **depois** que o `fireEvent.press` já retornou (visto com o `setIsLoading(false)` do `useAppMutation`). Aguardar algo com `findBy*` — ou envolver em `act` — resolve.

### Depurando um teste: debugger, call stack e timeout

A aula mostra o depurador do editor (extensão do Jest, ação **Debug** sobre o teste). A ideia central: o teste executa o **código real** do app em Node, então um breakpoint funciona em **qualquer arquivo que o teste alcance** — o `renderItem` da lista, um hook, o `findAll` do repository em memória.

- **Call stack:** o painel lateral mostra a cadeia de quem chamou quem — por exemplo `InMemoryCityRepository.findAll` ← o fetch do `useAppQuery` ← `useCityFindAll` ← a tela. Você enxerga **por que** o código está ali, não só onde. Boa parte dos frames é de `node_modules` (internos do React); o útil é saltar entre os frames **seus**.
- O breakpoint no `renderItem` parou uma cidade por vez (Rio, Tóquio, Bangkok…) — coerente com as **10** itens iniciais da `FlatList` (aula 12).
- **O timeout do Jest continua contando enquanto você está parado no breakpoint**, e o teste estoura com `Exceeded timeout` ao retomar. Solução: o **terceiro argumento** de `it(nome, fn, ms)` (a aula usou `50000`; o teste levou ~29s sem estourar), `jest.setTimeout(ms)` ou `--testTimeout`. Equivalente em linha de comando: `node --inspect-brk node_modules/.bin/jest --runInBand <arquivo>` e anexar o depurador (`--runInBand` porque a depuração precisa de um único processo).

> **Atenção ao timeout de depuração que sobra:** o `50000` ficou no teste da Home. Um timeout longo **mascara travamentos** — com o padrão de 5s, o loop do `useAppQuery` (aula 12) foi reportado em 5s; com 50s, seriam 50s de espera por nada. Elevar só durante a sessão de debug e voltar ao padrão depois. (O teste também ainda tem um `//` vazio e um nome — "…navigate to details when the city card is pressed" — que promete mais do que o corpo verifica, o mesmo "nome enganoso" da aula 5, até a segunda metade ser escrita.)

**Qual ferramenta pra qual dúvida** (todas usadas nestas aulas):

| Dúvida | Ferramenta |
|---|---|
| O que **está renderizado** agora? | `screen.debug()` — e a árvore que o RNTL já imprime sozinho quando um `getBy`/`findBy` falha |
| Em que **ordem/quando** as etapas acontecem, e onde o teste para? | marcadores `console.log("STEP +Nms …")` |
| Algo está sendo chamado **vezes demais** (loop)? | espião `jest.fn()` contando chamadas (foi assim que o refetch infinito apareceu) |
| Qual é o **valor** de uma variável, e **quem** chamou esta função? | debugger com breakpoint + call stack |

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
| 4 | `fireEvent`, `testID`, Arrange-Act-Assert, teste falhando de propósito | §4 |
| 5 | `userEvent`, fake timers, nome de teste enganoso | §4 |
| 5 | `userEvent`, fake timers | §4 |
| 6 | Render customizado (`wrapper`, `Omit`), `jest.fn()`, convenção de pasta de teste | §5 |
| 7 | `renderHook`, `jest.mock`, resolução de alias sob o capô | §6 |
| 8 | `jest --coverage`, 0% mockado vs. 0% sem teste, `beforeEach`/`clearAllMocks` | §7 |
| 9 | Fronteira do componente, `waitFor`, asserção acoplada a plumbing | §8 |
| 10 | Teste negativo, `findBy*`, `toHaveStyle`, `testID` composto, isolar variável | §8 |
| 11 | `renderApp`/`renderRouter`, fakes via DI, o que o 1º teste de integração afirma | §9 |
| 12 | Fluxo sign-in/sign-out, `collectCoverageFrom`, `getBy`/`findBy` na prática, refetch infinito achado | §9 |
| 13 | Home autenticada (provider mockado), `renderRouter` liga fake timers, debugger e call stack | §9 |
| 14 | Integração: Home → City Details | §9 |
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
- **Arrange-Act-Assert (AAA):** estrutura padrão de um teste de interação — prepara o estado, executa a ação, verifica o resultado. Assert antes *e* depois da ação confirma que a ação causou a mudança, não só que o valor final está certo.
- **`fireEvent` vs. simulação real de gesto:** `fireEvent` chama a prop de evento (`onPress`) direto no elemento — não passa pelos eventos intermediários que um toque real dispara. Suficiente pra lógica simples de clique; insuficiente pra comportamento amarrado a `onPressIn`/`onPressOut`/gestos.
- **Teste falhando de propósito:** quebrar a asserção ou a implementação de propósito, rodar o teste, confirmar que ele falha — a única forma de saber que um teste que passa não é um falso positivo.
- **`testID` como último recurso:** na ordem de prioridade do Testing Library, `testID` vem depois de role/label/texto — só se justifica quando o elemento não expõe nenhuma forma de ser identificado "como o usuário enxerga".
- **`userEvent` vs. `fireEvent`:** `userEvent` simula a sequência real de eventos de uma interação (assíncrono, precisa de fake timers pros delays internos); `fireEvent` chama o handler direto (síncrono, sem delay). Coexistem — não é upgrade automático trocar um pelo outro.
- **Elemento host/nativo:** o nó real (`View`, `Text`, `Pressable`, `TextInput`) no fundo da árvore renderizada, depois de qualquer componente customizado ser "desenrolado" — é sobre isso que `userEvent` de fato opera.
- **Escopo de `beforeAll`/`afterAll` vs. `beforeEach`/`afterEach`:** o primeiro par roda uma vez pro arquivo/describe inteiro; o segundo, a cada teste. Fake timers ligados em `beforeAll` valem pra todos os testes do bloco, não só pro que precisa deles.
- **Nome de teste enganoso:** uma descrição que não corresponde ao que o corpo do teste verifica — não é falso positivo (o teste continua correto), mas desperdiça o tempo de quem lê a falha e procura o bug no lugar errado.
- **Render customizado (`wrapper`):** função que embrulha o `render` da Testing Library fixando todos os Providers da árvore real, pra nenhum arquivo de teste repetir esse boilerplate — o mesmo papel do Composition Root de produção, só que pro ambiente de teste.
- **`Omit<LibType, "campo">`:** técnica de TS pra reaproveitar o tipo de opções de uma lib de terceiro, removendo só o campo que o próprio projeto já decidiu por você — trava a decisão em nível de tipo, não só de convenção.
- **`jest.fn()` (spy):** função que registra suas próprias chamadas, permitindo perguntar depois se/quantas vezes/com o quê foi chamada — outro tipo de asserção, complementar a verificar o que apareceu na tela.
- **Teste de fiação vs. teste de regra de negócio:** um teste pode provar que uma prop chega até o componente nativo certo (fiação) sem provar nenhuma lógica própria do componente — as duas confianças são legítimas, mas não intercambiáveis.
- **`renderHook`:** monta um hook sem componente visual em volta, expondo o retorno em `result.current`; mudanças de estado dentro dele precisam de `act(...)`.
- **`jest.mock(caminho, fábrica)`:** substitui o módulo inteiro num caminho de import — precisa bater exatamente com a resolução real (mesmos aliases, mesma profundidade relativa), senão falha com "Cannot find module" em vez de silenciosamente não mockar nada.
- **Alias resolvido por prefixo, não por convenção geral:** `babel-preset-expo` (ou `moduleNameMapper` do Jest, noutros setups) troca um prefixo literal registrado no `tsconfig.json`/config — qualquer caminho que não bata caractere por caractere com esse prefixo cai no resolvedor padrão do Node, tratado como se fosse um pacote de `node_modules`.
- **Coverage mede execução, não corretude:** a % de cobertura conta linhas que rodaram durante os testes — um módulo inteiramente mockado sempre aparece em 0%, mesmo que o comportamento dele esteja bem simulado; um teste fraco pode gerar 100% sem provar nada.
- **`clearAllMocks` vs. `resetAllMocks` vs. `restoreAllMocks`:** o primeiro só zera histórico de chamadas; o segundo também apaga implementações configuradas (`mockImplementation`/`mockReturnValue`); o terceiro só se aplica a `jest.spyOn`, devolvendo a função original.
- **Fronteira do componente:** o contrato de entrada/saída (props recebidas, callbacks chamados, o que renderiza). Teste unitário afirma só o que cruza essa fronteira; o que depende da responsabilidade de um colaborador (mutation, toast, navegação) é teste de integração.
- **`waitFor` / `findBy*`:** repetem uma asserção (ou query) até passar ou estourar o timeout — necessários quando o efeito é assíncrono (ex.: `handleSubmit` do RHF aguarda o resolver antes de chamar `onSubmit`). O callback do `waitFor` roda várias vezes: só asserções, nunca ações.
- **Asserção acoplada a plumbing:** verificar um argumento incidental do framework (ex.: o evento passado como 2º argumento do `onValid` do RHF) em vez do contrato do componente — quebra sem nenhuma mudança de comportamento.
- **`expect.objectContaining`:** matcher assimétrico que ignora chaves extras — menos frágil a mudanças, porém incapaz de detectar a ausência de um campo que não foi listado.
- **Testabilidade ≈ acessibilidade:** um elemento que não pode ser consultado por label/texto/role (o que o usuário percebe) normalmente também não é anunciado por leitor de tela — corrigir um costuma corrigir o outro.
- **`getBy*` / `findBy*` / `queryBy*`:** `getBy` busca uma vez e lança se não achar; `findBy` espera (async) até achar ou estourar o timeout; `queryBy` retorna `null` em vez de lançar — a forma certa de afirmar ausência.
- **Teste negativo isolado:** monta tudo válido exceto o campo sob teste, pra a falha ter uma única causa possível. No Zod isso pode ser obrigatório: `undefined` aborta o parse do objeto (o `.refine` não roda), string inválida não.
- **Asserção "não aconteceu" vazia:** `not.toHaveBeenCalled()` logo após uma ação assíncrona passa trivialmente — só vale depois de aguardar algo que prove que o fluxo terminou.
- **`toHaveStyle`:** compara o estilo achatado de um elemento host — com Restyle, o valor resolvido (`#D32F2F`), não o nome do token. Detecta fiação, não valor de token; usar com parcimônia, pois estilo muda com frequência.
- **`testID` derivado (`${testID}-container`):** gerar ids de sub-elementos a partir de uma prop existente, em vez de uma prop nova por elemento — tratar o caso em que a prop base é `undefined`.
- **Teste de integração (neste projeto):** renderiza o app inteiro via `renderRouter` com providers reais e fakes em memória no lugar da infra externa — testa o fluxo como o usuário o percorre, ao custo de velocidade e de manter fakes fiéis.
- **`renderRouter` + mapa de rotas:** `expo-router/testing-library` não lê o sistema de arquivos; recebe um mapa rota → componente cujas chaves precisam espelhar `app/` exatamente (grupos e `[id]` inclusos).
- **Matchers do `expo-router/testing-library`:** `toHavePathname`, `toHaveSegments`, `toHaveSearchParams`... afirmam o destino do roteamento em vez de um texto qualquer; sem tipos embarcados (o `tsc` acusa `TS2339`).
- **Fake infiel ao real:** um adapter em memória que valida menos (ex.: `signIn` que ignora a senha) ou serializa diferente (guarda a referência, sem JSON) faz o teste passar enquanto o app quebra.
- **Dependência fantasma:** um pacote que o código de uma lib `require`a sem declarar em `dependencies`/`peerDependencies` — só resolve se outro pacote o deixar içado em `node_modules`; declará-lo no app é o contorno.
- **Singleton em memória sem reset:** estado compartilhado entre testes faz a ordem de execução decidir o resultado; limpar num setup global (registrado em `setupFilesAfterEnv`).
- **Fluxo do usuário como roteiro:** escrever os passos que o usuário faz como comentários e traduzir cada um em código — a ordem do teste vem da jornada, não de decisão arbitrária.
- **`collectCoverageFrom` (glob):** inclui no relatório de cobertura todos os arquivos que casam, mesmo os nunca carregados por um teste (0%); sem ele, só aparece o que foi importado — e assets (imagens) viram stubs "100% cobertos" que inflam o número.
- **Cobertura "falsa" por mocks:** um arquivo com 100% vindo só de um teste unitário totalmente mockado não prova que funciona integrado; o inverso (módulo mockado = 0%) está na seção 7.
- **Loop de efeito por identidade de dependência:** `useEffect(fn, [arrayNovoACadaRender])` reexecuta a cada render; se o efeito altera estado, o ciclo não termina. Em teste com dados instantâneos o sintoma é um travamento (timers sufocados), não uma asserção vermelha.
- **Semear estado pela persistência:** preparar o cenário gravando na mesma storage de onde o app hidrata (em vez de percorrer a UI até lá) — permite quebrar um teste de jornada longa em testes menores.
- **`FlatList` virtualiza em teste:** só os primeiros `initialNumToRender` (10 por padrão) itens entram na árvore; `getBy` num item além disso falha.
- **Provider mockado (valor de Context substituto):** montar o próprio `Context.Provider` com um valor pronto em vez do provider real — rápido e sem estado em storage, mas o código real do provider (hidratação, efeitos, ações) não executa e suas ações viram no-op.
- **`renderRouter` e fake timers:** `expo-router/testing-library` chama `jest.useFakeTimers()` em cada render; `setTimeout` cru nunca dispara, `findBy*`/`waitFor` avançam o relógio sozinhos, e `act(() => jest.advanceTimersByTime(ms))` faz o tempo passar de propósito.
- **Call stack (depuração):** a cadeia de quem chamou quem até o breakpoint — mostra o porquê de o código estar ali, além do onde.
- **Timeout durante o debug:** o limite por teste do Jest segue correndo enquanto o teste está pausado; elevar via 3º argumento de `it`/`jest.setTimeout` só na sessão de debug, e restaurar depois — um timeout longo permanente esconde travamentos.
