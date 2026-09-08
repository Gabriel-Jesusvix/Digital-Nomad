# Autenticação e Formulários — Notas de Estudo

> Documento de **revisão**, não um tratado. Acompanha o módulo "Autenticação e Formulários" do curso, comparando os conceitos das aulas com o código real deste repositório. Continua de onde [arquitetura-frontend.md](arquitetura-frontend.md) parou — vários padrões daquele módulo (Repository, DIP, Ports & Adapters) reaparecem aqui aplicados a sessão de usuário e formulários. Objetivo é reler rápido antes de aplicar em outro projeto, não reconstruir a aula inteira.

## Índice

1. [Intro](#1-intro)
2. [Contexto de Autenticação](#2-contexto-de-autenticação)
3. [Storage com Inversão de Dependência](#3-storage-com-inversão-de-dependência)
4. [Splash Screen](#4-splash-screen)
5. [Componente TextInput](#5-componente-textinput)
6. [Componente Button](#6-componente-button)
7. [Tela de Sign-in](#7-tela-de-sign-in)
8. [Componentes Header e Logo](#8-componentes-header-e-logo)
9. [Tela Reset Password](#9-tela-reset-password)
10. [Reset Password Operation](#10-reset-password-operation)
11. [Formulário: Schema com Zod](#11-formulário-schema-com-zod)
12. [Formulário com React Hook Form](#12-formulário-com-react-hook-form)
13. [Sign Up Operation](#13-sign-up-operation)
14. [Formulário e Teclado](#14-formulário-e-teclado)
15. [Supabase Auth Repository](#15-supabase-auth-repository)
16. [Redefinição de Senha](#16-redefinição-de-senha)
17. [Feedback com Toast Component](#17-feedback-com-toast-component)
18. [Comparações rápidas](#comparações-rápidas)
19. [Glossário](#glossário)

---

## 1. Intro

O módulo tem dois eixos, que se cruzam mas são independentes:

- **Sessão/autenticação**: como guardar "quem está logado" de forma que sobreviva a um refresh do app, sem acoplar essa decisão a `AsyncStorage` especificamente (retoma DIP/Ports & Adapters do módulo anterior).
- **Formulários**: como validar e capturar input do usuário de forma consistente (Zod para schema, React Hook Form para estado do formulário), em vez de `useState` solto por campo.

## 2. Contexto de Autenticação

**Status: implementado.** Diferente de `RepositoryContext`/`FeedbackContext` (módulo anterior), que injetam uma **implementação trocável de uma interface** (Dependency Injection), `AuthContext` guarda **estado da aplicação que muda em tempo de execução** (usuário logado ou não). Mesmo primitivo do React (`createContext`), papel arquitetural diferente — vale não confundir os dois usos.

```tsx
// src/domain/Auth/AuthContext.tsx
type AuthState = {
  authUser: AuthUser | null;
  isReady: boolean;
  saveAuthUser: (authUser: AuthUser) => Promise<void>;
  removeAuthUser: () => Promise<void>;
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false); // ver padrão "isReady" abaixo

  useEffect(() => {
    loadAuthUser(); // lê o storage uma vez, ao montar
  }, []);

  return <AuthContext.Provider value={{ authUser, isReady, saveAuthUser, removeAuthUser }}>
    {children}
  </AuthContext.Provider>;
}
```

**Padrão agnóstico — a flag `isReady` (hidratação de sessão):** ler `AsyncStorage` é assíncrono, então no primeiro render `authUser` ainda não existe — mesmo que o usuário esteja logado. Sem uma flag de "ainda não terminei de checar", o gate de rota erraria e mandaria todo mundo pra tela de sign-in por uma fração de segundo, todo boot do app.

```tsx
// app/(protected)/_layout.tsx — consumindo o Context
const { isReady, authUser } = useAuth();
if (!isReady) return null;             // ainda checando o storage: não decide nada ainda
if (!authUser) return <Redirect href="/sign-in" />;
```

Esse padrão (flag de "carregamento inicial concluído" antes de decidir um redirect) é reaproveitável em qualquer app com sessão persistida, independente da lib de auth.

> **O mesmo bug de Context, pela terceira vez (variante nova):** o valor default de `createContext<AuthState>({...})` aqui não é `{} as AuthState` (cast, como nos dois casos do módulo anterior) — é um objeto **completo e válido**, com `authUser: null` e funções no-op. Isso é até mais "correto" no sentido de não precisar de cast, mas tem a mesma consequência prática: um objeto sempre é truthy, então o `if (!context) throw new Error(...)` dentro de `useAuth()` nunca dispara. Três ocorrências do mesmo problema em dois módulos — reforça que esse é o erro nº1 a checar ao revisar qualquer Context em qualquer projeto: **o guard só funciona se o default for `undefined`/`null`.**

**Vale discutir (mesmo ponto do `IFeedbackService` no módulo anterior):** `saveAuthUser` chama `router.replace("/")` diretamente, misturando estado de sessão com navegação, dentro de um arquivo em `src/domain/Auth/` — camada que, pela convenção deste projeto, deveria ser livre de dependência de framework (aqui, `expo-router`). Não é um erro óbvio — só reforça que a fronteira "isso é domínio ou é UI?" precisa ser decidida conscientemente, não por acidente.

## 3. Storage com Inversão de Dependência

**Status: implementado.** Mesma receita de Ports & Adapters do módulo anterior, aplicada a `AsyncStorage`. Diferença do que eu tinha previsto: em vez de uma interface *específica de Auth* (`IAuthStorage`), a interface ficou **genérica** — um key-value storage qualquer, reutilizável para qualquer feature que precise persistir algo, não só sessão:

```ts
// src/infra/services/storage/IStorage.ts — porta genérica, não sabe que existe AsyncStorage
export interface IStorage {
  setItem: (key: string, value: any) => Promise<void>;
  getItem: <IData>(key: string) => Promise<IData | null>;
  removeItem: (key: string) => Promise<void>;
}

// src/infra/services/storage/adapters/AsyncStorage.ts — adapter concreto
export const AsyncStorage: IStorage = {
  getItem: async (key) => {
    const item = await RNAsyncStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  },
  setItem: async (key, value) => RNAsyncStorage.setItem(key, JSON.stringify(value)),
  removeItem: (key) => RNAsyncStorage.removeItem(key),
};
```

Repare que o adapter esconde o `JSON.stringify`/`JSON.parse` — quem consome `IStorage` lida com objetos de verdade, não com string serializada. `AuthContext` deixou de chamar `AsyncStorage` direto e passou a usar `useStorage()`:

```ts
const { storage } = useStorage();
await storage.setItem(AUTH_KEY, user);          // antes: AsyncStorage.setItem(AUTH_KEY, JSON.stringify(user))
const user = await storage.getItem<AuthUser>(AUTH_KEY); // antes: JSON.parse(await AsyncStorage.getItem(AUTH_KEY))
```

**Nota agnóstica — ordem dos Providers importa quando um depende do outro:** como `AuthProvider` agora chama `useStorage()` por dentro, `StorageProvider` precisa envolver `AuthProvider` no composition root, não o contrário — Context só é lido por quem está aninhado *dentro* do Provider correspondente:

```tsx
// app/_layout.tsx
<StorageProvider storage={AsyncStorage}>
  <AuthProvider>          {/* usa useStorage() por dentro — precisa estar dentro do StorageProvider */}
    <FeedbackProvider value={AlertFeedback}>
      <RepositoryProvider value={InMemoryRepository}>...</RepositoryProvider>
    </FeedbackProvider>
  </AuthProvider>
</StorageProvider>
```
Regra geral: monte o composition root de fora pra dentro seguindo o grafo de dependência entre os Providers, não a ordem em que os módulos foram criados.

> **O mesmo bug de Context, pela quarta vez:** `StorageContext = createContext({ storage: {} as IStorage })` — de novo um default truthy, de novo um `if (!context) throw` que nunca dispara. Quatro ocorrências (`Repositories`, `Feedback`, `Auth`, agora `Storage`) confirmam que isso não é descuido pontual, é hábito. **Tip agnóstico de projeto:** em vez de repetir `createContext(X) + if (!context) throw` em cada arquivo, vale escrever uma vez um helper genérico —
> ```ts
> function createRequiredContext<T>(name: string) {
>   const Context = createContext<T | undefined>(undefined);
>   function useRequired(): T {
>     const ctx = use(Context);
>     if (!ctx) throw new Error(`${name} must be used within its Provider`);
>     return ctx;
>   }
>   return [Context, useRequired] as const;
> }
> ```
> — assim o guard correto vem de fábrica, em qualquer Context novo do projeto.

## 4. Splash Screen

**Status: parcialmente implementado** (chegou junto com a seção 3). `SplashScreen.preventAutoHideAsync()` mantém a splash nativa visível, e `AuthProvider` só chama `SplashScreen.hide()` quando `isReady` vira `true` — a splash cobre exatamente a janela em que a sessão ainda está sendo lida do storage, no lugar do antigo `if (!isReady) return null` (que piscava uma tela em branco). Mesma flag de hidratação da seção 2, agora com uma UI de espera de verdade.

## 5. Componente TextInput

**Status: implementado.** Wrapper de `RNTextInput` com label, borda reativa a foco/erro e slot de mensagem de erro — base de qualquer campo de formulário do módulo.

```tsx
export function TextInput({ label, errorMessage, ...textInputProps }: TextInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = errorMessage ? "fbErrorSurface" : isFocused ? "text" : "gray1";

  return (
    <Box>
      <Text variant="title14">{label}</Text>
      <Box borderWidth={2} borderColor={borderColor} height={50}>
        <RNTextInput
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...textInputProps}
          style={{ height: "100%", width: "100%" /* ... */ }}
        />
      </Box>
      <Text color="fbErrorSurface">{errorMessage}</Text>
    </Box>
  );
}
```

### Capturar focus/blur (agnóstico de projeto)

React Native não tem `:focus` de CSS — o padrão universal é: estado local booleano ligado a `onFocus`/`onBlur`, usado pra derivar estilo. Funciona em qualquer input customizado, qualquer lib de UI, qualquer plataforma.

### Border: boa prática já aplicada aqui

A **largura** da borda (`borderWidth: 2`) é constante nos três estados (default/foco/erro) — só a **cor** muda. Evita um bug clássico: mudar a largura no foco faz a caixa "pular" 1-2px, porque borda ocupa espaço de layout. Prioridade de cor também está certa — erro > foco > default, a mensagem de erro nunca some só porque o campo está focado.

### Onde quebra com conteúdo/uso real — dois pontos concretos

1. **`style` do consumidor é descartado silenciosamente.** `{...textInputProps}` é espalhado *antes* de um `style={{...}}` fixo — o `style` explícito, por vir depois, **sobrescreve** (não mescla) qualquer `style` que o chamador passe. Em `sign-in.tsx`, `style={styles.input}` hoje não faz nada — código morto. Correção padrão, portável pra qualquer wrapper de input nativo:
   ```tsx
   const { style, ...rest } = textInputProps;
   <RNTextInput {...rest} style={[defaultStyle, style]} /> // array de estilos: RN mescla, o último vence
   ```
2. **Falta `forwardRef`.** O componente não encaminha `ref` pro `RNTextInput` interno — bloqueia focar o próximo campo ao apertar "next" no teclado (aula 14) e o React Hook Form focar o primeiro campo inválido após validar (aula 12). Sem isso, qualquer uma das duas features exige reescrever o componente depois:
   ```tsx
   export const TextInput = forwardRef<RNTextInput, TextInputProps>(
     ({ label, errorMessage, ...props }, ref) => (/* ... <RNTextInput ref={ref} {...props} /> */)
   );
   ```

### Outras boas práticas presentes

- **Import nativo renomeado** (`RNTextInput`/`RNTextInputProps`) — o componente do projeto pode se chamar `TextInput` sem colidir com o import do React Native. Padrão limpo pra qualquer wrapper de componente nativo.
- **Espaço da mensagem de erro sempre reservado** (o `Text` de erro renderiza mesmo vazio) — evita que o formulário "pule" de altura quando um erro aparece/some. Prática recomendada em qualquer formulário, intencional ou não aqui.
- **Paleta de cores de feedback** (`fbErrorSurface`/`fbSuccessSurface`/`fbWarningSurface`/`fbInfoSurface`) entrou no tema pensando em reuso — os mesmos tokens devem servir tanto pra borda de erro do input quanto pro Toast da aula 17.

## 6. Componente Button

**Status: implementado.** Mapa de variantes tipado (`Record<Variant, Config>`) — o mesmo formato usado por shadcn/ui, Stitches etc., aqui aplicado ao Restyle:

```tsx
type ButtonVariant = "primary" | "secondary";

const buttonColors: Record<ButtonVariant, { backgroundColor: ThemeColors; textColor: ThemeColors }> = {
  primary: { backgroundColor: "primary", textColor: "text" },
  secondary: { backgroundColor: "gray1", textColor: "text" },
};

export function Button({ title, onPress, variant = "primary", ...toProps }: ButtonProps) {
  const buttonProps = buttonColors[variant];
  return (
    <TouchableOpacityBox {...toProps} onPress={onPress} backgroundColor={buttonProps.backgroundColor}>
      <Text color={buttonProps.textColor}>{title}</Text>
    </TouchableOpacityBox>
  );
}
```

### Por que `Record<Variant, Config>` (e não `if`/`switch`) — o motivo é o compilador

`Record<ButtonVariant, Config>` obriga o objeto a ter **exatamente** uma entrada por valor do union — nem a mais, nem a menos. Isso vale em qualquer projeto TS, com ou sem lib de estilo:

```ts
type ButtonVariant = "primary" | "secondary" | "danger"; // adiciona "danger"

const buttonColors: Record<ButtonVariant, Config> = {
  primary: { /* ... */ },
  secondary: { /* ... */ },
  // ERRO de compilação: falta "danger" — TS avisa antes de rodar o app
};
```

Um `if`/`switch` não avisa sozinho se um caso for esquecido, a menos que se adicione uma checagem manual de exaustividade (`never`):

```ts
function getButtonColors(variant: ButtonVariant): Config {
  switch (variant) {
    case "primary": return { /* ... */ };
    case "secondary": return { /* ... */ };
    default:
      const _exhaustive: never = variant; // erro de compilação se sobrar algum caso
      throw new Error(`variant não tratado: ${variant}`);
  }
}
```

O objeto entrega essa garantia de graça; o `switch` exige o truque `never` pra ter a mesma segurança — por isso a maioria das libs de UI usa objeto, não `if`/`switch`.

### Generalizando, sem nenhuma lib de estilo

Tirando o Restyle da equação, o formato do padrão é sempre este:

```ts
type VariantStyles<Variant extends string, Style> = Record<Variant, Style>;

function resolveVariant<Variant extends string, Style>(
  styles: VariantStyles<Variant, Style>,
  variant: Variant
): Style {
  return styles[variant];
}

// com StyleSheet puro do React Native, zero Restyle:
const buttonStyles: VariantStyles<"primary" | "secondary", ViewStyle> = {
  primary: { backgroundColor: "blue" },
  secondary: { backgroundColor: "gray" },
};
resolveVariant(buttonStyles, "primary"); // autocomplete + exaustividade, sem nenhuma lib de tema
```

É literalmente o que `class-variance-authority` (a lib por trás do shadcn/ui) faz por baixo dos panos: o `variants` de um `cva(...)` é um `Record` desse tipo — só que a lib devolve uma função que monta `className`, em vez de props de estilo.

### Mais de um eixo de variante

Quando aparece um segundo eixo (tamanho, por exemplo), duas formas de tipar — ambas agnósticas de lib:

```ts
// 1. Record aninhado — lê melhor na maioria dos casos
const styles: Record<ButtonVariant, Record<"sm" | "md", Style>> = {
  primary: { sm: { /* ... */ }, md: { /* ... */ } },
  secondary: { sm: { /* ... */ }, md: { /* ... */ } },
};

// 2. chave composta via template literal type — evita aninhar quando os eixos interagem
type Key = `${ButtonVariant}-${"sm" | "md"}`; // "primary-sm" | "primary-md" | "secondary-sm" | "secondary-md"
const styles: Record<Key, Style> = { "primary-sm": { /* ... */ } /* ... */ };
```

### Nota (TS 4.9+): `satisfies` em vez de anotação direta

```ts
const buttonColors = {
  primary: { backgroundColor: "primary", textColor: "text" },
  secondary: { backgroundColor: "gray1", textColor: "text" },
} satisfies Record<ButtonVariant, { backgroundColor: ThemeColors; textColor: ThemeColors }>;
```

Com `: Record<...>` direto, `buttonColors.primary.backgroundColor` fica widened pra `ThemeColors` (qualquer cor do tema). Com `satisfies`, o TS valida a mesma exaustividade (mesmo erro se faltar variante), mas preserva o tipo literal inferido (`"primary"`) — útil se código mais adiante quiser inferir a partir do valor exato.

### O que o `Button` real ganha de graça, e o que falta

- **Ganha de graça:** `ButtonProps` estende `TouchableOpacityBoxProps` (que já inclui as props de espaçamento do Restyle), então `mt="s20"` (usado em `sign-in.tsx`) passa direto pelo `...toProps` sem o `Button` precisar redeclarar nada — extensão de tipo em vez de repetição de props.
- **Falta:** variante de `loading`/`disabled` — o botão de sign-in já tem `isLoading` disponível em `useAuthSignIn()` (aula 13) que ainda não é usado pra desabilitar o botão ou mostrar um spinner. Fica pra quando o formulário de verdade (aulas 11-12) entrar em cena.

## 7. Tela de Sign-in

**Status: implementado.** A tela agora é 100% composta pelos primitivos das aulas anteriores (`Screen`, `Text`, `TextInput`, `Button`) mais uma logo. O ponto mais reaproveitável da aula, só que é sobre imagem, não sobre a tela em si.

### Imagens com densidade de tela (`@2x`/`@3x`) — o principal aprendizado, agnóstico de RN

Três arquivos foram adicionados: `logo.png`, `logo@2x.png`, `logo@3x.png`. Isso não é convenção do projeto — é um mecanismo do **Metro bundler** (RN/Expo): ao fazer `require("./logo.png")`, o Metro escaneia a mesma pasta por `logo@2x.png`/`logo@3x.png` e, em tempo de execução, escolhe o arquivo certo pra densidade de tela do device (`PixelRatio`) — sem nenhum código extra.

```tsx
<Image
  source={require("../assets/images/logo.png")}
  style={{ width: 150, height: 60 }} // tamanho "lógico" — sempre o do arquivo @1x
/>
```

**A regra que confunde todo mundo:** o `style={{ width, height }}` é sempre o tamanho do arquivo **@1x** (aqui, `logo.png` deve medir exatamente 150×60px). `logo@2x.png` deve ser 300×120px, `logo@3x.png` 450×180px — arquivos maiores não fazem a imagem **aparecer** maior na tela, só mais **nítida** em telas de maior densidade. RN escolhe o arquivo, mas quem manda no tamanho exibido é sempre o `style`. Se um dos três arquivos não seguir a proporção exata (2x/3x do base), a imagem sai esticada — e só nos devices que carregam aquele arquivo específico, o que torna o bug fácil de não pegar testando num simulador só.

**O mesmo princípio, fora do RN (agnóstico de fato):**
- iOS nativo: Asset Catalog com sufixos `@2x`/`@3x` — mesmíssima convenção.
- Android nativo: pastas por densidade (`drawable-mdpi`, `-hdpi`, `-xhdpi`...) em vez de sufixo, mesma ideia.
- Web: `srcset`/`sizes` no `<img>`, ou `image-set()` no CSS — o browser escolhe a resolução.

Em todos os casos: **tamanho lógico fixo, várias densidades de arquivo, a plataforma escolhe qual arquivo carregar** — desacopla "quão grande aparece" de "quão nítido aparece". Escape hatch pra ícones/logos vetoriais: SVG (`react-native-svg` no RN) é resolução-independente por natureza e não precisa desse jogo de 3 arquivos — só faz sentido pra imagem raster (foto, logo com gradiente/textura).

### Boas práticas de composição da tela

- **Texto aninhado pra estilizar um trecho da frase** — em vez de dois componentes lado a lado com flexbox manual, `<Text>` dentro de `<Text>` deixa o RN tratar a frase como um único bloco e só o trecho interno herda um estilo diferente:
  ```tsx
  <Text color="gray2">
    Ainda não tem uma conta?{" "}
    <Text variant="title14" color="primary">Criar</Text>
  </Text>
  ```
  É o padrão idiomático do RN pra "destacar uma palavra dentro de uma frase" — equivalente a aninhar um `<span>` dentro de texto no HTML.
- **Ponto ainda em aberto (herdado da aula 5):** os dois `TextInput` desta tela continuam recebendo `style={styles.input}`, que — como documentado na seção 5 — é descartado silenciosamente pelo componente. Ainda não foi corrigido; o `StyleSheet` local virou código morto de fato.

## 8. Componentes Header e Logo

**Status: implementado.** Extraiu `Logo` e `Header` de dentro de `sign-in.tsx`, e criou os esqueletos de `sign-up.tsx`/`reset-password.tsx` reusando os dois. Boa aula pra falar de **quando** e **como** extrair um componente.

### Quando extrair: na segunda ocorrência, não na primeira

`Logo` era um bloco de `<Image source={...} style={{...}}/>` só dentro de `sign-in.tsx`. Só virou componente quando `sign-up`/`reset-password` precisaram do mesmo bloco — **extrair no primeiro uso é abstração prematura** (você ainda não sabe o que varia entre os usos); extrair na segunda ou terceira repetição é o ponto em que o padrão já apareceu de verdade. Regra agnóstica de qualquer projeto/framework: componentizar por *repetição observada*, não por antecipação.

```tsx
// src/ui/containers/Logo.tsx
export function Logo() {
  return <Image source={require("../../../assets/images/logo.png")} style={{ width: 150, height: 60, marginTop: 20, marginBottom: 60 }} />;
}
```

**O que a extração perdeu:** `Logo` não recebe nenhuma prop — todo o espaçamento (`marginTop`/`marginBottom`) ficou fixo dentro do componente. Em `sign-up.tsx`/`reset-password.tsx`, o `<Logo/>` acabou posicionado **depois** do `Button` no JSX (aparece embaixo na tela), enquanto em `sign-in.tsx` ele é o primeiro elemento (aparece no topo) — inconsistência visual entre telas que usam o mesmo componente. Fix comum, portável: aceitar `BoxProps`/`style` como prop (mesmo raciocínio da aula 5 — mesclar, não fixar) e decidir a posição no JSX de cada tela, não dentro do componente.

### Componente com layout de duas pontas — o bug clássico do `space-between`

```tsx
export function Header({ title }: HeaderProps) {
  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center">
      <IconButton iconName="Chevron-left" onPress={router.back} />
      <Text variant="title16">{title}</Text>
    </Box>
  );
}
```

Boa composição (dois primitivos prontos, `IconButton` + `Text`), mas `justifyContent="space-between"` com só dois filhos empurra cada um pra uma ponta — o título fica colado na borda direita, não centralizado entre o ícone e a borda, que é o layout convencional de header (ícone à esquerda, título centralizado). Isso é agnóstico de qualquer framework baseado em flexbox (web incluso): **`space-between` só "centraliza" visualmente quando os itens nas duas pontas têm larguras simétricas** — aqui não têm. Duas correções comuns:

```tsx
// 1. Spacer invisível do mesmo tamanho do ícone, como 3º filho
<Box flexDirection="row" alignItems="center">
  <IconButton .../>
  <Text flex={1} textAlign="center">{title}</Text>
  <Box width={24} /> {/* mesma largura do IconButton, invisível */}
</Box>

// 2. Título absoluto, ignorando o fluxo dos irmãos
<Box flexDirection="row" alignItems="center">
  <IconButton .../>
  <Text position="absolute" left={0} right={0} textAlign="center">{title}</Text>
</Box>
```

### `asChild` — deixar o filho decidir o visual, o componente pai só injeta comportamento

```tsx
<Link href="/reset-password" asChild>
  <Text color="primary">Esqueceu sua senha</Text>
</Link>
```

`asChild` diz ao `Link` (expo-router) para **não** renderizar seu próprio elemento (normalmente um wrapper clicável) e, em vez disso, clonar o comportamento de navegação/acessibilidade direto no filho único que você passar — aqui, um `Text` estilizado, sem precisar envolver tudo num wrapper extra. É o mesmo padrão `asChild` popularizado pelo Radix UI: qualquer componente que precise injetar comportamento (navegação, foco, ARIA) sem forçar sua própria tag/wrapper na árvore. Vale procurar esse nome em outras libs "headless" (Radix, React Aria) — é o mesmo conceito, não é exclusivo de rotas.

### Esqueleto de tela antes da lógica

`sign-up.tsx`/`reset-password.tsx` nasceram só com `Header` + `Button` (`onPress` vazio) + `Logo` — a casca visual de cada tela pronta antes de existir qualquer operação de fato (`useAuthSignUp`, `useResetPassword`, aulas 10/13). É uma sequência de trabalho válida: fechar a estrutura visual da tela primeiro, plugar o caso de uso depois — desde que o caso de uso, quando chegar, não force reescrever a estrutura.

## 9. Tela Reset Password

**Status: implementado.** Generalizou o `<Link asChild>` da aula 8 num componente `TextLink`, reusado em dois contextos com **intenções de navegação diferentes** — esse é o ponto central da aula.

```tsx
export function TextLink({ text, ctaText, href, goBackOnPress }: TextLinkProps) {
  function handleOnPress() {
    if (href) {
      router.navigate(href);
    } else if (goBackOnPress) {
      router.back();
    }
  }
  return (
    <Pressable onPress={handleOnPress}>
      <Text>{text} <Text color="primary">{ctaText}</Text></Text>
    </Pressable>
  );
}

// sign-in → sign-up: destino novo, sem relação de "voltar"
<TextLink href="/sign-up" text="Ainda não tem uma conta?" ctaText="Criar" />

// reset-password → sign-in: aqui o usuário JÁ VEIO do sign-in
<TextLink goBackOnPress text="Lembrou sua senha?" ctaText="Voltar para o login" />
```

### O trade-off: `navigate(destino)` vs. `back()` — duas intenções diferentes, não uma escolha estética

Os dois fazem o usuário "sair da tela atual", mas resolvem problemas diferentes, em **qualquer** sistema de navegação (React Navigation, Next.js, `History.back()` do browser, pilha nativa de iOS/Android — não é conceito específico do expo-router):

| | `navigate(destino)` / `push` | `back()` / `pop` |
|---|---|---|
| Quando usar | Destino novo, sem relação com o histórico | Retornar pra tela de onde o usuário **já veio** |
| Pilha de navegação | Empilha uma entrada nova (ou resolve a rota) | Remove a entrada atual, revela a de baixo |
| Animação | Transição "pra frente" (padrão da plataforma) | Transição "de volta" (o inverso) |
| Estado da tela de destino | Pode montar uma instância **nova** (estado perdido) | Reaproveita a instância que já existia (estado preservado) |

**Por que isso importa na prática:** se "Lembrou sua senha?" usasse `router.navigate("/sign-in")` em vez de `router.back()`, três problemas apareceriam ao mesmo tempo — exatamente o "parece que substitui" descrito: (1) uma nova instância de `sign-in` seria empilhada por cima da anterior, então o botão de voltar nativo (ou gesto) precisaria de um toque a mais pra realmente sair do fluxo; (2) a animação sai "pra frente" em vez de "de volta", quebrando a expectativa de quem está clicando num link que diz "voltar"; (3) se o usuário tinha digitado o e-mail no sign-in antes de ir pro reset password, essa nova instância nasce em branco — o texto digitado se perde, porque não é a mesma tela, é uma cópia nova.

**Por que não usar sempre `back()`:** porque nem toda navegação tem uma tela anterior conhecida — "Criar conta" a partir do sign-in não é "voltar" pra lugar nenhum, é ir pra um destino novo. Se alguém entrar direto em `/reset-password` via deep link (sem ter passado pelo sign-in), `back()` não teria pra onde voltar. Por isso o componente expõe as duas opções como props, em vez de escolher uma única estratégia pra todo mundo — a decisão de qual navegação usar é do consumidor do componente, não do componente.

**Ponto de robustez em aberto (conecta com a aula 6):** hoje `href` e `goBackOnPress` são duas props opcionais e independentes — nada impede passar as duas, ou nenhuma das duas (nesse caso, `handleOnPress` não faz nada, silenciosamente). O mesmo raciocínio de `Record`/exaustividade da aula 6 se aplica aqui via union discriminada, tornando os dois modos mutuamente exclusivos **em tempo de compilação**:
```ts
type TextLinkProps =
  | { text: string; ctaText: string; href: LinkProps["href"]; goBackOnPress?: never }
  | { text: string; ctaText: string; href?: never; goBackOnPress: true };
```

## 10. Reset Password Operation

**Status: implementado.** Mesma receita de Repository do módulo anterior (`IAuthRepository` ganha `sendResetPasswordEmail`, `inMemoryAuthRepository` implementa com um `console.log` — mock só pra desenvolver/testar, nunca precisa mandar e-mail de verdade em dev). O ponto novo e mais importante da aula é **onde a navegação mora**.

```ts
// src/domain/Auth/operations/useAuthSendResetPasswordEmail.ts — não importa expo-router
export function useAuthSendResetPasswordEmail(options?: UseAppMutationOptions<void>) {
  const { auth } = useRepository();
  const feedbackService = useFeedbackService();

  return useAppMutation<void, { email: string }>({
    mutateFn: ({ email }) => auth.sendResetPasswordEmail(email),
    onSuccess: () => {
      options?.onSuccess?.();               // o que o CHAMADOR quiser fazer
      feedbackService.send({ type: "success", message: "verifique sua caixa de e-mail" });
    },
    onError: (error) => {
      options?.onError?.(error);
      feedbackService.send({ type: "error", message: "error on sign" });
    },
  });
}

// app/reset-password.tsx — só aqui existe expo-router
const { mutate: sendResetEmail } = useAuthSendResetPasswordEmail({
  onSuccess: router.back, // navegação é decisão da tela, não do caso de uso
});
```

### Onde a navegação mora: fora do caso de uso, dentro de quem o chama

`useAuthSendResetPasswordEmail` não sabe que `expo-router` existe — recebe `options?: UseAppMutationOptions<void>` (o mesmo `{ onSuccess?, onError? }` que `useAppMutation` já expõe) e só repassa pra frente, além de sempre disparar o feedback genérico. Quem decide **o que acontece depois** — nesse caso, `router.back()` — é a tela, porque só a tela sabe (e deveria saber) que existe navegação. É Inversão de Controle via callback: o caso de uso expõe um "gancho" (`onSuccess`), e quem o consome injeta o comportamento concreto, em vez do caso de uso importar a lib de rota diretamente.

**Por que isso é agnóstico de framework:** é o mesmo mecanismo do `onSuccess`/`onError` do `useMutation` do TanStack Query (callback do chamador + comportamento "global" da lib, os dois disparando) — só que aqui reimplementado à mão, e com o "global" sendo o `feedbackService.send(...)` fixo dentro do caso de uso. Vale pra qualquer hook/composable/serviço que precise causar um efeito colateral que não é da sua alçada: em vez de importar o módulo que causa o efeito (router, analytics, etc.), aceitar um callback e deixar quem chama decidir.

**Inconsistência que vale registrar (conecta com a seção 2):** `useAuthSignIn` **não** segue essa regra — a navegação pós-sign-in (`router.replace("/")`) está hardcoded dentro de `AuthContext.saveAuthUser`, chamada de dentro do próprio caso de uso, não injetada pela tela. Esta aula é, na prática, o padrão que deveria ter sido aplicado lá — vale revisitar `useAuthSignIn` pra deixar as duas operações consistentes.

## 11. Formulário: Schema com Zod

**Status: implementado (schema pronto, ainda não conectado a nenhum form state).** Dois movimentos independentes nesta aula: extrair o formulário como componente próprio, e escrever a validação como schema — nenhum dos dois depende do outro pra existir.

### Formulário como fronteira de componente — a tela não sabe como o form gerencia estado

```tsx
// app/sign-up.tsx — não sabe se existe Zod, RHF, useState ou o quê
<SignUpForm onSubmit={handleSignUp} />

// src/ui/containers/SignUpForm/SignUpForm.tsx — hoje só o esqueleto
export function SignUpForm({ onSubmit }: { onSubmit: () => void }) {
  return <Box><Button title="Criar conta" onPress={onSubmit} /></Box>;
}
```

Extrair `SignUpForm` agora, **antes** de conectar React Hook Form (aula 12), é o que garante que a tela não precise mudar quando o formulário ganhar campos/validação de verdade — a tela só conhece o contrato `onSubmit`, não a implementação por trás. Agnóstico de qualquer lib de formulário (RHF, Formik, um `useState` por campo): o princípio é "o formulário é uma caixa-preta que devolve dados prontos", igual ao raciocínio de Repository/Ports & Adapters do módulo anterior, aplicado agora a um componente de UI em vez de acesso a dado. *(`onSubmit` hoje não recebe nenhum argumento — deve ganhar o payload tipado quando o RHF entrar, aula 12.)*

### Schema-first: o tipo nasce da validação, não o contrário

```ts
export const signUpSchema = z
  .object({
    fullname: z.string({ message: "campo obrigatório" }).min(5, "nome muito curto"),
    email: z.string({ message: "campo obrigatório" }).email("email inválido"),
    password: z.string({ message: "campo obrigatório" }).min(6, "no mínimo 6 caracteres"),
    confirmPassword: z.string({ message: "campo obrigatório" }).min(6, "no mínimo 6 caracteres"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "senhas devem ser iguais",
    path: ["confirmPassword"],
  });

export type SignUpSchema = z.infer<typeof signUpSchema>;
```

**O ponto central, agnóstico de Zod especificamente** (Yup faz o mesmo com `InferType`, qualquer lib "schema-first" segue essa ideia): em vez de escrever um `type SignUpSchema = {...}` manualmente e, à parte, escrever regras de validação que podem divergir do tipo com o tempo, escreve-se a validação **uma vez só**, e o tipo é **derivado** dela (`z.infer<>`). Schema e tipo nunca dessincronizam, porque um é gerado a partir do outro — fonte única de verdade, típico do estilo DDD já visto no módulo anterior aplicado aqui à camada de validação.

### Validação cruzada entre campos: o `.refine()` mora no objeto, não no campo

Um validador de campo isolado (`z.string()...`) não enxerga campos irmãos — por isso `password === confirmPassword` só pode ser checado com `.refine()` no **objeto inteiro**, depois que todos os campos já existem. O detalhe fácil de esquecer é o `path: ["confirmPassword"]`: sem ele, o erro de senhas diferentes cai num nível "geral" do formulário, não no campo `confirmPassword` — e a maioria das integrações de UI (`errors.confirmPassword?.message`, aula 12) simplesmente não mostraria nada. Esse padrão (regra de objeto + `path` apontando pro campo certo) existe do mesmo jeito em outras libs de schema (Yup usa `.test()` com `path` equivalente) — não é peculiaridade do Zod.

### Onde o arquivo mora: colocado com o form, não numa pasta compartilhada

`SignUpSchema.ts` vive dentro de `SignUpForm/`, ao lado do componente que o usa — faz sentido enquanto só esse formulário usa esse formato de dado. Se outra tela precisar validar o mesmo shape (ex.: uma tela de "completar perfil" reaproveitando `fullname`/`email`), vale mover pra um lugar compartilhado (`src/domain/**` ou uma pasta `schemas/`) — mesma decisão de "onde a interface mora" já discutida no módulo anterior (repository, `IFeedbackService`), agora aplicada a schemas de validação.

## 12. Formulário com React Hook Form

*(placeholder — gerenciamento de estado de formulário sem re-render por tecla digitada; integração esperada com o schema Zod da aula 11 via resolver.)*

## 13. Sign Up Operation

*(placeholder — mesmo padrão de `useAuthSignIn`/`useAuthSignOut`: um `useAuthSignUp` sobre `useAppMutation`.)*

## 14. Formulário e Teclado

*(placeholder — comportamento de teclado em formulários mobile: `KeyboardAvoidingView`/scroll, não é decisão de arquitetura mas afeta UX de formulário diretamente.)*

## 15. Supabase Auth Repository

*(placeholder — mesmo movimento da seção 7 do módulo anterior: `SupabaseAuthRepository implements IAuthRepository`, substituindo o `inMemoryAuthRepository` que hoje está até no composition root do Supabase — ver arquitetura-frontend.md, seção 12.)*

## 16. Redefinição de Senha

*(placeholder)*

## 17. Feedback com Toast Component

*(placeholder — provavelmente um novo adapter de `IFeedbackService` — um `ToastFeedback` ao lado de `AlertFeedback`/`ConsoleFeedback` já existentes, trocado no mesmo Composition Root.)*

---

## Comparações rápidas

| Tema | Problema que resolve | Estado neste projeto |
|---|---|---|
| Context para DI (`Repositories`, `IFeedbackService`) | Injetar uma implementação trocável de uma interface | Implementado (módulo anterior) |
| Context para estado compartilhado (`AuthContext`) | Compartilhar dado que muda em runtime entre telas | Implementado — `authUser`/`isReady` |
| Flag `isReady` / hidratação de sessão | Evitar redirect errado antes do storage carregar | Implementado em `app/(protected)/_layout.tsx` |
| DIP em storage (`IStorage`) | Trocar `AsyncStorage` sem tocar em `AuthContext` | Implementado — `IStorage`/`StorageContext`/adapter `AsyncStorage` |
| Ordem de Providers dependentes | `AuthProvider` usa `useStorage()` por dentro | `StorageProvider` envolve `AuthProvider` no composition root |
| Splash Screen ligada à hidratação | Evitar tela em branco enquanto storage carrega | Implementado — `SplashScreen.hide()` só quando `isReady` |
| Navegação dentro do domínio (`router.replace` em `AuthContext`) | — | Ponto em aberto, mesmo tipo de discussão do `IFeedbackService` |
| Focus/blur em input customizado | Estilizar estado de foco sem `:focus` de CSS | Implementado (`onFocus`/`onBlur` + estado local) |
| `style` mesclado vs. sobrescrito | Deixar o consumidor customizar o wrapper | Bug: `style` do chamador é descartado (sobrescrito, não mesclado) |
| `forwardRef` em componente de input | Focar campo programaticamente (próximo campo, campo inválido) | Faltando — vai doer nas aulas 12 e 14 |
| `Record<Variant, Config>` para variantes | Exaustividade garantida pelo compilador, sem `if`/`switch` | Implementado no `Button` — mesma ideia do shadcn/ui e do `cva` |
| Loading/disabled no Button | Feedback visual de mutation em andamento | Faltando — `isLoading` de `useAuthSignIn` ainda não é consumido |
| Imagem multi-densidade (`@2x`/`@3x`) | Nitidez em qualquer tela sem inflar o tamanho exibido | Implementado (`logo.png`/`@2x`/`@3x`) — Metro escolhe o arquivo, `style` define o tamanho lógico |
| Texto aninhado (`<Text><Text/></Text>`) | Estilizar um trecho dentro de uma frase | Implementado em "Ainda não tem uma conta? Criar" |
| Extrair componente na 2ª ocorrência | Evitar abstração prematura | `Logo` extraído só quando 2 telas repetiram o bloco — mas ficou sem props de espaçamento |
| `space-between` com 2 filhos assimétricos | Título "centralizado" num header | Bug: `Header` cola o título na borda direita em vez de centralizar |
| `asChild` (Link/Radix/React Aria) | Injetar comportamento sem forçar wrapper próprio | Implementado no `Link` de "Esqueceu sua senha"/"Criar" |
| `navigate()` vs. `back()` | Ir pra um destino novo vs. retornar de onde veio | Implementado via props (`href`/`goBackOnPress`) no `TextLink` |
| Union discriminada pra props mutuamente exclusivas | Impedir combinação inválida de props em tempo de compilação | Pendente no `TextLink` (`href`/`goBackOnPress` ainda são independentes) |
| Navegação injetada via callback (IoC) | Manter caso de uso sem depender de `expo-router` | Implementado em `useAuthSendResetPasswordEmail` (`onSuccess: router.back`) |
| Consistência entre casos de uso | Mesma regra aplicada em todas as mutations de Auth | Pendente: `useAuthSignIn` ainda hardcoda `router.replace` dentro de `AuthContext` |
| Formulário como caixa-preta | Tela não conhece a lib de form state por trás | Implementado: `SignUpForm` recebe só `onSubmit` |
| Schema-first (`z.infer`) | Tipo e validação nunca dessincronizam | Implementado em `signUpSchema`/`SignUpSchema` |
| Validação cruzada (`.refine` + `path`) | Erro aparece no campo certo, não no formulário todo | Implementado (`password` === `confirmPassword`) |

## Glossário

- **Context para DI vs. Context para estado:** mesmo `createContext`, dois papéis diferentes — um guarda uma *implementação* trocável (ver módulo de arquitetura); o outro guarda um *valor* que muda com o tempo.
- **Hidratação de sessão (session hydration):** processo assíncrono de carregar a sessão persistida antes de decidir se o usuário está logado; sem uma flag de "pronto", a UI decide cedo demais.
- **Storage como Port genérico (`IStorage`):** em vez de uma interface por feature (`IAuthStorage`), uma única porta key-value reutilizável por qualquer parte do app que precise persistir algo.
- **Ordem de composition root:** quando um Provider usa o hook de outro por dentro, ele precisa estar aninhado dentro do Provider do qual depende — a ordem reflete o grafo de dependência, não a ordem de criação dos módulos.
- **`forwardRef`:** técnica do React para expor a instância/nó interno de um componente wrapper ao componente pai — essencial em inputs customizados que precisam ser focados programaticamente por fora.
- **Style merge vs. override:** ao aceitar `style` via props num wrapper, usar array (`style={[default, style]}`) para mesclar; um `style={{...}}` fixo depois de um spread sempre sobrescreve, nunca mescla.
- **`Record<K, V>` para variantes:** força um valor por chave do union, sem faltar nem sobrar — exaustividade garantida em tempo de compilação, sem precisar do truque `never` que um `switch` exigiria.
- **`satisfies` (TS 4.9+):** valida um objeto contra um tipo (mesma exaustividade de uma anotação `: Tipo`) sem alargar o tipo literal inferido de cada valor.
- **Densidade de tela (`@2x`/`@3x`, `srcset`, drawable buckets):** convenção de nomear/organizar múltiplas resoluções do mesmo asset, mantendo o tamanho lógico fixo — a plataforma escolhe o arquivo, não o desenvolvedor.
- **Regra das 2-3 ocorrências:** extrair um componente/função quando o mesmo bloco aparece pela segunda ou terceira vez, não na primeira — evita abstrair em cima de uma amostra de tamanho 1.
- **`asChild` (padrão headless):** um componente de comportamento (navegação, foco, ARIA) que clona suas props/eventos no filho único fornecido, em vez de renderizar seu próprio wrapper — popularizado pelo Radix UI, também usado pelo expo-router.
- **`navigate`/`push` vs. `back`/`pop`:** duas intenções de navegação diferentes em qualquer sistema de rotas (não só expo-router) — ir pra um destino novo (empilha, pode perder estado) vs. retornar de onde veio (desempilha, preserva estado e usa a animação inversa).
- **Inversão de Controle via callback (`onSuccess`/`onError`):** uma função/hook reutilizável aceita um callback pra um efeito colateral que não é da sua responsabilidade (navegação, analytics), em vez de importar o módulo que causa esse efeito — quem chama decide o comportamento concreto.
- **Schema-first:** escrever a validação (Zod/Yup/etc.) uma vez e derivar o tipo TS dela (`z.infer`), em vez de manter tipo e validação como duas fontes de verdade separadas.
- **Validação cruzada:** regra que depende de mais de um campo (ex.: confirmação de senha) só pode viver no nível do objeto/form inteiro, nunca num validador de campo isolado — e precisa apontar explicitamente (`path`) pra qual campo o erro pertence.
