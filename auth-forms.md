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

*(placeholder)*

## 7. Tela de Sign-in

*(placeholder — a versão atual de `app/sign-in.tsx`, do módulo anterior, já chama `useAuthSignIn`, mas ainda com `TextInput`/`Button` genéricos do React Native, não os componentes de UI que devem surgir nas aulas 5-6.)*

## 8. Componentes Header e Logo

*(placeholder)*

## 9. Tela Reset Password

*(placeholder)*

## 10. Reset Password Operation

*(placeholder)*

## 11. Formulário: Schema com Zod

*(placeholder — validação declarativa de formulário via schema, independente de UI: o mesmo schema pode validar o form E o payload antes de enviar pro repositório.)*

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

## Glossário

- **Context para DI vs. Context para estado:** mesmo `createContext`, dois papéis diferentes — um guarda uma *implementação* trocável (ver módulo de arquitetura); o outro guarda um *valor* que muda com o tempo.
- **Hidratação de sessão (session hydration):** processo assíncrono de carregar a sessão persistida antes de decidir se o usuário está logado; sem uma flag de "pronto", a UI decide cedo demais.
- **Storage como Port genérico (`IStorage`):** em vez de uma interface por feature (`IAuthStorage`), uma única porta key-value reutilizável por qualquer parte do app que precise persistir algo.
- **Ordem de composition root:** quando um Provider usa o hook de outro por dentro, ele precisa estar aninhado dentro do Provider do qual depende — a ordem reflete o grafo de dependência, não a ordem de criação dos módulos.
- **`forwardRef`:** técnica do React para expor a instância/nó interno de um componente wrapper ao componente pai — essencial em inputs customizados que precisam ser focados programaticamente por fora.
- **Style merge vs. override:** ao aceitar `style` via props num wrapper, usar array (`style={[default, style]}`) para mesclar; um `style={{...}}` fixo depois de um spread sempre sobrescreve, nunca mescla.
