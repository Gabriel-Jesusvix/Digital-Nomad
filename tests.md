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
| 4 | `fireEvent`, `testID`, Arrange-Act-Assert, teste falhando de propósito | §4 |
| 5 | `userEvent`, fake timers, nome de teste enganoso | §4 |
| 5 | `userEvent`, fake timers | §4 |
| 6 | Render customizado (`wrapper`, `Omit`), `jest.fn()`, convenção de pasta de teste | §5 |
| 7 | `renderHook`, `jest.mock`, resolução de alias sob o capô | §6 |
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
