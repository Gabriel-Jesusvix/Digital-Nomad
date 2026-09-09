# Autenticação e Formulários — Guia de Estudo

> Refinado ao final do módulo "Autenticação e Formulários". Organizado por **conceito**, não por aula — é assim que vale guardar isso na cabeça: um problema, o mecanismo por trás, o trade-off, e como replicar em outro projeto. Continua de onde [arquitetura-frontend.md](arquitetura-frontend.md) parou (Repository, DIP, Ports & Adapters); um mapa aula → seção fica no fim, pra rastreabilidade.

## Índice

1. [Sessão: Context como estado, não como DI](#1-sessão-context-como-estado-não-como-di)
2. [Ports & Adapters em toda camada](#2-ports--adapters-em-toda-camada)
3. [Composition Root: ordem e troca de implementação](#3-composition-root-ordem-e-troca-de-implementação)
4. [O bug recorrente de Context](#4-o-bug-recorrente-de-context)
5. [TextInput: foco, borda, e como não quebrar um wrapper](#5-textinput-foco-borda-e-como-não-quebrar-um-wrapper)
6. [Button: variantes tipadas](#6-button-variantes-tipadas)
7. [Layout e assets: bugs comuns de flexbox e imagem](#7-layout-e-assets-bugs-comuns-de-flexbox-e-imagem)
8. [Componentização: quando extrair, o que custa](#8-componentização-quando-extrair-o-que-custa)
9. [Navegação é decisão da tela, não do domínio](#9-navegação-é-decisão-da-tela-não-do-domínio)
10. [Formulário schema-first: Zod → RHF → operação](#10-formulário-schema-first-zod--rhf--operação)
11. [TypeScript por baixo dos panos: onde a garantia para](#11-typescript-por-baixo-dos-panos-onde-a-garantia-para)
12. [Segurança em fluxo de auth com redirect](#12-segurança-em-fluxo-de-auth-com-redirect)
13. [Tabela de trade-offs](#13-tabela-de-trade-offs)
14. [Mapa aula → conceito](#14-mapa-aula--conceito)
15. [Glossário](#glossário)

---

## 1. Sessão: Context como estado, não como DI

`createContext` serve pra duas coisas bem diferentes, e a confusão entre elas é a fonte de vários bugs deste módulo: **injetar uma implementação trocável** (`RepositoryContext`, `FeedbackContext`, `StorageContext` — módulo anterior) ou **compartilhar estado que muda em runtime** (`AuthContext` — usuário logado ou não). Mesmo primitivo, papel arquitetural oposto.

**O mecanismo que toda sessão persistida precisa — hidratação:** ler storage é assíncrono, então no primeiro render `authUser` ainda não existe, mesmo que o usuário esteja logado. Sem uma flag de "ainda não terminei de checar", o gate de rota decide errado por uma fração de segundo, todo boot:

```tsx
const { isReady, authUser } = useAuth();
if (!isReady) return null;               // ainda checando storage — não decide nada
if (!authUser) return <Redirect href="/sign-in" />;
```

A Splash Screen nativa (`SplashScreen.preventAutoHideAsync()` + `.hide()` só quando `isReady`) é a versão "de produção" desse mesmo gate — cobre a janela de leitura do storage com uma UI de espera de verdade, em vez de piscar tela em branco. **Padrão reaplicável em qualquer stack com sessão persistida**, independente de lib de auth.

## 2. Ports & Adapters em toda camada

O fio condutor dos dois módulos: uma **interface** (porta) que o app conhece, e **implementações concretas** (adapters) que ele não conhece, trocadas via Context num único ponto (Composition Root). Neste módulo, a mesma receita aparece quatro vezes:

| Porta | Adapters | Quem a define |
|---|---|---|
| `IStorage` (key-value genérico) | `AsyncStorage`, (futuro) `SecureStorage` | este projeto |
| `IAuthRepository` | `inMemoryAuthRepository` (classe), `SupabaseAuthRepository` (classe) | este projeto |
| `IFeedbackService` | `AlertFeedback`, `ConsoleFeedback`, `ToastFeedback` (3 objetos) | este projeto |
| "resolver" de formulário | `zodResolver`, `yupResolver`, `joiResolver` | React Hook Form |

O último caso é o mais importante de internalizar: **nem toda porta é sua** — RHF define o contrato de resolver, você só entra com o adapter certo pra Zod. Reconhecer "isso aqui é uma porta de uma lib" evita reinventar a mesma abstração.

**Classe vs. objeto de funções pro mesmo contrato:** `SupabaseAuthRepository` é uma `class`; `SupabaseCityRepository` é um objeto com funções soltas. Tipagem estrutural garante que os dois satisfazem a interface do mesmo jeito — a escolha é estilística **a menos que** exista estado/config por instância (client HTTP configurado no `constructor`, múltiplas instâncias com config diferente em teste). Sem isso, classe só adiciona boilerplate. E tem um risco concreto do lado da classe: dá pra escrever `campo: Tipo;` sem nunca implementar (`TS2564`, "no initializer"), e isso *parece* progresso sem ser — um objeto literal implementando a mesma interface acusaria "property is missing" na hora, na cara. Regra prática: **prefira objeto/função quando não há estado; se usar classe, desconfie de qualquer membro sem `=` na declaração.**

## 3. Composition Root: ordem e troca de implementação

O troco de todo esse desenho: mudar toda a fonte de dados/comportamento do app trocando o `value` de um Provider, sem tocar em tela nem caso de uso.

```tsx
<RepositoryProvider value={SupabaseRepositories}> {/* era InMemoryRepository */}
```

**Regra que ninguém lembra até quebrar:** quando um Provider usa o hook de outro por dentro (`AuthProvider` chama `useStorage()`), a ordem de aninhamento não é livre — o Provider dependido tem que envolver o dependente:

```tsx
<StorageProvider storage={AsyncStorage}>
  <AuthProvider>            {/* usa useStorage() por dentro */}
    <FeedbackProvider value={ToastFeedback}>
      <RepositoryProvider value={SupabaseRepositories} />
    </FeedbackProvider>
  </AuthProvider>
</StorageProvider>
```

Monte o composition root seguindo o **grafo de dependência** entre Providers, não a ordem cronológica em que os módulos foram criados.

## 4. O bug recorrente de Context

Apareceu **quatro vezes** neste código (`Repositories`, `Feedback`, `Auth`, `Storage`) — o suficiente pra virar item de checklist, não coincidência:

```ts
const Context = createContext<T>({} as T); // ou até um objeto "válido" completo
function useX() {
  const ctx = use(Context);
  if (!ctx) throw new Error("deve estar dentro do Provider"); // nunca dispara
  return ctx;
}
```

Qualquer valor default (mesmo um objeto completo e "correto") é **truthy** — o guard só funciona se o default for `undefined`/`null`. Fix de uma vez só, reusável em qualquer Context novo:

```ts
function createRequiredContext<T>(name: string) {
  const Context = createContext<T | undefined>(undefined);
  function useRequired(): T {
    const ctx = use(Context);
    if (!ctx) throw new Error(`${name} must be used within its Provider`);
    return ctx;
  }
  return [Context, useRequired] as const;
}
```

**Checklist mental pra qualquer projeto:** todo `createContext` novo — o default é `undefined`? Se não, o guard é decorativo.

## 5. TextInput: foco, borda, e como não quebrar um wrapper

Foco/blur sem `:focus` de CSS é sempre o mesmo mecanismo — estado local + `onFocus`/`onBlur` derivando estilo. Vale pra qualquer input customizado, qualquer plataforma.

**Boa prática confirmada:** largura da borda constante entre estados (só a cor muda) evita o "pulo" de 1-2px quando o foco entra/sai — mudar largura desloca layout, mudar cor não.

**Dois jeitos reais de um wrapper de input quebrar, ambos portáveis pra qualquer wrapper de componente nativo:**

```tsx
// 1. style do consumidor descartado — spread antes de um style fixo sempre perde
const { style, ...rest } = props;
<RNTextInput {...rest} style={[defaultStyle, style]} />  // array: RN mescla, não sobrescreve

// 2. sem forwardRef — bloqueia foco programático (próximo campo, campo inválido)
export const TextInput = forwardRef<RNTextInput, Props>((props, ref) => (
  /* ... */ <RNTextInput ref={ref} {...props} />
));
```

**Calibrando o item 2:** `Controller` do React Hook Form não precisa de `forwardRef` pra ligar valor/erro (usa `field.value`/`onChange`, não `ref`) — a falta só dói quando o objetivo é foco programático de verdade (avançar campo no teclado, focar o primeiro inválido). Não assuma que falta de `ref` bloqueia tudo; identifique exatamente qual funcionalidade depende dela.

## 6. Button: variantes tipadas

```ts
const buttonColors: Record<ButtonVariant, Config> = {
  primary: { /* ... */ },
  secondary: { /* ... */ },
  // esquecer uma variante aqui = erro de compilação, não bug em produção
};
```

`Record<Variant, Config>` obriga uma entrada por valor do union — **o compilador** garante exaustividade, algo que um `if`/`switch` só ganha com o truque manual `const _exhaustive: never = variant`. É por isso que praticamente toda lib de variantes de UI (shadcn/ui + `class-variance-authority`, Stitches) usa objeto, não branching.

**Versão 100% agnóstica de lib de estilo:**

```ts
function resolveVariant<V extends string, S>(styles: Record<V, S>, variant: V): S {
  return styles[variant];
}
```

Isso é literalmente o que `cva` faz por baixo — só que devolve `className` em vez de props de estilo. **Mais de um eixo de variante:** `Record` aninhado (`Record<Variant, Record<Size, Style>>`) lê melhor na maioria dos casos; chave composta via template literal type (`` `${Variant}-${Size}` ``) evita aninhar quando os eixos interagem de forma não-trivial. **`satisfies` (TS 4.9+)** troca a anotação direta quando você quer a mesma exaustividade sem alargar o tipo literal inferido de cada valor.

## 7. Layout e assets: bugs comuns de flexbox e imagem

**`space-between` com dois filhos assimétricos não centraliza nada** — empurra cada um pra uma ponta. Um header com ícone + título precisa de um terceiro elemento (spacer do tamanho do ícone) ou posicionamento absoluto pro título ficar realmente centralizado. Isso é matemática de flexbox, não bug de RN — vale pra qualquer framework baseado em flex, web incluso.

**Imagem multi-densidade (`@2x`/`@3x`):** o `style={{width,height}}` do `<Image>` é sempre o tamanho do arquivo `@1x` — arquivos maiores não aumentam o tamanho exibido, só a nitidez em telas de maior densidade. Metro escolhe o arquivo pelo `PixelRatio` do device; você controla o tamanho pelo `style`. O mesmo princípio existe fora do RN: Asset Catalog `@2x`/`@3x` no iOS nativo, pastas `drawable-*dpi` no Android, `srcset`/`image-set()` na web — **tamanho lógico fixo, várias densidades de arquivo, a plataforma escolhe**. SVG sidesteps o problema inteiro por ser resolução-independente.

**Texto aninhado** (`<Text>texto <Text color="primary">destaque</Text></Text>`) é o padrão idiomático do RN pra estilizar um trecho dentro de uma frase — equivalente a um `<span>` aninhado no HTML, evita layout manual com dois componentes lado a lado.

## 8. Componentização: quando extrair, o que custa

**Regra das 2-3 ocorrências:** extrair um componente na primeira aparição é abstração prematura (você ainda não sabe o que varia entre usos); extrair na segunda/terceira repetição observada é o ponto certo. Agnóstico de framework — vale pra função, hook, componente, schema.

**O que a extração cobra, se malfeita:** um componente extraído sem props de configuração (`Logo` sem `style`/spacing) fica com posição/espaçamento hardcoded — o resultado real aqui foi inconsistência entre telas (`Logo` no topo numa tela, embaixo em outra, porque cada consumidor só podia controlar a ORDEM no JSX, não o espaçamento). Ao extrair, pergunte: "o que varia entre os usos que já existem?" e exponha isso como prop, não fixe.

**`asChild`** (usado no `<Link asChild>`): um componente de comportamento (navegação, foco, ARIA) clona suas props/eventos no filho único fornecido, em vez de renderizar seu próprio wrapper. Mesmo padrão do Radix UI e React Aria — reconhecer o nome ajuda a entender qualquer lib "headless".

**Esqueleto antes da lógica** é sequência de trabalho válida: fechar a casca visual de uma tela (Header + Button vazio + Logo) antes de existir o caso de uso real, desde que o caso de uso, quando chegar, não force reescrever a estrutura.

## 9. Navegação é decisão da tela, não do domínio

Duas intenções de navegação diferentes, em **qualquer** sistema de rotas (React Navigation, Next.js, `History` do browser, pilha nativa) — não conceito de expo-router:

| | `navigate`/`push` | `back`/`pop` |
|---|---|---|
| Quando | Destino novo, sem relação com histórico | Retornar pra tela de onde já veio |
| Pilha | Empilha uma entrada nova | Remove a atual, revela a de baixo |
| Estado do destino | Pode nascer uma instância nova (perde estado) | Reaproveita a instância existente (preserva estado) |

Usar `navigate` onde a intenção era "voltar" empilha telas desnecessárias, anima na direção errada, e **perde o estado que já existia** na tela original (ela renasce em branco). Usar sempre `back` também não serve — nem toda navegação tem uma tela anterior conhecida (deep link direto numa tela, ou destino genuinamente novo).

**Navegação nunca deveria morar dentro de um caso de uso.** O padrão que se repetiu 2 de 3 vezes neste módulo:

```ts
// caso de uso — nunca importa expo-router
export function useAuthSendResetPasswordEmail(options?: UseAppMutationOptions<void>) {
  return useAppMutation({
    mutateFn: (email) => auth.sendResetPasswordEmail(email),
    onSuccess: () => { options?.onSuccess?.(); feedbackService.send({...}); },
  });
}

// tela — só aqui existe router
useAuthSendResetPasswordEmail({ onSuccess: router.back });
```

É Inversão de Controle via callback — o mesmo mecanismo do `onSuccess`/`onError` do `useMutation` do TanStack Query (callback do chamador + comportamento "global" da lib, os dois disparando). Vale pra qualquer efeito colateral que não é da alçada de um hook/serviço reutilizável (navegação, analytics): aceite um callback, não importe o módulo que causa o efeito. **Exceção neste código:** `useAuthSignIn` ainda hardcoda `router.replace` dentro de `AuthContext` — dívida técnica identificada, não padrão a seguir.

## 10. Formulário schema-first: Zod → RHF → operação

**Formulário como caixa-preta:** a tela só conhece `onSubmit`, nunca a lib de form state por trás — mesmo raciocínio de Ports & Adapters aplicado a um componente de UI em vez de acesso a dado. Permite trocar `useState` por RHF sem tocar na tela.

**Schema-first, o ponto mais valioso e mais agnóstico de Zod:**

```ts
export const signUpSchema = z.object({ /* ... */ })
  .refine((data) => data.password === data.confirmPassword, {
    message: "senhas devem ser iguais",
    path: ["confirmPassword"], // sem isso, o erro cai fora do campo certo
  });

export type SignUpSchema = z.infer<typeof signUpSchema>; // tipo DERIVADO, nunca escrito à mão
```

Tipo e validação nunca dessincronizam porque um é gerado do outro — Yup faz o mesmo com `InferType`, é padrão de qualquer lib "schema-first". Validação cruzada entre campos só pode viver no `.refine()` do objeto inteiro (um validador de campo isolado não vê os irmãos), e o `path` é o detalhe fácil de esquecer que decide se o erro aparece no lugar certo da UI.

**`resolver` é mais uma porta, só que definida pela lib:** RHF não sabe o que é Zod; `zodResolver` traduz o resultado do schema pro formato que o RHF entende. **`Controller`** existe pra ligar campos que não são inputs nativos (`field.value`/`onChange` manuais, `fieldState.error` já resolvido pelo schema) — é o caminho certo pra qualquer componente de input próprio.

**Tipo do form ≠ tipo da operação, de propósito:**

```ts
type SignUpSchema = { fullname, email, password, confirmPassword };  // preocupação de FORM
type AuthSignUpParams = { fullname, email, password };               // preocupação de OPERAÇÃO
```

`confirmPassword` é conveniência de UX, o domínio nunca deveria saber que essa técnica existe. Dois tipos que hoje se parecem mas respondem perguntas diferentes **não são o mesmo tipo** — a tradução explícita entre eles (campo a campo, na tela) é o Mapper de sempre, agora na fronteira form → operação em vez de banco → domínio.

## 11. TypeScript por baixo dos panos: onde a garantia para

**Tese central desta seção:** um tipo do TypeScript só protege o código que ele mesmo tipou — toda vez que um valor atravessa uma fronteira que você não controla (uma lib de terceiros decidindo quando chamar sua função, uma declaração de função sem anotação, um membro de classe nunca implementado), a garantia para de valer, silenciosamente, e o `tsc` não necessariamente avisa. Quatro instâncias concretas encontradas neste módulo:

1. **Cadeia de inferência que quebra no elo mais fraco.** `signUpSchema → z.infer → useForm<SignUpSchema> → Controller` é checada ponta a ponta pelo compilador — até chegar numa `function handleSignUp(data) {}` declarada à parte, onde `data` vira `any` (`TS7006`, confirmado). Uma `function` nomeada **não recebe tipagem contextual** por ser passada depois como prop; uma arrow function inline ou uma variável já tipada, sim. Sempre valide o `tsc` no ponto de consumo final, não só na origem do tipo.

2. **Tipo "garantido" que não sobrevive à fronteira de uma lib.** `CustomToast({ type }: Feedback)` promete `type: FeedbackType`, nunca `undefined` — mas a lib de toast chama essa função internamente, num render ocioso, antes de qualquer `.show()`, com `props` vazio. `Feedback` é um tipo deste projeto; a função que decide *quando* chamar `CustomToast` é da lib, que não conhece `Feedback`. Fix é defesa em **runtime** no ponto de uso (`toastColors[type ?? "success"]`), não uma tentativa de "consertar o tipo" — não dá, quem chama é a lib.

3. **Classe "implementando" uma interface sem implementar um membro.** `sendResetPasswordEmail: (email: string) => Promise<void>;` sem `=` declara o tipo, não o corpo — `TS2564` no melhor caso (com `strictPropertyInitialization`), `TypeError` em runtime no pior. Um objeto literal implementando a mesma interface não permite esse descuido — falta a propriedade de verdade, erro de shape na cara.

4. **`@ts-ignore` em vez de narrowing.** `error: unknown` (retorno de `catch`) acessado como `error.message` via `@ts-ignore` silencia o compilador sem resolver a causa. Correto é `error instanceof Error ? error.message : String(error)`.

**Como isso muda a forma de revisar código:** não pergunte só "o TypeScript aceitou?" — pergunte "esse valor atravessou alguma fronteira que o TypeScript não enxerga por dentro (lib externa, função sem anotação, classe com membro só de tipo)?". Se sim, o `tsc` verde não é garantia nenhuma nesse ponto específico.

## 12. Segurança em fluxo de auth com redirect

Base: [documentação oficial de segurança do React Native](https://reactnative.dev/docs/security).

> "Deep links are not secure and you should never send any sensitive information in them."

**Por que, agnóstico de provedor de auth:** um custom URL scheme (`meuapp://reset?token=...`) não tem registro centralizado — qualquer app pode reivindicar o mesmo scheme e sequestrar o link (iOS escolhe silenciosamente, Android mostra um diálogo que o usuário raramente entende). Risco extra específico de e-mail: scanners corporativos de phishing pré-visitam links automaticamente e podem consumir um token de uso único antes do usuário clicar.

**Por que rotear pela web ajuda:** HTTPS não tem ambiguidade de dono; e o `redirectTo` de qualquer provedor de auth (Supabase incluso) deveria ser validado contra uma **allowlist** configurada por você — sem isso, é um open redirect (atacante troca o destino, phishing usando um domínio confiável como isca). Se o fluxo precisar voltar pro app nativo, a forma seguindo a doc do RN é **Universal Link (iOS) / App Link (Android)** — vinculados a um domínio HTTPS verificado pelo SO, não um custom scheme sujeito a colisão.

**Princípio geral por trás disso: nunca o token final, sempre um código de troca.** É o que **PKCE** formaliza em OAuth2/OIDC — o link carrega um código de uso único, só trocável pelo token real por quem gerou um segredo local (`code_verifier`, nunca exposto na URL). Mesmo que o código vaze no caminho, sozinho não vale nada.

**Achado real e atual neste código, não hipotético:**
```ts
// src/infra/repositories/adapters/supabase/supabase.ts
createClient(url, key, { auth: { storage: AsyncStorage, persistSession: true } });
```
O cliente Supabase persiste `access_token`/`refresh_token` em `AsyncStorage` **puro** — não criptografado, não o `IStorage` seguro deste próprio módulo. A doc do RN é explícita: AsyncStorage serve pra dado não-sensível; token pede Keychain (iOS) / Keystore-Encrypted SharedPreferences (Android). **Fix natural, dado que o projeto já tem `IStorage` como porta trocável:** um `SecureStorageAdapter` sobre `expo-secure-store`, usado especificamente pra sessão/token — trocar o adapter, não o contrato.

---

## 13. Tabela de trade-offs

| Decisão | Quando escolher A | Quando escolher B |
|---|---|---|
| Context: DI vs. estado | Implementação trocável, decidida uma vez (Repository, Feedback) | Valor que muda em runtime, lido por várias telas (Auth) |
| Repository: classe vs. objeto | Precisa de estado/config por instância | Só orquestra chamadas — objeto é mais simples e mais seguro contra membro não implementado |
| Navegação: `navigate` vs. `back` | Destino novo, sem relação com histórico | Retornar pra tela de onde já veio (preserva estado, anima certo) |
| Variante de estilo: `Record` vs. `if/switch` | Sempre `Record` — exaustividade de graça | `switch` só se já existir o truque `never` |
| Storage: `AsyncStorage` vs. `SecureStorage` | Dado não-sensível (preferências, cache) | Token, senha, qualquer segredo |
| Deep link vs. Universal/App Link vs. web | Nunca deep link com dado sensível | Universal/App Link se precisa voltar pro app; web se só precisa de um formulário |
| `@ts-ignore` vs. narrowing | Nunca, exceto limitação real da lib documentada | Sempre que der pra estreitar o tipo (`instanceof`, guard) |

## 14. Mapa aula → conceito

| Aula | Conceito principal | Seção |
|---|---|---|
| 2-4 | Context de estado, hidratação de sessão, Splash | §1 |
| 3 | `IStorage`, ordem de Providers | §2, §3 |
| 5 | `TextInput`: foco, borda, `style`, `forwardRef` | §5 |
| 6 | `Button`: `Record<Variant>`, `satisfies` | §6 |
| 7-8 | Imagem multi-densidade, `Header`, extração de componente, `asChild` | §7, §8 |
| 9-10, 13 | `TextLink`, `navigate`/`back`, IoC via callback, tipo form ≠ operação | §9, §10 |
| 11-12 | Zod schema-first, `resolver`, `Controller`, cadeia de inferência | §10, §11 |
| 15 | Classe vs. objeto no Repository, membro de classe não implementado | §2, §11 |
| 16 | Deep link, `redirectTo`, PKCE, storage de token | §12 |
| 17 | Terceiro adapter de `IFeedbackService`, tipo que não sobrevive à lib | §2, §11 |

## Glossário

- **Hidratação de sessão:** carregar a sessão persistida antes de decidir se o usuário está logado — sem uma flag de "pronto", a UI decide cedo demais.
- **Ports & Adapters:** interface que o app conhece + implementação concreta que ele não conhece, trocada num único ponto — Repository, Storage, Feedback e o `resolver` do RHF são a mesma receita.
- **Composition Root:** único ponto do app que escolhe as implementações concretas e as injeta via Context.
- **`Record<K, V>` para variantes:** garante uma entrada por chave do union em tempo de compilação — a base de qualquer lib de variantes de UI (`cva`, shadcn/ui).
- **`satisfies` (TS 4.9+):** mesma exaustividade de uma anotação de tipo, sem alargar o tipo literal inferido.
- **Densidade de tela (`@2x`/`@3x`):** tamanho lógico fixo, várias resoluções de arquivo, a plataforma escolhe qual carregar.
- **Regra das 2-3 ocorrências:** extrair um componente/função na segunda ou terceira repetição observada, nunca na primeira.
- **`asChild`:** componente de comportamento que clona props/eventos no filho fornecido, sem renderizar wrapper próprio (Radix, React Aria, expo-router).
- **Inversão de Controle via callback:** um hook/serviço reutilizável aceita `onSuccess`/`onError` em vez de importar o módulo que causa o efeito colateral — quem chama decide.
- **Schema-first:** escrever a validação uma vez, derivar o tipo dela (`z.infer`) — nunca duas fontes de verdade separadas.
- **Fronteira de tipo com lib externa:** um tipo só protege até onde o próprio projeto controla a chamada — do outro lado de uma callback de terceiro, a garantia não se sustenta sozinha.
- **Custom URL scheme vs. Universal/App Link:** scheme não tem dono verificado (qualquer app registra); Universal/App Link é vinculado a um domínio HTTPS comprovado.
- **Open redirect:** redirecionar pra qualquer URL recebida como parâmetro sem validar contra uma allowlist — abre porta pra phishing usando um domínio confiável como isca.
- **PKCE:** o link carrega um código de troca de uso único, não o token final — o token só existe depois de uma troca que exige um segredo local.
